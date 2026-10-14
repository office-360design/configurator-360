import * as THREE from 'three';
import { captureProductARSnapshot } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';
export const SOLAR_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
const MAX_TEXTURE_SIZE = 1024;
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


/** Capture only the configured house/roof and placed photovoltaic modules.
 * Geographic references, recommended Google layouts, terrain and energy/flux
 * overlays are intentionally separate scene roots, not the configured product.
 * Never reparent live roots or change the editor's camera/lighting simulation.
 */
export function captureSolarARSnapshot(modelRoot, solarRoot) {
  if (!modelRoot?.isObject3D || !modelRoot.children.length || !solarRoot?.isObject3D || !solarRoot.children.length) fail('not-ready');
  let panelCount = 0;
  const surfaces = {};
  solarRoot.traverseVisible(object => {
    if (object.isGroup && object.userData.surfaceId) {
      panelCount++;
      const id = String(object.userData.surfaceId);
      surfaces[id] = (surfaces[id] || 0) + 1;
    }
  });
  if (!panelCount) fail('no-panels');
  const product = new THREE.Group();
  const house = modelRoot.clone(true), panels = solarRoot.clone(true);
  house.name = 'solar-house'; panels.name = 'solar-panels';
  product.add(house, panels);
  // Panel-cell strokes are physical appearance, unlike roof technical outlines.
  // Native viewers do not consistently export THREE.Line. Replace only the
  // cell strokes with 1.5 mm surface strips in the temporary export copy.
  const ownedGeometries = [], ownedMaterials = [];
  try {
    panels.traverse(object => {
      if (!object.isGroup || !object.userData.surfaceId) return;
      object.children.filter(child => child.isMesh).forEach((child, index) => {
        child.name = index === 0 ? 'solar-panel-frame' : 'solar-panel-glass';
      });
    });
    const cellLines = [];
    panels.traverseVisible(object => { if (object.isLine && !object.isLineSegments) cellLines.push(object); });
    const materials = new Map();
    for (const line of cellLines) {
      const positions = line.geometry?.getAttribute('position');
      if (!positions || positions.count !== 2 || Array.isArray(line.material)) fail('invalid-geometry');
      const start = new THREE.Vector3().fromBufferAttribute(positions, 0);
      const end = new THREE.Vector3().fromBufferAttribute(positions, 1);
      const direction = end.clone().sub(start);
      if (!Number.isFinite(direction.length()) || direction.length() <= 0) fail('invalid-geometry');
      const geometry = new THREE.PlaneGeometry(0.0015, direction.length());
      ownedGeometries.push(geometry);
      let material = materials.get(line.material);
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color: line.material.color, roughness: 0.35, metalness: 0.15,
          transparent: true, opacity: line.material.opacity, side: THREE.DoubleSide,
        });
        materials.set(line.material, material); ownedMaterials.push(material);
      }
      const stroke = new THREE.Mesh(geometry, material); stroke.name = 'solar-cell-detail';
      stroke.position.copy(start).add(end).multiplyScalar(0.5);
      stroke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      // Keep any local transform of the original line without modifying it.
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      holder.matrix.copy(line.matrixAutoUpdate
        ? new THREE.Matrix4().compose(line.position, line.quaternion, line.scale) : line.matrix);
      holder.visible = line.visible; holder.add(stroke); line.parent.add(holder); line.parent.remove(line);
    }
    const result = captureProductARSnapshot(product, { product: 'solar' });
    result.stats.panelCount = panelCount;
    result.stats.surfaces = surfaces;
    return result;
  } finally {
    ownedGeometries.forEach(geometry => geometry.dispose());
    ownedMaterials.forEach(material => material.dispose());
    // Geometry/materials borrowed by the two cloned roots remain editor-owned.
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('AR preparation cancelled.', 'AbortError');
}
function nextTextureCheck(signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, 50);
    const abort = () => { clearTimeout(timer); cleanup(); reject(new DOMException('AR preparation cancelled.', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/** Re-read current materials each time: changing covering rebuilds the product
 * synchronously but may still be loading finish images. Never snapshot stale
 * roots or silently omit a map. Generated DataTextures are already ready.
 */
export async function waitForSolarTextures(getRoot, { signal, timeoutMs = 15000 } = {}) {
  if (typeof getRoot !== 'function') fail('not-ready');
  const deadline = Date.now() + timeoutMs;
  while (true) {
    throwIfAborted(signal);
    const roots = getRoot();
    if (!Array.isArray(roots) || roots.length !== 2 || roots.some(root => !root?.isObject3D || !root.children.length)) fail('not-ready');
    let pending = false;
    roots.forEach(root => root.traverseVisible(object => {
      if (!object.isMesh || object.userData.arExclude) return;
      for (const material of [].concat(object.material || [])) {
        if (!material || material.visible === false || material.opacity === 0) continue;
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'alphaMap']) {
          const texture = material[slot];
          if (!texture) continue;
          const image = texture.image;
          if (image && 'complete' in image && image.complete && !image.naturalWidth) fail('textures-unavailable');
          if (!image?.width || !image?.height || image.complete === false) pending = true;
        }
      }
    }));
    if (!pending) return;
    if (Date.now() >= deadline) fail('not-ready');
    await nextTextureCheck(signal);
  }
}

export async function createSolarFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(SOLAR_AR_LIMITS, format)) fail('invalid-format');
  if (!snapshot?.model?.object) fail('not-ready');
  onProgress('building');
  const root = await new THREE.ObjectLoader().parseAsync(snapshot.model);
  try {
    root.updateMatrixWorld(true); onProgress('exporting');
    await new Promise(resolve => setTimeout(resolve, 0));
    let output;
    if (format === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      output = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: MAX_TEXTURE_SIZE });
    } else {
      // Use the Solar import map's pinned Three.js exporter for both platforms.
      // No cross-revision CDN imports or separate legacy AR upload service.
      const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
      output = await new USDZExporter().parseAsync(root, {
        quickLookCompatible: true, maxTextureSize: MAX_TEXTURE_SIZE, onlyVisible: true,
        includeAnchoringProperties: true,
        ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
      });
    }
    const binary = output instanceof ArrayBuffer ? output
      : ArrayBuffer.isView(output) ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) : null;
    if (!binary || binary.byteLength < 128) fail('export-failed');
    if (binary.byteLength > SOLAR_AR_LIMITS[format]) fail('model-too-large');
    return { blob: new Blob([binary], { type: format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' }), format, stats: snapshot.stats };
  } finally { disposeExport(root); }
}
