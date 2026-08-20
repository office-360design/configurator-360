import { configurators, type Configurator, type ConfiguratorSlug } from "./configurators";
import { configuratorUrl, type Locale } from "./i18n";

type Translation = Pick<Configurator, "category" | "title" | "shortTitle" | "statement" | "description" | "controls" | "features" | "outputs" | "seoH1" | "seoTitle" | "seoDescription">;

const ro: Record<ConfiguratorSlug, Translation> = {
  pergola: {
    category: "Arhitectură exterioară", title: "Pergole & Arhitectură Exterioară", shortTitle: "Pergole",
    statement: "Proiectează lumina. Configurează atmosfera.",
    description: "Un configurator de pergole 3D care rulează direct în browser și combină dimensiuni parametrice, montaj independent sau la perete, controlul lamelelor, închideri laterale, simulare de mediu, accesorii și preț estimativ live.",
    controls: ["Lamele 0°", "Lamele 48°", "Noapte + LED"],
    features: [
      { title: "Structură parametrică", short: "Structură", body: "Definește amprenta, înălțimea și tipul de montaj, iar stâlpii, grinzile, deschiderile și drenajul ascuns se reconstruiesc ca un ansamblu coordonat. Dimensiunile rămân conectate la produsul fabricabil, nu la o simplă reprezentare decorativă." },
      { title: "Controlul lamelelor și al luminii", short: "Lamele", body: "Schimbă orientarea și unghiul lamelelor în raport cu poziția soarelui. Scena arată imediat efectul asupra deschiderii, umbrei, luminii directe și protecției la ploaie, înainte ca structura să fie produsă sau instalată." },
      { title: "Închideri configurabile pe patru laturi", short: "Închideri", body: "Fiecare latură devine o zonă independentă: deschisă, cu screen textil, screen motorizat, lamele de intimitate sau sticlă glisantă fără rame. Poziția și gradul de deschidere sunt vizibile direct în modelul spațial." },
      { title: "Climat și iluminat integrat", short: "Iluminat", body: "Comută între zi și noapte, apoi configurează LED-ul perimetral, temperatura de culoare, spoturile integrate și încălzitoarele cu infraroșu. Lumina și umbrele răspund împreună cu produsul, pentru o evaluare realistă a atmosferei și confortului." },
      { title: "Automatizare și senzori", short: "Automatizare", body: "Alege comandă manuală, telecomandă sau întrerupător și stabilește pozițiile componentelor automatizate. Senzorii de ploaie și vânt intră în aceeași configurație, conectând opțiunile vizibile cu funcționarea reală după instalare." },
      { title: "Rezoluție comercială", short: "Preț live", body: "Dimensiunile, lungimile închiderilor, automatizarea, iluminatul și accesoriile actualizează continuu modelul comercial. Fiecare alegere validă recalculează imediat totalul și păstrează produsul vizual sincronizat cu discuția de vânzare." },
    ],
    outputs: ["Ofertă live", "Geometrie configurată", "Listă de accesorii", "Rezumat pentru client"],
    seoH1: "Configurator pergolă 3D online",
    seoTitle: "Configurator Pergolă 3D Online | Proiectare Pergole",
    seoDescription: "Configurează o pergolă online în 3D. Alege dimensiunile, lamelele, închiderile laterale, iluminatul, automatizarea, accesoriile și prețul live.",
  },
  roof: {
    category: "Construcții parametrice", title: "Acoperișuri & Structuri Arhitecturale", shortTitle: "Acoperișuri",
    statement: "Geometrie complexă. Răspunsuri construibile.",
    description: "Un configurator arhitectural bazat pe reguli, care transformă forma, dimensiunile și materialele acoperișului în geometrie măsurabilă și rezultate pregătite pentru producție.",
    controls: ["Două ape", "Metal", "Formă L"],
    features: [
      { title: "Cinci tipologii de acoperiș", short: "Forme", body: "Treci între acoperișuri în două ape, patru ape, o apă, formă L și lucarnă într-o singură scenă bazată pe reguli. Fiecare tipologie este generată ca geometrie relevantă, nu aleasă dintr-o bibliotecă de modele fixe." },
      { title: "Preluarea planurilor personalizate", short: "Planuri", body: "Încarcă referințe PDF, imagine, DWG sau DXF pentru proiectele care depășesc familiile parametrice standard. Fluxul creează o punte clară între documentația arhitecturală convențională și un acoperiș configurabil și măsurabil." },
      { title: "Control dimensional pe cinci axe", short: "Dimensiuni", body: "Reglează independent lungimea, adâncimea, înălțimea pereților, panta și streașina, în timp ce anvelopa se reconstruiește în timp real. Explorarea dimensională rămâne coerentă vizual și utilă tehnic." },
      { title: "Geometrie adaptată învelitorii", short: "Materiale", body: "Aplică finisaje metalice și minerale cu comportamente de suprafață și limite proprii de pantă. Materialul influențează nu doar aspectul, ci și compatibilitatea geometrică, cantitățile și interpretarea comercială." },
      { title: "Cantități măsurate", short: "Cantități", body: "Calculează suprafața, coamele, streșinile, doliile, șorțurile, jgheaburile și componentele asociate direct din geometria generată. Formele complexe rămân conectate la date măsurabile pe măsură ce dimensiunile se schimbă." },
      { title: "BOM și export CSV", short: "Export BOM", body: "Inspectează acoperișul ca poziții tarifate la nivel de componentă și exportă lista de materiale în CSV. Configurația trece din explorare vizuală în estimare, achiziție sau producție fără reconstrucție manuală." },
    ],
    outputs: ["Listă de materiale", "Ofertă CSV", "Tabel dimensional", "Geometria acoperișului"],
    seoH1: "Configurator acoperiș 3D online",
    seoTitle: "Configurator Acoperiș 3D Online | Proiectare & BOM",
    seoDescription: "Configurează un acoperiș online în 3D. Alege forma, dimensiunile, panta și materialele și obține cantități, BOM și ofertă CSV.",
  },
  window: {
    category: "Sisteme de înaltă precizie", title: "Ferestre & Profile Arhitecturale", shortTitle: "Sisteme de profile",
    statement: "Descoperă ingineria din interiorul produsului.",
    description: "Un mediu tehnic de configurare de înaltă fidelitate pentru profile arhitecturale, finisaje bicolore, mecanisme de deschidere și analiză explodată a ansamblului.",
    controls: ["Asamblat", "Bicolor", "Explodat"],
    features: [
      { title: "Construcția exactă a sistemului", short: "AW CT 65", body: "Configurează sistemul Schüco AW CT 65 B2-6 folosind profilele reale, vitrajul, garniturile, baghetele și relațiile dintre feronerie. Previzualizarea păstrează logica tehnică a sistemului, fără a o înlocui cu un model generic." },
      { title: "Dimensiuni parametrice", short: "Dimensiuni", body: "Modifică lățimea și înălțimea în limitele sistemului, iar rama, cerceveaua, vitrajul și feroneria se reconstruiesc împreună. Dimensionarea comercială rămâne astfel conectată la produsul arhitectural real." },
      { title: "Compatibilitatea pachetului de sticlă", short: "Pachet sticlă", body: "Schimbă grosimea vitrajului și vezi imediat codurile compatibile pentru garnitură și baghetă. Secțiunile lor reale se actualizează lângă comenzi, făcând vizibilă o dependență tehnică altfel greu de explicat." },
      { title: "Mecanica deschiderii", short: "Deschidere", body: "Comută între deschiderea batantă și oscilo-batantă, apoi reglează unghiul pentru a observa mișcarea cercevelei. Comportamentul produsului devine parte din experiența de vânzare, nu o explicație tehnică ulterioară." },
      { title: "Finisaje independente", short: "Finisaje", body: "Alege un finisaj uniform sau tratamente diferite la interior și exterior—brut, anodizat ori vopsit în câmp electrostatic. Decizia bicoloră rămâne atașată aceleiași configurații și răspunde cerințelor fațadei și interiorului." },
      { title: "Diagnostic de ansamblu", short: "Diagnostic", body: "Explodează fereastra completă, afișează familiile de materiale în culori tehnice sau izolează o secțiune de profil. Aceste moduri fac lizibile extruziile, etanșările, vitrajul și relațiile termice fără a părăsi produsul configurat." },
    ],
    outputs: ["Ansamblu configurat", "Structură de componente", "Specificație de finisaje", "Rezumat tehnic"],
    seoH1: "Configurator ferestre 3D online",
    seoTitle: "Configurator Ferestre 3D Online | Profile & Vitraj",
    seoDescription: "Configurează ferestre online în 3D cu dimensiuni parametrice, profile, vitraj, finisaje bicolore, simularea deschiderii și vedere explodată.",
  },
  hall: {
    category: "Structuri industriale", title: "Hală Industrială & Depozit", shortTitle: "Hale industriale",
    statement: "Configurează anvelopa. Rezolvă structura.",
    description: "Un sistem parametric pentru clădiri industriale, care coordonează cadrele portal, structura secundară, închiderile și golurile de acces într-un singur model spațial.",
    controls: ["Travei", "Anvelopă", "Explodat"],
    features: [
      { title: "Anvelopă parametrică", short: "Anvelopă", body: "Lungimea, deschiderea, înălțimea la streașină și panta reconstruiesc întregul volum industrial, menținând coerente cadrele portal, coama și gabaritul interior utilizabil." },
      { title: "Travei structurale calculate", short: "Cadre", body: "O distanță țintă între cadre este transformată automat într-un număr practic de travei egale, astfel încât ritmul structural să rămână sincronizat cu lungimea clădirii." },
      { title: "Preseturi de solicitare", short: "Solicitare", body: "Comută între variante ușoară, standard și grea pentru a comunica împreună secțiunile principale, masa vizuală și nivelul operațional pentru care este gândită structura." },
      { title: "Geometria accesului", short: "Acces", body: "Configurează lățimea și înălțimea ușii industriale în limitele fațadei, păstrând golul compatibil cu deschiderea halei și cota la streașină." },
      { title: "Vizibilitatea straturilor", short: "Straturi", body: "Afișează sau ascunde independent închiderile și structura secundară pentru a trece de la clădirea finisată la logica portantă din interiorul ei." },
      { title: "Ansamblu explodat", short: "Explodat", body: "Separă anvelopa, elementele secundare și cadrele principale într-o secvență constructivă lizibilă, apoi reasamblează clădirea printr-o singură acțiune." },
    ],
    outputs: ["Geometrie configurată", "Plan de cadre", "Cantități anvelopă", "Specificație acces"],
    seoH1: "Configurator hală industrială 3D",
    seoTitle: "Configurator Hală Industrială 3D | Hale & Depozite",
    seoDescription: "Configurează o hală industrială sau un depozit în 3D. Modifică dimensiunile, cadrele portal, traveile, închiderile și golurile de acces.",
  },
  solar: {
    category: "Sisteme energetice", title: "Acoperiș Solar & Sistem Energetic", shortTitle: "Sisteme solare",
    statement: "Modelează acoperișul. Simulează ziua energetică.",
    description: "Un configurator fotovoltaic dependent de locație, care conectează geometria acoperișului, amplasarea panourilor, poziția reală a soarelui, consumul și stocarea într-un singur model energetic vizual.",
    controls: ["Locație", "Timp solar", "Model energetic"],
    features: [
      { title: "Context solar după adresă", short: "Locație", body: "Transformă adresa unui proiect din România în coordonate geografice și folosește locația pentru poziția soarelui, răsărit, apus și ipotezele regionale de producție." },
      { title: "Soare și anotimpuri reale", short: "Soare", body: "Reglează ora, data, anotimpul și orientarea fațadei acoperișului, iar lumina vizibilă și profilul de producție răspund aceleiași stări de mediu." },
      { title: "Acoperiș solar parametric", short: "Acoperiș", body: "Comută între acoperișuri în două ape, patru ape și o apă, apoi modifică dimensiunile și panta în timp ce suprafețele disponibile se reconstruiesc." },
      { title: "Amplasare fizică a panourilor", short: "Panouri", body: "Alege numărul de module și versantul; previzualizarea distribuie panouri rezidențiale la dimensiuni reale și calculează puterea din numărul care încape efectiv." },
      { title: "Consum și stocare", short: "Stocare", body: "Compară profiluri de consum, activează stocarea LiFePO₄ și reglează capacitatea bateriei pentru a vedea efectul asupra autoconsumului și schimbului cu rețeaua." },
      { title: "Analiză energetică", short: "Analiză", body: "Deschide un spațiu dedicat producției versus consum, cu generare zilnică, consum casnic, autonomie, import și export prezentate într-o singură vedere decizională." },
    ],
    outputs: ["Estimare sistem", "Putere instalată", "Profil energetic zilnic", "Scenariu de stocare"],
    seoH1: "Configurator sistem fotovoltaic 3D",
    seoTitle: "Configurator Panouri Solare 3D | Sistem Fotovoltaic",
    seoDescription: "Configurează un sistem fotovoltaic rezidențial în 3D cu geometria acoperișului, panouri, poziția soarelui, consum, baterie și analiză energetică.",
  },
};

const de: Record<ConfiguratorSlug, Translation> = {
  pergola: {
    category: "Outdoor-Architektur", title: "Pergola & Outdoor-Architektur", shortTitle: "Pergola",
    statement: "Tageslicht planen. Atmosphäre konfigurieren.",
    description: "Ein browserbasierter 3D Pergola-Konfigurator für freistehende und wandmontierte Systeme mit parametrischen Maßen, Lamellensteuerung, Seitenabschlüssen, Umgebungsvorschau, Zubehör und live geschätzter Preisberechnung.",
    controls: ["Lamellen 0°", "Lamellen 48°", "Nacht + LED"],
    features: [
      { title: "Parametrische Struktur", short: "Struktur", body: "Definieren Sie Grundfläche, Gesamthöhe und Montageart; Pfosten, Träger, Spannweiten und verdeckte Entwässerung werden als koordiniertes System neu aufgebaut. Maßänderungen bleiben mit dem realen Aufbau verbunden, statt nur ein dekoratives Modell zu skalieren." },
      { title: "Lamellen- und Tageslichtsteuerung", short: "Lamellen", body: "Ändern Sie Ausrichtung und Winkel der Lamellen relativ zum Sonnenstand. Die Szene zeigt unmittelbar, wie sich Öffnung, Verschattung, direktes Licht und Regenschutz verändern—noch bevor die Struktur gefertigt oder montiert wird." },
      { title: "Vierseitiges Schließsystem", short: "Seiten", body: "Behandeln Sie jede Seite als eigenständige Zone: offen, mit Screen, motorisiertem ZIP-Screen, Sichtschutzlamellen oder rahmenloser Schiebeverglasung. Position und Öffnungsgrad erscheinen direkt am räumlichen Modell." },
      { title: "Klima und integriertes Licht", short: "Licht", body: "Wechseln Sie zwischen Tag und Nacht und konfigurieren Sie umlaufende LEDs, Farbtemperatur, integrierte Spots und Infrarotstrahler. Licht und Schatten reagieren gemeinsam mit dem Produkt und vermitteln Atmosphäre und Komfort realistisch." },
      { title: "Automatisierung und Sensorik", short: "Automation", body: "Wählen Sie manuelle, Funk- oder Wandschaltersteuerung und koordinieren Sie die Montagepositionen automatisierter Komponenten. Regen- und Windsensoren werden Teil desselben Zustands und verbinden sichtbare Optionen mit dem späteren Verhalten." },
      { title: "Kaufmännische Auflösung", short: "Live-Preis", body: "Abmessungen, Seitenabschlüsse, Automation, Beleuchtung und Zubehör speisen das Preismodell kontinuierlich. Jede gültige Entscheidung aktualisiert den Gesamtpreis und hält Produktdarstellung und Verkaufsgespräch ohne Tabellenbruch synchron." },
    ],
    outputs: ["Live-Angebot", "Konfigurierte Geometrie", "Zubehörliste", "Kundenübersicht"],
    seoH1: "3D Pergola-Konfigurator online",
    seoTitle: "3D Pergola-Konfigurator Online | Pergola planen",
    seoDescription: "Planen und konfigurieren Sie Ihre Pergola online in 3D. Passen Sie Maße, Lamellen, Seitenabschlüsse, Beleuchtung, Automatisierung und Zubehör an.",
  },
  roof: {
    category: "Parametrisches Bauen", title: "Architekturdach & Tragwerk", shortTitle: "Dachsysteme",
    statement: "Komplexe Geometrie. Baubare Antworten.",
    description: "Ein regelbasierter Architekturkonfigurator, der Dachform, Maße und Materialsysteme in messbare Geometrie und produktionsfähige Ergebnisse übersetzt.",
    controls: ["Satteldach", "Metall", "L-Form"],
    features: [
      { title: "Fünf Dachtypologien", short: "Dachformen", body: "Wechseln Sie zwischen Sattel-, Walm-, Pult-, L-förmigem und Gaubendach in einer regelbasierten Szene. Jede Typologie wird als aussagekräftige Geometrie erzeugt, sodass unterschiedliche Situationen ohne starre Modellbibliothek gelöst werden." },
      { title: "Übernahme individueller Pläne", short: "Planimport", body: "Führen Sie PDF-, Bild-, DWG- oder DXF-Referenzen zu, wenn ein Projekt außerhalb parametrischer Standardfamilien liegt. So entsteht eine klare Verbindung zwischen klassischer Architekturdokumentation und einem künftig konfigurierbaren, messbaren Dachzustand." },
      { title: "Fünfachsige Maßsteuerung", short: "Abmessungen", body: "Regeln Sie Länge, Tiefe, Wandhöhe, Dachneigung und Traufüberstand unabhängig voneinander, während sich die gesamte Hülle in Echtzeit neu aufbaut. Die Maßfindung bleibt visuell kohärent und technisch belastbar." },
      { title: "Materialgerechte Geometrie", short: "Material", body: "Wenden Sie metallische und mineralische Deckungssysteme mit eigenem Oberflächenverhalten und Mindestneigungen an. Die Materialwahl beeinflusst Erscheinung, kompatible Geometrie, Mengenlogik und kaufmännische Auswertung." },
      { title: "Messbare Bauausgabe", short: "Mengen", body: "Ermitteln Sie Dachfläche, First, Traufen, Kehlen, Anschlüsse, Rinnen und zugehörige Bauteilmengen direkt aus der generierten Geometrie. Auch komplexe Formen bleiben bei jeder Maßänderung mit belastbaren Mengen verbunden." },
      { title: "Stückliste und CSV-Übergabe", short: "BOM-Export", body: "Prüfen Sie das Dach als bepreiste Positionen auf Komponentenebene und exportieren Sie die Stückliste als CSV. Die Konfiguration gelangt ohne manuelle Neuerfassung von der visuellen Exploration in Kalkulation, Einkauf oder Produktion." },
    ],
    outputs: ["Stückliste", "CSV-Angebot", "Maßübersicht", "Dachgeometrie"],
    seoH1: "3D Dach-Konfigurator online",
    seoTitle: "3D Dach-Konfigurator Online | Dach planen & Stückliste",
    seoDescription: "Konfigurieren Sie Ihr Dach online in 3D. Wählen Sie Dachform, Maße, Neigung und Material und ermitteln Sie Mengen, Stückliste und CSV-Angebot.",
  },
  window: {
    category: "Hochpräzise Systeme", title: "Fenster & Architekturprofile", shortTitle: "Profilsysteme",
    statement: "Die Technik im Produkt sichtbar machen.",
    description: "Eine hochpräzise technische Konfigurationsumgebung für Architekturprofile, zweifarbige Oberflächen, Öffnungsmechanik und explodierte Baugruppenanalysen.",
    controls: ["Montiert", "Bicolor", "Explodiert"],
    features: [
      { title: "Exakter Systemaufbau", short: "AW CT 65", body: "Konfigurieren Sie das Schüco-System AW CT 65 B2-6 aus realen Extrusionsprofilen, Verglasung, Dichtungen, Glasleisten und Beschlagbeziehungen. Die Vorschau erhält die Konstruktionslogik des Systems, statt sie durch ein generisches Fensterobjekt zu ersetzen." },
      { title: "Parametrische Abmessungen", short: "Abmessungen", body: "Verändern Sie Breite und Höhe innerhalb definierter Systemgrenzen; Rahmen, Flügel, Verglasung und Beschläge bauen sich gemeinsam neu auf. So bleibt die kaufmännische Größenfindung mit dem realen Profilsystem verbunden." },
      { title: "Kompatibilität des Glasaufbaus", short: "Glasaufbau", body: "Ändern Sie die Glasstärke und sehen Sie sofort, welche Dichtungs- und Glasleistencodes kompatibel bleiben. Die realen Querschnittsbilder aktualisieren sich neben der Steuerung und machen eine sonst unsichtbare technische Abhängigkeit verständlich." },
      { title: "Öffnungsmechanik", short: "Öffnung", body: "Wechseln Sie zwischen Dreh- und Kippöffnung und steuern Sie anschließend den Öffnungswinkel. Das Bewegungsverhalten des Flügels wird Teil der Vertriebserfahrung, statt in Zeichnungen oder ein späteres Technikgespräch ausgelagert zu werden." },
      { title: "Unabhängige Oberflächen", short: "Oberflächen", body: "Definieren Sie eine einheitliche Oberfläche oder getrennte Innen- und Außenbehandlungen—roh, eloxiert oder pulverbeschichtet. Bicolor-Entscheidungen bleiben am selben Zustand und beantworten Fassaden- und Innenraumanforderungen gleichzeitig." },
      { title: "Baugruppendiagnose", short: "Diagnose", body: "Explodieren Sie das komplette Fenster, zeigen Sie Materialfamilien in technischen Farben oder isolieren Sie einen Profilquerschnitt. Extrusionen, Dichtungen, Verglasung und thermische Beziehungen werden sichtbar, ohne das konfigurierte Produkt zu verlassen." },
    ],
    outputs: ["Konfigurierte Baugruppe", "Komponentenstruktur", "Oberflächenspezifikation", "Technische Übersicht"],
    seoH1: "3D Fenster-Konfigurator online",
    seoTitle: "3D Fenster-Konfigurator Online | Profile & Verglasung",
    seoDescription: "Konfigurieren Sie Fenster online in 3D mit parametrischen Maßen, Profilsystemen, Verglasung, Bicolor-Oberflächen, Öffnung und Explosionsansicht.",
  },
  hall: {
    category: "Industriebau", title: "Industriehalle & Lagergebäude", shortTitle: "Hallensysteme",
    statement: "Hülle konfigurieren. Tragwerk auflösen.",
    description: "Ein parametrisches Industriebau-System, das Portalrahmen, Sekundärstahl, Gebäudehülle und Zugangsgeometrie in einem räumlichen Modell koordiniert.",
    controls: ["Rahmenabstand", "Hülle", "Explodiert"],
    features: [
      { title: "Parametrische Gebäudehülle", short: "Hülle", body: "Länge, Spannweite, Traufhöhe und Dachneigung bauen das Industrievolumen neu auf und halten Portalrahmen, Firstgeometrie und nutzbare Innenhöhe konsistent." },
      { title: "Berechnetes Rahmenraster", short: "Rahmen", body: "Ein Zielabstand wird automatisch in eine praktikable Zahl gleichmäßiger Felder übersetzt, sodass der Tragwerksrhythmus mit der Gebäudelänge synchron bleibt." },
      { title: "Tragwerksklassen", short: "Klasse", body: "Wechseln Sie zwischen leichter, standardmäßiger und schwerer Ausführung, um Hauptprofile, visuelles Gewicht und vorgesehene betriebliche Beanspruchung gemeinsam zu vermitteln." },
      { title: "Zugangsgeometrie", short: "Zugang", body: "Konfigurieren Sie Breite und Höhe des Industrietors innerhalb der Fassadengrenzen; die Öffnung bleibt an Spannweite und Traufhöhe gekoppelt." },
      { title: "Sichtbare Bauebenen", short: "Ebenen", body: "Blenden Sie Hülle und Sekundärtragwerk unabhängig ein oder aus und wechseln Sie so vom fertigen Gebäude zur konstruktiven Logik darunter." },
      { title: "Explodierte Baugruppe", short: "Explosion", body: "Trennen Sie Hülle, Sekundärstahl und primäre Portalrahmen zu einer verständlichen Montagesequenz und führen Sie alles mit einer Aktion wieder zusammen." },
    ],
    outputs: ["Konfigurierte Geometrie", "Rahmenplan", "Hüllenmengen", "Zugangsspezifikation"],
    seoH1: "3D Hallen-Konfigurator",
    seoTitle: "3D Hallen-Konfigurator | Industriehalle & Lagerhalle",
    seoDescription: "Konfigurieren Sie Industriehallen und Lagerhallen in 3D. Passen Sie Maße, Portalrahmen, Raster, Gebäudehülle und Zugangsöffnungen interaktiv an.",
  },
  solar: {
    category: "Energiesysteme", title: "Solardach & Energiesystem", shortTitle: "Solarsysteme",
    statement: "Das Dach modellieren. Den Energietag simulieren.",
    description: "Ein standortbezogener PV-Konfigurator, der Dachgeometrie, Modulbelegung, realen Sonnenstand, Haushaltslast und Batteriespeicher in einem visuellen Energiemodell verbindet.",
    controls: ["Standort", "Sonnenzeit", "Energiemodell"],
    features: [
      { title: "Solarer Kontext per Adresse", short: "Standort", body: "Lösen Sie eine rumänische Projektadresse in Koordinaten auf und nutzen Sie diesen Standort für Sonnenstand, Auf- und Untergang sowie regionale Ertragsannahmen." },
      { title: "Reale Sonne und Jahreszeiten", short: "Sonne", body: "Steuern Sie Uhrzeit, Datum, Jahreszeit und die Ausrichtung der Dachfront; sichtbares Licht und Ertragsprofil reagieren auf denselben Umgebungszustand." },
      { title: "Parametrisches Solardach", short: "Dach", body: "Wechseln Sie zwischen Sattel-, Walm- und Pultdach und verändern Sie Maße und Neigung, während Gebäude und nutzbare Modulflächen gemeinsam neu entstehen." },
      { title: "Physische PV-Belegung", short: "PV-Feld", body: "Wählen Sie Modulzahl und Dachseite; die Vorschau ordnet reale Wohnmodule an und bindet die installierte Leistung an die tatsächlich passende Anzahl." },
      { title: "Last- und Speichermodell", short: "Speicher", body: "Vergleichen Sie Verbrauchsprofile, aktivieren Sie LiFePO₄-Speicher und justieren Sie die Kapazität, um Eigenverbrauch und Netzaustausch über den Tag zu untersuchen." },
      { title: "Energieanalyse", short: "Analyse", body: "Öffnen Sie einen fokussierten Arbeitsbereich für Erzeugung und Verbrauch mit Tagesertrag, Haushaltsbedarf, Autarkie, Netzbezug und Einspeisung in einer Ansicht." },
    ],
    outputs: ["Systemschätzung", "Installierte kWp", "Tagesenergieprofil", "Speicherszenario"],
    seoH1: "3D Photovoltaik-Konfigurator",
    seoTitle: "3D Solar-Konfigurator | Photovoltaik-Anlage planen",
    seoDescription: "Konfigurieren Sie eine Photovoltaik-Anlage in 3D mit Dachgeometrie, Modulbelegung, Sonnenstand, Verbrauch, Batteriespeicher und Energieanalyse.",
  },
};

export function getLocalizedConfigurators(locale: Locale): Configurator[] {
  const translations = locale === "ro" ? ro : locale === "de" ? de : null;
  return configurators.map((item) => ({
    ...item,
    ...(translations ? translations[item.slug] : {}),
    launchUrl: configuratorUrl(locale, item.slug),
  }));
}

export function getLocalizedConfigurator(locale: Locale, slug: string) {
  return getLocalizedConfigurators(locale).find((item) => item.slug === slug);
}


export function requireLocalizedConfigurator(locale: Locale, slug: string): Configurator {
  const item = getLocalizedConfigurator(locale, slug);
  if (!item) {
    throw new Error(`Unknown configurator slug "${slug}" for locale "${locale}".`);
  }
  return item;
}
