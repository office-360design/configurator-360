const OVERPASS_UPSTREAMS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);
const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map();

function jsonResponse(request, payload, status = 200, extraHeaders = {}) {
  const origin = request.headers.get('origin') || '*';
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      ...extraHeaders,
    },
  });
}

function canonicalContextQuery(radiusM, latitude, longitude) {
  return `[out:json][timeout:16];\n(\n`
    + `way["building"](around:${radiusM},${latitude},${longitude});\n`
    + `way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service)$"](around:${radiusM},${latitude},${longitude});\n`
    + `node["natural"="tree"](around:${radiusM},${latitude},${longitude});\n`
    + `);\nout tags geom;`;
}

export function parseOverpassContextRequest(bodyText) {
  const params = new URLSearchParams(String(bodyText || ''));
  const query = String(params.get('data') || '');
  const matches = [...query.matchAll(/around:(\d+),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
  if (!matches.length) throw new Error('A supported nearby-context query is required.');
  const radiusM = Math.round(Number(matches[0][1]));
  const latitude = Number(matches[0][2]);
  const longitude = Number(matches[0][3]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(radiusM) || radiusM < 80 || radiusM > 400) {
    throw new Error('The nearby-context coordinates or radius are invalid.');
  }
  const consistent = matches.every(match => (
    Math.round(Number(match[1])) === radiusM
    && Math.abs(Number(match[2]) - latitude) < 1e-7
    && Math.abs(Number(match[3]) - longitude) < 1e-7
  ));
  if (!consistent) throw new Error('Every nearby-context layer must use the same coordinates and radius.');
  return {
    radiusM,
    latitude,
    longitude,
    cacheKey: `${latitude.toFixed(5)}/${longitude.toFixed(5)}/${radiusM}`,
    query: canonicalContextQuery(radiusM, latitude, longitude),
  };
}

async function fetchOverpass(query, upstream, parentSignal) {
  const url = new URL(upstream);
  url.searchParams.set('data', query);
  const timeoutSignal = AbortSignal.timeout(18_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': '360Configurator-Solar-Environment/1.0 (https://360configurator.com)',
    },
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.elements)) throw new Error('Overpass returned an invalid payload.');
  return { payload, upstream };
}

export async function handleOverpassRequest(request, { secondary = false } = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);

  let context;
  try {
    context = parseOverpassContextRequest(await request.text());
  } catch (error) {
    return jsonResponse(request, { error: error?.message || 'Invalid nearby-context request.' }, 400);
  }

  const cached = memoryCache.get(context.cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return jsonResponse(request, cached.payload, 200, {
      'Cache-Control': 'public, max-age=900',
      'X-360-Environment-Cache': 'hit',
    });
  }

  const upstreams = secondary
    ? [...OVERPASS_UPSTREAMS.slice(1), OVERPASS_UPSTREAMS[0]]
    : [...OVERPASS_UPSTREAMS];
  const controller = new AbortController();
  try {
    // Public Overpass instances vary significantly by region and load. Race the
    // approved mirrors, keep the first valid payload, then abort the losers.
    const { payload, upstream } = await Promise.any(
      upstreams.map(candidate => fetchOverpass(context.query, candidate, controller.signal))
    );
    controller.abort();
    memoryCache.set(context.cacheKey, { payload, createdAt: Date.now() });
    if (memoryCache.size > 100) memoryCache.delete(memoryCache.keys().next().value);
    return jsonResponse(request, payload, 200, {
      'Cache-Control': 'public, max-age=900',
      'X-360-Environment-Cache': 'miss',
      'X-360-Environment-Upstream': new URL(upstream).hostname,
    });
  } catch (error) {
    controller.abort();
    const errors = error instanceof AggregateError
      ? error.errors.map(item => item?.message || 'failed')
      : [error?.message || 'failed'];
    return jsonResponse(request, {
      error: 'Nearby mapped context is temporarily unavailable.',
      details: errors,
    }, 502, { 'Cache-Control': 'no-store' });
  }
}
