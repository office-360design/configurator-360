import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, binaryRLE, prototypeExport } from './fixtures/model-results.mjs';
import { prepareModelImport, decodeBinaryRLE, decodeUint8RLE } from '../js/segmentationAdapter.js';
import { DEBUG_CLASSES, inspectDebugSource, maskRGBA, designStatistics, encodeDebugMask,
  debugMetadata, buildDebugReport, unwrapDebugReport, publicServiceAddress } from '../js/segmentationDebugData.js';
const photo={photoId:'photo-session',width:160,height:120,designRevision:1};
const input=(payload=fixture())=>({kind:'analysis',key:'result-1',photoId:photo.photoId,payload,targets:['grass','dirt']});
function applied() {
  const source=input(), p=prepareModelImport(source.payload);
  source.prepared={image:p.camera.image,masks:p.masks};source.summary={diagnostics:p.diagnostics,warnings:p.warnings};
  return {source,p};
}
const snapshot={photo,status:{phase:'ready',apiBase:'https://example.test/api/paving?token=secret'},
  service:{state:'reachable'},calibration:{type:'metric_model'},measurementStatus:'estimated'};
test('inspecting a source is immutable and class percentages cover all working pixels',()=>{
  const {source}=applied(),before=structuredClone(source),d=inspectDebugSource(source,photo);
  assert.deepEqual(source,before);assert.equal(d.classes.length,8);
  assert.ok(Math.abs(d.classes.reduce((s,c)=>s+c.percentage,0)-100)<1e-9);
  assert.equal(d.classes.reduce((s,c)=>s+c.pixels,0),19200);assert.equal(d.diagnostics.holes,1);
  d.masks.labels.fill(0);assert.deepEqual(source,before);
});
test('unknown labels are counted and shown, never remapped to paveable ground',()=>{
  const s=input();s.payload.segmentation.labels={encoding:'uint8_rle_row_major',values:[99],counts:[19200]};
  const d=inspectDebugSource(s,photo);assert.equal(d.classes.find(c=>c.key==='unknown').percentage,100);
  assert.equal(d.counts.protected.percentage,100);assert.equal(d.counts.selection.pixels,0);
  assert.equal(maskRGBA(d,'labels')[3],255);
  assert.equal(maskRGBA(d,'labels',DEBUG_CLASSES.filter(c=>c.key!=='unknown').map(c=>c.key))[3],0);
});
test('unapplied results do not invent the effective mask or projection-clipping diagnostics',()=>{
  const d=inspectDebugSource(input(),photo);assert.ok(d.masks.supportedSelection);
  assert.equal(d.masks.effective,undefined);assert.equal(d.masks.projectionRejected,undefined);
});
test('camera failure still exposes real semantic masks but no fabricated support or camera',()=>{
  const s=input();s.payload.geometry=null;const d=inspectDebugSource(s,photo);
  assert.ok(d.classes);assert.equal(d.camera,null);assert.equal(d.masks.groundSupport,undefined);
  assert.equal(d.masks.supportedSelection,undefined);
});
test('camera-only response does not invent semantic percentages',()=>{
  const s=input();s.payload.segmentation=null;s.payload.selection=binaryRLE(new Uint8Array(19200));
  const d=inspectDebugSource(s,photo);assert.equal(d.classes,null);assert.equal(d.counts.selection.pixels,0);
  assert.equal(d.masks.uncertain,undefined);assert.equal(d.masks.protected,undefined);
});
test('missing occlusion remains unavailable; explicit occlusion never changes paving',()=>{
  const {source}=applied(),first=inspectDebugSource(source,photo);assert.equal(first.masks.occlusion,undefined);
  source.payload.occlusion=binaryRLE(new Uint8Array(19200).fill(1));
  const d=inspectDebugSource(source,photo);assert.equal(d.counts.occlusion.percentage,100);
  assert.deepEqual(d.masks.effective,first.masks.effective);assert.deepEqual(d.diagnostics,first.diagnostics);
});
for(const key of ['uncertainty','ground_hint']) test(`malformed optional ${key} is isolated, not displayed as 0%`,()=>{
  const s=input();s.payload.segmentation[key]={encoding:'binary_rle_zero_first_row_major',counts:[1]};
  const d=inspectDebugSource(s,photo);assert.ok(d.errors.length);assert.ok(d.masks.labels);
  assert.equal(d.counts[key==='uncertainty'?'uncertain':'groundHint'],undefined);
});
for(const [label,change,p] of [
  ['different session',s=>{s.photoId='old';},photo],
  ['different image dimensions',s=>{s.payload.geometry.image.width=100;},photo],
  ['mismatched semantic id',s=>{s.payload.segmentation.image_id='other';},photo],
  ['unrelated aspect ratio',()=>{},{...photo,width:100,height:100}],
]) test(`source identity rejected: ${label}`,()=>{const s=input();change(s);assert.throws(()=>inspectDebugSource(s,p));});
test('prototype exports expose only supplied masks, not invented semantic classes',()=>{
  const b=fixture(),p=prepareModelImport(b),s=input(prototypeExport(b,p.masks.effective));
  const d=inspectDebugSource(s,photo);assert.equal(d.classes,null);assert.ok(d.masks.effective);assert.ok(d.masks.groundSupport);
});
for(const values of [[0,0,0],[1,1,1],[1,0,1,0],[0,1,1,0,0,1]]) test(`binary mask export roundtrip ${values}`,()=>{
  const m=Uint8Array.from(values);assert.deepEqual(decodeBinaryRLE(encodeDebugMask(m),m.length),m);
});
test('semantic mask export roundtrip keeps class 250 and unknown class ids',()=>{
  const m=Uint8Array.from([10,10,250,99,99,0]);assert.deepEqual(decodeUint8RLE(encodeDebugMask(m,true),m.length),m);
});
test('raster filtering is read-only and transparent excluded classes remain transparent',()=>{
  const d=inspectDebugSource(input(),photo),before=structuredClone(d.masks);
  const pixels=maskRGBA(d,'labels',['grass']);let opaque=0;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;
  assert.equal(opaque,d.classes.find(c=>c.key==='grass').pixels);assert.deepEqual(d.masks,before);
  assert.equal(maskRGBA(d,'occlusion'),null);
});
test('edited design holes and original masks remain distinct in a roundtrip report',()=>{
  const {source,p}=applied(),d=inspectDebugSource(source,photo),design={areaOrigin:{x:0,z:0},areaRegions:[]};
  const r=buildDebugReport({snapshot,source,inspected:d,design,includeMasks:true,now:()=> 'test'});
  assert.equal(r.design.regions.length,0);assert.equal(r.design.statistics.areaM2,0);
  const imported=prepareModelImport(unwrapDebugReport(JSON.parse(JSON.stringify(r))));
  assert.equal(imported.regions.length,p.regions.length);assert.equal(imported.diagnostics.holes,1);
  assert.deepEqual(imported.masks.effective,p.masks.effective);
});
test('lightweight report excludes every RLE payload and strips service credentials/query',()=>{
  const {source,p}=applied(),d=inspectDebugSource(source,photo),design={areaRegions:p.regions,areaOrigin:{x:0,z:0}};
  const r=buildDebugReport({snapshot,source,inspected:d,design});const json=JSON.stringify(r);
  assert.equal(r.masks_included,false);assert.equal(r.model_result,undefined);assert.equal(r.diagnostic_masks,undefined);
  assert.ok(!json.includes('binary_rle'));assert.ok(!json.includes('secret'));assert.ok(!json.includes('"counts"'));
  assert.equal(r.design.statistics.holes,1);assert.throws(()=>unwrapDebugReport(r),/diagnostics-only/);
});
test('empty session exports diagnostically without fabricating model results',()=>{
  const r=buildDebugReport({snapshot,source:null,inspected:null,design:{areaRegions:[]},includeMasks:true});
  assert.equal(r.model_result,null);assert.equal(r.model_diagnostics,null);assert.throws(()=>unwrapDebugReport(r));
});
test('small intentional hole affects design area, never vanishes in metadata export',()=>{
  const rect=(x,z,w)=>[{x,z},{x:x+w,z},{x:x+w,z:z+w},{x,z:z+w}];
  const design={areaRegions:[{outer:rect(0,0,4),holes:[rect(1,1,.1)]}]};
  const stats=designStatistics(design);assert.equal(stats.holes,1);assert.ok(Math.abs(stats.areaM2-15.99)<1e-9);
});
test('metadata is bounded, JSON-safe and does not copy raw masks or prototype keys',()=>{
  const value=JSON.parse('{"__proto__":{"polluted":true},"counts":[1,2],"values":[10],"token":"secret","model":"EoMT"}');
  value.large=Array(10000).fill(3);value.nan=NaN;value.typed=new Uint8Array(100000);value.self=value;
  const out=debugMetadata(value);assert.equal(out.counts,undefined);assert.equal(out.token,undefined);
  assert.equal(out.model,'EoMT');assert.equal(out.nan,null);assert.ok(JSON.stringify(out).length<5000);assert.equal({}.polluted,undefined);
});
test('service address sanitization never exports credentials',()=>{
  assert.equal(publicServiceAddress('https://user:password@example.test/api?key=secret#x'),'https://example.test/api');
});

test('mask counters survive metadata filtering, while RLE arrays stay excluded',()=>{
  const out=debugMetadata({selection:{pixels:8,percentage:10},effective:{pixels:6,percentage:7.5},occlusion:{pixels:2,percentage:2.5},labels:{encoding:'rle',counts:[3,4]}});
  assert.equal(out.selection.pixels,8);assert.equal(out.effective.pixels,6);assert.equal(out.occlusion.pixels,2);assert.equal(out.labels,undefined);
});
test('RLE report reimport keeps non-default target choices, not newly chosen defaults',()=>{
  const source=input();source.targets=['dirt'];const p=prepareModelImport(source.payload,{targets:source.targets});
  source.prepared={image:p.camera.image,masks:p.masks};source.summary={diagnostics:p.diagnostics,warnings:p.warnings};
  const report=buildDebugReport({snapshot,source,inspected:inspectDebugSource(source,photo),design:{areaRegions:[]},includeMasks:true});
  const result=prepareModelImport(unwrapDebugReport(report));
 assert.deepEqual(result.masks.effective,p.masks.effective);assert.ok(result.masks.effective.some(Boolean));
 assert.equal(result.regions.length,0);assert.equal(result.diagnostics.filteredSmallRegions,1);
});
