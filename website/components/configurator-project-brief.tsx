import { localizedPath, type Locale } from '../lib/i18n';

const copy = {
  en: {title: 'Bring your product rules into the configurator.', body: 'The website preview shows selected controls. Open the full configurator to explore the supported workflow, or discuss adapting it to your catalogue. For a project review, bring available drawings or CAD, dimensions, option rules and the pricing or material outputs your team needs.', note: 'Implementation scope and pricing follow technical review. A website preview is not a manufacturing specification or a supplier quotation.', action: 'Discuss your product'},
  ro: {title: 'Transformă regulile produsului tău în configurare.', body: 'Previzualizarea de pe site include doar o parte din opțiuni. Deschide configuratorul complet pentru fluxul disponibil sau discută adaptarea la catalogul tău. Pentru evaluarea proiectului, pregătește desenele sau fișierele CAD disponibile, dimensiunile, regulile de compatibilitate și rezultatele de preț ori materiale necesare echipei.', note: 'Stabilim implementarea și prețul după evaluarea tehnică. Previzualizarea nu este o specificație de fabricație sau o ofertă de la un furnizor.', action: 'Discută despre produsul tău'},
  de: {title: 'Ihre Produktregeln im Konfigurator abbilden.', body: 'Die Website-Vorschau zeigt ausgewählte Optionen. Öffnen Sie den vollständigen Konfigurator für den verfügbaren Ablauf oder besprechen Sie die Anpassung an Ihren Katalog. Für die technische Prüfung sind vorhandene Zeichnungen oder CAD-Dateien, Maße, Variantenregeln sowie benötigte Preis- und Materialausgaben hilfreich.', note: 'Umfang und Preis der Implementierung werden nach der technischen Prüfung festgelegt. Die Vorschau ist keine Fertigungsspezifikation und kein Lieferantenangebot.', action: 'Ihr Produkt besprechen'},
};
const inputs: Record<Locale,Record<string,string>> = {
  en: {
    roof: 'For roofs, bring supported roof shapes, pitch constraints, covering options and your rules for measured lengths and material quantities.',
    hall: 'For halls, bring span and bay rules, frame and envelope options, door dimensions and the quantities your sales or engineering team needs.',
    pergola: 'For pergolas, bring module dimensions, louver options, side-enclosure compatibility and accessory pricing rules.',
  },
  ro: {
    roof: 'Pentru acoperișuri, pregătește tipologiile acceptate, limitele de pantă, opțiunile de învelitoare și regulile pentru lungimi și necesarul de materiale.',
    hall: 'Pentru hale, pregătește regulile de deschidere și travee, structura și închiderile disponibile, dimensiunile ușilor și cantitățile necesare echipei.',
    pergola: 'Pentru pergole, pregătește dimensiunile modulelor, opțiunile de lamele, compatibilitatea închiderilor laterale și regulile de preț pentru accesorii.',
  },
  de: {
    roof: 'Für Dächer sind unterstützte Dachformen, Neigungsgrenzen, Deckungsvarianten sowie Regeln für gemessene Längen und Materialmengen hilfreich.',
    hall: 'Für Hallen sind Spannweiten- und Achsabstandsregeln, Tragwerks- und Gebäudehüllenvarianten, Tormaße und benötigte Mengen hilfreich.',
    pergola: 'Für Pergolen sind Modulmaße, Lamellenvarianten, kompatible Seitenelemente und Preisregeln für Zubehör hilfreich.',
  },
};

export function ConfiguratorProjectBrief({locale,product}: {locale: Locale;product:string}) {
  const text=copy[locale];
  return <section className="detail-intro solid-section"><div className="page-frame outputs-grid"><h2>{text.title}</h2><div><p>{text.body}</p>{inputs[locale][product] && <p>{inputs[locale][product]}</p>}<p>{text.note}</p><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=${encodeURIComponent(product)}`}>{text.action}<span>↗</span></a></div></div></section>;
}
