import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout,normalize,COLORS} from '../js/model.js';
import {stoneAppearance} from '../js/stoneAppearance.js';
const key=p=>`${p.shadeX??p.x},${p.shadeZ??p.z}`;
test('mixed colours stay attached to stones across outline and house cuts',()=>{
  for(const tile of ['parket','tetraNova','hbeton'])for(const rotation of [0,90]){
    const state=normalize({tile,rotation,pattern:'stack',length:6,width:4});
    const original=new Map(layout(state).map(p=>[key(p),stoneAppearance(p,COLORS.noir)]));
    for(const patch of [{shape:'closed4',runA:6,runB:4,runC:4,angleB:90},{houseEnabled:true,houseX:1.13,houseZ:.79}]){
      const parts=layout({...state,...patch});let shared=0;
      for(const p of parts)if(original.has(key(p))){assert.deepEqual(stoneAppearance(p,COLORS.noir),original.get(key(p)));shared++;}
      assert.ok(shared>100);
    }
  }
});
test('mixed palette does not repeat every three stones or lock to rows',()=>{
  for(const width of [3,3.1,3.2,5.9]){
    const pieces=layout(normalize({tile:'parket',pattern:'stack',length:width,width:4}));
    const shades=pieces.map(p=>stoneAppearance(p,COLORS.noir).base);
    const repeats=shades.slice(3).filter((v,i)=>v===shades[i]).length/(shades.length-3);
    assert.ok(repeats>.2&&repeats<.45,`period-three match rate ${repeats}`);
    for(const colour of COLORS.noir){const share=shades.filter(v=>v===colour).length/shades.length;assert.ok(share>.2&&share<.45);}
  }
});
test('intentional checker assignment and solid colours are preserved',()=>{
  const pieces=layout(normalize({tile:'square',pattern:'checker'}));
  for(const p of pieces){const palette=p.accent?COLORS.red:COLORS.grey;const appearance=stoneAppearance(p,palette);assert.equal(appearance.base,palette);assert.ok(appearance.brightness>=.96&&appearance.brightness<=1.04);}
});
test('woven mixed finishes retain directional contrast through rotations and cuts',()=>{
  for(const pattern of ['herringbone','basket'])for(const rotation of [0,90]){
    const s=normalize({pattern,rotation,color:'noir',length:6,width:4});
    const original=new Map(layout(s).map(p=>[key(p),stoneAppearance(p,COLORS.noir).base]));
    for(const patch of [{},{shape:'closed4',runA:6,runB:4,runC:4,angleB:90},{shape:'closed5'},{houseEnabled:true,houseShape:'l',houseX:.13,houseZ:.27}]){
      const roles=[new Set(),new Set()];
      for(const p of layout({...s,...patch})){
        const base=stoneAppearance(p,COLORS.noir).base;roles[p.shadeRole].add(base);
        if(original.has(key(p)))assert.equal(base,original.get(key(p)));
        if(!p.cut)assert.equal(p.shadeRole,(rotation===90?p.w>p.l:p.l>p.w)?0:1);
      }
      assert.equal(roles[0].size,1);assert.equal(roles[1].size,1);
      assert.notEqual([...roles[0]][0],[...roles[1]][0]);
    }
  }
});
