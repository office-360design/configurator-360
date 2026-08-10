import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildHallModel, applyExplodedView } from './hallFactory.js?v=7';

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((item) => item?.dispose?.());
    else child.material?.dispose?.();
  });
}

function makeLine(points, color = 0x46606e, opacity = .72) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geometry, material);
}

function labelObject(text, position, className = 'dimension-label') {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  return label;
}

function fitAssetToBox(object, target, alignY = 'bottom') {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(
    target.x / Math.max(size.x, .001),
    target.y / Math.max(size.y, .001),
    target.z / Math.max(size.z, .001),
  );
  object.scale.multiplyScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = scaledBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  if (alignY === 'bottom') object.position.y -= scaledBox.min.y;
  return object;
}

function makeHouseFallback() {
  const group = new THREE.Group();
  group.name = 'reference-house-procedural';
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e3db, roughness: .9, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5d7, roughness: .72, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4d514d, roughness: .78, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8ec9df, roughness: .16, metalness: .02, transparent: true, opacity: .72, side: THREE.DoubleSide });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x27323a, roughness: .62, side: THREE.DoubleSide });

  const width = 8.2;
  const depth = 4.6;
  const eave = 3.35;
  const rise = 1.35;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, eave, depth), wallMat);
  body.position.y = eave / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Two roof sheets share the same ridge line and sit directly on the wall eaves.
  // This replaces the old GLB roof whose detached slab and cap were visibly floating.
  const halfDepth = depth / 2;
  const slope = Math.hypot(halfDepth, rise);
  const pitch = Math.atan2(rise, halfDepth);
  const overhang = .34;
  const roofWidth = width + overhang * 2;
  const roofSlope = slope + overhang * 1.25;
  const roofThickness = .14;
  const centerY = eave + rise / 2 + .02;
  const centerZ = halfDepth / 2;

  const frontRoof = new THREE.Mesh(new THREE.BoxGeometry(roofWidth, roofThickness, roofSlope), roofMat);
  frontRoof.position.set(0, centerY, -centerZ);
  frontRoof.rotation.x = -pitch;
  frontRoof.castShadow = true;
  frontRoof.receiveShadow = true;
  group.add(frontRoof);

  const backRoof = frontRoof.clone();
  backRoof.position.z = centerZ;
  backRoof.rotation.x = pitch;
  group.add(backRoof);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofWidth + .08, .12, .16), roofMat);
  ridge.position.set(0, eave + rise + .04, 0);
  group.add(ridge);

  // Front façade details provide a recognisable residential scale reference.
  const frontZ = -depth / 2 - .012;
  const door = new THREE.Mesh(new THREE.BoxGeometry(.95, 2.05, .055), doorMat);
  door.position.set(-width * .34, 1.025, frontZ);
  group.add(door);
  for (const x of [-1.2, .35, 1.9, 3.05]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.18, .065), trimMat);
    frame.position.set(x, 1.72, frontZ - .01);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(.88, 1.04, .025), glassMat);
    glass.position.set(x, 1.72, frontZ - .05);
    group.add(frame, glass);
  }
  return group;
}

function makeTreeFallback() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, 1.7, 8), new THREE.MeshStandardMaterial({ color: 0x76543c, roughness: .95 }));
  trunk.position.y = .85;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshStandardMaterial({ color: 0x7e9c67, roughness: 1 }));
  crown.scale.set(1, 1.3, 1);
  crown.position.y = 2.55;
  group.add(trunk, crown);
  return group;
}

function createCompass() {
  const group = new THREE.Group();
  group.name = 'hall-compass';
  const long = 1.0;
  const short = .58;
  group.add(makeLine([new THREE.Vector3(0, .005, -long), new THREE.Vector3(0, .005, long)], 0x173e58, .9));
  group.add(makeLine([new THREE.Vector3(-long, .005, 0), new THREE.Vector3(long, .005, 0)], 0x173e58, .9));
  group.add(makeLine([new THREE.Vector3(0, .008, -long), new THREE.Vector3(-.16, .008, -.72), new THREE.Vector3(.16, .008, -.72), new THREE.Vector3(0, .008, -long)], 0x0b86d1, 1));
  group.add(labelObject('N', new THREE.Vector3(0, .04, -long - .18), 'compass-label'));
  group.add(labelObject('S', new THREE.Vector3(0, .04, long + .16), 'compass-label'));
  group.add(labelObject('W', new THREE.Vector3(-long - .18, .04, 0), 'compass-label'));
  group.add(labelObject('E', new THREE.Vector3(long + .18, .04, 0), 'compass-label'));
  group.scale.setScalar(short / .58);
  return group;
}

export class HallScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8eb);
    this.currentState = null;
    this.currentBuild = null;
    this.darkMode = false;
    this.environmentAssets = { house: null, tree: null };
    this.environmentKey = '';

    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 500);
    this.camera.position.set(19, 14, 25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    host.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.target.set(0, 3, 0);
    this.controls.maxPolarAngle = Math.PI * .495;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 190;

    this.modelRoot = new THREE.Group();
    this.dimensionRoot = new THREE.Group();
    this.groundRoot = new THREE.Group();
    this.sceneryRoot = new THREE.Group();
    this.compassRoot = createCompass();
    this.scene.add(this.groundRoot, this.sceneryRoot, this.modelRoot, this.dimensionRoot, this.compassRoot);

    this.sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.addLighting();
    this.loadEnvironmentAssets();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  addLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xeaf8ff, 0x7d7668, 2.15);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.25);
    this.sunLight.position.set(-18, 28, -14);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.near = .5;
    this.sunLight.shadow.camera.far = 130;
    this.scene.add(this.sunLight);
    this.fillLight = new THREE.DirectionalLight(0xbcdcf0, .8);
    this.fillLight.position.set(22, 15, 25);
    this.scene.add(this.fillLight);
  }

  async loadEnvironmentAssets() {
    const loader = new GLTFLoader();
    const load = (url) => new Promise((resolve) => loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null)));
    // Trees intentionally keep using the same shared pergola asset. The house is
    // procedural so its roof can remain watertight at every scale and browser.
    this.environmentAssets.house = null;
    this.environmentAssets.tree = await load('./assets/models/environment/tree.glb');
    if (this.currentState) this.updateEnvironment(this.currentState, { force: true });
  }

  cloneAsset(key) {
    const source = this.environmentAssets[key];
    return source ? source.clone(true) : null;
  }

  updateEnvironment(state, { force = false } = {}) {
    this.currentState = state;
    const key = `${state.width}|${state.length}|${state.showScenery}|${Boolean(this.environmentAssets.house)}|${Boolean(this.environmentAssets.tree)}`;
    if (!force && key === this.environmentKey) return;
    this.environmentKey = key;
    this.groundRoot.clear();
    this.sceneryRoot.clear();

    const size = Math.max(state.length + 40, state.width + 40, 58);
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd9d3, roughness: .95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.31;
    ground.receiveShadow = true;
    this.groundRoot.add(ground);

    const grid = new THREE.GridHelper(size, Math.max(18, Math.round(size / 2)), 0x9cadb1, 0xb9c5c4);
    grid.position.y = -.218;
    grid.material.transparent = true;
    grid.material.opacity = .20;
    this.groundRoot.add(grid);

    if (!state.showScenery) {
      this.updateCompass(state);
      return;
    }
    const halfW = state.width / 2;
    const halfL = state.length / 2;

    const houseX = -halfW - 10.5;
    const houseZ = -halfL - 8.5;
    const house = fitAssetToBox(makeHouseFallback(), new THREE.Vector3(9.8, 6.15, 4.9));
    house.position.set(houseX, 0, houseZ);
    house.rotation.y = THREE.MathUtils.degToRad(28);
    house.name = 'scale-reference-house';
    house.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    this.sceneryRoot.add(house);

    // Trees are intentionally arranged outside the hall footprint and away from the
    // house bounding area, so resizing the hall cannot swallow either reference.
    const treeSpecs = [
      [-halfW - 5.0, -halfL + state.length * .20, .85, 0],
      [-halfW - 7.0, state.length * .08, 1.15, 34],
      [-halfW - 5.8, halfL + 5.8, .95, 72],
      [-state.width * .20, halfL + 7.2, 1.25, 108],
      [state.width * .22, halfL + 8.0, .88, 142],
      [halfW + 5.2, halfL + 5.4, 1.05, 176],
      [halfW + 7.6, state.length * .12, .82, 212],
      [halfW + 6.3, -halfL - 5.6, 1.18, 248],
      [state.width * .24, -halfL - 8.0, .92, 284],
      [-state.width * .12, -halfL - 7.0, .78, 318],
      [halfW + 8.5, -state.length * .18, .72, 346],
      [-halfW - 8.5, halfL * .55, .74, 22],
    ].filter(([x, z]) => Math.hypot(x - houseX, z - houseZ) > 10.5);

    treeSpecs.forEach(([x, z, scale, rotation]) => {
      const tree = fitAssetToBox(this.cloneAsset('tree') ?? makeTreeFallback(), new THREE.Vector3(2.7 * scale, 4.7 * scale, 2.7 * scale));
      tree.position.set(x, 0, z);
      tree.rotation.y = THREE.MathUtils.degToRad(rotation);
      tree.name = 'environment-tree';
      tree.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      this.sceneryRoot.add(tree);
    });
    this.updateCompass(state);
  }

  updateCompass(state) {
    const halfW = state.width / 2;
    const halfL = state.length / 2;
    this.compassRoot.visible = Boolean(state.compassVisible);
    this.compassRoot.position.set(halfW + 2.8, -.205, -halfL - 2.8);
    this.compassRoot.rotation.y = THREE.MathUtils.degToRad(-state.northDirection);
  }

  updateDimensions(state, metrics) {
    this.dimensionRoot.clear();
    if (!state.showDimensions) return;
    const hw = state.width / 2;
    const hl = state.length / 2;
    const y = .18;
    const offset = 1.2;
    const widthStart = new THREE.Vector3(-hw, y, -hl - offset);
    const widthEnd = new THREE.Vector3(hw, y, -hl - offset);
    this.dimensionRoot.add(makeLine([widthStart, widthEnd]));
    this.dimensionRoot.add(makeLine([new THREE.Vector3(-hw, y, -hl - .2), widthStart]));
    this.dimensionRoot.add(makeLine([new THREE.Vector3(hw, y, -hl - .2), widthEnd]));
    this.dimensionRoot.add(labelObject(`${state.width.toFixed(1)} m`, new THREE.Vector3(0, y + .15, -hl - offset)));
    const lengthStart = new THREE.Vector3(hw + offset, y, -hl);
    const lengthEnd = new THREE.Vector3(hw + offset, y, hl);
    this.dimensionRoot.add(makeLine([lengthStart, lengthEnd]));
    this.dimensionRoot.add(makeLine([new THREE.Vector3(hw + .2, y, -hl), lengthStart]));
    this.dimensionRoot.add(makeLine([new THREE.Vector3(hw + .2, y, hl), lengthEnd]));
    this.dimensionRoot.add(labelObject(`${state.length.toFixed(1)} m`, new THREE.Vector3(hw + offset, y + .15, 0)));
    const heightX = -hw - offset;
    const heightZ = -hl;
    this.dimensionRoot.add(makeLine([new THREE.Vector3(heightX, 0, heightZ), new THREE.Vector3(heightX, metrics.ridgeElevation, heightZ)]));
    this.dimensionRoot.add(labelObject(`${metrics.ridgeElevation.toFixed(2)} m ridge`, new THREE.Vector3(heightX, metrics.ridgeElevation * .56, heightZ)));
  }

  rebuild(state, { fitCamera = false } = {}) {
    disposeObject(this.modelRoot);
    this.modelRoot.clear();
    const built = buildHallModel(state);
    this.currentBuild = built;
    this.modelRoot.add(built.root);
    built.root.userData.showConnectionDetails = Boolean(state.connectionDetails || state.inspectionMode === 'connections' || state.inspectionMode === 'foundations');
    applyExplodedView(built.root, state.explode / 100);
    this.updateEnvironment(state);
    this.updateDimensions(state, built.metrics);
    this.applyDisplayState(state);
    this.applyEnvironment(state);
    if (fitCamera) this.fitCamera(state, built.metrics);
    return built;
  }

  setExplode(amount, state = this.currentState) {
    if (!this.currentBuild?.root) return;
    this.currentBuild.root.userData.showConnectionDetails = Boolean(state?.connectionDetails || state?.inspectionMode === 'connections' || state?.inspectionMode === 'foundations');
    applyExplodedView(this.currentBuild.root, amount / 100);
  }

  applyDisplayState(state) {
    if (!this.currentBuild?.root) return;
    const root = this.currentBuild.root;
    const get = (name) => root.getObjectByName(name);
    const primary = get('primary-structure');
    const secondary = get('secondary-structure');
    const connections = get('connection-detail');
    const foundation = get('foundation');
    const envelope = get('envelope');
    const openings = get('openings');
    const services = get('building-services');
    const planning = get('warehouse-planning');

    const mode = state.inspectionMode ?? 'all';
    if (primary) primary.visible = mode === 'all' || mode === 'primary' || mode === 'secondary' || mode === 'connections' || mode === 'foundations';
    if (secondary) secondary.visible = state.secondaryStructure && (mode === 'all' || mode === 'secondary');
    if (connections) connections.visible = mode === 'connections' || mode === 'foundations' || (mode === 'all' && (state.connectionDetails || state.explode > 0));
    if (foundation) foundation.visible = mode === 'all' || mode === 'foundations';
    if (envelope) envelope.visible = state.showCladding && (mode === 'all' || mode === 'envelope');
    if (openings) openings.visible = mode === 'all' || mode === 'envelope';
    if (services) services.visible = mode === 'all' || mode === 'services';
    if (planning) planning.visible = (mode === 'all' || mode === 'services') && (state.warehouseRacking || state.forkliftClearance);

    const serviceNames = {
      lighting: 'service-lighting',
      fire: 'service-fire',
      climate: 'service-climate',
      drainage: 'service-drainage',
      skylights: 'service-skylights',
      coverage: 'service-coverage',
    };
    Object.entries(serviceNames).forEach(([key, name]) => {
      const group = get(name);
      if (!group) return;
      if (key === 'coverage') group.visible = Boolean(state.serviceCoverage) && state.serviceVisibility !== 'none';
      else group.visible = state.serviceVisibility === 'all' || state.serviceVisibility === key;
    });
    if (services && state.serviceVisibility === 'none') services.visible = false;

    const racks = get('warehouse-racking');
    const aisles = get('forklift-clearance');
    if (racks) racks.visible = Boolean(state.warehouseRacking) && planning?.visible !== false;
    if (aisles) aisles.visible = Boolean(state.forkliftClearance) && planning?.visible !== false;

    root.userData.showConnectionDetails = Boolean(state.connectionDetails || mode === 'connections' || mode === 'foundations');
    applyExplodedView(root, state.explode / 100);
    this.applyClipping(state);
    this.updateCompass(state);
  }

  applyClipping(state) {
    if (!this.currentBuild?.root) return;
    const planes = state.sectionCutEnabled ? [this.sectionPlane] : [];
    if (state.sectionCutEnabled) {
      const halfL = state.length / 2;
      const cutZ = -halfL + state.length * (state.sectionCutPosition / 100);
      this.sectionPlane.set(new THREE.Vector3(0, 0, 1), -cutZ);
    }
    this.currentBuild.root.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((mat) => {
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
        mat.needsUpdate = true;
      });
    });
  }

  applyEnvironment(state) {
    this.currentState = state;
    const angle = THREE.MathUtils.degToRad(-70 + state.sunPosition * 140 + state.northDirection);
    const radius = 34;
    this.sunLight.position.set(Math.sin(angle) * radius, 26 + Math.sin(state.sunPosition * Math.PI) * 8, Math.cos(angle) * radius);

    const season = state.season ?? 'winter';
    const night = Boolean(state.nightPreview);
    const dark = this.darkMode || night;
    const palettes = {
      winter: { bg: 0xdce8eb, ground: 0xcfd9d3 },
      summer: { bg: 0xd8edf2, ground: 0xc8d6c1 },
      studio: { bg: 0xe8edf0, ground: 0xd7dcde },
    };
    const palette = palettes[season] ?? palettes.winter;
    this.scene.background = new THREE.Color(dark ? 0x111b2a : palette.bg);
    if (this.groundMaterial) this.groundMaterial.color.setHex(dark ? 0x26313a : palette.ground);
    this.hemiLight.intensity = night ? .38 : (this.darkMode ? 1.1 : 2.15);
    this.sunLight.intensity = night ? .15 : (this.darkMode ? 1.25 : 2.25);
    this.fillLight.intensity = night ? .18 : .8;

    if (this.currentBuild?.root) {
      this.currentBuild.root.traverse((object) => {
        if (object.name?.includes('high-bay-lamp') && object.material?.emissive) {
          object.material.emissiveIntensity = night ? 3.2 : .75;
          object.material.needsUpdate = true;
        }
      });
    }
    this.updateCompass(state);
  }

  fitCamera(state, metrics) {
    const radius = Math.max(state.length, state.width, metrics.ridgeElevation) * .72;
    this.controls.target.set(0, Math.max(2, state.eaveHeight * .48), 0);
    this.camera.position.set(radius * .88, radius * .62, radius * 1.12);
    this.camera.near = .1;
    this.camera.far = Math.max(300, radius * 8);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setView(view, state, metrics) {
    const span = Math.max(state.length, state.width, metrics.ridgeElevation);
    const target = new THREE.Vector3(0, state.eaveHeight * .48, 0);
    this.controls.target.copy(target);
    if (view === 'front') this.camera.position.set(0, state.eaveHeight * .62, -span * 1.45);
    else if (view === 'side') this.camera.position.set(span * 1.35, state.eaveHeight * .62, 0);
    else if (view === 'top') this.camera.position.set(0, span * 1.85, .001);
    else this.camera.position.set(span * .78, span * .55, span * 1.02);
    this.camera.lookAt(target);
    this.controls.update();
  }

  setDarkMode(enabled, state = this.currentState) {
    this.darkMode = Boolean(enabled);
    if (state) this.applyEnvironment(state);
    else this.scene.background = new THREE.Color(this.darkMode ? 0x172536 : 0xdce8eb);
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
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
