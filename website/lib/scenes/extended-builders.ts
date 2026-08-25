import * as THREE from "three";
import { state as hallDefaults } from "./hall-state.js";
import { applyExplodedView, buildHallModel } from "./hall-factory.js";
import { state as solarDefaults } from "./solar-state.js";
import { buildRoofModel as buildSolarRoofModel } from "./solar-roof-factory.js";
import { buildSolarArray } from "./solar-factory.js";
import { solarDirection } from "./solar-position";
import { buildFenceAssembly } from "../../../fence-configurator/js/fenceFactory.js";
import { createFenceState } from "../../../fence-configurator/js/state.js";

export type HallPreviewState = typeof hallDefaults;
export type SolarPreviewState = typeof solarDefaults;
export type FencePreviewState = ReturnType<typeof createFenceState>;
export type SolarEnvironmentData = {
  center?: { lat: number; lon: number };
  radiusM?: number;
  terrain?: { radiusM: number; size: number; heights: Float32Array; centerElevationM: number } | null;
  buildings?: Array<{ points: Array<{ x: number; z: number }>; heightM?: number }>;
  roads?: Array<{ points: Array<{ x: number; z: number }>; widthM?: number }>;
  trees?: Array<{ x: number; z: number; heightM?: number }>;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Exact Hall configurator state, cloned so the website preview never mutates source defaults. */
export function createHallPreviewState(): HallPreviewState {
  return clone(hallDefaults);
}

/** Exact Solar configurator state, including its production defaults and PV layout. */
export function createSolarPreviewState(): SolarPreviewState {
  return clone(solarDefaults);
}

export function createFencePreviewState(): FencePreviewState {
  return createFenceState({ scenery: false, showDimensions: false, technicalEdges: false, cameraPreset: "3d" });
}

export function buildFencePreview(state: FencePreviewState) {
  const result = buildFenceAssembly(state);
  const root = result.root as THREE.Group;
  root.name = "fence-configurator-default-scene";
  root.userData.metrics = result.metrics;
  root.userData.preferredSize = 8.8;
  markShadows(root);
  return root;
}

function markShadows(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function fitAssetToBox(object: THREE.Object3D, target: THREE.Vector3) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(
    target.x / Math.max(size.x, 0.001),
    target.y / Math.max(size.y, 0.001),
    target.z / Math.max(size.z, 0.001),
  );
  object.scale.multiplyScalar(scale);
  const fitted = new THREE.Box3().setFromObject(object);
  const center = fitted.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= fitted.min.y;
  return object;
}

function makeReferenceHouse() {
  const group = new THREE.Group();
  group.name = "scale-reference-house";
  const wall = new THREE.MeshStandardMaterial({ color: 0xe8e3db, roughness: 0.9, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd1d5d7, roughness: 0.72, side: THREE.DoubleSide });
  const roof = new THREE.MeshStandardMaterial({ color: 0x4d514d, roughness: 0.78, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8ec9df, roughness: 0.16, metalness: 0.02, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const door = new THREE.MeshStandardMaterial({ color: 0x27323a, roughness: 0.62, side: THREE.DoubleSide });
  const width = 8.2; const depth = 4.6; const eave = 3.35; const rise = 1.35;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, eave, depth), wall);
  body.position.y = eave / 2;
  group.add(body);
  const halfDepth = depth / 2;
  const slope = Math.hypot(halfDepth, rise);
  const pitch = Math.atan2(rise, halfDepth);
  const roofWidth = width + 0.68;
  const roofSlope = slope + 0.425;
  const frontRoof = new THREE.Mesh(new THREE.BoxGeometry(roofWidth, 0.14, roofSlope), roof);
  frontRoof.position.set(0, eave + rise / 2 + 0.02, -halfDepth / 2);
  frontRoof.rotation.x = -pitch;
  const backRoof = frontRoof.clone();
  backRoof.position.z = halfDepth / 2;
  backRoof.rotation.x = pitch;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofWidth + 0.08, 0.12, 0.16), roof);
  ridge.position.set(0, eave + rise + 0.04, 0);
  group.add(frontRoof, backRoof, ridge);
  const frontZ = -depth / 2 - 0.012;
  const entry = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.055), door);
  entry.position.set(-width * 0.34, 1.025, frontZ);
  group.add(entry);
  for (const x of [-1.2, 0.35, 1.9, 3.05]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1.18, 0.065), trim);
    frame.position.set(x, 1.72, frontZ - 0.01);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.04, 0.025), glass);
    pane.position.set(x, 1.72, frontZ - 0.05);
    group.add(frame, pane);
  }
  markShadows(group);
  return group;
}

function makeTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x76543c, roughness: 0.95 }),
  );
  trunk.position.y = 0.85;
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.25, 1),
    new THREE.MeshStandardMaterial({ color: 0x7e9c67, roughness: 1 }),
  );
  crown.scale.set(1, 1.3, 1);
  crown.position.y = 2.55;
  group.add(trunk, crown);
  markShadows(group);
  return group;
}

function applyHallDisplayState(root: THREE.Group, state: HallPreviewState) {
  const get = (name: string) => root.getObjectByName(name);
  const mode = state.inspectionMode ?? "all";
  const primary = get("primary-structure");
  const secondary = get("secondary-structure");
  const connections = get("connection-detail");
  const foundation = get("foundation");
  const envelope = get("envelope");
  const openings = get("openings");
  const services = get("building-services");
  const planning = get("warehouse-planning");
  if (primary) primary.visible = ["all", "primary", "secondary", "connections", "foundations"].includes(mode);
  if (secondary) secondary.visible = Boolean(state.secondaryStructure) && ["all", "secondary"].includes(mode);
  if (connections) connections.visible = mode === "connections" || mode === "foundations" || (mode === "all" && Boolean(state.connectionDetails || state.explode > 0));
  if (foundation) foundation.visible = mode === "all" || mode === "foundations";
  if (envelope) envelope.visible = Boolean(state.showCladding) && (mode === "all" || mode === "envelope");
  if (openings) openings.visible = mode === "all" || mode === "envelope";
  if (services) services.visible = mode === "all" || mode === "services";
  if (planning) planning.visible = (mode === "all" || mode === "services") && Boolean(state.warehouseRacking || state.forkliftClearance);
  const racks = get("warehouse-racking");
  const aisles = get("forklift-clearance");
  if (racks) racks.visible = Boolean(state.warehouseRacking) && planning?.visible !== false;
  if (aisles) aisles.visible = Boolean(state.forkliftClearance) && planning?.visible !== false;
  const serviceNames = { lighting: "service-lighting", fire: "service-fire", climate: "service-climate", drainage: "service-drainage", skylights: "service-skylights", coverage: "service-coverage" };
  Object.entries(serviceNames).forEach(([key, name]) => {
    const group = get(name);
    if (!group) return;
    group.visible = key === "coverage"
      ? Boolean(state.serviceCoverage) && state.serviceVisibility !== "none"
      : state.serviceVisibility === "all" || state.serviceVisibility === key;
  });
  if (services && state.serviceVisibility === "none") services.visible = false;
  root.userData.showConnectionDetails = Boolean(state.connectionDetails || mode === "connections" || mode === "foundations");
  applyExplodedView(root, (Number(state.explode) || 0) / 100);
}

function addHallEnvironment(root: THREE.Group, state: HallPreviewState) {
  const scenery = new THREE.Group();
  scenery.name = "hall-default-scenery";
  if (!state.showScenery) return scenery;
  const halfW = state.width / 2; const halfL = state.length / 2;
  const houseX = -halfW - 10.5; const houseZ = -halfL - 8.5;
  const house = fitAssetToBox(makeReferenceHouse(), new THREE.Vector3(9.8, 6.15, 4.9));
  house.position.set(houseX, 0, houseZ);
  house.rotation.y = THREE.MathUtils.degToRad(28);
  scenery.add(house);
  const specs = [
    [-halfW - 5, -halfL + state.length * 0.2, 0.85, 0], [-halfW - 7, state.length * 0.08, 1.15, 34],
    [-halfW - 5.8, halfL + 5.8, 0.95, 72], [-state.width * 0.2, halfL + 7.2, 1.25, 108],
    [state.width * 0.22, halfL + 8, 0.88, 142], [halfW + 5.2, halfL + 5.4, 1.05, 176],
    [halfW + 7.6, state.length * 0.12, 0.82, 212], [halfW + 6.3, -halfL - 5.6, 1.18, 248],
    [state.width * 0.24, -halfL - 8, 0.92, 284], [-state.width * 0.12, -halfL - 7, 0.78, 318],
    [halfW + 8.5, -state.length * 0.18, 0.72, 346], [-halfW - 8.5, halfL * 0.55, 0.74, 22],
  ].filter(([x, z]) => Math.hypot(x - houseX, z - houseZ) > 10.5);
  specs.forEach(([x, z, scale, rotation]) => {
    const tree = fitAssetToBox(makeTree(), new THREE.Vector3(2.7 * scale, 4.7 * scale, 2.7 * scale));
    tree.position.set(x, 0, z);
    tree.rotation.y = THREE.MathUtils.degToRad(rotation);
    scenery.add(tree);
  });
  root.add(scenery);
  return scenery;
}

/** Builds the same detailed hall assembly used by /hall-configurator/. */
export function buildHallPreview(state: HallPreviewState) {
  const result = buildHallModel(state);
  const building = result.root as THREE.Group;
  applyHallDisplayState(building, state);
  markShadows(building);
  const root = new THREE.Group();
  root.name = "hall-configurator-default-scene";
  root.add(building);
  addHallEnvironment(root, state);
  root.updateMatrixWorld(true);
  // Native HallScene.fitCamera deliberately frames the building, not the much
  // larger ground plane or peripheral scenery. Those remain in the scene and
  // naturally crop at the viewport edges, exactly like the full configurator.
  const framingBox = new THREE.Box3().setFromObject(building);
  root.userData.framingBox = {
    min: framingBox.min.toArray(),
    max: framingBox.max.toArray(),
  };
  root.userData.metrics = result.metrics;
  root.userData.counts = result.counts;
  root.userData.profileSchedule = result.profileSchedule;
  return root;
}

function terrainHeight(data: SolarEnvironmentData, x: number, z: number) {
  const terrain = data.terrain;
  if (!terrain?.heights?.length || terrain.size < 2) return 0;
  const radius = terrain.radiusM;
  const fx = THREE.MathUtils.clamp((x + radius) / (radius * 2) * (terrain.size - 1), 0, terrain.size - 1);
  const fz = THREE.MathUtils.clamp((z + radius) / (radius * 2) * (terrain.size - 1), 0, terrain.size - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(x0 + 1, terrain.size - 1), z1 = Math.min(z0 + 1, terrain.size - 1);
  const tx = fx - x0, tz = fz - z0;
  const at = (ix: number, iz: number) => terrain.heights[iz * terrain.size + ix] - terrain.centerElevationM;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0, z0), at(x1, z0), tx), THREE.MathUtils.lerp(at(x0, z1), at(x1, z1), tx), tz);
}

function containsLocalOrigin(points: Array<{ x: number; z: number }>) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index], b = points[previous];
    if ((a.z > 0) !== (b.z > 0) && 0 < ((b.x - a.x) * -a.z) / ((b.z - a.z) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function buildSolarEnvironment(data: SolarEnvironmentData, state: SolarPreviewState) {
  const root = new THREE.Group();
  root.name = "solar-geographic-context";
  const terrain = data.terrain;
  // Match the live configurator's geographic overview: terrain, roads and the
  // wider neighbourhood remain visible instead of cropping to the roof parcel.
  const displayRadius = Math.min(110, Number(data.radiusM || terrain?.radiusM || 110));
  if (terrain?.heights?.length) {
    const segments = terrain.size - 1;
    const geometry = new THREE.PlaneGeometry(displayRadius * 2, displayRadius * 2, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i), z = position.getZ(i);
      const distance = Math.hypot(x, z);
      const raw = terrainHeight(data, x, z);
      const flattened = THREE.MathUtils.smoothstep(distance, Math.max(state.length, state.depth) * .68, Math.max(state.length, state.depth) * 1.25);
      position.setY(i, raw * flattened - .24);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8c1ad, roughness: .98, metalness: 0 }));
    mesh.name = "solar-theme-ground-terrain";
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xb69a72, roughness: .92, metalness: 0 });
  (data.buildings || []).slice(0, 320).forEach((building) => {
    if (!building.points || building.points.length < 3) return;
    const centroid = building.points.reduce((sum, point) => ({ x: sum.x + point.x / building.points.length, z: sum.z + point.z / building.points.length }), { x: 0, z: 0 });
    if (Math.hypot(centroid.x, centroid.z) > displayRadius * 1.08) return;
    // The configured roof replaces the mapped building directly underneath it.
    const hostClearance = Math.max(state.length, state.depth) * .56;
    const overlapsConfiguredHouse = building.points.some((point) => Math.hypot(point.x, point.z) < hostClearance);
    if (containsLocalOrigin(building.points) || overlapsConfiguredHouse) return;
    const shape = new THREE.Shape();
    building.points.forEach((point, index) => index ? shape.lineTo(point.x, -point.z) : shape.moveTo(point.x, -point.z));
    shape.closePath();
    const height = THREE.MathUtils.clamp(Number(building.heightM) || 6.4, 2.4, 38);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, buildingMaterial);
    mesh.position.y = terrainHeight(data, centroid.x, centroid.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  });
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x8f979d, roughness: 1 });
  (data.roads || []).slice(0, 220).forEach((road) => {
    if (!road.points || road.points.length < 2) return;
    const visiblePoints = road.points.filter((point) => Math.hypot(point.x, point.z) <= displayRadius * 1.12);
    if (visiblePoints.length < 2) return;
    const points = visiblePoints.map((point) => new THREE.Vector3(point.x, terrainHeight(data, point.x, point.z) + .035, point.z));
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, points.length * 2), Math.max(.55, (Number(road.widthM) || 5.4) / 2), 4, false), roadMaterial);
    mesh.receiveShadow = true; root.add(mesh);
  });
  const trees = (data.trees || []).slice(0, 240);
  trees.forEach((spec) => {
    if (Math.hypot(spec.x, spec.z) > displayRadius * 1.08) return;
    if (Math.hypot(spec.x, spec.z) < Math.max(state.length, state.depth) * .8) return;
    const height = THREE.MathUtils.clamp(Number(spec.heightM) || 7.5, 3, 18);
    const tree = makeTree();
    tree.scale.setScalar(height / 4.7);
    tree.position.set(spec.x, terrainHeight(data, spec.x, spec.z), spec.z);
    root.add(tree);
  });
  root.rotation.y = THREE.MathUtils.degToRad(Number(state.northDirection) || 0);
  return root;
}

/** Builds the same roof and PV array used by /solar-configurator/. */
export function buildSolarPreview(state: SolarPreviewState, environment?: SolarEnvironmentData | null) {
  const root = new THREE.Group();
  root.name = "solar-configurator-model";
  const roof = buildSolarRoofModel(state);
  const array = buildSolarArray(state);
  if (environment) root.add(buildSolarEnvironment(environment, state));
  const product = new THREE.Group();
  product.name = "configured-solar-house";
  product.position.set(
    Number(state.environmentLocalEastM) || 0,
    environment ? terrainHeight(environment, Number(state.environmentLocalEastM) || 0, -(Number(state.environmentLocalNorthM) || 0)) : 0,
    -(Number(state.environmentLocalNorthM) || 0),
  );
  product.add(roof.group, array.group);
  root.add(product);

  const compass = new THREE.Group();
  compass.name = "solar-compass";
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.02, 1.08, 64),
    new THREE.MeshBasicMaterial({ color: 0x359ce7, transparent: true, opacity: .72, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  compass.add(ring);
  const north = new THREE.Mesh(
    new THREE.ConeGeometry(.19, .72, 3),
    new THREE.MeshStandardMaterial({ color: 0xf05b62, emissive: 0x5c1118, emissiveIntensity: .45, roughness: .42 }),
  );
  north.rotation.x = Math.PI / 2;
  north.position.z = -.72;
  compass.add(north);
  for (let index = 0; index < 4; index += 1) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(index === 0 ? .055 : .035, .025, index === 0 ? .34 : .22),
      new THREE.MeshBasicMaterial({ color: index === 0 ? 0xf05b62 : 0x359ce7, transparent: true, opacity: .85 }),
    );
    marker.position.z = -1.22;
    marker.rotation.y = index * Math.PI / 2;
    marker.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), index * Math.PI / 2);
    compass.add(marker);
  }
  compass.position.set(product.position.x - state.length * .62, .08, product.position.z + state.depth * .68);
  compass.visible = Boolean(state.showCompass);
  root.add(compass);

  const latitude = Number(state.locationLat) || 45.63317;
  const orbitPoints: THREE.Vector3[] = [];
  for (let hour = 4; hour <= 20; hour += .25) {
    const sun = solarDirection(state.simulationDate, hour, latitude, Number(state.northDirection) || 0, 13.5);
    if (sun.elevationDeg >= -1) orbitPoints.push(new THREE.Vector3(sun.x, Math.max(.06, sun.y), sun.z));
  }
  if (orbitPoints.length > 1) {
    const orbitCurve = new THREE.CatmullRomCurve3(orbitPoints);
    const orbitGlow = new THREE.Mesh(
      new THREE.TubeGeometry(orbitCurve, 112, .035, 6, false),
      new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: .72, depthWrite: false }),
    );
    orbitGlow.visible = Boolean(state.showSunPath);
    orbitGlow.name = "solar-sun-orbit-glow";
    root.add(orbitGlow);
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPoints),
      new THREE.LineDashedMaterial({ color: 0x9beaff, dashSize: .42, gapSize: .14, transparent: true, opacity: .98, depthTest: false }),
    );
    orbit.computeLineDistances();
    orbit.visible = Boolean(state.showSunPath);
    orbit.name = "solar-sun-orbit";
    root.add(orbit);
  }
  const currentSun = solarDirection(state.simulationDate, Number(state.simulationHour) || 12, latitude, Number(state.northDirection) || 0, 13.5);
  const sunMarker = new THREE.Mesh(
    new THREE.SphereGeometry(.34, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd26b, emissive: 0xff9d24, emissiveIntensity: 2.1, roughness: .3 }),
  );
  sunMarker.position.set(currentSun.x, Math.max(.06, currentSun.y), currentSun.z);
  sunMarker.visible = Boolean(state.showSunPath);
  sunMarker.name = "solar-sun-marker";
  root.add(sunMarker);
  root.userData.metrics = {
    ...roof.metrics,
    ...array.metrics,
    roofMetrics: roof.metrics,
    solarMetrics: array.metrics,
  };
  if (environment) {
    // Keep the real, wide geographic mesh loaded, but frame the useful local
    // neighbourhood. Framing the complete OSM query radius made the configured
    // house and its nearest obstructions almost disappear in the showcase.
    const framingRadius = Math.min(52, Number(environment.radiusM || 52));
    root.userData.framingBox = { min: [-framingRadius, -8, -framingRadius], max: [framingRadius, 34, framingRadius] };
    root.userData.preferredSize = 20.5;
  } else {
    root.userData.framingBox = {
      min: [-state.length * .58, -.5, -state.depth * .62],
      max: [state.length * .58, Math.max(6, state.wallHeight + 4), state.depth * .62],
    };
    root.userData.preferredSize = 8.5;
  }
  return root;
}
