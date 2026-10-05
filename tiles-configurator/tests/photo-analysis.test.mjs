import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoAnalysis, importableBundle, abortableDelay } from '../js/photoAnalysis.js';
import { workingImageSize } from '../js/photoPreparation.js';
import { resolveAnalysisBase } from '../js/segmentationConfig.js';
import { fixture } from './fixtures/model-results.mjs';
import { prepareModelImport } from '../js/segmentationAdapter.js';

const respond=(data,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(opts={}) {
  const env={photo:{photoId:'synthetic-metric-test',width:160,height:120,designRevision:1,drawing:false,draftVertices:0},
    existing:opts.existing||[], requests:[],events:[],imports:[],polls:0,now:0};
  const raw=fixture();
  const payload={image_id:env.photo.photoId,image:raw.geometry.image,...raw,errors:{},timing_s:{segmentation:1,camera:2}};
  opts.payload?.(payload);
  let job;
  const baseFetch=async(url,options={})=>{
    const path=url.replace('http://analysis/api/paving','');
    env.requests.push({path,options});
    if(path.startsWith('/requests/'))return respond({cancelled:true});
    if(path==='/health')return respond({service:'paving-analysis',job_api_version:1,models_loaded:{}});
    if(path==='/jobs') {
      job={job_id:'a'.repeat(32),image_id:options.body.get('image_id'),generation:Number(options.body.get('generation')),
        image:{width:160,height:120},state:'queued',stage:'queued'};
      await opts.onUpload?.(env);return respond(job);
    }
    if(path.endsWith('/result')){await opts.onResult?.(env);return respond(payload);}
    env.polls++;await opts.onPoll?.(env);
    return respond({...job,state:env.polls>1?'completed':'running',stage:'camera'});
  };
  const ctl=createPhotoAnalysis({apiBase:'http://analysis/api/paving',clientId:'test-client',
    config:{pollIntervalMs:1,requestTimeoutMs:1000,analysisTimeoutMs:10000,...opts.config},
    getPhoto:()=>env.photo?{...env.photo}:null,getSource:()=> 'blob:photo',getPavingState:()=>({areaRegions:env.existing}),
    preparePhoto:async(source,token,signal)=>{await opts.onPrepare?.(env,signal);return {blob:new Blob(['pixels']),width:160,height:120};},
    fetchImpl:opts.fetch? (url,options)=>opts.fetch(url,options,baseFetch,env):baseFetch,
    delay:async()=>{env.now+=10;await opts.onDelay?.(env);},now:()=>env.now,
    importResult:(bundle,token)=>{
      const value=prepareModelImport(bundle,token);env.imports.push({bundle,token,value});env.photo.designRevision++;
      return {diagnostics:value.diagnostics};
    },onStatus:s=>env.events.push(s),
  });
  return {ctl,env,payload};
}

test('upload -> job -> both model outputs -> real hole-capable adapter',async()=>{
  const {ctl,env}=setup();const done=await ctl.run();assert.equal(done.applied,true);
  assert.deepEqual(env.events.filter(x=>x.busy).map(x=>x.phase),['preparing','connecting','uploading','queued','camera','applying']);
  assert.equal(ctl.getStatus().phase,'ready');assert.equal(env.imports.length,1);
  assert.equal(env.imports[0].token.designRevision,1);assert.equal(env.imports[0].value.diagnostics.holes,1);
  assert.equal(env.imports[0].value.regions.length,2);
  const upload=env.requests.find(x=>x.path==='/jobs');assert.equal(upload.options.body.get('image_id'),env.photo.photoId);
  assert.equal(upload.options.body.get('client_id'),'test-client');
});
test('existing intentional holes require explicit replacement before any requests',async()=>{
  const {ctl,env}=setup({existing:[{holes:[[]]}]});await assert.rejects(ctl.run(),e=>e.code==='replaceRequired');
  assert.equal(env.requests.length,0);assert.equal(env.imports.length,0);
  assert.equal((await ctl.run({replaceExisting:true})).applied,true);
});
test('a started empty drawing also prevents automatic replacement',async()=>{
  const {ctl,env}=setup();env.photo.drawing=true;await assert.rejects(ctl.run(),e=>e.code==='unfinishedDrawing');
});
test('edits made while inference runs are kept; applying later is explicit',async()=>{
  const {ctl,env}=setup({onResult:e=>e.photo.designRevision++});
  const result=await ctl.run();assert.equal(result.reason,'edited');assert.equal(env.imports.length,0);
  assert.equal(ctl.getStatus().phase,'review');assert.equal(ctl.getStatus().canRestore,true);
  ctl.restore({replaceExisting:true});assert.equal(env.imports.length,1);
  assert.equal(env.imports[0].token.designRevision,2);
});
test('camera-only result imports zero selection, never all geometric ground',async()=>{
  const {ctl,env}=setup({payload:p=>{p.segmentation=null;p.errors.segmentation={code:'model_unavailable'};}});
  const result=await ctl.run();assert.equal(result.applied,true);assert.equal(ctl.getStatus().phase,'camera_only');
  assert.equal(env.imports[0].value.regions.length,0);assert.ok(env.imports[0].value.camera);
});
test('camera failure keeps existing design; no invented camera gets imported',async()=>{
  const {ctl,env}=setup({existing:[{holes:[[]]}],payload:p=>{p.geometry=null;p.errors.camera={code:'invalid_geometry'};}});
  const result=await ctl.run({replaceExisting:true});assert.equal(result.reason,'camera');
  assert.equal(ctl.getStatus().phase,'manual_required');assert.equal(env.imports.length,0);assert.equal(env.existing.length,1);
});
test('both model failures remain manual, without fake success',async()=>{
  const {ctl,env}=setup({payload:p=>{p.segmentation=null;p.geometry=null;}});
  await ctl.run();assert.equal(ctl.getStatus().phase,'manual_required');assert.equal(env.imports.length,0);
});
test('a different response photo is rejected before contour conversion',async()=>{
  const {ctl,env}=setup({payload:p=>p.geometry.image_id='other-photo'});
  await ctl.run();assert.equal(ctl.getStatus().errorCode,'imageMismatch');assert.equal(env.imports.length,0);
});
test('mismatched generation/job rejected',async()=>{
  const {ctl,env}=setup({fetch:async(u,o,base)=>{
    const r=await base(u,o);if(u.endsWith('/jobs')){const j=JSON.parse(await r.text());j.generation++;return respond(j);}return r;
  }});await ctl.run();assert.equal(ctl.getStatus().errorCode,'imageMismatch');assert.equal(env.imports.length,0);
});
test('old response cannot replace a newly loaded photograph or its status',async()=>{
  const gate=defer(),entered=defer();
  const {ctl,env}=setup({onResult:async()=>{entered.resolve();await gate.promise;}});
  const running=ctl.run();await entered.promise;ctl.cancel({clearResult:true});env.photo.photoId='new-photo';gate.resolve();
  assert.equal((await running).reason,'cancelled');assert.equal(env.imports.length,0);assert.equal(ctl.getStatus().phase,'idle');
  assert.equal(ctl.getResult(),null);
});
test('cancellation during upload creates server tombstone even without a job id',async()=>{
  const gate=defer(),entered=defer();
  const {ctl,env}=setup({onUpload:async()=>{entered.resolve();await gate.promise;}});
  const running=ctl.run();await entered.promise;ctl.cancel();gate.resolve();await running;
  assert.ok(env.requests.some(r=>r.path==='/requests/1'&&r.options.method==='DELETE'));
  assert.equal(env.imports.length,0);assert.equal(ctl.getStatus().busy,false);
});
test('silent cancellation updates internal status for next UI render',async()=>{
  const gate=defer(),entered=defer();const {ctl}=setup({onUpload:async()=>{entered.resolve();await gate.promise;}});
  const running=ctl.run();await entered.promise;ctl.cancel({notify:false});gate.resolve();await running;
  assert.equal(ctl.getStatus().busy,false);
});
test('late failure from cancelled photo cannot replace current status',async()=>{
  const gate=defer(),entered=defer();const {ctl,env}=setup({fetch:async(u,o,base)=>{
    if(u.endsWith('/health')){entered.resolve();await gate.promise;throw new TypeError('old failure');}return base(u,o);
  }});const running=ctl.run();await entered.promise;ctl.cancel({clearResult:true});env.photo.photoId='next';gate.resolve();await running;
  assert.equal(ctl.getStatus().phase,'idle');assert.equal(ctl.getStatus().error,null);
});
test('request timeout is finite and leaves manual editing available',async()=>{
  const {ctl}=setup({config:{requestTimeoutMs:5},fetch:async(u,o,base)=>{
    if(!u.endsWith('/health'))return base(u,o);
    return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
  }});await ctl.run();assert.equal(ctl.getStatus().phase,'error');assert.equal(ctl.getStatus().errorCode,'requestTimeout');
});
test('overall analysis limit cancels the remote generation',async()=>{
  const {ctl,env}=setup({config:{analysisTimeoutMs:15}});await ctl.run();assert.equal(ctl.getStatus().errorCode,'analysisTimeout');
  assert.ok(env.requests.some(r=>r.path==='/requests/1'));
});
for(const [label,response,code] of [
 ['missing service HTML',{ok:true,status:200,text:async()=>'<html>website</html>'},'serviceUnavailable'],
 ['old service',respond({service:'paving-analysis',api_version:2}),'serviceVersion'],
 ['queue full',respond({detail:'Queue full'},429),'queueFull'],
 ['service down',respond({detail:'Not available'},503),'serviceError'],
])test(label,async()=>{
 const {ctl,env}=setup({fetch:async(u,o,base)=>u.endsWith('/health')?response:base(u,o)});
 await ctl.run();assert.equal(ctl.getStatus().phase,'error');assert.equal(ctl.getStatus().errorCode,code);assert.equal(env.imports.length,0);
});
test('restoring detected area does not rerun or upload to models',async()=>{
 const {ctl,env}=setup();await ctl.run();const count=env.requests.length;
 ctl.restore({replaceExisting:true,targets:['pavement']});assert.equal(env.requests.length,count);
 assert.equal(env.imports.length,2);assert.equal(env.imports[1].value.regions.length,0);
});
test('retained results are copies and never leak to a different photo',async()=>{
 const {ctl,env}=setup();await ctl.run();const a=ctl.getResult();a.geometry.image_id='changed';
 assert.equal(ctl.getResult().geometry.image_id,env.photo.photoId);env.photo.photoId='different';assert.equal(ctl.getResult(),null);
 assert.throws(()=>ctl.restore(),e=>e.code==='noResult');
});
test('working photo sizes preserve orientation and aspect ratio',()=>{
 assert.deepEqual(workingImageSize(4000,3000),{width:1100,height:825});
 assert.deepEqual(workingImageSize(3000,4000),{width:825,height:1100});
 assert.deepEqual(workingImageSize(160,120),{width:160,height:120});
 assert.throws(()=>workingImageSize(4000,60),/panoramic/);
 assert.throws(()=>workingImageSize(20,100),/32/);
});
test('endpoint defaults do not send hosted photographs to a random off-site service',()=>{
 assert.equal(resolveAnalysisBase({},{origin:'https://site.example',hostname:'site.example',protocol:'https:'}),'https://site.example/api/paving');
 assert.equal(resolveAnalysisBase({},{origin:'http://localhost:5500',hostname:'localhost',protocol:'http:'}),'http://localhost:8000/api/paving');
 assert.throws(()=>resolveAnalysisBase({apiBase:'http://analysis.example/api/paving'},{origin:'https://site.example',protocol:'https:'}),/HTTPS/);
 assert.throws(()=>resolveAnalysisBase({apiBase:'https://user:password@host/api'}),/credentials/);
});
test('aborted wait rejects promptly',async()=>{
 const c=new AbortController();const p=abortableDelay(10000,c.signal);c.abort();await assert.rejects(p,e=>e.name==='AbortError');
});
test('missing camera cannot be made into a bundle',()=>assert.equal(importableBundle({segmentation:{}}),null));

test('a partial camera-only retry does not erase an existing design or its intentional holes',async()=>{
  const {ctl,env}=setup({existing:[{id:'intentional',holes:[[]]}],payload:p=>{p.segmentation=null;p.errors.segmentation={code:'segmentation_failed'};}});
  const before=JSON.stringify(env.existing);const result=await ctl.run({replaceExisting:true});
  assert.equal(result.reason,'segmentation');assert.equal(ctl.getStatus().phase,'partial_kept');assert.equal(ctl.getStatus().canRestore,false);
  assert.equal(JSON.stringify(env.existing),before);assert.equal(env.imports.length,0);
});
