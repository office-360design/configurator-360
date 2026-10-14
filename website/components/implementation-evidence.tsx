import { localizedPath, type Locale } from '../lib/i18n';

const evidence = {
  en: {
    title: 'See what a configured product can produce.',
    intro: 'These working examples show product logic you can inspect. They are not customer revenue results or quotations for physical products.',
    examples: [
      {product:'roof',title:'Roof configuration to a material list',body:'Change the roof dimensions and covering, inspect the calculated components and export the bill of materials as CSV in the full configurator.',link:'Explore roof quantities'},
      {product:'cardbox',title:'Packaging rules to a working box',body:'Choose from nine box styles, change the dimensions and compare native closures, opening behaviour and board papers in the full configurator.',link:'Explore the box styles'},
    ],
    next:'For your catalogue, the rules, outputs and integrations are reviewed against your actual products before implementation.',
    action:'Discuss your configurator',
  },
  ro: {
    title: 'Vezi ce date poate genera produsul configurat.',
    intro: 'Aceste exemple funcționale arată reguli de produs pe care le poți verifica. Nu sunt rezultate comerciale ale unor clienți sau oferte pentru produse fizice.',
    examples: [
      {product:'roof',title:'De la acoperiș la lista de materiale',body:'Schimbă dimensiunile și învelitoarea, verifică componentele calculate și exportă lista de materiale în CSV din configuratorul complet.',link:'Vezi calculul pentru acoperiș'},
      {product:'cardbox',title:'De la regulile ambalajului la cutia 3D',body:'Alege dintre nouă stiluri de cutii, schimbă dimensiunile și compară închiderile, deschiderea și tipurile de hârtie din configuratorul complet.',link:'Vezi stilurile de cutii'},
    ],
    next:'Pentru catalogul tău, verificăm regulile, datele generate și integrările în raport cu produsele reale, înainte de implementare.',
    action:'Solicită evaluarea proiectului',
  },
  de: {
    title: 'Vom konfigurierten Produkt zu nutzbaren Daten.',
    intro: 'Diese funktionsfähigen Beispiele zeigen überprüfbare Produktregeln. Sie sind keine Umsatznachweise von Kunden und keine Angebote für physische Produkte.',
    examples: [
      {product:'roof',title:'Von der Dachkonfiguration zur Stückliste',body:'Ändern Sie Maße und Dachdeckung, prüfen Sie die berechneten Komponenten und exportieren Sie die Stückliste im vollständigen Konfigurator als CSV.',link:'Dachmengen ausprobieren'},
      {product:'cardbox',title:'Von Verpackungsregeln zum 3D-Karton',body:'Wählen Sie aus neun Kartonstilen, ändern Sie die Maße und vergleichen Sie Verschlüsse, Öffnung und Papierarten im vollständigen Konfigurator.',link:'Kartonstile ausprobieren'},
    ],
    next:'Für Ihren Katalog prüfen wir Regeln, Ausgaben und Schnittstellen anhand Ihrer tatsächlichen Produkte, bevor die Implementierung beginnt.',
    action:'Konfigurator-Projekt besprechen',
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
      <div className="evidence-examples">{text.examples.map(example=><article key={example.product}>
        <h3>{example.title}</h3><p>{example.body}</p>
        <a className="text-link" href={`${localizedPath(locale,`/configurators/${example.product}`)}${example.product==='roof'?'#roof-technical-example':''}`}>{example.link}<span aria-hidden="true">→</span></a>
      </article>)}</div>
      <div className="evidence-next"><p>{text.next}</p><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=custom-system`}>{text.action}<span aria-hidden="true">↗</span></a></div>
    </div>
  </section>;
}
