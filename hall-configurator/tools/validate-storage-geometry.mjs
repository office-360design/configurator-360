import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { state } from '../js/state.js?v=hall-production-1';
import { STORAGE_TEMPLATE_ID, createHallTemplate } from '../js/templates.js?v=hall-production-1';
import { buildHallModel, applyExplodedView } from '../js/hallFactory.js?v=hall-production-1';
import { normalizeOpenings } from '../js/openings.js?v=hall-production-1';
import { buildBom } from '../js/bom.js?v=hall-production-1';
import { createSectionalDoorAssembly } from '../js/loadingGeometry.js?v=hall-production-1';
globalThis.window = { HALL_CONFIGURATOR_SHARED_SHELL: { state: { locale: 'en-US' } }, location: { hostname: 'localhost' } };
const t=createHallTemplate(STORAGE_TEMPLATE_ID,state);
const b=buildHallModel(t);applyExplodedView(b.root,0);b.root.updateMatrixWorld(true);
assert.equal(b.root.getObjectByName('openings').children.length,20);
assert.equal(b.counts.wallBraces,8); // Two completely unobstructed end bays on each long wall.
let bollards=0,signs=0,tracks=0;
b.root.traverse(o=>{if(o.name.startsWith('loading-bollard-'))bollards++;if(o.name.startsWith('loading-bay-number-'))signs++;if(o.name.startsWith('sectional-overhead-track-'))tracks++;});
assert.equal(bollards,12);assert.equal(signs,6);assert.equal(tracks,12);
for(const o of t.openings){
 const group=b.root.getObjectByName(`opening-${o.id}`),wall=b.root.getObjectByName(`${o.side}-wall-cladding`);
 for(const [u,v] of [[0,.5],[-.3,.3],[.3,.7]]){
  const origin=group.localToWorld(new THREE.Vector3(o.width*u,o.height*v,-2));
  const dir=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
  assert.equal(new THREE.Raycaster(origin,dir,0,3).intersectObject(wall,false).length,0,`Wall cutout ${o.id}`);
 }
}
const mats=[0,1,2].map(()=>new THREE.MeshStandardMaterial());
for(const dims of [[4,4.5],[2.2,2.2],[6,6]]){
 const closed=createSectionalDoorAssembly({width:dims[0],height:dims[1],isOpen:false},...mats);
 const opened=createSectionalDoorAssembly({width:dims[0],height:dims[1],isOpen:true},...mats);
 closed.updateMatrixWorld(true);opened.updateMatrixWorld(true);
 for(const x of [-.3,0,.3]){const ray=new THREE.Raycaster(new THREE.Vector3(x,.6,-2),new THREE.Vector3(0,0,1),0,6);
 assert(ray.intersectObject(closed,true).length>0);assert.equal(ray.intersectObject(opened,true).length,0);}
 const bounds=new THREE.Box3().setFromObject(opened.getObjectByName('sectional-door-moving-leaf'));
 assert(bounds.min.y>dims[1]);assert(bounds.min.z>.2);assert(bounds.max.y<dims[1]+.5);
}
// Open one door without opening the other five. Its aperture and structural route stay clear.
const openedState=structuredClone(t);openedState.openings[0].isOpen=true;
const openedBuild=buildHallModel(openedState);openedBuild.root.updateMatrixWorld(true);
const door=openedBuild.root.getObjectByName(`opening-${t.openings[0].id}`);
const direction=new THREE.Vector3(0,0,1).transformDirection(door.matrixWorld);
for(const x of [-1.5,0,1.5]){
 const origin=door.localToWorld(new THREE.Vector3(x,2,-1));
 for(const name of ['primary-structure','secondary-structure','openings','warehouse-racking']){
  const hits=new THREE.Raycaster(origin,direction,0,5).intersectObject(openedBuild.root.getObjectByName(name),true);
  assert.equal(hits.length,0,`Clear loading route: ${name} ${x}`);
 }
}
for(const bay of b.root.getObjectByName('loading-logistics').children.filter(g=>g.name.startsWith('loading-bay-details-'))){
 const bounds=new THREE.Box3().setFromObject(bay);assert(bounds.min.x>t.width/2+.17,'Bay fittings are outside the right-hand wall');
}
const logistics=b.root.getObjectByName('loading-logistics');
const slab=logistics.getObjectByName('loading-apron-slab');assert(slab);
for(const guide of logistics.children.flatMap(g=>g.children).filter(c=>c.name==='loading-bay-guide-line')){
 const pos=guide.geometry.getAttribute('position');
 for(let i=0;i<pos.count;i++){
  const world=guide.localToWorld(new THREE.Vector3().fromBufferAttribute(pos,i));
  const surface=.135-.12*(world.x-(t.width/2+.175))/t.loadingApronDepth;
  assert(world.y>=surface+.001 && world.y<=surface+.008,`Paint follows ramp ${world.y-surface}`);
 }
}
const bom=buildBom(t,b,'en-US');
for(const [name,qty] of [['Paved loading apron','576.00'],['Loading-bay protective bollards',12],['Loading-bay marking sets',6],['Loading-bay number plates',6]])assert.equal(bom.find(x=>x.name===name)?.quantity,qty);
// The loading-facing camera contains the entire hall+apron at mobile and desktop widths.
const source=fs.readFileSync(new URL('../js/scene.js',import.meta.url),'utf8');
const body=source.match(/  fitCamera\(state, metrics\) \{([\s\S]*?)\n  \}\n\n  setView/)[1];
const fit=new Function('THREE',`return function(state,metrics){${body}\n}`)(THREE);
for(const aspect of [16/9,1,390/760,320/800]){
 const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000);
 const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
 fit.call({camera,controls,currentBuild:b},t,b.metrics);
 const box=new THREE.Box3().setFromObject(b.root);
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(v.x)<1&&Math.abs(v.y)<1);}
 assert(camera.position.x>t.width/2);assert(controls.maxDistance>camera.position.distanceTo(controls.target));
}
let meshes=0;
for(const scenario of [t,{...structuredClone(t),width:16,length:20,eaveHeight:3},{...structuredClone(t),width:30,length:60,eaveHeight:12,pitch:25,explode:100}]){
 normalizeOpenings(scenario);const model=buildHallModel(scenario);applyExplodedView(model.root,scenario.explode/100);
 model.root.traverse(o=>{if(o.geometry){for(const attr of Object.values(o.geometry.attributes))for(const v of attr.array)assert(Number.isFinite(v));meshes++;}});
}
console.log(`Three r${THREE.REVISION}: 20 real cutouts, 6 independent sectional assemblies, clear door/structure routes, fitted apron paint, exterior fittings, BOM and camera bounds; ${meshes} finite meshes passed.`);
