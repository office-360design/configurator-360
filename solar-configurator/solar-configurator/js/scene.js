import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoofModel } from './roofFactory.js?v=1';
import { buildSolarArray } from './solarFactory.js?v=2';
import { createDimensions } from './dimensions.js?v=1';
import { getSolarContext, getSunPathSamples } from './solarPosition.js?v=2';
import { horizonElevationAtAzimuth } from './energyModel.js?v=5';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const DEG = Math.PI / 180;
const BUILDING_SHADE_AZIMUTH_STEP_DEG = 2;
const BUILDING_BASE_COLOR = 0xaeb7bf;
const BUILDING_SHADE_COLOR = 0xb58b5f;
const GOOGLE_DSM_GROUND_COLOR = 0x9eae91;
const GOOGLE_DSM_ROOF_COLOR = 0x8796a2;
const GOOGLE_DSM_HOST_COLOR = 0x238bc5;
const GOOGLE_REFINED_BUILDING_COLOR = 0xa5b2bc;
const GOOGLE_ONLY_BUILDING_COLOR = 0x9ba9b4;
const GOOGLE_CANOPY_COLOR = 0x78936f;
const GOOGLE_MASK_COLOR = 0x6f8ca0;
const GOOGLE_REFERENCE_COLOR = 0x2f93c7;
const GOOGLE_REFERENCE_SEGMENT_COLOR = 0xe0a42f;
const GOOGLE_RECOMMENDED_PANEL_COLOR = 0x35c6e8;
const GOOGLE_FLUX_LOW_COLOR = 0x4967d8;
const GOOGLE_FLUX_MID_COLOR = 0x20b7b0;
const GOOGLE_FLUX_HIGH_COLOR = 0xffd34f;

function cross2(ax, az, bx, bz) {
  return ax * bz - az * bx;
}

function raySegmentDistance(originX, originZ, dirX, dirZ, a, b) {
  const sx = Number(b.x) - Number(a.x);
  const sz = Number(b.z) - Number(a.z);
  const denominator = cross2(dirX, dirZ, sx, sz);
  if (Math.abs(denominator) < 1e-9) return null;
  const qx = Number(a.x) - originX;
  const qz = Number(a.z) - originZ;
  const t = cross2(qx, qz, sx, sz) / denominator;
  const u = cross2(qx, qz, dirX, dirZ) / denominator;
  if (t < 0 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

function rayPolygonDistance(originX, originZ, dirX, dirZ, points) {
  let nearest = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const distance = raySegmentDistance(
      originX, originZ, dirX, dirZ,
      points[index], points[(index + 1) % points.length],
    );
    if (distance !== null && distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? nearest : null;
}


function percentile(values, fraction = 0.5) {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = clamp(Number(fraction) || 0, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const mix = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * mix;
}

function polygonAreaXZ(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += Number(a.x) * Number(b.z) - Number(b.x) * Number(a.z);
  }
  return Math.abs(area) * 0.5;
}

function convexHullXZ(points) {
  const unique = [];
  const seen = new Set();
  for (const point of points || []) {
    const x = Number(point.x);
    const z = Number(point.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ x, z });
  }
  if (unique.length <= 3) return unique;
  unique.sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}


function pruneCollinearClosedXZ(points) {
  const input = (points || []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)));
  if (input.length < 4) return input;
  const output = [];
  for (let index = 0; index < input.length; index += 1) {
    const previous = input[(index - 1 + input.length) % input.length];
    const current = input[index];
    const next = input[(index + 1) % input.length];
    const ax = Number(current.x) - Number(previous.x);
    const az = Number(current.z) - Number(previous.z);
    const bx = Number(next.x) - Number(current.x);
    const bz = Number(next.z) - Number(current.z);
    if (Math.abs(cross2(ax, az, bx, bz)) <= 1e-7 && ax * bx + az * bz >= 0) continue;
    output.push({ x: Number(current.x), z: Number(current.z) });
  }
  return output.length >= 3 ? output : input;
}

function rasterMaskBoundaryLoops(indices, model) {
  const size = Number(model?.size) || 0;
  if (!size || !indices?.length) return [];
  const selected = new Set(indices);
  const edges = [];
  const addEdge = (ax, az, bx, bz) => edges.push({ a: { x: ax, z: az }, b: { x: bx, z: bz }, used: false });

  for (const index of selected) {
    const row = Math.floor(index / size);
    const column = index % size;
    const left = column * 2 - 1;
    const right = column * 2 + 1;
    const top = row * 2 - 1;
    const bottom = row * 2 + 1;
    if (row === 0 || !selected.has((row - 1) * size + column)) addEdge(left, top, right, top);
    if (column === size - 1 || !selected.has(row * size + column + 1)) addEdge(right, top, right, bottom);
    if (row === size - 1 || !selected.has((row + 1) * size + column)) addEdge(right, bottom, left, bottom);
    if (column === 0 || !selected.has(row * size + column - 1)) addEdge(left, bottom, left, top);
  }

  const outgoing = new Map();
  const edgeKey = (point) => `${point.x}:${point.z}`;
  edges.forEach((edge, edgeIndex) => {
    const startKey = edgeKey(edge.a);
    if (!outgoing.has(startKey)) outgoing.set(startKey, []);
    outgoing.get(startKey).push(edgeIndex);
  });

  const spacingX = (Number(model.maxX) - Number(model.minX)) / Math.max(1, size - 1);
  const spacingZ = (Number(model.maxZ) - Number(model.minZ)) / Math.max(1, size - 1);
  const toWorld = (point) => ({
    x: Number(model.minX) + (point.x / 2) * spacingX,
    z: Number(model.minZ) + (point.z / 2) * spacingZ,
  });
  const loops = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (edges[startIndex].used) continue;
    const startEdge = edges[startIndex];
    const startKey = edgeKey(startEdge.a);
    const lattice = [startEdge.a];
    let edgeIndex = startIndex;
    let guard = 0;
    while (edgeIndex !== undefined && guard < edges.length + 10) {
      guard += 1;
      const edge = edges[edgeIndex];
      if (edge.used) break;
      edge.used = true;
      lattice.push(edge.b);
      const endKey = edgeKey(edge.b);
      if (endKey === startKey) break;
      const candidates = outgoing.get(endKey) || [];
      edgeIndex = candidates.find((candidate) => !edges[candidate].used);
    }
    if (lattice.length < 4 || edgeKey(lattice[lattice.length - 1]) !== startKey) continue;
    lattice.pop();
    const world = pruneCollinearClosedXZ(lattice.map(toWorld));
    if (world.length >= 3) loops.push(world);
  }
  loops.sort((a, b) => polygonAreaXZ(b) - polygonAreaXZ(a));
  return loops;
}

function createCompassLabel(text, className = '') {
  const element = document.createElement('div');
  element.className = `compass-label ${className}`.trim();
  element.textContent = text;
  return new CSS2DObject(element);
}

function sunVector(elevationDeg, trueAzimuthDeg, roofFrontAzimuthDeg, radius = 22) {
  const elevation = elevationDeg * DEG;
  const localAzimuth = (trueAzimuthDeg - roofFrontAzimuthDeg) * DEG;
  const horizontal = Math.cos(elevation) * radius;
  return new THREE.Vector3(
    Math.sin(localAzimuth) * horizontal,
    Math.sin(elevation) * radius,
    -Math.cos(localAzimuth) * horizontal,
  );
}

export class RoofScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.environmentState = {
      northDirection: 0,
      nightPreview: false,
      showSunPath: true,
      simulationHour: 12,
      simulationDate: '',
      locationMode: 'region',
      locationLat: null,
      locationLon: null,
      locationLabel: '',
      locationTimeZone: 'Europe/Bucharest',
      region: 'muntenia',
      environmentEnabled: true,
      environmentRadiusM: 180,
      terrainEnabled: true,
      buildingsEnabled: true,
      roadsEnabled: true,
      treesEnabled: true,
      terrainExaggeration: 1,
      environmentLocalEastM: 0,
      environmentLocalNorthM: 0,
      replaceHostBuilding: true,
      localBuildingShadingEnabled: true,
      localBuildingShadingModel: null,
      googleSolarDsmEnabled: true,
      googleSolarBuildingMaskVisible: true,
      googleSolarRawDsmVisible: false,
      googleSolarReferenceBuildingVisible: true,
      googleSolarRecommendedLayoutVisible: true,
      googleSolarRecommendedConfigPanels: 0,
      googleSolarFluxHeatmapVisible: true,
      googleSolarFluxNearbyRoofsVisible: false,
      googleSolarFluxPeriod: 'annual',
      pvgisUseHorizon: true,
      pvgisShowHorizon: true,
      pvgisHorizonProfile: null,
    };
    this.lastSolarContext = null;
    this.geographicData = null;
    this.googleSurfaceModel = null;
    this.googleBuildingInsights = null;
    this.googleFluxModel = null;
    this.googleFluxDecoded = null;
    this.googleFluxHeatmapStats = { renderedCells: 0, hostCells: 0, nearbyCells: 0, period: 'annual', stats: null };
    this.googleHostComponent = null;
    this.googleMaskComponentsCache = null;
    this.googleDatumOffsetCache = null;
    this.googleBuildingHeightCache = new Map();
    this.googleReferenceMetricsCache = null;
    this.googleHybridStats = { refinedBuildingCount: 0, googleOnlyBuildingCount: 0, canopyCount: 0, datumOffsetM: 0 };
    this.shadowContextRadius = 0;
    this.sunPathKey = '';
    this.pvgisHorizonKey = '';
    this.localBuildingShadingRevision = 0;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(-13, 10, -15);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.host.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.host.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 55;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 2, 0);

    this.addLights();
    this.addEnvironment();

    this.geographicRoot = new THREE.Group();
    this.geographicRoot.name = 'geographic-context';
    this.scene.add(this.geographicRoot);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.solarRoot = new THREE.Group();
    this.scene.add(this.solarRoot);
    this.dimensionsRoot = new THREE.Group();
    this.scene.add(this.dimensionsRoot);
    this.compassRoot = this.createCompass();
    this.compassRoot.visible = false;
    this.scene.add(this.compassRoot);
    this.createSunVisuals();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  addLights() {
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x72777d, 1.6);
    this.scene.add(this.hemisphereLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
    this.keyLight.position.set(-9, 14, 8);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -25;
    this.keyLight.shadow.camera.right = 25;
    this.keyLight.shadow.camera.top = 25;
    this.keyLight.shadow.camera.bottom = -25;
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 80;
    this.keyLight.shadow.bias = -0.00035;
    this.keyLight.shadow.normalBias = 0.012;
    this.keyLight.target.position.set(0, 2, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight = new THREE.DirectionalLight(0xcbdcff, 1.35);
    this.fillLight.position.set(10, 7, -10);
    this.scene.add(this.fillLight);
  }

  addEnvironment() {
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xd9dddf, roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.205;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.GridHelper(80, 80, 0x9aa2a8, 0xcbd0d4);
    this.grid.position.y = -0.195;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.25;
    this.scene.add(this.grid);
  }

  createSunVisuals() {
    this.sunPathRoot = new THREE.Group();
    this.sunPathRoot.name = 'real-sun-path';
    this.scene.add(this.sunPathRoot);

    this.sunPathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xe2a72b,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
      }),
    );
    this.sunPathLine.renderOrder = 20;
    this.sunPathRoot.add(this.sunPathLine);

    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffc64a, toneMapped: false }),
    );
    this.sunDisc.renderOrder = 21;
    this.sunPathRoot.add(this.sunDisc);

    this.pvgisHorizonRoot = new THREE.Group();
    this.pvgisHorizonRoot.name = 'pvgis-terrain-horizon';
    this.scene.add(this.pvgisHorizonRoot);
    this.pvgisHorizonLine = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x49697d,
        transparent: true,
        opacity: 0.78,
        dashSize: 0.38,
        gapSize: 0.22,
        depthTest: false,
      }),
    );
    this.pvgisHorizonLine.renderOrder = 19;
    this.pvgisHorizonRoot.add(this.pvgisHorizonLine);
  }

  createCompass() {
    const group = new THREE.Group();
    group.name = 'roof-compass';

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.9, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0878c9,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.renderOrder = 12;
    group.add(ring);

    const crossMaterial = new THREE.LineBasicMaterial({
      color: 0x263746,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    });
    const crossGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.64, 0.034, 0),
      new THREE.Vector3(0.64, 0.034, 0),
      new THREE.Vector3(0, 0.034, -0.64),
      new THREE.Vector3(0, 0.034, 0.64),
    ]);
    const cross = new THREE.LineSegments(crossGeometry, crossMaterial);
    cross.renderOrder = 13;
    group.add(cross);

    const northShape = new THREE.Shape();
    northShape.moveTo(0, 0.7);
    northShape.lineTo(0.18, 0.18);
    northShape.lineTo(0, 0.3);
    northShape.lineTo(-0.18, 0.18);
    northShape.closePath();
    const northArrow = new THREE.Mesh(
      new THREE.ShapeGeometry(northShape),
      new THREE.MeshBasicMaterial({ color: 0xd83b45, side: THREE.DoubleSide, depthTest: false }),
    );
    northArrow.rotation.x = -Math.PI / 2;
    northArrow.position.y = 0.045;
    northArrow.renderOrder = 14;
    group.add(northArrow);

    const center = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }),
    );
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.052;
    center.renderOrder = 15;
    group.add(center);

    const north = createCompassLabel('N', 'compass-label--north');
    north.position.set(0, 0.13, -1.08);
    group.add(north);
    const east = createCompassLabel('E');
    east.position.set(1.08, 0.13, 0);
    group.add(east);
    const south = createCompassLabel('S');
    south.position.set(0, 0.13, 1.08);
    group.add(south);
    const west = createCompassLabel('W');
    west.position.set(-1.08, 0.13, 0);
    group.add(west);

    return group;
  }

  updateCompassPlacement(state) {
    const scale = clamp(Math.max(state.length, state.depth) / 10, 0.78, 1.18);
    this.compassRoot.scale.setScalar(scale);
    this.compassRoot.position.set(
      -state.length / 2 - 1.55 * scale,
      0.02,
      -state.depth / 2 - 1.55 * scale,
    );
    this.compassRoot.rotation.y = THREE.MathUtils.degToRad(this.environmentState.northDirection);
  }

  setCompassVisible(visible) {
    this.compassRoot.visible = Boolean(visible);
  }

  updateSunPath() {
    const state = this.environmentState;
    const key = [
      state.simulationDate,
      state.region,
      state.locationMode,
      Number(state.locationLat).toFixed?.(5) || '',
      Number(state.locationLon).toFixed?.(5) || '',
      Number(state.northDirection || 0).toFixed(1),
    ].join('|');
    this.sunPathRoot.visible = Boolean(state.showSunPath);
    if (!state.showSunPath || key === this.sunPathKey) return;
    this.sunPathKey = key;
    const samples = getSunPathSamples(state, 12);
    const points = samples
      .filter((sample) => sample.elevationDeg >= -1)
      .map((sample) => sunVector(sample.elevationDeg, sample.azimuthDeg, state.northDirection, 22));
    this.sunPathLine.geometry.dispose();
    this.sunPathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  updatePvgisHorizon() {
    const state = this.environmentState;
    const profile = Array.isArray(state.pvgisHorizonProfile) ? state.pvgisHorizonProfile : [];
    const key = [
      Number(state.northDirection || 0).toFixed(1),
      profile.length,
      ...profile.slice(0, 64).flatMap((point) => [
        Number(point.azimuthDeg || 0).toFixed(1),
        Number(point.elevationDeg || 0).toFixed(1),
      ]),
    ].join('|');
    this.pvgisHorizonRoot.visible = Boolean(state.pvgisShowHorizon) && profile.length > 1;
    if (!this.pvgisHorizonRoot.visible || key === this.pvgisHorizonKey) return;
    this.pvgisHorizonKey = key;
    const points = profile
      .filter((point) => Number.isFinite(Number(point.azimuthDeg)) && Number.isFinite(Number(point.elevationDeg)))
      .map((point) => sunVector(
        clamp(Number(point.elevationDeg), -4, 55),
        Number(point.azimuthDeg),
        state.northDirection,
        20.5,
      ));
    this.pvgisHorizonLine.geometry.dispose();
    this.pvgisHorizonLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.pvgisHorizonLine.computeLineDistances();
  }

  setEnvironment(settings = {}) {
    const copyKeys = [
      'simulationHour', 'simulationDate', 'locationMode', 'locationLat', 'locationLon',
      'locationLabel', 'locationTimeZone', 'region', 'showSunPath',
      'environmentEnabled', 'environmentRadiusM', 'terrainEnabled', 'buildingsEnabled',
      'roadsEnabled', 'treesEnabled', 'terrainExaggeration', 'environmentLocalEastM',
      'environmentLocalNorthM', 'replaceHostBuilding', 'localBuildingShadingEnabled', 'localBuildingShadingModel',
      'googleSolarDsmEnabled', 'googleSolarBuildingMaskVisible', 'googleSolarRawDsmVisible', 'googleSolarReferenceBuildingVisible',
      'googleSolarRecommendedLayoutVisible', 'googleSolarRecommendedConfigPanels',
      'googleSolarFluxHeatmapVisible', 'googleSolarFluxNearbyRoofsVisible', 'googleSolarFluxPeriod',
      'pvgisUseHorizon', 'pvgisShowHorizon', 'pvgisHorizonProfile',
    ];
    copyKeys.forEach((key) => {
      if (settings[key] !== undefined) this.environmentState[key] = settings[key];
    });
    if (Number.isFinite(Number(settings.northDirection))) {
      this.environmentState.northDirection = ((Number(settings.northDirection) % 360) + 360) % 360;
    }
    if (typeof settings.nightPreview === 'boolean') {
      this.environmentState.nightPreview = settings.nightPreview;
    }
    this.compassRoot.rotation.y = THREE.MathUtils.degToRad(this.environmentState.northDirection);
    this.applyGeographicTransform(this.environmentState);
    this.syncGeographicLayerVisibility(this.environmentState);
    this.updateSunPath();
    this.updatePvgisHorizon();
    return this.updateLighting();
  }

  updateLighting() {
    const solar = getSolarContext(this.environmentState, this.environmentState.simulationHour);
    const horizonProfile = Array.isArray(this.environmentState.pvgisHorizonProfile) ? this.environmentState.pvgisHorizonProfile : [];
    const terrainHorizonElevationDeg = horizonProfile.length
      ? horizonElevationAtAzimuth(horizonProfile, solar.azimuthDeg)
      : 0;
    const terrainBlocked = Boolean(this.environmentState.pvgisUseHorizon)
      && horizonProfile.length > 1
      && solar.elevationDeg > -0.833
      && solar.elevationDeg <= terrainHorizonElevationDeg;
    this.lastSolarContext = { ...solar, terrainHorizonElevationDeg, terrainBlocked };
    const lightRadius = this.shadowContextRadius > 0 ? Math.max(45, this.shadowContextRadius * 1.85) : 28;
    const position = sunVector(solar.elevationDeg, solar.azimuthDeg, this.environmentState.northDirection, lightRadius);
    this.keyLight.position.copy(position);
    this.sunDisc.position.copy(sunVector(solar.elevationDeg, solar.azimuthDeg, this.environmentState.northDirection, 22));
    this.sunDisc.visible = Boolean(this.environmentState.showSunPath) && solar.elevationDeg > -1.5;

    const daylightStrength = clamp((solar.elevationDeg + 4) / 52, 0, 1);
    const automaticNight = solar.elevationDeg <= -0.833;
    const isNight = Boolean(this.environmentState.nightPreview) || automaticNight;
    if (isNight) {
      this.keyLight.color.setHex(0x9db9ff);
      this.keyLight.intensity = automaticNight ? 0 : 0.42;
      this.hemisphereLight.intensity = automaticNight ? 0.22 : 0.34;
      this.hemisphereLight.color.setHex(0x8da9dd);
      this.hemisphereLight.groundColor.setHex(0x111827);
      this.fillLight.intensity = 0.12;
      this.renderer.toneMappingExposure = automaticNight ? 0.48 : 0.62;
      this.groundMaterial.color.setHex(0x26313f);
      this.grid.material.opacity = 0.11;
    } else {
      const warm = clamp(1 - solar.elevationDeg / 18, 0, 1);
      this.keyLight.color.setRGB(1, 0.90 + 0.10 * (1 - warm), 0.76 + 0.24 * (1 - warm));
      this.keyLight.intensity = terrainBlocked ? 0.08 : 1.2 + daylightStrength * 4.1;
      this.hemisphereLight.intensity = 0.85 + daylightStrength * 0.75;
      this.hemisphereLight.color.setHex(0xffffff);
      this.hemisphereLight.groundColor.setHex(0x72777d);
      this.fillLight.intensity = terrainBlocked ? 0.42 : 0.65 + daylightStrength * 0.55;
      this.renderer.toneMappingExposure = 0.88 + daylightStrength * 0.22;
      this.groundMaterial.color.setHex(0xd9dddf);
      this.grid.material.opacity = 0.25;
    }

    this.host.closest('.viewer-stage')?.classList.toggle('is-night-preview', isNight);
    return solar;
  }

  rebuildSolarArray(state) {
    this.disposeGroup(this.solarRoot);
    const { group: solarGroup, metrics: solarMetrics } = buildSolarArray(state);
    this.solarRoot.add(solarGroup);
    return solarMetrics;
  }

  rebuild(state, fitCamera = false) {
    this.disposeGroup(this.modelRoot);
    this.disposeGroup(this.dimensionsRoot);

    const { group, metrics: roofMetrics } = buildRoofModel(state);
    this.modelRoot.add(group);

    const solarMetrics = this.rebuildSolarArray(state);

    if (state.showDimensions) {
      this.dimensionsRoot.add(createDimensions(state, roofMetrics.ridgeElevation));
    }

    this.updateCompassPlacement(state);
    if (this.geographicData) this.rebuildGeographicEnvironment(state);
    this.controls.target.set(0, Math.max(1.4, roofMetrics.ridgeElevation * 0.36), 0);
    if (fitCamera) this.fitCamera(state, roofMetrics.ridgeElevation);
    return { ...roofMetrics, ...solarMetrics, roofMetrics, solarMetrics };
  }

  hasGeographicEnvironment() {
    return Boolean(this.geographicData);
  }

  setGeographicEnvironment(data, state) {
    this.geographicData = data || null;
    this.rebuildGeographicEnvironment(state || this.environmentState);
    return this.geographicData;
  }

  setGoogleSurfaceModel(model, state = this.environmentState) {
    this.googleSurfaceModel = model || null;
    this.googleHostComponent = null;
    this.googleMaskComponentsCache = null;
    this.googleDatumOffsetCache = null;
    this.googleBuildingHeightCache = new Map();
    this.googleReferenceMetricsCache = null;
    this.googleHybridStats = { refinedBuildingCount: 0, googleOnlyBuildingCount: 0, canopyCount: 0, datumOffsetM: 0 };
    if (this.geographicData) this.rebuildGeographicEnvironment(state);
    return this.googleSurfaceModel;
  }

  setGoogleBuildingInsights(insights, state = this.environmentState) {
    this.googleBuildingInsights = insights || null;
    this.googleHostComponent = null;
    this.googleReferenceMetricsCache = null;
    if (this.geographicData) this.rebuildGeographicEnvironment(state);
    return this.googleBuildingInsights;
  }

  setGoogleFluxModel(model, state = this.environmentState) {
    this.googleFluxModel = model || null;
    this.googleFluxDecoded = null;
    this.googleFluxHeatmapStats = { renderedCells: 0, hostCells: 0, nearbyCells: 0, period: String(state.googleSolarFluxPeriod || 'annual'), stats: null };
    if (this.geographicData) this.rebuildGeographicEnvironment(state);
    return this.googleFluxModel;
  }

  decodeGoogleFluxBase64(encoded) {
    if (!encoded) return null;
    try {
      const binary = window.atob(String(encoded));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer);
      const count = Math.floor(bytes.byteLength / 2);
      const values = new Float32Array(count);
      const scale = Math.max(0.0001, Number(this.googleFluxModel?.scale) || 10);
      const invalid = Number(this.googleFluxModel?.invalidValue) || 65535;
      for (let index = 0; index < count; index += 1) {
        const raw = view.getUint16(index * 2, true);
        values[index] = raw === invalid ? Number.NaN : raw / scale;
      }
      return values;
    } catch {
      return null;
    }
  }

  ensureGoogleFluxDecoded() {
    const model = this.googleFluxModel;
    if (!model) return null;
    if (this.googleFluxDecoded?.revision === model.revision) return this.googleFluxDecoded;
    const annual = this.decodeGoogleFluxBase64(model.annualFluxU16B64);
    const monthly = (Array.isArray(model.monthlyFluxU16B64) ? model.monthlyFluxU16B64 : []).map((encoded) => this.decodeGoogleFluxBase64(encoded));
    this.googleFluxDecoded = { revision: model.revision, annual, monthly };
    return this.googleFluxDecoded;
  }

  getGoogleFluxHeatmapInfo(state = this.environmentState) {
    const model = this.googleFluxModel;
    const decoded = this.ensureGoogleFluxDecoded();
    const rawPeriod = String(state.googleSolarFluxPeriod ?? 'annual');
    const monthIndex = rawPeriod === 'annual' ? -1 : clamp(Math.round(Number(rawPeriod) || 0), 0, 11);
    const values = monthIndex < 0 ? decoded?.annual : decoded?.monthly?.[monthIndex];
    const modelStats = monthIndex < 0 ? model?.stats?.annual : model?.stats?.monthly?.[monthIndex];
    const renderedStats = this.googleFluxHeatmapStats?.period === (monthIndex < 0 ? 'annual' : String(monthIndex))
      ? this.googleFluxHeatmapStats?.stats
      : null;
    return {
      available: Boolean(model && values?.length),
      period: monthIndex < 0 ? 'annual' : String(monthIndex),
      monthIndex,
      values: values || null,
      stats: renderedStats || modelStats || null,
      units: model?.units || 'kWh/kW/year',
      renderedCells: Number(this.googleFluxHeatmapStats?.renderedCells) || 0,
      hostCells: Number(this.googleFluxHeatmapStats?.hostCells) || 0,
      nearbyCells: Number(this.googleFluxHeatmapStats?.nearbyCells) || 0,
    };
  }

  clearGeographicEnvironment() {
    this.geographicData = null;
    this.googleHostComponent = null;
    this.googleHybridStats = { refinedBuildingCount: 0, googleOnlyBuildingCount: 0, canopyCount: 0, datumOffsetM: 0 };
    this.disposeGroup(this.geographicRoot);
    this.ground.visible = true;
    this.grid.visible = true;
    this.shadowContextRadius = 0;
    this.controls.maxDistance = 55;
    this.keyLight.shadow.camera.left = -25;
    this.keyLight.shadow.camera.right = 25;
    this.keyLight.shadow.camera.top = 25;
    this.keyLight.shadow.camera.bottom = -25;
    this.keyLight.shadow.camera.far = 80;
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.updateLighting();
  }

  terrainRelativeHeight(x, z, state = this.environmentState) {
    const terrain = this.geographicData?.terrain;
    if (!terrain || state.terrainEnabled === false) return 0;
    const houseMap = this.getHouseMapPosition(state);
    const originElevation = this.terrainAbsoluteElevation(houseMap.x, houseMap.z) ?? terrain.centerElevationM;
    const absoluteElevation = this.terrainAbsoluteElevation(x, z) ?? originElevation;
    const relative = (absoluteElevation - originElevation)
      * clamp(Number(state.terrainExaggeration) || 1, 0.25, 3);
    const padRadius = Math.hypot(Number(state.length) || 10, Number(state.depth) || 7) * 0.5 + 1.4;
    const distance = Math.hypot(x - houseMap.x, z - houseMap.z);
    if (distance <= padRadius) return 0;
    const blend = clamp((distance - padRadius) / 7, 0, 1);
    const smooth = blend * blend * (3 - 2 * blend);
    return relative * smooth;
  }

  terrainPhysicalRelativeHeight(x, z, state = this.environmentState) {
    const terrain = this.geographicData?.terrain;
    if (!terrain) return 0;
    const houseMap = this.getHouseMapPosition(state);
    const originElevation = this.terrainAbsoluteElevation(houseMap.x, houseMap.z) ?? terrain.centerElevationM;
    const absoluteElevation = this.terrainAbsoluteElevation(x, z) ?? originElevation;
    return absoluteElevation - originElevation;
  }

  terrainAbsoluteElevation(x, z) {
    const terrain = this.geographicData?.terrain;
    if (!terrain) return null;
    const radius = terrain.radiusM;
    const size = terrain.size;
    const u = clamp((x + radius) / (radius * 2), 0, 1) * (size - 1);
    const v = clamp((z + radius) / (radius * 2), 0, 1) * (size - 1);
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(size - 1, x0 + 1);
    const z1 = Math.min(size - 1, z0 + 1);
    const fx = u - x0;
    const fz = v - z0;
    const h00 = terrain.heights[z0 * size + x0];
    const h10 = terrain.heights[z0 * size + x1];
    const h01 = terrain.heights[z1 * size + x0];
    const h11 = terrain.heights[z1 * size + x1];
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  }

  getHouseMapPosition(state = this.environmentState) {
    return {
      x: Number(state.environmentLocalEastM) || 0,
      z: -(Number(state.environmentLocalNorthM) || 0),
    };
  }

  geoToMapPoint(location) {
    const center = this.geographicData?.center;
    const latitude = Number(location?.latitude ?? location?.lat);
    const longitude = Number(location?.longitude ?? location?.lon);
    const centerLat = Number(center?.lat);
    const centerLon = Number(center?.lon);
    if (![latitude, longitude, centerLat, centerLon].every(Number.isFinite)) return null;
    const metersPerDegree = 111320;
    const northM = (latitude - centerLat) * metersPerDegree;
    const eastM = (longitude - centerLon) * metersPerDegree * Math.max(0.2, Math.cos(centerLat * DEG));
    return { x: eastM, z: -northM };
  }

  houseLocalToMapPoint(point, state = this.environmentState) {
    const houseMap = this.getHouseMapPosition(state);
    const angle = THREE.MathUtils.degToRad(Number(state.northDirection) || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = Number(point.x) || 0;
    const z = Number(point.z) || 0;
    return {
      x: houseMap.x + cos * x - sin * z,
      z: houseMap.z + sin * x + cos * z,
      y: Number(point.y) || 0,
    };
  }

  mapPointToHouseLocal(point, state = this.environmentState) {
    const houseMap = this.getHouseMapPosition(state);
    const x = Number(point.x) - houseMap.x;
    const z = Number(point.z) - houseMap.z;
    const angle = THREE.MathUtils.degToRad(Number(state.northDirection) || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: cos * x + sin * z, z: -sin * x + cos * z };
  }

  configuredRoofHeightAtHouseLocal(x, z, state = this.environmentState) {
    const length = Math.max(0.1, Number(state.length) || 10);
    const depth = Math.max(0.1, Number(state.depth) || 7);
    const overhang = Math.max(0, Number(state.overhang) || 0);
    const wallHeight = Math.max(0.1, Number(state.wallHeight) || 3);
    const pitch = clamp(Number(state.pitch) || 0, 0, 89) * DEG;
    const slope = Math.tan(pitch);
    const halfX = length / 2 + overhang;
    const halfZ = depth / 2 + overhang;
    let localX = Number(x) || 0;
    let localZ = Number(z) || 0;

    if (Math.abs(localX) > halfX + 1e-6 || Math.abs(localZ) > halfZ + 1e-6) return null;

    if (state.roofType === 'shed') {
      return wallHeight + slope * (localZ + depth / 2);
    }

    if (state.roofType === 'hip') {
      // The hip implementation rotates its local roof 90° whenever depth is
      // greater than length. Mirror that transform before evaluating the
      // distance to the ridge/hip lines.
      let roofLength = length;
      let roofDepth = depth;
      if (depth > length) {
        [roofLength, roofDepth] = [roofDepth, roofLength];
        const rotatedX = localZ;
        const rotatedZ = -localX;
        localX = rotatedX;
        localZ = rotatedZ;
      }
      const hx = roofLength / 2 + overhang;
      const hz = roofDepth / 2 + overhang;
      const riseDistance = Math.max(0, Math.min(hz - Math.abs(localZ), hx - Math.abs(localX)));
      return wallHeight + slope * riseDistance;
    }

    // Gable roof. The configured roof ridge stays at z=0 and the overhang
    // continues along the same roof plane beyond the wall line.
    const ridgeY = wallHeight + 0.05 + slope * (depth / 2);
    return ridgeY - slope * Math.abs(localZ);
  }

  configuredRoofHeightAtMapPoint(point, state = this.environmentState) {
    const local = this.mapPointToHouseLocal(point, state);
    return this.configuredRoofHeightAtHouseLocal(local.x, local.z, state);
  }

  pointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const xi = points[i].x;
      const zi = points[i].z;
      const xj = points[j].x;
      const zj = points[j].z;
      const intersects = ((zi > z) !== (zj > z))
        && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  isHostBuilding(building, state = this.environmentState) {
    const points = (building.points || []).map((point) => this.mapPointToHouseLocal(point, state));
    if (points.length < 3) return false;
    const halfX = (Number(state.length) || 10) / 2 + 0.7;
    const halfZ = (Number(state.depth) || 7) / 2 + 0.7;
    if (this.pointInPolygon(0, 0, points)) return true;
    if (points.some((point) => Math.abs(point.x) <= halfX && Math.abs(point.z) <= halfZ)) return true;
    const corners = [
      { x: -halfX, z: -halfZ }, { x: halfX, z: -halfZ },
      { x: halfX, z: halfZ }, { x: -halfX, z: halfZ },
    ];
    if (corners.some((corner) => this.pointInPolygon(corner.x, corner.z, points))) return true;
    const centroid = this.mapPointToHouseLocal(building.centroid || { x: 0, z: 0 }, state);
    return Math.abs(centroid.x) <= halfX && Math.abs(centroid.z) <= halfZ;
  }

  applyGeographicTransform(state = this.environmentState) {
    const angle = THREE.MathUtils.degToRad(Number(state.northDirection) || 0);
    this.geographicRoot.rotation.y = angle;
    const houseMap = this.getHouseMapPosition(state);
    const offset = new THREE.Vector3(-houseMap.x, 0, -houseMap.z);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.geographicRoot.position.set(offset.x, 0, offset.z);
  }

  googleSurfaceCellPoint(index, model = this.googleSurfaceModel) {
    if (!model?.size) return null;
    const size = Number(model.size);
    const row = Math.floor(index / size);
    const column = index % size;
    const x = Number(model.minX) + (column / Math.max(1, size - 1)) * (Number(model.maxX) - Number(model.minX));
    const z = Number(model.minZ) + (row / Math.max(1, size - 1)) * (Number(model.maxZ) - Number(model.minZ));
    return { x, z, row, column };
  }

  googleSurfaceIndexAtMapPoint(x, z, model = this.googleSurfaceModel) {
    if (!model?.size) return -1;
    const minX = Number(model.minX);
    const maxX = Number(model.maxX);
    const minZ = Number(model.minZ);
    const maxZ = Number(model.maxZ);
    if (x < minX || x > maxX || z < minZ || z > maxZ) return -1;
    const size = Number(model.size);
    const column = Math.min(size - 1, Math.max(0, Math.round(((x - minX) / Math.max(1e-9, maxX - minX)) * (size - 1))));
    const row = Math.min(size - 1, Math.max(0, Math.round(((z - minZ) / Math.max(1e-9, maxZ - minZ)) * (size - 1))));
    return row * size + column;
  }

  googleSurfaceMaskAtMapPoint(x, z) {
    const index = this.googleSurfaceIndexAtMapPoint(x, z);
    return index >= 0 ? Number(this.googleSurfaceModel?.buildingMask?.[index]) || 0 : 0;
  }

  pointWithinGoogleSurface(x, z) {
    return this.googleSurfaceIndexAtMapPoint(x, z) >= 0;
  }

  googleSurfaceAbsoluteElevationAtMapPoint(x, z) {
    const model = this.googleSurfaceModel;
    const index = this.googleSurfaceIndexAtMapPoint(x, z, model);
    if (index < 0) return null;
    const raw = Number(model?.heightsCm?.[index]);
    if (!Number.isFinite(raw)) return null;
    return Number(model.referenceElevationM || 0) + raw / 100;
  }

  googleTerrainDatumOffsetM() {
    const model = this.googleSurfaceModel;
    const terrain = this.geographicData?.terrain;
    if (!model?.size || !terrain) return 0;
    const revision = `${model.revision || 0}:${terrain.centerElevationM || 0}:${terrain.size || 0}`;
    if (this.googleDatumOffsetCache?.revision === revision) return this.googleDatumOffsetCache.value;
    const differences = [];
    const stride = Math.max(1, Math.round(Number(model.size) / 45));
    for (let row = 0; row < Number(model.size); row += stride) {
      for (let column = 0; column < Number(model.size); column += stride) {
        const index = row * Number(model.size) + column;
        if (Number(model.buildingMask?.[index]) > 0) continue;
        const point = this.googleSurfaceCellPoint(index, model);
        const dsm = this.googleSurfaceAbsoluteElevationAtMapPoint(point.x, point.z);
        const ground = this.terrainAbsoluteElevation(point.x, point.z);
        if (!Number.isFinite(dsm) || !Number.isFinite(ground)) continue;
        const difference = dsm - ground;
        if (difference > -8 && difference < 12) differences.push(difference);
      }
    }
    const value = Number(percentile(differences, 0.35)) || 0;
    this.googleDatumOffsetCache = { revision, value };
    return value;
  }

  googleSurfaceHeightAboveTerrain(x, z) {
    const dsm = this.googleSurfaceAbsoluteElevationAtMapPoint(x, z);
    const ground = this.terrainAbsoluteElevation(x, z);
    if (!Number.isFinite(dsm)) return null;
    if (!Number.isFinite(ground)) {
      const index = this.googleSurfaceIndexAtMapPoint(x, z);
      const relative = Number(this.googleSurfaceModel?.heightsCm?.[index]);
      return Number.isFinite(relative) ? relative / 100 : null;
    }
    return dsm - ground - this.googleTerrainDatumOffsetM();
  }

  getGoogleMaskComponents() {
    const model = this.googleSurfaceModel;
    const mask = model?.buildingMask;
    const size = Number(model?.size) || 0;
    if (!size || !Array.isArray(mask) || mask.length !== size * size) return [];
    const revision = String(model.revision || `${size}:${model.rooftopCoveragePct || 0}`);
    if (this.googleMaskComponentsCache?.revision === revision) return this.googleMaskComponentsCache.components;
    const visited = new Uint8Array(mask.length);
    const components = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const indices = [];
      visited[start] = 1;
      while (queue.length) {
        const index = queue.pop();
        indices.push(index);
        const row = Math.floor(index / size);
        const column = index % size;
        for (const [dr, dc] of directions) {
          const rr = row + dr;
          const cc = column + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const next = rr * size + cc;
          if (!visited[next] && mask[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      if (indices.length < 2) continue;
      const points = indices.map((index) => this.googleSurfaceCellPoint(index, model)).filter(Boolean);
      const hull = convexHullXZ(points);
      if (hull.length < 3) continue;
      const boundaryLoops = rasterMaskBoundaryLoops(indices, model);
      const outline = boundaryLoops[0]?.length >= 3 ? boundaryLoops[0] : hull;
      const centroid = points.reduce((acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }), { x: 0, z: 0 });
      centroid.x /= points.length;
      centroid.z /= points.length;
      components.push({ indices, hull, outline, boundaryLoops, centroid, cellCount: indices.length });
    }
    components.sort((a, b) => b.cellCount - a.cellCount);
    this.googleMaskComponentsCache = { revision, components };
    return components;
  }

  googleRefinedBuildingHeight(building, state = this.environmentState) {
    const fallback = clamp(Number(building?.heightM) || 6.4, 2.2, 80);
    if (!this.googleSurfaceModel || state.googleSolarDsmEnabled === false || building?.googleDerived) return fallback;
    const points = building?.points || [];
    if (points.length < 3) return fallback;
    const samples = [building.centroid, ...points].filter(Boolean);
    if (!samples.some((point) => this.pointWithinGoogleSurface(Number(point.x), Number(point.z)))) return fallback;
    const model = this.googleSurfaceModel;
    const cacheKey = `${model.revision || 0}:${building.id || building.osmId || `${Number(building.centroid?.x).toFixed(1)}:${Number(building.centroid?.z).toFixed(1)}`}`;
    if (this.googleBuildingHeightCache?.has(cacheKey)) return this.googleBuildingHeightCache.get(cacheKey);
    const residuals = [];
    for (let index = 0; index < Number(model.size) * Number(model.size); index += 1) {
      if (!Number(model.buildingMask?.[index])) continue;
      const point = this.googleSurfaceCellPoint(index, model);
      if (!point || !this.pointInPolygon(point.x, point.z, points)) continue;
      const height = this.googleSurfaceHeightAboveTerrain(point.x, point.z);
      if (Number.isFinite(height) && height > 1 && height < 60) residuals.push(height);
    }
    if (residuals.length < 2) {
      for (const point of [building.centroid, ...points]) {
        if (!point) continue;
        const height = this.googleSurfaceHeightAboveTerrain(Number(point.x), Number(point.z));
        if (Number.isFinite(height) && height > 1 && height < 60) residuals.push(height);
      }
    }
    const refined = percentile(residuals, 0.6);
    const result = Number.isFinite(refined) && refined >= 2 ? clamp(refined, 2.2, 45) : fallback;
    this.googleBuildingHeightCache?.set(cacheKey, result);
    return result;
  }

  googleComponentOverlapsOsmBuilding(component, buildings = []) {
    if (!component?.centroid) return false;
    for (const building of buildings || []) {
      const points = building.points || [];
      if (points.length < 3) continue;
      if (this.pointInPolygon(component.centroid.x, component.centroid.z, points)) return true;
      if (component.hull?.some((point) => this.pointInPolygon(point.x, point.z, points))) return true;
      if (points.some((point) => this.pointInPolygon(point.x, point.z, component.hull || []))) return true;
    }
    return false;
  }

  createGoogleOnlyBuildings(state = this.environmentState) {
    if (!this.googleSurfaceModel || state.googleSolarDsmEnabled === false) return [];
    const host = this.findGoogleHostComponent(state);
    const replaceHost = state.replaceHostBuilding !== false;
    const buildings = this.geographicData?.buildings || [];
    const result = [];
    for (const rawComponent of this.getGoogleMaskComponents()) {
      if (rawComponent.cellCount < 3) continue;
      const remainingIndices = replaceHost && host.size
        ? rawComponent.indices.filter((index) => !host.has(index))
        : rawComponent.indices;
      const components = remainingIndices.length === rawComponent.indices.length
        ? [rawComponent]
        : this.googleMaskSubcomponents(remainingIndices);
      for (const component of components) {
        if (component.cellCount < 3) continue;
        if (this.googleComponentOverlapsOsmBuilding(component, buildings)) continue;
        const heights = component.indices
          .map((index) => {
            const point = this.googleSurfaceCellPoint(index);
            return point ? this.googleSurfaceHeightAboveTerrain(point.x, point.z) : null;
          })
          .filter((value) => Number.isFinite(value) && value > 1 && value < 60);
        const heightM = percentile(heights, 0.6);
        if (!Number.isFinite(heightM) || heightM < 2.2) continue;
        const pseudo = {
          id: `google-mask-${component.indices[0]}`,
          points: component.hull,
          centroid: component.centroid,
          heightM: clamp(heightM, 2.2, 45),
          googleDerived: true,
        };
        const mesh = this.createBuildingMesh(pseudo, state, {
          heightOverrideM: pseudo.heightM,
          color: GOOGLE_ONLY_BUILDING_COLOR,
          googleDerived: true,
        });
        if (mesh) result.push(mesh);
        if (result.length >= 80) return result;
      }
    }
    return result;
  }

  googleVegetationClusters(state = this.environmentState) {
    const model = this.googleSurfaceModel;
    const size = Number(model?.size) || 0;
    if (!size || state.googleSolarDsmEnabled === false) return [];
    const mask = model.buildingMask || [];
    const occupied = new Uint8Array(size * size);
    const heights = new Float32Array(size * size);
    const houseMap = this.getHouseMapPosition(state);
    const houseRadius = Math.hypot(Number(state.length) || 10, Number(state.depth) || 7) * 0.55 + 2;
    const osmBuildings = this.geographicData?.buildings || [];
    for (let index = 0; index < size * size; index += 1) {
      if (mask[index]) continue;
      const point = this.googleSurfaceCellPoint(index, model);
      if (!point || Math.hypot(point.x - houseMap.x, point.z - houseMap.z) <= houseRadius) continue;
      if (osmBuildings.some((building) => this.pointInPolygon(point.x, point.z, building.points || []))) continue;
      const residual = this.googleSurfaceHeightAboveTerrain(point.x, point.z);
      if (!Number.isFinite(residual) || residual < 2.4 || residual > 32) continue;
      heights[index] = residual;
      occupied[index] = 1;
    }
    const visited = new Uint8Array(size * size);
    const clusters = [];
    for (let start = 0; start < occupied.length; start += 1) {
      if (!occupied[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      const indices = [];
      while (queue.length && indices.length < 1200) {
        const index = queue.pop();
        indices.push(index);
        const row = Math.floor(index / size);
        const column = index % size;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (!dr && !dc) continue;
            const rr = row + dr;
            const cc = column + dc;
            if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
            const next = rr * size + cc;
            if (occupied[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
          }
        }
      }
      if (indices.length < 2) continue;
      let x = 0;
      let z = 0;
      const clusterHeights = [];
      indices.forEach((index) => {
        const point = this.googleSurfaceCellPoint(index, model);
        x += point.x;
        z += point.z;
        clusterHeights.push(heights[index]);
      });
      x /= indices.length;
      z /= indices.length;
      const heightM = clamp(Number(percentile(clusterHeights, 0.72)) || 4, 2.5, 26);
      const areaM2 = indices.length * Number(model.cellSizeM || 1) ** 2;
      const radiusM = clamp(Math.sqrt(areaM2 / Math.PI) * 0.9, 0.8, 4.5);
      clusters.push({ x, z, heightM, radiusM, areaM2, cellCount: indices.length });
    }
    clusters.sort((a, b) => b.areaM2 - a.areaM2);
    return clusters.slice(0, 70);
  }

  googleLatLngBoxToMapBounds(box) {
    if (!box) return null;
    const sw = this.geoToMapPoint(box.sw || box.southwest || box.southWest || box.south_west);
    const ne = this.geoToMapPoint(box.ne || box.northeast || box.northEast || box.north_east);
    if (!sw || !ne) return null;
    return {
      minX: Math.min(sw.x, ne.x),
      maxX: Math.max(sw.x, ne.x),
      minZ: Math.min(sw.z, ne.z),
      maxZ: Math.max(sw.z, ne.z),
    };
  }

  googleBuildingInsightBoundsMap() {
    return this.googleLatLngBoxToMapBounds(this.googleBuildingInsights?.boundingBox);
  }

  googleRoofSegmentBoundsMap() {
    return (this.googleBuildingInsights?.roofSegments || [])
      .map((segment) => this.googleLatLngBoxToMapBounds(segment?.boundingBox))
      .filter(Boolean);
  }

  googleHostReferenceSeeds() {
    const insights = this.googleBuildingInsights;
    const seeds = [];
    const center = this.geoToMapPoint(insights?.center);
    if (center) seeds.push({ ...center, radiusM: 3.2, kind: 'building-center' });
    for (const segment of insights?.roofSegments || []) {
      const point = this.geoToMapPoint(segment?.center);
      if (!point) continue;
      const area = Math.max(1, Number(segment?.groundAreaMeters2) || Number(segment?.areaMeters2) || 1);
      const radiusM = clamp(Math.sqrt(area / Math.PI) * 1.65 + 1.1, 2.4, 11);
      seeds.push({ ...point, radiusM, kind: 'roof-segment' });
    }
    for (const panel of insights?.suggestedPanels || []) {
      const point = this.geoToMapPoint(panel?.center);
      if (point) seeds.push({ ...point, radiusM: 1.45, kind: 'suggested-panel' });
    }
    return seeds;
  }

  googleMaskRecordFromIndices(indices, sourceComponent = null) {
    const unique = [...new Set(indices || [])].filter((index) => Number.isInteger(index));
    if (!unique.length) return null;
    const points = unique.map((index) => this.googleSurfaceCellPoint(index)).filter(Boolean);
    if (!points.length) return null;
    const hull = convexHullXZ(points);
    if (hull.length < 3) return null;
    const boundaryLoops = rasterMaskBoundaryLoops(unique, this.googleSurfaceModel);
    const outline = boundaryLoops[0]?.length >= 3 ? boundaryLoops[0] : hull;
    const centroid = points.reduce((acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }), { x: 0, z: 0 });
    centroid.x /= points.length;
    centroid.z /= points.length;
    return {
      indices: unique,
      hull,
      outline,
      boundaryLoops,
      centroid,
      cellCount: unique.length,
      sourceComponent,
    };
  }

  googleMaskSubcomponents(indices) {
    const model = this.googleSurfaceModel;
    const size = Number(model?.size) || 0;
    if (!size) return [];
    const allowed = new Set(indices || []);
    if (!allowed.size) return [];
    const visited = new Set();
    const results = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const start of allowed) {
      if (visited.has(start)) continue;
      const queue = [start];
      const cells = [];
      visited.add(start);
      while (queue.length) {
        const index = queue.pop();
        cells.push(index);
        const row = Math.floor(index / size);
        const column = index % size;
        for (const [dr, dc] of directions) {
          const rr = row + dr;
          const cc = column + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const next = rr * size + cc;
          if (allowed.has(next) && !visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      const record = this.googleMaskRecordFromIndices(cells);
      if (record) results.push(record);
    }
    results.sort((a, b) => b.cellCount - a.cellCount);
    return results;
  }

  refineGoogleHostComponent(component, state = this.environmentState) {
    if (!component?.indices?.length) return null;
    const cellArea = Math.max(0.2, Number(this.googleSurfaceModel?.cellSizeM) || 1) ** 2;
    const expectedAreaM2 = Math.max(
      0,
      Number(this.googleBuildingInsights?.roofGroundAreaMeters2)
        || Number(this.googleBuildingInsights?.roofAreaMeters2)
        || 0,
    );
    const bounds = this.googleBuildingInsightBoundsMap();
    const seeds = this.googleHostReferenceSeeds();
    const googleCenter = this.geoToMapPoint(this.googleBuildingInsights?.center);
    const houseMap = this.getHouseMapPosition(state);
    const boundsPaddingM = Math.max(0.8, Number(this.googleSurfaceModel?.cellSizeM) || 1);

    let filtered = component.indices.filter((index) => {
      const point = this.googleSurfaceCellPoint(index);
      if (!point) return false;
      if (!bounds) return true;
      return point.x >= bounds.minX - boundsPaddingM
        && point.x <= bounds.maxX + boundsPaddingM
        && point.z >= bounds.minZ - boundsPaddingM
        && point.z <= bounds.maxZ + boundsPaddingM;
    });

    // The Google mask is only a rooftop/not-rooftop raster for the whole requested
    // area. Building Insights additionally gives a box for each roof segment of
    // the one building it identified, so use the union of those boxes to isolate
    // the target roof before connected-component heuristics.
    const segmentBounds = this.googleRoofSegmentBoundsMap();
    if (segmentBounds.length) {
      const segmentPaddingM = Math.max(0.45, Number(this.googleSurfaceModel?.cellSizeM) || 1) * 0.7;
      const segmentFiltered = filtered.filter((index) => {
        const point = this.googleSurfaceCellPoint(index);
        if (!point) return false;
        return segmentBounds.some((box) => point.x >= box.minX - segmentPaddingM
          && point.x <= box.maxX + segmentPaddingM
          && point.z >= box.minZ - segmentPaddingM
          && point.z <= box.maxZ + segmentPaddingM);
      });
      const segmentAreaM2 = segmentFiltered.length * cellArea;
      const minimumAreaM2 = expectedAreaM2 > 0 ? expectedAreaM2 * 0.45 : cellArea * 5;
      const maximumAreaM2 = expectedAreaM2 > 0 ? expectedAreaM2 * 1.45 : Infinity;
      if (segmentAreaM2 >= minimumAreaM2 && segmentAreaM2 <= maximumAreaM2) filtered = segmentFiltered;
    }

    // A building mask can connect adjacent roofs through a one-cell bridge. When
    // Building Insights has roof-segment centers, keep cells that are plausibly
    // associated with those target-building segments rather than accepting the
    // entire connected mask blob.
    const filteredAreaM2 = filtered.length * cellArea;
    const needsSeedTrim = seeds.length > 1 && (
      !bounds
      || (expectedAreaM2 > 0 && filteredAreaM2 > expectedAreaM2 * 1.55)
      || filtered.length > component.indices.length * 0.88
    );
    if (needsSeedTrim) {
      const seeded = filtered.filter((index) => {
        const point = this.googleSurfaceCellPoint(index);
        if (!point) return false;
        return seeds.some((seed) => Math.hypot(point.x - seed.x, point.z - seed.z) <= seed.radiusM);
      });
      const minimumUsefulCells = Math.max(4, expectedAreaM2 > 0 ? Math.floor(expectedAreaM2 / cellArea * 0.22) : 4);
      if (seeded.length >= minimumUsefulCells) filtered = seeded;
    }

    // As a final guard against a very large joined block, constrain the candidate
    // around the Building Insights center using the reported ground roof area.
    if (googleCenter && expectedAreaM2 > 0 && filtered.length * cellArea > expectedAreaM2 * 1.8) {
      const centerRadiusM = clamp(Math.sqrt(expectedAreaM2 / Math.PI) * 1.7 + 1.5, 4.5, 22);
      const centered = filtered.filter((index) => {
        const point = this.googleSurfaceCellPoint(index);
        return point && Math.hypot(point.x - googleCenter.x, point.z - googleCenter.z) <= centerRadiusM;
      });
      if (centered.length >= Math.max(4, Math.floor(expectedAreaM2 / cellArea * 0.2))) filtered = centered;
    }

    const pieces = this.googleMaskSubcomponents(filtered);
    if (!pieces.length) return component;

    let bestPiece = null;
    let bestScore = -Infinity;
    for (const piece of pieces) {
      const googleDistance = googleCenter
        ? Math.hypot(piece.centroid.x - googleCenter.x, piece.centroid.z - googleCenter.z)
        : Infinity;
      const houseDistance = Math.hypot(piece.centroid.x - houseMap.x, piece.centroid.z - houseMap.z);
      const pieceAreaM2 = piece.cellCount * cellArea;
      const areaFit = expectedAreaM2 > 0
        ? Math.min(pieceAreaM2 / expectedAreaM2, expectedAreaM2 / Math.max(0.1, pieceAreaM2))
        : 0.5;
      let score = areaFit * 260 + Math.max(0, 150 - houseDistance * 9);
      if (googleCenter) {
        score += this.pointInPolygon(googleCenter.x, googleCenter.z, piece.hull)
          ? 500
          : Math.max(0, 260 - googleDistance * 28);
      }
      if (score > bestScore) {
        bestScore = score;
        bestPiece = piece;
      }
    }
    if (!bestPiece) return component;
    bestPiece.sourceComponent = component;
    return bestPiece;
  }

  findGoogleHostComponent(state = this.environmentState) {
    const components = this.getGoogleMaskComponents();
    if (!components.length) return new Set();

    const houseMap = this.getHouseMapPosition(state);
    const halfX = (Number(state.length) || 10) / 2 + 0.7;
    const halfZ = (Number(state.depth) || 7) / 2 + 0.7;
    const googleCenter = this.geoToMapPoint(this.googleBuildingInsights?.center);
    const expectedAreaM2 = Math.max(
      0,
      Number(this.googleBuildingInsights?.roofGroundAreaMeters2)
        || Number(this.googleBuildingInsights?.roofAreaMeters2)
        || 0,
    );
    const cellArea = Math.max(0.2, Number(this.googleSurfaceModel?.cellSizeM) || 1) ** 2;
    let best = null;
    let bestScore = -Infinity;

    for (const rawComponent of components) {
      const component = this.refineGoogleHostComponent(rawComponent, state) || rawComponent;
      let houseOverlapCells = 0;
      for (const index of component.indices) {
        const point = this.googleSurfaceCellPoint(index);
        if (!point) continue;
        const local = this.mapPointToHouseLocal(point, state);
        if (Math.abs(local.x) <= halfX && Math.abs(local.z) <= halfZ) houseOverlapCells += 1;
      }
      const overlapAreaM2 = houseOverlapCells * cellArea;
      const componentAreaM2 = component.indices.length * cellArea;
      const houseAreaM2 = Math.max(1, (halfX * 2) * (halfZ * 2));
      const unionAreaM2 = Math.max(1, componentAreaM2 + houseAreaM2 - overlapAreaM2);
      const iou = clamp(overlapAreaM2 / unionAreaM2, 0, 1);
      const houseDistance = Math.hypot(component.centroid.x - houseMap.x, component.centroid.z - houseMap.z);
      const googleDistance = googleCenter
        ? Math.hypot(component.centroid.x - googleCenter.x, component.centroid.z - googleCenter.z)
        : Infinity;
      const googleInside = googleCenter ? this.pointInPolygon(googleCenter.x, googleCenter.z, component.hull) : false;
      const areaFit = expectedAreaM2 > 0
        ? Math.min(componentAreaM2 / expectedAreaM2, expectedAreaM2 / Math.max(0.1, componentAreaM2))
        : 0.5;

      // Overlap and reported Google building size are the primary signals. The
      // Building Insights center is useful, but no longer gets enough weight to
      // make a very large connected city-block mask win by itself.
      let score = iou * 720 + areaFit * 300 + Math.max(0, 150 - houseDistance * 9);
      if (houseOverlapCells) score += 200;
      if (googleCenter) score += googleInside ? 380 : Math.max(0, 240 - googleDistance * 30);
      if (score > bestScore) {
        bestScore = score;
        best = { component, houseOverlapCells, houseDistance, googleDistance, googleInside, areaFit };
      }
    }

    if (!best) return new Set();
    const acceptanceDistance = Math.max(12, Math.hypot(halfX, halfZ) + 5);
    const accepted = best.houseOverlapCells > 0
      || (best.houseDistance <= acceptanceDistance && best.areaFit >= 0.2)
      || (Number.isFinite(best.googleDistance) && best.googleDistance <= 8 && best.areaFit >= 0.18);
    return accepted ? new Set(best.component.indices) : new Set();
  }

  getGoogleHostComponentRecord(state = this.environmentState) {
    const host = this.findGoogleHostComponent(state);
    if (!host.size) return null;
    const raw = this.getGoogleMaskComponents().find((component) => component.indices.some((index) => host.has(index))) || null;
    return this.googleMaskRecordFromIndices([...host], raw);
  }

  getGoogleReferenceMetrics(state = this.environmentState) {
    const insights = this.googleBuildingInsights;
    const component = this.getGoogleHostComponentRecord(state);
    const googleCenter = this.geoToMapPoint(insights?.center);
    const houseMap = this.getHouseMapPosition(state);
    const mainRoof = (Array.isArray(insights?.roofSegments) ? insights.roofSegments : [])
      .reduce((best, segment) => !best || Number(segment.areaMeters2) > Number(best.areaMeters2) ? segment : best, null);
    const centerDistanceM = googleCenter
      ? Math.hypot(googleCenter.x - houseMap.x, googleCenter.z - houseMap.z)
      : null;

    if (!component) {
      return {
        hostDetected: false,
        matchScore: 0,
        matchLabel: 'No rooftop match',
        centerDistanceM,
        mainPitchDeg: mainRoof && Number.isFinite(Number(mainRoof.pitchDegrees)) ? Number(mainRoof.pitchDegrees) : null,
        mainAzimuthDeg: mainRoof && Number.isFinite(Number(mainRoof.azimuthDegrees)) ? Number(mainRoof.azimuthDegrees) : null,
        componentAreaM2: null,
      };
    }

    const halfX = Math.max(0.5, Number(state.length) / 2 || 5);
    const halfZ = Math.max(0.5, Number(state.depth) / 2 || 3.5);
    const cellArea = Math.max(0.2, Number(this.googleSurfaceModel?.cellSizeM) || 1) ** 2;
    let overlapCells = 0;
    for (const index of component.indices) {
      const point = this.googleSurfaceCellPoint(index);
      if (!point) continue;
      const local = this.mapPointToHouseLocal(point, state);
      if (Math.abs(local.x) <= halfX && Math.abs(local.z) <= halfZ) overlapCells += 1;
    }
    const overlapAreaM2 = overlapCells * cellArea;
    const componentAreaM2 = component.indices.length * cellArea;
    const houseAreaM2 = Math.max(1, Number(state.length) * Number(state.depth));
    const union = Math.max(1, componentAreaM2 + houseAreaM2 - overlapAreaM2);
    const iou = clamp(overlapAreaM2 / union, 0, 1);
    const componentGoogleDistance = googleCenter
      ? Math.hypot(component.centroid.x - googleCenter.x, component.centroid.z - googleCenter.z)
      : null;
    const proximity = Number.isFinite(centerDistanceM) ? Math.exp(-centerDistanceM / 8) : 0.5;
    const googleComponentFit = Number.isFinite(componentGoogleDistance) ? Math.exp(-componentGoogleDistance / 4) : 0.5;
    const score = Math.round(clamp((iou * 0.65 + proximity * 0.2 + googleComponentFit * 0.15) * 100, 0, 100));
    const matchLabel = score >= 70 ? 'Strong match' : score >= 45 ? 'Likely match' : score >= 25 ? 'Loose match' : 'Weak match';

    return {
      hostDetected: true,
      matchScore: score,
      matchLabel,
      centerDistanceM,
      componentAreaM2,
      overlapAreaM2,
      mainPitchDeg: mainRoof && Number.isFinite(Number(mainRoof.pitchDegrees)) ? Number(mainRoof.pitchDegrees) : null,
      mainAzimuthDeg: mainRoof && Number.isFinite(Number(mainRoof.azimuthDegrees)) ? Number(mainRoof.azimuthDegrees) : null,
    };
  }

  getGoogleRoofMatchSuggestion(state = this.environmentState) {
    const insights = this.googleBuildingInsights;
    if (!insights) return { available: false };

    const segments = Array.isArray(insights.roofSegments) ? insights.roofSegments : [];
    const mainRoof = segments.reduce((best, segment) => (
      !best || Number(segment.areaMeters2) > Number(best.areaMeters2) ? segment : best
    ), null);
    const rawPitch = Number(mainRoof?.pitchDegrees);
    const rawBearing = Number(mainRoof?.azimuthDegrees);
    if (!Number.isFinite(rawPitch) || !Number.isFinite(rawBearing)) return { available: false };

    const normalizeBearing = (value) => ((Number(value) % 360) + 360) % 360;
    const bearingDeg = normalizeBearing(rawBearing);
    const pitchDeg = clamp(rawPitch, 5, 55);
    const googleCenter = this.geoToMapPoint(insights.center);
    const component = this.getGoogleHostComponentRecord(state);
    const componentCenter = component?.centroid || null;
    const targetCenter = googleCenter || componentCenter;
    const houseMap = this.getHouseMapPosition(state);
    const suggestedEastM = targetCenter ? Number(targetCenter.x) : null;
    const suggestedNorthM = targetCenter ? -Number(targetCenter.z) : null;
    const positionDistanceM = targetCenter
      ? Math.hypot(Number(targetCenter.x) - houseMap.x, Number(targetCenter.z) - houseMap.z)
      : null;

    let footprint = component?.outline?.length >= 3
      ? component.outline
      : component?.hull?.length >= 3
        ? component.hull
        : null;
    let dimensionSource = footprint ? 'Google rooftop mask' : '';

    if (!footprint) {
      const bounds = this.googleBuildingInsightBoundsMap();
      if (bounds) {
        footprint = [
          { x: bounds.minX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.maxZ },
          { x: bounds.minX, z: bounds.maxZ },
        ];
        dimensionSource = 'Building Insights bounds';
      }
    }

    let suggestedLengthM = null;
    let suggestedDepthM = null;
    let roofOuterLengthM = null;
    let roofOuterDepthM = null;
    if (footprint?.length >= 3 && targetCenter) {
      const angle = bearingDeg * DEG;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const point of footprint) {
        const dx = Number(point.x) - Number(targetCenter.x);
        const dz = Number(point.z) - Number(targetCenter.z);
        const localX = cos * dx + sin * dz;
        const localZ = -sin * dx + cos * dz;
        minX = Math.min(minX, localX);
        maxX = Math.max(maxX, localX);
        minZ = Math.min(minZ, localZ);
        maxZ = Math.max(maxZ, localZ);
      }
      if ([minX, maxX, minZ, maxZ].every(Number.isFinite)) {
        roofOuterLengthM = Math.max(0, maxX - minX);
        roofOuterDepthM = Math.max(0, maxZ - minZ);
        const overhang = Math.max(0, Number(state.overhang) || 0);
        // The Google mask follows the visible rooftop. Our length/depth controls
        // describe the building below the roof, so remove the configured overhang
        // on both sides before mapping the detected roof span back to those inputs.
        suggestedLengthM = clamp(roofOuterLengthM - overhang * 2, 5, 20);
        suggestedDepthM = clamp(roofOuterDepthM - overhang * 2, 4, 14);
      }
    }

    return {
      available: true,
      bearingDeg,
      pitchDeg,
      suggestedLengthM: Number.isFinite(suggestedLengthM) ? suggestedLengthM : null,
      suggestedDepthM: Number.isFinite(suggestedDepthM) ? suggestedDepthM : null,
      suggestedEastM: Number.isFinite(suggestedEastM) ? suggestedEastM : null,
      suggestedNorthM: Number.isFinite(suggestedNorthM) ? suggestedNorthM : null,
      positionDistanceM: Number.isFinite(positionDistanceM) ? positionDistanceM : null,
      roofOuterLengthM: Number.isFinite(roofOuterLengthM) ? roofOuterLengthM : null,
      roofOuterDepthM: Number.isFinite(roofOuterDepthM) ? roofOuterDepthM : null,
      dimensionSource,
      mainSegmentIndex: Number(mainRoof?.index) || 0,
      mainSegmentAreaM2: Number(mainRoof?.areaMeters2) || 0,
    };
  }

  createGoogleReferenceBuilding(state = this.environmentState) {
    if (!this.googleSurfaceModel || !this.googleBuildingInsights || state.googleSolarReferenceBuildingVisible === false) return [];
    const host = this.findGoogleHostComponent(state);
    if (!host.size) return [];

    const cellSize = Math.max(0.4, Number(this.googleSurfaceModel.cellSizeM) || 1);
    const half = cellSize * 0.48;
    const positions = [];
    const indices = [];
    const roofHeights = [];
    let vertexOffset = 0;

    for (const index of host) {
      const point = this.googleSurfaceCellPoint(index);
      if (!point) continue;
      const corners = [
        [point.x - half, point.z - half],
        [point.x + half, point.z - half],
        [point.x + half, point.z + half],
        [point.x - half, point.z + half],
      ];
      const cornerHeights = corners.map(([x, z]) => {
        const residual = this.googleSurfaceHeightAboveTerrain(x, z);
        const safeResidual = Number.isFinite(residual) ? clamp(residual, 0.15, 45) : 3;
        roofHeights.push(safeResidual);
        return -0.17 + this.terrainRelativeHeight(x, z, state) + safeResidual + 0.035;
      });
      corners.forEach(([x, z], cornerIndex) => positions.push(x, cornerHeights[cornerIndex], z));
      indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 1, vertexOffset, vertexOffset + 3, vertexOffset + 2);
      vertexOffset += 4;
    }

    if (!indices.length) return [];
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roofGeometry.setIndex(indices);
    roofGeometry.computeVertexNormals();
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: GOOGLE_REFERENCE_COLOR,
      transparent: true,
      opacity: 0.24,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
    roofMesh.name = 'google-reference-roof';
    roofMesh.castShadow = false;
    roofMesh.receiveShadow = false;
    roofMesh.userData.environmentLayer = 'google-reference';
    roofMesh.userData.googleReferenceBuilding = true;
    roofMesh.renderOrder = 8;

    const results = [roofMesh];
    const component = this.getGoogleHostComponentRecord(state);
    const referenceFootprint = component?.outline || component?.hull || [];
    if (referenceFootprint.length >= 3) {
      const eaveResidual = clamp(Number(percentile(roofHeights, 0.28)) || 3, 1.8, 30);
      const wallPositions = [];
      const wallIndices = [];
      let wallOffset = 0;
      for (let index = 0; index < referenceFootprint.length; index += 1) {
        const a = referenceFootprint[index];
        const b = referenceFootprint[(index + 1) % referenceFootprint.length];
        const ay0 = -0.17 + this.terrainRelativeHeight(a.x, a.z, state);
        const by0 = -0.17 + this.terrainRelativeHeight(b.x, b.z, state);
        wallPositions.push(
          a.x, ay0, a.z,
          b.x, by0, b.z,
          b.x, by0 + eaveResidual, b.z,
          a.x, ay0 + eaveResidual, a.z,
        );
        wallIndices.push(wallOffset, wallOffset + 1, wallOffset + 2, wallOffset, wallOffset + 2, wallOffset + 3);
        wallOffset += 4;
      }
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
      wallGeometry.setIndex(wallIndices);
      wallGeometry.computeVertexNormals();
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: GOOGLE_REFERENCE_COLOR,
        transparent: true,
        opacity: 0.11,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const walls = new THREE.Mesh(wallGeometry, wallMaterial);
      walls.name = 'google-reference-walls';
      walls.castShadow = false;
      walls.receiveShadow = false;
      walls.userData.environmentLayer = 'google-reference';
      walls.userData.googleReferenceBuilding = true;
      walls.renderOrder = 7;
      results.push(walls);
    }

    for (const segment of (this.googleBuildingInsights.roofSegments || []).slice(0, 12)) {
      const center = this.geoToMapPoint(segment.center);
      if (!center || !this.pointWithinGoogleSurface(center.x, center.z)) continue;
      const residual = this.googleSurfaceHeightAboveTerrain(center.x, center.z);
      if (!Number.isFinite(residual)) continue;
      const y = -0.12 + this.terrainRelativeHeight(center.x, center.z, state) + residual + 0.22;
      const azimuth = Number(segment.azimuthDegrees) || 0;
      const direction = new THREE.Vector3(Math.sin(azimuth * DEG), 0, -Math.cos(azimuth * DEG)).normalize();
      const length = clamp(Math.sqrt(Math.max(1, Number(segment.areaMeters2) || 1)) * 0.28, 1.1, 4.2);
      const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(center.x, y, center.z), length, GOOGLE_REFERENCE_SEGMENT_COLOR, Math.min(0.55, length * 0.2), Math.min(0.28, length * 0.1));
      arrow.userData.environmentLayer = 'google-reference';
      arrow.userData.googleRoofSegment = Number(segment.index) || 0;
      results.push(arrow);
    }
    return results;
  }

  getGoogleRecommendedPanelConfig(state = this.environmentState) {
    const insights = this.googleBuildingInsights;
    const configs = Array.isArray(insights?.panelConfigs) ? insights.panelConfigs.filter((config) => Number(config?.panelsCount) > 0) : [];
    if (!configs.length) return insights?.closestPanelConfig || null;
    const explicit = Math.max(0, Math.round(Number(state.googleSolarRecommendedConfigPanels) || 0));
    const target = explicit || Math.max(1, Math.round(Number(state.panelCount ?? state.effectivePanelCount) || 1));
    return configs.reduce((best, config) => {
      if (!best) return config;
      const delta = Math.abs(Number(config.panelsCount) - target);
      const bestDelta = Math.abs(Number(best.panelsCount) - target);
      return delta < bestDelta || (delta === bestDelta && Number(config.panelsCount) < Number(best.panelsCount)) ? config : best;
    }, null);
  }

  getGoogleRecommendedLayoutInfo(state = this.environmentState) {
    const insights = this.googleBuildingInsights;
    const config = this.getGoogleRecommendedPanelConfig(state);
    const panelCount = Math.max(0, Math.round(Number(config?.panelsCount) || 0));
    const availablePanels = Array.isArray(insights?.suggestedPanels) ? insights.suggestedPanels.length : 0;
    return {
      available: Boolean(config && panelCount > 0 && availablePanels >= panelCount),
      panelCount,
      yearlyEnergyDcKwh: Number(config?.yearlyEnergyDcKwh) || 0,
      panelCapacityWatts: Number(insights?.panelCapacityWatts) || 0,
      panelHeightMeters: Number(insights?.panelHeightMeters) || 0,
      panelWidthMeters: Number(insights?.panelWidthMeters) || 0,
      autoSelected: !(Number(state.googleSolarRecommendedConfigPanels) > 0),
      availablePanels,
    };
  }

  createGoogleRecommendedLayout(state = this.environmentState) {
    const insights = this.googleBuildingInsights;
    const info = this.getGoogleRecommendedLayoutInfo(state);
    if (!insights || !info.available || !this.geographicData) return [];

    const panels = (insights.suggestedPanels || []).slice(0, info.panelCount);
    const segments = Array.isArray(insights.roofSegments) ? insights.roofSegments : [];
    const panelHeight = Math.max(0.25, Number(insights.panelHeightMeters) || 1.879);
    const panelWidth = Math.max(0.25, Number(insights.panelWidthMeters) || 1.045);
    const root = new THREE.Group();
    root.name = 'google-recommended-layout';
    root.userData.environmentLayer = 'google-layout';
    root.userData.googleRecommendedLayout = true;
    root.userData.googlePanelCount = info.panelCount;
    root.userData.googleYearlyEnergyDcKwh = info.yearlyEnergyDcKwh;

    const panelMaterial = new THREE.MeshBasicMaterial({
      color: GOOGLE_RECOMMENDED_PANEL_COLOR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: GOOGLE_RECOMMENDED_PANEL_COLOR,
      transparent: true,
      opacity: 0.98,
      depthTest: true,
      toneMapped: false,
    });

    for (let index = 0; index < panels.length; index += 1) {
      const panel = panels[index];
      const center = this.geoToMapPoint(panel?.center);
      if (!center) continue;
      const segment = segments.find((item) => Number(item?.index) === Number(panel?.segmentIndex)) || segments[Number(panel?.segmentIndex)] || null;
      if (!segment) continue;

      const azimuth = (Number(segment.azimuthDegrees) || 0) * DEG;
      const pitch = clamp(Number(segment.pitchDegrees) || 0, 0, 89) * DEG;
      const landscape = String(panel?.orientation || '').toUpperCase().includes('LANDSCAPE');
      const acrossM = landscape ? panelHeight : panelWidth;
      const slopeM = landscape ? panelWidth : panelHeight;

      const xAxis = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)).normalize();
      const yAxis = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(pitch),
        -Math.sin(pitch),
        -Math.cos(azimuth) * Math.cos(pitch),
      ).normalize();
      let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
      if (zAxis.y < 0) zAxis.multiplyScalar(-1);
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

      const residual = this.googleSurfaceHeightAboveTerrain(center.x, center.z);
      let referenceY;
      if (Number.isFinite(residual)) {
        referenceY = -0.12 + this.terrainRelativeHeight(center.x, center.z, state) + clamp(residual, 0.15, 45);
      } else {
        const segmentHeight = Number(segment.planeHeightAtCenterMeters);
        referenceY = -0.12 + this.terrainRelativeHeight(center.x, center.z, state) + (Number.isFinite(segmentHeight) && segmentHeight > 0 ? segmentHeight : 3.5);
      }

      // Building Insights panel centers belong to Google's real roof elevation.
      // Our configurable house intentionally has its own wall height and may be
      // taller than that reference building. In that case most reference panels
      // would sit *inside* the configured roof and only panels outside the house
      // would remain visible. For the comparison overlay, preserve Google's X/Z
      // placement and orientation but lift panels just enough to clear the current
      // configured roof wherever the two footprints overlap.
      let y = referenceY;
      const halfAcross = acrossM / 2;
      const halfSlope = slopeM / 2;
      let requiredCenterY = -Infinity;
      let configuredRoofSamples = 0;
      for (const acrossSign of [-1, 1]) {
        for (const slopeSign of [-1, 1]) {
          const corner = {
            x: center.x + xAxis.x * halfAcross * acrossSign + yAxis.x * halfSlope * slopeSign,
            z: center.z + xAxis.z * halfAcross * acrossSign + yAxis.z * halfSlope * slopeSign,
          };
          const configuredY = this.configuredRoofHeightAtMapPoint(corner, state);
          if (!Number.isFinite(configuredY)) continue;
          configuredRoofSamples += 1;
          const cornerRelativeY = yAxis.y * halfSlope * slopeSign;
          requiredCenterY = Math.max(requiredCenterY, configuredY + 0.16 - cornerRelativeY);
        }
      }
      const configuredCenterY = this.configuredRoofHeightAtMapPoint(center, state);
      if (Number.isFinite(configuredCenterY)) {
        configuredRoofSamples += 1;
        requiredCenterY = Math.max(requiredCenterY, configuredCenterY + 0.16);
      }
      if (configuredRoofSamples > 0 && Number.isFinite(requiredCenterY)) {
        // Once the Google panel overlaps the configurable roof, render it on
        // that roof rather than at the real building's absolute elevation.
        // The translucent Google reference building still preserves the real
        // DSM elevation for users who want to inspect the height difference.
        y = requiredCenterY;
      }

      const geometry = new THREE.BoxGeometry(acrossM, slopeM, 0.025);
      const mesh = new THREE.Mesh(geometry, panelMaterial);
      mesh.position.set(center.x, y, center.z).addScaledVector(zAxis, 0.11);
      mesh.userData.googleReferenceElevationY = referenceY;
      mesh.userData.googleProjectedToConfiguredRoof = y > referenceY + 0.02;
      mesh.quaternion.copy(quaternion);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 18;
      mesh.userData.environmentLayer = 'google-layout';
      mesh.userData.googleRecommendedPanel = true;
      mesh.userData.googlePanelIndex = index;
      mesh.userData.googleSegmentIndex = Number(panel.segmentIndex) || 0;
      root.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      edges.quaternion.copy(mesh.quaternion);
      edges.renderOrder = 19;
      edges.userData.environmentLayer = 'google-layout';
      edges.userData.googleRecommendedPanel = true;
      root.add(edges);
    }

    return root.children.length ? [root] : [];
  }

  googleFluxColor(value, low, high) {
    const denominator = Math.max(1e-6, high - low);
    const t = clamp((value - low) / denominator, 0, 1);
    const lowColor = new THREE.Color(GOOGLE_FLUX_LOW_COLOR);
    const midColor = new THREE.Color(GOOGLE_FLUX_MID_COLOR);
    const highColor = new THREE.Color(GOOGLE_FLUX_HIGH_COLOR);
    return t <= 0.5 ? lowColor.lerp(midColor, t * 2) : midColor.lerp(highColor, (t - 0.5) * 2);
  }

  googleFluxVertexHeight(x, z, state = this.environmentState) {
    const configuredY = this.configuredRoofHeightAtMapPoint({ x, z }, state);
    if (Number.isFinite(configuredY)) return configuredY + 0.11;
    const residual = this.googleSurfaceHeightAboveTerrain(x, z);
    if (Number.isFinite(residual)) return -0.10 + this.terrainRelativeHeight(x, z, state) + clamp(residual, 0.02, 55) + 0.09;
    return -0.03 + this.terrainRelativeHeight(x, z, state);
  }

  createGoogleFluxHeatmap(state = this.environmentState) {
    const surface = this.googleSurfaceModel;
    const info = this.getGoogleFluxHeatmapInfo(state);
    const values = info.values;
    const size = Number(surface?.size) || 0;
    if (!surface || !info.available || !values || size < 2 || values.length < size * size) {
      this.googleFluxHeatmapStats = { renderedCells: 0, hostCells: 0, nearbyCells: 0, period: info.period, stats: null };
      return [];
    }

    const mask = surface.buildingMask || [];
    const host = this.findGoogleHostComponent(state);
    const showNearby = state.googleSolarFluxNearbyRoofsVisible === true;
    const spacingX = (Number(surface.maxX) - Number(surface.minX)) / Math.max(1, size - 1);
    const spacingZ = (Number(surface.maxZ) - Number(surface.minZ)) / Math.max(1, size - 1);

    const hostCellRecords = [];
    const nearbyCellRecords = [];
    const hostFluxSamples = [];

    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size - 1; column += 1) {
        const i00 = row * size + column;
        const i10 = row * size + column + 1;
        const i01 = (row + 1) * size + column;
        const i11 = (row + 1) * size + column + 1;
        const indices = [i00, i10, i01, i11];
        const rooftopVotes = indices.reduce((sum, index) => sum + (Number(mask[index]) > 0 ? 1 : 0), 0);
        if (rooftopVotes < 2) continue;

        const cellFlux = indices.map((index) => values[index]).filter(Number.isFinite);
        if (!cellFlux.length) continue;
        const value = cellFlux.reduce((sum, item) => sum + item, 0) / cellFlux.length;
        const hostVotes = host.size ? indices.reduce((sum, index) => sum + (host.has(index) ? 1 : 0), 0) : 0;
        const record = { row, column, value };
        if (hostVotes >= 2) {
          hostCellRecords.push(record);
          hostFluxSamples.push(value);
        } else if (showNearby) {
          nearbyCellRecords.push(record);
        }
      }
    }

    const sorted = hostFluxSamples.filter(Number.isFinite).sort((a, b) => a - b);
    const percentile = (q) => {
      if (!sorted.length) return null;
      const position = clamp(q, 0, 1) * (sorted.length - 1);
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      if (lower === upper) return sorted[lower];
      const fraction = position - lower;
      return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
    };
    const sourceStats = info.stats || {};
    const low = Number(percentile(0.10) ?? sourceStats.p10 ?? sourceStats.min);
    const high = Number(percentile(0.90) ?? sourceStats.p90 ?? sourceStats.max);
    const hostStats = sorted.length ? {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p10: percentile(0.10),
      median: percentile(0.50),
      p90: percentile(0.90),
      mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    } : (info.stats || null);

    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      this.googleFluxHeatmapStats = { renderedCells: 0, hostCells: 0, nearbyCells: 0, period: info.period, stats: hostStats };
      return [];
    }

    const buildMesh = (records, opacity, name, renderOrder) => {
      if (!records.length) return null;
      const positions = [];
      const colors = [];
      const pushVertex = (x, z, color) => {
        positions.push(x, this.googleFluxVertexHeight(x, z, state), z);
        colors.push(color.r, color.g, color.b);
      };
      for (const record of records) {
        const color = this.googleFluxColor(record.value, low, high);
        const x0 = Number(surface.minX) + record.column * spacingX;
        const x1 = x0 + spacingX;
        const z0 = Number(surface.minZ) + record.row * spacingZ;
        const z1 = z0 + spacingZ;
        pushVertex(x0, z0, color); pushVertex(x1, z0, color); pushVertex(x1, z1, color);
        pushVertex(x0, z0, color); pushVertex(x1, z1, color); pushVertex(x0, z1, color);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.renderOrder = renderOrder;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.environmentLayer = 'google-flux';
      mesh.userData.googleFluxHeatmap = true;
      mesh.userData.googleFluxPeriod = info.period;
      mesh.userData.googleFluxCells = records.length;
      return mesh;
    };

    const objects = [];
    const hostMesh = buildMesh(hostCellRecords, 0.64, 'google-solar-flux-host', 16);
    if (hostMesh) objects.push(hostMesh);
    const nearbyMesh = buildMesh(nearbyCellRecords, 0.24, 'google-solar-flux-nearby', 15);
    if (nearbyMesh) objects.push(nearbyMesh);

    this.googleFluxHeatmapStats = {
      renderedCells: hostCellRecords.length + nearbyCellRecords.length,
      hostCells: hostCellRecords.length,
      nearbyCells: nearbyCellRecords.length,
      period: info.period,
      stats: hostStats,
    };
    return objects;
  }

  googleSurfaceCoversBuilding(building) {
    if (!this.googleSurfaceModel) return false;
    const points = building.points || [];
    const samples = [building.centroid, ...points.slice(0, 8)].filter(Boolean);
    if (samples.some((point) => this.googleSurfaceMaskAtMapPoint(Number(point.x), Number(point.z)) > 0)) return true;
    if (points.length < 3) return false;
    for (const component of this.getGoogleMaskComponents()) {
      if (this.pointInPolygon(component.centroid.x, component.centroid.z, points)) return true;
      if (component.hull?.some((point) => this.pointInPolygon(point.x, point.z, points))) return true;
      if (building.centroid && this.pointInPolygon(Number(building.centroid.x), Number(building.centroid.z), component.hull || [])) return true;
    }
    return false;
  }

  createGoogleHostOutline(hostComponent, state = this.environmentState) {
    const model = this.googleSurfaceModel;
    const size = Number(model?.size) || 0;
    if (!size || !hostComponent?.size) return null;
    const record = this.googleMaskRecordFromIndices([...hostComponent]);
    const footprint = record?.outline || record?.hull || [];
    if (footprint.length < 3) return null;
    const linePoints = footprint.map((point) => new THREE.Vector3(
      point.x,
      -0.115 + this.terrainRelativeHeight(point.x, point.z, state),
      point.z,
    ));
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({ color: GOOGLE_DSM_HOST_COLOR, transparent: true, opacity: 0.96 });
    const line = new THREE.LineLoop(geometry, material);
    line.userData.environmentLayer = 'google-mask';
    line.userData.googleHostReference = true;
    line.renderOrder = 7;
    return line;
  }

  createGoogleMaskOutlines(state = this.environmentState) {
    if (!this.googleSurfaceModel || state.googleSolarBuildingMaskVisible === false) return [];
    const host = this.findGoogleHostComponent(state);
    this.googleHostComponent = host;
    const results = [];

    // Always keep the full connected Google rooftop component as faint context.
    // The tighter host selection is drawn separately in blue, so a joined garage
    // or neighboring roof no longer looks like it was selected as the configured house.
    for (const component of this.getGoogleMaskComponents()) {
      if (component.cellCount < 2) continue;
      const linePoints = (component.outline || component.hull).map((point) => new THREE.Vector3(
        point.x,
        -0.115 + this.terrainRelativeHeight(point.x, point.z, state),
        point.z,
      ));
      if (linePoints.length < 3) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const material = new THREE.LineBasicMaterial({
        color: GOOGLE_MASK_COLOR,
        transparent: true,
        opacity: 0.32,
        depthTest: true,
      });
      const line = new THREE.LineLoop(geometry, material);
      line.userData.environmentLayer = 'google-mask';
      line.userData.googleHostReference = false;
      line.renderOrder = 5;
      results.push(line);
      if (results.length >= 120) break;
    }

    const hostOutline = this.createGoogleHostOutline(host, state);
    if (hostOutline) results.push(hostOutline);
    return results;
  }

  createGoogleCanopies(state = this.environmentState, providedClusters = null) {
    const clusters = Array.isArray(providedClusters) ? providedClusters : this.googleVegetationClusters(state);
    if (!clusters.length) return [];
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: GOOGLE_CANOPY_COLOR,
      roughness: 1,
      metalness: 0,
      flatShading: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, clusters.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    clusters.forEach((cluster, index) => {
      const baseY = -0.18 + this.terrainRelativeHeight(cluster.x, cluster.z, state);
      const verticalRadius = clamp(cluster.heightM * 0.33, 1.1, 6.5);
      position.set(cluster.x, baseY + cluster.heightM * 0.62, cluster.z);
      scale.set(cluster.radiusM, verticalRadius, cluster.radiusM);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.environmentLayer = 'trees';
    mesh.userData.googleCanopies = true;
    return [mesh];
  }

  createRawGoogleSurfaceMesh(state = this.environmentState) {
    const model = this.googleSurfaceModel;
    const size = Number(model?.size) || 0;
    const heights = model?.heightsCm;
    const mask = model?.buildingMask;
    if (!size || !Array.isArray(heights) || heights.length !== size * size) return [];
    const hostComponent = this.findGoogleHostComponent(state);
    this.googleHostComponent = hostComponent;
    const positions = [];
    const colors = [];
    const indices = [];
    const groundColor = new THREE.Color(GOOGLE_DSM_GROUND_COLOR);
    const roofColor = new THREE.Color(GOOGLE_DSM_ROOF_COLOR);
    const hostColor = new THREE.Color(GOOGLE_DSM_HOST_COLOR);
    const showMask = state.googleSolarBuildingMaskVisible !== false;
    const replaceHost = state.replaceHostBuilding !== false;

    for (let index = 0; index < heights.length; index += 1) {
      const point = this.googleSurfaceCellPoint(index, model);
      if (!point) continue;
      const residual = this.googleSurfaceHeightAboveTerrain(point.x, point.z);
      let height = Number.isFinite(residual) ? residual : 0;
      const isHost = hostComponent.has(index);
      if (replaceHost && isHost) height = 0;
      positions.push(point.x, -0.165 + this.terrainRelativeHeight(point.x, point.z, state) + height, point.z);
      const color = showMask && isHost ? hostColor : showMask && Number(mask?.[index]) > 0 ? roofColor : groundColor;
      colors.push(color.r, color.g, color.b);
    }
    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size - 1; column += 1) {
        const a = row * size + column;
        const b = a + 1;
        const c = a + size;
        const d = c + 1;
        if ([heights[a], heights[b], heights[c], heights[d]].some((value) => value === null || value === undefined)) continue;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'google-dsm-raw-debug';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.environmentLayer = 'google-dsm-debug';
    mesh.userData.googleSurface = true;
    mesh.renderOrder = 2;
    return [mesh];
  }

  createTerrainMesh(state) {
    const terrain = this.geographicData?.terrain;
    if (!terrain) return null;
    const size = terrain.size;
    const radius = terrain.radiusM;
    const positions = [];
    const indices = [];
    for (let row = 0; row < size; row += 1) {
      const z = -radius + (row / (size - 1)) * radius * 2;
      for (let column = 0; column < size; column += 1) {
        const x = -radius + (column / (size - 1)) * radius * 2;
        positions.push(x, -0.205 + this.terrainRelativeHeight(x, z, state), z);
      }
    }
    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size - 1; column += 1) {
        const a = row * size + column;
        const b = a + 1;
        const c = a + size;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xb8c1ad,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'geographic-terrain';
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.environmentLayer = 'terrain';
    return mesh;
  }

  createBuildingMesh(building, state, options = {}) {
    const points = building.points || [];
    if (points.length < 3) return null;
    const baseY = -0.19 + this.terrainRelativeHeight(building.centroid.x, building.centroid.z, state);
    const googleRefined = Boolean(options.googleDerived)
      || (state.googleSolarDsmEnabled !== false && Boolean(this.googleSurfaceModel) && this.googleSurfaceCoversBuilding(building));
    const height = clamp(
      Number(options.heightOverrideM)
        || (googleRefined ? this.googleRefinedBuildingHeight(building, state) : Number(building.heightM))
        || 6.4,
      2.2,
      80,
    );
    const contour = points.map((point) => new THREE.Vector2(point.x, point.z));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    const positions = [];
    const indices = [];

    points.forEach((point) => positions.push(point.x, baseY, point.z));
    points.forEach((point) => positions.push(point.x, baseY + height, point.z));
    const topOffset = points.length;
    triangles.forEach((triangle) => {
      indices.push(topOffset + triangle[0], topOffset + triangle[1], topOffset + triangle[2]);
    });
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      indices.push(index, next, topOffset + index, next, topOffset + next, topOffset + index);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: Number(options.color) || (googleRefined ? GOOGLE_REFINED_BUILDING_COLOR : BUILDING_BASE_COLOR),
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.environmentLayer = 'buildings';
    mesh.userData.osmId = building.id;
    mesh.userData.defaultBuildingColor = Number(options.color) || (googleRefined ? GOOGLE_REFINED_BUILDING_COLOR : BUILDING_BASE_COLOR);
    mesh.userData.googleRefined = googleRefined;
    mesh.userData.googleDerived = Boolean(options.googleDerived || building.googleDerived);
    mesh.userData.heightM = height;
    return mesh;
  }

  createHostBuildingReference(building, state) {
    const points = building.points || [];
    if (points.length < 3) return null;
    const linePoints = points.map((point) => new THREE.Vector3(
      point.x,
      -0.12 + this.terrainRelativeHeight(point.x, point.z, state),
      point.z,
    ));
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0x1687c9,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    const line = new THREE.LineLoop(geometry, material);
    line.userData.environmentLayer = 'buildings';
    line.userData.hostBuildingReference = true;
    line.userData.osmId = building.id;
    line.renderOrder = 4;
    return line;
  }

  createRoadMesh(roads, state) {
    const positions = [];
    const indices = [];
    for (const road of roads || []) {
      const halfWidth = clamp(Number(road.widthM) || 4, 1.2, 9) / 2;
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const start = road.points[index];
        const end = road.points[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.2) continue;
        const nx = -dz / length * halfWidth;
        const nz = dx / length * halfWidth;
        const startY = -0.17 + this.terrainRelativeHeight(start.x, start.z, state);
        const endY = -0.17 + this.terrainRelativeHeight(end.x, end.z, state);
        const base = positions.length / 3;
        positions.push(
          start.x + nx, startY, start.z + nz,
          start.x - nx, startY, start.z - nz,
          end.x + nx, endY, end.z + nz,
          end.x - nx, endY, end.z - nz,
        );
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0x8f979d, roughness: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.environmentLayer = 'roads';
    return mesh;
  }

  createTrees(trees, state) {
    if (!(trees || []).length) return [];
    const count = trees.length;
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x745841, roughness: 1 });
    const crownGeometry = new THREE.ConeGeometry(1, 1.6, 9);
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8b64, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    trees.forEach((tree, index) => {
      const height = clamp(Number(tree.heightM) || 7.5, 2.5, 28);
      const baseY = -0.18 + this.terrainRelativeHeight(tree.x, tree.z, state);
      const trunkHeight = height * 0.38;
      position.set(tree.x, baseY + trunkHeight / 2, tree.z);
      scale.set(1, trunkHeight, 1);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);

      const crownHeight = height * 0.72;
      const crownRadius = Math.max(0.8, height * 0.17);
      position.set(tree.x, baseY + trunkHeight + crownHeight * 0.42, tree.z);
      scale.set(crownRadius, crownHeight / 1.6, crownRadius);
      matrix.compose(position, quaternion, scale);
      crowns.setMatrixAt(index, matrix);
    });
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    trunks.userData.environmentLayer = 'trees';
    crowns.userData.environmentLayer = 'trees';
    return [trunks, crowns];
  }

  getSolarPanelObservationPoints(state = this.environmentState) {
    const points = [];
    this.solarRoot.updateMatrixWorld(true);
    const worldPosition = new THREE.Vector3();
    this.solarRoot.traverse((object) => {
      const surfaceId = object.userData?.surfaceId;
      if (!surfaceId) return;
      object.getWorldPosition(worldPosition);
      const mapPoint = this.houseLocalToMapPoint(worldPosition, state);
      points.push({
        surfaceId: String(surfaceId),
        x: mapPoint.x,
        z: mapPoint.z,
        y: worldPosition.y,
      });
    });
    return points;
  }

  computeLocalBuildingShadingModel(state = this.environmentState) {
    const data = this.geographicData;
    const panels = this.getSolarPanelObservationPoints(state);
    const buildings = (data?.buildings || []).filter((building) => (
      !(state.replaceHostBuilding !== false && this.isHostBuilding(building, state))
    ));
    if (!data || !panels.length || !buildings.length) {
      return {
        revision: ++this.localBuildingShadingRevision,
        stepDeg: BUILDING_SHADE_AZIMUTH_STEP_DEG,
        panelCount: panels.length,
        buildingCount: buildings.length,
        profiles: [],
        contributorIds: [],
      };
    }

    const physicalBuildings = buildings.map((building) => ({
      id: building.id,
      points: building.points || [],
      topY: -0.19 + this.terrainPhysicalRelativeHeight(building.centroid.x, building.centroid.z, state)
        + this.googleRefinedBuildingHeight(building, state),
    })).filter((building) => building.points.length >= 3);

    const contributorIds = new Set();
    const sampleCount = Math.round(360 / BUILDING_SHADE_AZIMUTH_STEP_DEG);
    const profiles = panels.map((panel, panelIndex) => {
      const samples = new Array(sampleCount).fill(-90);
      const contributors = new Array(sampleCount).fill(null);
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const azimuthDeg = sampleIndex * BUILDING_SHADE_AZIMUTH_STEP_DEG;
        const azimuth = azimuthDeg * DEG;
        const dirX = Math.sin(azimuth);
        const dirZ = -Math.cos(azimuth);
        let highestElevation = -90;
        let highestBuildingId = null;
        for (const building of physicalBuildings) {
          if (building.topY <= panel.y - 0.05) continue;
          const distance = rayPolygonDistance(panel.x, panel.z, dirX, dirZ, building.points);
          if (!(distance !== null && distance <= Number(data.radiusM || 400) * 1.15)) continue;
          const elevationDeg = Math.atan2(building.topY - panel.y, Math.max(0.2, distance)) / DEG;
          if (elevationDeg > highestElevation) {
            highestElevation = elevationDeg;
            highestBuildingId = building.id;
          }
        }
        samples[sampleIndex] = clamp(highestElevation, -90, 89);
        contributors[sampleIndex] = highestBuildingId;
        if (highestBuildingId !== null && highestElevation > -0.833) contributorIds.add(String(highestBuildingId));
      }
      return {
        panelIndex,
        surfaceId: panel.surfaceId,
        samples,
        contributors,
      };
    });

    return {
      revision: ++this.localBuildingShadingRevision,
      stepDeg: BUILDING_SHADE_AZIMUTH_STEP_DEG,
      panelCount: panels.length,
      buildingCount: physicalBuildings.length,
      profiles,
      contributorIds: [...contributorIds],
    };
  }

  syncBuildingShadingVisuals(state = this.environmentState) {
    const enabled = state.localBuildingShadingEnabled !== false;
    const contributors = new Set((state.localBuildingShadingModel?.contributorIds || []).map(String));
    this.geographicRoot.traverse((object) => {
      if (object.userData?.environmentLayer !== 'buildings' || object.userData?.hostBuildingReference) return;
      const isContributor = enabled && contributors.has(String(object.userData?.osmId));
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        if (material.color) material.color.setHex(isContributor ? BUILDING_SHADE_COLOR : BUILDING_BASE_COLOR);
      });
      object.userData.localShadeContributor = isContributor;
    });
  }

  configureEnvironmentShadow(radiusM) {
    const requestedRadius = Math.max(0, Number(radiusM) || 0);
    const radius = clamp(requestedRadius, 0, 240);
    this.shadowContextRadius = radius;
    if (!radius) {
      const camera = this.keyLight.shadow.camera;
      camera.left = -25;
      camera.right = 25;
      camera.top = 25;
      camera.bottom = -25;
      camera.near = 0.1;
      camera.far = 80;
      camera.updateProjectionMatrix();
      this.controls.maxDistance = 55;
      return;
    }
    const span = Math.max(35, radius * 1.03);
    const camera = this.keyLight.shadow.camera;
    camera.left = -span;
    camera.right = span;
    camera.top = span;
    camera.bottom = -span;
    camera.near = 0.5;
    camera.far = Math.max(180, radius * 4.5);
    camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(55, requestedRadius * 1.55);
    this.camera.far = Math.max(this.camera.far, requestedRadius * 4.5);
    this.camera.updateProjectionMatrix();
  }

  rebuildGeographicEnvironment(state = this.environmentState) {
    this.disposeGroup(this.geographicRoot);
    const data = this.geographicData;
    this.googleHybridStats = { refinedBuildingCount: 0, googleOnlyBuildingCount: 0, canopyCount: 0, datumOffsetM: 0 };
    if (!data || state.environmentEnabled === false) {
      this.ground.visible = true;
      this.grid.visible = true;
      this.configureEnvironmentShadow(0);
      return;
    }

    const terrain = this.createTerrainMesh(state);
    if (terrain) this.geographicRoot.add(terrain);

    const googleRefinementActive = Boolean(this.googleSurfaceModel) && state.googleSolarDsmEnabled !== false;
    if (googleRefinementActive) {
      this.googleHybridStats.datumOffsetM = this.googleTerrainDatumOffsetM();
      this.googleHostComponent = this.findGoogleHostComponent(state);
    } else {
      this.googleHostComponent = null;
    }

    let refinedBuildingCount = 0;
    const googleHostIsAuthoritative = googleRefinementActive && Boolean(this.googleHostComponent?.size);
    for (const building of data.buildings || []) {
      const isHost = this.isHostBuilding(building, state);
      let mesh = null;
      if (isHost && state.replaceHostBuilding !== false) {
        // When Google has a selected host footprint, do not also draw the older
        // OSM host outline. Joined/oversized OSM polygons are a common reason the
        // user sees a second much larger "house" outline. The Google mask outline
        // is the authoritative reference in this mode; OSM remains the fallback.
        mesh = googleHostIsAuthoritative ? null : this.createHostBuildingReference(building, state);
      } else {
        mesh = this.createBuildingMesh(building, state);
      }
      if (mesh) {
        if (googleRefinementActive && !isHost && mesh.userData?.googleRefined) refinedBuildingCount += 1;
        this.geographicRoot.add(mesh);
      }
    }

    let googleOnlyBuildings = [];
    let googleCanopies = [];
    let googleCanopyClusters = [];
    if (googleRefinementActive) {
      googleOnlyBuildings = this.createGoogleOnlyBuildings(state);
      googleOnlyBuildings.forEach((mesh) => this.geographicRoot.add(mesh));
      googleCanopyClusters = this.googleVegetationClusters(state);
      googleCanopies = this.createGoogleCanopies(state, googleCanopyClusters);
      googleCanopies.forEach((mesh) => this.geographicRoot.add(mesh));
      this.createGoogleMaskOutlines(state).forEach((line) => this.geographicRoot.add(line));
      this.createGoogleReferenceBuilding(state).forEach((object) => this.geographicRoot.add(object));
      if (state.googleSolarRawDsmVisible === true) {
        this.createRawGoogleSurfaceMesh(state).forEach((mesh) => this.geographicRoot.add(mesh));
      }
    }

    if (this.googleFluxModel && googleRefinementActive) {
      this.createGoogleFluxHeatmap(state).forEach((object) => this.geographicRoot.add(object));
    } else {
      this.googleFluxHeatmapStats = { renderedCells: 0, hostCells: 0, nearbyCells: 0, period: String(state.googleSolarFluxPeriod || 'annual'), stats: null };
    }

    if (this.googleBuildingInsights) {
      this.createGoogleRecommendedLayout(state).forEach((object) => this.geographicRoot.add(object));
    }

    const roads = this.createRoadMesh(data.roads || [], state);
    if (roads) this.geographicRoot.add(roads);

    const osmTrees = googleRefinementActive
      ? (data.trees || []).filter((tree) => !this.pointWithinGoogleSurface(Number(tree.x), Number(tree.z)))
      : (data.trees || []);
    this.createTrees(osmTrees, state).forEach((mesh) => this.geographicRoot.add(mesh));

    const canopyCount = googleRefinementActive ? googleCanopyClusters.length : 0;
    this.googleHybridStats = {
      refinedBuildingCount,
      googleOnlyBuildingCount: googleOnlyBuildings.length,
      canopyCount,
      datumOffsetM: googleRefinementActive ? this.googleTerrainDatumOffsetM() : 0,
    };

    this.applyGeographicTransform(state);
    this.syncGeographicLayerVisibility(state);
    this.syncBuildingShadingVisuals(state);
    this.configureEnvironmentShadow(data.radiusM);
    this.updateLighting();
  }

  syncGeographicLayerVisibility(state = this.environmentState) {
    const enabled = state.environmentEnabled !== false && Boolean(this.geographicData);
    const googleRefinementActive = enabled && Boolean(this.googleSurfaceModel) && state.googleSolarDsmEnabled !== false;
    const flags = {
      terrain: enabled && state.terrainEnabled !== false,
      'google-dsm-debug': googleRefinementActive && state.googleSolarRawDsmVisible === true,
      'google-mask': googleRefinementActive && state.googleSolarBuildingMaskVisible !== false,
      'google-reference': googleRefinementActive && state.googleSolarReferenceBuildingVisible !== false && Boolean(this.googleBuildingInsights),
      'google-layout': enabled && state.googleSolarRecommendedLayoutVisible !== false && Boolean(this.googleBuildingInsights),
      'google-flux': googleRefinementActive && state.googleSolarFluxHeatmapVisible !== false && Boolean(this.googleFluxModel),
      buildings: enabled && state.buildingsEnabled !== false,
      roads: enabled && state.roadsEnabled !== false,
      trees: enabled && state.treesEnabled !== false,
    };
    this.geographicRoot.visible = enabled;
    this.applyGeographicTransform(state);
    const desiredShadowRadius = enabled ? Number(this.geographicData?.radiusM || 0) : 0;
    if (Math.abs(desiredShadowRadius - this.shadowContextRadius) > 0.01) this.configureEnvironmentShadow(desiredShadowRadius);
    this.geographicRoot.traverse((object) => {
      const layer = object.userData?.environmentLayer;
      if (layer && layer in flags) object.visible = flags[layer];
    });
    this.ground.visible = !flags.terrain;
    this.grid.visible = !flags.terrain;
  }

  fitEnvironment(state = this.environmentState) {
    if (!this.geographicData) return false;
    const radius = this.geographicData.radiusM || 180;
    const target = new THREE.Vector3(0, 1.5, 0);
    this.controls.target.copy(target);
    this.camera.position.set(-radius * 0.7, radius * 0.52, -radius * 0.8);
    this.camera.near = Math.max(0.1, radius / 800);
    this.camera.far = Math.max(500, radius * 5);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.controls.update();
    return true;
  }

  getGeographicMetrics(state = this.environmentState) {
    if (!this.geographicData) return { houseElevationM: null, hostBuildingCount: 0 };
    const houseMap = this.getHouseMapPosition(state);
    const houseElevationM = this.terrainAbsoluteElevation(houseMap.x, houseMap.z)
      ?? this.geographicData.terrain?.centerElevationM
      ?? null;
    const osmHostBuildingCount = (this.geographicData.buildings || [])
      .reduce((count, building) => count + (this.isHostBuilding(building, state) ? 1 : 0), 0);
    const googleHostBuildingCount = this.googleSurfaceModel && this.findGoogleHostComponent(state).size ? 1 : 0;
    const googleReference = this.getGoogleReferenceMetrics(state);
    return {
      houseElevationM,
      hostBuildingCount: googleHostBuildingCount || osmHostBuildingCount,
      googleHostBuildingCount,
      googleReferenceMatchScore: Number(googleReference.matchScore) || 0,
      googleReferenceMatchLabel: googleReference.matchLabel || '—',
      googleReferenceDistanceM: Number.isFinite(googleReference.centerDistanceM) ? googleReference.centerDistanceM : null,
      googleReferenceMainPitchDeg: Number.isFinite(googleReference.mainPitchDeg) ? googleReference.mainPitchDeg : null,
      googleReferenceMainAzimuthDeg: Number.isFinite(googleReference.mainAzimuthDeg) ? googleReference.mainAzimuthDeg : null,
      googleRecommendedLayout: this.getGoogleRecommendedLayoutInfo(state),
      googleSurfaceActive: Boolean(this.googleSurfaceModel) && state.googleSolarDsmEnabled !== false,
      googleRefinedBuildingCount: Number(this.googleHybridStats?.refinedBuildingCount) || 0,
      googleOnlyBuildingCount: Number(this.googleHybridStats?.googleOnlyBuildingCount) || 0,
      googleCanopyCount: Number(this.googleHybridStats?.canopyCount) || 0,
      googleDatumOffsetM: Number(this.googleHybridStats?.datumOffsetM) || 0,
    };
  }

  disposeGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((object) => {
        if (object.element?.remove) object.element.remove();
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose?.());
        }
      });
    }
  }

  fitCamera(state, ridgeElevation) {
    const size = Math.max(state.length, state.depth, ridgeElevation * 1.3);
    const distance = size * 1.65;
    this.camera.position.set(-distance * 0.72, distance * 0.55, -distance * 0.82);
    this.camera.near = Math.max(0.05, distance / 150);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setView(view, state, ridgeElevation) {
    const size = Math.max(state.length, state.depth, ridgeElevation);
    const target = new THREE.Vector3(0, Math.max(1.2, ridgeElevation * 0.34), 0);
    this.controls.target.copy(target);

    if (view === 'front') this.camera.position.set(0, target.y + size * 0.12, -size * 1.75);
    else if (view === 'top') this.camera.position.set(0.01, size * 2.1, 0.01);
    else this.camera.position.set(-size * 1.15, size * 0.78, -size * 1.25);
    this.camera.lookAt(target);
    this.controls.update();
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
  }

  animate() {
    this.controls.update(this.clock.getDelta());
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
