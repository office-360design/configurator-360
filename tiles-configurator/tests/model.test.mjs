import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,TILES,CURBS,normalize,layout,curbLayout,estimate} from '../js/model.js';
for(const [tile,t]of Object.entries(TILES).filter(([,t])=>!t.profile))for(const pattern of t.patterns)for(const rotation of [0,90])test(`${tile} ${pattern} ${rotation}: coverage, clipping and no overlap`,()=>{
 const s=normalize({...DEFAULTS,tile,pattern,rotation,length:1.13,width:1.07}),p=layout(s);
 assert.ok(Math.abs(p.reduce((a,b)=>a+b.l*b.w,0)-s.length*s.width)<1e-8);
 for(let i=0;i<p.length;i++){
  const a=p[i];assert.ok(a.x-a.l/2>=-1e-9&&a.x+a.l/2<=s.length+1e-9&&a.z-a.w/2>=-1e-9&&a.z+a.w/2<=s.width+1e-9);
  for(let j=i+1;j<p.length;j++){const b=p[j];assert.ok(Math.abs(a.x-b.x)>=(a.l+b.l)/2-1e-8||Math.abs(a.z-b.z)>=(a.w+b.w)/2-1e-8);}
 }
 const e=estimate(s,p);assert.ok(e.rows.filter(r=>r.kind==='tile').reduce((a,r)=>a+r.quantity,0)>=p.length);
});
test('BOM reference: 2m square paving, no waste, no curb',()=>{const s={...DEFAULTS,tile:'square',pattern:'stack',length:2,width:2,waste:0,tileRate:100,edges:[false,false,false,false]};const e=estimate(s);assert.equal(e.installedPieces,100);assert.equal(e.cutPieces,0);assert.equal(e.rows[0].quantity,100);assert.ok(Math.abs(e.total-400)<1e-8);});
test('all curb edge combinations: counts, butt corners and independent rounding',()=>{
 for(const curb of Object.keys(CURBS))for(let mask=0;mask<16;mask++){
 const s=normalize({...DEFAULTS,curb,length:1.1,width:1.3,edges:[0,1,2,3].map(i=>Boolean(mask&(1<<i)))}),parts=curbLayout(s),c=CURBS[curb];
 const expected=[0,1,2,3].reduce((n,side)=>n+(s.edges[side]?Math.ceil(((side%2?s.width:s.length+c.width*(Number(s.edges[1])+Number(s.edges[3])))-1e-9)/c.length):0),0);assert.equal(parts.length,expected);
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){const a=parts[i],b=parts[j];assert.ok(Math.abs(a.x-b.x)>=(a.l+b.l)/2-1e-8||Math.abs(a.z-b.z)>=(a.w+b.w)/2-1e-8);}
 assert.equal(estimate(s).rows.find(r=>r.kind==='curb')?.quantity||0,expected);
 }
});
test('spares, rate changes and checker colour split',()=>{const s={...DEFAULTS,tile:'square',pattern:'checker',length:2,width:2,waste:10,tileRate:100,edges:[false,false,false,false]};const e=estimate(s);assert.deepEqual(e.rows.map(r=>r.quantity),[55,55]);assert.ok(Math.abs(e.total-440)<1e-8);assert.equal(estimate({...s,tileRate:0}).total,0);});
test('untrusted saved-state limits and compatible patterns',()=>{const s=normalize({length:Infinity,width:-5,tile:'__proto__',pattern:'bad',edges:[false],tileRate:'bad',waste:999});assert.equal(s.length,6);assert.equal(s.width,1);assert.equal(s.tile,'parket');assert.equal(s.waste,30);assert.deepEqual(s.edges,[false,true,true,true]);assert.equal(normalize({tile:'square',pattern:'herringbone'}).pattern,'stack');});
test('largest rectangle remains bounded',()=>{const p=layout({...DEFAULTS,length:20,width:20,pattern:'herringbone'});assert.ok(p.length<21000);assert.ok(Math.abs(p.reduce((a,b)=>a+b.l*b.w,0)-400)<1e-6);});
