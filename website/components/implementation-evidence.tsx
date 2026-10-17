import { localizedPath, type Locale } from '../lib/i18n';
import { SpotlightReference } from './spotlight-reference';

type EvidenceCopy = {title:string;intro:string;examples:{product:string;title:string;body:string;link:string}[];next:string;action:string;pricing:string};

const evidence: Record<Locale, EvidenceCopy> = {
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
  es: {
    title: 'Revise las reglas y los resultados antes de planificar su proyecto.',
    intro: 'Estos ejemplos funcionales muestran lógica de producto que usted puede revisar. No son resultados comerciales de clientes ni ofertas de productos físicos.',
    examples: [
      {product:'roof',title:'De la configuración del tejado a la lista de materiales',body:'Siga el ejemplo documentado de un tejado de 10 × 7 m, desde las dimensiones y las reglas de cubierta hasta las cantidades calculadas y la exportación CSV. Los datos de entrada y las hipótesis de cálculo se pueden revisar.',link:'Revisar el ejemplo técnico del tejado'},
      {product:'cardbox',title:'De las reglas del embalaje a una caja funcional',body:'Elija entre nueve estilos de caja, cambie las dimensiones y compare cierres, apertura y papeles de cartón en el configurador completo.',link:'Explorar los estilos de caja'},
    ],
    next:'Para su catálogo, las reglas, los resultados y las integraciones se revisan con sus productos reales antes de la implantación.',
    action:'Hablemos de su configurador',
    pricing:'Comparar costes de implantación',
  },
  fr: {
    title: 'Examinez les règles et les résultats avant de planifier votre projet.',
    intro: 'Ces exemples fonctionnels montrent une logique produit que vous pouvez examiner. Ce ne sont ni des résultats commerciaux de clients ni des devis pour des produits physiques.',
    examples: [
      {product:'roof',title:'De la configuration de toiture à la nomenclature',body:'Suivez l’exemple documenté d’une toiture de 10 × 7 m, des dimensions et règles de couverture jusqu’aux quantités calculées et à l’export CSV. Les données d’entrée et les hypothèses de calcul sont consultables.',link:'Examiner l’exemple technique de toiture'},
      {product:'cardbox',title:'Des règles d’emballage à un carton fonctionnel',body:'Choisissez parmi neuf styles de carton, modifiez les dimensions et comparez fermetures, ouverture et papiers dans le configurateur complet.',link:'Découvrir les styles de carton'},
    ],
    next:'Pour votre catalogue, les règles, les livrables et les intégrations sont vérifiés sur vos produits réels avant la mise en œuvre.',
    action:'Parler de votre configurateur',
    pricing:'Comparer les coûts de mise en œuvre',
  },
  it: {
    title: 'Verifichi regole e risultati prima di pianificare il progetto.',
    intro: 'Questi esempi funzionanti mostrano una logica di prodotto verificabile. Non sono risultati commerciali di clienti né offerte per prodotti fisici.',
    examples: [
      {product:'roof',title:'Dalla configurazione del tetto alla distinta materiali',body:'Segua l’esempio documentato di un tetto di 10 × 7 m, dalle dimensioni e dalle regole di copertura fino alle quantità calcolate e all’export CSV. Dati di input e ipotesi di calcolo sono consultabili.',link:'Verifichi l’esempio tecnico del tetto'},
      {product:'cardbox',title:'Dalle regole dell’imballaggio a una scatola funzionante',body:'Scelga tra nove stili di scatola, modifichi le dimensioni e confronti chiusure, apertura e carte nel configuratore completo.',link:'Esplori gli stili di scatola'},
    ],
    next:'Per il Suo catalogo, regole, output e integrazioni vengono verificati sui prodotti reali prima dell’implementazione.',
    action:'Parliamo del Suo configuratore',
    pricing:'Confronti i costi di implementazione',
  },
};

export const projectActions: Record<Locale, {action:string;note:string}> = {
  en: {action:'Discuss your configurator',note:'Configuration software for manufacturers and distributors. Product previews are examples, not supplier quotations.'},
  ro: {action:'Solicită evaluarea proiectului',note:'Software de configurare pentru producători și distribuitori. Exemplele de produse nu sunt oferte de la furnizori.'},
  de: {action:'Konfigurator-Projekt besprechen',note:'Konfigurationssoftware für Hersteller und Händler. Produktvorschauen sind Beispiele, keine Lieferantenangebote.'},
  es: {action:'Hablemos de su configurador',note:'Software de configuración para fabricantes y distribuidores. Las vistas previas de productos son ejemplos, no ofertas de proveedores.'},
  fr: {action:'Parler de votre configurateur',note:'Logiciel de configuration pour fabricants et distributeurs. Les aperçus produits sont des exemples, pas des devis de fournisseurs.'},
  it: {action:'Parliamo del Suo configuratore',note:'Software di configurazione per produttori e distributori. Le anteprime di prodotto sono esempi, non offerte di fornitori.'},
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
