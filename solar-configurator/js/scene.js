import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoofModel } from './roofFactory.js?v=1';
import { buildSolarArray } from './solarFactory.js?v=2';
import { createDimensions } from './dimensions.js?v=1';
import { getSolarContext, getSunPathSamples } from './solarPosition.js?v=2';
import { horizonElevationAtAzimuth } from './energyModel.js?v=3';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const DEG = Math.PI / 180;

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
      pvgisUseHorizon: true,
      pvgisShowHorizon: true,
      pvgisHorizonProfile: null,
    };
    this.lastSolarContext = null;
    this.geographicData = null;
    this.shadowContextRadius = 0;
    this.sunPathKey = '';
    this.pvgisHorizonKey = '';

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
      'environmentLocalNorthM', 'replaceHostBuilding', 'pvgisUseHorizon', 'pvgisShowHorizon', 'pvgisHorizonProfile',
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

  clearGeographicEnvironment() {
    this.geographicData = null;
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

  mapPointToHouseLocal(point, state = this.environmentState) {
    const houseMap = this.getHouseMapPosition(state);
    const x = Number(point.x) - houseMap.x;
    const z = Number(point.z) - houseMap.z;
    const angle = THREE.MathUtils.degToRad(Number(state.northDirection) || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: cos * x + sin * z, z: -sin * x + cos * z };
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

  createBuildingMesh(building, state) {
    const points = building.points || [];
    if (points.length < 3) return null;
    const baseY = -0.19 + this.terrainRelativeHeight(building.centroid.x, building.centroid.z, state);
    const height = clamp(Number(building.heightM) || 6.4, 2.2, 80);
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
      color: 0xaeb7bf,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.environmentLayer = 'buildings';
    mesh.userData.osmId = building.id;
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
    if (!data || state.environmentEnabled === false) {
      this.ground.visible = true;
      this.grid.visible = true;
      this.configureEnvironmentShadow(0);
      return;
    }

    const terrain = this.createTerrainMesh(state);
    if (terrain) this.geographicRoot.add(terrain);
    for (const building of data.buildings || []) {
      const isHost = this.isHostBuilding(building, state);
      const mesh = isHost && state.replaceHostBuilding !== false
        ? this.createHostBuildingReference(building, state)
        : this.createBuildingMesh(building, state);
      if (mesh) this.geographicRoot.add(mesh);
    }
    const roads = this.createRoadMesh(data.roads || [], state);
    if (roads) this.geographicRoot.add(roads);
    this.createTrees(data.trees || [], state).forEach((mesh) => this.geographicRoot.add(mesh));
    this.applyGeographicTransform(state);
    this.syncGeographicLayerVisibility(state);
    this.configureEnvironmentShadow(data.radiusM);
    this.updateLighting();
  }

  syncGeographicLayerVisibility(state = this.environmentState) {
    const enabled = state.environmentEnabled !== false && Boolean(this.geographicData);
    const flags = {
      terrain: enabled && state.terrainEnabled !== false,
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
    const hostBuildingCount = (this.geographicData.buildings || [])
      .reduce((count, building) => count + (this.isHostBuilding(building, state) ? 1 : 0), 0);
    return { houseElevationM, hostBuildingCount };
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
