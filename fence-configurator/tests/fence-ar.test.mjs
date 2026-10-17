import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFenceState } from '../js/state.js';
import { buildFenceAssembly } from '../js/fenceFactory.js';
import { FENCE_MESSAGES } from '../js/i18n.js';
import { captureFenceARSnapshot, createFenceFirebaseARAsset } from '../js/ar/exportFence.js';
import { AR_COPY } from '../../shared-ui/src/ar/i18n.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl } from '../../shared-ui/src/ar/links.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';
import { buildProductARScene } from '../../shared-3d/src/ar/productSnapshot.js';
const require = createRequire(import.meta.url), { validateAsset } = require('../../firebase-share-backend/functions/hall-ar-core.cjs');
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(data => { this.result = `data:${b.type};base64,${Buffer.from(data).toString('base64')}`; this.onloadend?.(); }); }
};
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-5, `${a} != ${b}`);
function physicalCounts(root) {
  const counts={};root.traverseVisible(o=>{if(o.isMesh)counts[o.name || 'unnamed-mesh']=(counts[o.name || 'unnamed-mesh']||0)+(o.isInstancedMesh?o.count:1);});return counts;
}
test('Fence opt-in, six-product policy and locale-complete copy',()=>{
  assert.deepEqual(AR_PRODUCTS,['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar']);
  for(const product of [...AR_PRODUCTS,'tiles','roof','solar','chair','bookshelf','cardbox','gas']){
    assert.equal(isConfiguratorAREnabled(product,{viewAR:true}),AR_PRODUCTS.includes(product));
    assert.equal(isConfiguratorAREnabled(product,{}),false);
  }
  for(const locale of Object.keys(AR_COPY.hall)){
    assert.deepEqual(Object.keys(AR_COPY.fence[locale]).sort(),Object.keys(AR_COPY.hall[locale]).sort());
    assert.notEqual(AR_COPY.fence[locale].title,AR_COPY.hall[locale].title);
  }
});
test('Fence UI copy is complete for en, ro, de, es, fr and it with matching placeholders',()=>{
  const locales=['en-US','ro-RO','de-DE','es-ES','fr-FR','it-IT'];
  assert.deepEqual(Object.keys(FENCE_MESSAGES),locales);
  const vars=s=>[...String(s).matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  const en=FENCE_MESSAGES['en-US'];
  for(const locale of locales){
    assert.deepEqual(Object.keys(FENCE_MESSAGES[locale]).sort(),Object.keys(en).sort(),locale);
    for(const key of Object.keys(en))assert.deepEqual(vars(FENCE_MESSAGES[locale][key]),vars(en[key]),`${locale} ${key}`);
    if(locale!=='en-US')assert.notEqual(FENCE_MESSAGES[locale]['sidebar.title'],en['sidebar.title'],locale);
  }
});
test('Canonical/localized/tenant phone paths and both model formats',()=>{
  const id='0123456789abcdef0123456789abcdef';
  for(const [host,path] of [['www.360configurator.com','fence-configurator'],['360configurator.ro','configurator-garduri'],['www.360konfigurator.de','zaun-konfigurator'],['client.360configurator.ro','fence-configurator']]){
    for(const mode of ['android','ios']){const u=new URL(arPhoneUrl(id,mode,'ro-RO',`https://${host}`,'fence'));assert.equal(u.pathname,`/${path}/ar.html`);assert.equal(u.searchParams.get('mode'),mode);}
  }
  for(const format of ['glb','usdz'])assert.match(arModelUrl(id,format,'fence'),new RegExp(`fence\\.${format}`));
});
test('Every physical part survives all 40 layout/panel/foundation combinations',()=>{
  for(const layout of ['straight','l','u','closed','closed5']) for(const panelStyle of ['vertical','horizontal','privacy','mesh']) for(const foundation of ['concrete','baseplate']){
    const state=createFenceState({layout,panelStyle,foundation,runA:12,runB:8,runC:8,runD:6,technicalEdges:true,
      gates:[{id:'walk',type:'pedestrian',runId:'a',position:0,handing:'left'},{id:'car',type:'driveway',runId:'a',position:3,handing:'right'}]});
    const {root,metrics}=buildFenceAssembly(state),before=JSON.stringify(root.toJSON()),sourceBox=new THREE.Box3().setFromObject(root);
    const snap=captureFenceARSnapshot(root);assert.deepEqual(snap.stats.components,physicalCounts(root));
    assert.equal(JSON.stringify(root.toJSON()),before);assert.equal(snap.stats.components['gate-handle'],3);assert.equal(snap.stats.components.post,metrics.postCount);assert.equal(snap.stats.components['post-cap'],metrics.postCount);
    assert.equal(snap.stats.components[foundation==='baseplate'?'base-plate':'concrete-footing'],metrics.postCount);
    if(foundation==='baseplate'){assert.equal(snap.stats.components['anchor-bolt'],metrics.postCount*4);assert.equal(snap.stats.components['anchor-nut'],metrics.postCount*4);}
    const target=new THREE.ObjectLoader().parse(snap.model);const b=new THREE.Box3().setFromObject(target),size=sourceBox.getSize(new THREE.Vector3());
    for(const axis of ['x','y','z'])near(snap.stats.size[axis],size[axis]);near(b.min.y,sourceBox.min.y);near(b.max.y,sourceBox.max.y);
    assert.equal(target.children.filter(o=>!o.isMesh).length,0);
  }
});
test('Finish colors and gate handing change the exported model, not just state metadata',()=>{
  const fingerprints=new Set();
  for(const finish of ['anthracite','white','bronze','black']){
    const snap=captureFenceARSnapshot(buildFenceAssembly(createFenceState({finish})).root);
    fingerprints.add(JSON.stringify(snap.model.materials.map(m=>m.color)));
  }
  assert.equal(fingerprints.size,4);
  const snapshots=['left','right'].map(handing=>captureFenceARSnapshot(buildFenceAssembly(createFenceState({gates:[{id:'gate',type:'pedestrian',runId:'a',position:1,handing}]})).root));
  assert.notEqual(JSON.stringify(snapshots[0].model.geometries),JSON.stringify(snapshots[1].model.geometries));
});
test('Real default and closed multi-gate fence GLBs validate as self-contained assets',async()=>{
  for(const options of [{},{layout:'closed5',runA:16,runB:10,runC:12,runD:8,panelStyle:'mesh',foundation:'baseplate',gates:[{type:'driveway',runId:'a',position:0},{type:'pedestrian',runId:'c',position:1}]}]){
    const snap=captureFenceARSnapshot(buildFenceAssembly(createFenceState(options)).root),progress=[];
    const asset=await createFenceFirebaseARAsset(snap,'glb',value=>progress.push(value));
    const b=Buffer.from(await asset.blob.arrayBuffer());assert.equal(validateAsset('glb',b).format,'glb');assert.deepEqual(progress,['building','exporting']);
    const doc=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());assert.equal(doc.buffers[0].uri,undefined);
    const tris=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);assert.equal(tris,snap.stats.triangles);
    console.log(`Fence GLB: ${b.length} bytes, ${snap.stats.sourceMeshes} source parts, ${snap.stats.triangles} triangles`);
  }
});
test('Portable export retains instance colours, mirrored transforms and multi-material faces',()=>{
  const root=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:'white'}),g=new THREE.BoxGeometry(1,1,1);
  const inst=new THREE.InstancedMesh(g,m,2);inst.name='post';inst.setColorAt(0,new THREE.Color('red'));inst.setColorAt(1,new THREE.Color('blue'));inst.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0));root.add(inst);
  const mesh=new THREE.Mesh(g,[m,m,m,m,m,new THREE.MeshStandardMaterial({color:'green'})]);mesh.position.y=2;mesh.scale.x=-1;root.add(mesh);
  const built=buildProductARScene(root,{product:'test'});
  const colors=built.root.children.map(o=>o.material.color.getHex());for(const c of [0xff0000,0x0000ff,0x008000])assert.ok(colors.includes(c));
  assert.equal(built.stats.sourceMeshes,3);assert.equal(built.stats.triangles,36);built.dispose();assert.equal(mesh.scale.x,-1);
});
test('Fence snapshots are independent; missing models fail rather than generating an empty QR',async()=>{
  assert.throws(()=>captureFenceARSnapshot(null),{code:'not-ready'});assert.throws(()=>captureFenceARSnapshot(new THREE.Group()),{code:'invalid-geometry'});
  const build=buildFenceAssembly(createFenceState()),snap=captureFenceARSnapshot(build.root);let disposed=0;build.root.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
  captureFenceARSnapshot(build.root);assert.equal(disposed,0);build.root.clear();assert.ok(new THREE.ObjectLoader().parse(snap.model).children.length);
  await assert.rejects(()=>createFenceFirebaseARAsset({},'exe'),{code:'invalid-format'});
});
test('Entry points share Firebase dialog and flush pending edits without old upload paths',()=>{
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),shell=readFileSync(new URL('../js/sharedShell.js',import.meta.url),'utf8');
  assert.match(app,/getARAssembly:[\s\S]*?if \(rebuildTimer \|\| !modelReady\) rebuildNow\(\)/);assert.match(shell,/viewAR: true/);assert.match(shell,/onViewAR\(\) \{ ar.open\(\)/);
  const phone=readFileSync(new URL('../ar.html',import.meta.url),'utf8'),link=phone.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(link,/<img/);assert.doesNotMatch(link,/<span|<div/);
  assert.doesNotMatch(shell,/supabase|tus\./i);
});
