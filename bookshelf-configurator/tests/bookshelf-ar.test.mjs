import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {captureBookshelfARSnapshot,createBookshelfFirebaseARAsset,waitForBookshelfTextures} from '../js/ar/exportBookshelf.js';
import {AR_PRODUCTS,arPhoneUrl,arModelUrl} from '../../shared-ui/src/ar/links.js';
import {AR_COPY,arT} from '../../shared-ui/src/ar/i18n.js';
import {isConfiguratorAREnabled} from '../../shared-ui/src/arPolicy.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const {validateAsset}=createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<3e-6,`${a} != ${b}`);
const geometry=s=>s.model.geometries.map(g=>g.data);
function sample(w=800,h=2150,d=350) {
 const bookshelfGroup=new THREE.Group(),connectorGroup=new THREE.Group(),stage=new THREE.Scene();
 const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0x65422d}));body.name='cabinet';body.position.set(w/2,h/2,-d/2);bookshelfGroup.add(body);
 const fitting=new THREE.Mesh(new THREE.BoxGeometry(12,12,3),new THREE.MeshStandardMaterial({color:0xd8dde1,metalness:.82}));fitting.name='bridge-connector';fitting.position.set(w/2,20,-d+3);connectorGroup.add(fitting);
 stage.add(bookshelfGroup,connectorGroup);stage.add(new THREE.Mesh(new THREE.BoxGeometry(10000,10,10000),new THREE.MeshBasicMaterial()));
 return {bookshelfGroup,connectorGroup,stage};
}
const json=o=>JSON.stringify(o.toJSON());
const parse=s=>new THREE.ObjectLoader().parse(s.model);
test('Bookshelf and Roof explicitly opt in; Solar remains disabled',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar','cages']);
 for(const product of [...AR_PRODUCTS,'roof','solar','gas','']){
  assert.equal(isConfiguratorAREnabled(product,{viewAR:true}),AR_PRODUCTS.includes(product));
  assert.equal(isConfiguratorAREnabled(product,{viewAR:false}),false);assert.equal(isConfiguratorAREnabled(product),false);
 }
});
test('All locale and tenant QR routes point to the canonical Bookshelf phone page',()=>{
 for(const origin of ['https://www.360configurator.com','https://360configurator.ro','https://www.360konfigurator.de','https://www.360configurador.es','https://360configurateur.fr','https://www.360configuratore.it','https://customer.360configurator.ro']) for(const locale of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT']) for(const mode of ['android','ios']) {
  const u=new URL(arPhoneUrl('A'.repeat(32),mode,locale,origin,'bookshelf'));
  assert.equal(u.origin,origin);assert.equal(u.pathname,'/bookshelf-configurator/ar.html');assert.equal(u.searchParams.get('mode'),mode);assert.equal(u.searchParams.get('lang'),locale);
 }
 for(const format of ['glb','usdz'])assert.match(arModelUrl('A'.repeat(32),format,'bookshelf'),new RegExp(`bookshelf\\.${format}\\?`));
});
test('Localized Bookshelf messages use the shortened shared UI without implementation details',()=>{
 for(const locale of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT']){
  const copy=AR_COPY.bookshelf[locale];assert.deepEqual(Object.keys(copy).sort(),Object.keys(AR_COPY.bookshelf['en-US']).sort());
  for(const k of Object.keys(AR_COPY.hall['en-US']))assert.ok(copy[k]);
  for(const k of ['building','exporting','uploading','checking'])assert.doesNotMatch(copy[k],/Firebase|Supabase|GLB|USDZ|upload/i);
  assert.equal(copy.scale,undefined);assert.equal(copy.snapshot,undefined);assert.notEqual(arT('bookshelf',locale,'textures-unavailable'),copy.generic);
 }
});
test('Millimetres convert once to metres; both product roots export and scenery is excluded',()=>{
 for(const [w,h,d]of [[800,2150,350],[900,2300,350],[3200,2150,350]]){
  const parts=sample(w,h,d),before=json(parts.stage),s=captureBookshelfARSnapshot(parts),b=new THREE.Box3().setFromObject(parse(s));
  close(s.stats.size.x,w/1000);close(s.stats.size.y,h/1000);close(s.stats.size.z,d/1000);close(b.min.y,0);
  assert.equal(s.stats.sourceMeshes,2);assert.equal(s.stats.components['bridge-connector'],1);assert.equal(json(parts.stage),before);
 }
});
test('L-shaped runs keep each wing transform and all included shelves at their live heights',()=>{
 const parts=sample(),wing=new THREE.Group();wing.position.set(750,0,0);wing.rotation.y=Math.PI/2;
 for(const y of [121,331,877,2095]){
  const shelf=new THREE.Mesh(new THREE.BoxGeometry(650,22,284),new THREE.MeshStandardMaterial());shelf.position.set(375,y,-175);shelf.name='configured-shelf';wing.add(shelf);
 }
 parts.bookshelfGroup.add(wing);const before=json(parts.stage),s=captureBookshelfARSnapshot(parts);
 assert.equal(s.stats.components['configured-shelf'],4);assert.equal(json(parts.stage),before);
 wing.children[1].position.y+=42;const moved=captureBookshelfARSnapshot(parts);assert.notDeepEqual(geometry(moved),geometry(s));
 wing.remove(wing.children[2]);assert.equal(captureBookshelfARSnapshot(parts).stats.components['configured-shelf'],3);
});
test('Opened door pivots, keyplates and knobs retain geometry, materials and orientation',()=>{
 const parts=sample(),pivot=new THREE.Group(),door=new THREE.Mesh(new THREE.BoxGeometry(357,650,12),new THREE.MeshStandardMaterial({color:0x765432}));
 door.position.x=178.5;door.name='lower-door';pivot.position.set(42,500,-338);pivot.add(door);parts.bookshelfGroup.add(pivot);
 const knob=new THREE.Mesh(new THREE.SphereGeometry(16,12,8),new THREE.MeshStandardMaterial({color:0x765432}));knob.position.set(155,270,-15);knob.name='knob';door.add(knob);
 const closed=captureBookshelfARSnapshot(parts);pivot.rotation.y=Math.PI/2;const open=captureBookshelfARSnapshot(parts);
 assert.notDeepEqual(geometry(open),geometry(closed));assert.equal(open.stats.components.knob,1);close(pivot.rotation.y,Math.PI/2);
 const materials=parse(open).children.map(m=>m.material.color.getHex());assert.ok(materials.includes(0x765432));
});
test('Glazing stays transparent and two-sided; helpers are not physical export meshes',()=>{
 const parts=sample(),glass=new THREE.Mesh(new THREE.BoxGeometry(220,900,5),new THREE.MeshPhysicalMaterial({transparent:true,opacity:.28,transmission:.28,side:THREE.DoubleSide}));glass.name='glass';parts.bookshelfGroup.add(glass);
 parts.bookshelfGroup.add(new THREE.BoxHelper(glass,0x00ff00));
 const marker=new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshBasicMaterial({color:0x00ff00}));marker.userData.arExclude=true;parts.bookshelfGroup.add(marker);
 const s=captureBookshelfARSnapshot(parts);assert.equal(s.stats.sourceMeshes,3);
 assert.ok(parse(s).children.some(m=>m.material.transparent&&m.material.opacity<.5));
});
test('Snapshot is detached from later edits and each reopening receives a new cache key',()=>{
 const parts=sample(),first=captureBookshelfARSnapshot(parts),before=JSON.stringify(first);
 parts.bookshelfGroup.children[0].scale.x=2;parts.bookshelfGroup.children[0].material.color.set(0x123456);
 const next=captureBookshelfARSnapshot(parts);assert.notEqual(first.cacheKey,next.cacheKey);assert.equal(JSON.stringify(first),before);assert.ok(next.stats.size.x>first.stats.size.x);
});
test('Missing roots and formats fail instead of silently sending an incomplete bookshelf',async()=>{
 assert.throws(()=>captureBookshelfARSnapshot(),{code:'not-ready'});assert.throws(()=>captureBookshelfARSnapshot({bookshelfGroup:new THREE.Group(),connectorGroup:new THREE.Group()}),{code:'not-ready'});
 assert.throws(()=>captureBookshelfARSnapshot({...sample(),connectorGroup:null}),{code:'not-ready'});
 await assert.rejects(createBookshelfFirebaseARAsset({},'obj'),{code:'invalid-format'});await assert.rejects(createBookshelfFirebaseARAsset({},'glb'),{code:'not-ready'});
});
test('Readiness waits for live textures and observes replaced material generations',async()=>{
 const parts=sample(),texture=new THREE.Texture();parts.bookshelfGroup.children[0].material.map=texture;
 let done=false;const waiting=waitForBookshelfTextures(()=>parts,{timeoutMs:1000}).then(()=>done=true);
 await new Promise(r=>setTimeout(r,20));assert.equal(done,false);
 const replacement=new THREE.Texture();parts.bookshelfGroup.children[0].material.map=replacement;texture.image={width:16,height:16};
 await new Promise(r=>setTimeout(r,70));assert.equal(done,false);replacement.image={width:16,height:16};await waiting;assert.equal(done,true);
});
test('Texture load failure, timeout and abort release preparation for retry',async()=>{
 const parts=sample(),t=new THREE.Texture();parts.bookshelfGroup.children[0].material.map=t;
 const controller=new AbortController(),waiting=waitForBookshelfTextures(()=>parts,{signal:controller.signal});controller.abort();await assert.rejects(waiting,{name:'AbortError'});
 await assert.rejects(waitForBookshelfTextures(()=>parts,{timeoutMs:1}),{code:'not-ready'});
 t.image={complete:true,naturalWidth:0,width:0,height:0};await assert.rejects(waitForBookshelfTextures(()=>parts),{code:'textures-unavailable'});
 t.image={width:32,height:32,complete:true,naturalWidth:32};await waitForBookshelfTextures(()=>parts);
});
test('Real GLB export is embedded, metre-scaled and accepted by Firebase asset validation',async()=>{
 const asset=await createBookshelfFirebaseARAsset(captureBookshelfARSnapshot(sample()),'glb');const bytes=Buffer.from(await asset.blob.arrayBuffer());
 assert.equal(asset.blob.type,'model/gltf-binary');assert.ok(validateAsset('glb',bytes).size>128);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok(gltf.meshes.length>=2);assert.equal(gltf.buffers[0].uri,undefined);
});
test('Bookshelf restores the shared AR button only, preserving quotation/cart/demo behavior and engine pin',()=>{
 const shell=read('../js/sharedShell.js'),css=read('../styles.css'),app=read('../js/app.js'),index=read('../index.html');
 assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ ar.open\(\); \}/);assert.match(shell,/api.captureARSnapshot\(options\)/);
 assert.match(shell,/requestBookshelfQuotation/);assert.match(shell,/QUOTATION_FEEDBACK_DURATION_MS = 5000/);assert.match(shell,/ar.refresh\(\)/);
 assert.doesNotMatch(css,/\[data-action="view-ar"\]/);assert.match(css,/\[data-action="cart"\]/);assert.match(css,/\.book-demo-button \{ display: none !important/);
 assert.match(app,/await waitForBookshelfTextures\(getParts, \{ signal \}\)/);assert.match(app,/document.querySelector\('dialog\[open\]'\)/);assert.match(index,/three@0\.169\.0/);
 const html=read('../ar.html'),launch=html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(launch,/<img /);assert.doesNotMatch(launch,/<span|<button/);
 assert.match(read('../../firebase-share-backend/functions/bookshelf-quotation.js'),/const FACTORY_RECIPIENT = 'info@mobila-lemn.ro'/);
});
