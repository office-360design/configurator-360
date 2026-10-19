import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,binaryRLE,uint8RLE,prototypeExport} from './fixtures/model-results.mjs';
import {prepareModelImport,decodeBinaryRLE,decodeUint8RLE} from '../js/segmentationAdapter.js';
import {imageToGround} from '../js/modelCamera.js';
import {normalize,layout,estimate,TILES} from '../js/model.js';
import {applyPavingPatch} from '../js/pavingEditor.js';
import {ringArea} from '../js/pavingRegions.js';
import {clipConvex} from '../js/interlocking.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const sum=a=>a.reduce((s,v)=>s+v,0);
test('raw response bundle produces editable regions, holes and independent diagnostic masks',()=>{
 const b=fixture(), before=JSON.stringify(b), a=prepareModelImport(b);
 assert.equal(a.regions.length,2);assert.equal(a.diagnostics.holes,1);assert.equal(a.diagnostics.measurementStatus,'estimated');
 assert.equal(a.camera.accuracyVerified,false);assert.deepEqual(a.origin,{x:0,z:0});
 near(a.diagnostics.vectorAreaM2,a.diagnostics.exactPixelAreaM2);
 assert.equal(sum(a.masks.effective),a.diagnostics.pavingPixels);
 a.masks.labels.fill(0);a.regions[0].outer[0].x=999;assert.equal(JSON.stringify(b),before);
 for(const r of a.regions){assert.equal(r.curbs.outer,false);assert.ok(r.curbs.holes.every(v=>!v));}
});
test('class targets: grass and dirt by default; pavement is opt-in; unknowns stay protected',()=>{
 const b=fixture(),size=b.geometry.image.width*b.geometry.image.height;
 b.segmentation.labels=uint8RLE(new Uint8Array(size).fill(4));
 assert.equal(prepareModelImport(b).regions.length,0);
 assert.ok(prepareModelImport(b,{targets:['pavement']}).diagnostics.pavingPixels>0);
 b.segmentation.labels=uint8RLE(new Uint8Array(size).fill(255));
 const a=prepareModelImport(b,{targets:['pavement','grass','dirt']});assert.equal(a.regions.length,0);assert.equal(sum(a.masks.protected),size);
});
test('uncertainty is preserved, not silently used to erase selections',()=>{
 const b=fixture(),size=b.geometry.image.width*b.geometry.image.height;
 const before=prepareModelImport(b);b.segmentation.uncertainty=binaryRLE(new Uint8Array(size).fill(1));
 const after=prepareModelImport(b);near(after.diagnostics.vectorAreaM2,before.diagnostics.vectorAreaM2);assert.equal(sum(after.masks.uncertain),size);
});
test('ground support clips suggestions without rewriting semantic labels',()=>{
 const b=fixture(),size=b.geometry.image.width*b.geometry.image.height,before=JSON.stringify(b.segmentation.labels);
 b.geometry.ground_support=binaryRLE(new Uint8Array(size));
 const a=prepareModelImport(b);assert.equal(a.regions.length,0);assert.ok(a.diagnostics.unsupportedPixels>0);
 assert.equal(JSON.stringify(b.segmentation.labels),before);assert.ok(a.camera); // Empty selection still has a usable camera.
});
test('occlusion metadata is separate, never an automatic design subtraction',()=>{
 const b=fixture(),before=prepareModelImport(b),size=b.geometry.image.width*b.geometry.image.height;
 b.occlusion=binaryRLE(new Uint8Array(size).fill(1));const a=prepareModelImport(b);
 near(a.diagnostics.vectorAreaM2,before.diagnostics.vectorAreaM2);assert.equal(sum(a.masks.occlusion),size);
});
test('prototype export with masks retains explicit manual holes and works without semantic labels',()=>{
 const b=fixture(),a=prepareModelImport(b),payload=prototypeExport(b,a.masks.effective),again=prepareModelImport(payload);
 near(again.diagnostics.vectorAreaM2,a.diagnostics.vectorAreaM2);assert.equal(again.diagnostics.holes,1);assert.equal(again.masks.labels,null);
 delete payload.masks.paving;assert.throws(()=>prepareModelImport(payload),e=>e.code==='missingMasks');
});
test('explicit selection works with a valid model camera when segmentation is absent',()=>{
 const b=fixture(),a=prepareModelImport(b),c=prepareModelImport({geometry:b.geometry,selection:binaryRLE(a.masks.effective)});
 near(c.diagnostics.vectorAreaM2,a.diagnostics.vectorAreaM2);assert.equal(c.source,'explicit_selection');
});
test('whole-pixel projection guard rejects horizon/range overflow before contour projection',()=>{
 const b=fixture({pitch:0,roll:0}),size=b.geometry.image.width*b.geometry.image.height;
 b.segmentation.labels=uint8RLE(new Uint8Array(size).fill(10));
 const a=prepareModelImport(b);assert.ok(a.diagnostics.projectionRejectedPixels>0);assert.ok(a.diagnostics.pavingPixels>0);
 for(const r of a.regions)for(const p of r.outer)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));
});
test('raw API image IDs, image sizes and expected source tokens must agree',()=>{
 const b=fixture();b.segmentation.image_id='another-photo';assert.throws(()=>prepareModelImport(b),e=>e.code==='imageMismatch');
 const c=fixture();c.segmentation.image.width++;assert.throws(()=>prepareModelImport(c),e=>e.code==='imageMismatch');
 assert.throws(()=>prepareModelImport(fixture(),{expectedImage:{image_id:'wrong',image:{width:160,height:120}}}),e=>e.code==='imageMismatch');
});
test('reject missing masks, non-metric exports and unsupported transformations',()=>{
 assert.throws(()=>prepareModelImport({}));
 const b=fixture(),payload=prototypeExport(b,prepareModelImport(b).masks.effective);
 payload.geometry_source='reference_rectangle';assert.throws(()=>prepareModelImport(payload));
 payload.geometry_source='metric_model';payload.masks.included=false;assert.throws(()=>prepareModelImport(payload));
 payload.masks.included=true;payload.image.original_to_working=[1,0,5,0,1,0,0,0,1];
 assert.throws(()=>prepareModelImport(payload,{photo:{width:160,height:120}}),e=>e.code==='imageMismatch');
});
test('strict RLE bounds and encodings',()=>{
 assert.deepEqual([...decodeBinaryRLE(binaryRLE(Uint8Array.of(1,0,0,1)),4)],[1,0,0,1]);
 assert.deepEqual([...decodeUint8RLE(uint8RLE(Uint8Array.of(10,10,255,3)),4)],[10,10,255,3]);
 for(const counts of [[4],[-1,5],[0,5],[1.5,2.5],[1],[Infinity],[]])
  assert.throws(()=>decodeBinaryRLE({encoding:'binary_rle_zero_first_row_major',counts},3));
 for(const enc of [null,{encoding:'coco_rle',counts:[3]},{encoding:'uint8_rle_row_major',counts:[3],values:[256]},
  {encoding:'uint8_rle_row_major',counts:[2],values:[3]},{encoding:'uint8_rle_row_major',counts:[-1,4],values:[3,4]}])
  assert.throws(()=>decodeUint8RLE(enc,3));
});
test('invalid options are rejected, not clamped into a different suggestion',()=>{
 for(const o of [{maxRangeM:81},{maxRangeM:-1},{maxPixelAreaM2:2},{targets:['trees']},{targets:'grass'},{tolerancePx:NaN}])
  assert.throws(()=>prepareModelImport(fixture(),o));
});
const imported=prepareModelImport(fixture());
for(const [tile,t] of Object.entries(TILES))for(const pattern of t.patterns)for(const rotation of [0,17,90,359])
 test(`imported mask tile coverage excludes holes: ${tile}/${pattern}/${rotation}`,()=>{
  const s=normalize({shape:'regions',areaRegions:imported.regions,areaOrigin:imported.origin,tile,pattern,rotation}),parts=layout(s),bom=estimate(s,parts);
  near(parts.reduce((a,p)=>a+p.area,0),imported.diagnostics.vectorAreaM2);
  near(bom.area,imported.diagnostics.vectorAreaM2);assert.equal(bom.curbLength,0);
  for(const r of s.areaRegions)for(const hole of r.holes)for(const piece of parts)
   for(const poly of piece.fragments||[piece.polygon])near(ringArea(clipConvex(poly,[...hole].reverse())),0);
 });
test('a client can add an intentional hole after import; state round-trips without touching source masks',()=>{
 const i=prepareModelImport(fixture()),s=normalize({shape:'regions',areaRegions:i.regions,areaOrigin:i.origin});
 const hole=[[28,90],[36,90],[36,97],[28,97]].map(([x,y])=>imageToGround(i.camera,x,y));
 const edited=applyPavingPatch(s,hole,'remove');assert.equal(edited.areaRegions.reduce((n,r)=>n+r.holes.length,0),2);
 near(estimate(edited).area,estimate(s).area-ringArea(hole));assert.deepEqual(normalize(JSON.parse(JSON.stringify(edited))),edited);
 assert.equal(i.diagnostics.holes,1); // Import diagnostics remain the original suggestion.
});
test('actual Python fit_camera response contract from a synthetic plane is accepted without recentering its origin',async()=>{
 const {readFile}=await import('node:fs/promises');
 const bundle=JSON.parse(await readFile(new URL('./fixtures/server-model-result.json',import.meta.url),'utf8'));
 const a=prepareModelImport(bundle,{photo:{width:200,height:160}});
 assert.equal(a.diagnostics.regions,2);assert.equal(a.diagnostics.holes,1);
 near(a.diagnostics.vectorAreaM2,6.653785794693357);
 assert.deepEqual(a.camera.P0,bundle.geometry.ground_plane.origin_camera_m);
 assert.deepEqual(a.origin,{x:0,z:0});
});
