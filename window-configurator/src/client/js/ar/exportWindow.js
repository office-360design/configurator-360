import { captureProductARSnapshot } from '../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';
import * as THREE from 'three';

export const WINDOW_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function dispose(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) { materials.add(m); for (const t of Object.values(m)) if (t?.isTexture) textures.add(t); }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

/** Export every configured mesh, using the pre-highlight material and assembled
 * positions on a copy. Sash hinges retain their current opening transforms. */
export function captureWindowARSnapshot(sourceRoot, { materialForMesh = o => o.material } = {}) {
  const originals = []; sourceRoot?.traverse(o => originals.push(o));
  return captureProductARSnapshot(sourceRoot, {
    product: 'window',
    prepareClone(source) {
      let index = 0;
      source.traverse(o => {
        const original = originals[index++];
        if (o.isMesh) o.material = materialForMesh(original);
        if (o.userData.basePos) o.position.copy(o.userData.basePos);
      });
      source.position.set(0, 0, 0);
    },
  });
}

async function resizeExportTextures(root) {
  const textures=new Set();root.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.map)textures.add(m.map);});
  for(const texture of textures){
    const image=texture.image;if(!image?.width||!image?.height)fail('not-ready');
    if(Math.max(image.width,image.height)<=1024)continue;
    const scale=1024/Math.max(image.width,image.height),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);texture.image=canvas;texture.needsUpdate=true;
  }
}
export async function createWindowFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if(!Object.hasOwn(WINDOW_AR_LIMITS,format))fail('invalid-format');
  if(!snapshot?.model?.object)fail('not-ready');
  onProgress('building');
  const root=await new THREE.ObjectLoader().parseAsync(snapshot.model);
  try{
    root.updateMatrixWorld(true);await resizeExportTextures(root);onProgress('exporting');
    await new Promise(resolve=>setTimeout(resolve,0));
    let binary;
    if(format==='glb'){
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      binary=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true,maxTextureSize:1024});
    }else{
      // Pin to Window's existing Three r160, not Hall's r169. r160 uses async
      // parse(scene, options), while newer exporters also expose parseAsync.
      const {USDZExporter}=await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js');
      const exporter=new USDZExporter(),options={quickLookCompatible:true,ar:{anchoring:{type:'plane'},planeAnchoring:{alignment:'horizontal'}}};
      const bytes=typeof exporter.parseAsync==='function'?await exporter.parseAsync(root,options):await exporter.parse(root,options);
      binary=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
    if(!(binary instanceof ArrayBuffer)||binary.byteLength<128)fail('export-failed');
    if(binary.byteLength>WINDOW_AR_LIMITS[format])fail('model-too-large');
    return {blob:new Blob([binary],{type:format==='glb'?'model/gltf-binary':'model/vnd.usdz+zip'}),format,stats:snapshot.stats};
  }finally{dispose(root);}
}
