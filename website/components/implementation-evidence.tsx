import { localizedPath, type Locale } from '../lib/i18n';
import { SpotlightReference } from './spotlight-reference';

const evidence = {
  en: {
    title: 'Inspect the rules and outputs before planning your build.',
    intro: 'These working examples show product logic you can inspect. They are not customer revenue results or quotations for physical products.',
    examples: [
      {product:'roof',title:'Roof configuration to a material list',body:'Follow the documented 10 × 7 m roof example from dimensions and covering rules to calculated quantities and CSV export. The inputs and calculation assumptions are available to inspect.',link:'Inspect the technical roof example'},
      {product:'cardbox',title:'Packaging rules to a working box',body:'Choose from nine box styles, change the dimensions and compare native closures, opening behaviour and board papers in the full configurator.',link:'Explore the box styles'},
    ],
    next:'For your catalogue, the rules, outputs and integrations are reviewed against your actual products before implementation.',
    action:'Discuss your configurator',
    pricing:'Compare implementation costs',
  },
  ro: {
    title: 'Verifică regulile și rezultatele înainte de implementare.',
    intro: 'Aceste exemple funcționale arată reguli de produs pe care le poți verifica. Nu sunt rezultate comerciale ale unor clienți sau oferte pentru produse fizice.',
    examples: [
      {product:'roof',title:'De la acoperiș la lista de materiale',body:'Urmărește exemplul documentat de 10 × 7 m, de la dimensiuni și reguli de învelitoare la cantități și export CSV. Poți verifica datele de intrare și ipotezele de calcul.',link:'Vezi exemplul tehnic pentru acoperiș'},
      {product:'cardbox',title:'De la regulile ambalajului la cutia 3D',body:'Alege dintre nouă stiluri de cutii, schimbă dimensiunile și compară închiderile, deschiderea și tipurile de hârtie din configuratorul complet.',link:'Vezi stilurile de cutii'},
    ],
    next:'Pentru catalogul tău, verificăm regulile, datele generate și integrările în raport cu produsele reale, înainte de implementare.',
    action:'Solicită evaluarea proiectului',
    pricing:'Compară costurile de implementare',
  },
  de: {
    title: 'Produktregeln und Ergebnisse vor der Umsetzung prüfen.',
    intro: 'Diese funktionsfähigen Beispiele zeigen überprüfbare Produktregeln. Sie sind keine Umsatznachweise von Kunden und keine Angebote für physische Produkte.',
    examples: [
      {product:'roof',title:'Von der Dachkonfiguration zur Stückliste',body:'Verfolgen Sie das dokumentierte Dachbeispiel mit 10 × 7 m von Maßen und Deckungsregeln bis zu Mengen und CSV-Export. Eingaben und Berechnungsannahmen sind nachvollziehbar.',link:'Technisches Dachbeispiel prüfen'},
      {product:'cardbox',title:'Von Verpackungsregeln zum 3D-Karton',body:'Wählen Sie aus neun Kartonstilen, ändern Sie die Maße und vergleichen Sie Verschlüsse, Öffnung und Papierarten im vollständigen Konfigurator.',link:'Kartonstile ausprobieren'},
    ],
    next:'Für Ihren Katalog prüfen wir Regeln, Ausgaben und Schnittstellen anhand Ihrer tatsächlichen Produkte, bevor die Implementierung beginnt.',
    action:'Konfigurator-Projekt besprechen',
    pricing:'Implementierungskosten vergleichen',
  },
};

export const projectActions = {
  en: {action:'Discuss your configurator',note:'Configuration software for manufacturers and distributors. Product previews are examples, not supplier quotations.'},
  ro: {action:'Solicită evaluarea proiectului',note:'Software de configurare pentru producători și distribuitori. Exemplele de produse nu sunt oferte de la furnizori.'},
  de: {action:'Konfigurator-Projekt besprechen',note:'Konfigurationssoftware für Hersteller und Händler. Produktvorschauen sind Beispiele, keine Lieferantenangebote.'},
};

export function ImplementationEvidence({locale}: {locale:Locale}) {
  const text = evidence[locale];
  return <section className="implementation-evidence solid-section" id="implementation-examples" aria-labelledby="implementation-examples-title">
    <div className="page-frame">
      <div className="evidence-heading"><h2 id="implementation-examples-title">{text.title}</h2><p>{text.intro}</p></div>
      <SpotlightReference locale={locale}/>
      <div className="evidence-examples">{text.examples.map(example=><article key={example.product}>
        <h3>{example.title}</h3><p>{example.body}</p>
        <a className="text-link" href={`${localizedPath(locale,`/configurators/${example.product}`)}${example.product==='roof'?'#roof-technical-example':''}`}>{example.link}<span aria-hidden="true">→</span></a>
      </article>)}</div>
      <div className="evidence-next"><p>{text.next}</p><div className="roof-example-actions"><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=custom-system`}>{text.action}<span aria-hidden="true">↗</span></a><a className="text-link" href={`${localizedPath(locale,'/pricing')}#cost-breakdown`}>{text.pricing}<span aria-hidden="true">→</span></a></div></div>
    </div>
  </section>;
}
