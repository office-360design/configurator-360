import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRegions, regionGeometry, combineRegions, triangulateRegions, ringArea, pointInRegions, REGION_LIMITS} from '../js/pavingRegions.js';
const rect = (x,z,l,w) => [{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
const regions = (...outers) => normalizeRegions(outers.map(outer=>({outer,holes:[]})));
const area = r => regionGeometry(r).area;
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function check(r, expected) {
 near(area(r),expected);
 const tris=triangulateRegions(r);
 near(tris.reduce((s,t)=>s+ringArea(t),0),expected);
 for(const t of tris) assert.ok(pointInRegions({x:t.reduce((s,p)=>s+p.x,0)/3,z:t.reduce((s,p)=>s+p.z,0)/3},r));
 return r;
}
test('hole, hole fill, connected union, disconnected union and split',()=>{
 let r=regions(rect(0,0,6,4));
 r=check(combineRegions(r,rect(1,1,2,2),'remove'),20);
 assert.equal(r[0].holes.length,1);assert.equal(r[0].curbs.holes[0],false);
 r=check(combineRegions(r,rect(1,1,2,2),'add'),24);assert.equal(r[0].holes.length,0);
 r=check(combineRegions(r,rect(5,0,2,4),'add'),28);assert.equal(r.length,1);
 r=check(combineRegions(r,rect(9,0,1,1),'add'),29);assert.equal(r.length,2);
 r=check(combineRegions(r,rect(3,-1,1,6),'remove'),25);assert.equal(r.length,3);
});
test('empty, no-op, identical and common edges',()=>{
 const r=regions(rect(0,0,4,4));
 check(combineRegions(r,rect(0,0,4,4),'add'),16);
 check(combineRegions(r,rect(0,0,4,4),'remove'),0);
 check(combineRegions(r,rect(4,0,2,4),'add'),24);
 check(combineRegions(r,rect(4,0,2,4),'remove'),16);
 assert.equal(check(combineRegions(r,rect(4,4,2,2),'add'),20).length,2);
 check(combineRegions([],rect(0,0,1,1),'remove'),0);
 check(combineRegions([],rect(0,0,1,1),'add'),1);
});
test('island inside a hole, several holes, either winding, concavity',()=>{
 const r=normalizeRegions([{outer:rect(0,0,10,10).reverse(), holes:[rect(1,1,4,4),rect(7,7,2,2)]},
 {outer:rect(2,2,1,1),holes:[]}]);
 check(r,81);
 check(combineRegions(r,rect(3,3,5,5),'add'),86);
});
test('dense contour and straight vertices are not truncated to 64',()=>{
 const outer=Array.from({length:360},(_,i)=>({x:5*Math.cos(i*Math.PI/180),z:5*Math.sin(i*Math.PI/180)}));
 const r=regions(outer); assert.equal(r[0].outer.length,360);check(r,ringArea(outer));
 check(regions([{x:0,z:0},{x:1,z:0},{x:2,z:0},{x:2,z:2},{x:0,z:2}]),4);
 check(regions(rect(0,0,.02,.02)),.0004);
});
test('bad topology and excessive input fail rather than repairing silently',()=>{
 assert.throws(()=>regions([{x:0,z:0},{x:2,z:2},{x:0,z:2},{x:2,z:0}]),/invalidRegions/);
 assert.throws(()=>normalizeRegions([{outer:rect(0,0,3,3),holes:[rect(2,2,2,2)]}]),/invalidRegions/);
 assert.throws(()=>regions(rect(0,0,3,3),rect(1,1,3,3)),/invalidRegions/);
 assert.throws(()=>regions([{x:NaN,z:0},...rect(0,0,3,3)]),/invalidRegions/);
 assert.throws(()=>regions(rect(0,0,REGION_LIMITS.extent+1,3)),/areaTooComplex/);
});
test('fixed origin is independent of the selection bounds',()=>{
 const r=regions(rect(-8,-2,3,2),rect(4,2,3,4)); const g=regionGeometry(r,{x:3,z:2});
 assert.equal(g.centerX,3);assert.equal(g.centerZ,2);assert.equal(g.minX,-8);assert.equal(g.width,15);
 const empty=regionGeometry([],{x:3,z:2});assert.equal(empty.width,0);assert.equal(empty.area,0);assert.equal(empty.centerX,3);
});
test('seeded rectangles: union/difference conserve intersection area',()=>{
 let seed=881;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<250;i++) {
  const a=[rand()*4,rand()*4,rand()*3+.1,rand()*3+.1],b=[rand()*4,rand()*4,rand()*3+.1,rand()*3+.1];
  const common=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*
   Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
  check(combineRegions(regions(rect(...a)),rect(...b),'add'),a[2]*a[3]+b[2]*b[3]-common);
  check(combineRegions(regions(rect(...a)),rect(...b),'remove'),a[2]*a[3]-common);
 }
});
