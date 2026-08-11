import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildHallModel, applyExplodedView } from './hallFactory.js?v=9';
import { deriveHallMetrics } from './state.js?v=9';
import { makeOpening, normalizeOpening, normalizeOpenings, validateOpenings } from './openings.js?v=9';

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

function openingExplodeOffset(side) {
  if (side === 'front') return new THREE.Vector3(0, 0, -3.15);
  if (side === 'back') return new THREE.Vector3(0, 0, 3.15);
  if (side === 'left') return new THREE.Vector3(-3.1, 0, 0);
  return new THREE.Vector3(3.1, 0, 0);
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
  const halfDepth = depth / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, eave, depth), wallMat);
  body.position.y = eave / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Close both gable ends above the rectangular wall body. The previous house
  // stopped at the eave and therefore exposed a triangular hole below the roof.
  for (const side of [-1, 1]) {
    const x = side * width / 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x, eave, -halfDepth,
      x, eave, halfDepth,
      x, eave + rise, 0,
    ], 3));
    geometry.setIndex(side < 0 ? [0, 2, 1] : [0, 1, 2]);
    geometry.computeVertexNormals();
    const gable = new THREE.Mesh(geometry, wallMat);
    gable.castShadow = true;
    gable.receiveShadow = true;
    group.add(gable);
  }

  // Build each roof slope from an explicit orthonormal basis. Each sheet ends
  // just short of the ridge and extends only at the eave, so the two solids do
  // not penetrate each other. The ridge cap covers the intentional small gap.
  const slope = Math.hypot(halfDepth, rise);
  const overhang = .42;
  const ridgeGap = .035;
  const roofThickness = .13;
  const roofWidth = width + .72;
  for (const side of [-1, 1]) {
    const eavePoint = new THREE.Vector3(0, eave, side * halfDepth);
    const ridgePoint = new THREE.Vector3(0, eave + rise, 0);
    const outwardNormal = new THREE.Vector3(0, halfDepth / slope, side * rise / slope).normalize();
    const xAxis = new THREE.Vector3(side < 0 ? 1 : -1, 0, 0);
    const zAxis = new THREE.Vector3().crossVectors(xAxis, outwardNormal).normalize();
    // zAxis runs from the eave toward the ridge for both slopes.
    const extendedEave = eavePoint.clone().addScaledVector(zAxis, -overhang);
    const insetRidge = ridgePoint.clone().addScaledVector(zAxis, -ridgeGap);
    const center = extendedEave.clone().add(insetRidge).multiplyScalar(.5);
    const panelLength = extendedEave.distanceTo(insetRidge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(roofWidth, roofThickness, panelLength), roofMat);
    const basis = new THREE.Matrix4().makeBasis(xAxis, outwardNormal, zAxis);
    panel.quaternion.setFromRotationMatrix(basis);
    panel.position.copy(center).addScaledVector(outwardNormal, roofThickness / 2 - .01);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
  }

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofWidth + .08, .11, .22), roofMat);
  ridge.position.set(0, eave + rise + .075, 0);
  ridge.castShadow = true;
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

function createCompassTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  const drawTriangle = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  drawTriangle([[cx, cy - size * .25], [cx - size * .04, cy], [cx, cy + size * .038], [cx + size * .04, cy]], '#e34f53');
  drawTriangle([[cx + size * .25, cy], [cx, cy - size * .04], [cx - size * .038, cy], [cx, cy + size * .04]], '#0b6aa5');
  drawTriangle([[cx, cy + size * .25], [cx - size * .04, cy], [cx, cy - size * .038], [cx + size * .04, cy]], '#0b5d97');
  drawTriangle([[cx - size * .25, cy], [cx, cy - size * .04], [cx + size * .038, cy], [cx, cy + size * .04]], '#084d7e');
  drawTriangle([[cx, cy - size * .07], [cx + size * .07, cy], [cx, cy + size * .07], [cx - size * .07, cy]], '#0661a8');

  [
    ['N', 0, -size * .34, '#b31d2c'],
    ['E', size * .34, 0, '#0b6aa5'],
    ['S', 0, size * .34, '#0b6aa5'],
    ['W', -size * .34, 0, '#0b6aa5'],
  ].forEach(([label, dx, dy, fill]) => {
    ctx.fillStyle = fill;
    ctx.font = `bold ${Math.round(size * .1)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + dx, cy + dy);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCompass() {
  const group = new THREE.Group();
  group.name = 'hall-compass';
  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(.95, 80),
    new THREE.MeshBasicMaterial({
      map: createCompassTexture(),
      transparent: true,
      alphaTest: .02,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = 12;
  group.add(plane);
  return group;
}

export class HallScene {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce8eb);
    this.scene.fog = new THREE.Fog(0xe7eff1, 42, 92);
    this.currentState = null;
    this.currentBuild = null;
    this.darkMode = false;
    this.environmentAssets = { house: null, tree: null };
    this.environmentKey = '';
    this.selectedOpeningId = null;
    this.placement = null;
    this.openingDrag = null;
    this.openingResize = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

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
    this.openingInteractionRoot = new THREE.Group();
    this.openingInteractionRoot.name = 'opening-interaction-targets';
    this.scene.add(this.groundRoot, this.sceneryRoot, this.modelRoot, this.dimensionRoot, this.compassRoot, this.openingInteractionRoot);

    this.sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.addLighting();
    this.loadEnvironmentAssets();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.bindOpeningInteraction();
    this.animate();
  }

  bindOpeningInteraction() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => this.onOpeningPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onOpeningPointerMove(event));
    window.addEventListener('pointerup', (event) => this.onOpeningPointerUp(event));
    window.addEventListener('contextmenu', (event) => {
      if (!this.placement || !this.currentState) return;
      event.preventDefault();
      this.cancelOpeningPlacement(this.currentState);
    });
  }

  setRayFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  rebuildOpeningInteractionWalls(state) {
    disposeObject(this.openingInteractionRoot);
    this.openingInteractionRoot.clear();
    const halfW = state.width / 2;
    const halfL = state.length / 2;
    const surface = .235;
    const explodeT = THREE.MathUtils.clamp((Number(state.explode) || 0) / 100, 0, 1);
    const makeTarget = (side, span, position, rotationY = 0) => {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, state.eaveHeight), material);
      mesh.name = `opening-wall-target-${side}`;
      mesh.userData.wallSide = side;
      mesh.position.copy(position).addScaledVector(openingExplodeOffset(side), explodeT);
      mesh.position.y = state.eaveHeight / 2;
      mesh.rotation.y = rotationY;
      this.openingInteractionRoot.add(mesh);
    };
    makeTarget('front', state.width, new THREE.Vector3(0, 0, -halfL - surface), 0);
    makeTarget('back', state.width, new THREE.Vector3(0, 0, halfL + surface), Math.PI);
    makeTarget('left', state.length, new THREE.Vector3(-halfW - surface, 0, 0), -Math.PI / 2);
    makeTarget('right', state.length, new THREE.Vector3(halfW + surface, 0, 0), Math.PI / 2);
  }

  wallHitFromEvent(event, requiredSide = null) {
    this.setRayFromEvent(event);
    const targets = requiredSide
      ? this.openingInteractionRoot.children.filter((target) => target.userData.wallSide === requiredSide)
      : this.openingInteractionRoot.children;
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const side = hit.object.userData.wallSide;
    const u = side === 'front' || side === 'back' ? hit.point.x : hit.point.z;
    const explodeT = THREE.MathUtils.clamp((Number(this.currentState?.explode) || 0) / 100, 0, 1);
    const basePoint = hit.point.clone().addScaledVector(openingExplodeOffset(side), -explodeT);
    const baseU = side === 'front' || side === 'back' ? basePoint.x : basePoint.z;
    return { side, u: baseU, v: basePoint.y, point: basePoint };
  }

  openingGroup(id) {
    if (!id || !this.currentBuild?.root) return null;
    let found = null;
    this.currentBuild.root.traverse((object) => {
      if (!found && object.userData?.isOpeningRoot && object.userData.openingId === id) found = object;
    });
    return found;
  }

  openingMeshes() {
    const meshes = [];
    const group = this.currentBuild?.root?.getObjectByName('openings');
    group?.traverse((object) => {
      if (object.isMesh && object.userData?.openingId && !object.userData.resizeHandle) meshes.push(object);
    });
    return meshes;
  }

  resizeHandleMeshes() {
    const handles = [];
    const group = this.openingGroup(this.selectedOpeningId);
    group?.traverse((object) => {
      if (object.isMesh && object.userData?.resizeHandle) handles.push(object);
    });
    return handles;
  }

  openingById(id, state = this.currentState) {
    if (!state) return null;
    return normalizeOpenings(state).find((opening) => opening.id === id) ?? null;
  }

  selectOpening(id, state = this.currentState) {
    this.selectedOpeningId = id ?? null;
    this.refreshOpeningSelection(state);
    this.callbacks.onOpeningSelectionChange?.(this.selectedOpeningId);
  }

  refreshOpeningSelection(state = this.currentState) {
    if (!this.currentBuild?.root || !state) return;
    this.currentBuild.root.traverse((object) => {
      if (!object.userData?.isOpeningRoot) return;
      const old = object.getObjectByName('opening-runtime-selection');
      if (old) {
        disposeObject(old);
        old.removeFromParent();
      }
    });
    const opening = this.openingById(this.selectedOpeningId, state);
    const group = this.openingGroup(this.selectedOpeningId);
    if (!opening || !group) return;

    const helper = new THREE.Group();
    helper.name = 'opening-runtime-selection';
    const invalid = validateOpenings(state).invalidIds.has(opening.id);
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(opening.width + .08, opening.height + .08, .16)),
      new THREE.LineBasicMaterial({ color: invalid ? 0xff2727 : 0x087fbd, depthTest: false, transparent: true, opacity: .98 }),
    );
    line.position.y = opening.height / 2;
    line.renderOrder = 45;
    helper.add(line);

    const handleMaterial = new THREE.MeshBasicMaterial({ color: invalid ? 0xff4242 : 0x0c8bce, depthTest: false });
    const edgeHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const edgeHitThickness = Math.max(.10, Math.min(.16, Math.min(opening.width, opening.height) * .08));
    [
      ['left', edgeHitThickness, opening.height + edgeHitThickness, -opening.width / 2, opening.height / 2],
      ['right', edgeHitThickness, opening.height + edgeHitThickness, opening.width / 2, opening.height / 2],
      ['top', opening.width + edgeHitThickness, edgeHitThickness, 0, opening.height],
      ['bottom', opening.width + edgeHitThickness, edgeHitThickness, 0, 0],
    ].forEach(([key, width, height, x, y]) => {
      const hitArea = new THREE.Mesh(new THREE.BoxGeometry(width, height, .18), edgeHitMaterial.clone());
      hitArea.position.set(x, y, -.13);
      hitArea.userData.resizeHandle = key;
      hitArea.userData.openingId = opening.id;
      helper.add(hitArea);
    });

    const handleSize = Math.max(.10, Math.min(.16, Math.min(opening.width, opening.height) * .09));
    [
      ['left', -opening.width / 2, opening.height / 2],
      ['right', opening.width / 2, opening.height / 2],
      ['top', 0, opening.height],
      ['bottom', 0, 0],
      ['top-left', -opening.width / 2, opening.height],
      ['top-right', opening.width / 2, opening.height],
      ['bottom-left', -opening.width / 2, 0],
      ['bottom-right', opening.width / 2, 0],
    ].forEach(([key, x, y]) => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(handleSize, handleSize, handleSize), handleMaterial.clone());
      handle.position.set(x, y, -.13);
      handle.renderOrder = 46;
      handle.userData.resizeHandle = key;
      handle.userData.openingId = opening.id;
      helper.add(handle);
    });

    const widthLabel = labelObject(`${opening.width.toFixed(2)} m`, new THREE.Vector3(0, opening.height + .22, 0), 'opening-dimension-label');
    widthLabel.userData.dimensionKey = 'width';
    const heightLabel = labelObject(`${opening.height.toFixed(2)} m`, new THREE.Vector3(opening.width / 2 + .26, opening.height / 2, 0), 'opening-dimension-label');
    heightLabel.userData.dimensionKey = 'height';
    helper.add(widthLabel, heightLabel);
    group.add(helper);
  }

  refreshOpeningValidation(state = this.currentState) {
    if (!state || !this.currentBuild?.root) return null;
    const validation = validateOpenings(state);
    normalizeOpenings(state).forEach((opening) => {
      const group = this.openingGroup(opening.id);
      if (!group) return;
      const invalid = validation.invalidIds.has(opening.id);
      let runtime = group.getObjectByName('opening-runtime-invalid');
      const built = group.getObjectByName(`opening-invalid-outline-${opening.id}`);
      if (built) built.visible = invalid;
      if (invalid && !built && !runtime) {
        const baseWidth = group.userData.openingWidth || opening.width;
        const baseHeight = group.userData.openingHeight || opening.height;
        runtime = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(baseWidth + .10, baseHeight + .10, .17)),
          new THREE.LineBasicMaterial({ color: 0xff2424, depthTest: false, transparent: true, opacity: .98 }),
        );
        runtime.name = 'opening-runtime-invalid';
        runtime.position.y = baseHeight / 2;
        runtime.renderOrder = 44;
        group.add(runtime);
      } else if (runtime) {
        runtime.visible = invalid;
      }
    });
    this.callbacks.onOpeningPreview?.(this.selectedOpeningId, validation);
    return validation;
  }

  applyOpeningPosePreview(opening) {
    const group = this.openingGroup(opening.id);
    if (!group || !this.currentState) return;
    const state = this.currentState;
    const halfW = state.width / 2;
    const halfL = state.length / 2;
    const surface = .226;
    const basePosition = new THREE.Vector3();
    group.rotation.set(0, 0, 0);
    if (opening.side === 'front') basePosition.set(opening.offset, opening.bottom, -halfL - surface);
    else if (opening.side === 'back') { basePosition.set(opening.offset, opening.bottom, halfL + surface); group.rotation.y = Math.PI; }
    else if (opening.side === 'left') { basePosition.set(-halfW - surface, opening.bottom, opening.offset); group.rotation.y = -Math.PI / 2; }
    else { basePosition.set(halfW + surface, opening.bottom, opening.offset); group.rotation.y = Math.PI / 2; }
    const explodeOffset = openingExplodeOffset(opening.side);
    group.userData.basePosition = basePosition.clone();
    group.userData.explodeOffset = explodeOffset.clone();
    group.userData.openingSide = opening.side;
    group.position.copy(basePosition).addScaledVector(explodeOffset, THREE.MathUtils.clamp((Number(state.explode) || 0) / 100, 0, 1));

    const renderWidth = group.userData.openingWidth || opening.width;
    const renderHeight = group.userData.openingHeight || opening.height;
    group.scale.set(opening.width / Math.max(.001, renderWidth), opening.height / Math.max(.001, renderHeight), 1);
    const helper = group.getObjectByName('opening-runtime-selection');
    helper?.traverse((object) => {
      if (object.userData.dimensionKey === 'width' && object.element) object.element.textContent = `${opening.width.toFixed(2)} m`;
      if (object.userData.dimensionKey === 'height' && object.element) object.element.textContent = `${opening.height.toFixed(2)} m`;
    });
    this.refreshOpeningValidation(state);
  }

  closestWallToCamera() {
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (Math.abs(direction.z) >= Math.abs(direction.x)) return direction.z < 0 ? 'front' : 'back';
    return direction.x < 0 ? 'left' : 'right';
  }

  startOpeningPlacement(type, state = this.currentState) {
    if (!state) return;
    if (this.placement) this.cancelOpeningPlacement(state);
    const side = this.closestWallToCamera();
    const opening = makeOpening(type, side, 0);
    normalizeOpening(opening, state);
    normalizeOpenings(state).push(opening);
    this.placement = { id: opening.id, type };
    this.selectedOpeningId = opening.id;
    this.controls.enabled = false;
    this.callbacks.onOpeningPlacementChange?.(type);
    this.callbacks.onOpeningSelectionChange?.(opening.id);
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  confirmOpeningPlacement(state = this.currentState) {
    if (!this.placement || !state) return;
    this.placement = null;
    this.controls.enabled = true;
    this.callbacks.onOpeningPlacementChange?.(null);
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  cancelOpeningPlacement(state = this.currentState) {
    if (!this.placement || !state) return;
    const id = this.placement.id;
    state.openings = normalizeOpenings(state).filter((opening) => opening.id !== id);
    this.placement = null;
    if (this.selectedOpeningId === id) this.selectedOpeningId = null;
    this.controls.enabled = true;
    this.callbacks.onOpeningPlacementChange?.(null);
    this.callbacks.onOpeningSelectionChange?.(this.selectedOpeningId);
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  deleteOpening(id, state = this.currentState) {
    if (!state || !id) return;
    if (this.placement?.id === id) this.placement = null;
    state.openings = normalizeOpenings(state).filter((opening) => opening.id !== id);
    if (this.selectedOpeningId === id) this.selectedOpeningId = null;
    this.controls.enabled = true;
    this.callbacks.onOpeningPlacementChange?.(null);
    this.callbacks.onOpeningSelectionChange?.(this.selectedOpeningId);
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  moveOpeningToSide(id, side, state = this.currentState) {
    const opening = this.openingById(id, state);
    if (!opening || !['front', 'back', 'left', 'right'].includes(side)) return;
    opening.side = side;
    opening.offset = 0;
    normalizeOpening(opening, state);
    this.selectedOpeningId = opening.id;
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  onOpeningPointerDown(event) {
    if (!this.currentState || event.button !== 0) return;
    if (this.placement) {
      event.preventDefault();
      this.confirmOpeningPlacement(this.currentState);
      return;
    }
    this.setRayFromEvent(event);
    const handleHit = this.raycaster.intersectObjects(this.resizeHandleMeshes(), false)[0];
    if (handleHit) {
      const opening = this.openingById(handleHit.object.userData.openingId);
      if (!opening) return;
      event.preventDefault();
      this.controls.enabled = false;
      this.openingResize = { id: opening.id, handle: handleHit.object.userData.resizeHandle, start: { ...opening } };
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
      return;
    }

    const openingHit = this.raycaster.intersectObjects(this.openingMeshes(), true)[0];
    if (openingHit) {
      const id = openingHit.object.userData.openingId;
      const opening = this.openingById(id);
      if (!opening) return;
      event.preventDefault();
      this.selectOpening(id, this.currentState);
      this.controls.enabled = false;
      this.openingDrag = { id, start: { ...opening } };
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
      return;
    }
    this.selectOpening(null, this.currentState);
  }

  onOpeningPointerMove(event) {
    if (!this.currentState) return;
    if (this.placement) {
      const opening = this.openingById(this.placement.id);
      const hit = this.wallHitFromEvent(event);
      if (!opening || !hit) return;
      opening.side = hit.side;
      opening.offset = hit.u;
      opening.bottom = hit.v - opening.height / 2;
      normalizeOpening(opening, this.currentState);
      this.applyOpeningPosePreview(opening);
      this.callbacks.onOpeningSelectionChange?.(opening.id);
      return;
    }
    if (this.openingDrag) {
      const opening = this.openingById(this.openingDrag.id);
      const hit = this.wallHitFromEvent(event);
      if (!opening || !hit) return;
      opening.side = hit.side;
      opening.offset = hit.u;
      opening.bottom = hit.v - opening.height / 2;
      normalizeOpening(opening, this.currentState);
      this.applyOpeningPosePreview(opening);
      this.callbacks.onOpeningSelectionChange?.(opening.id);
      return;
    }
    if (this.openingResize) {
      const opening = this.openingById(this.openingResize.id);
      if (!opening) return;
      const hit = this.wallHitFromEvent(event, opening.side);
      if (!hit) return;
      const start = this.openingResize.start;
      let left = start.offset - start.width / 2;
      let right = start.offset + start.width / 2;
      let bottom = start.bottom;
      let top = start.bottom + start.height;
      const handle = this.openingResize.handle;
      const horizontalReversed = opening.side === 'back' || opening.side === 'right';
      if (handle.includes('left')) {
        if (horizontalReversed) right = hit.u;
        else left = hit.u;
      }
      if (handle.includes('right')) {
        if (horizontalReversed) left = hit.u;
        else right = hit.u;
      }
      if (handle === 'top' || handle.startsWith('top-')) top = hit.v;
      if (handle === 'bottom' || handle.startsWith('bottom-')) bottom = hit.v;
      if (right < left) [left, right] = [right, left];
      if (top < bottom) [bottom, top] = [top, bottom];
      opening.width = Math.max(.05, right - left);
      opening.height = Math.max(.05, top - bottom);
      opening.offset = (left + right) / 2;
      opening.bottom = bottom;
      normalizeOpening(opening, this.currentState);
      this.applyOpeningPosePreview(opening);
      this.callbacks.onOpeningSelectionChange?.(opening.id);
    }
  }

  onOpeningPointerUp(event) {
    if (!this.currentState || (!this.openingDrag && !this.openingResize)) return;
    try { this.renderer.domElement.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
    this.openingDrag = null;
    this.openingResize = null;
    this.controls.enabled = true;
    this.callbacks.onOpeningChange?.({ immediate: true });
  }

  projectOpeningEditor() {
    if (!this.selectedOpeningId) {
      this.callbacks.onOpeningEditorPosition?.({ visible: false });
      return;
    }
    const group = this.openingGroup(this.selectedOpeningId);
    if (!group || !group.visible) {
      this.callbacks.onOpeningEditorPosition?.({ visible: false });
      return;
    }
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      this.callbacks.onOpeningEditorPosition?.({ visible: false });
      return;
    }
    const point = box.getCenter(new THREE.Vector3());
    point.y = box.max.y + .18;
    point.project(this.camera);
    const rect = this.host.getBoundingClientRect();
    const visible = point.z > -1 && point.z < 1 && point.x > -1.2 && point.x < 1.2 && point.y > -1.2 && point.y < 1.2;
    this.callbacks.onOpeningEditorPosition?.({
      visible,
      x: rect.left + (point.x * .5 + .5) * rect.width,
      y: rect.top + (-point.y * .5 + .5) * rect.height,
    });
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

    const sceneSpan = Math.max(state.length, state.width);
    const fogNear = Math.max(32, sceneSpan * 1.18);
    const fogFar = Math.max(72, sceneSpan * 2.55 + 18);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;
    const size = Math.max(420, fogFar * 2.4);
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd9d3, roughness: .95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.groundRoot.add(ground);

    const gridSize = Math.max(80, fogFar * 1.65);
    const grid = new THREE.GridHelper(gridSize, Math.max(24, Math.round(gridSize / 2.4)), 0x9cadb1, 0xb9c5c4);
    grid.position.y = .006;
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
    house.position.add(new THREE.Vector3(houseX, .008, houseZ));
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
      tree.position.add(new THREE.Vector3(x, .008, z));
      tree.rotation.y = THREE.MathUtils.degToRad(rotation);
      tree.name = 'environment-tree';
      tree.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      this.sceneryRoot.add(tree);
    });
    this.updateCompass(state);
  }

  updateCompass(state) {
    const metrics = deriveHallMetrics(state);
    this.compassRoot.visible = Boolean(state.compassVisible);
    this.compassRoot.position.set(0, metrics.ridgeElevation + 1.15, 0);
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
    this.currentState = state;
    normalizeOpenings(state);
    disposeObject(this.modelRoot);
    this.modelRoot.clear();
    const built = buildHallModel(state);
    this.currentBuild = built;
    this.modelRoot.add(built.root);
    built.root.userData.showConnectionDetails = Boolean(state.connectionDetails || state.inspectionMode === 'connections' || state.inspectionMode === 'foundations');
    applyExplodedView(built.root, state.explode / 100);
    this.rebuildOpeningInteractionWalls(state);
    this.updateEnvironment(state);
    this.updateDimensions(state, built.metrics);
    this.applyDisplayState(state);
    this.applyEnvironment(state);
    this.refreshOpeningSelection(state);
    this.refreshOpeningValidation(state);
    if (fitCamera) this.fitCamera(state, built.metrics);
    return built;
  }

  setExplode(amount, state = this.currentState) {
    if (!this.currentBuild?.root) return;
    this.currentBuild.root.userData.showConnectionDetails = Boolean(state?.connectionDetails || state?.inspectionMode === 'connections' || state?.inspectionMode === 'foundations');
    applyExplodedView(this.currentBuild.root, amount / 100);
    if (state) this.rebuildOpeningInteractionWalls(state);
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
    this.scene.fog.color.setHex(dark ? 0x172536 : palette.bg);
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
    this.projectOpeningEditor();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
