import test from 'node:test';import assert from 'node:assert/strict';
import { fixture } from './fixtures/model-results.mjs';
import { prepareModelImport } from '../js/segmentationAdapter.js';
import { modelCameraMatrices,groundToImage } from '../js/modelCamera.js';
import {projectDebugRing,projectDebugSegment,debugGridSegments} from '../js/debugProjection.js';
const transpose=m=>Array.from({length:16},(_,i)=>m[(i%4)*4+Math.floor(i/4)]);
const p=prepareModelImport(fixture());
function view(width,height,origin={x:0,z:0}) {
 const scale=Math.min((width-48)/160,(height-48)/120),rect={left:(width-160*scale)/2,top:(height-120*scale)/2,width:160*scale,height:120*scale};
 const m=modelCameraMatrices(p.camera,{width,height},rect,origin);
 return {width,height,rect,origin,groundY:-.16,photoMode:true,hasCalibration:true,view:transpose(m.view),projection:transpose(m.projection)};
}
for(const [w,h] of [[1200,800],[390,650],[844,300],[390,650]])test(`debug geometry and holes align with the photo at ${w}×${h}`,()=>{
 const v=view(w,h,{x:3,z:-2});
 for(const region of p.regions)for(const ring of [region.outer,...region.holes]) {
  const projected=projectDebugRing(ring,v);assert.equal(projected.length,ring.length);
  ring.forEach((point,i)=>{const q=groundToImage(p.camera,point);assert.ok(Math.abs(projected[i].x-(v.rect.left+q.x/160*v.rect.width))<1e-7);
   assert.ok(Math.abs(projected[i].y-(v.rect.top+q.y/120*v.rect.height))<1e-7);});
 }
});
test('projection and grid leave calibration and edited geometry unchanged',()=>{
 const v=view(1000,700),before=structuredClone(v),design={areaRegions:p.regions},copy=structuredClone(design);
 const grid=debugGridSegments(design,v);assert.ok(grid.length>0);assert.ok(grid.length<=202);
 for(const segment of grid)for(const q of segment)assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y));
 assert.deepEqual(v,before);assert.deepEqual(design,copy);
});
test('points behind camera do not create unbounded screen polygons',()=>{
 const v=view(1000,700),ring=[{x:0,z:100},{x:1,z:100},{x:1,z:101}];
 assert.deepEqual(projectDebugRing(ring,v),[]);
 assert.equal(projectDebugSegment(ring[0],ring[1],v),null);
});
test('uncalibrated photo has no fabricated 1m grid or projected design',()=>{
 const v={...view(1000,700),hasCalibration:false};
 assert.deepEqual(debugGridSegments({areaRegions:p.regions},v),[]);
 assert.deepEqual(projectDebugRing(p.regions[0].outer,v),[]);
});
