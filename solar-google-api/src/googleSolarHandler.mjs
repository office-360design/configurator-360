import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import * as geotiff from 'geotiff';
import geokeysToProj4 from 'geotiff-geokeys-to-proj4';
import proj4 from 'proj4';
import {
  consumeTenantSolarMetric,
  corsAllowOrigin,
  originIsPotentiallyAllowed,
  quotaErrorPayload,
  resolveSolarRequestContext,
} from './tenantUsage.mjs';

const SOLAR_BASE = 'https://solar.googleapis.com/v1/';
const CACHE_PREFIX = 'google-solar-cache-v1';
const SECURITY_COLLECTION = String(process.env.GOOGLE_SOLAR_SECURITY_COLLECTION || 'googleSolarSecurityV1');
const storage = new Storage();
const firestore = new Firestore();
const BUILDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BUILDING_AREA_INDEX_MAX_ENTRIES = 24;
const DATA_LAYERS_COVERAGE_RADIUS_M = 100;
const DATA_LAYERS_TTL_MS = 45 * 60 * 1000;
const GEOTIFF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAYER_INFO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SURFACE_MODEL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FLUX_MODEL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const MAX_PANELS = 80;
const DEFAULT_RADIUS_M = DATA_LAYERS_COVERAGE_RADIUS_M;
const memoryCache = new Map();
const inflightLoads = new Map();

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

function requestOrigin(request) {
  return String(request.headers.get('origin') || '').trim();
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': corsAllowOrigin(request, 'https://www.360configurator.com'),
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

function mcpBridgeConfigured() {
  return Boolean(String(process.env.MCP_GOOGLE_SOLAR_BRIDGE_TOKEN || '').trim());
}

function mcpBridgeAuthorized(request) {
  return mcpBridgeConfigured()
    && safeEqual(request.headers.get('x-mcp-solar-bridge-token') || '', process.env.MCP_GOOGLE_SOLAR_BRIDGE_TOKEN || '');
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

async function withInflight(key, loader) {
  const existing = inflightLoads.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(loader);
  inflightLoads.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inflightLoads.get(key) === promise) inflightLoads.delete(key);
  }
}

function clientIp(request) {
  return String(
    request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('x-real-ip')
    || 'unknown',
  ).trim();
}

function cacheBucketName() {
  return String(process.env.GOOGLE_SOLAR_CACHE_BUCKET || '').trim();
}

function cacheConfigured() {
  return Boolean(cacheBucketName());
}

function cacheObjectName(key) {
  return `${CACHE_PREFIX}/${String(key)}`;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function readBlob(key, type = 'json') {
  const memory = memoryCache.get(key);
  if (memory && memory.expiration > Date.now()) return { data: memory.data, cached: true };
  if (memory) memoryCache.delete(key);
  if (!cacheConfigured()) return null;

  try {
    const file = storage.bucket(cacheBucketName()).file(cacheObjectName(key));
    const [metadata] = await file.getMetadata();
    const expiration = Number(metadata?.metadata?.expiration) || 0;
    if (expiration && expiration <= Date.now()) {
      await file.delete().catch(() => {});
      return null;
    }

    const [buffer] = await file.download();
    const data = type === 'json'
      ? JSON.parse(buffer.toString('utf8'))
      : toArrayBuffer(buffer);
    memoryCache.set(key, { data, expiration: expiration || Date.now() + 60_000 });
    return { data, cached: true, expiration };
  } catch (error) {
    if (Number(error?.code) === 404) return null;
    console.info('[Google Solar proxy] Cloud Storage cache read unavailable; using in-memory fallback.', error?.message || error);
    return null;
  }
}

async function writeBlob(key, data, ttlMs, { json = false } = {}) {
  const expiration = Date.now() + ttlMs;
  memoryCache.set(key, { data, expiration });
  if (!cacheConfigured()) return expiration;

  try {
    const file = storage.bucket(cacheBucketName()).file(cacheObjectName(key));
    const buffer = json
      ? Buffer.from(JSON.stringify(data), 'utf8')
      : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: json ? 'application/json; charset=utf-8' : 'application/octet-stream',
        cacheControl: 'private, no-store',
        metadata: {
          expiration: String(expiration),
          logicalKey: String(key),
        },
      },
    });
  } catch (error) {
    console.info('[Google Solar proxy] Cloud Storage cache write unavailable; using in-memory fallback.', error?.message || error);
  }
  return expiration;
}

async function securityCounter(key, max, ttlMs) {
  if (!(max > 0)) return { allowed: true, count: 0, max };

  const ref = firestore.collection(SECURITY_COLLECTION).doc(hashKey(key));
  try {
    return await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.exists ? snapshot.data() : null;
      const expiration = Number(existing?.expirationMs) || 0;
      const count = expiration > Date.now() ? Math.max(0, Number(existing?.count) || 0) : 0;
      if (count >= max) return { allowed: false, count, max };

      const next = count + 1;
      const nextExpiration = expiration > Date.now()
        ? expiration
        : Date.now() + Math.max(60_000, Number(ttlMs) || 86_400_000);
      transaction.set(ref, {
        key,
        count: next,
        updatedAtMs: Date.now(),
        expirationMs: nextExpiration,
        expireAt: new Date(nextExpiration),
      });
      return { allowed: true, count: next, max };
    });
  } catch (error) {
    console.info('[Google Solar proxy] Firestore rate-limit store unavailable; continuing with Google Solar API quota as hard cap.', error?.message || error);
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

function buildingCoordinateCacheKey(lat, lon) {
  return `building:${rounded(lat, 5)}:${rounded(lon, 5)}`;
}

function buildingCanonicalCacheKey(name) {
  return `building-id:${hashKey(String(name || 'unknown'))}`;
}

function buildingAreaIndexKey(layerBaseKey) {
  return `${layerBaseKey}:building-index-v1`;
}

function pointInsideLatLngBox(lat, lon, boundingBox) {
  const south = Number(boundingBox?.sw?.latitude);
  const west = Number(boundingBox?.sw?.longitude);
  const north = Number(boundingBox?.ne?.latitude);
  const east = Number(boundingBox?.ne?.longitude);
  if (![south, west, north, east].every(Number.isFinite)) return false;
  return lat >= Math.min(south, north)
    && lat <= Math.max(south, north)
    && lon >= Math.min(west, east)
    && lon <= Math.max(west, east);
}

function coordinateDistanceMeters(latA, lonA, latB, lonB) {
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return Infinity;
  const metersPerDegree = 111320;
  const meanLat = ((latA + latB) / 2) * Math.PI / 180;
  const northM = (latB - latA) * metersPerDegree;
  const eastM = (lonB - lonA) * metersPerDegree * Math.max(0.2, Math.cos(meanLat));
  return Math.hypot(eastM, northM);
}

async function indexBuildingForArea(layerBaseKey, value) {
  if (!layerBaseKey || !value?.name || !value?.boundingBox) return;
  const indexKey = buildingAreaIndexKey(layerBaseKey);
  const cachedIndex = await readBlob(indexKey, 'json');
  const existing = Array.isArray(cachedIndex?.data?.entries) ? cachedIndex.data.entries : [];
  if (existing.some((entry) => entry?.name === value.name)) return;

  const canonicalKey = buildingCanonicalCacheKey(value.name);
  await writeBlob(canonicalKey, value, BUILDING_TTL_MS, { json: true });
  const entry = {
    name: value.name,
    canonicalKey,
    center: value.center || null,
    boundingBox: value.boundingBox || null,
    savedAt: Date.now(),
  };
  const entries = [entry, ...existing]
    .filter((item, index, all) => item?.name && all.findIndex((candidate) => candidate?.name === item.name) === index)
    .slice(0, BUILDING_AREA_INDEX_MAX_ENTRIES);
  await writeBlob(indexKey, { entries }, BUILDING_TTL_MS, { json: true });
}

async function readBuildingFromAreaIndex(layerBaseKey, lat, lon) {
  if (!layerBaseKey) return null;
  const cachedIndex = await readBlob(buildingAreaIndexKey(layerBaseKey), 'json');
  const entries = Array.isArray(cachedIndex?.data?.entries) ? cachedIndex.data.entries : [];
  const candidates = entries
    .filter((entry) => pointInsideLatLngBox(lat, lon, entry?.boundingBox))
    .sort((a, b) => coordinateDistanceMeters(
      lat,
      lon,
      Number(a?.center?.latitude),
      Number(a?.center?.longitude),
    ) - coordinateDistanceMeters(
      lat,
      lon,
      Number(b?.center?.latitude),
      Number(b?.center?.longitude),
    ));

  for (const candidate of candidates) {
    const canonicalKey = String(candidate?.canonicalKey || buildingCanonicalCacheKey(candidate?.name));
    const cached = await readBlob(canonicalKey, 'json');
    if (cached?.data) return cached.data;
  }
  return null;
}

async function getBuildingInsights(lat, lon, { layerBaseKey = '', usageContext = null } = {}) {
  const cacheKey = buildingCoordinateCacheKey(lat, lon);
  const cached = await readBlob(cacheKey, 'json');
  if (cached) {
    await indexBuildingForArea(layerBaseKey, cached.data);
    return { value: cached.data, cached: true, cacheSource: 'exact-coordinate', upstreamRequests: 0 };
  }

  const areaCached = await readBuildingFromAreaIndex(layerBaseKey, lat, lon);
  if (areaCached) {
    await writeBlob(cacheKey, areaCached, BUILDING_TTL_MS, { json: true });
    return { value: areaCached, cached: true, cacheSource: 'building-bounds', upstreamRequests: 0 };
  }

  const inflightKey = `building-resolve:${layerBaseKey || cacheKey}`;
  return withInflight(inflightKey, async () => {
    // Another concurrent request may have filled either cache while we waited.
    const retryExact = await readBlob(cacheKey, 'json');
    if (retryExact) {
      await indexBuildingForArea(layerBaseKey, retryExact.data);
      return { value: retryExact.data, cached: true, cacheSource: 'exact-coordinate', upstreamRequests: 0 };
    }
    const retryArea = await readBuildingFromAreaIndex(layerBaseKey, lat, lon);
    if (retryArea) {
      await writeBlob(cacheKey, retryArea, BUILDING_TTL_MS, { json: true });
      return { value: retryArea, cached: true, cacheSource: 'building-bounds', upstreamRequests: 0 };
    }

    await consumeTenantSolarMetric(usageContext, 'buildingInsights');
    const url = new URL(`${SOLAR_BASE}buildingInsights:findClosest`);
    url.searchParams.set('location.latitude', Number(lat).toFixed(5));
    url.searchParams.set('location.longitude', Number(lon).toFixed(5));
    url.searchParams.set('requiredQuality', 'BASE');
    url.searchParams.set('key', String(process.env.GOOGLE_SOLAR_API_KEY));
    const value = await fetchGoogleJson(url, 'Building Insights request');
    await writeBlob(cacheKey, value, BUILDING_TTL_MS, { json: true });
    await indexBuildingForArea(layerBaseKey, value);
    return { value, cached: false, cacheSource: 'google-api', upstreamRequests: 1 };
  });
}

function dataLayersCacheKey(lat, lon, radiusM) {
  // The browser keeps the Data Layers centre at the original map pin so local
  // metre-scale house nudges continue to reuse the same paid request.
  return `layers:${rounded(lat, 5)}:${rounded(lon, 5)}:${Math.round(radiusM)}`;
}

function hourlyShadeLayerKey(layerBaseKey, monthIndex) {
  return `${layerBaseKey}:hourly:${monthIndex + 1}`;
}

function dsmLayerKey(layerBaseKey) {
  return `${layerBaseKey}:dsm`;
}

function maskLayerKey(layerBaseKey) {
  return `${layerBaseKey}:mask`;
}

function surfaceModelKey(layerBaseKey) {
  return `${layerBaseKey}:surface-model-v1`;
}

function annualFluxLayerKey(layerBaseKey) {
  return `${layerBaseKey}:annual-flux`;
}

function monthlyFluxLayerKey(layerBaseKey) {
  return `${layerBaseKey}:monthly-flux`;
}

function fluxModelKey(layerBaseKey) {
  return `${layerBaseKey}:flux-model-v1`;
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

async function getDataLayers(lat, lon, radiusM, { force = false, usageContext = null } = {}) {
  const cacheKey = dataLayersCacheKey(lat, lon, radiusM);
  if (!force) {
    const cached = await readBlob(cacheKey, 'json');
    if (cached) return { value: cached.data, cached: true, upstreamRequests: 0, cacheKey };
  }

  return withInflight(`data-layers:${force ? 'refresh' : 'load'}:${cacheKey}`, async () => {
    if (!force) {
      const retryCached = await readBlob(cacheKey, 'json');
      if (retryCached) return { value: retryCached.data, cached: true, upstreamRequests: 0, cacheKey };
    }

    await consumeTenantSolarMetric(usageContext, 'dataLayers');
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
  });
}

function authenticatedGeoTiffUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.hostname === 'solar.googleapis.com') {
    url.searchParams.set('key', String(process.env.GOOGLE_SOLAR_API_KEY));
  }
  return url;
}

async function getGeoTiffBuffer(layerCacheKey, rawUrl, monthIndex = null, explicitLabel = '') {
  const cached = await readBlob(layerCacheKey, 'arrayBuffer');
  if (cached?.data) return { value: cached.data, cached: true };
  const label = explicitLabel || (monthIndex === null
    ? 'Google Solar GeoTIFF'
    : `Google hourly-shade GeoTIFF month ${monthIndex + 1}`);
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

function sampleSingleBand(tiff, latitude, longitude) {
  const index = sampleIndex(tiff, latitude, longitude);
  if (index < 0) return null;
  const value = Number(tiff.rasters?.[0]?.[index]);
  if (!Number.isFinite(value) || value === -9999) return null;
  return value;
}

function median(values) {
  const filtered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[middle] : (filtered[middle - 1] + filtered[middle]) / 2;
}

function quantile(values, q) {
  const filtered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const position = Math.max(0, Math.min(filtered.length - 1, (filtered.length - 1) * q));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return filtered[lower];
  const t = position - lower;
  return filtered[lower] * (1 - t) + filtered[upper] * t;
}

function fluxStats(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return { min: null, p10: null, median: null, p90: null, max: null, mean: null, count: 0 };
  return {
    min: Math.min(...valid),
    p10: quantile(valid, 0.10),
    median: quantile(valid, 0.50),
    p90: quantile(valid, 0.90),
    max: Math.max(...valid),
    mean: valid.reduce((sum, value) => sum + value, 0) / valid.length,
    count: valid.length,
  };
}

function encodeFluxValues(values, scale = 10) {
  const invalidValue = 65535;
  const encoded = Buffer.allocUnsafe(values.length * 2);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const raw = Number.isFinite(value) && value >= 0
      ? Math.max(0, Math.min(invalidValue - 1, Math.round(value * scale)))
      : invalidValue;
    encoded.writeUInt16LE(raw, index * 2);
  }
  return encoded.toString('base64');
}

function buildGoogleSurfaceModel(dsmTiff, maskTiff, siteLat, siteLon, radiusM) {
  const metersPerDeg = 111320;
  const lonScale = Math.max(1, metersPerDeg * Math.cos(Number(siteLat) * Math.PI / 180));
  const targetSpacingM = radiusM <= 50 ? 1 : radiusM <= 75 ? 1.25 : 1.5;
  const size = Math.max(65, Math.min(141, Math.round((radiusM * 2) / targetSpacingM) + 1));
  const actualSpacingM = (radiusM * 2) / Math.max(1, size - 1);
  const sampledDsm = new Array(size * size).fill(null);
  const sampledMask = new Array(size * size).fill(0);
  const groundCandidates = [];

  for (let row = 0; row < size; row += 1) {
    const z = -radiusM + (row / (size - 1)) * radiusM * 2;
    const northM = -z;
    const latitude = Number(siteLat) + northM / metersPerDeg;
    for (let column = 0; column < size; column += 1) {
      const x = -radiusM + (column / (size - 1)) * radiusM * 2;
      const longitude = Number(siteLon) + x / lonScale;
      const index = row * size + column;
      const dsm = sampleSingleBand(dsmTiff, latitude, longitude);
      const mask = sampleSingleBand(maskTiff, latitude, longitude);
      sampledDsm[index] = dsm;
      sampledMask[index] = Number(mask) > 0 ? 1 : 0;
      if (Number.isFinite(dsm) && sampledMask[index] === 0 && Math.hypot(x, z) <= Math.min(radiusM * 0.55, 35)) {
        groundCandidates.push(dsm);
      }
    }
  }

  let referenceElevationM = median(groundCandidates);
  if (!Number.isFinite(referenceElevationM)) {
    const allValid = sampledDsm.filter(Number.isFinite).sort((a, b) => a - b);
    if (allValid.length) referenceElevationM = allValid[Math.max(0, Math.floor(allValid.length * 0.12))];
  }
  if (!Number.isFinite(referenceElevationM)) referenceElevationM = 0;

  let rooftopCells = 0;
  let validCells = 0;
  let minRelativeM = Infinity;
  let maxRelativeM = -Infinity;
  const heightsCm = sampledDsm.map((value, index) => {
    if (!Number.isFinite(value)) return null;
    validCells += 1;
    if (sampledMask[index]) rooftopCells += 1;
    const relative = Math.max(-30, Math.min(80, value - referenceElevationM));
    minRelativeM = Math.min(minRelativeM, relative);
    maxRelativeM = Math.max(maxRelativeM, relative);
    return Math.round(relative * 100);
  });

  return {
    provider: 'Google Solar API DSM + building mask',
    revision: Date.now(),
    radiusM,
    size,
    cellSizeM: actualSpacingM,
    minX: -radiusM,
    maxX: radiusM,
    minZ: -radiusM,
    maxZ: radiusM,
    referenceElevationM,
    heightsCm,
    buildingMask: sampledMask,
    rooftopCoveragePct: validCells ? rooftopCells / validCells * 100 : 0,
    minRelativeM: Number.isFinite(minRelativeM) ? minRelativeM : 0,
    maxRelativeM: Number.isFinite(maxRelativeM) ? maxRelativeM : 0,
    imageryBounds: dsmTiff.bounds,
  };
}

async function getGoogleSurfaceModel(layerBaseKey, layersValue, siteLat, siteLon, radiusM) {
  const cached = await readBlob(surfaceModelKey(layerBaseKey), 'json');
  if (cached?.data) {
    return { value: cached.data, cached: true, dsmCached: true, maskCached: true, downloads: 0 };
  }
  if (!layersValue?.dsmUrl || !layersValue?.maskUrl) {
    throw new Error('Google Data Layers did not return DSM and building-mask URLs for this site.');
  }
  const [dsmBinary, maskBinary] = await Promise.all([
    getGeoTiffBuffer(dsmLayerKey(layerBaseKey), layersValue.dsmUrl, null, 'Google DSM GeoTIFF'),
    getGeoTiffBuffer(maskLayerKey(layerBaseKey), layersValue.maskUrl, null, 'Google building-mask GeoTIFF'),
  ]);
  const [dsmTiff, maskTiff] = await Promise.all([decodeGeoTiff(dsmBinary.value), decodeGeoTiff(maskBinary.value)]);
  const value = buildGoogleSurfaceModel(dsmTiff, maskTiff, siteLat, siteLon, radiusM);
  await writeBlob(surfaceModelKey(layerBaseKey), value, SURFACE_MODEL_TTL_MS, { json: true });
  return {
    value,
    cached: false,
    dsmCached: dsmBinary.cached,
    maskCached: maskBinary.cached,
    downloads: Number(!dsmBinary.cached) + Number(!maskBinary.cached),
  };
}

function buildGoogleFluxModel(annualTiff, monthlyTiff, surfaceModel, siteLat, siteLon, radiusM) {
  const metersPerDeg = 111320;
  const lonScale = Math.max(1, metersPerDeg * Math.cos(Number(siteLat) * Math.PI / 180));
  const size = Math.max(2, Number(surfaceModel?.size) || 0);
  const cellSizeM = Number(surfaceModel?.cellSizeM) || (radiusM * 2) / Math.max(1, size - 1);
  const annualValues = new Array(size * size).fill(null);
  const monthlyValues = Array.from({ length: 12 }, () => new Array(size * size).fill(null));
  const annualRoofValues = [];
  const monthlyRoofValues = Array.from({ length: 12 }, () => []);

  for (let row = 0; row < size; row += 1) {
    const z = -radiusM + row * cellSizeM;
    const latitude = Number(siteLat) - z / metersPerDeg;
    for (let column = 0; column < size; column += 1) {
      const x = -radiusM + column * cellSizeM;
      const longitude = Number(siteLon) + x / lonScale;
      const outputIndex = row * size + column;
      const annualIndex = sampleIndex(annualTiff, latitude, longitude);
      const monthlyIndex = sampleIndex(monthlyTiff, latitude, longitude);
      const annual = annualIndex >= 0 ? Number(annualTiff.rasters?.[0]?.[annualIndex]) : NaN;
      const annualValid = Number.isFinite(annual) && annual !== -9999 && annual >= 0;
      annualValues[outputIndex] = annualValid ? annual : null;
      const rooftop = Number(surfaceModel?.buildingMask?.[outputIndex]) > 0;
      if (annualValid && rooftop) annualRoofValues.push(annual);

      for (let month = 0; month < 12; month += 1) {
        const value = monthlyIndex >= 0 ? Number(monthlyTiff.rasters?.[month]?.[monthlyIndex]) : NaN;
        const valid = Number.isFinite(value) && value !== -9999 && value >= 0;
        monthlyValues[month][outputIndex] = valid ? value : null;
        if (valid && rooftop) monthlyRoofValues[month].push(value);
      }
    }
  }

  const fallbackAnnual = annualValues.filter(Number.isFinite);
  return {
    provider: 'Google Solar API annual/monthly flux',
    revision: Date.now(),
    radiusM,
    size,
    cellSizeM,
    minX: -radiusM,
    maxX: radiusM,
    minZ: -radiusM,
    maxZ: radiusM,
    scale: 10,
    invalidValue: 65535,
    units: 'kWh/kW/year',
    annualFluxU16B64: encodeFluxValues(annualValues, 10),
    monthlyFluxU16B64: monthlyValues.map((values) => encodeFluxValues(values, 10)),
    stats: {
      annual: fluxStats(annualRoofValues.length ? annualRoofValues : fallbackAnnual),
      monthly: monthlyRoofValues.map((values) => fluxStats(values)),
    },
  };
}

async function getGoogleFluxModel(layerBaseKey, layersValue, surfaceModel, siteLat, siteLon, radiusM) {
  const cached = await readBlob(fluxModelKey(layerBaseKey), 'json');
  if (cached?.data) {
    return { value: cached.data, cached: true, annualCached: true, monthlyCached: true, downloads: 0 };
  }
  if (!layersValue?.annualFluxUrl || !layersValue?.monthlyFluxUrl) {
    throw new Error('Google Data Layers did not return annual and monthly flux URLs for this site.');
  }
  const [annualBinary, monthlyBinary] = await Promise.all([
    getGeoTiffBuffer(annualFluxLayerKey(layerBaseKey), layersValue.annualFluxUrl, null, 'Google annual-flux GeoTIFF'),
    getGeoTiffBuffer(monthlyFluxLayerKey(layerBaseKey), layersValue.monthlyFluxUrl, null, 'Google monthly-flux GeoTIFF'),
  ]);
  const [annualTiff, monthlyTiff] = await Promise.all([decodeGeoTiff(annualBinary.value), decodeGeoTiff(monthlyBinary.value)]);
  const value = buildGoogleFluxModel(annualTiff, monthlyTiff, surfaceModel, siteLat, siteLon, radiusM);
  await writeBlob(fluxModelKey(layerBaseKey), value, FLUX_MODEL_TTL_MS, { json: true });
  return {
    value,
    cached: false,
    annualCached: annualBinary.cached,
    monthlyCached: monthlyBinary.cached,
    downloads: Number(!annualBinary.cached) + Number(!monthlyBinary.cached),
  };
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
      boundingBox: segment.boundingBox || null,
      planeHeightAtCenterMeters: Number(segment.planeHeightAtCenterMeters) || 0,
    })),
    suggestedPanels: (Array.isArray(solar.solarPanels) ? solar.solarPanels : []).slice(0, 120).map((panel) => ({
      center: panel.center || null,
      orientation: panel.orientation || '',
      segmentIndex: Number(panel.segmentIndex) || 0,
      yearlyEnergyDcKwh: Number(panel.yearlyEnergyDcKwh) || 0,
    })),
    panelConfigs: configs.map((config) => ({
      panelsCount: Number(config.panelsCount) || 0,
      yearlyEnergyDcKwh: Number(config.yearlyEnergyDcKwh) || 0,
      roofSegmentSummaries: (config.roofSegmentSummaries || []).map((item) => ({
        segmentIndex: Number(item.segmentIndex) || 0,
        panelsCount: Number(item.panelsCount) || 0,
        yearlyEnergyDcKwh: Number(item.yearlyEnergyDcKwh) || 0,
        pitchDegrees: Number(item.pitchDegrees) || 0,
        azimuthDegrees: Number(item.azimuthDegrees) || 0,
      })),
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

async function analyzeGoogleSolar(body, { usageContext = null } = {}) {
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

  const requestedRadiusM = Math.min(100, Math.max(20, Number(body?.radiusM) || DEFAULT_RADIUS_M));
  // FULL_LAYERS supports 100 m unconditionally. Using one stable coverage
  // footprint avoids throwing away cached DSM/shade/flux data when the house
  // is nudged across the old 50 m / 75 m radius thresholds.
  const radiusM = Math.max(DATA_LAYERS_COVERAGE_RADIUS_M, requestedRadiusM);
  const requestedPanelCount = Math.max(0, Number(body?.requestedPanelCount) || panelPoints.length);

  const layerBaseKey = dataLayersCacheKey(siteLat, siteLon, radiusM);
  const [buildingResult, preCachedShadeBuffers, preCachedLayerInfo, preCachedSurfaceModel, preCachedFluxModel] = await Promise.all([
    getBuildingInsights(houseLat, houseLon, { layerBaseKey, usageContext }),
    readCachedHourlyShadeBuffers(layerBaseKey),
    readCachedLayerInfo(layerBaseKey),
    readBlob(surfaceModelKey(layerBaseKey), 'json'),
    readBlob(fluxModelKey(layerBaseKey), 'json'),
  ]);

  let layersResult = null;
  let layerInfo = preCachedLayerInfo;
  let geoTiffCacheHits = 0;
  let geoTiffDownloads = 0;
  let dataLayersUpstreamRequests = 0;
  let shadeBuffers = preCachedShadeBuffers;
  let surfaceResult = preCachedSurfaceModel?.data
    ? { value: preCachedSurfaceModel.data, cached: true, dsmCached: true, maskCached: true, downloads: 0 }
    : null;
  let fluxResult = preCachedFluxModel?.data
    ? { value: preCachedFluxModel.data, cached: true, annualCached: true, monthlyCached: true, downloads: 0 }
    : null;

  if (shadeBuffers && surfaceResult && fluxResult) {
    geoTiffCacheHits = 12;
  } else {
    layersResult = await getDataLayers(siteLat, siteLon, radiusM, { usageContext });
    dataLayersUpstreamRequests += layersResult.upstreamRequests;
    layerInfo = compactLayerInfo(layersResult.value, radiusM);

    if (!surfaceResult) {
      surfaceResult = await getGoogleSurfaceModel(layerBaseKey, layersResult.value, siteLat, siteLon, radiusM);
    }
    if (!fluxResult) {
      fluxResult = await getGoogleFluxModel(layerBaseKey, layersResult.value, surfaceResult.value, siteLat, siteLon, radiusM);
    }

    if (shadeBuffers) {
      geoTiffCacheHits = 12;
    } else {
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
            layersResult = await getDataLayers(siteLat, siteLon, radiusM, { force: true, usageContext });
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
  }

  if (!surfaceResult) {
    // This path is only expected when older shade caches exist without the new Step A surface cache.
    layersResult = layersResult || await getDataLayers(siteLat, siteLon, radiusM, { usageContext });
    dataLayersUpstreamRequests += layersResult.upstreamRequests;
    layerInfo = compactLayerInfo(layersResult.value, radiusM);
    surfaceResult = await getGoogleSurfaceModel(layerBaseKey, layersResult.value, siteLat, siteLon, radiusM);
  }
  if (!fluxResult) {
    // Existing DSM/shade caches created before the heatmap feature may need one
    // fresh Data Layers request to obtain non-expired flux download URLs. New
    // site analyses reuse the same Data Layers response used by shade/DSM.
    layersResult = layersResult || await getDataLayers(siteLat, siteLon, radiusM, { usageContext });
    dataLayersUpstreamRequests += layersResult.upstreamRequests;
    layerInfo = compactLayerInfo(layersResult.value, radiusM);
    fluxResult = await getGoogleFluxModel(layerBaseKey, layersResult.value, surfaceResult.value, siteLat, siteLon, radiusM);
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
    surfaceModel: surfaceResult?.value || null,
    fluxModel: fluxResult?.value || null,
    cache: {
      buildingInsights: buildingResult.cached,
      buildingInsightsSource: buildingResult.cacheSource || (buildingResult.cached ? 'cache' : 'google-api'),
      dataLayers: dataLayersUpstreamRequests === 0,
      dataLayersRadiusM: radiusM,
      hourlyShadeTiffsCached: geoTiffCacheHits,
      hourlyShadeTiffsDownloaded: geoTiffDownloads,
      googleSurfaceModel: Boolean(surfaceResult?.cached),
      dsmGeoTiffCached: Boolean(surfaceResult?.dsmCached),
      buildingMaskGeoTiffCached: Boolean(surfaceResult?.maskCached),
      surfaceGeoTiffsDownloaded: Number(surfaceResult?.downloads || 0),
      googleFluxModel: Boolean(fluxResult?.cached),
      annualFluxGeoTiffCached: Boolean(fluxResult?.annualCached),
      monthlyFluxGeoTiffCached: Boolean(fluxResult?.monthlyCached),
      fluxGeoTiffsDownloaded: Number(fluxResult?.downloads || 0),
      upstreamBillableRequests: buildingResult.upstreamRequests + dataLayersUpstreamRequests,
    },
  };
}

export async function handleGoogleSolarRequest(request) {
  if (request.method === 'OPTIONS') {
    if (!originIsPotentiallyAllowed(request)) return jsonResponse(request, { error: 'Origin not allowed.' }, 403);
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!originIsPotentiallyAllowed(request)) return jsonResponse(request, { error: 'Origin not allowed.' }, 403);

  let usageContext;
  try {
    usageContext = await resolveSolarRequestContext(request);
  } catch (error) {
    console.error('[Google Solar proxy] Tenant usage scope lookup failed.', error);
    return jsonResponse(request, { error: 'Tenant usage service is temporarily unavailable.' }, 503);
  }
  if (!usageContext) return jsonResponse(request, { error: 'Solar is not enabled for this tenant.' }, 403);

  const url = new URL(request.url);
  const action = String(url.searchParams.get('action') || 'health');

  if (request.method === 'GET' && action === 'health') {
    return jsonResponse(request, {
      ok: true,
      service: 'google-solar-demo-proxy',
      platform: 'google-cloud-run',
      googleSolarConfigured: googleConfigured(),
      accessCodeConfigured: authConfigured(),
      authentication: 'short-lived signed demo session',
      cache: cacheConfigured() ? 'Cloud Storage + Firestore rate limits + 30-day GeoTIFF retention' : 'in-memory fallback only (GOOGLE_SOLAR_CACHE_BUCKET missing)',
    });
  }

  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  let body = {};
  try { body = await request.json(); } catch { return jsonResponse(request, { error: 'A JSON request body is required.' }, 400); }

  if (action === 'login') {
    if (!authConfigured()) return jsonResponse(request, { error: 'Google Solar demo authentication is not configured.' }, 503);
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

  const mcpAnalysis = action === 'mcp-analyze';
  if (action !== 'analyze' && !mcpAnalysis) return jsonResponse(request, { error: 'Unsupported Google Solar action.' }, 400);
  if (!googleConfigured()) return jsonResponse(request, { error: 'GOOGLE_SOLAR_API_KEY is not configured.' }, 503);
  if (!authConfigured()) return jsonResponse(request, { error: 'Google Solar demo authentication is not configured.' }, 503);
  const session = mcpAnalysis ? null : verifySession(bearerToken(request), request);
  if (mcpAnalysis && !mcpBridgeAuthorized(request)) return jsonResponse(request, { error: 'MCP Solar bridge is not authorized.' }, 401);
  if (!mcpAnalysis && !session) return jsonResponse(request, { error: 'Google Solar demo session is locked or expired.' }, 401);

  const limit = usageContext.kind === 'tenant'
    ? {
      allowed: true,
      perIp: { allowed: true, count: 0, max: 0 },
      global: { allowed: true, count: 0, max: 0 },
    }
    : await enforceAnalysisRateLimit(request);
  if (!limit.allowed) return jsonResponse(request, {
    error: 'Google Solar demo request limit reached for today.',
    limit: { perIp: limit.perIp, global: limit.global },
  }, 429);

  try {
    const analysisUsage = await consumeTenantSolarMetric(usageContext, 'analyses');
    const result = await analyzeGoogleSolar(body, { usageContext });
    return jsonResponse(request, {
      ...result,
      security: {
      sessionExpiresAt: session ? new Date(Number(session.exp) * 1000).toISOString() : null,
        perIpAnalysesToday: limit.perIp.count,
        perIpLimit: limit.perIp.max,
        globalAnalysesToday: limit.global.count,
        globalLimit: limit.global.max,
      },
      ...(usageContext.kind === 'tenant' ? {
        tenantUsage: {
          month: analysisUsage.month,
          analyses: analysisUsage.count,
          analysesLimit: analysisUsage.limit || 0,
        },
      } : {}),
    });
  } catch (error) {
    const quotaPayload = quotaErrorPayload(error);
    if (quotaPayload) return jsonResponse(request, quotaPayload, 429);
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
}
