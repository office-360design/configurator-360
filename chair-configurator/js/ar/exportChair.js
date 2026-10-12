import * as THREE from 'three';
import { captureProductARSnapshot } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';

export const CHAIR_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const error = new Error(code); error.code = code; throw error; }

/** Capture the rendered product root, not a default chair rebuilt from options.
 * The source already contains the selected wood, upholstery and custom colours.
 * Its geometry and all procedural texture pixels are copied; the stage/floor,
 * lights, camera and render-only contact shading are outside this root.
 */
export function captureChairARSnapshot(modelRoot) {
  return captureProductARSnapshot(modelRoot, { product: 'chair' });
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
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

export async function createChairFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(CHAIR_AR_LIMITS, format)) fail('invalid-format');
  if (!snapshot?.model?.object) fail('not-ready');
  onProgress('building');
  const root = await new THREE.ObjectLoader().parseAsync(snapshot.model);
  try {
    root.updateMatrixWorld(true);
    onProgress('exporting');
    await new Promise(resolve => setTimeout(resolve, 0));
    let output;
    if (format === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      output = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    } else {
      // Chair uses its own local r160 engine. Keep the exporter on that exact
      // revision, not the r169 used by Hall/Fence. r160 has async parse(), not
      // parseAsync(). The pinned addon resolves bare 'three' via Chair's map.
      const { USDZExporter } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js');
      output = await new USDZExporter().parse(root, {
        quickLookCompatible: true,
        ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
      });
    }
    const binary = output instanceof ArrayBuffer ? output : ArrayBuffer.isView(output)
      ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) : null;
    if (!binary || binary.byteLength < 128) fail('export-failed');
    if (binary.byteLength > CHAIR_AR_LIMITS[format]) fail('model-too-large');
    return { blob: new Blob([binary], { type: format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' }), format, stats: snapshot.stats };
  } finally { disposeExport(root); }
}
