import sample from '../lib/roof-example-data.json';
import {localizedPath, type Locale} from '../lib/i18n';

const copy = {
  en: {
    title:'From a configured roof to a bill of materials.',
    intro:'A roof manufacturer needs more than a 3D view: dimensions and covering choices must produce inspectable quantities. This technical example uses the existing roof model and bill-of-materials functions. It is a software demonstration, not a customer case study or a roofing quotation.',
    input:'Reproduce the example',
    recipe:'In the full configurator, choose the two-slope roof and generic metal covering. Set length to 10 m, depth to 7 m, wall height to 3 m, pitch to 30° and eaves overhang to 0.4 m. These are explicit test inputs, not a recommended building design.',
    steps:[
      ['Define the product','The roof preset, dimensions and covering form the input configuration. For your catalogue, this starts with supported shapes, component data and the choices your customers may make.'],
      ['Apply the rules','The model calculates the sloped roof area, while the BOM applies component lengths and effective coverage. This preset uses 0.47 m² per panel and a 5% waste allowance, not a universal supplier rule.'],
      ['Inspect the quantities','The table shows actual outputs from the repository functions. Changing a dimension changes the geometry and quantities. The 70 m² building footprint is not the sloped roof area.'],
      ['Export the material list','The full configurator exports CSV rows with description, unit, quantity and reference price fields. Those fields describe the software output; demo rates are not a supplier offer.'],
      ['Plan the business-system connection','CSV is a starting point for a handoff. Mapping components to your catalogue, validating prices and connecting ERP or CRM require a separate technical review. This example does not demonstrate a live ERP integration.'],
    ],
    caption:'Outputs for this exact two-slope preset', columns:['Output','Value'], rows:['Building footprint','Sloped roof area','Ridge length','Eaves length','Covering panels','Ridge pieces','Gutter pieces'], pieces:'pieces',
    limits:'Panel coverage, waste allowance, effective ridge length (0.37 m) and gutter length (3 m) are assumptions of this demo preset. Other products and drawn-roof modes may use different calculations. Validate the catalogue, construction and purchasing quantities before production.',
    next:'For a software project, send your available drawings, dimensions, compatibility rules and a sample material list. We review the required outputs and interfaces before agreeing scope or price.',
    action:'Discuss your roof configurator', open:'Reproduce in the full configurator', pricing:'Understand implementation costs',
  },
  ro: {
    title:'De la acoperișul configurat la lista de materiale.',
    intro:'Un producător de acoperișuri are nevoie de mai mult decât o vedere 3D: dimensiunile și învelitoarea trebuie să genereze cantități verificabile. Exemplul folosește modelul și funcțiile existente pentru lista de materiale (BOM). Este o demonstrație software, nu un studiu de client sau o ofertă de acoperiș.',
    input:'Reproduce exemplul',
    recipe:'În configuratorul complet, alege acoperișul în două ape și învelitoarea metalică generică. Setează lungimea la 10 m, adâncimea la 7 m, înălțimea pereților la 3 m, panta la 30° și streașina la 0,4 m. Sunt date de test, nu recomandări de proiectare a unei clădiri.',
    steps:[
      ['Definești produsul','Tipul de acoperiș, dimensiunile și învelitoarea formează configurația de intrare. Pentru catalogul tău, pornim de la formele acceptate, datele componentelor și opțiunile disponibile clienților.'],
      ['Aplici regulile','Modelul calculează suprafața înclinată, iar lista de materiale folosește lungimile componentelor și acoperirea utilă. Varianta demonstrată folosește 0,47 m² per panou și o rezervă de 5%, nu o regulă universală de furnizor.'],
      ['Verifici cantitățile','Tabelul arată rezultate calculate de funcțiile din repository. O dimensiune schimbată modifică geometria și cantitățile. Amprenta clădirii de 70 m² nu este suprafața înclinată a acoperișului.'],
      ['Exporți lista de materiale','Configuratorul complet exportă CSV cu denumire, unitate, cantitate și câmpuri de preț de referință. Acestea descriu rezultatul software-ului; prețurile demo nu sunt o ofertă de furnizor.'],
      ['Pregătești legătura cu sistemele companiei','CSV este un punct de pornire pentru transferul datelor. Maparea componentelor la catalog, validarea prețurilor și conectarea ERP sau CRM cer o evaluare tehnică separată. Exemplul nu demonstrează o integrare ERP live.'],
    ],
    caption:'Rezultate pentru această configurație în două ape', columns:['Rezultat','Valoare'], rows:['Amprenta clădirii','Suprafața înclinată','Lungimea coamei','Lungimea streșinilor','Panouri de învelitoare','Piese de coamă','Piese de jgheab'], pieces:'bucăți',
    limits:'Acoperirea utilă, rezerva, lungimea utilă a coamei (0,37 m) și lungimea jgheabului (3 m) sunt ipotezele variantei demo. Alte produse și modurile cu acoperiș desenat pot avea alte calcule. Validează catalogul, construcția și necesarul pentru achiziție înainte de producție.',
    next:'Pentru un proiect software, trimite desenele disponibile, dimensiunile, regulile de compatibilitate și un exemplu de listă de materiale. Verificăm rezultatele și interfețele necesare înainte să stabilim ce include proiectul și prețul.',
    action:'Discută configuratorul pentru acoperișuri', open:'Reproduce în configuratorul complet', pricing:'Vezi costurile de implementare',
  },
  de: {
    title:'Vom konfigurierten Dach zur Stückliste.',
    intro:'Ein Dachhersteller benötigt mehr als eine 3D-Ansicht: Maße und Dachdeckung müssen nachvollziehbare Mengen ergeben. Dieses technische Beispiel nutzt das vorhandene Dachmodell und die Stücklistenfunktionen. Es ist eine Software-Demonstration, keine Kundenfallstudie und kein Angebot für ein Dach.',
    input:'Das Beispiel nachvollziehen',
    recipe:'Wählen Sie im vollständigen Konfigurator das Satteldach und die generische Metalldeckung. Stellen Sie 10 m Länge, 7 m Tiefe, 3 m Wandhöhe, 30° Dachneigung und 0,4 m Dachüberstand ein. Dies sind Testeingaben, keine Empfehlung für eine Gebäudeplanung.',
    steps:[
      ['Das Produkt definieren','Dachtyp, Maße und Deckung bilden die Eingabekonfiguration. Für Ihren Katalog beginnt dies mit zulässigen Formen, Komponentendaten und den Auswahlmöglichkeiten Ihrer Kunden.'],
      ['Die Regeln anwenden','Das Modell berechnet die geneigte Dachfläche. Die Stückliste verwendet Bauteillängen und Nutzdeckung. Dieses Beispiel nutzt 0,47 m² je Paneel und 5% Verschnitt, keine allgemeine Lieferantenregel.'],
      ['Die Mengen prüfen','Die Tabelle zeigt tatsächliche Ergebnisse der Funktionen im Repository. Maßänderungen ändern Geometrie und Mengen. Die Gebäudegrundfläche von 70 m² ist nicht die geneigte Dachfläche.'],
      ['Die Stückliste exportieren','Der vollständige Konfigurator exportiert CSV-Zeilen mit Bezeichnung, Einheit, Menge und Referenzpreisfeldern. Diese Felder beschreiben die Softwareausgabe; Demopreise sind kein Lieferantenangebot.'],
      ['Die Systemanbindung planen','CSV ist ein Ausgangspunkt für die Datenübergabe. Artikelzuordnung, Preisvalidierung und ERP- oder CRM-Anbindung benötigen eine gesonderte technische Prüfung. Dieses Beispiel zeigt keine produktive ERP-Integration.'],
    ],
    caption:'Ergebnisse für genau dieses Satteldach', columns:['Ergebnis','Wert'], rows:['Gebäudegrundfläche','Geneigte Dachfläche','Firstlänge','Trauflänge','Deckpaneele','Firstteile','Rinnenteile'], pieces:'Stück',
    limits:'Nutzdeckung, Verschnitt, wirksame Firstlänge (0,37 m) und Rinnenlänge (3 m) sind Annahmen dieses Demobeispiels. Andere Produkte und gezeichnete Dachformen können andere Berechnungen verwenden. Prüfen Sie Katalog, Konstruktion und Bestellmengen vor der Produktion.',
    next:'Senden Sie für ein Softwareprojekt vorhandene Zeichnungen, Maße, Variantenregeln und eine Beispielstückliste. Wir prüfen die benötigten Ausgaben und Schnittstellen, bevor Umfang und Preis festgelegt werden.',
    action:'Dachkonfigurator-Projekt besprechen', open:'Im vollständigen Konfigurator nachvollziehen', pricing:'Implementierungskosten verstehen',
  },
};

export function RoofTechnicalExample({locale,launchUrl}: {locale:Locale;launchUrl:string}) {
  const text=copy[locale];
  const number=new Intl.NumberFormat(locale,{maximumFractionDigits:2});
  const values=[`${number.format(sample.output.footprint)} m²`,`${number.format(sample.output.roofArea)} m²`,`${number.format(sample.output.ridgeLength)} m`,`${number.format(sample.output.eavesLength)} m`,...[sample.output.panels,sample.output.ridgePieces,sample.output.gutterPieces].map(value=>`${number.format(value)} ${text.pieces}`)];
  return <section className="implementation-evidence roof-technical-example solid-section" id="roof-technical-example" aria-labelledby="roof-example-title" data-machine-section="technical-example">
    <div className="page-frame">
      <div className="evidence-heading"><h2 id="roof-example-title">{text.title}</h2><p>{text.intro}</p></div>
      <div className="roof-example-recipe"><h3>{text.input}</h3><p>{text.recipe}</p></div>
      <ol className="roof-example-workflow">{text.steps.map(([title,body])=><li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol>
      <table className="roof-example-table"><caption>{text.caption}</caption><thead><tr>{text.columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{text.rows.map((label,index)=><tr key={label}><th scope="row">{label}</th><td>{values[index]}</td></tr>)}</tbody></table>
      <p className="roof-example-limits">{text.limits}</p>
      <p><a className="text-link" href={`${localizedPath(locale, '/pricing')}#cost-breakdown`}>{text.pricing}<span aria-hidden="true">→</span></a></p>
      <div className="evidence-next"><p>{text.next}</p><div className="roof-example-actions"><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=roof`}>{text.action}<span aria-hidden="true">↗</span></a><a className="text-link" href={launchUrl} target="_blank" rel="noreferrer">{text.open}<span aria-hidden="true">↗</span></a></div></div>
    </div>
  </section>;
}
