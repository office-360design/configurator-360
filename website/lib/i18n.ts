export const locales = ["en", "ro", "de"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const localeOrigins: Record<Locale, string> = {
  en: "https://www.360configurator.com",
  ro: "https://www.360configurator.ro",
  de: "https://www.360konfigurator.de",
};

export const configuratorPublicPaths = {
  en: {
    pergola: "/pergola-configurator/",
    roof: "/roof-configurator/",
    window: "/window-configurator/",
    hall: "/hall-configurator/",
    solar: "/solar-configurator/",
    fence: "/fence-configurator/",
  },
  ro: {
    pergola: "/configurator-pergola/",
    roof: "/configurator-acoperis/",
    window: "/configurator-ferestre/",
    hall: "/configurator-hala/",
    solar: "/configurator-solar/",
    fence: "/configurator-garduri/",
  },
  de: {
    pergola: "/pergola-konfigurator/",
    roof: "/dach-konfigurator/",
    window: "/fenster-konfigurator/",
    hall: "/hallen-konfigurator/",
    solar: "/solar-konfigurator/",
    fence: "/zaun-konfigurator/",
  },
} as const;

export type ConfiguratorRouteSlug = keyof typeof configuratorPublicPaths.en;

// Localized pages are stored below /ro and /de by the static build, but the
// public URL space is domain-based. Links therefore never expose /ro or /de.
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
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "360configurator.ro" || normalized === "www.360configurator.ro") return "ro";
  if (normalized === "360konfigurator.de" || normalized === "www.360konfigurator.de") return "de";
  return "en";
}

export function contactEmail(locale: Locale) {
  return locale === "ro" ? "office@360configurator.ro" : "office@360configurator.com";
}

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
    start: "Începe un proiect", deployed: "Sisteme implementate", live: "Live", more: "Alte sisteme sunt în curs de dezvoltare.",
    footerLine: "Configurare spațială pentru produse industriale complexe.", contactLabel: "Contact",
    begin: "Pornește un proiect", location: "București · România", render: "Sisteme de randare online",
    launch: "Deschide configuratorul complet", preview: "Previzualizare spațială live", explore: "Explorează 3D", release: "Revino la derulare",
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
} as const;

export const homeCopy = {
  en: {
    heroLabel: "01 / Spatial product infrastructure", heroA: "Complex products.", heroB: "Made self-evident.",
    heroCopy: "We transform industrial product logic into spatial systems people can see, configure, price and understand in real time.",
    explore: "Explore live systems", stage2: "Stage 02 / CAD resolution", breakA: "Break the object.", breakB: "Reveal the system.",
    breakCopy: "Geometry separates into glazing, profiles, seals and thermal layers—turning a finished product into legible engineering.",
    stage3: "Stage 03 / Material intelligence", surfaceA: "Every surface", surfaceB: "carries a decision.",
    surfaceCopy: "Interior and exterior finishes, dimensional constraints and product behavior remain synchronized as one configuration state.",
    scroll: "Scroll to resolve", thesis: "03 / Platform thesis", thesisA: "One product state.", thesisB: "Every decision connected.",
    thesisCopy: "A 360Configurator deployment combines an interactive 3D product, its engineering constraints, its commercial rules and its downstream outputs. One state—from first exploration to qualified quote.",
    spatial: "Spatial interface", resolved: "Resolved output", connected: "System connection",
    systems: "04 / Deployed systems", systemsA: "Live systems.", systemsB: "An expanding field of possibilities.",
    systemsCopy: "Explore the deployments available today—part of a platform designed to grow across products, industries and new forms of complexity.",
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
    heroLabel: "01 / Infrastructură spațială de produs", heroA: "Produse complexe.", heroB: "Claritate imediată.",
    heroCopy: "Transformăm logica produselor industriale în sisteme spațiale pe care oamenii le pot vedea, configura, evalua și înțelege în timp real.",
    explore: "Explorează sistemele live", stage2: "Etapa 02 / Rezoluție CAD", breakA: "Descompune produsul.", breakB: "Descoperă sistemul.",
    breakCopy: "Geometria se separă în vitraj, profile, garnituri și straturi termice—iar produsul finit devine inginerie ușor de înțeles.",
    stage3: "Etapa 03 / Inteligența materialelor", surfaceA: "Fiecare suprafață", surfaceB: "încorporează o decizie.",
    surfaceCopy: "Finisajele interioare și exterioare, constrângerile dimensionale și comportamentul produsului rămân sincronizate într-o singură configurație.",
    scroll: "Derulează pentru detalii", thesis: "03 / Teza platformei", thesisA: "O singură configurație.", thesisB: "Fiecare decizie conectată.",
    thesisCopy: "O implementare 360Configurator reunește produsul 3D interactiv, constrângerile inginerești, regulile comerciale și rezultatele operaționale. O singură stare—de la explorare la ofertă calificată.",
    spatial: "Interfață spațială", resolved: "Rezultat structurat", connected: "Conectare la sisteme",
    systems: "04 / Sisteme implementate", systemsA: "Sisteme live.", systemsB: "Un univers în continuă extindere.",
    systemsCopy: "Explorează implementările disponibile astăzi—parte dintr-o platformă concepută să crească odată cu noi produse, industrii și forme de complexitate.",
    customLabel: "06 / Sistem personalizat", customA: "Produsul tău poate deveni", customB: "următorul sistem.", customStatement: "Pornim de la produsul pe care îl fabricați deja, nu de la un șablon software.", customCopy: "Îi transformăm geometria, opțiunile, regulile de compatibilitate, prețurile și rezultatele într-un sistem de configurare proiectat pentru modul real în care funcționează compania.", customStatus: "Preluare logică de produs", customSignal: "CAD + reguli + model comercial", customCta: "Discută despre produs", customPricing: "Vezi traseul Sistem personalizat", customViewport: "Arhitectură de configurare", customFeatures: [["Date de produs", "CAD", "Datele CAD, desenele, evidența componentelor și cunoștințele de produs devin sursa tehnică a sistemului, păstrând realitatea de fabricație care definește produsul comercial existent."], ["Geometrie", "Geometrie", "Dimensiunile, ansamblurile, conexiunile și relațiile spațiale valide definesc produsul configurabil, astfel încât fiecare schimbare vizuală să rămână credibilă ca rezultat fizic fabricabil."], ["Reguli", "Reguli", "Compatibilitatea, constrângerile, dependențele și selecțiile obligatorii previn configurațiile invalide și explică utilizatorului ce decizii rămân disponibile în fiecare etapă a configurării."], ["Comercial", "Preț", "Logica de preț, structura BOM, marjele și calificarea lead-ului rămân conectate fiecărei decizii vizuale, transformând configurația într-o stare comercială utilizabilă și trasabilă."], ["Flux", "Flux", "Interfața urmează succesiunea reală de decizii folosită de clienți, vânzări și echipe tehnice, reducând diferențele dintre explorare, calificare, verificare inginerească și predare."], ["Integrare", "API", "Configurațiile calificate se pot conecta la CRM, ERP, commerce, date de produs și producție, păstrând opțiunile și contextul proiectului disponibile dincolo de experiența vizuală."]],
    interactive: "Sistem interactiv", viewCase: "Vezi studiul complet", launch: "Deschide configuratorul complet",
    pipeline: "05 / Flux CPQ vizual", pipelineA: "De la interacțiune.", pipelineB: "La rezultat comercial.",
    processLabel: "06 / Parcursul implementării", processA: "De la regulile produsului", processB: "la o interfață vie.",
    ctaLabel: "Construim interfața produsului imposibil", ctaA: "Transformă complexitatea", ctaB: "în ceva firesc.",
    ctaCopy: "Adu-ne produsul prea configurabil, prea tehnic sau prea dificil de explicat. Acolo sistemele spațiale devin cu adevărat valoroase.",
    start: "Începe un proiect",
    capabilities: [
      ["Configurează", "O interfață spațială nativă pentru browser, guvernată de dimensiunile, dependențele și regulile reale de compatibilitate ale produsului."],
      ["Calculează", "Fiecare selecție vizuală intră imediat în modelul comercial—fără transfer manual între client, vânzări și foi de calcul."],
      ["Rezolvă", "Geometria aprobată devine un BOM precis și o structură de componente utilizabilă de echipele din aval."],
      ["Ofertează", "Produsul configurat continuă ca o înregistrare comercială clară, pregătită pentru client și pentru sistemele conectate."],
    ],
    steps: [["Decodificăm", "Produsul, geometria, dependențele și obiectivele comerciale."], ["Construim", "Logica parametrică, activele 3D, prețurile și rezultatele tehnice."], ["Implementăm", "Un configurator spațial integrat în sistemele pe care le folosești deja."]],
  },
  de: {
    heroLabel: "01 / Räumliche Produktinfrastruktur", heroA: "Komplexe Produkte.", heroB: "Unmittelbar verständlich.",
    heroCopy: "Wir übersetzen industrielle Produktlogik in räumliche Systeme, die Menschen in Echtzeit sehen, konfigurieren, kalkulieren und verstehen können.",
    explore: "Live-Systeme entdecken", stage2: "Phase 02 / CAD-Auflösung", breakA: "Das Objekt zerlegen.", breakB: "Das System verstehen.",
    breakCopy: "Geometrie trennt sich in Verglasung, Profile, Dichtungen und thermische Ebenen—und macht die Technik im fertigen Produkt lesbar.",
    stage3: "Phase 03 / Materialintelligenz", surfaceA: "Jede Oberfläche", surfaceB: "trägt eine Entscheidung.",
    surfaceCopy: "Innen- und Außenoberflächen, Maßvorgaben und Produktverhalten bleiben in einem einzigen Konfigurationszustand synchron.",
    scroll: "Scrollen, um aufzulösen", thesis: "03 / Plattformprinzip", thesisA: "Ein Produktzustand.", thesisB: "Jede Entscheidung verknüpft.",
    thesisCopy: "Eine 360Configurator-Implementierung verbindet das interaktive 3D-Produkt, technische Vorgaben, kaufmännische Regeln und nachgelagerte Ergebnisse. Ein Zustand—von der ersten Exploration bis zum qualifizierten Angebot.",
    spatial: "Räumliche Oberfläche", resolved: "Strukturiertes Ergebnis", connected: "Systemanbindung",
    systems: "04 / Realisierte Systeme", systemsA: "Live-Systeme.", systemsB: "Ein wachsendes Feld von Möglichkeiten.",
    systemsCopy: "Entdecken Sie die heute verfügbaren Implementierungen—Teil einer Plattform, die mit Produkten, Branchen und neuen Formen von Komplexität wächst.",
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
} as const;

export const detailCopy = {
  en: { overview: "System overview", capabilities: "Capabilities / 06", resolves: "What the system resolves.", state: "Resolved state", outputA: "From visual decision", outputB: "to usable output.", deployment: "Full deployment", exploreA: "Explore every rule.", exploreB: "Configure the real system.", open: "Open live configurator", continue: "Continue exploring" },
  ro: { overview: "Prezentarea sistemului", capabilities: "Capabilități / 06", resolves: "Ce rezolvă sistemul.", state: "Configurație rezolvată", outputA: "De la decizia vizuală", outputB: "la un rezultat utilizabil.", deployment: "Implementare completă", exploreA: "Explorează fiecare regulă.", exploreB: "Configurează sistemul real.", open: "Deschide configuratorul live", continue: "Continuă explorarea" },
  de: { overview: "Systemüberblick", capabilities: "Funktionen / 06", resolves: "Was das System auflöst.", state: "Aufgelöster Zustand", outputA: "Von der visuellen Entscheidung", outputB: "zum nutzbaren Ergebnis.", deployment: "Vollständige Implementierung", exploreA: "Jede Regel entdecken.", exploreB: "Das reale System konfigurieren.", open: "Live-Konfigurator öffnen", continue: "Weiter entdecken" },
} as const;
