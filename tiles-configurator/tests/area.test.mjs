import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {TILES,CURBS,DEFAULTS,normalize,areaGeometry,layout,estimate,curbLayout} from '../js/model.js';
import {polygonArea,triangulate,cross} from '../js/area.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fenceSource=await readFile(new URL('../../fence-configurator/js/state.js',import.meta.url),'utf8');
const functions=fenceSource.slice(fenceSource.indexOf('export function calculateClosedFenceGeometry'),fenceSource.indexOf('export function runLength')).replaceAll('export function','function');
const fence=vm.runInNewContext(`${functions}; ({four:calculateClosedFenceGeometry,five:calculateClosedFiveFenceGeometry})`);
for(const shape of ['closed4','closed5'])test(`${shape} matches fence perimeter controls`,()=>{
 const s=normalize({shape,runA:5,runB:3,runC:4,runD:2,angleB:110});
 const expected=(shape==='closed4'?fence.four:fence.five)(s),g=areaGeometry(s);
 const p=['A','B','C','D',...(shape==='closed5'?['E']:[])].map(k=>expected[k]);
 near(g.area,polygonArea(p));g.lengths.forEach((l,i)=>near(l,Math.hypot(p[(i+1)%p.length].x-p[i].x,p[(i+1)%p.length].z-p[i].z)));
});
test('known trapezoid and regular pentagon areas',()=>{
 near(areaGeometry(normalize({shape:'closed4',runA:6,runB:4,runC:4,angleB:90})).area,20);
 near(areaGeometry(normalize({shape:'closed5',runA:2,runB:2,runC:2,runD:2,angleB:108})).area,5/Math.tan(Math.PI/5));
});
const cases=[{shape:'closed4',runA:2,runB:1,runC:1.5,angleB:65},{shape:'closed5',runA:2,runB:2,runC:2,runD:2,angleB:108},{shape:'closed5',runA:2,runB:2,runC:2,runD:2,angleB:45}];
for(const [index,shape]of cases.entries())for(const [tile,catalog]of Object.entries(TILES))for(const pattern of catalog.patterns)for(const rotation of [0,90])test(`polygon ${index} ${tile}/${pattern}/${rotation}: clipping and BOM coverage`,()=>{
 const s=normalize({...shape,tile,pattern,rotation}),g=areaGeometry(s),pieces=layout(s),triangles=triangulate(g.points);
 near(triangles.reduce((n,p)=>n+polygonArea(p),0),g.area);
 near(pieces.reduce((n,p)=>n+p.area,0),g.area);
 for(const piece of pieces)for(const poly of piece.fragments||[])for(const p of poly)assert.ok(triangles.some(tri=>tri.every((v,i)=>cross(v,tri[(i+1)%3],p)>=-1e-7)));
 const e=estimate(s,pieces);near(e.area,g.area);near(e.perimeter,g.perimeter);
 assert.ok(e.rows.filter(r=>r.kind==='tile').reduce((n,r)=>n+r.quantity,0)>=pieces.length);
 near(e.total,e.rows.reduce((n,r)=>n+r.total,0));
});
test('curbs follow every enabled side, use whole stock pieces, and never enter paving',()=>{
 for(const shape of cases)for(const curb of Object.keys(CURBS))for(let mask=0;mask<2**(shape.shape==='closed4'?4:5);mask++){
  const s=normalize({...shape,curb,edges:Array.from({length:5},(_,i)=>Boolean(mask&(1<<i)))}),g=areaGeometry(s),parts=curbLayout(s);
  for(const part of parts){assert.ok(s.edges[part.side]);assert.ok(part.runLength<=CURBS[curb].length+1e-8);assert.ok(part.runLength>0);assert.ok(polygonArea(part.polygon)>0);
   const a=g.points[part.side],b=g.points[(part.side+1)%g.points.length];for(const p of part.polygon)assert.ok(cross(a,b,p)<=1e-7);
  }
  const e=estimate(s);assert.equal(e.rows.find(r=>r.kind==='curb')?.quantity||0,parts.length);
 }
});
test('old rectangle snapshots retain geometry, quantities and edge states',()=>{
 const old={version:1,length:6,width:4,tile:'parket',pattern:'running',edges:[false,true,false,true]};
 const s=normalize(old);assert.equal(s.shape,'rectangle');assert.deepEqual(s.edges,old.edges);near(estimate(s).area,24);assert.equal(layout(s).length,1220);
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))),s);
});
test('fifth edge survives save/restore; first four remain unchanged on switching',()=>{
 const s=normalize({...cases[1],edges:[false,true,false,true,false]});assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))),s);
 assert.deepEqual(normalize({...s,shape:'closed4'}).edges,[false,true,false,true]);assert.equal(normalize({...DEFAULTS,shape:'closed5'}).edges[4],true);
});
test('crossing, collapsed and very sharp five-sided areas are rejected',()=>{
 let rejected=0;
 for(const runA of [1,2,20])for(const runD of [1,2,20])for(const angleB of [30,90,150]){
  try{areaGeometry(normalize({shape:'closed5',runA,runB:1,runC:1,runD,angleB}));}catch{rejected++;}
 }
 assert.ok(rejected>0);assert.throws(()=>areaGeometry(normalize({shape:'closed5',runA:1,runB:1,runC:1,runD:20,angleB:30})),/invalidArea/);
});
