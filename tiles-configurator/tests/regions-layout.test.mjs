import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,layout,estimate,curbLayout,TILES,areaGeometry} from '../js/model.js';
import {clipRect,polygonArea} from '../js/area.js';
import {asRegionState,applyPavingPatch,clearPaving,editBoundaryVertex,replaceBoundary} from '../js/pavingEditor.js';
import {PavingHistory} from '../js/pavingHistory.js';
const rect=(x,z,l,w)=>[{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const input={shape:'regions',areaOrigin:{x:2,z:2},areaRegions:[
 {id:'yard',outer:rect(0,0,4,4),holes:[rect(1,1,2,2)],curbs:{outer:false}},
 {id:'island',outer:rect(5,0,1,1),holes:[],curbs:{outer:false}},
]};
for(const [tile,t] of Object.entries(TILES))for(const pattern of t.patterns)for(const rotation of [0,17,90,180,270,360])
 test(`${tile}/${pattern}/${rotation}: holes and islands have exact tile coverage`,()=>{
  const s=normalize({...input,tile,pattern,rotation}),parts=layout(s),bom=estimate(s,parts);
  near(parts.reduce((sum,p)=>sum+p.area,0),13);near(bom.area,13);near(bom.grossArea,13);
  assert.equal(bom.curbLength,0);
  for(const piece of parts) {
   assert.ok(piece.area>0);
   for(const poly of piece.fragments || [piece.polygon]) {
    near(polygonArea(clipRect(poly,1,1,2,2)),0);
    for(const p of poly)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));
   }
  }
  assert.equal(bom.installedPieces,parts.length);
  assert.equal(bom.cutPieces,parts.filter(p=>p.cut).length);
 });
test('holes coexist with house exclusions without double subtraction',()=>{
 const base={...input,tile:'square',houseEnabled:true,houseShape:'rectangle',houseLength:2,houseWidth:2,houseX:1,houseZ:1};
 near(estimate(base).area,13);near(estimate(base).houseArea,0);
 near(estimate({...base,houseX:0,houseZ:0}).area,10);
});
test('curbs around holes require explicit selection and remain finite',()=>{
 const s=normalize(input);assert.equal(curbLayout(s).length,0);
 const r=s.areaRegions[0];r.curbs.holes[0]=true;r.curbs.edges[1].fill(true);
 const parts=curbLayout(s);assert.ok(parts.length>0);
 for(const p of parts)for(const v of p.polygon) {
  assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.z));
  assert.ok(v.x>=1-1e-8 && v.x<=3+1e-8 && v.z>=1-1e-8 && v.z<=3+1e-8);
 }
 near(estimate(s).curbLength,8);
});
test('migration keeps local grid coordinates, house, origin, and edge choices',()=>{
 const old=normalize({length:6,width:4,houseX:1.2,houseZ:.7,edges:[true,false,false,true]});
 const next=asRegionState(old);
 assert.deepEqual(next.areaOrigin,{x:3,z:2});
 assert.equal(next.houseX,old.houseX);assert.equal(next.houseZ,old.houseZ);
 assert.deepEqual(next.areaRegions[0].curbs.edges[0],old.edges);
 near(estimate(next).area,estimate(old).area);
 const changed=applyPavingPatch(next,rect(-2,-2,1,1),'add');
 assert.deepEqual(changed.areaOrigin,next.areaOrigin);
 assert.equal(changed.houseX,next.houseX);
 const a=layout(next).find(p=>!p.cut && p.x>2 && p.x<3),b=layout(changed).find(p=>p.x===a.x&&p.z===a.z);
 assert.ok(b);assert.equal(b.rotation,a.rotation);
});
test('scene-coordinate corrections use a fixed origin, not bounding-box recentering',()=>{
 const s=normalize({...input,areaOrigin:{x:20,z:10}});
 const out=applyPavingPatch(s,rect(-20,-10,.5,.5),'remove',{sceneCoordinates:true});
 near(areaGeometry(out).area,12.75);assert.deepEqual(out.areaOrigin,s.areaOrigin);
});
test('empty selection is persistent, has no paving or curbs, and keeps all product settings',()=>{
 const s=normalize({...input,tile:'slab',pattern:'basket',rotation:39,color:'brown'}),empty=clearPaving(s);
 assert.equal(empty.shape,'regions');assert.equal(empty.version,2);
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(empty))),empty);
 assert.equal(layout(empty).length,0);assert.equal(estimate(empty).total,0);
 for(const k of ['tile','pattern','rotation','color','areaOrigin'])assert.deepEqual(empty[k],s[k]);
});
test('boundary vertices can be inserted/deleted/moved without discarding holes',()=>{
 const s=normalize(input),key='yard:1',count=s.areaRegions[0].holes[0].length;
 const added=editBoundaryVertex(s,key,0,'insert');assert.equal(added.areaRegions[0].holes[0].length,count+1);
 const removed=editBoundaryVertex(added,key,1,'delete');near(estimate(removed).area,13);
 const bad=rect(-1,-1,2,2);assert.throws(()=>replaceBoundary(s,key,bad),/invalidRegions/);
 assert.deepEqual(s,normalize(input));
});
test('complete edits undo/redo atomically; invalid edits and new edits preserve history semantics',()=>{
 let state=normalize(input);const history=new PavingHistory({capture:()=>state,restore:s=>{state=s;return true;}});
 const before=structuredClone(state),after=applyPavingPatch(state,rect(0,0,.5,.5),'remove');
 history.record();state=after;assert.ok(history.undo());assert.deepEqual(state,before);
 assert.ok(history.redo());assert.deepEqual(state,after);
 assert.ok(history.undo());history.record();state=clearPaving(state);assert.equal(history.future.length,0);
 assert.ok(history.undo());assert.deepEqual(state,before);
 history.clear();assert.equal(history.undo(),false);
});
test('too-large tile grids reject before allocating a preview',()=>{
 assert.throws(()=>layout({...input,tile:'granit',areaRegions:[{outer:rect(0,0,100,100),holes:[]}]}),/areaTooComplex/);
});
