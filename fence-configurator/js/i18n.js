import { normalizeConfiguratorLocale } from '../../shared-ui/src/i18n.js?v=site-analytics-1';
import { getLocaleForHostname } from '../../shared-ui/src/config.js?v=localized-slugs-1';

const EN = {
  'viewer.aria': 'Fence 3D viewer',
  'viewer.canvasAria': 'Interactive 3D fence model',
  'sidebar.aria': 'Fence settings',
  'sidebar.eyebrow': 'Outdoor boundaries',
  'sidebar.title': 'Fence settings',
  'sidebar.copy': 'Configure the fence layout, bay system, infill, finish, gates and installation from one panel.',
  'sidebar.show': 'Show fence settings',
  'sidebar.hide': 'Hide fence settings',
  'section.layout': 'Layout & dimensions',
  'layout.type': 'Fence layout',
  'layout.straight': 'Straight run',
  'layout.l': 'L-shaped',
  'layout.u': 'U-shaped',
  'layout.closed': 'Closed perimeter · 4 sides',
  'layout.closed5': 'Closed perimeter · 5 sides',
  'dimension.runA': 'Run A',
  'dimension.runB': 'Run B',
  'dimension.runC': 'Run C',
  'dimension.closedRunA': 'Side AB',
  'dimension.closedRunB': 'Side BC',
  'dimension.closedRunC': 'Side CD',
  'dimension.closedRunD': 'Side DA · calculated',
  'dimension.closed5RunD': 'Side DE',
  'dimension.closed5RunE': 'Side EA · calculated',
  'dimension.closedHelp': 'DA updates automatically to close the perimeter.',
  'dimension.closed5Help': 'The remaining corner directions are derived automatically; EA closes the five-side perimeter.',
  'dimension.angleB': 'Angle at B',
  'dimension.height': 'Fence height',
  'dimension.bayWidth': 'Target bay width',
  'dimension.bayHint': '{count} bays · {width} average bay',
  'dimension.baySystem': 'Bay system',
  'section.panels': 'Panels & finish',
  'panel.style': 'Panel system',
  'panel.vertical': 'Vertical slats',
  'panel.horizontal': 'Horizontal slats',
  'panel.privacy': 'Solid privacy',
  'panel.mesh': 'Welded mesh',
  'panel.gap': 'Slat gap',
  'finish.label': 'Finish',
  'finish.anthracite': 'Anthracite',
  'finish.black': 'Black',
  'finish.white': 'Traffic white',
  'finish.bronze': 'Bronze grey',
  'finish.wood': 'Wood tone',
  'section.access': 'Access & installation',
  'gate.title': 'Gates',
  'gate.help': 'Add pedestrian or driveway gates to any available fence bay.',
  'gate.add': 'Add gate',
  'gate.empty': 'No gates added.',
  'gate.capacity': 'All available bays are occupied by gates.',
  'gate.itemTitle': 'Gate {number}',
  'gate.remove': 'Remove gate',
  'gate.type': 'Gate type',
  'gate.none': 'No gate',
  'gate.pedestrian': 'Pedestrian gate',
  'gate.driveway': 'Double driveway gate',
  'gate.run': 'Gate run',
  'gate.position': 'Gate bay position',
  'gate.handing': 'Pedestrian gate handing',
  'gate.left': 'Hinges left',
  'gate.right': 'Hinges right',
  'gate.positionHint': 'Bay {from}{to}',
  'foundation.label': 'Post foundation',
  'foundation.concrete': 'Concrete footings',
  'foundation.baseplate': 'Base plates & anchors',
  'section.display': 'Model display',
  'display.scenery': 'Context scenery',
  'display.sceneryHelp': 'Show ground, path and landscaping for scale',
  'section.summary': 'Summary & pricing',
  'summary.totalLabel': 'Indicative configured total',
  'summary.totalHelp': 'Demo estimate before taxes. Final engineering, site survey and quotation required.',
  'summary.length': 'Fence length',
  'summary.bays': 'Fence bays',
  'summary.posts': 'Posts',
  'summary.gate': 'Gate',
  'summary.gates': 'Gates',
  'summary.noGate': 'None',
  'summary.materials': 'Materials',
  'summary.installation': 'Installation allowance',
  'summary.engineering': 'Engineering allowance',
  'summary.bom': 'Bill of materials',
  'summary.itemCount': '{count} items',
  'summary.export': 'Export BOM CSV',
  'summary.fullBom': 'Full bill of materials',
  'bom.title': 'Fence bill of materials',
  'bom.copy': 'Indicative quantities generated from the current fence geometry.',
  'bom.item': 'Item',
  'bom.quantity': 'Quantity',
  'bom.unit': 'Unit',
  'bom.unitPrice': 'Unit price',
  'bom.total': 'Total',
  'bom.disclaimer': 'Commercial preview only. Foundations, wind loading, local regulations and site conditions require project-specific verification.',
  'bom.done': 'Done',
  'bom.close': 'Close',
  'bom.item.posts': 'Fence posts',
  'bom.item.panel.vertical': 'Vertical aluminium slat panels',
  'bom.item.panel.horizontal': 'Horizontal aluminium slat panels',
  'bom.item.panel.privacy': 'Solid aluminium privacy panels',
  'bom.item.panel.mesh': 'Welded steel mesh panels',
  'bom.item.foundation.baseplate': 'Post base plates & anchors',
  'bom.item.foundation.concrete': 'Concrete post footings',
  'bom.item.hardware': 'Panel brackets & stainless fasteners',
  'bom.item.gate.driveway': 'Double-leaf driveway gate assembly',
  'bom.item.gate.pedestrian': 'Pedestrian gate assembly',
  'bom.item.slats': 'Decorative aluminium slats',
  'tools.environment': 'Light & orientation',
  'tools.dimensions': 'Toggle dimensions',
  'tools.compass': 'Toggle compass',
  'tools.camera': 'Change camera',
  'tools.edges': 'Technical edges',
  'environment.title': 'Light & orientation',
  'environment.sun': 'Sun position',
  'environment.north': 'North direction',
  'environment.night': 'Night preview',
  'environment.nightHelp': 'Switch to a low-light architectural preview',
  'reset.confirm': 'Reset the fence configuration?',
};

const RO = {
  ...EN,
  'viewer.aria': 'Vizualizator 3D gard', 'viewer.canvasAria': 'Model 3D interactiv al gardului', 'sidebar.aria': 'Setări gard',
  'sidebar.eyebrow': 'Delimitări exterioare', 'sidebar.title': 'Setări gard', 'sidebar.copy': 'Configurează forma gardului, traveile, umplutura, finisajul, porțile și montajul dintr-un singur panou.',
  'sidebar.show': 'Arată setările gardului', 'sidebar.hide': 'Ascunde setările gardului',
  'section.layout': 'Formă și dimensiuni', 'layout.type': 'Forma gardului', 'layout.straight': 'Linie dreaptă', 'layout.l': 'Formă L', 'layout.u': 'Formă U', 'layout.closed': 'Perimetru închis · 4 laturi', 'layout.closed5': 'Perimetru închis · 5 laturi',
  'dimension.runA': 'Latura A', 'dimension.runB': 'Latura B', 'dimension.runC': 'Latura C', 'dimension.closedRunA': 'Latura AB', 'dimension.closedRunB': 'Latura BC', 'dimension.closedRunC': 'Latura CD', 'dimension.closedRunD': 'Latura DA · calculată', 'dimension.closed5RunD': 'Latura DE', 'dimension.closed5RunE': 'Latura EA · calculată', 'dimension.closedHelp': 'DA se actualizează automat pentru a închide perimetrul.', 'dimension.closed5Help': 'Direcțiile celorlalte colțuri sunt derivate automat; EA închide perimetrul cu 5 laturi.', 'dimension.angleB': 'Unghiul în B', 'dimension.height': 'Înălțime gard', 'dimension.bayWidth': 'Lățime țintă travee', 'dimension.bayHint': '{count} travei · {width} lățime medie', 'dimension.baySystem': 'Sistem de travei',
  'section.panels': 'Panouri și finisaj', 'panel.style': 'Sistem de panouri', 'panel.vertical': 'Lamele verticale', 'panel.horizontal': 'Lamele orizontale', 'panel.privacy': 'Panou plin', 'panel.mesh': 'Plasă sudată', 'panel.gap': 'Spațiu între lamele',
  'finish.label': 'Finisaj', 'finish.anthracite': 'Antracit', 'finish.black': 'Negru', 'finish.white': 'Alb trafic', 'finish.bronze': 'Gri bronz', 'finish.wood': 'Aspect lemn',
  'section.access': 'Acces și montaj', 'gate.title': 'Porți', 'gate.help': 'Adaugă porți pietonale sau auto pe orice travee disponibilă.', 'gate.add': 'Adaugă poartă', 'gate.empty': 'Nu este adăugată nicio poartă.', 'gate.capacity': 'Toate traveile disponibile sunt ocupate de porți.', 'gate.itemTitle': 'Poarta {number}', 'gate.remove': 'Elimină poarta', 'gate.type': 'Tip poartă', 'gate.none': 'Fără poartă', 'gate.pedestrian': 'Poartă pietonală', 'gate.driveway': 'Poartă auto dublă', 'gate.run': 'Latura porții', 'gate.position': 'Poziția porții', 'gate.handing': 'Sens poartă pietonală', 'gate.left': 'Balamale stânga', 'gate.right': 'Balamale dreapta', 'gate.positionHint': 'Traveea {from}{to}',
  'foundation.label': 'Fundație stâlp', 'foundation.concrete': 'Fundații din beton', 'foundation.baseplate': 'Plăci de bază și ancore',
  'section.display': 'Afișare model', 'display.scenery': 'Context exterior', 'display.sceneryHelp': 'Arată terenul, aleea și vegetația pentru scară',
  'section.summary': 'Sumar și preț', 'summary.totalLabel': 'Total configurat orientativ', 'summary.totalHelp': 'Estimare demonstrativă fără taxe. Sunt necesare proiectarea finală, măsurătorile și oferta.', 'summary.length': 'Lungime gard', 'summary.bays': 'Travei', 'summary.posts': 'Stâlpi', 'summary.gate': 'Poartă', 'summary.gates': 'Porți', 'summary.noGate': 'Fără', 'summary.materials': 'Materiale', 'summary.installation': 'Montaj estimat', 'summary.engineering': 'Proiectare estimată', 'summary.bom': 'Listă de materiale', 'summary.itemCount': '{count} articole', 'summary.export': 'Exportă BOM CSV', 'summary.fullBom': 'Lista completă de materiale',
  'bom.title': 'Listă de materiale gard', 'bom.copy': 'Cantități orientative generate din geometria curentă a gardului.', 'bom.item': 'Articol', 'bom.quantity': 'Cantitate', 'bom.unit': 'UM', 'bom.unitPrice': 'Preț unitar', 'bom.total': 'Total', 'bom.disclaimer': 'Previzualizare comercială. Fundațiile, încărcarea la vânt, reglementările locale și condițiile terenului trebuie verificate pentru proiect.', 'bom.done': 'Gata', 'bom.close': 'Închide',
  'bom.item.posts': 'Stâlpi de gard', 'bom.item.panel.vertical': 'Panouri cu lamele verticale din aluminiu', 'bom.item.panel.horizontal': 'Panouri cu lamele orizontale din aluminiu', 'bom.item.panel.privacy': 'Panouri pline din aluminiu', 'bom.item.panel.mesh': 'Panouri din plasă sudată de oțel', 'bom.item.foundation.baseplate': 'Plăci de bază și ancore pentru stâlpi', 'bom.item.foundation.concrete': 'Fundații din beton pentru stâlpi', 'bom.item.hardware': 'Console panou și elemente de fixare inox', 'bom.item.gate.driveway': 'Ansamblu poartă auto dublă', 'bom.item.gate.pedestrian': 'Ansamblu poartă pietonală', 'bom.item.slats': 'Lamele decorative din aluminiu',
  'tools.environment': 'Lumină și orientare', 'tools.dimensions': 'Afișează/ascunde dimensiunile', 'tools.compass': 'Afișează/ascunde busola', 'tools.camera': 'Schimbă camera', 'tools.edges': 'Muchii tehnice',
  'environment.title': 'Lumină și orientare', 'environment.sun': 'Poziția soarelui', 'environment.north': 'Direcția nord', 'environment.night': 'Previzualizare noapte', 'environment.nightHelp': 'Comută la o previzualizare arhitecturală nocturnă', 'reset.confirm': 'Resetezi configurația gardului?',
};

const DE = {
  ...EN,
  'viewer.aria': '3D-Zaunansicht', 'viewer.canvasAria': 'Interaktives 3D-Zaunmodell', 'sidebar.aria': 'Zauneinstellungen',
  'sidebar.eyebrow': 'Außenbegrenzungen', 'sidebar.title': 'Zauneinstellungen', 'sidebar.copy': 'Konfigurieren Sie Verlauf, Felder, Füllung, Oberfläche, Tore und Montage in einem Panel.',
  'sidebar.show': 'Zauneinstellungen anzeigen', 'sidebar.hide': 'Zauneinstellungen ausblenden',
  'section.layout': 'Verlauf & Maße', 'layout.type': 'Zaunverlauf', 'layout.straight': 'Gerade', 'layout.l': 'L-Form', 'layout.u': 'U-Form', 'layout.closed': 'Geschlossener Umfang · 4 Seiten', 'layout.closed5': 'Geschlossener Umfang · 5 Seiten',
  'dimension.runA': 'Strecke A', 'dimension.runB': 'Strecke B', 'dimension.runC': 'Strecke C', 'dimension.closedRunA': 'Seite AB', 'dimension.closedRunB': 'Seite BC', 'dimension.closedRunC': 'Seite CD', 'dimension.closedRunD': 'Seite DA · berechnet', 'dimension.closed5RunD': 'Seite DE', 'dimension.closed5RunE': 'Seite EA · berechnet', 'dimension.closedHelp': 'DA wird automatisch angepasst, damit der Umfang geschlossen bleibt.', 'dimension.closed5Help': 'Die übrigen Eckrichtungen werden automatisch abgeleitet; EA schließt den fünfseitigen Umfang.', 'dimension.angleB': 'Winkel bei B', 'dimension.height': 'Zaunhöhe', 'dimension.bayWidth': 'Ziel-Feldbreite', 'dimension.bayHint': '{count} Felder · {width} mittlere Breite', 'dimension.baySystem': 'Feldsystem',
  'section.panels': 'Felder & Oberfläche', 'panel.style': 'Feldsystem', 'panel.vertical': 'Vertikale Lamellen', 'panel.horizontal': 'Horizontale Lamellen', 'panel.privacy': 'Sichtschutz geschlossen', 'panel.mesh': 'Schweißgitter', 'panel.gap': 'Lamellenabstand',
  'finish.label': 'Oberfläche', 'finish.anthracite': 'Anthrazit', 'finish.black': 'Schwarz', 'finish.white': 'Verkehrsweiß', 'finish.bronze': 'Bronzegrau', 'finish.wood': 'Holzoptik',
  'section.access': 'Zugang & Montage', 'gate.title': 'Tore', 'gate.help': 'Fügen Sie Personen- oder Einfahrtstore in jedes verfügbare Zaunfeld ein.', 'gate.add': 'Tor hinzufügen', 'gate.empty': 'Keine Tore hinzugefügt.', 'gate.capacity': 'Alle verfügbaren Felder sind durch Tore belegt.', 'gate.itemTitle': 'Tor {number}', 'gate.remove': 'Tor entfernen', 'gate.type': 'Tortyp', 'gate.none': 'Kein Tor', 'gate.pedestrian': 'Personentor', 'gate.driveway': 'Doppelflügeltor', 'gate.run': 'Torstrecke', 'gate.position': 'Torposition', 'gate.handing': 'Anschlag Personentor', 'gate.left': 'Bänder links', 'gate.right': 'Bänder rechts', 'gate.positionHint': 'Feld {from}{to}',
  'foundation.label': 'Pfostenfundament', 'foundation.concrete': 'Betonfundamente', 'foundation.baseplate': 'Fußplatten & Anker',
  'section.display': 'Modellanzeige', 'display.scenery': 'Umgebung', 'display.sceneryHelp': 'Boden, Weg und Bepflanzung als Maßstabsreferenz anzeigen',
  'section.summary': 'Zusammenfassung & Preis', 'summary.totalLabel': 'Indikativer Gesamtpreis', 'summary.totalHelp': 'Demo-Schätzung vor Steuern. Finale Planung, Aufmaß und Angebot erforderlich.', 'summary.length': 'Zaunlänge', 'summary.bays': 'Zaunfelder', 'summary.posts': 'Pfosten', 'summary.gate': 'Tor', 'summary.gates': 'Tore', 'summary.noGate': 'Keins', 'summary.materials': 'Material', 'summary.installation': 'Montagezuschlag', 'summary.engineering': 'Planungszuschlag', 'summary.bom': 'Stückliste', 'summary.itemCount': '{count} Positionen', 'summary.export': 'BOM als CSV exportieren', 'summary.fullBom': 'Vollständige Stückliste',
  'bom.title': 'Zaun-Stückliste', 'bom.copy': 'Indikative Mengen aus der aktuellen Zaungeometrie.', 'bom.item': 'Position', 'bom.quantity': 'Menge', 'bom.unit': 'Einheit', 'bom.unitPrice': 'Einzelpreis', 'bom.total': 'Gesamt', 'bom.disclaimer': 'Nur kommerzielle Vorschau. Fundamente, Windlast, örtliche Vorschriften und Standortbedingungen müssen projektspezifisch geprüft werden.', 'bom.done': 'Fertig', 'bom.close': 'Schließen',
  'bom.item.posts': 'Zaunpfosten', 'bom.item.panel.vertical': 'Vertikale Aluminium-Lamellenfelder', 'bom.item.panel.horizontal': 'Horizontale Aluminium-Lamellenfelder', 'bom.item.panel.privacy': 'Geschlossene Aluminium-Sichtschutzfelder', 'bom.item.panel.mesh': 'Schweißgitterfelder aus Stahl', 'bom.item.foundation.baseplate': 'Pfosten-Fußplatten und Anker', 'bom.item.foundation.concrete': 'Betonfundamente für Pfosten', 'bom.item.hardware': 'Feldhalter und Edelstahlbefestiger', 'bom.item.gate.driveway': 'Doppelflügel-Toranlage', 'bom.item.gate.pedestrian': 'Personentor-Anlage', 'bom.item.slats': 'Dekorative Aluminiumlamellen',
  'tools.environment': 'Licht & Ausrichtung', 'tools.dimensions': 'Bemaßung ein-/ausblenden', 'tools.compass': 'Kompass ein-/ausblenden', 'tools.camera': 'Kamera wechseln', 'tools.edges': 'Technische Kanten',
  'environment.title': 'Licht & Orientierung', 'environment.sun': 'Sonnenstand', 'environment.north': 'Nordrichtung', 'environment.night': 'Nachtansicht', 'environment.nightHelp': 'Zu einer architektonischen Schwachlichtansicht wechseln', 'reset.confirm': 'Zaunkonfiguration zurücksetzen?',
};

const ES = {
  'viewer.aria': 'Visor 3D de valla', 'viewer.canvasAria': 'Modelo 3D interactivo de la valla', 'sidebar.aria': 'Ajustes de la valla',
  'sidebar.eyebrow': 'Cerramientos exteriores', 'sidebar.title': 'Ajustes de la valla', 'sidebar.copy': 'Configure el trazado, los módulos, el relleno, el acabado, las puertas y la instalación desde un solo panel.',
  'sidebar.show': 'Mostrar ajustes de la valla', 'sidebar.hide': 'Ocultar ajustes de la valla',
  'section.layout': 'Trazado y dimensiones', 'layout.type': 'Trazado de la valla', 'layout.straight': 'Tramo recto', 'layout.l': 'En L', 'layout.u': 'En U', 'layout.closed': 'Perímetro cerrado · 4 lados', 'layout.closed5': 'Perímetro cerrado · 5 lados',
  'dimension.runA': 'Tramo A', 'dimension.runB': 'Tramo B', 'dimension.runC': 'Tramo C', 'dimension.closedRunA': 'Lado AB', 'dimension.closedRunB': 'Lado BC', 'dimension.closedRunC': 'Lado CD', 'dimension.closedRunD': 'Lado DA · calculado', 'dimension.closed5RunD': 'Lado DE', 'dimension.closed5RunE': 'Lado EA · calculado', 'dimension.closedHelp': 'DA se actualiza automáticamente para cerrar el perímetro.', 'dimension.closed5Help': 'Las direcciones de las demás esquinas se calculan automáticamente; EA cierra el perímetro de cinco lados.', 'dimension.angleB': 'Ángulo en B', 'dimension.height': 'Altura de la valla', 'dimension.bayWidth': 'Ancho de módulo objetivo', 'dimension.bayHint': '{count} módulos · {width} de ancho medio', 'dimension.baySystem': 'Sistema de módulos',
  'section.panels': 'Paneles y acabado', 'panel.style': 'Sistema de paneles', 'panel.vertical': 'Lamas verticales', 'panel.horizontal': 'Lamas horizontales', 'panel.privacy': 'Ocultación total', 'panel.mesh': 'Malla electrosoldada', 'panel.gap': 'Separación de lamas',
  'finish.label': 'Acabado', 'finish.anthracite': 'Antracita', 'finish.black': 'Negro', 'finish.white': 'Blanco tráfico', 'finish.bronze': 'Gris bronce', 'finish.wood': 'Imitación madera',
  'section.access': 'Acceso e instalación', 'gate.title': 'Puertas', 'gate.help': 'Añada puertas peatonales o de vehículos en cualquier módulo disponible de la valla.', 'gate.add': 'Añadir puerta', 'gate.empty': 'No se han añadido puertas.', 'gate.capacity': 'Todos los módulos disponibles están ocupados por puertas.', 'gate.itemTitle': 'Puerta {number}', 'gate.remove': 'Eliminar puerta', 'gate.type': 'Tipo de puerta', 'gate.none': 'Sin puerta', 'gate.pedestrian': 'Puerta peatonal', 'gate.driveway': 'Puerta doble de vehículos', 'gate.run': 'Tramo de la puerta', 'gate.position': 'Módulo de la puerta', 'gate.handing': 'Mano de la puerta peatonal', 'gate.left': 'Bisagras a la izquierda', 'gate.right': 'Bisagras a la derecha', 'gate.positionHint': 'Módulo {from}{to}',
  'foundation.label': 'Cimentación de postes', 'foundation.concrete': 'Zapatas de hormigón', 'foundation.baseplate': 'Placas base y anclajes',
  'section.display': 'Visualización del modelo', 'display.scenery': 'Entorno', 'display.sceneryHelp': 'Mostrar terreno, camino y jardín como referencia de escala',
  'section.summary': 'Resumen y precio', 'summary.totalLabel': 'Total orientativo configurado', 'summary.totalHelp': 'Estimación de demostración sin impuestos. Se requieren ingeniería final, visita técnica y presupuesto.', 'summary.length': 'Longitud de la valla', 'summary.bays': 'Módulos de valla', 'summary.posts': 'Postes', 'summary.gate': 'Puerta', 'summary.gates': 'Puertas', 'summary.noGate': 'Ninguna', 'summary.materials': 'Materiales', 'summary.installation': 'Partida de instalación', 'summary.engineering': 'Partida de ingeniería', 'summary.bom': 'Lista de materiales', 'summary.itemCount': '{count} partidas', 'summary.export': 'Exportar BOM en CSV', 'summary.fullBom': 'Lista completa de materiales',
  'bom.title': 'Lista de materiales de la valla', 'bom.copy': 'Cantidades orientativas generadas a partir de la geometría actual de la valla.', 'bom.item': 'Partida', 'bom.quantity': 'Cantidad', 'bom.unit': 'Unidad', 'bom.unitPrice': 'Precio unitario', 'bom.total': 'Total', 'bom.disclaimer': 'Solo vista previa comercial. Cimentaciones, carga de viento, normativa local y condiciones del emplazamiento requieren verificación específica del proyecto.', 'bom.done': 'Listo', 'bom.close': 'Cerrar',
  'bom.item.posts': 'Postes de valla', 'bom.item.panel.vertical': 'Paneles de lamas verticales de aluminio', 'bom.item.panel.horizontal': 'Paneles de lamas horizontales de aluminio', 'bom.item.panel.privacy': 'Paneles ciegos de aluminio', 'bom.item.panel.mesh': 'Paneles de malla electrosoldada de acero', 'bom.item.foundation.baseplate': 'Placas base y anclajes para postes', 'bom.item.foundation.concrete': 'Zapatas de hormigón para postes', 'bom.item.hardware': 'Soportes de panel y tornillería inoxidable', 'bom.item.gate.driveway': 'Conjunto de puerta de vehículos de dos hojas', 'bom.item.gate.pedestrian': 'Conjunto de puerta peatonal', 'bom.item.slats': 'Lamas decorativas de aluminio',
  'tools.environment': 'Luz y orientación', 'tools.dimensions': 'Mostrar/ocultar cotas', 'tools.compass': 'Mostrar/ocultar brújula', 'tools.camera': 'Cambiar cámara', 'tools.edges': 'Aristas técnicas',
  'environment.title': 'Luz y orientación', 'environment.sun': 'Posición del sol', 'environment.north': 'Dirección norte', 'environment.night': 'Vista nocturna', 'environment.nightHelp': 'Cambiar a una vista arquitectónica con poca luz', 'reset.confirm': '¿Restablecer la configuración de la valla?',
};

const FR = {
  'viewer.aria': 'Visionneuse 3D de clôture', 'viewer.canvasAria': 'Modèle 3D interactif de la clôture', 'sidebar.aria': 'Réglages de la clôture',
  'sidebar.eyebrow': 'Clôtures extérieures', 'sidebar.title': 'Réglages de la clôture', 'sidebar.copy': 'Configurez le tracé, les travées, le remplissage, la finition, les portails et la pose depuis un seul panneau.',
  'sidebar.show': 'Afficher les réglages de la clôture', 'sidebar.hide': 'Masquer les réglages de la clôture',
  'section.layout': 'Tracé et dimensions', 'layout.type': 'Tracé de la clôture', 'layout.straight': 'Tronçon droit', 'layout.l': 'En L', 'layout.u': 'En U', 'layout.closed': 'Périmètre fermé · 4 côtés', 'layout.closed5': 'Périmètre fermé · 5 côtés',
  'dimension.runA': 'Tronçon A', 'dimension.runB': 'Tronçon B', 'dimension.runC': 'Tronçon C', 'dimension.closedRunA': 'Côté AB', 'dimension.closedRunB': 'Côté BC', 'dimension.closedRunC': 'Côté CD', 'dimension.closedRunD': 'Côté DA · calculé', 'dimension.closed5RunD': 'Côté DE', 'dimension.closed5RunE': 'Côté EA · calculé', 'dimension.closedHelp': 'DA est mis à jour automatiquement pour fermer le périmètre.', 'dimension.closed5Help': 'Les directions des autres angles sont déduites automatiquement ; EA ferme le périmètre à cinq côtés.', 'dimension.angleB': 'Angle en B', 'dimension.height': 'Hauteur de clôture', 'dimension.bayWidth': 'Largeur de travée cible', 'dimension.bayHint': '{count} travées · {width} de largeur moyenne', 'dimension.baySystem': 'Système de travées',
  'section.panels': 'Panneaux et finition', 'panel.style': 'Système de panneaux', 'panel.vertical': 'Lames verticales', 'panel.horizontal': 'Lames horizontales', 'panel.privacy': 'Occultation totale', 'panel.mesh': 'Treillis soudé', 'panel.gap': 'Espacement des lames',
  'finish.label': 'Finition', 'finish.anthracite': 'Anthracite', 'finish.black': 'Noir', 'finish.white': 'Blanc signalisation', 'finish.bronze': 'Gris bronze', 'finish.wood': 'Aspect bois',
  'section.access': 'Accès et pose', 'gate.title': 'Portails', 'gate.help': 'Ajoutez des portillons ou des portails sur n’importe quelle travée disponible.', 'gate.add': 'Ajouter un portail', 'gate.empty': 'Aucun portail ajouté.', 'gate.capacity': 'Toutes les travées disponibles sont occupées par des portails.', 'gate.itemTitle': 'Portail {number}', 'gate.remove': 'Supprimer le portail', 'gate.type': 'Type de portail', 'gate.none': 'Sans portail', 'gate.pedestrian': 'Portillon piéton', 'gate.driveway': 'Portail battant double', 'gate.run': 'Tronçon du portail', 'gate.position': 'Travée du portail', 'gate.handing': 'Sens du portillon', 'gate.left': 'Charnières à gauche', 'gate.right': 'Charnières à droite', 'gate.positionHint': 'Travée {from}{to}',
  'foundation.label': 'Fondation des poteaux', 'foundation.concrete': 'Massifs en béton', 'foundation.baseplate': 'Platines et ancrages',
  'section.display': 'Affichage du modèle', 'display.scenery': 'Environnement', 'display.sceneryHelp': 'Afficher le sol, l’allée et la végétation pour l’échelle',
  'section.summary': 'Récapitulatif et prix', 'summary.totalLabel': 'Total configuré indicatif', 'summary.totalHelp': 'Estimation de démonstration hors taxes. Étude finale, relevé sur site et devis requis.', 'summary.length': 'Longueur de clôture', 'summary.bays': 'Travées', 'summary.posts': 'Poteaux', 'summary.gate': 'Portail', 'summary.gates': 'Portails', 'summary.noGate': 'Aucun', 'summary.materials': 'Matériaux', 'summary.installation': 'Forfait pose', 'summary.engineering': 'Forfait étude', 'summary.bom': 'Nomenclature', 'summary.itemCount': '{count} articles', 'summary.export': 'Exporter la BOM en CSV', 'summary.fullBom': 'Nomenclature complète',
  'bom.title': 'Nomenclature de la clôture', 'bom.copy': 'Quantités indicatives générées à partir de la géométrie actuelle de la clôture.', 'bom.item': 'Article', 'bom.quantity': 'Quantité', 'bom.unit': 'Unité', 'bom.unitPrice': 'Prix unitaire', 'bom.total': 'Total', 'bom.disclaimer': 'Aperçu commercial uniquement. Fondations, charge de vent, réglementation locale et conditions du site nécessitent une vérification propre au projet.', 'bom.done': 'Terminé', 'bom.close': 'Fermer',
  'bom.item.posts': 'Poteaux de clôture', 'bom.item.panel.vertical': 'Panneaux à lames verticales en aluminium', 'bom.item.panel.horizontal': 'Panneaux à lames horizontales en aluminium', 'bom.item.panel.privacy': 'Panneaux occultants pleins en aluminium', 'bom.item.panel.mesh': 'Panneaux en treillis soudé acier', 'bom.item.foundation.baseplate': 'Platines et ancrages de poteaux', 'bom.item.foundation.concrete': 'Massifs béton pour poteaux', 'bom.item.hardware': 'Supports de panneaux et fixations inox', 'bom.item.gate.driveway': 'Ensemble portail battant deux vantaux', 'bom.item.gate.pedestrian': 'Ensemble portillon piéton', 'bom.item.slats': 'Lames décoratives en aluminium',
  'tools.environment': 'Lumière et orientation', 'tools.dimensions': 'Afficher/masquer les cotes', 'tools.compass': 'Afficher/masquer la boussole', 'tools.camera': 'Changer de caméra', 'tools.edges': 'Arêtes techniques',
  'environment.title': 'Lumière et orientation', 'environment.sun': 'Position du soleil', 'environment.north': 'Direction du nord', 'environment.night': 'Aperçu de nuit', 'environment.nightHelp': 'Passer à un aperçu architectural en faible luminosité', 'reset.confirm': 'Réinitialiser la configuration de la clôture ?',
};

const IT = {
  'viewer.aria': 'Visualizzatore 3D recinzione', 'viewer.canvasAria': 'Modello 3D interattivo della recinzione', 'sidebar.aria': 'Impostazioni recinzione',
  'sidebar.eyebrow': 'Delimitazioni esterne', 'sidebar.title': 'Impostazioni recinzione', 'sidebar.copy': 'Configuri tracciato, campate, tamponamento, finitura, cancelli e posa da un unico pannello.',
  'sidebar.show': 'Mostra impostazioni recinzione', 'sidebar.hide': 'Nascondi impostazioni recinzione',
  'section.layout': 'Tracciato e dimensioni', 'layout.type': 'Tracciato recinzione', 'layout.straight': 'Tratto rettilineo', 'layout.l': 'A L', 'layout.u': 'A U', 'layout.closed': 'Perimetro chiuso · 4 lati', 'layout.closed5': 'Perimetro chiuso · 5 lati',
  'dimension.runA': 'Tratto A', 'dimension.runB': 'Tratto B', 'dimension.runC': 'Tratto C', 'dimension.closedRunA': 'Lato AB', 'dimension.closedRunB': 'Lato BC', 'dimension.closedRunC': 'Lato CD', 'dimension.closedRunD': 'Lato DA · calcolato', 'dimension.closed5RunD': 'Lato DE', 'dimension.closed5RunE': 'Lato EA · calcolato', 'dimension.closedHelp': 'DA si aggiorna automaticamente per chiudere il perimetro.', 'dimension.closed5Help': 'Le direzioni degli altri angoli sono ricavate automaticamente; EA chiude il perimetro a cinque lati.', 'dimension.angleB': 'Angolo in B', 'dimension.height': 'Altezza recinzione', 'dimension.bayWidth': 'Larghezza campata target', 'dimension.bayHint': '{count} campate · {width} di larghezza media', 'dimension.baySystem': 'Sistema di campate',
  'section.panels': 'Pannelli e finitura', 'panel.style': 'Sistema di pannelli', 'panel.vertical': 'Doghe verticali', 'panel.horizontal': 'Doghe orizzontali', 'panel.privacy': 'Frangivista pieno', 'panel.mesh': 'Rete elettrosaldata', 'panel.gap': 'Distanza tra le doghe',
  'finish.label': 'Finitura', 'finish.anthracite': 'Antracite', 'finish.black': 'Nero', 'finish.white': 'Bianco traffico', 'finish.bronze': 'Grigio bronzo', 'finish.wood': 'Effetto legno',
  'section.access': 'Accesso e posa', 'gate.title': 'Cancelli', 'gate.help': 'Aggiunga cancelli pedonali o carrabili in qualsiasi campata disponibile.', 'gate.add': 'Aggiungi cancello', 'gate.empty': 'Nessun cancello aggiunto.', 'gate.capacity': 'Tutte le campate disponibili sono occupate da cancelli.', 'gate.itemTitle': 'Cancello {number}', 'gate.remove': 'Rimuovi cancello', 'gate.type': 'Tipo di cancello', 'gate.none': 'Nessun cancello', 'gate.pedestrian': 'Cancello pedonale', 'gate.driveway': 'Cancello carrabile a due ante', 'gate.run': 'Tratto del cancello', 'gate.position': 'Campata del cancello', 'gate.handing': 'Apertura cancello pedonale', 'gate.left': 'Cerniere a sinistra', 'gate.right': 'Cerniere a destra', 'gate.positionHint': 'Campata {from}{to}',
  'foundation.label': 'Fondazione pali', 'foundation.concrete': 'Plinti in calcestruzzo', 'foundation.baseplate': 'Piastre di base e tasselli',
  'section.display': 'Visualizzazione modello', 'display.scenery': 'Contesto', 'display.sceneryHelp': 'Mostra terreno, vialetto e verde come riferimento di scala',
  'section.summary': 'Riepilogo e prezzo', 'summary.totalLabel': 'Totale configurato indicativo', 'summary.totalHelp': 'Stima dimostrativa al netto delle imposte. Sono necessari progettazione finale, sopralluogo e offerta.', 'summary.length': 'Lunghezza recinzione', 'summary.bays': 'Campate', 'summary.posts': 'Pali', 'summary.gate': 'Cancello', 'summary.gates': 'Cancelli', 'summary.noGate': 'Nessuno', 'summary.materials': 'Materiali', 'summary.installation': 'Quota posa', 'summary.engineering': 'Quota progettazione', 'summary.bom': 'Distinta materiali', 'summary.itemCount': '{count} voci', 'summary.export': 'Esporta BOM in CSV', 'summary.fullBom': 'Distinta materiali completa',
  'bom.title': 'Distinta materiali recinzione', 'bom.copy': 'Quantità indicative generate dalla geometria attuale della recinzione.', 'bom.item': 'Voce', 'bom.quantity': 'Quantità', 'bom.unit': 'Unità', 'bom.unitPrice': 'Prezzo unitario', 'bom.total': 'Totale', 'bom.disclaimer': 'Solo anteprima commerciale. Fondazioni, carico del vento, normative locali e condizioni del sito richiedono una verifica specifica di progetto.', 'bom.done': 'Fatto', 'bom.close': 'Chiudi',
  'bom.item.posts': 'Pali per recinzione', 'bom.item.panel.vertical': 'Pannelli a doghe verticali in alluminio', 'bom.item.panel.horizontal': 'Pannelli a doghe orizzontali in alluminio', 'bom.item.panel.privacy': 'Pannelli frangivista pieni in alluminio', 'bom.item.panel.mesh': 'Pannelli in rete elettrosaldata di acciaio', 'bom.item.foundation.baseplate': 'Piastre di base e tasselli per pali', 'bom.item.foundation.concrete': 'Plinti in calcestruzzo per pali', 'bom.item.hardware': 'Staffe pannello e viteria inox', 'bom.item.gate.driveway': 'Gruppo cancello carrabile a due ante', 'bom.item.gate.pedestrian': 'Gruppo cancello pedonale', 'bom.item.slats': 'Doghe decorative in alluminio',
  'tools.environment': 'Luce e orientamento', 'tools.dimensions': 'Mostra/nascondi quote', 'tools.compass': 'Mostra/nascondi bussola', 'tools.camera': 'Cambia telecamera', 'tools.edges': 'Spigoli tecnici',
  'environment.title': 'Luce e orientamento', 'environment.sun': 'Posizione del sole', 'environment.north': 'Direzione nord', 'environment.night': 'Anteprima notturna', 'environment.nightHelp': 'Passa a un’anteprima architettonica in luce scarsa', 'reset.confirm': 'Ripristinare la configurazione della recinzione?',
};

const MESSAGES = Object.freeze({ 'en-US': EN, 'ro-RO': RO, 'de-DE': DE, 'es-ES': ES, 'fr-FR': FR, 'it-IT': IT });
export const FENCE_MESSAGES = MESSAGES;

export function resolveFenceLocale(value = null) {
  if (value) return normalizeConfiguratorLocale(value);
  return normalizeConfiguratorLocale(getLocaleForHostname(window.location.hostname));
}

export function fenceT(locale, key, variables = {}) {
  const resolved = resolveFenceLocale(locale);
  let value = MESSAGES[resolved]?.[key] ?? EN[key] ?? key;
  Object.entries(variables).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

export function applyFenceTranslations(locale = resolveFenceLocale()) {
  const resolved = resolveFenceLocale(locale);
  document.documentElement.lang = resolved.slice(0, 2);
  document.querySelectorAll('[data-fence-i18n]').forEach((element) => {
    element.textContent = fenceT(resolved, element.dataset.fenceI18n);
  });
  document.querySelectorAll('[data-fence-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', fenceT(resolved, element.dataset.fenceI18nAriaLabel));
  });
  document.querySelectorAll('[data-fence-i18n-title]').forEach((element) => {
    element.setAttribute('title', fenceT(resolved, element.dataset.fenceI18nTitle));
  });
  window.dispatchEvent(new CustomEvent('fence-locale-applied', { detail: { locale: resolved } }));
  return resolved;
}
