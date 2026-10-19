import { normalize, areaGeometry } from '../model.js';
import { buildPavementARModel } from './pavementModel.js?v=tiles-ar-1';
import { buildProductARScene } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';
export const TILES_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const e=new Error(code);e.code=code;throw e; }
export function captureTilesARSnapshot(input) {
  if (!input || typeof input !== 'object') fail('not-ready');
  const snapshot=normalize(structuredClone(input));
  if (![1, 2].includes(snapshot.version)) fail('not-ready');
  try {
    const area=areaGeometry(snapshot);
    if (![area.width,area.depth,area.area].every(n=>Number.isFinite(n)&&n>0)) fail('invalid-configuration');
  } catch { fail('invalid-configuration'); }
  try { areaGeometry(snapshot); } catch { fail('invalid-configuration'); }
  // Location lookup metadata is not part of the product and is not exported.
  snapshot.houseLocation=null;
  return snapshot;
}
export function buildTilesARScene(input, options = {}) {
  const source=buildPavementARModel(captureTilesARSnapshot(input), options);
  try {
    const built=buildProductARScene(source.root,{product:'tiles',groundY:0});
    return { ...built, stats:{...built.stats, tiles:source.counts.tiles, curbs:source.counts.curbs} };
  } finally { source.dispose(); }
}
export async function createTilesFirebaseARAsset(snapshot,format,onProgress=()=>{}) {
  if (!Object.hasOwn(TILES_AR_LIMITS,format)) fail('invalid-format');
  onProgress('building');await new Promise(resolve=>setTimeout(resolve,30));
  const built=buildTilesARScene(snapshot);
  try {
    onProgress('exporting');await new Promise(resolve=>setTimeout(resolve,0));
    let output;
    if(format==='glb') {
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      output=await new GLTFExporter().parseAsync(built.root,{binary:true,onlyVisible:true,maxTextureSize:1024});
    } else {
      const {USDZExporter}=await import('three/addons/exporters/USDZExporter.js');
      output=await new USDZExporter().parseAsync(built.root,{maxTextureSize:1024,quickLookCompatible:true,
        includeAnchoringProperties:true,ar:{anchoring:{type:'plane'},planeAnchoring:{alignment:'horizontal'}}});
    }
    const binary=output instanceof ArrayBuffer?output:ArrayBuffer.isView(output)
      ?output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength):null;
    if(!binary || binary.byteLength<128) fail('export-failed');
    if(binary.byteLength>TILES_AR_LIMITS[format]) fail('model-too-large');
    return {blob:new Blob([binary],{type:format==='glb'?'model/gltf-binary':'model/vnd.usdz+zip'}),format,stats:built.stats};
  } finally { built.dispose(); }
}
