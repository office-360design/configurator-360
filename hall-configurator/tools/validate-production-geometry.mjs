import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { state } from '../js/state.js?v=hall-production-1';
import { createHallTemplate, PRODUCTION_TEMPLATE_ID } from '../js/templates.js?v=hall-production-1';
import { buildHallModel, applyExplodedView } from '../js/hallFactory.js?v=hall-production-1';
import { productionLayout, footprint } from '../js/production.js?v=hall-production-1';
import { normalizeOpenings } from '../js/openings.js?v=hall-production-1';
import { buildBom } from '../js/bom.js?v=hall-production-1';
globalThis.window={location:{hostname:'localhost'}};
const t=createHallTemplate(PRODUCTION_TEMPLATE_ID,state),build=buildHallModel(t),plan=productionLayout(t);
build.root.updateMatrixWorld(true);
assert.equal(build.root.getObjectByName('warehouse-racking').children.length,0);
for(const item of [...plan.machines,...plan.benches,...plan.staging]){
 const object=build.root.getObjectByName(item.id);assert(object,item.id);const b=new THREE.Box3().setFromObject(object),r=footprint(item);
 assert(b.min.x>=r.minX-1e-5&&b.max.x<=r.maxX+1e-5,`${item.id}: X footprint`);
 assert(b.min.z>=r.minZ-1e-5&&b.max.z<=r.maxZ+1e-5,`${item.id}: Z footprint`);
 assert(b.min.y>=.134&&b.max.y<=item.height+.135,`${item.id}: vertical footprint`);
}
for(const opening of t.openings){
 const group=build.root.getObjectByName(`opening-${opening.id}`),wall=build.root.getObjectByName(`${opening.side}-wall-cladding`);
 for(const [u,v]of [[0,.5],[-.3,.3],[.3,.7]]){
  const origin=group.localToWorld(new THREE.Vector3(opening.width*u,opening.height*v,-2)),dir=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
  assert.equal(new THREE.Raycaster(origin,dir,0,3).intersectObject(wall,false).length,0,opening.id);
 }
}
const gates=t.openings.filter(o=>o.type==='garage');const open=structuredClone(t);open.openings.find(o=>o.id===gates[0].id).isOpen=true;
const single=buildHallModel(open);single.root.updateMatrixWorld(true);
const closedLeaf=single.root.getObjectByName(`opening-${gates[1].id}`).getObjectByName('sectional-door-moving-leaf');
assert.equal(closedLeaf.rotation.x,0);
open.openings.find(o=>o.id===gates[1].id).isOpen=true;
const through=buildHallModel(open);through.root.updateMatrixWorld(true);
for(const x of [-1.8,0,1.8]) for(const y of [.8,2,3.8]){
 const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-t.length/2-1),new THREE.Vector3(0,0,1),0,t.length+2);
 for(const groupName of ['primary-structure','secondary-structure','openings','production-fitout','service-production'])assert.equal(ray.intersectObject(through.root.getObjectByName(groupName),true).length,0,`Drive-through ${groupName}/${x}/${y}`);
}
const bom=buildBom(t,build,'en-US');for(const [label,qty]of [['Generic production machines (preview)',4],['Assembly / inspection / packing benches (preview)',4],['Raw / finished material staging zones (preview)',4],['Paired cable-tray / air-main routes (preview)',40]])assert.equal(bom.find(row=>row.name===label)?.quantity,qty);
for(const gate of plan.gates){const sign=build.root.getObjectByName(`production-gate-sign-${gate.role}`);assert(sign);const b=new THREE.Box3().setFromObject(sign);assert(gate.opening.side==='front'?b.max.z<-t.length/2:b.min.z>t.length/2);}
const source=fs.readFileSync(new URL('../js/scene.js',import.meta.url),'utf8');
const body=source.match(/  fitCamera\(state, metrics\) \{([\s\S]*?)\n  \}\n\n  setView/)[1];
const fit=new Function('THREE',`return function(state,metrics){${body}\n}`)(THREE);
for(const aspect of [16/9,1,390/760,320/800])for(const flow of ['front-to-back','back-to-front']){
 const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000),controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
 fit.call({camera,controls,currentBuild:build},{...t,productionFlow:flow},build.metrics);
 const b=new THREE.Box3().setFromObject(build.root);for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
  const v=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(v.x)<1&&Math.abs(v.y)<1,'Camera fits hall and both aprons');}
 assert(flow==='front-to-back'?camera.position.z<0:camera.position.z>0);
}
let meshes=0;
for(const s of [t,{...structuredClone(t),width:16,length:24,eaveHeight:4,productionCellCount:6},{...structuredClone(t),width:30,length:60,eaveHeight:12,productionCellCount:6,pitch:25,explode:100}]){
 normalizeOpenings(s);const b=buildHallModel(s);applyExplodedView(b.root,s.explode/100);
 b.root.traverse(o=>{if(o.geometry){for(const attr of Object.values(o.geometry.attributes))for(const n of attr.array)assert(Number.isFinite(n));meshes++;}});
}
console.log(`Three r${THREE.REVISION}: 16 true wall cutouts, equipment footprints, two independent sectional gates, full through-clearance rays, exterior role signs, preview-only BOM, both-flow desktop/mobile camera fits and ${meshes} finite meshes passed.`);
