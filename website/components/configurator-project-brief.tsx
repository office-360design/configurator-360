import { localizedPath, type Locale, type ConfiguratorRouteSlug } from '../lib/i18n';

const copy = {
  en: {title: 'Bring your product rules into the configurator.', body: 'The website preview shows selected controls. Open the full configurator to explore the supported workflow, or discuss adapting it to your catalogue. For a project review, bring available drawings or CAD, dimensions, option rules and the pricing or material outputs your team needs.', note: 'Implementation scope and pricing follow technical review. A website preview is not a manufacturing specification or a supplier quotation.', action: 'Discuss your product'},
  ro: {title: 'Transformă regulile produsului tău în configurare.', body: 'Previzualizarea de pe site include doar o parte din opțiuni. Deschide configuratorul complet pentru fluxul disponibil sau discută adaptarea la catalogul tău. Pentru evaluarea proiectului, pregătește desenele sau fișierele CAD disponibile, dimensiunile, regulile de compatibilitate și rezultatele de preț ori materiale necesare echipei.', note: 'Stabilim implementarea și prețul după evaluarea tehnică. Previzualizarea nu este o specificație de fabricație sau o ofertă de la un furnizor.', action: 'Discută despre produsul tău'},
  de: {title: 'Ihre Produktregeln im Konfigurator abbilden.', body: 'Die Website-Vorschau zeigt ausgewählte Optionen. Öffnen Sie den vollständigen Konfigurator für den verfügbaren Ablauf oder besprechen Sie die Anpassung an Ihren Katalog. Für die technische Prüfung sind vorhandene Zeichnungen oder CAD-Dateien, Maße, Variantenregeln sowie benötigte Preis- und Materialausgaben hilfreich.', note: 'Umfang und Preis der Implementierung werden nach der technischen Prüfung festgelegt. Die Vorschau ist keine Fertigungsspezifikation und kein Lieferantenangebot.', action: 'Ihr Produkt besprechen'},
};
const inputs: Record<Locale,Record<ConfiguratorRouteSlug,string>> = {
  en: {
    roof: 'For roofs, bring supported roof shapes, pitch constraints, covering options and your rules for measured lengths and material quantities.',
    hall: 'For halls, bring span and bay rules, frame and envelope options, door dimensions and the quantities your sales or engineering team needs.',
    pergola: 'For pergolas, bring module dimensions, louver options, side-enclosure compatibility and accessory pricing rules.',
    window: 'For windows, bring profile sections, opening types, size limits, glazing options and the rules that make an assembly valid.',
    fence: 'For fences, bring panel and post sizes, gate options, corner rules and the quantities required for a quote.',
    solar: 'For solar systems, bring supported panel data, roof-placement constraints and the assumptions needed for energy estimates.',
    chair: 'For chairs, bring the product variants, materials, finishes and combinations your catalogue permits.',
    cardbox: 'For packaging, bring box styles, internal dimensions, board grades, closure rules and the required quantity and price outputs.',
    bookshelf: 'For shelving, bring module sizes, shelf spacing, doors, drawers, materials and the rules for compatible combinations.',
    tiles: 'For paving, bring laying patterns, tile formats, joint and border rules and the preview or material outputs your team needs.',
  },
  ro: {
    roof: 'Pentru acoperișuri, pregătește tipologiile acceptate, limitele de pantă, opțiunile de învelitoare și regulile pentru lungimi și necesarul de materiale.',
    hall: 'Pentru hale, pregătește regulile de deschidere și travee, structura și închiderile disponibile, dimensiunile ușilor și cantitățile necesare echipei.',
    pergola: 'Pentru pergole, pregătește dimensiunile modulelor, opțiunile de lamele, compatibilitatea închiderilor laterale și regulile de preț pentru accesorii.',
    window: 'Pentru ferestre, pregătește secțiunile profilelor, tipurile de deschidere, limitele dimensionale, variantele de vitraj și regulile unui ansamblu valid.',
    fence: 'Pentru garduri, pregătește dimensiunile panourilor și stâlpilor, porțile, regulile pentru colțuri și cantitățile necesare ofertării.',
    solar: 'Pentru sisteme fotovoltaice, pregătește datele panourilor, regulile de amplasare pe acoperiș și ipotezele necesare estimării producției.',
    chair: 'Pentru scaune, pregătește variantele produsului, materialele, finisajele și combinațiile permise de catalog.',
    cardbox: 'Pentru ambalaje, pregătește tipurile de cutii, dimensiunile interioare, tipurile de carton, regulile de închidere și rezultatele de cantitate sau preț necesare.',
    bookshelf: 'Pentru biblioteci, pregătește dimensiunile modulelor, distanța dintre rafturi, ușile, sertarele, materialele și regulile de compatibilitate.',
    tiles: 'Pentru pavaj, pregătește modelele de montaj, formatele dalelor, rosturile, bordurile și rezultatele de previzualizare sau materiale necesare echipei.',
  },
  de: {
    roof: 'Für Dächer sind unterstützte Dachformen, Neigungsgrenzen, Deckungsvarianten sowie Regeln für gemessene Längen und Materialmengen hilfreich.',
    hall: 'Für Hallen sind Spannweiten- und Achsabstandsregeln, Tragwerks- und Gebäudehüllenvarianten, Tormaße und benötigte Mengen hilfreich.',
    pergola: 'Für Pergolen sind Modulmaße, Lamellenvarianten, kompatible Seitenelemente und Preisregeln für Zubehör hilfreich.',
    window: 'Für Fenster sind Profilquerschnitte, Öffnungsarten, Maßgrenzen, Verglasungsvarianten und Regeln für gültige Baugruppen hilfreich.',
    fence: 'Für Zäune sind Paneel- und Pfostenmaße, Torvarianten, Eckregeln und die für ein Angebot benötigten Mengen hilfreich.',
    solar: 'Für Photovoltaiksysteme sind Moduldaten, Platzierungsregeln auf dem Dach und Annahmen für Ertragsschätzungen hilfreich.',
    chair: 'Für Stühle sind Produktvarianten, Materialien, Oberflächen und die im Katalog zulässigen Kombinationen hilfreich.',
    cardbox: 'Für Verpackungen sind Kartontypen, Innenmaße, Kartonqualitäten, Verschlussregeln sowie benötigte Mengen- und Preisausgaben hilfreich.',
    bookshelf: 'Für Regale sind Modulmaße, Fachabstände, Türen, Schubladen, Materialien und Kompatibilitätsregeln hilfreich.',
    tiles: 'Für Pflaster sind Verlegemuster, Steinformate, Fugen- und Randregeln sowie benötigte Vorschau- oder Materialausgaben hilfreich.',
  },
};

const pricingLinks = {en: 'Understand implementation costs', ro: 'Vezi costurile de implementare', de: 'Implementierungskosten verstehen'};

const questions = {
  en: [
    ['Do I need complete CAD files before contacting you?', 'Send the drawings, catalogue or product examples you already have and explain the outcome you need. We identify missing assets and technical dependencies during the project review.'],
    ['Can the configurator use our prices and existing systems?', 'We review your price rules, required outputs and available interfaces. Integration scope is agreed after technical review, not assumed from a website demo.'],
    ['What happens after I send an enquiry?', 'We review the product, variants and available data, then clarify whether an existing system, an adaptation or a custom build fits. Scope, timing and pricing depend on that review.'],
  ],
  ro: [
    ['Am nevoie de toate fișierele CAD înainte să vă contactez?', 'Trimite desenele, catalogul sau exemplele de produse pe care le ai și explică rezultatul dorit. Identificăm resursele lipsă și dependențele tehnice la evaluarea proiectului.'],
    ['Putem folosi prețurile și sistemele companiei noastre?', 'Verificăm regulile de preț, datele necesare și interfețele disponibile. Stabilim integrările după evaluarea tehnică, nu le presupunem dintr-o demonstrație pe website.'],
    ['Ce se întâmplă după ce trimit solicitarea?', 'Analizăm produsul, variantele și datele disponibile. Clarificăm dacă se potrivește un configurator existent, o adaptare sau unul personalizat. Ce include proiectul, durata și prețul depind de această evaluare.'],
  ],
  de: [
    ['Brauchen wir vor der Anfrage vollständige CAD-Dateien?', 'Senden Sie vorhandene Zeichnungen, Ihren Katalog oder Produktbeispiele und beschreiben Sie das gewünschte Ergebnis. Fehlende Daten und technische Abhängigkeiten klären wir bei der Projektprüfung.'],
    ['Kann der Konfigurator unsere Preise und Systeme verwenden?', 'Wir prüfen Preisregeln, benötigte Ausgaben und vorhandene Schnittstellen. Der Integrationsumfang wird nach der technischen Prüfung vereinbart, nicht aus einer Website-Demo vorausgesetzt.'],
    ['Was passiert nach unserer Anfrage?', 'Wir prüfen Produkt, Varianten und vorhandene Daten. Danach klären wir, ob ein bestehendes System, eine Anpassung oder eine individuelle Entwicklung passt. Umfang, Zeitplan und Preis hängen von dieser Prüfung ab.'],
  ],
};

export function ConfiguratorProjectBrief({locale,product}: {locale: Locale;product:ConfiguratorRouteSlug}) {
  const text=copy[locale];
  return <section className="detail-intro solid-section project-brief"><div className="page-frame outputs-grid"><h2>{text.title}</h2><div><p>{text.body}</p>{inputs[locale][product] && <p>{inputs[locale][product]}</p>}<p>{text.note}</p><div className="project-questions">{questions[locale].map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><div className="roof-example-actions"><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=${encodeURIComponent(product)}`}>{text.action}<span aria-hidden="true">↗</span></a><a className="text-link" href={`${localizedPath(locale,'/pricing')}#cost-breakdown`}>{pricingLinks[locale]}<span aria-hidden="true">→</span></a></div></div></div></section>;
}
