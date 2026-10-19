// Public buyer guidance. Market-research volumes and account data stay private.
export const homeMetadata = {
  en: {
    title: '3D Product Configurator Software for Manufacturers',
    description: '3D product configurator software for manufacturers and distributors. Explore product rules, pricing and material outputs, then discuss your implementation.',
  },
  ro: {
    title: 'Dezvoltare configuratoare 3D pentru producători',
    description: 'Dezvoltăm configuratoare 3D pentru producători și distribuitori. Vezi exemple de reguli, ofertare și liste de materiale și discută implementarea pentru produsul tău.',
  },
  de: {
    title: '3D-Produktkonfigurator für Hersteller',
    description: '3D-Produktkonfiguratoren für Hersteller und Händler. Prüfen Sie Produktregeln, Kalkulation und Stücklisten am Beispiel und besprechen Sie Ihre Umsetzung.',
  },
  es: {
    title: 'Software configurador 3D de productos para fabricantes',
    description: 'Software configurador 3D de productos para fabricantes y distribuidores. Explore reglas de producto, precios y listas de materiales y hablemos de su proyecto.',
  },
  fr: {
    title: 'Logiciel configurateur 3D de produits pour fabricants',
    description: 'Logiciel configurateur 3D de produits pour fabricants et distributeurs. Découvrez règles produit, chiffrage et nomenclatures, puis parlons de votre projet.',
  },
  it: {
    title: 'Software configuratore 3D di prodotto per produttori',
    description: 'Software configuratore 3D di prodotto per produttori e distributori. Scopra regole di prodotto, prezzi e distinte materiali e parli con noi del suo progetto.',
  },
} as const;

export const pricingGuideCopy = {
  en: {
    metadata: {title: 'Product Configurator Cost and Implementation', description: 'Understand product configurator costs: existing software, adaptation or custom development. Compare implementation, subscription and the inputs needed for a quote.'},
    label: 'Cost breakdown', title: 'Separate the build from the running costs.',
    body: 'Your proposal separates any product-specific development from the ongoing subscription. The starting point is whether an existing configurator already supports your product rules.',
    items: [
      ['Implementation or adaptation', 'New geometry, product rules, pricing calculations, bill of materials and integrations are assessed for your catalogue. Standard setup is included when an existing system fits.'],
      ['Ongoing subscription', 'Hosting, platform updates, routine maintenance and technical support continue after launch. The subscription is billed monthly or annually, separately from scoped development.'],
      ['Later product changes', 'New components, rules, outputs or integrations are reviewed separately. The proposal defines what is included, who supplies and validates the data, dependencies and acceptance criteria.'],
    ],
    example: 'See a roof configuration become a material list',
    action: 'Request scope and pricing',
    faqIntro: 'These answers explain the implementation model. The technical review establishes the work, data responsibilities and services to include in your proposal.',
  },
  ro: {
    metadata: {title: 'Costuri și implementare configuratoare 3D', description: 'Ce influențează costul unui configurator 3D? Compară soluția existentă, adaptarea și dezvoltarea nouă, abonamentul și datele necesare pentru ofertă.'},
    label: 'Structura costurilor', title: 'Separă implementarea de costurile de operare.',
    body: 'Oferta separă dezvoltarea specifică produsului de abonamentul pentru operare. Pornim de la o întrebare: regulile produsului tău sunt deja acoperite de un configurator existent?',
    items: [
      ['Implementare sau adaptare', 'Evaluăm geometria nouă, regulile, calculul de preț, lista de materiale și integrările pentru catalogul tău. Configurarea standard este inclusă când se potrivește un sistem existent.'],
      ['Abonament pentru operare', 'Găzduirea, actualizările, mentenanța obișnuită și suportul tehnic continuă după lansare. Abonamentul se facturează lunar sau anual, separat de dezvoltarea estimată.'],
      ['Modificări ulterioare', 'Componentele, regulile, rezultatele sau integrările noi se evaluează separat. Oferta precizează ce este inclus, cine furnizează și validează datele, dependențele și criteriile de acceptare.'],
    ],
    example: 'Vezi calculul unei liste de materiale pentru acoperiș',
    action: 'Solicită evaluarea proiectului',
    faqIntro: 'Răspunsurile explică modelul de implementare. În analiza tehnică stabilim lucrările, responsabilitatea datelor și serviciile care vor intra în oferta pentru produsul tău.',
  },
  de: {
    metadata: {title: 'Produktkonfigurator Kosten und Umsetzung', description: 'Was kostet ein Produktkonfigurator? Vergleichen Sie bestehende Software, Anpassung und Neuentwicklung sowie Abonnement und Unterlagen für ein Angebot.'},
    label: 'Kostenaufteilung', title: 'Einmalige und laufende Kosten.',
    body: 'Das Angebot trennt produktspezifische Entwicklung vom laufenden Abonnement. Entscheidend ist zunächst, ob ein bestehender Konfigurator Ihre Produktregeln bereits abbildet.',
    items: [
      ['Implementierung oder Anpassung', 'Neue Geometrie, Produktregeln, Kalkulation, Stücklisten und Schnittstellen werden für Ihren Katalog geprüft. Passt ein bestehendes System, ist die Standardeinrichtung enthalten.'],
      ['Laufendes Abonnement', 'Hosting, Plattformupdates, reguläre Wartung und technischer Support laufen nach dem Start weiter. Das Abonnement wird monatlich oder jährlich berechnet, getrennt von vereinbarter Entwicklung.'],
      ['Spätere Produktänderungen', 'Neue Komponenten, Regeln, Ausgaben oder Schnittstellen werden separat bewertet. Das Angebot hält Leistungen, Datenbereitstellung und Validierung, Abhängigkeiten sowie Abnahmekriterien fest.'],
    ],
    example: 'Vom konfigurierten Dach zur berechneten Stückliste',
    action: 'Umfang und Preis anfragen',
    faqIntro: 'Diese Antworten erläutern das Implementierungsmodell. In der technischen Prüfung klären wir Arbeiten, Datenverantwortung und Leistungen für Ihr konkretes Angebot.',
  },
  es: {
    metadata: {title: 'Coste e implantación de un configurador de productos', description: '¿Cuánto cuesta un configurador de productos? Compare software existente, adaptación o desarrollo a medida, implantación, suscripción y datos necesarios para la oferta.'},
    label: 'Desglose de costes', title: 'Separe la implantación de los costes de operación.',
    body: 'Su propuesta separa cualquier desarrollo específico del producto de la suscripción continua. El punto de partida es si un configurador existente ya cubre las reglas de su producto.',
    items: [
      ['Implantación o adaptación', 'Evaluamos la nueva geometría, las reglas de producto, el cálculo de precios, la lista de materiales y las integraciones para su catálogo. La puesta en marcha estándar está incluida cuando encaja un sistema existente.'],
      ['Suscripción continua', 'El alojamiento, las actualizaciones de la plataforma, el mantenimiento habitual y el soporte técnico continúan tras el lanzamiento. La suscripción se factura mensual o anualmente, aparte del desarrollo acordado.'],
      ['Cambios posteriores de producto', 'Los nuevos componentes, reglas, resultados o integraciones se evalúan por separado. La propuesta define qué se incluye, quién aporta y valida los datos, las dependencias y los criterios de aceptación.'],
    ],
    example: 'Vea cómo una configuración de tejado se convierte en lista de materiales',
    action: 'Solicitar alcance y precio',
    faqIntro: 'Estas respuestas explican el modelo de implantación. La revisión técnica establece el trabajo, las responsabilidades sobre los datos y los servicios que incluirá su propuesta.',
  },
  fr: {
    metadata: {title: 'Coût et mise en œuvre d’un configurateur de produits', description: 'Combien coûte un configurateur de produits ? Comparez logiciel existant, adaptation ou développement sur mesure, mise en œuvre, abonnement et données utiles au devis.'},
    label: 'Répartition des coûts', title: 'Séparez la mise en œuvre des coûts d’exploitation.',
    body: 'Votre proposition sépare tout développement spécifique au produit de l’abonnement courant. Le point de départ : un configurateur existant couvre-t-il déjà les règles de votre produit ?',
    items: [
      ['Mise en œuvre ou adaptation', 'La nouvelle géométrie, les règles produit, le calcul des prix, la nomenclature et les intégrations sont évalués pour votre catalogue. La configuration standard est incluse lorsqu’un système existant convient.'],
      ['Abonnement courant', 'L’hébergement, les mises à jour de la plateforme, la maintenance courante et le support technique se poursuivent après le lancement. L’abonnement est facturé mensuellement ou annuellement, séparément du développement chiffré.'],
      ['Évolutions ultérieures du produit', 'Les nouveaux composants, règles, sorties ou intégrations sont évalués séparément. La proposition précise le périmètre inclus, qui fournit et valide les données, les dépendances et les critères de recette.'],
    ],
    example: 'Voyez une configuration de toiture devenir une liste de matériaux',
    action: 'Demander périmètre et tarif',
    faqIntro: 'Ces réponses expliquent le modèle de mise en œuvre. L’analyse technique définit les travaux, les responsabilités sur les données et les services à inclure dans votre proposition.',
  },
  it: {
    metadata: {title: 'Costi e implementazione di un configuratore di prodotto', description: 'Quanto costa un configuratore di prodotto? Confronti software esistente, adattamento o sviluppo su misura, implementazione, abbonamento e dati necessari al preventivo.'},
    label: 'Ripartizione dei costi', title: 'Separi l’implementazione dai costi di esercizio.',
    body: 'La sua proposta separa qualsiasi sviluppo specifico del prodotto dall’abbonamento continuativo. Il punto di partenza è capire se un configuratore esistente supporta già le regole del suo prodotto.',
    items: [
      ['Implementazione o adattamento', 'Nuova geometria, regole di prodotto, calcolo dei prezzi, distinta materiali e integrazioni vengono valutati per il suo catalogo. La configurazione standard è inclusa quando un sistema esistente è adatto.'],
      ['Abbonamento continuativo', 'Hosting, aggiornamenti della piattaforma, manutenzione ordinaria e supporto tecnico proseguono dopo il lancio. L’abbonamento è fatturato mensilmente o annualmente, separatamente dallo sviluppo concordato.'],
      ['Modifiche successive al prodotto', 'Nuovi componenti, regole, output o integrazioni vengono valutati separatamente. La proposta definisce cosa è incluso, chi fornisce e convalida i dati, le dipendenze e i criteri di accettazione.'],
    ],
    example: 'Veda una configurazione di tetto diventare una distinta materiali',
    action: 'Richiedi perimetro e prezzo',
    faqIntro: 'Queste risposte spiegano il modello di implementazione. L’analisi tecnica stabilisce le attività, le responsabilità sui dati e i servizi da includere nella sua proposta.',
  },
} as const;
