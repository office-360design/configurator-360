export const locales = ["en", "ro", "de", "es", "fr", "it"] as const;
export type Locale = (typeof locales)[number];

export type LocalizedLocale = Exclude<Locale, "en">;
export const localizedLocales = locales.filter((locale): locale is LocalizedLocale => locale !== "en");

export function localeStaticParams() {
  return localizedLocales.map((locale) => ({ locale }));
}

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const localeOrigins: Record<Locale, string> = {
  en: "https://www.360configurator.com",
  ro: "https://www.360configurator.ro",
  de: "https://www.360konfigurator.de",
  es: "https://www.360configurador.es",
  fr: "https://www.360configurateur.fr",
  it: "https://www.360configuratore.it",
};

export const localeLanguageTags: Record<Locale, string> = {
  en: "en-US",
  ro: "ro-RO",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
};

export const localeNativeNames: Record<Locale, string> = {
  en: "English",
  ro: "Română",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

export const configuratorPublicPaths = {
  en: {
    pergola: "/pergola-configurator/",
    roof: "/roof-configurator/",
    window: "/window-configurator/",
    hall: "/hall-configurator/",
    solar: "/solar-configurator/",
    fence: "/fence-configurator/",
    cardbox: "/cardbox-configurator/",
    chair: "/chair-configurator/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
  ro: {
    pergola: "/configurator-pergola/",
    roof: "/configurator-acoperis/",
    window: "/configurator-ferestre/",
    hall: "/configurator-hala/",
    solar: "/configurator-solar/",
    fence: "/configurator-garduri/",
    cardbox: "/configurator-cutii-carton/",
    chair: "/configurator-scaune/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
  de: {
    pergola: "/pergola-konfigurator/",
    roof: "/dach-konfigurator/",
    window: "/fenster-konfigurator/",
    hall: "/hallen-konfigurator/",
    solar: "/solar-konfigurator/",
    fence: "/zaun-konfigurator/",
    cardbox: "/karton-konfigurator/",
    chair: "/stuhl-konfigurator/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
  es: {
    pergola: "/configurador-pergolas/",
    roof: "/configurador-tejados/",
    window: "/configurador-ventanas/",
    hall: "/configurador-naves/",
    solar: "/configurador-solar/",
    fence: "/configurador-vallas/",
    cardbox: "/configurador-cajas-carton/",
    chair: "/configurador-sillas/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
  fr: {
    pergola: "/configurateur-pergola/",
    roof: "/configurateur-toiture/",
    window: "/configurateur-fenetres/",
    hall: "/configurateur-hangar/",
    solar: "/configurateur-solaire/",
    fence: "/configurateur-cloture/",
    cardbox: "/configurateur-cartons/",
    chair: "/configurateur-chaises/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
  it: {
    pergola: "/configuratore-pergola/",
    roof: "/configuratore-tetto/",
    window: "/configuratore-finestre/",
    hall: "/configuratore-capannone/",
    solar: "/configuratore-fotovoltaico/",
    fence: "/configuratore-recinzioni/",
    cardbox: "/configuratore-scatole/",
    chair: "/configuratore-sedie/", bookshelf: "/bookshelf-configurator/", tiles: "/tiles-configurator/",
  },
} as const;

export type ConfiguratorRouteSlug = keyof typeof configuratorPublicPaths.en;

// Localized pages are stored below /ro, /de, /es, /fr and /it by the static
// build, but the public URL space is domain-based. Links never expose them.
export function localizedPath(_locale: Locale, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized || "/";
}

export function localizedUrl(locale: Locale, path = "/") {
  return `${localeOrigins[locale]}${localizedPath(locale, path)}`;
}

export function configuratorPath(locale: Locale, slug: ConfiguratorRouteSlug) {
  return configuratorPublicPaths[locale][slug];
}

export function configuratorUrl(locale: Locale, slug: ConfiguratorRouteSlug) {
  return `${localeOrigins[locale]}${configuratorPath(locale, slug)}`;
}

export function localeFromHostname(hostname: string): Locale {
  const normalized = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  for (const locale of locales) {
    if (locale === "en") continue;
    if (new URL(localeOrigins[locale]).hostname.replace(/^www\./, "") === normalized) return locale;
  }
  return "en";
}

export const contactEmails: Record<Locale, string> = {
  en: "office@360configurator.com",
  ro: "office@360configurator.ro",
  de: "office@360configurator.com",
  es: "office@360configurator.com",
  fr: "office@360configurator.com",
  it: "office@360configurator.com",
};

export function contactEmail(locale: Locale) {
  return contactEmails[locale];
}

export const contactPhone = Object.freeze({
  display: "0744 142 357",
  international: "+40744142357",
});

export const uiCopy = {
  en: {
    language: "Language", home: "Home", configurators: "Configurators", pricing: "Pricing", about: "About us", contact: "Contact us",
    start: "Start a project", deployed: "Deployed systems", live: "Live", more: "More systems are currently in development.",
    footerLine: "Spatial product configuration for complex industrial products.", contactLabel: "Contact",
    begin: "Begin a project", location: "Bucharest · Romania", render: "Render systems online",
    launch: "Launch full configurator", preview: "Live spatial preview", explore: "Explore 3D", release: "Release scroll",
    loading: "Loading native B2-6 system", controls: "Controls +", hide: "Hide −",
  },
  ro: {
    language: "Limbă", home: "Acasă", configurators: "Configuratoare", pricing: "Prețuri", about: "Despre noi", contact: "Contact",
    start: "Începe un proiect", deployed: "Configuratoare realizate", live: "Deschide", more: "Alte configuratoare sunt în curs de dezvoltare.",
    footerLine: "Configuratoare 3D pentru produse industriale complexe.", contactLabel: "Contact",
    begin: "Pornește un proiect", location: "București · România", render: "Sisteme de randare online",
    launch: "Deschide configuratorul complet", preview: "Previzualizare 3D interactivă", explore: "Explorează modelul 3D", release: "Revino la pagină",
    loading: "Se încarcă sistemul nativ B2-6", controls: "Comenzi +", hide: "Ascunde −",
  },
  de: {
    language: "Sprache", home: "Startseite", configurators: "Konfiguratoren", pricing: "Preise", about: "Über uns", contact: "Kontakt",
    start: "Projekt starten", deployed: "Realisierte Systeme", live: "Live", more: "Weitere Systeme befinden sich in Entwicklung.",
    footerLine: "Räumliche Produktkonfiguration für komplexe Industrieprodukte.", contactLabel: "Kontakt",
    begin: "Projekt anfragen", location: "Bukarest · Rumänien", render: "Render-Systeme online",
    launch: "Vollständigen Konfigurator öffnen", preview: "Räumliche Live-Vorschau", explore: "3D erkunden", release: "Scrollen freigeben",
    loading: "Natives B2-6-System wird geladen", controls: "Steuerung +", hide: "Ausblenden −",
  },
  es: {
    language: "Idioma", home: "Inicio", configurators: "Configuradores", pricing: "Precios", about: "Quiénes somos", contact: "Contacto",
    start: "Iniciar un proyecto", deployed: "Sistemas implantados", live: "En vivo", more: "Hay más sistemas en desarrollo.",
    footerLine: "Configuración espacial de productos industriales complejos.", contactLabel: "Contacto",
    begin: "Empezar un proyecto", location: "Bucarest · Rumanía", render: "Sistemas de renderizado online",
    launch: "Abrir el configurador completo", preview: "Vista previa espacial en vivo", explore: "Explorar en 3D", release: "Liberar el scroll",
    loading: "Cargando el sistema nativo B2-6", controls: "Controles +", hide: "Ocultar −",
  },
  fr: {
    language: "Langue", home: "Accueil", configurators: "Configurateurs", pricing: "Tarifs", about: "À propos", contact: "Contact",
    start: "Lancer un projet", deployed: "Systèmes déployés", live: "En ligne", more: "D’autres systèmes sont en cours de développement.",
    footerLine: "Configuration spatiale de produits industriels complexes.", contactLabel: "Contact",
    begin: "Démarrer un projet", location: "Bucarest · Roumanie", render: "Systèmes de rendu en ligne",
    launch: "Ouvrir le configurateur complet", preview: "Aperçu spatial en direct", explore: "Explorer en 3D", release: "Libérer le défilement",
    loading: "Chargement du système natif B2-6", controls: "Commandes +", hide: "Masquer −",
  },
  it: {
    language: "Lingua", home: "Home", configurators: "Configuratori", pricing: "Prezzi", about: "Chi siamo", contact: "Contatti",
    start: "Avvia un progetto", deployed: "Sistemi realizzati", live: "Live", more: "Altri sistemi sono in fase di sviluppo.",
    footerLine: "Configurazione spaziale per prodotti industriali complessi.", contactLabel: "Contatti",
    begin: "Inizia un progetto", location: "Bucarest · Romania", render: "Sistemi di rendering online",
    launch: "Apri il configuratore completo", preview: "Anteprima spaziale dal vivo", explore: "Esplora in 3D", release: "Riprendi lo scorrimento",
    loading: "Caricamento del sistema nativo B2-6", controls: "Comandi +", hide: "Nascondi −",
  },
} as const;

export const homeCopy = {
  en: {
    heroLabel: "01 / 3D product configurator software", heroA: "Complex products.", heroB: "Made self-evident.",
    heroCopy: "We develop 3D product configurator software for manufacturers and distributors. Let customers choose valid product options in the browser, with pricing and material outputs defined for your catalogue.",
    explore: "Explore live systems", stage2: "Stage 02 / CAD resolution", breakA: "Break the object.", breakB: "Reveal the system.",
    breakCopy: "Geometry separates into glazing, profiles, seals and thermal layers—turning a finished product into legible engineering.",
    stage3: "Stage 03 / Material intelligence", surfaceA: "Every surface", surfaceB: "carries a decision.",
    surfaceCopy: "Interior and exterior finishes, dimensional constraints and product behavior remain synchronized as one configuration state.",
    scroll: "Scroll to resolve", thesis: "03 / Platform thesis", thesisA: "One product state.", thesisB: "Every decision connected.",
    thesisCopy: "A product configurator connects the 3D model to dimensions, compatible options and product rules. Pricing, a bill of materials and data handoff are defined around your sales process, with scope and interfaces agreed before implementation.",
    spatial: "Spatial interface", resolved: "Resolved output", connected: "System connection",
    systems: "04 / Deployed systems", systemsA: "Live systems.", systemsB: "An expanding field of possibilities.",
    systemsCopy: "Try the lite previews, then open a full configurator to inspect its supported workflow. These examples help us assess what your catalogue can reuse and what needs adaptation.",
    customLabel: "06 / Custom system", customA: "Your product could be", customB: "the next system.", customStatement: "Begin with the product you already manufacture—not a software template.", customCopy: "We map its geometry, options, compatibility rules, pricing and outputs into a configuration system engineered for the way your business actually works.", customStatus: "Product logic intake", customSignal: "CAD + rules + commercial model", customCta: "Discuss your product", customPricing: "See the Custom System path", customViewport: "Configuration blueprint", customFeatures: [["Product data", "CAD", "Existing CAD, drawings, component records and product knowledge become the technical source for the system, preserving the manufacturing reality that already defines your commercial product."], ["Geometry", "Geometry", "Dimensions, assemblies, connection logic and valid spatial relationships define what the configured product can become, ensuring visual changes remain credible as a physical manufactured result."], ["Rules", "Rules", "Compatibility constraints, dependencies and required selections prevent users from creating invalid product states while explaining which decisions remain available at every point in the configuration."], ["Commercial", "Price", "Price logic, BOM structure, margins and lead qualification remain connected to every visual decision, turning a configured product into a commercially usable and traceable project state."], ["Workflow", "Flow", "The interface follows the real decision sequence used by customers, sales and technical teams, reducing interpretation gaps between initial exploration, qualification, engineering review and final handover."], ["Integration", "API", "Qualified configurations can connect with CRM, ERP, commerce, product-data and downstream production systems, keeping selected options and project context available beyond the visual configuration experience."]],
    interactive: "Interactive system", viewCase: "View full case", launch: "Launch full configurator",
    pipeline: "05 / Visual CPQ pipeline", pipelineA: "From interaction.", pipelineB: "To commercial resolution.",
    processLabel: "06 / Deployment path", processA: "From product rules", processB: "to a living interface.",
    ctaLabel: "Build the impossible product interface", ctaA: "Make complexity", ctaB: "feel inevitable.",
    ctaCopy: "Bring us the product that is too configurable, too technical or too difficult to explain. That is where spatial systems become valuable.",
    start: "Start a project",
    capabilities: [
      ["Configure", "A browser-native spatial interface governed by the product’s real dimensions, dependencies and compatibility rules."],
      ["Price", "Every visual selection enters the commercial model immediately—without a spreadsheet handoff between customer and sales."],
      ["Resolve", "Approved geometry becomes a precise BOM and a component-level state that downstream teams can actually use."],
      ["Quote", "The configured product moves forward as a clear, customer-ready commercial record for connected business systems."],
    ],
    steps: [["Decode", "Products, geometry, dependencies and commercial intent."], ["Engineer", "Parametric logic, assets, pricing and production resolution."], ["Deploy", "A spatial configurator integrated into the systems you already use."]],
  },
  ro: {
    heroLabel: "01 / Configuratoare 3D pentru produse", heroA: "Produse complexe.", heroB: "Decizii mai clare.",
    heroCopy: "Dezvoltăm configuratoare 3D pentru producători și distribuitori. Clienții aleg variante compatibile direct în browser, iar regulile de preț și lista de materiale se stabilesc pentru catalogul tău.",
    explore: "Vezi configuratoarele", stage2: "Etapa 02 / Detaliere CAD", breakA: "Vezi fiecare componentă.", breakB: "Înțelege întregul ansamblu.",
    breakCopy: "Separăm vitrajul, profilele, garniturile și straturile termice, astfel încât construcția produsului finit să fie ușor de înțeles.",
    stage3: "Etapa 03 / Materiale și finisaje", surfaceA: "Fiecare finisaj", surfaceB: "schimbă produsul.",
    surfaceCopy: "Finisajele interioare și exterioare, constrângerile dimensionale și comportamentul produsului rămân sincronizate într-o singură configurație.",
    scroll: "Derulează pentru detalii", thesis: "03 / Cum funcționează platforma", thesisA: "O singură configurație.", thesisB: "Fiecare decizie conectată.",
    thesisCopy: "Configuratorul leagă modelul 3D de dimensiuni, opțiuni compatibile și regulile produsului. Stabilim calculul de preț, lista de materiale și transferul datelor pentru procesul tău de vânzare, cu funcții și integrări agreate înainte de implementare.",
    spatial: "Configurare 3D", resolved: "Date structurate", connected: "Integrări",
    systems: "04 / Configuratoare realizate", systemsA: "Configuratoare disponibile.", systemsB: "Mai multe produse, aceeași platformă.",
    systemsCopy: "Testează previzualizările lite, apoi deschide configuratorul complet pentru fluxul disponibil. Exemplele ne ajută să stabilim ce poate reutiliza catalogul tău și ce trebuie adaptat.",
    customLabel: "06 / Configurator personalizat", customA: "Produsul tău poate avea", customB: "propriul configurator.", customStatement: "Pornim de la produsul pe care îl fabrici deja și de la procesul real de vânzare.", customCopy: "Transformăm geometria, opțiunile, regulile de compatibilitate și calculul de preț într-un configurator adaptat companiei tale.", customStatus: "Analiza regulilor produsului", customSignal: "CAD + reguli + calcul comercial", customCta: "Discută despre produs", customPricing: "Vezi opțiunea Configurator personalizat", customViewport: "Structura configuratorului", customFeatures: [["Date de produs", "CAD", "Folosim desenele, modelele CAD, listele de componente și cunoștințele echipei tale ca bază tehnică pentru configurator."], ["Geometrie", "Geometrie", "Dimensiunile, ansamblurile și conexiunile stabilesc variantele care pot fi configurate și fabricate."], ["Reguli", "Reguli", "Regulile de compatibilitate și selecțiile obligatorii împiedică variantele imposibile și arată ce opțiuni rămân disponibile."], ["Comercial", "Preț", "Prețul, lista de materiale, marjele și datele solicitării rămân legate de fiecare alegere făcută în model."], ["Flux", "Flux", "Interfața urmează pașii reali folosiți de clienți, vânzări și echipele tehnice, de la alegerea variantei până la predare."], ["Integrare", "API", "Configurațiile pot fi trimise către CRM, ERP, platforme de comerț electronic sau sisteme de producție prin integrările disponibile."]],
    interactive: "Sistem interactiv", viewCase: "Vezi studiul complet", launch: "Deschide configuratorul complet",
    pipeline: "05 / Flux CPQ vizual", pipelineA: "De la interacțiune.", pipelineB: "La rezultat comercial.",
    processLabel: "06 / Procesul de implementare", processA: "De la regulile produsului", processB: "la un configurator funcțional.",
    ctaLabel: "Pentru produse care nu încap într-un formular", ctaA: "Transformă alegerile complexe", ctaB: "într-un proces clar.",
    ctaCopy: "Arată-ne produsul, variantele și regulile sale. Îți propunem un configurator pe care clienții îl pot înțelege și echipa ta îl poate folosi.",
    start: "Începe un proiect",
    capabilities: [
      ["Configurează", "Clientul lucrează direct în browser, în limitele dimensionale și regulile reale de compatibilitate ale produsului."],
      ["Calculează", "Fiecare alegere din model actualizează calculul comercial, fără transfer manual între client, vânzări și foi de calcul."],
      ["Generează", "Configurația aprobată produce lista de materiale și datele de care au nevoie echipele de ofertare, producție și montaj."],
      ["Pregătește oferta", "Produsul configurat devine o cerere clară, pregătită pentru client și pentru sistemele companiei."],
    ],
    steps: [["Analizăm", "Produsul, geometria, dependențele și obiectivele comerciale."], ["Construim", "Logica parametrică, modelele 3D, prețurile și rezultatele tehnice."], ["Implementăm", "Un configurator 3D conectat la sistemele pe care le folosești deja."]],
  },
  de: {
    heroLabel: "01 / 3D-Produktkonfiguratoren", heroA: "Komplexe Produkte.", heroB: "Unmittelbar verständlich.",
    heroCopy: "Wir entwickeln 3D-Produktkonfiguratoren für Hersteller und Händler. Kunden wählen passende Produktvarianten im Browser. Preisregeln und Stücklisten werden für Ihren Katalog festgelegt.",
    explore: "Live-Systeme entdecken", stage2: "Phase 02 / CAD-Auflösung", breakA: "Das Objekt zerlegen.", breakB: "Das System verstehen.",
    breakCopy: "Geometrie trennt sich in Verglasung, Profile, Dichtungen und thermische Ebenen—und macht die Technik im fertigen Produkt lesbar.",
    stage3: "Phase 03 / Materialintelligenz", surfaceA: "Jede Oberfläche", surfaceB: "trägt eine Entscheidung.",
    surfaceCopy: "Innen- und Außenoberflächen, Maßvorgaben und Produktverhalten bleiben in einem einzigen Konfigurationszustand synchron.",
    scroll: "Scrollen, um aufzulösen", thesis: "03 / Plattformprinzip", thesisA: "Ein Produktzustand.", thesisB: "Jede Entscheidung verknüpft.",
    thesisCopy: "Ein Produktkonfigurator verbindet das 3D-Modell mit Maßen, zulässigen Varianten und Produktregeln. Kalkulation, Stücklisten und Datenübergabe richten sich nach Ihrem Vertriebsprozess. Umfang und Schnittstellen werden vor der Implementierung vereinbart.",
    spatial: "Räumliche Oberfläche", resolved: "Strukturiertes Ergebnis", connected: "Systemanbindung",
    systems: "04 / Realisierte Systeme", systemsA: "Live-Systeme.", systemsB: "Ein wachsendes Feld von Möglichkeiten.",
    systemsCopy: "Testen Sie die Lite-Vorschauen und öffnen Sie einen vollständigen Konfigurator für den verfügbaren Ablauf. Anhand dieser Beispiele prüfen wir, was Ihr Katalog übernehmen kann und was angepasst werden muss.",
    customLabel: "06 / Individuelles System", customA: "Ihr Produkt kann", customB: "das nächste System werden.", customStatement: "Wir beginnen mit dem Produkt, das Sie bereits fertigen—nicht mit einer Softwarevorlage.", customCopy: "Wir übersetzen Geometrie, Optionen, Kompatibilitätsregeln, Kalkulation und Ausgaben in ein Konfigurationssystem, das für Ihre tatsächlichen Geschäftsabläufe entwickelt ist.", customStatus: "Aufnahme der Produktlogik", customSignal: "CAD + Regeln + kaufmännisches Modell", customCta: "Produkt besprechen", customPricing: "Zum individuellen Implementierungsweg", customViewport: "Konfigurationsarchitektur", customFeatures: [["Produktdaten", "CAD", "CAD-Daten, Zeichnungen, Komponentenverzeichnisse und Produktwissen bilden die technische Quelle des Systems und bewahren die Fertigungsrealität, die Ihr bestehendes kommerzielles Produkt bereits definiert."], ["Geometrie", "Geometrie", "Maße, Baugruppen, Verbindungslogik und gültige räumliche Beziehungen definieren das konfigurierbare Produkt, damit jede visuelle Änderung als physisch herstellbares Ergebnis glaubwürdig bleibt."], ["Regeln", "Regeln", "Kompatibilitätsvorgaben, Abhängigkeiten und erforderliche Auswahlen verhindern ungültige Produktzustände und erklären, welche Entscheidungen an jedem Punkt der Konfiguration weiterhin möglich sind."], ["Kaufmännisch", "Preis", "Preislogik, Stücklistenstruktur, Margen und Lead-Qualifizierung bleiben mit jeder visuellen Entscheidung verbunden und verwandeln die Konfiguration in einen nutzbaren, nachvollziehbaren Projektzustand."], ["Workflow", "Ablauf", "Die Oberfläche folgt der realen Entscheidungsfolge von Kunden, Vertrieb und technischen Teams und reduziert Interpretationslücken zwischen Erkundung, Qualifizierung, technischer Prüfung und Übergabe."], ["Integration", "API", "Qualifizierte Konfigurationen lassen sich mit CRM, ERP, Commerce, Produktdaten und Produktion verbinden, damit gewählte Optionen und Projektkontext über die visuelle Erfahrung hinaus verfügbar bleiben."]],
    interactive: "Interaktives System", viewCase: "Gesamten Case ansehen", launch: "Vollständigen Konfigurator öffnen",
    pipeline: "05 / Visuelle CPQ-Pipeline", pipelineA: "Von der Interaktion.", pipelineB: "Zur kommerziellen Lösung.",
    processLabel: "06 / Implementierungsweg", processA: "Von Produktregeln", processB: "zu einer lebendigen Oberfläche.",
    ctaLabel: "Die Oberfläche für das scheinbar unmögliche Produkt", ctaA: "Komplexität so gestalten,", ctaB: "dass sie selbstverständlich wirkt.",
    ctaCopy: "Bringen Sie uns das Produkt, das zu variantenreich, zu technisch oder zu schwer zu erklären scheint. Genau dort entfalten räumliche Systeme ihren Wert.",
    start: "Projekt starten",
    capabilities: [
      ["Konfigurieren", "Eine browsernative räumliche Oberfläche, gesteuert durch reale Maße, Abhängigkeiten und Kompatibilitätsregeln des Produkts."],
      ["Kalkulieren", "Jede visuelle Auswahl fließt unmittelbar in das kaufmännische Modell ein—ohne Medienbruch zwischen Kunde und Vertrieb."],
      ["Auflösen", "Freigegebene Geometrie wird zu einer präzisen Stückliste und einem komponentengenauen Zustand für nachgelagerte Teams."],
      ["Angebot", "Das konfigurierte Produkt wird zu einem klaren, kundenfähigen kaufmännischen Datensatz für angebundene Geschäftssysteme."],
    ],
    steps: [["Erfassen", "Produkt, Geometrie, Abhängigkeiten und kaufmännische Zielsetzung."], ["Entwickeln", "Parametrische Logik, 3D-Assets, Preisregeln und technische Auflösung."], ["Integrieren", "Ein räumlicher Konfigurator, eingebunden in Ihre bestehenden Systeme."]],
  },
  es: {
    heroLabel: "01 / Software de configuración 3D de productos", heroA: "Productos complejos.", heroB: "Explicados por sí mismos.",
    heroCopy: "Desarrollamos software de configuración 3D de productos para fabricantes y distribuidores. Sus clientes eligen opciones válidas en el navegador, con precios y listas de materiales definidos para su catálogo.",
    explore: "Explorar sistemas en vivo", stage2: "Etapa 02 / Resolución CAD", breakA: "Descomponga el objeto.", breakB: "Descubra el sistema.",
    breakCopy: "La geometría se separa en acristalamiento, perfiles, juntas y capas térmicas, y convierte un producto terminado en ingeniería legible.",
    stage3: "Etapa 03 / Inteligencia de materiales", surfaceA: "Cada superficie", surfaceB: "implica una decisión.",
    surfaceCopy: "Acabados interiores y exteriores, restricciones dimensionales y comportamiento del producto se mantienen sincronizados en un único estado de configuración.",
    scroll: "Desplácese para resolver", thesis: "03 / Principio de la plataforma", thesisA: "Un único estado de producto.", thesisB: "Cada decisión conectada.",
    thesisCopy: "Un configurador de productos conecta el modelo 3D con las dimensiones, las opciones compatibles y las reglas del producto. Los precios, la lista de materiales y la transferencia de datos se definen en torno a su proceso de venta, con el alcance y las interfaces acordados antes de la implantación.",
    spatial: "Interfaz espacial", resolved: "Resultado estructurado", connected: "Conexión de sistemas",
    systems: "04 / Sistemas implantados", systemsA: "Sistemas en vivo.", systemsB: "Un campo de posibilidades en expansión.",
    systemsCopy: "Pruebe las vistas previas lite y abra después un configurador completo para revisar el flujo disponible. Estos ejemplos nos ayudan a valorar qué puede reutilizar su catálogo y qué necesita adaptarse.",
    customLabel: "06 / Sistema a medida", customA: "Su producto puede ser", customB: "el próximo sistema.", customStatement: "Partimos del producto que usted ya fabrica, no de una plantilla de software.", customCopy: "Trasladamos su geometría, opciones, reglas de compatibilidad, precios y resultados a un sistema de configuración diseñado para la forma en que realmente trabaja su empresa.", customStatus: "Análisis de la lógica del producto", customSignal: "CAD + reglas + modelo comercial", customCta: "Hablemos de su producto", customPricing: "Ver la opción de sistema a medida", customViewport: "Arquitectura de la configuración", customFeatures: [["Datos de producto", "CAD", "Los modelos CAD, planos, registros de componentes y el conocimiento de producto existentes se convierten en la fuente técnica del sistema y preservan la realidad de fabricación que ya define su producto comercial."], ["Geometría", "Geometría", "Dimensiones, conjuntos, lógica de uniones y relaciones espaciales válidas definen en qué puede convertirse el producto configurado, de modo que cada cambio visual siga siendo creíble como resultado fabricado."], ["Reglas", "Reglas", "Las restricciones de compatibilidad, dependencias y selecciones obligatorias impiden estados de producto no válidos y explican qué decisiones siguen disponibles en cada punto de la configuración."], ["Comercial", "Precio", "La lógica de precios, la estructura de la lista de materiales, los márgenes y la cualificación de oportunidades permanecen vinculados a cada decisión visual y convierten la configuración en un proyecto comercial utilizable y trazable."], ["Flujo", "Flujo", "La interfaz sigue la secuencia real de decisiones de clientes, equipos comerciales y técnicos, y reduce las lagunas de interpretación entre exploración, cualificación, revisión técnica y entrega final."], ["Integración", "API", "Las configuraciones cualificadas pueden conectarse con CRM, ERP, comercio electrónico, datos de producto y sistemas de producción, para que las opciones elegidas y el contexto del proyecto sigan disponibles más allá de la experiencia visual."]],
    interactive: "Sistema interactivo", viewCase: "Ver el caso completo", launch: "Abrir el configurador completo",
    pipeline: "05 / Flujo CPQ visual", pipelineA: "De la interacción.", pipelineB: "A la resolución comercial.",
    processLabel: "06 / Proceso de implantación", processA: "De las reglas del producto", processB: "a una interfaz viva.",
    ctaLabel: "Construya la interfaz del producto imposible", ctaA: "Haga que la complejidad", ctaB: "parezca natural.",
    ctaCopy: "Tráiganos el producto demasiado configurable, demasiado técnico o demasiado difícil de explicar. Ahí es donde los sistemas espaciales aportan valor.",
    start: "Iniciar un proyecto",
    capabilities: [
      ["Configurar", "Una interfaz espacial nativa del navegador, regida por las dimensiones, dependencias y reglas de compatibilidad reales del producto."],
      ["Calcular", "Cada selección visual entra de inmediato en el modelo comercial, sin hojas de cálculo intermedias entre cliente y ventas."],
      ["Resolver", "La geometría aprobada se convierte en una lista de materiales precisa y en un estado por componente que los equipos posteriores pueden utilizar."],
      ["Ofertar", "El producto configurado avanza como un registro comercial claro, listo para el cliente y para los sistemas de negocio conectados."],
    ],
    steps: [["Analizar", "Productos, geometría, dependencias y objetivos comerciales."], ["Desarrollar", "Lógica paramétrica, activos 3D, precios y resolución técnica."], ["Implantar", "Un configurador espacial integrado en los sistemas que ya utiliza."]],
  },
  fr: {
    heroLabel: "01 / Logiciel de configuration produit 3D", heroA: "Produits complexes.", heroB: "Rendus évidents.",
    heroCopy: "Nous développons des logiciels de configuration produit 3D pour les fabricants et les distributeurs. Vos clients choisissent des options valides dans le navigateur, avec des prix et des nomenclatures définis pour votre catalogue.",
    explore: "Découvrir les systèmes", stage2: "Étape 02 / Résolution CAO", breakA: "Décomposer l’objet.", breakB: "Révéler le système.",
    breakCopy: "La géométrie se sépare en vitrages, profilés, joints et couches thermiques : le produit fini devient une ingénierie lisible.",
    stage3: "Étape 03 / Intelligence des matériaux", surfaceA: "Chaque surface", surfaceB: "porte une décision.",
    surfaceCopy: "Finitions intérieures et extérieures, contraintes dimensionnelles et comportement du produit restent synchronisés dans un seul état de configuration.",
    scroll: "Faites défiler pour résoudre", thesis: "03 / Principe de la plateforme", thesisA: "Un seul état produit.", thesisB: "Chaque décision connectée.",
    thesisCopy: "Un configurateur produit relie le modèle 3D aux dimensions, aux options compatibles et aux règles du produit. Le calcul des prix, la nomenclature et le transfert des données sont définis selon votre processus de vente, avec un périmètre et des interfaces validés avant la mise en œuvre.",
    spatial: "Interface spatiale", resolved: "Résultat structuré", connected: "Connexion aux systèmes",
    systems: "04 / Systèmes déployés", systemsA: "Systèmes en ligne.", systemsB: "Un champ de possibilités qui s’élargit.",
    systemsCopy: "Essayez les aperçus lite, puis ouvrez un configurateur complet pour examiner le parcours disponible. Ces exemples nous aident à évaluer ce que votre catalogue peut réutiliser et ce qui doit être adapté.",
    customLabel: "06 / Système sur mesure", customA: "Votre produit pourrait être", customB: "le prochain système.", customStatement: "Nous partons du produit que vous fabriquez déjà, pas d’un modèle logiciel.", customCopy: "Nous traduisons sa géométrie, ses options, ses règles de compatibilité, ses prix et ses livrables en un système de configuration conçu pour le fonctionnement réel de votre entreprise.", customStatus: "Analyse de la logique produit", customSignal: "CAO + règles + modèle commercial", customCta: "Parler de votre produit", customPricing: "Voir l’offre Système sur mesure", customViewport: "Architecture de configuration", customFeatures: [["Données produit", "CAO", "Les modèles CAO, plans, références de composants et le savoir-faire produit existants deviennent la source technique du système et préservent la réalité de fabrication qui définit déjà votre produit commercial."], ["Géométrie", "Géométrie", "Dimensions, assemblages, logique de liaison et relations spatiales valides définissent ce que le produit configuré peut devenir, afin que chaque changement visuel reste crédible comme résultat fabriqué."], ["Règles", "Règles", "Contraintes de compatibilité, dépendances et sélections obligatoires empêchent les états de produit invalides et indiquent quelles décisions restent possibles à chaque étape de la configuration."], ["Commercial", "Prix", "Logique tarifaire, structure de nomenclature, marges et qualification des prospects restent liées à chaque décision visuelle et font de la configuration un projet commercial exploitable et traçable."], ["Parcours", "Flux", "L’interface suit la séquence réelle de décisions des clients, des commerciaux et des équipes techniques, et réduit les écarts d’interprétation entre exploration, qualification, revue technique et remise finale."], ["Intégration", "API", "Les configurations qualifiées peuvent être connectées au CRM, à l’ERP, au e-commerce, aux données produit et à la production, pour que les options choisies et le contexte du projet restent disponibles au-delà de l’expérience visuelle."]],
    interactive: "Système interactif", viewCase: "Voir le cas complet", launch: "Ouvrir le configurateur complet",
    pipeline: "05 / Chaîne CPQ visuelle", pipelineA: "De l’interaction.", pipelineB: "À la résolution commerciale.",
    processLabel: "06 / Mise en œuvre", processA: "Des règles du produit", processB: "à une interface vivante.",
    ctaLabel: "Créez l’interface du produit impossible", ctaA: "Rendez la complexité", ctaB: "évidente.",
    ctaCopy: "Confiez-nous le produit trop configurable, trop technique ou trop difficile à expliquer. C’est là que les systèmes spatiaux prennent toute leur valeur.",
    start: "Lancer un projet",
    capabilities: [
      ["Configurer", "Une interface spatiale native du navigateur, régie par les dimensions, dépendances et règles de compatibilité réelles du produit."],
      ["Chiffrer", "Chaque sélection visuelle alimente immédiatement le modèle commercial, sans tableur intermédiaire entre le client et les ventes."],
      ["Résoudre", "La géométrie validée devient une nomenclature précise et un état par composant directement exploitable par les équipes en aval."],
      ["Proposer", "Le produit configuré avance sous forme d’un dossier commercial clair, prêt pour le client et pour les systèmes connectés."],
    ],
    steps: [["Analyser", "Produits, géométrie, dépendances et objectifs commerciaux."], ["Concevoir", "Logique paramétrique, ressources 3D, prix et résolution technique."], ["Déployer", "Un configurateur spatial intégré aux systèmes que vous utilisez déjà."]],
  },
  it: {
    heroLabel: "01 / Software di configurazione prodotto 3D", heroA: "Prodotti complessi.", heroB: "Resi immediati.",
    heroCopy: "Sviluppiamo software di configurazione prodotto 3D per produttori e distributori. I Suoi clienti scelgono opzioni valide nel browser, con prezzi e distinte materiali definiti per il Suo catalogo.",
    explore: "Esplora i sistemi live", stage2: "Fase 02 / Risoluzione CAD", breakA: "Scomporre l’oggetto.", breakB: "Rivelare il sistema.",
    breakCopy: "La geometria si separa in vetri, profili, guarnizioni e strati termici, trasformando il prodotto finito in ingegneria leggibile.",
    stage3: "Fase 03 / Intelligenza dei materiali", surfaceA: "Ogni superficie", surfaceB: "è una decisione.",
    surfaceCopy: "Finiture interne ed esterne, vincoli dimensionali e comportamento del prodotto restano sincronizzati in un unico stato di configurazione.",
    scroll: "Scorra per risolvere", thesis: "03 / Principio della piattaforma", thesisA: "Un unico stato di prodotto.", thesisB: "Ogni decisione collegata.",
    thesisCopy: "Un configuratore di prodotto collega il modello 3D a dimensioni, opzioni compatibili e regole di prodotto. Prezzi, distinta materiali e trasferimento dei dati vengono definiti attorno al Suo processo di vendita, con perimetro e interfacce concordati prima dell’implementazione.",
    spatial: "Interfaccia spaziale", resolved: "Risultato strutturato", connected: "Connessione ai sistemi",
    systems: "04 / Sistemi realizzati", systemsA: "Sistemi live.", systemsB: "Un campo di possibilità in espansione.",
    systemsCopy: "Provi le anteprime lite, poi apra un configuratore completo per esaminare il flusso disponibile. Questi esempi ci aiutano a valutare cosa il Suo catalogo può riutilizzare e cosa va adattato.",
    customLabel: "06 / Sistema su misura", customA: "Il Suo prodotto può essere", customB: "il prossimo sistema.", customStatement: "Partiamo dal prodotto che Lei già produce, non da un modello software.", customCopy: "Traduciamo geometria, opzioni, regole di compatibilità, prezzi e output in un sistema di configurazione progettato per il modo in cui la Sua azienda lavora davvero.", customStatus: "Analisi della logica di prodotto", customSignal: "CAD + regole + modello commerciale", customCta: "Parliamo del Suo prodotto", customPricing: "Vedi il percorso Sistema su misura", customViewport: "Architettura della configurazione", customFeatures: [["Dati di prodotto", "CAD", "Modelli CAD, disegni, anagrafiche dei componenti e conoscenza di prodotto esistenti diventano la fonte tecnica del sistema, preservando la realtà produttiva che già definisce il Suo prodotto commerciale."], ["Geometria", "Geometria", "Dimensioni, assiemi, logica di collegamento e relazioni spaziali valide definiscono ciò che il prodotto configurato può diventare, così ogni modifica visiva resta credibile come risultato fabbricabile."], ["Regole", "Regole", "Vincoli di compatibilità, dipendenze e selezioni obbligatorie impediscono stati di prodotto non validi e mostrano quali decisioni restano disponibili in ogni punto della configurazione."], ["Commerciale", "Prezzo", "Logica di prezzo, struttura della distinta, margini e qualificazione dei contatti restano collegati a ogni decisione visiva, trasformando la configurazione in un progetto commerciale utilizzabile e tracciabile."], ["Flusso", "Flusso", "L’interfaccia segue la reale sequenza decisionale di clienti, vendite e team tecnici, riducendo le lacune interpretative tra esplorazione, qualificazione, revisione tecnica e consegna finale."], ["Integrazione", "API", "Le configurazioni qualificate possono collegarsi a CRM, ERP, e-commerce, dati di prodotto e sistemi di produzione, mantenendo opzioni scelte e contesto di progetto disponibili oltre l’esperienza visiva."]],
    interactive: "Sistema interattivo", viewCase: "Vedi il caso completo", launch: "Apri il configuratore completo",
    pipeline: "05 / Pipeline CPQ visiva", pipelineA: "Dall’interazione.", pipelineB: "Alla risoluzione commerciale.",
    processLabel: "06 / Percorso di implementazione", processA: "Dalle regole di prodotto", processB: "a un’interfaccia viva.",
    ctaLabel: "Costruisca l’interfaccia del prodotto impossibile", ctaA: "Renda la complessità", ctaB: "naturale.",
    ctaCopy: "Ci porti il prodotto troppo configurabile, troppo tecnico o troppo difficile da spiegare. È lì che i sistemi spaziali creano valore.",
    start: "Avvia un progetto",
    capabilities: [
      ["Configura", "Un’interfaccia spaziale nativa del browser, governata da dimensioni, dipendenze e regole di compatibilità reali del prodotto."],
      ["Calcola", "Ogni scelta visiva entra subito nel modello commerciale, senza fogli di calcolo intermedi tra cliente e vendite."],
      ["Risolvi", "La geometria approvata diventa una distinta materiali precisa e uno stato per componente utilizzabile dai team a valle."],
      ["Offerta", "Il prodotto configurato prosegue come un record commerciale chiaro, pronto per il cliente e per i sistemi aziendali collegati."],
    ],
    steps: [["Analizzare", "Prodotti, geometria, dipendenze e obiettivi commerciali."], ["Progettare", "Logica parametrica, asset 3D, prezzi e risoluzione tecnica."], ["Implementare", "Un configuratore spaziale integrato nei sistemi che già utilizza."]],
  },
} as const;

export const detailCopy = {
  en: { overview: "System overview", capabilities: "Capabilities / 06", resolves: "What the system resolves.", state: "Resolved state", outputA: "From visual decision", outputB: "to usable output.", deployment: "Full deployment", exploreA: "Explore every rule.", exploreB: "Configure the real system.", open: "Open live configurator", continue: "Continue exploring" },
  ro: { overview: "Prezentarea configuratorului", capabilities: "Funcții / 06", resolves: "Ce poți face.", state: "Configurație completă", outputA: "De la alegerea vizuală", outputB: "la date gata de folosit.", deployment: "Implementare completă", exploreA: "Vezi fiecare regulă.", exploreB: "Configurează produsul real.", open: "Deschide configuratorul", continue: "Vezi celelalte funcții" },
  de: { overview: "Systemüberblick", capabilities: "Funktionen / 06", resolves: "Was das System auflöst.", state: "Aufgelöster Zustand", outputA: "Von der visuellen Entscheidung", outputB: "zum nutzbaren Ergebnis.", deployment: "Vollständige Implementierung", exploreA: "Jede Regel entdecken.", exploreB: "Das reale System konfigurieren.", open: "Live-Konfigurator öffnen", continue: "Weiter entdecken" },
  es: { overview: "Visión general del sistema", capabilities: "Funciones / 06", resolves: "Lo que resuelve el sistema.", state: "Estado resuelto", outputA: "De la decisión visual", outputB: "a un resultado utilizable.", deployment: "Implantación completa", exploreA: "Explore cada regla.", exploreB: "Configure el sistema real.", open: "Abrir el configurador en vivo", continue: "Seguir explorando" },
  fr: { overview: "Vue d’ensemble du système", capabilities: "Fonctions / 06", resolves: "Ce que le système résout.", state: "État résolu", outputA: "De la décision visuelle", outputB: "à un résultat exploitable.", deployment: "Déploiement complet", exploreA: "Explorez chaque règle.", exploreB: "Configurez le système réel.", open: "Ouvrir le configurateur", continue: "Continuer l’exploration" },
  it: { overview: "Panoramica del sistema", capabilities: "Funzioni / 06", resolves: "Cosa risolve il sistema.", state: "Stato risolto", outputA: "Dalla scelta visiva", outputB: "a un risultato utilizzabile.", deployment: "Implementazione completa", exploreA: "Esplori ogni regola.", exploreB: "Configuri il sistema reale.", open: "Apri il configuratore live", continue: "Continua a esplorare" },
} as const;
