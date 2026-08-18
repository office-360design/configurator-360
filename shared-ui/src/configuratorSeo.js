import {
  CONFIGURATOR_PUBLIC_PATHS,
  LOCALE_HOSTS,
  getLocaleForHostname,
} from './config.js';

const SEO_LOCALES = Object.freeze({
  'en-US': Object.freeze({ lang: 'en', hreflang: 'en', ogLocale: 'en_US' }),
  'ro-RO': Object.freeze({ lang: 'ro', hreflang: 'ro-RO', ogLocale: 'ro_RO' }),
  'de-DE': Object.freeze({ lang: 'de', hreflang: 'de-DE', ogLocale: 'de_DE' }),
});

const CONFIGURATOR_SEO_COPY = Object.freeze({
  window: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Window Configurator | 360Configurator',
      description: 'Configure windows online in 3D. Adjust dimensions, layout, profiles and opening types in an interactive window configurator.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Ferestre 3D | 360Configurator',
      description: 'Configurează ferestre online în 3D. Modifică dimensiunile, compartimentarea, profilele și tipurile de deschidere în timp real.',
    }),
    'de-DE': Object.freeze({
      title: '3D Fenster-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie Fenster online in 3D. Passen Sie Maße, Aufteilung, Profile und Öffnungsarten interaktiv an.',
    }),
  }),
  pergola: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Pergola Configurator | 360Configurator',
      description: 'Configure a pergola online in 3D. Adjust dimensions, louvers, side closures, lighting and accessories in real time.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Pergolă 3D | 360Configurator',
      description: 'Configurează o pergolă online în 3D. Modifică dimensiunile, lamelele, închiderile laterale, iluminatul și accesoriile în timp real.',
    }),
    'de-DE': Object.freeze({
      title: '3D Pergola-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie Ihre Pergola online in 3D. Passen Sie Maße, Lamellen, Seitenabschlüsse, Beleuchtung und Zubehör in Echtzeit an.',
    }),
  }),
  roof: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Roof Configurator | 360Configurator',
      description: 'Configure a roof online in 3D. Compare roof types, dimensions and construction options with real-time parametric visualization.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Acoperiș 3D | 360Configurator',
      description: 'Configurează un acoperiș online în 3D. Alege tipul, dimensiunile și opțiunile constructive cu vizualizare parametrică în timp real.',
    }),
    'de-DE': Object.freeze({
      title: '3D Dach-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie ein Dach online in 3D. Wählen Sie Dachform, Maße und Konstruktionsoptionen mit parametrischer Echtzeitansicht.',
    }),
  }),
  hall: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Industrial Hall Configurator | 360Configurator',
      description: 'Configure an industrial hall or warehouse online in 3D. Adjust dimensions, structure, cladding, openings and building options interactively.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Hală Industrială 3D | 360Configurator',
      description: 'Configurează o hală industrială sau un depozit online în 3D. Modifică dimensiunile, structura, închiderile și golurile în timp real.',
    }),
    'de-DE': Object.freeze({
      title: '3D Hallen-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie eine Industriehalle oder Lagerhalle online in 3D. Passen Sie Maße, Tragwerk, Verkleidung und Öffnungen interaktiv an.',
    }),
  }),
  solar: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Solar Configurator | 360Configurator',
      description: 'Configure a residential solar system online in 3D. Explore roof geometry, panel layouts and energy simulation in real time.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Solar 3D | 360Configurator',
      description: 'Configurează un sistem fotovoltaic rezidențial online în 3D. Explorează geometria acoperișului, amplasarea panourilor și simularea energiei.',
    }),
    'de-DE': Object.freeze({
      title: '3D Solar-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie eine Photovoltaikanlage online in 3D. Prüfen Sie Dachgeometrie, Modulbelegung und Energiesimulation in Echtzeit.',
    }),
  }),
});

const PRODUCT_ALIASES = Object.freeze({
  windows: 'window',
  window: 'window',
  pergola: 'pergola',
  roof: 'roof',
  roofing: 'roof',
  hall: 'hall',
  warehouse: 'hall',
  solar: 'solar',
  pv: 'solar',
});

function normalizeProduct(product) {
  const normalized = String(product || '').trim().toLowerCase();
  return PRODUCT_ALIASES[normalized] || null;
}

export function getConfiguratorSeo(product, hostname = '') {
  const productKey = normalizeProduct(product);
  if (!productKey) return null;

  const locale = getLocaleForHostname(hostname);
  const localeMeta = SEO_LOCALES[locale] || SEO_LOCALES['en-US'];
  const copy = CONFIGURATOR_SEO_COPY[productKey]?.[locale] || CONFIGURATOR_SEO_COPY[productKey]?.['en-US'];
  const path = CONFIGURATOR_PUBLIC_PATHS[locale]?.[productKey] || CONFIGURATOR_PUBLIC_PATHS['en-US'][productKey];
  const canonical = `https://${LOCALE_HOSTS[locale]}${path}`;

  return Object.freeze({
    product: productKey,
    locale,
    ...localeMeta,
    ...copy,
    canonical,
    alternates: Object.freeze(
      Object.entries(SEO_LOCALES).map(([alternateLocale, meta]) => ({
        locale: alternateLocale,
        hreflang: meta.hreflang,
        href: `https://${LOCALE_HOSTS[alternateLocale]}${CONFIGURATOR_PUBLIC_PATHS[alternateLocale][productKey]}`,
      })),
    ),
    xDefault: `https://${LOCALE_HOSTS['en-US']}${CONFIGURATOR_PUBLIC_PATHS['en-US'][productKey]}`,
  });
}

function ensureMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.append(element);
  }
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function ensureLink(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('link');
    document.head.append(element);
  }
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

export function applyConfiguratorSeo(product, { hostname } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  const seo = getConfiguratorSeo(product, hostname || window.location.hostname);
  if (!seo) return null;

  document.documentElement.lang = seo.lang;
  document.title = seo.title;

  ensureMeta('meta[name="description"]', { name: 'description', content: seo.description });
  ensureMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow' });
  ensureMeta('meta[name="googlebot"]', { name: 'googlebot', content: 'index, follow' });

  ensureMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  ensureMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title });
  ensureMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description });
  ensureMeta('meta[property="og:url"]', { property: 'og:url', content: seo.canonical });
  ensureMeta('meta[property="og:locale"]', { property: 'og:locale', content: seo.ogLocale });

  ensureLink('link[rel="canonical"]', { rel: 'canonical', href: seo.canonical });

  for (const alternate of seo.alternates) {
    ensureLink(`link[rel="alternate"][hreflang="${alternate.hreflang}"]`, {
      rel: 'alternate',
      hreflang: alternate.hreflang,
      href: alternate.href,
    });
  }
  ensureLink('link[rel="alternate"][hreflang="x-default"]', {
    rel: 'alternate',
    hreflang: 'x-default',
    href: seo.xDefault,
  });

  return seo;
}
