import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildFenceAssembly, GRADE_Y } from './fenceFactory.js?v=3';

export class FenceScene {
  constructor(host) {
    this.host = host;
    this.units = 'metric';
    this.locale = 'en-US';
    this.darkMode = false;
    this.currentBuild = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef2f3);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 250);
    this.camera.position.set(10, 7, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'fence-label-layer';
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.host.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(3.5, 0.9, 1.5);

    this.ambient = new THREE.HemisphereLight(0xeaf7ff, 0x7d7569, 2.2);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d7, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.bias = -0.00025;
    this.scene.add(this.sun);

    this.floorGroup = new THREE.Group();
    this.scene.add(this.floorGroup);
    this.buildScenery();

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.dimensionGroup = new THREE.Group();
    this.scene.add(this.dimensionGroup);
    this.compassGroup = new THREE.Group();
    this.scene.add(this.compassGroup);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animate();
  }

  rebuild(state, { fitCamera = false } = {}) {
    if (this.currentBuild?.root) {
      this.modelGroup.remove(this.currentBuild.root);
      disposeObject(this.currentBuild.root);
    }
    this.currentBuild = buildFenceAssembly(state);
    this.modelGroup.add(this.currentBuild.root);
    this.applyDisplayState(state);
    this.applyEnvironment(state);
    if (fitCamera) this.fitCamera(state);
    return this.currentBuild;
  }

  applyDisplayState(state) {
    if (!this.currentBuild) return;
    this.currentBuild.edges.visible = Boolean(state.technicalEdges);
    this.floorGroup.visible = Boolean(state.scenery);
    this.updateDimensions(state);
    this.updateCompass(state);
  }

  applyEnvironment(state) {
    const progress = Math.max(0, Math.min(1, Number(state.sunPosition) / 100));
    const azimuth = THREE.MathUtils.degToRad(-125 + progress * 250 + Number(state.northDirection || 0));
    const elevation = THREE.MathUtils.degToRad(18 + Math.sin(progress * Math.PI) * 47);
    const radius = 22;
    this.sun.position.set(
      Math.cos(azimuth) * Math.cos(elevation) * radius,
      Math.sin(elevation) * radius,
      Math.sin(azimuth) * Math.cos(elevation) * radius,
    );
    const night = Boolean(state.nightPreview);
    this.sun.intensity = night ? 0.32 : 3.1;
    this.ambient.intensity = night ? 0.62 : 2.2;
    this.ambient.color.set(night ? 0x8397bd : 0xeaf7ff);
    this.ambient.groundColor.set(night ? 0x2d3342 : 0x7d7569);
    this.scene.background.set(night ? 0x131a27 : this.darkMode ? 0x172235 : 0xeef2f3);
    this.renderer.toneMappingExposure = night ? 0.72 : 1;
    this.updateFloorMaterials(night);
  }

  setDarkMode(enabled, state) {
    this.darkMode = Boolean(enabled);
    this.applyEnvironment(state);
  }

  setPreferences({ units, locale } = {}, state = null) {
    if (units) this.units = units;
    if (locale) this.locale = locale;
    if (state) this.updateDimensions(state);
  }

  updateDimensions(state) {
    clearGroup(this.dimensionGroup);
    this.dimensionGroup.visible = Boolean(state.showDimensions);
    if (!state.showDimensions || !this.currentBuild) return;
    const lineMaterial = new THREE.LineBasicMaterial({ color: this.darkMode || state.nightPreview ? 0x83cfff : 0x247ca9, transparent: true, opacity: 0.78 });

    this.currentBuild.runSegments.forEach((run, index) => {
      const start = run.points[0];
      const end = run.points[run.points.length - 1];
      const direction = end.clone().sub(start).normalize();
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const outward = index === 2 ? side.multiplyScalar(-1) : side;
      const offset = outward.clone().multiplyScalar(0.46);
      const a = start.clone().add(offset).setY(0.08);
      const b = end.clone().add(offset).setY(0.08);
      this.dimensionGroup.add(lineBetween(a, b, lineMaterial));
      const label = dimensionLabel(this.formatLength(run.length));
      label.position.copy(a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.06, 0)));
      this.dimensionGroup.add(label);
      [a, b].forEach((point) => {
        const tickA = point.clone().addScaledVector(direction, -0.08);
        const tickB = point.clone().addScaledVector(direction, 0.08);
        this.dimensionGroup.add(lineBetween(tickA, tickB, lineMaterial));
      });
    });

    const origin = this.currentBuild.runSegments[0]?.points[0] ?? new THREE.Vector3();
    const h0 = origin.clone().add(new THREE.Vector3(-0.28, 0.04, -0.28));
    const h1 = h0.clone().setY(state.height);
    this.dimensionGroup.add(lineBetween(h0, h1, lineMaterial));
    const heightLabel = dimensionLabel(this.formatLength(state.height));
    heightLabel.position.copy(h0.clone().lerp(h1, 0.5));
    this.dimensionGroup.add(heightLabel);
  }

  updateCompass(state) {
    clearGroup(this.compassGroup);
    this.compassGroup.visible = Boolean(state.compassVisible);
    if (!state.compassVisible || !this.currentBuild) return;
    const bounds = this.currentBuild.bounds.box;
    const base = new THREE.Vector3(bounds.min.x - 1.0, 0.035, bounds.min.z - 1.0);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.54, 48),
      new THREE.MeshBasicMaterial({ color: this.darkMode || state.nightPreview ? 0xb7dfff : 0x355968, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(base);
    this.compassGroup.add(ring);
    const angle = THREE.MathUtils.degToRad(Number(state.northDirection || 0));
    const north = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)).normalize();
    const arrow = new THREE.ArrowHelper(north, base.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.9, 0x168ed4, 0.22, 0.12);
    this.compassGroup.add(arrow);
    const label = dimensionLabel('N');
    label.element.classList.add('compass-label');
    label.position.copy(base.clone().addScaledVector(north, 0.82).add(new THREE.Vector3(0, 0.08, 0)));
    this.compassGroup.add(label);
  }

  fitCamera() {
    if (!this.currentBuild) return;
    const { size, center } = this.currentBuild.bounds;
    const span = Math.max(size.x, size.z, 3);
    this.controls.target.copy(center.clone().setY(Math.max(0.8, size.y * 0.42)));
    this.camera.position.set(center.x + span * 1.12, Math.max(4.2, span * 0.72), center.z + span * 1.18);
    this.controls.update();
  }

  setView(view) {
    if (!this.currentBuild) return;
    const { size, center } = this.currentBuild.bounds;
    const span = Math.max(size.x, size.z, 3);
    const target = center.clone().setY(Math.max(0.75, size.y * 0.42));
    this.controls.target.copy(target);
    if (view === 'top') this.camera.position.set(center.x, Math.max(7, span * 1.65), center.z + 0.01);
    else if (view === 'front') this.camera.position.set(center.x + span * 0.5, Math.max(2.3, size.y * 1.2), center.z + span * 1.35);
    else this.camera.position.set(center.x + span * 1.12, Math.max(4.2, span * 0.72), center.z + span * 1.18);
    this.camera.up.set(0, 1, 0);
    this.controls.update();
  }

  formatLength(metres) {
    if (this.units === 'imperial') {
      const feet = metres * 3.280839895;
      return `${feet.toFixed(feet < 10 ? 1 : 0)} ft`;
    }
    return `${metres.toFixed(metres < 3 ? 2 : 1)} m`;
  }

  buildScenery() {
    clearGroup(this.floorGroup);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xd9ddd5, roughness: 0.98 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GRADE_Y;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.floorGroup.add(ground);

    const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c3b9, roughness: 0.94 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.2), pathMaterial);
    path.rotation.x = -Math.PI / 2;
    path.position.set(5.5, GRADE_Y + 0.006, -1.7);
    path.receiveShadow = true;
    path.name = 'path';
    this.floorGroup.add(path);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a513b, roughness: 0.9 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x6d8564, roughness: 0.92 });
    [[-2.5, 3.5], [11.5, 4.8], [4, 8]].forEach(([x, z], index) => {
      const shrub = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 10), trunkMaterial);
      trunk.position.y = GRADE_Y + 0.35;
      trunk.castShadow = true;
      shrub.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.62 + index * 0.08, 14, 10), leafMaterial);
      crown.scale.y = 1.2;
      crown.position.y = GRADE_Y + 0.82;
      crown.castShadow = true;
      shrub.add(crown);
      shrub.position.set(x, 0, z);
      this.floorGroup.add(shrub);
    });
  }

  updateFloorMaterials(night) {
    this.floorGroup.traverse((object) => {
      if (!object.isMesh) return;
      if (!object.material?.color) return;
      if (!object.userData.dayColor) object.userData.dayColor = object.material.color.getHex();
      const base = new THREE.Color(object.userData.dayColor);
      object.material.color.copy(night ? base.multiplyScalar(0.34) : base);
    });
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
    this.animationFrame = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

function dimensionLabel(text) {
  const element = document.createElement('div');
  element.className = 'dimension-label';
  element.textContent = text;
  return new CSS2DObject(element);
}

function lineBetween(a, b, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(geometry, material);
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[group.children.length - 1];
    // Use Object3D.remove() instead of mutating children directly. CSS2DObject
    // listens for the `removed` event to detach its DOM node from CSS2DRenderer.
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object) {
  object.traverse?.((child) => {
    // Keep this explicit as well so stale dimension labels cannot survive a
    // rebuild even if the CSS2DRenderer implementation changes.
    if (child.isCSS2DObject) child.element?.remove?.();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}
