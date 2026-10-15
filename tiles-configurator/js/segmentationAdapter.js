import { normalizeRegions, ringArea } from './pavingRegions.js';
import { traceMask, simplifyContours } from './maskContours.js?v=tiles-corners-2';
import { failImport, assertSameImage, validateModelCamera, imageToGround, assertPhotoMatches } from './modelCamera.js';

export const GROUND_LABELS = Object.freeze({ grass: 10, dirt: 6, pavement: 4 });
export function decodeBinaryRLE(encoded, size) {
  if (!Number.isSafeInteger(size) || size<1 || size>1100*1100 ||
      encoded?.encoding!=='binary_rle_zero_first_row_major' || !Array.isArray(encoded.counts) ||
      encoded.counts.length>size+1 || !encoded.counts.length)
    failImport('invalidMask','Expected a zero-first, row-major binary RLE mask.');
  const mask=new Uint8Array(size); let position=0, value=0;
  for(const count of encoded.counts) {
    if(!Number.isSafeInteger(count) || count<0 || position+count>size)
      failImport('invalidMask','A binary RLE run is invalid or exceeds the image.');
    if(value) mask.fill(1,position,position+count);
    position+=count; value=1-value;
  }
  if(position!==size) failImport('invalidMask','Binary RLE length does not match the image.');
  return mask;
}
export function decodeUint8RLE(encoded,size) {
  if(!Number.isSafeInteger(size) || size<1 || size>1100*1100 || encoded?.encoding!=='uint8_rle_row_major' ||
      !Array.isArray(encoded.values) || !Array.isArray(encoded.counts) || encoded.values.length!==encoded.counts.length ||
      encoded.counts.length>size || !encoded.counts.length)
    failImport('invalidMask','Expected a row-major uint8 semantic RLE mask.');
  const labels=new Uint8Array(size); let position=0;
  encoded.counts.forEach((count,i)=>{
    const value=encoded.values[i];
    if(!Number.isSafeInteger(count) || count<=0 || position+count>size || !Number.isInteger(value) || value<0 || value>255)
      failImport('invalidMask','A semantic RLE run is invalid.');
    labels.fill(value,position,position+count); position+=count;
  });
  if(position!==size) failImport('invalidMask','Semantic RLE length does not match the image.');
  return labels;
}
function unpack(input) {
  if(input?.schema_version===2) {
    if(input.geometry_valid!==true || input.geometry_source!=='metric_model')
      failImport('invalidCamera','Only a completed metric-model result can supply the 3D camera. A reference-only homography is not supported by this import.');
    const masks=input.masks;
    if(masks?.included!==true || masks.width!==input.image?.width || masks.height!==input.image?.height || !Array.isArray(masks.paving))
      failImport('missingMasks','Export the segmentation result again with “Include RLE masks” enabled.');
    if(input.image?.coordinate_space && input.image.coordinate_space!=='working_image_pixels')
      failImport('imageMismatch','The result must use working-image pixel coordinates.');
    const wrap=counts=>({encoding:masks.encoding,counts});
    return {geometry:{...input,schema_version:1,model:input.models?.camera_model,ground_support:wrap(masks.ground_support)},
      selection:wrap(masks.paving), requested: masks.selection?wrap(masks.selection):null,
      segmentation:null, original:input, source:'prototype_export', occlusion:input.occlusion || null};
  }
  if(!input?.geometry) failImport('invalidResult','Supply a { segmentation, geometry } response bundle or a prototype schema-v2 JSON export with masks.');
  return {geometry:input.geometry,segmentation:input.segmentation || null,selection:input.selection || null,
    original:null,source:input.segmentation?'model_responses':'explicit_selection',occlusion:input.occlusion || null};
}
/** Pure import preparation. Does not mutate a viewer, application state or source masks. */
export function prepareModelImport(input, options={}) {
  const minRegionAreaM2 = options.minRegionAreaM2 === undefined ? .5 : options.minRegionAreaM2;
  if (typeof minRegionAreaM2 !== 'number' || !Number.isFinite(minRegionAreaM2) || minRegionAreaM2 < 0)
    failImport('invalidOptions','The minimum detected region area must be a finite, non-negative number of square metres.');
  const {geometry,segmentation,selection,requested,original,source,occlusion}=unpack(input),
    camera=validateModelCamera(geometry), {width:W,height:H}=camera.image, size=W*H;
  if(segmentation) {
    assertSameImage(geometry,segmentation);
    if(segmentation.schema_version!==1) failImport('invalidResult','Unsupported segmentation response schema.');
  }
  if(options.expectedImage) assertSameImage(geometry,options.expectedImage);
  if(options.photo) {
    assertPhotoMatches(camera,options.photo);
    if(original?.image?.original_width && (original.image.original_width!==options.photo.width || original.image.original_height!==options.photo.height))
      failImport('imageMismatch','The export was made from a different-sized original photo. Use the original, uncropped photograph.');
    const transform=original?.image?.original_to_working;
    if(transform) {
      const expected=[W/options.photo.width,0,0,0,H/options.photo.height,0,0,0,1];
      if(!Array.isArray(transform)||transform.length!==9||transform.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v-expected[i])>1e-8))
        failImport('imageMismatch','Cropped, stretched or reoriented result transforms cannot be imported as the original photo.');
    }
  }
  const support=decodeBinaryRLE(geometry.ground_support,size), labels=segmentation?decodeUint8RLE(segmentation.labels,size):null,
    uncertain=segmentation?.uncertainty?decodeBinaryRLE(segmentation.uncertainty,size):null,
    groundHint=segmentation?.ground_hint?decodeBinaryRLE(segmentation.ground_hint,size):null,
    blocked=labels?Uint8Array.from(labels,v=>v===10||v===6||v===4?0:1):null,
    occlusionMask=occlusion?decodeBinaryRLE(occlusion,size):null;
  const targets=options.targets??['grass','dirt'];
  if(!Array.isArray(targets)||targets.some(k=>!Object.hasOwn(GROUND_LABELS,k)))
    failImport('invalidOptions','Paving targets must be grass, dirt or pavement.');
  const selectedLabels=new Set(targets.map(k=>GROUND_LABELS[k]));
  if(!labels&&!selection) failImport('missingMasks','A semantic result or explicit paving mask is required.');
  const selected=selection?decodeBinaryRLE(selection,size):Uint8Array.from(labels,v=>selectedLabels.has(v)?1:0),
    requestedMask=requested?decodeBinaryRLE(requested,size):selected.slice(), effective=new Uint8Array(size),
    maxRange=options.maxRangeM??80, maxPixelArea=options.maxPixelAreaM2??1;
  if(typeof maxRange!=='number'||!Number.isFinite(maxRange)||maxRange<=0||maxRange>80||
      typeof maxPixelArea!=='number'||!Number.isFinite(maxPixelArea)||maxPixelArea<=0||maxPixelArea>1)
    failImport('invalidOptions','Projection limits must be positive, at most 80 m range and 1 m² per pixel.');
  let selectedPixels=0,pavingPixels=0,unsupportedPixels=0,projectionRejectedPixels=0,exactPixelAreaM2=0;
  const project=(u,v)=>imageToGround(camera,u,v,{maxRange});
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const i=y*W+x; if(!selected[i]) continue; selectedPixels++;
    if(!support[i]) {unsupportedPixels++;continue;}
    // Test the whole pixel, not only its centre. A cell crossing the horizon or
    // range limit must not generate enormous contour vertices/false metric areas.
    const centre=project(x+.5,y+.5), corners=[project(x,y),project(x+1,y),project(x+1,y+1),project(x,y+1)];
    const area=corners.every(Boolean)?ringArea(corners):NaN;
    if(!centre||!Number.isFinite(area)||area<=0||area>maxPixelArea) {projectionRejectedPixels++;continue;}
    effective[i]=1; pavingPixels++; exactPixelAreaM2+=area;
  }
  const mapRing=ring=>ring.map(p=>{
    const v=project(p.x,p.z);
    if(!v) failImport('invalidProjection','A boundary lies outside the valid ground projection.');
    return v;
  });
  const regionArea = r => ringArea(r.outer) - r.holes.reduce((sum, hole) => sum + ringArea(hole), 0),
    mapRegion = r => ({...r,outer:mapRing(r.outer),holes:r.holes.map(mapRing)});
  let filteredSmallRegions = 0, filteredSmallRegionAreaM2 = 0;
  function keepRegion(region) {
    const area = regionArea(region);
    // Allow roundoff at the exact threshold, e.g. 0.49999999999999994 m².
    if (area + 1e-10 * Math.max(1, minRegionAreaM2) >= minRegionAreaM2) return true;
    filteredSmallRegions++; filteredSmallRegionAreaM2 += area; return false;
  }
  const traced=traceMask(effective,W,H),
    // Filter before contour validation so tiny disconnected detections do not
    // exhaust the editor's region budget or constrain larger boundaries.
    largeRegions=traced.regions.filter(r=>keepRegion(mapRegion(r))),
    simplified=simplifyContours(largeRegions,W,H,options.tolerancePx??.75,options.maxCornersPerBoundary),
    projected=simplified.regions.map(mapRegion),
    // Simplification can shrink a region below the threshold. Check its final
    // net area too, keeping pixel and metric region arrays in the same order.
    kept=projected.map(keepRegion), pixelRegions=simplified.regions.filter((_,i)=>kept[i]);
  let regions;
  try {regions=normalizeRegions(projected.filter((_,i)=>kept[i]));}
  catch(error) {
    if(error?.code) throw error;
    failImport(error.message==='areaTooComplex'?'areaTooComplex':'invalidTopology',
      'The projected contours exceed the editor budget or contain unresolved contacts. No regions or holes were removed.');
  }
  const boundariesOverCornerTarget = simplified.maxCornersPerBoundary === null ? 0 : pixelRegions.reduce((sum,r)=>
    sum+[r.outer,...r.holes].filter(ring=>ring.length>simplified.maxCornersPerBoundary).length,0);
  const holes=regions.reduce((s,r)=>s+r.holes.length,0), vertices=regions.reduce((s,r)=>s+r.outer.length+r.holes.reduce((a,h)=>a+h.length,0),0),
    area=regions.reduce((s,r)=>s+ringArea(r.outer)-r.holes.reduce((a,h)=>a+ringArea(h),0),0),
    warnings=['Camera, scale and quantities are estimated from the photograph, not physically verified.'];
  if(unsupportedPixels+projectionRejectedPixels) warnings.push(`${unsupportedPixels+projectionRejectedPixels} selected pixels were excluded by ground support or projection safety checks.`);
  if(traced.saddleCorners) warnings.push('Diagonal pixel contacts were separated with a 0.02 px bevel; pixel-centre classifications are unchanged.');
  if(boundariesOverCornerTarget) warnings.push(`Some detected boundaries need more than ${simplified.maxCornersPerBoundary} corners to preserve their shape and holes. Extra corners were kept.`);
  if(filteredSmallRegions) warnings.push(`${filteredSmallRegions} detected regions smaller than ${minRegionAreaM2} m² were ignored. Holes in retained regions were preserved.`);
  if(!regions.length) warnings.push('The result contains no usable paving. The imported camera can still be used for manual drawing.');
  if(!labels) warnings.push('This import contains an explicit paving mask, not original semantic labels. Semantic protection diagnostics are unavailable.');
  if(occlusionMask) warnings.push('The supplied occlusion mask is retained separately; it is not subtracted from design quantities. Foreground compositing is not part of step 2.');
  return {camera,regions,origin:{x:0,z:0},pixelRegions,source,
    diagnostics:{selectedPixels,pavingPixels,unsupportedPixels,projectionRejectedPixels,regions:regions.length,holes,vertices,
      rawBoundaryEdges:traced.edgeCount,saddleCorners:traced.saddleCorners,tolerancePx:simplified.tolerancePx,
      maxCornersPerBoundary:simplified.maxCornersPerBoundary,boundariesOverCornerTarget,
      minRegionAreaM2,filteredSmallRegions,filteredSmallRegionAreaM2,
      exactPixelAreaM2,vectorAreaM2:area,areaDifferenceM2:area-exactPixelAreaM2,measurementStatus:'estimated'},
    masks:{labels,uncertain,groundHint,protected:blocked,groundSupport:support,requested:requestedMask,selection:selected,effective,occlusion:occlusionMask},warnings};
}
