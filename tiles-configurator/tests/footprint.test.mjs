import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFootprint,mappedFootprint} from '../js/footprint.js';
import {normalize,layout,estimate,areaGeometry,TILES} from '../js/model.js';
import {houseGeometry} from '../js/house.js';
import {polygonArea,triangulate} from '../js/area.js';
import {clipConvex} from '../js/interlocking.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const outline=[{x:0,z:0},{x:3,z:0},{x:3,z:1},{x:1.5,z:1.3},{x:1,z:3},{x:0,z:3}];
for(const rotation of [0,90,180,270])for(const shape of ['rectangle','closed4','closed5'])test(`mapped footprint excludes exact area: ${shape}/${rotation}`,()=>{
 const s=normalize({houseEnabled:true,houseShape:'imported',houseFootprint:outline,houseRotation:rotation,houseX:.7,houseZ:.8,shape});
 const house=houseGeometry(s),site=triangulate(areaGeometry(s).points);
 const overlap=house.triangles.reduce((n,t)=>n+site.reduce((sum,b)=>sum+polygonArea(clipConvex(t,b)),0),0);
 near(estimate(s).houseArea,overlap);
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))),s);
});
for(const tile of Object.keys(TILES))test(`mapped footprint works for ${tile} including partial external placement`,()=>{
 const s=normalize({tile,houseEnabled:true,houseShape:'imported',houseFootprint:outline,houseX:-.5,houseZ:.13});
 const house=houseGeometry(s),parts=layout(s);
 for(const p of parts)for(const poly of p.fragments||[])for(const tri of house.triangles)near(polygonArea(clipConvex(poly,tri)),0);
 near(estimate({...s,houseX:30}).houseArea,0);
});
test('invalid or oversized saved footprints safely fall back to manual rectangle',()=>{
 for(const p of [null,[],[{x:NaN,z:0}],outline.map(v=>({x:v.x*10,z:v.z*10})),[{x:0,z:0},{x:3,z:3},{x:0,z:3},{x:3,z:0}]]){
 assert.equal(normalizeFootprint(p),null);assert.equal(normalize({houseShape:'imported',houseFootprint:p}).houseShape,'rectangle');
 }
});
test('closed OSM outlines convert degrees into metre footprints with north up',()=>{
 const g=[{lat:44,lon:26},{lat:44,lon:26.0001},{lat:44.0001,lon:26.0001},{lat:44.0001,lon:26},{lat:44,lon:26}];
 const p=mappedFootprint(g);assert.ok(p);near(Math.max(...p.map(v=>v.z)),11.132);assert.equal(mappedFootprint(g.slice(0,-1)),null);
});
for(const houseShape of ['rectangle','l','imported'])for(const angle of [17,45,123,359])test(`free rotation ${houseShape}/${angle} preserves footprint and excludes paving`,()=>{
 const s=normalize({houseEnabled:true,houseShape,houseFootprint:outline,houseRotation:angle,length:10,width:10,houseX:3,houseZ:3});
 const g=houseGeometry(s),parts=layout(s);near(estimate(s,parts).houseArea,polygonArea(g.outline));
 for(const p of parts)for(const poly of p.fragments||[])for(const tri of g.triangles)near(polygonArea(clipConvex(poly,tri)),0);
 assert.equal(normalize(JSON.parse(JSON.stringify(s))).houseRotation,angle);
});
test('rotation endpoint 360 matches zero and invalid angles are bounded',()=>{
 const s=normalize({houseEnabled:true,houseRotation:360});near(estimate(s).houseArea,estimate({...s,houseRotation:0}).houseArea);
 assert.equal(normalize({houseRotation:Infinity}).houseRotation,0);
 assert.equal(normalize({houseRotation:-12}).houseRotation,0);
 assert.equal(normalize({houseRotation:500}).houseRotation,360);
});
