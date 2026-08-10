import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildHallModel, applyExplodedView } from './hallFactory.js?v=4';

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

export class HallScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8eb);

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
    this.controls.maxDistance = 160;

    this.modelRoot = new THREE.Group();
    this.dimensionRoot = new THREE.Group();
    this.groundRoot = new THREE.Group();
    this.scene.add(this.groundRoot, this.modelRoot, this.dimensionRoot);

    this.addLighting();
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
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = .5;
    sun.shadow.camera.far = 100;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xbcdcf0, .8);
    fill.position.set(22, 15, 25);
    this.scene.add(fill);
  }

  updateEnvironment(state) {
    this.groundRoot.clear();
    const size = Math.max(state.length, state.width) + 24;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xcfd9d3, roughness: .95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.31;
    ground.receiveShadow = true;
    this.groundRoot.add(ground);

    const grid = new THREE.GridHelper(size, Math.max(12, Math.round(size / 2)), 0x9cadb1, 0xb9c5c4);
    grid.position.y = -.218;
    grid.material.transparent = true;
    grid.material.opacity = .24;
    this.groundRoot.add(grid);
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
