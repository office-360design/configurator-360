import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { captureSolarARSnapshot, createSolarFirebaseARAsset, waitForSolarTextures, SOLAR_AR_LIMITS } from '../js/ar/exportSolar.js';
import { buildRoofModel } from '../js/roofFactory.js';
import { buildSolarArray } from '../js/solarFactory.js';
import { state, captureSolarShareState, applySolarShareState } from '../js/state.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl } from '../../shared-ui/src/ar/links.js';
import { AR_COPY, arT } from '../../shared-ui/src/ar/i18n.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { validateAsset, FORMATS } = createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); } };
const near = (a,b) => assert.ok(Math.abs(a-b)<3e-5, `${a} != ${b}`);
const json = obj => JSON.stringify(obj.toJSON());
const shape = s => JSON.stringify(s.model.geometries.map(g => g.data));
function setup(patch = {}) {
 const s = {...state, ...patch};
 const model = buildRoofModel(s), solar = buildSolarArray(s);
 const house = new THREE.Group(), panels = new THREE.Group(), scene = new THREE.Scene();
 house.add(model.group); panels.add(solar.group); scene.add(house,panels);
 const context = new THREE.Mesh(new THREE.BoxGeometry(100,100,100), new THREE.MeshStandardMaterial());
 context.name = 'geographic-context-not-for-ar'; context.position.set(300,0,400); scene.add(context);
 return {s, house, panels, scene, metrics:solar.metrics};
}
function dispose(root) { const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);[].concat(o.material||[]).forEach(m=>ms.add(m));});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose()); }
const capture = x => captureSolarARSnapshot(x.house,x.panels);
test('Solar completes the ten explicit AR adapters; unknown products and capabilities still denied',()=>{
 assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar']);
 for (const p of [...AR_PRODUCTS,'gas','other','']) {
  assert.equal(isConfiguratorAREnabled(p,{viewAR:true}),AR_PRODUCTS.includes(p));
  assert.equal(isConfiguratorAREnabled(p,{viewAR:false}),false);assert.equal(isConfiguratorAREnabled(p),false);
 }
});
test('Solar phone routes stay on their platform/tenant origin, with locale and selected mode',()=>{
 for (const [origin,path] of [['https://www.360configurator.com','/solar-configurator/'],['https://360configurator.ro','/configurator-solar/'],['https://www.360konfigurator.de','/solar-konfigurator/'],['https://www.360configurador.es','/configurador-solar/'],['https://www.360configurateur.fr','/configurateur-solaire/'],['https://www.360configuratore.it','/configuratore-fotovoltaico/'],['https://client.360configurator.ro','/solar-configurator/']])
 for(const locale of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT'])for(const mode of ['android','ios']) {
  const u=new URL(arPhoneUrl('A'.repeat(32),mode,locale,origin,'solar'));
  assert.equal(u.origin,origin);assert.equal(u.pathname,path+'ar.html');assert.equal(u.searchParams.get('mode'),mode);assert.equal(u.searchParams.get('lang'),locale);
 }
 for(const f of ['glb','usdz'])assert.match(arModelUrl('A'.repeat(32),f,'solar'),new RegExp(`/solar\\.${f}\\?`));
});
test('Solar dialog retains generic progress, short copy and translated readiness errors',()=>{
 for(const l of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT']) {
  const c=AR_COPY.solar[l];assert.ok(c,l);assert.deepEqual(Object.keys(c).sort(),Object.keys(AR_COPY.solar['en-US']).sort());
  for(const key of ['building','exporting','uploading','checking'])assert.doesNotMatch(c[key],/firebase|supabase|GLB|USDZ|upload/i);
  assert.equal(c.snapshot,undefined);assert.equal(c.scale,undefined);
  for(const key of ['not-ready','no-panels','roof-incomplete','textures-unavailable'])assert.notEqual(arT('solar',l,key),c.generic);
 }
});
test('All 54 roof/orientation/module/face combinations preserve the actual placed array and house',()=>{
 let cases=0;
 for(const roofType of ['gable','hip','shed'])for(const moduleOrientation of ['portrait','landscape'])for(const modulePreset of ['standard475','compact450','premium490'])for(const roofSide of ['front','back','both']){
  const x=setup({roofType,moduleOrientation,modulePreset,roofSide,length:14,depth:10,panelCount:10});
  const before=json(x.scene),snap=capture(x);
  assert.equal(json(x.scene),before);assert.equal(x.house.parent,x.scene);assert.equal(x.panels.parent,x.scene);
  assert.equal(snap.stats.panelCount,x.metrics.placedPanels);
  assert.equal(snap.stats.components['solar-panel-frame'],x.metrics.placedPanels);
  assert.equal(snap.stats.components['solar-panel-glass'],x.metrics.placedPanels);
  assert.equal(snap.stats.components['solar-cell-detail'],14*x.metrics.placedPanels);
  for(const v of x.metrics.selectedSurfaces)assert.equal(snap.stats.surfaces[v.id]||0,v.placed);
  const restored=new THREE.ObjectLoader().parse(snap.model),b=new THREE.Box3().setFromObject(restored);
  near(b.min.y,0);assert.ok(snap.stats.size.y>3 && snap.stats.size.x<16 && snap.stats.size.z<12);
  assert.ok(!JSON.stringify(snap).includes('geographic-context-not-for-ar'));dispose(restored);dispose(x.scene);cases++;
 }
 assert.equal(cases,54);
});
test('Changed size, pitch, overhang, colour, panel count, gaps, orientation and face update the snapshot',()=>{
 const a=setup({panelCount:4,panelColumns:2,roofSide:'front'}),s=capture(a),original=JSON.stringify(s);
 const b=setup({length:15,depth:10,wallHeight:4,pitch:42,overhang:.7,roofColor:'#336622',panelCount:12,panelColumns:4,roofSide:'back',moduleOrientation:'landscape',panelGap:.12,panelMargin:.5});
 const t=capture(b);assert.notEqual(shape(s),shape(t));assert.ok(t.stats.size.x>s.stats.size.x && t.stats.size.y>s.stats.size.y);
 assert.notEqual(s.stats.panelCount,t.stats.panelCount);assert.equal(t.stats.surfaces.front,undefined);assert.ok(t.stats.surfaces.back>0);
 assert.ok(t.model.materials.some(m=>m.color===0x336622));assert.equal(JSON.stringify(s),original);
 const c=setup({...b.s,panelGap:.3});assert.notEqual(shape(t),shape(capture(c)));dispose(a.scene);dispose(b.scene);dispose(c.scene);
});
test('Best-face bearing changes export the selected physical roof plane, without geographic displacement',()=>{
 const a=setup({roofSide:'best',northDirection:0,environmentLocalEastM:45,environmentLocalNorthM:35});
 const b=setup({roofSide:'best',northDirection:180});
 const sa=capture(a),sb=capture(b);assert.ok(sa.stats.surfaces.back>0);assert.ok(sb.stats.surfaces.front>0);
 assert.notEqual(shape(sa),shape(sb));near(sa.stats.size.x,sb.stats.size.x);dispose(a.scene);dispose(b.scene);
});
test('Technical edges, night settings, location, battery and financial state do not add analysis overlays or invented equipment',()=>{
 const a=setup(),b=setup({technicalEdges:true,nightPreview:true,locationLat:44.123456,locationLon:26.654321,batteryCapacityKWh:99,monthlyBillRon:12345});
 const sa=capture(a),sb=capture(b);assert.equal(shape(sa),shape(sb));assert.equal(JSON.stringify(sa.model.materials.map(m=>m.color)),JSON.stringify(sb.model.materials.map(m=>m.color)));
 assert.ok(!JSON.stringify(sb).includes('44.123456'));dispose(a.scene);dispose(b.scene);
});
test('Source panel and house geometries/materials are not disposed by snapshot or export-copy cleanup',()=>{
 const x=setup();let disposals=0;x.scene.traverse(o=>{o.geometry?.addEventListener('dispose',()=>disposals++);[].concat(o.material||[]).forEach(m=>m.addEventListener('dispose',()=>disposals++));});
 const before=json(x.scene);capture(x);assert.equal(disposals,0);assert.equal(json(x.scene),before);
});
test('No partial QR snapshot for missing roots, an empty array or invalid geometry',()=>{
 assert.throws(()=>captureSolarARSnapshot(),{code:'not-ready'});const x=setup();
 assert.throws(()=>captureSolarARSnapshot(x.house,new THREE.Group()),{code:'not-ready'});
 const empty=new THREE.Group();empty.add(new THREE.Group());assert.throws(()=>captureSolarARSnapshot(x.house,empty),{code:'no-panels'});
 x.panels.children[0].children[0].position.x=NaN;assert.throws(()=>capture(x),{code:'invalid-geometry'});
});
test('Texture readiness waits for both roots, re-reads replacements and rejects broken images/abort',async()=>{
 const x=setup();await waitForSolarTextures(()=>[x.house,x.panels]);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(waitForSolarTextures(()=>[x.house,x.panels],{signal:ctrl.signal}),{name:'AbortError'});
 const mesh=x.panels.children[0].children[0].children[0];mesh.material.map=new THREE.Texture();
 await assert.rejects(waitForSolarTextures(()=>[x.house,x.panels],{timeoutMs:1}),{code:'not-ready'});
 mesh.material.map.image={complete:true,naturalWidth:0};await assert.rejects(waitForSolarTextures(()=>[x.house,x.panels]),{code:'textures-unavailable'});
 mesh.material.map.image=undefined;let calls=0;
 await waitForSolarTextures(()=>{if(++calls===2)mesh.material.map=null;return [x.house,x.panels];});assert.ok(calls>=2);
 dispose(x.scene);
});
test('Saving/restoring Solar settings is independent of AR and recreates the same geometry',()=>{
 const x=setup({roofType:'shed',panelCount:6,roofSide:'front',pitch:18,panelGap:.16}),snapshot=captureSolarShareState(x.s);
 const restored={...state};assert.ok(applySolarShareState(snapshot,restored));const y=setup(restored);
 assert.equal(shape(capture(x)),shape(capture(y)));dispose(x.scene);dispose(y.scene);
});
test('Real GLBs for all three roof forms and both array orientations pass Firebase asset validation',async()=>{
 for(const roofType of ['gable','hip','shed'])for(const moduleOrientation of ['portrait','landscape']){
  const x=setup({roofType,moduleOrientation}),before=json(x.scene),snap=capture(x),steps=[];
  const asset=await createSolarFirebaseARAsset(snap,'glb',v=>steps.push(v));
  const b=Buffer.from(await asset.blob.arrayBuffer());validateAsset('glb',b);assert.ok(b.length>10000);assert.ok(b.length<=SOLAR_AR_LIMITS.glb);
  assert.deepEqual(steps,['building','exporting']);assert.equal(json(x.scene),before);
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));assert.ok(gltf.meshes.length>=4);dispose(x.scene);
 }
 for(const f of ['glb','usdz'])assert.equal(SOLAR_AR_LIMITS[f],FORMATS[f].maxBytes);
 await assert.rejects(createSolarFirebaseARAsset({},'stl'),{code:'invalid-format'});
 await assert.rejects(createSolarFirebaseARAsset({},'glb'),{code:'not-ready'});
});
test('Entrypoints use shared Firebase dialog, pinned exporters, explicit capability and fresh cache links',()=>{
 const shell=read('../js/sharedShell.js'),app=read('../js/app.js'),scene=read('../js/scene.js'),html=read('../index.html'),exporter=read('../js/ar/exportSolar.js');
 assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ void solarAR.open/);assert.match(shell,/createSolarARController/);
 assert.match(app,/async captureARSnapshot/);assert.match(scene,/waitForSolarTextures\(\(\) => \[this.modelRoot, this.solarRoot\]/);
 assert.match(html,/sharedShell.js\?v=localized-slugs-1/);assert.match(html,/app\.js\?v=[\w-]+"/);assert.match(html,/three@0\.169\.0/);
 for(const name of ['GLTFExporter','USDZExporter'])assert.match(exporter,new RegExp(`three/addons/exporters/${name}.js`));
 assert.doesNotMatch(exporter,/supabase|scene\.rebuild|fetch\(/i);assert.match(exporter,/quickLookCompatible: true/);
});
test('Solar Quick Look link has one image child; Android/iOS share one phone entry point',()=>{
 const html=read('../ar.html'),body=html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];
 assert.match(body,/<img /);assert.doesNotMatch(body,/<span|<button|<div/);assert.match(read('../js/ar/phone.js'),/mountARPhone\('solar'\)/);
});
