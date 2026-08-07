import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoofModel } from './roofFactory.js?v=1';
import { buildSolarArray } from './solarFactory.js?v=2';
import { createDimensions } from './dimensions.js?v=1';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function createCompassLabel(text, className = '') {
  const element = document.createElement('div');
  element.className = `compass-label ${className}`.trim();
  element.textContent = text;
  return new CSS2DObject(element);
}

export class RoofScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.environmentState = {
      sunPosition: 42,
      northDirection: 108,
      nightPreview: false,
    };

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
    this.solarRoot = new THREE.Group();
    this.scene.add(this.solarRoot);
    this.dimensionsRoot = new THREE.Group();
    this.scene.add(this.dimensionsRoot);
    this.compassRoot = this.createCompass();
    this.compassRoot.visible = false;
    this.scene.add(this.compassRoot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.updateLighting();

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
    this.keyLight.shadow.bias = -0.0004;
    this.scene.add(this.keyLight);

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
    this.compassRoot.rotation.y = -THREE.MathUtils.degToRad(this.environmentState.northDirection);
  }

  setCompassVisible(visible) {
    this.compassRoot.visible = Boolean(visible);
  }

  setEnvironment(settings = {}) {
    if (Number.isFinite(Number(settings.sunPosition))) {
      this.environmentState.sunPosition = clamp(Number(settings.sunPosition), 0, 100);
    }
    if (Number.isFinite(Number(settings.northDirection))) {
      this.environmentState.northDirection = ((Number(settings.northDirection) % 360) + 360) % 360;
    }
    if (typeof settings.nightPreview === 'boolean') {
      this.environmentState.nightPreview = settings.nightPreview;
    }
    this.compassRoot.rotation.y = -THREE.MathUtils.degToRad(this.environmentState.northDirection);
    this.updateLighting();
  }

  updateLighting() {
    const progress = clamp(this.environmentState.sunPosition / 100, 0, 1);
    const sunArc = Math.sin(progress * Math.PI);
    const elevation = THREE.MathUtils.degToRad(8 + sunArc * 57);
    // The compass treats -Z as north at 0°. The sun travels from east
    // through south to west as the slider moves from morning to evening.
    const relativeAzimuth = 70 - progress * 140;
    const azimuth = THREE.MathUtils.degToRad(-this.environmentState.northDirection + relativeAzimuth);
    const radius = 20;
    const horizontalRadius = Math.cos(elevation) * radius;

    this.keyLight.position.set(
      Math.sin(azimuth) * horizontalRadius,
      Math.sin(elevation) * radius,
      Math.cos(azimuth) * horizontalRadius,
    );

    const isNight = this.environmentState.nightPreview;
    if (isNight) {
      this.keyLight.color.setHex(0x9db9ff);
      this.keyLight.intensity = 0.55;
      this.hemisphereLight.intensity = 0.34;
      this.hemisphereLight.color.setHex(0x8da9dd);
      this.hemisphereLight.groundColor.setHex(0x111827);
      this.fillLight.intensity = 0.16;
      this.renderer.toneMappingExposure = 0.62;
      this.groundMaterial.color.setHex(0x26313f);
      this.grid.material.opacity = 0.11;
    } else {
      this.keyLight.color.setHex(0xffffff);
      this.keyLight.intensity = 2.8 + sunArc * 1.8;
      this.hemisphereLight.intensity = 1.45;
      this.hemisphereLight.color.setHex(0xffffff);
      this.hemisphereLight.groundColor.setHex(0x72777d);
      this.fillLight.intensity = 1.15;
      this.renderer.toneMappingExposure = 1.08;
      this.groundMaterial.color.setHex(0xd9dddf);
      this.grid.material.opacity = 0.25;
    }

    this.host.closest('.viewer-stage')?.classList.toggle('is-night-preview', isNight);
  }

  rebuild(state, fitCamera = false) {
    this.disposeGroup(this.modelRoot);
    this.disposeGroup(this.solarRoot);
    this.disposeGroup(this.dimensionsRoot);

    const { group, metrics: roofMetrics } = buildRoofModel(state);
    this.modelRoot.add(group);

    const { group: solarGroup, metrics: solarMetrics } = buildSolarArray(state);
    this.solarRoot.add(solarGroup);

    if (state.showDimensions) {
      this.dimensionsRoot.add(createDimensions(state, roofMetrics.ridgeElevation));
    }

    this.updateCompassPlacement(state);
    this.controls.target.set(0, Math.max(1.4, roofMetrics.ridgeElevation * 0.36), 0);
    if (fitCamera) this.fitCamera(state, roofMetrics.ridgeElevation);
    return { ...roofMetrics, ...solarMetrics, roofMetrics, solarMetrics };
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
