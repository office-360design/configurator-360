import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildPergola } from './buildPergola.js';
import { AssetLibrary, fitAssetToBox } from './AssetLibrary.js';

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((item) => item.dispose?.());
    }
  });
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.7,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}


function createCompassTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.47;
  const inner = size * 0.37;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#0b6aa5';
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg - 90) * Math.PI / 180;
    const isMajor = deg % 10 === 0;
    const isMid = deg % 5 === 0;
    const r1 = outer - (isMajor ? size * 0.035 : isMid ? size * 0.024 : size * 0.016);
    const r2 = outer;
    ctx.beginPath();
    ctx.strokeStyle = isMajor ? '#0b6aa5' : '#dd6d6d';
    ctx.lineWidth = isMajor ? size * 0.006 : size * 0.0024;
    ctx.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
    ctx.stroke();
  }

  ctx.fillStyle = '#0b6aa5';
  ctx.font = `bold ${Math.round(size * 0.028)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg - 90) * Math.PI / 180;
    const r = outer - size * 0.065;
    ctx.fillText(String(deg), cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
  }

  const drawTriangle = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  drawTriangle([[cx, cy - size * 0.26], [cx - size * 0.04, cy], [cx, cy + size * 0.04], [cx + size * 0.04, cy]], '#e34f53');
  drawTriangle([[cx + size * 0.26, cy], [cx, cy - size * 0.04], [cx - size * 0.04, cy], [cx, cy + size * 0.04]], '#0b6aa5');
  drawTriangle([[cx, cy + size * 0.26], [cx - size * 0.04, cy], [cx, cy - size * 0.04], [cx + size * 0.04, cy]], '#0b5d97');
  drawTriangle([[cx - size * 0.26, cy], [cx, cy - size * 0.04], [cx + size * 0.04, cy], [cx, cy + size * 0.04]], '#084d7e');

  const cardinal = [
    ['N', 0, -size * 0.335, '#b31d2c'],
    ['E', size * 0.335, 0, '#0b6aa5'],
    ['S', 0, size * 0.335, '#0b6aa5'],
    ['W', -size * 0.335, 0, '#0b6aa5'],
  ];
  cardinal.forEach(([label, dx, dy, fill]) => {
    ctx.fillStyle = fill;
    ctx.font = `bold ${Math.round(size * 0.08)}px Arial`;
    ctx.fillText(label, cx + dx, cy + dy);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PergolaScene {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.state = store.get();
    this.lastStructuralSignature = '';
    this.destroyed = false;
    this.assets = new AssetLibrary();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dfe6e9');
    this.scene.fog = new THREE.Fog('#e7edef', 12, 28);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.camera.position.set(7.8, 5.4, 8.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.append(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'dimension-layer';
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.append(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.set(0, 1.2, 0);
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    this.ambient = new THREE.HemisphereLight('#f5fbff', '#75806f', 1.85);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff3d2', 4.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -11;
    this.sun.shadow.camera.right = 11;
    this.sun.shadow.camera.top = 11;
    this.sun.shadow.camera.bottom = -11;
    this.sun.shadow.camera.near = 0.1;
    this.sun.shadow.camera.far = 35;
    this.sun.shadow.bias = -0.00035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.environmentGroup = new THREE.Group();
    this.scene.add(this.environmentGroup);
    this.buildEnvironment();

    this.pergolaGroup = new THREE.Group();
    this.scene.add(this.pergolaGroup);
    this.dimensionGroup = new THREE.Group();
    this.scene.add(this.dimensionGroup);

    this.assets.ready.then(() => {
      if (this.destroyed) return;
      this.buildEnvironment();
      this.rebuildPergola();
      this.lastStructuralSignature = this.structuralSignature(this.state);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.unsubscribe = this.store.subscribe((state, meta) => this.update(state, meta));
    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  buildEnvironment() {
    this.environmentGroup.children.forEach((child) => disposeObject(child));
    this.environmentGroup.clear();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      makeMaterial('#cfd8d8', { roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.03;
    ground.name = 'environment-ground';
    this.environmentGroup.add(ground);

    const deckMaterial = makeMaterial('#aa9477', { roughness: 0.82 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.12, 7.4), deckMaterial);
    deck.position.set(0, -0.01, 0);
    deck.receiveShadow = true;
    deck.castShadow = true;
    this.environmentGroup.add(deck);

    const plankMaterial = makeMaterial('#c1ad90', { roughness: 0.88 });
    for (let index = 0; index < 24; index += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.008, 0.008), plankMaterial);
      plank.position.set(0, 0.055, -3.55 + index * 0.305);
      this.environmentGroup.add(plank);
    }

    this.houseGroup = fitAssetToBox(
      this.assets.clone('house') ?? this.makeHouseFallback(),
      new THREE.Vector3(9.8, 6.15, 4.9),
      { alignY: 'bottom' },
    );
    this.houseGroup.name = 'environment-house';
    this.houseGroup.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      });
    });
    this.environmentGroup.add(this.houseGroup);

    this.treeGroups = [];
    [
      [-6.5, -3.6, 0.9, 40],
      [7.2, -4.2, 1.2, 80],
      [-7.8, 3.8, 0.7, 0],
    ].forEach(([x, z, scale, rotationDeg]) => {
      const tree = fitAssetToBox(
        this.assets.clone('tree') ?? this.makeTreeFallback(),
        new THREE.Vector3(2.7 * scale, 4.7 * scale, 2.7 * scale),
        { alignY: 'bottom' },
      );
      tree.position.set(x, 0, z);
      tree.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
      tree.userData.environmentTree = true;
      this.environmentGroup.add(tree);
      this.treeGroups.push(tree);
    });

    const compass = new THREE.Group();
    const compassPlane = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 80),
      new THREE.MeshBasicMaterial({
        map: createCompassTexture(),
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    compassPlane.rotation.x = -Math.PI / 2;
    compass.add(compassPlane);
    const compassGlow = new THREE.PointLight('#2b7cff', 0, 3.2, 2);
    compassGlow.position.set(0, 0.12, 0);
    compass.add(compassGlow);
    compass.userData.glow = compassGlow;
    compass.name = 'north-compass';
    this.environmentGroup.add(compass);
    this.northCompass = compass;

    this.updateEnvironment();
  }

  makeHouseFallback() {
    const group = new THREE.Group();
    const wallMaterial = makeMaterial('#d7ddd8', { roughness: 0.95 });
    const trimMaterial = makeMaterial('#707981', { roughness: 0.65, metalness: 0.35 });
    const glassMaterial = makeMaterial('#b9d9e4', {
      roughness: 0.06,
      metalness: 0.02,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(9.2, 4.3, 2.4), wallMaterial);
    body.position.y = 2.15;
    group.add(body);

    const roofGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -5.0, 4.3, -1.45,   0.0, 5.9, -1.45,   5.0, 4.3, -1.45,
      -5.0, 4.3, 1.45,    0.0, 5.9, 1.45,    5.0, 4.3, 1.45,
    ]);
    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.setIndex([
      0, 3, 4,  0, 4, 1,
      1, 4, 5,  1, 5, 2,
      0, 1, 2,  0, 2, 5,  0, 5, 3,
    ]);
    roofGeometry.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeometry, makeMaterial('#c8c7bc', { roughness: 0.92, side: THREE.DoubleSide }));
    group.add(roof);

    const eave = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.08, 2.7), trimMaterial);
    eave.position.set(0, 4.24, 0);
    group.add(eave);

    const windowSet = new THREE.Group();
    const spacing = 1.85;
    [-2.75, -0.95, 1.0, 2.8].forEach((x) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.65, 0.08), trimMaterial);
      frame.position.set(x, 2.65, 1.17);
      windowSet.add(frame);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.48, 0.03), glassMaterial);
      pane.position.set(x, 2.65, 1.22);
      windowSet.add(pane);
    });
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.35, 0.09), trimMaterial);
    doorFrame.position.set(-4.05, 1.63, 1.16);
    windowSet.add(doorFrame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.16, 0.045), makeMaterial('#1b2024', { roughness: 0.55, metalness: 0.2 }));
    door.position.set(-4.05, 1.63, 1.22);
    windowSet.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.03), makeMaterial('#888e92', { roughness: 0.3, metalness: 0.7 }));
    handle.position.set(-3.78, 1.63, 1.26);
    windowSet.add(handle);
    group.add(windowSet);
    return group;
  }

  makeTreeFallback() {
    const tree = new THREE.Group();
    const trunkMaterial = makeMaterial('#7a6657', { roughness: 1 });
    const foliageMaterial = makeMaterial('#577446', { roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 2.3, 9), trunkMaterial);
    trunk.position.y = 1.15;
    tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), foliageMaterial);
    crown.position.y = 3.0;
    crown.name = 'foliage-fallback';
    tree.add(crown);
    return tree;
  }

  structuralSignature(state) {
    return JSON.stringify({
      model: state.model,
      installation: state.installation,
      mountedSide: state.mountedSide,
      dimensions: state.dimensions,
      roof: state.roof,
      automation: state.automation,
      automationSettings: state.automationSettings,
      sides: state.sides,
      accessories: state.accessories,
      units: state.units,
    });
  }

  update(state, meta = {}) {
    this.state = state;
    const signature = this.structuralSignature(state);
    if (signature !== this.lastStructuralSignature) {
      this.rebuildPergola();
      this.lastStructuralSignature = signature;
    }

    this.updateEnvironment();
    this.dimensionGroup.visible = Boolean(state.view.dimensionsVisible);

    if (meta.path === 'view.cameraPreset') {
      this.setCameraPreset(state.view.cameraPreset);
    }
  }

  rebuildPergola() {
    if (this.pergola) {
      this.pergolaGroup.remove(this.pergola);
      disposeObject(this.pergola);
    }
    this.dimensionGroup.clear();

    this.pergola = buildPergola(this.state, this.assets);
    this.pergolaGroup.add(this.pergola);
    this.buildDimensions(this.pergola.userData.dimensions);

    const maxDimension = Math.max(
      this.pergola.userData.dimensions.width,
      this.pergola.userData.dimensions.depth,
    );
    this.controls.maxDistance = Math.max(16, maxDimension * 3);
  }

  createDimensionLine(start, end, label, offset = new THREE.Vector3()) {
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#1e2529' });
    const points = [start.clone(), end.clone()];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial);
    line.position.copy(offset);
    this.dimensionGroup.add(line);

    const tickLength = 0.16;
    [start, end].forEach((point) => {
      const tick = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(point.x, point.y - tickLength / 2, point.z),
          new THREE.Vector3(point.x, point.y + tickLength / 2, point.z),
        ]),
        lineMaterial,
      );
      tick.position.copy(offset);
      this.dimensionGroup.add(tick);
    });

    const labelElement = document.createElement('span');
    labelElement.className = 'dimension-label';
    labelElement.textContent = label;
    const labelObject = new CSS2DObject(labelElement);
    labelObject.position.copy(start.clone().lerp(end, 0.5).add(offset));
    this.dimensionGroup.add(labelObject);
  }

  buildDimensions({ width, depth, height }) {
    const widthLabel = this.formatLength(width * 1000);
    const depthLabel = this.formatLength(depth * 1000);
    const heightLabel = this.formatLength(height * 1000);

    this.createDimensionLine(
      new THREE.Vector3(-width / 2, 0.13, depth / 2 + 0.42),
      new THREE.Vector3(width / 2, 0.13, depth / 2 + 0.42),
      widthLabel,
    );
    this.createDimensionLine(
      new THREE.Vector3(width / 2 + 0.42, 0.13, -depth / 2),
      new THREE.Vector3(width / 2 + 0.42, 0.13, depth / 2),
      depthLabel,
    );
    this.createDimensionLine(
      new THREE.Vector3(width / 2 + 0.42, 0, -depth / 2 - 0.18),
      new THREE.Vector3(width / 2 + 0.42, height, -depth / 2 - 0.18),
      heightLabel,
    );
  }

  formatLength(mm) {
    if (this.state.units === 'imperial') {
      const inches = mm / 25.4;
      const feet = Math.floor(inches / 12);
      const remaining = Math.round(inches - feet * 12);
      return `${feet}' ${remaining}\"`;
    }
    return `${Math.round(mm)} mm`;
  }

  updateEnvironment() {
    const { sunPosition, northDirection, night, season } = this.state.environment;
    const progress = THREE.MathUtils.clamp(sunPosition, 0, 1);
    const azimuth = THREE.MathUtils.degToRad(-110 + progress * 220 + northDirection);
    const elevation = THREE.MathUtils.degToRad(12 + Math.sin(progress * Math.PI) * 55);
    const radius = 12;

    this.sun.position.set(
      Math.cos(azimuth) * Math.cos(elevation) * radius,
      Math.sin(elevation) * radius,
      Math.sin(azimuth) * Math.cos(elevation) * radius,
    );
    this.sun.target.position.set(0, 0.7, 0);
    this.sun.intensity = night ? 0.18 : 3.4 + Math.sin(progress * Math.PI) * 2.1;
    this.ambient.intensity = night ? 0.5 : 1.65;
    this.ambient.color.set(night ? '#7082a0' : '#f5fbff');
    this.ambient.groundColor.set(night ? '#10151a' : '#75806f');

    const palette = {
      winter: { background: '#dfe6e9', fog: '#e7edef', ground: '#cfd8d8' },
      summer: { background: '#c7dbe5', fog: '#d6e5e9', ground: '#8da878' },
      studio: { background: '#eeeeec', fog: '#f3f3f1', ground: '#deded9' },
    }[season];
    const background = night ? '#0e1620' : palette.background;
    const fogColor = night ? '#131e29' : palette.fog;
    this.scene.background.set(background);
    this.scene.fog.color.set(fogColor);
    const ground = this.environmentGroup.getObjectByName('environment-ground');
    ground?.material?.color.set(night ? '#273039' : palette.ground);
    this.renderer.toneMappingExposure = night ? 0.92 : 1.08;

    const pergolaHeight = this.state.dimensions.height / 1000;
    if (this.northCompass) {
      const compassVisible = Boolean(this.state.view.compassVisible);
      this.northCompass.visible = compassVisible;
      this.northCompass.rotation.y = THREE.MathUtils.degToRad(-northDirection);
      this.northCompass.position.set(0, pergolaHeight + 0.5, 0);
      if (this.northCompass.userData.glow) {
        this.northCompass.userData.glow.intensity = compassVisible && night ? 0.8 : 0;
      }
    }

    this.updateHousePlacement();
    if (this.houseGroup) this.houseGroup.visible = season !== 'studio';
    this.treeGroups.forEach((tree) => {
      tree.visible = season !== 'studio';
      tree.traverse((child) => {
        if (!child.isMesh || !/foliage|leaf|crown/i.test(child.name)) return;
        const color = season === 'winter' ? '#aeb5ae' : '#587b48';
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((item) => item?.color?.set(color));
      });
    });
  }

  updateHousePlacement() {
    if (!this.houseGroup) return;
    const width = this.state.dimensions.width / 1000;
    const depth = this.state.dimensions.depth / 1000;
    const attached = this.state.installation === 'wall-mounted';
    const side = attached ? this.state.mountedSide : 'back';
    const gap = attached ? 0.05 : 2.0;
    const houseHalfDepth = 2.45;

    this.houseGroup.rotation.y = 0;
    if (side === 'back') {
      this.houseGroup.position.set(0, 0, -depth / 2 - houseHalfDepth - gap);
    } else if (side === 'front') {
      this.houseGroup.rotation.y = Math.PI;
      this.houseGroup.position.set(0, 0, depth / 2 + houseHalfDepth + gap);
    } else if (side === 'left') {
      this.houseGroup.rotation.y = Math.PI / 2;
      this.houseGroup.position.set(-width / 2 - houseHalfDepth - gap, 0, 0);
    } else {
      this.houseGroup.rotation.y = -Math.PI / 2;
      this.houseGroup.position.set(width / 2 + houseHalfDepth + gap, 0, 0);
    }
  }

  setCameraPreset(preset) {
    const { width, depth, height } = this.pergola?.userData.dimensions ?? { width: 5, depth: 3.5, height: 2.7 };
    const distance = Math.max(width, depth) * 1.65;
    const target = new THREE.Vector3(0, height * 0.42, 0);
    const positions = {
      perspective: new THREE.Vector3(distance, height * 1.85, distance),
      front: new THREE.Vector3(0, height * 0.75, distance * 1.25),
      left: new THREE.Vector3(-distance * 1.25, height * 0.75, 0),
      right: new THREE.Vector3(distance * 1.25, height * 0.75, 0),
      top: new THREE.Vector3(0.01, distance * 1.55, 0.01),
    };
    this.camera.position.copy(positions[preset] ?? positions.perspective);
    this.controls.target.copy(target);
    this.controls.update();
  }

  capturePNG() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unsubscribe?.();
    this.controls.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.labelRenderer.domElement.remove();
    this.renderer.domElement.remove();
  }
}
