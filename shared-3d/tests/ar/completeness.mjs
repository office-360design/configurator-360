import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRequire} from 'node:module';
import {state as defaults} from '../../../hall-configurator/js/state.js';
import {HALL_TEMPLATES,createHallTemplate} from '../../../hall-configurator/js/templates.js';
import {arSnapshot,buildARScene,createHallARAsset} from '../../../hall-configurator/js/ar/exportHall.js';
import {buildHallModel} from '../../../hall-configurator/js/hallFactory.js';
import {buildProductARScene} from '../../src/ar/productSnapshot.js';
globalThis.window = { location: { hostname: 'localhost' } };
const require=createRequire(import.meta.url),{validateAsset}=require('../../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader=class {readAsArrayBuffer(b){b.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(x=>{this.result=`data:${b.type};base64,${Buffer.from(x).toString('base64')}`;this.onloadend?.();});}};
const excluded=new Set(['service-coverage','forklift-clearance','connection-detail']);
function counts(root){const out={};function visit(o){if(!o.visible||excluded.has(o.name))return;if(o.isMesh)out[o.name||'unnamed-mesh']=(out[o.name||'unnamed-mesh']||0)+(o.isInstancedMesh?o.count:1);o.children.forEach(visit);}visit(root);return out;}
test('Every Hall template includes its configured parts, foundations, fittings and equipment',()=>{
  for(const t of HALL_TEMPLATES){const s=createHallTemplate(t.id,defaults),root=buildHallModel(arSnapshot(s)).root,built=buildARScene(s);
    root.traverse(o=>{ if(o.name==='warehouse-racking'&&!s.warehouseRacking || o.name==='secondary-structure'&&!s.secondaryStructure) o.visible=false; });
    assert.deepEqual(built.stats.components,counts(root),t.id);
    assert.ok(Object.keys(built.stats.components).some(n=>/foundation/.test(n)),t.id);
    const b=new THREE.Box3().setFromObject(built.root);assert.ok(b.min.y<0,'keep configured subterranean foundation geometry');
    assert.ok(built.stats.sourceMeshes>100);built.dispose();
  }
});
test('All four Hall templates still fit mobile GLB limits, with no source-part removal',async()=>{
  for(const t of HALL_TEMPLATES){const asset=await createHallARAsset(createHallTemplate(t.id,defaults),'glb');const b=Buffer.from(await asset.blob.arrayBuffer());assert.equal(validateAsset('glb',b).format,'glb');
    const doc=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());
    const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);assert.equal(triangles,asset.stats.triangles);
    console.log(`${t.id}: ${b.length} bytes, ${asset.stats.sourceMeshes} parts, ${triangles} triangles`);
  }
});
test('Incomplete/unsupported physical meshes are rejected rather than omitted',()=>{
  const root=new THREE.Group();root.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
  assert.throws(()=>buildProductARScene(root),{code:'invalid-geometry'});
  root.children[0]=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.children[0].geometry.attributes.position.setX(0,NaN);
  assert.throws(()=>buildProductARScene(root),{code:'invalid-geometry'});
});

test('Portable snapshots preserve configured emissive strength and per-instance colours', async()=>{
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xffffff, emissiveIntensity:4.5, roughness:.32, metalness:.4});
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1,2,.2), material, 2);
  instances.name = 'configured-light';
  instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-2,1,0));
  instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,1,0));
  instances.setColorAt(0,new THREE.Color(0x663322));
  instances.setColorAt(1,new THREE.Color(0x225566));
  source.add(instances);
  const built = buildProductARScene(source);
  try {
    assert.equal(built.stats.components['configured-light'],2);
    assert.deepEqual(built.root.children.map(o=>o.material.color.getHex()).sort(),[0x225566,0x663322]);
    for(const mesh of built.root.children){assert.equal(mesh.material.emissiveIntensity,4.5);assert.equal(mesh.material.roughness,.32);assert.equal(mesh.material.metalness,.4);}
    const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
    const binary=Buffer.from(await new GLTFExporter().parseAsync(built.root,{binary:true}));
    assert.equal(validateAsset('glb',binary).format,'glb');
    const json=JSON.parse(binary.toString('utf8',20,20+binary.readUInt32LE(12)).trim());
    assert.ok(json.materials.every(m=>m.extensions?.KHR_materials_emissive_strength?.emissiveStrength===4.5));
    assert.equal(material.emissiveIntensity,4.5);
    assert.equal(material.color.getHex(),0xffffff);
  }finally{built.dispose();}
});
