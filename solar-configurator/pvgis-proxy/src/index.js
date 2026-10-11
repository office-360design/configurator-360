const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/';
const ALLOWED_TOOLS = new Set(['PVcalc', 'printhorizon']);
const COMMON_PARAMS = new Set(['lat', 'lon', 'outputformat']);
const PVCALC_PARAMS = new Set([
  'usehorizon', 'userhorizon', 'raddatabase', 'peakpower', 'pvtechchoice',
  'mountingplace', 'loss', 'fixed', 'angle', 'aspect', 'optimalinclination',
  'optimalangles', 'pvprice', 'systemcost', 'interest', 'lifetime',
]);
const HORIZON_PARAMS = new Set(['userhorizon']);

function corsHeaders(request, env) {
  const configured = String(env.ALLOWED_ORIGIN || '*').trim() || '*';
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = configured === '*' ? '*' : (origin === configured ? origin : configured);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(request, env, payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
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

async function fetchWithRetry(upstream, cacheTtl) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': '360-Solar-Configurator-PVGIS-Proxy/1.0' },
      cf: { cacheEverything: true, cacheTtl },
    });
    if (![429, 529].includes(response.status)) return response;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return response;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== 'GET') return jsonResponse(request, env, { error: 'Method not allowed' }, 405);

    const url = new URL(request.url);
    if (url.pathname === '/health' || url.searchParams.get('tool') === 'health') {
      return jsonResponse(request, env, { ok: true, service: 'solar-pvgis-proxy', upstream: 'PVGIS 5.3' }, 200, { 'Cache-Control': 'no-store' });
    }

    const tool = url.searchParams.get('tool') || 'PVcalc';
    if (!ALLOWED_TOOLS.has(tool)) return jsonResponse(request, env, { error: 'Unsupported PVGIS tool' }, 400);

    let upstream;
    try {
      upstream = buildUpstreamUrl(url, tool);
    } catch (error) {
      return jsonResponse(request, env, { error: error.message }, 400);
    }

    try {
      const cacheTtl = tool === 'printhorizon' ? 604800 : 86400;
      const response = await fetchWithRetry(upstream, cacheTtl);
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { error: text || `PVGIS HTTP ${response.status}` }; }
      const status = response.ok ? 200 : response.status;
      return jsonResponse(request, env, body, status, {
        'Cache-Control': `public, max-age=${cacheTtl}`,
        'X-PVGIS-Upstream-Status': String(response.status),
      });
    } catch (error) {
      return jsonResponse(request, env, { error: 'PVGIS upstream request failed', message: error.message }, 502, { 'Cache-Control': 'no-store' });
    }
  },
};
