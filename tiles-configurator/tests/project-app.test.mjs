// Actual app opening/rollback functions with a mock renderer/DOM. Real schema,
// mask adapter, paving geometry and quantities; not a live WebGL test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {prepareProjectState,validateProjectDocument} from '../js/pavingProject.js';
import {prepareModelImport} from '../js/segmentationAdapter.js';
import {normalize,layout,estimate,areaGeometry} from '../js/model.js';
import {asRegionState} from '../js/pavingEditor.js';
import {PavingHistory} from '../js/pavingHistory.js';
import {fixture} from './fixtures/model-results.mjs';
const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const opening=app.slice(app.indexOf('function detachProjectPhoto()'),app.indexOf('function change(patch'));
const commit=app.slice(app.indexOf('function commitPavingState('),app.indexOf('function finishAreaDrawing()'));
const rect=(x,z,l,w)=>[{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
const photo={sha256:'a'.repeat(64),size:123,type:'image/png',width:200,height:160};
function harness(){
 const result=fixture({width:200,height:160}),suggestion=prepareModelImport(result);
 let view={calibration:null,photoMode:false,pose:null},backdrop='blob:previous',cancelled=0;
 const state=normalize({length:2,width:2});let renders=0;
 const c=vm.createContext({JSON,console,structuredClone,crypto:webcrypto,normalize,layout,estimate,areaGeometry,asRegionState,
  prepareProjectState,prepareModelImport,SEGMENTATION_CONFIG:{tolerancePx:1},state,
  photoLoadSequence:2,designRevision:3,photoSource:{photoId:'old',width:200,height:160},photoSourceUrl:backdrop,photoObjectUrl:backdrop,
  photoFlowStep:'done',calibrationCorners:[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}],photoRectCache:null,
  modelImportSummary:null,lastModelImport:null,manualCalibrationSnapshot:null,drawingArea:false,draftAreaPoints:[],activeBoundaryKey:'',activeVertex:0,
  URL:{createObjectURL:()=> 'blob:new',revokeObjectURL(){}},document:{body:{classList:{toggle(){},remove(){}}}},$:()=>({hidden:false}),
  analysisController:{cancel(){cancelled++;}},projectSession:{detached(){},markChanged(){},rememberDetection(){}},shell:{markDirty(){}},
  render(){renders++;if(c.failRender){c.failRender=false;throw new Error('render failed');}},renderAreaEditor(){},renderPhotoFlow(){},
  geometryError:e=>e.message,showAreaError(){},
  viewer:{capturePhotoState:()=>structuredClone(view),restorePhotoState:(v,options)=>{assert.equal(options.force,true);view=structuredClone(v);},
   loadSitePhoto:async(url,{isCurrent})=>{if(c.beforeLoad)await c.beforeLoad();if(!isCurrent())throw new Error('stale image');backdrop=url;},
   clearSitePhoto:()=>{backdrop=null;view={calibration:null,photoMode:false};},fitProject(){view.photoMode=false;},
   getPhotoRect:()=>({width:200,height:160}),preserveCamera(){},stopAreaDrawing(){}},
 });
 c.history=new PavingHistory({capture:()=>structuredClone(c.state),restore:s=>{c.state=s;}});
 vm.runInContext(commit+'\n'+opening,c);
 const doc=validateProjectDocument({format:'360-tiles-project',version:1,photo,
  state:normalize({shape:'regions',areaOrigin:{x:0,z:0},areaRegions:[{outer:rect(0,0,4,4),holes:[rect(.5,.5,1,1),rect(2,2,1,1)]}],rotation:37}),
  view:{calibration:{type:'metric_model',value:suggestion.camera,origin:{x:0,z:0}},photoMode:true,pose:null}});
 c.bundle={...prepareProjectState(doc),assets:{photo:{meta:photo,blob:{}},result:null},detection:{payload:result,targets:['grass','dirt']}};
 c.getView=()=>view;c.backdrop=()=>backdrop;c.cancelled=()=>cancelled;c.renders=()=>renders;
 return c;
}
test('project opening restores saved client holes, not original mask topology',async()=>{
 const c=harness();await c.applyStoredProject(c.bundle,()=>true);
 assert.equal(c.state.areaRegions.length,1);assert.equal(c.state.areaRegions[0].holes.length,2);
 assert.equal(c.lastModelImport.value.regions.length,1);assert.equal(c.backdrop(),'blob:new');
 assert.equal(c.getView().photoMode,true);assert.ok(c.modelImportSummary);assert.equal(c.history.stack.length,0);
});

test('opening a saved design preserves a manually added region smaller than the detection minimum',async()=>{
 const c=harness(),doc=structuredClone(c.bundle.document);
 doc.state=normalize({...doc.state,areaRegions:[...doc.state.areaRegions,{outer:rect(8,8,.2,.2),holes:[]}]});
 c.bundle={...c.bundle,...prepareProjectState(doc)};
 await c.applyStoredProject(c.bundle,()=>true);
 assert.equal(c.state.areaRegions.length,2);
 assert.ok(Math.abs(estimate(c.state).area-(14+.04))<1e-8);
 assert.equal(c.state.areaRegions[0].holes.length,2);
});
test('cached detection with a different camera is historical, never called the active calibration',async()=>{
 const c=harness();const edited=structuredClone(c.bundle.document);edited.view.calibration.value.imageId='older-source-id';
 c.bundle={...c.bundle,...prepareProjectState(edited)};
 await c.applyStoredProject(c.bundle,()=>true);assert.ok(c.lastModelImport);assert.equal(c.modelImportSummary,null);
});
test('missing photo opens current geometry in free view rather than inheriting previous photo',async()=>{
 const c=harness();c.bundle.assets.photo=null;
 await c.applyStoredProject(c.bundle,()=>true);assert.equal(c.photoSource,null);assert.equal(c.backdrop(),null);
 assert.equal(c.state.areaRegions[0].holes.length,2);assert.equal(c.getView().photoMode,false);assert.equal(c.photoFlowStep,'done');
});
test('stale asynchronous image load cannot overwrite later edits or photo',async()=>{
 const c=harness(),before=structuredClone(c.state);let current=true;c.beforeLoad=async()=>{current=false;};
 await assert.rejects(()=>c.applyStoredProject(c.bundle,()=>current),/stale/);
 assert.equal(c.backdrop(),'blob:previous');assert.deepEqual(c.state,before);assert.equal(c.cancelled(),0);
});
test('render failure restores previous image, design and history as a transaction',async()=>{
 const c=harness();const before=structuredClone(c.state);c.history.future.push({sentinel:true});c.failRender=true;
 await assert.rejects(()=>c.applyStoredProject(c.bundle,()=>true),/render failed/);
 assert.deepEqual(c.state,before);assert.equal(c.backdrop(),'blob:previous');assert.equal(c.history.future[0].sentinel,true);
 assert.equal(c.getView().photoMode,false);
});
test('legacy geometry share explicitly clears unrelated photograph',()=>{
 const c=harness();assert.equal(c.restore(normalize({length:3,width:2})),true);
 assert.equal(c.backdrop(),null);assert.equal(c.photoFlowStep,'done');assert.equal(c.state.length,3);
});
test('account wrapper delegates to asynchronous asset restoration after viewer is ready',()=>{
 const c=harness();let called=false;c.projectSession.restoreSaved=s=>{called=true;return Promise.resolve(true)};
 assert.ok(c.restore({version:2,photoProject:{}}) instanceof Promise);assert.equal(called,true);
 c.viewer=null;assert.equal(c.restore({version:2,photoProject:{}}),false);
});
test('opening has no model execution or upload source fetch path',()=>{
 assert.doesNotMatch(opening,/analysisController\.(run|restore)\s*\(/);
 assert.doesNotMatch(opening,/loadPhotoSource\s*\(/);
 assert.match(app,/captureState:\s*api\.captureSavedState/);
 assert.match(app,/geometryShareState\(state\)/);
});
