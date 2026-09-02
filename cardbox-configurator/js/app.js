import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_COLOR = '#c78f5a';
const BOARD_EUR_M2 = 1.55;
const CURRENCY_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const LID_LIFT_MM = 1000;
const SURFACE_TEXT_OFFSET_MM = 1.5;
const EPSILON = 1e-6;

const TEXT = Object.freeze({
  'en-US': Object.freeze({
    'intro.eyebrow': 'Packaging geometry',
    'intro.title': 'Cardboard box settings',
    'intro.copy': 'Start from a rectangular box, then build custom shapes by attaching additional box volumes to exposed faces.',
    'section.geometry': 'Base box',
    'section.summary': 'Summary & pricing',
    'dimension.width': 'Base width', 'dimension.depth': 'Base depth', 'dimension.height': 'Base height', 'dimension.floor': 'Board thickness',
    'geometry.helpTitle': 'Build the shape directly in 3D',
    'geometry.helpCopy': 'Double-click any exposed vertical face to select it. Use the plus button to attach another box volume. Joined areas become one continuous cavity with no internal wall.',
    'face.addText': 'Add text',
    'piece.title': 'New box piece', 'piece.help': 'Attached and centered on the selected face.', 'piece.width': 'Width', 'piece.height': 'Height', 'piece.depth': 'Depth',
    'text.title': 'Add text', 'text.help': 'Style the text, then place it on any inner or outer surface.', 'text.content': 'Text', 'text.size': 'Size', 'text.font': 'Font', 'text.color': 'Text', 'text.background': 'Background',
    'text.lockHorizontal': 'Lock to horizontal center line', 'text.lockVertical': 'Lock to vertical center line', 'text.edit': 'Edit text', 'text.delete': 'Delete text', 'text.deselect': 'Deselect text', 'text.underlineStyle': 'Underline style', 'text.lineSolid': 'Solid', 'text.lineDashed': 'Dashed', 'text.lineDotted': 'Dotted', 'text.lineDouble': 'Double', 'text.done': 'Done', 'text.cancel': 'Cancel text placement', 'text.transparentBackground': 'Transparent background',
    'common.back': 'Back', 'common.done': 'Done', 'common.cancel': 'Cancel',
    'viewer.hint': 'Double-click a vertical face to select it.',
    'viewer.hint.placement': 'Text placement mode: move over any surface and click to place. The top surfaces are lifted by 1 metre.',
    'summary.pieces': 'Box pieces', 'summary.faces': 'Exterior faces', 'summary.boardArea': 'Board area', 'summary.volume': 'Internal volume', 'summary.total': 'Estimated total',
    'summary.note': 'Indicative material and personalization estimate for one configured box.', 'summary.material': 'Cardboard', 'summary.text': 'Text finishing', 'summary.setup': 'Production setup',
    'error.invalidPiece': 'The new piece must have positive width, height and depth.',
  }),
  'ro-RO': Object.freeze({
    'intro.eyebrow': 'Geometrie ambalaj',
    'intro.title': 'Setări cutie din carton',
    'intro.copy': 'Pornește de la o cutie dreptunghiulară, apoi construiește forme personalizate atașând corpuri suplimentare pe fețele expuse.',
    'section.geometry': 'Cutia de bază', 'section.summary': 'Sumar și preț',
    'dimension.width': 'Lățime bază', 'dimension.depth': 'Adâncime bază', 'dimension.height': 'Înălțime bază', 'dimension.floor': 'Grosime carton',
    'geometry.helpTitle': 'Construiește forma direct în 3D',
    'geometry.helpCopy': 'Dublu-click pe orice față verticală expusă pentru selectare. Folosește butonul plus pentru a atașa un alt corp. Zonele unite devin o singură cavitate continuă, fără perete interior.',
    'face.addText': 'Adaugă text',
    'piece.title': 'Corp nou de cutie', 'piece.help': 'Atașat și centrat pe fața selectată.', 'piece.width': 'Lățime', 'piece.height': 'Înălțime', 'piece.depth': 'Adâncime',
    'text.title': 'Adaugă text', 'text.help': 'Stabilește stilul textului, apoi plasează-l pe orice suprafață interioară sau exterioară.', 'text.content': 'Text', 'text.size': 'Mărime', 'text.font': 'Font', 'text.color': 'Text', 'text.background': 'Fundal',
    'text.lockHorizontal': 'Blochează pe linia orizontală centrală', 'text.lockVertical': 'Blochează pe linia verticală centrală', 'text.edit': 'Editează textul', 'text.delete': 'Șterge textul', 'text.deselect': 'Deselectează textul', 'text.underlineStyle': 'Stil subliniere', 'text.lineSolid': 'Continuu', 'text.lineDashed': 'Întrerupt', 'text.lineDotted': 'Punctat', 'text.lineDouble': 'Dublu', 'text.done': 'Gata', 'text.cancel': 'Anulează plasarea textului', 'text.transparentBackground': 'Fundal transparent',
    'common.back': 'Înapoi', 'common.done': 'Gata', 'common.cancel': 'Anulează',
    'viewer.hint': 'Dublu-click pe o față verticală pentru a o selecta.',
    'viewer.hint.placement': 'Mod plasare text: mută cursorul pe orice suprafață și apasă click. Suprafețele superioare sunt ridicate cu 1 metru.',
    'summary.pieces': 'Corpuri cutie', 'summary.faces': 'Fețe exterioare', 'summary.boardArea': 'Suprafață carton', 'summary.volume': 'Volum interior', 'summary.total': 'Total estimat',
    'summary.note': 'Estimare orientativă de material și personalizare pentru o cutie configurată.', 'summary.material': 'Carton', 'summary.text': 'Finisaj text', 'summary.setup': 'Pregătire producție',
    'error.invalidPiece': 'Noul corp trebuie să aibă lățime, înălțime și adâncime pozitive.',
  }),
  'de-DE': Object.freeze({
    'intro.eyebrow': 'Verpackungsgeometrie',
    'intro.title': 'Kartonbox-Einstellungen',
    'intro.copy': 'Beginnen Sie mit einer rechteckigen Box und bauen Sie individuelle Formen, indem Sie zusätzliche Box-Volumen an freiliegende Flächen anfügen.',
    'section.geometry': 'Basisbox', 'section.summary': 'Übersicht & Preis',
    'dimension.width': 'Basisbreite', 'dimension.depth': 'Basistiefe', 'dimension.height': 'Basishöhe', 'dimension.floor': 'Kartonstärke',
    'geometry.helpTitle': 'Form direkt in 3D aufbauen',
    'geometry.helpCopy': 'Doppelklicken Sie auf eine freiliegende vertikale Fläche. Mit der Plus-Schaltfläche fügen Sie ein weiteres Box-Volumen hinzu. Verbundene Bereiche bilden einen durchgehenden Hohlraum ohne Innenwand.',
    'face.addText': 'Text hinzufügen',
    'piece.title': 'Neues Box-Element', 'piece.help': 'An der ausgewählten Fläche befestigt und zentriert.', 'piece.width': 'Breite', 'piece.height': 'Höhe', 'piece.depth': 'Tiefe',
    'text.title': 'Text hinzufügen', 'text.help': 'Definieren Sie den Textstil und platzieren Sie ihn anschließend auf jeder inneren oder äußeren Oberfläche.', 'text.content': 'Text', 'text.size': 'Größe', 'text.font': 'Schriftart', 'text.color': 'Text', 'text.background': 'Hintergrund',
    'text.lockHorizontal': 'Auf horizontaler Mittellinie fixieren', 'text.lockVertical': 'Auf vertikaler Mittellinie fixieren', 'text.edit': 'Text bearbeiten', 'text.delete': 'Text löschen', 'text.deselect': 'Text abwählen', 'text.underlineStyle': 'Unterstreichungsstil', 'text.lineSolid': 'Durchgezogen', 'text.lineDashed': 'Gestrichelt', 'text.lineDotted': 'Gepunktet', 'text.lineDouble': 'Doppelt', 'text.done': 'Fertig', 'text.cancel': 'Textplatzierung abbrechen', 'text.transparentBackground': 'Transparenter Hintergrund',
    'common.back': 'Zurück', 'common.done': 'Fertig', 'common.cancel': 'Abbrechen',
    'viewer.hint': 'Doppelklicken Sie auf eine vertikale Fläche, um sie auszuwählen.',
    'viewer.hint.placement': 'Textplatzierungsmodus: Bewegen Sie den Cursor über eine Oberfläche und klicken Sie. Die oberen Flächen werden um 1 Meter angehoben.',
    'summary.pieces': 'Box-Elemente', 'summary.faces': 'Außenflächen', 'summary.boardArea': 'Kartonfläche', 'summary.volume': 'Innenvolumen', 'summary.total': 'Geschätzter Gesamtpreis',
    'summary.note': 'Unverbindliche Material- und Personalisierungsschätzung für eine konfigurierte Box.', 'summary.material': 'Karton', 'summary.text': 'Textveredelung', 'summary.setup': 'Produktionsvorbereitung',
    'error.invalidPiece': 'Das neue Element benötigt positive Werte für Breite, Höhe und Tiefe.',
  }),
});

const $ = (selector) => document.querySelector(selector);
const canvasHost = $('#canvasHost');
const dimensionLayer = $('#dimensionLayer');
const textGuideLayer = $('#textGuideLayer');
const textSelectionHud = $('#textSelectionHud');
const textHorizontalLockButton = $('#textHorizontalLockButton');
const textVerticalLockButton = $('#textVerticalLockButton');
const textEditButton = $('#textEditButton');
const textDeleteButton = $('#textDeleteButton');
const textDismissButton = $('#textDismissButton');
const faceActionPopup = $('#faceActionPopup');
const faceDismissButton = $('#faceDismissButton');
const textEditorPanel = $('#textEditorPanel');
const addBoxEditor = $('#addBoxEditor');
const cancelTextPlacementButton = $('#cancelTextPlacementButton');
const viewerHint = $('#viewerHint');
const widthInput = $('#widthInput');
const depthInput = $('#depthInput');
const heightInput = $('#heightInput');
const floorThicknessInput = $('#floorThicknessInput');
const pieceWidthInput = $('#pieceWidthInput');
const pieceHeightInput = $('#pieceHeightInput');
const pieceDepthInput = $('#pieceDepthInput');
const pieceError = $('#pieceError');
const textContentInput = $('#textContentInput');
const textSizeInput = $('#textSizeInput');
const textFontSelect = $('#textFontSelect');
const textColorPalette = $('#textColorPalette');
const textBackgroundPalette = $('#textBackgroundPalette');
const textBoldToggle = $('#textBoldToggle');
const textItalicToggle = $('#textItalicToggle');
const textUnderlineToggle = $('#textUnderlineToggle');
const textUnderlineStyle = $('#textUnderlineStyle');
const summaryTotal = $('#summaryTotal');

let locale = localeForHost();
let units = locale === 'en-US' ? 'imperial' : 'metric';
let currency = locale === 'ro-RO' ? 'RON' : locale === 'de-DE' ? 'EUR' : 'USD';
let dimensionsVisible = true;
let technicalEdgesVisible = true;
let cameraMode = 0;
let resizeObserver;
let surfaceMeshes = [];
let surfaceDescriptors = [];
let selectedFaceKey = '';
let selectedFaceSnapshot = null;
let selectedFaceSideFactor = 1;
let addMode = false;
let draftBox = null;
let draftBeforeState = null;
let placementMode = false;
let pendingTextSpec = null;
let previewTextMesh = null;
let previewPlacement = null;
let editorPreviewSpec = null;
let currentTextColor = '#1f2d36';
let currentBackgroundColor = 'transparent';
let dimensionAnchors = [];
let selectedTextId = '';
let selectedTextConstraint = '';
let selectedTextConstraintFace = null;
let selectedTextConstraintSideFactor = 1;
let selectedTextConstraintFixedS = null;
let textDragging = false;
let textDragPointerId = null;
let textDragMoved = false;
let textGuidePoints = [];
let textHudAnchor = null;
let editingTextId = '';
let editingTextOriginalSpec = null;
let suppressCanvasClick = false;

function makeBaseBox(width = 600, depth = 400, height = 300) {
  return { id: 'base', minX: -width / 2, maxX: width / 2, minY: 0, maxY: height, minZ: -depth / 2, maxZ: depth / 2 };
}

let state = {
  version: 4,
  boxes: [makeBaseBox()],
  boardThickness: 3,
  textPlacements: [],
};

function localeForHost() {
  const host = location.hostname.toLowerCase();
  if (host.includes('360configurator.ro')) return 'ro-RO';
  if (host.includes('360konfigurator.de')) return 'de-DE';
  return 'en-US';
}
function t(key) { return TEXT[locale]?.[key] ?? TEXT['en-US'][key] ?? key; }
function recordUndoCheckpoint() { window.CARDBOX_CONFIGURATOR_UNDO_HISTORY?.record?.(); }
function markConfigurationDirty() { window.CARDBOX_CONFIGURATOR_SHARED_SHELL?.markDirty?.(); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function round(value, digits = 4) { const f = 10 ** digits; return Math.round(value * f) / f; }
function toMm(value) { return units === 'imperial' ? Number(value) * 25.4 : Number(value); }
function fromMm(value) { return units === 'imperial' ? Number(value) / 25.4 : Number(value); }
function displayLength(mm) { return units === 'imperial' ? `${(mm / 25.4).toFixed(1)} in` : `${Math.round(mm)} mm`; }
function formatMoney(eur) {
  const rate = CURRENCY_FROM_EUR[currency] || 1;
  const amount = eur * rate;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}
function cloneBox(box) { return { id: box.id, minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY, minZ: box.minZ, maxZ: box.maxZ }; }
function currentBoxes() { return draftBox ? [...state.boxes, draftBox] : state.boxes; }
function baseBox() { return state.boxes[0]; }
function uniqueSorted(values) { return [...new Set(values.map((v) => round(v, 6)))].sort((a, b) => a - b); }
function faceKey(face) { return [face.axis, face.sign, round(face.coord, 4), round(face.u1, 4), round(face.u2, 4), round(face.v1, 4), round(face.v2, 4)].join(':'); }

function makeTextPlacementId() {
  if (globalThis.crypto?.randomUUID) return `text-${globalThis.crypto.randomUUID()}`;
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function copyFace(face) {
  if (!face) return null;
  return { axis: face.axis, sign: Number(face.sign), coord: Number(face.coord), u1: Number(face.u1), u2: Number(face.u2), v1: Number(face.v1), v2: Number(face.v2) };
}
function faceWorldCorners(face) {
  if (face.axis === 'x') return [
    new THREE.Vector3(face.coord, face.v1, face.u1), new THREE.Vector3(face.coord, face.v1, face.u2),
    new THREE.Vector3(face.coord, face.v2, face.u2), new THREE.Vector3(face.coord, face.v2, face.u1),
  ];
  if (face.axis === 'y') return [
    new THREE.Vector3(face.u1, face.coord, face.v1), new THREE.Vector3(face.u2, face.coord, face.v1),
    new THREE.Vector3(face.u2, face.coord, face.v2), new THREE.Vector3(face.u1, face.coord, face.v2),
  ];
  return [
    new THREE.Vector3(face.u1, face.v1, face.coord), new THREE.Vector3(face.u2, face.v1, face.coord),
    new THREE.Vector3(face.u2, face.v2, face.coord), new THREE.Vector3(face.u1, face.v2, face.coord),
  ];
}
function faceBasis(face, sideFactor = 1) {
  const normal = faceNormal(face).multiplyScalar(sideFactor >= 0 ? 1 : -1).normalize();
  const center = faceCenter(face);
  let horizontal;
  let vertical;
  if (isVerticalFace(face)) {
    vertical = new THREE.Vector3(0, 1, 0);
    horizontal = new THREE.Vector3().crossVectors(vertical, normal).normalize();
  } else {
    horizontal = new THREE.Vector3(1, 0, 0);
    vertical = new THREE.Vector3().crossVectors(normal, horizontal).normalize();
  }
  const projected = faceWorldCorners(face).map((point) => {
    const relative = point.clone().sub(center);
    return { h: relative.dot(horizontal), v: relative.dot(vertical) };
  });
  return {
    center, normal, horizontal, vertical,
    hMin: Math.min(...projected.map((p0) => p0.h)), hMax: Math.max(...projected.map((p0) => p0.h)),
    vMin: Math.min(...projected.map((p0) => p0.v)), vMax: Math.max(...projected.map((p0) => p0.v)),
  };
}
function facePointFromLocal(face, sideFactor, h, v, offset = 0) {
  const basis = faceBasis(face, sideFactor);
  return basis.center.clone()
    .add(basis.horizontal.clone().multiplyScalar(h))
    .add(basis.vertical.clone().multiplyScalar(v))
    .add(basis.normal.clone().multiplyScalar(offset));
}
function faceDisplayPointFromLocal(face, sideFactor, h, v, offset = 0) {
  const point = facePointFromLocal(face, sideFactor, h, v, offset);
  if (isTopFace(face) && isLidLiftActive()) point.y += LID_LIFT_MM;
  return point;
}
function pointToFaceLocal(face, sideFactor, point) {
  const basis = faceBasis(face, sideFactor);
  const relative = point.clone().sub(basis.center);
  return { h: relative.dot(basis.horizontal), v: relative.dot(basis.vertical), basis };
}
function clampPointToFace(face, sideFactor, point, marginH = 0, marginV = 0) {
  const local = pointToFaceLocal(face, sideFactor, point);
  const hMin = local.basis.hMin + Math.max(0, marginH);
  const hMax = local.basis.hMax - Math.max(0, marginH);
  const vMin = local.basis.vMin + Math.max(0, marginV);
  const vMax = local.basis.vMax - Math.max(0, marginV);
  const h = clamp(local.h, Math.min(hMin, hMax), Math.max(hMin, hMax));
  const v = clamp(local.v, Math.min(vMin, vMax), Math.max(vMin, vMax));
  return facePointFromLocal(face, sideFactor, h, v, 0);
}
function currentFaceForDescriptor(face) {
  if (!face) return null;
  const exact = surfaceDescriptors.find((candidate) => faceKey(candidate) === faceKey(face));
  if (exact) return exact;
  const center = faceCenter(face);
  return surfaceDescriptors.find((candidate) => {
    if (candidate.axis !== face.axis || candidate.sign !== face.sign || Math.abs(candidate.coord - face.coord) > 1.5) return false;
    if (candidate.axis === 'x') return center.z >= candidate.u1 - 2 && center.z <= candidate.u2 + 2 && center.y >= candidate.v1 - 2 && center.y <= candidate.v2 + 2;
    if (candidate.axis === 'y') return center.x >= candidate.u1 - 2 && center.x <= candidate.u2 + 2 && center.z >= candidate.v1 - 2 && center.z <= candidate.v2 + 2;
    return center.x >= candidate.u1 - 2 && center.x <= candidate.u2 + 2 && center.y >= candidate.v1 - 2 && center.y <= candidate.v2 + 2;
  }) || null;
}
function inferFaceForWorldPlane(position, normal = null) {
  let best = null;
  let bestScore = Infinity;
  for (const face of surfaceDescriptors) {
    const outward = faceNormal(face).normalize();
    if (normal && Math.abs(normal.clone().normalize().dot(outward)) < 0.88) continue;
    const center = faceCenter(face);
    const planeDistance = Math.abs(position.clone().sub(center).dot(outward));
    if (planeDistance > 8) continue;
    const basis = faceBasis(face, 1);
    const relative = position.clone().sub(center);
    const h = relative.dot(basis.horizontal);
    const v = relative.dot(basis.vertical);
    if (h < basis.hMin - 16 || h > basis.hMax + 16 || v < basis.vMin - 16 || v > basis.vMax + 16) continue;
    const alignmentPenalty = normal ? (1 - Math.abs(normal.clone().normalize().dot(outward))) * 20 : 0;
    const score = planeDistance + alignmentPenalty;
    if (score < bestScore) { best = face; bestScore = score; }
  }
  return best;
}
function segmentWorldNormal(segment) {
  const quaternion = new THREE.Quaternion().fromArray(segment.quaternion || [0, 0, 0, 1]);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
}
function segmentFaceInfo(segment) {
  const stored = currentFaceForDescriptor(segment.face);
  if (stored) {
    const normal = segmentWorldNormal(segment);
    return { face: stored, sideFactor: normal.dot(faceNormal(stored)) >= 0 ? 1 : -1 };
  }
  const position = new THREE.Vector3().fromArray(segment.position || [0, 0, 0]);
  const normal = segmentWorldNormal(segment);
  const face = inferFaceForWorldPlane(position, normal);
  if (!face) return null;
  return { face, sideFactor: normal.dot(faceNormal(face)) >= 0 ? 1 : -1 };
}
function ensurePlacementId(placement) {
  if (!placement.id) placement.id = makeTextPlacementId();
  return placement.id;
}
function resolvePlacementFaceInfo(placement) {
  if (!placement) return null;
  ensurePlacementId(placement);
  let face = currentFaceForDescriptor(placement.face);
  let sideFactor = Number(placement.sideFactor) < 0 ? -1 : 1;
  let anchor = Array.isArray(placement.anchor) ? new THREE.Vector3().fromArray(placement.anchor) : null;

  // Older wrapped stickers did not store an anchor. The strip closest to the
  // center of the artwork is the best reconstruction of the original click
  // point and avoids moving the sticker when it is first edited after upgrade.
  if ((!face || !anchor) && Array.isArray(placement.segments) && placement.segments.length) {
    const ordered = [...placement.segments].sort((a, b) => {
      const ca = Math.abs(((Number(a.u0) || 0) + (Number(a.u1) || 1)) / 2 - 0.5);
      const cb = Math.abs(((Number(b.u0) || 0) + (Number(b.u1) || 1)) / 2 - 0.5);
      return ca - cb;
    });
    for (const segment of ordered) {
      const info = segmentFaceInfo(segment);
      if (!info) continue;
      face = face || info.face;
      sideFactor = info.sideFactor;
      if (!anchor) anchor = new THREE.Vector3().fromArray(segment.position || [0,0,0]);
      if (!segment.face) segment.face = copyFace(info.face);
      break;
    }
  }

  if (!face && Array.isArray(placement.position)) {
    const position = new THREE.Vector3().fromArray(placement.position);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(placement.quaternion || [0,0,0,1])).normalize();
    face = inferFaceForWorldPlane(position, normal);
    if (face) sideFactor = normal.dot(faceNormal(face)) >= 0 ? 1 : -1;
    if (!anchor) anchor = position.clone();
  }
  if (!face) return null;
  if (!anchor) anchor = faceCenter(face);
  const basis = faceBasis(face, sideFactor);
  anchor.sub(basis.normal.clone().multiplyScalar(anchor.clone().sub(basis.center).dot(basis.normal)));
  placement.face = copyFace(face);
  placement.sideFactor = sideFactor;
  placement.anchor = anchor.toArray();
  return { face, sideFactor, anchor };
}
function resolvePlacementPrimaryFaceInfo(placement) {
  if (!placement) return null;
  if (!Array.isArray(placement.segments) || !placement.segments.length) return resolvePlacementFaceInfo(placement);
  const weights = new Map();
  const centers = new Map();
  const sideFactors = new Map();
  for (const segment of placement.segments) {
    const info = segmentFaceInfo(segment);
    if (!info) continue;
    const key = faceKey(info.face);
    const weight = Math.max(1, Number(segment.width) || 1);
    weights.set(key, (weights.get(key) || 0) + weight);
    const entry = centers.get(key) || { point: new THREE.Vector3(), weight: 0 };
    entry.point.add(new THREE.Vector3().fromArray(segment.position || [0,0,0]).multiplyScalar(weight));
    entry.weight += weight;
    centers.set(key, entry);
    sideFactors.set(key, info.sideFactor);
  }
  if (!weights.size) return resolvePlacementFaceInfo(placement);
  const key = [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const face = surfaceDescriptors.find((candidate) => faceKey(candidate) === key);
  if (!face) return resolvePlacementFaceInfo(placement);
  const sideFactor = sideFactors.get(key) || 1;
  const entry = centers.get(key);
  let anchor = entry?.weight ? entry.point.multiplyScalar(1 / entry.weight) : faceCenter(face);
  const basis = faceBasis(face, sideFactor);
  anchor.sub(basis.normal.clone().multiplyScalar(anchor.clone().sub(basis.center).dot(basis.normal)));
  return { face, sideFactor, anchor };
}

function buildUnionGrid(boxes) {
  const xs = uniqueSorted(boxes.flatMap((b) => [b.minX, b.maxX]));
  const ys = uniqueSorted(boxes.flatMap((b) => [b.minY, b.maxY]));
  const zs = uniqueSorted(boxes.flatMap((b) => [b.minZ, b.maxZ]));
  const occupied = Array.from({ length: xs.length - 1 }, () => Array.from({ length: ys.length - 1 }, () => Array(zs.length - 1).fill(false)));
  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    const cx = (xs[ix] + xs[ix + 1]) / 2;
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      const cy = (ys[iy] + ys[iy + 1]) / 2;
      for (let iz = 0; iz < zs.length - 1; iz += 1) {
        const cz = (zs[iz] + zs[iz + 1]) / 2;
        occupied[ix][iy][iz] = boxes.some((b) => cx > b.minX - EPSILON && cx < b.maxX + EPSILON && cy > b.minY - EPSILON && cy < b.maxY + EPSILON && cz > b.minZ - EPSILON && cz < b.maxZ + EPSILON);
      }
    }
  }
  return { xs, ys, zs, occupied };
}

function collectBoundaryTiles(grid) {
  const { xs, ys, zs, occupied } = grid;
  const tiles = [];
  const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const isOcc = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && occupied[ix][iy][iz];
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        if (!occupied[ix][iy][iz]) continue;
        if (!isOcc(ix - 1, iy, iz)) tiles.push({ axis: 'x', sign: -1, coord: xs[ix], u1: zs[iz], u2: zs[iz + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix + 1, iy, iz)) tiles.push({ axis: 'x', sign: 1, coord: xs[ix + 1], u1: zs[iz], u2: zs[iz + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix, iy - 1, iz)) tiles.push({ axis: 'y', sign: -1, coord: ys[iy], u1: xs[ix], u2: xs[ix + 1], v1: zs[iz], v2: zs[iz + 1] });
        if (!isOcc(ix, iy + 1, iz)) tiles.push({ axis: 'y', sign: 1, coord: ys[iy + 1], u1: xs[ix], u2: xs[ix + 1], v1: zs[iz], v2: zs[iz + 1] });
        if (!isOcc(ix, iy, iz - 1)) tiles.push({ axis: 'z', sign: -1, coord: zs[iz], u1: xs[ix], u2: xs[ix + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix, iy, iz + 1)) tiles.push({ axis: 'z', sign: 1, coord: zs[iz + 1], u1: xs[ix], u2: xs[ix + 1], v1: ys[iy], v2: ys[iy + 1] });
      }
    }
  }
  return tiles;
}

function mergeTiles(tiles) {
  const groups = new Map();
  for (const tile of tiles) {
    const key = `${tile.axis}:${tile.sign}:${round(tile.coord, 6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tile);
  }
  const faces = [];
  for (const group of groups.values()) {
    const uCoords = uniqueSorted(group.flatMap((t0) => [t0.u1, t0.u2]));
    const vCoords = uniqueSorted(group.flatMap((t0) => [t0.v1, t0.v2]));
    const cells = Array.from({ length: uCoords.length - 1 }, () => Array(vCoords.length - 1).fill(false));
    for (const tile of group) {
      const iu = uCoords.findIndex((v) => Math.abs(v - tile.u1) < EPSILON);
      const iv = vCoords.findIndex((v) => Math.abs(v - tile.v1) < EPSILON);
      if (iu >= 0 && iv >= 0) cells[iu][iv] = true;
    }
    const used = cells.map((row) => row.map(() => false));
    for (let iu = 0; iu < cells.length; iu += 1) {
      for (let iv = 0; iv < cells[iu].length; iv += 1) {
        if (!cells[iu][iv] || used[iu][iv]) continue;
        let endU = iu;
        while (endU + 1 < cells.length && cells[endU + 1][iv] && !used[endU + 1][iv]) endU += 1;
        let endV = iv;
        outer: while (endV + 1 < cells[iu].length) {
          for (let u = iu; u <= endU; u += 1) if (!cells[u][endV + 1] || used[u][endV + 1]) break outer;
          endV += 1;
        }
        for (let u = iu; u <= endU; u += 1) for (let v = iv; v <= endV; v += 1) used[u][v] = true;
        const seed = group[0];
        faces.push({ axis: seed.axis, sign: seed.sign, coord: seed.coord, u1: uCoords[iu], u2: uCoords[endU + 1], v1: vCoords[iv], v2: vCoords[endV + 1] });
      }
    }
  }
  return faces;
}

function calculateUnionMetrics(boxes = state.boxes) {
  const grid = buildUnionGrid(boxes);
  const { xs, ys, zs, occupied } = grid;
  let volume = 0;
  for (let ix = 0; ix < xs.length - 1; ix += 1) for (let iy = 0; iy < ys.length - 1; iy += 1) for (let iz = 0; iz < zs.length - 1; iz += 1) {
    if (occupied[ix][iy][iz]) volume += (xs[ix + 1] - xs[ix]) * (ys[iy + 1] - ys[iy]) * (zs[iz + 1] - zs[iz]);
  }
  const faces = mergeTiles(collectBoundaryTiles(grid));
  const area = faces.reduce((sum, face) => sum + (face.u2 - face.u1) * (face.v2 - face.v1), 0);
  return { volumeMm3: volume, areaMm2: area, faces };
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f4f6);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 12000);
camera.position.set(850, 720, 900);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 180;
controls.maxDistance = 5200;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 120, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a979f, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.7); keyLight.position.set(900, 1100, 620); keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xb8dbf1, 1.1); fillLight.position.set(-700, 500, -500); scene.add(fillLight);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0xe7ecef, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -4; ground.receiveShadow = true; scene.add(ground);
const gridHelper = new THREE.GridHelper(5000, 100, 0xc6d2d8, 0xdce4e8); gridHelper.position.y = -3; gridHelper.material.opacity = 0.32; gridHelper.material.transparent = true; scene.add(gridHelper);
const boxGroup = new THREE.Group(); scene.add(boxGroup);
const textGroup = new THREE.Group(); scene.add(textGroup);
const editorPreviewGroup = new THREE.Group(); scene.add(editorPreviewGroup);
const previewGroup = new THREE.Group(); scene.add(previewGroup);
const textSelectionGroup = new THREE.Group(); scene.add(textSelectionGroup);

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => { material.map?.dispose?.(); material.dispose?.(); });
    }
  });
}
function clearGroup(group) {
  for (const child of [...group.children]) { group.remove(child); disposeObject(child); }
}
function faceNormal(face) {
  if (face.axis === 'x') return new THREE.Vector3(face.sign, 0, 0);
  if (face.axis === 'y') return new THREE.Vector3(0, face.sign, 0);
  return new THREE.Vector3(0, 0, face.sign);
}
function faceCenter(face) {
  if (face.axis === 'x') return new THREE.Vector3(face.coord, (face.v1 + face.v2) / 2, (face.u1 + face.u2) / 2);
  if (face.axis === 'y') return new THREE.Vector3((face.u1 + face.u2) / 2, face.coord, (face.v1 + face.v2) / 2);
  return new THREE.Vector3((face.u1 + face.u2) / 2, (face.v1 + face.v2) / 2, face.coord);
}
function faceHorizontalWidth(face) { return face.u2 - face.u1; }
function faceHeight(face) { return face.v2 - face.v1; }
function isVerticalFace(face) { return face.axis === 'x' || face.axis === 'z'; }
function isTopFace(face) { return face.axis === 'y' && face.sign > 0; }
function isBottomFace(face) { return face.axis === 'y' && face.sign < 0; }

function isLidLiftActive() {
  return placementMode || Boolean(selectedTextId) || Boolean(editingTextId);
}
function sameVerticalPlane(a, b, tolerance = 0.75) {
  return Boolean(a && b)
    && isVerticalFace(a) && isVerticalFace(b)
    && a.axis === b.axis
    && a.sign === b.sign
    && Math.abs(a.coord - b.coord) <= tolerance;
}
function verticalPlaneEntries(referenceFace, sideFactor = 1) {
  if (!isVerticalFace(referenceFace)) return [];
  const horizontal = verticalFaceTangent(referenceFace, sideFactor).normalize();
  return surfaceDescriptors
    .filter((candidate) => sameVerticalPlane(referenceFace, candidate))
    .map((face) => {
      const a = verticalFaceEndpoint(face, 'u1', (face.v1 + face.v2) / 2);
      const b = verticalFaceEndpoint(face, 'u2', (face.v1 + face.v2) / 2);
      const sa = a.dot(horizontal);
      const sb = b.dot(horizontal);
      return { face, sMin: Math.min(sa, sb), sMax: Math.max(sa, sb), yMin: face.v1, yMax: face.v2 };
    });
}
function mergeIntervals(intervals = [], tolerance = 0.75) {
  const sorted = intervals
    .filter((interval) => Number.isFinite(interval.min) && Number.isFinite(interval.max))
    .map((interval) => ({ min: Math.min(interval.min, interval.max), max: Math.max(interval.min, interval.max) }))
    .sort((a, b) => a.min - b.min);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.min > last.max + tolerance) merged.push({ ...interval });
    else last.max = Math.max(last.max, interval.max);
  }
  return merged;
}
function intervalContainingOrNearest(intervals, value) {
  if (!intervals.length) return null;
  const containing = intervals.find((interval) => value >= interval.min - EPSILON && value <= interval.max + EPSILON);
  if (containing) return containing;
  return [...intervals].sort((a, b) => {
    const da = value < a.min ? a.min - value : value - a.max;
    const db = value < b.min ? b.min - value : value - b.max;
    return da - db;
  })[0];
}
function verticalPlanePoint(referenceFace, sideFactor, s, y) {
  const normal = faceNormal(referenceFace).multiplyScalar(sideFactor >= 0 ? 1 : -1).normalize();
  const horizontal = verticalFaceTangent(referenceFace, sideFactor).normalize();
  const planeDistance = faceCenter(referenceFace).dot(normal);
  return horizontal.clone().multiplyScalar(s)
    .add(new THREE.Vector3(0, y, 0))
    .add(normal.clone().multiplyScalar(planeDistance));
}
function planeHorizontalRunAtY(referenceFace, sideFactor, y, s) {
  const entries = verticalPlaneEntries(referenceFace, sideFactor);
  const runs = mergeIntervals(entries
    .filter((entry) => y >= entry.yMin - EPSILON && y <= entry.yMax + EPSILON)
    .map((entry) => ({ min: entry.sMin, max: entry.sMax })));
  return intervalContainingOrNearest(runs, s);
}
function planeVerticalRunAtS(referenceFace, sideFactor, s, y) {
  const entries = verticalPlaneEntries(referenceFace, sideFactor);
  const runs = mergeIntervals(entries
    .filter((entry) => s >= entry.sMin - EPSILON && s <= entry.sMax + EPSILON)
    .map((entry) => ({ min: entry.yMin, max: entry.yMax })));
  return intervalContainingOrNearest(runs, y);
}
function planeFaceAt(referenceFace, sideFactor, s, preferredY) {
  const entries = verticalPlaneEntries(referenceFace, sideFactor);
  const candidates = entries.filter((entry) => s >= entry.sMin - EPSILON && s <= entry.sMax + EPSILON);
  if (!candidates.length) return null;
  const containingY = candidates.filter((entry) => preferredY >= entry.yMin - EPSILON && preferredY <= entry.yMax + EPSILON);
  const source = containingY.length ? containingY : candidates;
  return [...source].sort((a, b) => {
    const ac = (a.yMin + a.yMax) / 2;
    const bc = (b.yMin + b.yMax) / 2;
    return Math.abs(ac - preferredY) - Math.abs(bc - preferredY);
  })[0]?.face || null;
}
function stickerDimensionsForFace(spec, face) {
  const artwork = createTextArtwork(spec);
  const availableHeight = Math.max(36, faceHeight(face) - 8);
  const scale = Math.min(1, availableHeight / artwork.worldHeight);
  const result = { width: artwork.worldWidth * scale, height: artwork.worldHeight * scale };
  artwork.texture.dispose();
  return result;
}
function verticalFaceTangent(face, sideFactor = 1) {
  const normal = faceNormal(face).multiplyScalar(sideFactor);
  return new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
}
function verticalFaceEndpoint(face, which, y) {
  if (face.axis === 'x') return new THREE.Vector3(face.coord, y, which === 'u1' ? face.u1 : face.u2);
  return new THREE.Vector3(which === 'u1' ? face.u1 : face.u2, y, face.coord);
}
function sameHorizontalPoint(a, b, tolerance = 0.75) {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.z - b.z) <= tolerance;
}
function faceContainsY(face, y) {
  return y >= face.v1 - EPSILON && y <= face.v2 + EPSILON;
}
function adjacentVerticalFace(currentFace, edgePoint, y, sideFactor = 1, directionSign = 1, currentDirection = null) {
  const candidates = surfaceDescriptors.filter((candidate) => {
    if (!isVerticalFace(candidate) || faceKey(candidate) === faceKey(currentFace) || !faceContainsY(candidate, y)) return false;
    const a = verticalFaceEndpoint(candidate, 'u1', y);
    const b = verticalFaceEndpoint(candidate, 'u2', y);
    return sameHorizontalPoint(a, edgePoint) || sameHorizontalPoint(b, edgePoint);
  });
  if (!candidates.length) return null;
  if (!currentDirection) return candidates[0];
  return candidates.sort((lhs, rhs) => {
    const leftDirection = verticalFaceTangent(lhs, sideFactor).multiplyScalar(directionSign).normalize();
    const rightDirection = verticalFaceTangent(rhs, sideFactor).multiplyScalar(directionSign).normalize();
    return rightDirection.dot(currentDirection) - leftDirection.dot(currentDirection);
  })[0] || null;
}
function walkStickerOffset(startFace, startPoint, sideFactor, offset) {
  if (!isVerticalFace(startFace) || Math.abs(offset) < EPSILON) {
    return { face: startFace, point: startPoint.clone(), tangent: verticalFaceTangent(startFace, sideFactor), normal: faceNormal(startFace).multiplyScalar(sideFactor) };
  }
  const sign = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(offset);
  let face = startFace;
  let point = startPoint.clone();
  const y = startPoint.y;
  for (let step = 0; step < 48; step += 1) {
    const canonical = verticalFaceTangent(face, sideFactor);
    const direction = canonical.clone().multiplyScalar(sign).normalize();
    const a = verticalFaceEndpoint(face, 'u1', y);
    const b = verticalFaceEndpoint(face, 'u2', y);
    const da = a.clone().sub(point).dot(direction);
    const db = b.clone().sub(point).dot(direction);
    const candidates = [[da, a], [db, b]].filter(([distance]) => distance > EPSILON).sort((lhs, rhs) => lhs[0] - rhs[0]);

    // When the anchor itself sits exactly on a face boundary, the old walker
    // had no positive in-face distance and pinned every remaining strip to the
    // corner. Continue immediately onto the adjacent surface instead so the
    // sticker bends rather than visually compressing at the edge.
    if (!candidates.length) {
      const nextFace = adjacentVerticalFace(face, point, y, sideFactor, sign, direction);
      if (!nextFace) return { face, point, tangent: canonical, normal: faceNormal(face).multiplyScalar(sideFactor), blocked: true };
      face = nextFace;
      continue;
    }

    const [distanceToEdge, edgePoint] = candidates[0];
    if (remaining < distanceToEdge - EPSILON) {
      point.add(direction.multiplyScalar(remaining));
      return { face, point, tangent: canonical, normal: faceNormal(face).multiplyScalar(sideFactor), blocked: false };
    }
    if (Math.abs(remaining - distanceToEdge) <= EPSILON) {
      point.copy(edgePoint);
      return { face, point, tangent: canonical, normal: faceNormal(face).multiplyScalar(sideFactor), blocked: false };
    }
    remaining -= distanceToEdge;
    point.copy(edgePoint);
    const nextFace = adjacentVerticalFace(face, point, y, sideFactor, sign, direction);
    if (!nextFace) return { face, point, tangent: canonical, normal: faceNormal(face).multiplyScalar(sideFactor), blocked: true };
    face = nextFace;
  }
  return { face, point, tangent: verticalFaceTangent(face, sideFactor), normal: faceNormal(face).multiplyScalar(sideFactor), blocked: true };
}
function selectedFaceHighlightVisible(face) {
  return Boolean(selectedFaceSnapshot)
    && faceKey(face) === selectedFaceKey
    && textEditorPanel.hidden
    && !addMode
    && !placementMode;
}
function addSelectionMarkers(mesh, face) {
  if (!selectedFaceHighlightVisible(face)) return;
  const width = face.u2 - face.u1;
  const height = face.v2 - face.v1;
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x0e82d8, side: THREE.DoubleSide, depthTest: false });
  const markerGeometry = new THREE.RingGeometry(4, 6.5, 20);
  const z = selectedFaceSideFactor * 1.8;
  for (const [x, y] of [[-width/2,-height/2],[width/2,-height/2],[-width/2,height/2],[width/2,height/2]]) {
    const marker = new THREE.Mesh(markerGeometry, ringMaterial.clone());
    marker.position.set(x, y, z);
    marker.renderOrder = 5;
    mesh.add(marker);
  }
}
function makeSurfaceMesh(face) {
  const width = face.u2 - face.u1;
  const height = face.v2 - face.v1;
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({ color: DEFAULT_COLOR, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const normal = faceNormal(face);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const center = faceCenter(face);
  if (isLidLiftActive() && isTopFace(face)) center.y += LID_LIFT_MM;
  mesh.position.copy(center);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.cardboxSurface = true;
  mesh.userData.face = face;
  mesh.userData.faceKey = faceKey(face);
  mesh.userData.vertical = isVerticalFace(face);
  mesh.userData.top = isTopFace(face);
  mesh.userData.bottom = isBottomFace(face);
  addSelectionMarkers(mesh, face);
  return mesh;
}
function rebuildSurfaceMeshes() {
  clearGroup(boxGroup);
  surfaceMeshes = [];
  const metrics = calculateUnionMetrics(currentBoxes());
  surfaceDescriptors = metrics.faces;
  dimensionAnchors = [];
  for (const face of surfaceDescriptors) {
    const mesh = makeSurfaceMesh(face);
    boxGroup.add(mesh);
    surfaceMeshes.push(mesh);
    const highlighted = selectedFaceHighlightVisible(face);
    if (technicalEdgesVisible || highlighted) {
      const edgeMaterial = new THREE.LineBasicMaterial({ color: highlighted ? 0x0e82d8 : 0x755335, transparent: true, opacity: highlighted ? 0.95 : 0.38, depthTest: !highlighted });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
      edges.renderOrder = highlighted ? 4 : 0;
      mesh.add(edges);
    }
    if (isVerticalFace(face)) {
      const anchor = faceCenter(face);
      anchor.y = face.v2 + 24;
      dimensionAnchors.push({ point: anchor, label: displayLength(faceHorizontalWidth(face)) });
    }
  }
  renderPlacedTexts();
  renderDimensions();
  fitControlsTarget();
}

function boundsForBoxes(boxes = currentBoxes()) {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)),
    minZ: Math.min(...boxes.map((b) => b.minZ)), maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}
function fitControlsTarget() {
  const b = boundsForBoxes();
  controls.target.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 + (isLidLiftActive() ? LID_LIFT_MM * 0.08 : 0), (b.minZ + b.maxZ) / 2);
}

function createTextArtwork(spec) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontPx = clamp(spec.size || 54, 12, 180);
  const weight = spec.bold ? '700' : '500';
  const style = spec.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${fontPx}px ${spec.fontFamily}`;
  const padding = Math.max(16, fontPx * 0.35);
  const measured = Math.max(ctx.measureText(spec.text).width, fontPx);
  canvas.width = Math.ceil(measured + padding * 2);
  canvas.height = Math.ceil(fontPx + padding * 2 + (spec.underline ? fontPx * 0.3 : 0));
  const draw = canvas.getContext('2d');
  draw.clearRect(0, 0, canvas.width, canvas.height);
  if (!isTransparentColor(spec.backgroundColor)) {
    draw.fillStyle = spec.backgroundColor;
    draw.fillRect(0, 0, canvas.width, canvas.height);
  }
  draw.font = `${style} ${weight} ${fontPx}px ${spec.fontFamily}`;
  draw.textAlign = 'center'; draw.textBaseline = 'middle'; draw.fillStyle = spec.textColor;
  const textY = canvas.height / 2 - (spec.underline ? fontPx * 0.08 : 0);
  draw.fillText(spec.text, canvas.width / 2, textY);
  if (spec.underline) {
    const y = textY + fontPx * 0.42;
    draw.strokeStyle = spec.textColor; draw.lineWidth = Math.max(2, fontPx * 0.06);
    if (spec.underlineStyle === 'dashed') draw.setLineDash([12, 8]);
    if (spec.underlineStyle === 'dotted') { draw.setLineDash([2, 7]); draw.lineCap = 'round'; }
    if (spec.underlineStyle === 'double') {
      draw.beginPath(); draw.moveTo(padding, y - 3); draw.lineTo(canvas.width - padding, y - 3); draw.moveTo(padding, y + 3); draw.lineTo(canvas.width - padding, y + 3); draw.stroke();
    } else {
      draw.beginPath(); draw.moveTo(padding, y); draw.lineTo(canvas.width - padding, y); draw.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const worldHeight = clamp(fontPx * 1.8, 48, 360);
  const worldWidth = worldHeight * canvas.width / canvas.height;
  return { texture, worldWidth, worldHeight };
}
function makeArtworkPlane(artwork, width, height, opacity = 1, u0 = 0, u1 = 1) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) < 0.5 ? u0 : u1);
  uv.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: artwork.texture, transparent: true, side: THREE.DoubleSide, opacity, depthWrite: opacity >= 1 });
  return new THREE.Mesh(geometry, material);
}
function createTextMesh(spec, opacity = 1) {
  const artwork = createTextArtwork(spec);
  return makeArtworkPlane(artwork, artwork.worldWidth, artwork.worldHeight, opacity);
}
function createWrappedSticker(spec, face, anchorPoint, sideFactor = 1, opacity = 1) {
  const artwork = createTextArtwork(spec);
  const availableHeight = Math.max(36, faceHeight(face) - 8);
  const scale = Math.min(1, availableHeight / artwork.worldHeight);
  const width = artwork.worldWidth * scale;
  const height = artwork.worldHeight * scale;
  const anchor = anchorPoint.clone();
  anchor.y = clamp(anchor.y, face.v1 + height / 2, face.v2 - height / 2);
  const stripCount = Math.max(10, Math.min(96, Math.ceil(width / 10)));
  const stripWidth = width / stripCount;
  const group = new THREE.Group();
  const segments = [];
  for (let i = 0; i < stripCount; i += 1) {
    const u0 = i / stripCount;
    const u1 = (i + 1) / stripCount;
    const offset = -width / 2 + stripWidth * (i + 0.5);
    const mapped = walkStickerOffset(face, anchor, sideFactor, offset);
    const segment = makeArtworkPlane(artwork, stripWidth + 0.55, height, opacity, u0, u1);
    const normal = mapped.normal.clone().normalize();
    const position = mapped.point.clone().add(normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM));
    segment.position.copy(position);
    segment.quaternion.copy(quaternionForNormal(normal));
    group.add(segment);
    segments.push({ position: position.toArray(), quaternion: segment.quaternion.toArray(), u0, u1, width: stripWidth + 0.55, height, face: copyFace(mapped.face), sideFactor });
  }
  return { group, segments };
}
function createStoredStickerSegments(spec, segments, opacity = 1) {
  const artwork = createTextArtwork(spec);
  const group = new THREE.Group();
  for (const segmentData of segments) {
    const segment = makeArtworkPlane(artwork, Number(segmentData.width) || 10, Number(segmentData.height) || artwork.worldHeight, opacity, Number(segmentData.u0) || 0, Number(segmentData.u1) || 1);
    segment.position.fromArray(segmentData.position || [0, 0, 0]);
    segment.quaternion.fromArray(segmentData.quaternion || [0, 0, 0, 1]);
    group.add(segment);
  }
  return group;
}
function tagTextRenderable(object, placementId) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.cardboxText = true;
    child.userData.textPlacementId = placementId;
  });
}
function renderPlacedTexts() {
  clearGroup(textGroup);
  for (const placement of state.textPlacements) {
    const placementId = ensurePlacementId(placement);
    if (placementId === editingTextId) continue;
    if (Array.isArray(placement.segments) && placement.segments.length) {
      const group = createStoredStickerSegments(placement.spec, placement.segments, 1);
      tagTextRenderable(group, placementId);
      textGroup.add(group);
      continue;
    }
    if (!Array.isArray(placement.position)) continue;
    const mesh = createTextMesh(placement.spec, 1);
    const position = new THREE.Vector3().fromArray(placement.position);
    if (placement.topSurface && isLidLiftActive()) position.y += LID_LIFT_MM;
    mesh.position.copy(position);
    mesh.quaternion.fromArray(placement.quaternion || [0,0,0,1]);
    mesh.userData.cardboxText = true;
    mesh.userData.textPlacementId = placementId;
    textGroup.add(mesh);
  }
}

function placementById(id) {
  return state.textPlacements.find((placement) => ensurePlacementId(placement) === id) || null;
}
function buildPlacementGeometry(spec, face, anchorPoint, sideFactor = 1) {
  const anchor = clampPointToFace(face, sideFactor, anchorPoint);
  if (isVerticalFace(face)) {
    const sticker = createWrappedSticker(spec, face, anchor, sideFactor, 1);
    const segments = sticker.segments.map((segment) => ({
      ...segment,
      position: [...segment.position],
      quaternion: [...segment.quaternion],
      face: copyFace(segment.face),
    }));
    clearGroup(sticker.group);
    return {
      face: copyFace(face), sideFactor, anchor: anchor.toArray(), segments,
      position: undefined, quaternion: undefined, topSurface: false,
    };
  }
  const normal = faceNormal(face).multiplyScalar(sideFactor).normalize();
  const position = anchor.clone().add(normal.multiplyScalar(SURFACE_TEXT_OFFSET_MM));
  const quaternion = quaternionForNormal(normal);
  return {
    face: copyFace(face), sideFactor, anchor: anchor.toArray(), segments: undefined,
    position: position.toArray(), quaternion: quaternion.toArray(), topSurface: isTopFace(face),
  };
}
function applyPlacementGeometry(placement, face, anchorPoint, sideFactor = 1) {
  if (!placement || !face) return false;
  const geometry = buildPlacementGeometry(placement.spec, face, anchorPoint, sideFactor);
  placement.face = geometry.face;
  placement.sideFactor = geometry.sideFactor;
  placement.anchor = geometry.anchor;
  placement.segments = geometry.segments;
  placement.position = geometry.position;
  placement.quaternion = geometry.quaternion;
  placement.topSurface = geometry.topSurface;
  return true;
}

function isTransparentColor(value) {
  return !value || value === 'transparent' || value === 'rgba(0,0,0,0)';
}
function syncPaletteSelection(container, value) {
  if (!container) return;
  container.querySelectorAll('[data-color]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.color === value);
  });
}
function renderEditorPreview() {
  clearGroup(editorPreviewGroup);
  editorPreviewSpec = null;
  if (textEditorPanel.hidden) return;
  const spec = buildTextSpec();
  editorPreviewSpec = { ...spec };
  let face = selectedFaceSnapshot;
  let sideFactor = selectedFaceSideFactor;
  let anchor = face ? faceCenter(face) : null;
  if (editingTextId) {
    const placement = placementById(editingTextId);
    const info = resolvePlacementFaceInfo(placement);
    if (!placement || !info) return;
    face = info.face;
    sideFactor = info.sideFactor;
    anchor = info.anchor;
  }
  if (!face || !anchor) return;
  if (isVerticalFace(face)) {
    const sticker = createWrappedSticker(spec, face, anchor.clone(), sideFactor, 0.94);
    editorPreviewGroup.add(sticker.group);
  } else {
    const mesh = createTextMesh(spec, 0.94);
    const normal = faceNormal(face).multiplyScalar(sideFactor);
    mesh.position.copy(anchor.clone().add(normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM)));
    mesh.quaternion.copy(quaternionForNormal(normal));
    editorPreviewGroup.add(mesh);
  }
}
function clearEditorPreview() {
  editorPreviewSpec = null;
  clearGroup(editorPreviewGroup);
}
function quaternionForNormal(normal) {
  const reference = Math.abs(normal.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, bitangent, normal));
}

function textPlaneCorners(position, quaternion, width, height) {
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    position.clone().add(xAxis.clone().multiplyScalar(-halfW)).add(yAxis.clone().multiplyScalar(-halfH)),
    position.clone().add(xAxis.clone().multiplyScalar(halfW)).add(yAxis.clone().multiplyScalar(-halfH)),
    position.clone().add(xAxis.clone().multiplyScalar(halfW)).add(yAxis.clone().multiplyScalar(halfH)),
    position.clone().add(xAxis.clone().multiplyScalar(-halfW)).add(yAxis.clone().multiplyScalar(halfH)),
  ];
}
function placementBoundsOnFace(placement, face, sideFactor = 1) {
  const basis = faceBasis(face, sideFactor);
  const points = [];
  if (Array.isArray(placement.segments) && placement.segments.length) {
    for (const segment of placement.segments) {
      const info = segmentFaceInfo(segment);
      if (!info || faceKey(info.face) !== faceKey(face)) continue;
      const position = new THREE.Vector3().fromArray(segment.position || [0,0,0]);
      const quaternion = new THREE.Quaternion().fromArray(segment.quaternion || [0,0,0,1]);
      points.push(...textPlaneCorners(position, quaternion, Number(segment.width) || 10, Number(segment.height) || 50));
    }
  } else if (Array.isArray(placement.position)) {
    const artwork = createTextArtwork(placement.spec);
    const position = new THREE.Vector3().fromArray(placement.position);
    if (placement.topSurface && isLidLiftActive()) position.y += LID_LIFT_MM;
    const quaternion = new THREE.Quaternion().fromArray(placement.quaternion || [0,0,0,1]);
    points.push(...textPlaneCorners(position, quaternion, artwork.worldWidth, artwork.worldHeight));
    artwork.texture.dispose();
  }
  if (!points.length) {
    const info = resolvePlacementFaceInfo(placement);
    if (!info) return null;
    const artwork = createTextArtwork(placement.spec);
    const anchor = info.anchor;
    const quaternion = quaternionForNormal(basis.normal);
    points.push(...textPlaneCorners(anchor.clone().add(basis.normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM)), quaternion, artwork.worldWidth, artwork.worldHeight));
    artwork.texture.dispose();
  }
  const coordinates = points.map((point) => {
    const relative = point.clone().sub(basis.center);
    return { h: relative.dot(basis.horizontal), v: relative.dot(basis.vertical) };
  });
  return {
    basis,
    hMin: Math.min(...coordinates.map((p0) => p0.h)), hMax: Math.max(...coordinates.map((p0) => p0.h)),
    vMin: Math.min(...coordinates.map((p0) => p0.v)), vMax: Math.max(...coordinates.map((p0) => p0.v)),
  };
}
function placementCenterFaceInfo(placement) {
  if (!placement) return null;
  if (Array.isArray(placement.segments) && placement.segments.length) {
    const ordered = [...placement.segments].sort((a, b) => {
      const ca = Math.abs((((Number(a.u0) || 0) + (Number(a.u1) || 1)) / 2) - 0.5);
      const cb = Math.abs((((Number(b.u0) || 0) + (Number(b.u1) || 1)) / 2) - 0.5);
      return ca - cb;
    });
    for (const segment of ordered) {
      const info = segmentFaceInfo(segment);
      if (!info) continue;
      const point = new THREE.Vector3().fromArray(segment.position || [0,0,0]);
      const basis = faceBasis(info.face, info.sideFactor);
      point.sub(basis.normal.clone().multiplyScalar(point.clone().sub(basis.center).dot(basis.normal)));
      return { face: info.face, sideFactor: info.sideFactor, anchor: point, segment };
    }
  }
  return resolvePlacementFaceInfo(placement);
}
function segmentHorizontalEdge(segment, edgeSign) {
  const position = new THREE.Vector3().fromArray(segment.position || [0,0,0]);
  const quaternion = new THREE.Quaternion().fromArray(segment.quaternion || [0,0,0,1]);
  const xAxis = new THREE.Vector3(1,0,0).applyQuaternion(quaternion).normalize();
  return position.add(xAxis.multiplyScalar((Number(segment.width) || 10) * 0.5 * edgeSign));
}
function placementHorizontalEndpoints(placement) {
  if (!placement) return null;
  if (Array.isArray(placement.segments) && placement.segments.length) {
    const ordered = [...placement.segments].sort((a,b) => {
      const ac = ((Number(a.u0) || 0) + (Number(a.u1) || 1)) / 2;
      const bc = ((Number(b.u0) || 0) + (Number(b.u1) || 1)) / 2;
      return ac - bc;
    });
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const firstInfo = segmentFaceInfo(first);
    const lastInfo = segmentFaceInfo(last);
    if (firstInfo && lastInfo) {
      return {
        left: { point: segmentHorizontalEdge(first, -1), face: firstInfo.face, sideFactor: firstInfo.sideFactor, direction: new THREE.Vector3(-1,0,0).applyQuaternion(new THREE.Quaternion().fromArray(first.quaternion || [0,0,0,1])).normalize() },
        right: { point: segmentHorizontalEdge(last, 1), face: lastInfo.face, sideFactor: lastInfo.sideFactor, direction: new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().fromArray(last.quaternion || [0,0,0,1])).normalize() },
      };
    }
  }
  if (Array.isArray(placement.position)) {
    const info = resolvePlacementFaceInfo(placement);
    if (!info) return null;
    const artwork = createTextArtwork(placement.spec);
    const position = new THREE.Vector3().fromArray(placement.position);
    if (placement.topSurface && isLidLiftActive()) position.y += LID_LIFT_MM;
    const quaternion = new THREE.Quaternion().fromArray(placement.quaternion || [0,0,0,1]);
    const xAxis = new THREE.Vector3(1,0,0).applyQuaternion(quaternion).normalize();
    const half = artwork.worldWidth / 2;
    artwork.texture.dispose();
    return {
      left: { point: position.clone().add(xAxis.clone().multiplyScalar(-half)), face: info.face, sideFactor: info.sideFactor, direction: xAxis.clone().multiplyScalar(-1) },
      right: { point: position.clone().add(xAxis.clone().multiplyScalar(half)), face: info.face, sideFactor: info.sideFactor, direction: xAxis.clone() },
    };
  }
  return null;
}
function flatBoundaryGuide(endpoint) {
  if (!endpoint?.face || !isVerticalFace(endpoint.face)) return null;
  const basis = faceBasis(endpoint.face, endpoint.sideFactor);
  const projected = endpoint.point.clone().sub(basis.normal.clone().multiplyScalar(endpoint.point.clone().sub(basis.center).dot(basis.normal)));
  const horizontal = verticalFaceTangent(endpoint.face, endpoint.sideFactor).normalize();
  const s = projected.dot(horizontal);
  const run = planeHorizontalRunAtY(endpoint.face, endpoint.sideFactor, projected.y, s);
  if (!run) return null;
  const directionSign = endpoint.direction.dot(horizontal) >= 0 ? 1 : -1;
  const targetS = directionSign > 0 ? run.max : run.min;
  const end = verticalPlanePoint(endpoint.face, endpoint.sideFactor, targetS, projected.y);
  return {
    start: projected,
    end,
    direction: endpoint.direction.clone().normalize(),
    normal: basis.normal,
    distance: Math.max(0, Math.abs(targetS - s)),
  };
}
function stickerDimensionsForPlacementOnFace(placement, face) {
  return stickerDimensionsForFace(placement.spec, face);
}

function makeGuideLine(start, end) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineDashedMaterial({ color: 0x0e82d8, dashSize: 2, gapSize: 4, transparent: true, opacity: 0.9, depthTest: false });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 20;
  return line;
}
function makeGuideArrow(point, direction, normal) {
  const dir = direction.clone().normalize();
  const side = new THREE.Vector3().crossVectors(normal, dir).normalize();
  const back = point.clone().add(dir.clone().multiplyScalar(-9));
  const vertices = new Float32Array([
    point.x, point.y, point.z,
    back.x + side.x * 4.2, back.y + side.y * 4.2, back.z + side.z * 4.2,
    back.x - side.x * 4.2, back.y - side.y * 4.2, back.z - side.z * 4.2,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: 0x0e82d8, side: THREE.DoubleSide, depthTest: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 21;
  return mesh;
}
function addWorldDistanceGuide(id, start, end, outwardDirection, normal, distance) {
  const surfaceOffset = normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM + 3.2);
  const a = start.clone().add(surfaceOffset);
  const b = end.clone().add(surfaceOffset);
  textSelectionGroup.add(makeGuideLine(a, b));
  textSelectionGroup.add(makeGuideArrow(b, outwardDirection, normal));
  textSelectionGroup.add(makeGuideArrow(a, outwardDirection.clone().multiplyScalar(-1), normal));
  textGuidePoints.push({ id, point: a.clone().lerp(b, 0.5), label: displayLength(Math.max(0, distance)) });
}
function addDistanceGuide(id, start, end, outwardDirection, basis, distance) {
  addWorldDistanceGuide(id, start, end, outwardDirection, basis.normal, distance);
}
function selectedTextFaceInfo() {
  const placement = placementById(selectedTextId);
  if (!placement) return null;
  return placementCenterFaceInfo(placement) || resolvePlacementPrimaryFaceInfo(placement) || resolvePlacementFaceInfo(placement);
}
function renderTextGuideLabels() {
  textGuideLayer.innerHTML = textGuidePoints.map((guide) => `<div class="text-guide-label" data-text-guide="${guide.id}">${guide.label}</div>`).join('');
}
function renderTextSelection() {
  clearGroup(textSelectionGroup);
  textGuidePoints = [];
  textHudAnchor = null;
  textGuideLayer.innerHTML = '';
  textSelectionHud.hidden = true;
  textSelectionHud.style.display = 'none';
  canvasHost.classList.toggle('has-selected-text', Boolean(selectedTextId));
  textHorizontalLockButton.classList.toggle('is-active', selectedTextConstraint === 'horizontal');
  textVerticalLockButton.classList.toggle('is-active', selectedTextConstraint === 'vertical');
  if (!selectedTextId || placementMode || addMode || editingTextId || !textEditorPanel.hidden) return;

  const placement = placementById(selectedTextId);
  const info = selectedTextFaceInfo();
  if (!placement || !info) return;
  const bounds = placementBoundsOnFace(placement, info.face, info.sideFactor);
  if (!bounds) return;
  const basis = bounds.basis;

  let surfaceHMin = basis.hMin;
  let surfaceHMax = basis.hMax;
  let surfaceVMin = basis.vMin;
  let surfaceVMax = basis.vMax;
  if (isVerticalFace(info.face)) {
    const horizontal = verticalFaceTangent(info.face, info.sideFactor).normalize();
    const centerS = info.anchor.dot(horizontal);
    const verticalRun = planeVerticalRunAtS(info.face, info.sideFactor, centerS, info.anchor.y);
    if (verticalRun) {
      surfaceVMin = verticalRun.min - basis.center.y;
      surfaceVMax = verticalRun.max - basis.center.y;
    }
    const flatRun = planeHorizontalRunAtY(info.face, info.sideFactor, info.anchor.y, centerS);
    if (flatRun) {
      const centerS0 = basis.center.dot(horizontal);
      surfaceHMin = flatRun.min - centerS0;
      surfaceHMax = flatRun.max - centerS0;
    }
  }

  const textHMin = Math.max(bounds.hMin, surfaceHMin);
  const textHMax = Math.min(bounds.hMax, surfaceHMax);
  const textVMin = Math.max(bounds.vMin, surfaceVMin);
  const textVMax = Math.min(bounds.vMax, surfaceVMax);
  const hCenter = (textHMin + textHMax) / 2;
  const vCenter = (textVMin + textVMax) / 2;

  const outlinePoints = [
    faceDisplayPointFromLocal(info.face, info.sideFactor, textHMin, textVMin, SURFACE_TEXT_OFFSET_MM + 3.4),
    faceDisplayPointFromLocal(info.face, info.sideFactor, textHMax, textVMin, SURFACE_TEXT_OFFSET_MM + 3.4),
    faceDisplayPointFromLocal(info.face, info.sideFactor, textHMax, textVMax, SURFACE_TEXT_OFFSET_MM + 3.4),
    faceDisplayPointFromLocal(info.face, info.sideFactor, textHMin, textVMax, SURFACE_TEXT_OFFSET_MM + 3.4),
  ];
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([...outlinePoints, outlinePoints[0]]);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x0e82d8, transparent: true, opacity: 0.95, depthTest: false });
  const outline = new THREE.Line(outlineGeometry, outlineMaterial);
  outline.renderOrder = 20;
  textSelectionGroup.add(outline);

  // Horizontal measurements follow the actual sticker endpoints. When the text
  // bends around a corner, the right/left guide therefore continues from the
  // final strip on that adjacent side rather than reporting 0 mm at the seam.
  const endpoints = placementHorizontalEndpoints(placement);
  const leftGuide = endpoints ? flatBoundaryGuide(endpoints.left) : null;
  const rightGuide = endpoints ? flatBoundaryGuide(endpoints.right) : null;
  if (leftGuide) {
    addWorldDistanceGuide('left', leftGuide.start, leftGuide.end, leftGuide.direction, leftGuide.normal, leftGuide.distance);
  } else {
    addDistanceGuide('left',
      faceDisplayPointFromLocal(info.face, info.sideFactor, textHMin, vCenter),
      faceDisplayPointFromLocal(info.face, info.sideFactor, surfaceHMin, vCenter),
      basis.horizontal.clone().multiplyScalar(-1), basis, textHMin - surfaceHMin);
  }
  if (rightGuide) {
    addWorldDistanceGuide('right', rightGuide.start, rightGuide.end, rightGuide.direction, rightGuide.normal, rightGuide.distance);
  } else {
    addDistanceGuide('right',
      faceDisplayPointFromLocal(info.face, info.sideFactor, textHMax, vCenter),
      faceDisplayPointFromLocal(info.face, info.sideFactor, surfaceHMax, vCenter),
      basis.horizontal.clone(), basis, surfaceHMax - textHMax);
  }

  // Vertical distances are taken at the middle of the textbox. This makes an
  // L-shaped elevation report the local height directly above/below the text
  // center instead of using a larger rectangular bounding face elsewhere.
  addDistanceGuide('down',
    faceDisplayPointFromLocal(info.face, info.sideFactor, hCenter, textVMin),
    faceDisplayPointFromLocal(info.face, info.sideFactor, hCenter, surfaceVMin),
    basis.vertical.clone().multiplyScalar(-1), basis, textVMin - surfaceVMin);
  addDistanceGuide('up',
    faceDisplayPointFromLocal(info.face, info.sideFactor, hCenter, textVMax),
    faceDisplayPointFromLocal(info.face, info.sideFactor, hCenter, surfaceVMax),
    basis.vertical.clone(), basis, surfaceVMax - textVMax);

  // Put the action arc diagonally outside the selected text, between the right
  // and down measurement axes, so none of the four distance guides is hidden.
  textHudAnchor = faceDisplayPointFromLocal(info.face, info.sideFactor, textHMax, textVMin, SURFACE_TEXT_OFFSET_MM + 4);
  renderTextGuideLabels();
  textSelectionHud.hidden = false;
  textSelectionHud.style.display = '';
}
function selectTextPlacement(id) {
  const placement = placementById(id);
  if (!placement) return;
  deselectFace();
  selectedTextId = ensurePlacementId(placement);
  selectedTextConstraint = '';
  selectedTextConstraintFace = null;
  selectedTextConstraintSideFactor = 1;
  selectedTextConstraintFixedS = null;
  rebuildSurfaceMeshes();
  renderTextSelection();
}
function deselectTextPlacement() {
  selectedTextId = '';
  selectedTextConstraint = '';
  selectedTextConstraintFace = null;
  selectedTextConstraintSideFactor = 1;
  selectedTextConstraintFixedS = null;
  textDragging = false;
  textDragPointerId = null;
  textDragMoved = false;
  controls.enabled = true;
  canvasHost.classList.remove('is-text-dragging', 'has-selected-text');
  rebuildSurfaceMeshes();
  renderTextSelection();
}

function renderTranslations() {
  document.documentElement.lang = locale.startsWith('ro') ? 'ro' : locale.startsWith('de') ? 'de' : 'en';
  document.querySelectorAll('[data-cardbox-i18n]').forEach((el) => { el.textContent = t(el.dataset.cardboxI18n); });
  document.querySelectorAll('[data-cardbox-i18n-title]').forEach((el) => { el.title = t(el.dataset.cardboxI18nTitle); el.setAttribute('aria-label', t(el.dataset.cardboxI18nTitle)); });
  viewerHint.textContent = placementMode ? t('viewer.hint.placement') : t('viewer.hint');
}
function renderInputs() {
  const base = baseBox();
  widthInput.value = round(fromMm(base.maxX - base.minX), units === 'imperial' ? 2 : 0);
  depthInput.value = round(fromMm(base.maxZ - base.minZ), units === 'imperial' ? 2 : 0);
  heightInput.value = round(fromMm(base.maxY - base.minY), units === 'imperial' ? 2 : 0);
  floorThicknessInput.value = round(fromMm(state.boardThickness), units === 'imperial' ? 2 : 1);
  const imperial = units === 'imperial';
  document.querySelectorAll('[data-unit-label]').forEach((el) => { el.textContent = imperial ? 'in' : 'mm'; });
}
function renderSummary() {
  const metrics = calculateUnionMetrics(state.boxes);
  const areaM2 = metrics.areaMm2 / 1_000_000;
  const volumeM3 = metrics.volumeMm3 / 1_000_000_000;
  const materialEur = areaM2 * BOARD_EUR_M2;
  const textEur = state.textPlacements.length * 0.35;
  const setupEur = 0.95 + Math.max(0, state.boxes.length - 1) * 0.18;
  const totalEur = materialEur + textEur + setupEur;
  $('#summaryPieces').textContent = String(state.boxes.length);
  $('#summarySides').textContent = String(metrics.faces.length);
  $('#summaryBoardArea').textContent = `${areaM2.toFixed(3)} m²`;
  $('#summaryVolume').textContent = `${volumeM3.toFixed(3)} m³`;
  $('#priceBreakdown').innerHTML = [[t('summary.material'), materialEur], [t('summary.text'), textEur], [t('summary.setup'), setupEur]].map(([label, value]) => `<div class="price-row"><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join('');
  summaryTotal.textContent = formatMoney(totalEur);
}

function renderFacePopup() {
  if (!selectedFaceSnapshot || addMode || placementMode || !textEditorPanel.hidden) {
    faceActionPopup.hidden = true;
    return;
  }
  faceActionPopup.hidden = false;
  updateFacePopupPosition();
}
function updateFacePopupPosition() {
  if (faceActionPopup.hidden || !selectedFaceSnapshot) return;
  const world = faceCenter(selectedFaceSnapshot).add(faceNormal(selectedFaceSnapshot).multiplyScalar(10 * selectedFaceSideFactor));
  const projected = world.project(camera);
  const rect = canvasHost.getBoundingClientRect();
  if (projected.z < -1 || projected.z > 1) { faceActionPopup.hidden = true; return; }
  faceActionPopup.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
  faceActionPopup.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
}
function renderAll() {
  renderInputs(); renderTranslations(); renderSummary(); rebuildSurfaceMeshes(); renderFacePopup(); renderTextSelection();
}

function selectFace(face, sideFactor = 1) {
  deselectTextPlacement();
  const key = faceKey(face);
  if (selectedFaceKey === key) { deselectFace(); return; }
  selectedFaceKey = key;
  selectedFaceSnapshot = { ...face };
  selectedFaceSideFactor = sideFactor >= 0 ? 1 : -1;
  textEditorPanel.hidden = true;
  clearEditorPreview();
  renderAll();
}
function deselectFace() {
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  selectedFaceSideFactor = 1;
  faceActionPopup.hidden = true;
  textEditorPanel.hidden = true;
  clearEditorPreview();
  if (!addMode && !placementMode) rebuildSurfaceMeshes();
}

function newAttachedBox(face, width, height, depth) {
  const center = faceCenter(face);
  const normal = faceNormal(face);
  const halfW = width / 2;
  const halfH = height / 2;
  const minY = center.y - halfH;
  const maxY = center.y + halfH;
  if (face.axis === 'x') {
    const minZ = center.z - halfW, maxZ = center.z + halfW;
    if (face.sign > 0) return { id: `piece-${Date.now()}`, minX: face.coord, maxX: face.coord + depth, minY, maxY, minZ, maxZ };
    return { id: `piece-${Date.now()}`, minX: face.coord - depth, maxX: face.coord, minY, maxY, minZ, maxZ };
  }
  const minX = center.x - halfW, maxX = center.x + halfW;
  if (face.sign > 0) return { id: `piece-${Date.now()}`, minX, maxX, minY, maxY, minZ: face.coord, maxZ: face.coord + depth };
  return { id: `piece-${Date.now()}`, minX, maxX, minY, maxY, minZ: face.coord - depth, maxZ: face.coord };
}
function beginAddMode() {
  if (!selectedFaceSnapshot || !isVerticalFace(selectedFaceSnapshot)) return;
  const defaultWidth = faceHorizontalWidth(selectedFaceSnapshot) / 2;
  const defaultHeight = faceHeight(selectedFaceSnapshot) / 2;
  const defaultDepth = Math.min(defaultWidth, defaultHeight);
  draftBeforeState = { selectedFaceKey, selectedFaceSnapshot: { ...selectedFaceSnapshot }, selectedFaceSideFactor };
  draftBox = newAttachedBox(selectedFaceSnapshot, defaultWidth, defaultHeight, defaultDepth);
  addMode = true;
  faceActionPopup.hidden = true;
  textEditorPanel.hidden = true;
  clearEditorPreview();
  pieceWidthInput.value = round(fromMm(defaultWidth), units === 'imperial' ? 2 : 0);
  pieceHeightInput.value = round(fromMm(defaultHeight), units === 'imperial' ? 2 : 0);
  pieceDepthInput.value = round(fromMm(defaultDepth), units === 'imperial' ? 2 : 0);
  pieceError.hidden = true;
  addBoxEditor.hidden = false;
  renderAll();
}
function updateDraftFromEditor() {
  if (!addMode || !selectedFaceSnapshot) return;
  const width = clamp(toMm(pieceWidthInput.value), 20, 3000);
  const height = clamp(toMm(pieceHeightInput.value), 20, 3000);
  const depth = clamp(toMm(pieceDepthInput.value), 20, 3000);
  if (!(width > 0 && height > 0 && depth > 0)) {
    pieceError.textContent = t('error.invalidPiece'); pieceError.hidden = false; return;
  }
  pieceError.hidden = true;
  draftBox = newAttachedBox(selectedFaceSnapshot, width, height, depth);
  renderAll();
}
function finishAddMode() {
  if (!addMode || !draftBox) return;
  recordUndoCheckpoint();
  state.boxes.push(cloneBox(draftBox));
  draftBox = null;
  draftBeforeState = null;
  addMode = false;
  addBoxEditor.hidden = true;
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  renderAll();
  markConfigurationDirty();
}
function cancelAddMode() {
  draftBox = null;
  addMode = false;
  addBoxEditor.hidden = true;
  if (draftBeforeState) {
    selectedFaceKey = draftBeforeState.selectedFaceKey;
    selectedFaceSnapshot = { ...draftBeforeState.selectedFaceSnapshot };
    selectedFaceSideFactor = draftBeforeState.selectedFaceSideFactor || 1;
  }
  draftBeforeState = null;
  renderAll();
}

function buildTextSpec() {
  return {
    text: (textContentInput.value || '').trim() || 'TEXT',
    size: clamp(textSizeInput.value, 12, 180),
    fontFamily: textFontSelect.value,
    textColor: currentTextColor,
    backgroundColor: currentBackgroundColor,
    bold: textBoldToggle.checked,
    italic: textItalicToggle.checked,
    underline: textUnderlineToggle.checked,
    underlineStyle: textUnderlineStyle.value,
  };
}
function populateTextEditor(spec) {
  const source = spec || {};
  textContentInput.value = source.text || 'TEXT';
  textSizeInput.value = String(clamp(source.size || 54, 12, 180));
  textFontSelect.value = source.fontFamily || 'Arial, sans-serif';
  currentTextColor = source.textColor || '#1f2d36';
  currentBackgroundColor = source.backgroundColor || 'transparent';
  textBoldToggle.checked = Boolean(source.bold);
  textItalicToggle.checked = Boolean(source.italic);
  textUnderlineToggle.checked = Boolean(source.underline);
  textUnderlineStyle.value = source.underlineStyle || 'solid';
  syncPaletteSelection(textColorPalette, currentTextColor);
  syncPaletteSelection(textBackgroundPalette, currentBackgroundColor);
}
function startTextEditor() {
  if (!selectedFaceSnapshot) return;
  editingTextId = '';
  editingTextOriginalSpec = null;
  faceActionPopup.hidden = true;
  textEditorPanel.hidden = false;
  // Keep the actual face color untouched while styling text; selection is shown
  // only by the discrete outline/corner markers in the main face-action state.
  rebuildSurfaceMeshes();
  renderEditorPreview();
  renderTextSelection();
}
function editSelectedText() {
  const placement = placementById(selectedTextId);
  const info = resolvePlacementFaceInfo(placement);
  if (!placement || !info) return;
  editingTextId = ensurePlacementId(placement);
  editingTextOriginalSpec = { ...placement.spec };
  selectedFaceSnapshot = copyFace(info.face);
  selectedFaceSideFactor = info.sideFactor;
  selectedFaceKey = '';
  populateTextEditor(placement.spec);
  faceActionPopup.hidden = true;
  textEditorPanel.hidden = false;
  renderPlacedTexts();
  renderEditorPreview();
  renderTextSelection();
}
function backFromTextEditor() {
  textEditorPanel.hidden = true;
  clearEditorPreview();
  if (editingTextId) {
    editingTextId = '';
    editingTextOriginalSpec = null;
    selectedFaceSnapshot = null;
    selectedFaceKey = '';
    renderPlacedTexts();
    renderTextSelection();
    return;
  }
  rebuildSurfaceMeshes();
  renderFacePopup();
}
function enterPlacementMode() {
  if (editingTextId) {
    const placement = placementById(editingTextId);
    const info = resolvePlacementFaceInfo(placement);
    if (placement && info) {
      recordUndoCheckpoint();
      placement.spec = buildTextSpec();
      applyPlacementGeometry(placement, info.face, info.anchor, info.sideFactor);
    }
    editingTextId = '';
    editingTextOriginalSpec = null;
    textEditorPanel.hidden = true;
    clearEditorPreview();
    selectedFaceSnapshot = null;
    selectedFaceKey = '';
    renderAll();
    markConfigurationDirty();
    return;
  }
  pendingTextSpec = buildTextSpec();
  placementMode = true;
  faceActionPopup.hidden = true;
  textEditorPanel.hidden = true;
  clearEditorPreview();
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  cancelTextPlacementButton.hidden = false;
  renderAll();
}
function exitPlacementMode() {
  placementMode = false;
  pendingTextSpec = null;
  previewPlacement = null;
  previewTextMesh = null;
  clearGroup(previewGroup);
  cancelTextPlacementButton.hidden = true;
  renderAll();
}

function raycast(event, objects = surfaceMeshes, recursive = false) {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, recursive)[0] || null;
  return { hit, raycaster };
}
function raycastText(event) {
  return raycast(event, textGroup.children, true);
}

function updateSelectedTextGeometry(placement, face, anchor, sideFactor) {
  if (!placement || !face || !anchor) return false;
  const applied = applyPlacementGeometry(placement, face, anchor, sideFactor);
  if (!applied) return false;
  renderPlacedTexts();
  renderTextSelection();
  return true;
}
function nearestPlaneEntryForS(referenceFace, sideFactor, s) {
  const entries = verticalPlaneEntries(referenceFace, sideFactor);
  if (!entries.length) return null;
  return [...entries].sort((a, b) => {
    const da = s < a.sMin ? a.sMin - s : s > a.sMax ? s - a.sMax : 0;
    const db = s < b.sMin ? b.sMin - s : s > b.sMax ? s - b.sMax : 0;
    return da - db;
  })[0] || null;
}
function horizontalConstraintAnchor(placement, referenceFace, sideFactor, desiredPoint) {
  const horizontal = verticalFaceTangent(referenceFace, sideFactor).normalize();
  const currentInfo = placementCenterFaceInfo(placement) || resolvePlacementFaceInfo(placement);
  if (!currentInfo) return null;
  const currentS = currentInfo.anchor.dot(horizontal);
  let desiredS = desiredPoint.dot(horizontal);
  let targetFace = planeFaceAt(referenceFace, sideFactor, desiredS, currentInfo.anchor.y);
  if (!targetFace) {
    const nearest = nearestPlaneEntryForS(referenceFace, sideFactor, desiredS);
    if (!nearest) return null;
    desiredS = clamp(desiredS, nearest.sMin, nearest.sMax);
    targetFace = nearest.face;
  }

  let verticalRun = planeVerticalRunAtS(referenceFace, sideFactor, desiredS, currentInfo.anchor.y);
  if (!verticalRun) return null;
  let targetY = (verticalRun.min + verticalRun.max) / 2;
  targetFace = planeFaceAt(referenceFace, sideFactor, desiredS, targetY) || targetFace;
  let flatRun = planeHorizontalRunAtY(referenceFace, sideFactor, targetY, desiredS);
  if (!flatRun) return null;
  let dimensions = stickerDimensionsForPlacementOnFace(placement, targetFace);
  const flatWidth = flatRun.max - flatRun.min;

  // A normal-size sticker stays entirely on the current flat side while the
  // horizontal-center lock is active. Its center is clamped by half the real
  // sticker width, so the textbox border can never slide through the side edge.
  if (dimensions.width <= flatWidth + EPSILON) {
    const minS = flatRun.min + dimensions.width / 2;
    const maxS = flatRun.max - dimensions.width / 2;
    desiredS = clamp(desiredS, Math.min(minS, maxS), Math.max(minS, maxS));
    selectedTextConstraintFixedS = desiredS; // last valid horizontal position

    verticalRun = planeVerticalRunAtS(referenceFace, sideFactor, desiredS, targetY) || verticalRun;
    targetY = (verticalRun.min + verticalRun.max) / 2;
    targetFace = planeFaceAt(referenceFace, sideFactor, desiredS, targetY) || targetFace;
    flatRun = planeHorizontalRunAtY(referenceFace, sideFactor, targetY, desiredS) || flatRun;
    dimensions = stickerDimensionsForPlacementOnFace(placement, targetFace);
    if (dimensions.width > flatRun.max - flatRun.min + EPSILON) return null;
    return { face: targetFace, anchor: verticalPlanePoint(referenceFace, sideFactor, desiredS, targetY), sideFactor, tooWide: false };
  }

  // If the artwork is literally wider than that side, wrapping is required.
  // Keep its horizontal coordinate fixed while the lock is active so dragging
  // cannot squeeze it into an edge or move it through empty space.
  const fixedS = Number.isFinite(selectedTextConstraintFixedS) ? selectedTextConstraintFixedS : currentS;
  const fixedVerticalRun = planeVerticalRunAtS(referenceFace, sideFactor, fixedS, currentInfo.anchor.y);
  if (!fixedVerticalRun) return null;
  const fixedY = (fixedVerticalRun.min + fixedVerticalRun.max) / 2;
  const fixedFace = planeFaceAt(referenceFace, sideFactor, fixedS, fixedY) || currentInfo.face;
  return { face: fixedFace, anchor: verticalPlanePoint(referenceFace, sideFactor, fixedS, fixedY), sideFactor, tooWide: true };
}
function verticalConstraintAnchor(placement, referenceFace, sideFactor, desiredPoint) {
  const horizontal = verticalFaceTangent(referenceFace, sideFactor).normalize();
  const currentInfo = placementCenterFaceInfo(placement) || resolvePlacementFaceInfo(placement);
  if (!currentInfo) return null;
  const currentS = currentInfo.anchor.dot(horizontal);
  let fixedS = Number.isFinite(selectedTextConstraintFixedS) ? selectedTextConstraintFixedS : currentS;
  const verticalRun = planeVerticalRunAtS(referenceFace, sideFactor, fixedS, desiredPoint.y);
  if (!verticalRun) return null;
  let targetY = desiredPoint.y;
  let targetFace = planeFaceAt(referenceFace, sideFactor, fixedS, targetY) || currentInfo.face;
  const dimensions = stickerDimensionsForPlacementOnFace(placement, targetFace);
  if (dimensions.height >= verticalRun.max - verticalRun.min - EPSILON) {
    targetY = (verticalRun.min + verticalRun.max) / 2;
  } else {
    targetY = clamp(targetY, verticalRun.min + dimensions.height / 2, verticalRun.max - dimensions.height / 2);
  }
  targetFace = planeFaceAt(referenceFace, sideFactor, fixedS, targetY) || targetFace;
  return { face: targetFace, anchor: verticalPlanePoint(referenceFace, sideFactor, fixedS, targetY), sideFactor };
}
function genericConstraintAnchor(placement, face, sideFactor, mode, desiredPoint) {
  const local = pointToFaceLocal(face, sideFactor, desiredPoint);
  const artwork = createTextArtwork(placement.spec);
  const marginH = artwork.worldWidth / 2;
  const marginV = artwork.worldHeight / 2;
  artwork.texture.dispose();
  let h = local.h;
  let v = local.v;
  if (mode === 'horizontal') {
    v = 0;
    if (marginH >= local.basis.hMax - local.basis.hMin) h = 0;
    else h = clamp(h, local.basis.hMin + marginH, local.basis.hMax - marginH);
  } else {
    h = 0;
    if (marginV >= local.basis.vMax - local.basis.vMin) v = 0;
    else v = clamp(v, local.basis.vMin + marginV, local.basis.vMax - marginV);
  }
  return { face, anchor: facePointFromLocal(face, sideFactor, h, v, 0), sideFactor };
}
function toggleSelectedTextConstraint(mode) {
  const placement = placementById(selectedTextId);
  if (!placement) return;
  if (selectedTextConstraint === mode) {
    selectedTextConstraint = '';
    selectedTextConstraintFace = null;
    selectedTextConstraintSideFactor = 1;
    selectedTextConstraintFixedS = null;
    renderTextSelection();
    return;
  }
  const info = placementCenterFaceInfo(placement) || resolvePlacementPrimaryFaceInfo(placement);
  if (!info) return;
  recordUndoCheckpoint();
  selectedTextConstraint = mode;
  selectedTextConstraintFace = copyFace(info.face);
  selectedTextConstraintSideFactor = info.sideFactor;
  selectedTextConstraintFixedS = null;

  let result;
  if (isVerticalFace(info.face)) {
    const horizontal = verticalFaceTangent(info.face, info.sideFactor).normalize();
    const currentS = info.anchor.dot(horizontal);
    if (mode === 'vertical') {
      const flatRun = planeHorizontalRunAtY(info.face, info.sideFactor, info.anchor.y, currentS);
      selectedTextConstraintFixedS = flatRun ? (flatRun.min + flatRun.max) / 2 : currentS;
      result = verticalConstraintAnchor(placement, info.face, info.sideFactor, info.anchor);
    } else {
      selectedTextConstraintFixedS = currentS;
      result = horizontalConstraintAnchor(placement, info.face, info.sideFactor, info.anchor);
    }
  } else {
    result = genericConstraintAnchor(placement, info.face, info.sideFactor, mode, info.anchor);
  }
  if (!result) return;
  selectedTextConstraintFace = copyFace(result.face);
  selectedTextConstraintSideFactor = result.sideFactor;
  updateSelectedTextGeometry(placement, result.face, result.anchor, result.sideFactor);
  markConfigurationDirty();
}
function deleteSelectedText() {
  if (!selectedTextId) return;
  recordUndoCheckpoint();
  state.textPlacements = state.textPlacements.filter((placement) => ensurePlacementId(placement) !== selectedTextId);
  editingTextId = '';
  editingTextOriginalSpec = null;
  deselectTextPlacement();
  renderAll();
  markConfigurationDirty();
}
function dragPointOnConstraintFace(event, placement, face, sideFactor, mode) {
  const { raycaster } = raycast(event, []);
  const basis = faceBasis(face, sideFactor);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(basis.normal, basis.center);
  const hitPoint = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null;
  if (isVerticalFace(face)) {
    return mode === 'horizontal'
      ? horizontalConstraintAnchor(placement, face, sideFactor, hitPoint)
      : verticalConstraintAnchor(placement, face, sideFactor, hitPoint);
  }
  return genericConstraintAnchor(placement, face, sideFactor, mode, hitPoint);
}
function moveSelectedTextWithPointer(event) {
  if (!textDragging || !selectedTextId) return false;
  const placement = placementById(selectedTextId);
  if (!placement) return false;
  if (selectedTextConstraint && selectedTextConstraintFace) {
    const face = currentFaceForDescriptor(selectedTextConstraintFace) || selectedTextConstraintFace;
    const result = dragPointOnConstraintFace(event, placement, face, selectedTextConstraintSideFactor, selectedTextConstraint);
    if (!result) return false;
    selectedTextConstraintFace = copyFace(result.face);
    selectedTextConstraintSideFactor = result.sideFactor;
    textDragMoved = true;
    suppressCanvasClick = true;
    return updateSelectedTextGeometry(placement, result.face, result.anchor, result.sideFactor);
  }

  const { hit, raycaster } = raycast(event, surfaceMeshes, false);
  if (!hit?.object?.userData?.face) return false;
  const face = hit.object.userData.face;
  let normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  if (normal.dot(raycaster.ray.direction) > 0) normal.multiplyScalar(-1);
  const outward = faceNormal(face);
  const sideFactor = normal.dot(outward) >= 0 ? 1 : -1;
  const anchor = clampPointToFace(face, sideFactor, hit.point.clone());
  textDragMoved = true;
  suppressCanvasClick = true;
  return updateSelectedTextGeometry(placement, face, anchor, sideFactor);
}
function beginSelectedTextDrag(event) {
  if (event.button !== 0 || !selectedTextId || placementMode || addMode || editingTextId || !textEditorPanel.hidden) return false;
  const { hit } = raycastText(event);
  if (!hit || hit.object.userData.textPlacementId !== selectedTextId) return false;
  recordUndoCheckpoint();
  textDragging = true;
  textDragPointerId = event.pointerId;
  textDragMoved = false;
  controls.enabled = false;
  canvasHost.classList.add('is-text-dragging');
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* optional */ }
  event.preventDefault();
  return true;
}
function endSelectedTextDrag(event) {
  if (!textDragging) return false;
  if (textDragPointerId != null && event.pointerId !== textDragPointerId) return false;
  const moved = textDragMoved;
  textDragging = false;
  textDragPointerId = null;
  textDragMoved = false;
  controls.enabled = true;
  canvasHost.classList.remove('is-text-dragging');
  try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* optional */ }
  renderTextSelection();
  if (moved) markConfigurationDirty();
  return true;
}
function updateTextPreview(event) {
  if (!placementMode || !pendingTextSpec) return;
  clearGroup(previewGroup);
  previewTextMesh = null;
  previewPlacement = null;
  const { hit, raycaster } = raycast(event);
  if (!hit) return;
  let normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  if (normal.dot(raycaster.ray.direction) > 0) normal.multiplyScalar(-1);
  const face = hit.object.userData.face;
  if (isVerticalFace(face)) {
    const outward = faceNormal(face);
    const sideFactor = normal.dot(outward) >= 0 ? 1 : -1;
    const anchor = clampPointToFace(face, sideFactor, hit.point.clone());
    const sticker = createWrappedSticker(pendingTextSpec, face, anchor.clone(), sideFactor, 0.78);
    previewGroup.add(sticker.group);
    previewPlacement = {
      id: makeTextPlacementId(), face: copyFace(face), sideFactor, anchor: anchor.toArray(),
      segments: sticker.segments.map((segment) => ({ ...segment, face: copyFace(segment.face) })),
      spec: { ...pendingTextSpec },
    };
    return;
  }
  const outward = faceNormal(face);
  const sideFactor = normal.dot(outward) >= 0 ? 1 : -1;
  const position = hit.point.clone().add(normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM));
  const quaternion = quaternionForNormal(normal);
  const mesh = createTextMesh(pendingTextSpec, 0.78);
  mesh.position.copy(position); mesh.quaternion.copy(quaternion);
  previewGroup.add(mesh); previewTextMesh = mesh;
  const topSurface = Boolean(hit.object.userData.top);
  const storedPosition = position.clone();
  const storedAnchor = hit.point.clone();
  if (topSurface) { storedPosition.y -= LID_LIFT_MM; storedAnchor.y -= LID_LIFT_MM; }
  previewPlacement = {
    id: makeTextPlacementId(), face: copyFace(face), sideFactor, anchor: storedAnchor.toArray(),
    position: storedPosition.toArray(), quaternion: quaternion.toArray(), topSurface, spec: { ...pendingTextSpec },
  };
}
function commitTextPlacement() {
  if (!previewPlacement) return;
  recordUndoCheckpoint();
  const placement = { ...previewPlacement, spec: { ...previewPlacement.spec } };
  ensurePlacementId(placement);
  state.textPlacements.push(placement);
  exitPlacementMode();
  markConfigurationDirty();
}

function renderDimensions() {
  dimensionLayer.hidden = !dimensionsVisible;
  if (!dimensionsVisible) { dimensionLayer.innerHTML = ''; return; }
  dimensionLayer.innerHTML = dimensionAnchors.map((item, i) => `<div class="dimension-label" data-dimension-index="${i}">${item.label}</div>`).join('');
}
function updateOverlayPositions() {
  const rect = canvasHost.getBoundingClientRect();
  dimensionAnchors.forEach((item, i) => {
    const projected = item.point.clone().project(camera);
    const el = dimensionLayer.querySelector(`[data-dimension-index="${i}"]`); if (!el) return;
    const visible = projected.z > -1 && projected.z < 1;
    el.style.display = visible ? '' : 'none';
    el.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
  });
  textGuidePoints.forEach((guide) => {
    const projected = guide.point.clone().project(camera);
    const el = textGuideLayer.querySelector(`[data-text-guide="${guide.id}"]`);
    if (!el) return;
    const visible = projected.z > -1 && projected.z < 1;
    el.style.display = visible ? '' : 'none';
    el.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
  });
  if (!textSelectionHud.hidden && textHudAnchor) {
    const projected = textHudAnchor.clone().project(camera);
    const visible = projected.z > -1 && projected.z < 1;
    textSelectionHud.style.display = visible ? '' : 'none';
    if (visible) {
      const rawLeft = (projected.x * 0.5 + 0.5) * rect.width;
      const rawTop = (-projected.y * 0.5 + 0.5) * rect.height;
      const hudWidth = textSelectionHud.offsetWidth || 230;
      const hudHeight = textSelectionHud.offsetHeight || 132;
      textSelectionHud.style.left = `${clamp(rawLeft, 4, Math.max(4, rect.width - hudWidth - 18))}px`;
      textSelectionHud.style.top = `${clamp(rawTop, 4, Math.max(4, rect.height - hudHeight - 18))}px`;
    }
  } else {
    textSelectionHud.style.display = 'none';
  }
  updateFacePopupPosition();
}

function updateBaseDimension(axis, value) {
  const base = baseBox();
  const mm = axis === 'height' ? clamp(toMm(value), 50, 2000) : clamp(toMm(value), 100, 3000);
  if (axis === 'width') { const c = (base.minX + base.maxX) / 2; base.minX = c - mm / 2; base.maxX = c + mm / 2; }
  if (axis === 'depth') { const c = (base.minZ + base.maxZ) / 2; base.minZ = c - mm / 2; base.maxZ = c + mm / 2; }
  if (axis === 'height') base.maxY = base.minY + mm;
  deselectFace(); renderAll();
}
function bindPalette(container, assign) {
  container?.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      assign(button.dataset.color || 'transparent');
      syncPaletteSelection(container, button.dataset.color || 'transparent');
      renderEditorPreview();
    });
  });
}
function bindTextPreviewControls() {
  [textContentInput, textSizeInput, textFontSelect, textUnderlineStyle].forEach((input) => input.addEventListener('input', renderEditorPreview));
  [textBoldToggle, textItalicToggle, textUnderlineToggle].forEach((input) => input.addEventListener('change', renderEditorPreview));
  bindPalette(textColorPalette, (value) => { currentTextColor = value; });
  bindPalette(textBackgroundPalette, (value) => { currentBackgroundColor = value; });
  syncPaletteSelection(textColorPalette, currentTextColor);
  syncPaletteSelection(textBackgroundPalette, currentBackgroundColor);
}

function bindAccordions() {
  document.querySelectorAll('.accordion-toggle').forEach((button) => button.addEventListener('click', () => {
    const section = button.closest('.accordion-section'); const panel = section.querySelector('.accordion-panel'); const open = !section.classList.contains('is-open');
    section.classList.toggle('is-open', open); button.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
  }));
}
function bindControls() {
  widthInput.addEventListener('change', () => updateBaseDimension('width', widthInput.value));
  depthInput.addEventListener('change', () => updateBaseDimension('depth', depthInput.value));
  heightInput.addEventListener('change', () => updateBaseDimension('height', heightInput.value));
  floorThicknessInput.addEventListener('change', () => { state.boardThickness = clamp(toMm(floorThicknessInput.value), 1, 20); renderInputs(); });
  $('#faceAddButton').addEventListener('click', beginAddMode);
  $('#faceTextButton').addEventListener('click', startTextEditor);
  faceDismissButton.addEventListener('click', deselectFace);
  $('#backFromTextButton').addEventListener('click', backFromTextEditor);
  $('#startTextPlacementButton').addEventListener('click', enterPlacementMode);
  cancelTextPlacementButton.addEventListener('click', exitPlacementMode);
  [pieceWidthInput, pieceHeightInput, pieceDepthInput].forEach((input) => input.addEventListener('change', updateDraftFromEditor));
  $('#confirmAddPieceButton').addEventListener('click', finishAddMode);
  $('#cancelAddPieceButton').addEventListener('click', cancelAddMode);
  textHorizontalLockButton.addEventListener('click', () => toggleSelectedTextConstraint('horizontal'));
  textVerticalLockButton.addEventListener('click', () => toggleSelectedTextConstraint('vertical'));
  textEditButton.addEventListener('click', editSelectedText);
  textDeleteButton.addEventListener('click', deleteSelectedText);
  textDismissButton.addEventListener('click', deselectTextPlacement);
  bindTextPreviewControls();
}

renderer.domElement.addEventListener('dblclick', (event) => {
  if (addMode || placementMode || editingTextId || !textEditorPanel.hidden) return;
  const textHit = raycastText(event).hit;
  const placementId = textHit?.object?.userData?.textPlacementId;
  if (placementId) {
    selectTextPlacement(placementId);
    event.preventDefault();
    return;
  }
  const { hit, raycaster } = raycast(event);
  if (!hit?.object?.userData?.vertical) return;
  const face = hit.object.userData.face;
  if (selectedFaceKey && selectedFaceKey === hit.object.userData.faceKey) { deselectFace(); return; }
  const outward = faceNormal(face);
  const sideFactor = outward.dot(raycaster.ray.direction) < 0 ? 1 : -1;
  selectFace(face, sideFactor);
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  beginSelectedTextDrag(event);
}, true);
renderer.domElement.addEventListener('pointermove', (event) => {
  if (textDragging) moveSelectedTextWithPointer(event);
  else updateTextPreview(event);
});
renderer.domElement.addEventListener('pointerup', endSelectedTextDrag);
renderer.domElement.addEventListener('pointercancel', endSelectedTextDrag);
renderer.domElement.addEventListener('click', (event) => {
  if (suppressCanvasClick) {
    suppressCanvasClick = false;
    return;
  }
  if (placementMode) {
    updateTextPreview(event);
    if (previewPlacement) commitTextPlacement();
    return;
  }
  if (addMode || editingTextId || !textEditorPanel.hidden) return;
  const textHit = raycastText(event).hit;
  if (textHit?.object?.userData?.textPlacementId) return;
  if (selectedTextId) deselectTextPlacement();
  const { hit } = raycast(event);
  if (!hit) deselectFace();
});

function resizeRenderer() {
  const width = Math.max(1, canvasHost.clientWidth), height = Math.max(1, canvasHost.clientHeight);
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
resizeObserver = new ResizeObserver(resizeRenderer); resizeObserver.observe(canvasHost); resizeRenderer();
function animate() { requestAnimationFrame(animate); controls.update(); updateOverlayPositions(); renderer.render(scene, camera); }
animate();

function serializeTextPlacement(placement) {
  return {
    id: ensurePlacementId(placement),
    face: placement.face ? copyFace(placement.face) : undefined,
    sideFactor: Number(placement.sideFactor) < 0 ? -1 : 1,
    anchor: Array.isArray(placement.anchor) ? [...placement.anchor] : undefined,
    position: Array.isArray(placement.position) ? [...placement.position] : undefined,
    quaternion: Array.isArray(placement.quaternion) ? [...placement.quaternion] : undefined,
    topSurface: Boolean(placement.topSurface),
    segments: Array.isArray(placement.segments) ? placement.segments.map((segment) => ({
      position: [...segment.position], quaternion: [...segment.quaternion],
      u0: segment.u0, u1: segment.u1, width: segment.width, height: segment.height,
      face: segment.face ? copyFace(segment.face) : undefined,
      sideFactor: Number(segment.sideFactor) < 0 ? -1 : 1,
    })) : undefined,
    spec: { ...placement.spec },
  };
}
function captureState() {
  return {
    version: 4,
    boxes: state.boxes.map(cloneBox),
    boardThickness: round(state.boardThickness),
    textPlacements: state.textPlacements.map(serializeTextPlacement),
  };
}
function restoreTextPlacement(raw = {}) {
  const placement = {
    id: String(raw.id || makeTextPlacementId()),
    face: raw.face ? copyFace(raw.face) : undefined,
    sideFactor: Number(raw.sideFactor) < 0 ? -1 : 1,
    anchor: Array.isArray(raw.anchor) ? raw.anchor.map(Number) : undefined,
    position: Array.isArray(raw.position) ? raw.position.map(Number) : undefined,
    quaternion: Array.isArray(raw.quaternion) ? raw.quaternion.map(Number) : undefined,
    topSurface: Boolean(raw.topSurface),
    segments: Array.isArray(raw.segments) ? raw.segments.map((segment) => ({
      position: Array.isArray(segment.position) ? segment.position.map(Number) : [0,0,0],
      quaternion: Array.isArray(segment.quaternion) ? segment.quaternion.map(Number) : [0,0,0,1],
      u0: Number(segment.u0) || 0,
      u1: Number(segment.u1) || 1,
      width: Number(segment.width) || 10,
      height: Number(segment.height) || 50,
      face: segment.face ? copyFace(segment.face) : undefined,
      sideFactor: Number(segment.sideFactor) < 0 ? -1 : 1,
    })) : undefined,
    spec: {
      text: raw.spec?.text || 'TEXT',
      size: clamp(raw.spec?.size || 54, 12, 180),
      fontFamily: raw.spec?.fontFamily || 'Arial, sans-serif',
      textColor: raw.spec?.textColor || '#1f2d36',
      backgroundColor: raw.spec?.backgroundColor || 'transparent',
      bold: Boolean(raw.spec?.bold),
      italic: Boolean(raw.spec?.italic),
      underline: Boolean(raw.spec?.underline),
      underlineStyle: raw.spec?.underlineStyle || 'solid',
    },
  };
  return placement;
}
function restoreState(snapshot) {
  const source = snapshot?.state && !snapshot.boxes ? snapshot.state : snapshot;
  if (!source || !Array.isArray(source.boxes) || source.boxes.length === 0) return false;
  const boxes = source.boxes.map((box, index) => ({ id: String(box.id || (index === 0 ? 'base' : `piece-${index}`)), minX: Number(box.minX), maxX: Number(box.maxX), minY: Number(box.minY), maxY: Number(box.maxY), minZ: Number(box.minZ), maxZ: Number(box.maxZ) }));
  if (boxes.some((box) => ![box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ].every(Number.isFinite) || box.maxX <= box.minX || box.maxY <= box.minY || box.maxZ <= box.minZ)) return false;
  state = {
    version: 4,
    boxes,
    boardThickness: clamp(source.boardThickness || 3, 1, 20),
    textPlacements: Array.isArray(source.textPlacements) ? source.textPlacements.map(restoreTextPlacement) : [],
  };
  addMode = false;
  draftBox = null;
  placementMode = false;
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  selectedTextId = '';
  selectedTextConstraint = '';
  selectedTextConstraintFace = null;
  selectedTextConstraintFixedS = null;
  editingTextId = '';
  addBoxEditor.hidden = true;
  textEditorPanel.hidden = true;
  cancelTextPlacementButton.hidden = true;
  clearEditorPreview();
  renderAll();
  return true;
}
function resetConfiguration() {
  state = { version: 4, boxes: [makeBaseBox()], boardThickness: 3, textPlacements: [] };
  addMode = false;
  draftBox = null;
  placementMode = false;
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  selectedTextId = '';
  selectedTextConstraint = '';
  selectedTextConstraintFace = null;
  selectedTextConstraintFixedS = null;
  editingTextId = '';
  addBoxEditor.hidden = true;
  textEditorPanel.hidden = true;
  cancelTextPlacementButton.hidden = true;
  clearEditorPreview();
  renderAll();
  return true;
}
function setUnits(value) { units = value === 'imperial' ? 'imperial' : 'metric'; renderAll(); }
function setCurrency(value) { currency = ['USD','RON','EUR'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'EUR'; renderSummary(); }
function setLocale(value) { if (TEXT[value]) locale = value; renderAll(); }
function setDarkMode(value) { document.body.classList.toggle('cardbox-dark-mode', Boolean(value)); scene.background.set(Boolean(value) ? 0x172027 : 0xf0f4f6); ground.material.color.set(Boolean(value) ? 0x141b20 : 0xe7ecef); }
function toggleDimensions() { dimensionsVisible = !dimensionsVisible; renderDimensions(); return dimensionsVisible; }
function toggleTechnicalEdges() { technicalEdgesVisible = !technicalEdgesVisible; rebuildSurfaceMeshes(); return technicalEdgesVisible; }
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3; const b = boundsForBoxes(); const maxDim = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, b.maxY - b.minY + (isLidLiftActive() ? LID_LIFT_MM : 0), 400);
  if (cameraMode === 1) camera.position.set(0, maxDim * 1.8, 0.01); else if (cameraMode === 2) camera.position.set(maxDim * 1.45, maxDim * 0.65, 0); else camera.position.set(maxDim * 1.2, maxDim * 0.9, maxDim * 1.25);
  fitControlsTarget(); controls.update();
}
function getPrice() { const metrics = calculateUnionMetrics(state.boxes); const eur = metrics.areaMm2 / 1_000_000 * BOARD_EUR_M2 + state.textPlacements.length * 0.35 + 0.95 + Math.max(0, state.boxes.length - 1) * 0.18; return { amount: eur * (CURRENCY_FROM_EUR[currency] || 1), currency }; }

window.CARDBOX_CONFIGURATOR_API = { captureState, restoreState, resetConfiguration, setUnits, setCurrency, setLocale, setDarkMode, toggleDimensions, toggleTechnicalEdges, cycleCamera, getPrice, syncToolButtons() {}, closeToolPanels() {} };

bindAccordions(); bindControls(); renderAll();
window.addEventListener('beforeunload', () => resizeObserver?.disconnect());
