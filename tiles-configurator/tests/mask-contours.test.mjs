import test from 'node:test';
import assert from 'node:assert/strict';
import {traceMask,simplifyContours} from '../js/maskContours.js';
import {pointInRegions,normalizeRegions,canRemoveBoundaryVertex} from '../js/pavingRegions.js';
const parse=rows=>({mask:Uint8Array.from(rows.join(''),v=>+v),width:rows[0].length,height:rows.length});
function regions(rows,tolerance=0){const d=parse(rows),raw=traceMask(d.mask,d.width,d.height);return {...d,...raw,...simplifyContours(raw.regions,d.width,d.height,tolerance)};}
test('all 512 3×3 masks: every pixel centre round-trips, including diagonal saddles and border contacts',()=>{
 for(let bits=0;bits<512;bits++) {
  const mask=Uint8Array.from({length:9},(_,i)=>(bits>>i)&1), raw=traceMask(mask,3,3), a=simplifyContours(raw.regions,3,3,0);
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)assert.equal(+pointInRegions({x:x+.5,z:y+.5},a.regions),mask[y*3+x],`mask ${bits} pixel ${x},${y}`);
 }
});
test('several intentional holes and a nested island survive tracing and simplification',()=>{
 const r=regions(['111111111','100010001','101010001','100010001','111111111'],4);
 assert.equal(r.regions.length,2);assert.equal(r.regions.reduce((s,r)=>s+r.holes.length,0),2);
});
test('diagonal islands are separate rather than joined; a diagonal opening is a notch, not a filled hole',()=>{
 assert.equal(regions(['10','01']).regions.length,2);
 const r=regions(['011','101','111']);assert.equal(r.regions.length,1);assert.equal(r.regions[0].holes.length,0);assert.ok(r.saddleCorners>0);
});
test('one-pixel holes are never dropped, even with maximum requested simplification',()=>{
 const r=regions(['11111','11111','11011','11111','11111'],4);assert.equal(r.regions[0].holes.length,1);
 assert.equal(pointInRegions({x:2.5,z:2.5},r.regions),false);
});
test('dense curved outline is simplified without changing hole/island counts',()=>{
 const w=240,h=240,m=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const r=Math.hypot(x-120,y-120);m[y*w+x]=+(r<100&&r>30);}
 const raw=traceMask(m,w,h),a=simplifyContours(raw.regions,w,h,.75);
 assert.equal(a.regions.length,1);assert.equal(a.regions[0].holes.length,1);
 assert.ok(a.regions[0].outer.length<raw.regions[0].outer.length/2);
});
test('complexity budget errors do not silently remove any islands',()=>{
 const w=32,h=32,m=Uint8Array.from({length:w*h},(_,i)=>(i%w)%3===0&&Math.floor(i/w)%3===0?1:0),raw=traceMask(m,w,h);
 assert.throws(()=>simplifyContours(raw.regions,w,h),e=>e.code==='areaTooComplex');
});
test('invalid mask, invalid simplification options',()=>{
 assert.throws(()=>traceMask(new Uint8Array(5),3,3));assert.throws(()=>traceMask(Uint8Array.of(2),1,1));
 for(const v of [NaN,-1,5,'1'])assert.throws(()=>simplifyContours([],32,32,v));
 for(const v of [NaN,2,4097,20.5,'20'])assert.throws(()=>simplifyContours([],32,32,.75,v),e=>e.code==='invalidOptions');
});

const circle = (x,z,r,n=80) => Array.from({length:n},(_,i)=>({x:x+r*Math.cos(i*2*Math.PI/n),z:z+r*Math.sin(i*2*Math.PI/n)}));
const signedArea = ring => ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.z-q.x*p.z;},0)/2;

test('corner target applies independently to each outer boundary and hole without mutating detection',()=>{
 const input=[{id:'one',outer:circle(100,100,90),holes:[circle(65,100,20),circle(135,100,20)]},
   {id:'two',outer:circle(260,100,40),holes:[]}], before=structuredClone(input);
 const result=simplifyContours(input,320,200,0);
 assert.deepEqual(input,before);assert.equal(result.maxCornersPerBoundary,20);assert.equal(result.boundariesOverCornerTarget,0);
 assert.equal(result.regions.length,2);assert.equal(result.regions[0].holes.length,2);
 for(let i=0;i<input.length;i++) {
  const originals=[input[i].outer,...input[i].holes], reduced=[result.regions[i].outer,...result.regions[i].holes];
  for(let j=0;j<originals.length;j++) {
   assert.ok(reduced[j].length<=20);assert.ok(reduced[j].length>=3);
   assert.ok(Math.abs(signedArea(reduced[j])/signedArea(originals[j])-1)<=.05+1e-10);
  }
 }
 assert.doesNotThrow(()=>normalizeRegions(result.regions.map(r=>({...r,
   outer:r.outer.map(p=>({x:p.x/2,z:p.z/2})),holes:r.holes.map(h=>h.map(p=>({x:p.x/2,z:p.z/2})))}))));
 const disabled=simplifyContours(input,320,200,0,null);
 assert.equal(disabled.regions[0].outer.length,80);assert.equal(disabled.boundariesOverCornerTarget,0);
});

test('holes near every outer corner prevent unsafe corner removal and trigger the extra-corner notice',()=>{
 const outer=circle(100,100,80,24),holes=circle(100,100,79,24).map(p=>[
   {x:p.x-.04,z:p.z-.04},{x:p.x+.04,z:p.z-.04},{x:p.x+.04,z:p.z+.04},{x:p.x-.04,z:p.z+.04}]);
 const input=[{id:'protected',outer,holes}];
 assert.doesNotThrow(()=>normalizeRegions(input));
 const result=simplifyContours(input,200,200,0);
 assert.equal(result.regions[0].outer.length,24);assert.equal(result.regions[0].holes.length,24);
 assert.equal(result.boundariesOverCornerTarget,1);assert.doesNotThrow(()=>normalizeRegions(result.regions));
});

test('trace bevel markers do not override the requested corner count when removal is safe',()=>{
 const outer=circle(100,100,80,40).map(p=>({...p,locked:true}));
 const locked=simplifyContours([{outer,holes:[]}],200,200,0);
 assert.equal(locked.regions[0].outer.length,20);assert.equal(locked.boundariesOverCornerTarget,0);
 const constrained=simplifyContours([{outer:circle(100,100,80),holes:[]}],200,200,0,3);
 assert.equal(constrained.regions[0].outer.length,3);assert.equal(constrained.boundariesOverCornerTarget,0);
 assert.doesNotThrow(()=>normalizeRegions(constrained.regions));
});

test('a noisy 293-vertex paving outline reaches 20 actual vertices, including hidden editor vertices',()=>{
 const top=Array.from({length:290},(_,i)=>({x:20+i*3,z:180+(i%2?25:-25)+Math.sin(i/23)*12})),
   outer=[...top,{x:887,z:360},{x:450,z:360},{x:20,z:360}],input=[{id:'noisy-paving',outer,holes:[]}];
 assert.equal(outer.length,293);
 const result=simplifyContours(input,1100,747);
 assert.equal(result.regions[0].outer.length,20);assert.equal(result.boundariesOverCornerTarget,0);
 assert.equal(outer.length,293);
 assert.doesNotThrow(()=>normalizeRegions(result.regions.map(r=>({...r,outer:r.outer.map(p=>({x:p.x/10,z:p.z/10}))}))));
});

test('redundant vertices along straight edges can be removed without treating shared endpoints as overlaps',()=>{
 const outer=[{x:0,z:0},{x:1,z:0},{x:2,z:0},{x:3,z:0},{x:3,z:3},{x:2,z:3},{x:1,z:3},{x:0,z:3}];
 assert.equal(canRemoveBoundaryVertex([{outer,holes:[]}],0,-1,1),true);
 const result=simplifyContours([{outer,holes:[]}],4,4,0,4);
 assert.equal(result.regions[0].outer.length,4);assert.equal(signedArea(result.regions[0].outer),9);
});

test('new chords cannot absorb a separate island in a concave notch',()=>{
 const input=[{id:'notched',outer:[{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:60,z:100},{x:50,z:85},{x:40,z:100},{x:0,z:100}],holes:[]},
   {id:'island',outer:[{x:49,z:93},{x:51,z:93},{x:51,z:95},{x:49,z:95}],holes:[]}];
 const result=simplifyContours(input,2000,2000,0,6);
 assert.equal(canRemoveBoundaryVertex(input,0,-1,4),false);
 assert.equal(result.regions.length,2);
 assert.ok(result.regions[0].outer.some(p=>p.x===50&&p.z===85));
 assert.equal(pointInRegions({x:50,z:94},[result.regions[0]]),false);
 assert.doesNotThrow(()=>normalizeRegions(result.regions));
});
