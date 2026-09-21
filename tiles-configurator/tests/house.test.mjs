import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,layout,estimate,areaGeometry,curbLayout,TILES} from '../js/model.js';
import {polygonArea,clipRect,triangulate} from '../js/area.js';
import {houseGeometry,rectanglePoints,subtractHouse} from '../js/house.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const polygons=p=>p.fragments||[p.polygon||rectanglePoints({x:p.x-p.l/2,z:p.z-p.w/2,l:p.l,w:p.w})];
test('rectangular and L footprints remove their exact area and update price',()=>{
 const base=normalize({waste:0,edges:[false,false,false,false],tile:'square',pattern:'stack',tileRate:100});
 const rectangle=estimate({...base,houseEnabled:true});near(rectangle.area,18);near(rectangle.houseArea,6);near(rectangle.grossArea,24);assert.ok(rectangle.total<estimate(base).total);
 const l=estimate({...base,houseEnabled:true,houseShape:'l'});near(l.area,20);near(l.houseArea,4);
});
for(const shape of ['rectangle','closed4','closed5'])for(const houseShape of ['rectangle','l'])for(const houseRotation of [0,90,180,270])test(`${shape}/${houseShape}/${houseRotation}: cuts exclude the house and preserve net area`,()=>{
 const s=normalize({shape,houseEnabled:true,houseShape,houseRotation}),g=areaGeometry(s),house=houseGeometry(s),pieces=layout(s);
 const overlap=triangulate(g.points).reduce((n,tri)=>n+house.rectangles.reduce((sum,r)=>sum+polygonArea(clipRect(tri,r.x,r.z,r.l,r.w)),0),0);
 near(estimate(s,pieces).area,g.area-overlap);
 for(const piece of [...pieces,...curbLayout(s)])for(const poly of polygons(piece))for(const r of house.rectangles)near(polygonArea(clipRect(poly,r.x,r.z,r.l,r.w)),0);
});
for(const [tile,catalog]of Object.entries(TILES))for(const pattern of catalog.patterns)for(const rotation of [0,90])test(`${tile}/${pattern}/${rotation}: house clipping respects the selected pattern`,()=>{
 const s=normalize({tile,pattern,rotation,houseEnabled:true,houseShape:'l',houseX:1.13,houseZ:.79});const e=estimate(s);near(e.area,20);assert.ok(e.cutPieces>0);
 assert.ok(e.rows.filter(r=>r.kind==='tile').reduce((n,r)=>n+r.quantity,0)>=e.installedPieces);
});
test('moving, external, partial and full coverage have consistent estimates',()=>{
 const s=normalize({houseEnabled:true});near(estimate({...s,houseX:-1}).houseArea,4);near(estimate({...s,houseX:20}).houseArea,0);
 const full=estimate({...s,houseLength:20,houseWidth:20,houseX:-2,houseZ:-2});near(full.area,0);assert.equal(full.installedPieces,0);near(full.total,0);
 near(estimate({...s,houseX:1.15,houseZ:.35}).houseArea,6);
});
test('disabling house restores original layout and old snapshots default to disabled',()=>{
 const old={version:1,length:6,width:4};const s=normalize(old);assert.equal(s.houseEnabled,false);
 assert.deepEqual(layout({...s,houseEnabled:false,houseShape:'l',houseX:3}),layout(s));
 const custom=normalize({...s,houseEnabled:true,houseShape:'l',houseRotation:270,houseX:-1.5});assert.deepEqual(normalize(JSON.parse(JSON.stringify(custom))),custom);
});
test('subtraction can keep four pieces of one tile around an internal cutout',()=>{
 const result=subtractHouse([rectanglePoints({x:0,z:0,l:1,w:1})],[{x:.25,z:.25,l:.5,w:.5}]);assert.equal(result.length,4);near(result.reduce((a,p)=>a+polygonArea(p),0),.75);
});
test('house dimensions and wing constraints sanitize untrusted saved state',()=>{
 const s=normalize({houseEnabled:'false',houseLength:1,houseWidth:1,houseWingWidth:99,houseWingDepth:-2,houseX:Infinity,houseZ:-100,houseHeight:50,houseRotation:45});
 assert.equal(s.houseEnabled,false);assert.equal(s.houseWingWidth,.75);assert.equal(s.houseWingDepth,.25);assert.equal(s.houseX,1.5);assert.equal(s.houseZ,-20);assert.equal(s.houseHeight,8);assert.equal(s.houseRotation,0);
});
