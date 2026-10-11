export const AR_FUNCTION_BASE = 'https://europe-west1-configurator-360.cloudfunctions.net';
export const AR_SESSION_ID = /^[A-Za-z0-9_-]{32}$/;
export const AR_MODES = Object.freeze({ android: 'glb', ios: 'usdz' });
export function normalizeMode(value) { return value === 'ios' ? 'ios' : 'android'; }
export function arModelUrl(id, format) {
  if (!AR_SESSION_ID.test(id) || !Object.values(AR_MODES).includes(format)) throw new Error('Invalid AR session.');
  return `${AR_FUNCTION_BASE}/getHallAR/hall.${format}?id=${encodeURIComponent(id)}&asset=1`;
}
export function arManifestUrl(id) {
  if (!AR_SESSION_ID.test(id)) throw new Error('Invalid AR session.');
  return `${AR_FUNCTION_BASE}/getHallAR?id=${encodeURIComponent(id)}`;
}
export function arPhoneUrl(id, mode, locale, origin = window.location.origin) {
  if (!AR_SESSION_ID.test(id)) throw new Error('Invalid AR session.');
  // Public country domains redirect English configurator routes to their
  // localized index. Use the actual localized AR page so id/mode aren't lost.
  // Tenant hosts keep the neutral /hall-configurator/ route.
  const host = new URL(origin).hostname.toLowerCase();
  const root = ['360configurator.ro', 'www.360configurator.ro'].includes(host)
    ? '/configurator-hala/' : ['360konfigurator.de', 'www.360konfigurator.de'].includes(host)
      ? '/hallen-konfigurator/' : '/hall-configurator/';
  const url = new URL(`${root}ar.html`, origin);
  url.searchParams.set('id', id); url.searchParams.set('mode', normalizeMode(mode));
  url.searchParams.set('lang', ['en-US','ro-RO','de-DE'].includes(locale) ? locale : 'en-US');
  return url.href;
}
export function sceneViewerIntent(modelUrl, fallbackUrl) {
  const query = new URLSearchParams({ file: modelUrl, mode: 'ar_preferred', title: 'Configured hall', resizable: 'true' });
  return `intent://arvr.google.com/scene-viewer/1.0?${query}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end;`;
}
