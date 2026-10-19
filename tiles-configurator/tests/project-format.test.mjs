import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, estimate } from '../js/model.js';
import { prepareModelImport } from '../js/segmentationAdapter.js';
import { fixture } from './fixtures/model-results.mjs';
import { PROJECT_FORMAT, PROJECT_LIMITS, validateProjectDocument, projectSavedState, projectFromSavedState,
  geometryShareState, validateSavedView, projectFileName, prepareProjectState } from '../js/pavingProject.js';
import { makePhotoAsset, makeResultAsset, readResultAsset, encodeProjectFile, decodeProjectFile, inspectPhotoHeader } from '../js/projectAssets.js';
const raw = new Blob([await readFile(new URL('./fixtures/server-model-photo.png',import.meta.url))],{type:'image/png'});
const decode = async()=>({width:200,height:160});
const asset = await makePhotoAsset(raw,null,decode);
const result = fixture({width:200,height:160});
const camera = prepareModelImport(result).camera;
const rectangle=(x,z,l,w)=>[{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
const state=normalize({shape:'regions',areaOrigin:{x:0,z:0},areaRegions:[
  {outer:rectangle(0,0,4,4),holes:[rectangle(1,1,1,1),rectangle(2.5,1,.5,1)],curbs:{outer:true,holes:[true,false]}},
  {outer:rectangle(6,0,2,2),holes:[]}],rotation:37});
const base=()=>({format:PROJECT_FORMAT,version:1,state:structuredClone(state),photo:asset.meta,
  view:{calibration:{type:'metric_model',value:camera,origin:{x:0,z:0}},photoMode:true,photoSetup:false,top:false,
    pose:{position:[0,3,5],quaternion:[0,0,0,1],target:[0,0,0],fov:40,projection:[NaN]}},
  referenceCorners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}],result:null});

test('cached detection retains whether unsupported ground was included',async()=>{
 for(const flag of [true,false]) {
  const saved=await makeResultAsset(result,['pavement'],asset.meta.sha256,flag);
  const loaded=await readResultAsset(saved,asset.meta.sha256);
  assert.equal(loaded.includeOutsideGroundSupport,flag);
  assert.deepEqual(loaded.payload,result);
 }
});

test('project retains edited regions, multiple intentional holes, origins, curbs, rotation and prices',()=>{
  const doc=validateProjectDocument(base());
  assert.deepEqual(doc.state,state);assert.equal(doc.state.areaRegions[0].holes.length,2);
  assert.equal(doc.state.areaRegions[0].curbs.holes[0],true);
  assert.equal(estimate(doc.state).total,estimate(state).total);
  assert.deepEqual(validateProjectDocument(JSON.parse(JSON.stringify(doc))),doc);
});
test('compact account snapshot keeps root geometry and validated calibration, not photo/mask bytes',()=>{
  const saved=projectSavedState(base());assert.equal(saved.shape,'regions');assert.equal(saved.areaRegions[0].holes.length,2);
  assert.ok(!JSON.stringify(saved).includes('base64'));assert.ok(!JSON.stringify(saved).includes('projection'));
  assert.deepEqual(projectFromSavedState(saved),validateProjectDocument(base()));
});
test('ordinary shares contain current geometry/holes but no photo reference, calibration, raw data or map location',()=>{
  const shared=geometryShareState({...projectSavedState(base()),houseLocation:{lat:45,lon:25,label:'Private home'}});
  assert.deepEqual(shared.areaRegions,state.areaRegions);assert.equal(shared.houseLocation,null);
  for(const key of ['photoProject','photo','result','view','calibration','assets'])assert.equal(shared[key],undefined);
});
test('free-camera pose survives metadata while a stored projection matrix is deliberately ignored',()=>{
  const doc=base();doc.view.photoMode=false;const parsed=validateProjectDocument(doc);
  assert.equal(parsed.view.photoMode,false);assert.deepEqual(parsed.view.pose.position,[0,3,5]);assert.equal(parsed.view.pose.projection,undefined);
});
test('manual calibration and unfinished initial calibration can be saved separately',()=>{
  const doc=base();doc.view.calibration={type:'reference_square',corners:doc.referenceCorners,shift:{x:2,z:-1}};
  assert.equal(validateProjectDocument(doc).view.calibration.type,'reference_square');
  doc.view.calibration=null;const result=validateProjectDocument(doc);assert.equal(result.stage,'calibrate');assert.equal(result.view.photoSetup,true);
});
test('geometry-only legacy snapshots and intentionally empty paving do not acquire a photo/default rectangle',()=>{
  const empty=normalize({shape:'regions',areaRegions:[],areaOrigin:{x:0,z:0}});
  const parsed=prepareProjectState({format:PROJECT_FORMAT,version:1,state:empty});
  assert.deepEqual(parsed.parts,[]);assert.equal(parsed.document.photo,null);assert.equal(parsed.document.stage,'done');
  assert.equal(parsed.document.state.shape,'regions');
});
for(const [label, mutate] of [
 ['future version',d=>d.version=99],['wrong kind',d=>d.format='other'],
 ['corrupt custom shape',d=>{d.state.shape='custom';d.state.areaPoints=[{x:0,z:0},{x:0,z:0}];}],
 ['self-intersecting hole',d=>d.state.areaRegions[0].holes[0]=[{x:1,z:1},{x:2,z:2},{x:1,z:2},{x:2,z:1}]],
 ['non-finite point',d=>d.state.areaRegions[0].outer[0].x=Infinity],
 ['invalid metric height',d=>d.view.calibration.value={...camera,h:0}],
 ['inconsistent model frame',d=>d.view.calibration.value={...camera,n:[0,0,0]}],
 ['foreign photo aspect',d=>d.photo={...asset.meta,width:300}],
 ['camera without photograph',d=>d.photo=null],
 ['unknown calibration',d=>d.view.calibration.type='magic'],
 ['broken quaternion',d=>d.view.pose.quaternion=[0,0,0,0]],
 ['invalid camera position',d=>d.view.pose.position=[Infinity,0,0]],
 ['crossed reference',d=>d.referenceCorners=[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}]],
 ['oversized metadata',d=>d.unused='x'.repeat(PROJECT_LIMITS.documentBytes)],
 ['photo URL in place of an asset',d=>d.photo={url:'https://private.invalid/'}],
]) test(`invalid saved project is rejected before replacing a design: ${label}`,()=>{
 const doc=base();mutate(doc);assert.throws(()=>prepareProjectState(doc));
});
test('file names are inert and contain no relative path components',()=>{
 assert.equal(projectFileName('../../<img src=x>'),'_..__img src_x_.paving.json');
 assert.ok(projectFileName('Pavaj curte').endsWith('.paving.json'));
});
test('portable project roundtrip includes photo and CURRENT intentional holes, not original mask geometry',async()=>{
 const doc=validateProjectDocument(base()),blob=await encodeProjectFile(doc,{photo:asset});
 const decoded=await decodeProjectFile(blob,decode);
 assert.deepEqual(decoded.document,doc);assert.equal(decoded.assets.photo.meta.sha256,asset.meta.sha256);
 assert.deepEqual(decoded.document.state.areaRegions,state.areaRegions);
});
test('optional original result is a separate asset and never substitutes client edits on read',async()=>{
 const r=await makeResultAsset(result,['grass','dirt'],asset.meta.sha256),doc={...base(),result:r.meta};
 const file=await encodeProjectFile(doc,{photo:asset,result:r},{includeResult:true});
 const reopened=await decodeProjectFile(file,decode),original=await readResultAsset(reopened.assets.result,asset.meta.sha256);
 assert.deepEqual(original.payload,result);assert.deepEqual(reopened.document.state.areaRegions,state.areaRegions);
 assert.equal(reopened.document.state.areaRegions[0].holes.length,2);
 const without=await decodeProjectFile(await encodeProjectFile(doc,{photo:asset,result:r}),decode);
 assert.equal(without.document.result,null);assert.equal(without.assets.result,null);
});
test('corrupt bytes and an unrelated reattachment are rejected by hash',async()=>{
 const parsed=JSON.parse(await (await encodeProjectFile(base(),{photo:asset})).text());
 parsed.assets.photo.data=parsed.assets.photo.data.slice(0,-4)+'AAAA';
 await assert.rejects(()=>decodeProjectFile(new Blob([JSON.stringify(parsed)]),decode),/corrupt|invalid|incomplete/);
 await assert.rejects(()=>makePhotoAsset(raw,{...asset.meta,sha256:'a'.repeat(64)},decode),/exact photograph/);
});
test('an archive cannot fetch an external photo or a diagnostic URL',async()=>{
 const doc=base();const malicious={format:'360-tiles-project-file',version:1,document:doc,assets:{photo:{url:'https://example.invalid/secret'}}};
 await assert.rejects(()=>decodeProjectFile(new Blob([JSON.stringify(malicious)]),decode),/External URLs/);
});
test('photo dimensions and magic bytes are validated before decoding',async()=>{
 await assert.rejects(()=>makePhotoAsset(new Blob(['<svg><script>evil</script></svg>']),null,decode),/not a supported/);
 const bytes=new Uint8Array(await raw.arrayBuffer());new DataView(bytes.buffer).setUint32(16,200000);
 let called=false;await assert.rejects(()=>makePhotoAsset(new Blob([bytes]),null,async()=>{called=true;return{width:200,height:160};}),/megapixels/);
 assert.equal(called,false);assert.equal(inspectPhotoHeader(await raw.arrayBuffer()).type,'image/png');
});
test('missing photo is not silently omitted from a full project download',async()=>{
 await assert.rejects(()=>encodeProjectFile(base()),/unavailable/);
});
