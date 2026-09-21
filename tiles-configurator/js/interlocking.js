import {cross,polygonArea,triangulate,clipRect} from './area.js';

// Clip a polygon against a CCW convex polygon (the site's triangles).
export function clipConvex(points,boundary){
  let result=points;
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],input=result;result=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=-1e-10)result.push(p);
      if((dp>=-1e-10)!==(dq>=-1e-10)){
        const ratio=dp/(dp-dq);result.push({x:p.x+(q.x-p.x)*ratio,z:p.z+(q.z-p.z)*ratio});
      }
    }
  }
  return result;
}

// Simplified nominal H profile. Half-staggered rows tessellate exactly;
// the row pitch includes nominal joints and matches WISE's 35 pcs/m².
export function interlockingLayout(s,t,area){
  const rot=s.rotation===90,L=rot?area.depth:area.width,W=rot?area.width:area.depth;
  const pitch=1/(t.piecesPerM2*t.length),d=t.width-pitch,l=t.length,w=t.width;
  const outline=[[0,0],[l*.2,0],[l*.3,d],[l*.7,d],[l*.8,0],[l,0],[l,w],[l*.8,w],[l*.7,pitch],[l*.3,pitch],[l*.2,w],[0,w]].map(([x,z])=>({x,z}));
  const base=triangulate(outline),site=s.shape==='rectangle'?null:triangulate(area.points).map(tri=>rot?tri.map(p=>({x:p.z,z:p.x})).reverse():tri);
  const transform=p=>rot?{x:p.z,z:p.x}:p,result=[];
  for(let j=-1;j<Math.ceil(W/pitch);j++)for(let i=-1;i<Math.ceil(L/l)+1;i++){
    const x=i*l+(Math.abs(j)%2)*l/2,z=j*pitch;
    if(x+l<=0||x>=L||z+w<=0||z>=W)continue;
    const whole=outline.map(p=>({x:p.x+x,z:p.z+z}));
    const fragments=base.flatMap(tri=>{
      const polygon=tri.map(p=>({x:p.x+x,z:p.z+z}));
      return site?site.map(boundary=>clipConvex(polygon,boundary)):[clipRect(polygon,0,0,L,W)];
    }).filter(p=>p.length>=3&&polygonArea(p)>1e-10);
    const net=fragments.reduce((sum,p)=>sum+polygonArea(p),0);if(net<1e-8)continue;
    const cut=net<1/t.piecesPerM2-1e-8;
    result.push({x:rot?z+w/2:x+l/2,z:rot?x+l/2:z+w/2,l:rot?w:l,w:rot?l:w,accent:false,cut,area:net,profile:true,
      outline:clipRect(whole,0,0,L,W).map(transform),fragments:(cut?fragments:[whole]).map(poly=>poly.map(transform))});
  }
  return result;
}
