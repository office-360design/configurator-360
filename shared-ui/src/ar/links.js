export const AR_PRODUCTS = Object.freeze(['hall', 'window', 'pergola', 'fence', 'tiles', 'chair', 'cardbox', 'bookshelf', 'roof', 'solar']);
export function requireProduct(value = 'hall') { if (!AR_PRODUCTS.includes(value)) throw new Error('Invalid AR product.'); return value; }
export const AR_FUNCTION_BASE = 'https://europe-west1-configurator-360.cloudfunctions.net';
export const AR_SESSION_ID = /^[A-Za-z0-9_-]{32}$/;
export const AR_MODES = Object.freeze({ android: 'glb', ios: 'usdz' });
export function normalizeMode(value) { return value === 'ios' ? 'ios' : 'android'; }
export function arModelUrl(id, format, product = 'hall') {
  if (!AR_SESSION_ID.test(id) || !Object.values(AR_MODES).includes(format)) throw new Error('Invalid AR session.');
  return `${AR_FUNCTION_BASE}/getHallAR/${requireProduct(product)}.${format}?id=${encodeURIComponent(id)}&asset=1`;
}
export function arManifestUrl(id) {
  if (!AR_SESSION_ID.test(id)) throw new Error('Invalid AR session.');
  return `${AR_FUNCTION_BASE}/getHallAR?id=${encodeURIComponent(id)}`;
}
export function arPhoneUrl(id, mode, locale, origin = window.location.origin, product = 'hall') {
  if (!AR_SESSION_ID.test(id)) throw new Error('Invalid AR session.');
  requireProduct(product);
  const host = new URL(origin).hostname.toLowerCase();
  const countries = {
    '360configurator.ro': 'ro',
    '360konfigurator.de': 'de',
    '360configurador.es': 'es',
    '360configurateur.fr': 'fr',
    '360configuratore.it': 'it',
  };
  const country = countries[host.replace(/^www\./, '')] || 'en';
  const paths = {
    solar: { en: '/solar-configurator/', ro: '/configurator-solar/', de: '/solar-konfigurator/', es: '/configurador-solar/', fr: '/configurateur-solaire/', it: '/configuratore-fotovoltaico/' },
    roof: { en: '/roof-configurator/', ro: '/configurator-acoperis/', de: '/dach-konfigurator/', es: '/configurador-tejados/', fr: '/configurateur-toiture/', it: '/configuratore-tetto/' },
    bookshelf: { en: '/bookshelf-configurator/', ro: '/bookshelf-configurator/', de: '/bookshelf-configurator/', es: '/bookshelf-configurator/', fr: '/bookshelf-configurator/', it: '/bookshelf-configurator/' },
    cardbox: { en: '/cardbox-configurator/', ro: '/configurator-cutii-carton/', de: '/karton-konfigurator/', es: '/configurador-cajas-carton/', fr: '/configurateur-cartons/', it: '/configuratore-scatole/' },
    chair: { en: '/chair-configurator/', ro: '/configurator-scaune/', de: '/stuhl-konfigurator/', es: '/configurador-sillas/', fr: '/configurateur-chaises/', it: '/configuratore-sedie/' },
    tiles: { en: '/tiles-configurator/', ro: '/tiles-configurator/', de: '/tiles-configurator/', es: '/tiles-configurator/', fr: '/tiles-configurator/', it: '/tiles-configurator/' },
    hall: { en: '/hall-configurator/', ro: '/configurator-hala/', de: '/hallen-konfigurator/', es: '/configurador-naves/', fr: '/configurateur-hangar/', it: '/configuratore-capannone/' },
    window: { en: '/window-configurator/', ro: '/configurator-ferestre/', de: '/fenster-konfigurator/', es: '/configurador-ventanas/', fr: '/configurateur-fenetres/', it: '/configuratore-finestre/' },
    fence: { en: '/fence-configurator/', ro: '/configurator-garduri/', de: '/zaun-konfigurator/', es: '/configurador-vallas/', fr: '/configurateur-cloture/', it: '/configuratore-recinzioni/' },
    pergola: { en: '/pergola-configurator/', ro: '/configurator-pergola/', de: '/pergola-konfigurator/', es: '/configurador-pergolas/', fr: '/configurateur-pergola/', it: '/configuratore-pergola/' },
  };
  const url = new URL(`${paths[product][country]}ar.html`, origin);
  url.searchParams.set('id', id); url.searchParams.set('mode', normalizeMode(mode));
  url.searchParams.set('lang', ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT'].includes(locale) ? locale : 'en-US');
  return url.href;
}
export function sceneViewerIntent(modelUrl, fallbackUrl, title = 'Configured hall') {
  const query = new URLSearchParams({ file: modelUrl, mode: 'ar_preferred', title, resizable: 'true' });
  return `intent://arvr.google.com/scene-viewer/1.0?${query}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end;`;
}
