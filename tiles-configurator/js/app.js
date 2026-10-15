import { createProjectSession } from './projectSession.js';
import { mountProjectPanel } from './projectPanel.js';
import { geometryShareState, projectFileName, prepareProjectState } from './pavingProject.js';
import { createPhotoAnalysis } from './photoAnalysis.js?v=tiles-area-1';
import { SEGMENTATION_CONFIG } from './segmentationConfig.js?v=tiles-area-1';
import { mountAnalysisPanel, analysisFlowText } from './analysisPanel.js?v=tiles-corners-2';
import { prepareModelImport } from './segmentationAdapter.js?v=tiles-area-1';
import { failImport } from './modelCamera.js';
import { mountSegmentationDebugPanel } from './segmentationDebugPanel.js?v=tiles-menu-2';
import { asRegionState, clearPaving, applyPavingPatch, replaceBoundary, editBoundaryVertex } from './pavingEditor.js';
import { PavingHistory } from './pavingHistory.js';
import { createTilesARController } from './ar/controller.js?v=tiles-ar-1';
import { mountLocationPicker } from './locationPicker.js';
import { patternPreview } from './patternPreview.js';
import { houseGeometry } from './house.js';
import { normalizeFootprint } from './footprint.js';
import {
  TILES,
  CURBS,
  COLORS,
  DEFAULTS,
  normalize,
  layout,
  estimate,
  areaGeometry,
} from './model.js';
import { translator } from './i18n.js';
import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=tenant-branding-1';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js';
import { createShareUrl } from '../../shared-ui/src/shareState.js';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';

const tenant = await requireTenantConfiguratorAccess('tiles');
const $ = (id) => document.getElementById(id);
installAreaEditor();
installPhotoFlowShell();
let state = normalize(),
  locale = 'en-US',
  t = translator(locale),
  viewer,
  shell,
  top = false,
  drawingArea = false,
  draftAreaPoints = [],
  drawingOperation = 'replace',
  activeBoundaryKey = '',
  activeVertex = 0,
  photoFlowStep = 'upload',
  photoObjectUrl = null,
  photoSource = null,
  photoLoadSequence = 0,
  designRevision = 0,
  modelImportUI,
  analysisController,
  analysisUI,
  photoSourceUrl = null,
  manualCalibrationSnapshot = null,
  modelImportSummary = null,
  lastModelImport = null,
  projectSession,
  projectUI,
  photoRectCache = null,
  calibrationCorners = [
    { x: 0.36, y: 0.38 },
    { x: 0.64, y: 0.4 },
    { x: 0.66, y: 0.66 },
    { x: 0.34, y: 0.64 },
  ];
const money = (n) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'RON' }).format(n);
const f = (n) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
const history = new PavingHistory({
  capture: () => captureHistorySnapshot(),
  restore: (s) => {
    try { return restoreHistorySnapshot(s); }
    catch (error) { showAreaError(geometryError(error)); return false; }
  },
});

const PHOTO_FLOW_COPY = {
  en: {
    stepUpload: '1 · Add a site photo',
    uploadTitle: 'Start with a photo of your yard',
    uploadHelp: 'Use a clear photo that shows the ground where the pavement will go. Automatic analysis sends a resized copy to the configured analysis service. Manual calibration remains available. The original photo is cached in this browser for saving and reopening.',
    upload: 'Choose yard photo',
    sampleLabel: 'Or choose a sample yard',
    sampleAlt: 'Sample yard',
    stepCalibrate: '2 · Set the scale and perspective',
    calibrateTitle: 'Match the 1 m reference square',
    calibrateHelp: 'Drag all four blue corners so the 1 m × 1 m square follows the perspective of a one-metre square on the ground. This sets scale and camera angle.',
    calibrate: 'Use this 1 m square',
    changePhoto: 'Choose another photo',
    stepDraw: '3 · Draw the paving area',
    drawTitle: 'Place the paving corners on the photo',
    drawHelp: 'Click or tap the photo to add corners. Drag a placed corner to move it. Click the first green corner or use Finish when the outline is complete.',
    undo: 'Undo point',
    finish: 'Finish area',
    calibrationInvalid: 'The reference square is too small or crossed. Keep the four corners in order around a visible 1 m square.',
    photoFailed: 'That image could not be opened. Try another JPG, PNG or WebP image.',
    photoOnly: 'Choose an image file (JPG, PNG or WebP).',
    freeCamera: 'Free camera',
    photoView: 'Photo view',
  },
  ro: {
    stepUpload: '1 · Adaugă fotografia',
    uploadTitle: 'Începe cu o fotografie a curții',
    uploadHelp: 'Folosește o fotografie clară în care se vede zona ce va fi pavată. Analiza automată trimite o copie redimensionată către serviciul de analiză configurat. Calibrarea manuală rămâne disponibilă. Fotografia originală este stocată local în browser pentru salvare și redeschidere.',
    upload: 'Alege fotografia curții',
    sampleLabel: 'Sau alege o curte exemplu',
    sampleAlt: 'Curte exemplu',
    stepCalibrate: '2 · Setează scara și perspectiva',
    calibrateTitle: 'Potrivește pătratul de referință de 1 m',
    calibrateHelp: 'Trage toate cele patru colțuri albastre astfel încât pătratul de 1 m × 1 m să urmărească perspectiva unui pătrat de un metru de pe sol. Astfel se stabilesc scara și unghiul camerei.',
    calibrate: 'Folosește acest pătrat de 1 m',
    changePhoto: 'Alege altă fotografie',
    stepDraw: '3 · Desenează zona de pavat',
    drawTitle: 'Pune colțurile pavajului pe fotografie',
    drawHelp: 'Apasă pe fotografie pentru a adăuga colțuri. Trage un colț deja pus pentru a-l muta. Apasă primul colț verde sau Finalizează când conturul este gata.',
    undo: 'Anulează punctul',
    finish: 'Finalizează suprafața',
    calibrationInvalid: 'Pătratul de referință este prea mic sau se intersectează. Păstrează cele patru colțuri în ordine în jurul unui pătrat vizibil de 1 m.',
    photoFailed: 'Imaginea nu a putut fi deschisă. Încearcă alt fișier JPG, PNG sau WebP.',
    photoOnly: 'Alege un fișier imagine (JPG, PNG sau WebP).',
    freeCamera: 'Cameră liberă',
    photoView: 'Vedere foto',
  },
  de: {
    stepUpload: '1 · Standortfoto hinzufügen',
    uploadTitle: 'Mit einem Foto des Hofs beginnen',
    uploadHelp: 'Ein klares Foto verwenden, auf dem die zu pflasternde Bodenfläche sichtbar ist. Die automatische Analyse sendet eine verkleinerte Kopie an den konfigurierten Analysedienst. Manuelle Kalibrierung bleibt verfügbar. Das Originalfoto wird zum Speichern und Wiederöffnen in diesem Browser zwischengespeichert.',
    upload: 'Hoffoto auswählen',
    sampleLabel: 'Oder einen Beispielhof auswählen',
    sampleAlt: 'Beispielhof',
    stepCalibrate: '2 · Maßstab und Perspektive',
    calibrateTitle: '1-m-Referenzquadrat ausrichten',
    calibrateHelp: 'Alle vier blauen Ecken so ziehen, dass das 1 m × 1 m Quadrat der Perspective eines ein Meter großen Quadrats auf dem Boden folgt. Dadurch werden Maßstab und Kamerawinkel gesetzt.',
    calibrate: 'Dieses 1-m-Quadrat verwenden',
    changePhoto: 'Anderes Foto auswählen',
    stepDraw: '3 · Pflasterfläche zeichnen',
    drawTitle: 'Pflasterecken im Foto setzen',
    drawHelp: 'Auf das Foto klicken oder tippen, um Ecken zu setzen. Gesetzte Ecken können gezogen werden. Zum Abschluss den ersten grünen Punkt oder Fertig verwenden.',
    undo: 'Punkt zurück',
    finish: 'Fläche fertigstellen',
    calibrationInvalid: 'Das Referenzquadrat ist zu klein oder gekreuzt. Die vier Ecken in Reihenfolge um ein sichtbares 1-m-Quadrat legen.',
    photoFailed: 'Das Bild konnte nicht geöffnet werden. Ein anderes JPG-, PNG- oder WebP-Bild versuchen.',
    photoOnly: 'Eine Bilddatei auswählen (JPG, PNG oder WebP).',
    freeCamera: 'Freie Kamera',
    photoView: 'Fotoansicht',
  },
};
const photoText = () => PHOTO_FLOW_COPY[locale.split('-')[0]] || PHOTO_FLOW_COPY.en;

function installPhotoFlowShell() {
  const viewerElement = $('viewer'),
    canvasHost = $('canvasHost');
  if (!viewerElement || !canvasHost || $('photoFlow')) return;
  document.body.classList.add('tiles-photo-setup');
  const sampleYards = Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    src: new URL(`../assets/sample-yards/${index + 1}.jpg`, import.meta.url).href,
  }));
  const flow = document.createElement('div');
  flow.id = 'photoFlow';
  flow.className = 'photo-flow is-upload';
  flow.innerHTML = `
    <div class="photo-flow-card">
      <p id="photoFlowStep" class="photo-flow-step">1 · Add a site photo</p>
      <h2 id="photoFlowTitle">Start with a photo of your yard</h2>
      <p id="photoFlowHelp">Use a clear photo that shows the ground where the pavement will go.</p>
      <label id="photoUploadAction" class="photo-primary photo-upload-action">
        <span id="photoUploadText">Choose yard photo</span>
        <input id="sitePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      </label>
      <div id="sampleYardsSection" class="sample-yards">
        <p id="sampleYardsLabel" class="sample-yards-label">Or choose a sample yard</p>
        <div id="sampleYardsGrid" class="sample-yards-grid">
          ${sampleYards.map((sample) => `<button type="button" class="sample-yard-card" data-sample-yard="${sample.id}" data-sample-src="${sample.src}"><img src="${sample.src}" alt="" loading="lazy"><span>${sample.id}</span></button>`).join('')}
        </div>
      </div>
      <div id="photoCalibrationActions" class="photo-flow-actions" hidden>
        <button id="photoCalibrationConfirm" type="button" class="photo-primary"></button>
        <button id="photoChangeCalibration" type="button" class="photo-secondary"></button>
        <button id="photoCancelCalibration" type="button" class="photo-secondary photo-full" hidden></button>
      </div>
      <div id="photoDrawingActions" class="photo-flow-actions" hidden>
        <button id="photoUndoPoint" type="button" class="photo-secondary"></button>
        <button id="photoFinishArea" type="button" class="photo-primary"></button>
        <button id="photoChangeDrawing" type="button" class="photo-secondary photo-full"></button>
      </div>
      <p id="photoFlowError" class="photo-flow-error" role="alert" hidden></p>
    </div>`;
  viewerElement.append(flow);
  $('sitePhotoInput')?.addEventListener('change', (event) => {
    window.__TILES_PENDING_PHOTO_FILE = event.target.files?.[0] || null;
  });

  const calibration = document.createElement('div');
  calibration.id = 'photoCalibrationLayer';
  calibration.hidden = true;
  calibration.innerHTML = `
    <svg id="photoCalibrationSvg" aria-hidden="true"></svg>
    ${[0, 1, 2, 3].map((i) => `<button type="button" class="photo-calibration-handle" data-calibration-corner="${i}" aria-label="Reference square corner ${i + 1}"></button>`).join('')}`;
  canvasHost.append(calibration);

  const viewActions = document.querySelector('.view-actions');
  if (viewActions && !$('photoModeButton')) {
    const button = document.createElement('button');
    button.id = 'photoModeButton';
    button.type = 'button';
    button.hidden = true;
    viewActions.insertBefore(button, viewActions.firstChild);
  }

  const style = document.createElement('style');
  style.textContent = `
    body.tiles-photo-setup #viewer{right:0!important}
    body.tiles-photo-setup .sidebar,body.tiles-photo-setup #tilesSidebarToggle{display:none!important}
    body.tiles-photo-setup .scene-caption,body.tiles-photo-setup .view-actions{display:none!important}
    .photo-flow{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:flex-start;padding:24px;pointer-events:none;transition:background .18s}
    .photo-flow.is-upload{align-items:center;justify-content:center;background:rgba(232,235,231,.96);pointer-events:auto}
    body.dark .photo-flow.is-upload{background:rgba(36,44,48,.96)}
    .photo-flow[hidden]{display:none!important}
    .photo-flow-card{width:min(440px,calc(100% - 16px));padding:20px;border:1px solid rgba(37,51,60,.14);border-radius:14px;background:rgba(255,255,255,.94);box-shadow:0 10px 30px rgba(20,28,32,.16);pointer-events:auto;backdrop-filter:blur(8px)}
    body.dark .photo-flow-card{background:rgba(37,49,57,.95);border-color:rgba(255,255,255,.14)}
    .photo-flow-card h2{font-size:20px;line-height:1.25;margin:5px 0 8px}
    .photo-flow-card>p:not(.photo-flow-step):not(.photo-flow-error){line-height:1.55;color:#5d6b73;margin:0 0 14px}
    body.dark .photo-flow-card>p:not(.photo-flow-step):not(.photo-flow-error){color:#c2ccd2}
    .photo-flow-step{margin:0;color:#0878c9;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .photo-primary,.photo-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border-radius:9px;font:inherit;font-weight:750;cursor:pointer;text-align:center}
    .photo-primary{border:1px solid #0878c9;background:#0878c9;color:#fff}
    .photo-secondary{border:1px solid #bdcbd3;background:#fff;color:#25333c}
    body.dark .photo-secondary{background:#35424a;color:#e4ebef;border-color:#52626c}
    .photo-upload-action{width:100%}
    .sample-yards{margin-top:16px}
    .sample-yards-label{margin:0 0 9px!important;color:#5d6b73;font-size:12px;font-weight:700;text-align:center}
    body.dark .sample-yards-label{color:#c2ccd2}
    .sample-yards-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;gap:8px}
    .sample-yard-card{position:relative;display:block;overflow:hidden;width:100%;aspect-ratio:3/2;padding:0;border:1px solid rgba(37,51,60,.16);border-radius:9px;background:#eef2f4;cursor:pointer}
    .sample-yard-card img{display:block;width:100%;height:100%;object-fit:cover}
    .sample-yard-card span{position:absolute;right:6px;bottom:6px;display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.92);color:#25333c;font-size:11px;font-weight:800;box-shadow:0 1px 5px rgba(0,0,0,.18)}
    .sample-yard-card:hover,.sample-yard-card:focus-visible{border-color:#0878c9;outline:2px solid rgba(8,120,201,.22);outline-offset:1px}
    body.dark .sample-yard-card{border-color:rgba(255,255,255,.18);background:#35424a}
    @media(max-width:420px){.sample-yards-grid{gap:6px}}
    .photo-flow-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .photo-flow-actions .photo-full{grid-column:1/-1}
    .photo-flow-error{margin:12px 0 0;color:#a13f20;font-size:12px;line-height:1.45}
    #photoCalibrationLayer{position:absolute;inset:0;z-index:5;pointer-events:none}
    #photoCalibrationLayer[hidden]{display:none!important}
    #photoCalibrationSvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
    .photo-calibration-handle{position:absolute;width:34px;height:34px;margin:0;padding:0;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:50%;background:#0878c9;box-shadow:0 2px 10px rgba(0,0,0,.26);pointer-events:auto;touch-action:none;cursor:grab}
    .photo-calibration-handle:active{cursor:grabbing}
    @media(max-width:760px){.photo-flow{padding:12px}.photo-flow:not(.is-upload){align-items:flex-end}.photo-flow-card{padding:15px}.photo-flow-card h2{font-size:18px}.photo-calibration-handle{width:38px;height:38px}}
  `;
  document.head.append(style);
}

function installDirectionSlider() {
  const current = $('rotation');
  if (!current || current.matches('input[type=\"number\"]')) return;
  const wrapper = current.closest('label');
  if (!wrapper) return;
  const control = document.createElement('div');
  control.className = 'dimension-control range-control';
  control.innerHTML = `
    <div class="dimension-heading control-label">
      <label for="rotation"><span data-i18n="rotation"></span> (°)</label>
      <output id="rotationValue"></output>
    </div>
    <div class="slider-row range-row">
      <input id="rotationRange" data-range-field="rotation" type="range" min="0" max="360" step="1">
      <input id="rotation" class="number-input" type="number" min="0" max="360" step="1">
    </div>`;
  wrapper.replaceWith(control);
}
installDirectionSlider();
const AREA_EDITOR_COPY = {
  en: {
    draw: 'Add area', remove: 'Remove area', clear: 'Start from scratch',
    undo: 'Undo point', finish: 'Apply area', cancel: 'Cancel',
    undoEdit: 'Undo edit', redoEdit: 'Redo edit', boundary: 'Edit boundary', none: 'No handles',
    region: 'Region', outer: 'Outer boundary', hole: 'Hole', vertex: 'Vertex',
    insert: 'Insert after', delete: 'Delete vertex',
    help: 'Add area extends or joins paving. Remove area cuts holes or splits it. Select a boundary for precise edits. New holes have no curbs until enabled below.',
    drawing: 'Place a correction polygon on the ground. Drag corners to adjust it, then Apply. Cancel leaves the pavement unchanged. Click the first green corner to finish.',
    freeform: 'Paving regions',
    status: (n) => `${n} corners placed · maximum 4096`,
    saved: (regions, holes, points) => `${regions} regions · ${holes} holes · ${points} vertices`,
    invalid: 'Use a non-crossing outline with at least 3 distinct corners. Holes must stay strictly inside their region and must not touch another boundary.',
    complex: 'This area is too large or detailed for the preview. Reduce its extent or number of vertices, or choose a larger tile format.',
    dense: 'Only a sample of handles is shown on dense boundaries. Select any vertex by number; all vertices remain in the geometry.',
  },
  ro: {
    draw: 'Adaugă suprafață', remove: 'Elimină suprafață', clear: 'Începe de la zero',
    undo: 'Anulează punctul', finish: 'Aplică suprafața', cancel: 'Renunță',
    undoEdit: 'Anulează editarea', redoEdit: 'Refă editarea', boundary: 'Editează conturul', none: 'Fără puncte de control',
    region: 'Zonă', outer: 'Contur exterior', hole: 'Gol', vertex: 'Vârf',
    insert: 'Inserează după', delete: 'Șterge vârful',
    help: 'Adaugă suprafață extinde sau unește pavajul. Elimină suprafață creează goluri sau separă zonele. Selectează un contur pentru editare precisă. Golurile noi nu au borduri până când le activezi.',
    drawing: 'Pune punctele poligonului de corecție pe sol. Trage colțurile pentru ajustare, apoi apasă Aplică. Renunță păstrează pavajul neschimbat. Apasă primul colț verde pentru finalizare.',
    freeform: 'Zone de pavaj',
    status: (n) => `${n} colțuri adăugate · maximum 4096`,
    saved: (regions, holes, points) => `${regions} zone · ${holes} goluri · ${points} vârfuri`,
    invalid: 'Conturul trebuie să aibă cel puțin 3 colțuri distincte și să nu se intersecteze. Golurile trebuie să rămână strict în interior, fără să atingă alt contur.',
    complex: 'Suprafața este prea mare sau prea detaliată pentru previzualizare. Redu dimensiunile sau numărul de vârfuri ori alege dale mai mari.',
    dense: 'Pe contururile dense se afișează doar o parte din puncte. Selectează orice vârf după număr; toate vârfurile rămân în geometrie.',
  },
  de: {
    draw: 'Fläche hinzufügen', remove: 'Fläche entfernen', clear: 'Neu beginnen',
    undo: 'Punkt zurück', finish: 'Fläche anwenden', cancel: 'Abbrechen',
    undoEdit: 'Bearbeitung zurück', redoEdit: 'Wiederholen', boundary: 'Kontur bearbeiten', none: 'Keine Griffe',
    region: 'Bereich', outer: 'Außenkontur', hole: 'Aussparung', vertex: 'Eckpunkt',
    insert: 'Danach einfügen', delete: 'Eckpunkt löschen',
    help: 'Hinzufügen erweitert oder verbindet Pflasterflächen. Entfernen erzeugt Aussparungen oder trennt Bereiche. Eine Kontur für genaue Änderungen wählen. Neue Aussparungen haben zunächst keine Randsteine.',
    drawing: 'Ecken des Korrekturpolygons auf dem Boden setzen und durch Ziehen anpassen. Anwenden bestätigt die Änderung. Abbrechen lässt das Pflaster unverändert. Zum Abschluss den ersten grünen Punkt anklicken.',
    freeform: 'Pflasterbereiche',
    status: (n) => `${n} Ecken gesetzt · maximal 4096`,
    saved: (regions, holes, points) => `${regions} Bereiche · ${holes} Aussparungen · ${points} Eckpunkte`,
    invalid: 'Die Kontur benötigt mindestens 3 verschiedene Ecken und darf sich nicht kreuzen. Aussparungen müssen vollständig innen liegen und dürfen keine andere Kontur berühren.',
    complex: 'Die Fläche ist zu groß oder zu detailliert. Ausdehnung oder Eckpunktzahl reduzieren oder größere Pflastersteine wählen.',
    dense: 'Bei dichten Konturen werden nur einige Griffe angezeigt. Jeden Eckpunkt über seine Nummer auswählen; die Geometrie behält alle Eckpunkte.',
  },
};
const vertexLabel = (index) => {
  let value = index + 1,
    label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};
const areaText = () => AREA_EDITOR_COPY[locale.split('-')[0]] || AREA_EDITOR_COPY.en;

function installAreaEditor() {
  const panel = $('areaPlan')?.closest('.accordion-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div id="areaError" role="alert" hidden></div>
    <p id="areaDrawHelp" class="note"></p>
    <div class="area-draw-actions">
      <button id="drawArea" class="export" type="button"></button>
      <button id="removeArea" class="area-secondary" type="button"></button>
      <button id="clearPaving" class="area-secondary area-wide" type="button"></button>
      <button id="undoPaving" class="area-secondary" type="button"></button>
      <button id="redoPaving" class="area-secondary" type="button"></button>
      <button id="undoAreaPoint" class="area-secondary" type="button" hidden></button>
      <button id="finishArea" class="export" type="button" hidden></button>
      <button id="cancelArea" class="area-secondary area-wide" type="button" hidden></button>
    </div>
    <div id="boundaryTools">
      <label for="boundarySelect" id="boundarySelectLabel"></label>
      <select id="boundarySelect"></select>
      <div id="boundaryVertexTools" hidden>
        <label for="boundaryVertex" id="boundaryVertexLabel"></label>
        <input id="boundaryVertex" type="number" min="1" step="1" value="1">
        <span id="boundaryVertexCount" class="note"></span>
        <div class="area-draw-actions">
          <button id="insertAreaVertex" class="area-secondary" type="button"></button>
          <button id="deleteAreaVertex" class="area-secondary" type="button"></button>
        </div>
        <p id="denseBoundaryHelp" class="note" hidden></p>
      </div>
    </div>
    <p id="areaDrawStatus" class="note" role="status" aria-live="polite"></p>
    <svg id="areaPlan" viewBox="0 0 300 170" role="img" aria-label="Area outline"></svg>`;
  const style = document.createElement('style');
  style.textContent = `
    .area-draw-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
    .area-draw-actions .area-wide{grid-column:1/-1}
    .area-draw-actions button{width:100%;min-height:40px;white-space:normal}
    .area-secondary{padding:10px;border:1px solid #bccbd5;border-radius:8px;background:#fff;color:inherit;font-weight:650;cursor:pointer}
    .area-draw-actions button:disabled{opacity:.5;cursor:default}
    body.dark .area-secondary{background:#35424a;border-color:#52626c;color:#e4ebef}
    #boundaryTools select{width:100%;margin:6px 0 10px;min-height:38px}
    #boundaryVertex{width:90px;margin:6px 8px;min-height:36px}
    #boundaryTools label{font-weight:650;font-size:12px}
    #areaDrawStatus{min-height:1.6em;margin:7px 0}
    #edgeChoices{max-height:240px;overflow:auto}
    #areaError{color:#a13f20;line-height:1.4}
    body.tiles-area-drawing #canvasHost canvas{cursor:crosshair}
  `;
  document.head.append(style);
}
function swatches(id, key, colors) {
  $(id).innerHTML = colors
    .map(
      (c) =>
        `<button type="button" class="swatch" data-key="${key}" data-color="${c}" title="${t(c)}" aria-label="${t(c)}" aria-pressed="${state[key] === c}" style="--swatch:${Array.isArray(COLORS[c]) ? `linear-gradient(120deg,${COLORS[c].join(',')})` : COLORS[c]}"></button>`,
    )
    .join('');
}

function boundaryName(b) {
  const c = areaText();
  return `${c.region} ${b.region + 1} · ${b.hole ? `${c.hole} ${b.ring}` : c.outer}`;
}
function renderAreaPlan(geometry) {
  const draft = drawingArea ? draftAreaPoints.map((p) => ({
    x: p.x + geometry.centerX, z: p.z + geometry.centerZ,
  })) : [];
  const all = [...geometry.regions.flatMap((r) => r.outer), ...draft];
  const svg = $('areaPlan'); svg.setAttribute('aria-label', areaText().freeform);
  if (!all.length) { svg.innerHTML = ''; return; }
  const minX = Math.min(...all.map((p) => p.x)), minZ = Math.min(...all.map((p) => p.z)),
    width = Math.max(...all.map((p) => p.x)) - minX,
    depth = Math.max(...all.map((p) => p.z)) - minZ,
    scale = Math.min(260 / Math.max(width, .1), 130 / Math.max(depth, .1)),
    ox = (300 - width * scale) / 2, oz = (170 - depth * scale) / 2,
    xy = (p) => `${ox + (p.x - minX) * scale},${oz + (p.z - minZ) * scale}`,
    path = (ring) => `M${ring.map(xy).join(' L')} Z`;
  svg.innerHTML = geometry.regions.map((r) =>
    `<path d="${[r.outer, ...r.holes].map(path).join(' ')}" fill="#e9f5fd" fill-rule="evenodd" stroke="#0878c9" stroke-width="1.5"/>`).join('');
  const active = geometry.boundaries.find((b) => b.key === activeBoundaryKey);
  if (active) svg.innerHTML += `<path d="${path(active.points)}" fill="none" stroke="${active.hole ? '#bd542f' : '#0878c9'}" stroke-width="3"/>`;
  if (draft.length) svg.innerHTML += `<polyline points="${draft.map(xy).join(' ')}" fill="none" stroke="${drawingOperation === 'remove' ? '#bd542f' : '#22a06b'}" stroke-width="2" stroke-dasharray="5 3"/>`;
  if (state.houseEnabled) svg.innerHTML += `<polygon points="${houseGeometry(state).outline.map(xy).join(' ')}" fill="#69747b" fill-opacity=".8" stroke="#3f4b53" stroke-width="1.5"/>`;
}
function renderAreaEditor(geometry = areaGeometry(state)) {
  const copy = areaText(), boundaries = geometry.boundaries;
  if (activeBoundaryKey && !boundaries.some((b) => b.key === activeBoundaryKey)) activeBoundaryKey = '';
  const active = boundaries.find((b) => b.key === activeBoundaryKey);
  activeVertex = Math.max(0, Math.min(activeVertex, (active?.points.length || 1) - 1));
  for (const [id, label] of [['drawArea', 'draw'], ['removeArea', 'remove'], ['clearPaving', 'clear'],
    ['undoPaving', 'undoEdit'], ['redoPaving', 'redoEdit']]) {
    $(id).hidden = drawingArea; $(id).textContent = copy[label];
  }
  $('drawArea').disabled = !viewer;
  $('removeArea').disabled = !viewer || geometry.area === 0;
  $('clearPaving').disabled = !viewer || geometry.area === 0;
  $('undoPaving').disabled = !history.stack.length;
  $('redoPaving').disabled = !history.future.length;
  for (const id of ['undoAreaPoint', 'finishArea', 'cancelArea']) $(id).hidden = !drawingArea;
  $('undoAreaPoint').textContent = copy.undo;
  $('finishArea').textContent = copy.finish;
  $('cancelArea').textContent = copy.cancel;
  $('undoAreaPoint').disabled = !draftAreaPoints.length;
  $('finishArea').disabled = draftAreaPoints.length < 3;
  $('areaDrawHelp').textContent = drawingArea
    ? `${copy[drawingOperation === 'remove' ? 'remove' : 'draw']}: ${copy.drawing}` : copy.help;
  $('areaDrawStatus').textContent = drawingArea ? copy.status(draftAreaPoints.length)
    : copy.saved(geometry.regions.length, boundaries.filter((b) => b.hole).length,
      boundaries.reduce((n, b) => n + b.points.length, 0));
  $('boundaryTools').hidden = drawingArea || !['regions', 'custom'].includes(state.shape);
  $('boundarySelectLabel').textContent = copy.boundary;
  $('boundarySelect').innerHTML = `<option value="">${copy.none}</option>` + boundaries.map((b) =>
    `<option value="${b.key}">${boundaryName(b)}</option>`).join('');
  $('boundarySelect').value = activeBoundaryKey;
  $('boundaryVertexTools').hidden = !active;
  $('boundaryVertexLabel').textContent = copy.vertex;
  $('boundaryVertex').max = active?.points.length || 1;
  $('boundaryVertex').value = activeVertex + 1;
  $('boundaryVertexCount').textContent = `/ ${active?.points.length || 0}`;
  $('insertAreaVertex').textContent = copy.insert;
  $('deleteAreaVertex').textContent = copy.delete;
  $('deleteAreaVertex').disabled = !active || active.points.length <= 3;
  $('denseBoundaryHelp').textContent = copy.dense;
  $('denseBoundaryHelp').hidden = !active || active.points.length <= 48;
  document.querySelectorAll('[data-edge], [data-boundary-curb]').forEach((el) => (el.disabled = drawingArea));
  document.body.classList.toggle('tiles-area-drawing', drawingArea);
  viewer?.setAreaSelection(activeBoundaryKey, activeVertex);
  renderAreaPlan(geometry);
}
function showAreaError(message = areaText().invalid) {
  $('areaError').textContent = message; $('areaError').hidden = false;
}
function geometryError(error) {
  return error?.message === 'areaTooComplex' ? areaText().complex : areaText().invalid;
}
function startAreaDrawing(operation = 'replace') {
  if (!viewer) return;
  drawingOperation = ['add', 'remove', 'replace'].includes(operation) ? operation : 'replace';
  drawingArea = true; draftAreaPoints = []; designRevision++;
  $('areaError').hidden = true;
  viewer.startAreaDrawing({ operation: drawingOperation });
  renderAreaEditor();
}
function stopAreaDrawing() {
  drawingArea = false; draftAreaPoints = []; designRevision++;
  viewer?.stopAreaDrawing({ preserveCamera: true });
  renderAreaEditor();
}
function captureHistorySnapshot() {
  // Camera and geometry travel together in local undo. Images/masks are NOT copied
  // into the history stack or the ordinary saved-state/share payload.
  return { historyVersion: 1, state: structuredClone(state), photoId: photoSource?.photoId || null,
    photoView: viewer?.capturePhotoState() || null, photoFlowStep: photoFlowStep === 'analyze' ? 'calibrate' : photoFlowStep,
    modelSummary: modelImportSummary ? structuredClone(modelImportSummary) : null };
}
function restoreHistorySnapshot(snapshot) {
  if (snapshot.photoId !== (photoSource?.photoId || null)) return false;
  const next = normalize(snapshot.state), prepared = validatePavingState(next);
  viewer?.restorePhotoState(snapshot.photoView);
  photoFlowStep = snapshot.photoFlowStep;
  designRevision++;
  modelImportSummary = snapshot.modelSummary ? structuredClone(snapshot.modelSummary) : null;
  document.body.classList.toggle('tiles-photo-setup', photoFlowStep !== 'done');
  return commitPavingState(next, { record: false, finishDrawing: true, prepared });
}
function importModelResult(input, options = {}) {
  const photo = photoSource;
  if (!viewer || !photo) failImport('noPhoto', 'Load the matching photograph first.');
  if (options.photoId !== photo.photoId || options.designRevision !== designRevision)
    failImport('staleResult', 'The photograph or design changed. Request a fresh photo token before importing.');
  const resultImageId = input?.geometry?.image_id || input?.image_id;
  if (options.associateWithCurrentPhoto !== true && resultImageId !== photo.photoId)
    failImport('imageMismatch', 'The model result belongs to another image. Local exports require explicit association with the current photograph.');
  if (drawingArea && draftAreaPoints.length)
    failImport('unfinishedDrawing', 'Finish or cancel the current outline before importing a model result.');
  if (asRegionState(state).areaRegions.length && options.replaceExisting !== true)
    failImport('replaceRequired', 'The current pavement and its holes will not be overwritten without explicit replacement.');
  const imported = prepareModelImport(input, { minRegionAreaM2: SEGMENTATION_CONFIG.minRegionAreaM2, ...options, photo }),
    next = normalize({ ...state, shape: 'regions', areaPoints: null, areaRegions: imported.regions, areaOrigin: imported.origin,
      // Photo model results must not be clipped by an unrelated 3D demo house.
      houseEnabled: false }),
    prepared = validatePavingState(next), before = captureHistorySnapshot(), oldResult = lastModelImport,
    oldStack = [...history.stack], oldFuture = [...history.future];
  try {
    history.record();
    viewer.applyModelCalibration(imported.camera, imported.origin);
    designRevision++;
    const importId = `${photo.photoId}:${designRevision + 1}`;
    lastModelImport = { importId, photoId: photo.photoId, value: imported,
      analysisResultId: options.analysisResultId || null, targets: [...(options.targets || ['grass', 'dirt'])],
      payload: structuredClone(input) };
    modelImportSummary = { importId, imageId: imported.camera.imageId, source: imported.source,
      cameraSource: 'metric_model', scaleSource: imported.camera.scaleSource, accuracyVerified: false,
      diagnostics: imported.diagnostics, warnings: imported.warnings };
    lastModelImport.summary = structuredClone(modelImportSummary);
    commitPavingState(next, { record: false, finishDrawing: true, selectFirst: true, prepared });
    completePhotoFlow();
    return structuredClone(modelImportSummary);
  } catch (error) {
    lastModelImport = oldResult;
    history.stack = oldStack; history.future = oldFuture;
    restoreHistorySnapshot(before);
    throw error;
  }
}
function validatePavingState(next) {
  areaGeometry(next);
  const parts = layout(next);
  return { parts, bom: estimate(next, parts) };
}
function commitPavingState(next, { record = true, finishDrawing = false, selectFirst = false, prepared: supplied } = {}) {
  // Clip and price BEFORE changing state/history so a rejected operation is atomic.
  const prepared = supplied || validatePavingState(next), changed = JSON.stringify(next) !== JSON.stringify(state);
  if (record && changed) history.record();
  if (finishDrawing) {
    drawingArea = false; draftAreaPoints = [];
    viewer?.stopAreaDrawing({ preserveCamera: true });
  }
  state = next;
  if (changed) designRevision++;
  if (selectFirst) { activeBoundaryKey = areaGeometry(next).boundaries[0]?.key || ''; activeVertex = 0; }
  viewer?.preserveCamera();
  $('areaError').hidden = true;
  render(prepared);
  if (changed) shell?.markDirty();
  if (typeof projectSession !== 'undefined') {
    if (changed) projectSession?.markChanged();
    void projectSession?.rememberDetection();
  }
  return true;
}
function finishAreaDrawing() {
  if (!drawingArea || draftAreaPoints.length < 3) return false;
  try {
    const completingPhoto = photoFlowStep === 'draw',
      next = applyPavingPatch(state, draftAreaPoints, drawingOperation, { sceneCoordinates: true });
    commitPavingState(next, { finishDrawing: true, selectFirst: true });
    if (completingPhoto) completePhotoFlow();
    return true;
  } catch (error) {
    showAreaError(geometryError(error));
    if (photoFlowStep === 'draw') showPhotoFlowError(geometryError(error));
    return false;
  }
}
function commitAreaPointMove(points, key) {
  try { return commitPavingState(replaceBoundary(state, key, points)); }
  catch (error) { render(); showAreaError(geometryError(error)); return false; }
}
function clearPavingArea() {
  try {
    return commitPavingState(clearPaving(state), { finishDrawing: true, selectFirst: true });
  } catch (error) { showAreaError(geometryError(error)); return false; }
}
function undoPavingEdit() {
  if (drawingArea) return viewer?.undoAreaPoint();
  const ok = history.undo(); renderAreaEditor(); return ok;
}
function redoPavingEdit() {
  if (drawingArea) return false;
  const ok = history.redo(); renderAreaEditor(); return ok;
}

function showPhotoFlowError(message) {
  const error = $('photoFlowError');
  if (!error) return;
  error.textContent = message || '';
  error.hidden = !message;
}

function updateCalibrationOverlay() {
  const layer = $('photoCalibrationLayer'),
    svg = $('photoCalibrationSvg');
  if (!layer || !svg) return;
  const visible = photoFlowStep === 'calibrate' && photoRectCache?.width > 0 && photoRectCache?.height > 0;
  layer.hidden = !visible;
  if (!visible) return;
  const host = $('canvasHost'),
    width = host.clientWidth,
    height = host.clientHeight,
    points = calibrationCorners.map((point) => ({
      x: photoRectCache.left + point.x * photoRectCache.width,
      y: photoRectCache.top + point.y * photoRectCache.height,
    }));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const pointString = points.map((point) => `${point.x},${point.y}`).join(' '),
    topMid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
    leftMid = { x: (points[0].x + points[3].x) / 2, y: (points[0].y + points[3].y) / 2 };
  svg.innerHTML = `
    <polygon points="${pointString}" fill="rgba(8,120,201,.10)" stroke="#0878c9" stroke-width="3" stroke-linejoin="round"/>
    <line x1="${points[0].x}" y1="${points[0].y}" x2="${points[2].x}" y2="${points[2].y}" stroke="rgba(8,120,201,.35)" stroke-width="1.5" stroke-dasharray="7 6"/>
    <line x1="${points[1].x}" y1="${points[1].y}" x2="${points[3].x}" y2="${points[3].y}" stroke="rgba(8,120,201,.35)" stroke-width="1.5" stroke-dasharray="7 6"/>
    <g transform="translate(${topMid.x} ${topMid.y - 17})"><rect x="-27" y="-12" width="54" height="24" rx="6" fill="rgba(255,255,255,.94)"/><text text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="12" font-weight="800" fill="#1b2328">1 m</text></g>
    <g transform="translate(${leftMid.x - 22} ${leftMid.y})"><rect x="-27" y="-12" width="54" height="24" rx="6" fill="rgba(255,255,255,.94)"/><text text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="12" font-weight="800" fill="#1b2328">1 m</text></g>`;
  document.querySelectorAll('[data-calibration-corner]').forEach((button) => {
    const point = points[Number(button.dataset.calibrationCorner)];
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
  });
}

function renderPhotoViewControls() {
  const button = $('photoModeButton'),
    camera = $('cameraButton');
  if (!button || !camera) return;
  const ready = photoFlowStep === 'done' && viewer?.hasPhotoCalibration?.();
  button.hidden = !ready;
  if (!ready) return;
  const inPhoto = viewer.isPhotoMode();
  button.textContent = photoText()[inPhoto ? 'freeCamera' : 'photoView'];
  camera.hidden = inPhoto;
  modelImportUI?.update();
}

function renderPhotoFlow() {
  const flow = $('photoFlow');
  if (!flow) return;
  const copy = photoText();
  flow.hidden = photoFlowStep === 'done';
  flow.classList.toggle('is-upload', photoFlowStep === 'upload');
  $('photoUploadAction').hidden = photoFlowStep !== 'upload';
  $('sampleYardsSection').hidden = photoFlowStep !== 'upload';
  $('photoCalibrationActions').hidden = photoFlowStep !== 'calibrate';
  $('photoDrawingActions').hidden = photoFlowStep !== 'draw';
  if (photoFlowStep === 'upload') {
    $('photoFlowStep').textContent = copy.stepUpload;
    $('photoFlowTitle').textContent = copy.uploadTitle;
    $('photoFlowHelp').textContent = copy.uploadHelp;
  } else if (photoFlowStep === 'analyze') {
    $('photoFlowStep').textContent = '2 · ' + analysisFlowText(locale).title;
    $('photoFlowTitle').textContent = analysisFlowText(locale).title;
    $('photoFlowHelp').textContent = analysisFlowText(locale).help;
  } else if (photoFlowStep === 'calibrate') {
    $('photoFlowStep').textContent = copy.stepCalibrate;
    $('photoFlowTitle').textContent = copy.calibrateTitle;
    $('photoFlowHelp').textContent = copy.calibrateHelp;
  } else if (photoFlowStep === 'draw') {
    $('photoFlowStep').textContent = copy.stepDraw;
    $('photoFlowTitle').textContent = copy.drawTitle;
    $('photoFlowHelp').textContent = `${copy.drawHelp} ${areaText().status(draftAreaPoints.length)}`;
  }
  $('photoUploadText').textContent = copy.upload;
  $('sampleYardsLabel').textContent = copy.sampleLabel;
  document.querySelectorAll('.sample-yard-card img').forEach((image, index) => {
    image.alt = `${copy.sampleAlt} ${index + 1}`;
  });
  $('photoCalibrationConfirm').textContent = copy.calibrate;
  $('photoChangeCalibration').textContent = copy.changePhoto;
  $('photoCancelCalibration').hidden = !manualCalibrationSnapshot || photoFlowStep !== 'calibrate';
  $('photoCancelCalibration').textContent = areaText().cancel;
  $('photoUndoPoint').textContent = copy.undo;
  $('photoFinishArea').textContent = copy.finish;
  $('photoChangeDrawing').textContent = copy.changePhoto;
  $('photoUndoPoint').disabled = !draftAreaPoints.length;
  $('photoFinishArea').disabled = draftAreaPoints.length < 3;
  updateCalibrationOverlay();
  renderPhotoViewControls();
  modelImportUI?.update();
  analysisUI?.update();
  projectUI?.update();
}

function resetCalibrationCorners() {
  calibrationCorners = [
    { x: 0.36, y: 0.38 },
    { x: 0.64, y: 0.4 },
    { x: 0.66, y: 0.66 },
    { x: 0.34, y: 0.64 },
  ];
}

async function loadPhotoSource(source, { objectUrl = false } = {}) {
  if (!viewer || !source) return false;
  analysisController?.cancel({ clearResult: true });
  manualCalibrationSnapshot = null;
  const sequence = ++photoLoadSequence, previousPhoto = photoSource, previousUrl = photoObjectUrl;
  photoSource = null; modelImportUI?.update();
  if (drawingArea) {
    drawingArea = false; draftAreaPoints = [];
    viewer.stopAreaDrawing();
  }
  showPhotoFlowError('');
  try {
    const loaded = await viewer.loadSitePhoto(source);
    if (sequence !== photoLoadSequence) { if (objectUrl) URL.revokeObjectURL(source); return false; }
    if (previousUrl && previousUrl !== source) URL.revokeObjectURL(previousUrl);
    photoObjectUrl = objectUrl ? source : null;
    photoSourceUrl = source;
    photoSource = { photoId: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}-${sequence}`,
      width: loaded.width, height: loaded.height };
    state = normalize({ ...state, shape: 'regions', areaRegions: [], areaOrigin: { x: 0, z: 0 }, houseEnabled: false });
    designRevision++; modelImportSummary = null; lastModelImport = null;
    if (typeof projectSession !== 'undefined') void projectSession?.photoLoaded(photoSource, source);
    history.clear(); activeBoundaryKey = ''; activeVertex = 0;
    resetCalibrationCorners();
    photoRectCache = viewer.getPhotoRect();
    photoFlowStep = SEGMENTATION_CONFIG.enabled ? 'analyze' : 'calibrate';
    document.body.classList.add('tiles-photo-setup');
    render();
    if (SEGMENTATION_CONFIG.enabled) void analysisController?.run().catch(error => showPhotoFlowError(error.message));
    return true;
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(source);
    if (sequence !== photoLoadSequence) return false;
    photoSource = previousPhoto;
    modelImportUI?.update();
    showPhotoFlowError(photoText().photoFailed);
    return false;
  }
}

async function loadPhotoFile(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
    showPhotoFlowError(photoText().photoOnly);
    return false;
  }
  return loadPhotoSource(URL.createObjectURL(file), { objectUrl: true });
}

function beginManualCalibration() {
  if (!photoSource || !viewer) return false;
  if (draftAreaPoints.length) throw new Error('Finish or cancel the current outline before changing calibration.');
  analysisController?.cancel();
  if (photoFlowStep !== 'calibrate') {
    manualCalibrationSnapshot = viewer.hasPhotoCalibration() ? captureHistorySnapshot() : null;
    resetCalibrationCorners();
  }
  if (drawingArea) stopAreaDrawing();
  designRevision++;
  photoFlowStep = 'calibrate';
  viewer.beginReferenceCalibration();
  document.body.classList.add('tiles-photo-setup');
  showPhotoFlowError(''); renderPhotoFlow();
  return true;
}
function cancelManualCalibration() {
  const before = manualCalibrationSnapshot;
  if (!before) return;
  manualCalibrationSnapshot = null;
  restoreHistorySnapshot(before);
}
function beginPhotoAreaDrawing() {
  analysisController?.cancel({ notify: false });
  if (manualCalibrationSnapshot) {
    const before = manualCalibrationSnapshot;
    try {
      const current = asRegionState(state);
      const proposal = viewer.prepareReferenceRecalibration(current.areaRegions, current.areaOrigin, calibrationCorners);
      const next = normalize({ ...current, areaRegions: proposal.regions, areaOrigin: proposal.origin });
      const prepared = validatePavingState(next);
      const oldStack = [...history.stack], oldFuture = [...history.future];
      try {
        history.record(before);
        viewer.restorePhotoState(proposal.photoView);
        modelImportSummary = null;
        commitPavingState(next, { record: false, finishDrawing: true, prepared });
        manualCalibrationSnapshot = null;
        completePhotoFlow();
      } catch (error) {
        history.stack = oldStack; history.future = oldFuture;
        restoreHistorySnapshot(before);
        manualCalibrationSnapshot = null;
        throw error;
      }
      return true;
    } catch (error) { showPhotoFlowError(error.message || photoText().calibrationInvalid); return false; }
  }
  if (!viewer?.applyPhotoCalibration(calibrationCorners)) {
    showPhotoFlowError(photoText().calibrationInvalid);
    return false;
  }
  showPhotoFlowError('');
  photoFlowStep = 'draw';
  renderPhotoFlow();
  startAreaDrawing();
  return true;
}

function completePhotoFlow() {
  photoFlowStep = 'done';
  document.body.classList.remove('tiles-photo-setup');
  viewer?.completePhotoSetup();
  renderPhotoFlow();
  renderPhotoViewControls();
}

function wirePhotoFlow() {
  const input = $('sitePhotoInput'),
    layer = $('photoCalibrationLayer');
  if (!input || !layer) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    window.__TILES_PENDING_PHOTO_FILE = null;
    if (file) loadPhotoFile(file);
    input.value = '';
  });
  $('sampleYardsGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sample-src]');
    if (!button || photoFlowStep !== 'upload') return;
    loadPhotoSource(button.dataset.sampleSrc);
  });
  $('photoCalibrationConfirm').addEventListener('click', beginPhotoAreaDrawing);
  $('photoCancelCalibration').addEventListener('click', cancelManualCalibration);
  for (const id of ['photoChangeCalibration', 'photoChangeDrawing'])
    $(id).addEventListener('click', () => input.click());
  $('photoUndoPoint').addEventListener('click', () => viewer?.undoAreaPoint());
  $('photoFinishArea').addEventListener('click', finishAreaDrawing);
  $('photoModeButton')?.addEventListener('click', () => {
    if (!viewer?.hasPhotoCalibration()) return;
    viewer.setPhotoView(!viewer.isPhotoMode());
    renderPhotoViewControls();
  });

  let dragIndex = null,
    pointerId = null;
  layer.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-calibration-corner]');
    if (!handle || photoFlowStep !== 'calibrate') return;
    if (analysisController?.getStatus().busy) beginManualCalibration();
    dragIndex = Number(handle.dataset.calibrationCorner);
    pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    event.preventDefault();
  });
  layer.addEventListener('pointermove', (event) => {
    if (dragIndex === null || event.pointerId !== pointerId || !photoRectCache) return;
    const rect = $('canvasHost').getBoundingClientRect(),
      x = (event.clientX - rect.left - photoRectCache.left) / photoRectCache.width,
      y = (event.clientY - rect.top - photoRectCache.top) / photoRectCache.height;
    calibrationCorners[dragIndex] = {
      x: Math.min(0.99, Math.max(0.01, x)),
      y: Math.min(0.99, Math.max(0.01, y)),
    };
    updateCalibrationOverlay();
    event.preventDefault();
  });
  const endCalibrationDrag = (event) => {
    if (event.pointerId !== pointerId) return;
    dragIndex = null;
    pointerId = null;
  };
  layer.addEventListener('pointerup', endCalibrationDrag);
  layer.addEventListener('pointercancel', endCalibrationDrag);
  renderPhotoFlow();
  const pending = window.__TILES_PENDING_PHOTO_FILE;
  if (pending) {
    window.__TILES_PENDING_PHOTO_FILE = null;
    loadPhotoFile(pending);
  }
}

function render(prepared = null) {
  document.documentElement.lang = locale.split('-')[0];
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  for (const key of [
    'waste',
    'tileRate',
    'curbRate',
    'rotation',
    'houseShape',
    'houseLength',
    'houseWidth',
    'houseWingWidth',
    'houseWingDepth',
    'houseHeight',
    'houseX',
    'houseZ',
    'houseRotation',
  ])
    $(key).value = state[key];
  $('importedHouseOption').hidden = !state.houseFootprint;
  for (const key of ['houseLength', 'houseWidth']) {
    $(key).disabled = $(key + 'Range').disabled = state.houseShape === 'imported';
  }
  $('houseMapSource').textContent =
    state.houseShape === 'imported' && state.houseLocation
      ? `${t('imported')} · ${state.houseLocation.label} · © OpenStreetMap`
      : '';
  $('houseEnabled').checked = state.houseEnabled;
  $('houseFields').hidden = !state.houseEnabled;
  $('houseWingWidthField').hidden = $('houseWingDepthField').hidden = state.houseShape !== 'l';
  for (const [key, max] of [
    ['houseWingWidth', state.houseLength - 0.25],
    ['houseWingDepth', state.houseWidth - 0.25],
  ]) {
    $(key).max = max;
    $(key + 'Range').max = max;
  }
  document.querySelectorAll('[data-range-field]').forEach((el) => {
    const key = el.dataset.rangeField;
    el.value = state[key];
    el.setAttribute(
      'aria-label',
      document.querySelector(`label[for="${key}"]`)?.textContent.trim() || t(key),
    );
    $(key + 'Value').textContent =
      `${f(state[key])} ${['angleB', 'houseRotation', 'rotation'].includes(key) ? '°' : 'm'}`;
  });
  const geometry = areaGeometry(state),
    custom = state.shape !== 'rectangle';
  renderAreaEditor(geometry);
  $('edgeChoices').innerHTML = state.shape === 'regions'
    ? geometry.boundaries.map((b) => `<label><input type="checkbox" data-boundary-curb="${b.key}" ${b.enabled ? 'checked' : ''}><span>${boundaryName(b)}</span></label>`).join('')
    : geometry.points.map((_, i) =>
      `<label><input type="checkbox" data-edge="${i}" ${state.edges[i] ? 'checked' : ''}><span>${custom ? vertexLabel(i) + vertexLabel((i + 1) % geometry.points.length) : t(['front', 'right', 'back', 'left'][i])}</span></label>`).join('');
  document.querySelectorAll('[data-boundary-curb]').forEach((el) => {
    const b = geometry.boundaries.find((b) => b.key === el.dataset.boundaryCurb);
    el.indeterminate = b.edges?.some(Boolean) && !b.edges.every(Boolean);
    el.disabled = drawingArea;
  });
  $('tileChoices').innerHTML = Object.entries(TILES)
    .map(
      ([key, tile]) =>
        `<button type="button" class="tile-card choice-card" data-tile="${key}" aria-pressed="${state.tile === key}"><i class="tile-icon" aria-hidden="true"></i>${tile.name}<small>${tile.length * 100} × ${tile.width * 100} × ${tile.thickness * 100} cm</small></button>`,
    )
    .join('');
  const tile = TILES[state.tile];
  $('sourceLink').href = tile.source;
  $('patternChoices').innerHTML = tile.patterns
    .map(
      (p) =>
        `<button type="button" class="pattern-card" data-pattern="${p}" aria-pressed="${state.pattern === p}">${patternPreview(state, p)}<span>${t(p)}</span><i class="pattern-check" aria-hidden="true">✓</i></button>`,
    )
    .join('');
  $('curb').innerHTML = Object.entries(CURBS)
    .map(
      ([key, c]) =>
        `<option value="${key}">${t(key)} · ${c.name} · ${c.length * 100} × ${c.width * 100} × ${c.height * 100} cm</option>`,
    )
    .join('');
  $('curb').value = state.curb;
  document.querySelectorAll('[data-edge]').forEach((el) => {
    el.checked = state.edges[Number(el.dataset.edge)];
    el.disabled = drawingArea;
  });
  swatches('colors', 'color', tile.colors);
  swatches('accents', 'accent', tile.colors);
  swatches('curbColors', 'curbColor', CURBS[state.curb].colors);
  $('accentSection').hidden = state.pattern !== 'checker';
  const parts = prepared?.parts || layout(state),
    bom = prepared?.bom || estimate(state, parts);
  viewer?.rebuild(state, parts);
  $('areaBadge').textContent =
    `${f(bom.area)} m² · ${custom ? `${t('perimeter')}: ${f(bom.perimeter)} m` : `${f(state.length)} × ${f(state.width)} m`}`;
  if (viewer?.getModelCalibration()) {
    const label = { en: 'Estimated scale', ro: 'Scară estimată', de: 'Geschätzter Maßstab' }[locale.split('-')[0]] || 'Estimated scale';
    $('areaBadge').textContent += ` · ${label}`;
  }
  $('metrics').innerHTML = [
    ['netArea', `${f(bom.area)} m²`],
    ['houseArea', `${f(bom.houseArea)} m²`],
    ['pieces', bom.installedPieces],
    ['cuts', bom.cutPieces],
    [
      'purchase',
      `${f(bom.rows.filter((r) => r.kind === 'tile').reduce((a, r) => a + r.area, 0))} m²`,
    ],
    ['curbLength', `${f(bom.curbLength)} m`],
  ]
    .map(([key, value]) => `<div><span>${t(key)}</span><strong>${value}</strong></div>`)
    .join('');
  $('bom').innerHTML = bom.rows
    .map(
      (r) =>
        `<div class="bom-row"><div><b>${r.name} · ${t(r.color)}</b><small>${r.quantity} × ${money(r.rate)}${r.area ? ` · ${f(r.area)} m²` : ''}</small></div><strong>${money(r.total)}</strong></div>`,
    )
    .join('');
  $('summaryTotal').textContent = money(bom.total);
  shell?.refreshConfiguratorPanelFooter();
  $('cameraButton').textContent = t(top ? 'perspective' : 'top');
  $('viewerError').textContent = t('error');
  renderPhotoFlow();
  renderPhotoViewControls();
}

function detachProjectPhoto() {
  analysisController?.cancel({ clearResult: true, notify: false });
  photoLoadSequence++; designRevision++;
  viewer?.clearSitePhoto();
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = photoSourceUrl = photoSource = null;
  lastModelImport = modelImportSummary = manualCalibrationSnapshot = null;
  history.clear(); projectSession?.detached();
}
function restore(snapshot) {
  if (!viewer) return false; // Shared shell retries until the real viewer is ready.
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || ![1, 2].includes(snapshot.version)) return false;
  if (snapshot.photoProject) return projectSession.restoreSaved(snapshot);
  try {
    // Legacy saves and photo-free share links must never inherit an unrelated photo.
    const prepared = prepareProjectState({format:'360-tiles-project',version:1,state:snapshot});
    detachProjectPhoto(); photoFlowStep = 'done'; document.body.classList.remove('tiles-photo-setup');
    commitPavingState(prepared.document.state, {record:false,finishDrawing:true,prepared});
    viewer.fitProject(); renderPhotoFlow(); return true;
  } catch (error) { showAreaError(geometryError(error)); return false; }
}
/** Validated project opening: no network inference and no application of masks to
 * the saved design. A new photo token invalidates all responses from the old job. */
async function applyStoredProject(bundle, guard) {
  if (!viewer || !guard()) throw new Error('The viewer or current project changed. Open the project again.');
  const {document: doc, assets, detection, parts, bom} = bundle;
  let suggestion = null;
  if (detection && assets.photo) {
    try { suggestion = prepareModelImport(detection.payload, {photo:doc.photo, targets:detection.targets,
      tolerancePx:SEGMENTATION_CONFIG.tolerancePx,maxCornersPerBoundary:SEGMENTATION_CONFIG.maxCornersPerBoundary,
      minRegionAreaM2:SEGMENTATION_CONFIG.minRegionAreaM2}); }
    catch (error) { console.warn('Optional cached detection was not restored:', error); }
  }
  if (!guard()) throw new Error('The project changed while validating the saved design.');
  const before = { state, photoSource, photoSourceUrl, photoObjectUrl, photoFlowStep,
    calibrationCorners:structuredClone(calibrationCorners), view:viewer.capturePhotoState(),
    modelImportSummary, lastModelImport, manualCalibrationSnapshot,
    stack:[...history.stack], future:[...history.future], activeBoundaryKey, activeVertex };
  const url = assets.photo ? URL.createObjectURL(assets.photo.blob) : null;
  let mutated = false;
  try {
    if (url) await viewer.loadSitePhoto(url, {isCurrent:guard});
    if (!guard()) throw new Error('The project changed while loading its photograph.');
    mutated = true;
    if (!url) viewer.clearSitePhoto();
    analysisController.cancel({clearResult:true,notify:false});
    photoLoadSequence++; designRevision++;
    photoObjectUrl = photoSourceUrl = url;
    photoSource = url ? {photoId:crypto.randomUUID(),width:doc.photo.width,height:doc.photo.height} : null;
    photoFlowStep = url ? doc.stage : 'done';
    calibrationCorners = doc.referenceCorners ? structuredClone(doc.referenceCorners) : [
      {x:.36,y:.38},{x:.64,y:.4},{x:.66,y:.66},{x:.34,y:.64}];
    manualCalibrationSnapshot = null; modelImportSummary = null; lastModelImport = null;
    if (suggestion) {
      const importId = `reopened:${photoSource.photoId}`;
      const summary = {importId,imageId:suggestion.camera.imageId,source:suggestion.source,cameraSource:'metric_model',
        scaleSource:suggestion.camera.scaleSource,accuracyVerified:false,diagnostics:suggestion.diagnostics,warnings:suggestion.warnings};
      lastModelImport = {importId,photoId:photoSource.photoId,value:suggestion,analysisResultId:null,
        targets:[...detection.targets],payload:structuredClone(detection.payload),summary};
      if (doc.view.calibration?.type === 'metric_model' &&
          JSON.stringify(doc.view.calibration.value) === JSON.stringify(suggestion.camera)) modelImportSummary = summary;
    }
    document.body.classList.toggle('tiles-photo-setup',photoFlowStep !== 'done');
    commitPavingState(doc.state,{record:false,finishDrawing:true,selectFirst:true,prepared:{parts,bom}});
    if (url) viewer.restorePhotoState(doc.view,{force:true});
    else if (!doc.photo && doc.view.pose) viewer.restorePhotoState(doc.view,{force:true});
    else viewer.fitProject();
    photoRectCache = viewer.getPhotoRect(); history.clear();
    renderAreaEditor(); renderPhotoFlow();
    if (before.photoObjectUrl && before.photoObjectUrl !== url) URL.revokeObjectURL(before.photoObjectUrl);
    shell?.markDirty();
    return true;
  } catch(error) {
    // Decode/validation failures leave the previous scene in place. Unexpected
    // rendering failures restore the prior image and camera, not just geometry.
    if (mutated) {
      state = before.state; photoSource = before.photoSource; photoSourceUrl = before.photoSourceUrl;
      photoObjectUrl = before.photoObjectUrl; photoFlowStep = before.photoFlowStep;
      calibrationCorners = before.calibrationCorners; modelImportSummary = before.modelImportSummary;
      lastModelImport = before.lastModelImport; manualCalibrationSnapshot = before.manualCalibrationSnapshot;
      activeBoundaryKey = before.activeBoundaryKey; activeVertex = before.activeVertex;
      history.stack = before.stack; history.future = before.future;
      const rollbackRevision = designRevision;
      if (before.photoSourceUrl) await viewer.loadSitePhoto(before.photoSourceUrl,{isCurrent:()=>designRevision===rollbackRevision});
      else viewer.clearSitePhoto();
      document.body.classList.toggle('tiles-photo-setup',photoFlowStep !== 'done');
      viewer.restorePhotoState(before.view,{force:true}); render();
    }
    if (url) URL.revokeObjectURL(url);
    throw error;
  }
}
function change(patch, record = true) {
  try {
    let prepared = patch;
    if (Object.hasOwn(patch, 'areaPoints') && (patch.shape === 'custom' || state.shape === 'custom')) {
      const points = normalizeFootprint(patch.areaPoints);
      if (!points) throw new Error('invalidRegions');
      prepared = { ...patch, shape: 'custom', areaPoints: points };
    }
    return commitPavingState(normalize({ ...state, ...prepared }), { record });
  } catch (error) { showAreaError(geometryError(error)); return false; }
}

function setLocale(value) {
  locale = value || 'en-US';
  t = translator(locale);
  render();
  renderPhotoFlow();
}

function setDarkMode(value) {
  document.body.classList.toggle('dark', value);
  document.body.classList.toggle('shared-ui-dark-mode', value);
  viewer?.setDarkMode(value);
}

function cycleCamera() {
  top = viewer?.cycleCamera() || false;
  $('cameraButton').textContent = t(top ? 'perspective' : 'top');
  renderPhotoViewControls();
}
const api = {
  captureState: () => structuredClone(state),
  captureSavedState: () => projectSession.savedState(),
  getProjectStatus: () => projectSession?.getStatus() || {phase:'idle',message:''},
  saveLocalProject: (name, options) => projectSession.save(name, options),
  listLocalProjects: () => projectSession.list(),
  openLocalProject: id => projectSession.openLocal(id),
  deleteLocalProject: (id, revision) => projectSession.remove(id, revision),
  downloadProject: options => projectSession.download(options),
  openProjectFile: file => projectSession.openFile(file),
  reattachProjectPhoto: file => projectSession.reattach(file),
  clearLocalProjects: () => projectSession.clearLocalData(),
  projectFileName,
  restoreState: restore,
  resetConfiguration() {
    detachProjectPhoto();
    const ok = commitPavingState(normalize(DEFAULTS), { record: false, finishDrawing: true, selectFirst: true });
    photoFlowStep = 'upload'; document.body.classList.add('tiles-photo-setup'); renderPhotoFlow();
    return ok;
  },
  setLocale,
  setDarkMode,
  cycleCamera,
  getEstimate: () => ({ ...estimate(state), measurementStatus: viewer?.getModelCalibration() ? 'estimated' : viewer?.hasPhotoCalibration() ? 'reference_calibrated' : 'design_dimensions' }),
  getPhotoSource: () => photoSource ? { ...photoSource, designRevision, drawing: drawingArea, draftVertices: draftAreaPoints.length } : null,
  importModelResult,
  runPhotoAnalysis: options => analysisController.run(options),
  cancelPhotoAnalysis: options => analysisController?.cancel(options),
  restoreDetectedArea: (options = {}) => {
    if (analysisController.getResultInfo()) return analysisController.restore(options);
    if (!lastModelImport || lastModelImport.photoId !== photoSource?.photoId) throw new Error('No original suggestion is available for this photo.');
    return importModelResult(lastModelImport.payload, { ...options, ...api.getPhotoSource(),
      targets: options.targets || lastModelImport.targets, associateWithCurrentPhoto: true });
  },
  getAnalysisStatus: () => {
    const status = analysisController?.getStatus() || {phase:'idle',busy:false,canRestore:false};
    return {...status, canRestore: status.canRestore || !!(lastModelImport && lastModelImport.photoId === photoSource?.photoId)};
  },
  getAnalysisResult: () => analysisController?.getResult() || null,
  beginManualCalibration,
  getModelCamera: () => viewer?.getModelCalibration() || null,
  getModelImportSummary: () => modelImportSummary ? structuredClone(modelImportSummary) : null,
  getModelImportMasks() {
    if (!lastModelImport || lastModelImport.photoId !== photoSource?.photoId ||
        lastModelImport.importId !== modelImportSummary?.importId) return null;
    return { source: 'original_import_not_current_edits', imageId: lastModelImport.value.camera.imageId,
      ...lastModelImport.value.camera.image, ...structuredClone(lastModelImport.value.masks) };
  },
  // Diagnostics are session-local, read-only copies. Never part of saved state,
  // pricing or the undo stack. The raw result may differ from the active design.
  getDebugState() {
    const info = analysisController?.getResultInfo(), retained = lastModelImport?.photoId === photoSource?.photoId ? lastModelImport : null;
    return { photo: api.getPhotoSource(), status: api.getAnalysisStatus(),
      service: analysisController?.getServiceStatus() || { state: 'unchecked' },
      calibration: viewer?.capturePhotoState()?.calibration || null,
      measurementStatus: viewer?.getModelCalibration() ? 'estimated' : viewer?.hasPhotoCalibration() ? 'reference_calibrated' : 'unavailable',
      sources: {
        analysis: info ? { key: `${info.resultId}:${retained?.analysisResultId === info.resultId ? retained.importId : 'raw'}`,
          active: retained?.analysisResultId === info.resultId && retained.importId === modelImportSummary?.importId } : null,
        imported: retained ? { key: retained.importId, active: retained.importId === modelImportSummary?.importId } : null,
      } };
  },
  getDebugSource(kind) {
    const info = analysisController?.getResultInfo(), retained = lastModelImport?.photoId === photoSource?.photoId ? lastModelImport : null;
    const selected = kind === 'analysis' ? (info ? { photoId: info.photoId, payload: api.getAnalysisResult(), targets: retained?.analysisResultId === info.resultId ? retained.targets : info.targets,
      prepared: retained?.analysisResultId === info.resultId ? retained : null } : null) :
      kind === 'imported' && retained ? { photoId: retained.photoId, payload: retained.payload, targets: retained.targets, prepared: retained } : null;
    if (!selected) return null;
    const descriptor = api.getDebugState().sources[kind], imported = selected.prepared;
    return { ...descriptor, kind, photoId: selected.photoId, targets: [...selected.targets],
      payload: structuredClone(selected.payload), summary: imported ? structuredClone(imported.summary) : null,
      prepared: imported ? { image: { ...imported.value.camera.image }, masks: structuredClone(imported.value.masks) } : null };
  },
  getDebugView: () => viewer?.getDebugView() || null,
  setDebugPreviewVisible: visible => viewer?.setDebugPreviewVisible(visible),
  checkAnalysisService: () => analysisController.checkHealth(),
  getPavingState: () => structuredClone(asRegionState(state)),
  setPavingRegions(regions, origin = asRegionState(state).areaOrigin) {
    return change({ shape: 'regions', areaRegions: regions, areaOrigin: origin });
  },
  applyPavingPatch(points, operation = 'add') {
    try { return commitPavingState(applyPavingPatch(state, points, operation), { selectFirst: true }); }
    catch (error) { showAreaError(geometryError(error)); return false; }
  },
  clearPaving: clearPavingArea,
  undo: undoPavingEdit,
  redo: redoPavingEdit,
};
window.TILES_CONFIGURATOR_API = api;
analysisController = createPhotoAnalysis({
  config: SEGMENTATION_CONFIG,
  getPhoto: api.getPhotoSource, getPavingState: api.getPavingState,
  getSource: () => photoSourceUrl, importResult: (payload, options) => {
    // Automatic imports do not run after reference calibration has started.
    return api.importModelResult(payload, options);
  },
  onStatus(status) {
    if (status.photoId === photoSource?.photoId && photoFlowStep === 'analyze' && !status.busy &&
        ['error', 'manual_required', 'cancelled'].includes(status.phase)) photoFlowStep = 'calibrate';
    renderPhotoFlow();
  },
});
projectSession = createProjectSession({
  capture: () => ({state:structuredClone(state),view:viewer?.capturePhotoState() || null,
    referenceCorners:structuredClone(calibrationCorners)}),
  getPhoto: () => photoSource, getSource: () => photoSourceUrl,
  getRevision: () => `${photoLoadSequence}:${designRevision}`,
  getDetection: () => {
    const info = analysisController?.getResultInfo();
    if (info) {
      const targets = lastModelImport?.analysisResultId === info.resultId ? lastModelImport.targets : info.targets;
      return {key:`${info.resultId}:${targets.join(',')}`,getPayload:()=>analysisController.getResult(),targets};
    }
    return lastModelImport?.photoId === photoSource?.photoId && lastModelImport ?
      {key:lastModelImport.importId,payload:lastModelImport.payload,targets:lastModelImport.targets} : null;
  },
  assertSavable: () => {
    if (!viewer) throw new Error('The viewer is not ready.');
    if (drawingArea || draftAreaPoints.length || manualCalibrationSnapshot)
      throw new Error('Finish or cancel the current outline / calibration before saving or downloading a project.');
  },
  beforeOpen: () => analysisController.cancel(),
  apply: applyStoredProject,
  onStatus: () => projectUI?.update(),
});
projectUI = mountProjectPanel({api,getLocale:()=>locale,getStep:()=>photoFlowStep});
analysisUI = mountAnalysisPanel({ api, getLocale: () => locale, getStep: () => photoFlowStep,
  initialTargets: SEGMENTATION_CONFIG.targets });
window.addEventListener('pagehide', () => analysisController.cancel({ notify: false }));
modelImportUI = mountSegmentationDebugPanel({ api, getLocale: () => locale, getStep: () => photoFlowStep });
let sliderFrame = 0,
  sliderPatch = null;
function flushSlider() {
  if (sliderFrame) cancelAnimationFrame(sliderFrame);
  sliderFrame = 0;
  if (sliderPatch) {
    const patch = sliderPatch;
    sliderPatch = null;
    change(patch, false);
  }
}
const sidebar = document.querySelector('.sidebar');
sidebar.addEventListener(
  'pointerdown',
  (e) => {
    if (e.target.dataset.rangeField) history.record();
  },
  true,
);
sidebar.addEventListener(
  'keydown',
  (e) => {
    if (
      e.target.dataset.rangeField &&
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(e.key)
    )
      history.record();
  },
  true,
);
sidebar.addEventListener('input', (e) => {
  const key = e.target.dataset.rangeField;
  if (!key) return;
  sliderPatch = { ...(sliderPatch || {}), [key]: Number(e.target.value) };
  $(key).value = e.target.value;
  $(key + 'Value').textContent =
    `${f(Number(e.target.value))} ${['angleB', 'houseRotation', 'rotation'].includes(key) ? '°' : 'm'}`;
  if (!sliderFrame) sliderFrame = requestAnimationFrame(flushSlider);
});
$('centerHouse').addEventListener('click', () => {
  const g = areaGeometry(state);
  change({ houseX: (g.width - state.houseLength) / 2, houseZ: (g.depth - state.houseWidth) / 2 });
});
$('drawArea').addEventListener('click', () => startAreaDrawing('add'));
$('removeArea').addEventListener('click', () => startAreaDrawing('remove'));
$('clearPaving').addEventListener('click', clearPavingArea);
$('undoPaving').addEventListener('click', undoPavingEdit);
$('redoPaving').addEventListener('click', redoPavingEdit);
$('boundarySelect').addEventListener('change', (event) => {
  activeBoundaryKey = event.target.value; activeVertex = 0; renderAreaEditor();
});
$('boundaryVertex').addEventListener('change', (event) => {
  activeVertex = Math.max(0, Math.round(Number(event.target.value) || 1) - 1); renderAreaEditor();
});
for (const [id, operation] of [['insertAreaVertex', 'insert'], ['deleteAreaVertex', 'delete']])
  $(id).addEventListener('click', () => {
    try {
      const next = editBoundaryVertex(state, activeBoundaryKey, activeVertex, operation);
      if (operation === 'insert') activeVertex++;
      commitPavingState(next);
    } catch (error) { showAreaError(geometryError(error)); }
  });
document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if (event.key === 'Escape' && drawingArea && photoFlowStep !== 'draw') {
    event.preventDefault(); stopAreaDrawing(); return;
  }
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.shiftKey || event.key.toLowerCase() === 'y') redoPavingEdit(); else undoPavingEdit();
  }
});
$('undoAreaPoint').addEventListener('click', () => viewer?.undoAreaPoint());
$('finishArea').addEventListener('click', finishAreaDrawing);
$('cancelArea').addEventListener('click', stopAreaDrawing);
document.querySelector('.sidebar').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.rangeField) {
    flushSlider();
    return;
  }
  if (el.dataset.boundaryCurb !== undefined) {
    const regions = structuredClone(state.areaRegions),
      b = areaGeometry(state).boundaries.find((b) => b.key === el.dataset.boundaryCurb);
    if (!b) return;
    if (b.hole) regions[b.region].curbs.holes[b.ring - 1] = el.checked;
    else regions[b.region].curbs.outer = el.checked;
    regions[b.region].curbs.edges[b.ring] = Array(b.points.length).fill(el.checked);
    change({ areaRegions: regions });
  } else if (el.dataset.edge !== undefined) {
    const edges = [...state.edges];
    edges[Number(el.dataset.edge)] = el.checked;
    change({ edges });
  } else if (Object.hasOwn(DEFAULTS, el.id)) {
    if (el.type === 'number' && !el.checkValidity()) {
      el.reportValidity();
      el.value = state[el.id];
      return;
    }
    const patch = { [el.id]: el.type === 'checkbox' ? el.checked : el.value };
    if (el.id === 'curb') patch.curbRate = CURBS[el.value].price;
    change(patch);
  }
});
document.querySelector('.sidebar').addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (button?.dataset.tile) {
    const tile = button.dataset.tile;
    change({ tile, tileRate: TILES[tile].price });
  }
  if (button?.dataset.pattern) {
    const pattern = button.dataset.pattern;
    change({ pattern });
    document.querySelector(`[data-pattern="${pattern}"]`)?.focus({ preventScroll: true });
  }
  if (button?.dataset.color) change({ [button.dataset.key]: button.dataset.color });
});
$('cameraButton').addEventListener('click', cycleCamera);
$('export').addEventListener('click', () => {
  const bom = estimate(state);
  const rows = [
    [t('item'), t('color'), t('quantity'), t('unitRate') + ' (RON)', t('total') + ' (RON)'],
    ...bom.rows.map((r) => [r.name, t(r.color), r.quantity, r.rate.toFixed(2), r.total.toFixed(2)]),
    [t('total'), '', '', '', bom.total.toFixed(2)],
    [],
    [t('note')],
    [t('shape'), ['custom', 'regions'].includes(state.shape) ? areaText().freeform : t(state.shape)],
    [t('netArea'), bom.area, 'm²'],
    ['Measurement status', viewer?.getModelCalibration() ? 'model-estimated scale; not physically verified' : 'design dimensions'],
    [t('grossArea'), bom.grossArea, 'm²'],
    [t('houseArea'), bom.houseArea, 'm²'],
    ...(state.houseEnabled
      ? [
          [
            t('houseShape'),
            t(
              state.houseShape === 'imported'
                ? 'imported'
                : state.houseShape === 'l'
                  ? 'lShape'
                  : 'rectangle',
            ),
          ],
          [t('houseLength'), state.houseLength, 'm'],
          [t('houseWidth'), state.houseWidth, 'm'],
          [t('houseWingWidth'), state.houseWingWidth, 'm'],
          [t('houseWingDepth'), state.houseWingDepth, 'm'],
          [t('houseX'), state.houseX, 'm'],
          [t('houseZ'), state.houseZ, 'm'],
          [t('rotation'), state.houseRotation, '°'],
        ]
      : []),
    [t('perimeter'), bom.perimeter, 'm'],
    ...(state.shape === 'regions' ? areaGeometry(state).boundaries.flatMap((b) => [
      [boundaryName(b), b.lengths.reduce((n, l) => n + l, 0), 'm', b.enabled ? 'curb' : ''],
      ...b.points.map((p, i) => [`${boundaryName(b)} / ${i + 1}`, p.x, p.z, 'm', b.edges[i] ? 'curb' : '']),
    ]) : areaGeometry(state).lengths.map((length, i) => [
      vertexLabel(i) + vertexLabel((i + 1) % state.edges.length),
      length,
      'm',
      state.edges[i] ? 'curb' : '',
    ])),
    ...(['closed4', 'closed5'].includes(state.shape) ? [[t('angleB'), state.angleB, '°']] : []),
    ...(state.shape === 'custom' && state.areaPoints
      ? state.areaPoints.map((p, i) => [`Area vertex ${vertexLabel(i)}`, p.x, p.z, 'm'])
      : []),
    ...(state.houseShape === 'imported' && state.houseFootprint
      ? [
          [t('imported'), 'OpenStreetMap', state.houseLocation?.label || ''],
          ...state.houseFootprint.map((p, i) => ['House vertex ' + (i + 1), p.x, p.z, 'm']),
        ]
      : []),
    [t('pattern'), t(state.pattern)],
    [t('rotation'), state.rotation],
    [t('waste'), state.waste, '%'],
  ];
  const csv =
    '\ufeff' +
    rows
      .map((r) => r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','))
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pavement-bom.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
mountLocationPicker({
  getState: () => state,
  t: (key) => t(key),
  onImport({ footprint, location }) {
    const l = Math.max(...footprint.map((p) => p.x)),
      w = Math.max(...footprint.map((p) => p.z));
    const length = Math.min(20, l + 2),
      width = Math.min(20, w + 2);
    change({
      houseFootprint: footprint,
      houseLocation: location,
      houseShape: 'imported',
      houseEnabled: true,
      houseRotation: 0,
      houseX: (length - l) / 2,
      houseZ: (width - w) / 2,
      shape: 'rectangle',
      areaPoints: null,
      length,
      width,
    });
  },
});
render();
const ar = createTilesARController({
  getState() {
    if (drawingArea) { const e=new Error('area-in-progress');e.code='area-in-progress';throw e; }
    return api.captureState();
  },
  getLocale: () => shell?.state?.locale || locale,
  onFeedback: (...args) => shell?.showFeedback(...args),
});
const mobile = matchMedia('(max-width:760px)');
shell = mountStandaloneConfiguratorShell({
  productType: 'Tiles',
  productId: 'tiles',
  storagePrefix: '360-configurator:tiles',
  brandSrc: tenant?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenant?.companyName || '360 Configurator',
  capabilities: { viewAR: true, save: true, undo: true, reset: true, share: true },
  tools: { items: resolveSharedTools([{ id: 'dimensions', active: true }, 'camera']) },
  configuratorPanel: {
    panelSelector: '.sidebar',
    getEstimatedTotal: () => ({ value: estimate(state).total, currency: 'RON', locale }),
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#tilesSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'tiles-sidebar-collapsed',
    initiallyCollapsed: mobile.matches,
  },
  callbacks: {
    onViewAR() { ar.open(); },
    onUndo() {
      if (drawingArea) {
        viewer?.undoAreaPoint();
        return;
      }
      undoPavingEdit();
    },
    resetConfiguration: api.resetConfiguration,
    captureState: api.captureSavedState,
    restoreState: restore,
    getShareUrl() {
      const message = locale.startsWith('ro')
        ? 'Acest link distribuie numai pavajul și golurile, fără fotografie sau cameră. Pentru proiectul complet folosește Proiect → Descarcă. Continui?'
        : locale.startsWith('de') ? 'Dieser Link teilt nur Pflaster und Aussparungen, ohne Foto oder Kamera. Für das vollständige Projekt die Projektdatei herunterladen. Fortfahren?'
        : 'This link shares only the edited pavement and holes, not the photo or camera. Use Project → Download full project to share everything. Continue?';
      if (!window.confirm(message)) throw new Error('Sharing cancelled.');
      if (drawingArea) throw new Error('Finish or cancel the current outline before sharing.');
      return createShareUrl({ productType: 'tiles', state: geometryShareState(state) });
    },
    onPreferenceChange(path, value) {
      if (path === 'locale') { setLocale(value); ar.refresh(); }
      if (path === 'darkMode') setDarkMode(Boolean(value));
    },
    onSettingsPanelToggle(collapsed) {
      const panel = document.querySelector('.sidebar');
      panel.inert = collapsed;
      panel.setAttribute('aria-hidden', String(collapsed));
    },
  },
});
shell.setSettingsPanelCollapsed(mobile.matches);
mobile.addEventListener('change', (event) => shell.setSettingsPanelCollapsed(event.matches));
window.TILES_CONFIGURATOR_SHARED_SHELL = shell;
setLocale(shell.state.locale);
setDarkMode(Boolean(shell.state.darkMode));
shell.host.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'cycle-camera') cycleCamera();
  if (action === 'toggle-dimensions') shell.setToolActive('dimensions', viewer?.toggleDimensions());
});
try {
  const { createViewer } = await import('./viewer.js?v=tiles-ar-1');
  viewer = createViewer($('canvasHost'), {
    onHouseDragStart: () => history.record(),
    onHouseMove: (patch) => change(patch, false),
    onAreaDraftChange(points) {
      if (JSON.stringify(points) !== JSON.stringify(draftAreaPoints)) designRevision++;
      draftAreaPoints = points;
      if (drawingArea) renderAreaEditor();
      if (photoFlowStep === 'draw') renderPhotoFlow();
    },
    onAreaFinishRequested: finishAreaDrawing,
    onAreaPointMove: commitAreaPointMove,
    onAreaVertexSelect(index) {
      activeVertex = index;
      // Do not rebuild handles while a pointer owns one of them.
      $('boundaryVertex').value = index + 1;
    },
    onPhotoRectChange(rect) {
      photoRectCache = rect;
      updateCalibrationOverlay();
      modelImportUI?.update();
    },
  });
  viewer.setDarkMode(Boolean(shell.state.darkMode));
  photoRectCache = viewer.getPhotoRect();
  wirePhotoFlow();
  render();
} catch (error) {
  console.error('Pavement preview failed', error);
  $('viewerError').hidden = false;
}
