import test from 'node:test';
import assert from 'node:assert/strict';
import { reprojectRegions } from '../js/referenceReprojection.js';
import { regionGeometry, normalizeRegions } from '../js/pavingRegions.js';
import { PavingHistory } from '../js/pavingHistory.js';
import { prepareModelImport } from '../js/segmentationAdapter.js';
import { groundToImage, imageToGround } from '../js/modelCamera.js';
import { fixture } from './fixtures/model-results.mjs';

const rect=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
const regions=normalizeRegions([{id:'with-hole',outer:rect(0,0,4,4),holes:[rect(1,1,1,1)],curbs:{outer:true,holes:[true]}},
 {id:'island',outer:rect(7,0,1,1),holes:[],curbs:{outer:false}}]);
test('reprojection preserves intentional holes, regions, IDs and curb choices',()=>{
 const before=structuredClone(regions);
 const mapped=reprojectRegions(regions,p=>({x:p.x,z:p.z}),p=>({x:p.x*1.3+.4,z:p.z*1.3-.2}));
 assert.equal(mapped.length,2);assert.equal(mapped[0].holes.length,1);assert.equal(mapped[0].id,'with-hole');
 assert.deepEqual(mapped[0].curbs,regions[0].curbs);assert.deepEqual(regions,before);
 const g=regionGeometry(mapped);assert.ok(Math.abs(g.area-16*1.3**2)<1e-8);
});
test('camera projection roundtrip preserves imported and intentional rings',()=>{
 const result=prepareModelImport(fixture());
 const converted=reprojectRegions(result.regions,p=>groundToImage(result.camera,p),p=>imageToGround(result.camera,p.x,p.y));
 for(let i=0;i<converted.length;i++){
   const a=[converted[i].outer,...converted[i].holes].flat(),b=[result.regions[i].outer,...result.regions[i].holes].flat();
   assert.equal(a.length,b.length);a.forEach((p,k)=>assert.ok(Math.hypot(p.x-b[k].x,p.z-b[k].z)<1e-8));
 }
});
for(const [name,project,unproject] of [
 ['unprojectable hole',p=>p,p=>p.x===1&&p.z===1?null:p],
 ['invalid outer',p=>p,p=>p.x===4?{x:Infinity,z:0}:p],
 ['missing old projection',p=>p.x===7?null:p,p=>p],
 ['topology collapsed',p=>p,()=>({x:0,z:0})],
])test(`failed recalibration is atomic: ${name}`,()=>{
 const before=JSON.stringify(regions);assert.throws(()=>reprojectRegions(regions,project,unproject));
 assert.equal(JSON.stringify(regions),before);
});
test('history accepts an explicit pre-calibration snapshot as ONE undo step',()=>{
 let state={camera:'model',regions:structuredClone(regions)}, before=structuredClone(state);
 const h=new PavingHistory({capture:()=>state,restore:s=>{state=s;return true;}});
 state={...state,calibrating:true};h.record(before);state={camera:'reference',regions:structuredClone(regions)};
 assert.ok(h.undo());assert.deepEqual(state,before);assert.ok(h.redo());assert.equal(state.camera,'reference');
});
