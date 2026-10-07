// Presentation-only translations for the drawing studio and cutting planner.
// English source messages remain stable in geometry code and saved configurations.
const messages = new Map();
function entries(rows) {
  for (const line of rows.trim().split('\n')) {
    const [en, ro, de] = line.split('|');
    if (!en || !ro || !de) throw new Error(`Incomplete roof translation: ${en}`);
    messages.set(en, [ro, de]);
  }
}
entries(`
Drag canvas to pan · Pinch to zoom · Drag points to edit|Trage planul pentru deplasare · Ciupește pentru zoom · Trage punctele pentru editare|Zeichenfläche ziehen zum Verschieben · Zwei Finger zum Zoomen · Punkte ziehen zum Bearbeiten
Properties|Proprietăți|Eigenschaften
One finger to edit · Two fingers to pan / zoom|Un deget pentru editare · Două degete pentru deplasare / zoom|Ein Finger zum Bearbeiten · Zwei Finger zum Verschieben / Zoomen
Partition history|Istoricul împărțirilor|Aufteilungsverlauf
Restore all partitions|Restabilește toate împărțirile|Alle Aufteilungen zurücksetzen
Restore surface partitions|Restabilește împărțirile suprafeței|Aufteilungen dieser Fläche zurücksetzen
Each partition must use whole module counts within the profile limits.|Fiecare segment trebuie să aibă un număr întreg de module în limitele profilului.|Jeder Abschnitt muss eine ganze Modulanzahl innerhalb der Profilgrenzen haben.
The partition must add up to the original module count.|Suma segmentelor trebuie să fie egală cu numărul inițial de module.|Die Summe der Abschnitte muss der ursprünglichen Modulanzahl entsprechen.
Select a column section first.|Selectează mai întâi un segment al coloanei.|Zuerst einen Spaltenabschnitt auswählen.
Column partition|Împărțirea coloanei|Spaltenaufteilung
Click a sheet in the diagram or select a column. Split one section; other sections stay unchanged.|Fă clic pe o foaie din diagramă sau selectează o coloană. Împarte un segment; celelalte segmente rămân neschimbate.|Ein Blech im Diagramm anklicken oder eine Spalte auswählen. Einen Abschnitt aufteilen; die anderen Abschnitte bleiben unverändert.
Original section|Segment inițial|Ursprünglicher Abschnitt
Modules per sheet|Module pe foaie|Module pro Blech
Apply to|Aplică pentru|Anwenden auf
Selected section only|Doar segmentul selectat|Nur ausgewählten Abschnitt
Same length on this surface|Aceeași lungime pe această suprafață|Gleiche Länge auf dieser Fläche
Same length on all surfaces|Aceeași lungime pe toate suprafețele|Gleiche Länge auf allen Flächen
{0} modules total · {1} sheets · {2} mm total end allowance|{0} module în total · {1} foi · {2} mm adaos total la capete|{0} Module insgesamt · {1} Bleche · {2} mm gesamte Endzugabe
Enter module counts separated by +, from eave to ridge. Their sum must equal the original section.|Introdu numerele de module separate prin +, de la streașină spre coamă. Suma trebuie să fie egală cu segmentul inițial.|Modulanzahlen mit + getrennt von der Traufe zum First eingeben. Die Summe muss dem ursprünglichen Abschnitt entsprechen.
Apply partition|Aplică împărțirea|Aufteilung anwenden
Restore automatic partition|Restabilește împărțirea automată|Automatische Aufteilung wiederherstellen
Custom partitions were reset because the roof or profile settings changed.|Împărțirile personalizate au fost resetate deoarece s-au modificat acoperișul sau setările profilului.|Benutzerdefinierte Aufteilungen wurden zurückgesetzt, da Dach- oder Profileinstellungen geändert wurden.
Coordinate axes|Axe de coordonate|Koordinatenachsen
Start at (0, 0) · Click to add points · Click origin to close|Start la (0, 0) · Clic pentru puncte noi · Clic pe origine pentru închidere|Start bei (0, 0) · Klicken für weitere Punkte · Ursprung zum Schließen anklicken
Enter X and Z between -100 and 100 m, and a height between -30 and 30 m.|Introdu X și Z între -100 și 100 m și o înălțime între -30 și 30 m.|X und Z zwischen -100 und 100 m sowie eine Höhe zwischen -30 und 30 m eingeben.
{0} Move cancelled; the original point has been restored.|{0} Mutare anulată; punctul inițial a fost restabilit.|{0} Verschiebung abgebrochen; ursprünglicher Punkt wiederhergestellt.
Drag points to edit · Right-drag to pan · Scroll to zoom|Trage punctele pentru editare · Trage cu butonul drept pentru deplasare · Rotița pentru zoom|Punkte zum Bearbeiten ziehen · Mit rechter Maustaste ziehen zum Verschieben · Scrollen zum Zoomen
Perimeter|Contur|Umriss
Surfaces|Suprafețe|Flächen
Add feature|Adaugă element|Element hinzufügen
View|Vizualizare|Ansicht
Selection actions|Acțiuni pentru selecție|Aktionen für die Auswahl
Connect perimeter points|Conectează punctele conturului|Umrisspunkte verbinden
Choose the first perimeter point|Alege primul punct al conturului|Ersten Umrisspunkt wählen
Choose a second point across the gap|Alege al doilea punct, de cealaltă parte a golului|Zweiten Punkt auf der anderen Seite der Lücke wählen
Choose two existing points on the outer perimeter.|Alege două puncte existente pe conturul exterior.|Zwei vorhandene Punkte auf dem äußeren Umriss wählen.
Choose two different perimeter points.|Alege două puncte diferite ale conturului.|Zwei unterschiedliche Umrisspunkte wählen.
These points are already connected by a perimeter edge.|Aceste puncte sunt deja conectate printr-o muchie a conturului.|Diese Punkte sind bereits durch eine Umrisskante verbunden.
This connection cannot close an outside gap. Choose points across an open corner without crossing the roof or its edges.|Această conexiune nu poate închide un gol exterior. Alege puncte de o parte și de alta a unui colț deschis, fără a traversa acoperișul sau muchiile sale.|Diese Verbindung kann keine äußere Lücke schließen. Punkte beiderseits einer offenen Ecke wählen, ohne das Dach oder seine Kanten zu kreuzen.
First point selected. Click another perimeter point across the gap to close the surface.|Primul punct a fost selectat. Fă clic pe un alt punct al conturului, de cealaltă parte a golului, pentru a închide suprafața.|Erster Punkt ausgewählt. Einen weiteren Umrisspunkt auf der anderen Seite der Lücke anklicken, um die Fläche zu schließen.
Gap closed. The new surface uses the existing point heights. Undo restores the previous perimeter.|Gol închis. Noua suprafață folosește înălțimile punctelor existente. Anulează restabilește conturul anterior.|Lücke geschlossen. Die neue Fläche verwendet die bestehenden Punkthöhen. Rückgängig stellt den vorherigen Umriss wieder her.
Click two existing perimeter points across an outside gap. The editor adds the missing surface and keeps existing surfaces and point heights. Connections through the roof or across other edges are rejected. Use Undo to reopen the gap.|Fă clic pe două puncte existente ale conturului, de o parte și de alta a unui gol exterior. Editorul adaugă suprafața lipsă și păstrează suprafețele și înălțimile existente. Conexiunile care traversează acoperișul sau alte muchii sunt respinse. Folosește Anulează pentru a redeschide golul.|Zwei vorhandene Umrisspunkte beiderseits einer äußeren Lücke anklicken. Der Editor ergänzt die fehlende Fläche und erhält bestehende Flächen und Punkthöhen. Verbindungen durch das Dach oder über andere Kanten werden abgelehnt. Mit Rückgängig die Lücke wieder öffnen.
Modify perimeter|Modifică conturul|Umriss bearbeiten
Choose an outer edge to extend|Alege o muchie exterioară pentru extindere|Außenkante zum Erweitern wählen
Click outside the roof to extend the selected edge|Fă clic în afara acoperișului pentru a extinde muchia selectată|Außerhalb des Dachs klicken, um die gewählte Kante zu erweitern
Choose an outer perimeter edge to extend. Interior dividing edges cannot be extended.|Alege o muchie a conturului exterior. Muchiile interioare de împărțire nu pot fi extinse.|Eine äußere Umrisskante wählen. Innere Trennkanten können nicht erweitert werden.
Place the new point outside the current perimeter.|Poziționează noul punct în afara conturului actual.|Den neuen Punkt außerhalb des aktuellen Umrisses platzieren.
Edge selected. Click outside the roof to add a perimeter point.|Muchie selectată. Fă clic în afara acoperișului pentru a adăuga un punct pe contur.|Kante ausgewählt. Außerhalb des Dachs klicken, um einen Umrisspunkt hinzuzufügen.
Perimeter extended. Choose another outer edge to continue, or Select / move to adjust the new point.|Contur extins. Alege altă muchie exterioară pentru a continua sau Selectează / mută pentru a ajusta noul punct.|Umriss erweitert. Zum Fortfahren eine weitere Außenkante wählen oder den neuen Punkt mit Auswählen / verschieben anpassen.
Click an outer edge, then click outside the roof to extend it. Repeat on another outer edge to add more points. New points follow the adjoining slope. Existing surfaces and windows stay in place. Use Select / move to adjust points, or Undo to revert.|Fă clic pe o muchie exterioară, apoi în afara acoperișului pentru a o extinde. Repetă pe altă muchie pentru a adăuga puncte. Punctele noi urmează panta adiacentă. Suprafețele și ferestrele existente rămân pe loc. Folosește Selectează / mută pentru ajustare sau Anulează pentru revenire.|Eine Außenkante anklicken, dann außerhalb des Dachs klicken, um sie zu erweitern. An einer weiteren Außenkante wiederholen, um Punkte hinzuzufügen. Neue Punkte folgen der angrenzenden Dachneigung. Bestehende Flächen und Fenster bleiben erhalten. Mit Auswählen / verschieben anpassen oder mit Rückgängig zurücksetzen.
Dismiss message|Închide mesajul|Meldung schließen
Complete this step|Completează acest pas|Diesen Schritt abschließen
Change not applied|Modificarea nu a fost aplicată|Änderung nicht übernommen
Preview needs attention|Previzualizarea necesită corecturi|Vorschau muss korrigiert werden
Check this position|Verifică această poziție|Diese Position prüfen
Not estimated|Neestimat|Nicht geschätzt
{0} m² roof area|{0} m² suprafață acoperiș|{0} m² Dachfläche
Flashings, gutters and material quantities require a separate estimate.|Șorțurile, jgheaburile și cantitățile de materiale necesită o estimare separată.|Anschlussbleche, Dachrinnen und Materialmengen benötigen eine separate Schätzung.
ROOF DESIGN STUDIO|ATELIER DE ACOPERIȘURI|DACHPLANUNG
Draw your roof|Desenează acoperișul|Dach zeichnen
Close layout editor|Închide editorul|Dacheditor schließen
Drawing tools|Instrumente de desenare|Zeichenwerkzeuge
Select / move|Selectează / mută|Auswählen / verschieben
New perimeter|Contur nou|Neuer Umriss
Divide surface|Împarte suprafața|Fläche teilen
Insert point|Inserează punct|Punkt einfügen
Add dormer|Adaugă lucarnă|Gaube hinzufügen
Add roof window|Adaugă fereastră de mansardă|Dachfenster hinzufügen
Meet roof slope|Aliniază la apă|An Dachfläche ausrichten
Split in place|Separă pe loc|An Ort und Stelle trennen
Join in place|Unește pe loc|An Ort und Stelle verbinden
Next copy|Copia următoare|Nächste Kopie
Delete selected|Șterge selecția|Auswahl löschen
Close perimeter|Închide conturul|Umriss schließen
Roof plan drawing canvas|Planșa de desenare a acoperișului|Zeichenfläche für den Dachgrundriss
History|Istoric|Verlauf
Undo|Anulează|Rückgängig
Redo|Refă|Wiederholen
Undo (Ctrl/⌘ Z)|Anulează (Ctrl/⌘ Z)|Rückgängig (Strg/⌘ Z)
Redo (Ctrl/⌘ Shift Z)|Refă (Ctrl/⌘ Shift Z)|Wiederholen (Strg/⌘ Umschalt Z)
View controls|Comenzi de vizualizare|Ansichtssteuerung
✥ Pan|✥ Deplasare vedere|✥ Ansicht verschieben
Pan view · or middle-drag / Space-drag|Deplasează vederea · sau trage cu butonul din mijloc / cu Spațiu apăsat|Ansicht verschieben · auch mit mittlerer Maustaste / bei gedrückter Leertaste
Zoom out|Micșorează|Verkleinern
Zoom in|Mărește|Vergrößern
Fit|Încadrează|Einpassen
Fit roof in view|Încadrează acoperișul în vedere|Dach in die Ansicht einpassen
↘ Slope arrows|↘ Săgeți de pantă|↘ Gefällepfeile
Show downhill slope directions|Arată direcțiile de coborâre|Gefällerichtungen anzeigen
Roof properties|Proprietățile acoperișului|Dacheigenschaften
Coordinates|Coordonate|Koordinaten
Add gable dormer|Adaugă lucarnă în două ape|Satteldachgaube hinzufügen
Dormer|Lucarnă|Gaube
Roof surface|Suprafața acoperișului|Dachfläche
Place front on plan|Poziționează fațada pe plan|Vorderseite im Grundriss platzieren
Width (m)|Lățime (m)|Breite (m)
Front wall rise (m)|Înălțimea peretelui frontal (m)|Höhe der Vorderwand (m)
Dormer pitch (°)|Panta lucarnei (°)|Gaubenneigung (°)
Front X (m)|X fațadă (m)|Vorderseite X (m)
Front Z (m)|Z fațadă (m)|Vorderseite Z (m)
Cancel|Anulează|Abbrechen
Dormer preview|Previzualizarea lucarnei|Gaubenvorschau
Target slope|Apă țintă|Zielfläche
Pick slope on plan|Alege apa pe plan|Dachfläche im Grundriss wählen
Alignment|Aliniere|Ausrichtung
Keep position|Păstrează poziția|Position beibehalten
Keep height|Păstrează înălțimea|Höhe beibehalten
Height above wall (m)|Înălțime deasupra peretelui (m)|Höhe über der Wand (m)
Edge direction|Direcția muchiei|Kantenrichtung
Pick connected edge|Alege muchia conectată|Angrenzende Kante wählen
3D alignment preview|Previzualizare 3D a alinierii|3D-Vorschau der Ausrichtung
Apply alignment|Aplică alinierea|Ausrichtung übernehmen
Cancel alignment|Anulează alinierea|Ausrichtung abbrechen
Grid snap|Aliniere la grilă|Am Raster einrasten
Point|Punct|Punkt
Select a point|Selectează un punct|Punkt auswählen
Selected point|Punct selectat|Ausgewählter Punkt
Height (m)|Înălțime (m)|Höhe (m)
Update point|Actualizează punctul|Punkt aktualisieren
Connected surfaces|Suprafețe conectate|Angrenzende Flächen
Split and join|Separare și unire|Trennen und verbinden
Pick surfaces on plan|Alege suprafețele pe plan|Flächen im Grundriss wählen
Done picking surfaces|Încheie selecția suprafețelor|Flächenauswahl abschließen
Roof setup & examples|Configurare acoperiș și exemple|Dacheinstellungen und Beispiele
Starter pitch (degrees)|Panta inițială (grade)|Ausgangsneigung (Grad)
Starter pitch|Panta inițială|Ausgangsneigung
Generate pitched roof|Generează acoperiș înclinat|Geneigtes Dach erzeugen
Example|Exemplu|Beispiel
Two slopes|Două ape|Satteldach
Hip roof|Acoperiș în patru ape|Walmdach
L-shaped roof|Acoperiș în formă de L|L-förmiges Dach
Consecutive slopes|Ape succesive|Aufeinanderfolgende Dachflächen
Load example|Încarcă exemplul|Beispiel laden
Roof layout|Planul acoperișului|Dachgrundriss
Cancel drawing|Anulează desenul|Zeichnung abbrechen
Apply roof|Aplică acoperișul|Dach übernehmen
Draw layout|Desenează planul|Grundriss zeichnen
Edit roof layout|Editează planul acoperișului|Dachgrundriss bearbeiten
Panels & quantities|Panouri și cantități|Platten und Mengen
Roof window|Fereastră de mansardă|Dachfenster
Window|Fereastră|Fenster
New window|Fereastră nouă|Neues Fenster
New roof window|Fereastră de mansardă nouă|Neues Dachfenster
Window width (m)|Lățimea ferestrei (m)|Fensterbreite (m)
Window height (m)|Înălțimea ferestrei (m)|Fensterhöhe (m)
Centre X (m)|Centru X (m)|Mittelpunkt X (m)
Centre Z (m)|Centru Z (m)|Mittelpunkt Z (m)
Snap movement to grid|Aliniază deplasarea la grilă|Bewegung am Raster einrasten
Snap centre to grid|Aliniază centrul la grilă|Mittelpunkt am Raster einrasten
Move window left one grid step|Mută fereastra la stânga cu un pas de grilă|Fenster einen Rasterschritt nach links verschieben
Move window up one grid step|Mută fereastra în sus cu un pas de grilă|Fenster einen Rasterschritt nach oben verschieben
Move window down one grid step|Mută fereastra în jos cu un pas de grilă|Fenster einen Rasterschritt nach unten verschieben
Move window right one grid step|Mută fereastra la dreapta cu un pas de grilă|Fenster einen Rasterschritt nach rechts verschieben
Roof window preview|Previzualizarea ferestrei de mansardă|Dachfenstervorschau
Add window|Adaugă fereastra|Fenster hinzufügen
Update window|Actualizează fereastra|Fenster aktualisieren
Delete window|Șterge fereastra|Fenster löschen
Click a slope or drag the selected window to move it. Choose Update window to save. Height is measured along the slope.|Fă clic pe o apă sau trage fereastra selectată pentru a o muta. Alege Actualizează fereastra pentru a salva. Înălțimea se măsoară de-a lungul pantei.|Zum Verschieben auf eine Dachfläche klicken oder das ausgewählte Fenster ziehen. Mit Fenster aktualisieren speichern. Die Höhe wird entlang der Dachneigung gemessen.
Roof window saved. Apply roof to see it in 3D.|Fereastra a fost salvată. Aplică acoperișul pentru a o vedea în 3D.|Dachfenster gespeichert. Dach übernehmen, um es in 3D zu sehen.
Window move cancelled; previous position restored.|Mutarea ferestrei a fost anulată; poziția anterioară a fost restabilită.|Fensterverschiebung abgebrochen; vorherige Position wiederhergestellt.
Click inside a slope to position the window.|Fă clic în interiorul unei ape pentru a poziționa fereastra.|Zum Platzieren des Fensters in eine Dachfläche klicken.
Ready. The blue rectangle shows the roof opening.|Gata. Dreptunghiul albastru indică golul din acoperiș.|Bereit. Das blaue Rechteck zeigt die Dachöffnung.
ROOF COVERING|ÎNVELITOARE|DACHEINDECKUNG
Sheet cutting plan|Plan de debitare a tablei|Zuschnittplan für Dachbleche
Close sheet planner|Închide planificatorul de debitare|Zuschnittplaner schließen
Generate a cutting plan from the settings below.|Generează un plan de debitare folosind setările de mai jos.|Einen Zuschnittplan anhand der folgenden Einstellungen erstellen.
Generate plan|Generează planul|Plan erstellen
Update plan|Actualizează planul|Plan aktualisieren
Profile|Profil|Profil
350 mm profile|Profil de 350 mm|350-mm-Profil
365 mm profile|Profil de 365 mm|365-mm-Profil
Custom profile|Profil personalizat|Benutzerdefiniertes Profil
Total width (mm)|Lățime totală (mm)|Gesamtbreite (mm)
Usable width (mm)|Lățime utilă (mm)|Nutzbreite (mm)
Module length (mm)|Lungimea modulului (mm)|Modullänge (mm)
End overlap / allowance (mm)|Suprapunere / adaos la capăt (mm)|Endüberlappung / Zugabe (mm)
Min. modules per sheet|Nr. minim de module pe foaie|Min. Module pro Blech
Max. modules per sheet|Nr. maxim de module pe foaie|Max. Module pro Blech
Max. sheet length (mm)|Lungimea maximă a foii (mm)|Max. Blechlänge (mm)
Weight (kg/m²)|Greutate (kg/m²)|Gewicht (kg/m²)
Minimum pitch (°)|Panta minimă (°)|Mindestneigung (°)
Start side|Latura de început|Startseite
Left to right|De la stânga la dreapta|Von links nach rechts
Right to left|De la dreapta la stânga|Von rechts nach links
Start offset (mm)|Decalaj inițial (mm)|Startversatz (mm)
Export CSV|Exportă CSV|CSV exportieren
Print / PDF|Tipărire / PDF|Drucken / PDF
Done|Gata|Fertig
Settings changed. The previous plan is shown below. Update it to use the new settings.|Setările s-au schimbat. Planul anterior este afișat mai jos. Actualizează-l pentru a folosi noile setări.|Einstellungen geändert. Der bisherige Plan bleibt unten sichtbar. Aktualisieren, um die neuen Einstellungen anzuwenden.
Settings changed. Generate a plan to use the new settings.|Setările s-au schimbat. Generează un plan pentru a folosi noile setări.|Einstellungen geändert. Einen Plan mit den neuen Einstellungen erstellen.
Update required · Exports paused|Actualizare necesară · Exporturi suspendate|Aktualisierung erforderlich · Export pausiert
Plan is up to date. Changing settings keeps this preview until you update it.|Planul este actualizat. La schimbarea setărilor, previzualizarea rămâne până la actualizare.|Der Plan ist aktuell. Bei Einstellungsänderungen bleibt diese Vorschau bis zur Aktualisierung erhalten.
Could not update. The previous plan is still shown below; correct the settings and try again.|Actualizarea a eșuat. Planul anterior este afișat mai jos; corectează setările și încearcă din nou.|Aktualisierung fehlgeschlagen. Der bisherige Plan bleibt unten sichtbar; Einstellungen korrigieren und erneut versuchen.
Could not generate a plan. Correct the settings and try again.|Planul nu a putut fi generat. Corectează setările și încearcă din nou.|Der Plan konnte nicht erstellt werden. Einstellungen korrigieren und erneut versuchen.
Previous plan · Exports paused|Plan anterior · Exporturi suspendate|Bisheriger Plan · Export pausiert
Plan unavailable|Plan indisponibil|Plan nicht verfügbar
Sheets|Foi de tablă|Bleche
Modules|Module|Module
Roof area|Suprafața acoperișului|Dachfläche
Order area|Suprafața de comandat|Bestellfläche
Cut allowance|Pierderi din debitare|Zuschnittverschnitt
Overlap / end allowance|Suprapunere / adaos la capăt|Überlappung / Endzugabe
Total sheet length|Lungimea totală a foilor|Gesamtlänge der Bleche
Estimated weight|Greutate estimată|Geschätztes Gewicht
Length (mm)|Lungime (mm)|Länge (mm)
Modules / sheet|Module / foaie|Module / Blech
Quantity|Cantitate|Anzahl
Piece IDs|Coduri piese|Teilkennungen
Roof plan with covering slope labels|Planul acoperișului cu etichetele apelor|Dachgrundriss mit Flächenkennungen
Download diagram (SVG)|Descarcă diagrama (SVG)|Diagramm herunterladen (SVG)
Combined order list|Listă de comandă cumulată|Zusammengefasste Bestellliste
Printable roof cutting plan|Plan de debitare tipăribil|Druckbarer Dachzuschnittplan
Roof sheet cutting plan|Plan de debitare a tablei pentru acoperiș|Zuschnittplan für Dachbleche
Slope|Apă|Dachfläche
Piece|Piesă|Teil
Column|Coloană|Spalte
Length mm|Lungime mm|Länge mm
Width mm|Lățime mm|Breite mm
Usable width mm|Lățime utilă mm|Nutzbreite mm
Net covered m2|Suprafață netă acoperită m2|Netto-Abdeckfläche m2
Stock m2|Suprafață comandată m2|Bestellfläche m2
TOTAL pieces|TOTAL piese|GESAMT Teile
TOTAL modules|TOTAL module|GESAMT Module
Roof area m2|Suprafața acoperișului m2|Dachfläche m2
Stock area m2|Suprafață comandată m2|Bestellfläche m2
Cut allowance m2|Pierderi din debitare m2|Zuschnittverschnitt m2
Overlap / end allowance m2|Suprapunere / adaos la capăt m2|Überlappung / Endzugabe m2
`);
entries(`
All coordinates are in metres. Heights are relative to the wall top; negative values place eaves below it. Drag points to move them; Shift-drag changes height.|Toate coordonatele sunt în metri. Înălțimile sunt raportate la partea superioară a peretelui; valorile negative coboară streașina sub aceasta. Trage punctele pentru a le muta; Shift și tragere modifică înălțimea.|Alle Koordinaten sind in Metern. Höhen beziehen sich auf die Wandoberkante; negative Werte setzen die Traufe darunter. Punkte zum Verschieben ziehen; mit Umschalt und Ziehen die Höhe ändern.
Choose a planar slope, then place the centre of the dormer’s front wall. It faces downhill and meets the roof uphill automatically. Width, front wall rise and roof pitch control its size. Apply adds editable surfaces and closing walls.|Alege o apă plană, apoi poziționează centrul peretelui frontal al lucarnei. Acesta este orientat în josul pantei și se racordează automat la acoperiș în susul pantei. Dimensiunea depinde de lățime, înălțimea peretelui frontal și pantă. Aplicarea adaugă suprafețe editabile și pereți de închidere.|Eine ebene Dachfläche wählen und die Mitte der Gaubenvorderwand platzieren. Sie zeigt hangabwärts und schließt hangaufwärts automatisch an das Dach an. Breite, Vorderwandhöhe und Dachneigung bestimmen die Größe. Beim Übernehmen entstehen bearbeitbare Flächen und Abschlusswände.
Keep position adjusts height. Keep height moves the point along a connected edge. The target’s other points stay fixed. Split copies share X/Z; the selected copy and target copy reconnect at the meeting height.|Păstrează poziția ajustează înălțimea. Păstrează înălțimea mută punctul de-a lungul unei muchii conectate. Celelalte puncte ale țintei rămân fixe. Copiile separate au aceleași X/Z; copia selectată și copia țintă se reunesc la înălțimea de întâlnire.|Position beibehalten passt die Höhe an. Höhe beibehalten verschiebt den Punkt entlang einer angrenzenden Kante. Die anderen Zielpunkte bleiben fest. Getrennte Kopien teilen X/Z; ausgewählte Kopie und Zielkopie verbinden sich auf der Schnitthöhe wieder.
Choose adjoining surfaces to detach using the checkboxes or Pick surfaces on plan, then use Split in place. Copies share position but have independent heights. Join in place reconnects copies using the selected heights. Next copy cycles coincident points or edges.|Alege suprafețele adiacente de separat folosind casetele sau Alege suprafețele pe plan, apoi Separă pe loc. Copiile au aceeași poziție, dar înălțimi independente. Unește pe loc reunește copiile la înălțimile selectate. Copia următoare parcurge punctele sau muchiile suprapuse.|Angrenzende Flächen über die Kontrollkästchen oder Flächen im Grundriss wählen auswählen, dann An Ort und Stelle trennen. Kopien teilen die Position, haben aber unabhängige Höhen. An Ort und Stelle verbinden verbindet sie mit den ausgewählten Höhen. Nächste Kopie wechselt zwischen deckungsgleichen Punkten oder Kanten.
New perimeters start with two slopes. Generate pitched roof replaces all current divisions and heights. Undo restores them.|Contururile noi încep cu două ape. Generează acoperiș înclinat înlocuiește toate împărțirile și înălțimile actuale. Anulează le restabilește.|Neue Umrisse beginnen mit zwei Dachflächen. Geneigtes Dach erzeugen ersetzt alle bisherigen Teilungen und Höhen. Rückgängig stellt sie wieder her.
Draw the outer roof edge. Eaves overhang sets the walls back beneath it. Non-planar surfaces are triangulated; dashed lines show those divisions. Layout mode does not yet calculate flashings, gutters or a price estimate.|Desenează conturul exterior al acoperișului. Ieșirea la streașină retrage pereții sub acesta. Suprafețele neplane sunt triangulate; liniile întrerupte arată împărțirile. Modul de desenare nu calculează încă șorțuri, jgheaburi sau prețuri.|Die äußere Dachkante zeichnen. Der Traufüberstand versetzt die Wände darunter nach innen. Nicht ebene Flächen werden trianguliert; gestrichelte Linien zeigen diese Teilungen. Im Grundrissmodus werden Anschlussbleche, Dachrinnen und Preise noch nicht berechnet.
Click the target slope, then choose Keep position or Keep height. Review the ghost point and 3D preview before applying.|Fă clic pe apa țintă, apoi alege Păstrează poziția sau Păstrează înălțimea. Verifică punctul proiectat și previzualizarea 3D înainte de aplicare.|Auf die Zielfläche klicken, dann Position beibehalten oder Höhe beibehalten wählen. Vorschaupunkt und 3D-Vorschau vor dem Übernehmen prüfen.
Click the connected ridge or edge to follow. The point can move along its line in either direction.|Fă clic pe coama sau muchia conectată de urmat. Punctul se poate deplasa pe linia ei în ambele direcții.|Auf den angrenzenden First oder die Kante klicken. Der Punkt kann sich entlang dieser Linie in beide Richtungen bewegen.
Split in place detaches chosen adjoining surfaces for independent height control. Next copy cycles stacked points or edges; attached surfaces are highlighted. Select a point or edge, then Delete selected (or Delete/Backspace). Removing a dividing edge merges its adjoining surfaces. Outer edges must stay closed. Drag a point to move it on the plan. Shift-drag up/down changes its height. You can also enter exact coordinates below. Shared points update adjoining surfaces.|Separă pe loc desprinde suprafețele adiacente alese pentru reglarea independentă a înălțimii. Copia următoare parcurge punctele sau muchiile suprapuse; suprafețele conectate sunt evidențiate. Selectează un punct sau o muchie, apoi Șterge selecția (sau Delete/Backspace). Ștergerea unei muchii interioare unește suprafețele adiacente. Conturul exterior trebuie să rămână închis. Trage un punct pentru a-l muta pe plan. Shift și tragere în sus/jos îi modifică înălțimea. Poți introduce coordonate exacte mai jos. Punctele comune actualizează suprafețele adiacente.|An Ort und Stelle trennen löst gewählte angrenzende Flächen zur unabhängigen Höhensteuerung. Nächste Kopie wechselt zwischen übereinanderliegenden Punkten oder Kanten; verbundene Flächen werden hervorgehoben. Punkt oder Kante auswählen, dann Auswahl löschen (oder Entf/Rücktaste). Das Entfernen einer Trennkante verbindet die angrenzenden Flächen. Außenkanten müssen geschlossen bleiben. Punkte zum Verschieben im Grundriss ziehen. Umschalt und Ziehen nach oben/unten ändert die Höhe. Genaue Koordinaten können unten eingegeben werden. Gemeinsame Punkte aktualisieren angrenzende Flächen.
The first point is placed at the origin (0, 0). Click around the outer roof edge. Click the first point or Close perimeter to finish. This creates a pitched roof at the starter pitch and replaces the current draft.|Primul punct este plasat în origine (0, 0). Fă clic de-a lungul conturului exterior. Fă clic pe primul punct sau pe Închide conturul pentru a termina. Se creează un acoperiș cu panta inițială, înlocuind schița curentă.|Der erste Punkt liegt im Ursprung (0, 0). Entlang der äußeren Dachkante klicken. Zum Abschließen auf den ersten Punkt oder Umriss schließen klicken. Dadurch entsteht ein Dach mit der Ausgangsneigung; der aktuelle Entwurf wird ersetzt.
Start on a surface edge, add optional interior points, then finish on another edge of the same surface. Raise the new points to form ridges, or lower them for valleys.|Începe pe muchia unei suprafețe, adaugă opțional puncte interioare, apoi termină pe altă muchie a aceleiași suprafețe. Ridică punctele noi pentru coame sau coboară-le pentru dolii.|An einer Flächenkante beginnen, bei Bedarf Innenpunkte hinzufügen und an einer anderen Kante derselben Fläche abschließen. Neue Punkte für Firste anheben oder für Kehlen absenken.
Click an edge or inside a surface to add a point. Interior points connect to surrounding corners and keep the current roof height. Move or raise the point to shape the roof.|Fă clic pe o muchie sau în interiorul unei suprafețe pentru a adăuga un punct. Punctele interioare se conectează la colțurile din jur și păstrează înălțimea acoperișului. Mută sau ridică punctul pentru a modela acoperișul.|Auf eine Kante oder in eine Fläche klicken, um einen Punkt hinzuzufügen. Innenpunkte verbinden sich mit den umliegenden Ecken und behalten die aktuelle Dachhöhe. Den Punkt zum Formen des Dachs verschieben oder anheben.
Drag to move · Shift-drag for height|Trage pentru a muta · Shift și tragere pentru înălțime|Ziehen zum Verschieben · Umschalt und Ziehen für die Höhe
Click to draw · Click first point to close|Clic pentru a desena · Clic pe primul punct pentru a închide|Klicken zum Zeichnen · Ersten Punkt zum Schließen anklicken
Draw a line between surface edges|Desenează o linie între muchiile suprafeței|Linie zwischen Flächenkanten zeichnen
Click an edge or surface to add a point|Clic pe muchie sau suprafață pentru a adăuga un punct|Kante oder Fläche anklicken, um einen Punkt hinzuzufügen
Choose a target slope|Alege o apă țintă|Zielfläche wählen
Choose a connected edge|Alege o muchie conectată|Angrenzende Kante wählen
Click to place dormer front · Adjust size in the panel|Clic pentru fațada lucarnei · Reglează dimensiunea în panou|Klicken zum Platzieren der Gaubenvorderseite · Größe im Bedienfeld einstellen
Drag window or click to position · Update window to save|Trage fereastra sau fă clic pentru poziționare · Actualizează fereastra pentru a salva|Fenster ziehen oder zum Platzieren klicken · Mit Fenster aktualisieren speichern
Drag to pan · Turn Pan off to edit · Fit to recenter|Trage pentru a deplasa vederea · Dezactivează Deplasare vedere pentru editare · Încadrează pentru recentrare|Ziehen zum Verschieben der Ansicht · Zum Bearbeiten deaktivieren · Einpassen zum Zentrieren
Click surfaces to toggle · Split in place to confirm|Clic pe suprafețe pentru selecție · Separă pe loc pentru confirmare|Flächen zum Umschalten anklicken · Mit An Ort und Stelle trennen bestätigen
Edit points, edges and slopes. Changes stay a draft until you apply the roof.|Editează punctele, muchiile și apele. Modificările rămân o schiță până când aplici acoperișul.|Punkte, Kanten und Dachflächen bearbeiten. Änderungen bleiben ein Entwurf, bis das Dach übernommen wird.
Start from this roof’s shape, dimensions and pitch. Apply roof saves it as a drawn layout; Cancel keeps the preset.|Pornește de la forma, dimensiunile și panta acestui acoperiș. Aplică acoperișul îl salvează ca plan desenat; Anulează păstrează modelul.|Mit Form, Abmessungen und Neigung dieses Dachs beginnen. Dach übernehmen speichert es als gezeichneten Grundriss; Abbrechen behält die Vorlage bei.
Custom layout quantities and prices are not yet available. Roof area is calculated from the drawn surfaces.|Cantitățile și prețurile pentru planuri personalizate nu sunt încă disponibile. Suprafața acoperișului este calculată din suprafețele desenate.|Mengen und Preise für eigene Grundrisse sind noch nicht verfügbar. Die Dachfläche wird aus den gezeichneten Flächen berechnet.
Sheets run uphill. Each length is a whole number of modules plus the end allowance. Excess at the last sheet is trimmed. Width overlap = total − usable width.|Foile se montează în susul pantei. Fiecare lungime este un număr întreg de module plus adaosul la capăt. Excesul ultimei foi se taie. Suprapunerea laterală = lățimea totală − lățimea utilă.|Bleche verlaufen hangaufwärts. Jede Länge besteht aus einer ganzen Modulanzahl plus Endzugabe. Der Überstand am letzten Blech wird abgeschnitten. Seitliche Überlappung = Gesamtbreite − Nutzbreite.
Profile sizes are independent of the visual roof covering. Vertical walls, flashings, fasteners and offcut reuse are excluded. Verify overlap and fixing details with the supplier before ordering.|Dimensiunile profilului sunt independente de învelitoarea vizualizată. Pereții verticali, șorțurile, elementele de fixare și reutilizarea resturilor sunt excluse. Verifică suprapunerile și detaliile de fixare cu furnizorul înainte de comandă.|Profilmaße sind unabhängig von der dargestellten Dacheindeckung. Senkrechte Wände, Anschlussbleche, Befestigungen und Reststücknutzung sind ausgeschlossen. Überlappungs- und Befestigungsdetails vor der Bestellung mit dem Lieferanten prüfen.
Photo discrepancy: table width 1,100 mm; diagram 1,080 mm (used here). 22 × 365 + 125 = 8,155 mm, above the printed 8,150 mm maximum, so 21 modules are allowed. End allowance of 125 mm is inferred from the listed minimum length; confirm with supplier.|Neconcordanță în fotografie: lățime în tabel 1.100 mm; în diagramă 1.080 mm (folosită aici). 22 × 365 + 125 = 8.155 mm depășește maximul tipărit de 8.150 mm, deci sunt permise 21 de module. Adaosul de 125 mm este dedus din lungimea minimă indicată; confirmă cu furnizorul.|Abweichung im Foto: Tabellenbreite 1.100 mm; Diagramm 1.080 mm (hier verwendet). 22 × 365 + 125 = 8.155 mm liegt über dem angegebenen Maximum von 8.150 mm; daher sind 21 Module zulässig. Die Endzugabe von 125 mm wurde aus der Mindestlänge abgeleitet; beim Lieferanten bestätigen lassen.
350 mm profile reference: 1,130 / 1,000 mm width, 350 mm module, 3–22 modules. The 100 mm end allowance is inferred from the listed sheet lengths; confirm with supplier.|Referință profil 350 mm: lățime 1.130 / 1.000 mm, modul 350 mm, 3–22 module. Adaosul de 100 mm este dedus din lungimile de tablă indicate; confirmă cu furnizorul.|Referenzprofil 350 mm: Breite 1.130 / 1.000 mm, Modul 350 mm, 3–22 Module. Die Endzugabe von 100 mm wurde aus den angegebenen Blechlängen abgeleitet; beim Lieferanten bestätigen lassen.
Custom dimensions. Length = modules × module length + end allowance. The maximum length also limits the allowed module count.|Dimensiuni personalizate. Lungime = module × lungimea modulului + adaos la capăt. Lungimea maximă limitează și numărul permis de module.|Benutzerdefinierte Maße. Länge = Module × Modullänge + Endzugabe. Die maximale Länge begrenzt auch die zulässige Modulanzahl.
Plan view: letters identify connected coplanar slopes, combining subdivisions from the editor. Roof area includes the roof edges as drawn (including overhangs); vertical closing walls are excluded.|Vedere în plan: literele identifică apele coplanare conectate, reunind subdiviziunile din editor. Suprafața acoperișului include conturul desenat (inclusiv streșinile); pereții verticali de închidere sunt excluși.|Grundriss: Buchstaben kennzeichnen zusammenhängende, in einer Ebene liegende Dachflächen und fassen Unterteilungen aus dem Editor zusammen. Die Dachfläche umfasst die gezeichneten Kanten einschließlich Überständen; senkrechte Abschlusswände sind ausgeschlossen.
Order area includes all rectangular sheets. Cut allowance is unused effective coverage; overlap / end allowance includes side laps and extra sheet length. Neither assumes offcut reuse. Weight uses the listed kg/m² against order area.|Suprafața de comandat include toate foile dreptunghiulare. Pierderile din debitare reprezintă acoperirea utilă nefolosită; suprapunerea / adaosul la capăt include suprapunerile laterale și lungimea suplimentară. Nu se presupune reutilizarea resturilor. Greutatea folosește valoarea kg/m² și suprafața de comandat.|Die Bestellfläche umfasst alle rechteckigen Bleche. Zuschnittverschnitt ist ungenutzte Nutzfläche; Überlappung / Endzugabe umfasst seitliche Überlappungen und zusätzliche Blechlänge. Reststücknutzung wird nicht angenommen. Das Gewicht ergibt sich aus kg/m² und Bestellfläche.
Maximum module count reduced to respect the maximum physical sheet length.|Numărul maxim de module a fost redus pentru a respecta lungimea fizică maximă a foii.|Maximale Modulanzahl zur Einhaltung der maximalen Blechlänge reduziert.
Black: roof cut line · Blue: usable sheet area · Dashed: full ordered sheet · ↑ Uphill installation start|Negru: linia de tăiere · Albastru: suprafața utilă · Întrerupt: foaia comandată · ↑ Începutul montajului în susul pantei|Schwarz: Dachschnittlinie · Blau: Nutzfläche · Gestrichelt: vollständiges bestelltes Blech · ↑ Montagebeginn hangaufwärts
Dimensions follow the actual slope, not its horizontal projection. Piece IDs are slope–column.segment, counted from the selected start side and from eave to ridge.|Dimensiunile urmează panta reală, nu proiecția orizontală. Codurile pieselor sunt apă–coloană.segment, numerotate din latura de început aleasă și de la streașină la coamă.|Maße folgen der tatsächlichen Neigung, nicht ihrer horizontalen Projektion. Teilkennungen sind Dachfläche–Spalte.Segment, gezählt ab der gewählten Startseite und von der Traufe zum First.
This is a geometric cutting estimate. Cut-outs remain offcuts; reuse, trim accessories and fixing quantities are not optimized.|Aceasta este o estimare geometrică de debitare. Decupajele rămân resturi; reutilizarea, accesoriile de finisaj și cantitățile de fixare nu sunt optimizate.|Dies ist eine geometrische Zuschnittschätzung. Ausschnitte bleiben Reststücke; Wiederverwendung, Abschlusszubehör und Befestigungsmengen werden nicht optimiert.
`);
entries(`
Changes are a draft until you apply the roof.|Modificările rămân o schiță până când aplici acoperișul.|Änderungen bleiben ein Entwurf, bis das Dach übernommen wird.
Draft updated.|Schiță actualizată.|Entwurf aktualisiert.
Save or cancel the roof window preview first.|Salvează sau anulează mai întâi previzualizarea ferestrei.|Zuerst die Dachfenstervorschau speichern oder abbrechen.
Add or cancel the dormer preview before applying the roof.|Adaugă sau anulează lucarna înainte de a aplica acoperișul.|Vor dem Übernehmen des Dachs die Gaube hinzufügen oder die Vorschau abbrechen.
Apply or cancel the alignment preview first.|Aplică sau anulează mai întâi previzualizarea alinierii.|Zuerst die Ausrichtungsvorschau übernehmen oder abbrechen.
Click the front of the dormer on a slope, adjust its size, then Add dormer.|Fă clic pe o apă pentru fațada lucarnei, reglează dimensiunea, apoi alege Adaugă lucarnă.|Die Gaubenvorderseite auf einer Dachfläche anklicken, Größe einstellen und Gaube hinzufügen wählen.
Click inside a roof surface to place the centre of the dormer’s front wall.|Fă clic în interiorul unei suprafețe pentru a poziționa centrul peretelui frontal al lucarnei.|In eine Dachfläche klicken, um die Mitte der Gaubenvorderwand zu platzieren.
Dormer cancelled. The roof is unchanged.|Lucarnă anulată. Acoperișul nu s-a modificat.|Gaube abgebrochen. Das Dach ist unverändert.
Dormer added. Its points and surfaces are editable; Undo removes the addition.|Lucarnă adăugată. Punctele și suprafețele ei sunt editabile; Anulează elimină adăugarea.|Gaube hinzugefügt. Ihre Punkte und Flächen sind bearbeitbar; Rückgängig entfernt sie.
Click adjoining surfaces to toggle them. Highlighted surfaces will detach; then choose Split in place.|Fă clic pe suprafețele adiacente pentru a le selecta. Suprafețele evidențiate se vor separa; apoi alege Separă pe loc.|Angrenzende Flächen zum Umschalten anklicken. Hervorgehobene Flächen werden getrennt; anschließend An Ort und Stelle trennen wählen.
Surface selection ready. Choose Split in place to detach the highlighted surfaces.|Selecția este gata. Alege Separă pe loc pentru a desprinde suprafețele evidențiate.|Flächenauswahl bereit. An Ort und Stelle trennen wählen, um die hervorgehobenen Flächen zu lösen.
Alignment cancelled. The draft is unchanged.|Aliniere anulată. Schița nu s-a modificat.|Ausrichtung abgebrochen. Der Entwurf ist unverändert.
Roof aligned. Undo restores the previous junction.|Acoperiș aliniat. Anulează restabilește îmbinarea anterioară.|Dach ausgerichtet. Rückgängig stellt den vorherigen Anschluss wieder her.
Finish or cancel the drawing first.|Termină sau anulează mai întâi desenul.|Zuerst die Zeichnung abschließen oder abbrechen.
Copies joined using the selected heights. Undo restores the split and original heights.|Copiile au fost unite la înălțimile selectate. Anulează restabilește separarea și înălțimile inițiale.|Kopien mit den ausgewählten Höhen verbunden. Rückgängig stellt Trennung und ursprüngliche Höhen wieder her.
Split created. Use Next copy to select either side and change its height independently.|Separare creată. Folosește Copia următoare pentru a alege o parte și a-i modifica independent înălțimea.|Trennung erstellt. Mit Nächste Kopie eine Seite wählen und ihre Höhe unabhängig ändern.
Selection deleted. Adjoining surfaces may merge; Undo restores the previous roof.|Selecție ștearsă. Suprafețele adiacente se pot uni; Anulează restabilește acoperișul anterior.|Auswahl gelöscht. Angrenzende Flächen können zusammengeführt werden; Rückgängig stellt das vorherige Dach wieder her.
Enter valid coordinates and a height between -30 and 30 m.|Introdu coordonate valide și o înălțime între -30 și 30 m.|Gültige Koordinaten und eine Höhe zwischen -30 und 30 m eingeben.
Finish or cancel the current drawing before applying.|Termină sau anulează desenul curent înainte de aplicare.|Vor dem Übernehmen die aktuelle Zeichnung abschließen oder abbrechen.
Select the point to align first.|Selectează mai întâi punctul de aliniat.|Zuerst den auszurichtenden Punkt auswählen.
Choose a slope or click it on the plan|Alege o apă sau fă clic pe ea în plan|Dachfläche wählen oder im Grundriss anklicken
Choose the target roof slope.|Alege apa țintă.|Die Zielfläche wählen.
Enter a starter pitch between 5° and 60°.|Introdu o pantă inițială între 5° și 60°.|Eine Ausgangsneigung zwischen 5° und 60° eingeben.
Release to set the height.|Eliberează pentru a stabili înălțimea.|Loslassen, um die Höhe festzulegen.
Release to move the point. Shift-drag adjusts height.|Eliberează pentru a muta punctul. Shift și tragere ajustează înălțimea.|Loslassen, um den Punkt zu verschieben. Umschalt und Ziehen passt die Höhe an.
Move cancelled; the original point has been restored.|Mutare anulată; punctul inițial a fost restabilit.|Verschiebung abgebrochen; ursprünglicher Punkt wiederhergestellt.
Place the dormer inside a roof surface.|Poziționează lucarna în interiorul unei suprafețe.|Die Gaube innerhalb einer Dachfläche platzieren.
Click a connected edge away from its endpoints, or choose it in the direction list.|Fă clic pe o muchie conectată, departe de capete, sau alege-o din lista de direcții.|Eine angrenzende Kante abseits ihrer Endpunkte anklicken oder in der Richtungsliste wählen.
Click inside the target roof slope.|Fă clic în interiorul apei țintă.|In die Zielfläche klicken.
Choose a surface adjoining the selected point or edge.|Alege o suprafață adiacentă punctului sau muchiei selectate.|Eine an den ausgewählten Punkt oder die Kante angrenzende Fläche wählen.
Maximum 160 perimeter points.|Maximum 160 de puncte pe contur.|Maximal 160 Umrisspunkte.
Start on an existing surface edge or point.|Începe pe o muchie sau un punct existent.|An einer vorhandenen Flächenkante oder einem Punkt beginnen.
Select a shared point or dividing edge to split it.|Selectează un punct comun sau o muchie interioară pentru a o separa.|Einen gemeinsamen Punkt oder eine Trennkante zum Trennen auswählen.
Draw at least three points enclosing 0.05 m² or more.|Desenează cel puțin trei puncte care închid minimum 0,05 m².|Mindestens drei Punkte zeichnen, die mindestens 0,05 m² einschließen.
Points must be at least 5 cm apart.|Punctele trebuie să fie la cel puțin 5 cm distanță.|Punkte müssen mindestens 5 cm auseinanderliegen.
Edges cannot cross or touch another edge.|Muchiile nu pot intersecta sau atinge alte muchii.|Kanten dürfen andere Kanten nicht kreuzen oder berühren.
This surface cannot be triangulated. Check its points.|Suprafața nu poate fi triangulată. Verifică punctele.|Diese Fläche kann nicht trianguliert werden. Punkte prüfen.
Invalid roof layout (maximum 160 points and surfaces).|Plan de acoperiș invalid (maximum 160 de puncte și suprafețe).|Ungültiger Dachgrundriss (maximal 160 Punkte und Flächen).
Coordinates must be within ±100 m and heights between -30 and 30 m.|Coordonatele trebuie să fie în intervalul ±100 m, iar înălțimile între -30 și 30 m.|Koordinaten müssen innerhalb von ±100 m und Höhen zwischen -30 und 30 m liegen.
Invalid surface indices.|Indici de suprafață invalizi.|Ungültige Flächenindizes.
Invalid split-point links.|Legături invalide între punctele separate.|Ungültige Verknüpfungen getrennter Punkte.
Invalid or overlapping split-point links.|Legături invalide sau suprapuse între punctele separate.|Ungültige oder überlappende Verknüpfungen getrennter Punkte.
Split points must remain aligned in plan.|Punctele separate trebuie să rămână aliniate în plan.|Getrennte Punkte müssen im Grundriss deckungsgleich bleiben.
Points must stay inside the perimeter.|Punctele trebuie să rămână în interiorul conturului.|Punkte müssen innerhalb des Umrisses bleiben.
This editor supports roofs up to 40 × 40 m.|Editorul acceptă acoperișuri de până la 40 × 40 m.|Dieser Editor unterstützt Dächer bis 40 × 40 m.
The perimeter must enclose all roof surfaces.|Conturul trebuie să includă toate suprafețele acoperișului.|Der Umriss muss alle Dachflächen einschließen.
Roof surfaces must share complete edges.|Suprafețele trebuie să aibă muchii comune complete.|Dachflächen müssen vollständige Kanten teilen.
Surfaces overlap or leave a gap.|Suprafețele se suprapun sau lasă un gol.|Flächen überlappen sich oder lassen eine Lücke.
Roof surface edges cannot cross.|Muchiile suprafețelor nu se pot intersecta.|Dachflächenkanten dürfen sich nicht kreuzen.
Start and finish the dividing line on a surface edge.|Începe și termină linia de împărțire pe muchia unei suprafețe.|Die Trennlinie an einer Flächenkante beginnen und beenden.
Click inside a roof surface or on an edge to add a point.|Fă clic într-o suprafață sau pe o muchie pentru a adăuga un punct.|In eine Dachfläche oder auf eine Kante klicken, um einen Punkt hinzuzufügen.
Choose the start and end of a dividing line.|Alege începutul și sfârșitul liniei de împărțire.|Anfang und Ende einer Trennlinie wählen.
Choose different start and end points.|Alege puncte de început și sfârșit diferite.|Unterschiedliche Anfangs- und Endpunkte wählen.
Divide one surface at a time.|Împarte câte o suprafață pe rând.|Jeweils nur eine Fläche teilen.
Starter pitch must be between 5° and 60°.|Panta inițială trebuie să fie între 5° și 60°.|Die Ausgangsneigung muss zwischen 5° und 60° liegen.
Reduce the pitch to keep the roof height within 30 m.|Redu panta pentru a menține înălțimea acoperișului sub 30 m.|Neigung verringern, damit die Dachhöhe innerhalb von 30 m bleibt.
Overhang corner is too sharp.|Colțul streșinii este prea ascuțit.|Die Überstandsecke ist zu spitz.
Collapsed wall footprint.|Conturul pereților este degenerat.|Wandgrundriss ist zusammengefallen.
Collapsed wall edge.|Muchia peretelui este degenerată.|Wandkante ist zusammengefallen.
Overhang exceeds the footprint.|Streașina depășește conturul disponibil.|Der Überstand überschreitet den Grundriss.
Wall lies outside the roof.|Peretele este în afara acoperișului.|Die Wand liegt außerhalb des Dachs.
These surfaces cannot be merged into one closed surface.|Aceste suprafețe nu pot fi unite într-o singură suprafață închisă.|Diese Flächen können nicht zu einer geschlossenen Fläche verbunden werden.
Deleting this would leave a hole in the roof.|Ștergerea ar lăsa un gol în acoperiș.|Das Löschen würde ein Loch im Dach hinterlassen.
The outer perimeter must stay closed. Delete a point to reshape it; only dividing edges can be removed.|Conturul exterior trebuie să rămână închis. Șterge un punct pentru a-l remodela; doar muchiile interioare pot fi eliminate.|Der äußere Umriss muss geschlossen bleiben. Zum Umformen einen Punkt löschen; nur Trennkanten können entfernt werden.
This point belongs to a split connection. Use Join in place before deleting it.|Punctul aparține unei conexiuni separate. Folosește Unește pe loc înainte de a-l șterge.|Dieser Punkt gehört zu einer getrennten Verbindung. Vor dem Löschen An Ort und Stelle verbinden verwenden.
Select a point first.|Selectează mai întâi un punct.|Zuerst einen Punkt auswählen.
The roof perimeter needs at least three points.|Conturul acoperișului necesită cel puțin trei puncte.|Der Dachumriss benötigt mindestens drei Punkte.
Select a shared point or edge.|Selectează un punct sau o muchie comună.|Einen gemeinsamen Punkt oder eine gemeinsame Kante auswählen.
This selection is already independent or lies on the outer perimeter.|Selecția este deja independentă sau se află pe conturul exterior.|Diese Auswahl ist bereits unabhängig oder liegt am äußeren Umriss.
Choose at least one adjoining surface and leave at least one on the original side.|Alege cel puțin o suprafață adiacentă și lasă cel puțin una pe partea inițială.|Mindestens eine angrenzende Fläche wählen und mindestens eine auf der ursprünglichen Seite belassen.
Select a split point or edge to join.|Selectează un punct sau o muchie separată pentru unire.|Einen getrennten Punkt oder eine getrennte Kante zum Verbinden auswählen.
This selection is already joined.|Selecția este deja unită.|Diese Auswahl ist bereits verbunden.
Select a point and a target roof slope.|Selectează un punct și o apă țintă.|Einen Punkt und eine Zielfläche auswählen.
The target needs at least three fixed points besides the moving point and its copies.|Ținta necesită cel puțin trei puncte fixe în afara punctului mobil și a copiilor sale.|Das Ziel benötigt mindestens drei feste Punkte neben dem bewegten Punkt und seinen Kopien.
The fixed target points lie on one line. Choose another slope.|Punctele fixe ale țintei sunt coliniare. Alege altă apă.|Die festen Zielpunkte liegen auf einer Linie. Eine andere Dachfläche wählen.
The fixed target points are not on one plane. Divide that surface or align its fixed points first.|Punctele fixe ale țintei nu sunt coplanare. Împarte suprafața sau aliniază mai întâi punctele fixe.|Die festen Zielpunkte liegen nicht in einer Ebene. Zuerst die Fläche teilen oder ihre festen Punkte ausrichten.
Enter a height between -30 and 30 m.|Introdu o înălțime între -30 și 30 m.|Eine Höhe zwischen -30 und 30 m eingeben.
Choose a connected edge to follow.|Alege o muchie conectată de urmat.|Eine angrenzende Kante als Richtung wählen.
This edge direction never reaches the requested height on the target slope.|Direcția muchiei nu atinge înălțimea cerută pe apa țintă.|Diese Kantenrichtung erreicht die gewünschte Höhe auf der Zielfläche nicht.
Choose Keep position or Keep height.|Alege Păstrează poziția sau Păstrează înălțimea.|Position beibehalten oder Höhe beibehalten wählen.
The intersection is outside the selected slope. Choose another slope or edge direction.|Intersecția este în afara apei selectate. Alege altă apă sau altă direcție de muchie.|Der Schnittpunkt liegt außerhalb der gewählten Dachfläche. Eine andere Fläche oder Kantenrichtung wählen.
Choose a roof surface for the dormer.|Alege o suprafață pentru lucarnă.|Eine Dachfläche für die Gaube wählen.
Use a width of 0.5–8 m, front wall rise of 0.15–5 m and pitch of 5–60°.|Folosește o lățime de 0,5–8 m, o înălțime frontală de 0,15–5 m și o pantă de 5–60°.|Eine Breite von 0,5–8 m, Vorderwandhöhe von 0,15–5 m und Neigung von 5–60° verwenden.
Choose a planar surface. Divide this folded surface first.|Alege o suprafață plană. Împarte mai întâi suprafața neplană.|Eine ebene Fläche wählen. Diese geknickte Fläche zuerst teilen.
Choose a sloping roof surface for the dormer.|Alege o suprafață înclinată pentru lucarnă.|Eine geneigte Dachfläche für die Gaube wählen.
The dormer must fit inside one surface. Move it downhill or reduce its size.|Lucarna trebuie să încapă într-o singură suprafață. Mut-o în josul pantei sau micșoreaz-o.|Die Gaube muss in eine Fläche passen. Hangabwärts verschieben oder verkleinern.
Leave at least 8 cm between the dormer and surface edges.|Lasă cel puțin 8 cm între lucarnă și muchiile suprafeței.|Mindestens 8 cm zwischen Gaube und Flächenkanten lassen.
The dormer crosses the surface outline. Choose a wider part of the roof.|Lucarna depășește conturul suprafeței. Alege o zonă mai lată a acoperișului.|Die Gaube überschreitet den Flächenumriss. Einen breiteren Dachbereich wählen.
Use at most 30 roof windows.|Folosește maximum 30 de ferestre de mansardă.|Höchstens 30 Dachfenster verwenden.
Roof window width must be 0.3–3 m and height along the slope 0.4–4 m.|Lățimea ferestrei trebuie să fie de 0,3–3 m, iar înălțimea pe pantă de 0,4–4 m.|Die Dachfensterbreite muss 0,3–3 m und die Höhe entlang der Neigung 0,4–4 m betragen.
Choose a sloping roof surface for the window.|Alege o suprafață înclinată pentru fereastră.|Eine geneigte Dachfläche für das Fenster wählen.
Roof windows must not overlap. Leave at least 8 cm between them.|Ferestrele nu se pot suprapune. Lasă cel puțin 8 cm între ele.|Dachfenster dürfen sich nicht überlappen. Mindestens 8 cm Abstand lassen.
Cannot connect preset roof surfaces.|Suprafețele modelului nu pot fi conectate.|Dachflächen der Vorlage können nicht verbunden werden.
Cannot close preset roof perimeter.|Conturul modelului nu poate fi închis.|Dachumriss der Vorlage kann nicht geschlossen werden.
Choose a preset roof or an existing drawn layout to edit.|Alege un model de acoperiș sau un plan desenat existent pentru editare.|Eine Dachvorlage oder einen vorhandenen gezeichneten Grundriss zum Bearbeiten wählen.
Enter a valid number for every profile dimension.|Introdu un număr valid pentru fiecare dimensiune a profilului.|Für jedes Profilmaß eine gültige Zahl eingeben.
Sheet width must be 100–3,000 mm; usable width must be at least 100 mm and no wider than the sheet.|Lățimea foii trebuie să fie de 100–3.000 mm; lățimea utilă trebuie să fie de minimum 100 mm și să nu depășească foaia.|Die Blechbreite muss 100–3.000 mm betragen; die Nutzbreite muss mindestens 100 mm betragen und darf nicht größer als die Blechbreite sein.
Check the module, overlap, maximum length, weight and minimum pitch.|Verifică modulul, suprapunerea, lungimea maximă, greutatea și panta minimă.|Modul, Überlappung, maximale Länge, Gewicht und Mindestneigung prüfen.
Use whole module counts from 1 to 100; maximum must be at least minimum.|Folosește un număr întreg de module de la 1 la 100; maximul trebuie să fie cel puțin egal cu minimul.|Ganze Modulanzahlen von 1 bis 100 verwenden; das Maximum muss mindestens dem Minimum entsprechen.
The maximum sheet length cannot fit the minimum module count plus end overlap.|Lungimea maximă a foii nu permite numărul minim de module plus suprapunerea la capăt.|Die maximale Blechlänge reicht nicht für die minimale Modulanzahl plus Endüberlappung.
Start offset must be from 0 up to (but below) the usable sheet width.|Decalajul inițial trebuie să fie de la 0 până sub lățimea utilă a foii.|Der Startversatz muss mindestens 0 und kleiner als die Nutzbreite sein.
Too many sheet columns. Increase the usable width.|Prea multe coloane de foi. Mărește lățimea utilă.|Zu viele Blechspalten. Nutzbreite erhöhen.
Too many pieces. Increase the sheet dimensions.|Prea multe piese. Mărește dimensiunile foii.|Zu viele Teile. Blechmaße erhöhen.
Flat surface: sheet direction defaults to the plan Z axis.|Suprafață orizontală: direcția foilor urmează implicit axa Z a planului.|Ebene Fläche: Die Blechrichtung folgt standardmäßig der Z-Achse des Grundrisses.
Draw a roof layout first. An uploaded image does not contain measurable roof surfaces.|Desenează mai întâi un plan de acoperiș. O imagine încărcată nu conține suprafețe măsurabile.|Zuerst einen Dachgrundriss zeichnen. Ein hochgeladenes Bild enthält keine messbaren Dachflächen.
`);
// Full-message templates, anchored to avoid changing IDs or arbitrary user text.
entries(`
{0} help|Ajutor: {0}|Hilfe: {0}
Surface {0}|Suprafața {0}|Fläche {0}
Surface {0} · points {1}|Suprafața {0} · punctele {1}|Fläche {0} · Punkte {1}
Surface {0} (points {1})|Suprafața {0} (punctele {1})|Fläche {0} (Punkte {1})
Point {0}|Punctul {0}|Punkt {0}
Point {0} — point {1}|Punctul {0} — punctul {1}|Punkt {0} — Punkt {1}
Downhill on surface {0}|Coborâre pe suprafața {0}|Gefälle auf Fläche {0}
Window {0}|Fereastra {0}|Fenster {0}
Window W{0} selected|Fereastra W{0} selectată|Fenster W{0} ausgewählt
Window W{0}, selected|Fereastra W{0}, selectată|Fenster W{0}, ausgewählt
W{0} · selected|W{0} · selectată|W{0} · ausgewählt
Grid step: {0} m (Roof properties → Grid snap).|Pasul grilei: {0} m (Proprietățile acoperișului → Aliniere la grilă).|Rasterschritt: {0} m (Dacheigenschaften → Am Raster einrasten).
Window {0} must be inside a roof slope.|Fereastra {0} trebuie să fie în interiorul unei ape.|Fenster {0} muss innerhalb einer Dachfläche liegen.
Window {0}: leave 8 cm inside the slope, clear of ridges, valleys and edges.|Fereastra {0}: lasă 8 cm în interiorul apei, departe de coame, dolii și muchii.|Fenster {0}: 8 cm Abstand innerhalb der Dachfläche zu Firsten, Kehlen und Kanten lassen.
Depth {0} m · Ridge {1} m above wall datum. Ready to add.|Adâncime {0} m · Coamă la {1} m deasupra peretelui. Gata de adăugat.|Tiefe {0} m · First {1} m über Wandbezugshöhe. Bereit zum Hinzufügen.
Preview: X {0} m, Z {1} m, height {2} m. Plan move {3} m.|Previzualizare: X {0} m, Z {1} m, înălțime {2} m. Deplasare în plan {3} m.|Vorschau: X {0} m, Z {1} m, Höhe {2} m. Verschiebung im Grundriss {3} m.
{0} Selected and target copies will reconnect.|{0} Copia selectată și copia țintă se vor reuni.|{0} Ausgewählte Kopie und Zielkopie werden wieder verbunden.
{0} · copy {1}/{2}|{0} · copia {1}/{2}|{0} · Kopie {1}/{2}
{0} surfaces · {1} m² plan · {2} m² roof|{0} suprafețe · {1} m² în plan · {2} m² acoperiș|{0} Flächen · {1} m² Grundriss · {2} m² Dach
{0} copies here. Selected point: {1}. Attached surfaces: {2}.|{0} copii aici. Punct selectat: {1}. Suprafețe conectate: {2}.|{0} Kopien hier. Ausgewählter Punkt: {1}. Angrenzende Flächen: {2}.
{0} copies here. Selected edge: {1}. Attached surfaces: {2}.|{0} copii aici. Muchie selectată: {1}. Suprafețe conectate: {2}.|{0} Kopien hier. Ausgewählte Kante: {1}. Angrenzende Flächen: {2}.
{0} of {1} surfaces selected to detach. Leave at least one attached.|{0} din {1} suprafețe selectate pentru separare. Lasă cel puțin una conectată.|{0} von {1} Flächen zum Trennen ausgewählt. Mindestens eine verbunden lassen.
This alignment would make an invalid roof: {0}|Această aliniere ar crea un acoperiș invalid: {0}|Diese Ausrichtung würde ein ungültiges Dach erzeugen: {0}
{0} Release to cancel this move.|{0} Eliberează pentru a anula mutarea.|{0} Loslassen, um diese Verschiebung abzubrechen.
Dormer details must fit the editor’s 5 cm edge and 0.05 m² surface limits. {0}|Detaliile lucarnei trebuie să respecte limitele editorului: muchii de 5 cm și suprafețe de 0,05 m². {0}|Gaubendetails müssen die Editorgrenzen von 5 cm Kantenlänge und 0,05 m² Fläche einhalten. {0}
This preset cannot be edited at its current settings: {0} Try adjusting its dimensions or pitch.|Modelul nu poate fi editat cu setările actuale: {0} Încearcă să ajustezi dimensiunile sau panta.|Diese Vorlage kann mit den aktuellen Einstellungen nicht bearbeitet werden: {0} Abmessungen oder Neigung anpassen.
{0} slopes · {1} sheets|{0} ape · {1} foi|{0} Dachflächen · {1} Bleche
{0} · Cutting plan|{0} · Plan de debitare|{0} · Zuschnittplan
{0} mm total / {1} mm usable width · {2} mm module · {3} mm end allowance · {4} modules/sheet|{0} mm total / {1} mm lățime utilă · modul {2} mm · adaos la capăt {3} mm · {4} module/foaie|{0} mm Gesamtbreite / {1} mm Nutzbreite · {2} mm Modul · {3} mm Endzugabe · {4} Module/Blech
Start: right to left · Offset: {0} mm|Început: de la dreapta la stânga · Decalaj: {0} mm|Start: von rechts nach links · Versatz: {0} mm
Start: left to right · Offset: {0} mm|Început: de la stânga la dreapta · Decalaj: {0} mm|Start: von links nach rechts · Versatz: {0} mm
Slope {0}|Apa {0}|Dachfläche {0}
{0} m² · {1}° pitch · {2} sheets · {3} columns · {4} m² order area|{0} m² · pantă {1}° · {2} foi · {3} coloane · {4} m² de comandat|{0} m² · {1}° Neigung · {2} Bleche · {3} Spalten · {4} m² Bestellfläche
{0} sheets · {1} modules · {2} m² ordered|{0} foi · {1} module · {2} m² comandați|{0} Bleche · {1} Module · {2} m² bestellt
Pitch {0}° is below this profile’s {1}° minimum.|Panta de {0}° este sub minimul de {1}° al acestui profil.|Die Neigung von {0}° liegt unter der Mindestneigung dieses Profils von {1}°.
Unfolded cutting plan for slope {0}|Plan desfășurat de debitare pentru apa {0}|Abgewickelter Zuschnittplan für Dachfläche {0}
{0}: {1} modules, {2} mm stock length|{0}: {1} module, lungime comandată {2} mm|{0}: {1} Module, {2} mm Bestelllänge
↑ START · right to left ←|↑ ÎNCEPUT · de la dreapta la stânga ←|↑ START · von rechts nach links ←
↑ START · left to right →|↑ ÎNCEPUT · de la stânga la dreapta →|↑ START · von links nach rechts →
`);
entries(`
ON-SITE MEASUREMENTS|MĂSURĂTORI DE PE ȘANTIER|AUFMASS VOR ORT
Draw each slope|Desenează fiecare apă|Dachflächen einzeln zeichnen
Close slope drawing|Închide desenarea apelor|Zeichnung der Dachflächen schließen
Slopes|Ape|Dachflächen
Add slope|Adaugă apă|Dachfläche hinzufügen
Triangle|Triunghi|Dreieck
Trapezoid|Trapez|Trapez
Rectangle|Dreptunghi|Rechteck
Parallelogram|Paralelogram|Parallelogramm
Free polygon|Poligon liber|Freies Polygon
Save slopes|Salvează apele|Dachflächen speichern
Duplicate|Duplică|Duplizieren
Delete|Șterge|Löschen
Shape|Formă|Form
Eave (base)|Streașină (bază)|Traufe (Basis)
Ridge (top)|Coamă (sus)|First (oben)
Left side|Latura stângă|Linke Seite
Right side|Latura dreaptă|Rechte Seite
Slope length|Lungimea apei|Sparrenlänge
Side length|Lungimea laturii|Seitenlänge
Ridge shifted|Coama decalată|First versetzt
To the right|Spre dreapta|Nach rechts
To the left|Spre stânga|Nach links
Identical slopes|Ape identice|Gleiche Dachflächen
Pitch (optional)|Pantă (opțional)|Neigung (optional)
Points|Puncte|Punkte
Start at the left end of the eave and go anticlockwise: along the eave, then up and around. X runs along the eave, Y up the slope.|Începe din capătul stâng al streșinii și mergi în sens invers acelor de ceasornic: de-a lungul streșinii, apoi în sus și înapoi. X este de-a lungul streșinii, Y în sus pe apă.|Am linken Traufende beginnen und gegen den Uhrzeigersinn fortfahren: entlang der Traufe, dann nach oben und zurück. X verläuft entlang der Traufe, Y die Dachfläche hinauf.
Point {0} X|Punctul {0} X|Punkt {0} X
Point {0} Y|Punctul {0} Y|Punkt {0} Y
Remove point {0}|Elimină punctul {0}|Punkt {0} entfernen
Add point|Adaugă punct|Punkt hinzufügen
Edges|Muchii|Kanten
Edge {0}|Muchia {0}|Kante {0}
Eave|Streașină|Traufe
Ridge|Coamă|First
Hip|Coamă înclinată|Grat
Valley|Dolie|Kehle
Verge|Bordură|Ortgang
Wall abutment|Racord la perete|Wandanschluss
Edge types give the ridge, hip, valley, eave and verge lengths for trims.|Tipul muchiilor dă lungimile de coamă, dolie, streașină și bordură pentru accesorii.|Die Kantentypen ergeben die Längen für First, Grat, Kehle, Traufe und Ortgang für das Zubehör.
Enter the lengths measured on the slope itself, not on the plan. The slope length (eave to ridge) is calculated from the sides. Sheets run from the eave up.|Introdu lungimile măsurate pe apă, nu pe planul de sus. Lungimea apei (de la streașină la coamă) se calculează din laturi. Panourile urcă de la streașină.|Die direkt auf der Dachfläche gemessenen Längen eingeben, nicht die Grundrissmaße. Die Sparrenlänge (Traufe bis First) wird aus den Seiten berechnet. Bleche verlaufen von der Traufe nach oben.
Check measurements|Verifică măsurătorile|Maße prüfen
The preview appears when the measurements form a valid slope.|Previzualizarea apare când măsurătorile formează o apă validă.|Die Vorschau erscheint, sobald die Maße eine gültige Dachfläche ergeben.
{0} slope(s) need correcting|{0} ape trebuie corectate|{0} Dachfläche(n) müssen korrigiert werden
{0} slopes · {1} m² total roof area|{0} ape · {1} m² suprafață totală|{0} Dachflächen · {1} m² Dachfläche gesamt
{0}: enter a length from 0.01 to {1} m.|{0}: introdu o lungime între 0,01 și {1} m.|{0}: eine Länge von 0,01 bis {1} m eingeben.
Choose a slope shape.|Alege forma apei.|Form der Dachfläche wählen.
Add at least three points.|Adaugă cel puțin trei puncte.|Mindestens drei Punkte hinzufügen.
The side cannot be shorter than the slope length.|Latura nu poate fi mai scurtă decât lungimea apei.|Die Seite darf nicht kürzer als die Sparrenlänge sein.
These three sides cannot form a triangle. Check the measurements.|Aceste trei laturi nu pot forma un triunghi. Verifică măsurătorile.|Diese drei Seiten ergeben kein Dreieck. Maße prüfen.
Eave and ridge are equal. Use a rectangle or a parallelogram instead.|Streașina și coama sunt egale. Folosește un dreptunghi sau un paralelogram.|Traufe und First sind gleich lang. Stattdessen Rechteck oder Parallelogramm verwenden.
These sides are too short for the eave and ridge lengths. Check the measurements.|Laturile sunt prea scurte pentru lungimile streșinii și coamei. Verifică măsurătorile.|Die Seiten sind für die Trauf- und Firstlänge zu kurz. Maße prüfen.
A slope needs 3 to 60 points with valid coordinates.|O apă are nevoie de 3–60 de puncte cu coordonate valide.|Eine Dachfläche benötigt 3 bis 60 Punkte mit gültigen Koordinaten.
A slope must fit within {0} × {1} m.|O apă trebuie să încapă în {0} × {1} m.|Eine Dachfläche muss in {0} × {1} m passen.
List the points anticlockwise, starting at the eave.|Introdu punctele în sens invers acelor de ceasornic, începând de la streașină.|Punkte gegen den Uhrzeigersinn angeben, beginnend an der Traufe.
Identical slopes must be a whole number from 1 to {0}.|Numărul de ape identice trebuie să fie un număr întreg între 1 și {0}.|Gleiche Dachflächen müssen eine ganze Zahl von 1 bis {0} sein.
Pitch must be from 0 to 89°.|Panta trebuie să fie între 0 și 89°.|Die Neigung muss zwischen 0 und 89° liegen.
Unknown edge type.|Tip de muchie necunoscut.|Unbekannter Kantentyp.
Invalid slope drawing.|Desenul apelor nu este valid.|Ungültige Zeichnung der Dachflächen.
Draw from 1 to {0} slopes.|Desenează între 1 și {0} ape.|1 bis {0} Dachflächen zeichnen.
Edit slopes|Editează apele|Dachflächen bearbeiten
Draw each slope separately from on-site measurements: eave, ridge and side lengths. The sheet cutting plan uses these shapes directly; there is no 3D model.|Desenează fiecare apă separat, din măsurătorile de pe șantier: streașină, coamă și laturi. Planul de panotaj folosește direct aceste forme; nu există model 3D.|Jede Dachfläche einzeln nach dem Aufmaß vor Ort zeichnen: Traufe, First und Seitenlängen. Der Zuschnittplan verwendet diese Formen direkt; es gibt kein 3D-Modell.
Total roof area · {0} slopes|Suprafață totală · {0} ape|Dachfläche gesamt · {0} Dachflächen
{0} m² each · {1} m² total|{0} m² fiecare · {1} m² în total|je {0} m² · {1} m² gesamt
2D only: these slopes are not joined into a 3D roof. Open Sheet cutting plan for the panel layout and order list.|Doar 2D: apele nu sunt unite într-un acoperiș 3D. Deschide planul de panotaj pentru dispunerea panourilor și lista de comandă.|Nur 2D: Diese Dachflächen werden nicht zu einem 3D-Dach verbunden. Den Zuschnittplan für Blechverlegung und Bestellliste öffnen.
× {0} identical slopes|× {0} ape identice|× {0} gleiche Dachflächen
· Sheets and areas below are for one slope; the combined list counts every copy.|· Foile și suprafețele de mai jos sunt pentru o singură apă; lista cumulată le numără pe toate.|· Bleche und Flächen unten gelten für eine Dachfläche; die Gesamtliste zählt jede Kopie.
{0} m² · Pitch not entered · {1} sheets · {2} columns · {3} m² order area|{0} m² · pantă neintrodusă · {1} foi · {2} coloane · {3} m² de comandat|{0} m² · Neigung nicht angegeben · {1} Bleche · {2} Spalten · {3} m² Bestellfläche
Slopes drawn one by one at their true size, shown side by side. They are not joined into a 3D roof. Roof area counts every identical copy.|Ape desenate individual, la dimensiunea reală, afișate una lângă alta. Nu sunt unite într-un acoperiș 3D. Suprafața include toate apele identice.|Einzeln in wahrer Größe gezeichnete Dachflächen, nebeneinander dargestellt. Sie werden nicht zu einem 3D-Dach verbunden. Die Dachfläche zählt jede gleiche Kopie.
Edge lengths|Lungimi de muchii|Kantenlängen
Ridge, hip and valley edges are shared by two slopes, so each drawn edge counts half. Use these lengths for ridge caps, valleys, eave flashings and verge trims.|Coama, coamele înclinate și doliile sunt comune pentru două ape, deci fiecare muchie desenată contează pe jumătate. Folosește aceste lungimi pentru coame, dolii, șorțuri și borduri.|First, Grat und Kehle gehören zu zwei Dachflächen, daher zählt jede gezeichnete Kante zur Hälfte. Diese Längen für Firstkappen, Kehlen, Traufbleche und Ortgangbleche verwenden.
Prices are not yet available for slopes drawn one by one. Open Sheet cutting plan for panel lengths, quantities and trim lengths.|Prețurile nu sunt încă disponibile pentru apele desenate individual. Deschide planul de panotaj pentru lungimile panourilor, cantități și lungimile accesoriilor.|Für einzeln gezeichnete Dachflächen sind noch keine Preise verfügbar. Den Zuschnittplan für Blechlängen, Mengen und Zubehörlängen öffnen.
`);
entries(`
Double-click to type the exact length|Dublu clic pentru a introduce lungimea exactă|Doppelklicken, um die genaue Länge einzugeben
Drag to change the shape|Trage pentru a modifica forma|Ziehen, um die Form zu ändern
Drag the points to shape the slope · Double-click a length to type it exactly · Hold Alt for 1 cm steps|Trage de puncte pentru a forma apa · Dublu clic pe o cotă pentru valoarea exactă · Ține apăsat Alt pentru pași de 1 cm|Punkte ziehen, um die Dachfläche zu formen · Maß doppelklicken, um es genau einzugeben · Alt gedrückt halten für 1-cm-Schritte
`);
entries(`
Drawing mode|Mod de desenare|Zeichenmodus
`);
const patterns = [...messages].filter(([key]) => key.includes('{')).map(([key, translations]) => ({
  // Prefer more specific templates over "Window {0}" and "Surface {0}".
  weight: key.replace(/\{\d+\}/g, '').length,
  regex: new RegExp('^' + key.split(/\{\d+\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$'),
  translations,
})).sort((a, b) => b.weight - a.weight);

export function featureLocale(locale) {
  return /^ro(?:-|$)/i.test(locale || '') ? 'ro-RO' : /^de(?:-|$)/i.test(locale || '') ? 'de-DE' : 'en-US';
}
export function featureText(locale, source) {
  const lang = featureLocale(locale);
  if (lang === 'en-US') return source;
  const index = lang === 'ro-RO' ? 0 : 1;
  const text = String(source).trim();
  let translated = messages.get(text)?.[index];
  if (!translated) {
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (!match) continue;
      translated = pattern.translations[index].replace(/\{(\d+)\}/g, (_, n) => featureText(locale, match[Number(n) + 1]));
      break;
    }
  }
  return translated ? String(source).replace(text, translated) : source;
}

// These imperative widgets replace text and SVG nodes while editing. Keep their
// source text per node so switching back to English never depends on reversing
// translations. Only presentation text/attributes are touched, never form values.
export function localizeFeature(root, getLocale) {
  const sources = new WeakMap();
  const attributes = ['aria-label', 'title', 'placeholder'];
  function translate(node, key, read, write) {
    const value = read();
    const cached = sources.get(node) || {};
    const previous = cached[key];
    const source = previous && value === previous.translated ? previous.source : value;
    const translated = featureText(getLocale(), source);
    cached[key] = { source, translated };
    sources.set(node, cached);
    if (value !== translated) write(translated);
  }
  const observe = () => observer.observe(root, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: attributes });
  function refresh() {
    observer.disconnect();
    const walk = node => {
      if (node.nodeType === 3) translate(node, 'text', () => node.nodeValue, value => { node.nodeValue = value; });
      if (node.nodeType === 1) {
        if (node.matches('script, style, textarea')) return;
        for (const name of attributes) if (node.hasAttribute(name)) {
          translate(node, name, () => node.getAttribute(name), value => node.setAttribute(name, value));
        }
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(root);
    root.lang = featureLocale(getLocale());
    observe();
  }
  const observer = new MutationObserver(refresh);
  window.addEventListener('roof-locale-applied', refresh);
  refresh();
  return { refresh, sourceText: node => sources.get(node)?.text?.source ?? node.textContent,
    dispose() { observer.disconnect(); window.removeEventListener('roof-locale-applied', refresh); } };
}

export function translatedMarkup(markup, locale) {
  const root = document.createElement('div');
  root.innerHTML = markup;
  const translation = localizeFeature(root, () => locale);
  const result = root.innerHTML;
  translation.dispose();
  return result;
}
