import test from 'node:test';import assert from 'node:assert/strict';
import {createPhotoAnalysis} from '../js/photoAnalysis.js';
import {fixture} from './fixtures/model-results.mjs';
const health={service:'paving-analysis',analysis_api_version:1,job_api_version:1,api_version:4,models_loaded:{camera:false,segmentation:true},limits:{max_side:1100}};
function harness(fetchImpl) {
 const photo={photoId:'synthetic-metric-test',width:160,height:120,designRevision:1};let imports=0;
 const c=createPhotoAnalysis({apiBase:'http://mock.test/api/paving',config:{requestTimeoutMs:1000,pollIntervalMs:0},clientId:'debug-test',
  getPhoto:()=>({...photo}),getPavingState:()=>({areaRegions:[]}),getSource:()=> 'blob:photo',
  preparePhoto:async()=>({width:160,height:120,blob:new Blob(['test'])}),fetchImpl,
  importResult:()=>{imports++;return {diagnostics:{regions:1}};},delay:async()=>{}});
 return {c,photo,imports:()=>imports};
}
test('service refresh is a read-only GET with no model job or import',async()=>{
 const requests=[],{c,imports}=harness(async(url,options)=>{requests.push({url,method:options.method||'GET'});return new Response(JSON.stringify(health));});
 const before=c.getStatus();assert.equal(c.getServiceStatus().state,'unchecked');
 await c.checkHealth();assert.deepEqual(requests,[{url:'http://mock.test/api/paving/health',method:'GET'}]);
 assert.deepEqual(c.getStatus(),before);assert.equal(imports(),0);assert.equal(c.getResultInfo(),null);
 assert.equal(c.getServiceStatus().modelsLoaded.camera,false);
 const copy=c.getServiceStatus();copy.modelsLoaded.camera=true;assert.equal(c.getServiceStatus().modelsLoaded.camera,false);
});
test('failed service refresh does not replace analysis status or edit the photo',async()=>{
 const {c,photo,imports}=harness(async()=>{throw new TypeError('offline');}),before=structuredClone(photo),status=c.getStatus();
 await assert.rejects(c.checkHealth(),/Cannot reach/);assert.deepEqual(photo,before);assert.deepEqual(c.getStatus(),status);
 assert.equal(c.getServiceStatus().state,'unavailable');assert.equal(imports(),0);
});
test('slow old health reply cannot overwrite a newer health check',async()=>{
 let resolveOld,n=0;const {c}=harness(async()=>{if(++n===1)return new Promise(r=>resolveOld=r);return new Response(JSON.stringify({...health,busy:true}));});
 const first=c.checkHealth();await c.checkHealth();resolveOld(new Response(JSON.stringify({...health,busy:false})));await first;
 assert.equal(c.getServiceStatus().busy,true);
});
test('result identifiers distinguish reruns; diagnostic info disappears on a different photo',async()=>{
 let generation;const {c,photo,imports}=harness(async(url,options)=>{
  if(url.endsWith('/health'))return new Response(JSON.stringify(health));
  if(url.includes('/requests/'))return new Response('{}');
  generation=Number(options.body.get('generation'));
  const bundle=fixture();const payload={...bundle,job_id:'a'.repeat(32),generation,image_id:photo.photoId,image:{width:160,height:120}};
  return new Response(JSON.stringify(payload));
 });
 await c.run();const info=c.getResultInfo();assert.ok(info.resultId);assert.equal(imports(),1);
 await c.run();assert.notEqual(c.getResultInfo().resultId,info.resultId);
 const copy=c.getResult();copy.segmentation.labels.counts[0]=99999;assert.notEqual(c.getResult().segmentation.labels.counts[0],99999);
 photo.photoId='new-photo';assert.equal(c.getResultInfo(),null);assert.equal(c.getResult(),null);
});
