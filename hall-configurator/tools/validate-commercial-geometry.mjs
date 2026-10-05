import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { state } from '../js/state.js?v=hall-commercial-1';
import { createHallTemplate, COMMERCIAL_TEMPLATE_ID, AGRICULTURAL_TEMPLATE_ID } from '../js/templates.js?v=hall-commercial-1';
import { buildHallModel, applyExplodedView } from '../js/hallFactory.js?v=hall-commercial-1';
import { normalizeOpenings } from '../js/openings.js?v=hall-commercial-1';
import { createGlazedEntranceAssembly } from '../js/retailGeometry.js?v=hall-commercial-1';
import { buildBom } from '../js/bom.js?v=hall-commercial-1';
globalThis.window = { HALL_CONFIGURATOR_SHARED_SHELL: { state: { locale: 'en-US' } }, location: { hostname: 'localhost' } };
const t = createHallTemplate(COMMERCIAL_TEMPLATE_ID, state);
const b = buildHallModel(t); applyExplodedView(b.root,0); b.root.updateMatrixWorld(true);
assert.equal(b.root.getObjectByName('openings').children.length,12);
assert.equal(b.counts.wallBraces,4);
let lights=0, islands=0;
b.root.traverse(o=>{if(o.name==='retail-linear-luminaire')lights++;if(o.name==='retail-display-island')islands++;});
assert.equal(lights,8); assert.equal(islands,4);
assert(b.root.getObjectByName('retail-checkout-counter'));
for (const o of t.openings) {
 const group=b.root.getObjectByName(`opening-${o.id}`), wall=b.root.getObjectByName(`${o.side}-wall-cladding`);
 assert(wall,`${o.side} wall`);
 for(const [u,v] of [[0,.45],[-.35,.2],[.35,.7]]){
  const origin=group.localToWorld(new THREE.Vector3(o.width*u,o.height*v,-2));
  const direction=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
  const hits=new THREE.Raycaster(origin,direction,0,3).intersectObject(wall,false);
  assert.equal(hits.length,0,`Wall is not cut behind ${o.id} at ${u}/${v}`);
 }
}
const fascia=b.root.getObjectByName('commercial-fascia-sign');
const fasciaBox=new THREE.Box3().setFromObject(fascia);
assert(fasciaBox.max.z < -t.length/2-.175);
assert(fasciaBox.min.y>2.95);
const canopyBox=new THREE.Box3().setFromObject(b.root.getObjectByName('commercial-entrance-canopy'));
assert(canopyBox.min.y>2.95);
const mats=Array.from({length:3},()=>new THREE.MeshStandardMaterial());
for(const subtype of ['sliding-glass','double-glass']){
 const closed=createGlazedEntranceAssembly({width:subtype==='sliding-glass'?3.6:1.8,height:2.5,subtype,isOpen:false},...mats);
 const opened=createGlazedEntranceAssembly({width:subtype==='sliding-glass'?3.6:1.8,height:2.5,subtype,isOpen:true},...mats);
 closed.updateMatrixWorld(true); opened.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(.25,1.2,-3),new THREE.Vector3(0,0,1),0,4);
 assert(ray.intersectObject(closed,true).length>0,`Closed ${subtype} blocks passage`);
 assert.equal(ray.intersectObject(opened,true).length,0,`Open ${subtype} clears passage`);
}
let checked=0;
for(const scenario of [t,createHallTemplate(AGRICULTURAL_TEMPLATE_ID,state),{...structuredClone(t),width:8,length:12,eaveHeight:3},{...structuredClone(t),width:40,length:60,eaveHeight:9,pitch:25,explode:100}]){
 normalizeOpenings(scenario);const model=buildHallModel(scenario);model.root.updateMatrixWorld(true);
 model.root.traverse(o=>{if(o.geometry){for(const attr of Object.values(o.geometry.attributes))for(const x of attr.array)assert(Number.isFinite(x),`Nonfinite geometry ${o.name}`);checked++;}});
}
const bom=buildBom(t,b,'en-US');
for(const name of ['Entrance canopy','Fascia sign','Paved customer forecourt','Retail display islands','Checkout counter','Linear retail LED luminaires'])assert(bom.find(x=>x.name===name),name);
console.log(`Three r${THREE.REVISION}: 12 wall apertures, both door motions, facade clearances, ${checked} finite meshes and BOM passed.`);
const source=fs.readFileSync(new URL('../js/scene.js', import.meta.url),'utf8');
const method=source.match(/  fitCamera\(state, metrics\) \{([\s\S]*?)\n  \}\n\n  setView/)[1];
const fit=new Function('THREE',`return function(state, metrics) {${method}\n}`)(THREE);
for(const aspect of [16/9,1,390/760]){
 const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000);
 const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
 fit.call({currentBuild:b,camera,controls},t,b.metrics);
 const bounds=new THREE.Box3().setFromObject(b.root);
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<=1 && Math.abs(p.y)<=1,`Customer framing ${aspect}: ${p.toArray()}`);
 }
 assert(camera.position.z<0);
}
console.log('Customer-side fit includes the complete building at desktop, square and portrait aspect ratios.');
