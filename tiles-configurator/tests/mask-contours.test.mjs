import test from 'node:test';
import assert from 'node:assert/strict';
import {traceMask,simplifyContours} from '../js/maskContours.js';
import {pointInRegions,normalizeRegions} from '../js/pavingRegions.js';
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
});
