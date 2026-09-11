import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FAMILIES = Object.freeze({
  compact: Object.freeze({ id: 'compact', width: 800, corner: 800, depth: 350, height: 2150 }),
  tall: Object.freeze({ id: 'tall', width: 900, corner: 900, depth: 350, height: 2300 }),
});

const DEFAULT_COLOUR = '#b98555';
const MODULE_COLOURS = Object.freeze([
  '#b98555', // NATURAL
  '#65422d', // MAHON
  '#34312f', // WENGE
]);
const FINISH_TEXTURES = Object.freeze({
  '#b98555': './assets/textures/wood-natural.png',
  '#65422d': './assets/textures/wood-mahon.png',
  '#34312f': './assets/textures/wood-wenge.png',
});
const POST = 42;
const BOARD = 22;
const BACK = 16;
const SIDE = 10;
const SIDE_RAIL_BODY = 92;
const SIDE_RAIL_RAMP = 14;
const SIDE_MID_BODY = 124;
const PLINTH_HEIGHT = 78;
const PLINTH_FRONT_RECESS = 42;
const BACK_POST_FOOT_DENT = 8;
const BACK_POST_FOOT_DENT_HEIGHT = 64;
const CONNECTOR_FACE_THICKNESS = 1.6;
const CONNECTOR_SIDE_THICKNESS = 1.6;
const CONNECTOR_SIDE_COVERAGE = POST / 2;
const CONNECTOR_OUTSET = 0.08;
const CONNECTOR_CORNER_OVERLAP = 0.45;
const CONNECTOR_MIN_HEIGHT = 26;
const GLASS_ALPHA = 0.28;
const EPS = 0.5;

const COPY = Object.freeze({
  'en-US': Object.freeze({
    'intro.eyebrow': 'Client-specific modular system',
    'intro.title': 'Bookshelf configurator',
    'intro.copy': 'Build one continuous run from straight modules and 90° L-corners. Every connected module always uses the same dimensional family.',
    'section.family': 'Dimensional family',
    'section.selected': 'Selected module',
    'section.components': 'Components',
    'family.compact': '800 × 350 × 2150 mm',
    'family.compactDims': 'Straight 800 × 350 × 2150 mm · Corner 800 × 800 × 2150 mm',
    'family.tall': '900 × 350 × 2300 mm',
    'family.tallDims': 'Straight 900 × 350 × 2300 mm · Corner 900 × 900 × 2300 mm',
    'family.rule': 'Changing the family updates every module together; heights cannot be mixed.',
    'selected.empty': 'Select a bookshelf module in the 3D view to choose its doors, wood finish or delete it.',
    'selected.module': 'Module',
    'selected.doors': 'Door configuration',
    'selected.colour': 'Wood finish',
    'selected.delete': 'Delete module',
    'selected.keepOne': 'At least one module must remain in the configuration.',
    'doors.open': 'Open',
    'doors.openHint': 'No doors',
    'doors.lower': 'Lower doors',
    'doors.lowerHint': 'Closed storage at the base',
    'doors.glazed': 'Glazed doors',
    'doors.glazedHint': 'Full-height glass closure',
    'add.kicker': 'Extend configuration',
    'add.title': 'Add module',
    'add.straight': 'Straight module',
    'add.straightHint': 'Continue in the same direction',
    'add.corner': 'L-corner module',
    'add.cornerHint': 'Turn the run by 90°',
    'add.confirm': 'Add module',
    'add.intersection': 'That module would intersect the existing bookshelf run.',
    'viewer.hint': 'Click a module to edit it. Use the + buttons to extend the configuration.',
    'type.straight': 'Straight',
    'type.corner': 'L-corner',
    'components.modules': 'Modules',
    'components.joints': 'Connections',
    'components.layout': 'Layout',
    'components.openRun': 'Open run',
    'components.closedLoop': 'Closed loop',
    'components.note': 'No prices are shown. One aluminium connection set is added automatically for every joint between two modules.',
    'components.straight': 'Straight bookshelf module',
    'components.corner': 'L-corner bookshelf module',
    'components.lowerKit': 'Lower solid-door set',
    'components.glazedKit': 'Full-height glazed-door set',
    'components.connector': 'Aluminium connection set',
    'components.finish': 'finish',
  }),
  'ro-RO': Object.freeze({
    'intro.eyebrow': 'Sistem modular dedicat clientului',
    'intro.title': 'Configurator bibliotecă',
    'intro.copy': 'Construiește un traseu continuu din module drepte și colțuri în L la 90°. Toate modulele conectate folosesc întotdeauna aceeași familie dimensională.',
    'section.family': 'Familie dimensională',
    'section.selected': 'Modul selectat',
    'section.components': 'Listă componente',
    'family.compact': '800 × 350 × 2150 mm',
    'family.compactDims': 'Drept 800 × 350 × 2150 mm · Colț 800 × 800 × 2150 mm',
    'family.tall': '900 × 350 × 2300 mm',
    'family.tallDims': 'Drept 900 × 350 × 2300 mm · Colț 900 × 900 × 2300 mm',
    'family.rule': 'Schimbarea familiei actualizează toate modulele împreună; înălțimile nu pot fi amestecate.',
    'selected.empty': 'Selectează un modul în vederea 3D pentru a alege ușile, finisajul lemnului sau pentru a-l șterge.',
    'selected.module': 'Modul',
    'selected.doors': 'Configurație uși',
    'selected.colour': 'Finisaj lemn',
    'selected.delete': 'Șterge modulul',
    'selected.keepOne': 'Configurația trebuie să păstreze cel puțin un modul.',
    'doors.open': 'Deschis',
    'doors.openHint': 'Fără uși',
    'doors.lower': 'Uși inferioare',
    'doors.lowerHint': 'Depozitare închisă la bază',
    'doors.glazed': 'Uși vitrate',
    'doors.glazedHint': 'Închidere cu geam pe toată înălțimea',
    'add.kicker': 'Extinde configurația',
    'add.title': 'Adaugă modul',
    'add.straight': 'Modul drept',
    'add.straightHint': 'Continuă în aceeași direcție',
    'add.corner': 'Modul de colț în L',
    'add.cornerHint': 'Schimbă direcția cu 90°',
    'add.confirm': 'Adaugă modulul',
    'add.intersection': 'Acest modul s-ar intersecta cu ansamblul existent.',
    'viewer.hint': 'Selectează un modul pentru editare. Folosește butoanele + pentru a extinde configurația.',
    'type.straight': 'Drept',
    'type.corner': 'Colț în L',
    'components.modules': 'Module',
    'components.joints': 'Conexiuni',
    'components.layout': 'Traseu',
    'components.openRun': 'Traseu deschis',
    'components.closedLoop': 'Traseu închis',
    'components.note': 'Nu sunt afișate prețuri. Se adaugă automat un set de conexiuni din aluminiu pentru fiecare îmbinare dintre două module.',
    'components.straight': 'Modul drept de bibliotecă',
    'components.corner': 'Modul de colț în L',
    'components.lowerKit': 'Set uși inferioare pline',
    'components.glazedKit': 'Set uși vitrate pe toată înălțimea',
    'components.connector': 'Set conexiune din aluminiu',
    'components.finish': 'finisaj',
  }),
  'de-DE': Object.freeze({
    'intro.eyebrow': 'Kundenspezifisches Modulsystem',
    'intro.title': 'Bücherregal-Konfigurator',
    'intro.copy': 'Erstellen Sie eine durchgehende Reihe aus geraden Modulen und 90°-L-Ecken. Alle verbundenen Module verwenden immer dieselbe Maßfamilie.',
    'section.family': 'Maßfamilie',
    'section.selected': 'Ausgewähltes Modul',
    'section.components': 'Komponenten',
    'family.compact': '800 × 350 × 2150 mm',
    'family.compactDims': 'Gerade 800 × 350 × 2150 mm · Ecke 800 × 800 × 2150 mm',
    'family.tall': '900 × 350 × 2300 mm',
    'family.tallDims': 'Gerade 900 × 350 × 2300 mm · Ecke 900 × 900 × 2300 mm',
    'family.rule': 'Beim Wechsel der Familie werden alle Module gemeinsam aktualisiert; unterschiedliche Höhen können nicht gemischt werden.',
    'selected.empty': 'Wählen Sie ein Modul in der 3D-Ansicht, um Türen, Holzoberfläche oder Löschen zu konfigurieren.',
    'selected.module': 'Modul',
    'selected.doors': 'Türkonfiguration',
    'selected.colour': 'Holzoberfläche',
    'selected.delete': 'Modul löschen',
    'selected.keepOne': 'Mindestens ein Modul muss in der Konfiguration verbleiben.',
    'doors.open': 'Offen',
    'doors.openHint': 'Ohne Türen',
    'doors.lower': 'Untere Türen',
    'doors.lowerHint': 'Geschlossener Stauraum unten',
    'doors.glazed': 'Glastüren',
    'doors.glazedHint': 'Vollhohe Glasfront',
    'add.kicker': 'Konfiguration erweitern',
    'add.title': 'Modul hinzufügen',
    'add.straight': 'Gerades Modul',
    'add.straightHint': 'In gleicher Richtung fortsetzen',
    'add.corner': 'L-Eckmodul',
    'add.cornerHint': 'Richtung um 90° ändern',
    'add.confirm': 'Modul hinzufügen',
    'add.intersection': 'Dieses Modul würde die vorhandene Regalreihe schneiden.',
    'viewer.hint': 'Klicken Sie ein Modul zum Bearbeiten an. Mit + erweitern Sie die Konfiguration.',
    'type.straight': 'Gerade',
    'type.corner': 'L-Ecke',
    'components.modules': 'Module',
    'components.joints': 'Verbindungen',
    'components.layout': 'Anordnung',
    'components.openRun': 'Offene Reihe',
    'components.closedLoop': 'Geschlossene Reihe',
    'components.note': 'Es werden keine Preise angezeigt. Für jede Verbindung zweier Module wird automatisch ein Aluminium-Verbindungssatz ergänzt.',
    'components.straight': 'Gerades Bücherregalmodul',
    'components.corner': 'L-Eck-Bücherregalmodul',
    'components.lowerKit': 'Satz untere Massivtüren',
    'components.glazedKit': 'Satz vollhohe Glastüren',
    'components.connector': 'Aluminium-Verbindungssatz',
    'components.finish': 'Oberfläche',
  }),
});

const $ = (selector) => document.querySelector(selector);
const canvasHost = $('#canvasHost');
const dimensionLayer = $('#dimensionLayer');
const addStartButton = $('#addStartButton');
const addEndButton = $('#addEndButton');
const addModulePanel = $('#addModulePanel');
const addModuleError = $('#addModuleError');
const selectedEmptyState = $('#selectedEmptyState');
const selectedModuleControls = $('#selectedModuleControls');
const selectedModuleLabel = $('#selectedModuleLabel');
const selectedModuleTypeBadge = $('#selectedModuleTypeBadge');
const deleteModuleButton = $('#deleteModuleButton');
const deleteModuleHint = $('#deleteModuleHint');
const viewerHint = $('#viewerHint');

let locale = localeForHost();
let units = locale === 'en-US' ? 'imperial' : 'metric';
let currency = locale === 'ro-RO' ? 'RON' : locale === 'de-DE' ? 'EUR' : 'USD';
let darkMode = false;
let dimensionsVisible = true;
let cameraMode = 0;
let selectedModuleId = '';
let addAt = 'end';
let pendingKind = 'straight';
let moduleMeshes = [];
let moduleGroups = new Map();
let dimensionAnchors = [];
let layoutCache = null;
let selectionHelper = null;
let resizeObserver;

let state = {
  version: 2,
  family: 'compact',
  origin: { x: -400, z: 0, heading: 0 },
  modules: [newModule('straight')],
};

function localeForHost() {
  const host = String(location.hostname || '').toLowerCase();
  if (host.includes('360configurator.ro')) return 'ro-RO';
  if (host.includes('360konfigurator.de')) return 'de-DE';
  return 'en-US';
}

function t(key) { return COPY[locale]?.[key] ?? COPY['en-US'][key] ?? key; }
function recordUndoCheckpoint() {
  window.BOOKSHELF_CONFIGURATOR_UNDO_HISTORY?.record?.();
}
function markDirty() {
  window.BOOKSHELF_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
}
function round(value, digits = 3) { const f = 10 ** digits; return Math.round(Number(value) * f) / f; }
function familySpec() { return FAMILIES[state.family] || FAMILIES.compact; }
function shelfTopCenterY(height) {
  return height - 130;
}

function shelfCentersForHeight(height) {
  // Client reference: both predefined size families have 9 shelves total
  // including the bottom shelf. The compact module defines the baseline
  // vertical rhythm. The tall module keeps the first 8 shelf centers at the
  // exact same heights as compact, lifts only the 9th shelf upward by the
  // family height delta, and preserves the same top gap above the 9th shelf.
  const compactBottom = PLINTH_HEIGHT + BOARD / 2;
  const compactTop = shelfTopCenterY(FAMILIES.compact.height);
  const compactStep = (compactTop - compactBottom) / 8;
  const compactCenters = Array.from({ length: 9 }, (_, index) => compactBottom + compactStep * index);

  if (Math.abs(height - FAMILIES.compact.height) < EPS) return compactCenters;

  if (Math.abs(height - FAMILIES.tall.height) < EPS) {
    const delta = FAMILIES.tall.height - FAMILIES.compact.height;
    return compactCenters.map((y, index) => (index === 8 ? y + delta : y));
  }

  const top = shelfTopCenterY(height);
  const step = (top - compactBottom) / 8;
  return Array.from({ length: 9 }, (_, index) => compactBottom + step * index);
}
function uid() { return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function defaultDoorState() {
  return {
    lowerLeft: false,
    lowerRight: false,
    lowerSingle: false,
    glazedLeft: false,
    glazedRight: false,
    glazedSingle: false,
  };
}
function cloneDoorState(source) {
  const base = defaultDoorState();
  const input = source && typeof source === 'object' ? source : {};
  Object.keys(base).forEach((key) => {
    if (typeof input[key] === 'boolean') base[key] = input[key];
  });
  return base;
}
function newModule(kind = 'straight') {
  return { id: uid(), kind, door: 'open', colour: DEFAULT_COLOUR, doorState: defaultDoorState() };
}
function cloneModule(module) {
  const colour = String(module?.colour || '').toLowerCase();
  return {
    id: String(module?.id || uid()),
    kind: module?.kind === 'corner' ? 'corner' : 'straight',
    door: ['open', 'lower', 'glazed'].includes(module?.door) ? module.door : 'open',
    colour: MODULE_COLOURS.includes(colour) ? colour : DEFAULT_COLOUR,
    doorState: cloneDoorState(module?.doorState),
  };
}
function normalizeAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result <= -Math.PI) result += Math.PI * 2;
  if (result > Math.PI) result -= Math.PI * 2;
  return result;
}
function vec(heading) { return { x: Math.cos(heading), z: Math.sin(heading) }; }
function rotateHeading(heading) { return normalizeAngle(heading - Math.PI / 2); }
function add2(a, b) { return { x: a.x + b.x, z: a.z + b.z }; }
function mul2(v, amount) { return { x: v.x * amount, z: v.z * amount }; }
function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function poseCopy(pose) { return { x: pose.x, z: pose.z, heading: pose.heading }; }
function posePoint(pose) { return { x: pose.x, z: pose.z }; }
function sameHeading(a, b) { return Math.abs(normalizeAngle(a - b)) < 1e-4; }

function advancePose(start, module, spec = familySpec()) {
  const d = vec(start.heading);
  if (module.kind === 'straight') {
    return {
      end: { x: start.x + d.x * spec.width, z: start.z + d.z * spec.width, heading: start.heading },
      corner: null,
    };
  }
  const nextHeading = rotateHeading(start.heading);
  const nd = vec(nextHeading);
  const corner = { x: start.x + d.x * spec.corner, z: start.z + d.z * spec.corner };
  return {
    corner,
    end: { x: corner.x + nd.x * spec.corner, z: corner.z + nd.z * spec.corner, heading: nextHeading },
  };
}

function deriveLayout(modules = state.modules, origin = state.origin, spec = familySpec()) {
  const entries = [];
  const segments = [];
  let pose = poseCopy(origin);
  modules.forEach((module, index) => {
    const start = poseCopy(pose);
    const advanced = advancePose(start, module, spec);
    if (module.kind === 'straight') {
      segments.push({ a: posePoint(start), b: posePoint(advanced.end), moduleIndex: index });
    } else {
      segments.push({ a: posePoint(start), b: advanced.corner, moduleIndex: index });
      segments.push({ a: advanced.corner, b: posePoint(advanced.end), moduleIndex: index });
    }
    entries.push({ module, index, start, end: poseCopy(advanced.end), corner: advanced.corner });
    pose = poseCopy(advanced.end);
  });
  const closed = modules.length >= 3
    && dist2(posePoint(pose), posePoint(origin)) < EPS
    && sameHeading(pose.heading, origin.heading);
  return { entries, segments, start: poseCopy(origin), end: pose, closed };
}

function endpointsOverlap(layout, tolerance = 0.5) {
  return Boolean(layout) && dist2(posePoint(layout.start), posePoint(layout.end)) < tolerance;
}

function pointEqual(a, b, tolerance = EPS) { return dist2(a, b) < tolerance; }
function orientation(a, b, c) {
  const value = (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
  if (Math.abs(value) < 1e-7) return 0;
  return value > 0 ? 1 : 2;
}
function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) + EPS && b.x + EPS >= Math.min(a.x, c.x)
    && b.z <= Math.max(a.z, c.z) + EPS && b.z + EPS >= Math.min(a.z, c.z);
}
function segmentsIntersect(a1, a2, b1, b2) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}
function validLayout(layout) {
  const list = layout.segments;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const consecutive = j === i + 1;
      const closesLoop = layout.closed && i === 0 && j === list.length - 1;
      if (consecutive || closesLoop) continue;
      if (!segmentsIntersect(a.a, a.b, b.a, b.b)) continue;
      const sharedEndpoint = pointEqual(a.a, b.a) || pointEqual(a.a, b.b) || pointEqual(a.b, b.a) || pointEqual(a.b, b.b);
      if (!sharedEndpoint) return false;
      // Non-consecutive modules touching at any intermediate endpoint would create a branch.
      return false;
    }
  }
  return true;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f4f6);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 18000);
camera.position.set(1500, 1250, 1850);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 450;
controls.maxDistance = 9000;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 850, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8c979e, 2.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(1600, 2600, 1250);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc5e2f4, 0.9);
fillLight.position.set(-1500, 1200, -1300);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14000, 14000),
  new THREE.MeshStandardMaterial({ color: 0xe7ecef, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -5;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(10000, 100, 0xc6d2d8, 0xdce4e8);
grid.position.y = -4;
grid.material.opacity = 0.32;
grid.material.transparent = true;
scene.add(grid);

const bookshelfGroup = new THREE.Group();
scene.add(bookshelfGroup);
const connectorGroup = new THREE.Group();
scene.add(connectorGroup);

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
}
function clearGroup(group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObject(child);
  });
}
const textureLoader = new THREE.TextureLoader();
const finishTextureCache = new Map();
let metalTextureCache = null;
function finishTexture(colour) {
  const key = String(colour || DEFAULT_COLOUR).toLowerCase();
  if (finishTextureCache.has(key)) return finishTextureCache.get(key);
  const url = FINISH_TEXTURES[key] || FINISH_TEXTURES[DEFAULT_COLOUR];
  const texture = textureLoader.load(url, () => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  finishTextureCache.set(key, texture);
  return texture;
}
function woodMaterial(colour) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: finishTexture(colour), roughness: 0.68, metalness: 0 });
}
function darkWoodMaterial(colour) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: finishTexture(colour), roughness: 0.76, metalness: 0 });
}
function glassMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: 0xc7e9f5, roughness: 0.12, metalness: 0, transparent: true, opacity: GLASS_ALPHA, transmission: 0.28, side: THREE.DoubleSide });
}
function metalTexture() {
  if (metalTextureCache) return metalTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef1f3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  for (let y = 0; y < height; y += 1) {
    const rowBias = Math.sin(y * 0.17) * 4 + Math.cos(y * 0.07) * 2;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const brushed = Math.sin(x * 0.42) * 1.8 + Math.sin(x * 0.11 + y * 0.04) * 1.1;
      const speckle = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * 3.2;
      const shade = Math.max(218, Math.min(245, 232 + rowBias + brushed + speckle));
      data[index] = shade;
      data[index + 1] = shade + 2;
      data[index + 2] = shade + 5;
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  metalTextureCache = texture;
  return texture;
}
function metalMaterial() {
  // Match the accepted light anodized-aluminium response from the Window
  // configurator, but compensate for Bookshelf not using the shared HDR/IBL
  // environment by keeping some diffuse response instead of full metalness.
  return new THREE.MeshPhysicalMaterial({
    color: 0xd6dade,
    map: metalTexture(),
    roughness: 0.36,
    metalness: 0.52,
    clearcoat: 0.14,
    clearcoatRoughness: 0.34,
  });
}
function tagMesh(mesh, moduleId) {
  mesh.userData.bookshelfModuleId = moduleId;
  moduleMeshes.push(mesh);
  return mesh;
}
function addBox(group, size, position, material, moduleId, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function tagDoorInteractive(root, moduleId, doorKey) {
  if (!doorKey) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.bookshelfModuleId = moduleId;
    child.userData.bookshelfDoorKey = doorKey;
  });
}

function createDoorPivot(parent, { xCenter, yCenter, z, width, hinge = 'left', open = false }) {
  const pivot = new THREE.Group();
  const hingeX = hinge === 'right' ? xCenter + width / 2 : xCenter - width / 2;
  pivot.position.set(hingeX, yCenter, z);
  // Swing lower doors outward so an opened leaf sits alongside the adjacent side post instead of cutting through the shelves.
  pivot.rotation.y = open ? (hinge === 'right' ? -Math.PI / 2 : Math.PI / 2) : 0;
  parent.add(pivot);

  const leaf = new THREE.Group();
  leaf.position.set(hinge === 'right' ? -width / 2 : width / 2, 0, 0);
  pivot.add(leaf);
  return leaf;
}

function addDoorCornerFillers(group, panelWidth, panelHeight, panelInset, bevel, material, moduleId) {
  const size = Math.max(4, bevel - 0.8);
  const z = panelInset / 2;
  const positions = [
    { x: -panelWidth / 2 - bevel / 2, y: panelHeight / 2 + bevel / 2 },
    { x: panelWidth / 2 + bevel / 2, y: panelHeight / 2 + bevel / 2 },
    { x: -panelWidth / 2 - bevel / 2, y: -panelHeight / 2 - bevel / 2 },
    { x: panelWidth / 2 + bevel / 2, y: -panelHeight / 2 - bevel / 2 },
  ];
  positions.forEach(({ x, y }) => addBox(group, { x: size, y: size, z: panelInset }, { x, y, z }, material, moduleId));
}

function addKeyhole(group, moduleId, x, y, z) {
  const material = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.55, metalness: 0.08 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 1.0, 18), material);
  top.rotation.x = Math.PI / 2;
  top.position.set(x, y + 4.0, z);
  top.castShadow = true;
  top.receiveShadow = true;
  tagMesh(top, moduleId);
  group.add(top);

  const stem = new THREE.Mesh(new THREE.BoxGeometry(1.9, 8.8, 1.0), material);
  stem.position.set(x, y - 1.9, z);
  stem.castShadow = true;
  stem.receiveShadow = true;
  tagMesh(stem, moduleId);
  group.add(stem);
}

function applyNormalizedBoxUVs(geometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return geometry;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = {
    x: Math.max(1e-6, bounds.max.x - bounds.min.x),
    y: Math.max(1e-6, bounds.max.y - bounds.min.y),
    z: Math.max(1e-6, bounds.max.z - bounds.min.z),
  };
  const uv = new THREE.Float32BufferAttribute(new Float32Array(position.count * 2), 2);
  for (let i = 0; i < position.count; i += 1) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    const x = (position.getX(i) - bounds.min.x) / size.x;
    const y = (position.getY(i) - bounds.min.y) / size.y;
    const z = (position.getZ(i) - bounds.min.z) / size.z;
    if (az >= ax && az >= ay) uv.setXY(i, x, y);
    else if (ax >= ay) uv.setXY(i, z, y);
    else uv.setXY(i, x, z);
  }
  geometry.setAttribute('uv', uv);
  return geometry;
}

function addExtrudedSideProfile(group, points, zCenter, zLength, material, moduleId) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: zLength,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, zCenter - zLength / 2);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addExtrudedProfileAlongX(group, pointsYZ, xCenter, xLength, material, moduleId) {
  const shape = new THREE.Shape();
  shape.moveTo(-pointsYZ[0][1], pointsYZ[0][0]);
  for (let i = 1; i < pointsYZ.length; i += 1) shape.lineTo(-pointsYZ[i][1], pointsYZ[i][0]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: xLength,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(xCenter - xLength / 2, 0, 0);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addExtrudedProfileAlongY(group, pointsXZ, yCenter, yLength, material, moduleId) {
  const shape = new THREE.Shape();
  shape.moveTo(pointsXZ[0][0], -pointsXZ[0][1]);
  for (let i = 1; i < pointsXZ.length; i += 1) shape.lineTo(pointsXZ[i][0], -pointsXZ[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: yLength,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, yCenter - yLength / 2, 0);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addSideWallAssembly(group, module, { side, width, depth, height, sharedSide = null }) {
  if (sharedSide === side) return;
  const material = woodMaterial(module.colour);
  const zLength = Math.max(80, depth - POST * 2);
  const zCenter = -depth / 2;
  const left = side === 'start';

  // The panel's INNER face aligns exactly with the inner face of the post.
  // It is intentionally much thinner than the post and extends OUTWARD from
  // that shared inner plane, leaving space for the raised side connectors.
  const postInner = left ? POST : width - POST;
  const panelOuter = postInner + (left ? -SIDE : SIDE);
  const panelCenterX = (postInner + panelOuter) / 2;
  addBox(group, { x: SIDE, y: height, z: zLength }, {
    x: panelCenterX,
    y: height / 2,
    z: zCenter,
  }, material, module.id);

  // Raised connectors occupy the remaining thickness between the panel's outer
  // face and the post's outer face, so their exposed outer face is perfectly
  // flush with the side face of the posts.
  const postOuter = left ? 0 : width;
  const outerX = postOuter;
  const innerX = panelOuter;

  const bottomBodyEnd = SIDE_RAIL_BODY;
  const bottomRampEnd = bottomBodyEnd + SIDE_RAIL_RAMP;
  addExtrudedSideProfile(group, [
    [innerX, 0],
    [outerX, 0],
    [outerX, bottomBodyEnd],
    [innerX, bottomRampEnd],
  ], zCenter, zLength, material, module.id);

  // The centre connector is visibly larger than before, with only short ramps
  // at each end as shown in the technical drawing.
  const mid = height * 0.5;
  const midBody0 = mid - SIDE_MID_BODY / 2;
  const midBody1 = mid + SIDE_MID_BODY / 2;
  addExtrudedSideProfile(group, [
    [innerX, midBody0 - SIDE_RAIL_RAMP],
    [outerX, midBody0],
    [outerX, midBody1],
    [innerX, midBody1 + SIDE_RAIL_RAMP],
  ], zCenter, zLength, material, module.id);

  const topBodyStart = height - SIDE_RAIL_BODY;
  const topRampStart = topBodyStart - SIDE_RAIL_RAMP;
  addExtrudedSideProfile(group, [
    [innerX, topRampStart],
    [outerX, topBodyStart],
    [outerX, height],
    [innerX, height],
  ], zCenter, zLength, material, module.id);
}

// Rear uprights on the real product have a small inward step at floor level.
// Model it as one continuous extruded post profile so there is no stacked-mesh
// seam: the front face stays full depth while the rear face is inset only at
// the foot and blends back to the normal post depth over a short diagonal.
function addBackPostWithFootDent(group, { x, height, material, moduleId }) {
  const shape = new THREE.Shape();
  // Shape X maps to -world Z after the Y rotation below.
  shape.moveTo(POST, 0);
  shape.lineTo(BACK_POST_FOOT_DENT, 0);
  shape.lineTo(0, BACK_POST_FOOT_DENT_HEIGHT);
  shape.lineTo(0, height);
  shape.lineTo(POST, height);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: POST,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  // local extrusion Z -> world X; local shape X -> -world Z.
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x - POST / 2, 0, 0);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function frontZ(depth) { return -depth; }

function worldFromAnchor(anchor, heading, localX, localZ) {
  const d = vec(heading);
  const n = { x: -d.z, z: d.x };
  return {
    x: anchor.x + d.x * localX + n.x * localZ,
    z: anchor.z + d.z * localX + n.z * localZ,
  };
}

function addConnectorPart(anchor, heading, size, center, material) {
  const world = worldFromAnchor(anchor, heading, center.x, center.z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(world.x, center.y, world.z);
  mesh.rotation.y = -heading;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  connectorGroup.add(mesh);
  return mesh;
}

function connectorPlacements(spec) {
  const bottomShelfY = PLINTH_HEIGHT + BOARD / 2;
  const topShelfY = spec.height - 130;
  const bottomInterval = bottomShelfY;
  const topInterval = spec.height - topShelfY;
  return [
    {
      y: bottomInterval / 2,
      height: Math.max(CONNECTOR_MIN_HEIGHT, bottomInterval / 3),
    },
    {
      y: topShelfY + topInterval / 2,
      height: Math.max(CONNECTOR_MIN_HEIGHT, topInterval / 3),
    },
  ];
}

function renderStandalonePoleConnectors(anchor, heading, isStart, spec, material) {
  const poleMinX = isStart ? 0 : -POST;
  const poleMaxX = isStart ? POST : 0;
  const frontCenterX = (poleMinX + poleMaxX) / 2;
  const frontCenterZ = frontZ(spec.depth) - CONNECTOR_FACE_THICKNESS / 2 - CONNECTOR_OUTSET;
  const sideStartZ = frontZ(spec.depth) - CONNECTOR_FACE_THICKNESS - CONNECTOR_OUTSET;
  const sideLengthZ = CONNECTOR_SIDE_COVERAGE + CONNECTOR_FACE_THICKNESS + CONNECTOR_CORNER_OVERLAP;
  const sideCenterZ = sideStartZ + sideLengthZ / 2;
  const outerSideX = isStart ? (-CONNECTOR_SIDE_THICKNESS / 2 - CONNECTOR_OUTSET) : (CONNECTOR_SIDE_THICKNESS / 2 + CONNECTOR_OUTSET);
  const innerSideX = isStart ? (POST + CONNECTOR_SIDE_THICKNESS / 2 + CONNECTOR_OUTSET) : (-POST - CONNECTOR_SIDE_THICKNESS / 2 - CONNECTOR_OUTSET);

  connectorPlacements(spec).forEach(({ y, height }) => {
    addConnectorPart(anchor, heading, {
      x: POST + CONNECTOR_SIDE_THICKNESS * 2 + CONNECTOR_CORNER_OVERLAP,
      y: height,
      z: CONNECTOR_FACE_THICKNESS,
    }, {
      x: frontCenterX,
      y,
      z: frontCenterZ,
    }, material);

    addConnectorPart(anchor, heading, {
      x: CONNECTOR_SIDE_THICKNESS,
      y: height,
      z: sideLengthZ,
    }, {
      x: outerSideX,
      y,
      z: sideCenterZ,
    }, material);

    addConnectorPart(anchor, heading, {
      x: CONNECTOR_SIDE_THICKNESS,
      y: height,
      z: sideLengthZ,
    }, {
      x: innerSideX,
      y,
      z: sideCenterZ,
    }, material);
  });
}

function renderBridgeConnectors(anchor, heading, spec, material) {
  const frontCenterZ = frontZ(spec.depth) - CONNECTOR_FACE_THICKNESS / 2 - CONNECTOR_OUTSET;
  const sideStartZ = frontZ(spec.depth) - CONNECTOR_FACE_THICKNESS - CONNECTOR_OUTSET;
  const sideLengthZ = CONNECTOR_SIDE_COVERAGE + CONNECTOR_FACE_THICKNESS + CONNECTOR_CORNER_OVERLAP;
  const sideCenterZ = sideStartZ + sideLengthZ / 2;

  connectorPlacements(spec).forEach(({ y, height }) => {
    addConnectorPart(anchor, heading, {
      x: POST * 2 + CONNECTOR_SIDE_THICKNESS * 2 + CONNECTOR_CORNER_OVERLAP,
      y: height,
      z: CONNECTOR_FACE_THICKNESS,
    }, {
      x: 0,
      y,
      z: frontCenterZ,
    }, material);

    addConnectorPart(anchor, heading, {
      x: CONNECTOR_SIDE_THICKNESS,
      y: height,
      z: sideLengthZ,
    }, {
      x: -POST - CONNECTOR_SIDE_THICKNESS / 2 - CONNECTOR_OUTSET,
      y,
      z: sideCenterZ,
    }, material);

    addConnectorPart(anchor, heading, {
      x: CONNECTOR_SIDE_THICKNESS,
      y: height,
      z: sideLengthZ,
    }, {
      x: POST + CONNECTOR_SIDE_THICKNESS / 2 + CONNECTOR_OUTSET,
      y,
      z: sideCenterZ,
    }, material);
  });
}

function addShelfWing(parent, module, pose, length, { cornerWing = false, sharedSide = null, omitStartPosts = false, omitEndPosts = false, omitStartFrontPost = false, omitStartBackPost = false, omitEndFrontPost = false, omitEndBackPost = false } = {}) {
  const spec = familySpec();
  const group = new THREE.Group();
  group.position.set(pose.x, 0, pose.z);
  group.rotation.y = -pose.heading;
  parent.add(group);

  const wood = woodMaterial(module.colour);
  const darkWood = darkWoodMaterial(module.colour);
  const width = length;
  const depth = spec.depth;
  const height = spec.height;
  const front = frontZ(depth);
  const innerWidth = Math.max(100, width - POST * 2);
  const shelfDepth = depth - 34;
  const shelfWidth = innerWidth;

  // The back panel now runs the complete predefined module height, matching
  // the uprights. The lower plinth remains a separate recessed structural part.
  addBox(group, { x: innerWidth, y: height, z: BACK }, { x: width / 2, y: height / 2, z: -BACK / 2 }, darkWood, module.id);
  const plinthWidth = innerWidth;
  const plinthDepth = Math.max(100, shelfDepth - PLINTH_FRONT_RECESS);
  const plinthCenterZ = -depth + POST + plinthDepth / 2;
  addBox(group, { x: plinthWidth, y: PLINTH_HEIGHT, z: plinthDepth }, {
    x: width / 2,
    y: PLINTH_HEIGHT / 2,
    z: plinthCenterZ,
  }, darkWood, module.id);
  const bottomShelfY = PLINTH_HEIGHT + BOARD / 2;
  addBox(group, { x: innerWidth, y: BOARD, z: shelfDepth }, {
    x: width / 2,
    y: bottomShelfY,
    z: -depth / 2,
  }, wood, module.id);

  // Full-height side assemblies from floor to top. Their thin panels share the
  // same inner plane as the posts, while the three raised exterior connectors
  // build back out to the posts' outer plane. Connected straight modules retain
  // both side assemblies; only the shared inside of the one L-corner stays open.
  addSideWallAssembly(group, module, { side: 'start', width, depth, height, sharedSide });
  addSideWallAssembly(group, module, { side: 'end', width, depth, height, sharedSide });

  // Uprights at the free ends of the wing and, when needed, at the shared corner.
  const postEnds = [
    {
      x: POST / 2,
      omitAll: omitStartPosts,
      omitBack: omitStartBackPost,
      omitFront: omitStartFrontPost,
    },
    {
      x: width - POST / 2,
      omitAll: omitEndPosts,
      omitBack: omitEndBackPost,
      omitFront: omitEndFrontPost,
    },
  ];
  postEnds.forEach(({ x, omitAll, omitBack, omitFront }) => {
    if (omitAll) return;
    if (!omitBack) {
      addBackPostWithFootDent(group, { x, height, material: wood, moduleId: module.id });
    }
    if (!omitFront) {
      addBox(group, { x: POST, y: height, z: POST }, { x, y: height / 2, z: front + POST / 2 }, wood, module.id);
    }
  });

  const shelfCenters = shelfCentersForHeight(height);
  const lowerDoorShelfDepthReduction = 28;
  const lowerDoorShelfDepth = Math.max(120, shelfDepth - lowerDoorShelfDepthReduction);
  const lowerDoorShelfCenterZ = -depth / 2 + lowerDoorShelfDepthReduction / 2;
  shelfCenters.slice(1).forEach((y, index) => {
    const behindLowerDoors = module.door === 'lower' && index < 2;
    addBox(group, {
      x: shelfWidth,
      y: BOARD,
      z: behindLowerDoors ? lowerDoorShelfDepth : shelfDepth,
    }, {
      x: width / 2,
      y,
      z: behindLowerDoors ? lowerDoorShelfCenterZ : -depth / 2,
    }, wood, module.id);
  });

  addDoors(group, module, { width, depth, height, cornerWing, sharedSide });
  return group;
}

function addSolidDoorLeaf(parent, module, xCenter, width, yCenter, height, frontPlaneZ, { hinge = 'left', open = false, doorKey = '', keyhole = false } = {}) {
  const wood = woodMaterial(module.colour);
  const darkWood = darkWoodMaterial(module.colour);
  const leaf = createDoorPivot(parent, { xCenter, yCenter, z: frontPlaneZ, width, hinge, open });

  const frame = Math.max(64, Math.min(82, Math.min(width, height) * 0.27));
  const doorThickness = 12;
  const panelInset = 7;
  const panelThickness = 4;
  const bevel = 12;
  const innerWidth = Math.max(48, width - frame * 2);
  const innerHeight = Math.max(48, height - frame * 2);
  const panelWidth = Math.max(28, innerWidth - bevel * 2);
  const panelHeight = Math.max(28, innerHeight - bevel * 2);

  addBox(leaf, { x: frame, y: height, z: doorThickness }, { x: -width / 2 + frame / 2, y: 0, z: doorThickness / 2 }, wood, module.id);
  addBox(leaf, { x: frame, y: height, z: doorThickness }, { x: width / 2 - frame / 2, y: 0, z: doorThickness / 2 }, wood, module.id);
  addBox(leaf, { x: innerWidth, y: frame, z: doorThickness }, { x: 0, y: -height / 2 + frame / 2, z: doorThickness / 2 }, wood, module.id);
  addBox(leaf, { x: innerWidth, y: frame, z: doorThickness }, { x: 0, y: height / 2 - frame / 2, z: doorThickness / 2 }, wood, module.id);

  addBox(leaf, { x: panelWidth, y: panelHeight, z: panelThickness }, {
    x: 0,
    y: 0,
    z: panelInset + panelThickness / 2,
  }, darkWood, module.id);

  addExtrudedProfileAlongX(leaf, [
    [panelHeight / 2, panelInset],
    [panelHeight / 2 + bevel, panelInset],
    [panelHeight / 2 + bevel, 0],
  ], 0, panelWidth, wood, module.id);
  addExtrudedProfileAlongX(leaf, [
    [-panelHeight / 2 - bevel, 0],
    [-panelHeight / 2 - bevel, panelInset],
    [-panelHeight / 2, panelInset],
  ], 0, panelWidth, wood, module.id);
  addExtrudedProfileAlongY(leaf, [
    [-panelWidth / 2 - bevel, 0],
    [-panelWidth / 2 - bevel, panelInset],
    [-panelWidth / 2, panelInset],
  ], 0, panelHeight, wood, module.id);
  addExtrudedProfileAlongY(leaf, [
    [panelWidth / 2, panelInset],
    [panelWidth / 2 + bevel, panelInset],
    [panelWidth / 2 + bevel, 0],
  ], 0, panelHeight, wood, module.id);
  addDoorCornerFillers(leaf, panelWidth, panelHeight, panelInset, bevel, wood, module.id);

  if (keyhole) {
    // Place the keyhole on the exterior/front face of the right door so it stays visible in the closed state.
    addKeyhole(leaf, module.id, -width / 2 + frame * 0.60, -height * 0.02, 0.35);
  }
  tagDoorInteractive(leaf, module.id, doorKey);
  return leaf;
}

function addDoorFrame(parent, module, xCenter, width, yCenter, height, z, { glazed = false, hinge = 'left', open = false, doorKey = '' } = {}) {
  const wood = woodMaterial(module.colour);
  const frame = 34;
  if (!glazed) {
    addSolidDoorLeaf(parent, module, xCenter, width, yCenter, height, z, { hinge, open, doorKey });
    return;
  }

  const leaf = createDoorPivot(parent, { xCenter, yCenter, z, width, hinge, open });
  addBox(leaf, { x: frame, y: height, z: 18 }, { x: -width / 2 + frame / 2, y: 0, z: 9 }, wood, module.id);
  addBox(leaf, { x: frame, y: height, z: 18 }, { x: width / 2 - frame / 2, y: 0, z: 9 }, wood, module.id);
  addBox(leaf, { x: width - frame * 2, y: frame, z: 18 }, { x: 0, y: -height / 2 + frame / 2, z: 9 }, wood, module.id);
  addBox(leaf, { x: width - frame * 2, y: frame, z: 18 }, { x: 0, y: height / 2 - frame / 2, z: 9 }, wood, module.id);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(Math.max(20, width - frame * 2), Math.max(20, height - frame * 2), 5), glassMaterial());
  glass.position.set(0, 0, 10);
  glass.castShadow = true;
  glass.receiveShadow = true;
  tagMesh(glass, module.id);
  leaf.add(glass);
  tagDoorInteractive(leaf, module.id, doorKey);
}

function addDoors(parent, module, { width, depth, height, cornerWing = false, sharedSide = null }) {
  if (module.door === 'open') return;
  const solidDoorFrontZ = frontZ(depth) + 12;
  const glazedDoorCenterZ = frontZ(depth) + 9.2;
  const cornerInset = cornerWing ? Math.max(64, POST * 1.5) : 0;
  const lowerDoorStart = POST + (sharedSide === 'start' ? cornerInset : 0);
  const lowerDoorEnd = width - POST - (sharedSide === 'end' ? cornerInset : 0);
  const lowerDoorWidth = Math.max(120, lowerDoorEnd - lowerDoorStart);
  const shelfCenters = shelfCentersForHeight(height);
  const doorState = cloneDoorState(module.doorState);

  if (cornerWing) {
    const straightLeafWidth = Math.max(90, width - POST * 2 - 18);
    const leafWidth = Math.max(90, Math.min(lowerDoorWidth, straightLeafWidth));
    const x = sharedSide === 'start'
      ? lowerDoorEnd - leafWidth / 2
      : lowerDoorStart + leafWidth / 2;
    if (module.door === 'lower') {
      const openingBottom = shelfCenters[0] + BOARD / 2;
      const openingTop = shelfCenters[3] - BOARD / 2;
      const doorHeight = Math.max(120, openingTop - openingBottom);
      const y = (openingTop + openingBottom) / 2;
      const hinge = sharedSide === 'start' ? 'right' : 'left';
      addSolidDoorLeaf(parent, module, x, leafWidth, y, doorHeight, solidDoorFrontZ, {
        hinge,
        open: doorState.lowerSingle,
        doorKey: 'lowerSingle',
      });
      return;
    }
    const doorHeight = height - 205;
    const y = 105 + doorHeight / 2;
    const hinge = sharedSide === 'start' ? 'right' : 'left';
    addDoorFrame(parent, module, x, leafWidth, y, doorHeight, glazedDoorCenterZ, {
      glazed: true,
      hinge,
      open: doorState.glazedSingle,
      doorKey: 'glazedSingle',
    });
    return;
  }

  if (module.door === 'lower') {
    const openingBottom = shelfCenters[0] + BOARD / 2;
    const openingTop = shelfCenters[3] - BOARD / 2;
    const doorHeight = Math.max(120, openingTop - openingBottom);
    const y = (openingTop + openingBottom) / 2;
    const leafWidth = Math.max(60, lowerDoorWidth / 2);
    const leftX = lowerDoorStart + leafWidth / 2;
    const rightX = lowerDoorEnd - leafWidth / 2;
    addSolidDoorLeaf(parent, module, leftX, leafWidth, y, doorHeight, solidDoorFrontZ, {
      hinge: 'left',
      open: doorState.lowerLeft,
      doorKey: 'lowerLeft',
    });
    addSolidDoorLeaf(parent, module, rightX, leafWidth, y, doorHeight, solidDoorFrontZ, {
      hinge: 'right',
      open: doorState.lowerRight,
      doorKey: 'lowerRight',
      keyhole: true,
    });
    return;
  }

  const openingStart = POST + 9 + (sharedSide === 'start' ? cornerInset : 0);
  const openingEnd = width - POST - 9 - (sharedSide === 'end' ? cornerInset : 0);
  const openingWidth = Math.max(120, openingEnd - openingStart);
  const leafGap = 8;
  const leafWidth = Math.max(46, (openingWidth - leafGap) / 2);
  const leftX = openingStart + leafWidth / 2;
  const rightX = openingStart + leafWidth + leafGap + leafWidth / 2;
  const doorHeight = height - 205;
  const y = 105 + doorHeight / 2;
  addDoorFrame(parent, module, leftX, leafWidth, y, doorHeight, glazedDoorCenterZ, {
    glazed: true,
    hinge: 'left',
    open: doorState.glazedLeft,
    doorKey: 'glazedLeft',
  });
  addDoorFrame(parent, module, rightX, leafWidth, y, doorHeight, glazedDoorCenterZ, {
    glazed: true,
    hinge: 'right',
    open: doorState.glazedRight,
    doorKey: 'glazedRight',
  });
}

function renderModule(entry) {
  const module = entry.module;
  const root = new THREE.Group();
  root.userData.bookshelfModuleId = module.id;
  bookshelfGroup.add(root);
  moduleGroups.set(module.id, root);

  if (module.kind === 'straight') {
    addShelfWing(root, module, entry.start, familySpec().width);
  } else {
    const first = addShelfWing(root, module, entry.start, familySpec().corner, { cornerWing: true, sharedSide: 'end', omitEndFrontPost: true });
    // The second wing starts at the shared corner, so its door leaves are inset away from that joint.
    const secondPose = { x: entry.corner.x, z: entry.corner.z, heading: entry.end.heading };
    const second = addShelfWing(root, module, secondPose, familySpec().corner, { cornerWing: true, sharedSide: 'start', omitStartPosts: true });
    first.userData.cornerWing = 'incoming';
    second.userData.cornerWing = 'outgoing';
  }
  return root;
}

function renderConnectors(layout) {
  clearGroup(connectorGroup);
  const spec = familySpec();
  const material = metalMaterial();

  // Every free front upright receives one small aluminium insert near the floor
  // and one near the top. Whenever two modules meet, those individual inserts
  // are replaced by one longer bridge connector spanning the two adjacent front
  // uprights so the result matches the real product hardware.
  if (layout.entries.length && !layout.closed) {
    renderStandalonePoleConnectors(layout.start, layout.start.heading, true, spec, material);
    renderStandalonePoleConnectors(layout.end, layout.end.heading, false, spec, material);
  }

  for (let i = 0; i < layout.entries.length - 1; i += 1) {
    renderBridgeConnectors(layout.entries[i].end, layout.entries[i].end.heading, spec, material);
  }
  if (layout.closed && layout.entries.length) {
    renderBridgeConnectors(layout.end, layout.end.heading, spec, material);
  }
}

function rebuildScene() {
  clearGroup(bookshelfGroup);
  moduleMeshes = [];
  moduleGroups.clear();
  layoutCache = deriveLayout();
  layoutCache.entries.forEach(renderModule);
  renderConnectors(layoutCache);
  rebuildSelectionHelper();
  rebuildDimensions();
  fitControlsTarget();
  updateEndpointButtons();
  renderComponents();
}

function rebuildSelectionHelper() {
  if (selectionHelper) {
    scene.remove(selectionHelper);
    selectionHelper.geometry?.dispose?.();
    selectionHelper.material?.dispose?.();
    selectionHelper = null;
  }
  if (!selectedModuleId) return;
  const group = moduleGroups.get(selectedModuleId);
  if (!group) return;
  selectionHelper = new THREE.BoxHelper(group, 0x168de0);
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.82;
  scene.add(selectionHelper);
}

function layoutBounds(layout = layoutCache || deriveLayout()) {
  const points = [];
  layout.entries.forEach((entry) => {
    points.push(posePoint(entry.start), posePoint(entry.end));
    if (entry.corner) points.push(entry.corner);
  });
  if (!points.length) points.push({ x: 0, z: 0 });
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}
function fitControlsTarget() {
  const b = layoutBounds();
  const spec = familySpec();
  controls.target.set((b.minX + b.maxX) / 2, spec.height * 0.42, (b.minZ + b.maxZ) / 2);
}

function displayLength(mm) {
  if (units === 'imperial') return `${(mm / 25.4).toFixed(1)} in`;
  return `${Math.round(mm)} mm`;
}
function rebuildDimensions() {
  dimensionAnchors = [];
  if (!dimensionsVisible) {
    dimensionLayer.innerHTML = '';
    dimensionLayer.hidden = true;
    return;
  }
  dimensionLayer.hidden = false;
  const spec = familySpec();
  (layoutCache?.entries || []).forEach((entry) => {
    if (entry.module.kind === 'straight') {
      const mid = {
        x: (entry.start.x + entry.end.x) / 2,
        z: (entry.start.z + entry.end.z) / 2,
      };
      dimensionAnchors.push({ point: new THREE.Vector3(mid.x, spec.height + 85, mid.z), label: displayLength(spec.width) });
    } else {
      dimensionAnchors.push({ point: new THREE.Vector3(entry.corner.x, spec.height + 85, entry.corner.z), label: `${displayLength(spec.corner)} × ${displayLength(spec.corner)}` });
    }
  });
  dimensionLayer.innerHTML = dimensionAnchors.map((item, index) => `<div class="dimension-label" data-dimension-index="${index}">${item.label}</div>`).join('');
}
function updateDimensionPositions() {
  if (!dimensionsVisible) return;
  const rect = canvasHost.getBoundingClientRect();
  dimensionAnchors.forEach((item, index) => {
    const projected = item.point.clone().project(camera);
    const element = dimensionLayer.querySelector(`[data-dimension-index="${index}"]`);
    if (!element) return;
    const visible = projected.z > -1 && projected.z < 1;
    element.style.display = visible ? '' : 'none';
    element.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
    element.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
  });
}

function hideEndpointButton(button) {
  button.hidden = true;
  button.style.display = 'none';
}
function showEndpointButton(button) {
  button.hidden = false;
  button.style.display = 'grid';
}

function endpointOverlayPoint(pose, isStart = false) {
  const spec = familySpec();
  const heading = isStart ? normalizeAngle(pose.heading + Math.PI) : pose.heading;
  const d = vec(heading);
  const offset = Math.max(105, spec.depth * 0.3);
  return new THREE.Vector3(
    pose.x + d.x * offset,
    spec.height * 0.55,
    pose.z + d.z * offset,
  );
}
function positionOverlayButton(button, worldPoint) {
  const rect = canvasHost.getBoundingClientRect();
  const projected = worldPoint.clone().project(camera);
  const visible = projected.z > -1 && projected.z < 1;
  if (!visible) {
    hideEndpointButton(button);
    return;
  }
  showEndpointButton(button);
  button.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
  button.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
}
function updateEndpointButtons() {
  if (!layoutCache || layoutCache.closed || endpointsOverlap(layoutCache) || addModulePanel.hidden === false) {
    hideEndpointButton(addStartButton);
    hideEndpointButton(addEndButton);
    return;
  }
  positionOverlayButton(addStartButton, endpointOverlayPoint(layoutCache.start, true));
  positionOverlayButton(addEndButton, endpointOverlayPoint(layoutCache.end, false));
}

function renderTranslations() {
  document.documentElement.lang = locale.startsWith('ro') ? 'ro' : locale.startsWith('de') ? 'de' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  renderSelectedControls();
  renderComponents();
}

function renderFamilyControls() {
  document.querySelectorAll('[data-family]').forEach((button) => button.classList.toggle('is-selected', button.dataset.family === state.family));
}

function selectedModule() { return state.modules.find((module) => module.id === selectedModuleId) || null; }
function renderSelectedControls() {
  const module = selectedModule();
  selectedEmptyState.hidden = Boolean(module);
  selectedModuleControls.hidden = !module;
  if (!module) return;
  const index = state.modules.findIndex((item) => item.id === module.id);
  selectedModuleLabel.textContent = String(index + 1);
  selectedModuleTypeBadge.textContent = module.kind === 'corner' ? t('type.corner') : t('type.straight');
  document.querySelectorAll('[data-door]').forEach((button) => button.classList.toggle('is-selected', button.dataset.door === module.door));
  document.querySelectorAll('[data-colour]').forEach((button) => button.classList.toggle('is-selected', button.dataset.colour.toLowerCase() === module.colour.toLowerCase()));
  deleteModuleButton.disabled = state.modules.length <= 1;
  deleteModuleHint.hidden = state.modules.length > 1;
}

function moduleFinishLabel(colour) {
  const finishes = new Map([
    ['#b98555', 'NATURAL'],
    ['#65422d', 'MAHON'],
    ['#34312f', 'WENGE'],
  ]);
  return finishes.get(colour) || 'NATURAL';
}

function renderComponents() {
  if (!$('#componentsList')) return;
  const spec = familySpec();
  const layout = layoutCache || deriveLayout();
  const jointCount = state.modules.length ? state.modules.length - 1 + (layout.closed ? 1 : 0) : 0;
  $('#componentModuleCount').textContent = String(state.modules.length);
  $('#componentJointCount').textContent = String(jointCount);
  $('#componentLayoutState').textContent = layout.closed ? t('components.closedLoop') : t('components.openRun');

  const rows = new Map();
  function addRow(key, name, detail, qty = 1) {
    const current = rows.get(key);
    if (current) current.qty += qty;
    else rows.set(key, { name, detail, qty });
  }

  state.modules.forEach((module) => {
    const finish = moduleFinishLabel(module.colour);
    if (module.kind === 'straight') {
      const detail = `${spec.width} × ${spec.depth} × ${spec.height} mm · ${finish}`;
      addRow(`straight|${module.colour}`, t('components.straight'), detail);
    } else {
      const detail = `${spec.corner} × ${spec.corner} × ${spec.height} mm · ${finish}`;
      addRow(`corner|${module.colour}`, t('components.corner'), detail);
    }
    if (module.door === 'lower') addRow('door-lower', t('components.lowerKit'), `${state.family === 'compact' ? '2150' : '2300'} mm family`);
    if (module.door === 'glazed') addRow('door-glazed', t('components.glazedKit'), `${state.family === 'compact' ? '2150' : '2300'} mm family`);
  });
  if (jointCount > 0) addRow('connectors', t('components.connector'), locale === 'ro-RO' ? 'Set automat pentru îmbinarea dintre montanți' : locale === 'de-DE' ? 'Automatischer Satz je Modulverbindung' : 'Automatic set for each joint between uprights', jointCount);

  $('#componentsList').innerHTML = [...rows.values()].map((row) => `
    <div class="component-row">
      <div class="component-row__name"><b>${escapeHtml(row.name)}</b><small>${escapeHtml(row.detail)}</small></div>
      <div class="component-row__qty">×${row.qty}</div>
    </div>
  `).join('');
}
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderAll({ refit = false } = {}) {
  renderFamilyControls();
  renderTranslations();
  rebuildScene();
  renderSelectedControls();
  if (refit) fitCameraToConfiguration();
}

function applyCameraFrame(mode = cameraMode) {
  const b = layoutBounds();
  const spec = familySpec();
  const span = Math.max(b.maxX - b.minX + spec.depth * 2.8, b.maxZ - b.minZ + spec.depth * 2.8, spec.height * 1.18, 1100);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  controls.target.set(cx, spec.height * 0.44, cz);
  if (mode === 1) {
    camera.position.set(cx, spec.height + span * 1.4, cz + 0.01);
  } else if (mode === 2) {
    camera.position.set(b.maxX + span * 1.45, spec.height * 0.62, cz);
  } else {
    camera.position.set(cx, spec.height * 0.68, b.minZ - span * 2.05);
  }
  camera.lookAt(controls.target);
  controls.update();
}

function fitCameraToConfiguration() {
  applyCameraFrame(cameraMode);
}

function openAddPanel(side) {
  if (layoutCache?.closed) return;
  addAt = side === 'start' ? 'start' : 'end';
  pendingKind = 'straight';
  document.querySelectorAll('[data-module-kind]').forEach((button) => button.classList.toggle('is-selected', button.dataset.moduleKind === 'straight'));
  addModuleError.hidden = true;
  addModulePanel.hidden = false;
  updateEndpointButtons();
}
function closeAddPanel() {
  addModulePanel.hidden = true;
  addModuleError.hidden = true;
  updateEndpointButtons();
}

function prependOriginFor(module) {
  const spec = familySpec();
  const current = poseCopy(state.origin);
  if (module.kind === 'straight') {
    const d = vec(current.heading);
    return { x: current.x - d.x * spec.width, z: current.z - d.z * spec.width, heading: current.heading };
  }
  // The client has one canonical L-corner. The retained product orientation
  // turns clockwise when appended; prepending uses the exact inverse transform.
  const inputHeading = normalizeAngle(current.heading + Math.PI / 2);
  const input = vec(inputHeading);
  const output = vec(current.heading);
  return {
    x: current.x - input.x * spec.corner - output.x * spec.corner,
    z: current.z - input.z * spec.corner - output.z * spec.corner,
    heading: inputHeading,
  };
}

function addPendingModule() {
  const module = newModule(pendingKind);
  let candidateModules;
  let candidateOrigin;
  if (addAt === 'start') {
    candidateModules = [module, ...state.modules.map(cloneModule)];
    candidateOrigin = prependOriginFor(module);
  } else {
    candidateModules = [...state.modules.map(cloneModule), module];
    candidateOrigin = poseCopy(state.origin);
  }
  const candidateLayout = deriveLayout(candidateModules, candidateOrigin, familySpec());
  if (!validLayout(candidateLayout)) {
    addModuleError.textContent = t('add.intersection');
    addModuleError.hidden = false;
    return;
  }
  recordUndoCheckpoint();
  state.modules = candidateModules;
  state.origin = candidateOrigin;
  selectedModuleId = module.id;
  closeAddPanel();
  renderAll({ refit: false });
  markDirty();
}

function deleteSelectedModule() {
  if (!selectedModuleId || state.modules.length <= 1) return;
  const index = state.modules.findIndex((module) => module.id === selectedModuleId);
  if (index < 0) return;
  recordUndoCheckpoint();
  const layout = deriveLayout();
  if (index === 0) {
    const nextOrigin = layout.entries[0]?.end;
    if (nextOrigin) state.origin = poseCopy(nextOrigin);
  }
  state.modules.splice(index, 1);
  selectedModuleId = state.modules[Math.min(index, state.modules.length - 1)]?.id || '';
  renderAll();
  markDirty();
}

function updateSelectedModule(patch) {
  const module = selectedModule();
  if (!module) return;
  recordUndoCheckpoint();
  Object.assign(module, patch);
  renderAll();
  markDirty();
}

function setFamily(family) {
  if (!FAMILIES[family] || family === state.family) return;
  recordUndoCheckpoint();
  state.family = family;
  renderAll({ refit: true });
  markDirty();
}

function raycastModule(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(moduleMeshes, false)[0];
  return hit?.object || null;
}

function toggleDoorLeaf(moduleId, doorKey) {
  const module = state.modules.find((entry) => entry.id === moduleId);
  if (!module || !doorKey) return;
  module.doorState = cloneDoorState(module.doorState);
  if (!(doorKey in module.doorState)) return;
  recordUndoCheckpoint();
  module.doorState[doorKey] = !module.doorState[doorKey];
  renderAll();
  markDirty();
}

function bindControls() {
  document.querySelectorAll('.accordion-toggle').forEach((button) => button.addEventListener('click', () => {
    const section = button.closest('.accordion-section');
    const panel = section.querySelector('.accordion-panel');
    const open = !section.classList.contains('is-open');
    section.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }));

  document.querySelectorAll('[data-family]').forEach((button) => button.addEventListener('click', () => setFamily(button.dataset.family)));
  document.querySelectorAll('[data-door]').forEach((button) => button.addEventListener('click', () => updateSelectedModule({ door: button.dataset.door })));
  document.querySelectorAll('[data-colour]').forEach((button) => button.addEventListener('click', () => updateSelectedModule({ colour: button.dataset.colour.toLowerCase() })));
  deleteModuleButton.addEventListener('click', deleteSelectedModule);

  addStartButton.addEventListener('click', () => openAddPanel('start'));
  addEndButton.addEventListener('click', () => openAddPanel('end'));
  $('#closeAddPanelButton').addEventListener('click', closeAddPanel);
  $('#confirmAddModuleButton').addEventListener('click', addPendingModule);
  document.querySelectorAll('[data-module-kind]').forEach((button) => button.addEventListener('click', () => {
    pendingKind = button.dataset.moduleKind === 'corner' ? 'corner' : 'straight';
    document.querySelectorAll('[data-module-kind]').forEach((item) => item.classList.toggle('is-selected', item === button));
    addModuleError.hidden = true;
  }));

  let down = null;
  renderer.domElement.addEventListener('pointerdown', (event) => { down = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 5) return;
    const hit = raycastModule(event);
    const moduleId = hit?.userData?.bookshelfModuleId || '';
    const doorKey = hit?.userData?.bookshelfDoorKey || '';
    if (!moduleId) {
      if (selectedModuleId) {
        selectedModuleId = '';
        renderSelectedControls();
        rebuildSelectionHelper();
      }
      return;
    }
    selectedModuleId = moduleId;
    closeAddPanel();
    if (doorKey) {
      toggleDoorLeaf(moduleId, doorKey);
      return;
    }
    renderSelectedControls();
    rebuildSelectionHelper();
  });
}

function resizeRenderer() {
  const width = Math.max(1, canvasHost.clientWidth);
  const height = Math.max(1, canvasHost.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateOverlays() {
  updateDimensionPositions();
  if (addModulePanel.hidden) updateEndpointButtons();
  else {
    addStartButton.hidden = true;
    addEndButton.hidden = true;
  }
}
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (selectionHelper) selectionHelper.update();
  updateOverlays();
  renderer.render(scene, camera);
}

function captureState() {
  return {
    version: 2,
    family: state.family,
    origin: { x: round(state.origin.x), z: round(state.origin.z), heading: round(state.origin.heading, 6) },
    modules: state.modules.map(cloneModule),
  };
}

function restoreState(snapshot) {
  const source = snapshot?.state && !snapshot.modules ? snapshot.state : snapshot;
  if (!source || !Array.isArray(source.modules) || source.modules.length === 0) return false;
  const family = FAMILIES[source.family] ? source.family : 'compact';
  const origin = {
    x: Number(source.origin?.x),
    z: Number(source.origin?.z),
    heading: Number(source.origin?.heading),
  };
  if (![origin.x, origin.z, origin.heading].every(Number.isFinite)) return false;
  const modules = source.modules.map(cloneModule);
  const candidate = deriveLayout(modules, origin, FAMILIES[family]);
  if (!validLayout(candidate)) return false;
  state = { version: 2, family, origin, modules };
  selectedModuleId = '';
  closeAddPanel();
  renderAll({ refit: true });
  return true;
}

function resetConfiguration() {
  state = {
    version: 2,
    family: 'compact',
    origin: { x: -400, z: 0, heading: 0 },
    modules: [newModule('straight')],
  };
  selectedModuleId = '';
  closeAddPanel();
  renderAll({ refit: true });
  return true;
}

function setLocale(value) {
  if (COPY[value]) locale = value;
  renderTranslations();
  rebuildDimensions();
}
function setUnits(value) {
  units = value === 'imperial' ? 'imperial' : 'metric';
  rebuildDimensions();
}
function setCurrency(value) {
  currency = ['USD', 'RON', 'EUR'].includes(value) ? value : currency;
}
function setDarkMode(value) {
  darkMode = Boolean(value);
  document.body.classList.toggle('bookshelf-dark-mode', darkMode);
  scene.background.set(darkMode ? 0x182126 : 0xf0f4f6);
  ground.material.color.set(darkMode ? 0x141b20 : 0xe7ecef);
}
function toggleDimensions() {
  dimensionsVisible = !dimensionsVisible;
  rebuildDimensions();
  return dimensionsVisible;
}
function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3;
  applyCameraFrame(cameraMode);
  return cameraMode;
}
function syncToolButtons() {}
function closeToolPanels() { closeAddPanel(); }

window.BOOKSHELF_CONFIGURATOR_API = {
  captureState,
  restoreState,
  resetConfiguration,
  setLocale,
  setUnits,
  setDarkMode,
  setCurrency,
  toggleDimensions,
  cycleCamera,
  syncToolButtons,
  closeToolPanels,
};

bindControls();
resizeObserver = new ResizeObserver(resizeRenderer);
resizeObserver.observe(canvasHost);
resizeRenderer();
renderAll({ refit: true });
animate();
window.addEventListener('beforeunload', () => resizeObserver?.disconnect());
