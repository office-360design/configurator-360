import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_COLOR = '#c78f5a';
const SELECTED_COLOR = '#65b7eb';
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
    'text.underlineStyle': 'Underline style', 'text.lineSolid': 'Solid', 'text.lineDashed': 'Dashed', 'text.lineDotted': 'Dotted', 'text.lineDouble': 'Double', 'text.done': 'Done', 'text.cancel': 'Cancel text placement',
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
    'text.underlineStyle': 'Stil subliniere', 'text.lineSolid': 'Continuu', 'text.lineDashed': 'Întrerupt', 'text.lineDotted': 'Punctat', 'text.lineDouble': 'Dublu', 'text.done': 'Gata', 'text.cancel': 'Anulează plasarea textului',
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
    'text.underlineStyle': 'Unterstreichungsstil', 'text.lineSolid': 'Durchgezogen', 'text.lineDashed': 'Gestrichelt', 'text.lineDotted': 'Gepunktet', 'text.lineDouble': 'Doppelt', 'text.done': 'Fertig', 'text.cancel': 'Textplatzierung abbrechen',
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
const faceActionPopup = $('#faceActionPopup');
const faceMainActions = $('#faceMainActions');
const faceTextEditor = $('#faceTextEditor');
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
const textColorInput = $('#textColorInput');
const textBackgroundInput = $('#textBackgroundInput');
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
let addMode = false;
let draftBox = null;
let draftBeforeState = null;
let placementMode = false;
let pendingTextSpec = null;
let previewTextMesh = null;
let previewPlacement = null;
let dimensionAnchors = [];

function makeBaseBox(width = 600, depth = 400, height = 300) {
  return { id: 'base', minX: -width / 2, maxX: width / 2, minY: 0, maxY: height, minZ: -depth / 2, maxZ: depth / 2 };
}

let state = {
  version: 3,
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
const previewGroup = new THREE.Group(); scene.add(previewGroup);

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
function makeSurfaceMesh(face) {
  const width = face.u2 - face.u1;
  const height = face.v2 - face.v1;
  const geometry = new THREE.PlaneGeometry(width, height);
  const selected = faceKey(face) === selectedFaceKey;
  const material = new THREE.MeshStandardMaterial({ color: selected ? SELECTED_COLOR : DEFAULT_COLOR, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const normal = faceNormal(face);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const center = faceCenter(face);
  if (placementMode && isTopFace(face)) center.y += LID_LIFT_MM;
  mesh.position.copy(center);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.cardboxSurface = true;
  mesh.userData.face = face;
  mesh.userData.faceKey = faceKey(face);
  mesh.userData.vertical = isVerticalFace(face);
  mesh.userData.top = isTopFace(face);
  mesh.userData.bottom = isBottomFace(face);
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
    if (technicalEdgesVisible) {
      const edgeMaterial = new THREE.LineBasicMaterial({ color: faceKey(face) === selectedFaceKey ? 0x0876be : 0x755335, transparent: true, opacity: faceKey(face) === selectedFaceKey ? 0.9 : 0.38 });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
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
  controls.target.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 + (placementMode ? LID_LIFT_MM * 0.08 : 0), (b.minZ + b.maxZ) / 2);
}

function createTextMesh(spec, opacity = 1) {
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
  draw.fillStyle = spec.backgroundColor;
  draw.fillRect(0, 0, canvas.width, canvas.height);
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
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const worldHeight = clamp(fontPx * 1.8, 48, 360);
  const worldWidth = worldHeight * canvas.width / canvas.height;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldHeight), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, opacity }));
  return mesh;
}
function renderPlacedTexts() {
  clearGroup(textGroup);
  for (const placement of state.textPlacements) {
    const mesh = createTextMesh(placement.spec, 1);
    const position = new THREE.Vector3().fromArray(placement.position);
    if (placement.topSurface && placementMode) position.y += LID_LIFT_MM;
    mesh.position.copy(position);
    mesh.quaternion.fromArray(placement.quaternion);
    textGroup.add(mesh);
  }
}
function quaternionForNormal(normal) {
  const reference = Math.abs(normal.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, bitangent, normal));
}

function renderTranslations() {
  document.documentElement.lang = locale.startsWith('ro') ? 'ro' : locale.startsWith('de') ? 'de' : 'en';
  document.querySelectorAll('[data-cardbox-i18n]').forEach((el) => { el.textContent = t(el.dataset.cardboxI18n); });
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
  if (!selectedFaceSnapshot || addMode || placementMode) {
    faceActionPopup.hidden = true;
    return;
  }
  faceActionPopup.hidden = false;
  updateFacePopupPosition();
}
function updateFacePopupPosition() {
  if (faceActionPopup.hidden || !selectedFaceSnapshot) return;
  const world = faceCenter(selectedFaceSnapshot).add(faceNormal(selectedFaceSnapshot).multiplyScalar(18));
  const projected = world.project(camera);
  const rect = canvasHost.getBoundingClientRect();
  if (projected.z < -1 || projected.z > 1) { faceActionPopup.hidden = true; return; }
  faceActionPopup.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
  faceActionPopup.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
}
function renderAll() {
  renderInputs(); renderTranslations(); renderSummary(); rebuildSurfaceMeshes(); renderFacePopup();
}

function selectFace(face) {
  const key = faceKey(face);
  if (selectedFaceKey === key) { deselectFace(); return; }
  selectedFaceKey = key;
  selectedFaceSnapshot = { ...face };
  faceMainActions.hidden = false;
  faceTextEditor.hidden = true;
  renderAll();
}
function deselectFace() {
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  faceActionPopup.hidden = true;
  faceMainActions.hidden = false;
  faceTextEditor.hidden = true;
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
  draftBeforeState = { selectedFaceKey, selectedFaceSnapshot: { ...selectedFaceSnapshot } };
  draftBox = newAttachedBox(selectedFaceSnapshot, defaultWidth, defaultHeight, defaultDepth);
  addMode = true;
  faceActionPopup.hidden = true;
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
  state.boxes.push(cloneBox(draftBox));
  draftBox = null;
  draftBeforeState = null;
  addMode = false;
  addBoxEditor.hidden = true;
  selectedFaceKey = '';
  selectedFaceSnapshot = null;
  renderAll();
}
function cancelAddMode() {
  draftBox = null;
  addMode = false;
  addBoxEditor.hidden = true;
  if (draftBeforeState) {
    selectedFaceKey = draftBeforeState.selectedFaceKey;
    selectedFaceSnapshot = { ...draftBeforeState.selectedFaceSnapshot };
  }
  draftBeforeState = null;
  renderAll();
}

function buildTextSpec() {
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
function startTextEditor() {
  faceMainActions.hidden = true;
  faceTextEditor.hidden = false;
  updateFacePopupPosition();
}
function backFromTextEditor() {
  faceTextEditor.hidden = true;
  faceMainActions.hidden = false;
  updateFacePopupPosition();
}
function enterPlacementMode() {
  pendingTextSpec = buildTextSpec();
  placementMode = true;
  faceActionPopup.hidden = true;
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

function raycast(event, objects = surfaceMeshes) {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, false)[0] || null;
  return { hit, raycaster };
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
  const position = hit.point.clone().add(normal.clone().multiplyScalar(SURFACE_TEXT_OFFSET_MM));
  const quaternion = quaternionForNormal(normal);
  const mesh = createTextMesh(pendingTextSpec, 0.78);
  mesh.position.copy(position); mesh.quaternion.copy(quaternion);
  previewGroup.add(mesh); previewTextMesh = mesh;
  const topSurface = Boolean(hit.object.userData.top);
  const storedPosition = position.clone();
  if (topSurface) storedPosition.y -= LID_LIFT_MM;
  previewPlacement = { position: storedPosition.toArray(), quaternion: quaternion.toArray(), topSurface, spec: { ...pendingTextSpec } };
}
function commitTextPlacement() {
  if (!previewPlacement) return;
  state.textPlacements.push({ ...previewPlacement, spec: { ...previewPlacement.spec } });
  exitPlacementMode();
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
  $('#backFromTextButton').addEventListener('click', backFromTextEditor);
  $('#startTextPlacementButton').addEventListener('click', enterPlacementMode);
  cancelTextPlacementButton.addEventListener('click', exitPlacementMode);
  [pieceWidthInput, pieceHeightInput, pieceDepthInput].forEach((input) => input.addEventListener('change', updateDraftFromEditor));
  $('#confirmAddPieceButton').addEventListener('click', finishAddMode);
  $('#cancelAddPieceButton').addEventListener('click', cancelAddMode);
}

renderer.domElement.addEventListener('dblclick', (event) => {
  if (addMode || placementMode) return;
  const { hit } = raycast(event);
  if (!hit?.object?.userData?.vertical) return;
  const face = hit.object.userData.face;
  if (selectedFaceKey && selectedFaceKey === hit.object.userData.faceKey) deselectFace();
  else selectFace(face);
});
renderer.domElement.addEventListener('click', (event) => {
  if (placementMode) {
    updateTextPreview(event);
    if (previewPlacement) commitTextPlacement();
    return;
  }
  if (addMode) return;
  const { hit } = raycast(event);
  if (!hit) deselectFace();
});
renderer.domElement.addEventListener('pointermove', updateTextPreview);

function resizeRenderer() {
  const width = Math.max(1, canvasHost.clientWidth), height = Math.max(1, canvasHost.clientHeight);
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
resizeObserver = new ResizeObserver(resizeRenderer); resizeObserver.observe(canvasHost); resizeRenderer();
function animate() { requestAnimationFrame(animate); controls.update(); updateOverlayPositions(); renderer.render(scene, camera); }
animate();

function captureState() {
  return { version: 3, boxes: state.boxes.map(cloneBox), boardThickness: round(state.boardThickness), textPlacements: state.textPlacements.map((p) => ({ position: [...p.position], quaternion: [...p.quaternion], topSurface: Boolean(p.topSurface), spec: { ...p.spec } })) };
}
function restoreState(snapshot) {
  const source = snapshot?.state && !snapshot.boxes ? snapshot.state : snapshot;
  if (!source || !Array.isArray(source.boxes) || source.boxes.length === 0) return false;
  const boxes = source.boxes.map((box, index) => ({ id: String(box.id || (index === 0 ? 'base' : `piece-${index}`)), minX: Number(box.minX), maxX: Number(box.maxX), minY: Number(box.minY), maxY: Number(box.maxY), minZ: Number(box.minZ), maxZ: Number(box.maxZ) }));
  if (boxes.some((b) => ![b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ].every(Number.isFinite) || b.maxX <= b.minX || b.maxY <= b.minY || b.maxZ <= b.minZ)) return false;
  state = { version: 3, boxes, boardThickness: clamp(source.boardThickness || 3, 1, 20), textPlacements: Array.isArray(source.textPlacements) ? source.textPlacements.map((p) => ({ position: Array.isArray(p.position) ? p.position.map(Number) : [0,0,0], quaternion: Array.isArray(p.quaternion) ? p.quaternion.map(Number) : [0,0,0,1], topSurface: Boolean(p.topSurface), spec: { text: p.spec?.text || 'TEXT', size: clamp(p.spec?.size || 54,12,180), fontFamily: p.spec?.fontFamily || 'Arial, sans-serif', textColor: p.spec?.textColor || '#1f2d36', backgroundColor: p.spec?.backgroundColor || '#ffffff', bold: Boolean(p.spec?.bold), italic: Boolean(p.spec?.italic), underline: Boolean(p.spec?.underline), underlineStyle: p.spec?.underlineStyle || 'solid' } })) : [] };
  addMode = false; draftBox = null; placementMode = false; selectedFaceKey = ''; selectedFaceSnapshot = null; addBoxEditor.hidden = true; cancelTextPlacementButton.hidden = true; renderAll(); return true;
}
function resetConfiguration() {
  state = { version: 3, boxes: [makeBaseBox()], boardThickness: 3, textPlacements: [] };
  addMode = false; draftBox = null; placementMode = false; selectedFaceKey = ''; selectedFaceSnapshot = null; addBoxEditor.hidden = true; cancelTextPlacementButton.hidden = true; renderAll(); return true;
}
function setUnits(value) { units = value === 'imperial' ? 'imperial' : 'metric'; renderAll(); }
function setCurrency(value) { currency = ['USD','RON','EUR'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'EUR'; renderSummary(); }
function setLocale(value) { if (TEXT[value]) locale = value; renderAll(); }
function setDarkMode(value) { document.body.classList.toggle('cardbox-dark-mode', Boolean(value)); scene.background.set(Boolean(value) ? 0x172027 : 0xf0f4f6); ground.material.color.set(Boolean(value) ? 0x141b20 : 0xe7ecef); }
function toggleDimensions() { dimensionsVisible = !dimensionsVisible; renderDimensions(); return dimensionsVisible; }
function toggleTechnicalEdges() { technicalEdgesVisible = !technicalEdgesVisible; rebuildSurfaceMeshes(); return technicalEdgesVisible; }
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3; const b = boundsForBoxes(); const maxDim = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, b.maxY - b.minY + (placementMode ? LID_LIFT_MM : 0), 400);
  if (cameraMode === 1) camera.position.set(0, maxDim * 1.8, 0.01); else if (cameraMode === 2) camera.position.set(maxDim * 1.45, maxDim * 0.65, 0); else camera.position.set(maxDim * 1.2, maxDim * 0.9, maxDim * 1.25);
  fitControlsTarget(); controls.update();
}
function getPrice() { const metrics = calculateUnionMetrics(state.boxes); const eur = metrics.areaMm2 / 1_000_000 * BOARD_EUR_M2 + state.textPlacements.length * 0.35 + 0.95 + Math.max(0, state.boxes.length - 1) * 0.18; return { amount: eur * (CURRENCY_FROM_EUR[currency] || 1), currency }; }

window.CARDBOX_CONFIGURATOR_API = { captureState, restoreState, resetConfiguration, setUnits, setCurrency, setLocale, setDarkMode, toggleDimensions, toggleTechnicalEdges, cycleCamera, getPrice, syncToolButtons() {}, closeToolPanels() {} };

bindAccordions(); bindControls(); renderAll();
window.addEventListener('beforeunload', () => resizeObserver?.disconnect());
