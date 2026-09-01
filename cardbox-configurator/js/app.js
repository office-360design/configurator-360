import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BOARD_EUR_M2 = 1.55;
const DEFAULT_COLOR = '#c78f5a';
const CURRENCY_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const LID_LIFT_MM = 1000;
const SURFACE_OFFSET_MM = 1.2;

const TEXT = Object.freeze({
  'en-US': Object.freeze({
    'intro.eyebrow': 'Packaging geometry',
    'intro.title': 'Cardboard box settings',
    'intro.copy': 'Start from a rectangular box, add more box pieces to a selected face, and place custom text on any inner or outer surface.',
    'section.geometry': 'Box geometry',
    'section.face': 'Selected face',
    'section.summary': 'Summary & pricing',
    'dimension.width': 'Overall width',
    'dimension.depth': 'Overall depth',
    'dimension.height': 'Box height',
    'dimension.floor': 'Board / lid thickness',
    'geometry.helpTitle': 'How to add more box pieces',
    'geometry.helpCopy': 'Double-click a vertical face in the viewer. A plus button appears on that face. Click it, set the new piece dimensions, and it will be centered on that face.',
    'face.none': 'No face selected',
    'face.color': 'Face colour',
    'piece.title': 'Add box piece',
    'piece.help': 'The new piece is centered on the selected face and attached outward.',
    'piece.width': 'New piece width',
    'piece.depth': 'New piece depth',
    'piece.add': 'Attach centered piece',
    'text.title': 'Add text',
    'text.help': 'Prepare the text style, then place it on any inner or outer surface of the box.',
    'text.content': 'Text',
    'text.size': 'Text size',
    'text.font': 'Font',
    'text.color': 'Text colour',
    'text.background': 'Background',
    'text.bold': 'Bold',
    'text.italic': 'Italic',
    'text.underline': 'Underline',
    'text.underlineStyle': 'Underline style',
    'text.lineSolid': 'Solid',
    'text.lineDashed': 'Dashed',
    'text.lineDotted': 'Dotted',
    'text.lineDouble': 'Double',
    'text.done': 'Done — place on box',
    'text.cancel': 'Cancel placement',
    'summary.sides': 'Sides',
    'summary.perimeter': 'Perimeter',
    'summary.boardArea': 'Board area',
    'summary.floorArea': 'Floor area',
    'summary.total': 'Estimated total',
    'summary.note': 'Indicative material and print estimate for one configured box.',
    'summary.material': 'Cardboard body',
    'summary.lid': 'Lid',
    'summary.text': 'Text finishing',
    'summary.setup': 'Production setup',
    'wall': 'Face',
    'viewer.hint': 'Double-click a vertical face to select it.',
    'viewer.hint.placement': 'Text placement mode: move over any surface and click to place the text. The lid is lifted while placing.',
    'error.pieceShort': 'The selected face is too short for that attached piece.',
    'error.pieceInvalid': 'That attached piece would create an invalid or intersecting footprint.',
  }),
  'ro-RO': Object.freeze({
    'intro.eyebrow': 'Geometrie ambalaj',
    'intro.title': 'Setări cutie din carton',
    'intro.copy': 'Pornește de la o cutie dreptunghiulară, adaugă corpuri noi pe fețele selectate și plasează text pe orice suprafață interioară sau exterioară.',
    'section.geometry': 'Geometrie cutie',
    'section.face': 'Față selectată',
    'section.summary': 'Sumar și preț',
    'dimension.width': 'Lățime totală',
    'dimension.depth': 'Adâncime totală',
    'dimension.height': 'Înălțime cutie',
    'dimension.floor': 'Grosime carton / capac',
    'geometry.helpTitle': 'Cum adaugi corpuri noi',
    'geometry.helpCopy': 'Dublu-click pe o față verticală în viewer. Apare un buton plus pe acea față. Apasă-l, setează dimensiunile noului corp, iar acesta va fi centrat pe fața aleasă.',
    'face.none': 'Nicio față selectată',
    'face.color': 'Culoare față',
    'piece.title': 'Adaugă corp de cutie',
    'piece.help': 'Noul corp se centrează pe fața selectată și se atașează în exterior.',
    'piece.width': 'Lățime corp nou',
    'piece.depth': 'Adâncime corp nou',
    'piece.add': 'Atașează corpul centrat',
    'text.title': 'Adaugă text',
    'text.help': 'Pregătește stilul textului, apoi plasează-l pe orice suprafață interioară sau exterioară a cutiei.',
    'text.content': 'Text',
    'text.size': 'Mărime text',
    'text.font': 'Font',
    'text.color': 'Culoare text',
    'text.background': 'Fundal',
    'text.bold': 'Bold',
    'text.italic': 'Italic',
    'text.underline': 'Subliniat',
    'text.underlineStyle': 'Stil subliniere',
    'text.lineSolid': 'Continuu',
    'text.lineDashed': 'Întrerupt',
    'text.lineDotted': 'Punctat',
    'text.lineDouble': 'Dublu',
    'text.done': 'Gata — plasează pe cutie',
    'text.cancel': 'Anulează plasarea',
    'summary.sides': 'Laturi',
    'summary.perimeter': 'Perimetru',
    'summary.boardArea': 'Suprafață carton',
    'summary.floorArea': 'Suprafață bază',
    'summary.total': 'Total estimat',
    'summary.note': 'Estimare orientativă de material și personalizare pentru o cutie configurată.',
    'summary.material': 'Corp carton',
    'summary.lid': 'Capac',
    'summary.text': 'Finisaj text',
    'summary.setup': 'Pregătire producție',
    'wall': 'Față',
    'viewer.hint': 'Dublu-click pe o față verticală pentru a o selecta.',
    'viewer.hint.placement': 'Mod plasare text: mută cursorul pe orice suprafață și apasă click pentru a plasa textul. Capacul este ridicat în timpul plasării.',
    'error.pieceShort': 'Fața selectată este prea scurtă pentru acel corp atașat.',
    'error.pieceInvalid': 'Corpul atașat ar crea un contur invalid sau cu intersecții.',
  }),
  'de-DE': Object.freeze({
    'intro.eyebrow': 'Verpackungsgeometrie',
    'intro.title': 'Kartonbox-Einstellungen',
    'intro.copy': 'Beginnen Sie mit einer rechteckigen Box, fügen Sie weitere Box-Elemente an ausgewählte Flächen an und platzieren Sie Text auf inneren oder äußeren Oberflächen.',
    'section.geometry': 'Box-Geometrie',
    'section.face': 'Ausgewählte Fläche',
    'section.summary': 'Übersicht & Preis',
    'dimension.width': 'Gesamtbreite',
    'dimension.depth': 'Gesamttiefe',
    'dimension.height': 'Boxhöhe',
    'dimension.floor': 'Material- / Deckelstärke',
    'geometry.helpTitle': 'So fügen Sie weitere Box-Elemente hinzu',
    'geometry.helpCopy': 'Doppelklicken Sie im Viewer auf eine vertikale Fläche. Darauf erscheint eine Plus-Schaltfläche. Klicken Sie darauf, geben Sie die Maße des neuen Elements ein, und es wird mittig an dieser Fläche platziert.',
    'face.none': 'Keine Fläche ausgewählt',
    'face.color': 'Flächenfarbe',
    'piece.title': 'Box-Element hinzufügen',
    'piece.help': 'Das neue Element wird mittig auf der ausgewählten Fläche ausgerichtet und nach außen angefügt.',
    'piece.width': 'Breite des neuen Elements',
    'piece.depth': 'Tiefe des neuen Elements',
    'piece.add': 'Zentriertes Element anfügen',
    'text.title': 'Text hinzufügen',
    'text.help': 'Definieren Sie den Textstil und platzieren Sie ihn anschließend auf jeder inneren oder äußeren Oberfläche der Box.',
    'text.content': 'Text',
    'text.size': 'Textgröße',
    'text.font': 'Schriftart',
    'text.color': 'Textfarbe',
    'text.background': 'Hintergrund',
    'text.bold': 'Fett',
    'text.italic': 'Kursiv',
    'text.underline': 'Unterstrichen',
    'text.underlineStyle': 'Unterstreichungsstil',
    'text.lineSolid': 'Durchgezogen',
    'text.lineDashed': 'Gestrichelt',
    'text.lineDotted': 'Gepunktet',
    'text.lineDouble': 'Doppelt',
    'text.done': 'Fertig — auf der Box platzieren',
    'text.cancel': 'Platzierung abbrechen',
    'summary.sides': 'Seiten',
    'summary.perimeter': 'Umfang',
    'summary.boardArea': 'Kartonfläche',
    'summary.floorArea': 'Bodenfläche',
    'summary.total': 'Geschätzter Gesamtpreis',
    'summary.note': 'Unverbindliche Material- und Personalisierungsschätzung für eine konfigurierte Box.',
    'summary.material': 'Kartonkörper',
    'summary.lid': 'Deckel',
    'summary.text': 'Textveredelung',
    'summary.setup': 'Produktionsvorbereitung',
    'wall': 'Fläche',
    'viewer.hint': 'Doppelklicken Sie auf eine vertikale Fläche, um sie auszuwählen.',
    'viewer.hint.placement': 'Textplatzierungsmodus: Bewegen Sie den Cursor über eine beliebige Oberfläche und klicken Sie, um den Text zu platzieren. Der Deckel wird währenddessen angehoben.',
    'error.pieceShort': 'Die ausgewählte Fläche ist für dieses angefügte Element zu kurz.',
    'error.pieceInvalid': 'Dieses angefügte Element würde einen ungültigen oder sich überschneidenden Grundriss erzeugen.',
  }),
});

const $ = (selector) => document.querySelector(selector);
const canvasHost = $('#canvasHost');
const dimensionLayer = $('#dimensionLayer');
const widthInput = $('#widthInput');
const depthInput = $('#depthInput');
const heightInput = $('#heightInput');
const floorThicknessInput = $('#floorThicknessInput');
const selectedWallName = $('#selectedWallName');
const selectedWallLength = $('#selectedWallLength');
const selectedWallBadge = $('#selectedWallBadge');
const wallColorInput = $('#wallColorInput');
const wallColorText = $('#wallColorText');
const pieceWidthInput = $('#pieceWidthInput');
const pieceDepthInput = $('#pieceDepthInput');
const pieceError = $('#pieceError');
const addPiecePanel = $('#addPiecePanel');
const floatingAddBoxButton = $('#floatingAddBoxButton');
const startTextPlacementButton = $('#startTextPlacementButton');
const cancelTextPlacementButton = $('#cancelTextPlacementButton');
const textContentInput = $('#textContentInput');
const textSizeInput = $('#textSizeInput');
const textFontSelect = $('#textFontSelect');
const textColorInput = $('#textColorInput');
const textBackgroundInput = $('#textBackgroundInput');
const textBoldToggle = $('#textBoldToggle');
const textItalicToggle = $('#textItalicToggle');
const textUnderlineToggle = $('#textUnderlineToggle');
const textUnderlineStyle = $('#textUnderlineStyle');
const summaryTotal = $('#summaryTotal');
const viewerHint = $('#viewerHint');

let locale = localeForHost();
let units = locale === 'en-US' ? 'imperial' : 'metric';
let currency = locale === 'ro-RO' ? 'RON' : locale === 'de-DE' ? 'EUR' : 'USD';
let selectedWall = null;
let wallMeshes = [];
let floorMesh = null;
let lidMesh = null;
let dimensionAnchors = [];
let dimensionsVisible = true;
let technicalEdgesVisible = true;
let cameraMode = 0;
let resizeObserver;
let placementMode = false;
let pendingTextSpec = null;
let previewTextMesh = null;
let previewPlacementData = null;

let state = {
  version: 2,
  points: rectanglePoints(),
  wallStyles: Array.from({ length: 4 }, () => ({ color: DEFAULT_COLOR })),
  height: 300,
  floorThickness: 3,
  textPlacements: [],
};

function localeForHost() {
  const host = location.hostname.toLowerCase();
  if (host.includes('360configurator.ro')) return 'ro-RO';
  if (host.includes('360konfigurator.de')) return 'de-DE';
  return 'en-US';
}
function t(key) { return TEXT[locale]?.[key] ?? TEXT['en-US'][key] ?? key; }
function round(value, digits = 4) { const f = 10 ** digits; return Math.round(value * f) / f; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function toMm(value) { return units === 'imperial' ? Number(value) * 25.4 : Number(value); }
function fromMm(value) { return units === 'imperial' ? Number(value) / 25.4 : Number(value); }
function displayLength(mm, digits = 0) { return units === 'imperial' ? `${(mm / 25.4).toFixed(digits ? 2 : 1)} in` : `${mm.toFixed(digits)} mm`; }
function displayMetres(mm) { return units === 'imperial' ? `${(mm / 304.8).toFixed(2)} ft` : `${(mm / 1000).toFixed(2)} m`; }
function formatMoney(eur) {
  const rate = CURRENCY_FROM_EUR[currency] || 1;
  const amount = eur * rate;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}
function cloneStyle(style = { color: DEFAULT_COLOR }) { return { color: style.color || DEFAULT_COLOR }; }
function rectanglePoints(width = 600, depth = 400) {
  return [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ];
}
function bounds(points = state.points) {
  const xs = points.map((p) => p.x); const zs = points.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
}
function signedArea(points = state.points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}
function polygonAreaMm2(points = state.points) { return Math.abs(signedArea(points)); }
function centerPoints(points) {
  const b = bounds(points);
  const cx = (b.minX + b.maxX) / 2; const cz = (b.minZ + b.maxZ) / 2;
  return points.map((p) => ({ x: round(p.x - cx), z: round(p.z - cz) }));
}
function edgeLength(index, points = state.points) {
  const a = points[index]; const b = points[(index + 1) % points.length];
  return Math.hypot(b.x - a.x, b.z - a.z);
}
function perimeter(points = state.points) { return points.reduce((total, _p, i) => total + edgeLength(i, points), 0); }
function orientation(a, b, c) {
  const value = (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : 2;
}
function onSegment(a, b, c) { return b.x <= Math.max(a.x, c.x) + 1e-7 && b.x + 1e-7 >= Math.min(a.x, c.x) && b.z <= Math.max(a.z, c.z) + 1e-7 && b.z + 1e-7 >= Math.min(a.z, c.z); }
function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2), o2 = orientation(p1, q1, q2), o3 = orientation(p2, q2, p1), o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
function validOrthogonalPolygon(points) {
  if (!Array.isArray(points) || points.length < 4 || polygonAreaMm2(points) < 100) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    const dx = Math.abs(b.x - a.x); const dz = Math.abs(b.z - a.z);
    if (Math.hypot(dx, dz) < 10 || (dx > 1e-6 && dz > 1e-6)) return false;
  }
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a1 = points[i]; const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      if (j === i || j === (i + 1) % n || (i === 0 && j === n - 1)) continue;
      const b1 = points[j]; const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function resizeFootprint(targetWidth, targetDepth) {
  const b = bounds();
  if (!b.width || !b.depth) return;
  const sx = clamp(targetWidth, 100, 3000) / b.width;
  const sz = clamp(targetDepth, 100, 3000) / b.depth;
  state.points = centerPoints(state.points.map((p) => ({ x: p.x * sx, z: p.z * sz })));
  renderAll();
}

function attachCenteredPiece() {
  pieceError.hidden = true;
  if (selectedWall == null) return;
  const i = Math.min(selectedWall, state.points.length - 1);
  const a = state.points[i];
  const b = state.points[(i + 1) % state.points.length];
  const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
  const span = clamp(toMm(pieceWidthInput.value), 40, 1200);
  const depth = clamp(toMm(pieceDepthInput.value), 20, 1000);
  if (length < span + 40) {
    pieceError.textContent = t('error.pieceShort');
    pieceError.hidden = false;
    return;
  }
  const ux = dx / length; const uz = dz / length;
  const ccw = signedArea() > 0;
  const nx = ccw ? uz : -uz;
  const nz = ccw ? -ux : ux;
  const margin = (length - span) / 2;
  const p1 = { x: a.x + ux * margin, z: a.z + uz * margin };
  const p2 = { x: p1.x + nx * depth, z: p1.z + nz * depth };
  const p3 = { x: p2.x + ux * span, z: p2.z + uz * span };
  const p4 = { x: p3.x - nx * depth, z: p3.z - nz * depth };
  const candidate = state.points.map((p) => ({ ...p }));
  candidate.splice(i + 1, 0, p1, p2, p3, p4);
  const centered = centerPoints(candidate);
  if (!validOrthogonalPolygon(centered)) {
    pieceError.textContent = t('error.pieceInvalid');
    pieceError.hidden = false;
    return;
  }
  const inherited = cloneStyle(state.wallStyles[i]);
  state.points = centered;
  state.wallStyles.splice(i, 1, ...Array.from({ length: 5 }, () => cloneStyle(inherited)));
  selectedWall = i + 2;
  renderAll();
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
controls.minDistance = 240;
controls.maxDistance = 4200;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 120, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a979f, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.7); keyLight.position.set(900, 1100, 620); keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xb8dbf1, 1.1); fillLight.position.set(-700, 500, -500); scene.add(fillLight);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshStandardMaterial({ color: 0xe7ecef, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -4; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(4000, 80, 0xc6d2d8, 0xdce4e8); grid.position.y = -3; grid.material.opacity = 0.35; grid.material.transparent = true; scene.add(grid);
const boxGroup = new THREE.Group(); scene.add(boxGroup);
const previewGroup = new THREE.Group(); scene.add(previewGroup);

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => {
        m.map?.dispose?.();
        m.dispose?.();
      });
    }
  });
}
function wallMaterial(style, index) {
  const color = new THREE.Color(style.color || DEFAULT_COLOR);
  if (index === selectedWall) color.lerp(new THREE.Color(0x60bdf4), 0.24);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
}
function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}
function currentLidOffset() { return placementMode ? LID_LIFT_MM : 0; }

function createPlacementTextMesh(placement, preview = false) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const fontPx = clamp(Number(placement.spec.size) || 54, 12, 180);
  const linePad = Math.max(18, Math.round(fontPx * 0.38));
  const fontWeight = placement.spec.bold ? '700' : '500';
  const fontStyle = placement.spec.italic ? 'italic' : 'normal';
  context.font = `${fontStyle} ${fontWeight} ${fontPx}px ${placement.spec.fontFamily}`;
  const measured = Math.max(context.measureText(placement.spec.text || '').width, fontPx * 1.2);
  canvas.width = Math.ceil(measured + linePad * 2);
  canvas.height = Math.ceil(fontPx + linePad * 2 + (placement.spec.underline ? fontPx * 0.35 : 0));
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = placement.spec.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontStyle} ${fontWeight} ${fontPx}px ${placement.spec.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = placement.spec.textColor || '#1f2d36';
  const textY = canvas.height / 2 - (placement.spec.underline ? fontPx * 0.08 : 0);
  ctx.fillText(placement.spec.text || '', canvas.width / 2, textY);
  if (placement.spec.underline) {
    const startX = linePad;
    const endX = canvas.width - linePad;
    const underlineY = textY + fontPx * 0.42;
    ctx.strokeStyle = placement.spec.textColor || '#1f2d36';
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.07));
    if (placement.spec.underlineStyle === 'double') {
      ctx.beginPath(); ctx.moveTo(startX, underlineY - 3); ctx.lineTo(endX, underlineY - 3); ctx.moveTo(startX, underlineY + 3); ctx.lineTo(endX, underlineY + 3); ctx.stroke();
    } else if (placement.spec.underlineStyle === 'dashed') {
      ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(startX, underlineY); ctx.lineTo(endX, underlineY); ctx.stroke(); ctx.setLineDash([]);
    } else if (placement.spec.underlineStyle === 'dotted') {
      ctx.setLineDash([2, 7]); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(startX, underlineY); ctx.lineTo(endX, underlineY); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
    } else {
      ctx.beginPath(); ctx.moveTo(startX, underlineY); ctx.lineTo(endX, underlineY); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const aspect = canvas.width / canvas.height;
  const heightWorld = clamp(fontPx * 1.8, 52, 360);
  const widthWorld = heightWorld * aspect;
  const geometry = new THREE.PlaneGeometry(widthWorld, heightWorld);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, opacity: preview ? 0.78 : 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.cardboxText = true;
  return { mesh, widthWorld, heightWorld };
}

function computeTextQuaternion(normal) {
  const reference = Math.abs(normal.dot(new THREE.Vector3(0, 1, 0))) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  const matrix = new THREE.Matrix4().makeBasis(tangent, bitangent, normal);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function restoreTextPlacements() {
  for (const placement of state.textPlacements) {
    const target = placement.surfaceType === 'wall' ? wallMeshes[placement.wallIndex] : placement.surfaceType === 'lid' ? lidMesh : floorMesh;
    if (!target) continue;
    const { mesh } = createPlacementTextMesh(placement, false);
    mesh.position.fromArray(placement.localPosition);
    mesh.quaternion.fromArray(placement.localQuaternion);
    target.add(mesh);
  }
}

function rebuild3D() {
  clearGroup(boxGroup);
  wallMeshes = [];
  floorMesh = null;
  lidMesh = null;
  dimensionAnchors = [];
  const shape = new THREE.Shape();
  state.points.forEach((p, i) => { if (i === 0) shape.moveTo(p.x, p.z); else shape.lineTo(p.x, p.z); });
  shape.closePath();
  const thickness = Math.max(1, state.floorThickness);
  const lidOffset = currentLidOffset();

  const floorGeometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xb77c47, roughness: 0.9, side: THREE.DoubleSide });
  floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.castShadow = true; floorMesh.receiveShadow = true; floorMesh.userData.surfaceType = 'floor';
  boxGroup.add(floorMesh);

  const lidGeometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  lidGeometry.rotateX(-Math.PI / 2);
  const lidMaterial = new THREE.MeshStandardMaterial({ color: 0xc5905d, roughness: 0.9, side: THREE.DoubleSide });
  lidMesh = new THREE.Mesh(lidGeometry, lidMaterial);
  lidMesh.position.y = state.height + thickness + lidOffset;
  lidMesh.castShadow = true; lidMesh.receiveShadow = true; lidMesh.userData.surfaceType = 'lid';
  boxGroup.add(lidMesh);

  state.points.forEach((a, i) => {
    const b = state.points[(i + 1) % state.points.length];
    const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    const geometry = new THREE.BoxGeometry(length, state.height, thickness);
    const mesh = new THREE.Mesh(geometry, wallMaterial(state.wallStyles[i], i));
    mesh.position.set((a.x + b.x) / 2, state.height / 2 + thickness, (a.z + b.z) / 2);
    mesh.rotation.y = Math.atan2(-dz, dx);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.cardboxWall = true; mesh.userData.wallIndex = i; mesh.userData.surfaceType = 'wall';
    boxGroup.add(mesh); wallMeshes.push(mesh);
    if (technicalEdgesVisible) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: i === selectedWall ? 0x0876be : 0x755335, transparent: true, opacity: i === selectedWall ? 0.8 : 0.34 }));
      lines.position.copy(mesh.position); lines.rotation.copy(mesh.rotation); boxGroup.add(lines);
    }
    dimensionAnchors.push(new THREE.Vector3(mesh.position.x, state.height + thickness + 28, mesh.position.z));
  });
  restoreTextPlacements();
  fitControlsTarget();
  renderDimensions();
}

function fitControlsTarget() {
  const b = bounds();
  controls.target.set((b.minX + b.maxX) / 2, state.height * 0.4 + currentLidOffset() * 0.08, (b.minZ + b.maxZ) / 2);
}

function calculatePricing() {
  const wallAreaM2 = state.points.reduce((sum, _p, i) => sum + edgeLength(i) * state.height / 1_000_000, 0);
  const floorAreaM2 = polygonAreaMm2() / 1_000_000;
  const lidAreaM2 = floorAreaM2;
  const bodyEur = wallAreaM2 * BOARD_EUR_M2;
  const lidEur = lidAreaM2 * BOARD_EUR_M2;
  const textEur = state.textPlacements.length * 0.35;
  const setupEur = 0.95 + state.points.length * 0.035;
  return { wallAreaM2, floorAreaM2, lidAreaM2, bodyEur, lidEur, textEur, setupEur, totalEur: bodyEur + lidEur + textEur + setupEur };
}

function renderSummary() {
  const price = calculatePricing();
  $('#summarySides').textContent = String(state.points.length);
  $('#summaryPerimeter').textContent = displayMetres(perimeter());
  $('#summaryBoardArea').textContent = `${price.wallAreaM2.toFixed(3)} m²`;
  $('#summaryFloorArea').textContent = `${price.floorAreaM2.toFixed(3)} m²`;
  $('#priceBreakdown').innerHTML = [
    [t('summary.material'), price.bodyEur],
    [t('summary.lid'), price.lidEur],
    [t('summary.text'), price.textEur],
    [t('summary.setup'), price.setupEur],
  ].map(([label, value]) => `<div class="price-row"><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join('');
  summaryTotal.textContent = formatMoney(price.totalEur);
}

function renderTranslations() {
  document.documentElement.lang = locale.startsWith('ro') ? 'ro' : locale.startsWith('de') ? 'de' : 'en';
  document.querySelectorAll('[data-cardbox-i18n]').forEach((el) => { el.textContent = t(el.dataset.cardboxI18n); });
  viewerHint.textContent = placementMode ? t('viewer.hint.placement') : t('viewer.hint');
}

function renderInputs() {
  const b = bounds();
  widthInput.value = round(fromMm(b.width), units === 'imperial' ? 2 : 0);
  depthInput.value = round(fromMm(b.depth), units === 'imperial' ? 2 : 0);
  heightInput.value = round(fromMm(state.height), units === 'imperial' ? 2 : 0);
  floorThicknessInput.value = round(fromMm(state.floorThickness), units === 'imperial' ? 2 : 1);
  pieceWidthInput.value = round(fromMm(clamp(toMm(pieceWidthInput.value || 180), 40, 1200)), units === 'imperial' ? 2 : 0);
  pieceDepthInput.value = round(fromMm(clamp(toMm(pieceDepthInput.value || 120), 20, 1000)), units === 'imperial' ? 2 : 0);
  const imperial = units === 'imperial';
  [[widthInput, 100, 3000, 10], [depthInput, 100, 3000, 10], [heightInput, 50, 2000, 10], [floorThicknessInput, 1, 20, 0.5], [pieceWidthInput, 40, 1200, 10], [pieceDepthInput, 20, 1000, 10]].forEach(([input, minMm, maxMm, stepMm]) => {
    input.min = String(round(imperial ? minMm / 25.4 : minMm, imperial ? 2 : 1));
    input.max = String(round(imperial ? maxMm / 25.4 : maxMm, imperial ? 2 : 1));
    input.step = String(round(imperial ? stepMm / 25.4 : stepMm, imperial ? 2 : 1));
  });
  document.querySelectorAll('[data-unit-label]').forEach((el) => { el.textContent = imperial ? 'in' : 'mm'; });
}

function renderSelectedFace() {
  if (selectedWall == null) {
    selectedWallName.textContent = t('face.none');
    selectedWallLength.textContent = '—';
    selectedWallBadge.textContent = '—';
    addPiecePanel.hidden = true;
    floatingAddBoxButton.hidden = true;
    return;
  }
  selectedWallName.textContent = `${t('wall')} ${selectedWall + 1}`;
  selectedWallLength.textContent = displayLength(edgeLength(selectedWall), 0);
  selectedWallBadge.textContent = String(selectedWall + 1);
  const style = state.wallStyles[selectedWall] || cloneStyle();
  wallColorInput.value = style.color;
  wallColorText.value = style.color.toUpperCase();
  addPiecePanel.hidden = false;
}

function updateAddButtonPosition() {
  if (selectedWall == null || placementMode || !wallMeshes[selectedWall]) {
    floatingAddBoxButton.hidden = true;
    return;
  }
  const mesh = wallMeshes[selectedWall];
  const point = mesh.position.clone();
  point.y += state.height * 0.18;
  const projected = point.project(camera);
  const rect = canvasHost.getBoundingClientRect();
  const visible = projected.z > -1 && projected.z < 1;
  floatingAddBoxButton.hidden = !visible;
  if (!visible) return;
  floatingAddBoxButton.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
  floatingAddBoxButton.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
}

function renderDimensions() {
  dimensionLayer.hidden = !dimensionsVisible;
  if (!dimensionsVisible) { dimensionLayer.innerHTML = ''; return; }
  dimensionLayer.innerHTML = dimensionAnchors.map((_a, i) => `<div class="dimension-label" data-dimension-index="${i}">${displayLength(edgeLength(i), 0)}</div>`).join('');
}
function updateDimensionPositions() {
  if (!dimensionsVisible) return;
  const rect = canvasHost.getBoundingClientRect();
  dimensionAnchors.forEach((world, i) => {
    const projected = world.clone().project(camera);
    const el = dimensionLayer.querySelector(`[data-dimension-index="${i}"]`); if (!el) return;
    const visible = projected.z > -1 && projected.z < 1;
    el.style.display = visible ? '' : 'none';
    el.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
  });
  updateAddButtonPosition();
}

function renderAll() {
  renderInputs();
  renderTranslations();
  renderSelectedFace();
  renderSummary();
  rebuild3D();
}

function setSelectedWall(index) {
  selectedWall = clamp(index, 0, state.points.length - 1);
  pieceError.hidden = true;
  previewPlacementData = null;
  renderAll();
}

function updateSelectedStyle(patch) {
  if (selectedWall == null) return;
  state.wallStyles[selectedWall] = { ...cloneStyle(state.wallStyles[selectedWall]), ...patch };
  renderAll();
}

function getPlaceableMeshes() {
  return [...wallMeshes, floorMesh, lidMesh].filter(Boolean);
}

function raycastFromPointer(event, objects) {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objects, false)[0] || null;
}

function buildTextSpecFromForm() {
  return {
    text: (textContentInput.value || '').trim() || 'TEXT',
    size: clamp(textSizeInput.value, 12, 180),
    fontFamily: textFontSelect.value,
    textColor: textColorInput.value,
    backgroundColor: textBackgroundInput.value,
    bold: textBoldToggle.checked,
    italic: textItalicToggle.checked,
    underline: textUnderlineToggle.checked,
    underlineStyle: textUnderlineStyle.value,
  };
}

function enterTextPlacementMode() {
  pendingTextSpec = buildTextSpecFromForm();
  placementMode = true;
  cancelTextPlacementButton.hidden = false;
  renderAll();
}

function exitTextPlacementMode() {
  placementMode = false;
  pendingTextSpec = null;
  previewPlacementData = null;
  cancelTextPlacementButton.hidden = true;
  clearGroup(previewGroup);
  previewTextMesh = null;
  renderAll();
}

function updatePreviewPlacement(event) {
  if (!placementMode || !pendingTextSpec) return;
  const hit = raycastFromPointer(event, getPlaceableMeshes());
  clearGroup(previewGroup);
  previewTextMesh = null;
  previewPlacementData = null;
  if (!hit) return;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  const worldPosition = hit.point.clone().add(normal.clone().multiplyScalar(SURFACE_OFFSET_MM));
  const worldQuaternion = computeTextQuaternion(normal);
  const placement = { spec: pendingTextSpec };
  const { mesh, widthWorld, heightWorld } = createPlacementTextMesh(placement, true);
  mesh.position.copy(worldPosition);
  mesh.quaternion.copy(worldQuaternion);
  previewGroup.add(mesh);
  previewTextMesh = mesh;
  const target = hit.object;
  const parentQuat = target.getWorldQuaternion(new THREE.Quaternion());
  const localQuat = parentQuat.clone().invert().multiply(worldQuaternion.clone());
  const localPos = target.worldToLocal(worldPosition.clone());
  previewPlacementData = {
    surfaceType: target.userData.surfaceType,
    wallIndex: target.userData.wallIndex ?? null,
    localPosition: localPos.toArray(),
    localQuaternion: localQuat.toArray(),
    widthWorld,
    heightWorld,
    spec: { ...pendingTextSpec },
  };
}

function placeCurrentText() {
  if (!placementMode || !previewPlacementData) return;
  state.textPlacements.push({ ...previewPlacementData });
  exitTextPlacementMode();
}

function bindAccordions() {
  document.querySelectorAll('.accordion-toggle').forEach((button) => button.addEventListener('click', () => {
    const section = button.closest('.accordion-section');
    const panel = section.querySelector('.accordion-panel');
    const open = !section.classList.contains('is-open');
    section.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }));
}

function bindControls() {
  widthInput.addEventListener('change', () => resizeFootprint(toMm(widthInput.value), bounds().depth));
  depthInput.addEventListener('change', () => resizeFootprint(bounds().width, toMm(depthInput.value)));
  heightInput.addEventListener('change', () => { state.height = clamp(toMm(heightInput.value), 50, 2000); renderAll(); });
  floorThicknessInput.addEventListener('change', () => { state.floorThickness = clamp(toMm(floorThicknessInput.value), 1, 20); renderAll(); });
  wallColorInput.addEventListener('input', () => { wallColorText.value = wallColorInput.value.toUpperCase(); updateSelectedStyle({ color: wallColorInput.value }); });
  wallColorText.addEventListener('change', () => {
    const value = wallColorText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      wallColorInput.value = value;
      updateSelectedStyle({ color: value.toLowerCase() });
    } else if (selectedWall != null) {
      wallColorText.value = state.wallStyles[selectedWall].color.toUpperCase();
    }
  });
  $('#confirmAddPieceButton').addEventListener('click', attachCenteredPiece);
  floatingAddBoxButton.addEventListener('click', () => {
    addPiecePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const firstInput = pieceWidthInput;
    requestAnimationFrame(() => firstInput.focus());
  });
  startTextPlacementButton.addEventListener('click', enterTextPlacementMode);
  cancelTextPlacementButton.addEventListener('click', exitTextPlacementMode);
}

renderer.domElement.addEventListener('dblclick', (event) => {
  if (placementMode) return;
  const hit = raycastFromPointer(event, wallMeshes);
  if (hit?.object?.userData?.cardboxWall) setSelectedWall(hit.object.userData.wallIndex);
});
renderer.domElement.addEventListener('pointermove', (event) => updatePreviewPlacement(event));
renderer.domElement.addEventListener('click', (event) => {
  if (!placementMode) return;
  updatePreviewPlacement(event);
  if (previewPlacementData) placeCurrentText();
});

function resizeRenderer() {
  const width = Math.max(1, canvasHost.clientWidth);
  const height = Math.max(1, canvasHost.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
resizeObserver = new ResizeObserver(resizeRenderer); resizeObserver.observe(canvasHost); resizeRenderer();
function animate() { requestAnimationFrame(animate); controls.update(); updateDimensionPositions(); renderer.render(scene, camera); }
animate();

function captureState() {
  return {
    version: 2,
    points: state.points.map((p) => ({ x: round(p.x), z: round(p.z) })),
    wallStyles: state.wallStyles.map(cloneStyle),
    height: round(state.height),
    floorThickness: round(state.floorThickness),
    textPlacements: state.textPlacements.map((placement) => ({ ...placement, spec: { ...placement.spec } })),
  };
}
function restoreState(snapshot) {
  const source = snapshot?.state && !snapshot.points ? snapshot.state : snapshot;
  if (!source || !Array.isArray(source.points) || !validOrthogonalPolygon(source.points)) return false;
  state.points = centerPoints(source.points.map((p) => ({ x: Number(p.x), z: Number(p.z) })));
  state.wallStyles = Array.from({ length: state.points.length }, (_v, i) => cloneStyle(source.wallStyles?.[i] || { color: DEFAULT_COLOR }));
  state.height = Number.isFinite(Number(source.height)) ? clamp(source.height, 50, 2000) : 300;
  state.floorThickness = Number.isFinite(Number(source.floorThickness)) ? clamp(source.floorThickness, 1, 20) : 3;
  state.textPlacements = Array.isArray(source.textPlacements) ? source.textPlacements.map((placement) => ({
    surfaceType: placement.surfaceType,
    wallIndex: Number.isFinite(Number(placement.wallIndex)) ? Number(placement.wallIndex) : null,
    localPosition: Array.isArray(placement.localPosition) ? placement.localPosition.map(Number) : [0, 0, 0],
    localQuaternion: Array.isArray(placement.localQuaternion) ? placement.localQuaternion.map(Number) : [0, 0, 0, 1],
    widthWorld: Number(placement.widthWorld) || 100,
    heightWorld: Number(placement.heightWorld) || 50,
    spec: {
      text: placement.spec?.text || 'TEXT',
      size: clamp(placement.spec?.size || 54, 12, 180),
      fontFamily: placement.spec?.fontFamily || 'Arial, sans-serif',
      textColor: placement.spec?.textColor || '#1f2d36',
      backgroundColor: placement.spec?.backgroundColor || '#ffffff',
      bold: Boolean(placement.spec?.bold),
      italic: Boolean(placement.spec?.italic),
      underline: Boolean(placement.spec?.underline),
      underlineStyle: placement.spec?.underlineStyle || 'solid',
    },
  })) : [];
  selectedWall = null;
  exitTextPlacementMode();
  renderAll();
  return true;
}
function resetConfiguration() {
  state = { version: 2, points: rectanglePoints(), wallStyles: Array.from({ length: 4 }, () => ({ color: DEFAULT_COLOR })), height: 300, floorThickness: 3, textPlacements: [] };
  selectedWall = null;
  exitTextPlacementMode();
  renderAll();
  return true;
}
function setUnits(value) { units = value === 'imperial' ? 'imperial' : 'metric'; renderAll(); }
function setCurrency(value) { currency = ['USD', 'RON', 'EUR'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'EUR'; renderSummary(); }
function setLocale(value) { if (TEXT[value]) locale = value; renderAll(); }
function setDarkMode(value) { document.body.classList.toggle('cardbox-dark-mode', Boolean(value)); scene.background.set(Boolean(value) ? 0x172027 : 0xf0f4f6); ground.material.color.set(Boolean(value) ? 0x141b20 : 0xe7ecef); }
function toggleDimensions() { dimensionsVisible = !dimensionsVisible; renderDimensions(); return dimensionsVisible; }
function toggleTechnicalEdges() { technicalEdgesVisible = !technicalEdgesVisible; rebuild3D(); return technicalEdgesVisible; }
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3;
  const b = bounds(); const maxDim = Math.max(b.width, b.depth, state.height + currentLidOffset(), 400);
  if (cameraMode === 1) camera.position.set(0, maxDim * 1.8, 0.01);
  else if (cameraMode === 2) camera.position.set(maxDim * 1.45, state.height * 0.9, 0);
  else camera.position.set(maxDim * 1.2, maxDim * 0.9, maxDim * 1.25);
  fitControlsTarget(); controls.update();
}

window.CARDBOX_CONFIGURATOR_API = {
  captureState, restoreState, resetConfiguration, setUnits, setCurrency, setLocale, setDarkMode,
  toggleDimensions, toggleTechnicalEdges, cycleCamera,
  syncToolButtons() {}, closeToolPanels() {},
  getPrice() { return { amount: calculatePricing().totalEur * (CURRENCY_FROM_EUR[currency] || 1), currency }; },
};

bindAccordions();
bindControls();
renderAll();
window.addEventListener('beforeunload', () => resizeObserver?.disconnect());
