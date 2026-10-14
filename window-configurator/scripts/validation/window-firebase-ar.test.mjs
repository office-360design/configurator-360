import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {captureWindowARSnapshot,createWindowFirebaseARAsset} from '../../src/client/js/ar/exportWindow.js';
import {createProfileController} from '../../src/client/js/profile-controller.js';
import {AR_COPY} from '../../../shared-ui/src/ar/i18n.js';
import {arPhoneUrl,arModelUrl,sceneViewerIntent} from '../../../shared-ui/src/ar/links.js';
import {isConfiguratorAREnabled} from '../../../shared-ui/src/arPolicy.js';
const require=createRequire(import.meta.url), {validateAsset}=require('../../../firebase-share-backend/functions/hall-ar-core.cjs');
// GLTFExporter uses browser FileReader; Blob itself is native in Node 22.
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});} readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}};
function fixture({mirror=false,open=false}={}) {
  const root=new THREE.Group(),frame=new THREE.MeshStandardMaterial({color:'#38454c'}),glass=new THREE.MeshPhysicalMaterial({color:'#b4d9df',transparent:true,opacity:.35,side:THREE.DoubleSide});
  const box=(x,y,z,px,py,pz,mat=frame)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),mat);m.position.set(px,py,pz);root.add(m);return m;};
  box(.06,1.5,.065,-.57,0,0);box(.06,1.5,.065,.57,0,0);box(1.08,.06,.065,0,.72,0);box(1.08,.06,.065,0,-.72,0);
  const pane=box(1.08,1.38,.025,0,0,0,glass);if(mirror)pane.scale.x=-1;
  if(open)pane.rotation.y=.7;
  return {root,pane};
}
test('Only Hall, Window, Pergola, Fence, Pavement and Chair opt-in; native/localized/tenant URLs use Window, not Hall',()=>{
  for(const product of ['hall','window','bookshelf','pergola','roof','chair','fence','solar',''])assert.equal(isConfiguratorAREnabled(product,{viewAR:true}),['hall','window','pergola','fence','tiles','chair','cardbox','bookshelf','roof','solar'].includes(product));
  const id='ABCDEFGH01234567abcdefgh01234567';
  for(const [host,path] of [['www.360configurator.com','window-configurator'],['www.360configurator.ro','configurator-ferestre'],['www.360konfigurator.de','fenster-konfigurator'],['tenant.360configurator.ro','window-configurator']]){
    const url=new URL(arPhoneUrl(id,'ios','ro-RO',`https://${host}`,'window'));assert.equal(url.pathname,`/${path}/ar.html`);assert.equal(url.searchParams.get('id'),id);assert.equal(url.searchParams.get('mode'),'ios');
  }
  assert.match(arModelUrl(id,'usdz','window'),/\/window.usdz\?/);assert.match(sceneViewerIntent(arModelUrl(id,'glb','window'),'https://example.test','Your configured window'),/title=Your\+configured\+window/);
});
test('Window AR translations stay complete and distinct from Hall',()=>{
  for(const locale of ['en-US','ro-RO','de-DE']){assert.deepEqual(Object.keys(AR_COPY.window[locale]).sort(),Object.keys(AR_COPY.hall[locale]).sort());assert.notEqual(AR_COPY.window[locale].title,AR_COPY.hall[locale].title);}
});
test('Snapshot removes exploded positions and non-mesh/hidden decorations without mutating source',()=>{
  const {root,pane}=fixture();const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshBasicMaterial()));root.add(hidden);
  root.add(new THREE.LineSegments(new THREE.EdgesGeometry(pane.geometry),new THREE.LineBasicMaterial()));root.add(new THREE.Sprite());
  pane.userData.basePos=new THREE.Vector3(0,0,0);pane.position.set(3,4,5);const original=Array.from(pane.geometry.attributes.position.array);const pos=pane.position.toArray();
  const snapshot=captureWindowARSnapshot(root);for(const [axis,value] of Object.entries({x:1.2,y:1.5,z:.065}))assert.ok(Math.abs(snapshot.stats.size[axis]-value)<1e-6);assert.equal(snapshot.stats.sourceMeshes,5);assert.equal(snapshot.stats.meshes,2);assert.deepEqual(pane.position.toArray(),pos);assert.deepEqual(Array.from(pane.geometry.attributes.position.array),original);
  root.clear();assert.ok(snapshot.model.geometries.length>0);const restored=new THREE.ObjectLoader().parse(snapshot.model);assert.equal(new THREE.Box3().setFromObject(restored).min.y,0);
});
test('Capture retains sash pose and original selection material, no shared disposal',()=>{
  const {root,pane}=fixture({open:true});let disposed=0;pane.material.addEventListener('dispose',()=>disposed++);pane.geometry.addEventListener('dispose',()=>disposed++);
  const material=new THREE.MeshStandardMaterial({color:'#112233'}),snap=captureWindowARSnapshot(root,{materialForMesh:o=>o===pane?material:o.material});assert.ok(snap.stats.size.z>.5);assert.ok(snap.model.materials.some(m=>m.color===0x112233));assert.equal(disposed,0);assert.equal(pane.rotation.y,.7);
});
test('Actual bundled-r160 GLB export passes Firebase self-contained asset validation',async()=>{
  for(const opts of [{},{mirror:true},{open:true}]){
    const snapshot=captureWindowARSnapshot(fixture(opts).root),asset=await createWindowFirebaseARAsset(snapshot,'glb');
    const bytes=Buffer.from(await asset.blob.arrayBuffer());assert.equal(validateAsset('glb',bytes).format,'glb');assert.ok(bytes.length<100000);assert.equal(asset.stats.sourceMeshes,5);
    const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());assert.equal(doc.meshes.length,2);assert.equal(doc.buffers.length,1);assert.ok(!doc.buffers[0].uri);
  }
});
test('Empty/broken geometry and unsupported formats fail before publication',async()=>{
  assert.throws(()=>captureWindowARSnapshot(new THREE.Group()),{code:'invalid-geometry'});await assert.rejects(()=>createWindowFirebaseARAsset({},'obj'),{code:'invalid-format'});
  const f=fixture();f.pane.geometry.attributes.position.setX(0,NaN);assert.throws(()=>captureWindowARSnapshot(f.root),{code:'invalid-geometry'});
});
test('Window entry loads Firebase dialog, no legacy upload/config or external QR scripts',()=>{
  const html=readFileSync(new URL('../../src/client/index.html',import.meta.url),'utf8'),controller=readFileSync(new URL('../../src/client/js/ar-controller.js',import.meta.url),'utf8');
  assert.match(html,/shared-ui\/styles\/ar.css/);assert.doesNotMatch(html,/tus\.min\.js|qrcode\.min\.js|ar-upload-config\.js|id="qr-modal"/);assert.match(controller,/createFirebaseARDialog/);assert.doesNotMatch(controller,/uploadARAssetToSupabase|requestSession\(/);
  const phone=readFileSync(new URL('../../src/client/ar.html',import.meta.url),'utf8');const link=phone.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];assert.match(link,/<img/);assert.doesNotMatch(link,/<span|<div/);
});

test('Transmission-only architectural glazing is translucent in both AR formats',()=>{
  const {root,pane}=fixture(); pane.material=new THREE.MeshPhysicalMaterial({color:'#ffffff',transmission:1,opacity:1,transparent:false});
  const snapshot=captureWindowARSnapshot(root);
  assert.ok(snapshot.model.materials.some(m=>m.transparent && Math.abs(m.opacity-.18)<1e-8));
  assert.equal(pane.material.opacity,1);assert.equal(pane.material.transmission,1);
});

test('Shared publisher sends Window entitlement query and checks the exact native asset before QR',async t=>{
  const {publishAR}=await import('../../../shared-ui/src/ar/publish.js');
  const oldXHR=globalThis.XMLHttpRequest,oldFetch=globalThis.fetch,calls=[];
  t.after(()=>{globalThis.XMLHttpRequest=oldXHR;globalThis.fetch=oldFetch;});
  const id='ABCDEFGH01234567abcdefgh01234567',blob=new Blob([new Uint8Array(256)]);
  globalThis.XMLHttpRequest=class{
    constructor(){this.upload={};this.headers={};}open(method,url){calls.push({method,url,headers:this.headers});}
    setRequestHeader(k,v){this.headers[k]=v;}
    send(body){assert.equal(body,blob);this.status=201;this.responseText=JSON.stringify({id,product:'window',format:'glb',byteLength:blob.size,expiresAtMs:Date.now()+100000});queueMicrotask(()=>this.onload());}
  };
  globalThis.fetch=async (url,options)=>{calls.push({url,method:options.method});return new Response(null,{status:200,headers:{'Content-Length':String(blob.size)}});};
  const session=await publishAR({format:'glb',blob},{product:'window'});
  assert.equal(session.product,'window');assert.match(calls[0].url,/publishHallAR\?product=window$/);assert.equal(calls[0].headers['X-Hall-AR-Format'],'glb');assert.equal(calls[1].method,'HEAD');assert.match(calls[1].url,/getHallAR\/window.glb\?/);
});
test('Old backend product response or unavailable bytes cannot become a ready Window QR',async t=>{
  const {publishAR}=await import('../../../shared-ui/src/ar/publish.js');
  const oldXHR=globalThis.XMLHttpRequest,oldFetch=globalThis.fetch;
  t.after(()=>{globalThis.XMLHttpRequest=oldXHR;globalThis.fetch=oldFetch;});
  const blob=new Blob([new Uint8Array(256)]),id='ABCDEFGH01234567abcdefgh01234567';let product,headCalls=0;
  globalThis.XMLHttpRequest=class{
    constructor(){this.upload={};}open(){}setRequestHeader(){}
    send(){this.status=201;this.responseText=JSON.stringify({id,product,format:'glb',byteLength:blob.size,expiresAtMs:Date.now()+100000});queueMicrotask(()=>this.onload());}
  };
  globalThis.fetch=async()=>{headCalls++;return new Response(null,{status:404});};
  await assert.rejects(()=>publishAR({format:'glb',blob},{product:'window'}),{code:'service-unavailable'});assert.equal(headCalls,0);
  product='window';await assert.rejects(()=>publishAR({format:'glb',blob},{product:'window'}),{code:'service-unavailable'});assert.equal(headCalls,1);
});

// Exercise the actual controller, not a copied function. Its static import
// runs before browser stubs are installed, so settings use offline defaults.

test('Cached-profile material refresh uses the current builder instead of an out-of-scope variable', async t => {
  const saved = new Map(['window','document','requestAnimationFrame'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => { for (const [key,descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; } });
  globalThis.window = { addEventListener() {} };
  globalThis.document = { getElementById() { return null; } };
  globalThis.requestAnimationFrame = callback => queueMicrotask(() => callback(0));
  const makeBuilder = () => ({
    section: [{ name:'section-profile' }], invalidations:0, builds:0,
    getSectionSampleProfilesData() { return this.section; },
    invalidateSectionSamples() { this.invalidations++; },
    buildWindow() { this.builds++; },
  });
  let builder = makeBuilder();
  const firstBuilder = builder, renderCalls = [];
  const controller = createProfileController({
    getWindowBuilder: () => builder,
    getMaterialForProfile: profile => `new-material:${profile.name}`,
    renderer: {
      compile() { renderCalls.push('compile'); },
      render() { renderCalls.push('render'); },
      getContext() { return null; },
    },
    scene: {}, camera: {},
  });
  const mainProfile = {name:'main-profile'};
  controller.getProfilesData().push(mainProfile);
  await controller.refreshProfileMaterials();
  assert.equal(mainProfile.material,'new-material:main-profile');
  assert.equal(firstBuilder.section[0].material,'new-material:section-profile');
  assert.equal(firstBuilder.invalidations,1);assert.equal(firstBuilder.builds,1);
  assert.deepEqual(renderCalls,['compile','render','render']);
  // A replacement builder must be read via the accessor on every refresh.
  // No window/global named `windowBuilder` is supplied by this fixture.
  builder = makeBuilder();
  await controller.refreshProfileMaterials();
  assert.equal(builder.invalidations,1);assert.equal(builder.builds,1);
  assert.equal(firstBuilder.builds,1);
  assert.equal(builder.section[0].material,'new-material:section-profile');
});

test('Real refresh failures still reject instead of pretending that the window is ready', async t => {
  const saved = new Map(['window','document','requestAnimationFrame'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => { for (const [key,descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; } });
  globalThis.window = { addEventListener() {}, CONFIGURATOR_READY:false };
  globalThis.document = { getElementById() { return null; } };
  globalThis.requestAnimationFrame = callback => queueMicrotask(() => callback(0));
  const failure = new Error('intentional rebuild failure');
  const controller = createProfileController({
    getWindowBuilder: () => ({ invalidateSectionSamples(){}, buildWindow(){ throw failure; } }),
    getMaterialForProfile: () => null,
    renderer: { compile(){ assert.fail('must not render a failed build'); } }, scene:{},camera:{},
  });
  await assert.rejects(() => controller.refreshProfileMaterials(), error => error === failure);
  assert.equal(window.CONFIGURATOR_READY,false);
});

test('Window entry invalidates the cached refresh dependency without bypassing AR readiness', () => {
  const entry=readFileSync(new URL('../../src/client/index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../src/client/js/main.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../../src/client/js/ar-controller.js',import.meta.url),'utf8');
  const release=entry.match(/src="\.\/js\/main\.js\?v=window-ar-(\d+)"/);
  assert.ok(release && Number(release[1]) >= 3, 'entry must invalidate the pre-fix AR cache');
  assert.match(main,/from '\.\/profile-controller\.js\?v=window-ar-3'/);
  assert.match(controller,/!getProfilesReady\?\.\(\)/);
  assert.match(controller,/window\.CONFIGURATOR_READY === false/);
});
