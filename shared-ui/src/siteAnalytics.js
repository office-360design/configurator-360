// Google Analytics on the configurators, with the same property and rules as the
// marketing website (website/lib/website-analytics.js):
//  - only on the six public domains, never on customer (tenant) hosts or previews;
//  - nothing loads until the visitor allows it (Consent Mode, everything denied by
//    default); the choice is shared with the website on the same domain;
//  - internal visits (?360_test=1) are excluded;
//  - only enumerated events with the product id: no personal data, form values,
//    configuration data or arbitrary URLs.
import { sharedT } from './i18n.js?v=locales-6';

export const GA_ID = 'G-2E433G5VM7';
export const CONSENT_KEY = '360-analytics-consent-v1';
// Domains with their own GA4 property also report there; the common property
// (GA_ID) keeps the total of all domains. Keep equal in website/lib/website-analytics.js
// and shared-ui/src/siteAnalytics.js (tested).
export const DOMAIN_GA_IDS = { 'www.360configurador.es': 'G-HKK13MR72P' };
/** Every GA4 property a page on this host reports to. */
export const measurementIds = (hostname) => [GA_ID, DOMAIN_GA_IDS[String(hostname || '').toLowerCase()]].filter(Boolean);
export const INTERNAL_KEY = '360-internal-test';
export const PUBLIC_DOMAINS = ['www.360configurator.com', 'www.360configurator.ro', 'www.360konfigurator.de', 'www.360configurador.es', 'www.360configurateur.fr', 'www.360configuratore.it'];
const DOMAIN_LANGUAGES = {
  'www.360configurator.com': 'en', 'www.360configurator.ro': 'ro', 'www.360konfigurator.de': 'de',
  'www.360configurador.es': 'es', 'www.360configurateur.fr': 'fr', 'www.360configuratore.it': 'it',
};
export const ANALYTICS_PRODUCTS = new Set(['window', 'pergola', 'roof', 'hall', 'solar', 'fence', 'chair', 'cardbox', 'bookshelf', 'tiles', 'curtainwall', 'cages', 'gas']);
export const CONFIGURATOR_EVENTS = new Set(['configurator_view', 'configuration_created', 'add_to_cart', 'share_configuration', 'view_ar', 'quotation_request', 'demo_request_open', 'login']);

let sessionChoice = null;
let initialized = false;
let context = { productId: '', locale: 'en-US' };
const sent = new Set();

const storage = () => { try { return window.localStorage; } catch { return null; } };

export function readChoice(store = storage()) {
  if (sessionChoice) return sessionChoice;
  try { const value = store?.getItem(CONSENT_KEY); return value === 'granted' || value === 'denied' ? value : null; } catch { return null; }
}

function setChoice(value) {
  sessionChoice = value;
  try { storage()?.setItem(CONSENT_KEY, value); } catch { /* the in-memory choice applies for this visit */ }
}

/** Analytics may run here: a public domain and not an internal test visit. */
export function analyticsAllowed(location = window.location, store = storage()) {
  if (!PUBLIC_DOMAINS.includes(String(location.hostname).toLowerCase())) return false;
  const flag = new URLSearchParams(location.search).get('360_test');
  try {
    if (flag === '1') store?.setItem(INTERNAL_KEY, '1');
    if (flag === '0') store?.removeItem(INTERNAL_KEY);
    return store?.getItem(INTERNAL_KEY) !== '1';
  } catch { return flag !== '1'; }
}

function initialize() {
  if (readChoice() !== 'granted' || !analyticsAllowed()) return;
  const ids = measurementIds(window.location.hostname);
  ids.forEach((id) => { window[`ga-disable-${id}`] = false; });
  if (initialized) {
    window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
  } else {
    initialized = true;
    window.dataLayer = window.dataLayer || [];
    // Google's command queue uses Arguments objects.
    window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
    window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('set', 'linker', { domains: PUBLIC_DOMAINS });
    window.gtag('js', new Date());
    // page_view comes from Enhanced Measurement, as on the website.
    for (const id of ids) window.gtag('config', id, { language: DOMAIN_LANGUAGES[window.location.hostname.toLowerCase()] || 'en', hostname: window.location.hostname, page_type: 'configurator', allow_google_signals: false });
    const script = document.createElement('script');
    script.id = 'google-analytics';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
  }
  trackConfiguratorEvent('configurator_view', { once: true });
}

function withdraw() {
  const ids = measurementIds(window.location.hostname);
  ids.forEach((id) => { window[`ga-disable-${id}`] = true; });
  if (!initialized) return;
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  const baseDomain = window.location.hostname.replace(/^www\./, '');
  for (const name of ['_ga', ...ids.map((id) => `_ga_${id.slice(2)}`)]) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${baseDomain}`;
  }
}

/** Sends one enumerated configurator event (product id only) after consent. */
export function trackConfiguratorEvent(name, { once = false } = {}) {
  if (typeof window === 'undefined' || !CONFIGURATOR_EVENTS.has(name) || !ANALYTICS_PRODUCTS.has(context.productId)) return false;
  if (readChoice() !== 'granted' || !analyticsAllowed() || !window.gtag) return false;
  const key = `${name}:${context.productId}`;
  if (once && sent.has(key)) return false;
  try {
    window.gtag('event', name, { product: context.productId, page_type: 'configurator', language: DOMAIN_LANGUAGES[window.location.hostname.toLowerCase()] || 'en' });
    sent.add(key);
    return true;
  } catch { return false; }
}

// ── Consent banner (same wording as the website's) ───────────────────────────
const STYLE = `
.site-analytics-consent{position:fixed;z-index:2147483000;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(380px,calc(100vw - 24px));box-sizing:border-box;padding:14px 16px;border:1px solid rgba(20,36,59,.14);border-radius:14px;background:#fff;color:#18212b;box-shadow:0 14px 40px rgba(20,36,59,.18);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.site-analytics-consent h2{margin:0 0 6px;font-size:14px;font-weight:700}
.site-analytics-consent p{margin:0 0 12px;color:#41505f}
.site-analytics-consent div{display:flex;gap:8px;justify-content:flex-end}
.site-analytics-consent button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(20,36,59,.22);background:#fff;color:#18212b;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
.site-analytics-consent button[data-consent="granted"]{border-color:#0878c9;background:#0878c9;color:#fff}
body.dark .site-analytics-consent{background:#1e262d;color:#eef2f5;border-color:rgba(255,255,255,.14)}
body.dark .site-analytics-consent p{color:#c3ccd4}
body.dark .site-analytics-consent button:not([data-consent="granted"]){background:transparent;color:#eef2f5;border-color:rgba(255,255,255,.3)}
@media (max-width:760px){.site-analytics-consent{left:8px;right:8px;width:auto;padding:12px 14px;font-size:12.5px}.site-analytics-consent p{margin-bottom:10px}}`;

let banner = null;

function renderBanner() {
  if (!banner) return;
  const t = (key) => sharedT(context.locale, key);
  banner.innerHTML = `<h2 id="site-analytics-title"></h2><p></p><div><button type="button" data-consent="denied"></button><button type="button" data-consent="granted"></button></div>`;
  banner.querySelector('h2').textContent = t('analytics.title');
  banner.querySelector('p').textContent = t('analytics.body');
  banner.querySelector('[data-consent="denied"]').textContent = t('analytics.reject');
  banner.querySelector('[data-consent="granted"]').textContent = t('analytics.accept');
}

/** Shows the consent banner (also used by Settings › Cookies › Manage). */
export function openAnalyticsPreferences() {
  if (typeof document === 'undefined' || !PUBLIC_DOMAINS.includes(window.location.hostname.toLowerCase())) return false;
  if (!document.getElementById('site-analytics-style')) {
    const style = document.createElement('style');
    style.id = 'site-analytics-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  if (!banner) {
    banner = document.createElement('section');
    banner.className = 'site-analytics-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'site-analytics-title');
    banner.addEventListener('click', (event) => {
      const value = event.target.closest('[data-consent]')?.dataset.consent;
      if (!value) return;
      setChoice(value);
      if (value === 'granted') initialize(); else withdraw();
      banner.remove();
      banner = null;
    });
  }
  renderBanner();
  document.body.appendChild(banner);
  return true;
}

/** Starts analytics for a configurator: on a public domain, after consent. */
export function startSiteAnalytics({ productId, locale } = {}) {
  context = { productId: String(productId || ''), locale: locale || 'en-US' };
  if (typeof window === 'undefined' || !analyticsAllowed()) return;
  const choice = readChoice();
  if (choice === 'granted') initialize();
  else if (!choice) openAnalyticsPreferences();
}

/** Keeps an open banner in the configurator's current language. */
export function setSiteAnalyticsLocale(locale) {
  context.locale = locale || context.locale;
  renderBanner();
}
