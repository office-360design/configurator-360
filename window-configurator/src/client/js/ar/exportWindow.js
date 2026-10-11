import * as THREE from 'three';

export const WINDOW_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
const MAX_TRIANGLES = 300000;
let snapshotSerial = 0;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function dispose(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) { materials.add(m); for (const t of Object.values(m)) if (t?.isTexture) textures.add(t); }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

/** A self-contained, immutable-by-convention snapshot for both platform exports.
 * Called synchronously, before any asynchronous work, so a model rebuild cannot
 * dispose geometry in use by the exporter or change the other platform's model.
 * The input is only WindowBuilder.mainGroup, never the full scene or house.
 */
export function captureWindowARSnapshot(sourceRoot, { materialForMesh = o => o.material } = {}) {
  if (!sourceRoot?.isObject3D) fail('not-ready');
  const source = sourceRoot.clone(true), originals = [];
  sourceRoot.traverse(o => originals.push(o));
  let objectIndex = 0;
  source.traverse(o => {
    const original = originals[objectIndex++];
    if (o.isMesh) o.material = materialForMesh(original);
    // Undo inspection-only explosion on the clone, not on the live window.
    if (o.userData.basePos) o.position.copy(o.userData.basePos);
  });
  source.position.set(0,0,0); // Remove the house/inspection offset; retain sash transforms.
  source.updateMatrixWorld(true);
  const root = new THREE.Scene(); root.name = 'Configured window';
  const buckets = new Map(), ownedTextures = new Map();
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), tex = new THREE.Vector2();
  let triangles = 0, sourceMeshes = 0;
  // Window coordinates are already metres. The handle/interior (+Z) face is
  // intentionally presented to the viewer; do not apply Hall's 180-degree turn.
  try {
    function getBucket(m) {
      const map = m.map || null;
      if (map && !(map.image?.width > 0 && map.image?.height > 0)) fail('not-ready');
      const color = m.color || new THREE.Color(0x888888);
      const sourceOpacity = m.transparent ? THREE.MathUtils.clamp(m.opacity,0,1) : 1;
      // The scene uses transmission-only glass (opacity 1). A portable standard
      // material must explicitly carry its transparency or AR would show an
      // opaque white pane. Use the same lightweight glazing alpha as the editor.
      const transmission = THREE.MathUtils.clamp(m.transmission || 0, 0, 1);
      const opacity = Math.min(sourceOpacity, 1 - transmission * 0.82);
      const emissive = m.emissive || new THREE.Color(0);
      const signature = [color.getHexString(),opacity,m.alphaTest||0,m.roughness??.65,m.metalness??0,emissive.getHexString(),m.emissiveIntensity??1,map?.uuid||''].join('|');
      if (!buckets.has(signature)) {
        const pbr = new THREE.MeshStandardMaterial({ color, opacity, transparent: opacity<1,
          alphaTest:m.alphaTest||0, roughness:m.roughness??.65, metalness:m.metalness??0,
          emissive, emissiveIntensity:m.emissiveIntensity??1, side:THREE.FrontSide });
        // No scene-reflection, clipping, selection or renderer-specific shader
        // hooks. Native viewers provide their own lighting and glass reflections.
        if (map) {
          if (!ownedTextures.has(map)) {
            const clone = map.clone();
            clone.offset.set(0,0); clone.repeat.set(1,1); clone.rotation=0; clone.center.set(0,0); clone.updateMatrix();
            ownedTextures.set(map,clone);
          }
          pbr.map=ownedTextures.get(map);
        }
        pbr.name=`Window_finish_${buckets.size}`;
        buckets.set(signature,{material:pbr,positions:[],normals:[],uvs:[],indices:[],vertices:new Map()});
      }
      return buckets.get(signature);
    }
    function addMesh(o, matrix) {
      const g=o.geometry, p=g?.getAttribute('position'); if(!p?.count)return;
      const n=g.getAttribute('normal'); if(!n)fail('invalid-geometry');
      const uv=g.getAttribute('uv'),total=g.index?.count||p.count;
      const groups=Array.isArray(o.material)?g.groups:[{start:0,count:total,materialIndex:0}];
      const nm=new THREE.Matrix3().getNormalMatrix(matrix),flip=matrix.determinant()<0;
      sourceMeshes++;
      for(const group of groups) {
        const m=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;
        if(!m||m.visible===false||m.opacity===0)continue;
        const bucket=getBucket(m);
        const uvMatrix=m.map ? new THREE.Matrix3().setUvTransform(m.map.offset.x,m.map.offset.y,m.map.repeat.x,m.map.repeat.y,m.map.rotation,m.map.center.x,m.map.center.y) : null;
        const vertex=(i,invert)=>{
          const index=g.index?g.index.getX(i):i;
          point.fromBufferAttribute(p,index).applyMatrix4(matrix);
          normal.fromBufferAttribute(n,index).applyMatrix3(nm).normalize(); if(invert)normal.negate();
          tex.set(uv?uv.getX(index):0,uv?uv.getY(index):0); if(uvMatrix)tex.applyMatrix3(uvMatrix);
          const values=[point.x,point.y,point.z,normal.x,normal.y,normal.z,tex.x,tex.y].map(v=>Math.round(v*1e6)/1e6);
          if(!values.every(Number.isFinite))fail('invalid-geometry');
          const key=values.join(','); let id=bucket.vertices.get(key);
          if(id===undefined){id=bucket.positions.length/3;bucket.vertices.set(key,id);bucket.positions.push(...values.slice(0,3));bucket.normals.push(...values.slice(3,6));bucket.uvs.push(...values.slice(6));}
          return id;
        };
        const start=Math.max(group.start,g.drawRange.start),end=Math.min(total,group.start+group.count,g.drawRange.start+g.drawRange.count);
        for(let i=start;i+2<end;i+=3){
          const order=flip?[i,i+2,i+1]:[i,i+1,i+2];
          if(m.side!==THREE.BackSide){bucket.indices.push(...order.map(v=>vertex(v,false)));triangles++;}
          // Explicit back triangles are needed by Quick Look for thin profiles
          // and glazing; negative geometry scales have already been baked above.
          if(m.side!==THREE.FrontSide){bucket.indices.push(...order.slice().reverse().map(v=>vertex(v,true)));triangles++;}
          if(triangles>MAX_TRIANGLES)fail('model-too-large');
        }
      }
    }
    source.traverseVisible(o=>{
      if(!o.isMesh || o.userData.arExclude || o.isSkinnedMesh)return;
      if(o.isInstancedMesh){for(let i=0;i<o.count;i++){const m=new THREE.Matrix4();o.getMatrixAt(i,m);addMesh(o,new THREE.Matrix4().multiplyMatrices(o.matrixWorld,m));}}
      else addMesh(o,o.matrixWorld);
    });
    for(const b of buckets.values()){
      if(!b.indices.length)continue;
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));g.setIndex(b.indices);
      const mesh=new THREE.Mesh(g,b.material);mesh.name=b.material.name;root.add(mesh);
    }
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty()||![size.x,size.y,size.z].every(Number.isFinite)||size.x<=0||size.y<=0)fail('invalid-geometry');
    for(const mesh of root.children)mesh.geometry.translate(-center.x,-bounds.min.y,-center.z);
    // Serialize while all texture images and geometry are still valid. No live
    // Object3D, material, image request or GPU resource is passed to the dialog.
    return {cacheKey:`window-${++snapshotSerial}`,model:root.toJSON(),stats:{sourceMeshes,meshes:root.children.length,triangles,size:{x:size.x,y:size.y,z:size.z}}};
  } finally {
    dispose(root);
    // Capture may fail before a bucket was attached to root.
    for(const b of buckets.values())b.material.dispose();
    for(const t of ownedTextures.values())t.dispose();
    // Do NOT dispose source: its geometry/materials belong to the live scene.
  }
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
