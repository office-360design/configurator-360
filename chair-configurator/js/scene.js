import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSurfaceSystem } from '../../shared-3d/src/index.js?v=platform-19';
import { createChairModel } from './chairGeometry.js?v=chair-20';
import { registerChairMaterials } from './materials.js?v=chair-20';

export class ChairScene {
  constructor(container, { state, onCameraChange = () => {} } = {}) {
    this.container = container;
    this.state = state;
    this.onCameraChange = onCameraChange;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f4f5);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false);
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(34, 1, .05, 20);
    this.camera.position.set(1.15, .92, 1.45);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, .40, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.minDistance = .75;
    this.controls.maxDistance = 3.5;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.addEventListener('change', () => { this.invalidate(); this.onCameraChange(); });

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xaab3b8, 1.45);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 3.1);
    this.key.position.set(2.6, 4.1, 2.5);
    this.key.castShadow = true;
    this.key.shadow.camera.left = -1.5; this.key.shadow.camera.right = 1.5;
    this.key.shadow.camera.top = 1.6; this.key.shadow.camera.bottom = -1.1;
    this.key.shadow.camera.near = .2; this.key.shadow.camera.far = 9;
    this.key.shadow.bias = -.00015;
    this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xdce8ff, .62);
    this.fill.position.set(-2.2, 1.8, -1.5);
    this.scene.add(this.fill);

    this.surfaceSystem = createSurfaceSystem(THREE, {
      renderer: this.renderer, scene: this.scene, shadowLights: [this.key], quality: state.quality,
      contactShading: { radius: .035, intensity: .48 },
    });
    registerChairMaterials(this.surfaceSystem.materials);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ color: 0xe9ecee, roughness: .96, metalness: 0 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.woodMaterial = null;
    this.fabricMaterial = null;
    this.model = null;
    this.applyMaterials(state, { rebuild: true });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.needsFrame = true;
    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  createMaterial(id, color) {
    return this.surfaceSystem.materials.create(id, { color, side: THREE.FrontSide });
  }

  applyMaterials(state, { rebuild = false } = {}) {
    const woodId = `wood.furniture.${state.woodType}`;
    const fabricId = `fabric.upholstery.${state.fabricType}`;
    const woodChanged = !this.woodMaterial || this.woodMaterial.userData.surface?.id !== woodId;
    const fabricChanged = !this.fabricMaterial || this.fabricMaterial.userData.surface?.id !== fabricId;
    if (woodChanged) { this.woodMaterial?.dispose(); this.woodMaterial = this.createMaterial(woodId, state.woodColor); }
    else this.woodMaterial.color.set(state.woodColor);
    if (fabricChanged) { this.fabricMaterial?.dispose(); this.fabricMaterial = this.createMaterial(fabricId, state.fabricColor); }
    else this.fabricMaterial.color.set(state.fabricColor);

    if (!this.model || rebuild) {
      if (this.model?.group) this.scene.remove(this.model.group);
      this.model = createChairModel(THREE, this.surfaceSystem.geometry, { woodMaterial: this.woodMaterial, fabricMaterial: this.fabricMaterial });
      this.scene.add(this.model.group);
    } else {
      this.model.woodMeshes.forEach((mesh) => { mesh.material = this.woodMaterial; });
      this.model.fabricMeshes.forEach((mesh) => { mesh.material = this.fabricMaterial; });
    }
    this.woodMaterial.needsUpdate = true;
    this.fabricMaterial.needsUpdate = true;
    this.invalidate();
  }

  setState(state) { this.state = state; this.applyMaterials(state); }
  setQuality(value) { this.state.quality = value; this.surfaceSystem.setQuality(value, { compact: matchMedia('(max-width: 760px)').matches }); this.invalidate(); }
  setDarkMode(value) { this.scene.background.set(value ? 0x22282c : 0xf2f4f5); this.floor.material.color.set(value ? 0x33393d : 0xe9ecee); this.invalidate(); }
  invalidate() { this.needsFrame = true; this.surfaceSystem.invalidate(); }
  cycleCamera() {
    const presets = [
      [[1.15,.92,1.45],[0,.4,0]], [[0,.72,1.65],[0,.42,0]], [[1.55,.70,.05],[0,.42,0]], [[.82,1.35,1.05],[0,.38,0]],
    ];
    this.cameraIndex = ((this.cameraIndex ?? 0) + 1) % presets.length;
    const [position,target] = presets[this.cameraIndex];
    this.camera.position.set(...position); this.controls.target.set(...target); this.controls.update(); this.invalidate();
  }
  resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); this.invalidate();
  }
  animate(now) {
    this.animationFrame = requestAnimationFrame(this.animate);
    const moving = this.controls.update();
    if (!this.needsFrame && !moving) return;
    this.needsFrame = false;
    this.surfaceSystem.render(this.camera, { onDemand: true, now });
  }
  diagnostics() { return { chair: { originalProceduralGeometry: true, meshSource: 'none', woodType: this.state.woodType, fabricType: this.state.fabricType }, ...this.surfaceSystem.getDiagnostics() }; }
  dispose() {
    cancelAnimationFrame(this.animationFrame); this.resizeObserver.disconnect(); this.controls.dispose();
    this.woodMaterial?.dispose(); this.fabricMaterial?.dispose(); this.surfaceSystem.dispose(); this.floor.geometry.dispose(); this.floor.material.dispose(); this.renderer.dispose();
  }
}
