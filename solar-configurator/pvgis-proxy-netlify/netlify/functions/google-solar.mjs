import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import * as geotiff from 'geotiff';
import * as geokeysToProj4 from 'geotiff-geokeys-to-proj4';
import proj4 from 'proj4';

const SOLAR_BASE = 'https://solar.googleapis.com/v1/';
const CACHE_STORE_NAME = 'google-solar-cache-v1';
const SECURITY_STORE_NAME = 'google-solar-security-v1';
const BUILDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_LAYERS_TTL_MS = 45 * 60 * 1000;
const GEOTIFF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAYER_INFO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const MAX_PANELS = 80;
const DEFAULT_RADIUS_M = 75;
const memoryCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete('key');
    url.searchParams.delete('apiKey');
    return url.toString();
  } catch {
    return String(rawUrl || '');
  }
}

async function fetchWithDiagnostics(rawUrl, options = {}, {
  label = 'Upstream request',
  attempts = 3,
  timeoutMs = 20_000,
  retryStatuses = [429, 500, 502, 503, 504],
} = {}) {
  const url = typeof rawUrl === 'string' ? rawUrl : rawUrl.toString();
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          ...options,
          signal: options.signal || controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (retryStatuses.includes(response.status) && attempt < attempts) {
        console.warn(`[Google Solar proxy] ${label} returned HTTP ${response.status}; retrying (${attempt}/${attempts}).`);
        await sleep(350 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const causeCode = String(error?.cause?.code || error?.code || '');
      const causeMessage = String(error?.cause?.message || '');
      console.error(`[Google Solar proxy] ${label} network failure (${attempt}/${attempts}).`, {
        url: sanitizedUrl(url),
        message: error?.message || String(error),
        causeCode,
        causeMessage,
      });
      if (attempt < attempts) {
        await sleep(350 * attempt);
        continue;
      }

      const detail = [
        `${label}: network fetch failed`,
        causeCode ? `code ${causeCode}` : '',
        causeMessage || '',
      ].filter(Boolean).join(' · ');
      const wrapped = new Error(detail);
      wrapped.stage = label;
      wrapped.causeCode = causeCode || undefined;
      wrapped.causeMessage = causeMessage || undefined;
      wrapped.original = error;
      throw wrapped;
    }
  }

  throw lastError || new Error(`${label}: network fetch failed.`);
}

function configuredOrigins() {
  const raw = String(process.env.GOOGLE_SOLAR_ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN || '*').trim() || '*';
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function requestOrigin(request) {
  return String(request.headers.get('origin') || '').trim();
}

function originIsLocalDevelopment(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const hostname = String(url.hostname || '').toLowerCase();
    const loopback = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname === '[::1]';
    return loopback && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function originIsAllowed(request) {
  const origin = requestOrigin(request);
  if (!origin) return true; // Allows curl/server diagnostics; paid actions still require a signed token.
  const allowed = configuredOrigins();
  return allowed.includes('*') || allowed.includes(origin) || originIsLocalDevelopment(origin);
}

function corsHeaders(request) {
  const origin = requestOrigin(request);
  const allowed = configuredOrigins();
  let allowOrigin = '*';
  if (!allowed.includes('*')) {
    allowOrigin = allowed.includes(origin) || originIsLocalDevelopment(origin)
      ? origin
      : allowed[0] || 'null';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(request, payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Netlify-CDN-Cache-Control': 'no-store',
      ...corsHeaders(request),
      ...extra,
    },
  });
}

function googleConfigured() {
  return Boolean(String(process.env.GOOGLE_SOLAR_API_KEY || '').trim());
}

function authConfigured() {
  return Boolean(
    String(process.env.GOOGLE_SOLAR_DEMO_ACCESS_CODE || '').trim()
    && String(process.env.GOOGLE_SOLAR_SESSION_SECRET || '').trim(),
  );
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signSession(payload) {
  const secret = String(process.env.GOOGLE_SOLAR_SESSION_SECRET || '');
  const encoded = base64urlJson(payload);
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySession(token, request = null) {
  const secret = String(process.env.GOOGLE_SOLAR_SESSION_SECRET || '');
  if (!secret || !token) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    if (request) {
      const expectedIp = hashKey(clientIp(request));
      if (payload.ip && !safeEqual(payload.ip, expectedIp)) return null;
      const origin = requestOrigin(request) || 'server';
      if (payload.origin && !safeEqual(payload.origin, origin)) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(request) {
  const header = String(request.headers.get('authorization') || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function validateCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function rounded(value, digits = 5) {
  return Number(Number(value).toFixed(digits));
}

function hashKey(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function clientIp(request) {
  return String(
    request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || 'unknown',
  ).trim();
}

async function readBlob(key, type = 'json') {
  const memory = memoryCache.get(key);
  if (memory && memory.expiration > Date.now()) return { data: memory.data, cached: true };
  if (memory) memoryCache.delete(key);
  try {
    const store = getStore(CACHE_STORE_NAME);
    const entry = await store.getWithMetadata(key, { type });
    if (!entry) return null;
    const expiration = Number(entry.metadata?.expiration) || 0;
    if (expiration && expiration <= Date.now()) {
      await store.delete(key).catch(() => {});
      return null;
    }
    return { data: entry.data, cached: true, expiration };
  } catch (error) {
    console.info('[Google Solar proxy] Blob cache read unavailable; using in-memory fallback.', error?.message || error);
    return null;
  }
}

async function writeBlob(key, data, ttlMs, { json = false } = {}) {
  const expiration = Date.now() + ttlMs;
  memoryCache.set(key, { data, expiration });
  try {
    const store = getStore(CACHE_STORE_NAME);
    if (json) await store.setJSON(key, data, { metadata: { expiration } });
    else await store.set(key, data, { metadata: { expiration } });
  } catch (error) {
    console.info('[Google Solar proxy] Blob cache write unavailable; using in-memory fallback.', error?.message || error);
  }
  return expiration;
}

async function securityCounter(key, max, ttlMs) {
  if (!(max > 0)) return { allowed: true, count: 0, max };
  try {
    const store = getStore({ name: SECURITY_STORE_NAME, consistency: 'strong' });
    const existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }).catch(() => null);
    const expiration = Number(existing?.metadata?.expiration) || 0;
    const current = expiration > Date.now() ? existing?.data : null;
    const count = Math.max(0, Number(current?.count) || 0);
    if (count >= max) return { allowed: false, count, max };
    const next = count + 1;
    const nextExpiration = expiration > Date.now() ? expiration : Date.now() + Math.max(60_000, Number(ttlMs) || 86_400_000);
    await store.setJSON(key, { count: next, updatedAt: Date.now() }, { metadata: { expiration: nextExpiration } });
    return { allowed: true, count: next, max };
  } catch (error) {
    console.info('[Google Solar proxy] Rate-limit store unavailable; continuing with Google Cloud quota as hard cap.', error?.message || error);
    return { allowed: true, count: 0, max, degraded: true };
  }
}

async function enforceLoginRateLimit(request) {
  const max = Math.max(1, Number(process.env.GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR) || 12);
  const hour = new Date().toISOString().slice(0, 13);
  const ipHash = hashKey(clientIp(request));
  return securityCounter(`login:${hour}:${ipHash}`, max, 2 * 60 * 60 * 1000);
}

async function enforceAnalysisRateLimit(request) {
  const perIpMax = Math.max(1, Number(process.env.GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY) || 20);
  const globalMax = Math.max(1, Number(process.env.GOOGLE_SOLAR_MAX_ANALYSES_DAY) || 100);
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hashKey(clientIp(request));
  const [perIp, global] = await Promise.all([
    securityCounter(`analysis:${day}:${ipHash}`, perIpMax, 2 * 24 * 60 * 60 * 1000),
    securityCounter(`analysis:${day}:global`, globalMax, 2 * 24 * 60 * 60 * 1000),
  ]);
  return {
    allowed: perIp.allowed && global.allowed,
    perIp,
    global,
  };
}

async function fetchGoogleJson(url, label = 'Google Solar API request') {
  const response = await fetchWithDiagnostics(url.toString(), {
    headers: { Accept: 'application/json' },
  }, { label, attempts: 3, timeoutMs: 20_000 });
  const responseText = await response.text();
  let payload;
  try { payload = JSON.parse(responseText); } catch { payload = { error: { message: responseText || `Google Solar HTTP ${response.status}` } }; }
  if (!response.ok) {
    const error = new Error(`${label}: ${payload?.error?.message || payload?.message || `Google Solar HTTP ${response.status}`}`);
    error.status = response.status;
    error.payload = payload;
    error.stage = label;
    throw error;
  }
  return payload;
}

async function getBuildingInsights(lat, lon) {
  const cacheKey = `building:${rounded(lat, 5)}:${rounded(lon, 5)}`;
  const cached = await readBlob(cacheKey, 'json');
  if (cached) return { value: cached.data, cached: true, upstreamRequests: 0 };

  const url = new URL(`${SOLAR_BASE}buildingInsights:findClosest`);
  url.searchParams.set('location.latitude', Number(lat).toFixed(5));
  url.searchParams.set('location.longitude', Number(lon).toFixed(5));
  url.searchParams.set('requiredQuality', 'BASE');
  url.searchParams.set('key', String(process.env.GOOGLE_SOLAR_API_KEY));
  const value = await fetchGoogleJson(url, 'Building Insights request');
  await writeBlob(cacheKey, value, BUILDING_TTL_MS, { json: true });
  return { value, cached: false, upstreamRequests: 1 };
}

function dataLayersCacheKey(lat, lon, radiusM) {
  // The browser keeps the Data Layers centre at the original map pin so local
  // metre-scale house nudges continue to reuse the same paid request.
  return `layers:${rounded(lat, 5)}:${rounded(lon, 5)}:${Math.round(radiusM)}`;
}

function hourlyShadeLayerKey(layerBaseKey, monthIndex) {
  return `${layerBaseKey}:hourly:${monthIndex + 1}`;
}

function layerInfoKey(layerBaseKey) {
  return `${layerBaseKey}:info`;
}

function compactLayerInfo(value, radiusM) {
  return {
    imageryDate: value?.imageryDate || null,
    imageryProcessedDate: value?.imageryProcessedDate || null,
    imageryQuality: value?.imageryQuality || '',
    radiusM,
  };
}

async function readCachedLayerInfo(layerBaseKey) {
  const cached = await readBlob(layerInfoKey(layerBaseKey), 'json');
  return cached?.data || null;
}

async function readCachedHourlyShadeBuffers(layerBaseKey) {
  const months = await mapLimit(Array.from({ length: 12 }, (_, index) => index), 4, async (monthIndex) => {
    const cached = await readBlob(hourlyShadeLayerKey(layerBaseKey, monthIndex), 'arrayBuffer');
    return cached?.data || null;
  });
  return months.every(Boolean) ? months : null;
}

async function getDataLayers(lat, lon, radiusM, { force = false } = {}) {
  const cacheKey = dataLayersCacheKey(lat, lon, radiusM);
  if (!force) {
    const cached = await readBlob(cacheKey, 'json');
    if (cached) return { value: cached.data, cached: true, upstreamRequests: 0, cacheKey };
  }

  const url = new URL(`${SOLAR_BASE}dataLayers:get`);
  url.searchParams.set('location.latitude', Number(lat).toFixed(5));
  url.searchParams.set('location.longitude', Number(lon).toFixed(5));
  url.searchParams.set('radiusMeters', String(Math.round(radiusM)));
  url.searchParams.set('requiredQuality', 'BASE');
  url.searchParams.set('view', 'FULL_LAYERS');
  url.searchParams.set('pixelSizeMeters', '1');
  url.searchParams.set('key', String(process.env.GOOGLE_SOLAR_API_KEY));
  const value = await fetchGoogleJson(url, 'Data Layers request');
  await writeBlob(cacheKey, value, DATA_LAYERS_TTL_MS, { json: true });
  await writeBlob(layerInfoKey(cacheKey), compactLayerInfo(value, radiusM), LAYER_INFO_TTL_MS, { json: true });
  return { value, cached: false, upstreamRequests: 1, cacheKey };
}

function authenticatedGeoTiffUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.hostname === 'solar.googleapis.com') {
    url.searchParams.set('key', String(process.env.GOOGLE_SOLAR_API_KEY));
  }
  return url;
}

async function getGeoTiffBuffer(layerCacheKey, rawUrl, monthIndex = null) {
  const cached = await readBlob(layerCacheKey, 'arrayBuffer');
  if (cached?.data) return { value: cached.data, cached: true };
  const label = monthIndex === null
    ? 'Google hourly-shade GeoTIFF'
    : `Google hourly-shade GeoTIFF month ${monthIndex + 1}`;
  const response = await fetchWithDiagnostics(authenticatedGeoTiffUrl(rawUrl).toString(), {}, {
    label,
    attempts: 3,
    timeoutMs: 25_000,
  });
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error?.message || payload?.message || '';
    } catch {
      detail = '';
    }
    const error = new Error(`${label}: ${detail || `HTTP ${response.status}`}`);
    error.status = response.status;
    error.stage = label;
    throw error;
  }
  const value = await response.arrayBuffer();
  await writeBlob(layerCacheKey, value, GEOTIFF_TTL_MS);
  return { value, cached: false };
}

async function decodeGeoTiff(arrayBuffer) {
  const tiff = await geotiff.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const geoKeys = image.getGeoKeys();
  const projObj = geokeysToProj4.toProj4(geoKeys);
  const projection = proj4(projObj.proj4, 'WGS84');
  const box = image.getBoundingBox();
  const sw = projection.forward({
    x: box[0] * projObj.coordinatesConversionParameters.x,
    y: box[1] * projObj.coordinatesConversionParameters.y,
  });
  const ne = projection.forward({
    x: box[2] * projObj.coordinatesConversionParameters.x,
    y: box[3] * projObj.coordinatesConversionParameters.y,
  });
  return {
    width: Number(rasters.width) || image.getWidth(),
    height: Number(rasters.height) || image.getHeight(),
    rasters,
    bounds: {
      north: Math.max(sw.y, ne.y),
      south: Math.min(sw.y, ne.y),
      east: Math.max(sw.x, ne.x),
      west: Math.min(sw.x, ne.x),
    },
  };
}

function sampleIndex(tiff, latitude, longitude) {
  const { bounds, width, height } = tiff;
  if (!(longitude >= bounds.west && longitude <= bounds.east && latitude >= bounds.south && latitude <= bounds.north)) return -1;
  const x = Math.min(width - 1, Math.max(0, Math.floor(((longitude - bounds.west) / Math.max(1e-12, bounds.east - bounds.west)) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((bounds.north - latitude) / Math.max(1e-12, bounds.north - bounds.south)) * height)));
  return y * width + x;
}

function sampleShadeMonth(tiff, panelPoints) {
  return panelPoints.map((panel) => {
    const index = sampleIndex(tiff, panel.latitude, panel.longitude);
    if (index < 0) return null;
    const masks = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const value = Number(tiff.rasters[hour]?.[index]);
      masks.push(!Number.isFinite(value) || value === -9999 ? null : (value >>> 0));
    }
    return masks;
  });
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function compactBuildingInsights(raw, requestedPanelCount = 0) {
  const solar = raw?.solarPotential || {};
  const configs = Array.isArray(solar.solarPanelConfigs) ? solar.solarPanelConfigs : [];
  const closestConfig = configs.reduce((best, config) => {
    if (!best) return config;
    return Math.abs(Number(config.panelsCount) - requestedPanelCount) < Math.abs(Number(best.panelsCount) - requestedPanelCount) ? config : best;
  }, null);
  return {
    name: raw?.name || '',
    center: raw?.center || null,
    boundingBox: raw?.boundingBox || null,
    imageryDate: raw?.imageryDate || null,
    imageryProcessedDate: raw?.imageryProcessedDate || null,
    imageryQuality: raw?.imageryQuality || '',
    regionCode: raw?.regionCode || '',
    administrativeArea: raw?.administrativeArea || '',
    maxArrayPanelsCount: Number(solar.maxArrayPanelsCount) || 0,
    maxArrayAreaMeters2: Number(solar.maxArrayAreaMeters2) || 0,
    maxSunshineHoursPerYear: Number(solar.maxSunshineHoursPerYear) || 0,
    panelCapacityWatts: Number(solar.panelCapacityWatts) || 0,
    panelHeightMeters: Number(solar.panelHeightMeters) || 0,
    panelWidthMeters: Number(solar.panelWidthMeters) || 0,
    roofAreaMeters2: Number(solar.wholeRoofStats?.areaMeters2) || 0,
    roofGroundAreaMeters2: Number(solar.wholeRoofStats?.groundAreaMeters2) || 0,
    sunshineQuantiles: Array.isArray(solar.wholeRoofStats?.sunshineQuantiles) ? solar.wholeRoofStats.sunshineQuantiles.map(Number) : [],
    roofSegments: (Array.isArray(solar.roofSegmentStats) ? solar.roofSegmentStats : []).map((segment, index) => ({
      index,
      pitchDegrees: Number(segment.pitchDegrees) || 0,
      azimuthDegrees: Number(segment.azimuthDegrees) || 0,
      areaMeters2: Number(segment.stats?.areaMeters2) || 0,
      groundAreaMeters2: Number(segment.stats?.groundAreaMeters2) || 0,
      sunshineQuantiles: Array.isArray(segment.stats?.sunshineQuantiles) ? segment.stats.sunshineQuantiles.map(Number) : [],
      center: segment.center || null,
      planeHeightAtCenterMeters: Number(segment.planeHeightAtCenterMeters) || 0,
    })),
    suggestedPanels: (Array.isArray(solar.solarPanels) ? solar.solarPanels : []).slice(0, 120).map((panel) => ({
      center: panel.center || null,
      orientation: panel.orientation || '',
      segmentIndex: Number(panel.segmentIndex) || 0,
      yearlyEnergyDcKwh: Number(panel.yearlyEnergyDcKwh) || 0,
    })),
    closestPanelConfig: closestConfig ? {
      panelsCount: Number(closestConfig.panelsCount) || 0,
      yearlyEnergyDcKwh: Number(closestConfig.yearlyEnergyDcKwh) || 0,
      roofSegmentSummaries: (closestConfig.roofSegmentSummaries || []).map((item) => ({
        segmentIndex: Number(item.segmentIndex) || 0,
        panelsCount: Number(item.panelsCount) || 0,
        yearlyEnergyDcKwh: Number(item.yearlyEnergyDcKwh) || 0,
        pitchDegrees: Number(item.pitchDegrees) || 0,
        azimuthDegrees: Number(item.azimuthDegrees) || 0,
      })),
    } : null,
  };
}

async function analyzeGoogleSolar(body) {
  const siteLat = validateCoordinate(body?.siteLat, -90, 90);
  const siteLon = validateCoordinate(body?.siteLon, -180, 180);
  const houseLat = validateCoordinate(body?.houseLat ?? body?.siteLat, -90, 90);
  const houseLon = validateCoordinate(body?.houseLon ?? body?.siteLon, -180, 180);
  if (siteLat === null || siteLon === null || houseLat === null || houseLon === null) throw new Error('Valid site and house coordinates are required.');

  const panelPoints = (Array.isArray(body?.panelPoints) ? body.panelPoints : []).slice(0, MAX_PANELS).map((panel, index) => {
    const latitude = validateCoordinate(panel?.latitude, -90, 90);
    const longitude = validateCoordinate(panel?.longitude, -180, 180);
    if (latitude === null || longitude === null) throw new Error(`Panel ${index + 1} has invalid coordinates.`);
    return {
      panelIndex: index,
      latitude,
      longitude,
      surfaceId: String(panel?.surfaceId || 'surface'),
    };
  });
  if (!panelPoints.length) throw new Error('At least one fitted panel is required for Google shade analysis.');

  const radiusM = Math.min(100, Math.max(20, Number(body?.radiusM) || DEFAULT_RADIUS_M));
  const requestedPanelCount = Math.max(0, Number(body?.requestedPanelCount) || panelPoints.length);

  const layerBaseKey = dataLayersCacheKey(siteLat, siteLon, radiusM);
  const [buildingResult, preCachedShadeBuffers, preCachedLayerInfo] = await Promise.all([
    getBuildingInsights(houseLat, houseLon),
    readCachedHourlyShadeBuffers(layerBaseKey),
    readCachedLayerInfo(layerBaseKey),
  ]);

  let layersResult = null;
  let layerInfo = preCachedLayerInfo;
  let geoTiffCacheHits = 0;
  let geoTiffDownloads = 0;
  let dataLayersUpstreamRequests = 0;
  let shadeBuffers = preCachedShadeBuffers;

  if (shadeBuffers) {
    geoTiffCacheHits = 12;
  } else {
    layersResult = await getDataLayers(siteLat, siteLon, radiusM);
    dataLayersUpstreamRequests += layersResult.upstreamRequests;
    layerInfo = compactLayerInfo(layersResult.value, radiusM);
    const shadeUrls = Array.isArray(layersResult.value?.hourlyShadeUrls) ? layersResult.value.hourlyShadeUrls : [];
    if (shadeUrls.length !== 12) throw new Error('Google Data Layers did not return all 12 hourly-shade layers for this site.');

    const loadMonthBuffer = async (rawUrl, monthIndex, retry = true) => {
      const layerKey = hourlyShadeLayerKey(layerBaseKey, monthIndex);
      try {
        const binary = await getGeoTiffBuffer(layerKey, rawUrl, monthIndex);
        if (binary.cached) geoTiffCacheHits += 1;
        else geoTiffDownloads += 1;
        return binary.value;
      } catch (error) {
        if (retry && [400, 401, 403, 404].includes(Number(error?.status))) {
          layersResult = await getDataLayers(siteLat, siteLon, radiusM, { force: true });
          dataLayersUpstreamRequests += layersResult.upstreamRequests;
          layerInfo = compactLayerInfo(layersResult.value, radiusM);
          const refreshedUrl = layersResult.value?.hourlyShadeUrls?.[monthIndex];
          if (refreshedUrl) return loadMonthBuffer(refreshedUrl, monthIndex, false);
        }
        throw error;
      }
    };

    shadeBuffers = await mapLimit(shadeUrls, 2, (url, monthIndex) => loadMonthBuffer(url, monthIndex));
  }

  const months = await mapLimit(shadeBuffers, 3, async (arrayBuffer) => {
    const tiff = await decodeGeoTiff(arrayBuffer);
    return sampleShadeMonth(tiff, panelPoints);
  });
  const profiles = panelPoints.map((panel, panelIndex) => ({
    panelIndex,
    surfaceId: panel.surfaceId,
    latitude: panel.latitude,
    longitude: panel.longitude,
    masksByMonth: months.map((month) => month[panelIndex]),
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    buildingInsights: compactBuildingInsights(buildingResult.value, requestedPanelCount),
    dataLayers: {
      imageryDate: layerInfo?.imageryDate || null,
      imageryProcessedDate: layerInfo?.imageryProcessedDate || null,
      imageryQuality: layerInfo?.imageryQuality || '',
      radiusM,
      shadeMonths: 12,
      geoTiffRetentionDays: 30,
    },
    shadeModel: {
      provider: 'Google Solar API Data Layers',
      revision: Date.now(),
      panelCount: profiles.length,
      profiles,
    },
    cache: {
      buildingInsights: buildingResult.cached,
      dataLayers: dataLayersUpstreamRequests === 0,
      hourlyShadeTiffsCached: geoTiffCacheHits,
      hourlyShadeTiffsDownloaded: geoTiffDownloads,
      upstreamBillableRequests: buildingResult.upstreamRequests + dataLayersUpstreamRequests,
    },
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!originIsAllowed(request)) return jsonResponse(request, { error: 'Origin not allowed.' }, 403);

  const url = new URL(request.url);
  const action = String(url.searchParams.get('action') || 'health');

  if (request.method === 'GET' && action === 'health') {
    return jsonResponse(request, {
      ok: true,
      service: 'google-solar-demo-proxy',
      platform: 'netlify-functions',
      googleSolarConfigured: googleConfigured(),
      accessCodeConfigured: authConfigured(),
      authentication: 'short-lived signed demo session',
      cache: 'Netlify Blobs + 30-day GeoTIFF retention',
    });
  }

  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  let body = {};
  try { body = await request.json(); } catch { return jsonResponse(request, { error: 'A JSON request body is required.' }, 400); }

  if (action === 'login') {
    if (!authConfigured()) return jsonResponse(request, { error: 'Google Solar demo authentication is not configured on Netlify.' }, 503);
    const limit = await enforceLoginRateLimit(request);
    if (!limit.allowed) return jsonResponse(request, { error: 'Too many unlock attempts. Try again later.' }, 429);
    if (!safeEqual(String(body?.code || ''), String(process.env.GOOGLE_SOLAR_DEMO_ACCESS_CODE || ''))) {
      return jsonResponse(request, { error: 'Invalid demo access code.' }, 401);
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      v: 1,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
      ip: hashKey(clientIp(request)),
      origin: requestOrigin(request) || 'server',
    };
    return jsonResponse(request, {
      ok: true,
      token: signSession(payload),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  }

  if (action !== 'analyze') return jsonResponse(request, { error: 'Unsupported Google Solar action.' }, 400);
  if (!googleConfigured()) return jsonResponse(request, { error: 'GOOGLE_SOLAR_API_KEY is not configured on Netlify.' }, 503);
  if (!authConfigured()) return jsonResponse(request, { error: 'Google Solar demo authentication is not configured on Netlify.' }, 503);
  const session = verifySession(bearerToken(request), request);
  if (!session) return jsonResponse(request, { error: 'Google Solar demo session is locked or expired.' }, 401);

  const limit = await enforceAnalysisRateLimit(request);
  if (!limit.allowed) return jsonResponse(request, {
    error: 'Google Solar demo request limit reached for today.',
    limit: { perIp: limit.perIp, global: limit.global },
  }, 429);

  try {
    const result = await analyzeGoogleSolar(body);
    return jsonResponse(request, {
      ...result,
      security: {
        sessionExpiresAt: new Date(Number(session.exp) * 1000).toISOString(),
        perIpAnalysesToday: limit.perIp.count,
        perIpLimit: limit.perIp.max,
        globalAnalysesToday: limit.global.count,
        globalLimit: limit.global.max,
      },
    });
  } catch (error) {
    console.error('[Google Solar proxy] Analysis failed.', error);
    const status = Number(error?.status) || 502;
    return jsonResponse(request, {
      error: error?.message || 'Google Solar analysis failed.',
      stage: error?.stage || undefined,
      causeCode: error?.causeCode || undefined,
      causeMessage: error?.causeMessage || undefined,
      google: error?.payload?.error || undefined,
    }, status >= 400 && status < 600 ? status : 502);
  }
};
