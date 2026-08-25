import { normalizeConfiguratorLocale } from '../../shared-ui/src/i18n.js';
import { getLocaleForHostname } from '../../shared-ui/src/config.js';

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
  'environment.title': 'Licht & Orientierung', 'environment.sun': 'Sonnenstand', 'environment.north': 'Nordrichtung', 'environment.night': 'Nachtansicht', 'environment.nightHelp': 'Zu einer architektonischen Schwachlichtansicht wechseln', 'reset.confirm': 'Zaunkonfiguration zurücksetzen?',
};

const MESSAGES = Object.freeze({ 'en-US': EN, 'ro-RO': RO, 'de-DE': DE });

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
