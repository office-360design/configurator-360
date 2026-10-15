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
} as const;
