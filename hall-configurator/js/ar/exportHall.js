import { buildProductARScene } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';
import * as THREE from 'three';
import { buildHallModel } from '../hallFactory.js?v=locales-6';
import { state as defaults } from '../state.js?v=locales-6';
import { normalizeOpenings, validateOpenings } from '../openings.js?v=locales-6';

export const AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const error = new Error(code); error.code = code; throw error; }
export function arSnapshot(input) {
  const s = { ...structuredClone(defaults), ...structuredClone(input) };
  for (const [key, min, max] of [['width',6,30],['length',12,60],['eaveHeight',3,12],['pitch',5,25],['targetBaySpacing',3,8]]) {
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max) fail('invalid-configuration');
  }
  // Export the built design, not an exploded/section-cut inspection or the
  // scenery, compass, selection handles, dimensions and planning heatmaps.
  Object.assign(s, { explode: 0, sectionCutEnabled: false, connectionDetails: false, inspectionMode: 'all', technicalEdges: false, serviceCoverage: false, showCladding: true });
  normalizeOpenings(s);
  if (!validateOpenings(s).valid) fail('invalid-openings');
  return s;
}
function release(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const material of [].concat(o.material || [])) {
      materials.add(material);
      for (const v of Object.values(material)) if (v?.isTexture) textures.add(v);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
function hiddenForAR(object, s) {
  return object.name === 'service-coverage' || object.name === 'forklift-clearance'
    || object.name === 'connection-detail'
    || (object.name === 'warehouse-racking' && !s.warehouseRacking)
    || (object.name === 'secondary-structure' && !s.secondaryStructure);
}
/** Include every configured physical part, including below-grade foundations.
 * Rebuild from the captured state without exploded/section inspection helpers. */
export function buildARScene(snapshot) {
  const s = arSnapshot(snapshot), source = buildHallModel(s).root;
  try {
    source.traverse(o => { if (hiddenForAR(o, s)) o.visible = false; });
    return buildProductARScene(source, {
      product: 'hall', groundY: 0,
      prepareClone(copy) { copy.rotation.y += Math.PI; },
    });
  } finally { release(source); }
}
export async function createHallARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(AR_LIMITS, format)) fail('invalid-format');
  onProgress('building'); await new Promise(resolve=>setTimeout(resolve,30));
  const built=buildARScene(snapshot);
  try {
    onProgress('exporting'); await new Promise(resolve=>setTimeout(resolve,0));
    let binary;
    if (format==='glb') {
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      binary=await new GLTFExporter().parseAsync(built.root,{binary:true,onlyVisible:true,maxTextureSize:1024});
    } else {
      const {USDZExporter}=await import('three/addons/exporters/USDZExporter.js');
      const bytes=await new USDZExporter().parseAsync(built.root,{maxTextureSize:1024,quickLookCompatible:true,includeAnchoringProperties:true});
      binary=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
    if (!(binary instanceof ArrayBuffer) || binary.byteLength < 128) fail('export-failed');
    if (binary.byteLength>AR_LIMITS[format]) fail('model-too-large');
    return { blob:new Blob([binary],{type:format==='glb'?'model/gltf-binary':'model/vnd.usdz+zip'}), format, stats:built.stats };
  } finally { built.dispose(); }
}
