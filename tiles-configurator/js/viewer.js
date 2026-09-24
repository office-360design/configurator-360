import { stoneAppearance } from './stoneAppearance.js';
import { houseGeometry } from './house.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clipRect, polygonArea } from './area.js';
import { COLORS, TILES, CURBS, curbLayout, areaGeometry } from './model.js';
import { calibratePhotoCamera } from './photoCalibration.js';

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
const snap = (value) => Math.round(value * 20) / 20;

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
  ground.position.y = -0.16;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(40, 80, 0x0878c9, 0x93a5af);
  grid.position.y = 0.09;
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
    preserveCameraOnNextRebuild = false,
    photoMode = false,
    photoSetup = false,
    photoNaturalWidth = 0,
    photoNaturalHeight = 0,
    photoCalibrationCorners = null,
    photoCalibration = null,
    photoWorldShift = { x: 0, z: 0 },
    freeCameraPose = null,
    darkMode = false;
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
      if (o.isInstancedMesh) o.dispose();
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
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
    g.clear();
  }
  function drawPieces(parts, height, colorFor, baseY) {
    if (!parts.length) return;
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p, i) => {
      dummy.position.set(p.x - bounds.width / 2, baseY + height / 2, p.z - bounds.depth / 2);
      dummy.rotation.set(0, -THREE.MathUtils.degToRad(Number(p.rotation) || 0), 0);
      dummy.scale.set(Math.max(0.001, p.l - 0.003), height, Math.max(0.001, p.w - 0.003));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const appearance = stoneAppearance(p, COLORS[colorFor(p, i)]);
      const color = new THREE.Color(appearance.base);
      color.multiplyScalar(appearance.brightness);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = true;
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
    sprite.position.set(x, 0.19, z);
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
    const y = -0.11,
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
    if (!width || !height || !photoNaturalWidth || !photoNaturalHeight)
      return { left: 0, top: 0, width, height };
    const scale = Math.min(width / photoNaturalWidth, height / photoNaturalHeight),
      photoWidth = photoNaturalWidth * scale,
      photoHeight = photoNaturalHeight * scale;
    return {
      left: (width - photoWidth) / 2,
      top: (height - photoHeight) / 2,
      width: photoWidth,
      height: photoHeight,
    };
  }
  function snapshotFreeCamera() {
    freeCameraPose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
      top,
    };
  }
  function restoreFreeCamera() {
    // Photo calibration writes directly to the camera while OrbitControls is disabled.
    // Always re-enable and update OrbitControls after restoring a free-camera pose so
    // its internal spherical state is synchronized with the camera again.
    controls.enabled = true;
    if (!freeCameraPose) {
      top = false;
      fit();
      controls.enabled = true;
      controls.update();
      return;
    }
    camera.position.copy(freeCameraPose.position);
    camera.quaternion.copy(freeCameraPose.quaternion);
    camera.fov = freeCameraPose.fov;
    camera.aspect = Math.max(1e-6, host.clientWidth / Math.max(1, host.clientHeight));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    controls.target.copy(freeCameraPose.target);
    top = freeCameraPose.top;
    controls.update();
    controls.enabled = true;
  }
  function applyPhotoCalibrationPose() {
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
    camera.position.x += photoWorldShift.x;
    camera.position.z += photoWorldShift.z;
    camera.fov = calibration.fov;
    camera.aspect = width / height;
    camera.near = 0.01;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    controls.target.set(photoWorldShift.x, 0, photoWorldShift.z);
    return true;
  }
  function updatePhotoPresentation() {
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
      if (!photoCalibrationCorners) return false;
      if (!photoMode && !photoSetup) snapshotFreeCamera();
      photoMode = true;
      updatePhotoPresentation();
      return Boolean(photoCalibration);
    }
    if (photoSetup) return false;
    if (photoMode) {
      photoMode = false;
      updatePhotoPresentation();
      restoreFreeCamera();
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
    group.visible = !photoSetup;
    dimensions.visible = !photoSetup && showDimensions && !drawingArea;
    areaHandles.visible = !photoSetup && !drawingArea;
    if (photoSetup) controls.enabled = false;
    else if (photoMode) controls.enabled = false;
  }
  function loadSitePhoto(url) {
    return new Promise((resolve, reject) => {
      photoCalibrationCorners = null;
      photoCalibration = null;
      photoWorldShift = { x: 0, z: 0 };
      freeCameraPose = null;
      photoNaturalWidth = 0;
      photoNaturalHeight = 0;
      photoMode = true;
      setPhotoSetup(true);
      photoBackdrop.style.display = 'block';
      scene.background = null;
      renderer.setClearAlpha(0);
      ground.visible = false;
      grid.visible = false;
      const cleanup = () => {
        photoBackdrop.onload = null;
        photoBackdrop.onerror = null;
      };
      photoBackdrop.onload = () => {
        photoNaturalWidth = photoBackdrop.naturalWidth || 1;
        photoNaturalHeight = photoBackdrop.naturalHeight || 1;
        cleanup();
        callbacks.onPhotoRectChange?.(photoRect());
        resolve({ width: photoNaturalWidth, height: photoNaturalHeight, rect: photoRect() });
      };
      photoBackdrop.onerror = () => {
        cleanup();
        reject(new Error('photoLoadFailed'));
      };
      photoBackdrop.src = url;
    });
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
    photoCalibrationCorners = normalized;
    photoMode = true;
    updatePhotoPresentation();
    return Boolean(photoCalibration);
  }
  function shiftPhotoWorld(dx, dz) {
    dx = Number(dx);
    dz = Number(dz);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
    photoWorldShift.x += dx;
    photoWorldShift.z += dz;
    if (photoMode && photoCalibrationCorners) applyPhotoCalibrationPose();
    return true;
  }
  function completePhotoSetup() {
    setPhotoSetup(false);
    group.visible = true;
    drawAreaHandles();
    dimensions.visible = showDimensions && !drawingArea;
    setPhotoView(true);
  }
  function fit() {
    if (!state || !bounds) return;
    const size = Math.max(
        bounds.width,
        bounds.depth,
        state.houseEnabled ? state.houseHeight * 2 : 0,
      ),
      distance = (size * 1.55) / Math.min(1, camera.aspect);
    controls.target.set(0, 0, 0);
    camera.position.set(
      top ? 0 : distance * 0.8,
      top ? distance * 1.5 : distance,
      top ? 0.001 : distance,
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
    geometry.translate(-bounds.width / 2, baseY, -bounds.depth / 2);
    return geometry;
  }
  function drawPolygons(items, height, baseY) {
    if (!items.length) return;
    const geometries = [];
    for (const { polygon, color, stone } of items) {
      if (polygon.length < 3 || polygonArea(polygon) < 1e-9) continue;
      const geometry = prism(polygon, height, baseY),
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
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  function handleSize() {
    return Math.max(0.075, Math.min(0.18, Math.max(bounds?.width || 6, bounds?.depth || 4) * 0.014));
  }
  function makeHandle(x, z, index, first = false) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(handleSize(), 18, 12),
      new THREE.MeshStandardMaterial({
        color: first ? '#22a06b' : '#0878c9',
        roughness: 0.45,
        metalness: 0.05,
        depthTest: false,
      }),
    );
    mesh.position.set(x, 0.16, z);
    mesh.renderOrder = 20;
    mesh.userData.areaPoint = index;
    return mesh;
  }
  function drawAreaHandles() {
    clearOverlay(areaHandles);
    if (photoSetup || drawingArea || !state || state.shape !== 'custom' || !bounds) return;
    bounds.points.forEach((p, i) => {
      areaHandles.add(makeHandle(p.x - bounds.width / 2, p.z - bounds.depth / 2, i, false));
    });
  }
  function renderDraft(points, { local = false } = {}) {
    clearOverlay(areaDraft);
    if (!points.length) return;
    const world = local
      ? points.map((p) => ({ x: p.x - bounds.width / 2, z: p.z - bounds.depth / 2 }))
      : points;
    if (world.length > 1) {
      const linePoints = world.length >= 3 ? [...world, world[0]] : world;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        linePoints.map((p) => new THREE.Vector3(p.x, 0.145, p.z)),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: '#0878c9', depthTest: false }),
      );
      line.renderOrder = 19;
      areaDraft.add(line);
    }
    world.forEach((p, i) => areaDraft.add(makeHandle(p.x, p.z, i, i === 0)));
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
      changed = !bounds || JSON.stringify(bounds.points) !== JSON.stringify(nextBounds.points);
    state = s;
    bounds = nextBounds;
    clear(group);
    clear(dimensions);
    const t = TILES[s.tile],
      base = new THREE.Mesh(
        prism(bounds.points, 0.13, -0.13),
        new THREE.MeshStandardMaterial({ color: '#877b69', roughness: 1 }),
      );
    base.receiveShadow = true;
    group.add(base);
    drawPieces(
      parts.filter((p) => !p.fragments),
      t.thickness,
      (p) => (p.accent ? s.accent : s.color),
      0,
    );
    const cuts = [];
    parts.forEach((p) => {
      for (const fragment of p.fragments || []) {
        const rotated = Math.abs((Number(p.rotation) || 0) % 180) > 1e-6;
        let polygon;
        if (p.profile) {
          polygon = fragment.map((v) => ({
            x: p.x + (v.x - p.x) * 0.985,
            z: p.z + (v.z - p.z) * 0.985,
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
    drawPolygons(cuts, t.thickness, 0);
    const curb = CURBS[s.curb],
      curbs = curbLayout(s);
    drawPieces(
      curbs.filter((p) => !p.polygon && !p.fragments),
      curb.height,
      () => s.curbColor,
      t.thickness + 0.035 - curb.height,
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
      curb.height,
      t.thickness + 0.035 - curb.height,
    );
    if (s.houseEnabled) {
      const house = houseGeometry(s);
      const walls = new THREE.Mesh(
        prism(house.outline, s.houseHeight, t.thickness),
        new THREE.MeshStandardMaterial({ color: '#e5ded0', roughness: 0.9 }),
      );
      walls.userData.house = true;
      walls.castShadow = true;
      walls.receiveShadow = true;
      group.add(walls);
      const roof = new THREE.Mesh(
        prism(house.outline, 0.12, t.thickness + s.houseHeight),
        new THREE.MeshStandardMaterial({ color: '#4c555a', roughness: 0.85 }),
      );
      roof.userData.house = true;
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);
    }
    const centredPoints = bounds.points.map((p) => ({
      x: p.x - bounds.width / 2,
      z: p.z - bounds.depth / 2,
    }));
    if (s.shape === 'rectangle') {
      edgeDimension(centredPoints, bounds.lengths, 0, `${s.length.toFixed(2)} m`);
      edgeDimension(centredPoints, bounds.lengths, 1, `${s.width.toFixed(2)} m`);
    } else
      centredPoints.forEach((p, i) => {
        const a = vertexLabel(i),
          b = vertexLabel((i + 1) % centredPoints.length);
        cornerLabel(a, p.x, p.z);
        edgeDimension(
          centredPoints,
          bounds.lengths,
          i,
          `${a}${b} · ${bounds.lengths[i].toFixed(2)} m`,
        );
      });
    if (drawingArea) setPreviousAreaVisible(false);
    else dimensions.visible = !photoSetup && showDimensions;
    drawAreaHandles();
    if (photoMode) {
      preserveCameraOnNextRebuild = false;
      applyPhotoCalibrationPose();
    } else if (changed && !drawingArea) {
      if (preserveCameraOnNextRebuild) preserveCameraOnNextRebuild = false;
      else fit();
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (photoMode && photoCalibrationCorners) applyPhotoCalibrationPose();
    else if (!photoSetup) fit();
    callbacks.onPhotoRectChange?.(photoRect());
  };
  new ResizeObserver(resize).observe(host);
  resize();
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
          false,
        )[0];
        if (handleHit) {
          draftPointDrag = {
            id: event.pointerId,
            index: handleHit.object.userData.areaPoint,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
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

      if (state?.shape === 'custom' && areaHandles.children.length) {
        ray(event);
        const handleHit = raycaster.intersectObjects(areaHandles.children, false)[0];
        if (handleHit) {
          areaDrag = {
            id: event.pointerId,
            index: handleHit.object.userData.areaPoint,
            points: bounds.points.map((p) => ({ ...p })),
          };
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

      if (!state?.houseEnabled) return;
      ray(event);
      if (
        !raycaster.intersectObjects(
          group.children.filter((o) => o.userData.house),
          false,
        ).length
      )
        return;
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
          drawPointer.moved = true;
      }
      if (areaDrag && event.pointerId === areaDrag.id) {
        const hit = planeHit(event);
        if (!hit) return;
        areaDrag.points[areaDrag.index] = {
          x: snap(hit.x + bounds.width / 2),
          z: snap(hit.z + bounds.depth / 2),
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
        draftPointDrag.index === 0 && !draftPointDrag.moved && draftPoints.length >= 3;
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
      if (!candidate.moved) {
        const hit = planeHit(event);
        if (hit) {
          if (
            draftPoints.length >= 3 &&
            Math.hypot(hit.x - draftPoints[0].x, hit.z - draftPoints[0].z) <=
              handleSize() * 1.8
          ) {
            callbacks.onAreaFinishRequested?.();
          } else if (draftPoints.length < 64) {
            const point = { x: snap(hit.x), z: snap(hit.z) };
            if (
              !draftPoints.length ||
              Math.hypot(point.x - draftPoints.at(-1).x, point.z - draftPoints.at(-1).z) >= 0.1
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
      const points = areaDrag.points.map((p) => ({ ...p }));
      areaDrag = null;
      clearOverlay(areaDraft);
      areaHandles.visible = true;
      preserveCameraOnNextRebuild = true;
      callbacks.onAreaPointMove?.(points);
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
    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
  });
  return {
    rebuild(s, p) {
      releaseBase();
      rebuild(s, p);
    },
    startAreaDrawing() {
      drawingArea = true;
      draftPoints = [];
      drawPointer = null;
      draftPointDrag = null;
      grid.visible = !photoMode;
      areaHandles.visible = false;
      clearOverlay(areaDraft);
      setPreviousAreaVisible(false);
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
    loadSitePhoto,
    getPhotoRect: photoRect,
    applyPhotoCalibration,
    shiftPhotoWorld,
    completePhotoSetup,
    setPhotoView,
    isPhotoMode() {
      return photoMode;
    },
    hasPhotoCalibration() {
      return Boolean(photoCalibrationCorners && photoCalibration);
    },
    cycleCamera() {
      if (photoMode) setPhotoView(false);
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
