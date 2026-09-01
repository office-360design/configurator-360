import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BOARD_GRADES = Object.freeze({
  'e-flute': Object.freeze({ label: 'E-flute', thickness: 1.5, eurM2: 1.2 }),
  'b-flute': Object.freeze({ label: 'B-flute', thickness: 3, eurM2: 1.55 }),
  'c-flute': Object.freeze({ label: 'C-flute', thickness: 4, eurM2: 1.75 }),
  'eb-double': Object.freeze({ label: 'EB double wall', thickness: 5, eurM2: 2.25 }),
  'bc-double': Object.freeze({ label: 'BC double wall', thickness: 7, eurM2: 2.75 }),
});
const PRINT_EUR_M2 = Object.freeze({ none: 0, 'one-color': 0.42, 'full-color': 1.15 });
const CURRENCY_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const DEFAULT_COLOR = '#c78f5a';
const DEFAULT_WALL_STYLE = Object.freeze({ grade: 'b-flute', color: DEFAULT_COLOR, print: 'none', reinforced: false });

const TEXT = Object.freeze({
  'en-US': Object.freeze({
    'intro.eyebrow': 'Packaging geometry', 'intro.title': 'Cardboard box settings', 'intro.copy': 'Build an orthogonal footprint and customize each side independently.',
    'section.footprint': 'Footprint', 'section.side': 'Selected side', 'section.summary': 'Summary & pricing',
    'footprint.preset': 'Shape preset', 'preset.rectangle': 'Rectangle', 'preset.l': 'L shape', 'preset.u': 'U shape',
    'dimension.width': 'Overall width', 'dimension.depth': 'Overall depth', 'dimension.height': 'Wall height', 'dimension.floor': 'Floor thickness',
    'footprint.preview': 'Footprint editor', 'step.title': 'Add 90° wall step', 'step.help': 'Adds four right-angle corners to the selected wall.',
    'step.span': 'Step span', 'step.depth': 'Step depth', 'step.direction': 'Direction', 'step.outward': 'Outward', 'step.inward': 'Inward / notch', 'step.add': 'Add to selected wall',
    'side.grade': 'Board grade', 'side.print': 'Printing', 'print.none': 'No print', 'print.one': '1-colour print', 'print.full': 'Full-colour print',
    'side.color': 'Outer colour', 'side.reinforced': 'Reinforced side', 'side.reinforcedHelp': 'Adds a second board layer to this wall.', 'side.applyAll': 'Apply this side to all walls',
    'summary.sides': 'Sides', 'summary.perimeter': 'Perimeter', 'summary.boardArea': 'Board area', 'summary.floorArea': 'Floor area', 'summary.total': 'Estimated total',
    'summary.note': 'Indicative material and print estimate for one configured box.', 'summary.material': 'Cardboard', 'summary.print': 'Printing', 'summary.floor': 'Floor', 'summary.setup': 'Production setup',
    'wall': 'Side', 'viewer.hint': 'Click a wall to customize it', 'error.stepShort': 'The selected wall is too short for this step.', 'error.stepInvalid': 'That step would create an invalid or intersecting footprint.',
  }),
  'ro-RO': Object.freeze({
    'intro.eyebrow': 'Geometrie ambalaj', 'intro.title': 'Setări cutie din carton', 'intro.copy': 'Construiește un contur ortogonal și personalizează independent fiecare latură.',
    'section.footprint': 'Contur', 'section.side': 'Latura selectată', 'section.summary': 'Sumar și preț',
    'footprint.preset': 'Formă de bază', 'preset.rectangle': 'Dreptunghi', 'preset.l': 'Formă L', 'preset.u': 'Formă U',
    'dimension.width': 'Lățime totală', 'dimension.depth': 'Adâncime totală', 'dimension.height': 'Înălțime pereți', 'dimension.floor': 'Grosime bază',
    'footprint.preview': 'Editor contur', 'step.title': 'Adaugă treaptă la 90°', 'step.help': 'Adaugă patru colțuri drepte pe latura selectată.',
    'step.span': 'Lățime treaptă', 'step.depth': 'Adâncime treaptă', 'step.direction': 'Direcție', 'step.outward': 'În exterior', 'step.inward': 'În interior / decupaj', 'step.add': 'Adaugă pe latura selectată',
    'side.grade': 'Tip carton', 'side.print': 'Imprimare', 'print.none': 'Fără imprimare', 'print.one': 'Imprimare 1 culoare', 'print.full': 'Imprimare full color',
    'side.color': 'Culoare exterioară', 'side.reinforced': 'Latură ranforsată', 'side.reinforcedHelp': 'Adaugă un al doilea strat de carton pe această latură.', 'side.applyAll': 'Aplică această latură tuturor pereților',
    'summary.sides': 'Laturi', 'summary.perimeter': 'Perimetru', 'summary.boardArea': 'Suprafață carton', 'summary.floorArea': 'Suprafață bază', 'summary.total': 'Total estimat',
    'summary.note': 'Estimare orientativă de material și imprimare pentru o cutie configurată.', 'summary.material': 'Carton', 'summary.print': 'Imprimare', 'summary.floor': 'Bază', 'summary.setup': 'Pregătire producție',
    'wall': 'Latura', 'viewer.hint': 'Apasă pe un perete pentru personalizare', 'error.stepShort': 'Latura selectată este prea scurtă pentru această treaptă.', 'error.stepInvalid': 'Treapta ar crea un contur invalid sau cu intersecții.',
  }),
  'de-DE': Object.freeze({
    'intro.eyebrow': 'Verpackungsgeometrie', 'intro.title': 'Kartonbox-Einstellungen', 'intro.copy': 'Erstellen Sie einen rechtwinkligen Grundriss und konfigurieren Sie jede Seite einzeln.',
    'section.footprint': 'Grundriss', 'section.side': 'Ausgewählte Seite', 'section.summary': 'Übersicht & Preis',
    'footprint.preset': 'Grundform', 'preset.rectangle': 'Rechteck', 'preset.l': 'L-Form', 'preset.u': 'U-Form',
    'dimension.width': 'Gesamtbreite', 'dimension.depth': 'Gesamttiefe', 'dimension.height': 'Wandhöhe', 'dimension.floor': 'Bodenstärke',
    'footprint.preview': 'Grundriss-Editor', 'step.title': '90°-Wandstufe hinzufügen', 'step.help': 'Fügt der ausgewählten Seite vier rechte Winkel hinzu.',
    'step.span': 'Stufenbreite', 'step.depth': 'Stufentiefe', 'step.direction': 'Richtung', 'step.outward': 'Nach außen', 'step.inward': 'Nach innen / Aussparung', 'step.add': 'Zur ausgewählten Seite hinzufügen',
    'side.grade': 'Wellpappensorte', 'side.print': 'Druck', 'print.none': 'Ohne Druck', 'print.one': '1-Farbdruck', 'print.full': 'Vollfarbdruck',
    'side.color': 'Außenfarbe', 'side.reinforced': 'Verstärkte Seite', 'side.reinforcedHelp': 'Fügt dieser Wand eine zweite Kartonlage hinzu.', 'side.applyAll': 'Diese Seite auf alle Wände anwenden',
    'summary.sides': 'Seiten', 'summary.perimeter': 'Umfang', 'summary.boardArea': 'Kartonfläche', 'summary.floorArea': 'Bodenfläche', 'summary.total': 'Geschätzter Gesamtpreis',
    'summary.note': 'Unverbindliche Material- und Druckschätzung für eine konfigurierte Box.', 'summary.material': 'Karton', 'summary.print': 'Druck', 'summary.floor': 'Boden', 'summary.setup': 'Produktionsvorbereitung',
    'wall': 'Seite', 'viewer.hint': 'Klicken Sie auf eine Wand, um sie anzupassen', 'error.stepShort': 'Die ausgewählte Wand ist für diese Stufe zu kurz.', 'error.stepInvalid': 'Diese Stufe würde einen ungültigen oder sich überschneidenden Grundriss erzeugen.',
  }),
});

const $ = (selector) => document.querySelector(selector);
const canvasHost = $('#canvasHost');
const dimensionLayer = $('#dimensionLayer');
const footprintPreview = $('#footprintPreview');
const widthInput = $('#widthInput');
const depthInput = $('#depthInput');
const heightInput = $('#heightInput');
const floorThicknessInput = $('#floorThicknessInput');
const stepSpanInput = $('#stepSpanInput');
const stepDepthInput = $('#stepDepthInput');
const stepDirection = $('#stepDirection');
const stepError = $('#stepError');
const boardGradeSelect = $('#boardGradeSelect');
const printSelect = $('#printSelect');
const wallColorInput = $('#wallColorInput');
const wallColorText = $('#wallColorText');
const reinforcedToggle = $('#reinforcedToggle');
const selectedWallName = $('#selectedWallName');
const selectedWallLength = $('#selectedWallLength');
const selectedWallBadge = $('#selectedWallBadge');
const wallList = $('#wallList');
const summaryTotal = $('#summaryTotal');

let locale = localeForHost();
let units = locale === 'en-US' ? 'imperial' : 'metric';
let currency = locale === 'ro-RO' ? 'RON' : locale === 'de-DE' ? 'EUR' : 'USD';
let dimensionsVisible = true;
let technicalEdgesVisible = true;
let selectedWall = 0;
let activePreset = 'rectangle';
let cameraMode = 0;
let resizeObserver;
let wallMeshes = [];
let dimensionAnchors = [];
let stepSpanMm = 180;
let stepDepthMm = 120;

function localeForHost() {
  const host = location.hostname.toLowerCase();
  if (host.includes('360configurator.ro')) return 'ro-RO';
  if (host.includes('360konfigurator.de')) return 'de-DE';
  return 'en-US';
}
function t(key) { return TEXT[locale]?.[key] ?? TEXT['en-US'][key] ?? key; }
function cloneStyle(style = DEFAULT_WALL_STYLE) { return { grade: style.grade, color: style.color, print: style.print, reinforced: Boolean(style.reinforced) }; }
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

function rectanglePoints(width = 600, depth = 400) {
  return [{ x: -width / 2, z: -depth / 2 }, { x: width / 2, z: -depth / 2 }, { x: width / 2, z: depth / 2 }, { x: -width / 2, z: depth / 2 }];
}
function lPoints(width = 600, depth = 400) {
  const xCut = width * 0.08;
  const zCut = depth * 0.04;
  return [
    { x: -width / 2, z: -depth / 2 }, { x: width / 2, z: -depth / 2 }, { x: width / 2, z: zCut },
    { x: xCut, z: zCut }, { x: xCut, z: depth / 2 }, { x: -width / 2, z: depth / 2 },
  ];
}
function uPoints(width = 600, depth = 400) {
  const notchHalf = width * 0.2;
  const notchBottom = depth * 0.02;
  return [
    { x: -width / 2, z: -depth / 2 }, { x: width / 2, z: -depth / 2 }, { x: width / 2, z: depth / 2 },
    { x: notchHalf, z: depth / 2 }, { x: notchHalf, z: notchBottom }, { x: -notchHalf, z: notchBottom },
    { x: -notchHalf, z: depth / 2 }, { x: -width / 2, z: depth / 2 },
  ];
}
function presetPoints(preset, width, depth) {
  if (preset === 'l') return lPoints(width, depth);
  if (preset === 'u') return uPoints(width, depth);
  return rectanglePoints(width, depth);
}

let state = {
  version: 1,
  points: rectanglePoints(),
  wallStyles: Array.from({ length: 4 }, () => cloneStyle()),
  height: 300,
  floorThickness: 3,
};

function signedArea(points = state.points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}
function bounds(points = state.points) {
  const xs = points.map((p) => p.x); const zs = points.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
}
function centerPoints(points) {
  const b = bounds(points); const cx = (b.minX + b.maxX) / 2; const cz = (b.minZ + b.maxZ) / 2;
  return points.map((p) => ({ x: round(p.x - cx), z: round(p.z - cz) }));
}
function edgeLength(index, points = state.points) {
  const a = points[index]; const b = points[(index + 1) % points.length];
  return Math.hypot(b.x - a.x, b.z - a.z);
}
function perimeter(points = state.points) { return points.reduce((total, _p, i) => total + edgeLength(i, points), 0); }
function polygonAreaMm2(points = state.points) { return Math.abs(signedArea(points)); }

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
function applyPreset(preset) {
  const b = bounds();
  const width = clamp(b.width || 600, 100, 3000); const depth = clamp(b.depth || 400, 100, 3000);
  state.points = presetPoints(preset, width, depth);
  state.wallStyles = Array.from({ length: state.points.length }, () => cloneStyle(DEFAULT_WALL_STYLE));
  activePreset = preset;
  selectedWall = 0;
  renderAll();
}
function addWallStep() {
  stepError.hidden = true;
  const i = Math.min(selectedWall, state.points.length - 1);
  const a = state.points[i]; const b = state.points[(i + 1) % state.points.length];
  const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
  stepSpanMm = clamp(toMm(stepSpanInput.value), 40, 1200);
  stepDepthMm = clamp(toMm(stepDepthInput.value), 20, 1000);
  const span = stepSpanMm;
  const depth = stepDepthMm;
  if (length < span + 40) { stepError.textContent = t('error.stepShort'); stepError.hidden = false; return; }
  const ux = dx / length; const uz = dz / length;
  const ccw = signedArea() > 0;
  let nx = ccw ? uz : -uz; let nz = ccw ? -ux : ux;
  if (stepDirection.value === 'inward') { nx *= -1; nz *= -1; }
  const margin = (length - span) / 2;
  const p1 = { x: a.x + ux * margin, z: a.z + uz * margin };
  const p2 = { x: p1.x + nx * depth, z: p1.z + nz * depth };
  const p3 = { x: p2.x + ux * span, z: p2.z + uz * span };
  const p4 = { x: p3.x - nx * depth, z: p3.z - nz * depth };
  const candidate = state.points.map((p) => ({ ...p }));
  candidate.splice(i + 1, 0, p1, p2, p3, p4);
  const centered = centerPoints(candidate);
  if (!validOrthogonalPolygon(centered)) { stepError.textContent = t('error.stepInvalid'); stepError.hidden = false; return; }
  const inherited = cloneStyle(state.wallStyles[i]);
  state.points = centered;
  state.wallStyles.splice(i, 1, ...Array.from({ length: 5 }, () => cloneStyle(inherited)));
  selectedWall = i + 2;
  activePreset = 'custom';
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

function disposeObject(object) {
  object.traverse((child) => { if (child.geometry) child.geometry.dispose?.(); if (child.material) { const materials = Array.isArray(child.material) ? child.material : [child.material]; materials.forEach((m) => m.dispose?.()); } });
}
function wallMaterial(style, index) {
  const color = new THREE.Color(style.color || DEFAULT_COLOR);
  if (index === selectedWall) color.lerp(new THREE.Color(0x60bdf4), 0.2);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
}
function rebuild3D() {
  for (const child of [...boxGroup.children]) { boxGroup.remove(child); disposeObject(child); }
  wallMeshes = []; dimensionAnchors = [];
  const shape = new THREE.Shape();
  state.points.forEach((p, i) => { if (i === 0) shape.moveTo(p.x, p.z); else shape.lineTo(p.x, p.z); });
  shape.closePath();
  const floorGeometry = new THREE.ShapeGeometry(shape);
  const floor = new THREE.Mesh(floorGeometry, new THREE.MeshStandardMaterial({ color: 0xb77c47, roughness: 0.9, side: THREE.DoubleSide }));
  floor.rotation.x = Math.PI / 2; floor.position.y = Math.max(0.6, state.floorThickness / 2); floor.receiveShadow = true; floor.castShadow = true; boxGroup.add(floor);

  state.points.forEach((a, i) => {
    const b = state.points[(i + 1) % state.points.length];
    const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    const style = state.wallStyles[i] || cloneStyle(); const grade = BOARD_GRADES[style.grade] || BOARD_GRADES['b-flute'];
    const thickness = grade.thickness * (style.reinforced ? 1.8 : 1);
    const geometry = new THREE.BoxGeometry(length, state.height, thickness);
    const mesh = new THREE.Mesh(geometry, wallMaterial(style, i));
    mesh.position.set((a.x + b.x) / 2, state.height / 2 + state.floorThickness, (a.z + b.z) / 2);
    mesh.rotation.y = Math.atan2(-dz, dx);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.wallIndex = i; mesh.userData.cardboxWall = true;
    boxGroup.add(mesh); wallMeshes.push(mesh);
    if (technicalEdgesVisible) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: i === selectedWall ? 0x0876be : 0x755335, transparent: true, opacity: i === selectedWall ? 0.8 : 0.34 }));
      lines.position.copy(mesh.position); lines.rotation.copy(mesh.rotation); lines.userData.edgeOverlay = true; boxGroup.add(lines);
    }
    dimensionAnchors.push(new THREE.Vector3(mesh.position.x, state.height + state.floorThickness + 28, mesh.position.z));
  });
  fitControlsTarget();
  renderDimensions();
}
function fitControlsTarget() {
  const b = bounds(); controls.target.set((b.minX + b.maxX) / 2, state.height * 0.38, (b.minZ + b.maxZ) / 2);
}

function renderFootprintPreview() {
  const b = bounds(); const pad = 20; const vw = 260; const vh = 180;
  const scale = Math.min((vw - pad * 2) / Math.max(1, b.width), (vh - pad * 2) / Math.max(1, b.depth));
  const map = (p) => ({ x: vw / 2 + p.x * scale, y: vh / 2 + p.z * scale });
  const pointsText = state.points.map((p) => { const q = map(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
  let html = `<polygon class="footprint-shape" points="${pointsText}"/>`;
  state.points.forEach((a, i) => {
    const bPoint = state.points[(i + 1) % state.points.length]; const p1 = map(a); const p2 = map(bPoint); const mx = (p1.x + p2.x) / 2; const my = (p1.y + p2.y) / 2;
    html += `<line class="footprint-wall${i === selectedWall ? ' selected' : ''}" data-wall-index="${i}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>`;
    html += `<text class="footprint-wall-label" x="${mx}" y="${my}">${i + 1}</text>`;
  });
  footprintPreview.innerHTML = html;
  $('#footprintAreaText').textContent = `${(polygonAreaMm2() / 1_000_000).toFixed(3)} m²`;
}
function renderWallControls() {
  selectedWall = Math.max(0, Math.min(selectedWall, state.points.length - 1));
  const style = state.wallStyles[selectedWall] || cloneStyle();
  selectedWallName.textContent = `${t('wall')} ${selectedWall + 1}`;
  selectedWallBadge.textContent = String(selectedWall + 1);
  selectedWallLength.textContent = displayLength(edgeLength(selectedWall), 0);
  boardGradeSelect.value = style.grade; printSelect.value = style.print; reinforcedToggle.checked = Boolean(style.reinforced);
  wallColorInput.value = style.color; wallColorText.value = style.color.toUpperCase();
  wallList.innerHTML = state.points.map((_p, i) => `<button type="button" class="${i === selectedWall ? 'selected' : ''}" data-wall-list-index="${i}"><span>${t('wall')} ${i + 1}</span><span>${displayLength(edgeLength(i), 0)}</span></button>`).join('');
}
function renderInputs() {
  const b = bounds();
  widthInput.value = round(fromMm(b.width), units === 'imperial' ? 2 : 0);
  depthInput.value = round(fromMm(b.depth), units === 'imperial' ? 2 : 0);
  heightInput.value = round(fromMm(state.height), units === 'imperial' ? 2 : 0);
  floorThicknessInput.value = round(fromMm(state.floorThickness), units === 'imperial' ? 2 : 1);
  stepSpanInput.value = round(fromMm(stepSpanMm), units === 'imperial' ? 2 : 0);
  stepDepthInput.value = round(fromMm(stepDepthMm), units === 'imperial' ? 2 : 0);
  const imperial = units === 'imperial';
  [[widthInput, 100, 3000, 10], [depthInput, 100, 3000, 10], [heightInput, 50, 2000, 10],
    [floorThicknessInput, 1, 20, 0.5], [stepSpanInput, 40, 1200, 10], [stepDepthInput, 20, 1000, 10]].forEach(([input, minMm, maxMm, stepMm]) => {
    input.min = String(round(imperial ? minMm / 25.4 : minMm, imperial ? 2 : 1));
    input.max = String(round(imperial ? maxMm / 25.4 : maxMm, imperial ? 2 : 1));
    input.step = String(round(imperial ? stepMm / 25.4 : stepMm, imperial ? 2 : 1));
  });
  document.querySelectorAll('[data-unit-label]').forEach((el) => { el.textContent = imperial ? 'in' : 'mm'; });
  document.querySelectorAll('[data-shape-preset]').forEach((button) => { const selected = button.dataset.shapePreset === activePreset; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
}
function calculatePricing() {
  let materialEur = 0; let printEur = 0; let wallAreaM2 = 0;
  state.points.forEach((_p, i) => {
    const area = edgeLength(i) * state.height / 1_000_000; wallAreaM2 += area;
    const style = state.wallStyles[i] || cloneStyle(); const grade = BOARD_GRADES[style.grade] || BOARD_GRADES['b-flute'];
    materialEur += area * grade.eurM2 * (style.reinforced ? 1.78 : 1);
    printEur += area * (PRINT_EUR_M2[style.print] || 0);
  });
  const floorAreaM2 = polygonAreaMm2() / 1_000_000;
  const floorEur = floorAreaM2 * BOARD_GRADES['b-flute'].eurM2 * Math.max(0.5, state.floorThickness / 3);
  const setupEur = 0.85 + state.points.length * 0.035;
  return { wallAreaM2, floorAreaM2, materialEur, printEur, floorEur, setupEur, totalEur: materialEur + printEur + floorEur + setupEur };
}
function renderSummary() {
  const price = calculatePricing();
  $('#summarySides').textContent = String(state.points.length);
  $('#summaryPerimeter').textContent = displayMetres(perimeter());
  $('#summaryBoardArea').textContent = `${price.wallAreaM2.toFixed(3)} m²`;
  $('#summaryFloorArea').textContent = `${price.floorAreaM2.toFixed(3)} m²`;
  $('#priceBreakdown').innerHTML = [
    [t('summary.material'), price.materialEur], [t('summary.print'), price.printEur], [t('summary.floor'), price.floorEur], [t('summary.setup'), price.setupEur],
  ].map(([label, value]) => `<div class="price-row"><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join('');
  summaryTotal.textContent = formatMoney(price.totalEur);
}
function renderTranslations() {
  document.documentElement.lang = locale.startsWith('ro') ? 'ro' : locale.startsWith('de') ? 'de' : 'en';
  document.querySelectorAll('[data-cardbox-i18n]').forEach((el) => { el.textContent = t(el.dataset.cardboxI18n); });
  $('#viewerHint').textContent = t('viewer.hint');
}
function renderAll() { renderInputs(); renderTranslations(); renderWallControls(); renderFootprintPreview(); renderSummary(); rebuild3D(); }

function setSelectedWall(index) { selectedWall = clamp(index, 0, state.points.length - 1); renderWallControls(); renderFootprintPreview(); rebuild3D(); }
function updateSelectedStyle(patch) { state.wallStyles[selectedWall] = { ...cloneStyle(state.wallStyles[selectedWall]), ...patch }; renderAll(); }

function bindAccordions() {
  document.querySelectorAll('.accordion-toggle').forEach((button) => button.addEventListener('click', () => {
    const section = button.closest('.accordion-section'); const panel = section.querySelector('.accordion-panel'); const open = !section.classList.contains('is-open');
    section.classList.toggle('is-open', open); button.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
  }));
}
function bindControls() {
  document.querySelectorAll('[data-shape-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.shapePreset)));
  widthInput.addEventListener('change', () => resizeFootprint(toMm(widthInput.value), bounds().depth));
  depthInput.addEventListener('change', () => resizeFootprint(bounds().width, toMm(depthInput.value)));
  heightInput.addEventListener('change', () => { state.height = clamp(toMm(heightInput.value), 50, 2000); renderAll(); });
  floorThicknessInput.addEventListener('change', () => { state.floorThickness = clamp(toMm(floorThicknessInput.value), 1, 20); renderAll(); });
  stepSpanInput.addEventListener('change', () => { stepSpanMm = clamp(toMm(stepSpanInput.value), 40, 1200); renderInputs(); });
  stepDepthInput.addEventListener('change', () => { stepDepthMm = clamp(toMm(stepDepthInput.value), 20, 1000); renderInputs(); });
  $('#addStepButton').addEventListener('click', addWallStep);
  boardGradeSelect.addEventListener('change', () => updateSelectedStyle({ grade: boardGradeSelect.value }));
  printSelect.addEventListener('change', () => updateSelectedStyle({ print: printSelect.value }));
  reinforcedToggle.addEventListener('change', () => updateSelectedStyle({ reinforced: reinforcedToggle.checked }));
  wallColorInput.addEventListener('input', () => { wallColorText.value = wallColorInput.value.toUpperCase(); updateSelectedStyle({ color: wallColorInput.value }); });
  wallColorText.addEventListener('change', () => { const value = wallColorText.value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) { wallColorInput.value = value; updateSelectedStyle({ color: value.toLowerCase() }); } else wallColorText.value = state.wallStyles[selectedWall].color.toUpperCase(); });
  $('#applyAllButton').addEventListener('click', () => { const style = cloneStyle(state.wallStyles[selectedWall]); state.wallStyles = state.wallStyles.map(() => cloneStyle(style)); renderAll(); });
  wallList.addEventListener('click', (event) => { const button = event.target.closest('[data-wall-list-index]'); if (button) setSelectedWall(Number(button.dataset.wallListIndex)); });
  footprintPreview.addEventListener('click', (event) => { const wall = event.target.closest('[data-wall-index]'); if (wall) setSelectedWall(Number(wall.dataset.wallIndex)); });
}

const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(wallMeshes, false)[0]; if (hit?.object?.userData?.cardboxWall) setSelectedWall(hit.object.userData.wallIndex);
});

function renderDimensions() {
  dimensionLayer.hidden = !dimensionsVisible;
  if (!dimensionsVisible) { dimensionLayer.innerHTML = ''; return; }
  dimensionLayer.innerHTML = dimensionAnchors.map((_a, i) => `<div class="dimension-label" data-dimension-index="${i}">${displayLength(edgeLength(i), 0)}</div>`).join('');
}
function updateDimensionPositions() {
  if (!dimensionsVisible) return;
  const rect = canvasHost.getBoundingClientRect();
  dimensionAnchors.forEach((world, i) => {
    const projected = world.clone().project(camera); const el = dimensionLayer.querySelector(`[data-dimension-index="${i}"]`); if (!el) return;
    const visible = projected.z > -1 && projected.z < 1; el.style.display = visible ? '' : 'none';
    el.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`; el.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
  });
}
function resizeRenderer() {
  const width = Math.max(1, canvasHost.clientWidth); const height = Math.max(1, canvasHost.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
resizeObserver = new ResizeObserver(resizeRenderer); resizeObserver.observe(canvasHost); resizeRenderer();
function animate() { requestAnimationFrame(animate); controls.update(); updateDimensionPositions(); renderer.render(scene, camera); }
animate();

function captureState() {
  return {
    version: 1,
    points: state.points.map((p) => ({ x: round(p.x), z: round(p.z) })),
    wallStyles: state.wallStyles.map(cloneStyle),
    height: round(state.height), floorThickness: round(state.floorThickness), activePreset,
  };
}
function restoreState(snapshot) {
  const source = snapshot?.state && !snapshot.points ? snapshot.state : snapshot;
  if (!source || !Array.isArray(source.points) || !validOrthogonalPolygon(source.points)) return false;
  state.points = centerPoints(source.points.map((p) => ({ x: Number(p.x), z: Number(p.z) })));
  state.wallStyles = Array.from({ length: state.points.length }, (_v, i) => cloneStyle(source.wallStyles?.[i] || DEFAULT_WALL_STYLE));
  state.height = Number.isFinite(Number(source.height)) ? clamp(source.height, 50, 2000) : 300;
  state.floorThickness = Number.isFinite(Number(source.floorThickness)) ? clamp(source.floorThickness, 1, 20) : 3;
  activePreset = ['rectangle', 'l', 'u'].includes(source.activePreset) ? source.activePreset : 'custom'; selectedWall = 0; renderAll(); return true;
}
function resetConfiguration() { state = { version: 1, points: rectanglePoints(), wallStyles: Array.from({ length: 4 }, () => cloneStyle()), height: 300, floorThickness: 3 }; activePreset = 'rectangle'; selectedWall = 0; renderAll(); return true; }
function setUnits(value) { units = value === 'imperial' ? 'imperial' : 'metric'; renderAll(); }
function setCurrency(value) { currency = ['USD', 'RON', 'EUR'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'EUR'; renderSummary(); }
function setLocale(value) { if (TEXT[value]) locale = value; renderAll(); }
function setDarkMode(value) { document.body.classList.toggle('cardbox-dark-mode', Boolean(value)); scene.background.set(Boolean(value) ? 0x172027 : 0xf0f4f6); ground.material.color.set(Boolean(value) ? 0x141b20 : 0xe7ecef); }
function toggleDimensions() { dimensionsVisible = !dimensionsVisible; renderDimensions(); return dimensionsVisible; }
function toggleTechnicalEdges() { technicalEdgesVisible = !technicalEdgesVisible; rebuild3D(); return technicalEdgesVisible; }
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3; const b = bounds(); const maxDim = Math.max(b.width, b.depth, state.height, 400);
  if (cameraMode === 1) camera.position.set(0, maxDim * 1.7, 0.01);
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

bindAccordions(); bindControls(); renderAll();
window.addEventListener('beforeunload', () => resizeObserver?.disconnect());
