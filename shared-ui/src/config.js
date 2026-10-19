import { TENANT_DOMAIN_ROOTS, tenantDomainContext } from './tenantDomains.js?v=locales-6';

export const LANGUAGE_PROFILES = Object.freeze({
  'en-US': {
    label: 'English (US)',
    nativeName: 'English (US)',
    flag: '🇺🇸',
    searchTerms: 'english united states usa',
    units: 'imperial',
    currency: 'USD',
  },
  'ro-RO': {
    label: 'Romanian',
    nativeName: 'Română',
    flag: '🇷🇴',
    searchTerms: 'română romania romanian',
    units: 'metric',
    currency: 'RON',
  },
  'de-DE': {
    label: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    searchTerms: 'deutsch deutschland german germany',
    units: 'metric',
    currency: 'EUR',
  },
  'es-ES': {
    label: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    searchTerms: 'español espana españa spanish spain',
    units: 'metric',
    currency: 'EUR',
  },
  'fr-FR': {
    label: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    searchTerms: 'français francais france french',
    units: 'metric',
    currency: 'EUR',
  },
  'it-IT': {
    label: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    searchTerms: 'italiano italia italian italy',
    units: 'metric',
    currency: 'EUR',
  },
});

export const LOCALE_HOSTS = Object.freeze({
  'en-US': 'www.360configurator.com',
  'ro-RO': 'www.360configurator.ro',
  'de-DE': 'www.360konfigurator.de',
  'es-ES': 'www.360configurador.es',
  'fr-FR': 'www.360configurateur.fr',
  'it-IT': 'www.360configuratore.it',
});

// The website's "book a demo" page on each domain (website/lib/page-slugs.json;
// scripts/build/sync-website-slugs.mjs --check keeps them equal).
export const WEBSITE_DEMO_PATHS = Object.freeze({ 'en-US': '/book-a-demo', 'ro-RO': '/programeaza-demo', 'de-DE': '/demo-buchen', 'es-ES': '/reservar-demo', 'fr-FR': '/reserver-demo', 'it-IT': '/prenota-demo' });

export const CONFIGURATOR_PUBLIC_PATHS = Object.freeze({
  'en-US': Object.freeze({
    pergola: '/pergola-configurator/',
    roof: '/roof-configurator/',
    window: '/window-configurator/',
    hall: '/hall-configurator/',
    solar: '/solar-configurator/',
    fence: '/fence-configurator/',
    cardbox: '/cardbox-configurator/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/chair-configurator/',
  }),
  'ro-RO': Object.freeze({
    pergola: '/configurator-pergola/',
    roof: '/configurator-acoperis/',
    window: '/configurator-ferestre/',
    hall: '/configurator-hala/',
    solar: '/configurator-solar/',
    fence: '/configurator-garduri/',
    cardbox: '/configurator-cutii-carton/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/configurator-scaune/',
  }),
  'de-DE': Object.freeze({
    pergola: '/pergola-konfigurator/',
    roof: '/dach-konfigurator/',
    window: '/fenster-konfigurator/',
    hall: '/hallen-konfigurator/',
    solar: '/solar-konfigurator/',
    fence: '/zaun-konfigurator/',
    cardbox: '/karton-konfigurator/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/stuhl-konfigurator/',
  }),
  'es-ES': Object.freeze({
    pergola: '/configurador-pergolas/',
    roof: '/configurador-tejados/',
    window: '/configurador-ventanas/',
    hall: '/configurador-naves/',
    solar: '/configurador-solar/',
    fence: '/configurador-vallas/',
    cardbox: '/configurador-cajas-carton/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/configurador-sillas/',
  }),
  'fr-FR': Object.freeze({
    pergola: '/configurateur-pergola/',
    roof: '/configurateur-toiture/',
    window: '/configurateur-fenetres/',
    hall: '/configurateur-hangar/',
    solar: '/configurateur-solaire/',
    fence: '/configurateur-cloture/',
    cardbox: '/configurateur-cartons/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/configurateur-chaises/',
  }),
  'it-IT': Object.freeze({
    pergola: '/configuratore-pergola/',
    roof: '/configuratore-tetto/',
    window: '/configuratore-finestre/',
    hall: '/configuratore-capannone/',
    solar: '/configuratore-fotovoltaico/',
    fence: '/configuratore-recinzioni/',
    cardbox: '/configuratore-scatole/',
    bookshelf: '/bookshelf-configurator/',
    tiles: '/tiles-configurator/',
    chair: '/configuratore-sedie/',
  }),
});

export const UNIT_OPTIONS = Object.freeze([
  { value: 'imperial', label: 'Imperial (ft / in)' },
  { value: 'metric', label: 'Metric (mm)' },
]);

export const CURRENCY_OPTIONS = Object.freeze([
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'RON', label: 'Romanian Leu (RON)' },
  { value: 'EUR', label: 'Euro (EUR)' },
]);

export const QUALITY_OPTIONS = Object.freeze([
  { value: 'low', label: 'Low' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
]);

export const AR_PLATFORM_OPTIONS = Object.freeze([
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
]);

export function getLanguageProfile(locale) {
  return LANGUAGE_PROFILES[locale] ?? LANGUAGE_PROFILES['en-US'];
}

export function getLocaleForHostname(hostname = '') {
  const tenant = tenantDomainContext(hostname);
  if (tenant) return tenant.locale;
  const normalized = String(hostname).toLowerCase().replace(/\.$/, '');
  for (const [locale, host] of Object.entries(LOCALE_HOSTS)) {
    if (normalized === host || normalized === host.replace(/^www\./, '')) return locale;
  }
  return 'en-US';
}

function normalizeProductType(productType = '') {
  const value = String(productType).toLowerCase();
  if (value === 'tiles') return 'tiles';
  if (value.includes('pergola')) return 'pergola';
  if (value.includes('roof')) return 'roof';
  if (value.includes('window')) return 'window';
  if (value.includes('hall')) return 'hall';
  if (value.includes('solar')) return 'solar';
  const has = (...words) => words.some((word) => value.includes(word));
  if (has('fence', 'gard', 'zaun', 'valla', 'clôture', 'cloture', 'recinzion')) return 'fence';
  if (has('cardbox', 'cardboard', 'carton', 'karton', 'caja', 'cartón', 'scatol')) return 'cardbox';
  if (has('bookshelf', 'bibliotec', 'bücherregal', 'buecherregal', 'estanter', 'bibliothèque', 'bibliotheque', 'librer')) return 'bookshelf';
  if (has('chair', 'scaun', 'stuhl', 'silla', 'chaise', 'sedi')) return 'chair';
  return null;
}

export function getLocalizedConfiguratorUrl(locale, productType, location = window.location) {
  const resolvedLocale = LANGUAGE_PROFILES[locale] ? locale : 'en-US';
  const current = typeof location === 'string' ? new URL(location, globalThis.location?.href) : location;
  const tenant = tenantDomainContext(current.hostname);
  const product = normalizeProductType(productType);
  // Public sites and tenant aliases share the same localized route catalogue.
  // Keep the customer slug when changing locale or editing a cart item.
  const paths = CONFIGURATOR_PUBLIC_PATHS[resolvedLocale];
  const path = product ? paths?.[product] : current.pathname;
  if (!path) return null;
  const hostname = tenant
    ? `${tenant.slug}.${TENANT_DOMAIN_ROOTS[resolvedLocale]}`
    : LOCALE_HOSTS[resolvedLocale];
  const url = new URL(`https://${hostname}${path}`);
  url.search = current.search || '';
  url.hash = current.hash || '';
  return url.href;
}
