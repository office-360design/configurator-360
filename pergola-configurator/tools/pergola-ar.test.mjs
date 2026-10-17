import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { DEFAULT_STATE } from '../src/state.js';
import { MaterialLibrary } from '../../shared-3d/src/materials/MaterialLibrary.js';
import { buildPergola } from '../src/scene/buildPergola.js';
import { capturePergolaARSnapshot, createPergolaFirebaseARAsset, PERGOLA_AR_LIMITS } from '../src/ar/exportPergola.js';
import { AR_COPY } from '../../shared-ui/src/ar/i18n.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl, sceneViewerIntent } from '../../shared-ui/src/ar/links.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';
const require = createRequire(import.meta.url);
const { validateAsset } = require('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(data => { this.result = `data:${blob.type};base64,${Buffer.from(data).toString('base64')}`; this.onloadend?.(); }); }
};
const state = () => structuredClone(DEFAULT_STATE);
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function restore(snapshot) { return new THREE.ObjectLoader().parse(snapshot.model); }
function box() { const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, .5), new THREE.MeshStandardMaterial({ color: '#123456' }))); return root; }

test('AR policy enables only Hall, Window and Pergola, always with explicit opt-in', () => {
  for (const p of ['hall','window','pergola','fence','roof','solar','bookshelf','chair','tiles','cardbox','']) {
    assert.equal(isConfiguratorAREnabled(p, { viewAR: true }), AR_PRODUCTS.includes(p));
    assert.equal(isConfiguratorAREnabled(p, {}), false);
    assert.equal(isConfiguratorAREnabled(p, { viewAR: false }), false);
  }
});
test('Pergola phone URLs resolve canonical, localized and tenant routes', () => {
  const id = '0123456789abcdef0123456789abcdef';
  for (const [host, path] of [['www.360configurator.com','pergola-configurator'],['www.360configurator.ro','configurator-pergola'],['www.360konfigurator.de','pergola-konfigurator'],['www.360configurador.es','configurador-pergolas'],['www.360configurateur.fr','configurateur-pergola'],['www.360configuratore.it','configuratore-pergola'],['tenant.360configurator.ro','pergola-configurator']]) {
    for (const mode of ['android','ios']) {
      const url = new URL(arPhoneUrl(id, mode, 'ro-RO', `https://${host}`, 'pergola'));
      assert.equal(url.pathname, `/${path}/ar.html`); assert.equal(url.searchParams.get('mode'), mode);
    }
  }
  assert.match(arModelUrl(id,'usdz','pergola'), /pergola\.usdz/);
  assert.match(sceneViewerIntent(arModelUrl(id,'glb','pergola'),'https://example.test','Pergola'), /ar_preferred/);
});
test('Translations are complete for all products without falling back to Hall nouns', () => {
  for (const locale of ['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT']) {
    assert.deepEqual(Object.keys(AR_COPY.pergola[locale]).sort(), Object.keys(AR_COPY.hall[locale]).sort());
    assert.notEqual(AR_COPY.pergola[locale].title, AR_COPY.hall[locale].title);
    assert.notEqual(AR_COPY.pergola[locale].title, AR_COPY.window[locale].title);
  }
});
test('All three real pergola models export physical geometry in metres, grounded without scenery', () => {
  for (const model of ['lite','comfort','premium']) {
    const s = state(); s.model = model; const root = buildPergola(s);
    const actual = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const snap = capturePergolaARSnapshot(root), exported = new THREE.Box3().setFromObject(restore(snap));
    for (const axis of ['x','y','z']) near(snap.stats.size[axis],actual[axis]);
    near(exported.min.y,0); near(exported.getCenter(new THREE.Vector3()).x,0); near(exported.getCenter(new THREE.Vector3()).z,0);
    assert.ok(snap.stats.sourceMeshes > 20); assert.ok(snap.stats.triangles > 500);
    assert.ok(snap.model.materials.every(m => m.type === 'MeshStandardMaterial'));
  }
});
test('Changing louver angles, orientation and side-panel positions changes exported geometry, not the editor', () => {
  const fingerprints = new Set();
  for (const orientation of ['width','depth']) for (const angle of [0,28,80]) {
    const s = state(); s.roof.orientation=orientation; s.roof.louverTilt=angle;
    const source = buildPergola(s); const before = JSON.stringify(source.toJSON());
    const snapshot = capturePergolaARSnapshot(source); fingerprints.add(JSON.stringify(snapshot.model.geometries.map(g => g.data.attributes.position.array)));
    assert.equal(JSON.stringify(source.toJSON()), before);
  }
  assert.equal(fingerprints.size,6);
});
test('Capture ignores excluded/hidden subtrees and lights, owns no editor GPU resources', () => {
  const root=box(), mesh=root.children[0]; let disposed=0;
  mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);
  const scene=new THREE.Scene(); scene.add(root, new THREE.Mesh(new THREE.BoxGeometry(100,100,100),mesh.material));
  const hidden=new THREE.Group(); hidden.visible=false; hidden.add(new THREE.Mesh(new THREE.BoxGeometry(100,100,100),mesh.material));root.add(hidden);
  const excluded=hidden.clone();excluded.visible=true;excluded.userData.arExclude=true;root.add(excluded);
  root.add(new THREE.DirectionalLight(),new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry)));
  const snapshot=capturePergolaARSnapshot(root);assert.equal(snapshot.stats.sourceMeshes,1);near(snapshot.stats.size.x,2);near(snapshot.stats.size.y,3);
  assert.equal(disposed,0);root.clear();assert.equal(restore(snapshot).children.length,1);
});
test('Reflections and double-sided glass have correct winding, portable opacity and identity transforms', () => {
  const root=box(),mesh=root.children[0];mesh.scale.x=-1;
  mesh.material=new THREE.MeshPhysicalMaterial({transmission:1,opacity:1,side:THREE.DoubleSide});
  const snapshot=capturePergolaARSnapshot(root);assert.equal(snapshot.stats.triangles,24);assert.ok(snapshot.model.materials[0].opacity<.3);
  const g=restore(snapshot).children[0].geometry,p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<g.index.count;i+=3){
    const ids=[0,1,2].map(j=>g.index.getX(i+j));const pts=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
    const normal=pts[1].sub(pts[0]).cross(pts[2].sub(pts[0])).normalize();
    assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(n,ids[0]))>.99);
  }
  assert.equal(mesh.scale.x,-1);assert.equal(mesh.material.transmission,1);
});
test('Accessory geometry without normals is supported; source indices and attributes are unchanged', () => {
  const root=box(),mesh=root.children[0];mesh.geometry.deleteAttribute('normal');const before=Array.from(mesh.geometry.attributes.position.array);
  const snap=capturePergolaARSnapshot(root);assert.ok(restore(snap).children[0].geometry.attributes.normal);
  assert.equal(mesh.geometry.attributes.normal,undefined);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);
});
test('Real pergola GLB exports pass the Firebase asset validator', async () => {
  for(const model of ['lite','comfort','premium']) {
    const s=state();s.model=model;const snap=capturePergolaARSnapshot(buildPergola(s)),progress=[];
    const asset=await createPergolaFirebaseARAsset(snap,'glb',x=>progress.push(x));
    const bytes=Buffer.from(await asset.blob.arrayBuffer());assert.equal(validateAsset('glb',bytes).format,'glb');
    assert.ok(bytes.length<PERGOLA_AR_LIMITS.glb);assert.deepEqual(progress,['building','exporting']);
    const data=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());assert.equal(data.buffers.length,1);assert.equal(data.buffers[0].uri,undefined);
  }
});
test('Invalid geometry and formats fail before publication; a valid retry is not locked out', async () => {
  assert.throws(()=>capturePergolaARSnapshot(null),{code:'not-ready'});
  assert.throws(()=>capturePergolaARSnapshot(new THREE.Group()),{code:'invalid-geometry'});
  const root=box();root.children[0].geometry.attributes.position.setX(0,NaN);
  assert.throws(()=>capturePergolaARSnapshot(root),{code:'invalid-geometry'});
  await assert.rejects(()=>createPergolaFirebaseARAsset({},'exe'),{code:'invalid-format'});
  await assert.rejects(()=>createPergolaFirebaseARAsset({},'glb'),{code:'not-ready'});
  assert.ok((await createPergolaFirebaseARAsset(capturePergolaARSnapshot(box()),'glb')).blob.size>128);
});
test('Phone page has independent build entry; no editor or login modules on phone', () => {
  const phone=readFileSync(new URL('../ar.html',import.meta.url),'utf8'),vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../src/ar/phone.js',import.meta.url),'utf8');
  assert.match(vite,/new URL\('\.\/ar.html'/);assert.match(phone,/src\/ar\/phone.js/);assert.match(bootstrap,/mountARPhone\('pergola'\)/);
  const link=phone.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(link,/<img/);assert.doesNotMatch(link,/<span|<div/);
  assert.doesNotMatch(bootstrap,/tenant|firebaseAuth|main.js|from 'three'/);
});
test('Shell opts in using current PergolaScene; no Window readiness flag, Supabase or external exporters', () => {
  const adapter=readFileSync(new URL('../src/ar/controller.js',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../src/ui/pergolaSharedShell.js',import.meta.url),'utf8');
  const exporter=readFileSync(new URL('../src/ar/exportPergola.js',import.meta.url),'utf8');
  assert.match(shell,/viewAR: true/);assert.match(shell,/ar.open\(\)/);assert.match(shell,/ar.destroy\(\)/);
  assert.match(adapter,/scene.pergola/);assert.doesNotMatch(adapter,/CONFIGURATOR_READY|scene\.scene|supabase|tus/);
  assert.match(exporter,/import\('three\/addons\/exporters\/USDZExporter.js'\)/);assert.doesNotMatch(exporter,/https:|supabase/);
});

// The alias is per MaterialLibrary instance; shared presets and other products
// are untouched. This caught a screen rebuild failure before AR capture.
test('Textured screens use the existing woven provider and retain openness; glazing remains exportable', () => {
  const surfaces = new MaterialLibrary(THREE, { quality: 'high', textureAssets: false });
  const s=state();let i=0;for(const side of Object.values(s.sideSegments)) side.type=['screen','motorized-screen','glass','privacy-wall'][i++%4];
  const root=buildPergola(s,null,surfaces);let cloth=0;
  root.traverse(mesh=>{if(mesh.material?.userData.surface?.id==='fabric.screen') {cloth++;assert.ok(mesh.material.alphaMap?.isDataTexture);assert.ok(mesh.material.normalMap?.isDataTexture);}});
  assert.ok(cloth>0);assert.ok(surfaces.textures.providers.has('fabric.woven'));
  const otherScene=new MaterialLibrary(THREE,{quality:'high',textureAssets:false});
  assert.equal(otherScene.textures.providers.has('fabric.woven'),false);
  // Procedural fallback geometry must also be valid in a no-browser test.
  const snapshot=capturePergolaARSnapshot(buildPergola(s));assert.ok(snapshot.stats.sourceMeshes>50);
  surfaces.dispose();otherScene.dispose();
});
