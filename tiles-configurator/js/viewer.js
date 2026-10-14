import { reprojectRegions } from './referenceReprojection.js';
import { REGION_LIMITS } from './pavingRegions.js';
import { stoneAppearance } from './stoneAppearance.js';
import { houseGeometry } from './house.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clipRect, polygonArea } from './area.js';
import { COLORS, TILES, CURBS, curbLayout, areaGeometry } from './model.js';
import { calibratePhotoCamera } from './photoCalibration.js';
import { modelCameraMatrices, assertPhotoMatches } from './modelCamera.js';

const vertexLabel = (index) => {
  let value = index + 1,
    label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};
const snap = (value) => Math.round(value * 1000) / 1000;
const GROUND_Y = -0.16;
const PAVEMENT_VISUAL_THICKNESS = 0.002;
const HANDLE_DIAMETER_PX = 34;
const HANDLE_HIT_DIAMETER_PX = 50;
const PAVEMENT_SURFACE_OFFSET = 0.004;
const CURB_EXPOSED_HEIGHT = 0.035;

export function createViewer(host, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.style.position = host.style.position || 'relative';
  host.style.overflow = 'hidden';
  const photoBackdrop = document.createElement('img');
  photoBackdrop.className = 'tiles-photo-backdrop';
  photoBackdrop.alt = '';
  Object.assign(photoBackdrop.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: '0',
    display: 'none',
    background: '#ffffff',
    padding: '28px',
    boxSizing: 'border-box',
  });
  Object.assign(renderer.domElement.style, { position: 'relative', zIndex: '1' });
  host.append(photoBackdrop, renderer.domElement);
  const scene = new THREE.Scene(),
    standardBackground = new THREE.Color('#e6e9e5');
  scene.background = standardBackground.clone();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000),
    controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 0.8;
  controls.maxDistance = 800;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x859078, 2.7));
  const sun = new THREE.DirectionalLight(0xfff2df, 3.5);
  sun.position.set(-8, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.normalBias = 0.015;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshStandardMaterial({ color: '#cbd0c4', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.material.polygonOffset = true;
  ground.material.polygonOffsetFactor = 2;
  ground.material.polygonOffsetUnits = 4;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(40, 80, 0x0878c9, 0x93a5af);
  grid.position.y = GROUND_Y + 0.005;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  grid.visible = false;
  scene.add(grid);
  let group = new THREE.Group(),
    dimensions = new THREE.Group(),
    areaHandles = new THREE.Group(),
    areaDraft = new THREE.Group(),
    state,
    bounds,
    top = false,
    showDimensions = true,
    drawingArea = false,
    draftPoints = [],
    activeBoundaryKey = '',
    activeVertex = 0,
    drawingOperation = 'replace',
    preserveCameraOnNextRebuild = false,
    photoMode = false,
    photoSetup = false,
    photoNaturalWidth = 0,
    photoNaturalHeight = 0,
    photoCalibrationCorners = null,
    photoCalibration = null,
    modelPhotoCalibration = null,
    modelPhotoOrigin = { x: 0, z: 0 },
    photoLoadSequence = 0,
    photoWorldShift = { x: 0, z: 0 },
    preservePhotoPoseUntilInteraction = false,
    darkMode = false,
    debugPreviewVisible = true;
  scene.add(group, dimensions, areaHandles, areaDraft);
  const box = new THREE.BoxGeometry(1, 1, 1),
    dummy = new THREE.Object3D();
  // Seeded noise keeps concrete stable between rebuilds and avoids texture downloads.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(128, 128);
  let seed = 17;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const v = 170 + (seed % 65);
    pixels.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    bumpMap: texture,
    bumpScale: 0.0015,
  });
  function clear(g) {
    g.traverse((o) => {
      if (o.isInstancedMesh) {
        o.dispose();
        if (o.material !== material) o.material.dispose();
      }
      if (o.isMesh && !o.isInstancedMesh && o.geometry !== box) o.geometry.dispose();
      if (o.isLine) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      }
      if (o.isSprite) {
        o.material.map.dispose();
        o.material.dispose();
      }
    });
    g.clear();
  }
  function clearOverlay(g) {
    g.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material))
        o.material.forEach((m) => {
          m.map?.dispose?.();
          m.dispose?.();
        });
      else {
        o.material?.map?.dispose?.();
        o.material?.dispose?.();
      }
    });
    g.clear();
  }
  function drawPieces(parts, height, colorFor, baseY, { topOnly = false } = {}) {
    if (!parts.length) return;
    const pieceMaterial = topOnly ? material.clone() : material;
    if (topOnly) {
      pieceMaterial.polygonOffset = true;
      pieceMaterial.polygonOffsetFactor = -1;
      pieceMaterial.polygonOffsetUnits = -2;
    }
    const mesh = new THREE.InstancedMesh(box, pieceMaterial, parts.length);
    const renderHeight = topOnly ? Math.min(PAVEMENT_VISUAL_THICKNESS, Math.max(0.0005, height)) : height;
    const renderBaseY = topOnly
      ? baseY + height - renderHeight + PAVEMENT_SURFACE_OFFSET
      : baseY;
    parts.forEach((p, i) => {
      dummy.position.set(p.x - bounds.centerX, renderBaseY + renderHeight / 2, p.z - bounds.centerZ);
      dummy.rotation.set(0, -THREE.MathUtils.degToRad(Number(p.rotation) || 0), 0);
      dummy.scale.set(Math.max(0.001, p.l - 0.003), renderHeight, Math.max(0.001, p.w - 0.003));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const appearance = stoneAppearance(p, COLORS[colorFor(p, i)]);
      const color = new THREE.Color(appearance.base);
      color.multiplyScalar(appearance.brightness);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = !topOnly;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  function textSprite(text, { background = true, scale = 1 } = {}) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const context = c.getContext('2d');
    if (background) {
      // Match the pergola configurator's dimension-label treatment: compact,
      // rounded white surface, subtle border and a soft shadow.
      const x = 72,
        y = 24,
        width = 368,
        height = 80,
        radius = 16;
      context.save();
      context.shadowColor = 'rgba(13,21,26,.12)';
      context.shadowBlur = 16;
      context.shadowOffsetY = 4;
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
      context.fillStyle = 'rgba(255,255,255,.94)';
      context.fill();
      context.restore();

      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
      context.strokeStyle = 'rgba(21,31,37,.10)';
      context.lineWidth = 2;
      context.stroke();
    }
    context.fillStyle = background ? '#1b2328' : '#294536';
    context.font = `${background ? 800 : 800} ${background ? 34 : 48}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
    );
    sprite.renderOrder = 21;
    sprite.scale.set((background ? 1.06 : 1.35) * scale, (background ? 0.265 : 0.34) * scale, 1);
    return sprite;
  }
  function cornerLabel(text, x, z) {
    const sprite = textSprite(text, { background: false, scale: 0.62 });
    sprite.position.set(x, GROUND_Y + 0.19, z);
    dimensions.add(sprite);
  }
  function dimensionSegment(a, b) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: '#1e2529', depthTest: true, depthWrite: false }),
    );
    line.renderOrder = 18;
    dimensions.add(line);
  }
  function dimensionLine(start, end, label, outward, distance = 0.42) {
    // Keep the ground dimensions visually flush with the scene while leaving
    // enough depth separation from the ground plane to avoid z-fighting at
    // shallow camera angles. Depth testing remains enabled, so geometry can
    // still occlude the lines normally.
    const y = GROUND_Y + 0.01,
      sx = start.x + outward.x * distance,
      sz = start.z + outward.z * distance,
      ex = end.x + outward.x * distance,
      ez = end.z + outward.z * distance,
      a = new THREE.Vector3(sx, y, sz),
      b = new THREE.Vector3(ex, y, ez),
      tick = 0.17;
    dimensionSegment(a, b);
    for (const point of [a, b])
      dimensionSegment(
        new THREE.Vector3(point.x - outward.x * tick / 2, y, point.z - outward.z * tick / 2),
        new THREE.Vector3(point.x + outward.x * tick / 2, y, point.z + outward.z * tick / 2),
      );
    const sprite = textSprite(label);
    sprite.position.set((sx + ex) / 2, y + 0.025, (sz + ez) / 2);
    dimensions.add(sprite);
  }
  function edgeDimension(points, lengths, index, label) {
    const p = points[index],
      q = points[(index + 1) % points.length],
      length = lengths[index],
      outward = { x: (q.z - p.z) / length, z: -(q.x - p.x) / length };
    dimensionLine(p, q, label, outward);
  }
  function photoRect() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return { left: 0, top: 0, width, height };
    const horizontalPadding = Math.max(24, Math.round(width * 0.03)),
      verticalPadding = Math.max(24, Math.round(height * 0.03)),
      availableWidth = Math.max(1, width - horizontalPadding * 2),
      availableHeight = Math.max(1, height - verticalPadding * 2);
    if (!photoNaturalWidth || !photoNaturalHeight)
      return {
        left: horizontalPadding,
        top: verticalPadding,
        width: availableWidth,
        height: availableHeight,
      };
    const scale = Math.min(availableWidth / photoNaturalWidth, availableHeight / photoNaturalHeight),
      photoWidth = photoNaturalWidth * scale,
      photoHeight = photoNaturalHeight * scale;
    return {
      left: horizontalPadding + (availableWidth - photoWidth) / 2,
      top: verticalPadding + (availableHeight - photoHeight) / 2,
      width: photoWidth,
      height: photoHeight,
    };
  }
  function syncPhotoBackdropRect() {
    const r = photoRect();
    // Use the very same content rectangle for the background, masks and camera.
    // CSS object-fit plus a different padding would cause a subtle alignment error.
    Object.assign(photoBackdrop.style, { inset: 'auto', left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`, padding: '0' });
    host.style.backgroundColor = photoMode ? '#ffffff' : '';
    return r;
  }
  function setModelProjection({ pose = false } = {}) {
    if (!modelPhotoCalibration || !host.clientWidth || !host.clientHeight) return false;
    const m = modelCameraMatrices(modelPhotoCalibration,
      { width: host.clientWidth, height: host.clientHeight }, photoRect(), modelPhotoOrigin, GROUND_Y);
    camera.near = m.near; camera.far = m.far; camera.fov = m.fov;
    camera.aspect = host.clientWidth / host.clientHeight; camera.zoom = 1;
    // updateProjectionMatrix() would erase unequal focal lengths / principal point.
    camera.projectionMatrix.set(...m.projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    if (pose) {
      new THREE.Matrix4().set(...m.view).invert().decompose(camera.position, camera.quaternion, camera.scale);
      controls.target.set(-modelPhotoOrigin.x, GROUND_Y, -modelPhotoOrigin.z);
    }
    camera.updateMatrixWorld(true);
    return true;
  }
  function applyModelCalibration(calibration, origin = { x: 0, z: 0 }) {
    assertPhotoMatches(calibration, { width: photoNaturalWidth, height: photoNaturalHeight });
    // Validate viewport and origin before replacing any existing calibration.
    modelCameraMatrices(calibration, { width: host.clientWidth, height: host.clientHeight }, photoRect(), origin, GROUND_Y);
    modelPhotoCalibration = structuredClone(calibration); modelPhotoOrigin = { ...origin };
    photoCalibrationCorners = null; photoCalibration = null;
    photoWorldShift = { x: 0, z: 0 }; photoMode = true;
    preservePhotoPoseUntilInteraction = false;
    updatePhotoPresentation();
    return true;
  }
  function capturePhotoState() {
    return {
      calibration: modelPhotoCalibration ? { type: 'metric_model', value: structuredClone(modelPhotoCalibration), origin: { ...modelPhotoOrigin } }
        : photoCalibrationCorners ? { type: 'reference_square', corners: structuredClone(photoCalibrationCorners), shift: { ...photoWorldShift } } : null,
      photoMode, photoSetup, top,
      pose: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        target: controls.target.toArray(), projection: camera.projectionMatrix.toArray(), fov: camera.fov, aspect: camera.aspect },
    };
  }
  // History snapshots are private. Persisted views must pass validateSavedView first.
  function restorePhotoState(snapshot, { force = false } = {}) {
    if (!snapshot) return;
    const sameCalibration = JSON.stringify(capturePhotoState().calibration) === JSON.stringify(snapshot.calibration);
    const sameMode = photoMode === snapshot.photoMode;
    if (!force && sameCalibration && sameMode && photoSetup === snapshot.photoSetup) return;
    const c = snapshot.calibration;
    modelPhotoCalibration = c?.type === 'metric_model' ? structuredClone(c.value) : null;
    modelPhotoOrigin = c?.type === 'metric_model' ? { ...c.origin } : { x: 0, z: 0 };
    photoCalibrationCorners = c?.type === 'reference_square' ? structuredClone(c.corners) : null;
    photoCalibration = null;
    photoWorldShift = c?.type === 'reference_square' ? { ...c.shift } : { x: 0, z: 0 };
    photoMode = snapshot.photoMode; top = snapshot.top;
    if (photoCalibrationCorners) applyPhotoCalibrationPose();
    setPhotoSetup(snapshot.photoSetup); updatePhotoPresentation();
    if (!photoMode && snapshot.pose) {
      camera.position.fromArray(snapshot.pose.position); camera.quaternion.fromArray(snapshot.pose.quaternion);
      camera.scale.set(1, 1, 1); controls.target.fromArray(snapshot.pose.target);
      if (modelPhotoCalibration) setModelProjection();
      else {
        camera.fov = snapshot.pose.fov; camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(true); preservePhotoPoseUntilInteraction = true;
    }
    drawAreaHandles();
  }
  function syncFreeCameraFromPhotoPose() {
    // Keep the calibrated camera transform exactly as-is when the photo disappears.
    // OrbitControls normally runs update() every frame and can immediately re-orient
    // the camera to its own spherical/up-vector state, which makes the free view look
    // slightly higher even though the same calibrated pose was just applied.
    // Set a sensible orbit target on the current view ray, but do not let OrbitControls
    // touch the camera until the user actually starts interacting with it.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize(),
      groundDistance =
        Math.abs(forward.y) > 1e-6 ? (GROUND_Y - camera.position.y) / forward.y : NaN,
      fallbackDistance = Math.max(
        controls.minDistance,
        camera.position.distanceTo(controls.target),
      ),
      orbitDistance =
        Number.isFinite(groundDistance) && groundDistance > controls.minDistance
          ? groundDistance
          : fallbackDistance;
    controls.target.copy(camera.position).addScaledVector(forward, orbitDistance);
    top = false;
    controls.enabled = true;
    preservePhotoPoseUntilInteraction = true;
  }
  function applyPhotoCalibrationPose() {
    if (modelPhotoCalibration) return setModelProjection({ pose: true });
    if (!photoCalibrationCorners || !photoNaturalWidth || !photoNaturalHeight) return false;
    const width = host.clientWidth,
      height = host.clientHeight,
      rect = photoRect();
    if (!width || !height || !rect.width || !rect.height) return false;
    const corners = photoCalibrationCorners.map((point) => ({
        x: rect.left + point.x * rect.width,
        y: rect.top + point.y * rect.height,
      })),
      calibration = calibratePhotoCamera(corners, width, height);
    if (!calibration) return false;
    photoCalibration = calibration;
    const m = calibration.viewMatrix,
      view = new THREE.Matrix4().set(
        m[0], m[1], m[2], m[3],
        m[4], m[5], m[6], m[7],
        m[8], m[9], m[10], m[11],
        m[12], m[13], m[14], m[15],
      ),
      world = view.clone().invert();
    world.decompose(camera.position, camera.quaternion, camera.scale);
    camera.position.y += GROUND_Y;
    camera.position.x += photoWorldShift.x;
    camera.position.z += photoWorldShift.z;
    camera.fov = calibration.fov;
    camera.aspect = width / height;
    camera.near = 0.01;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    controls.target.set(photoWorldShift.x, GROUND_Y, photoWorldShift.z);
    return true;
  }
  function updatePhotoPresentation() {
    syncPhotoBackdropRect();
    photoBackdrop.style.display = photoMode ? 'block' : 'none';
    if (photoMode) {
      scene.background = null;
      renderer.setClearAlpha(0);
      ground.visible = false;
      grid.visible = false;
      controls.enabled = false;
      applyPhotoCalibrationPose();
    } else {
      scene.background = new THREE.Color(darkMode ? '#242c30' : '#e6e9e5');
      renderer.setClearAlpha(1);
      ground.visible = true;
      controls.enabled = !drawingArea;
    }
  }
  function setPhotoView(enabled) {
    enabled = Boolean(enabled);
    if (enabled) {
      if (!photoCalibrationCorners && !modelPhotoCalibration) return false;
      preservePhotoPoseUntilInteraction = false;
      photoMode = true;
      updatePhotoPresentation();
      return Boolean(photoCalibration || modelPhotoCalibration);
    }
    if (photoSetup) return false;
    if (photoMode) {
      photoMode = false;
      updatePhotoPresentation();
      syncFreeCameraFromPhotoPose();
      // updatePhotoPresentation() is also used during drawing/setup and can change
      // the enabled state. At this point setup is complete, so free-camera mode must
      // always be interactive.
      controls.enabled = true;
      renderer.domElement.style.cursor = '';
    }
    return true;
  }
  function setPhotoSetup(active) {
    photoSetup = Boolean(active);
    group.visible = !photoSetup && debugPreviewVisible;
    dimensions.visible = !photoSetup && showDimensions && !drawingArea;
    areaHandles.visible = !photoSetup && !drawingArea;
    if (photoSetup) controls.enabled = false;
    else if (photoMode) controls.enabled = false;
  }
  function loadSitePhoto(url, { isCurrent = () => true } = {}) {
    const sequence = ++photoLoadSequence;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        image.onload = image.onerror = null;
        if (sequence !== photoLoadSequence || !isCurrent()) { reject(new Error('stalePhoto')); return; }
        photoCalibrationCorners = null; photoCalibration = null; modelPhotoCalibration = null;
        modelPhotoOrigin = { x: 0, z: 0 }; photoWorldShift = { x: 0, z: 0 };
        photoNaturalWidth = image.naturalWidth; photoNaturalHeight = image.naturalHeight;
        photoMode = true; setPhotoSetup(true); photoBackdrop.src = url;
        updatePhotoPresentation();
        callbacks.onPhotoRectChange?.(photoRect());
        resolve({ width: photoNaturalWidth, height: photoNaturalHeight, rect: photoRect() });
      };
      image.onerror = () => { image.onload = image.onerror = null; reject(new Error('photoLoadFailed')); };
      image.src = url;
    });
  }
  function clearSitePhoto() {
    photoLoadSequence++;
    photoBackdrop.removeAttribute('src');
    photoNaturalWidth = photoNaturalHeight = 0;
    modelPhotoCalibration = photoCalibrationCorners = photoCalibration = null;
    modelPhotoOrigin = {x:0,z:0}; photoWorldShift = {x:0,z:0};
    photoMode = false; preservePhotoPoseUntilInteraction = false;
    camera.fov = 40; camera.zoom = 1;
    camera.aspect = host.clientWidth / Math.max(1,host.clientHeight);
    camera.updateProjectionMatrix();
    setPhotoSetup(false); updatePhotoPresentation();
  }
  function applyPhotoCalibration(corners) {
    if (!Array.isArray(corners) || corners.length !== 4) return false;
    const normalized = corners.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }));
    if (
      normalized.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.x > 1 ||
          point.y < 0 ||
          point.y > 1,
      )
    )
      return false;
    const r = photoRect();
    if (!calibratePhotoCamera(normalized.map(p => ({ x: r.left + p.x*r.width, y: r.top + p.y*r.height })), host.clientWidth, host.clientHeight)) return false;
    modelPhotoCalibration = null;
    photoCalibrationCorners = normalized;
    photoMode = true;
    updatePhotoPresentation();
    return Boolean(photoCalibration);
  }
  function prepareReferenceRecalibration(regions, origin, corners) {
    const before = capturePhotoState();
    if (!before.calibration) throw new Error('A current photo calibration is required to preserve an existing design.');
    try {
      // Use the PHOTO pose even when the user came from free camera.
      applyPhotoCalibrationPose();
      const oldProjection = camera.projectionMatrix.clone(), oldView = camera.matrixWorldInverse.clone();
      const project = p => {
        const point = new THREE.Vector3(p.x - origin.x, GROUND_Y, p.z - origin.z).applyMatrix4(oldView);
        if (point.z >= -camera.near) return null;
        point.applyMatrix4(oldProjection);
        return new THREE.Vector2(point.x, point.y);
      };
      photoWorldShift = { x: 0, z: 0 };
      if (!applyPhotoCalibration(corners)) throw new Error('The reference square is invalid. Keep its four corners in order.');
      const ray = new THREE.Raycaster(), surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
      const unproject = pixel => {
        ray.setFromCamera(pixel, camera);
        const point = ray.ray.intersectPlane(surface, new THREE.Vector3());
        return point && { x: point.x, z: point.z };
      };
      const converted = reprojectRegions(regions, project, unproject);
      return { regions: converted, origin: { x: 0, z: 0 }, photoView: capturePhotoState() };
    } finally { restorePhotoState(before); }
  }
  function shiftPhotoWorld(dx, dz) {
    dx = Number(dx);
    dz = Number(dz);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
    if (modelPhotoCalibration) {
      modelPhotoOrigin.x -= dx; modelPhotoOrigin.z -= dz;
      if (photoMode) applyPhotoCalibrationPose();
      return true;
    }
    photoWorldShift.x += dx;
    photoWorldShift.z += dz;
    if (photoMode && photoCalibrationCorners) applyPhotoCalibrationPose();
    return true;
  }
  function completePhotoSetup() {
    setPhotoSetup(false);
    group.visible = debugPreviewVisible;
    drawAreaHandles();
    dimensions.visible = showDimensions && !drawingArea;
    setPhotoView(true);
  }
  function fit() {
    if (!state || !bounds) return;
    const size = Math.max(
        1, bounds.width,
        bounds.depth,
        state.houseEnabled ? state.houseHeight * 2 : 0,
      ),
      distance = (size * 1.55) / Math.min(1, camera.aspect);
    const cx = (bounds.minX + bounds.maxX) / 2 - bounds.centerX,
      cz = (bounds.minZ + bounds.maxZ) / 2 - bounds.centerZ;
    controls.target.set(cx, GROUND_Y, cz);
    camera.position.set(
      cx + (top ? 0 : distance * 0.8),
      GROUND_Y + (top ? distance * 1.5 : distance),
      cz + (top ? 0.001 : distance),
    );
    controls.update();
  }
  function prism(polygon, height, baseY) {
    const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(-bounds.centerX, baseY, -bounds.centerZ);
    return geometry;
  }
  function drawPolygons(items, height, baseY, { topOnly = false } = {}) {
    if (!items.length) return;
    const geometries = [];
    const renderHeight = topOnly ? Math.min(PAVEMENT_VISUAL_THICKNESS, Math.max(0.0005, height)) : height;
    const renderBaseY = topOnly
      ? baseY + height - renderHeight + PAVEMENT_SURFACE_OFFSET
      : baseY;
    for (const { polygon, color, stone } of items) {
      if (polygon.length < 3 || polygonArea(polygon) < 1e-9) continue;
      const geometry = prism(polygon, renderHeight, renderBaseY),
        appearance = stoneAppearance(stone, COLORS[color]);
      const shade = new THREE.Color(appearance.base);
      shade.multiplyScalar(appearance.brightness);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([shade.r, shade.g, shade.b], i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry);
    }
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    const mat = material.clone();
    mat.vertexColors = true;
    if (topOnly) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -2;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !topOnly;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  function handleSize() {
    return Math.max(0.075, Math.min(0.18, Math.max(bounds?.width || 6, bounds?.depth || 4) * 0.014));
  }
  function makeHandleTexture(index, first) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(64, 64, 55, 0, Math.PI * 2);
    context.fillStyle = first ? '#22a06b' : '#0878c9';
    context.fill();
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(255,255,255,.95)';
    context.stroke();
    context.fillStyle = '#12313d';
    context.font = '800 42px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Unlabelled handles stay legible on dense contours; the selected vertex is identified in the panel.
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function makeHandle(x, z, index, first = false) {
    // Sprites always face the camera. Their world scale is updated every frame from
    // camera-space depth so every visible marker is exactly 34 CSS px on screen.
    const group = new THREE.Group(),
      disc = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeHandleTexture(index, first),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      ),
      hitTarget = new THREE.Sprite(
        new THREE.SpriteMaterial({
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      );
    // Bottom-anchor the marker to the actual ground point. The invisible hit sprite
    // is larger for easy dragging, but both keep a fixed screen-space diameter.
    disc.center.set(0.5, 0.06);
    hitTarget.center.set(0.5, 0.06);
    disc.scale.setScalar(0.001);
    hitTarget.scale.setScalar(0.001);
    disc.renderOrder = 20;
    hitTarget.renderOrder = 20;
    disc.userData.areaPoint = index;
    disc.userData.handlePixels = HANDLE_DIAMETER_PX;
    hitTarget.userData.areaPoint = index;
    hitTarget.userData.handlePixels = HANDLE_HIT_DIAMETER_PX;
    group.userData.areaPoint = index;
    group.position.set(x, GROUND_Y + 0.004, z);
    group.add(hitTarget, disc);
    return group;
  }
  const handleWorldPosition = new THREE.Vector3(),
    handleCameraPosition = new THREE.Vector3();
  function updateHandleScreenSizes(container) {
    if (!container?.visible || !host.clientHeight) return;
    camera.updateMatrixWorld(true);
    const projection = camera.projectionMatrix.elements,
      pixelsPerUnitX = Math.abs(projection[0]) * Math.max(1, host.clientWidth) / 2,
      pixelsPerUnitY = Math.abs(projection[5]) * Math.max(1, host.clientHeight) / 2;
    container.traverse((object) => {
      const pixels = object.userData?.handlePixels;
      if (!pixels || !object.isSprite) return;
      object.getWorldPosition(handleWorldPosition);
      handleCameraPosition.copy(handleWorldPosition).applyMatrix4(camera.matrixWorldInverse);
      const depth = -handleCameraPosition.z;
      if (depth <= camera.near) return;
      object.scale.set(pixels * depth / pixelsPerUnitX, pixels * depth / pixelsPerUnitY, 1);
    });
  }
  function activeBoundary() {
    return bounds?.boundaries?.find((b) => b.key === activeBoundaryKey);
  }
  function drawAreaHandles() {
    clearOverlay(areaHandles);
    if (photoSetup || drawingArea || !state || !bounds) return;
    if (!['custom', 'regions'].includes(state.shape)) return;
    for (const boundary of bounds.boundaries) {
      const selected = boundary.key === activeBoundaryKey;
      const pts = [...boundary.points, boundary.points[0]].map((p) =>
        new THREE.Vector3(p.x - bounds.centerX, GROUND_Y + .008, p.z - bounds.centerZ));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: boundary.hole ? '#bd542f' : '#0878c9',
          transparent: true, opacity: selected ? .95 : .45, depthTest: false }));
      line.renderOrder = 19;
      areaHandles.add(line);
      if (!selected) continue;
      // Display a bounded sample plus neighbours of the selected vertex. Geometry
      // keeps EVERY vertex. The numeric selector exposes vertices not shown here.
      const n = boundary.points.length, stride = Math.max(1, Math.ceil(n / 48)), indices = new Set();
      for (let i = 0; i < n; i += stride) indices.add(i);
      for (let d = -3; d <= 3; d++) indices.add(((activeVertex + d) % n + n) % n);
      for (const i of indices) {
        const p = boundary.points[i];
        areaHandles.add(makeHandle(p.x - bounds.centerX, p.z - bounds.centerZ, i, i === activeVertex));
      }
    }
    updateHandleScreenSizes(areaHandles);
  }
  function renderDraft(points, { local = false } = {}) {
    clearOverlay(areaDraft);
    if (!points.length) return;
    const world = local
      ? points.map((p) => ({ x: p.x - bounds.centerX, z: p.z - bounds.centerZ }))
      : points;
    if (world.length > 1) {
      const linePoints = world.length >= 3 ? [...world, world[0]] : world;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        linePoints.map((p) => new THREE.Vector3(p.x, GROUND_Y + 0.008, p.z)),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: drawingOperation === 'remove' ? '#bd542f' : '#0878c9', depthTest: false }),
      );
      line.renderOrder = 19;
      areaDraft.add(line);
    }
    const stride = local ? Math.max(1, Math.ceil(world.length / 48)) : 1;
    world.forEach((p, i) => {
      if (i % stride === 0 || Math.abs(i - activeVertex) <= 3)
        areaDraft.add(makeHandle(p.x, p.z, i, local ? i === activeVertex : i === 0));
    });
    updateHandleScreenSizes(areaDraft);
  }
  function updateDraftCallback() {
    callbacks.onAreaDraftChange?.(draftPoints.map((p) => ({ ...p })));
  }
  function setPreviousAreaVisible(visible) {
    group.children.forEach((child) => {
      child.visible = !photoSetup && (visible || child.userData.house === true);
    });
    dimensions.visible = !photoSetup && visible && showDimensions;
  }
  function rebuild(s, parts) {
    const nextBounds = areaGeometry(s),
      changed = !bounds || JSON.stringify(bounds.regions) !== JSON.stringify(nextBounds.regions),
      firstBuild = !bounds;
    state = s;
    bounds = nextBounds;
    clear(group);
    clear(dimensions);
    // The surrounding ground is only a thin plane, so true below-ground paving
    // geometry stays visually exposed at the perimeter. Render the paving itself
    // as a near-zero-thickness top surface at ground level, and keep the curbs as
    // full 3D elements that protrude above the ground.
    const t = TILES[s.tile],
      pavementBaseY = GROUND_Y - t.thickness;
    drawPieces(
      parts.filter((p) => !p.fragments),
      t.thickness,
      (p) => (p.accent ? s.accent : s.color),
      pavementBaseY,
      { topOnly: true },
    );
    const cuts = [];
    parts.forEach((p) => {
      for (const fragment of p.fragments || []) {
        const rotated = Math.abs((Number(p.rotation) || 0) % 180) > 1e-6;
        let polygon;
        if (p.profile) {
          const cx = fragment.reduce((sum, v) => sum + v.x, 0) / fragment.length,
            cz = fragment.reduce((sum, v) => sum + v.z, 0) / fragment.length;
          polygon = fragment.map((v) => ({
            x: cx + (v.x - cx) * 0.985,
            z: cz + (v.z - cz) * 0.985,
          }));
        } else if (rotated) {
          const cx = fragment.reduce((sum, v) => sum + v.x, 0) / fragment.length,
            cz = fragment.reduce((sum, v) => sum + v.z, 0) / fragment.length,
            inset = Math.min(0.02, 0.0015 / Math.max(0.001, Math.min(p.l, p.w))),
            factor = Math.max(0.9, 1 - inset);
          polygon = fragment.map((v) => ({
            x: cx + (v.x - cx) * factor,
            z: cz + (v.z - cz) * factor,
          }));
        } else {
          polygon = clipRect(
            fragment,
            p.x - p.l / 2 + 0.0015,
            p.z - p.w / 2 + 0.0015,
            Math.max(0.001, p.l - 0.003),
            Math.max(0.001, p.w - 0.003),
          );
        }
        cuts.push({ polygon, color: p.accent ? s.accent : s.color, stone: p });
      }
    });
    drawPolygons(cuts, t.thickness, pavementBaseY, { topOnly: true });
    const curb = CURBS[s.curb],
      curbs = curbLayout(s),
      visibleCurbHeight = Math.min(CURB_EXPOSED_HEIGHT, curb.height);
    // The uploaded photo is only a 2D backdrop, so it cannot occlude the buried
    // part of a curb. Render only the curb portion that is actually above ground.
    // The model/BOM can still keep the curb's full physical height.
    drawPieces(
      curbs.filter((p) => !p.polygon && !p.fragments),
      visibleCurbHeight,
      () => s.curbColor,
      GROUND_Y,
    );
    drawPolygons(
      curbs
        .flatMap((p) =>
          (p.fragments || (p.polygon ? [p.polygon] : [])).map((polygon) => ({ polygon, stone: p })),
        )
        .map((p) => {
          const cx = p.polygon.reduce((a, v) => a + v.x, 0) / p.polygon.length,
            cz = p.polygon.reduce((a, v) => a + v.z, 0) / p.polygon.length;
          return {
            polygon: p.polygon.map((v) => ({
              x: cx + (v.x - cx) * 0.996,
              z: cz + (v.z - cz) * 0.996,
            })),
            color: s.curbColor,
            stone: p.stone,
          };
        }),
      visibleCurbHeight,
      GROUND_Y,
    );
    if (s.houseEnabled) {
      const house = houseGeometry(s);
      const walls = new THREE.Mesh(
        prism(house.outline, s.houseHeight, GROUND_Y),
        new THREE.MeshStandardMaterial({ color: '#e5ded0', roughness: 0.9 }),
      );
      walls.userData.house = true;
      walls.castShadow = true;
      walls.receiveShadow = true;
      group.add(walls);
      const roof = new THREE.Mesh(
        prism(house.outline, 0.12, GROUND_Y + s.houseHeight),
        new THREE.MeshStandardMaterial({ color: '#4c555a', roughness: 0.85 }),
      );
      roof.userData.house = true;
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);
    }
    const centredPoints = bounds.points.map((p) => ({
      x: p.x - bounds.centerX,
      z: p.z - bounds.centerZ,
    }));
    if (s.shape === 'regions') {
      // Two overall dimensions instead of hundreds of tiny contour labels.
      if (bounds.area > 0) {
        const x0 = bounds.minX - bounds.centerX, x1 = bounds.maxX - bounds.centerX,
          z0 = bounds.minZ - bounds.centerZ, z1 = bounds.maxZ - bounds.centerZ;
        dimensionLine({ x: x0, z: z0 }, { x: x1, z: z0 }, `${bounds.width.toFixed(2)} m`, { x: 0, z: -1 });
        dimensionLine({ x: x1, z: z0 }, { x: x1, z: z1 }, `${bounds.depth.toFixed(2)} m`, { x: 1, z: 0 });
      }
    } else if (s.shape === 'rectangle') {
      edgeDimension(centredPoints, bounds.lengths, 0, `${s.length.toFixed(2)} m`);
      edgeDimension(centredPoints, bounds.lengths, 1, `${s.width.toFixed(2)} m`);
    } else
      centredPoints.forEach((p, i) => {
        const a = vertexLabel(i),
          b = vertexLabel((i + 1) % centredPoints.length);
        edgeDimension(
          centredPoints,
          bounds.lengths,
          i,
          `${a}${b} · ${bounds.lengths[i].toFixed(2)} m`,
        );
      });
    if (drawingArea) setPreviousAreaVisible(drawingOperation !== 'replace');
    else dimensions.visible = !photoSetup && showDimensions;
    drawAreaHandles();
    if (photoMode) {
      preserveCameraOnNextRebuild = false;
      applyPhotoCalibrationPose();
    } else if (changed && !drawingArea) {
      if (preserveCameraOnNextRebuild) preserveCameraOnNextRebuild = false;
      else if (firstBuild || s.shape !== 'regions') fit();
    } else if (preserveCameraOnNextRebuild && !drawingArea) {
      preserveCameraOnNextRebuild = false;
    }
  }
  // Dispose the unique bedding material before replacing the group.
  function releaseBase() {
    group.children
      .filter((o) => o.isMesh && !o.isInstancedMesh)
      .forEach((o) => o.material.dispose());
  }
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    syncPhotoBackdropRect();
    camera.aspect = w / h;
    if (modelPhotoCalibration) setModelProjection({ pose: photoMode });
    else camera.updateProjectionMatrix();
    if (photoMode && photoCalibrationCorners) applyPhotoCalibrationPose();
    // Once a photo-calibrated scene exists, resizing the viewer (for example when
    // switching modes or opening/closing UI) must not call fit(), because that would
    // replace the calibrated free-camera pose with the generic fitted overview.
    else if (!photoSetup && !photoCalibrationCorners && !modelPhotoCalibration) fit();
    callbacks.onPhotoRectChange?.(photoRect());
  };
  new ResizeObserver(resize).observe(host);
  resize();
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
  let houseDrag = null,
    pendingHouse = null,
    houseDragFrame = 0,
    areaDrag = null,
    draftPointDrag = null,
    drawPointer = null;
  function ray(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }
  function planeHit(event) {
    ray(event);
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }
  function flushHouseDrag() {
    houseDragFrame = 0;
    if (pendingHouse) {
      const value = pendingHouse;
      pendingHouse = null;
      callbacks.onHouseMove?.(value);
    }
  }
  function restorePointerInteraction() {
    controls.enabled = !photoMode && !photoSetup;
    renderer.domElement.style.cursor = drawingArea ? 'crosshair' : '';
  }
  const releasePhotoPosePreservation = () => {
    preservePhotoPoseUntilInteraction = false;
  };
  // Boundary drags must not release the calibrated free-camera pose.
  renderer.domElement.addEventListener('wheel', releasePhotoPosePreservation, {
    capture: true,
    passive: true,
  });
  renderer.domElement.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      if (drawingArea) {
        if (photoMode) {
          const canvasRect = renderer.domElement.getBoundingClientRect(),
            imageRect = photoRect(),
            px = event.clientX - canvasRect.left,
            py = event.clientY - canvasRect.top;
          if (
            px < imageRect.left ||
            px > imageRect.left + imageRect.width ||
            py < imageRect.top ||
            py > imageRect.top + imageRect.height
          )
            return;
        }
        ray(event);
        const handleHit = raycaster.intersectObjects(
          areaDraft.children.filter((child) => child.userData.areaPoint !== undefined),
          true,
        )[0];
        if (handleHit) {
          draftPointDrag = {
            id: event.pointerId,
            index: handleHit.object.userData.areaPoint,
            x: event.clientX,
            y: event.clientY,
            moved: false,
            original: { ...draftPoints[handleHit.object.userData.areaPoint] },
          };
          preservePhotoPoseUntilInteraction = true;
          drawPointer = null;
          controls.enabled = false;
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = 'grabbing';
          event.stopImmediatePropagation();
          event.preventDefault();
          return;
        }
        drawPointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
        return;
      }

      const hit = planeHit(event);
      if (!hit) return;

      if (['custom', 'regions'].includes(state?.shape) && activeBoundary() && areaHandles.children.length) {
        ray(event);
        const handleHit = raycaster.intersectObjects(areaHandles.children, true)
          .find((hit) => Number.isInteger(hit.object.userData.areaPoint));
        if (handleHit) {
          areaDrag = {
            id: event.pointerId,
            index: handleHit.object.userData.areaPoint,
            key: activeBoundaryKey,
            points: activeBoundary().points.map((p) => ({ ...p })),
            startX: event.clientX, startY: event.clientY, moved: false,
            hitX: hit.x, hitZ: hit.z,
          };
          preservePhotoPoseUntilInteraction = true;
          areaDrag.original = { ...areaDrag.points[areaDrag.index] };
          activeVertex = areaDrag.index;
          callbacks.onAreaVertexSelect?.(activeVertex);
          controls.enabled = false;
          areaHandles.visible = false;
          renderDraft(areaDrag.points, { local: true });
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = 'grabbing';
          event.stopImmediatePropagation();
          event.preventDefault();
          return;
        }
      }

      if (!state?.houseEnabled) { releasePhotoPosePreservation(); return; }
      ray(event);
      if (
        !raycaster.intersectObjects(
          group.children.filter((o) => o.userData.house),
          false,
        ).length
      ) { releasePhotoPosePreservation(); return; }
      houseDrag = {
        id: event.pointerId,
        x: hit.x,
        z: hit.z,
        houseX: state.houseX,
        houseZ: state.houseZ,
      };
      controls.enabled = false;
      callbacks.onHouseDragStart?.();
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
      event.stopImmediatePropagation();
      event.preventDefault();
    },
    true,
  );
  renderer.domElement.addEventListener(
    'pointermove',
    (event) => {
      if (draftPointDrag && event.pointerId === draftPointDrag.id) {
        const hit = planeHit(event);
        if (!hit) return;
        if (Math.hypot(event.clientX - draftPointDrag.x, event.clientY - draftPointDrag.y) > 3)
          draftPointDrag.moved = true;
        if (draftPointDrag.moved) {
          draftPoints[draftPointDrag.index] = { x: snap(hit.x), z: snap(hit.z) };
          renderDraft(draftPoints);
          updateDraftCallback();
        }
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (drawingArea && drawPointer && event.pointerId === drawPointer.id) {
        if (Math.hypot(event.clientX - drawPointer.x, event.clientY - drawPointer.y) > 5)
          { drawPointer.moved = true; releasePhotoPosePreservation(); }
      }
      if (areaDrag && event.pointerId === areaDrag.id) {
        const hit = planeHit(event);
        if (!hit) return;
        if (Math.hypot(event.clientX - areaDrag.startX, event.clientY - areaDrag.startY) > 3)
          areaDrag.moved = true;
        if (!areaDrag.moved) return;
        areaDrag.points[areaDrag.index] = {
          x: snap(areaDrag.original.x + hit.x - areaDrag.hitX),
          z: snap(areaDrag.original.z + hit.z - areaDrag.hitZ),
        };
        renderDraft(areaDrag.points, { local: true });
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (!houseDrag || event.pointerId !== houseDrag.id) return;
      const hit = planeHit(event);
      if (!hit) return;
      pendingHouse = {
        houseX: Math.round((houseDrag.houseX + hit.x - houseDrag.x) * 100) / 100,
        houseZ: Math.round((houseDrag.houseZ + hit.z - houseDrag.z) * 100) / 100,
      };
      if (!houseDragFrame) houseDragFrame = requestAnimationFrame(flushHouseDrag);
      event.stopImmediatePropagation();
    },
    true,
  );
  function endDrag(event) {
    if (draftPointDrag && event.pointerId === draftPointDrag.id) {
      const finishedByFirstPoint =
        event.type === 'pointerup' && draftPointDrag.index === 0 && !draftPointDrag.moved && draftPoints.length >= 3;
      if (event.type !== 'pointerup') {
        draftPoints[draftPointDrag.index] = draftPointDrag.original;
        renderDraft(draftPoints); updateDraftCallback();
      }
      draftPointDrag = null;
      restorePointerInteraction();
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      if (finishedByFirstPoint) callbacks.onAreaFinishRequested?.();
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    if (drawingArea && drawPointer && event.pointerId === drawPointer.id) {
      const candidate = drawPointer;
      drawPointer = null;
      if (event.type === 'pointerup' && !candidate.moved) {
        const hit = planeHit(event);
        if (hit) {
          if (draftPoints.length < REGION_LIMITS.vertices) {
            const point = { x: snap(hit.x), z: snap(hit.z) };
            if (
              !draftPoints.length ||
              Math.hypot(point.x - draftPoints.at(-1).x, point.z - draftPoints.at(-1).z) >= 0.005
            ) {
              draftPoints.push(point);
              renderDraft(draftPoints);
              updateDraftCallback();
            }
          }
        }
      }
      return;
    }
    if (areaDrag && event.pointerId === areaDrag.id) {
      const points = areaDrag.points.map((p) => ({ ...p })), key = areaDrag.key,
        commit = event.type === 'pointerup' && areaDrag.moved;
      areaDrag = null;
      clearOverlay(areaDraft);
      areaHandles.visible = true;
      preserveCameraOnNextRebuild = true;
      if (commit) callbacks.onAreaPointMove?.(points, key);
      else drawAreaHandles();
      restorePointerInteraction();
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      event.stopImmediatePropagation();
      return;
    }
    if (!houseDrag || event.pointerId !== houseDrag.id) return;
    if (houseDragFrame) cancelAnimationFrame(houseDragFrame);
    flushHouseDrag();
    houseDrag = null;
    restorePointerInteraction();
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
  renderer.domElement.addEventListener('pointerup', endDrag, true);
  renderer.domElement.addEventListener('pointercancel', endDrag, true);
  renderer.domElement.addEventListener('lostpointercapture', endDrag, true);
  renderer.domElement.addEventListener('contextmenu', (event) => {
    if (drawingArea) event.preventDefault();
  });
  renderer.setAnimationLoop(() => {
    if (controls.enabled && !preservePhotoPoseUntilInteraction) controls.update();
    updateHandleScreenSizes(areaHandles);
    updateHandleScreenSizes(areaDraft);
    renderer.render(scene, camera);
  });
  return {
    rebuild(s, p) {
      releaseBase();
      rebuild(s, p);
    },
    startAreaDrawing({ operation = 'replace' } = {}) {
      drawingOperation = operation;
      drawingArea = true;
      draftPoints = [];
      drawPointer = null;
      draftPointDrag = null;
      grid.visible = !photoMode;
      areaHandles.visible = false;
      clearOverlay(areaDraft);
      setPreviousAreaVisible(drawingOperation !== 'replace');
      controls.enabled = !photoMode && !photoSetup;
      renderer.domElement.style.cursor = 'crosshair';
      updateDraftCallback();
    },
    undoAreaPoint() {
      if (!drawingArea || !draftPoints.length) return false;
      draftPoints.pop();
      renderDraft(draftPoints);
      updateDraftCallback();
      return true;
    },
    stopAreaDrawing({ preserveCamera = false } = {}) {
      preserveCameraOnNextRebuild = Boolean(preserveCamera);
      drawingArea = false;
      draftPoints = [];
      drawPointer = null;
      draftPointDrag = null;
      grid.visible = false;
      clearOverlay(areaDraft);
      setPreviousAreaVisible(true);
      areaHandles.visible = true;
      drawAreaHandles();
      restorePointerInteraction();
      updateDraftCallback();
    },
    setAreaSelection(key, vertex = 0) {
      if (key === activeBoundaryKey && vertex === activeVertex) return;
      activeBoundaryKey = key || ''; activeVertex = vertex;
      drawAreaHandles();
    },
    preserveCamera() { preserveCameraOnNextRebuild = true; },
    loadSitePhoto,
    clearSitePhoto,
    fitProject() { top = false; fit(); },
    getPhotoRect: photoRect,
    setDebugPreviewVisible(visible) {
      debugPreviewVisible = visible !== false;
      group.visible = !photoSetup && debugPreviewVisible;
    },
    getDebugView() {
      return { photoMode, hasCalibration: Boolean(modelPhotoCalibration || photoCalibrationCorners && photoCalibration),
        width: host.clientWidth, height: host.clientHeight, rect: photoRect(), groundY: GROUND_Y,
        origin: { x: bounds?.centerX || 0, z: bounds?.centerZ || 0 },
        view: camera.matrixWorldInverse.toArray(), projection: camera.projectionMatrix.toArray() };
    },
    applyPhotoCalibration,
    prepareReferenceRecalibration,
    beginReferenceCalibration() {
      photoMode = true;
      setPhotoSetup(true);
      updatePhotoPresentation();
    },
    applyModelCalibration,
    capturePhotoState,
    restorePhotoState,
    getModelCalibration: () => modelPhotoCalibration ? structuredClone(modelPhotoCalibration) : null,
    shiftPhotoWorld,
    completePhotoSetup,
    setPhotoView,
    isPhotoMode() {
      return photoMode;
    },
    hasPhotoCalibration() {
      return Boolean(modelPhotoCalibration || photoCalibrationCorners && photoCalibration);
    },
    cycleCamera() {
      if (photoMode) setPhotoView(false);
      preservePhotoPoseUntilInteraction = false;
      top = !top;
      fit();
      return top;
    },
    toggleDimensions() {
      showDimensions = !showDimensions;
      dimensions.visible = showDimensions && !drawingArea;
      return showDimensions;
    },
    setDarkMode(dark) {
      darkMode = Boolean(dark);
      if (!photoMode) scene.background = new THREE.Color(darkMode ? '#242c30' : '#e6e9e5');
      ground.material.color.set(darkMode ? '#3a453d' : '#cbd0c4');
      grid.material.color?.set?.(darkMode ? '#7e919b' : '#93a5af');
    },
  };
}
