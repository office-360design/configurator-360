import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalize, layout, TILES, COLORS, estimate} from '../js/model.js';
import {stoneAppearance} from '../js/stoneAppearance.js';
import {stoneTextureUV, STRIATED_VARIANTS, STRIATED_FACE_CROPS, STRIATED_SOURCE_SIZE, STRIATED_PHOTO_URL} from '../js/striatedStone.js';
import {patternPreview} from '../js/patternPreview.js';
import {prepareProjectState} from '../js/pavingProject.js';

test('striated gray is a Tetra Nova finish and survives saving without changing geometry or prices',()=>{
 const s=normalize({tile:'tetraNova',color:'striatedGrey'});
 assert.equal(s.color,'striatedGrey');
 assert.deepEqual(Object.entries(TILES).filter(([,t])=>t.colors.includes('striatedGrey')).map(([id])=>id),['tetraNova']);
 assert.deepEqual(layout(s),layout({...s,color:'noir'}));
 assert.equal(estimate(s).total,estimate({...s,color:'noir'}).total);
 const saved=prepareProjectState({format:'360-tiles-project',version:1,state:s});
 assert.equal(saved.document.state.color,'striatedGrey');
 assert.match(patternPreview(s,'running'),/striated-running-/);
});

test('photo finish uses twelve distinct 3:2 face crops inside the bundled JPEG',()=>{
 const asset=new URL(STRIATED_PHOTO_URL);asset.search='';
 const bytes=readFileSync(asset);
 assert.deepEqual([...bytes.subarray(0,2)],[255,216]);
 assert.equal(STRIATED_VARIANTS,12);
 assert.equal(new Set(STRIATED_FACE_CROPS.map(c=>c.join(','))).size,STRIATED_VARIANTS);
 for(const [x,y,w,h] of STRIATED_FACE_CROPS) {
  assert.ok(x>0&&y>0&&w>0&&h>0);
  assert.ok(x+w<STRIATED_SOURCE_SIZE.width&&y+h<STRIATED_SOURCE_SIZE.height);
  assert.ok(Math.abs(w/h-TILES.tetraNova.length/TILES.tetraNova.width)<1e-12);
 }
});

test('texture choice remains attached to the original stone through house cuts at all rotations',()=>{
 for(const rotation of [0,27,90]) {
  const s=normalize({tile:'tetraNova',color:'striatedGrey',rotation,length:3,width:2});
  const original=new Map(layout(s).map(p=>[`${p.shadeX},${p.shadeZ}`,stoneAppearance(p,COLORS.striatedGrey)]));
  const variants=new Set();let shared=0;
  for(const p of layout({...s,houseEnabled:true,houseLength:1,houseWidth:1,houseX:.47,houseZ:.38})) {
   const key=`${p.shadeX},${p.shadeZ}`,look=stoneAppearance(p,COLORS.striatedGrey);
   if(original.has(key)){assert.deepEqual(look,original.get(key));shared++;}
   variants.add(look.textureVariant);
  }
  assert.ok(shared>20);assert.ok(variants.size>8);
 }
});

test('texture U always follows the tile long edge while cuts retain the original coordinates',()=>{
 for(const rotation of [0,17,90,179,270]) {
  const stone={x:3,z:2,l:.3,w:.2,rotation},a=rotation*Math.PI/180;
  const world=(x,z)=>({x:stone.x+x*Math.cos(a)-z*Math.sin(a),z:stone.z+x*Math.sin(a)+z*Math.cos(a)});
  for(const [x,z,u,v] of [[0,0,.5,.5],[(stone.l-.003)/2,0,1,.5],[0,(stone.w-.003)/2,.5,0]]) {
   const p=world(x,z),uv=stoneTextureUV(stone,p.x,p.z);
   assert.ok(Math.abs(uv.u-u)<1e-10);assert.ok(Math.abs(uv.v-v)<1e-10);
   assert.deepEqual(stoneTextureUV({...stone,fragments:[[]]},p.x,p.z),uv);
  }
 }
});
