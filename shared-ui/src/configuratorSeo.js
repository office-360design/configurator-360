import {
  CONFIGURATOR_PUBLIC_PATHS,
  LOCALE_HOSTS,
  getLocaleForHostname,
} from './config.js?v=localized-slugs-1';

const SEO_LOCALES = Object.freeze({
  'en-US': Object.freeze({ lang: 'en', hreflang: 'en', ogLocale: 'en_US' }),
  'ro-RO': Object.freeze({ lang: 'ro', hreflang: 'ro-RO', ogLocale: 'ro_RO' }),
  'de-DE': Object.freeze({ lang: 'de', hreflang: 'de-DE', ogLocale: 'de_DE' }),
  'es-ES': Object.freeze({ lang: 'es', hreflang: 'es-ES', ogLocale: 'es_ES' }),
  'fr-FR': Object.freeze({ lang: 'fr', hreflang: 'fr-FR', ogLocale: 'fr_FR' }),
  'it-IT': Object.freeze({ lang: 'it', hreflang: 'it-IT', ogLocale: 'it_IT' }),
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
    'es-ES': Object.freeze({
      title: 'Configurador de ventanas 3D | 360Configurator',
      description: 'Configure ventanas online en 3D. Ajuste dimensiones, distribución, perfiles y tipos de apertura en un configurador de ventanas interactivo.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de fenêtres 3D | 360Configurator',
      description: 'Configurez vos fenêtres en ligne en 3D. Ajustez dimensions, partitions, profilés et types d’ouverture dans un configurateur de fenêtres interactif.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di finestre 3D | 360Configurator',
      description: 'Configuri finestre online in 3D. Regoli dimensioni, suddivisione, profili e tipi di apertura in un configuratore di finestre interattivo.',
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
    'es-ES': Object.freeze({
      title: 'Configurador de pérgolas 3D | 360Configurator',
      description: 'Configure una pérgola online en 3D. Ajuste dimensiones, lamas, cerramientos laterales, iluminación y accesorios en tiempo real.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de pergola 3D | 360Configurator',
      description: 'Configurez une pergola en ligne en 3D. Ajustez dimensions, lames orientables, fermetures latérales, éclairage et accessoires en temps réel.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di pergole 3D | 360Configurator',
      description: 'Configuri una pergola online in 3D. Regoli dimensioni, lamelle, chiusure laterali, illuminazione e accessori in tempo reale.',
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
    'es-ES': Object.freeze({
      title: 'Configurador de tejados 3D | 360Configurator',
      description: 'Configure un tejado online en 3D. Compare tipos de cubierta, dimensiones y opciones constructivas con visualización paramétrica en tiempo real.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de toiture 3D | 360Configurator',
      description: 'Configurez une toiture en ligne en 3D. Comparez formes de toit, dimensions et options de construction avec une visualisation paramétrique en temps réel.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di tetti 3D | 360Configurator',
      description: 'Configuri un tetto online in 3D. Confronti tipologie di copertura, dimensioni e opzioni costruttive con visualizzazione parametrica in tempo reale.',
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
    'es-ES': Object.freeze({
      title: 'Configurador de naves industriales 3D | 360Configurator',
      description: 'Configure una nave industrial o un almacén online en 3D. Ajuste dimensiones, estructura, cerramientos, huecos y opciones del edificio de forma interactiva.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de hangar industriel 3D | 360Configurator',
      description: 'Configurez un hangar industriel ou un entrepôt en ligne en 3D. Ajustez dimensions, structure, bardage, ouvertures et options du bâtiment.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di capannoni industriali 3D | 360Configurator',
      description: 'Configuri un capannone industriale o un magazzino online in 3D. Regoli dimensioni, struttura, tamponamenti, aperture e opzioni dell’edificio.',
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
    'es-ES': Object.freeze({
      title: 'Configurador solar 3D | 360Configurator',
      description: 'Configure una instalación fotovoltaica residencial online en 3D. Explore la geometría del tejado, la disposición de paneles y la simulación energética.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur solaire 3D | 360Configurator',
      description: 'Configurez une installation photovoltaïque résidentielle en ligne en 3D. Explorez la géométrie du toit, le calepinage des panneaux et la simulation énergétique.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore fotovoltaico 3D | 360Configurator',
      description: 'Configuri un impianto fotovoltaico residenziale online in 3D. Esplori la geometria del tetto, la disposizione dei pannelli e la simulazione energetica.',
    }),
  }),
  fence: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Fence Configurator | 360Configurator',
      description: 'Configure a modular fence online in 3D. Adjust layout, dimensions, panels, finishes, gates and installation options in real time.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Gard 3D | 360Configurator',
      description: 'Configurează un gard modular online în 3D. Modifică forma, dimensiunile, panourile, finisajele, porțile și opțiunile de montaj în timp real.',
    }),
    'de-DE': Object.freeze({
      title: '3D Zaun-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie einen modularen Zaun online in 3D. Passen Sie Verlauf, Maße, Felder, Oberflächen, Tore und Montageoptionen in Echtzeit an.',
    }),
    'es-ES': Object.freeze({
      title: 'Configurador de vallas 3D | 360Configurator',
      description: 'Configure una valla modular online en 3D. Ajuste trazado, dimensiones, paneles, acabados, puertas y opciones de instalación en tiempo real.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de clôture 3D | 360Configurator',
      description: 'Configurez une clôture modulaire en ligne en 3D. Ajustez tracé, dimensions, panneaux, finitions, portails et options de pose en temps réel.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di recinzioni 3D | 360Configurator',
      description: 'Configuri una recinzione modulare online in 3D. Regoli tracciato, dimensioni, pannelli, finiture, cancelli e opzioni di posa in tempo reale.',
    }),
  }),
  chair: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Chair Material Configurator | 360Configurator',
      description: 'Explore a wooden upholstered chair in 3D with selectable wood species, fabric weaves and independent colors.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Scaun 3D | 360Configurator',
      description: 'Explorează un scaun tapițat din lemn în 3D cu esențe de lemn, tipuri de țesături și culori configurabile independent.',
    }),
    'de-DE': Object.freeze({
      title: '3D Stuhl-Materialkonfigurator | 360Configurator',
      description: 'Entdecken Sie einen gepolsterten Holzstuhl in 3D mit wählbaren Holzarten, Stoffgeweben und unabhängig konfigurierbaren Farben.',
    }),
    'es-ES': Object.freeze({
      title: 'Configurador de materiales de sillas 3D | 360Configurator',
      description: 'Descubra en 3D una silla tapizada de madera con especies de madera seleccionables, tipos de tejido y colores configurables de forma independiente.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de matériaux de chaise 3D | 360Configurator',
      description: 'Découvrez en 3D une chaise rembourrée en bois avec essences de bois, armures de tissu et couleurs configurables indépendamment.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di materiali per sedie 3D | 360Configurator',
      description: 'Scopra in 3D una sedia imbottita in legno con essenze di legno, armature del tessuto e colori selezionabili in modo indipendente.',
    }),
  }),
  cardbox: Object.freeze({
    'en-US': Object.freeze({
      title: '3D Cardboard Box Configurator | 360Configurator',
      description: 'Configure a cardboard box online in 3D with rectangular, L-shaped, U-shaped and stepped 90-degree footprints, wall-by-wall board grades, colours and printing.',
    }),
    'ro-RO': Object.freeze({
      title: 'Configurator Cutii din Carton 3D | 360Configurator',
      description: 'Configurează online în 3D o cutie din carton cu forme dreptunghiulare, L, U și contururi în trepte la 90°, plus carton, culori și imprimare pentru fiecare latură.',
    }),
    'de-DE': Object.freeze({
      title: '3D Kartonbox-Konfigurator | 360Configurator',
      description: 'Konfigurieren Sie eine Kartonbox online in 3D mit rechteckigen, L-förmigen, U-förmigen und gestuften 90°-Grundrissen sowie Material, Farbe und Druck je Seite.',
    }),
    'es-ES': Object.freeze({
      title: 'Configurador de cajas de cartón 3D | 360Configurator',
      description: 'Configure una caja de cartón online en 3D con plantas rectangulares, en L, en U y escalonadas a 90°, y elija cartón, colores e impresión para cada pared.',
    }),
    'fr-FR': Object.freeze({
      title: 'Configurateur de cartons 3D | 360Configurator',
      description: 'Configurez un carton en ligne en 3D avec des formes rectangulaires, en L, en U ou à redans à 90°, et choisissez carton, couleurs et impression pour chaque face.',
    }),
    'it-IT': Object.freeze({
      title: 'Configuratore di scatole di cartone 3D | 360Configurator',
      description: 'Configuri online in 3D una scatola di cartone con pianta rettangolare, a L, a U o a gradini a 90°, scegliendo cartone, colori e stampa per ogni lato.',
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
  fence: 'fence',
  fencing: 'fence',
  gard: 'fence',
  zaun: 'fence',
  cardbox: 'cardbox',
  cardboard: 'cardbox',
  carton: 'cardbox',
  karton: 'cardbox',
  chair: 'chair',
  scaun: 'chair',
  stuhl: 'chair',
  ventana: 'window',
  fenetre: 'window',
  finestra: 'window',
  tejado: 'roof',
  toiture: 'roof',
  tetto: 'roof',
  nave: 'hall',
  hangar: 'hall',
  capannone: 'hall',
  valla: 'fence',
  cloture: 'fence',
  recinzione: 'fence',
  caja: 'cardbox',
  scatola: 'cardbox',
  silla: 'chair',
  chaise: 'chair',
  sedia: 'chair',
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
