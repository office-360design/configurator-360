import type { Configurator } from "./configurators";
import type { Locale } from "./i18n";
import type { LiteSlug } from "./lite-products";

type ProductCopy = {
  name: string; category: string; statement: string; description: string;
  features: [string, string][]; outputs: string[]; questions: [string, string][];
};

export const newProductCopy: Record<Locale, Record<LiteSlug, ProductCopy>> = {
  en: {
    chair: {
      name: "Chair", category: "Furniture & materials", statement: "Find the finish. See the whole chair.",
      description: "Compare wood colours and upholstery on a furnished 3D chair. Explore the material combination from every angle, then open the full configurator for more wood and fabric options.",
      features: [["Wood finishes", "Compare warm oak, darker timber and painted tones across the chair frame."], ["Upholstery", "Change fabric colour and compare woven and velvet-inspired surface treatments."], ["Coordinated materials", "Judge the frame and cushions together before choosing a finish combination."], ["Original geometry", "Inspect the procedural chair model, including fitted arm joints and upholstered seat and back."], ["Fixed proportions", "The chair has a fixed 500 × 470 × 790 mm envelope. This preview changes finishes, not product dimensions."], ["Full material selection", "Continue to the full application to explore its wood species, fabric categories and saved configurations."]],
      outputs: ["Wood colour", "Upholstery colour", "Material combination", "3D product view"],
      questions: [["Can I change the chair dimensions?", "No. This chair uses fixed dimensions. The website preview lets you compare frame and upholstery finishes."], ["Are the textures supplier samples?", "No. Geometry and surface patterns are generated for visual comparison. Confirm the physical finish with the supplier."], ["Will my preview transfer to the full configurator?", "The full configurator opens separately with its own initial state. Website preview choices are not transferred."]],
    },
    cardbox: {
      name: "Cardboard boxes", category: "Packaging systems", statement: "Size the box. Explore the closure.",
      description: "Explore corrugated packaging in 3D. Adjust box dimensions, compare shipping and lid styles, and inspect the opening before continuing to board specification and decoration in the full configurator.",
      features: [["Box structures", "Explore all nine original box styles, with their FEFCO references, dimensions and compatible closures."], ["Parametric dimensions", "Adjust width, depth and height independently to judge the proportions of your package."], ["Closure preview", "Inspect the top panel using the original opening motion and select compatible top and bottom closures."], ["Board appearance", "Compare the original TFT, AFT and AFA paper presets with natural or white inner and outer liners."], ["Packaging catalogue", "The full application includes nine structures with relevant FEFCO style or family references."], ["Artwork & specification", "Use the full application for board layers, handles, cut-outs, surface colours, text and image placement."]],
      outputs: ["Box dimensions", "Structure selection", "Internal volume estimate", "Closure preview"],
      questions: [["Which box types can I try here?", "All nine original styles: shipping, full-overlap, telescope, archive, pizza, mailer, self-erecting, two-point glued and sleeve/drawer boxes. Each starts with its original dimensions and closures."], ["Is this a manufacturing dieline?", "No. The lite model illustrates dimensions and closure motion. Confirm the exact construction, material and production drawing with your packaging supplier."], ["Can I add a logo or specify the corrugated board?", "Yes, in the full configurator. Open it for image and text decoration, board construction, flute profiles and paper layers."]],
    },
    bookshelf: {
      name: "Modular bookshelves", category: "Modular furniture", statement: "Build the run. Turn the corner.",
      description: "Arrange connected bookshelf modules in a straight or L-shaped run. Compare two dimensional families, wood finishes and door options using geometry adapted from the client-specific modular system.",
      features: [["Connected modules", "Choose a bounded run of two to four modules in this preview. Connections follow the module sequence."], ["L-shaped layouts", "Add a 90° corner with the same shelf and upright construction as the full system."], ["Dimensional families", "Choose compact or tall proportions. All connected modules use one family."], ["Door options", "Compare open shelves, lower solid doors and full-height glazed doors on straight modules."], ["Wood finishes", "Compare natural, mahogany and wenge colour directions across the whole preview."], ["Component logic", "Inspect modules and their connection count. Detailed per-module editing remains available in the full configurator."]],
      outputs: ["Module layout", "Dimensional family", "Door & finish selection", "Connection count"],
      questions: [["What are the module dimensions?", "Compact straight modules are 800 × 350 × 2150 mm, with 750 × 750 mm corners. Tall straight modules are 900 × 350 × 2300 mm, with 850 × 850 mm corners."], ["Can corner modules have doors?", "Corner modules remain open. Lower and glazed door options apply to straight modules."], ["Does this include a price or manufacturing BOM?", "No price is shown. This client-specific system reports modules and connection sets; it does not claim a complete manufacturing bill of materials."]],
    },
    tiles: {
      name: "Pavement tiles", category: "Landscape & paving", statement: "Choose the pattern. Measure the surface.",
      description: "Compare paving layouts on a measured rectangular area. Change dimensions, laying pattern and colour while tile quantities follow the same layout calculation used by the full pavement prototype.",
      features: [["Measured area", "Adjust the width and length of a small paving sample and see its area update."], ["Laying patterns", "Compare running bond, herringbone and basket weave using a rectangular 20 × 10 cm paving format."], ["Edge cuts", "See how the layout meets the boundary, including pieces trimmed along the perimeter."], ["Colour selection", "Compare concrete colour directions without downloading a photographic texture library."], ["Quantity preview", "See installed pieces, including cut pieces, calculated by the production layout engine."], ["Extended planning", "Try three paving formats, curbs and house exclusions here. The full prototype adds custom outlines, spare allowance and CSV quantities."]],
      outputs: ["Paved area", "Laying pattern", "Installed piece count", "Colour selection"],
      questions: [["Are the quantities a supplier quote?", "No. This preview reports area and installed pieces. The full prototype uses editable demo rates; confirm purchasing quantities and prices with your supplier."], ["Can I include curbs or a house footprint?", "Yes. Add border curbs and a rectangular or L-shaped house, adjust its size and rotation, and see paving trimmed around it. Use the full configurator for custom areas and detailed planning."], ["Is the pavement configurator a finished commercial product?", "It is a working prototype. Layout and quantity exploration are available, while material appearance remains illustrative."]],
    },
  },
  ro: {
    chair: {
      name: "Scaune", category: "Mobilier și materiale", statement: "Alege finisajul. Vezi scaunul complet.",
      description: "Compară culorile lemnului și tapițeriei pe un scaun 3D. Examinează combinația din orice unghi, apoi deschide configuratorul complet pentru mai multe esențe și materiale.",
      features: [["Finisaje din lemn", "Compară tonuri naturale, închise sau vopsite pe cadrul scaunului."], ["Tapițerie", "Schimbă culoarea și compară suprafețe inspirate de țesătură și catifea."], ["Materiale coordonate", "Vezi cadrul și pernele împreună înainte de alegerea finisajelor."], ["Geometrie originală", "Examinează modelul procedural, îmbinările brațelor, șezutul și spătarul tapițat."], ["Proporții fixe", "Dimensiunile sunt 500 × 470 × 790 mm. Previzualizarea schimbă finisajele, nu dimensiunile."], ["Selecție completă", "În aplicația completă poți explora esențe, categorii de țesături și configurații salvate."]],
      outputs: ["Culoare lemn", "Culoare tapițerie", "Combinație de materiale", "Vedere 3D"],
      questions: [["Pot modifica dimensiunile scaunului?", "Nu. Modelul are dimensiuni fixe. Previzualizarea permite compararea finisajelor cadrului și tapițeriei."], ["Texturile sunt mostre de furnizor?", "Nu. Suprafețele sunt generate pentru comparație vizuală. Confirmă finisajul fizic cu furnizorul."], ["Alegerile se transferă în aplicația completă?", "Nu. Configuratorul complet se deschide separat, cu propria configurație inițială."]],
    },
    cardbox: {
      name: "Cutii din carton", category: "Sisteme de ambalare", statement: "Dimensionează cutia. Explorează închiderea.",
      description: "Explorează ambalaje din carton ondulat în 3D. Reglează dimensiunile, compară clapele și capacul, apoi continuă cu materialele și personalizarea în configuratorul complet.",
      features: [["Tipuri de cutii", "Explorează toate cele nouă tipuri originale, cu referințe FEFCO, dimensiuni și închideri compatibile."], ["Dimensiuni parametrice", "Reglează independent lățimea, adâncimea și înălțimea ambalajului."], ["Previzualizare închidere", "Inspectează panoul superior folosind mișcarea originală și alege închiderile compatibile."], ["Aspect carton", "Compară rețetele originale TFT, AFT și AFA, cu hârtie natur sau albă la exterior și interior."], ["Catalog de ambalaje", "Aplicația completă include nouă structuri cu referințe FEFCO de tip sau familie."], ["Grafică și specificații", "Folosește aplicația completă pentru straturi de carton, mânere, decupaje, text și imagini."]],
      outputs: ["Dimensiuni cutie", "Tip de structură", "Volum interior estimat", "Previzualizare închidere"],
      questions: [["Ce tipuri de cutii pot testa aici?", "Toate cele nouă tipuri originale: standard, suprapuse, telescopice, arhivare, pizza, poștale, autoformare, lipite în două puncte și manșon cu sertar. Fiecare pornește cu dimensiunile și închiderile originale."], ["Este un desen pentru producție?", "Nu. Modelul ilustrează dimensiunile și mișcarea închiderii. Confirmă construcția, materialul și desenul de producție cu furnizorul."], ["Pot adăuga un logo?", "Da, în aplicația completă, unde sunt disponibile imagini, text și configurarea cartonului ondulat."]],
    },
    bookshelf: {
      name: "Biblioteci modulare", category: "Mobilier modular", statement: "Construiește șirul. Continuă după colț.",
      description: "Aranjează module de bibliotecă în linie sau în L. Compară două familii dimensionale, finisaje și uși folosind geometria adaptată din sistemul modular dedicat clientului.",
      features: [["Module conectate", "Alege între două și patru module în previzualizare, cu îmbinări consecutive."], ["Configurație în L", "Adaugă un colț de 90° cu rafturi și montanți din sistemul complet."], ["Familii dimensionale", "Alege varianta compactă sau înaltă pentru toate modulele conectate."], ["Opțiuni de uși", "Compară rafturi deschise, uși inferioare pline sau uși vitrate pe modulele drepte."], ["Finisaje lemn", "Compară nuanțele natur, mahon și wenge pe întreaga configurație."], ["Componente", "Vezi numărul de module și conexiuni. Editarea individuală este disponibilă în aplicația completă."]],
      outputs: ["Dispunere module", "Familie dimensională", "Uși și finisaje", "Număr de conexiuni"],
      questions: [["Ce dimensiuni au modulele?", "Varianta compactă: module drepte de 800 × 350 × 2150 mm și colțuri de 750 × 750 mm. Varianta înaltă: 900 × 350 × 2300 mm și colțuri de 850 × 850 mm."], ["Modulele de colț pot avea uși?", "Nu. Modulele de colț rămân deschise; ușile se aplică modulelor drepte."], ["Este inclus un preț?", "Nu se afișează prețuri. Sistemul raportează module și seturi de conexiuni, nu o listă completă de producție."]],
    },
    tiles: {
      name: "Pavaje", category: "Amenajări și pavaje", statement: "Alege modelul. Măsoară suprafața.",
      description: "Compară modele de pavaj pe o suprafață dreptunghiulară. Schimbă dimensiunile, modelul de montaj și culoarea, cu numărul de pavele calculat de motorul prototipului complet.",
      features: [["Suprafață măsurată", "Reglează lungimea și lățimea unei zone mici și urmărește suprafața."], ["Modele de montaj", "Compară montaj decalat, os de pește și împletit, cu pavele de 20 × 10 cm."], ["Tăieturi la margine", "Vezi piesele ajustate la limita suprafeței."], ["Culori", "Compară nuanțe de beton fără încărcarea unei biblioteci foto."], ["Cantități", "Numărul de piese montate include piesele tăiate la margine."], ["Planificare extinsă", "Prototipul complet include alte formate, contururi, borduri, amprenta casei, rezervă și export CSV."]],
      outputs: ["Suprafață pavată", "Model de montaj", "Număr de piese montate", "Culoare"],
      questions: [["Cantitățile reprezintă o ofertă?", "Nu. Previzualizarea arată suprafața și piesele montate. Prototipul complet folosește tarife demo editabile; confirmă achiziția și prețul cu furnizorul."], ["Pot adăuga borduri sau o casă?", "Da. Adaugă borduri și o casă dreptunghiulară sau în L, reglează dimensiunile și rotirea, iar pavajul se adaptează amprentei. Aplicația completă oferă contururi personalizate."], ["Configuratorul este un produs comercial final?", "Este un prototip funcțional pentru explorarea modelelor și cantităților. Aspectul materialelor este ilustrativ."]],
    },
  },
  de: {
    chair: {
      name: "Stühle", category: "Möbel & Materialien", statement: "Oberfläche wählen. Den ganzen Stuhl sehen.",
      description: "Vergleichen Sie Holzfarben und Polster an einem 3D-Stuhl. Prüfen Sie die Kombination aus jedem Blickwinkel und öffnen Sie den vollständigen Konfigurator für weitere Holz- und Stoffoptionen.",
      features: [["Holzoberflächen", "Vergleichen Sie natürliche, dunkle und lackierte Farbtöne am Stuhlrahmen."], ["Polster", "Ändern Sie die Farbe und vergleichen Sie gewebte sowie samtartige Oberflächen."], ["Materialkombination", "Beurteilen Sie Rahmen und Polster gemeinsam vor der Auswahl."], ["Originalgeometrie", "Prüfen Sie das prozedurale Modell mit Armverbindungen, Sitzpolster und Rückenlehne."], ["Feste Proportionen", "Der Stuhl misst 500 × 470 × 790 mm. Die Vorschau verändert Oberflächen, keine Produktmaße."], ["Weitere Materialien", "Die vollständige Anwendung bietet Holzarten, Stoffkategorien und gespeicherte Konfigurationen."]],
      outputs: ["Holzfarbe", "Polsterfarbe", "Materialkombination", "3D-Produktansicht"],
      questions: [["Kann ich die Stuhlmaße ändern?", "Nein. Das Modell hat feste Maße. Die Vorschau dient dem Vergleich von Rahmen- und Polsteroberflächen."], ["Sind die Texturen Lieferantenmuster?", "Nein. Die Muster werden für den visuellen Vergleich erzeugt. Bestätigen Sie das tatsächliche Material beim Lieferanten."], ["Werden meine Einstellungen übernommen?", "Nein. Der vollständige Konfigurator öffnet separat mit seinem eigenen Ausgangszustand."]],
    },
    cardbox: {
      name: "Kartonverpackungen", category: "Verpackungssysteme", statement: "Karton bemessen. Verschluss erkunden.",
      description: "Erkunden Sie Wellpappverpackungen in 3D. Ändern Sie die Maße, vergleichen Sie Klappen und Deckel und wechseln Sie zur vollständigen Anwendung für Materialaufbau und Gestaltung.",
      features: [["Kartontypen", "Entdecken Sie alle neun Originaltypen mit FEFCO-Referenzen, Maßen und passenden Verschlüssen."], ["Parametrische Maße", "Passen Sie Breite, Tiefe und Höhe unabhängig an."], ["Verschlussansicht", "Prüfen Sie die obere Platte mit der originalen Öffnungsbewegung und wählen Sie passende Verschlüsse."], ["Kartonoberfläche", "Vergleichen Sie die originalen TFT-, AFT- und AFA-Papieraufbauten mit naturfarbenen oder weißen Innen- und Außenseiten."], ["Verpackungskatalog", "Die vollständige Anwendung umfasst neun Konstruktionen mit FEFCO-Typ- oder Familienreferenzen."], ["Grafik & Spezifikation", "Die vollständige Anwendung bietet Papierlagen, Griffe, Ausschnitte, Texte und Bilder."]],
      outputs: ["Kartonmaße", "Konstruktionsauswahl", "Geschätztes Innenvolumen", "Verschlussansicht"],
      questions: [["Welche Kartons kann ich hier testen?", "Alle neun Originaltypen: Standard, Vollüberlappung, Teleskop, Archiv, Pizza, Versand, Automatikboden, Zweipunkt-Klebung und Schuber mit Schublade. Jeder Typ startet mit den ursprünglichen Maßen und Verschlüssen."], ["Ist das eine Fertigungszeichnung?", "Nein. Die Vorschau zeigt Maße und Verschlussbewegung. Konstruktion, Material und Fertigungszeichnung müssen mit dem Lieferanten abgestimmt werden."], ["Kann ich ein Logo hinzufügen?", "Ja, in der vollständigen Anwendung mit Bild- und Textgestaltung sowie Wellpappspezifikation."]],
    },
    bookshelf: {
      name: "Modulare Bücherregale", category: "Modulare Möbel", statement: "Die Reihe planen. Um die Ecke weiterbauen.",
      description: "Ordnen Sie verbundene Regalmodule gerade oder in L-Form an. Vergleichen Sie zwei Größenfamilien, Holzfarben und Türen mit Geometrie aus dem kundenspezifischen Modulsystem.",
      features: [["Verbundene Module", "Wählen Sie zwei bis vier Module in der Vorschau mit aufeinanderfolgenden Verbindungen."], ["L-förmiger Aufbau", "Fügen Sie eine 90°-Ecke mit Böden und Pfosten des vollständigen Systems hinzu."], ["Größenfamilien", "Wählen Sie kompakte oder hohe Proportionen für alle verbundenen Module."], ["Türoptionen", "Vergleichen Sie offene Böden, untere Holztüren und durchgehende Glastüren an geraden Modulen."], ["Holzfarben", "Vergleichen Sie Natur-, Mahagoni- und Wenge-Farbrichtungen am gesamten Aufbau."], ["Komponenten", "Sehen Sie Module und Verbindungen. Einzelbearbeitung erfolgt in der vollständigen Anwendung."]],
      outputs: ["Modulanordnung", "Größenfamilie", "Türen & Oberflächen", "Verbindungsanzahl"],
      questions: [["Welche Maße haben die Module?", "Kompakt: gerade Module 800 × 350 × 2150 mm, Ecken 750 × 750 mm. Hoch: 900 × 350 × 2300 mm, Ecken 850 × 850 mm."], ["Können Eckmodule Türen haben?", "Nein. Eckmodule bleiben offen. Die Türauswahl gilt für gerade Module."], ["Wird ein Preis berechnet?", "Nein. Das kundenspezifische System zeigt Module und Verbindungssätze, keine vollständige Fertigungsstückliste."]],
    },
    tiles: {
      name: "Pflasterflächen", category: "Außenanlagen & Pflaster", statement: "Verband wählen. Fläche messen.",
      description: "Vergleichen Sie Pflasterverbände auf einer rechteckigen Fläche. Ändern Sie Maße, Muster und Farbe mit Stückzahlen aus der Layoutberechnung des vollständigen Prototyps.",
      features: [["Gemessene Fläche", "Passen Sie Länge und Breite einer kleinen Fläche an."], ["Verlegemuster", "Vergleichen Sie Läuferverband, Fischgrät und Flechtverband mit dem Format 20 × 10 cm."], ["Randzuschnitte", "Sehen Sie, wie Steine am Rand der Fläche zugeschnitten werden."], ["Farbauswahl", "Vergleichen Sie Betonfarbtöne ohne zusätzliche Fototexturen."], ["Stückzahlen", "Die Berechnung zählt verlegte Steine einschließlich zugeschnittener Stücke."], ["Erweiterte Planung", "Der vollständige Prototyp bietet weitere Formate, Konturen, Randsteine, Hausflächen, Reserve und CSV-Export."]],
      outputs: ["Pflasterfläche", "Verlegemuster", "Verlegte Stückzahl", "Farbauswahl"],
      questions: [["Sind die Mengen ein Lieferantenangebot?", "Nein. Die Vorschau zeigt Fläche und verlegte Stücke. Der vollständige Prototyp verwendet editierbare Demopreise. Bestätigen Sie Bestellmengen und Preise beim Lieferanten."], ["Kann ich Randsteine oder ein Haus ergänzen?", "Ja. Ergänzen Sie Randsteine und ein rechteckiges oder L-förmiges Haus. Größe und Drehung sind einstellbar; das Pflaster wird am Grundriss zugeschnitten. Individuelle Flächen bietet die vollständige Anwendung."], ["Ist der Konfigurator ein fertiges Handelsprodukt?", "Er ist ein funktionsfähiger Prototyp für Muster und Mengen. Die Materialdarstellung ist illustrativ."]],
    },
  },
};

const indices = { chair: "07", cardbox: "08", bookshelf: "09", tiles: "10" };
const seoNames: Record<Locale, Record<LiteSlug, string>> = {
  en: { chair: "3D Chair Configurator", cardbox: "3D Cardboard Box Configurator", bookshelf: "3D Modular Bookshelf Configurator", tiles: "3D Pavement & Paving Configurator" },
  ro: { chair: "Configurator scaune 3D", cardbox: "Configurator cutii carton 3D", bookshelf: "Configurator biblioteci modulare 3D", tiles: "Configurator pavaje 3D" },
  de: { chair: "3D Stuhl-Konfigurator", cardbox: "3D Karton-Konfigurator", bookshelf: "3D Bücherregal-Konfigurator", tiles: "3D Pflaster-Konfigurator" },
};
export function newConfigurator(slug: LiteSlug, locale: Locale = "en"): Configurator {
  const copy = newProductCopy[locale][slug];
  return {
    slug, index: indices[slug], category: copy.category, title: seoNames[locale][slug], shortTitle: copy.name,
    statement: copy.statement, description: copy.description, launchUrl: `https://www.360configurator.com/${slug}-configurator/`,
    accent: "#359CE7", controls: [], features: copy.features.map(([title, body]) => ({ title, short: title, body })),
    outputs: copy.outputs, seoH1: seoNames[locale][slug], seoTitle: seoNames[locale][slug], seoDescription: copy.description,
  };
}
