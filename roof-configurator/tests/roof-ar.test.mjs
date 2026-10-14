import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { captureRoofARSnapshot, createRoofFirebaseARAsset, waitForRoofTextures } from '../js/ar/exportRoof.js';
import { buildRoofModel } from '../js/roofFactory.js';
import { state } from '../js/state.js';
import { footprintLayout } from '../js/roofLayout.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl } from '../../shared-ui/src/ar/links.js';
import { AR_COPY, arT } from '../../shared-ui/src/ar/i18n.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const { validateAsset } = createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => { this.result=data; this.onloadend?.(); }); } };
const close = (a,b) => assert.ok(Math.abs(a-b)<2e-5,`${a} != ${b}`);
const shape = s => s.model.geometries.map(g=>g.data);
const json = root => JSON.stringify(root.toJSON());
const parse = s => new THREE.ObjectLoader().parse(s.model);
function sample() {
 const root = new THREE.Group(), scene = new THREE.Scene();
 const material = new THREE.MeshStandardMaterial({color:0x7f1d2d});
 for(const [name,w,h,d,y] of [['house-walls',10,3,7,1.5],['house-base-slab',10.28,.2,7.28,-.1],['roof-surface',10.9,.1,7.9,3.3]]){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material); mesh.name=name;mesh.position.y=y;root.add(mesh);
 }
 scene.add(root);scene.add(new THREE.Mesh(new THREE.PlaneGeometry(100,100),material));
 return {root,scene};
}
function withoutMaps(root) {
 const mats = new Map();
 root.traverse(o=>{if(!o.material)return;const replace=m=>{
  if(!mats.has(m)){const n=m.clone();for(const key of Object.keys(n))if(n[key]?.isTexture)n[key]=null;mats.set(m,n);}return mats.get(m);
 };o.material=Array.isArray(o.material)?o.material.map(replace):replace(o.material);});
}
test('Roof and Solar explicitly enabled alongside the eight earlier products',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar']);
 for(const p of [...AR_PRODUCTS,'solar','gas','']){
  assert.equal(isConfiguratorAREnabled(p,{viewAR:true}),AR_PRODUCTS.includes(p));
  assert.equal(isConfiguratorAREnabled(p,{viewAR:false}),false);assert.equal(isConfiguratorAREnabled(p),false);
 }
});
test('Localized and tenant Roof phone routes stay on the current origin',()=>{
 for(const [origin,path] of [['https://www.360configurator.com','/roof-configurator/'],['https://www.360configurator.ro','/configurator-acoperis/'],['https://360konfigurator.de','/dach-konfigurator/'],['https://customer.360configurator.ro','/roof-configurator/']]){
  for(const locale of ['en-US','ro-RO','de-DE'])for(const mode of ['android','ios']){
   const u=new URL(arPhoneUrl('A'.repeat(32),mode,locale,origin,'roof'));
   assert.equal(u.origin,origin);assert.equal(u.pathname,path+'ar.html');assert.equal(u.searchParams.get('lang'),locale);assert.equal(u.searchParams.get('mode'),mode);
  }
 }
 for(const f of ['glb','usdz'])assert.match(arModelUrl('A'.repeat(32),f,'roof'),new RegExp(`roof\\.${f}\\?`));
});
test('Roof texts keep the shared generic progress and short dialog in all three languages',()=>{
 for(const l of ['en-US','ro-RO','de-DE']){
  const c=AR_COPY.roof[l];assert.deepEqual(Object.keys(c).sort(),Object.keys(AR_COPY.roof['en-US']).sort());
  for(const k of ['building','exporting','uploading','checking'])assert.doesNotMatch(c[k],/firebase|supabase|glb|usdz|upload/i);
  assert.equal(c.snapshot,undefined);assert.equal(c.scale,undefined);
  for(const k of ['not-ready','roof-incomplete','editing-in-progress','textures-unavailable'])assert.notEqual(arT('roof',l,k),c.generic);
 }
});
test('Entire house/roof root captured in metres with the slab underside on the ground',()=>{
 const {root,scene}=sample(),before=json(scene),s=captureRoofARSnapshot(root),b=new THREE.Box3().setFromObject(parse(s));
 assert.equal(json(scene),before);assert.equal(s.stats.sourceMeshes,3);assert.equal(s.stats.components['house-walls'],1);assert.equal(s.stats.components['house-base-slab'],1);
 close(b.min.y,0);close(s.stats.size.x,10.9);close(s.stats.size.z,7.9);close(s.stats.size.y,3.55);
});
test('Configuration changes and reopening change the exported snapshot without modifying the previous one',()=>{
 const {root}=sample(),one=captureRoofARSnapshot(root),copy=JSON.stringify(one);
 root.children[0].scale.set(1.4,1.3,1.2);root.children[2].rotation.z=.18;root.children[2].material.color.set(0x114422);
 const two=captureRoofARSnapshot(root);
 assert.notEqual(one.cacheKey,two.cacheKey);assert.notDeepEqual(shape(one),shape(two));assert.equal(JSON.stringify(one),copy);
 assert.ok(two.model.materials.some(m=>m.color===0x114422));
});
test('Technical edges, selection helpers and explicit editing meshes never reach the snapshot',()=>{
 const {root}=sample();const before=captureRoofARSnapshot(root);
 root.add(new THREE.BoxHelper(root,0x00ff00));const helper=new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshBasicMaterial());helper.userData.arExclude=true;root.add(helper);
 assert.deepEqual(shape(captureRoofARSnapshot(root)),shape(before));
});
test('All six roof families and three coverings retain their actual mesh count and full house (geometry-only Node check)',()=>{
 const load=THREE.TextureLoader.prototype.load;
 THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 try{
 for(const roofType of ['gable','hip','shed','lshape','dormer','layout'])for(const covering of ['generic','roca','teclado']){
  const {group}=buildRoofModel({...state,roofType,covering});withoutMaps(group);
  let n=0;group.traverse(o=>{if(o.isMesh)n++;});
  const s=captureRoofARSnapshot(group),b=new THREE.Box3().setFromObject(parse(s));
  assert.equal(s.stats.sourceMeshes,n);close(b.min.y,0);
  assert.ok(s.stats.components['house-walls']||s.stats.components['drawn-wall']||roofType==='lshape');
  assert.ok(s.stats.size.y>state.wallHeight);assert.ok(s.stats.triangles>1000);
 }
 }finally{THREE.TextureLoader.prototype.load=load;}
});
test('A custom drawn footprint includes its walls plus complete fitted skylight frames and glazing',()=>{
 const layout=footprintLayout([{x:0,z:0},{x:8,z:0},{x:8,z:6},{x:0,z:6}]);layout.vertices.forEach(p=>{p.h=p.z*.5;});
 layout.roofWindows=[{x:3,z:3,width:.78,length:1.18},{x:5,z:3,width:1,length:1.4}];
 const {group}=buildRoofModel({...state,roofType:'layout',roofLayout:layout});withoutMaps(group);const s=captureRoofARSnapshot(group);
 assert.equal(s.stats.components['window-glazing'],2);assert.equal(s.stats.components['window-frame'],8);assert.equal(s.stats.components['window-interior'],2);
 assert.ok(s.stats.components['drawn-wall']>=4);assert.ok(parse(s).children.some(m=>m.material.transparent));
});
test('Moving/scaling a physical child uses its current transform, even when its parent has rotated',()=>{
 const {root}=sample(),wing=new THREE.Group();wing.position.set(4,0,2);wing.rotation.y=Math.PI/2;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(3,2,1),new THREE.MeshStandardMaterial());mesh.name='wing';mesh.position.y=1;wing.add(mesh);root.add(wing);
 const before=json(root),s=captureRoofARSnapshot(root);assert.equal(json(root),before);assert.equal(s.stats.components.wing,1);
 wing.position.x+=5;assert.notDeepEqual(shape(s),shape(captureRoofARSnapshot(root)));
});
test('Finish readiness waits for current roots, supports generated textures, and honors cancellation',async()=>{
 const {root}=sample(),m=root.children[2].material;const t=new THREE.Texture();m.normalMap=t;
 setTimeout(()=>{t.image={width:8,height:8,complete:true,naturalWidth:8};},10);await waitForRoofTextures(()=>root,{timeoutMs:200});
 m.normalMap=new THREE.DataTexture(new Uint8Array(16),2,2,THREE.RGBAFormat);await waitForRoofTextures(()=>root);
 m.normalMap=new THREE.Texture();const controller=new AbortController();setTimeout(()=>controller.abort(),10);
 await assert.rejects(waitForRoofTextures(()=>root,{signal:controller.signal}),{name:'AbortError'});
 let current=root;setTimeout(()=>{current=sample().root},10);await waitForRoofTextures(()=>current,{timeoutMs:300});
});
test('Broken or timed-out textures fail instead of losing the selected finish',async()=>{
 const {root}=sample();root.children[0].material.map=new THREE.Texture();
 await assert.rejects(waitForRoofTextures(()=>root,{timeoutMs:1}),{code:'not-ready'});
 root.children[0].material.map.image={width:0,height:0,complete:true,naturalWidth:0};
 await assert.rejects(waitForRoofTextures(()=>root),{code:'textures-unavailable'});
});
test('Invalid assets, empty roots, oversize meshes and bad formats fail explicitly',async()=>{
 assert.throws(()=>captureRoofARSnapshot(),{code:'not-ready'});assert.throws(()=>captureRoofARSnapshot(new THREE.Group()),{code:'not-ready'});
 await assert.rejects(createRoofFirebaseARAsset(null,'glb'),{code:'not-ready'});
 await assert.rejects(createRoofFirebaseARAsset({},'zip'),{code:'invalid-format'});
 const root=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(300001*9),3));root.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial()));
 assert.throws(()=>captureRoofARSnapshot(root),{code:'model-too-large'});
});
test('Real GLB exporter produces a self-contained roof and house accepted by the backend',async()=>{
 const s=captureRoofARSnapshot(sample().root),before=JSON.stringify(s),progress=[];
 const result=await createRoofFirebaseARAsset(s,'glb',p=>progress.push(p));
 assert.equal(result.blob.type,'model/gltf-binary');assert.equal(result.stats,s.stats);assert.deepEqual(progress,['building','exporting']);
 const asset=validateAsset('glb',Buffer.from(await result.blob.arrayBuffer()));assert.equal(asset.format,'glb');assert.equal(JSON.stringify(s),before);
});
test('Live integration uses the whole modelRoot and does not rebuild the house, change the camera, or require an account save',()=>{
 const scene=read('../js/scene.js'),body=scene.split('  async captureARSnapshot(')[1].split('  disposeGroup(')[0];
 assert.match(body,/waitForRoofTextures\(\(\) => this\.modelRoot/);assert.match(body,/captureRoofARSnapshot\(this\.modelRoot\)/);assert.doesNotMatch(body,/rebuild\(|camera\.|controls\.|dispose\(/);
 const app=read('../js/app.js');assert.match(app,/ui\?\.layoutEditor\?\.dialog\?\.open/);assert.match(app,/state\.roofType === 'custom'/);
 const shell=read('../js/sharedShell.js');assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ void roofAR\.open\(\); \}/);
 const controller=read('../js/ar/controller.js');assert.match(controller,/product: 'roof'/);assert.match(controller,/snapshot => snapshot.cacheKey/);assert.doesNotMatch(controller,/saveUser|Supabase|tus/);
});
test('Phone page and cache-busted production import map have valid shared module paths',()=>{
 const page=read('../ar.html'),index=read('../index.html');assert.match(page,/shared-ui\/styles\/ar\.css\?v=firebase-ar-9/);
 assert.match(index,/three@0\.169\.0/);assert.match(index,/sharedShell\.js\?v=[\w-]+"/);assert.match(index,/app\.js\?v=[\w-]+"/);
 const link=page.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(link,/<img/);assert.doesNotMatch(link,/<span|<div|<a/);
 assert.match(read('../js/ar/phone.js'),/mountARPhone\('roof'\)/);
});
