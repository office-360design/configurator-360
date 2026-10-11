import * as THREE from 'three';
import { buildHallModel } from '../hallFactory.js?v=hall-production-1';
import { state as defaults } from '../state.js?v=hall-production-1';
import { normalizeOpenings, validateOpenings } from '../openings.js?v=hall-production-1';

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
    || /foundation-(pad|pedestal)/.test(object.name)
    || (object.name === 'warehouse-racking' && !s.warehouseRacking)
    || (object.name === 'secondary-structure' && !s.secondaryStructure);
}
/** Flatten independent geometry and batch by PBR material. No live scene data is modified. */
export function buildARScene(snapshot) {
  const s = arSnapshot(snapshot), source = buildHallModel(s).root;
  const exportScene = new THREE.Scene(); exportScene.name = 'Configured Hall';
  const buckets = new Map(); let sourceMeshes = 0;
  try {
    source.traverse(o => { if (hiddenForAR(o, s)) o.visible = false; });
    source.updateMatrixWorld(true);
    const rot = new THREE.Matrix4().makeRotationY(Math.PI); // Hall's -Z facade becomes AR's +Z facade.
    const position = new THREE.Vector3(), normal = new THREE.Vector3(), uv = new THREE.Vector2();
    function getBucket(material) {
      const map = material.map || null;
      const opacity = material.transparent ? Math.max(.12, material.opacity) : 1;
      const color = material.color || new THREE.Color('#888888');
      const emissive = material.emissive || new THREE.Color(0);
      const signature = [color.getHexString(), emissive.getHexString(), material.emissiveIntensity ?? 1, opacity, material.roughness ?? .65, material.metalness ?? 0, map?.uuid || ''].join('|');
      if (!buckets.has(signature)) {
        const pbr = new THREE.MeshStandardMaterial({
          color, emissive, emissiveIntensity: material.emissiveIntensity ?? 1,
          roughness: material.roughness ?? .65, metalness: material.metalness ?? 0,
          transparent: opacity < 1, opacity, map, side: THREE.FrontSide,
        });
        pbr.name = `Hall_finish_${buckets.size}`;
        buckets.set(signature, { material: pbr, vertices: [], normals: [], uvs: [], indices: [], keys: new Map() });
      }
      return buckets.get(signature);
    }
    function addMesh(object, matrix) {
      const g = object.geometry;
      const p = g?.getAttribute('position'); if (!p?.count) return;
      sourceMeshes++;
      const n = g.getAttribute('normal'), tex = g.getAttribute('uv');
      if (!n) fail('invalid-geometry');
      const m = new THREE.Matrix4().multiplyMatrices(rot, matrix), nm = new THREE.Matrix3().getNormalMatrix(m);
      const count = g.index?.count || p.count;
      const groups = Array.isArray(object.material) ? g.groups : [{ start: 0, count, materialIndex: 0 }];
      for (const group of groups) {
        const material = Array.isArray(object.material) ? object.material[group.materialIndex] : object.material;
        if (!material || material.visible === false || material.opacity === 0) continue;
        const bucket = getBucket(material);
        const vertex = (i, invert) => {
          const index = g.index ? g.index.getX(i) : i;
          position.fromBufferAttribute(p, index).applyMatrix4(m);
          normal.fromBufferAttribute(n, index).applyMatrix3(nm).normalize();
          if (invert) normal.negate();
          uv.set(tex ? tex.getX(index) : 0, tex ? tex.getY(index) : 0);
          // Bake UV transforms so Quick Look doesn't need texture-transform extensions.
          if (material.map) { material.map.updateMatrix(); uv.applyMatrix3(material.map.matrix); }
          const values = [position.x,position.y,position.z,normal.x,normal.y,normal.z,uv.x,uv.y].map(v => Math.round(v * 1e6) / 1e6);
          if (!values.every(Number.isFinite)) fail('invalid-geometry');
          const key = values.join(',');
          let id = bucket.keys.get(key);
          if (id === undefined) {
            id = bucket.vertices.length / 3; bucket.keys.set(key, id);
            bucket.vertices.push(...values.slice(0,3)); bucket.normals.push(...values.slice(3,6)); bucket.uvs.push(...values.slice(6));
          }
          return id;
        };
        for (let i = group.start; i + 2 < Math.min(count, group.start + group.count); i += 3) {
          const flip = m.determinant() < 0;
          const order = flip ? [i,i+2,i+1] : [i,i+1,i+2];
          if (material.side !== THREE.BackSide) bucket.indices.push(...order.map(v => vertex(v, false)));
          // Explicit rear triangles retain thin wall/roof/window interiors in USDZ,
          // whose material exporter does not preserve Three's DoubleSide setting.
          if (material.side !== THREE.FrontSide) bucket.indices.push(...order.slice().reverse().map(v => vertex(v, true)));
        }
      }
    }
    source.traverseVisible(o => {
      if (!o.isMesh) return;
      if (o.isInstancedMesh) {
        for (let i=0; i<o.count; i++) {
          const local = new THREE.Matrix4(); o.getMatrixAt(i,local); addMesh(o,new THREE.Matrix4().multiplyMatrices(o.matrixWorld,local));
        }
      } else addMesh(o,o.matrixWorld);
    });
    const textureClones = new Map();
    for (const bucket of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.vertices,3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs,2)); g.setIndex(bucket.indices);
      // Each mesh uses one material and one UV set. Preserve textures, reset only
      // transforms already baked into the geometry (never mutate source maps).
      if (bucket.material.map) {
        const original = bucket.material.map;
        if (!textureClones.has(original)) {
          const clone=original.clone(); clone.offset.set(0,0);clone.repeat.set(1,1);clone.rotation=0;clone.center.set(0,0);clone.updateMatrix();
          textureClones.set(original,clone);
        }
        bucket.material.map=textureClones.get(original);
      }
      const mesh=new THREE.Mesh(g,bucket.material);mesh.name=bucket.material.name;exportScene.add(mesh);
    }
    const bounds=new THREE.Box3().setFromObject(exportScene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || ![size.x,size.y,size.z].every(Number.isFinite)) fail('invalid-geometry');
    // Omit subterranean pads above, then use the bottom of the slab/apron as the
    // detected ground anchor. Dimensions remain metres; no hidden miniature scale.
    for (const mesh of exportScene.children) mesh.geometry.translate(-center.x,-bounds.min.y,-center.z);
    let triangles=0,vertices=0;
    exportScene.traverse(o=>{if(o.isMesh){triangles+=o.geometry.index.count/3;vertices+=o.geometry.attributes.position.count;}});
    if (triangles > 300000) fail('model-too-large');
    return { root: exportScene, stats: { sourceMeshes, meshes: exportScene.children.length, triangles, vertices, size: { x:size.x,y:size.y,z:size.z } }, dispose() { release(exportScene); } };
  } catch(error) { release(exportScene); throw error; }
  finally { release(source); }
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
