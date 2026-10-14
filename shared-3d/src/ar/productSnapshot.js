import * as THREE from 'three';


const MAX_TRIANGLES = 300000;
const MAX_TEXTURE_SIZE = 1024;
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap'];
let snapshotSerial = 0;
function fail(code) { const error = new Error(code); error.code = code; throw error; }

function disposeExport(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

/** Own the image pixels as well as the texture. A quality change or rebuild of
 * the editor must not affect an export already in progress. DataTexture maps
 * are converted explicitly; native exporters cannot all read procedural data.
 */
function copyTexture(source) {
  const image = source.image;
  if (!image?.width || !image?.height || source.isCompressedTexture || source.isVideoTexture) fail('not-ready');
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) fail('export-failed');
  if (image.data) {
    if (source.type !== THREE.UnsignedByteType || source.format !== THREE.RGBAFormat || image.data.length !== image.width * image.height * 4) fail('invalid-geometry');
    const original = document.createElement('canvas'); original.width = image.width; original.height = image.height;
    const originalContext = original.getContext('2d');
    if (!originalContext) fail('export-failed');
    const pixels = originalContext.createImageData(image.width, image.height); pixels.data.set(image.data);
    originalContext.putImageData(pixels, 0, 0);
    context.drawImage(original, 0, 0, canvas.width, canvas.height);
  } else {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  const result = new THREE.CanvasTexture(canvas);
  for (const property of ['mapping', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'colorSpace', 'flipY', 'channel']) {
    if (source[property] !== undefined) result[property] = source[property];
  }
  result.offset.copy(source.offset); result.repeat.copy(source.repeat); result.center.copy(source.center);
  result.rotation = source.rotation; result.matrixAutoUpdate = source.matrixAutoUpdate;
  if (source.matrixAutoUpdate) result.updateMatrix(); else result.matrix.copy(source.matrix);
  result.name = 'AR_texture';
  return result;
}

/** Both platforms support base-colour alpha; a separate alphaMap is not
 * consistently supported in USDZ. The pergola's textile/grille map sets use
 * matching UV transforms, so combine their green alpha channel into RGBA.
 */
function withAlphaMap(colorMap, alphaMap) {
  const transformKey = t => JSON.stringify([t.channel, t.flipY, t.wrapS, t.wrapT, ...t.matrix.elements]);
  if (colorMap && transformKey(colorMap) !== transformKey(alphaMap)) fail('invalid-geometry');
  const canvas = document.createElement('canvas');
  canvas.width = alphaMap.image.width; canvas.height = alphaMap.image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) fail('export-failed');
  ctx.drawImage(alphaMap.image, 0, 0, canvas.width, canvas.height);
  const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (colorMap) ctx.drawImage(colorMap.image, 0, 0, canvas.width, canvas.height);
  else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const color = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < color.data.length; i += 4) color.data[i + 3] = Math.round(color.data[i + 3] * alpha.data[i + 1] / 255);
  ctx.putImageData(color, 0, 0);
  const result = copyTexture(colorMap || alphaMap);
  result.image = canvas; result.colorSpace = THREE.SRGBColorSpace; result.needsUpdate = true;
  return result;
}

/** Build a portable copy of every visible physical mesh. Do not mutate or dispose
 * the live editor; keep per-face materials, maps, instancing and local transforms.
 * groundY may pin a design's finished grade while keeping buried foundations.
 */
export function buildProductARScene(sourceRoot, { product = 'product', groundY = null, prepareClone = () => {} } = {}) {
  if (!sourceRoot?.isObject3D) fail('not-ready');
  const source = sourceRoot.clone(true);
  source.position.set(0, 0, 0);
  prepareClone(source);
  source.updateMatrixWorld(true);
  const root = new THREE.Scene(); root.name = `Configured ${product}`;
  const buckets = new Map(), textures = new Map(), ownedTextures = new Set();
  let triangles = 0, sourceMeshes = 0;
  const components = {};
  const textureCopy = texture => {
    if (!textures.has(texture)) { const copy = copyTexture(texture); textures.set(texture, copy); ownedTextures.add(copy); }
    return textures.get(texture);
  };
  try {
    function getBucket(material, hasColors, instanceColor) {
      const key = `${material.uuid}|${hasColors}|${instanceColor?.getHexString() || ""}`;
      if (buckets.has(key)) return buckets.get(key);
      // Copy portable PBR properties only, without environment maps, contact-AO
      // shaders, render-time clipping or the editor's surface-library ownership.
      const transmission = THREE.MathUtils.clamp(material.transmission || 0, 0, 1);
      const opacity = Math.min(material.transparent ? material.opacity : 1, 1 - transmission * 0.82);
      const pbr = new THREE.MeshStandardMaterial({
        color: material.color || 0x888888,
        roughness: material.roughness ?? 0.65, metalness: material.metalness ?? 0,
        opacity, transparent: opacity < 1, alphaTest: material.alphaTest || 0,
        emissive: material.emissive || 0, emissiveIntensity: material.emissiveIntensity ?? 1,
        vertexColors: hasColors, side: THREE.FrontSide,
      });
      if (instanceColor) pbr.color.multiply(instanceColor);
      pbr.name = `${product}_finish_${buckets.size}`;
      const bucket = { material: pbr, positions: [], normals: [], colors: [], uvs: new Map(), indices: [], vertices: new Map() };
      buckets.set(key, bucket); // Register before loading maps, including failure cleanup.
      for (const slot of MAP_SLOTS) if (material[slot]) pbr[slot] = textureCopy(material[slot]);
      if (material.normalScale) pbr.normalScale.copy(material.normalScale);
      pbr.normalMapType = material.normalMapType ?? THREE.TangentSpaceNormalMap;
      pbr.bumpScale = material.bumpScale ?? 1;
      pbr.aoMapIntensity = material.aoMapIntensity ?? 1;
      if (material.alphaMap) {
        pbr.map = withAlphaMap(pbr.map, textureCopy(material.alphaMap)); ownedTextures.add(pbr.map);
        pbr.transparent = true;
      }
      bucket.uvs.set('uv', []);
      for (const slot of MAP_SLOTS) {
        const channel = pbr[slot]?.channel || 0;
        if (channel < 0 || channel > 3) fail('invalid-geometry');
        bucket.uvs.set(channel ? `uv${channel}` : 'uv', []);
      }
      return bucket;
    }

    function addMesh(object, matrix, instanceColor = null) {
      const geometry = object.geometry, position = geometry?.getAttribute('position');
      if (!position?.count) return;
      if (object.isSkinnedMesh || Object.values(geometry.morphAttributes || {}).some(a => a.length)) fail('invalid-geometry');
      const normals = geometry.getAttribute('normal'), colors = geometry.getAttribute('color');
      const total = geometry.index?.count || position.count;
      const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const determinant = matrix.determinant();
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) fail('invalid-geometry');
      sourceMeshes++;
      const component = object.name || 'unnamed-mesh';
      components[component] = (components[component] || 0) + 1;
      for (const group of groups) {
        const material = Array.isArray(object.material) ? object.material[group.materialIndex] : object.material;
        if (!material || material.visible === false || material.opacity === 0) continue;
        const bucket = getBucket(material, Boolean(material.vertexColors && colors), instanceColor);
        const start = Math.max(group.start, geometry.drawRange.start);
        const end = Math.min(total, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
        for (let offset = start; offset + 2 < end; offset += 3) {
          const order = determinant < 0 ? [offset, offset + 2, offset + 1] : [offset, offset + 1, offset + 2];
          const indices = order.map(i => geometry.index ? geometry.index.getX(i) : i);
          const points = indices.map(i => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
          const faceNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
          const vertex = (corner, invert) => {
            const i = indices[corner], point = points[corner];
            // Some fitted accessory GLBs intentionally have no NORMAL attribute.
            // Generate face normals in the copy, never mutate those source meshes.
            const normal = normals && !material.flatShading
              ? new THREE.Vector3().fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize() : faceNormal.clone();
            if (invert) normal.negate();
            const values = [...point.toArray(), ...normal.toArray()];
            const uvValues = [];
            for (const name of bucket.uvs.keys()) {
              const attribute = geometry.getAttribute(name);
              if (name !== 'uv' && !attribute) fail('invalid-geometry');
              const uv = attribute ? [attribute.getX(i), attribute.getY(i)] : [0, 0];
              uvValues.push(uv); values.push(...uv);
            }
            const rgb = bucket.material.vertexColors ? [colors.getX(i), colors.getY(i), colors.getZ(i)] : [];
            values.push(...rgb);
            if (!values.every(Number.isFinite)) fail('invalid-geometry');
            const key = values.map(v => Math.round(v * 1e6)).join(',');
            let id = bucket.vertices.get(key);
            if (id === undefined) {
              id = bucket.positions.length / 3; bucket.vertices.set(key, id);
              bucket.positions.push(...values.slice(0, 3)); bucket.normals.push(...values.slice(3, 6));
              let channel = 0; for (const list of bucket.uvs.values()) list.push(...uvValues[channel++]);
              if (rgb.length) bucket.colors.push(...rgb);
            }
            return id;
          };
          if (material.side !== THREE.BackSide) { bucket.indices.push(vertex(0, false), vertex(1, false), vertex(2, false)); triangles++; }
          if (material.side !== THREE.FrontSide) { bucket.indices.push(vertex(2, true), vertex(1, true), vertex(0, true)); triangles++; }
          if (triangles > MAX_TRIANGLES) fail('model-too-large');
        }
      }
    }
    function visit(object) {
      if (!object.visible || object.userData.arExclude) return;
      if (object.isMesh) {
        if (object.isInstancedMesh) {
          for (let i = 0; i < object.count; i++) {
            const instance = new THREE.Matrix4(); object.getMatrixAt(i, instance);
            const tint = object.instanceColor ? new THREE.Color().fromBufferAttribute(object.instanceColor, i) : null;
            addMesh(object, object.matrixWorld.clone().multiply(instance), tint);
          }
        } else addMesh(object, object.matrixWorld);
      }
      object.children.forEach(visit);
    }
    visit(source);
    for (const bucket of buckets.values()) {
      if (!bucket.indices.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      if (bucket.colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
      for (const [name, values] of bucket.uvs) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 2));
      geometry.setIndex(bucket.indices);
      const mesh = new THREE.Mesh(geometry, bucket.material); mesh.name = bucket.material.name; root.add(mesh);
    }
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (bounds.isEmpty() || ![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) fail('invalid-geometry');
    const baseY = Number.isFinite(groundY) ? groundY : bounds.min.y;
    root.children.forEach(mesh => mesh.geometry.translate(-center.x, -baseY, -center.z));
    const stats = { sourceMeshes, components, meshes: root.children.length, triangles, size: { x: size.x, y: size.y, z: size.z } };
    return { root, stats, dispose: cleanup };
  } catch (error) { cleanup(); throw error; }
  function cleanup() {
    disposeExport(root);
    for (const bucket of buckets.values()) bucket.material.dispose();
    ownedTextures.forEach(texture => texture.dispose());
    // source's borrowed geometry/materials and sourceRoot remain editor-owned.
  }
}

export function captureProductARSnapshot(sourceRoot, options = {}) {
  const built = buildProductARScene(sourceRoot, options);
  try {
    return { cacheKey: `${options.product || 'product'}-${++snapshotSerial}`, model: built.root.toJSON(), stats: built.stats };
  } finally { built.dispose(); }
}
