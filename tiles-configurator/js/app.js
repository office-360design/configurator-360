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

const $ = (id) => document.getElementById(id);
installAreaEditor();
installPhotoFlowShell();
const tenant = await requireTenantConfiguratorAccess('tiles');
let state = normalize(),
  locale = 'en-US',
  t = translator(locale),
  viewer,
  shell,
  top = false,
  drawingArea = false,
  draftAreaPoints = [],
  photoFlowStep = 'upload',
  photoObjectUrl = null,
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
const history = new SharedUndoManager({
  capture: () => structuredClone(state),
  restore: (s) => restore(s),
});

const PHOTO_FLOW_COPY = {
  en: {
    stepUpload: '1 · Add a site photo',
    uploadTitle: 'Start with a photo of your yard',
    uploadHelp: 'Use a clear photo that shows the ground where the pavement will go. The photo stays local to this browser session.',
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
    uploadHelp: 'Folosește o fotografie clară în care se vede zona ce va fi pavată. Fotografia rămâne doar în această sesiune din browser.',
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
    uploadHelp: 'Ein klares Foto verwenden, auf dem die zu pflasternde Bodenfläche sichtbar ist. Das Foto bleibt nur in dieser Browser-Sitzung.',
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
    draw: 'Draw area in 3D',
    redraw : 'Redraw area in 3D',
    undo: 'Undo point',
    finish: 'Finish area',
    cancel: 'Cancel',
    help: 'Create any outline directly in the 3D scene. Camera orbit/zoom stays available, and every placed corner can be dragged at any time.',
    drawing: 'Click or tap the ground to add corners. Drag empty space to orbit the camera, use the normal zoom/pan controls, and drag any corner to reposition it. Click the green first corner to close the outline, or use Finish. Use Undo point to remove the last corner.',
    freeform: 'Freeform outline',
    status: (count) => `${count} ${count === 1 ? 'corner' : 'corners'} placed · maximum 64`,
    saved: (count) => `${count} ${count === 1 ? 'corner' : 'corners'} · drag blue handles in the 3D view to edit`,
    current: (count) => `${count} corners in the current area · use Draw area in 3D to replace it`,
    invalid: 'The outline must have at least 3 corners, be at least 1 m², stay within 20 × 20 m, and must not cross itself or contain collapsed/sharp corners.',
  },
  ro: {
    draw: 'Desenează suprafața în 3D',
    redraw : 'Redesenează suprafați în 3D',
    undo: 'Anulează punctul',
    finish: 'Finalizează suprafaŢa',
    cancel: 'Anulează',
    help: 'Creează orice contur direct în scena 3D. Rotirea și zoom-ul camerei rămân disponibil, iar fiecare colț poate fi mutat prin tragere în orice moment.',
    drawing: 'Apasă pe sol pentru a adăuga colțuri. Trage pe spațiul liber pentru a roti camera, folosește comenzile normale de zoom/deplasare și trage orice colț pentru a-l muta. Apasă pe primul colț verde pentru închidere sau folosește Finalizează. Folosește Anulează punctul pentru a șterge ultimul colț.',
    freeform: 'Contur liber',
    status: (count) => `${count} ${count === 1 ? 'colț' : 'colțuri'} adăugate · maximum 64`,
    saved: (count) => `${count} ${count === 1 ? 'colț' : 'colțuri'} · trage punctele albastre din scena 3D pentru editare`,
    current: (count) => `${count} colțuri în suprafața actuală · folosește Desenează suprafața în 3D pentru a o înlocui`,
    invalid: 'Conturul trebuie să aibă cel puțin 3 colțuri, minimum 1 m², să încapă în 20 × 20 m și să nu se intersecteze sau să aibă colțuri colapsate/prea ascuțite.',
  },
  de: {
    draw: 'Fläche in 3D zeichnen',
    redraw: 'Fläche in 3D neu zeichnen',
    undo: 'Punkt zurück',
    finish: 'Fläche fertigstellen',
    cancel: 'Abbrechen',
    help: 'Beliebige Kontur direkt in der 3D-Szene erstellen. Kamera drehen/zoomen bleibt verfügbar und jeder gesetzte Eckpunkt kann jederzeit gezogen werden.',
    drawing: 'Auf den Boden klicken oder tippen, um Ecken hinzuzufügen. Freien Raum ziehen, um die Kamera zu drehen, die normalen Zoom-/Pan-Steuerungen verwenden und jeden Eckpunkt ziehen, um ihn zu verschieben. Den ersten grünen Punkt anklicken oder Fertigstellen wählen. Mit Punkt zurück wird der letzte Eckpunkt entfernt.',
    freeform: 'Freie Kontur',
    status: (count) => `${count} ${count === 1 ? 'Ecke' : 'Ecken'} gesetzt · maximal 64`,
    saved: (count) => `${count} ${count === 1 ? 'Ecke' : 'Ecken'} · blaue Punkte in 3D ziehen, um die Kontur zu bearbeiten`,
    current: (count) => `${count} Ecken in der aktuellen Fläche · mit Fläche in 3D zeichnen ersetzen`,
    invalid: 'Die Kontur braucht mindestens 3 Ecken und 1 m², muss innerhalb 20 × 20 m bleiben und darf sich nicht kreuzen oder eingeklappte/sehr spitze Ecken enthalten.',
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
      <button id="undoAreaPoint" class="area-secondary" type="button" hidden></button>
      <button id="finishArea" class="export" type="button" hidden></button>
      <button id="cancelArea" class="area-secondary" type="button" hidden></button>
    </div>
    <p id="areaDrawStatus" class="note" role="status" aria-live="polite"></p>
    <svg id="areaPlan" viewBox="0 0 300 170" role="img" aria-label="Area outline"></svg>`;
  const style = document.createElement('style');
  style.textContent = `
    .area-draw-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
    .area-draw-actions #drawArea{grid-column:1/-1}
    .area-draw-actions .export,.area-draw-actions .area-secondary{width:100%;min-height:40px}
    .area-secondary{padding:10px;border:1px solid #bccbd5;border-radius:8px;background:#fff;color:inherit;font-weight:650}
    body.dark .area-secondary{background:#35424a;border-color:#52626c;color:#e4ebef}
    #areaDrawStatus{min-height:1.6em;margin:7px 0}
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

function planGeometry(points) {
  const minX = Math.min(...points.map((p) => p.x)),
    minZ = Math.min(...points.map((p) => p.z)),
    shifted = points.map((p) => ({ x: p.x - minX, z: p.z - minZ })),
    width = Math.max(...shifted.map((p) => p.x), 0),
    depth = Math.max(...shifted.map((p) => p.z), 0);
  return { points: shifted, width, depth };
}

function renderAreaPlan(geometry) {
  if (drawingArea && !draftAreaPoints.length) {
    $('areaPlan').setAttribute('aria-label', areaText().freeform);
    $('areaPlan').innerHTML = '';
    return;
  }
  const draft = drawingArea ? planGeometry(draftAreaPoints) : null,
    plan = draft || geometry,
    width = Math.max(plan.width, 1),
    depth = Math.max(plan.depth, 1),
    scale = Math.min(230 / width, 110 / depth),
    ox = (300 - plan.width * scale) / 2,
    oz = (170 - plan.depth * scale) / 2,
    points = plan.points,
    pointString = points.map((p) => `${ox + p.x * scale},${oz + p.z * scale}`).join(' ');
  $('areaPlan').setAttribute('aria-label', areaText().freeform);
  if (points.length === 1)
    $('areaPlan').innerHTML = `<circle cx="${ox}" cy="${oz}" r="5" fill="#0878c9"/>`;
  else if (points.length > 1)
    $('areaPlan').innerHTML =
      `<${points.length >= 3 ? 'polygon' : 'polyline'} points="${pointString}" fill="${points.length >= 3 ? '#e9f5fd' : 'none'}" stroke="#0878c9" stroke-width="2"/>`;
  else $('areaPlan').innerHTML = '';
  $('areaPlan').innerHTML += points
    .map(
      (p, i) =>
        `<text x="${ox + p.x * scale}" y="${oz + p.z * scale - 9}" text-anchor="middle">${vertexLabel(i)}</text>`,
    )
    .join('');
  if (!draft && state.houseEnabled)
    $('areaPlan').innerHTML += `<polygon points="${houseGeometry(state)
      .outline.map((p) => `${ox + p.x * scale},${oz + p.z * scale}`)
      .join(' ')}" fill="#69747b" fill-opacity=".8" stroke="#3f4b53" stroke-width="1.5"/>`;
}

function renderAreaEditor(geometry = areaGeometry(state)) {
  const copy = areaText(),
    count = drawingArea ? draftAreaPoints.length : geometry.points.length;
  $('drawArea').hidden = drawingArea;
  $('drawArea').disabled = !viewer;
  $('drawArea').textContent = state.shape === 'custom' ? copy.redraw : copy.draw;
  for (const id of ['undoAreaPoint', 'finishArea', 'cancelArea']) $(id).hidden = !drawingArea;
  $('undoAreaPoint').textContent = copy.undo;
  $('finishArea').textContent = copy.finish;
  $('cancelArea').textContent = copy.cancel;
  $('undoAreaPoint').disabled = !draftAreaPoints.length;
  $('finishArea').disabled = draftAreaPoints.length < 3;
  $('areaDrawHelp').textContent = drawingArea ? copy.drawing : copy.help;
  $('areaDrawStatus').textContent = drawingArea
    ? copy.status(count)
    : state.shape === 'custom'
      ? copy.saved(count)
      : copy.current(count);
  document.querySelectorAll('[data-edge]').forEach((el) => (el.disabled = drawingArea));
  document.body.classList.toggle('tiles-area-drawing', drawingArea);
  renderAreaPlan(geometry);
}

function showAreaError(message = areaText().invalid) {
  $('areaError').textContent = message;
  $('areaError').hidden = false;
}

function prepareCustomArea(rawPoints, { sceneCoordinates = false, resetEdges = false } = {}) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 3) return null;
  const minX = Math.min(...rawPoints.map((p) => Number(p.x))),
    minZ = Math.min(...rawPoints.map((p) => Number(p.z))),
    points = normalizeFootprint(rawPoints);
  if (!points || !Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  const current = areaGeometry(state),
    patch = {
      shape: 'custom',
      areaPoints: points,
      edges: resetEdges
        ? Array(points.length).fill(true)
        : Array.from({ length: points.length }, (_, i) => state.edges[i] ?? true),
      houseX: sceneCoordinates ? state.houseX - current.width / 2 - minX : state.houseX - minX,
      houseZ: sceneCoordinates ? state.houseZ - current.depth / 2 - minZ : state.houseZ - minZ,
    },
    next = normalize({ ...state, ...patch });
  try {
    areaGeometry(next);
    return next;
  } catch {
    return null;
  }
}

function startAreaDrawing() {
  if (!viewer) return;
  drawingArea = true;
  draftAreaPoints = [];
  $('areaError').hidden = true;
  viewer.startAreaDrawing();
  renderAreaEditor();
}

function stopAreaDrawing() {
  drawingArea = false;
  draftAreaPoints = [];
  viewer?.stopAreaDrawing();
  renderAreaEditor();
}

function pointsCenter(points) {
  if (!Array.isArray(points) || !points.length) return { x: 0, z: 0 };
  const xs = points.map((point) => Number(point.x)),
    zs = points.map((point) => Number(point.z));
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

function finishAreaDrawing() {
  if (!drawingArea || draftAreaPoints.length < 3) return false;
  const rawPoints = draftAreaPoints.map((point) => ({ ...point })),
    next = prepareCustomArea(rawPoints, { sceneCoordinates: true, resetEdges: true });
  if (!next) {
    showAreaError();
    renderAreaEditor();
    if (photoFlowStep === 'draw') showPhotoFlowError(areaText().invalid);
    return false;
  }
  const center = pointsCenter(rawPoints),
    completingInitialPhotoFlow = photoFlowStep === 'draw';
  if (viewer?.hasPhotoCalibration?.()) viewer.shiftPhotoWorld(-center.x, -center.z);
  history.record();
  state = next;
  drawingArea = false;
  draftAreaPoints = [];
  viewer?.stopAreaDrawing({ preserveCamera: true });
  $('areaError').hidden = true;
  render();
  if (completingInitialPhotoFlow) completePhotoFlow();
  shell?.markDirty();
  return true;
}

function commitAreaPointMove(points) {
  const current = areaGeometry(state),
    rawCenter = pointsCenter(points),
    next = prepareCustomArea(points);
  if (!next) {
    render();
    showAreaError();
    return false;
  }
  if (viewer?.hasPhotoCalibration?.())
    viewer.shiftPhotoWorld(current.width / 2 - rawCenter.x, current.depth / 2 - rawCenter.z);
  history.record();
  state = next;
  $('areaError').hidden = true;
  render();
  shell?.markDirty();
  return true;
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
  $('photoUndoPoint').textContent = copy.undo;
  $('photoFinishArea').textContent = copy.finish;
  $('photoChangeDrawing').textContent = copy.changePhoto;
  $('photoUndoPoint').disabled = !draftAreaPoints.length;
  $('photoFinishArea').disabled = draftAreaPoints.length < 3;
  updateCalibrationOverlay();
  renderPhotoViewControls();
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
  if (drawingArea) {
    drawingArea = false;
    draftAreaPoints = [];
    viewer.stopAreaDrawing();
  }
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = objectUrl ? source : null;
  showPhotoFlowError('');
  try {
    await viewer.loadSitePhoto(source);
    resetCalibrationCorners();
    photoRectCache = viewer.getPhotoRect();
    photoFlowStep = 'calibrate';
    document.body.classList.add('tiles-photo-setup');
    renderPhotoFlow();
    return true;
  } catch {
    if (objectUrl && photoObjectUrl === source) {
      URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = null;
    }
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

function beginPhotoAreaDrawing() {
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

function render() {
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
  $('edgeChoices').innerHTML = geometry.points
    .map(
      (_, i) =>
        `<label><input type="checkbox" data-edge="${i}" ${state.edges[i] ? 'checked' : ''}><span>${custom ? vertexLabel(i) + vertexLabel((i + 1) % geometry.points.length) : t(['front', 'right', 'back', 'left'][i])}</span></label>`,
    )
    .join('');
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
  const parts = layout(state),
    bom = estimate(state, parts);
  viewer?.rebuild(state, parts);
  $('areaBadge').textContent =
    `${f(bom.area)} m² · ${custom ? `${t('perimeter')}: ${f(bom.perimeter)} m` : `${f(state.length)} × ${f(state.width)} m`}`;
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

function restore(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    snapshot.version !== 1
  )
    return false;
  try {
    const next = normalize(snapshot);
    areaGeometry(next);
    if (drawingArea) {
      drawingArea = false;
      draftAreaPoints = [];
      viewer?.stopAreaDrawing();
    }
    state = next;
    render();
    $('areaError').hidden = true;
    return true;
  } catch {
    return false;
  }
}

function change(patch, record = true) {
  let prepared = patch;
  if (Object.hasOwn(patch, 'areaPoints') && (patch.shape === 'custom' || state.shape === 'custom')) {
    const points = normalizeFootprint(patch.areaPoints);
    if (!points) {
      render();
      showAreaError();
      return false;
    }
    prepared = { ...patch, shape: 'custom', areaPoints: points };
  }
  const next = normalize({ ...state, ...prepared });
  try {
    areaGeometry(next);
  } catch {
    render();
    showAreaError(next.shape === 'custom' ? areaText().invalid : t('invalidArea'));
    return false;
  }
  if (record) history.record();
  state = next;
  $('areaError').hidden = true;
  render();
  shell?.markDirty();
  return true;
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
  restoreState: restore,
  resetConfiguration() {
    history.record();
    if (drawingArea) {
      drawingArea = false;
      draftAreaPoints = [];
      viewer?.stopAreaDrawing();
    }
    state = normalize(DEFAULTS);
    render();
    shell?.markDirty();
    return true;
  },
  setLocale,
  setDarkMode,
  cycleCamera,
  getEstimate: () => estimate(state),
};
window.TILES_CONFIGURATOR_API = api;
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
$('drawArea').addEventListener('click', startAreaDrawing);
$('undoAreaPoint').addEventListener('click', () => viewer?.undoAreaPoint());
$('finishArea').addEventListener('click', finishAreaDrawing);
$('cancelArea').addEventListener('click', stopAreaDrawing);
document.querySelector('.sidebar').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.rangeField) {
    flushSlider();
    return;
  }
  if (el.dataset.edge !== undefined) {
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
    [t('shape'), state.shape === 'custom' ? areaText().freeform : t(state.shape)],
    [t('netArea'), bom.area, 'm²'],
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
    ...areaGeometry(state).lengths.map((length, i) => [
      vertexLabel(i) + vertexLabel((i + 1) % state.edges.length),
      length,
      'm',
      state.edges[i] ? 'curb' : '',
    ]),
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
const mobile = matchMedia('(max-width:760px)');
shell = mountStandaloneConfiguratorShell({
  productType: 'Tiles',
  productId: 'tiles',
  storagePrefix: '360-configurator:tiles',
  brandSrc: tenant?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenant?.companyName || '360 Configurator',
  capabilities: { viewAR: false, save: true, undo: true, reset: true, share: true },
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
    onUndo() {
      if (drawingArea) {
        viewer?.undoAreaPoint();
        return;
      }
      history.undo();
    },
    resetConfiguration: api.resetConfiguration,
    captureState: api.captureState,
    restoreState: restore,
    getShareUrl() {
      return createShareUrl({ productType: 'tiles', state: api.captureState() });
    },
    onPreferenceChange(path, value) {
      if (path === 'locale') setLocale(value);
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
  const { createViewer } = await import('./viewer.js');
  viewer = createViewer($('canvasHost'), {
    onHouseDragStart: () => history.record(),
    onHouseMove: (patch) => change(patch, false),
    onAreaDraftChange(points) {
      draftAreaPoints = points;
      if (drawingArea) renderAreaEditor();
      if (photoFlowStep === 'draw') renderPhotoFlow();
    },
    onAreaFinishRequested: finishAreaDrawing,
    onAreaPointMove: commitAreaPointMove,
    onPhotoRectChange(rect) {
      photoRectCache = rect;
      updateCalibrationOverlay();
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
