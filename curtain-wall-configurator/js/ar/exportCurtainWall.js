import * as THREE from 'three';
import { captureProductARSnapshot } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';

export const CURTAIN_WALL_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function cancelled(signal) { if (signal?.aborted) throw new DOMException('AR preparation cancelled.', 'AbortError'); }

/** Export the physical façade in its assembled position. Root rotation keeps
 * skylight slope; centring/grounding is handled by the shared snapshot builder.
 * The editor, exploded animation and illustrative building remain untouched.
 */
export function captureCurtainWallARSnapshot(source) {
  if (!source?.isObject3D || !source.children.length) fail('not-ready');
  const assembly = new THREE.Group(), facade = source.clone(true);
  for (const layer of facade.children) if (Object.hasOwn(layer.userData, 'explodeZ')) layer.position.z = 0;
  assembly.add(facade);
  return captureProductARSnapshot(assembly, { product: 'curtainwall' });
}

export async function waitForCurtainWallTextures(getRoot, { signal, timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    cancelled(signal);
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
          if (image?.complete && !image.naturalWidth) fail('textures-unavailable');
          if (!image?.width || !image?.height || image.complete === false) pending = true;
        }
      }
    });
    if (!pending) return;
    if (Date.now() >= deadline) fail('textures-unavailable');
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const timer = setTimeout(() => { cleanup(); resolve(); }, 50);
      const abort = () => { clearTimeout(timer); cleanup(); reject(new DOMException('AR preparation cancelled.', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}

function disposeExport(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
}

export async function createCurtainWallFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(CURTAIN_WALL_AR_LIMITS, format)) fail('invalid-format');
  if (!snapshot?.model?.object) fail('not-ready');
  onProgress('building');
  const root = await new THREE.ObjectLoader().parseAsync(snapshot.model);
  try {
    root.updateMatrixWorld(true); onProgress('exporting');
    await new Promise(resolve => setTimeout(resolve, 0));
    let output;
    if (format === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      output = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    } else {
      const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
      // The configurator pins r160: its USDZ exporter has an async parse()
      // method, rather than the parseAsync() introduced in later revisions.
      output = await new USDZExporter().parse(root, {
        quickLookCompatible: true,
        ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
      });
    }
    const binary = output instanceof ArrayBuffer ? output
      : ArrayBuffer.isView(output) ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) : null;
    if (!binary || binary.byteLength < 128) fail('export-failed');
    if (binary.byteLength > CURTAIN_WALL_AR_LIMITS[format]) fail('model-too-large');
    return { blob: new Blob([binary], { type: format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' }), format, stats: snapshot.stats };
  } finally { disposeExport(root); }
}
