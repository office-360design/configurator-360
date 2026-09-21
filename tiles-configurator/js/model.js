// Nominal WISE formats. Rates are editable demo values in RON, not supplier prices.
export const COLORS = { grey:'#969a98', charcoal:'#414748', red:'#a65343', brown:'#806453', sand:'#c9b796', white:'#d8d5ca', noir:['#555957','#9c9d96','#72746d'] };
export const TILES = {
  parket:{name:'Parket', length:.2,width:.1,thickness:.06,price:85,colors:['grey','charcoal','red','brown','white','noir'],patterns:['running','stack','herringbone','basket'],source:'https://wise.ro/produs/parket/'},
  square:{name:'Pătrat',length:.2,width:.2,thickness:.06,price:80,colors:['grey','charcoal','red','brown'],patterns:['stack','running','checker'],source:'https://wise.ro/produs/patrat/'},
  slab:{name:'Dală 60 × 30 × 5',length:.6,width:.3,thickness:.05,price:110,colors:['grey','charcoal','brown','noir'],patterns:['stack','running','herringbone','basket'],source:'https://wise.ro/produse/'}
};
export const CURBS = {
  garden:{name:'G600',length:.6,width:.05,height:.21,price:18,colors:['grey','charcoal','red','brown'],source:'https://wise.ro/produs/bordura-g600/'},
  sidewalk:{name:'T500',length:.5,width:.1,height:.15,price:24,colors:['grey','charcoal','red','brown','noir'],source:'https://wise.ro/produs/bordura-t500/'}
};
export const DEFAULTS = Object.freeze({version:1,length:6,width:4,tile:'parket',color:'grey',accent:'charcoal',pattern:'running',rotation:0,curb:'garden',curbColor:'charcoal',edges:[true,true,true,true],waste:7,tileRate:85,curbRate:18});
const number = (v,d,min,max) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(max,Math.max(min,Number(v))) : d;
export function normalize(input={}) {
  const s={...DEFAULTS,...input};
  s.tile=Object.hasOwn(TILES,s.tile)?s.tile:DEFAULTS.tile;
  const tile=TILES[s.tile];
  s.curb=Object.hasOwn(CURBS,s.curb)?s.curb:DEFAULTS.curb;
  s.color=tile.colors.includes(s.color)?s.color:tile.colors[0];
  s.accent=tile.colors.includes(s.accent)?s.accent:tile.colors[1];
  s.curbColor=CURBS[s.curb].colors.includes(s.curbColor)?s.curbColor:'grey';
  s.pattern=tile.patterns.includes(s.pattern)?s.pattern:tile.patterns[0];
  s.length=number(s.length,6,1,20); s.width=number(s.width,4,1,20);
  s.waste=number(s.waste,7,0,30);s.tileRate=number(s.tileRate,tile.price,0,10000);s.curbRate=number(s.curbRate,CURBS[s.curb].price,0,10000);
  s.rotation=Number(s.rotation)===90?90:0;
  s.edges=Array.from({length:4},(_,i)=>Array.isArray(s.edges)&&typeof s.edges[i]==='boolean'?s.edges[i]:true);
  return Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,k==='version'?1:s[k]]));
}
export function layout(input) {
  const s=normalize(input),t=TILES[s.tile],rot=s.rotation===90;
  const L=rot?s.width:s.length,W=rot?s.length:s.width, result=[];
  const add=(x,z,l,w,accent=false)=>{
    const x0=Math.max(0,x),z0=Math.max(0,z),x1=Math.min(L,x+l),z1=Math.min(W,z+w);
    if(x1-x0<1e-8||z1-z0<1e-8)return;
    const a={x:(x0+x1)/2,z:(z0+z1)/2,l:x1-x0,w:z1-z0,accent,cut:x0>x+1e-8||z0>z+1e-8||x1<x+l-1e-8||z1<z+w-1e-8};
    result.push(rot?{...a,x:a.z,z:a.x,l:a.w,w:a.l}:a);
  };
  if(s.pattern==='herringbone') {
    const u=t.width;
    for(let j=-2;j<Math.ceil(W/u)+2;j++)for(let i=-2;i<Math.ceil(L/u)+2;i++){
      const k=((i-j)%4+4)%4;
      if(k===0)add(i*u,j*u,2*u,u);
      if(k===3)add(i*u,j*u,u,2*u);
    }
  } else if(s.pattern==='basket') {
    const u=t.width;
    for(let j=0;j<Math.ceil(W/(2*u));j++)for(let i=0;i<Math.ceil(L/(2*u));i++)for(let k=0;k<2;k++){
      if((i+j)%2)add(i*2*u+k*u,j*2*u,u,2*u);
      else add(i*2*u,j*2*u+k*u,2*u,u);
    }
  } else {
    for(let j=0;j<Math.ceil(W/t.width);j++){
      const shift=s.pattern==='running'&&j%2?-t.length/2:0;
      for(let i=0;i<Math.ceil(L/t.length)+1;i++)add(i*t.length+shift,j*t.width,t.length,t.width,s.pattern==='checker'&&(i+j)%2===1);
    }
  }
  return result;
}
export function curbLayout(input) {
  const s=normalize(input),c=CURBS[s.curb],out=[];
  // Front/back extend over enabled side curbs: butt joints, no corner overlap.
  const extLeft=s.edges[3]?c.width:0,extRight=s.edges[1]?c.width:0;
  const lengths=[s.length+extLeft+extRight,s.width,s.length+extLeft+extRight,s.width];
  for(let side=0;side<4;side++)if(s.edges[side]){
    const length=lengths[side],count=Math.ceil((length-1e-9)/c.length);
    for(let i=0;i<count;i++){
      const size=Math.min(c.length,length-i*c.length),p=i*c.length+size/2;
      out.push(side%2===0?{side,x:p-extLeft,z:side===0?-c.width/2:s.width+c.width/2,l:size,w:c.width}:{side,x:side===1?s.length+c.width/2:-c.width/2,z:p,l:c.width,w:size});
    }
  }
  return out;
}
export function estimate(input,pieces=layout(input)) {
  const s=normalize(input),t=TILES[s.tile],curbs=curbLayout(s),area=s.length*s.width,unitArea=t.length*t.width;
  const rows=[];
  for(const accent of [false,true]){
    const parts=pieces.filter(p=>p.accent===accent); if(!parts.length)continue;
    const net=parts.reduce((a,p)=>a+p.l*p.w,0);
    const quantity=Math.max(parts.length,Math.ceil(net*(1+s.waste/100)/unitArea-1e-8));
    rows.push({kind:'tile',name:t.name,color:accent?s.accent:s.color,quantity,unit:'pcs',area:quantity*unitArea,rate:s.tileRate*unitArea,total:quantity*unitArea*s.tileRate});
  }
  if(curbs.length)rows.push({kind:'curb',name:CURBS[s.curb].name,color:s.curbColor,quantity:curbs.length,unit:'pcs',rate:s.curbRate,total:curbs.length*s.curbRate});
  return {area,perimeter:2*(s.length+s.width),cutPieces:pieces.filter(p=>p.cut).length,installedPieces:pieces.length,curbLength:curbs.reduce((a,p)=>a+(p.side%2?p.w:p.l),0),rows,total:rows.reduce((a,r)=>a+r.total,0)};
}
