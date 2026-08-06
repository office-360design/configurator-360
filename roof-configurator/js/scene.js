import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoofModel } from './roofFactory.js?v=13';
import { createDimensions } from './dimensions.js?v=12';

export class RoofScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = null;

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

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.dimensionsRoot = new THREE.Group();
    this.scene.add(this.dimensionsRoot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x72777d, 1.6));

    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(-9, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -25;
    key.shadow.camera.right = 25;
    key.shadow.camera.top = 25;
    key.shadow.camera.bottom = -25;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xcbdcff, 1.35);
    fill.position.set(10, 7, -10);
    this.scene.add(fill);
  }

  addEnvironment() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0xd9dddf, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.205;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(80, 80, 0x9aa2a8, 0xcbd0d4);
    grid.position.y = -0.195;
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    this.scene.add(grid);
  }

  rebuild(state, fitCamera = false) {
    this.disposeGroup(this.modelRoot);
    this.disposeGroup(this.dimensionsRoot);

    const { group, metrics } = buildRoofModel(state);
    this.modelRoot.add(group);

    if (state.showDimensions && state.roofType !== 'custom') {
      this.dimensionsRoot.add(createDimensions(state, metrics.ridgeElevation));
    }

    this.controls.target.set(0, Math.max(1.4, metrics.ridgeElevation * 0.36), 0);
    if (fitCamera) this.fitCamera(state, metrics.ridgeElevation);
    return metrics;
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
