import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProjectSession } from '../js/projectSession.js';
import { normalize } from '../js/model.js';
import { fixture } from './fixtures/model-results.mjs';
import { prepareModelImport } from '../js/segmentationAdapter.js';
import { decodeProjectFile, makePhotoAsset } from '../js/projectAssets.js';
const blob=new Blob([await readFile(new URL('./fixtures/server-model-photo.png',import.meta.url))],{type:'image/png'});
const decode=async()=>({width:200,height:160});
const data=fixture({width:200,height:160});
const imported=prepareModelImport(data);
function memoryStore() {
 const projects=new Map(),assets=new Map();let calls=0;
 return {projects,assets,get writes(){return calls;},quota:false,
  async cacheAssets(parts){if(this.quota)throw new Error('QuotaExceededError');for(const a of Object.values(parts))if(a){assets.set(a.meta.sha256,a);calls++;}},
  async asset(ref){return ref?assets.get(ref.sha256)||null:null;},async clear(){projects.clear();assets.clear();},
  async save(name,document,parts,{id='project-1',expectedRevision=null}={}){if(this.quota)throw new Error('QuotaExceededError');
   const old=projects.get(id);if((old?.revision??null)!==expectedRevision)throw new Error('conflict');
   await this.cacheAssets(parts);const r={id,name,revision:(old?.revision||0)+1,document:structuredClone(document)};projects.set(id,r);return r;},
  async load(id){const r=projects.get(id);return r?{...r,assets:{photo:await this.asset(r.document.photo),result:await this.asset(r.document.result)}}:null;},
  async list(){return [...projects.values()];},close(){}
 };
}
function harness(store=memoryStore()){
 const live={revision:0,photo:{photoId:'one',width:200,height:160},source:'blob:one',calls:0,network:0,
  state:normalize({shape:'regions',areaRegions:imported.regions,areaOrigin:imported.origin}),
  view:{calibration:{type:'metric_model',value:imported.camera,origin:imported.origin},photoMode:true,photoSetup:false,top:false,pose:null},
  detection:{key:'original',payload:data,targets:['grass','dirt']},draft:false};
 const session=createProjectSession({store,decodeImage:decode,getPhoto:()=>live.photo,getRevision:()=>live.revision,getSource:()=>live.source,
  getDetection:()=>live.detection,capture:()=>({state:live.state,view:live.view}),
  assertSavable(){if(live.draft)throw new Error('Finish the outline');},
  fetchImpl:async()=>{live.network++;return new Response(blob);},
  async apply(bundle,guard){if(!guard())throw new Error('stale');if(live.failApply)throw new Error('render failure');
    live.state=structuredClone(bundle.document.state);live.view=structuredClone(bundle.document.view);live.revision++;live.calls++;
    live.photo=bundle.assets.photo?{photoId:`opened-${live.calls}`,width:200,height:160}:null;live.source=live.photo?'blob:reopened':null;},
 });
 return {session,live,store};
}
test('save/open uses original binary photo plus the current edited design; opening never fetches or reruns models',async()=>{
 const{session,live,store}=harness();await session.photoLoaded(live.photo,live.source);
 await session.save('Front yard');const before=structuredClone(live.state);const network=live.network;
 live.state=normalize({shape:'regions',areaRegions:[],areaOrigin:{x:0,z:0}});live.revision++;
 await session.openLocal('project-1');assert.deepEqual(live.state,before);assert.equal(live.network,network);assert.equal(live.calls,1);
 assert.equal(store.projects.size,1);assert.equal(session.getStatus().cached,true);
});
test('same-browser account reference resolves its photograph, holes and model calibration',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.rememberDetection();
 const snapshot=h.session.savedState();const second=harness(h.store);second.live.photo=null;
 await second.session.restoreSaved(snapshot);assert.equal(second.live.photo.width,200);
 assert.deepEqual(second.live.state,h.live.state);assert.equal(second.live.network,0);
 assert.equal(second.live.view.calibration.type,'metric_model');
});
test('missing photo opens saved holes in 3D and requires an exact reattachment',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);const snapshot=h.session.savedState();
 h.store.assets.clear();await h.session.restoreSaved(snapshot);assert.equal(h.live.photo,null);
 assert.equal(h.session.getStatus().missingPhoto,true);assert.equal(h.live.state.areaRegions[0].holes.length,1);
 await h.session.reattach(blob);assert.equal(h.session.getStatus().missingPhoto,false);assert.ok(h.live.photo);
 assert.equal(h.live.state.areaRegions[0].holes.length,1);
});
test('failed rendering leaves the session asset references and cache state unchanged',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.save('Original');
 const before=h.session.savedState();h.live.failApply=true;
 await assert.rejects(()=>h.session.openLocal('project-1'),/render failure/);assert.deepEqual(h.session.savedState(),before);
});
test('slow project read cannot replace a later edit',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.save('Original');
 const load=h.store.load.bind(h.store);let release;h.store.load=id=>new Promise(resolve=>{release=async()=>resolve(await load(id));});
 const opening=h.session.openLocal('project-1');h.live.revision++;await release();
 await assert.rejects(()=>opening,e=>e.code==='staleProject');assert.equal(h.live.calls,0);
});
test('new photo invalidates a slow Open request',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.save('Original');
 const load=h.store.load.bind(h.store);let release;h.store.load=id=>new Promise(resolve=>{release=async()=>resolve(await load(id));});
 const opening=h.session.openLocal('project-1');h.live.photo={...h.live.photo,photoId:'two'};
 await h.session.photoLoaded(h.live.photo,'blob:two');await release();
 await assert.rejects(()=>opening,e=>e.code==='staleProject');assert.equal(h.live.photo.photoId,'two');
});
test('storage quota failure still permits a full portable download, not a false compact save',async()=>{
 const h=harness();h.store.quota=true;await h.session.photoLoaded(h.live.photo,h.live.source);
 assert.throws(()=>h.session.savedState(),/not yet saved/);await assert.rejects(()=>h.session.save('A'),/Quota/);
 const portable=await h.session.download();const loaded=await decodeProjectFile(portable,decode);
 assert.equal(loaded.assets.photo.meta.size,blob.size);assert.deepEqual(loaded.document.state,h.live.state);
});
test('clear-cache is not undone by automatic diagnostic caching after a later edit',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.rememberDetection();
 await h.session.clearLocalData();h.live.detection={...h.live.detection,key:'new-key'};await h.session.rememberDetection();
 assert.equal(h.store.assets.size,0);assert.equal(h.session.getStatus().cached,false);
 assert.throws(()=>h.session.savedState(),/not yet saved/);
 await h.session.save('Explicit new save');assert.ok(h.store.assets.size>0);
});
test('unfinished outlines cannot be silently lost by saving a stale closed shape',async()=>{
 const h=harness();h.live.draft=true;assert.throws(()=>h.session.savedState(),/Finish/);
 await assert.rejects(()=>h.session.download(),/Finish/);await assert.rejects(()=>h.session.save('Draft'),/Finish/);
});
test('geometry-only projects save without photos or inference and reopen with no upload overlay',async()=>{
 const h=harness();h.live.photo=null;h.live.view=null;h.live.detection=null;
 await h.session.save('Geometry');await h.session.openLocal('project-1');assert.equal(h.live.photo,null);
 assert.equal(h.session.getDocument().stage,'done');assert.equal(h.live.network,0);
});
test('portable project can move to a clean store without fetching external resources',async()=>{
 const a=harness();await a.session.photoLoaded(a.live.photo,a.live.source);const file=await a.session.download({includeResult:true});
 const b=harness();b.live.photo=null;await b.session.openFile(file);
 assert.deepEqual(b.live.state,a.live.state);assert.equal(b.live.network,0);assert.ok(b.store.assets.size>0);
});
test('geometry changes after a saved snapshot mark the open design as unsaved',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);await h.session.save('A');
 h.session.markChanged();assert.equal(h.session.getStatus().phase,'unsaved');
});
test('edits made during an IndexedDB save remain marked unsaved',async()=>{
 const h=harness();await h.session.photoLoaded(h.live.photo,h.live.source);
 const save=h.store.save.bind(h.store);let release;
 h.store.save=(...args)=>new Promise(resolve=>{release=async()=>resolve(await save(...args));});
 const saving=h.session.save('Earlier snapshot');while(!release)await new Promise(r=>setTimeout(r,1));
 h.live.revision++;await release();await saving;
 assert.equal(h.session.getStatus().phase,'unsaved');assert.equal(h.store.projects.size,1);
});
