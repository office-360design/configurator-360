import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';

const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/';
const CACHE_PREFIX = 'pvgis-cache-v1';
const ALLOWED_TOOLS = new Set(['PVcalc', 'printhorizon']);
const COMMON_PARAMS = new Set(['lat', 'lon', 'outputformat']);
const PVCALC_PARAMS = new Set([
  'usehorizon', 'userhorizon', 'raddatabase', 'peakpower', 'pvtechchoice',
  'mountingplace', 'loss', 'fixed', 'angle', 'aspect', 'optimalinclination',
  'optimalangles', 'pvprice', 'systemcost', 'interest', 'lifetime',
]);
const HORIZON_PARAMS = new Set(['userhorizon']);
const storage = new Storage();
const memoryCache = new Map();
const inflightLoads = new Map();
const MEMORY_CACHE_MAX_ENTRIES = 160;
const TOOL_TTL_MS = {
  PVcalc: 24 * 60 * 60 * 1000,
  printhorizon: 7 * 24 * 60 * 60 * 1000,
};

function configuredOrigins() {
  const raw = String(
    process.env.PVGIS_ALLOWED_ORIGIN
      || process.env.GOOGLE_SOLAR_ALLOWED_ORIGIN
      || process.env.ALLOWED_ORIGIN
      || 'https://www.360configurator.com,https://www.360configurator.ro,https://www.360konfigurator.de,https://aks.360configurator.com',
  ).trim();
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
  if (!origin) return true;
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
      : allowed[0] || 'https://www.360configurator.com';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(request, payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
      ...extra,
    },
  });
}

function validateCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function buildUpstreamUrl(url, tool) {
  const lat = validateCoordinate(url.searchParams.get('lat'), -90, 90);
  const lon = validateCoordinate(url.searchParams.get('lon'), -180, 180);
  if (lat === null || lon === null) throw new Error('Valid lat/lon parameters are required.');

  const upstream = new URL(tool, PVGIS_BASE);
  upstream.searchParams.set('lat', String(lat));
  upstream.searchParams.set('lon', String(lon));
  upstream.searchParams.set('outputformat', 'json');
  const allowed = tool === 'PVcalc'
    ? new Set([...COMMON_PARAMS, ...PVCALC_PARAMS])
    : new Set([...COMMON_PARAMS, ...HORIZON_PARAMS]);

  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'tool' || key === 'lat' || key === 'lon' || key === 'outputformat') continue;
    if (!allowed.has(key)) continue;
    upstream.searchParams.set(key, value);
  }

  if (tool === 'PVcalc') {
    if (!upstream.searchParams.has('peakpower')) throw new Error('PVcalc requires peakpower.');
    if (!upstream.searchParams.has('loss')) upstream.searchParams.set('loss', '14');
    if (!upstream.searchParams.has('usehorizon')) upstream.searchParams.set('usehorizon', '1');
  }
  return upstream;
}

function cacheBucketName() {
  return String(process.env.PVGIS_CACHE_BUCKET || process.env.GOOGLE_SOLAR_CACHE_BUCKET || '').trim();
}

function canonicalCacheKey(tool, upstream) {
  const canonical = new URL(upstream.toString());
  canonical.searchParams.sort();
  const digest = createHash('sha256').update(canonical.toString()).digest('hex');
  return `${CACHE_PREFIX}/${tool.toLowerCase()}/${digest}.json`;
}

function pruneMemoryCache() {
  if (memoryCache.size <= MEMORY_CACHE_MAX_ENTRIES) return;
  const entries = [...memoryCache.entries()].sort((a, b) => Number(a[1]?.savedAt || 0) - Number(b[1]?.savedAt || 0));
  entries.slice(0, memoryCache.size - MEMORY_CACHE_MAX_ENTRIES).forEach(([key]) => memoryCache.delete(key));
}

function readMemoryCache(key, ttlMs) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - Number(entry.savedAt || 0) > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

function writeMemoryCache(key, entry) {
  memoryCache.set(key, entry);
  pruneMemoryCache();
}

async function readStorageCache(key, ttlMs) {
  const bucketName = cacheBucketName();
  if (!bucketName) return null;
  try {
    const [buffer] = await storage.bucket(bucketName).file(key).download();
    const entry = JSON.parse(buffer.toString('utf8'));
    if (!entry?.savedAt || Date.now() - Number(entry.savedAt) > ttlMs) return null;
    return entry;
  } catch (error) {
    if (Number(error?.code) !== 404) {
      console.warn('[PVGIS Cloud Run] Cloud Storage cache read failed; continuing without persistent cache.', error?.message || error);
    }
    return null;
  }
}

async function writeStorageCache(key, entry) {
  const bucketName = cacheBucketName();
  if (!bucketName) return;
  try {
    await storage.bucket(bucketName).file(key).save(JSON.stringify(entry), {
      resumable: false,
      contentType: 'application/json; charset=utf-8',
      metadata: {
        cacheControl: 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    console.warn('[PVGIS Cloud Run] Cloud Storage cache write failed; continuing with memory cache.', error?.message || error);
  }
}

async function fetchWithRetry(upstream) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      response = await fetch(upstream.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': '360-Solar-Configurator-PVGIS-Google-Cloud-Proxy/1.0',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (![429, 529].includes(response.status)) return response;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return response;
}

async function loadPvgis(tool, upstream) {
  const ttlMs = TOOL_TTL_MS[tool];
  const key = canonicalCacheKey(tool, upstream);
  const memoryEntry = readMemoryCache(key, ttlMs);
  if (memoryEntry) return { ...memoryEntry, cache: 'memory' };

  const storageEntry = await readStorageCache(key, ttlMs);
  if (storageEntry) {
    writeMemoryCache(key, storageEntry);
    return { ...storageEntry, cache: 'cloud-storage' };
  }

  if (inflightLoads.has(key)) {
    const entry = await inflightLoads.get(key);
    return { ...entry, cache: 'coalesced' };
  }

  const load = (async () => {
    const response = await fetchWithRetry(upstream);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || `PVGIS HTTP ${response.status}` };
    }

    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `PVGIS HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    const entry = {
      savedAt: Date.now(),
      upstreamStatus: response.status,
      body,
    };
    writeMemoryCache(key, entry);
    await writeStorageCache(key, entry);
    return entry;
  })();

  inflightLoads.set(key, load);
  try {
    const entry = await load;
    return { ...entry, cache: 'miss' };
  } finally {
    inflightLoads.delete(key);
  }
}

export async function handlePvgisRequest(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!originIsAllowed(request)) return jsonResponse(request, { error: 'Origin not allowed.' }, 403);
  if (request.method !== 'GET') return jsonResponse(request, { error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  if (url.searchParams.get('tool') === 'health') {
    return jsonResponse(request, {
      ok: true,
      service: 'solar-pvgis-proxy',
      platform: 'google-cloud-run',
      upstream: 'PVGIS 5.3',
      cache: cacheBucketName() ? 'Cloud Storage + in-memory' : 'in-memory only',
    }, 200, {
      'Cache-Control': 'no-store',
    });
  }

  const tool = url.searchParams.get('tool') || 'PVcalc';
  if (!ALLOWED_TOOLS.has(tool)) {
    return jsonResponse(request, { error: 'Unsupported PVGIS tool' }, 400, { 'Cache-Control': 'no-store' });
  }

  let upstream;
  try {
    upstream = buildUpstreamUrl(url, tool);
  } catch (error) {
    return jsonResponse(request, { error: error.message }, 400, { 'Cache-Control': 'no-store' });
  }

  try {
    const result = await loadPvgis(tool, upstream);
    const cacheTtlSeconds = Math.floor(TOOL_TTL_MS[tool] / 1000);
    return jsonResponse(request, result.body, 200, {
      'Cache-Control': `public, max-age=300, s-maxage=${cacheTtlSeconds}, stale-while-revalidate=3600`,
      'X-PVGIS-Upstream-Status': String(result.upstreamStatus || 200),
      'X-PVGIS-Cache': result.cache,
    });
  } catch (error) {
    const status = Number(error?.status);
    if (status >= 400 && status < 600 && error?.body) {
      return jsonResponse(request, error.body, status, {
        'Cache-Control': 'no-store',
        'X-PVGIS-Upstream-Status': String(status),
        'X-PVGIS-Cache': 'miss',
      });
    }
    console.error('[PVGIS Cloud Run] Upstream request failed.', error);
    return jsonResponse(request, {
      error: 'PVGIS upstream request failed',
      message: error?.message || String(error),
    }, 502, {
      'Cache-Control': 'no-store',
      'X-PVGIS-Cache': 'miss',
    });
  }
}
