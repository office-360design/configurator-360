/** Deployment settings. Never put credentials in this public browser module.
 * On localhost use the local Python service. Hosted deployments use a same-origin
 * reverse proxy at /api/paving unless apiBase is explicitly configured below.
 */
export const SEGMENTATION_CONFIG = Object.freeze({
  enabled: true,
  apiBase: '', // e.g. 'https://analysis.example.com/api/paving'; set server CORS too.
  pollIntervalMs: 900,
  requestTimeoutMs: 45000,
  analysisTimeoutMs: 20 * 60 * 1000, // Covers first-run downloads and CPU inference.
  targets: ['grass', 'dirt'],
  tolerancePx: 0.75,
});

export function resolveAnalysisBase(config = SEGMENTATION_CONFIG, location = globalThis.location) {
  const origin = location?.origin || 'http://localhost';
  const host = location?.hostname;
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  const raw = config.apiBase || (local && location?.protocol === 'http:'
    ? `http://${host === '::1' ? '[::1]' : host}:8000/api/paving` : '/api/paving');
  const url = new URL(raw, origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('The analysis API must be an HTTP(S) URL without credentials, query or fragment.');
  if (location?.protocol === 'https:' && url.protocol !== 'https:')
    throw new Error('An HTTPS website requires an HTTPS analysis service or same-origin proxy.');
  return url.href.replace(/\/$/, '');
}
