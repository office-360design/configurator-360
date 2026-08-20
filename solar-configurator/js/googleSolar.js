const TOKEN_STORAGE_KEY = '360-configurator:solar:google-solar-session';
const ANALYSIS_CACHE_KEY = '360-configurator:solar:google-solar-analysis-v6';
const ANALYSIS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ANALYSIS_CACHE_MAX_ENTRIES = 3;
const DEFAULT_PATH = '/api/solar/google-solar';

export function resolveGoogleSolarEndpoint(_pvgisEndpoint = '') {
  const explicit = String(window.SOLAR_GOOGLE_SOLAR_ENDPOINT || '').trim();
  if (explicit) return new URL(explicit, window.location.href).toString().replace(/\?$/, '').replace(/\/$/, '');
  return new URL(DEFAULT_PATH, window.location.href).toString().replace(/\/$/, '');
}

export function readGoogleSolarSession() {
  try {
    const raw = window.sessionStorage?.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || !session?.expiresAt || Date.parse(session.expiresAt) <= Date.now() + 5000) {
      window.sessionStorage?.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearGoogleSolarSession() {
  try { window.sessionStorage?.removeItem(TOKEN_STORAGE_KEY); } catch { /* ignored */ }
}

function storeGoogleSolarSession(session) {
  try { window.sessionStorage?.setItem(TOKEN_STORAGE_KEY, JSON.stringify(session)); } catch { /* ignored */ }
}

async function jsonFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: options.signal || controller.signal });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { error: text || `HTTP ${response.status}` }; }
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function testGoogleSolarProxy(endpoint) {
  const url = new URL(resolveGoogleSolarEndpoint(endpoint));
  url.searchParams.set('action', 'health');
  return jsonFetch(url.toString(), {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }, 10000);
}

export async function unlockGoogleSolar(endpoint, code) {
  const url = new URL(resolveGoogleSolarEndpoint(endpoint));
  url.searchParams.set('action', 'login');
  const payload = await jsonFetch(url.toString(), {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(code || '') }),
  }, 12000);
  const session = { token: payload.token, expiresAt: payload.expiresAt };
  storeGoogleSolarSession(session);
  return session;
}

export function makeGoogleAnalysisSignature({ siteLat, siteLon, houseLat, houseLon, panelPoints = [] }) {
  const pointKey = panelPoints.map((panel) => [
    String(panel.surfaceId || ''),
    Number(panel.latitude).toFixed(6),
    Number(panel.longitude).toFixed(6),
  ].join(':')).join('|');
  return [
    Number(siteLat).toFixed(5), Number(siteLon).toFixed(5),
    Number(houseLat).toFixed(5), Number(houseLon).toFixed(5),
    pointKey,
  ].join('::');
}

function normalizeAnalysisCache(payload) {
  const entries = Array.isArray(payload?.entries)
    ? payload.entries
    : payload?.signature
      ? [payload]
      : [];
  const now = Date.now();
  return entries.filter((entry) => (
    entry?.signature
    && entry?.analysis
    && Number(entry?.savedAt) > 0
    && now - Number(entry.savedAt) <= ANALYSIS_CACHE_TTL_MS
  ));
}

export function readCachedGoogleAnalysis(signature) {
  try {
    const raw = window.localStorage?.getItem(ANALYSIS_CACHE_KEY);
    if (!raw) return null;
    const entries = normalizeAnalysisCache(JSON.parse(raw));
    const cached = entries.find((entry) => entry.signature === signature);
    return cached?.analysis || null;
  } catch {
    return null;
  }
}

export function cacheGoogleAnalysis(signature, analysis) {
  const entry = { signature, savedAt: Date.now(), analysis };
  try {
    const raw = window.localStorage?.getItem(ANALYSIS_CACHE_KEY);
    const existing = raw ? normalizeAnalysisCache(JSON.parse(raw)) : [];
    const entries = [
      entry,
      ...existing.filter((cached) => cached.signature !== signature),
    ].slice(0, ANALYSIS_CACHE_MAX_ENTRIES);
    window.localStorage?.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ version: 2, entries }));
  } catch {
    // Large surface/flux models can hit localStorage quotas. Preserve at least
    // the newest exact analysis when possible; Cloud Storage is still the
    // authoritative shared cache.
    try {
      window.localStorage?.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ version: 2, entries: [entry] }));
    } catch { /* browser cache unavailable */ }
  }
}

export function clearCachedGoogleAnalysis() {
  try { window.localStorage?.removeItem(ANALYSIS_CACHE_KEY); } catch { /* ignored */ }
}

export async function analyzeGoogleSolar(endpoint, requestBody, { force = false } = {}) {
  const session = readGoogleSolarSession();
  if (!session) {
    const error = new Error('Google Solar demo is locked. Enter the access code first.');
    error.status = 401;
    throw error;
  }
  const signature = makeGoogleAnalysisSignature(requestBody);
  if (!force) {
    const cached = readCachedGoogleAnalysis(signature);
    if (cached) return { ...cached, browserCached: true };
  }

  const url = new URL(resolveGoogleSolarEndpoint(endpoint));
  url.searchParams.set('action', 'analyze');
  const analysis = await jsonFetch(url.toString(), {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(requestBody),
  }, 60000);
  cacheGoogleAnalysis(signature, analysis);
  return analysis;
}
