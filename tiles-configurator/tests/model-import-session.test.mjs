// Executes the actual app transaction functions with a simulated view/DOM. This
// is not a WebGL or live-site test. Geometry/layout/pricing are the real modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fixture} from './fixtures/model-results.mjs';
import {prepareModelImport} from '../js/segmentationAdapter.js';
import {failImport} from '../js/modelCamera.js';
import {normalize,layout,estimate,areaGeometry} from '../js/model.js';
import {asRegionState,clearPaving,applyPavingPatch} from '../js/pavingEditor.js';
import {PavingHistory} from '../js/pavingHistory.js';
const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const transaction=app.slice(app.indexOf('function captureHistorySnapshot()'),app.indexOf('function finishAreaDrawing()'));
const rect=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
function harness({empty=false}={}) {
 const state=normalize({shape:'regions',areaOrigin:{x:0,z:0},areaRegions:empty?[]:[{outer:rect(0,0,4,4),holes:[rect(1,1,1,1)],curbs:{outer:false}}]});
 let view={calibration:{type:'reference_square',corners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}]},photoMode:true,photoSetup:empty},renders=0;
 const c=vm.createContext({structuredClone,JSON,normalize,layout,estimate,areaGeometry,asRegionState,prepareModelImport,failImport,
  state,photoSource:{photoId:'synthetic-metric-test',width:160,height:120},designRevision:7,modelImportSummary:null,lastModelImport:null,
  photoFlowStep:empty?'calibrate':'done',drawingArea:false,draftAreaPoints:[],activeBoundaryKey:'',activeVertex:0,
  document:{body:{classList:{toggle(){}}}},$:()=>({hidden:false}),shell:{markDirty(){}},
  viewer:{capturePhotoState:()=>structuredClone(view),restorePhotoState:s=>{view=structuredClone(s);},
   applyModelCalibration(camera,origin){view={calibration:{type:'metric_model',camera:structuredClone(camera),origin},photoMode:true,photoSetup:true};},
   stopAreaDrawing(){},preserveCamera(){}},
  render(){renders++; if(c.failRender){c.failRender=false;throw new Error('simulated renderer failure');}},
  completePhotoFlow(){c.photoFlowStep='done';view.photoSetup=false;},
 });
 vm.runInContext(transaction,c);
 c.history=new PavingHistory({capture:()=>c.captureHistorySnapshot(),restore:s=>c.restoreHistorySnapshot(s)});
 c.getView=()=>structuredClone(view);c.renders=()=>renders;
 c.token=()=>({photoId:c.photoSource.photoId,designRevision:c.designRevision,replaceExisting:true});
 return c;
}
for(const [label,options,mutate] of [
 ['missing token',()=>({}),()=>{}],['wrong photo',c=>({...c.token(),photoId:'stale'}),()=>{}],
 ['old design revision',c=>({...c.token(),designRevision:0}),()=>{}],['no replacement consent',c=>({...c.token(),replaceExisting:false}),()=>{}],
 ['wrong response image',c=>c.token(),b=>{b.geometry.image_id=b.segmentation.image_id='another-photo';}],
 ['invalid camera',c=>c.token(),b=>{b.geometry.camera.height_m=0;}],
 ['invalid mask',c=>c.token(),b=>{b.segmentation.labels.counts=[1];}]])
 test(`rejected import leaves design, holes, camera and history untouched: ${label}`,()=>{
  const c=harness(),before=JSON.stringify(c.captureHistorySnapshot()),b=fixture();mutate(b);
  assert.throws(()=>c.importModelResult(b,options(c)));
  assert.equal(JSON.stringify(c.captureHistorySnapshot()),before);assert.equal(c.history.stack.length,0);assert.equal(c.renders(),0);
 });
test('camera and imported shape undo/redo as ONE transaction; existing intentional holes return',()=>{
 const c=harness(),before=c.captureHistorySnapshot();c.importModelResult(fixture(),c.token());
 assert.equal(c.history.stack.length,1);assert.equal(c.getView().calibration.type,'metric_model');assert.equal(c.state.areaRegions.length,2);
 assert.ok(c.history.undo());assert.deepEqual(c.state,before.state);assert.deepEqual(c.getView(),before.photoView);assert.equal(c.modelImportSummary,null);
 assert.ok(c.history.redo());assert.equal(c.getView().calibration.type,'metric_model');assert.equal(c.state.areaRegions.length,2);assert.equal(c.modelImportSummary.diagnostics.holes,1);
 assert.ok(!JSON.stringify(c.history.stack).includes('groundSupport')); // No large masks in undo.
});
test('first import bypasses manual calibration; undo returns to the original calibration step',()=>{
 const c=harness({empty:true}),token=c.token();token.replaceExisting=false;c.importModelResult(fixture(),token);
 assert.equal(c.photoFlowStep,'done');assert.equal(c.getView().photoSetup,false);
 c.history.undo();assert.equal(c.photoFlowStep,'calibrate');assert.equal(c.state.areaRegions.length,0);assert.equal(c.getView().photoSetup,true);
});
test('render failure rolls back the camera and geometry and retains redo history',()=>{
 const c=harness();c.history.future.push({sentinel:true});const before=c.captureHistorySnapshot();c.failRender=true;
 assert.throws(()=>c.importModelResult(fixture(),c.token()),/simulated renderer failure/);
 assert.deepEqual(c.state,before.state);assert.deepEqual(c.getView(),before.photoView);assert.equal(c.history.stack.length,0);assert.equal(c.history.future[0].sentinel,true);
});
test('manual holes and clear-from-scratch preserve the imported calibration',()=>{
 const c=harness();c.importModelResult(fixture(),c.token());const camera=c.getView(),old=structuredClone(c.state);
 c.commitPavingState(clearPaving(c.state),{});assert.equal(c.state.areaRegions.length,0);assert.deepEqual(c.getView(),camera);
 c.history.undo();assert.deepEqual(c.state,old);assert.deepEqual(c.getView(),camera);
});
test('local export association must be explicit',()=>{
 const c=harness(),b=fixture({imageId:'prototype-export-other-session'});
 assert.throws(()=>c.importModelResult(b,c.token()),e=>e.code==='imageMismatch');
 c.importModelResult(b,{...c.token(),associateWithCurrentPhoto:true});assert.equal(c.state.areaRegions.length,2);
});
test('unfinished outlines are not discarded by import',()=>{
 const c=harness();c.drawingArea=true;c.draftAreaPoints=rect(0,0,2,2);const before=JSON.stringify(c.draftAreaPoints);
 assert.throws(()=>c.importModelResult(fixture(),c.token()),e=>e.code==='unfinishedDrawing');
 assert.equal(JSON.stringify(c.draftAreaPoints),before);
});
test('history from a different photo session cannot be applied',()=>{
 const c=harness();const snapshot=c.captureHistorySnapshot();c.photoSource.photoId='new-photo';assert.equal(c.restoreHistorySnapshot(snapshot),false);
});
