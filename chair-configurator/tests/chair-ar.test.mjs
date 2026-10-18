// node --no-warnings --experimental-loader ./chair-configurator/tests/ar-test-loader.mjs --test chair-configurator/tests/chair-ar.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {GeometryLibrary} from '../../shared-3d/src/geometry/GeometryLibrary.js';
import {createChairModel} from '../js/chairGeometry.js';
import {ChairScene} from '../js/scene.js';
import {WOOD_TYPES, FABRIC_TYPES, MATERIAL_LABEL_LOCALES, materialLabel} from '../js/materials.js';
import {CHAIR_COPY, CHAIR_LOCALES, chairT} from '../js/i18n.js';
import {captureChairARSnapshot, createChairFirebaseARAsset, CHAIR_AR_LIMITS} from '../js/ar/exportChair.js';
import {AR_PRODUCTS, arPhoneUrl, arModelUrl} from '../../shared-ui/src/ar/links.js';
import {AR_COPY, arT} from '../../shared-ui/src/ar/i18n.js';
import {isConfiguratorAREnabled} from '../../shared-ui/src/arPolicy.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const {validateAsset}=createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`);
function make(wood=0x967744,fabric=0x345678){
 const w=new THREE.MeshStandardMaterial({color:wood,roughness:.53}),f=new THREE.MeshStandardMaterial({color:fabric,roughness:.92});
 const geometry=new GeometryLibrary(THREE),model=createChairModel(THREE,geometry,{woodMaterial:w,fabricMaterial:f});
 model.group.updateMatrixWorld(true);
 return {...model,w,f};
}
function count(root){const out={};root.traverse(o=>{if(o.isMesh)out[o.name]=(out[o.name]||0)+1;});return out;}
function snap(root){return captureChairARSnapshot(root);}
function parse(snapshot){return new THREE.ObjectLoader().parse(snapshot.model);}
test('Seven explicit opt-in products; everything else remains unavailable',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar']);
 for(const p of [...AR_PRODUCTS,'roof','solar','bookshelf','cardbox','gas','']){
  assert.equal(isConfiguratorAREnabled(p,{viewAR:true}),AR_PRODUCTS.includes(p));
  assert.equal(isConfiguratorAREnabled(p,{viewAR:false}),false);
  assert.equal(isConfiguratorAREnabled(p,{}),false);
 }
});
test('Chair phone URLs support canonical, localized and tenant domains for both modes',()=>{
 const id='a'.repeat(32);
 for(const[origin,path]of [['https://www.360configurator.com','chair-configurator'],['https://360configurator.ro','configurator-scaune'],['https://www.360konfigurator.de','stuhl-konfigurator'],['https://example.360configurator.ro','chair-configurator']])for(const mode of ['android','ios']){
  const u=new URL(arPhoneUrl(id,mode,'ro-RO',origin,'chair'));
  assert.equal(u.origin,origin);assert.equal(u.pathname,`/${path}/ar.html`);assert.equal(u.searchParams.get('mode'),mode);assert.equal(u.searchParams.get('id'),id);
 }
 for(const f of ['glb','usdz'])assert.match(arModelUrl(id,f,'chair'),new RegExp(`/chair\\.${f}\\?`));
});
test('Chair AR copy is complete in every locale the shared AR copy provides and retains generic progress with no long descriptions',()=>{
 for(const locale of Object.keys(AR_COPY.hall)){
  assert.deepEqual(Object.keys(AR_COPY.chair[locale]).sort(),Object.keys(AR_COPY.hall[locale]).sort());
  assert.notEqual(arT('chair',locale,'title'),arT('hall',locale,'title'));
  assert.match(arT('chair',locale,'building'),/QR/);
  for(const key of ['building','exporting','uploading','checking'])assert.doesNotMatch(arT('chair',locale,key),/firebase|supabase|upload|glb|usdz|geometry|geometrie/i);
 }
 assert.doesNotMatch(read('../../shared-ui/src/ar/dialog.js'),/data-copy="(?:snapshot|scale)"/);
});
test('Chair sidebar copy and material labels cover en, ro, de, es, fr and it with no gaps',()=>{
 const locales=['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT'];
 assert.deepEqual([...CHAIR_LOCALES],locales);assert.deepEqual([...MATERIAL_LABEL_LOCALES],locales);
 for(const locale of locales){
  assert.deepEqual(Object.keys(CHAIR_COPY[locale]).sort(),Object.keys(CHAIR_COPY['en-US']).sort(),locale);
  for(const key of Object.keys(CHAIR_COPY['en-US']))assert.ok(chairT(locale,key).trim(),`${locale}.${key}`);
  for(const item of [...WOOD_TYPES,...FABRIC_TYPES]){assert.equal(item.labels.length,locales.length,item.id);assert.ok(materialLabel(item,locale).trim(),`${locale}.${item.id}`);}
 }
 for(const locale of locales.slice(1))assert.notEqual(chairT(locale,'title'),chairT('en-US','title'),locale);
});
test('Snapshot retains all 18 real product meshes and grounds the legs without scenery',()=>{
 const m=make(),stage=new THREE.Group();stage.add(m.group);stage.add(new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshStandardMaterial()));
 stage.add(new THREE.DirectionalLight());
 const before=JSON.stringify(m.group.toJSON()),s=snap(m.group),root=parse(s);
 assert.equal(s.stats.sourceMeshes,18);assert.deepEqual(s.stats.components,count(m.group));
 for(const name of ['upholstered-seat','upholstered-back','seat-underside','front-leg','rear-upright'])assert.ok(Object.keys(s.stats.components).some(n=>n.includes(name)),name);
 const original=new THREE.Box3().setFromObject(m.group, true).getSize(new THREE.Vector3());const b=new THREE.Box3().setFromObject(root),size=b.getSize(new THREE.Vector3());
 near(b.min.y,0);near(size.x,original.x);near(size.y,original.y);near(size.z,original.z);
 assert.equal(JSON.stringify(m.group.toJSON()),before);
});
test('Every wood/fabric selection retains independently selected colours and full geometry',()=>{
 let combinations=0;
 for(const wood of WOOD_TYPES)for(const fabric of FABRIC_TYPES){
  const m=make(wood.color,fabric.color),s=snap(m.group),root=parse(s);
  assert.equal(s.stats.sourceMeshes,18);assert.deepEqual(s.stats.components,count(m.group));
  assert.deepEqual(root.children.map(o=>o.material.color.getHex()).sort(),[m.w.color.getHex(),m.f.color.getHex()].sort());
  combinations++;
 }
 assert.equal(combinations,42);
});
test('Capture reads a changed live material, and an earlier snapshot is detached',()=>{
 const m=make(),first=snap(m.group),before=JSON.stringify(first);
 m.w.color.set('#123456');m.f.color.set('#eacbdd');
 const second=snap(m.group),colours=parse(second).children.map(o=>o.material.color.getHexString());
 assert.ok(colours.includes('123456'));assert.ok(colours.includes('eacbdd'));assert.equal(JSON.stringify(first),before);assert.notEqual(first.cacheKey,second.cacheKey);
});
test('The scene hook captures the product, leaving state, camera and scene graph unchanged',()=>{
 const m=make(),scene=Object.create(ChairScene.prototype);scene.model=m;
 scene.state={woodType:'oak',fabricType:'linen'};scene.camera=new THREE.PerspectiveCamera();scene.camera.position.set(2,3,4);scene.scene=new THREE.Scene();scene.scene.add(m.group);
 const state=JSON.stringify(scene.state),matrix=scene.camera.matrix.toArray(),children=[...scene.scene.children];
 const a=scene.captureARSnapshot();assert.equal(a.stats.sourceMeshes,18);assert.equal(JSON.stringify(scene.state),state);assert.deepEqual(scene.camera.matrix.toArray(),matrix);assert.deepEqual(scene.scene.children,children);
});
test('GLB export of actual Chair geometry passes backend validation and preserves every triangle',async()=>{
 const m=make(),s=snap(m.group),progress=[],asset=await createChairFirebaseARAsset(s,'glb',p=>progress.push(p));
 const b=Buffer.from(await asset.blob.arrayBuffer());assert.equal(validateAsset('glb',b).format,'glb');assert.equal(asset.blob.type,'model/gltf-binary');assert.ok(b.length<CHAIR_AR_LIMITS.glb);
 const doc=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());
 const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);assert.equal(triangles,s.stats.triangles);
 assert.deepEqual(progress,['building','exporting']);console.log(`Chair geometry GLB: ${b.length} bytes, ${triangles} triangles`);
});
test('Invalid or incomplete snapshots fail instead of silently exporting a different chair',async()=>{
 assert.throws(()=>snap(null),{code:'not-ready'});assert.throws(()=>snap(new THREE.Group()),{code:'invalid-geometry'});
 await assert.rejects(createChairFirebaseARAsset(null,'glb'),{code:'not-ready'});
 await assert.rejects(createChairFirebaseARAsset({},'obj'),{code:'invalid-format'});
 const bad=make();bad.group.children[0].geometry.attributes.position.setX(0,NaN);assert.throws(()=>snap(bad.group),{code:'invalid-geometry'});
});
test('Editor, snapshot and native exporters use Chair r160; GLTF local import graph exists',()=>{
 assert.equal(THREE.REVISION,'160');const entry=read('../index.html'),exporter=read('../js/ar/exportChair.js');
 assert.match(entry,/"three":"\.\/lib\/three\.module\.js"/);assert.match(exporter,/three@0\.160\.0/);assert.match(exporter,/new USDZExporter\(\)\.parse\(root/);
 for(const file of ['../lib/exporters/GLTFExporter.js','../lib/utils/TextureUtils.js'])assert.ok(existsSync(new URL(file,import.meta.url)));
 assert.doesNotMatch(exporter,/supabase|tus|r169.*import\(/i);
});
test('AR button, capture hook, generic dialog and phone entry are wired into deployed Chair files',()=>{
 const app=read('../js/app.js'),shell=read('../js/sharedShell.js'),html=read('../index.html'),phone=read('../ar.html');
 assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ ar.open\(\); \}/);assert.match(app,/captureARSnapshot\(\) \{ return scene.captureARSnapshot\(\); \}/);
 assert.match(html,/app\.js\?v=localized-slugs-1/);assert.match(html,/shared-ui\/styles\/ar\.css/);
 assert.match(phone,/id="arPhoneLaunch"[^>]*>[\s\S]*?<img [^>]*\/>\s*<\/a>/);assert.match(read('../js/ar/phone.js'),/mountARPhone\('chair'\)/);
 for(const workflow of ['../../.github/workflows/deploy-cloudrun.yml','../../.github/workflows/deploy-pages.yml'])assert.match(read(workflow),/cp -R chair-configurator\/\. dist\/site\/chair-configurator\//);
});
