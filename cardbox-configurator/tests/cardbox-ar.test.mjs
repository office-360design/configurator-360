import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {captureCardboxARSnapshot,createCardboxFirebaseARAsset,waitForCardboxArtwork} from '../js/ar/exportCardbox.js';
import {AR_PRODUCTS,arPhoneUrl,arModelUrl} from '../../shared-ui/src/ar/links.js';
import {AR_COPY,arT} from '../../shared-ui/src/ar/i18n.js';
import {isConfiguratorAREnabled} from '../../shared-ui/src/arPolicy.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const {validateAsset}=createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
function sample(w=600,h=300,d=400){
 const boxGroup=new THREE.Group();boxGroup.position.y=500;
 for(const [side,color]of [[THREE.FrontSide,0xbd9863],[THREE.BackSide,0xf7eded]]){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,side}));
  mesh.position.y=h/2;mesh.name=side===THREE.FrontSide?'outer':'inner';mesh.userData.cardboxSurface=true;boxGroup.add(mesh);
 }
 return {boxGroup};
}
const parsed=s=>new THREE.ObjectLoader().parse(s.model);
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`);
function json(o){return JSON.stringify(o.toJSON());}
test('Cardbox remains enabled alongside subsequent explicit product opt-ins',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar','cages']);
 for(const p of [...AR_PRODUCTS,'roof','solar','bookshelf','gas','']){
  assert.equal(isConfiguratorAREnabled(p,{viewAR:true}),AR_PRODUCTS.includes(p));
  assert.equal(isConfiguratorAREnabled(p,{viewAR:false}),false);assert.equal(isConfiguratorAREnabled(p),false);
 }
});
test('Both QR modes use canonical, localized and tenant Cardbox routes and validated filenames',()=>{
 for(const [origin,path]of [['https://www.360configurator.com','cardbox-configurator'],['https://www.360configurator.ro','configurator-cutii-carton'],['https://360konfigurator.de','karton-konfigurator'],['https://www.360configurador.es','configurador-cajas-carton'],['https://www.360configurateur.fr','configurateur-cartons'],['https://360configuratore.it','configuratore-scatole'],['https://tenant.360configurator.ro','cardbox-configurator']])for(const mode of ['android','ios']){
  const u=new URL(arPhoneUrl('a'.repeat(32),mode,'ro-RO',origin,'cardbox'));assert.equal(u.origin,origin);assert.equal(u.pathname,`/${path}/ar.html`);assert.equal(u.searchParams.get('mode'),mode);
 }
 for(const format of ['glb','usdz'])assert.match(arModelUrl('b'.repeat(32),format,'cardbox'),new RegExp(`cardbox\\.${format}\\?`));
});
test('Localized Cardbox copy retains generic preparation and no removed long descriptions',()=>{
 for(const locale of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT']){
  const copy=AR_COPY.cardbox[locale];assert.deepEqual(Object.keys(copy).sort(),Object.keys(AR_COPY.cardbox['en-US']).sort());
  for(const key of Object.keys(AR_COPY.hall['en-US']))assert.ok(copy[key]);
  for(const key of ['building','exporting','uploading','checking'])assert.doesNotMatch(copy[key],/Firebase|Supabase|GLB|USDZ|geometry|geometrie|upload/i);
  for(const key of ['editing-in-progress','animation-in-progress','artwork-unavailable'])assert.notEqual(arT('cardbox',locale,key),copy.generic);
  assert.notEqual(copy.title,AR_COPY.chair[locale].title);assert.equal(copy.snapshot,undefined);assert.equal(copy.scale,undefined);
 }
});
test('Live dimensions convert mm to m and inner/outer colours survive without changing the editor',()=>{
 for(const [w,h,d]of [[600,300,400],[950,220,130],[150,65,420]]){
  const parts=sample(w,h,d),before=json(parts.boxGroup),s=captureCardboxARSnapshot(parts),root=parsed(s);
  near(s.stats.size.x,w/1000);near(s.stats.size.y,h/1000);near(s.stats.size.z,d/1000);
  const b=new THREE.Box3().setFromObject(root);near(b.min.y,0);
  assert.deepEqual(root.children.map(m=>m.material.color.getHex()).sort(),[0xbd9863,0xf7eded].sort());
  assert.equal(s.stats.sourceMeshes,2);assert.equal(json(parts.boxGroup),before);
 }
});
test('Inspection transparency is undone on material copies, never on the live material',()=>{
 const parts=sample();parts.boxGroup.children.forEach(o=>{o.material.userData.cardboxPresentationBase={transparent:false,opacity:1,depthWrite:true,alphaTest:0};o.material.transparent=true;o.material.opacity=.27;o.material.depthWrite=false;});
 const before=json(parts.boxGroup);const root=parsed(captureCardboxARSnapshot(parts));
 root.children.forEach(o=>assert.equal(o.material.opacity,1));assert.equal(json(parts.boxGroup),before);
});
test('Physical lid rotation stays open, but the extra 300 mm inspection lift is removed',()=>{
 const parts=sample(),lid=new THREE.Mesh(new THREE.PlaneGeometry(600,400),new THREE.MeshStandardMaterial({side:THREE.DoubleSide}));
 lid.userData.cardboxSurface=true;lid.userData.cardboxToolSurface='top';lid.position.set(0,310,0);lid.rotation.x=-.6;lid.name='lid';parts.boxGroup.add(lid);
 const baseline=captureCardboxARSnapshot(parts),before=json(parts.boxGroup);
 lid.position.y+=300;const lifted=captureCardboxARSnapshot({...parts,lidLiftMm:300});
 assert.deepEqual(lifted.stats,baseline.stats);
 assert.deepEqual(lifted.model.geometries.map(g=>g.data),baseline.model.geometries.map(g=>g.data));
 near(lid.position.y,610);near(lid.rotation.x,-.6);lid.position.y-=300;assert.equal(json(parts.boxGroup),before);
 lid.rotation.x=0;assert.notDeepEqual(captureCardboxARSnapshot(parts).model.geometries.map(g=>g.data),baseline.model.geometries.map(g=>g.data));
});
test('Configured absent closures and their artwork stay absent; selection rings and technical edges do not export',()=>{
 const parts=sample(),top=new THREE.Mesh(new THREE.PlaneGeometry(600,400),new THREE.MeshStandardMaterial());top.userData.top=true;top.name='removed-top';parts.boxGroup.add(top);
 const ring=new THREE.Mesh(new THREE.RingGeometry(4,6),new THREE.MeshBasicMaterial());ring.userData.arExclude=true;ring.name='selection-marker';parts.boxGroup.children[0].add(ring);
 parts.boxGroup.children[0].add(new THREE.LineSegments(new THREE.EdgesGeometry(parts.boxGroup.children[0].geometry),new THREE.LineBasicMaterial()));
 const s=captureCardboxARSnapshot({...parts,closures:{top:'open'}});assert.equal(s.stats.sourceMeshes,2);assert.deepEqual(Object.keys(s.stats.components).sort(),['inner','outer']);
});
test('Reinforced handle outlines and configured closure seams survive as native-compatible meshes',()=>{
 const parts=sample(),closureGroup=new THREE.Group();closureGroup.position.y=500;
 const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-200,301,0),new THREE.Vector3(200,301,0)]),new THREE.LineDashedMaterial({color:0x765035,dashSize:12,gapSize:8}));closureGroup.add(line);
 const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-20,0,1),new THREE.Vector3(20,0,1),new THREE.Vector3(20,20,1)]),new THREE.LineBasicMaterial());parts.boxGroup.children[0].add(ring);
 const before=[json(parts.boxGroup),json(closureGroup)];const s=captureCardboxARSnapshot({...parts,closureGroup});assert.ok(s.stats.components['closure-or-reinforcement-detail']>=20);assert.deepEqual([json(parts.boxGroup),json(closureGroup)],before);
});
test('Artwork groups are retained even when hidden for inspection; previously captured models remain detached',()=>{
 const parts=sample(),textGroup=new THREE.Group(),imageGroup=new THREE.Group();
 for(const[group,kind]of [[textGroup,'cardboxText'],[imageGroup,'cardboxImage']]){
  group.visible=false;group.position.y=500;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(90,20),new THREE.MeshBasicMaterial({color:0x8877ff,transparent:true,side:THREE.DoubleSide}));mesh.position.set(0,150,201);mesh.userData[kind]=true;group.add(mesh);
 }
 const first=captureCardboxARSnapshot({...parts,textGroup,imageGroup}),before=JSON.stringify(first);
 assert.equal(first.stats.components['printed-text'],1);assert.equal(first.stats.components['printed-image'],1);
 textGroup.children[0].material.color.set('#fedcba');captureCardboxARSnapshot({...parts,textGroup,imageGroup});assert.equal(JSON.stringify(first),before);assert.equal(textGroup.visible,false);
});
test('Missing roots and invalid formats reject rather than exporting an empty/default box',async()=>{
 assert.throws(()=>captureCardboxARSnapshot(),{code:'not-ready'});
 assert.throws(()=>captureCardboxARSnapshot({...sample(),lidLiftMm:NaN}),{code:'invalid-configuration'});
 await assert.rejects(createCardboxFirebaseARAsset({},'obj'),{code:'invalid-format'});
 await assert.rejects(createCardboxFirebaseARAsset({},'glb'),{code:'not-ready'});
});
test('Actual GLB embeds the captured metre geometry and passes the Firebase validator',async()=>{
 const s=captureCardboxARSnapshot(sample()),asset=await createCardboxFirebaseARAsset(s,'glb');
 const bytes=Buffer.from(await asset.blob.arrayBuffer());assert.equal(asset.blob.type,'model/gltf-binary');assert.ok(validateAsset('glb',bytes).size>128);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.equal(gltf.scenes.length,1);assert.ok(gltf.meshes.length);assert.equal(gltf.buffers[0].uri,undefined);
});
test('Readiness follows replaced image generations and waits for font readiness',async()=>{
 let resolveOld,resolveNew,fontDone,task=new Promise(r=>resolveOld=r),done=false;
 const fontsReady=new Promise(r=>fontDone=r);const wait=waitForCardboxArtwork(()=>task,{fontsReady}).then(()=>done=true);
 fontDone();await Promise.resolve();await Promise.resolve();task=new Promise(r=>resolveNew=r);resolveOld();await Promise.resolve();assert.equal(done,false);resolveNew();await wait;assert.equal(done,true);
});
test('Readiness abort and timeout reject promptly, allowing retry',async()=>{
 const c=new AbortController(),never=new Promise(()=>{});const pending=waitForCardboxArtwork(()=>never,{signal:c.signal});c.abort();await assert.rejects(pending,{name:'AbortError'});
 await assert.rejects(waitForCardboxArtwork(()=>never,{timeoutMs:10}),{code:'not-ready'});
 await waitForCardboxArtwork(()=>undefined);
});
test('Editor and phone routes use shared Firebase workflow without legacy transfer or implementation text',()=>{
 const app=read('../js/app.js'),shell=read('../js/sharedShell.js');assert.match(app,/captureARSnapshot: captureCurrentCardboxAR/);assert.match(app,/waitForCardboxArtwork/);assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ ar.open\(\); \}/);
 const controller=read('../js/ar/controller.js');assert.match(controller,/product: 'cardbox'/);assert.doesNotMatch(controller+shell,/supabase|tus-js-client/);
 const html=read('../ar.html'),inside=html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(inside,/<img /);assert.doesNotMatch(inside,/<span|<button/);assert.match(read('../index.html'),/three@0\.169\.0/);
});
