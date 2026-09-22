import { stoneAppearance } from './stoneAppearance.js';
import { houseGeometry } from './house.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clipRect, polygonArea } from './area.js';
import { COLORS, TILES, CURBS, curbLayout, areaGeometry } from './model.js';
export function createViewer(host, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6e9e5');
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
  let group = new THREE.Group(),
    dimensions = new THREE.Group(),
    state,
    bounds,
    top = false,
    showDimensions = true;
  scene.add(group, dimensions);
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
      if (o.isSprite) {
        o.material.map.dispose();
        o.material.dispose();
      }
    });
    g.clear();
  }
  function drawPieces(parts, height, colorFor, baseY) {
    if (!parts.length) return;
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p, i) => {
      dummy.position.set(p.x - bounds.width / 2, baseY + height / 2, p.z - bounds.depth / 2);
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
  function label(text, x, z) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 100;
    const context = c.getContext('2d');
    context.fillStyle = 'rgba(255,255,255,.92)';
    context.fillRect(0, 0, 512, 100);
    context.fillStyle = '#294536';
    context.font = '600 40px sans-serif';
    context.textAlign = 'center';
    context.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.position.set(x, 0.15, z);
    sprite.scale.set(1.4, 0.28, 1);
    dimensions.add(sprite);
  }
  function fit() {
    if (!state) return;
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
        const polygon = p.profile
          ? fragment.map((v) => ({ x: p.x + (v.x - p.x) * 0.985, z: p.z + (v.z - p.z) * 0.985 }))
          : clipRect(
              fragment,
              p.x - p.l / 2 + 0.0015,
              p.z - p.w / 2 + 0.0015,
              Math.max(0.001, p.l - 0.003),
              Math.max(0.001, p.w - 0.003),
            );
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
    if (s.shape === 'rectangle') {
      label(`${s.length.toFixed(2)} m`, 0, -s.width / 2 - 0.45);
      label(`${s.width.toFixed(2)} m`, s.length / 2 + 0.8, 0);
    } else
      bounds.points.forEach((p, i) => {
        const q = bounds.points[(i + 1) % bounds.points.length],
          length = bounds.lengths[i];
        const nx = (q.z - p.z) / length,
          nz = -(q.x - p.x) / length;
        label(String.fromCharCode(65 + i), p.x - bounds.width / 2, p.z - bounds.depth / 2);
        label(
          `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + ((i + 1) % bounds.points.length))} · ${length.toFixed(2)} m`,
          (p.x + q.x) / 2 - bounds.width / 2 + nx * 0.65,
          (p.z + q.z) / 2 - bounds.depth / 2 + nz * 0.65,
        );
      });
    dimensions.visible = showDimensions;
    if (changed) fit();
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
    fit();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag = null,
    pending = null,
    dragFrame = 0;
  function ray(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }
  function flushDrag() {
    dragFrame = 0;
    if (pending) {
      const value = pending;
      pending = null;
      callbacks.onHouseMove?.(value);
    }
  }
  renderer.domElement.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || !state?.houseEnabled) return;
      ray(event);
      if (
        !raycaster.intersectObjects(
          group.children.filter((o) => o.userData.house),
          false,
        ).length
      )
        return;
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      drag = {
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
      if (!drag || event.pointerId !== drag.id) return;
      ray(event);
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      pending = {
        houseX: Math.round((drag.houseX + hit.x - drag.x) * 100) / 100,
        houseZ: Math.round((drag.houseZ + hit.z - drag.z) * 100) / 100,
      };
      if (!dragFrame) dragFrame = requestAnimationFrame(flushDrag);
      event.stopImmediatePropagation();
    },
    true,
  );
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (dragFrame) cancelAnimationFrame(dragFrame);
    flushDrag();
    drag = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
  renderer.domElement.addEventListener('pointerup', endDrag, true);
  renderer.domElement.addEventListener('pointercancel', endDrag, true);
  renderer.domElement.addEventListener('lostpointercapture', endDrag, true);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    rebuild(s, p) {
      releaseBase();
      rebuild(s, p);
    },
    cycleCamera() {
      top = !top;
      fit();
      return top;
    },
    toggleDimensions() {
      showDimensions = !showDimensions;
      dimensions.visible = showDimensions;
      return showDimensions;
    },
    setDarkMode(dark) {
      scene.background.set(dark ? '#242c30' : '#e6e9e5');
      ground.material.color.set(dark ? '#3a453d' : '#cbd0c4');
    },
  };
}
