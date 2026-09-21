import {subtractFootprint} from './footprint.js';
import {clipRect,polygonArea,triangulate} from './area.js';
export const rectanglePoints = r => [{x:r.x,z:r.z},{x:r.x+r.l,z:r.z},{x:r.x+r.l,z:r.z+r.w},{x:r.x,z:r.z+r.w}];
// The two L wings are disjoint, so excluded area is never counted twice.
export function houseGeometry(s){
  if(!s.houseEnabled)return {rectangles:[],outline:[]};
  const l=s.houseLength,w=s.houseWidth,a=s.houseWingWidth,b=s.houseWingDepth;
  const raw=s.houseShape==='l'?[{x:0,z:0,l,w:b},{x:0,z:b,l:a,w:w-b}]:[{x:0,z:0,l,w}];
  const outline=s.houseShape==='imported'?s.houseFootprint:s.houseShape==='l'?[{x:0,z:0},{x:l,z:0},{x:l,z:b},{x:a,z:b},{x:a,z:w},{x:0,z:w}]:rectanglePoints(raw[0]);
  const angle=s.houseRotation*Math.PI/180,c=Math.cos(angle),sin=Math.sin(angle);
  const transform=p=>({x:s.houseX+l/2+(p.x-l/2)*c-(p.z-w/2)*sin,z:s.houseZ+w/2+(p.x-l/2)*sin+(p.z-w/2)*c});
  const rectangles=raw.map(r=>{const p=rectanglePoints(r).map(transform),x=Math.min(...p.map(v=>v.x)),z=Math.min(...p.map(v=>v.z));return {x,z,l:Math.max(...p.map(v=>v.x))-x,w:Math.max(...p.map(v=>v.z))-z};});
  const transformed=outline.map(transform);
  const polygonClip=s.houseShape==='imported'||s.houseRotation%90!==0;
  return {rectangles:polygonClip?[]:rectangles,outline:transformed,triangles:polygonClip?triangulate(transformed):null};
}
export function subtractHouse(polygons,rectangles){
  let result=polygons;
  for(const r of rectangles){
    result=result.flatMap(poly=>{
      const minX=Math.min(...poly.map(p=>p.x)),maxX=Math.max(...poly.map(p=>p.x)),minZ=Math.min(...poly.map(p=>p.z)),maxZ=Math.max(...poly.map(p=>p.z));
      if(r.x>=maxX-1e-9||r.x+r.l<=minX+1e-9||r.z>=maxZ-1e-9||r.z+r.w<=minZ+1e-9)return [poly];
      // Disjoint outside strips: left, right, then front/back within the middle.
      const x0=Math.max(minX,r.x),x1=Math.min(maxX,r.x+r.l);
      const strips=[{x:minX,z:minZ,l:x0-minX,w:maxZ-minZ},{x:x1,z:minZ,l:maxX-x1,w:maxZ-minZ},{x:x0,z:minZ,l:x1-x0,w:Math.max(0,r.z-minZ)},{x:x0,z:Math.max(minZ,r.z+r.w),l:x1-x0,w:Math.max(0,maxZ-Math.max(minZ,r.z+r.w))}];
      return strips.filter(v=>v.l>1e-9&&v.w>1e-9).map(v=>clipRect(poly,v.x,v.z,v.l,v.w)).filter(p=>p.length>=3&&polygonArea(p)>1e-9);
    });
  }
  return result;
}
export function excludeHouse(pieces,s,{curbWidth}={}){
  const {rectangles,triangles}=houseGeometry(s);if(!rectangles.length&&!triangles)return pieces;
  return pieces.flatMap(p=>{
    const polygons=p.fragments||[p.polygon||rectanglePoints({x:p.x-p.l/2,z:p.z-p.w/2,l:p.l,w:p.w})];
    const original=polygons.reduce((a,poly)=>a+polygonArea(poly),0),fragments=triangles?subtractFootprint(polygons.flatMap(poly=>{const signed=poly.reduce((n,v,i)=>n+v.x*poly[(i+1)%poly.length].z-v.z*poly[(i+1)%poly.length].x,0);return triangulate(signed<0?[...poly].reverse():poly);}),triangles):subtractHouse(polygons,rectangles),area=fragments.reduce((a,poly)=>a+polygonArea(poly),0);
    if(area<1e-8)return [];
    if(Math.abs(area-original)<1e-8)return [p];
    return [{...p,polygon:undefined,fragments,area,cut:true,...(curbWidth?{runLength:area/curbWidth}:{})}];
  });
}
