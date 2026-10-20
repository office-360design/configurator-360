import * as THREE from 'three';
import { captureProductARSnapshot } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';
export const ROOF_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
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


/** Roof CAD already uses metres. The model root deliberately includes the
 * house shell, gables, slab and facade details, not just roof-surface meshes.
 * Ground at the model base: standard houses include a 200 mm slab, drawn
 * layouts have walls starting at zero. Neither should float above the plane.
 * Only the detached copy is normalized; camera and live materials stay owned
 * by the editor. Lights, grid, compass and dimension overlays are other roots.
 */
export function captureRoofARSnapshot(modelRoot) {
  if (!modelRoot?.isObject3D || !modelRoot.children.length) fail('not-ready');
  return captureProductARSnapshot(modelRoot, { product: 'roof' });
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
export async function waitForRoofTextures(getRoot, { signal, timeoutMs = 15000 } = {}) {
  if (typeof getRoot !== 'function') fail('not-ready');
  const deadline = Date.now() + timeoutMs;
  while (true) {
    throwIfAborted(signal);
    const root = getRoot();
    if (!root?.isObject3D || !root.children.length) fail('not-ready');
    let pending = false;
    root.traverseVisible(object => {
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
    });
    if (!pending) return;
    if (Date.now() >= deadline) fail('not-ready');
    await nextTextureCheck(signal);
  }
}

export async function createRoofFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(ROOF_AR_LIMITS, format)) fail('invalid-format');
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
      // Bundle the exporter from the roof's pinned Three.js dependency.
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
    if (binary.byteLength > ROOF_AR_LIMITS[format]) fail('model-too-large');
    return { blob: new Blob([binary], { type: format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' }), format, stats: snapshot.stats };
  } finally { disposeExport(root); }
}
