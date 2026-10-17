import { localizedPath, type Locale, type ConfiguratorRouteSlug } from '../lib/i18n';

const copy: Record<Locale,{title:string;body:string;note:string;action:string}> = {
  en: {title: 'Bring your product rules into the configurator.', body: 'The website preview shows selected controls. Open the full configurator to explore the supported workflow, or discuss adapting it to your catalogue. For a project review, bring available drawings or CAD, dimensions, option rules and the pricing or material outputs your team needs.', note: 'Implementation scope and pricing follow technical review. A website preview is not a manufacturing specification or a supplier quotation.', action: 'Discuss your product'},
  ro: {title: 'Transformă regulile produsului tău în configurare.', body: 'Previzualizarea de pe site include doar o parte din opțiuni. Deschide configuratorul complet pentru fluxul disponibil sau discută adaptarea la catalogul tău. Pentru evaluarea proiectului, pregătește desenele sau fișierele CAD disponibile, dimensiunile, regulile de compatibilitate și rezultatele de preț ori materiale necesare echipei.', note: 'Stabilim implementarea și prețul după evaluarea tehnică. Previzualizarea nu este o specificație de fabricație sau o ofertă de la un furnizor.', action: 'Discută despre produsul tău'},
  de: {title: 'Ihre Produktregeln im Konfigurator abbilden.', body: 'Die Website-Vorschau zeigt ausgewählte Optionen. Öffnen Sie den vollständigen Konfigurator für den verfügbaren Ablauf oder besprechen Sie die Anpassung an Ihren Katalog. Für die technische Prüfung sind vorhandene Zeichnungen oder CAD-Dateien, Maße, Variantenregeln sowie benötigte Preis- und Materialausgaben hilfreich.', note: 'Umfang und Preis der Implementierung werden nach der technischen Prüfung festgelegt. Die Vorschau ist keine Fertigungsspezifikation und kein Lieferantenangebot.', action: 'Ihr Produkt besprechen'},
  es: {title: 'Lleve las reglas de su producto al configurador.', body: 'La vista previa del sitio web muestra una selección de controles. Abra el configurador completo para explorar el flujo disponible o hable con nosotros sobre su adaptación a su catálogo. Para revisar el proyecto, aporte los planos o archivos CAD disponibles, las dimensiones, las reglas de opciones y los resultados de precios o materiales que necesita su equipo.', note: 'El alcance y el precio de la implantación se definen tras la revisión técnica. Una vista previa del sitio web no es una especificación de fabricación ni una oferta de proveedor.', action: 'Hablemos de su producto'},
  fr: {title: 'Intégrez les règles de votre produit au configurateur.', body: 'L’aperçu du site présente une sélection de commandes. Ouvrez le configurateur complet pour explorer le parcours disponible, ou discutez de son adaptation à votre catalogue. Pour la revue du projet, apportez les plans ou fichiers CAO disponibles, les dimensions, les règles d’options et les livrables de prix ou de matériaux dont votre équipe a besoin.', note: 'Le périmètre et le prix de la mise en œuvre sont définis après revue technique. Un aperçu du site n’est ni une spécification de fabrication ni un devis de fournisseur.', action: 'Parler de votre produit'},
  it: {title: 'Porti le regole del Suo prodotto nel configuratore.', body: 'L’anteprima del sito mostra una selezione di comandi. Apra il configuratore completo per esplorare il flusso disponibile, oppure parli con noi del suo adattamento al Suo catalogo. Per la revisione del progetto, prepari disegni o file CAD disponibili, dimensioni, regole delle opzioni e gli output di prezzo o materiali necessari al Suo team.', note: 'Perimetro e prezzo dell’implementazione vengono definiti dopo la revisione tecnica. Un’anteprima del sito non è una specifica di produzione né un’offerta di fornitore.', action: 'Parliamo del Suo prodotto'},
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
  es: {
    roof: 'Para tejados, aporte las formas de tejado admitidas, los límites de pendiente, las opciones de cubierta y sus reglas para longitudes medidas y cantidades de material.',
    hall: 'Para naves, aporte las reglas de luces y crujías, las opciones de estructura y cerramiento, las dimensiones de puertas y las cantidades que necesita su equipo comercial o técnico.',
    pergola: 'Para pérgolas, aporte las dimensiones de los módulos, las opciones de lamas, la compatibilidad de cerramientos laterales y las reglas de precio de accesorios.',
    window: 'Para ventanas, aporte las secciones de perfil, los tipos de apertura, los límites dimensionales, las opciones de acristalamiento y las reglas que validan un conjunto.',
    fence: 'Para vallas, aporte las medidas de paneles y postes, las opciones de puertas, las reglas de esquinas y las cantidades necesarias para una oferta.',
    solar: 'Para sistemas solares, aporte los datos de paneles admitidos, las restricciones de colocación en cubierta y las hipótesis necesarias para estimar la producción.',
    chair: 'Para sillas, aporte las variantes de producto, materiales, acabados y combinaciones que permite su catálogo.',
    cardbox: 'Para embalaje, aporte los estilos de caja, las dimensiones interiores, las calidades de cartón, las reglas de cierre y los resultados de cantidad y precio necesarios.',
    bookshelf: 'Para estanterías, aporte los tamaños de módulo, la separación entre baldas, puertas, cajones, materiales y las reglas de combinaciones compatibles.',
    tiles: 'Para pavimentos, aporte los patrones de colocación, los formatos de pieza, las reglas de juntas y bordillos y los resultados de vista previa o materiales que necesita su equipo.',
  },
  fr: {
    roof: 'Pour les toitures, apportez les formes de toit prises en charge, les limites de pente, les options de couverture et vos règles de longueurs mesurées et de quantités de matériaux.',
    hall: 'Pour les hangars, apportez les règles de portées et de travées, les options de structure et d’enveloppe, les dimensions des portes et les quantités nécessaires à vos équipes commerciales ou techniques.',
    pergola: 'Pour les pergolas, apportez les dimensions des modules, les options de lames, la compatibilité des fermetures latérales et les règles de prix des accessoires.',
    window: 'Pour les fenêtres, apportez les sections de profilés, les types d’ouverture, les limites dimensionnelles, les options de vitrage et les règles qui valident un assemblage.',
    fence: 'Pour les clôtures, apportez les dimensions des panneaux et poteaux, les options de portail, les règles d’angle et les quantités nécessaires à un devis.',
    solar: 'Pour les systèmes solaires, apportez les données des panneaux pris en charge, les contraintes d’implantation en toiture et les hypothèses nécessaires aux estimations de production.',
    chair: 'Pour les chaises, apportez les variantes de produit, matériaux, finitions et combinaisons autorisées par votre catalogue.',
    cardbox: 'Pour l’emballage, apportez les styles de carton, les dimensions intérieures, les qualités de carton, les règles de fermeture et les livrables de quantité et de prix requis.',
    bookshelf: 'Pour les rayonnages, apportez les tailles de modules, l’espacement des tablettes, portes, tiroirs, matériaux et les règles de combinaisons compatibles.',
    tiles: 'Pour le pavage, apportez les motifs de pose, les formats, les règles de joints et de bordures, ainsi que les livrables d’aperçu ou de matériaux dont votre équipe a besoin.',
  },
  it: {
    roof: 'Per i tetti, prepari le forme di copertura supportate, i limiti di pendenza, le opzioni di manto e le Sue regole per lunghezze misurate e quantità di materiale.',
    hall: 'Per i capannoni, prepari le regole di luci e campate, le opzioni di struttura e involucro, le dimensioni dei portoni e le quantità necessarie al team commerciale o tecnico.',
    pergola: 'Per le pergole, prepari le dimensioni dei moduli, le opzioni delle lamelle, la compatibilità delle chiusure laterali e le regole di prezzo degli accessori.',
    window: 'Per le finestre, prepari le sezioni dei profili, i tipi di apertura, i limiti dimensionali, le opzioni di vetrata e le regole che rendono valido un assieme.',
    fence: 'Per le recinzioni, prepari le misure di pannelli e pali, le opzioni dei cancelli, le regole per gli angoli e le quantità richieste per un’offerta.',
    solar: 'Per gli impianti fotovoltaici, prepari i dati dei pannelli supportati, i vincoli di posa sul tetto e le ipotesi necessarie alle stime di produzione.',
    chair: 'Per le sedie, prepari le varianti di prodotto, i materiali, le finiture e le combinazioni consentite dal Suo catalogo.',
    cardbox: 'Per gli imballaggi, prepari gli stili di scatola, le dimensioni interne, le qualità di cartone, le regole di chiusura e gli output di quantità e prezzo richiesti.',
    bookshelf: 'Per le librerie, prepari le dimensioni dei moduli, la distanza tra i ripiani, ante, cassetti, materiali e le regole per le combinazioni compatibili.',
    tiles: 'Per le pavimentazioni, prepari gli schemi di posa, i formati, le regole di fughe e cordoli e gli output di anteprima o materiali necessari al Suo team.',
  },
};

const pricingLinks: Record<Locale,string> = {en: 'Understand implementation costs', ro: 'Vezi costurile de implementare', de: 'Implementierungskosten verstehen', es: 'Conocer los costes de implantación', fr: 'Comprendre les coûts de mise en œuvre', it: 'Capire i costi di implementazione'};

const questions: Record<Locale,[string,string][]> = {
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
  es: [
    ['¿Necesito archivos CAD completos antes de contactar con ustedes?', 'Envíe los planos, el catálogo o los ejemplos de producto de los que ya disponga y explique el resultado que necesita. Identificamos los recursos que faltan y las dependencias técnicas durante la revisión del proyecto.'],
    ['¿Puede el configurador usar nuestros precios y sistemas existentes?', 'Revisamos sus reglas de precios, los resultados necesarios y las interfaces disponibles. El alcance de la integración se acuerda tras la revisión técnica, no se da por supuesto a partir de una demo web.'],
    ['¿Qué ocurre después de enviar una consulta?', 'Revisamos el producto, las variantes y los datos disponibles, y aclaramos si encaja un sistema existente, una adaptación o un desarrollo a medida. El alcance, los plazos y el precio dependen de esa revisión.'],
  ],
  fr: [
    ['Faut-il des fichiers CAO complets avant de vous contacter ?', 'Envoyez les plans, le catalogue ou les exemples de produits dont vous disposez et expliquez le résultat attendu. Nous identifions les éléments manquants et les dépendances techniques lors de la revue du projet.'],
    ['Le configurateur peut-il utiliser nos prix et nos systèmes existants ?', 'Nous examinons vos règles de prix, les livrables requis et les interfaces disponibles. Le périmètre d’intégration est convenu après revue technique, et non déduit d’une démo en ligne.'],
    ['Que se passe-t-il après l’envoi d’une demande ?', 'Nous examinons le produit, les variantes et les données disponibles, puis précisons si un système existant, une adaptation ou un développement sur mesure convient. Le périmètre, le calendrier et le prix dépendent de cette revue.'],
  ],
  it: [
    ['Servono file CAD completi prima di contattarvi?', 'Invii i disegni, il catalogo o gli esempi di prodotto già disponibili e descriva il risultato desiderato. Individuiamo le risorse mancanti e le dipendenze tecniche durante la revisione del progetto.'],
    ['Il configuratore può usare i nostri prezzi e i sistemi esistenti?', 'Esaminiamo le Sue regole di prezzo, gli output richiesti e le interfacce disponibili. Il perimetro dell’integrazione viene concordato dopo la revisione tecnica, non dato per scontato da una demo sul sito.'],
    ['Cosa succede dopo l’invio di una richiesta?', 'Esaminiamo il prodotto, le varianti e i dati disponibili, poi chiariamo se è adatto un sistema esistente, un adattamento o uno sviluppo su misura. Perimetro, tempi e prezzo dipendono da questa revisione.'],
  ],
};

export function ConfiguratorProjectBrief({locale,product}: {locale: Locale;product:ConfiguratorRouteSlug}) {
  const text=copy[locale];
  return <section className="detail-intro solid-section project-brief"><div className="page-frame outputs-grid"><h2>{text.title}</h2><div><p>{text.body}</p>{inputs[locale][product] && <p>{inputs[locale][product]}</p>}<p>{text.note}</p><div className="project-questions">{questions[locale].map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><div className="roof-example-actions"><a className="launch-link" href={`${localizedPath(locale,'/contact')}?project=${encodeURIComponent(product)}`}>{text.action}<span aria-hidden="true">↗</span></a><a className="text-link" href={`${localizedPath(locale,'/pricing')}#cost-breakdown`}>{pricingLinks[locale]}<span aria-hidden="true">→</span></a></div></div></div></section>;
}
