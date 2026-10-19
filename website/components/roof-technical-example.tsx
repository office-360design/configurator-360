import sample from '../lib/roof-example-data.json';
import {localeLanguageTags, localizedPath, type Locale} from '../lib/i18n';

type RoofExampleCopy = {title:string;intro:string;input:string;recipe:string;steps:[string,string][];caption:string;columns:string[];rows:string[];pieces:string;limits:string;next:string;action:string;open:string;pricing:string};

const copy: Record<Locale, RoofExampleCopy> = {
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
  es: {
    title:'De un tejado configurado a una lista de materiales.',
    intro:'Un fabricante de tejados necesita algo más que una vista 3D: las dimensiones y la cubierta elegidas deben producir cantidades verificables. Este ejemplo técnico utiliza el modelo de tejado y las funciones de lista de materiales existentes. Es una demostración de software, no un caso de cliente ni una oferta de cubierta.',
    input:'Reproduzca el ejemplo',
    recipe:'En el configurador completo, elija el tejado a dos aguas y la cubierta metálica genérica. Ajuste la longitud a 10 m, el fondo a 7 m, la altura de muro a 3 m, la pendiente a 30° y el alero a 0,4 m. Son datos de prueba explícitos, no un diseño de edificio recomendado.',
    steps:[
      ['Definir el producto','El tipo de tejado, las dimensiones y la cubierta forman la configuración de entrada. Para su catálogo, esto empieza por las formas admitidas, los datos de componentes y las opciones que pueden elegir sus clientes.'],
      ['Aplicar las reglas','El modelo calcula la superficie inclinada del tejado y la lista de materiales aplica las longitudes de los componentes y la cobertura útil. Este ejemplo usa 0,47 m² por panel y un 5% de merma, no una regla universal de proveedor.'],
      ['Revisar las cantidades','La tabla muestra resultados reales de las funciones del repositorio. Cambiar una dimensión cambia la geometría y las cantidades. La huella del edificio de 70 m² no es la superficie inclinada del tejado.'],
      ['Exportar la lista de materiales','El configurador completo exporta filas CSV con descripción, unidad, cantidad y campos de precio de referencia. Estos campos describen la salida del software; los precios de demostración no son una oferta de proveedor.'],
      ['Planificar la conexión con los sistemas de negocio','El CSV es un punto de partida para la transferencia de datos. Asignar componentes a su catálogo, validar precios y conectar ERP o CRM requiere una revisión técnica aparte. Este ejemplo no demuestra una integración ERP en producción.'],
    ],
    caption:'Resultados de este tejado a dos aguas', columns:['Resultado','Valor'], rows:['Huella del edificio','Superficie inclinada','Longitud de cumbrera','Longitud de aleros','Paneles de cubierta','Piezas de cumbrera','Piezas de canalón'], pieces:'piezas',
    limits:'La cobertura útil del panel, la merma, la longitud útil de cumbrera (0,37 m) y la longitud del canalón (3 m) son hipótesis de este ejemplo de demostración. Otros productos y los modos de tejado dibujado pueden usar cálculos distintos. Valide el catálogo, la construcción y las cantidades de compra antes de la producción.',
    next:'Para un proyecto de software, envíe los planos disponibles, las dimensiones, las reglas de compatibilidad y una lista de materiales de ejemplo. Revisamos los resultados y las interfaces necesarias antes de acordar el alcance o el precio.',
    action:'Hablemos de su configurador de tejados', open:'Reproducir en el configurador completo', pricing:'Conocer los costes de implantación',
  },
  fr: {
    title:'D’une toiture configurée à une nomenclature.',
    intro:'Un fabricant de toitures a besoin de plus qu’une vue 3D : les dimensions et la couverture choisies doivent produire des quantités vérifiables. Cet exemple technique utilise le modèle de toiture et les fonctions de nomenclature existants. Il s’agit d’une démonstration logicielle, ni d’un cas client ni d’un devis de toiture.',
    input:'Reproduire l’exemple',
    recipe:'Dans le configurateur complet, choisissez la toiture à deux pans et la couverture métallique générique. Réglez la longueur à 10 m, la profondeur à 7 m, la hauteur de mur à 3 m, la pente à 30° et le débord de toit à 0,4 m. Ce sont des valeurs de test explicites, pas une conception de bâtiment recommandée.',
    steps:[
      ['Définir le produit','Le type de toiture, les dimensions et la couverture forment la configuration d’entrée. Pour votre catalogue, tout commence par les formes prises en charge, les données des composants et les choix proposés à vos clients.'],
      ['Appliquer les règles','Le modèle calcule la surface de toiture inclinée, et la nomenclature applique les longueurs des composants et le recouvrement utile. Cet exemple utilise 0,47 m² par panneau et 5% de chute, pas une règle universelle de fournisseur.'],
      ['Vérifier les quantités','Le tableau présente les résultats réels des fonctions du dépôt. Modifier une dimension modifie la géométrie et les quantités. L’emprise du bâtiment de 70 m² n’est pas la surface de toiture inclinée.'],
      ['Exporter la nomenclature','Le configurateur complet exporte des lignes CSV avec désignation, unité, quantité et champs de prix de référence. Ces champs décrivent la sortie du logiciel ; les tarifs de démonstration ne constituent pas une offre fournisseur.'],
      ['Préparer la connexion aux systèmes','Le CSV est un point de départ pour la transmission des données. L’association des composants à votre catalogue, la validation des prix et la connexion à l’ERP ou au CRM nécessitent une revue technique distincte. Cet exemple ne montre pas d’intégration ERP en production.'],
    ],
    caption:'Résultats pour cette toiture à deux pans', columns:['Résultat','Valeur'], rows:['Emprise du bâtiment','Surface de toiture inclinée','Longueur de faîtage','Longueur d’égout','Panneaux de couverture','Pièces de faîtage','Pièces de gouttière'], pieces:'pièces',
    limits:'Le recouvrement utile des panneaux, la chute, la longueur utile de faîtage (0,37 m) et la longueur de gouttière (3 m) sont des hypothèses de cet exemple de démonstration. D’autres produits et les modes de toiture dessinée peuvent utiliser d’autres calculs. Validez le catalogue, la construction et les quantités d’achat avant production.',
    next:'Pour un projet logiciel, envoyez vos plans disponibles, vos dimensions, vos règles de compatibilité et un exemple de nomenclature. Nous examinons les livrables et interfaces nécessaires avant de convenir du périmètre ou du prix.',
    action:'Parler de votre configurateur de toiture', open:'Reproduire dans le configurateur complet', pricing:'Comprendre les coûts de mise en œuvre',
  },
  it: {
    title:'Da un tetto configurato a una distinta materiali.',
    intro:'Un produttore di coperture ha bisogno di più di una vista 3D: dimensioni e manto scelti devono produrre quantità verificabili. Questo esempio tecnico usa il modello di tetto e le funzioni di distinta materiali esistenti. È una dimostrazione software, non un caso cliente né un’offerta per una copertura.',
    input:'Riproduca l’esempio',
    recipe:'Nel configuratore completo, scelga il tetto a due falde e il manto metallico generico. Imposti lunghezza 10 m, profondità 7 m, altezza delle pareti 3 m, pendenza 30° e sporto di gronda 0,4 m. Sono valori di prova espliciti, non un progetto edilizio consigliato.',
    steps:[
      ['Definire il prodotto','Tipo di tetto, dimensioni e manto formano la configurazione di input. Per il Suo catalogo, si parte dalle forme supportate, dai dati dei componenti e dalle scelte disponibili per i clienti.'],
      ['Applicare le regole','Il modello calcola la superficie inclinata del tetto, mentre la distinta applica le lunghezze dei componenti e la copertura utile. Questo esempio usa 0,47 m² per pannello e il 5% di sfrido, non una regola universale del fornitore.'],
      ['Verificare le quantità','La tabella mostra i risultati reali delle funzioni del repository. Modificare una dimensione cambia geometria e quantità. L’impronta dell’edificio di 70 m² non è la superficie inclinata del tetto.'],
      ['Esportare la distinta materiali','Il configuratore completo esporta righe CSV con descrizione, unità, quantità e campi di prezzo di riferimento. Questi campi descrivono l’output del software; i prezzi demo non sono un’offerta del fornitore.'],
      ['Pianificare il collegamento ai sistemi aziendali','Il CSV è un punto di partenza per il passaggio dei dati. Associare i componenti al Suo catalogo, validare i prezzi e collegare ERP o CRM richiede una revisione tecnica separata. Questo esempio non mostra un’integrazione ERP in produzione.'],
    ],
    caption:'Risultati per questo tetto a due falde', columns:['Risultato','Valore'], rows:['Impronta dell’edificio','Superficie inclinata','Lunghezza del colmo','Lunghezza della gronda','Pannelli di copertura','Elementi di colmo','Elementi di grondaia'], pieces:'pezzi',
    limits:'Copertura utile dei pannelli, sfrido, lunghezza utile del colmo (0,37 m) e lunghezza della grondaia (3 m) sono ipotesi di questo esempio demo. Altri prodotti e le modalità con tetto disegnato possono usare calcoli diversi. Verifichi catalogo, costruzione e quantità d’acquisto prima della produzione.',
    next:'Per un progetto software, invii i disegni disponibili, le dimensioni, le regole di compatibilità e una distinta materiali di esempio. Esaminiamo output e interfacce necessari prima di concordare perimetro o prezzo.',
    action:'Parliamo del Suo configuratore di tetti', open:'Riproduci nel configuratore completo', pricing:'Capire i costi di implementazione',
  },
};

export function RoofTechnicalExample({locale,launchUrl}: {locale:Locale;launchUrl:string}) {
  const text=copy[locale];
  const number=new Intl.NumberFormat(localeLanguageTags[locale],{maximumFractionDigits:2});
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
