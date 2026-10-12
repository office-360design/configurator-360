import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { normalize, TILES, CURBS, layout, curbLayout, areaGeometry } from '../js/model.js';
import { polygonArea } from '../js/area.js';
import { pavementCutSurfaces, curbCutSurfaces } from '../js/surfaceLayout.js';
import { buildPavementARModel, PAVEMENT_TOP_Y, CURB_EXPOSED_HEIGHT } from '../js/ar/pavementModel.js';
import { captureTilesARSnapshot, buildTilesARScene, createTilesFirebaseARAsset } from '../js/ar/exportTiles.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl } from '../../shared-ui/src/ar/links.js';
import { AR_COPY, arT } from '../../shared-ui/src/ar/i18n.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';
const require=createRequire(import.meta.url),{validateAsset}=require('../../firebase-share-backend/functions/hall-ar-core.cjs');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const near=(a,b,tolerance=2e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
globalThis.FileReader=class {readAsArrayBuffer(b){b.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
function expectedParts(s) {
 const pieces=layout(s),curbs=curbLayout(s);
 return {'pavement-tile':pieces.filter(p=>!p.fragments).length,
 'pavement-cut-tile':pavementCutSurfaces(pieces,s).filter(p=>p.polygon.length>=3&&polygonArea(p.polygon)>=1e-9).length,
 'pavement-curb':curbs.filter(p=>!p.polygon&&!p.fragments).length,
 'pavement-cut-curb':curbCutSurfaces(curbs,s).filter(p=>p.polygon.length>=3&&polygonArea(p.polygon)>=1e-9).length};
}
function counts(root) {const out={};root.traverse(o=>{if(o.isMesh)out[o.name]=(out[o.name]||0)+1;});return out;}
const nonzero=o=>Object.fromEntries(Object.entries(o).filter(([,n])=>n));
test('Seven opted-in products; Pavement phone links stay on canonical/localized/tenant origins',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof']);
 for(const product of [...AR_PRODUCTS,'roof','solar','bookshelf','chair','gas','cardbox']){
  assert.equal(isConfiguratorAREnabled(product,{viewAR:true}),AR_PRODUCTS.includes(product));
  assert.equal(isConfiguratorAREnabled(product,{viewAR:false}),false);
 }
 const id='a'.repeat(32);
 for(const host of ['www.360configurator.com','www.360configurator.ro','www.360konfigurator.de','customer.360configurator.ro'])for(const mode of ['android','ios']){
  const u=new URL(arPhoneUrl(id,mode,'ro-RO',`https://${host}`,'tiles'));
  assert.equal(u.hostname,host);assert.equal(u.pathname,'/tiles-configurator/ar.html');assert.equal(u.searchParams.get('mode'),mode);
 }
 assert.match(arModelUrl(id,'usdz','tiles'),/\/tiles\.usdz\?/);
});
test('Shared AR messages are complete in EN/RO/DE and contain no removed paragraphs or infrastructure prose',()=>{
 for(const product of AR_PRODUCTS)for(const locale of ['en-US','ro-RO','de-DE']){
  const copy=AR_COPY[product][locale];
  // All products require the shared dialog vocabulary, but adapters may add
  // localized product-specific errors (e.g. uncommitted Cardbox artwork).
  for(const key of Object.keys(AR_COPY.hall['en-US'])) assert.ok(copy[key],`${product}/${locale}/${key}`);
  assert.deepEqual(Object.keys(copy).sort(),Object.keys(AR_COPY[product]['en-US']).sort());
  assert.equal(copy.snapshot,undefined);assert.equal(copy.scale,undefined);
  for(const key of ['building','exporting','uploading','checking','service-unavailable','phonePrivacy']){
   assert.ok(copy[key]);assert.doesNotMatch(copy[key],/Firebase|Supabase|GLB|USDZ|backend|geometry|geometrie|upload to/i);
  }
  assert.match(arT(product,locale,'building'),/QR/);
 }
 const dialog=read('../../shared-ui/src/ar/dialog.js');
 assert.doesNotMatch(dialog,/data-copy="(?:snapshot|scale)"/);
 for(const p of ['../../hall-configurator/ar.html','../../fence-configurator/ar.html','../../pergola-configurator/ar.html','../../window-configurator/src/client/ar.html','../ar.html'])assert.doesNotMatch(read(p),/data-copy="(?:snapshot|scale)"/);
});
test('Snapshot captures current dimensions, pattern, rotation, curbs and house cutout without mutating live state',()=>{
 const state=normalize({length:3.4,width:2.7,tile:'tetraNova',pattern:'checker',color:'sahara',accent:'noir',rotation:33,
  houseEnabled:true,houseX:1,houseZ:1,houseShape:'l',edges:[true,false,true,false],houseLocation:{lat:44,lon:26,label:'private'}});
 const before=JSON.stringify(state),snapshot=captureTilesARSnapshot(state);
 assert.equal(JSON.stringify(state),before);assert.equal(snapshot.houseLocation,null);
 for(const k of ['length','width','tile','pattern','color','accent','rotation','edges','houseShape','houseX','houseZ'])assert.deepEqual(snapshot[k],state[k]);
 state.length=9;state.edges[0]=false;assert.equal(snapshot.length,3.4);assert.equal(snapshot.edges[0],true);
 assert.throws(()=>captureTilesARSnapshot(null),{code:'not-ready'});
});
test('All six stone types and every bond retain every full tile, cut face and curb at both rotations',()=>{
 let configurations=0;
 for(const [tile,definition]of Object.entries(TILES))for(const pattern of definition.patterns)for(const rotation of [0,27]){
  const s=normalize({length:1.43,width:1.27,tile,pattern,rotation,curb:'sidewalk'}),before=JSON.stringify(s);
  const built=buildTilesARScene(s,{textures:false});
  try {
   assert.deepEqual(built.stats.components,nonzero(expectedParts(s)),`${tile}/${pattern}/${rotation}`);
   assert.equal(built.stats.tiles,layout(s).length);assert.equal(built.stats.curbs,curbLayout(s).length);
   const b=new THREE.Box3().setFromObject(built.root);near(b.max.y,CURB_EXPOSED_HEIGHT);
   assert.equal(JSON.stringify(s),before);
  }finally{built.dispose();}
  configurations++;
 }
 console.log(`Pavement configurations verified: ${configurations}`);
});
test('Custom concave/parametric polygons and rotated imported-house cutouts survive complete export',()=>{
 for(const shape of ['rectangle','closed4','closed5','custom']){
  const s=normalize({shape,length:4,width:3,runA:4,runB:3,runC:3,runD:2,angleB:90,tile:'hbeton',rotation:15,
   areaPoints:[{x:0,z:0},{x:4,z:0},{x:4,z:1.5},{x:2,z:1.5},{x:2,z:3},{x:0,z:3}],
   houseEnabled:true,houseShape:'imported',houseFootprint:[{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}],houseX:1,houseZ:0.8,houseRotation:25});
  const built=buildTilesARScene(s,{textures:false});try{
   assert.deepEqual(built.stats.components,nonzero(expectedParts(s)));
   assert.ok(built.stats.components['pavement-cut-tile']);assert.doesNotMatch(JSON.stringify(built.root.toJSON()),/"(?:house|grid|camera|dimension)"/);
  }finally{built.dispose();}
 }
});
test('Full paver and curb depths are retained, at the editor finished-surface height; no house/background export',()=>{
 for(const tile of ['parket','slab'])for(const edges of [[true,true,true,true],[false,false,false,false]]){
  const s=normalize({length:2,width:2,tile,edges}),built=buildPavementARModel(s,{textures:false});
  try{assert.deepEqual(counts(built.root),nonzero(expectedParts(s)));for(const mesh of built.root.children){
   const b=new THREE.Box3().setFromObject(mesh);
   if(mesh.name.includes('curb')){near(b.max.y,CURB_EXPOSED_HEIGHT);near(b.min.y,CURB_EXPOSED_HEIGHT-CURBS[s.curb].height);}
   else {near(b.max.y,PAVEMENT_TOP_Y);near(b.min.y,PAVEMENT_TOP_Y-TILES[s.tile].thickness);}
  }}finally{built.dispose();}
 }
});
test('Mixed and checker colours use real per-face materials, not lost instance/vertex-only tints on iOS',()=>{
 const looks=[];
 for(const color of ['sahara','noir','shellBrown']){
  const s=normalize({length:1.63,width:1.27,tile:'tetraNova',color,accent:'whiteMix',pattern:'checker',rotation:13});
  const b=buildTilesARScene(s,{textures:false});try{
   const colors=[...new Set(b.root.children.map(o=>o.material.color.getHex()))].sort();assert.ok(colors.length>4);
   assert.ok(b.root.children.every(o=>!o.material.vertexColors));looks.push(JSON.stringify(colors));
  }finally{b.dispose();}
 }
 assert.equal(new Set(looks).size,3);
});
test('Actual default, interlocking and house-cutout GLBs are self-contained and preserve triangle counts',async()=>{
 for(const options of [{},{tile:'hbeton',length:2.5,width:2.2,rotation:15},
  {tile:'slab',pattern:'basket',length:5,width:4,houseEnabled:true,houseX:2,houseZ:2,houseLength:1,houseWidth:1,houseRotation:35}]){
  const built=buildTilesARScene(normalize(options),{textures:false});try{
   const result=await new GLTFExporter().parseAsync(built.root,{binary:true});const b=Buffer.from(result);
   assert.equal(validateAsset('glb',b).format,'glb');assert.ok(b.length<10*1024*1024);
   const doc=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());assert.equal(doc.buffers[0].uri,undefined);
   const tris=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);assert.equal(tris,built.stats.triangles);
   console.log(`Pavement GLB: ${b.length} bytes, ${built.stats.tiles} stones, ${built.stats.curbs} curbs, ${tris} triangles`);
  }finally{built.dispose();}
 }
});
test('Limits, invalid areas and empty paving fail explicitly instead of dropping stones or exporting only a house',async()=>{
 assert.throws(()=>buildTilesARScene(normalize({tile:'granit',length:20,width:20}),{textures:false}),{code:'model-too-large'});
 assert.throws(()=>buildTilesARScene(normalize({length:2,width:2,houseEnabled:true,houseX:-1,houseZ:-1,houseLength:4,houseWidth:4}),{textures:false}),{code:'empty-pavement'});
 await assert.rejects(()=>createTilesFirebaseARAsset({},'exe'),{code:'invalid-format'});
});
test('Editor wires the shared dialog, blocks uncommitted outlines, and uses the same cut geometry as AR',()=>{
 const app=read('../js/app.js'),controller=read('../js/ar/controller.js'),viewer=read('../js/viewer.js');
 assert.match(app,/viewAR: true/);assert.match(app,/onViewAR\(\) \{ ar.open\(\)/);assert.match(app,/drawingArea[\s\S]*area-in-progress/);
 assert.match(controller,/product: 'tiles'/);assert.match(controller,/structuredClone\(getState\(\)\)/);
 assert.match(viewer,/pavementCutSurfaces\(parts, s\)/);assert.match(viewer,/curbCutSurfaces\(curbs, s\)/);
 assert.doesNotMatch(controller,/supabase|tus|CONFIGURATOR_READY/i);
 const html=read('../ar.html'),link=html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(link,/<img/);assert.doesNotMatch(link,/<span|<div/);
});
