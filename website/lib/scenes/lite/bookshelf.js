// Website-owned geometry snapshot from bookshelf-configurator/js/app.js at 05329b7.
// Preserves shelfModule/door/joint construction. App startup, DOM UI, auth and renderer are excluded.
// Original texture assets, served through the website's hashed asset pipeline.
import * as THREE from 'three';
const finishes={
  '#b98555':new URL('../../../../bookshelf-configurator/assets/textures/wood-natural.png',import.meta.url).href,
  '#65422d':new URL('../../../../bookshelf-configurator/assets/textures/wood-mahon.png',import.meta.url).href,
  '#34312f':new URL('../../../../bookshelf-configurator/assets/textures/wood-wenge.png',import.meta.url).href,
};
export async function prepare(state){
  // Static export can resolve import.meta.url on the server to file:///_next/.
  // The emitted asset is public: use its root-relative pathname in that case.
  const asset=new URL(finishes[state.colour]||finishes['#b98555']);
  const wood=await new THREE.TextureLoader().loadAsync(asset.protocol==='file:'?asset.pathname:asset.href);
  wood.colorSpace=THREE.SRGBColorSpace;wood.wrapS=wood.wrapT=THREE.ClampToEdgeWrapping;wood.anisotropy=4;
  return {wood,textures:[wood]};
}
const FAMILIES = Object.freeze({
  compact: Object.freeze({ id: 'compact', width: 800, corner: 750, depth: 350, height: 2150 }),
  tall: Object.freeze({ id: 'tall', width: 900, corner: 850, depth: 350, height: 2300 }),
});

const DEFAULT_COLOUR = '#b98555';
const MODULE_COLOURS = Object.freeze([
  '#b98555', // NATURAL
  '#65422d', // MAHON
  '#34312f', // WENGE
]);

const POST = 42;
const BOARD = 22;
const DOOR_PAIR_GAP = 2;
const SHELF_CLEAR_GAP = 20;
const SHELF_SLOT_STEP = BOARD + SHELF_CLEAR_GAP;
const DEFAULT_SHELF_COUNT = 9;
const MOVABLE_SHELF_DEPTH_REDUCTION = 32;
const BACK = 16;
const SIDE = 10;
const SIDE_RAIL_BODY = 276;
const SIDE_RAIL_RAMP = 14;
const SIDE_MID_BODY = 96;
const PLINTH_HEIGHT = 110;
const TOP_SHELF_CLEARANCE = 96;
const PLINTH_FRONT_RECESS = 42;
const BACK_POST_FOOT_DENT = 8;
const BACK_POST_FOOT_DENT_HEIGHT = 64;
const CONNECTOR_FACE_THICKNESS = 1.6;
const CONNECTOR_SIDE_THICKNESS = 1.6;
const CONNECTOR_SIDE_COVERAGE = POST / 2;
const CONNECTOR_OUTSET = 0.08;
const CONNECTOR_CORNER_OVERLAP = 0.45;
const CONNECTOR_MIN_HEIGHT = 26;

const EPS = 0.5;


export function buildModel(input,resources) {
  const bookshelfGroup = new THREE.Group(), connectorGroup = new THREE.Group();
  const moduleGroups = new Map(), moduleMeshes = [];
  const state = { family: input.family === 'tall' ? 'tall' : 'compact', origin: {x:0,z:0,heading:0}, modules: [] };
  const count = Math.min(4, Math.max(2, Number(input.count) || 2));
  for (let i=0;i<count;i++) {
    const shelfModule = newModule(input.layout === 'corner' && i === 1 ? 'corner' : 'straight');
    shelfModule.colour = input.colour;
    shelfModule.door = shelfModule.kind === 'corner' ? 'open' : input.doors;
    shelfModule.keyplate = ['diamond','rectangle','knob'].includes(input.hardware) ? input.hardware : 'diamond';
    if(input.doorOpen === 'open') for(const key of Object.keys(shelfModule.doorState)) shelfModule.doorState[key]=true;
    if(input.shelves !== undefined){
      const count=Math.min(9,Math.max(3,Number(input.shelves)));
      const slots=defaultShelfSlots();
      shelfModule.shelfSlots=Array.from({length:count-1},(_,i)=>slots[Math.round(i*(slots.length-1)/(count-2))]);
    }
    state.modules.push(cloneModule(shelfModule));
  }
  const layout = deriveLayout();
  if (!validLayout(layout)) throw new Error('Invalid preview layout');
  layout.entries.forEach(renderModule);
  renderConnectors(layout);
  bookshelfGroup.add(connectorGroup);
  bookshelfGroup.scale.setScalar(.001);
  bookshelfGroup.rotation.y = Math.PI;
  return { group: bookshelfGroup, metrics: { modules: count, connections: count - 1 } };
  function clearGroup(group) { group.clear(); }
  function woodMaterial(colour) { return new THREE.MeshStandardMaterial({color:resources?.wood?0xffffff:colour,map:resources?.wood||null,roughness:.68,metalness:0}); }
  function darkWoodMaterial(colour) { const material=woodMaterial(colour);material.roughness=.76;return material; }
  function glassMaterial() { return new THREE.MeshPhysicalMaterial({color:0xc7e9f5,transparent:true,opacity:.28,roughness:.12,metalness:0,transmission:.28,side:THREE.DoubleSide}); }
  function metalMaterial() { return new THREE.MeshStandardMaterial({color:0xbec6ca,metalness:.75,roughness:.32}); }

function familySpec() { return FAMILIES[state.family] || FAMILIES.compact; }
function shelfTopCenterY(height) {
  return height - TOP_SHELF_CLEARANCE - BOARD / 2;
}

function legacyShelfCentersForHeight(height) {
  // Preserve the original shelf rhythm only as the source for the initial
  // slot choices. Actual shelf positions are resolved onto positions that leave
  // 20 mm of clear air between adjacent shelves; with the current 22 mm board
  // this is a 42 mm center-to-center step.
  const compactBottom = PLINTH_HEIGHT + BOARD / 2;
  const compactTop = shelfTopCenterY(FAMILIES.compact.height);
  const compactStep = (compactTop - compactBottom) / (DEFAULT_SHELF_COUNT - 1);
  const compactCenters = Array.from({ length: DEFAULT_SHELF_COUNT }, (_, index) => compactBottom + compactStep * index);

  if (Math.abs(height - FAMILIES.compact.height) < EPS) return compactCenters;
  if (Math.abs(height - FAMILIES.tall.height) < EPS) {
    const delta = FAMILIES.tall.height - FAMILIES.compact.height;
    return compactCenters.map((y, index) => (index === DEFAULT_SHELF_COUNT - 1 ? y + delta : y));
  }

  const top = shelfTopCenterY(height);
  const step = (top - compactBottom) / (DEFAULT_SHELF_COUNT - 1);
  return Array.from({ length: DEFAULT_SHELF_COUNT }, (_, index) => compactBottom + step * index);
}

function shelfSlotLayout(height) {
  const bottom = PLINTH_HEIGHT + BOARD / 2;
  const nominalTop = shelfTopCenterY(height);
  const topSlot = Math.max(DEFAULT_SHELF_COUNT - 1, Math.round((nominalTop - bottom) / SHELF_SLOT_STEP));
  return {
    bottom,
    topSlot,
    top: bottom + topSlot * SHELF_SLOT_STEP,
  };
}

function defaultShelfSlots() {
  const height = FAMILIES.compact.height;
  const { bottom } = shelfSlotLayout(height);
  return legacyShelfCentersForHeight(height)
    .slice(0, DEFAULT_SHELF_COUNT - 1)
    .map((y, index) => index === 0 ? 0 : Math.round((y - bottom) / SHELF_SLOT_STEP));
}

function normalizeStoredShelfSlots(source, height = familySpec().height) {
  const { topSlot } = shelfSlotLayout(height);
  const input = Array.isArray(source) ? source : defaultShelfSlots();
  const slots = new Set([0]);
  input.forEach((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const slot = Math.max(0, Math.min(topSlot - 1, Math.round(numeric)));
    slots.add(slot);
  });
  return [...slots].sort((a, b) => a - b);
}

function cloneShelfSlots(source, height = familySpec().height) {
  return normalizeStoredShelfSlots(source, height);
}



function lowerDoorShelfSlot(height = familySpec().height) {
  const { bottom, topSlot } = shelfSlotLayout(height);
  const legacyCenter = legacyShelfCentersForHeight(height)[3];
  return Math.max(1, Math.min(topSlot - 1, Math.round((legacyCenter - bottom) / SHELF_SLOT_STEP)));
}

function resolvedShelfSlots(shelfModule, height) {
  const { topSlot } = shelfSlotLayout(height);
  const stored = normalizeStoredShelfSlots(shelfModule?.shelfSlots, height);
  const slots = new Set(stored);
  slots.add(0);
  if (shelfModule?.door === 'lower') slots.add(lowerDoorShelfSlot(height));
  slots.add(topSlot);
  return [...slots].sort((a, b) => a - b);
}

function shelfCentersForModule(shelfModule, height) {
  const { bottom } = shelfSlotLayout(height);
  return resolvedShelfSlots(shelfModule, height).map((slot) => bottom + slot * SHELF_SLOT_STEP);
}

function lowerDoorShelfCenterY(height = familySpec().height) {
  const { bottom } = shelfSlotLayout(height);
  return bottom + lowerDoorShelfSlot(height) * SHELF_SLOT_STEP;
}

function isShelfFixed(shelfModule, shelfIndex, height = familySpec().height) {
  const slots = resolvedShelfSlots(shelfModule, height);
  const slot = slots[shelfIndex];
  const { topSlot } = shelfSlotLayout(height);
  return slot === 0
    || slot === topSlot
    || (shelfModule?.door === 'lower' && slot === lowerDoorShelfSlot(height));
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
  return { id: uid(), kind, door: 'open', colour: DEFAULT_COLOUR, keyplate: 'diamond', shelfSlots: defaultShelfSlots(), doorState: defaultDoorState() };
}
function cloneModule(shelfModule, height = familySpec().height) {
  const colour = String(shelfModule?.colour || '').toLowerCase();
  const kind = shelfModule?.kind === 'corner' ? 'corner' : 'straight';
  const requestedDoor = ['open', 'lower', 'glazed'].includes(shelfModule?.door) ? shelfModule.door : 'open';
  const door = kind === 'corner' ? 'open' : requestedDoor;
  let shelfSlots = cloneShelfSlots(shelfModule?.shelfSlots, height);
  if (door === 'lower') {
    shelfSlots = normalizeStoredShelfSlots([...shelfSlots, lowerDoorShelfSlot(height)], height);
  }
  return {
    id: String(shelfModule?.id || uid()),
    kind,
    door,
    colour: MODULE_COLOURS.includes(colour) ? colour : DEFAULT_COLOUR,
    keyplate: ['diamond', 'rectangle', 'knob'].includes(shelfModule?.keyplate) ? shelfModule.keyplate : 'diamond',
    shelfSlots,
    doorState: cloneDoorState(shelfModule?.doorState),
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


function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function poseCopy(pose) { return { x: pose.x, z: pose.z, heading: pose.heading }; }
function posePoint(pose) { return { x: pose.x, z: pose.z }; }
function sameHeading(a, b) { return Math.abs(normalizeAngle(a - b)) < 1e-4; }

function advancePose(start, shelfModule, spec = familySpec()) {
  const d = vec(start.heading);
  if (shelfModule.kind === 'straight') {
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
  modules.forEach((shelfModule, index) => {
    const start = poseCopy(pose);
    const advanced = advancePose(start, shelfModule, spec);
    if (shelfModule.kind === 'straight') {
      segments.push({ a: posePoint(start), b: posePoint(advanced.end), moduleIndex: index });
    } else {
      segments.push({ a: posePoint(start), b: advanced.corner, moduleIndex: index });
      segments.push({ a: advanced.corner, b: posePoint(advanced.end), moduleIndex: index });
    }
    entries.push({ shelfModule, index, start, end: poseCopy(advanced.end), corner: advanced.corner });
    pose = poseCopy(advanced.end);
  });
  const closed = modules.length >= 3
    && dist2(posePoint(pose), posePoint(origin)) < EPS
    && sameHeading(pose.heading, origin.heading);
  return { entries, segments, start: poseCopy(origin), end: pose, closed };
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


function tagMesh(mesh, moduleId) {
  mesh.userData.bookshelfModuleId = moduleId;
  moduleMeshes.push(mesh);
  return mesh;
}
function tagShelfInteractive(mesh, moduleId, shelfIndex) {
  mesh.userData.bookshelfModuleId = moduleId;
  mesh.userData.bookshelfShelfIndex = shelfIndex;
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



function addDoorRampRing(group, { outerLeft, outerRight, outerBottom, outerTop, innerLeft, innerRight, innerBottom, innerTop, panelInset, material, moduleId }) {
  // Closed continuous mitered ramp ring. The sloped frame transition is modeled as
  // one continuous piece and includes underside closure so no corner gaps show in
  // oblique views.
  const overlap = 0.2;
  const verts = [
    [outerLeft - overlap, outerTop + overlap, 0],
    [outerRight + overlap, outerTop + overlap, 0],
    [outerRight + overlap, outerBottom - overlap, 0],
    [outerLeft - overlap, outerBottom - overlap, 0],
    [innerLeft, innerTop, panelInset],
    [innerRight, innerTop, panelInset],
    [innerRight, innerBottom, panelInset],
    [innerLeft, innerBottom, panelInset],
    [innerLeft, innerTop, 0],
    [innerRight, innerTop, 0],
    [innerRight, innerBottom, 0],
    [innerLeft, innerBottom, 0],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts.flat()), 3));
  geometry.setIndex([
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 9, 4, 9, 8,
    5, 6, 10, 5, 10, 9,
    6, 7, 11, 6, 11, 10,
    7, 4, 8, 7, 8, 11,
    0, 8, 9, 0, 9, 1,
    1, 9, 10, 1, 10, 2,
    2, 10, 11, 2, 11, 3,
    3, 11, 8, 3, 8, 0,
  ]);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function createUnifiedKeyholePath(cx = 0, cy = 0) {
  // One continuous outline: the stem flows directly into the circular head.
  // Using the same path for the wood and metal removes the horizontal separator
  // that appeared when the circle was previously closed as a separate loop.
  const radius = 8.4;
  const stemHalf = 2.8;
  const stemHeight = 22.6;
  const centerY = cy + radius;
  const joinY = centerY - Math.sqrt(Math.max(0, radius * radius - stemHalf * stemHalf));
  const leftAngle = Math.atan2(joinY - centerY, -stemHalf);
  const rightAngle = Math.atan2(joinY - centerY, stemHalf);
  const endAngle = rightAngle - Math.PI * 2;
  const steps = 40;

  const hole = new THREE.Path();
  hole.moveTo(cx - stemHalf, cy - stemHeight);
  hole.lineTo(cx - stemHalf, joinY);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const angle = leftAngle + (endAngle - leftAngle) * t;
    hole.lineTo(cx + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
  hole.lineTo(cx + stemHalf, cy - stemHeight);
  hole.closePath();
  return hole;
}

function addKeyholeCutoutRect(group, { rectWidth, rectHeight, depth, zOffset = 0, material, moduleId, keyholeX = 0, keyholeY = 0 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-rectWidth / 2, -rectHeight / 2);
  shape.lineTo(rectWidth / 2, -rectHeight / 2);
  shape.lineTo(rectWidth / 2, rectHeight / 2);
  shape.lineTo(-rectWidth / 2, rectHeight / 2);
  shape.closePath();

  shape.holes.push(createUnifiedKeyholePath(keyholeX, keyholeY));

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });
  geometry.translate(0, 0, zOffset);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addDiamondKeyplate(group, { width, height, depth, zOffset = 0, material, moduleId }) {
  const shape = new THREE.Shape();
  shape.moveTo(0, height / 2);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, -height / 2);
  shape.lineTo(-width / 2, 0);
  shape.closePath();

  shape.holes.push(createUnifiedKeyholePath(0, 0));

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });
  geometry.translate(0, 0, zOffset);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addRectangularKeyplate(group, { width, height, depth, zOffset = 0, material, moduleId }) {
  const corner = Math.min(width, height) * 0.12;
  const halfW = width / 2;
  const halfH = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + corner, -halfH);
  shape.lineTo(halfW - corner, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + corner);
  shape.lineTo(halfW, halfH - corner);
  shape.quadraticCurveTo(halfW, halfH, halfW - corner, halfH);
  shape.lineTo(-halfW + corner, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - corner);
  shape.lineTo(-halfW, -halfH + corner);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + corner, -halfH);
  shape.closePath();

  shape.holes.push(createUnifiedKeyholePath(0, 0));

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });
  geometry.translate(0, 0, zOffset);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addDoorKeyplate(group, { style = 'diamond', width, height, depth, zOffset = 0, material, moduleId }) {
  if (style === 'rectangle') {
    return addRectangularKeyplate(group, { width, height, depth, zOffset, material, moduleId });
  }
  return addDiamondKeyplate(group, { width, height, depth, zOffset, material, moduleId });
}

function addWoodenDoorKnob(group, { material, moduleId }) {
  // Revolved profile based on the client's reference knob: a small circular
  // mounting foot, narrow waist and a broad rounded mushroom cap. The local
  // Y axis is rotated toward -Z so the knob projects out from the door face.
  const profile = [
    [0, 0], [21, 0], [22, 2.5], [22, 4.5], [18, 6],
    [14, 8.5], [12, 13], [11.5, 17], [12.5, 21], [15.5, 25],
    [21, 29], [27, 31.5], [31, 34.5], [33, 38], [32.5, 41.5],
    [30, 45], [26, 48], [20, 50.5], [13, 52], [6, 52.8], [0, 53],
  ].map(([radius, depth]) => new THREE.Vector2(radius, depth));
  const geometry = new THREE.LatheGeometry(profile, 48);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(0.8);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addConfiguredDoorHardware(group, shelfModule, { x, y, plateWidth, plateHeight }) {
  if (shelfModule.keyplate === 'knob') {
    return addWoodenDoorKnob(group, {
      material: woodMaterial(shelfModule.colour),
      moduleId: shelfModule.id,
    }).position.set(x, y, 0.25);
  }

  const keyplateDepth = 2.7;
  return addDoorKeyplate(group, {
    style: shelfModule.keyplate,
    width: plateWidth,
    height: plateHeight,
    depth: keyplateDepth,
    zOffset: 0,
    material: metalMaterial(),
    moduleId: shelfModule.id,
  }).position.set(x, y, -keyplateDepth + 0.12);
}


function addMiteredShelfBoard(group, { width, depth, thickness, center, material, moduleId, sharedSide }) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const xMin = -halfW;
  const xMax = halfW;
  const zMin = -halfD;
  const zMax = halfD;

  // True two-board mitered corner:
  // each wing is a single trapezoid board and the two boards meet on one
  // clean 45° seam. This matches the user's diagram (the "right side"
  // orientation) and removes the remaining overlap/hole behavior.
  const miterRun = Math.max(40, depth - POST);
  const shape = new THREE.Shape();

  if (sharedSide === 'end') {
    // Incoming/horizontal wing: restore the original cut so its diagonal
    // stays on the intended side of the joint.
    shape.moveTo(xMin, zMin);
    shape.lineTo(xMax, zMin);
    shape.lineTo(xMax - miterRun, zMax);
    shape.lineTo(xMin, zMax);
  } else if (sharedSide === 'start') {
    // Outgoing/vertical wing: flip this board front-to-back so its diagonal
    // mirrors the horizontal wing and the two mitered faces meet cleanly.
    shape.moveTo(xMin, zMin);
    shape.lineTo(xMax, zMin);
    shape.lineTo(xMax, zMax);
    shape.lineTo(xMin + miterRun, zMax);
  } else {
    shape.moveTo(xMin, zMin);
    shape.lineTo(xMax, zMin);
    shape.lineTo(xMax, zMax);
    shape.lineTo(xMin, zMax);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center.x, center.y - thickness / 2, center.z);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, moduleId);
  group.add(mesh);
  return mesh;
}

function addUnifiedCornerShelfBoard(group, shelfModule, { width, depth, thickness, y, centerZ, shelfIndex }) {
  // Build one watertight L-shaped shelf surface for the corner. The two normal
  // shelf rectangles are unioned into one extrusion, so the joint cannot
  // create z-fighting, overlapping solids or a triangular hole. The subtle
  // diagonal line marks the intended meeting direction of the two boards.
  const halfD = depth / 2;
  const zMin = centerZ - halfD;
  const zMax = centerZ + halfD;
  const horizontalXMin = POST;
  const horizontalXMax = width - POST;
  const verticalXMin = width + zMin;
  const verticalXMax = width + zMax;
  const verticalZMin = -(width - POST);
  const verticalZMax = -POST;

  const shape = new THREE.Shape();
  shape.moveTo(horizontalXMin, zMin);
  shape.lineTo(horizontalXMin, zMax);
  shape.lineTo(horizontalXMax, zMax);
  shape.lineTo(horizontalXMax, verticalZMax);
  shape.lineTo(verticalXMax, verticalZMax);
  shape.lineTo(verticalXMax, verticalZMin);
  shape.lineTo(verticalXMin, verticalZMin);
  shape.lineTo(verticalXMin, zMin);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  // Rotate the extrusion into the horizontal shelf plane without using a
  // negative scale. The previous rotate-then-mirror transform had a negative
  // determinant, which reversed triangle winding: the underside became the
  // front-facing cap while the intended top/edge faces were culled. Rotating
  // the opposite direction maps the Shape Y axis directly to local Z and
  // keeps the geometry in the same cabinet volume with correct face winding.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y + thickness / 2, 0);
  geometry.computeVertexNormals();
  applyNormalizedBoxUVs(geometry);

  const mesh = new THREE.Mesh(geometry, woodMaterial(shelfModule.colour));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagMesh(mesh, shelfModule.id);
  tagShelfInteractive(mesh, shelfModule.id, shelfIndex);
  group.add(mesh);

  // Preserve the diagonal direction that was approved in the previous
  // version, but render it only as the clean meeting seam on the continuous
  // shelf instead of two intersecting cut solids.
  const seamGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(verticalXMin, y + thickness / 2 + 0.18, verticalZMax),
    new THREE.Vector3(horizontalXMax, y + thickness / 2 + 0.18, zMin),
  ]);
  const seamColour = new THREE.Color(shelfModule.colour).multiplyScalar(0.52);
  const seamMaterial = new THREE.LineBasicMaterial({
    color: seamColour,
    transparent: true,
    opacity: 0.45,
  });
  const seam = new THREE.Line(seamGeometry, seamMaterial);
  tagMesh(seam, shelfModule.id);
  tagShelfInteractive(seam, shelfModule.id, shelfIndex);
  group.add(seam);
}

function addUnifiedCornerShelves(parent, shelfModule, pose, width) {
  const spec = familySpec();
  const group = new THREE.Group();
  group.position.set(pose.x, 0, pose.z);
  group.rotation.y = -pose.heading;
  parent.add(group);

  const shelfDepth = spec.depth - 34;
  const shelfCenters = shelfCentersForModule(shelfModule, spec.height);
  const movableShelfDepth = Math.max(120, shelfDepth - MOVABLE_SHELF_DEPTH_REDUCTION);
  const movableShelfCenterZ = -spec.depth / 2 + MOVABLE_SHELF_DEPTH_REDUCTION / 2;

  shelfCenters.forEach((y, shelfIndex) => {
    const fixed = isShelfFixed(shelfModule, shelfIndex, spec.height);
    addUnifiedCornerShelfBoard(group, shelfModule, {
      width,
      depth: fixed ? shelfDepth : movableShelfDepth,
      thickness: BOARD,
      y,
      centerZ: fixed ? -spec.depth / 2 : movableShelfCenterZ,
      shelfIndex,
    });
  });
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





function addSideWallAssembly(group, shelfModule, { side, width, depth, height, sharedSide = null }) {
  if (sharedSide === side) return;
  const material = woodMaterial(shelfModule.colour);
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
  }, material, shelfModule.id);

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
  ], zCenter, zLength, material, shelfModule.id);

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
  ], zCenter, zLength, material, shelfModule.id);

  const topBodyStart = height - SIDE_RAIL_BODY;
  const topRampStart = topBodyStart - SIDE_RAIL_RAMP;
  addExtrudedSideProfile(group, [
    [innerX, topRampStart],
    [outerX, topBodyStart],
    [outerX, height],
    [innerX, height],
  ], zCenter, zLength, material, shelfModule.id);
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
  mesh.renderOrder = 10;
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

function addShelfWing(parent, shelfModule, pose, length, { cornerWing = false, sharedSide = null, omitShelves = false, omitStartPosts = false, omitEndPosts = false, omitStartFrontPost = false, omitStartBackPost = false, omitEndFrontPost = false, omitEndBackPost = false } = {}) {
  const spec = familySpec();
  const group = new THREE.Group();
  group.position.set(pose.x, 0, pose.z);
  group.rotation.y = -pose.heading;
  parent.add(group);

  const wood = woodMaterial(shelfModule.colour);
  const darkWood = darkWoodMaterial(shelfModule.colour);
  const width = length;
  const depth = spec.depth;
  const height = spec.height;
  const front = frontZ(depth);
  const innerWidth = Math.max(100, width - POST * 2);
  const shelfDepth = depth - 34;
  const shelfWidth = innerWidth;

  // The back panel now runs the complete predefined shelfModule height, matching
  // the uprights. The lower plinth remains a separate recessed structural part.
  addBox(group, { x: innerWidth, y: height, z: BACK }, { x: width / 2, y: height / 2, z: -BACK / 2 }, darkWood, shelfModule.id);
  const plinthWidth = innerWidth;
  const plinthDepth = Math.max(100, shelfDepth - PLINTH_FRONT_RECESS);
  const plinthCenterZ = -depth + POST + plinthDepth / 2;
  addBox(group, { x: plinthWidth, y: PLINTH_HEIGHT, z: plinthDepth }, {
    x: width / 2,
    y: PLINTH_HEIGHT / 2,
    z: plinthCenterZ,
  }, darkWood, shelfModule.id);
  const bottomShelfY = PLINTH_HEIGHT + BOARD / 2;
  if (!omitShelves) {
    if (cornerWing && sharedSide) {
      const bottomShelf = addMiteredShelfBoard(group, {
        width: innerWidth,
        depth: shelfDepth,
        thickness: BOARD,
        center: { x: width / 2, y: bottomShelfY, z: -depth / 2 },
        material: wood,
        moduleId: shelfModule.id,
        sharedSide,
      });
      tagShelfInteractive(bottomShelf, shelfModule.id, 0);
    } else {
      const bottomShelf = addBox(group, { x: innerWidth, y: BOARD, z: shelfDepth }, {
        x: width / 2,
        y: bottomShelfY,
        z: -depth / 2,
      }, wood, shelfModule.id);
      tagShelfInteractive(bottomShelf, shelfModule.id, 0);
    }
  }

  // Full-height side assemblies from floor to top. Their thin panels share the
  // same inner plane as the posts, while the three raised exterior connectors
  // build back out to the posts' outer plane. Connected straight modules retain
  // both side assemblies; only the shared inside of the one L-corner stays open.
  addSideWallAssembly(group, shelfModule, { side: 'start', width, depth, height, sharedSide });
  addSideWallAssembly(group, shelfModule, { side: 'end', width, depth, height, sharedSide });

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
      addBackPostWithFootDent(group, { x, height, material: wood, moduleId: shelfModule.id });
    }
    if (!omitFront) {
      addBox(group, { x: POST, y: height, z: POST }, { x, y: height / 2, z: front + POST / 2 }, wood, shelfModule.id);
    }
  });

  const shelfCenters = shelfCentersForModule(shelfModule, height);
  const movableShelfDepth = Math.max(120, shelfDepth - MOVABLE_SHELF_DEPTH_REDUCTION);
  const movableShelfCenterZ = -depth / 2 + MOVABLE_SHELF_DEPTH_REDUCTION / 2;
  if (!omitShelves) {
    shelfCenters.slice(1).forEach((y, index) => {
      const shelfIndex = index + 1;
      const fixed = isShelfFixed(shelfModule, shelfIndex, height);
      const currentDepth = fixed ? shelfDepth : movableShelfDepth;
      const currentCenterZ = fixed ? -depth / 2 : movableShelfCenterZ;
      if (cornerWing && sharedSide) {
        const shelf = addMiteredShelfBoard(group, {
          width: shelfWidth,
          depth: currentDepth,
          thickness: BOARD,
          center: { x: width / 2, y, z: currentCenterZ },
          material: wood,
          moduleId: shelfModule.id,
          sharedSide,
        });
        tagShelfInteractive(shelf, shelfModule.id, shelfIndex);
      } else {
        const shelf = addBox(group, {
          x: shelfWidth,
          y: BOARD,
          z: currentDepth,
        }, {
          x: width / 2,
          y,
          z: currentCenterZ,
        }, wood, shelfModule.id);
        tagShelfInteractive(shelf, shelfModule.id, shelfIndex);
      }
    });
  }

  addDoors(group, shelfModule, { width, depth, height, cornerWing, sharedSide });
  return group;
}

function addSolidDoorLeaf(parent, shelfModule, xCenter, width, yCenter, height, frontPlaneZ, { hinge = 'left', open = false, doorKey = '', keyhole = false, keyholeSide = 'left', hardware = false } = {}) {
  const wood = woodMaterial(shelfModule.colour);
  const darkWood = darkWoodMaterial(shelfModule.colour);
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

  const leftStileX = -width / 2 + frame / 2;
  const rightStileX = width / 2 - frame / 2;
  const usesKeyhole = keyhole && shelfModule.keyplate !== 'knob';

  if (usesKeyhole && keyholeSide === 'left') {
    addKeyholeCutoutRect(leaf, {
      rectWidth: frame,
      rectHeight: height,
      depth: doorThickness,
      zOffset: 0,
      material: wood,
      moduleId: shelfModule.id,
      keyholeX: 0,
      keyholeY: 0,
    }).position.set(leftStileX, 0, 0);
  } else {
    addBox(leaf, { x: frame, y: height, z: doorThickness }, { x: leftStileX, y: 0, z: doorThickness / 2 }, wood, shelfModule.id);
  }
  if (usesKeyhole && keyholeSide === 'right') {
    addKeyholeCutoutRect(leaf, {
      rectWidth: frame,
      rectHeight: height,
      depth: doorThickness,
      zOffset: 0,
      material: wood,
      moduleId: shelfModule.id,
      keyholeX: 0,
      keyholeY: 0,
    }).position.set(rightStileX, 0, 0);
  } else {
    addBox(leaf, { x: frame, y: height, z: doorThickness }, { x: rightStileX, y: 0, z: doorThickness / 2 }, wood, shelfModule.id);
  }
  addBox(leaf, { x: innerWidth, y: frame, z: doorThickness }, { x: 0, y: -height / 2 + frame / 2, z: doorThickness / 2 }, wood, shelfModule.id);
  addBox(leaf, { x: innerWidth, y: frame, z: doorThickness }, { x: 0, y: height / 2 - frame / 2, z: doorThickness / 2 }, wood, shelfModule.id);

  addBox(leaf, { x: panelWidth, y: panelHeight, z: panelThickness }, {
    x: 0,
    y: 0,
    z: panelInset + panelThickness / 2,
  }, darkWood, shelfModule.id);

  const xL0 = -panelWidth / 2 - bevel;
  const xL1 = -panelWidth / 2;
  const xR0 = panelWidth / 2;
  const xR1 = panelWidth / 2 + bevel;
  const yB0 = -panelHeight / 2 - bevel;
  const yB1 = -panelHeight / 2;
  const yT0 = panelHeight / 2;
  const yT1 = panelHeight / 2 + bevel;

  addDoorRampRing(leaf, {
    outerLeft: xL0,
    outerRight: xR1,
    outerBottom: yB0,
    outerTop: yT1,
    innerLeft: xL1,
    innerRight: xR0,
    innerBottom: yB1,
    innerTop: yT0,
    panelInset,
    material: wood,
    moduleId: shelfModule.id,
  });

  // Metal choices keep the single keyed fitting used by the original doors.
  // The wooden-knob choice removes all keyholes/keyplates and mounts one knob
  // on each leaf. On lower doors the knob sits on the centerline of the top
  // frame rail, while keeping the same inner-stile vertical axis.
  const showHardware = keyhole || (hardware && shelfModule.keyplate === 'knob');
  if (showHardware) {
    const hardwareX = keyholeSide === 'right' ? rightStileX : leftStileX;
    const hardwareY = shelfModule.keyplate === 'knob' ? height / 2 - frame / 2 : 0;
    addConfiguredDoorHardware(leaf, shelfModule, {
      x: hardwareX,
      y: hardwareY,
      plateWidth: SIDE_MID_BODY * 0.5,
      plateHeight: SIDE_MID_BODY,
    });
  }

  tagDoorInteractive(leaf, shelfModule.id, doorKey);
  return leaf;
}


function addDoorFrame(parent, shelfModule, xCenter, width, yCenter, height, z, { glazed = false, hinge = 'left', open = false, doorKey = '', keyplate = false, keyplateSide = 'left', midRailGlobalY = null, hardware = false } = {}) {
  const wood = woodMaterial(shelfModule.colour);
  const darkWood = darkWoodMaterial(shelfModule.colour);
  if (!glazed) {
    addSolidDoorLeaf(parent, shelfModule, xCenter, width, yCenter, height, z, { hinge, open, doorKey });
    return;
  }

  const leaf = createDoorPivot(parent, { xCenter, yCenter, z, width, hinge, open });
  const doorThickness = 18;
  const stile = Math.max(48, Math.min(64, width * 0.18));
  const railBody = SIDE_MID_BODY;
  const panelInset = 7;
  const panelThickness = 4;
  const bevel = 12;
  const railCenterGlobalY = midRailGlobalY == null ? yCenter : midRailGlobalY;
  const localMidY = railCenterGlobalY - yCenter;
  const innerLeft = -width / 2 + stile;
  const innerRight = width / 2 - stile;
  const innerWidth = Math.max(40, innerRight - innerLeft);
  const usesKeyhole = keyplate && shelfModule.keyplate !== 'knob';
  const keyplateOnLeft = usesKeyhole && keyplateSide === 'left';
  const keyplateOnRight = usesKeyhole && keyplateSide === 'right';

  const bottomRailBottom = -height / 2;
  const bottomRailTop = bottomRailBottom + railBody;
  const midRailBottom = localMidY - railBody / 2;
  const midRailTop = localMidY + railBody / 2;
  const topRailTop = height / 2;
  const topRailBottom = topRailTop - railBody;

  if (keyplateOnLeft) {
    addKeyholeCutoutRect(leaf, {
      rectWidth: stile,
      rectHeight: height,
      depth: doorThickness,
      zOffset: 0,
      material: wood,
      moduleId: shelfModule.id,
      keyholeX: 0,
      keyholeY: localMidY,
    }).position.set(-width / 2 + stile / 2, 0, 0);
  } else {
    addBox(leaf, { x: stile, y: height, z: doorThickness }, { x: -width / 2 + stile / 2, y: 0, z: doorThickness / 2 }, wood, shelfModule.id);
  }
  if (keyplateOnRight) {
    addKeyholeCutoutRect(leaf, {
      rectWidth: stile,
      rectHeight: height,
      depth: doorThickness,
      zOffset: 0,
      material: wood,
      moduleId: shelfModule.id,
      keyholeX: 0,
      keyholeY: localMidY,
    }).position.set(width / 2 - stile / 2, 0, 0);
  } else {
    addBox(leaf, { x: stile, y: height, z: doorThickness }, { x: width / 2 - stile / 2, y: 0, z: doorThickness / 2 }, wood, shelfModule.id);
  }
  addBox(leaf, { x: innerWidth, y: railBody, z: doorThickness }, { x: 0, y: (bottomRailBottom + bottomRailTop) / 2, z: doorThickness / 2 }, wood, shelfModule.id);
  addBox(leaf, { x: innerWidth, y: railBody, z: doorThickness }, { x: 0, y: localMidY, z: doorThickness / 2 }, wood, shelfModule.id);
  addBox(leaf, { x: innerWidth, y: railBody, z: doorThickness }, { x: 0, y: (topRailTop + topRailBottom) / 2, z: doorThickness / 2 }, wood, shelfModule.id);

  const lowerOuterLeft = innerLeft;
  const lowerOuterRight = innerRight;
  const lowerOuterBottom = bottomRailTop;
  const lowerOuterTop = midRailBottom;
  const lowerInnerLeft = lowerOuterLeft + bevel;
  const lowerInnerRight = lowerOuterRight - bevel;
  const lowerInnerBottom = lowerOuterBottom + bevel;
  const lowerInnerTop = lowerOuterTop - bevel;
  const lowerPanelWidth = Math.max(24, lowerInnerRight - lowerInnerLeft);
  const lowerPanelHeight = Math.max(24, lowerInnerTop - lowerInnerBottom);
  if (lowerPanelWidth > 0 && lowerPanelHeight > 0) {
    addBox(leaf, { x: lowerPanelWidth, y: lowerPanelHeight, z: panelThickness }, {
      x: 0,
      y: (lowerInnerBottom + lowerInnerTop) / 2,
      z: panelInset + panelThickness / 2,
    }, darkWood, shelfModule.id);
    addDoorRampRing(leaf, {
      outerLeft: lowerOuterLeft,
      outerRight: lowerOuterRight,
      outerBottom: lowerOuterBottom,
      outerTop: lowerOuterTop,
      innerLeft: lowerInnerLeft,
      innerRight: lowerInnerRight,
      innerBottom: lowerInnerBottom,
      innerTop: lowerInnerTop,
      panelInset,
      material: wood,
      moduleId: shelfModule.id,
    });
  }

  const upperOuterLeft = innerLeft;
  const upperOuterRight = innerRight;
  const upperOuterBottom = midRailTop;
  const upperOuterTop = topRailBottom;
  const upperInnerLeft = upperOuterLeft + bevel;
  const upperInnerRight = upperOuterRight - bevel;
  const upperInnerBottom = upperOuterBottom + bevel;
  const upperInnerTop = upperOuterTop - bevel;
  const upperGlassWidth = Math.max(24, upperInnerRight - upperInnerLeft);
  const upperGlassHeight = Math.max(24, upperInnerTop - upperInnerBottom);
  if (upperGlassWidth > 0 && upperGlassHeight > 0) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(upperGlassWidth, upperGlassHeight, 5), glassMaterial());
    glass.position.set(0, (upperInnerBottom + upperInnerTop) / 2, panelInset + 3.5);
    glass.castShadow = true;
    glass.receiveShadow = true;
    tagMesh(glass, shelfModule.id);
    leaf.add(glass);
    addDoorRampRing(leaf, {
      outerLeft: upperOuterLeft,
      outerRight: upperOuterRight,
      outerBottom: upperOuterBottom,
      outerTop: upperOuterTop,
      innerLeft: upperInnerLeft,
      innerRight: upperInnerRight,
      innerBottom: upperInnerBottom,
      innerTop: upperInnerTop,
      panelInset,
      material: wood,
      moduleId: shelfModule.id,
    });
  }

  const showHardware = keyplate || (hardware && shelfModule.keyplate === 'knob');
  if (showHardware) {
    const hardwareX = keyplateSide === 'right' ? width / 2 - stile / 2 : -width / 2 + stile / 2;
    addConfiguredDoorHardware(leaf, shelfModule, {
      x: hardwareX,
      y: localMidY,
      plateWidth: railBody * 0.5,
      plateHeight: railBody,
    });
  }

  tagDoorInteractive(leaf, shelfModule.id, doorKey);
}

function addDoors(parent, shelfModule, { width, depth, height, cornerWing = false, sharedSide = null }) {
  if (shelfModule.kind === 'corner' || shelfModule.door === 'open') return;
  const shelfFrontZ = frontZ(depth) + (depth - (depth - 34)) / 2;
  const solidDoorFrontZ = shelfFrontZ;
  const glazedDoorCenterZ = shelfFrontZ;
  const shelfCenters = shelfCentersForModule(shelfModule, height);
  const doorState = cloneDoorState(shelfModule.doorState);

  // A corner wing carries exactly one normal straight-shelfModule door leaf. This
  // keeps the corner doors identical in width, frame proportions and hardware
  // to the two leaves used on a straight shelfModule. The remaining corner-wing
  // length is structural depth, not extra door width.
  if (cornerWing) {
    const straightOpeningWidth = Math.max(120, familySpec().width - POST * 2);
    const incomingWing = sharedSide === 'end';
    const hinge = incomingWing ? 'left' : 'right';

    if (shelfModule.door === 'lower') {
      const leafWidth = Math.max(60, (straightOpeningWidth - DOOR_PAIR_GAP) / 2);
      const x = incomingWing
        ? POST + leafWidth / 2
        : width - POST - leafWidth / 2;
      const openingBottom = shelfCenters[0] + BOARD / 2;
      const openingTop = lowerDoorShelfCenterY(height) - BOARD / 2;
      const doorHeight = Math.max(120, openingTop - openingBottom);
      const y = (openingTop + openingBottom) / 2;
      addSolidDoorLeaf(parent, shelfModule, x, leafWidth, y, doorHeight, solidDoorFrontZ, {
        hinge,
        open: incomingWing ? doorState.lowerLeft : doorState.lowerRight,
        doorKey: incomingWing ? 'lowerLeft' : 'lowerRight',
        keyhole: incomingWing,
        keyholeSide: 'right',
      });
      return;
    }

    const leafWidth = Math.max(46, (straightOpeningWidth - DOOR_PAIR_GAP) / 2);
    const x = incomingWing
      ? POST + leafWidth / 2
      : width - POST - leafWidth / 2;
    const openingBottom = shelfCenters[0] + BOARD / 2;
    const openingTop = shelfCenters[shelfCenters.length - 1] - BOARD / 2;
    const doorHeight = Math.max(200, openingTop - openingBottom);
    const y = (openingTop + openingBottom) / 2;
    addDoorFrame(parent, shelfModule, x, leafWidth, y, doorHeight, glazedDoorCenterZ, {
      glazed: true,
      hinge,
      open: incomingWing ? doorState.glazedLeft : doorState.glazedRight,
      doorKey: incomingWing ? 'glazedLeft' : 'glazedRight',
      keyplate: incomingWing,
      keyplateSide: 'right',
      midRailGlobalY: height * 0.5,
    });
    return;
  }

  const lowerDoorStart = POST;
  const lowerDoorEnd = width - POST;
  const lowerDoorWidth = Math.max(120, lowerDoorEnd - lowerDoorStart);

  if (shelfModule.door === 'lower') {
    const openingBottom = shelfCenters[0] + BOARD / 2;
    const openingTop = lowerDoorShelfCenterY(height) - BOARD / 2;
    const doorHeight = Math.max(120, openingTop - openingBottom);
    const y = (openingTop + openingBottom) / 2;
    const leafWidth = Math.max(60, (lowerDoorWidth - DOOR_PAIR_GAP) / 2);
    const leftX = lowerDoorStart + leafWidth / 2;
    const rightX = lowerDoorEnd - leafWidth / 2;
    addSolidDoorLeaf(parent, shelfModule, leftX, leafWidth, y, doorHeight, solidDoorFrontZ, {
      hinge: 'left',
      open: doorState.lowerLeft,
      doorKey: 'lowerLeft',
      keyhole: true,
      keyholeSide: 'right',
    });
    addSolidDoorLeaf(parent, shelfModule, rightX, leafWidth, y, doorHeight, solidDoorFrontZ, {
      hinge: 'right',
      open: doorState.lowerRight,
      doorKey: 'lowerRight',
      keyholeSide: 'left',
      hardware: shelfModule.keyplate === 'knob',
    });
    return;
  }

  const openingStart = POST;
  const openingEnd = width - POST;
  const openingWidth = Math.max(120, openingEnd - openingStart);
  const leafWidth = Math.max(46, (openingWidth - DOOR_PAIR_GAP) / 2);
  const leftX = openingStart + leafWidth / 2;
  const rightX = openingEnd - leafWidth / 2;
  const openingBottom = shelfCenters[0] + BOARD / 2;
  const openingTop = shelfCenters[shelfCenters.length - 1] - BOARD / 2;
  const doorHeight = Math.max(200, openingTop - openingBottom);
  const y = (openingTop + openingBottom) / 2;
  addDoorFrame(parent, shelfModule, leftX, leafWidth, y, doorHeight, glazedDoorCenterZ, {
    glazed: true,
    hinge: 'left',
    open: doorState.glazedLeft,
    doorKey: 'glazedLeft',
    keyplate: true,
    keyplateSide: 'right',
    midRailGlobalY: height * 0.5,
  });
  addDoorFrame(parent, shelfModule, rightX, leafWidth, y, doorHeight, glazedDoorCenterZ, {
    glazed: true,
    hinge: 'right',
    open: doorState.glazedRight,
    doorKey: 'glazedRight',
    keyplateSide: 'left',
    hardware: shelfModule.keyplate === 'knob',
    midRailGlobalY: height * 0.5,
  });
}

function renderModule(entry) {
  const shelfModule = entry.shelfModule;
  const root = new THREE.Group();
  root.userData.bookshelfModuleId = shelfModule.id;
  bookshelfGroup.add(root);
  moduleGroups.set(shelfModule.id, root);

  if (shelfModule.kind === 'straight') {
    addShelfWing(root, shelfModule, entry.start, familySpec().width);
  } else {
    const first = addShelfWing(root, shelfModule, entry.start, familySpec().corner, { cornerWing: true, sharedSide: 'end', omitShelves: true, omitEndFrontPost: true });
    // The second wing starts at the shared corner, so its door leaves are inset away from that joint.
    const secondPose = { x: entry.corner.x, z: entry.corner.z, heading: entry.end.heading };
    const second = addShelfWing(root, shelfModule, secondPose, familySpec().corner, { cornerWing: true, sharedSide: 'start', omitShelves: true, omitStartPosts: true });
    addUnifiedCornerShelves(root, shelfModule, entry.start, familySpec().corner);
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


}
