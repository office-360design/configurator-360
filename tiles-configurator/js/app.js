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
const tenant = await requireTenantConfiguratorAccess('tiles');
let state = normalize(),
  locale = 'en-US',
  t = translator(locale),
  viewer,
  shell,
  top = false,
  drawingArea = false,
  draftAreaPoints = [];
const money = (n) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'RON' }).format(n);
const f = (n) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
const history = new SharedUndoManager({
  capture: () => structuredClone(state),
  restore: (s) => restore(s),
});
const AREA_EDITOR_COPY = {
  en: {
    draw: 'Draw area in 3D',
    redraw: 'Redraw area in 3D',
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
    redraw: 'Redesenează suprafața în 3D',
    undo: 'Anulează punctul',
    finish: 'Finalizează suprafața',
    cancel: 'Anulează',
    help: 'Creează orice contur direct în scena 3D. Rotirea și zoom-ul camerei rămân disponibile, iar fiecare colț poate fi mutat prin tragere în orice moment.',
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

function finishAreaDrawing() {
  if (!drawingArea || draftAreaPoints.length < 3) return false;
  const next = prepareCustomArea(draftAreaPoints, { sceneCoordinates: true, resetEdges: true });
  if (!next) {
    showAreaError();
    renderAreaEditor();
    return false;
  }
  history.record();
  state = next;
  drawingArea = false;
  draftAreaPoints = [];
  viewer?.stopAreaDrawing();
  $('areaError').hidden = true;
  render();
  shell?.markDirty();
  return true;
}

function commitAreaPointMove(points) {
  const next = prepareCustomArea(points);
  if (!next) {
    render();
    showAreaError();
    return false;
  }
  history.record();
  state = next;
  $('areaError').hidden = true;
  render();
  shell?.markDirty();
  return true;
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
      `${f(state[key])} ${['angleB', 'houseRotation'].includes(key) ? '°' : 'm'}`;
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
}

function setDarkMode(value) {
  document.body.classList.toggle('dark', value);
  document.body.classList.toggle('shared-ui-dark-mode', value);
  viewer?.setDarkMode(value);
}

function cycleCamera() {
  top = viewer?.cycleCamera() || false;
  $('cameraButton').textContent = t(top ? 'perspective' : 'top');
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
    `${f(Number(e.target.value))} ${['angleB', 'houseRotation'].includes(key) ? '°' : 'm'}`;
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
    },
    onAreaFinishRequested: finishAreaDrawing,
    onAreaPointMove: commitAreaPointMove,
  });
  viewer.setDarkMode(Boolean(shell.state.darkMode));
  render();
} catch (error) {
  console.error('Pavement preview failed', error);
  $('viewerError').hidden = false;
}
