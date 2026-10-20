// Actual app.js upload/calibration functions with a simulated viewer and DOM.
// The network controller and polygon geometry are exercised in separate tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { normalize, layout, estimate, areaGeometry } from '../js/model.js';
import { asRegionState } from '../js/pavingEditor.js';
import { PavingHistory } from '../js/pavingHistory.js';
import { reprojectRegions } from '../js/referenceReprojection.js';
const source=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const transactions=source.slice(source.indexOf('function captureHistorySnapshot()'),source.indexOf('function finishAreaDrawing()'));
const flows=source.slice(source.indexOf('async function loadPhotoSource('),source.indexOf('function wirePhotoFlow()'));
const rect=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
function harness({enabled=true}={}) {
 const before=normalize({shape:'regions',areaOrigin:{x:0,z:0},areaRegions:[{outer:rect(0,0,4,4),holes:[rect(1,1,1,1)]}]});
 let view={calibration:{type:'metric_model'},photoMode:true,photoSetup:false};
 const elements=new Map();const $=k=>{if(!elements.has(k))elements.set(k,{hidden:false});return elements.get(k);};
 const calls={cancel:[],run:0,errors:[],revoke:[]};
 const c=vm.createContext({structuredClone,JSON,normalize,layout,estimate,areaGeometry,asRegionState,
   state:before,photoSource:{photoId:'photo-old',width:160,height:120},photoSourceUrl:'blob:old',photoObjectUrl:'blob:old',
   designRevision:1,photoLoadSequence:0,photoFlowStep:'done',modelImportSummary:null,lastModelImport:null,manualCalibrationSnapshot:null,
   drawingArea:false,draftAreaPoints:[],activeBoundaryKey:'',activeVertex:0,calibrationCorners:[],photoRectCache:null,
   crypto:{randomUUID:()=>`photo-new-${calls.run}`},URL:{revokeObjectURL:u=>calls.revoke.push(u)},
   SEGMENTATION_CONFIG:{enabled},modelImportUI:{update(){}},analysisController:{cancel:o=>calls.cancel.push(o),run:async()=>{calls.run++;}},
   $,$calls:calls,shell:{markDirty(){}},document:{body:{classList:{toggle(){},add(){},remove(){}}}},
   resetCalibrationCorners(){},showPhotoFlowError:m=>calls.errors.push(m),renderPhotoFlow(){},renderPhotoViewControls(){},
   photoText:()=>({photoFailed:'photo failed',photoOnly:'image only',calibrationInvalid:'invalid square'}),
   render(){},startAreaDrawing(){c.drawingArea=true;},stopAreaDrawing(){c.drawingArea=false;},
   viewer:{loadSitePhoto:async()=>({width:160,height:120}),getPhotoRect:()=>({width:160,height:120}),
     capturePhotoState:()=>structuredClone(view),restorePhotoState:s=>{view=structuredClone(s);},
     hasPhotoCalibration:()=>!!view.calibration,
     beginReferenceCalibration(){view.photoSetup=true;},applyPhotoCalibration(){view.calibration={type:'reference_square'};return true;},
     prepareReferenceRecalibration(regions){return {regions:reprojectRegions(regions,p=>p,p=>({x:p.x*1.1,z:p.z*1.1})),origin:{x:0,z:0},photoView:{...view,calibration:{type:'reference_square'}}};},
     stopAreaDrawing(){},preserveCamera(){},completePhotoSetup(){view.photoSetup=false;},
   },
 });
 vm.runInContext(transactions+'\n'+flows,c);
 c.history=new PavingHistory({capture:()=>c.captureHistorySnapshot(),restore:s=>c.restoreHistorySnapshot(s)});
 c.view=()=>structuredClone(view);return c;
}
test('successful upload starts analysis, clears the previous image-specific state and keeps tile settings',async()=>{
 const c=harness();const tile=c.state.tile;assert.ok(await c.loadPhotoSource('blob:new',{objectUrl:true}));
 assert.equal(c.$calls.run,1);assert.equal(c.photoFlowStep,'analyze');assert.equal(c.state.areaRegions.length,0);
 assert.equal(c.state.tile,tile);assert.equal(c.photoSourceUrl,'blob:new');assert.deepEqual(c.$calls.revoke,['blob:old']);
});
test('manual-only deployment does not call the service after upload',async()=>{
 const c=harness({enabled:false});await c.loadPhotoSource('blob:new');assert.equal(c.$calls.run,0);assert.equal(c.photoFlowStep,'calibrate');
});
test('failed replacement photo does not erase previous pavement, photo or holes',async()=>{
 const c=harness();const before=structuredClone(c.state);c.viewer.loadSitePhoto=async()=>{throw new Error('decode failed');};
 assert.equal(await c.loadPhotoSource('blob:bad',{objectUrl:true}),false);
 assert.deepEqual(c.state,before);assert.equal(c.photoSource.photoId,'photo-old');assert.equal(c.photoSourceUrl,'blob:old');assert.equal(c.$calls.run,0);
});
test('manual reference correction keeps holes and is one camera+geometry undo step',()=>{
 const c=harness(),before=c.captureHistorySnapshot();c.beginManualCalibration();
 assert.equal(c.photoFlowStep,'calibrate');assert.ok(c.manualCalibrationSnapshot);
 assert.ok(c.beginPhotoAreaDrawing());assert.equal(c.photoFlowStep,'done');assert.equal(c.view().calibration.type,'reference_square');
 assert.equal(c.state.areaRegions[0].holes.length,1);assert.equal(c.history.stack.length,1);
 c.history.undo();assert.deepEqual(c.state,before.state);assert.deepEqual(c.view(),before.photoView);assert.equal(c.photoFlowStep,'done');
 c.history.redo();assert.equal(c.view().calibration.type,'reference_square');assert.equal(c.state.areaRegions[0].holes.length,1);
});
test('cancel manual calibration restores the prior design and camera without a history entry',()=>{
 const c=harness(),before=c.captureHistorySnapshot();c.beginManualCalibration();c.cancelManualCalibration();
 assert.deepEqual(c.state,before.state);assert.deepEqual(c.view(),before.photoView);assert.equal(c.history.stack.length,0);
});
test('invalid recalibration cannot drop a hole or change camera/history',()=>{
 const c=harness(),before=c.captureHistorySnapshot();c.beginManualCalibration();
 c.viewer.prepareReferenceRecalibration=()=>{throw new Error('bad projection');};
 assert.equal(c.beginPhotoAreaDrawing(),false);assert.deepEqual(c.state,before.state);
 assert.equal(c.view().calibration.type,'metric_model');assert.equal(c.history.stack.length,0);assert.equal(c.photoFlowStep,'calibrate');
});
test('an undo snapshot during automatic analysis returns to calibration, not a dead spinner',()=>{
 const c=harness();c.photoFlowStep='analyze';assert.equal(c.captureHistorySnapshot().photoFlowStep,'calibrate');
});
