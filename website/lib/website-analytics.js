// Marketing website only. Never import this module into the full applications.
export const GA_ID = 'G-2E433G5VM7';
export const CONSENT_KEY = '360-analytics-consent-v1';
export const INTERNAL_KEY = '360-internal-test';
// The configurators page segment on every domain (lib/page-slugs.json; kept equal by tests/website-analytics.test.mjs).
export const PRODUCT_PAGE_SEGMENTS = ['configurators', 'configuratoare', 'konfiguratoren', 'configuradores', 'configurateurs', 'configuratori'];
const PRODUCT_PAGE_PATTERN = new RegExp(`/(?:${PRODUCT_PAGE_SEGMENTS.join('|')})/`);
/** True on a configurator product page, whatever the domain language. */
export const isProductPagePath = (pathname) => PRODUCT_PAGE_PATTERN.test(String(pathname || ''));
export const PUBLIC_DOMAINS = ['www.360configurator.com', 'www.360configurator.ro', 'www.360konfigurator.de', 'www.360configurador.es', 'www.360configurateur.fr', 'www.360configuratore.it'];
// Public host → website language. Every host in PUBLIC_DOMAINS has an entry.
const DOMAIN_LANGUAGES = {
  'www.360configurator.com': 'en',
  'www.360configurator.ro': 'ro',
  'www.360konfigurator.de': 'de',
  'www.360configurador.es': 'es',
  'www.360configurateur.fr': 'fr',
  'www.360configuratore.it': 'it',
};
const SUFFIX_LANGUAGES = { '.ro': 'ro', '.de': 'de', '.es': 'es', '.fr': 'fr', '.it': 'it' };
const PRODUCTS = new Set(['pergola','roof','window','hall','solar','fence','chair','cardbox','bookshelf','tiles']);
const EVENTS = new Set(['lite_preview_view','lite_preview_engaged','lite_preview_error','full_configurator_open','contact_intent','demo_request_open','lead_form_start','form_error','generate_lead']);
const seen = new Set();
let sessionChoice = null;

export function readChoice(storage) {
  if (sessionChoice) return sessionChoice;
  try { const value = storage.getItem(CONSENT_KEY); return value === 'granted' || value === 'denied' ? value : null; } catch { return null; }
}

export function setChoice(value) {
  if (value !== 'granted' && value !== 'denied') return false;
  sessionChoice = value;
  try { browserStorage().setItem(CONSENT_KEY, value); return true; } catch { return false; }
}

export function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

export function isInternalVisit(location, storage) {
  const flag = new URLSearchParams(location.search).get('360_test');
  try {
    if (flag === '1') storage.setItem(INTERNAL_KEY, '1');
    if (flag === '0') storage.removeItem(INTERNAL_KEY);
    return storage.getItem(INTERNAL_KEY) === '1' || !PUBLIC_DOMAINS.includes(location.hostname);
  } catch { return flag === '1' || !PUBLIC_DOMAINS.includes(location.hostname); }
}

export function analyticsContext(location) {
  const host = location.hostname.toLowerCase();
  const suffix = Object.keys(SUFFIX_LANGUAGES).find((ending) => host.endsWith(ending));
  return { language: DOMAIN_LANGUAGES[host] ?? (suffix ? SUFFIX_LANGUAGES[suffix] : 'en'), hostname: location.hostname };
}

export function trackWebsiteEvent(name, parameters = {}, once = false) {
  if (typeof window === 'undefined' || !EVENTS.has(name)) return false;
  if (readChoice(browserStorage()) !== 'granted' || isInternalVisit(window.location, browserStorage()) || !window.gtag) return false;
  if ((name.startsWith('lite_preview_') || name === 'full_configurator_open') && !PRODUCTS.has(parameters.product)) return false;
  // Only enumerated context, never form values, addresses, configuration data or arbitrary URLs.
  const safe = analyticsContext(window.location);
  if (PRODUCTS.has(parameters.product)) safe.product = parameters.product;
  if (['marketing_contact','demo_request'].includes(parameters.form_id)) safe.form_id = parameters.form_id;
  if (['email','phone','contact_page','callback'].includes(parameters.method)) safe.method = parameters.method;
  if (['network_or_service','rate_limited','preview_unavailable'].includes(parameters.error_code)) safe.error_code = parameters.error_code;
  if (['homepage','product_page','other'].includes(parameters.placement)) safe.placement = parameters.placement;
  const key = `${window.location.pathname}:${name}:${safe.product || ''}:${safe.form_id || ''}`;
  if (once && seen.has(key)) return false;
  try { window.gtag('event', name, safe); if (once) seen.add(key); return true; } catch { return false; }
}

export function previewEvent(name, product) {
  if (typeof window === 'undefined' || !PRODUCTS.has(product)) return false;
  return trackWebsiteEvent(name, {product, placement: isProductPagePath(window.location.pathname) ? 'product_page' : 'homepage', ...(name === 'lite_preview_error' ? {error_code:'preview_unavailable'} : {})}, true);
}

// Only an exact known product may accompany a form event. Free-text interests,
// messages and personal fields never enter Analytics.
export function websiteProduct(value) {
  return PRODUCTS.has(value) ? value : undefined;
}
