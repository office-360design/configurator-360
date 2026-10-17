import type { Locale } from "./i18n";

export type ConfiguratorSeoContent = {
  intro: {
    label: string;
    heading: string;
    body: string;
    launch: string;
    learn: string;
  };
  workflow: {
    label: string;
    heading: string;
    intro: string;
    steps: { title: string; body: string }[];
  };
  decisions: {
    label: string;
    heading: string;
    intro: string;
    groups: { title: string; body: string; items: string[] }[];
  };
  outcomes: {
    label: string;
    heading: string;
    body: string;
    items: { title: string; body: string }[];
  };
  faq: {
    label: string;
    heading: string;
    items: { question: string; answer: string }[];
  };
  finalCta: {
    eyebrow: string;
    heading: string;
    body: string;
    launch: string;
    contact: string;
  };
};

export const pergolaSeoContent: Record<Locale, ConfiguratorSeoContent> = {
  en: {
    intro: {
      label: "3D pergola planning",
      heading: "Configure the pergola before the quote.",
      body: "The 360Configurator pergola tool starts from a parametric structure rather than a static product image. Choose a freestanding or wall-mounted installation, set the main dimensions, then configure the louvers, each side enclosure and the comfort accessories. The 3D model and estimated price respond as the configuration changes, so the product can be understood before a quote is requested.",
      launch: "Open the 3D pergola configurator",
      learn: "See how it works",
    },
    workflow: {
      label: "How it works",
      heading: "From dimensions to a configured pergola in five steps.",
      intro: "The workflow follows the same decisions that shape the physical product. Each change remains visible in the same spatial model instead of being split across separate forms, drawings and price sheets.",
      steps: [
        { title: "Choose installation and dimensions", body: "Start with a freestanding or wall-mounted pergola, then set width, depth and height within the available configuration limits." },
        { title: "Configure the louvered roof", body: "Set the louver orientation and tilt, then use sun position, north direction and the night preview to understand shade and light conditions." },
        { title: "Resolve every side independently", body: "Keep a side open or add a pull-down screen, motorized screen, privacy element or frameless sliding glass. Each edge of the pergola can be configured separately." },
        { title: "Add lighting, heat and weather sensing", body: "Configure perimeter LED lighting, integrated spotlights, infrared heaters and rain or wind sensors directly on the pergola model." },
        { title: "Review the commercial result", body: "Check the estimated price breakdown and configuration summary, then continue to the quote workflow with the selected geometry and options still synchronized." },
      ],
    },
    decisions: {
      label: "Configuration decisions",
      heading: "Test the choices that actually change the finished pergola.",
      intro: "The configurator is built to make product decisions visible. It is useful when several options interact and a flat catalogue image is no longer enough to explain the result.",
      groups: [
        { title: "Geometry & installation", body: "Establish the overall architectural footprint before accessories are added.", items: ["Freestanding or wall-mounted installation", "Width, depth and overall height", "Louver direction and roof orientation", "Visible dimensions in the 3D scene"] },
        { title: "Light & environment", body: "Evaluate the pergola as lighting conditions change rather than in one fixed render.", items: ["Louver tilt", "Sun-position control", "North-direction control and compass", "Day/night preview and integrated lighting"] },
        { title: "Sides & privacy", body: "Treat each elevation as its own configurable zone.", items: ["Open side", "Pull-down screen", "Motorized screen", "Privacy element", "Frameless sliding glass"] },
        { title: "Comfort & commercial options", body: "Add the options that affect use, automation and the estimated total.", items: ["Perimeter LED lighting", "Integrated spotlights", "Infrared heaters", "Rain and wind sensors", "Estimated price and quote summary"] },
      ],
    },
    outcomes: {
      label: "Why configure in 3D",
      heading: "A better decision before fabrication or installation.",
      body: "A pergola is not a single visual choice. Dimensions, louver behavior, side closures and accessories affect one another. Keeping those choices in one interactive model makes the proposal easier to review and reduces the gap between what is discussed and what is ultimately selected.",
      items: [
        { title: "For the buyer", body: "Compare configurations visually and understand what each option changes before committing to a final proposal." },
        { title: "For sales teams", body: "Keep geometry, visible options and the estimated commercial state aligned during the same conversation." },
        { title: "For configurable-product businesses", body: "Use one browser-based product state as the starting point for a more connected quotation and downstream workflow." },
      ],
    },
    faq: {
      label: "Pergola configurator FAQ",
      heading: "Common questions about the 3D pergola configurator.",
      items: [
        { question: "Can I configure both freestanding and wall-mounted pergolas?", answer: "Yes. The configurator includes both freestanding and wall-mounted installation modes, and the supporting geometry updates according to the selected condition." },
        { question: "Can I change the pergola dimensions?", answer: "Yes. Width, depth and height are configurable, and the parametric structure rebuilds as those dimensions change." },
        { question: "Can I test the louvers, sunlight and night lighting?", answer: "Yes. You can change louver orientation and tilt, adjust sun position and north direction, show the compass and switch to a night preview to inspect the lighting setup." },
        { question: "Which side closures are available?", answer: "Each side can remain open or use a pull-down screen, motorized screen, privacy element or frameless sliding-glass solution, depending on the configuration." },
        { question: "Can I add lighting, heaters and weather sensors?", answer: "Yes. The current configurator supports perimeter LED lighting, integrated spotlights, infrared heaters, and rain and wind sensors positioned on the pergola." },
        { question: "Does the pergola configurator calculate a price?", answer: "It provides an estimated price and breakdown that update with the configured dimensions and options. The summary can then be used as the basis for the quote workflow." },
        { question: "Do I need to install software?", answer: "No. The configurator runs in a modern web browser and uses WebGL for the interactive 3D view." },
      ],
    },
    finalCta: {
      eyebrow: "Try the actual product",
      heading: "Build a pergola configuration in the browser.",
      body: "Open the live configurator to test the geometry, louvers, side closures, lighting and accessories yourself, or contact us if you need a similar configurator for your own product system.",
      launch: "Launch pergola configurator",
      contact: "Discuss a configurator project",
    },
  },
  ro: {
    intro: {
      label: "Proiectare pergolă 3D",
      heading: "Configurează pergola înainte de ofertă.",
      body: "Configuratorul de pergole 3D 360Configurator pornește de la o structură parametrică, nu de la o imagine statică. Alegi montajul independent sau la perete, setezi dimensiunile principale, apoi configurezi lamelele, fiecare închidere laterală și accesoriile de confort. Modelul 3D și prețul estimativ se actualizează pe măsură ce schimbi configurația, astfel încât produsul poate fi înțeles înainte de solicitarea ofertei.",
      launch: "Deschide configuratorul de pergole 3D",
      learn: "Vezi cum funcționează",
    },
    workflow: {
      label: "Cum funcționează",
      heading: "De la dimensiuni la o pergolă configurată în cinci pași.",
      intro: "Fluxul urmărește deciziile care definesc produsul fizic. Fiecare modificare rămâne vizibilă în același model 3D, fără să fie împărțită între formulare, schițe și calcule separate.",
      steps: [
        { title: "Alege montajul și dimensiunile", body: "Pornește cu o pergolă autoportantă sau montată la perete, apoi stabilește lățimea, adâncimea și înălțimea în limitele disponibile." },
        { title: "Configurează acoperișul cu lamele", body: "Alege orientarea și înclinarea lamelelor, apoi folosește poziția soarelui, direcția nordului și previzualizarea de noapte pentru a înțelege umbra și lumina." },
        { title: "Configurează separat fiecare segment", body: "Lasă segmentul deschis sau adaugă un rulou manual, un rulou ZIP motorizat, un perete cu lamele ori panouri glisante din sticlă." },
        { title: "Adaugă iluminat, încălzire și senzori", body: "Configurează LED-ul perimetral, spoturile integrate, încălzitoarele cu infraroșu și senzorii de ploaie sau vânt direct pe modelul pergolei." },
        { title: "Verifică rezultatul comercial", body: "Vezi estimarea de preț, detalierea costurilor și rezumatul configurației, apoi continuă către ofertare fără să pierzi geometria și opțiunile alese." },
      ],
    },
    decisions: {
      label: "Ce poți configura",
      heading: "Testează deciziile care schimbă efectiv pergola finală.",
      intro: "Configuratorul face vizibile opțiunile care se influențează reciproc. Este util atunci când o simplă fotografie de catalog nu mai poate explica suficient diferența dintre două configurații.",
      groups: [
        { title: "Geometrie și montaj", body: "Stabilește forma pergolei înainte de a adăuga accesoriile.", items: ["Montaj autoportant sau la perete", "Lățime, adâncime și înălțime", "Direcția lamelelor și orientarea acoperișului", "Afișarea dimensiunilor în modelul 3D"] },
        { title: "Lumină și orientare", body: "Evaluează pergola în condiții diferite de lumină, nu într-un singur rand static.", items: ["Unghiul lamelelor", "Poziția soarelui", "Direcția nordului și busola", "Previzualizare zi/noapte și iluminat integrat"] },
        { title: "Închideri laterale", body: "Configurează independent fiecare segment al pergolei.", items: ["Latură deschisă", "Rulou textil manual", "Rulou ZIP motorizat", "Perete cu lamele", "Panouri glisante din sticlă"] },
        { title: "Confort și opțiuni comerciale", body: "Adaugă elementele care influențează utilizarea, automatizarea și totalul estimativ.", items: ["LED perimetral", "Spoturi integrate", "Încălzitoare cu infraroșu", "Senzori de ploaie și vânt", "Preț estimativ și rezumat de ofertă"] },
      ],
    },
    outcomes: {
      label: "De ce configurare 3D",
      heading: "O decizie mai clară înainte de fabricație sau montaj.",
      body: "O pergolă nu înseamnă o singură alegere vizuală. Dimensiunile, comportamentul lamelelor, închiderile laterale și accesoriile se influențează reciproc. Păstrarea lor într-un singur model interactiv face propunerea mai ușor de verificat și reduce diferența dintre ceea ce se discută și ceea ce se selectează în final.",
      items: [
        { title: "Pentru client", body: "Compară vizual configurații și înțelege ce schimbă fiecare opțiune înainte de alegerea variantei finale." },
        { title: "Pentru echipa de vânzări", body: "Păstrează geometria, opțiunile vizibile și estimarea comercială sincronizate în aceeași discuție." },
        { title: "Pentru producători și distribuitori", body: "Folosește configurația din browser ca punct de pornire pentru ofertare și procesarea comenzii." },
      ],
    },
    faq: {
      label: "Întrebări despre configurator",
      heading: "Întrebări frecvente despre configuratorul de pergole 3D.",
      items: [
        { question: "Pot configura atât o pergolă autoportantă, cât și una montată la perete?", answer: "Da. Configuratorul include montaj autoportant și montaj la perete, iar structura de susținere se adaptează opțiunii alese." },
        { question: "Pot modifica dimensiunile pergolei?", answer: "Da. Lățimea, adâncimea și înălțimea sunt configurabile, iar structura parametrică se reconstruiește pe măsură ce dimensiunile se schimbă." },
        { question: "Pot testa lamelele, poziția soarelui și iluminatul de noapte?", answer: "Da. Poți schimba orientarea și unghiul lamelelor, poziția soarelui și direcția nordului, poți afișa busola și poți activa previzualizarea de noapte pentru a verifica iluminatul." },
        { question: "Ce tipuri de închideri laterale pot adăuga?", answer: "Fiecare segment poate rămâne deschis sau poate avea rulou textil manual, rulou ZIP motorizat, perete cu lamele ori panouri glisante din sticlă." },
        { question: "Pot adăuga iluminat, încălzitoare și senzori meteo?", answer: "Da. Configuratorul actual permite LED perimetral, spoturi integrate, încălzitoare cu infraroșu și senzori de ploaie și vânt poziționați pe pergolă." },
        { question: "Configuratorul de pergole calculează și prețul?", answer: "Da, afișează un preț estimativ și o detaliere care se actualizează în funcție de dimensiuni și opțiuni. Rezumatul poate fi apoi folosit ca bază pentru fluxul de ofertare." },
        { question: "Trebuie să instalez un program pentru a folosi configuratorul?", answer: "Nu. Configuratorul rulează direct într-un browser modern și folosește WebGL pentru vizualizarea 3D interactivă." },
      ],
    },
    finalCta: {
      eyebrow: "Testează produsul real",
      heading: "Construiește o configurație de pergolă direct în browser.",
      body: "Deschide configuratorul pentru a testa geometria, lamelele, închiderile laterale, iluminatul și accesoriile sau contactează-ne dacă ai nevoie de un configurator similar pentru propria gamă de produse.",
      launch: "Deschide configuratorul de pergole",
      contact: "Discută un proiect de configurator",
    },
  },
  de: {
    intro: {
      label: "3D Pergola-Planung",
      heading: "Konfigurieren Sie die Pergola vor dem Angebot.",
      body: "Der 3D Pergola-Konfigurator von 360Configurator basiert auf einer parametrischen Struktur statt auf einem statischen Produktbild. Wählen Sie freistehende oder wandmontierte Ausführung, legen Sie die Hauptmaße fest und konfigurieren Sie anschließend Lamellen, jede Seitenlösung und Komfortzubehör. 3D-Modell und geschätzter Preis reagieren auf die Änderungen, sodass das Produkt vor der Angebotsanfrage verständlich wird.",
      launch: "3D Pergola-Konfigurator öffnen",
      learn: "So funktioniert es",
    },
    workflow: {
      label: "So funktioniert es",
      heading: "In fünf Schritten von den Maßen zur konfigurierten Pergola.",
      intro: "Der Ablauf folgt den Entscheidungen, die das reale Produkt bestimmen. Jede Änderung bleibt im selben räumlichen Modell sichtbar, anstatt auf getrennte Formulare, Zeichnungen und Preislisten verteilt zu werden.",
      steps: [
        { title: "Montageart und Maße wählen", body: "Beginnen Sie mit einer freistehenden oder wandmontierten Pergola und legen Sie Breite, Tiefe und Höhe innerhalb der verfügbaren Konfigurationsgrenzen fest." },
        { title: "Lamellendach konfigurieren", body: "Bestimmen Sie Ausrichtung und Neigung der Lamellen und nutzen Sie Sonnenstand, Nordrichtung und Nachtansicht, um Licht und Verschattung zu beurteilen." },
        { title: "Jede Seite separat lösen", body: "Lassen Sie eine Seite offen oder ergänzen Sie Screen, motorisierten Screen, Sichtschutzelement oder rahmenlose Schiebeverglasung. Jede Pergolaseite kann unabhängig konfiguriert werden." },
        { title: "Licht, Wärme und Sensorik ergänzen", body: "Konfigurieren Sie umlaufende LED-Beleuchtung, integrierte Spots, Infrarotstrahler sowie Regen- oder Windsensoren direkt am Pergolamodell." },
        { title: "Kaufmännisches Ergebnis prüfen", body: "Prüfen Sie die geschätzte Preisaufstellung und die Konfigurationsübersicht und gehen Sie anschließend in den Angebotsprozess, ohne Geometrie und Optionen neu erfassen zu müssen." },
      ],
    },
    decisions: {
      label: "Konfigurierbare Entscheidungen",
      heading: "Testen Sie die Optionen, die die fertige Pergola wirklich verändern.",
      intro: "Der Konfigurator macht Wechselwirkungen zwischen Produktoptionen sichtbar. Das ist besonders hilfreich, wenn ein einzelnes Katalogbild die Unterschiede zwischen zwei Konfigurationen nicht mehr ausreichend erklären kann.",
      groups: [
        { title: "Geometrie & Montage", body: "Legen Sie zuerst die architektonische Grundform fest.", items: ["Freistehende oder wandmontierte Ausführung", "Breite, Tiefe und Gesamthöhe", "Lamellenrichtung und Dachorientierung", "Maßanzeige in der 3D-Szene"] },
        { title: "Licht & Orientierung", body: "Bewerten Sie die Pergola unter wechselnden Lichtbedingungen statt nur in einem festen Rendering.", items: ["Lamellenwinkel", "Sonnenstand", "Nordrichtung und Kompass", "Tag-/Nachtansicht und integrierte Beleuchtung"] },
        { title: "Seiten & Privatsphäre", body: "Behandeln Sie jede Seite als eigenständige konfigurierbare Zone.", items: ["Offene Seite", "Manueller Screen", "Motorisierter Screen", "Sichtschutzelement", "Rahmenlose Schiebeverglasung"] },
        { title: "Komfort & kaufmännische Optionen", body: "Ergänzen Sie Komponenten, die Nutzung, Automatisierung und den geschätzten Gesamtpreis beeinflussen.", items: ["Umlaufende LED-Beleuchtung", "Integrierte Spots", "Infrarotstrahler", "Regen- und Windsensoren", "Geschätzter Preis und Angebotsübersicht"] },
      ],
    },
    outcomes: {
      label: "Warum 3D-Konfiguration",
      heading: "Eine klarere Entscheidung vor Fertigung oder Montage.",
      body: "Eine Pergola besteht nicht aus nur einer visuellen Entscheidung. Maße, Lamellenverhalten, Seitenabschlüsse und Zubehör beeinflussen sich gegenseitig. Ein gemeinsames interaktives Modell macht den Vorschlag leichter prüfbar und verkleinert die Lücke zwischen Beratung und tatsächlich gewählter Ausführung.",
      items: [
        { title: "Für Käufer", body: "Vergleichen Sie Varianten visuell und erkennen Sie vor der finalen Entscheidung, was jede Option am Produkt verändert." },
        { title: "Für Vertriebsteams", body: "Halten Sie Geometrie, sichtbare Optionen und den geschätzten kaufmännischen Zustand im selben Gespräch synchron." },
        { title: "Für Hersteller und Händler", body: "Nutzen Sie einen browserbasierten Produktzustand als Ausgangspunkt für einen stärker verbundenen Angebots- und Folgeprozess." },
      ],
    },
    faq: {
      label: "Pergola-Konfigurator FAQ",
      heading: "Häufige Fragen zum 3D Pergola-Konfigurator.",
      items: [
        { question: "Kann ich freistehende und wandmontierte Pergolen konfigurieren?", answer: "Ja. Der Konfigurator unterstützt freistehende und wandmontierte Ausführungen; die Traggeometrie passt sich an die gewählte Montageart an." },
        { question: "Kann ich die Pergolamaße verändern?", answer: "Ja. Breite, Tiefe und Höhe sind konfigurierbar und die parametrische Struktur wird bei Maßänderungen neu aufgebaut." },
        { question: "Kann ich Lamellen, Sonnenstand und Nachtbeleuchtung testen?", answer: "Ja. Sie können Lamellenausrichtung und -winkel, Sonnenstand und Nordrichtung ändern, den Kompass einblenden und in die Nachtansicht wechseln, um die Beleuchtung zu prüfen." },
        { question: "Welche Seitenabschlüsse kann ich hinzufügen?", answer: "Jede Seite kann offen bleiben oder mit manuellem Screen, motorisiertem Screen, Sichtschutzelement oder rahmenloser Schiebeverglasung konfiguriert werden." },
        { question: "Kann ich Beleuchtung, Heizstrahler und Wettersensoren ergänzen?", answer: "Ja. Der aktuelle Konfigurator unterstützt umlaufende LEDs, integrierte Spots, Infrarotstrahler sowie Regen- und Windsensoren am Pergolamodell." },
        { question: "Berechnet der Pergola-Konfigurator auch einen Preis?", answer: "Er zeigt einen geschätzten Preis mit Aufschlüsselung, der sich mit Maßen und Optionen aktualisiert. Die Zusammenfassung kann anschließend als Grundlage für den Angebotsprozess dienen." },
        { question: "Muss ich Software installieren?", answer: "Nein. Der Konfigurator läuft direkt in einem modernen Webbrowser und verwendet WebGL für die interaktive 3D-Darstellung." },
      ],
    },
    finalCta: {
      eyebrow: "Das echte Produkt testen",
      heading: "Erstellen Sie eine Pergola-Konfiguration direkt im Browser.",
      body: "Öffnen Sie den Live-Konfigurator und testen Sie Geometrie, Lamellen, Seitenabschlüsse, Beleuchtung und Zubehör selbst. Oder sprechen Sie mit uns, wenn Sie einen vergleichbaren Konfigurator für Ihr eigenes Produktsystem benötigen.",
      launch: "Pergola-Konfigurator starten",
      contact: "Konfigurator-Projekt besprechen",
    },
  },
  es: {
    intro: {
      label: "Diseño 3D de pérgolas",
      heading: "Configure la pérgola antes del presupuesto.",
      body: "El configurador de pérgolas bioclimáticas de 360Configurator parte de una estructura paramétrica, no de una imagen estática del producto. Elija una instalación exenta o adosada a la pared, defina las dimensiones principales y configure las lamas, el cerramiento de cada lateral y los accesorios de confort. El modelo 3D y el precio estimado responden a cada cambio, de modo que el producto se entiende antes de pedir un presupuesto.",
      launch: "Abrir el configurador 3D de pérgolas",
      learn: "Ver cómo funciona",
    },
    workflow: {
      label: "Cómo funciona",
      heading: "De las dimensiones a una pérgola configurada en cinco pasos.",
      intro: "El proceso sigue las mismas decisiones que definen el producto físico. Cada cambio permanece visible en el mismo modelo espacial, en lugar de repartirse entre formularios, planos y hojas de precios.",
      steps: [
        { title: "Elija instalación y dimensiones", body: "Empiece con una pérgola exenta o adosada y defina ancho, fondo y alto dentro de los límites de configuración disponibles." },
        { title: "Configure la cubierta de lamas", body: "Ajuste la orientación y la inclinación de las lamas y use la posición del sol, la orientación norte y la vista nocturna para entender la sombra y la luz." },
        { title: "Resuelva cada lateral por separado", body: "Deje un lateral abierto o añada un estor enrollable manual, un estor motorizado, un panel de privacidad o un cerramiento de vidrio corredero sin perfiles. Cada lado de la pérgola se configura de forma independiente." },
        { title: "Añada iluminación, calefacción y sensores", body: "Configure la iluminación LED perimetral, focos integrados, calefactores infrarrojos y sensores de lluvia o viento directamente sobre el modelo de la pérgola." },
        { title: "Revise el resultado comercial", body: "Compruebe el desglose de precio estimado y el resumen de configuración y continúe hacia la solicitud de presupuesto con la geometría y las opciones sincronizadas." },
      ],
    },
    decisions: {
      label: "Decisiones de configuración",
      heading: "Pruebe las opciones que cambian de verdad la pérgola terminada.",
      intro: "El configurador está pensado para hacer visibles las decisiones de producto. Resulta útil cuando varias opciones interactúan y una imagen plana de catálogo ya no basta para explicar el resultado.",
      groups: [
        { title: "Geometría e instalación", body: "Defina la huella arquitectónica general antes de añadir accesorios.", items: ["Instalación exenta o adosada", "Ancho, fondo y altura total", "Dirección de las lamas y orientación de la cubierta", "Cotas visibles en la escena 3D"] },
        { title: "Luz y entorno", body: "Evalúe la pérgola con distintas condiciones de luz, no en un único render fijo.", items: ["Inclinación de las lamas", "Control de la posición del sol", "Orientación norte y brújula", "Vista día/noche e iluminación integrada"] },
        { title: "Laterales y privacidad", body: "Trate cada fachada como una zona configurable propia.", items: ["Lateral abierto", "Estor enrollable manual", "Estor motorizado", "Panel de privacidad", "Vidrio corredero sin perfiles"] },
        { title: "Confort y opciones comerciales", body: "Añada las opciones que influyen en el uso, la automatización y el total estimado.", items: ["Iluminación LED perimetral", "Focos integrados", "Calefactores infrarrojos", "Sensores de lluvia y viento", "Precio estimado y resumen para presupuesto"] },
      ],
    },
    outcomes: {
      label: "Por qué configurar en 3D",
      heading: "Una mejor decisión antes de fabricar o instalar.",
      body: "Una pérgola no es una única elección visual. Las dimensiones, el comportamiento de las lamas, los cerramientos laterales y los accesorios se influyen entre sí. Mantener esas decisiones en un único modelo interactivo facilita la revisión de la propuesta y reduce la distancia entre lo que se habla y lo que finalmente se elige.",
      items: [
        { title: "Para el comprador", body: "Compare configuraciones visualmente y entienda qué cambia cada opción antes de comprometerse con una propuesta final." },
        { title: "Para los equipos comerciales", body: "Mantenga alineados la geometría, las opciones visibles y el estado comercial estimado durante la misma conversación." },
        { title: "Para empresas de productos configurables", body: "Use un único estado de producto en el navegador como punto de partida de un proceso de presupuesto y producción más conectado." },
      ],
    },
    faq: {
      label: "Preguntas sobre el configurador de pérgolas",
      heading: "Preguntas frecuentes sobre el configurador 3D de pérgolas.",
      items: [
        { question: "¿Puedo configurar pérgolas exentas y adosadas?", answer: "Sí. El configurador incluye los modos de instalación exenta y adosada a la pared, y la estructura portante se actualiza según la opción elegida." },
        { question: "¿Puedo cambiar las dimensiones de la pérgola?", answer: "Sí. Ancho, fondo y alto son configurables, y la estructura paramétrica se reconstruye al cambiar esas dimensiones." },
        { question: "¿Puedo probar las lamas, la luz solar y la iluminación nocturna?", answer: "Sí. Puede cambiar la orientación y la inclinación de las lamas, ajustar la posición del sol y la orientación norte, mostrar la brújula y pasar a la vista nocturna para revisar la iluminación." },
        { question: "¿Qué cerramientos laterales hay disponibles?", answer: "Cada lateral puede quedar abierto o llevar un estor enrollable manual, un estor motorizado, un panel de privacidad o un vidrio corredero sin perfiles, según la configuración." },
        { question: "¿Puedo añadir iluminación, calefactores y sensores meteorológicos?", answer: "Sí. El configurador actual admite iluminación LED perimetral, focos integrados, calefactores infrarrojos y sensores de lluvia y viento colocados en la pérgola." },
        { question: "¿El configurador de pérgolas calcula un precio?", answer: "Ofrece un precio estimado y un desglose que se actualizan con las dimensiones y opciones configuradas. El resumen puede servir después como base para el presupuesto." },
        { question: "¿Necesito instalar algún software?", answer: "No. El configurador funciona en un navegador web moderno y utiliza WebGL para la vista 3D interactiva." },
      ],
    },
    finalCta: {
      eyebrow: "Pruebe el producto real",
      heading: "Configure una pérgola directamente en el navegador.",
      body: "Abra el configurador en directo para probar usted mismo la geometría, las lamas, los cerramientos laterales, la iluminación y los accesorios, o contacte con nosotros si necesita un configurador similar para su propio sistema de producto.",
      launch: "Abrir el configurador de pérgolas",
      contact: "Hablar de un proyecto de configurador",
    },
  },
  fr: {
    intro: {
      label: "Conception 3D de pergolas",
      heading: "Configurez la pergola avant le devis.",
      body: "Le configurateur de pergolas bioclimatiques 360Configurator part d’une structure paramétrique, et non d’une image produit figée. Choisissez une pose autoportante ou adossée, définissez les dimensions principales, puis configurez les lames, la fermeture de chaque côté et les accessoires de confort. Le modèle 3D et le prix estimé réagissent à chaque modification : le produit est compris avant même la demande de devis.",
      launch: "Ouvrir le configurateur 3D de pergolas",
      learn: "Voir le fonctionnement",
    },
    workflow: {
      label: "Fonctionnement",
      heading: "Des dimensions à une pergola configurée en cinq étapes.",
      intro: "Le parcours suit les décisions qui définissent le produit réel. Chaque modification reste visible dans le même modèle spatial au lieu d’être dispersée entre formulaires, plans et grilles tarifaires.",
      steps: [
        { title: "Choisir la pose et les dimensions", body: "Commencez par une pergola autoportante ou adossée, puis réglez largeur, profondeur et hauteur dans les limites de configuration disponibles." },
        { title: "Configurer la toiture à lames", body: "Réglez l’orientation et l’inclinaison des lames, puis utilisez la position du soleil, l’orientation nord et l’aperçu nocturne pour comprendre l’ombre et la lumière." },
        { title: "Traiter chaque côté séparément", body: "Laissez un côté ouvert ou ajoutez un store manuel, un store motorisé, un panneau occultant ou un vitrage coulissant sans cadre. Chaque côté de la pergola se configure indépendamment." },
        { title: "Ajouter éclairage, chauffage et capteurs", body: "Configurez l’éclairage LED périphérique, les spots intégrés, les chauffages infrarouges et les capteurs de pluie ou de vent directement sur le modèle de pergola." },
        { title: "Vérifier le résultat commercial", body: "Contrôlez le détail du prix estimé et le récapitulatif de configuration, puis passez à la demande de devis avec la géométrie et les options toujours synchronisées." },
      ],
    },
    decisions: {
      label: "Choix de configuration",
      heading: "Testez les choix qui modifient réellement la pergola finie.",
      intro: "Le configurateur est conçu pour rendre les décisions produit visibles. Il est utile lorsque plusieurs options interagissent et qu’une image de catalogue ne suffit plus à expliquer le résultat.",
      groups: [
        { title: "Géométrie et pose", body: "Fixez l’emprise architecturale globale avant d’ajouter des accessoires.", items: ["Pose autoportante ou adossée", "Largeur, profondeur et hauteur totale", "Sens des lames et orientation de la toiture", "Cotes visibles dans la scène 3D"] },
        { title: "Lumière et environnement", body: "Évaluez la pergola selon l’évolution de la lumière, et non sur un seul rendu figé.", items: ["Inclinaison des lames", "Réglage de la position du soleil", "Orientation nord et boussole", "Aperçu jour/nuit et éclairage intégré"] },
        { title: "Côtés et intimité", body: "Traitez chaque façade comme une zone configurable à part entière.", items: ["Côté ouvert", "Store manuel", "Store motorisé", "Panneau occultant", "Vitrage coulissant sans cadre"] },
        { title: "Confort et options commerciales", body: "Ajoutez les options qui influent sur l’usage, l’automatisation et le total estimé.", items: ["Éclairage LED périphérique", "Spots intégrés", "Chauffages infrarouges", "Capteurs de pluie et de vent", "Prix estimé et récapitulatif de devis"] },
      ],
    },
    outcomes: {
      label: "Pourquoi configurer en 3D",
      heading: "Une meilleure décision avant la fabrication ou la pose.",
      body: "Une pergola ne se résume pas à un choix esthétique. Dimensions, comportement des lames, fermetures latérales et accessoires s’influencent mutuellement. Réunir ces choix dans un seul modèle interactif facilite la validation de la proposition et réduit l’écart entre ce qui est discuté et ce qui est finalement retenu.",
      items: [
        { title: "Pour l’acheteur", body: "Comparez visuellement les configurations et comprenez l’effet de chaque option avant de valider une proposition finale." },
        { title: "Pour les équipes commerciales", body: "Gardez la géométrie, les options visibles et l’état commercial estimé alignés au cours d’un même échange." },
        { title: "Pour les entreprises de produits configurables", body: "Utilisez un état produit unique dans le navigateur comme point de départ d’un chiffrage et d’un processus aval mieux connectés." },
      ],
    },
    faq: {
      label: "FAQ configurateur de pergolas",
      heading: "Questions fréquentes sur le configurateur 3D de pergolas.",
      items: [
        { question: "Puis-je configurer des pergolas autoportantes et adossées ?", answer: "Oui. Le configurateur propose les modes de pose autoportante et adossée, et la structure porteuse s’adapte à l’option choisie." },
        { question: "Puis-je modifier les dimensions de la pergola ?", answer: "Oui. Largeur, profondeur et hauteur sont configurables, et la structure paramétrique se reconstruit à chaque changement de dimension." },
        { question: "Puis-je tester les lames, l’ensoleillement et l’éclairage nocturne ?", answer: "Oui. Vous pouvez modifier l’orientation et l’inclinaison des lames, ajuster la position du soleil et l’orientation nord, afficher la boussole et passer en aperçu nocturne pour examiner l’éclairage." },
        { question: "Quelles fermetures latérales sont disponibles ?", answer: "Chaque côté peut rester ouvert ou recevoir un store manuel, un store motorisé, un panneau occultant ou un vitrage coulissant sans cadre, selon la configuration." },
        { question: "Puis-je ajouter éclairage, chauffages et capteurs météo ?", answer: "Oui. Le configurateur actuel gère l’éclairage LED périphérique, les spots intégrés, les chauffages infrarouges ainsi que les capteurs de pluie et de vent placés sur la pergola." },
        { question: "Le configurateur de pergolas calcule-t-il un prix ?", answer: "Il fournit un prix estimé et son détail, mis à jour selon les dimensions et options configurées. Le récapitulatif peut ensuite servir de base au devis." },
        { question: "Dois-je installer un logiciel ?", answer: "Non. Le configurateur fonctionne dans un navigateur web récent et utilise WebGL pour la vue 3D interactive." },
      ],
    },
    finalCta: {
      eyebrow: "Essayez le vrai produit",
      heading: "Configurez une pergola directement dans le navigateur.",
      body: "Ouvrez le configurateur en ligne pour tester vous-même la géométrie, les lames, les fermetures latérales, l’éclairage et les accessoires, ou contactez-nous si vous avez besoin d’un configurateur similaire pour votre propre gamme.",
      launch: "Lancer le configurateur de pergolas",
      contact: "Parler d’un projet de configurateur",
    },
  },
  it: {
    intro: {
      label: "Progettazione 3D di pergole",
      heading: "Configuri la pergola prima del preventivo.",
      body: "Il configuratore di pergole bioclimatiche 360Configurator parte da una struttura parametrica, non da un’immagine statica del prodotto. Scelga un’installazione autoportante o addossata a parete, imposti le dimensioni principali, poi configuri le lamelle, la chiusura di ogni lato e gli accessori per il comfort. Il modello 3D e il prezzo stimato reagiscono a ogni modifica, così il prodotto è chiaro prima ancora di richiedere un preventivo.",
      launch: "Apri il configuratore 3D di pergole",
      learn: "Scopra come funziona",
    },
    workflow: {
      label: "Come funziona",
      heading: "Dalle dimensioni a una pergola configurata in cinque passaggi.",
      intro: "Il percorso segue le stesse decisioni che definiscono il prodotto reale. Ogni modifica resta visibile nello stesso modello spaziale, invece di essere suddivisa tra moduli, disegni e listini.",
      steps: [
        { title: "Scelga installazione e dimensioni", body: "Parta da una pergola autoportante o addossata, poi imposti larghezza, profondità e altezza entro i limiti di configurazione disponibili." },
        { title: "Configuri la copertura a lamelle", body: "Imposti orientamento e inclinazione delle lamelle, poi usi posizione del sole, direzione nord e anteprima notturna per valutare ombra e luce." },
        { title: "Definisca ogni lato separatamente", body: "Lasci un lato aperto o aggiunga una tenda manuale, una tenda motorizzata, un pannello privacy o una vetrata scorrevole senza telaio. Ogni lato della pergola si configura in modo indipendente." },
        { title: "Aggiunga luci, riscaldamento e sensori", body: "Configuri illuminazione LED perimetrale, faretti integrati, riscaldatori a infrarossi e sensori di pioggia o vento direttamente sul modello della pergola." },
        { title: "Verifichi il risultato commerciale", body: "Controlli il dettaglio del prezzo stimato e il riepilogo della configurazione, poi prosegua verso il preventivo con geometria e opzioni sempre sincronizzate." },
      ],
    },
    decisions: {
      label: "Scelte di configurazione",
      heading: "Provi le scelte che cambiano davvero la pergola finita.",
      intro: "Il configuratore è pensato per rendere visibili le decisioni di prodotto. È utile quando più opzioni interagiscono e un’immagine di catalogo non basta più a spiegare il risultato.",
      groups: [
        { title: "Geometria e installazione", body: "Definisca l’ingombro architettonico complessivo prima di aggiungere accessori.", items: ["Installazione autoportante o addossata", "Larghezza, profondità e altezza totale", "Direzione delle lamelle e orientamento della copertura", "Quote visibili nella scena 3D"] },
        { title: "Luce e ambiente", body: "Valuti la pergola al variare della luce, non in un unico render statico.", items: ["Inclinazione delle lamelle", "Controllo della posizione del sole", "Direzione nord e bussola", "Anteprima giorno/notte e illuminazione integrata"] },
        { title: "Lati e privacy", body: "Tratti ogni prospetto come una zona configurabile a sé.", items: ["Lato aperto", "Tenda manuale", "Tenda motorizzata", "Pannello privacy", "Vetrata scorrevole senza telaio"] },
        { title: "Comfort e opzioni commerciali", body: "Aggiunga le opzioni che influiscono su utilizzo, automazione e totale stimato.", items: ["Illuminazione LED perimetrale", "Faretti integrati", "Riscaldatori a infrarossi", "Sensori di pioggia e vento", "Prezzo stimato e riepilogo per il preventivo"] },
      ],
    },
    outcomes: {
      label: "Perché configurare in 3D",
      heading: "Una decisione migliore prima di produzione o posa.",
      body: "Una pergola non è una singola scelta estetica. Dimensioni, comportamento delle lamelle, chiusure laterali e accessori si influenzano a vicenda. Mantenere queste scelte in un unico modello interattivo rende la proposta più facile da valutare e riduce la distanza tra ciò che si discute e ciò che si sceglie alla fine.",
      items: [
        { title: "Per l’acquirente", body: "Confronti le configurazioni visivamente e capisca cosa cambia ogni opzione prima di impegnarsi su una proposta finale." },
        { title: "Per i team commerciali", body: "Mantenga allineati geometria, opzioni visibili e stato commerciale stimato nel corso della stessa conversazione." },
        { title: "Per le aziende di prodotti configurabili", body: "Usi un unico stato di prodotto nel browser come punto di partenza per un preventivo e un flusso a valle più connessi." },
      ],
    },
    faq: {
      label: "FAQ configuratore di pergole",
      heading: "Domande frequenti sul configuratore 3D di pergole.",
      items: [
        { question: "Posso configurare pergole autoportanti e addossate?", answer: "Sì. Il configuratore include le modalità di installazione autoportante e addossata a parete, e la struttura portante si aggiorna in base all’opzione scelta." },
        { question: "Posso modificare le dimensioni della pergola?", answer: "Sì. Larghezza, profondità e altezza sono configurabili e la struttura parametrica si ricostruisce al variare delle dimensioni." },
        { question: "Posso provare lamelle, luce solare e illuminazione notturna?", answer: "Sì. Può cambiare orientamento e inclinazione delle lamelle, regolare la posizione del sole e la direzione nord, mostrare la bussola e passare all’anteprima notturna per verificare l’illuminazione." },
        { question: "Quali chiusure laterali sono disponibili?", answer: "Ogni lato può restare aperto oppure avere una tenda manuale, una tenda motorizzata, un pannello privacy o una vetrata scorrevole senza telaio, a seconda della configurazione." },
        { question: "Posso aggiungere luci, riscaldatori e sensori meteo?", answer: "Sì. Il configuratore attuale supporta illuminazione LED perimetrale, faretti integrati, riscaldatori a infrarossi e sensori di pioggia e vento posizionati sulla pergola." },
        { question: "Il configuratore di pergole calcola un prezzo?", answer: "Fornisce un prezzo stimato con dettaglio, aggiornato in base alle dimensioni e alle opzioni configurate. Il riepilogo può poi servire come base per il preventivo." },
        { question: "Devo installare un software?", answer: "No. Il configuratore funziona in un browser moderno e utilizza WebGL per la vista 3D interattiva." },
      ],
    },
    finalCta: {
      eyebrow: "Provi il prodotto reale",
      heading: "Configuri una pergola direttamente nel browser.",
      body: "Apra il configuratore online per provare in prima persona geometria, lamelle, chiusure laterali, illuminazione e accessori, oppure ci contatti se le serve un configuratore simile per il suo sistema di prodotto.",
      launch: "Avvia il configuratore di pergole",
      contact: "Parliamo di un progetto di configuratore",
    },
  },
};
