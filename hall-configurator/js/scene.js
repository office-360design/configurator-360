import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildHallModel, applyExplodedView } from './hallFactory.js?v=5';

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((item) => item?.dispose?.());
    else child.material?.dispose?.();
  });
}

function makeLine(points, color = 0x46606e) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .72 });
  return new THREE.Line(geometry, material);
}

function labelObject(text, position) {
  const element = document.createElement('div');
  element.className = 'dimension-label';
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
  const minY = scaledBox.min.y;
  object.position.x -= center.x;
  object.position.z -= center.z;
  if (alignY === 'bottom') object.position.y -= minY;
  return object;
}

function makeHouseFallback() {
  const group = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0xe7e1d7, roughness: .9 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x6c5548, roughness: .82 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 3.3, 4.6), wall);
  body.position.y = 1.65;
  group.add(body);
  const roofShape = new THREE.ConeGeometry(4.9, 2.2, 4);
  roofShape.rotation.y = Math.PI / 4;
  roofShape.scale.z = .62;
  roofShape.position.y = 4.25;
  roofShape.material = roof;
  group.add(roofShape);
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

export class HallScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8eb);
    this.currentState = null;
    this.environmentAssets = { house: null, tree: null };

    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 500);
    this.camera.position.set(19, 14, 25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    this.scene.add(this.groundRoot, this.sceneryRoot, this.modelRoot, this.dimensionRoot);

    this.addLighting();
    this.loadEnvironmentAssets();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x7d7668, 2.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.25);
    sun.position.set(-18, 28, -14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = .5;
    sun.shadow.camera.far = 130;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcdcf0, .8);
    fill.position.set(22, 15, 25);
    this.scene.add(fill);
  }

  async loadEnvironmentAssets() {
    const loader = new GLTFLoader();
    const load = (url) => new Promise((resolve) => loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null)));
    const [house, tree] = await Promise.all([
      load('./assets/models/environment/house.glb'),
      load('./assets/models/environment/tree.glb'),
    ]);
    this.environmentAssets.house = house;
    this.environmentAssets.tree = tree;
    if (this.currentState) this.updateEnvironment(this.currentState);
  }

  cloneAsset(key) {
    const source = this.environmentAssets[key];
    return source ? source.clone(true) : null;
  }

  updateEnvironment(state) {
    this.currentState = state;
    this.groundRoot.clear();
    this.sceneryRoot.clear();
    const size = Math.max(state.length + 34, state.width + 34, 54);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xcfd9d3, roughness: .95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.31;
    ground.receiveShadow = true;
    this.groundRoot.add(ground);

    const grid = new THREE.GridHelper(size, Math.max(18, Math.round(size / 2)), 0x9cadb1, 0xb9c5c4);
    grid.position.y = -.218;
    grid.material.transparent = true;
    grid.material.opacity = .20;
    this.groundRoot.add(grid);

    if (!state.showScenery) return;
    const halfW = state.width / 2;
    const halfL = state.length / 2;

    const house = fitAssetToBox(this.cloneAsset('house') ?? makeHouseFallback(), new THREE.Vector3(9.8, 6.15, 4.9));
    house.position.set(-halfW - 7.2, 0, -halfL - 6.2);
    house.rotation.y = THREE.MathUtils.degToRad(28);
    house.name = 'scale-reference-house';
    house.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    this.sceneryRoot.add(house);

    const treeSpecs = [
      [-halfW - 4.8, -halfL + 2.0, .85, 0],
      [-halfW - 8.4, 0, 1.15, 40],
      [-halfW - 6.0, halfL + 5.5, .95, 80],
      [-2.0, halfL + 7.0, 1.25, 120],
      [halfW + 5.0, halfL + 5.0, 1.05, 160],
      [halfW + 7.5, 0, .8, 210],
      [halfW + 5.2, -halfL - 5.0, 1.2, 260],
      [2.5, -halfL - 8.0, .9, 310],
      [-halfW - 10.5, -halfL - 2.0, .7, 345],
    ];
    treeSpecs.forEach(([x, z, scale, rotation]) => {
      const tree = fitAssetToBox(this.cloneAsset('tree') ?? makeTreeFallback(), new THREE.Vector3(2.7 * scale, 4.7 * scale, 2.7 * scale));
      tree.position.set(x, 0, z);
      tree.rotation.y = THREE.MathUtils.degToRad(rotation);
      tree.name = 'environment-tree';
      tree.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      this.sceneryRoot.add(tree);
    });
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
    applyExplodedView(built.root, state.explode / 100);
    this.updateEnvironment(state);
    this.updateDimensions(state, built.metrics);
    if (fitCamera) this.fitCamera(state, built.metrics);
    return built;
  }

  setExplode(amount) {
    if (!this.currentBuild?.root) return;
    applyExplodedView(this.currentBuild.root, amount / 100);
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

  setDarkMode(enabled) {
    this.scene.background = new THREE.Color(enabled ? 0x172536 : 0xdce8eb);
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
