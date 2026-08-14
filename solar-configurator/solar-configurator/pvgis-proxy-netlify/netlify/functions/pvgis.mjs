const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/';
const ALLOWED_TOOLS = new Set(['PVcalc', 'printhorizon']);
const COMMON_PARAMS = new Set(['lat', 'lon', 'outputformat']);
const PVCALC_PARAMS = new Set([
  'usehorizon', 'userhorizon', 'raddatabase', 'peakpower', 'pvtechchoice',
  'mountingplace', 'loss', 'fixed', 'angle', 'aspect', 'optimalinclination',
  'optimalangles', 'pvprice', 'systemcost', 'interest', 'lifetime',
]);
const HORIZON_PARAMS = new Set(['userhorizon']);

function allowedOrigin(request) {
  const configured = String(process.env.ALLOWED_ORIGIN || '*').trim() || '*';
  const origin = request.headers.get('origin') || '';
  if (configured === '*') return '*';
  const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || configured;
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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

async function fetchWithRetry(upstream) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(upstream.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': '360-Solar-Configurator-PVGIS-Netlify-Proxy/1.0',
      },
    });
    if (![429, 529].includes(response.status)) return response;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return response;
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'GET') {
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get('tool') === 'health') {
    return jsonResponse(request, {
      ok: true,
      service: 'solar-pvgis-proxy',
      platform: 'netlify-functions',
      upstream: 'PVGIS 5.3',
    }, 200, {
      'Cache-Control': 'no-store',
      'Netlify-CDN-Cache-Control': 'no-store',
    });
  }

  const tool = url.searchParams.get('tool') || 'PVcalc';
  if (!ALLOWED_TOOLS.has(tool)) {
    return jsonResponse(request, { error: 'Unsupported PVGIS tool' }, 400);
  }

  let upstream;
  try {
    upstream = buildUpstreamUrl(url, tool);
  } catch (error) {
    return jsonResponse(request, { error: error.message }, 400);
  }

  try {
    const cacheTtl = tool === 'printhorizon' ? 604800 : 86400;
    const response = await fetchWithRetry(upstream);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || `PVGIS HTTP ${response.status}` };
    }

    return jsonResponse(request, body, response.ok ? 200 : response.status, {
      // Keep browser caching short while allowing Netlify's CDN to absorb repeated
      // requests for identical site/roof parameter combinations.
      'Cache-Control': response.ok ? 'public, max-age=300' : 'no-store',
      'Netlify-CDN-Cache-Control': response.ok
        ? `public, s-maxage=${cacheTtl}, stale-while-revalidate=3600`
        : 'no-store',
      'X-PVGIS-Upstream-Status': String(response.status),
    });
  } catch (error) {
    return jsonResponse(request, {
      error: 'PVGIS upstream request failed',
      message: error?.message || String(error),
    }, 502, {
      'Cache-Control': 'no-store',
      'Netlify-CDN-Cache-Control': 'no-store',
    });
  }
};
