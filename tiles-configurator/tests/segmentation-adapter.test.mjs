import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
 assert.equal(a.regions.length,1);assert.equal(a.diagnostics.filteredSmallRegions,1);assert.equal(a.diagnostics.holes,1);assert.equal(a.diagnostics.measurementStatus,'estimated');
 assert.equal(a.camera.accuracyVerified,false);assert.deepEqual(a.origin,{x:0,z:0});
 near(a.diagnostics.vectorAreaM2,a.diagnostics.exactPixelAreaM2-a.diagnostics.filteredSmallRegionAreaM2);
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

test('corner-target diagnostics explain preserved extra corners and leave raw masks reusable',()=>{
 const bundle=fixture(), before=structuredClone(bundle), result=prepareModelImport(bundle,{maxCornersPerBoundary:3});
 assert.deepEqual(bundle,before);assert.equal(result.diagnostics.maxCornersPerBoundary,3);
 assert.ok(result.diagnostics.boundariesOverCornerTarget>0);
 assert.ok(result.warnings.some(w=>w.includes('more than 3 corners')));
 const restored=prepareModelImport(bundle,{maxCornersPerBoundary:20});
 assert.equal(restored.diagnostics.boundariesOverCornerTarget,0);
 assert.equal(restored.regions.length,result.regions.length);assert.equal(restored.diagnostics.holes,result.diagnostics.holes);
});

test('saved sample-yard model export reduces its dense outer boundary to 20 actual editor vertices',()=>{
 const payload=JSON.parse(readFileSync(new URL('../assets/sample-yards/mama.json',import.meta.url),'utf8')),
   original=prepareModelImport(payload,{maxCornersPerBoundary:null}), reduced=prepareModelImport(payload),
   boundaries=reduced.regions.flatMap(r=>[r.outer,...r.holes]);
 assert.ok(original.regions.some(r=>r.outer.length>200));
 assert.equal(Math.max(...boundaries.map(r=>r.length)),20);
 assert.equal(reduced.regions.length,original.regions.length);assert.equal(reduced.diagnostics.holes,original.diagnostics.holes);
 assert.equal(reduced.diagnostics.boundariesOverCornerTarget,0);
 assert.equal(reduced.diagnostics.vertices,boundaries.reduce((sum,ring)=>sum+ring.length,0));
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
 for(const o of [{maxRangeM:81},{maxRangeM:-1},{maxPixelAreaM2:2},{targets:['trees']},{targets:'grass'},{tolerancePx:NaN},
   {minRegionAreaM2:-1},{minRegionAreaM2:NaN},{minRegionAreaM2:Infinity},{minRegionAreaM2:'0.5'},{minRegionAreaM2:null}])
  assert.throws(()=>prepareModelImport(fixture(),o));
});

// A top-down synthetic metric camera maps each pixel to 1/256 m².
function metricSelection(draw) {
 const mask=new Uint8Array(100*100);
 const rect=(x,y,w,h,value=1)=>{for(let row=y;row<y+h;row++)mask.fill(value,row*100+x,row*100+x+w);};
 draw(rect,mask);
 return {geometry:fixture({width:100,height:100,pitch:90,roll:0,altitude:1,fx:16,fy:16,cx:50,cy:50}).geometry,
   selection:binaryRLE(mask)};
}

test('minimum detected area removes sub-0.5 m² regions and retains exactly 0.5 m² and larger',()=>{
 const bundle=metricSelection(rect=>{rect(4,8,7,16);rect(20,8,8,16);rect(40,8,9,16);}),before=structuredClone(bundle),
   result=prepareModelImport(bundle);
 assert.deepEqual(bundle,before);assert.equal(result.regions.length,2);assert.equal(result.pixelRegions.length,2);
 assert.deepEqual(result.regions.map(r=>ringArea(r.outer)).sort((a,b)=>a-b),[.5,.5625]);
 assert.equal(result.diagnostics.minRegionAreaM2,.5);assert.equal(result.diagnostics.filteredSmallRegions,1);
 near(result.diagnostics.filteredSmallRegionAreaM2,.4375);near(result.diagnostics.vectorAreaM2,1.0625);
 assert.deepEqual(result.pixelRegions.map(r=>r.id),result.regions.map(r=>r.id));
});

test('minimum detected area uses metric scale rather than the number of pixels',()=>{
 const bundle=metricSelection(rect=>rect(8,8,7,16));
 assert.equal(prepareModelImport(bundle).regions.length,0);
 const largerScale=fixture({width:100,height:100,pitch:90,roll:0,altitude:2,fx:16,fy:16,cx:50,cy:50}).geometry;
 const result=prepareModelImport({...bundle,geometry:largerScale});
 assert.equal(result.regions.length,1);near(result.diagnostics.vectorAreaM2,1.75);
});

test('minimum area subtracts holes without filling small holes in retained regions',()=>{
 const bundle=metricSelection(rect=>{
   rect(5,5,12,12);rect(8,8,5,4,0); // 0.484375 m² after subtracting the hole.
   rect(25,5,12,12);rect(28,8,4,4,0); // Exactly 0.5 m² after subtracting the hole.
   rect(50,5,20,20);rect(58,13,2,2,0);
 });
 const result=prepareModelImport(bundle);
 assert.equal(result.regions.length,2);assert.equal(result.diagnostics.holes,2);
 assert.equal(result.diagnostics.filteredSmallRegions,1);
 near(result.diagnostics.filteredSmallRegionAreaM2,.484375);
 assert.ok(result.regions.every(r=>r.holes.length===1));
 near(result.regions[0].holes.reduce((sum,h)=>sum+ringArea(h),0),.0625);
});

test('tiny detections are removed before they can exhaust the editor region budget',()=>{
 const bundle=metricSelection(rect=>{
   for(let y=2;y<40;y+=3)for(let x=2;x<40;x+=3)rect(x,y,1,1);
   rect(60,60,20,20);
 });
 const result=prepareModelImport(bundle);
 assert.equal(result.regions.length,1);assert.equal(result.diagnostics.filteredSmallRegions,169);
 near(result.diagnostics.vectorAreaM2,400/256);
});

test('regions that shrink below the area threshold during corner reduction are also removed',()=>{
 const bundle=metricSelection((rect,mask)=>{
   for(let y=0;y<100;y++)for(let x=0;x<100;x++)if(Math.hypot(x-50,y-50)<16)mask[y*100+x]=1;
 });
 const original=prepareModelImport(bundle,{minRegionAreaM2:0,tolerancePx:0,maxCornersPerBoundary:null}),
   reduced=prepareModelImport(bundle,{minRegionAreaM2:0,tolerancePx:0,maxCornersPerBoundary:3}),
   threshold=(original.diagnostics.vectorAreaM2+reduced.diagnostics.vectorAreaM2)/2;
 assert.ok(reduced.diagnostics.vectorAreaM2<original.diagnostics.vectorAreaM2);
 const result=prepareModelImport(bundle,{minRegionAreaM2:threshold,tolerancePx:0,maxCornersPerBoundary:3});
 assert.equal(result.regions.length,0);assert.equal(result.pixelRegions.length,0);
 assert.equal(result.diagnostics.filteredSmallRegions,1);assert.equal(result.diagnostics.vertices,0);
 assert.ok(result.camera); // The camera remains available for manual drawing.
});

test('the minimum area can be configured or disabled without changing the source masks',()=>{
 const bundle=metricSelection(rect=>{rect(5,5,7,16);rect(25,5,8,16);}),before=structuredClone(bundle);
 const disabled=prepareModelImport(bundle,{minRegionAreaM2:0});
 assert.equal(disabled.regions.length,2);assert.equal(disabled.diagnostics.filteredSmallRegions,0);
 const empty=prepareModelImport(bundle,{minRegionAreaM2:1});
 assert.equal(empty.regions.length,0);assert.equal(empty.pixelRegions.length,0);
 assert.equal(empty.diagnostics.filteredSmallRegions,2);assert.ok(empty.camera);
 assert.deepEqual(bundle,before);
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
