import { normalizeRegions, pointInRing, canRemoveBoundaryVertex } from './pavingRegions.js?v=tiles-corners-2';
import { failImport } from './modelCamera.js';

export const MASK_LIMITS = Object.freeze({ pixels: 1100*1100, edges: 100000, saddleInsetPx: .02 });
const area2 = p => p.reduce((s,a,i) => { const b=p[(i+1)%p.length]; return s+a.x*b.z-b.x*a.z; },0);
const vectors = [[1,0],[0,1],[-1,0],[0,-1]];
/** Pixel-cell boundary tracing: 4-connected foreground / 8-connected background.
 * At a diagonal saddle, a 0.02 px inward bevel resolves a zero-width contact.
 * No pixel centre changes class; no region is joined and no enclosed hole is filled.
 * Bevel vertices survive pixel-tolerance simplification. The corner-budget pass
 * may remove them only when the resulting boundaries remain separate and valid.
 * There is no morphology/min-size filter.
 */
export function traceMask(mask, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width<1 || height<1 ||
      width*height>MASK_LIMITS.pixels || !(mask instanceof Uint8Array) || mask.length!==width*height)
    failImport('invalidMask','Invalid binary mask dimensions.');
  const stride=width+1, edges=[], outgoing=new Map();
  function add(ax,ay,bx,by,dir) {
    if (edges.length>=MASK_LIMITS.edges) failImport('areaTooComplex','The mask has too many boundary edges to preview safely. No contours were discarded.');
    const a=ay*stride+ax,b=by*stride+bx,index=edges.length;
    edges.push({a,b,dir});
    if (!outgoing.has(a)) outgoing.set(a,[]);
    outgoing.get(a).push(index);
  }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x;
    if (mask[i]!==0 && mask[i]!==1) failImport('invalidMask','Binary mask values must be 0 or 1.');
    if (!mask[i]) continue;
    if(y===0 || !mask[i-width]) add(x,y,x+1,y,0);
    if(x===width-1 || !mask[i+1]) add(x+1,y,x+1,y+1,1);
    if(y===height-1 || !mask[i+width]) add(x+1,y+1,x,y+1,2);
    if(x===0 || !mask[i-1]) add(x,y+1,x,y,3);
  }
  const visited=new Uint8Array(edges.length), rings=[];
  let saddleCorners=0;
  const rank=[1,0,3,2]; // Right turn before straight, left, or doubling back.
  for(let start=0;start<edges.length;start++) {
    if(visited[start]) continue;
    const cycle=[]; let index=start;
    do {
      if(visited[index]) failImport('invalidMask','The mask boundary could not be traced safely.');
      visited[index]=1; cycle.push(index);
      const e=edges[index], options=outgoing.get(e.b);
      if(!options?.length) failImport('invalidMask','The mask boundary is open.');
      index=options.reduce((best,k)=>rank[(edges[k].dir-e.dir+4)%4]<rank[(edges[best].dir-e.dir+4)%4]?k:best, options[0]);
    } while(index!==start);
    const points=[];
    cycle.forEach((k,i)=>{
      const e=edges[k], prev=edges[cycle[(i+cycle.length-1)%cycle.length]],
        x=e.a%stride, z=Math.floor(e.a/stride);
      if(outgoing.get(e.a).length>1) {
        const [px,pz]=vectors[prev.dir], [dx,dz]=vectors[e.dir], t=MASK_LIMITS.saddleInsetPx;
        points.push({x:x-px*t,z:z-pz*t,locked:true},{x:x+dx*t,z:z+dz*t,locked:true}); saddleCorners++;
      } else if(prev.dir!==e.dir) points.push({x,z});
    });
    if(points.length<3 || Math.abs(area2(points))<1e-9) failImport('invalidMask','A mask ring collapsed.');
    rings.push(points);
  }
  const regions=rings.filter(p=>area2(p)>0).map((outer,i)=>({id:`detected-${i+1}`,outer,holes:[],curbs:{outer:false,holes:[]}}));
  for(const hole of rings.filter(p=>area2(p)<0)) {
    const parent=regions.filter(r=>pointInRing(hole[0],r.outer)===1).sort((a,b)=>Math.abs(area2(a.outer))-Math.abs(area2(b.outer)))[0];
    if(!parent) failImport('invalidMask','A hole has no containing outer boundary.');
    parent.holes.push(hole); parent.curbs.holes.push(false);
  }
  return {regions, edgeCount:edges.length, saddleCorners};
}
function dist2(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z, n=dx*dx+dz*dz,
    t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/n)):0;
  return (p.x-a.x-t*dx)**2+(p.z-a.z-t*dz)**2;
}
function simplifyRing(ring,tolerance) {
  if(tolerance<=0 || ring.length<=3) return ring;
  const n=ring.length, anchors=new Set([0]);
  let farthest=1;
  for(let i=1;i<n;i++) if(dist2(ring[i],ring[0],ring[0])>dist2(ring[farthest],ring[0],ring[0])) farthest=i;
  anchors.add(farthest); ring.forEach((p,i)=>{if(p.locked)anchors.add(i);});
  const sorted=[...anchors].sort((a,b)=>a-b), out=[];
  for(let i=0;i<sorted.length;i++) {
    const from=sorted[i], to=i+1<sorted.length?sorted[i+1]:n,
      keep=new Set([from,to]), work=[[from,to]];
    while(work.length) {
      const [a,b]=work.pop(); let best=-1, error=tolerance*tolerance;
      for(let j=a+1;j<b;j++) {
        const d=dist2(ring[j%n],ring[a%n],ring[b%n]);
        if(d>error) {error=d;best=j;}
      }
      if(best>=0) {keep.add(best);work.push([a,best],[best,b]);}
    }
    for(const j of [...keep].sort((a,b)=>a-b)) if(j!==to) out.push(ring[j%n]);
  }
  return out.length>=3?out:ring;
}
const mapRegions = (regions,fn) => regions.map(r=>({...r,outer:r.outer.map(fn),holes:r.holes.map(h=>h.map(fn))}));
/** Simplify to the requested count, removing the least significant corners first.
 * Rank removals by deviation from the original arc, then swept area. Accuracy
 * is a ranking criterion, not a veto that leaves hundreds of noisy vertices.
 * Topology checks protect holes, separate islands and self-intersections.
 */
function reduceCorners(regions, maximum) {
  const candidate = mapRegions(regions, p => ({...p}));
  // Bound work on pathological masks. Keeping extra corners is always safe.
  let work = 0;
  const vertices = candidate.reduce((sum, r) => sum + r.outer.length + r.holes.reduce((n, h) => n + h.length, 0), 0);
  for (let ri = 0; ri < candidate.length; ri++) {
    const region = candidate[ri];
    for (let hi = -1; hi < region.holes.length; hi++) {
      const ring = hi < 0 ? region.outer : region.holes[hi], original = [...ring],
        indices = ring.map((_, i) => i);
      while (ring.length > maximum && work < 20000000) {
        const n = ring.length, choices = ring.map((p, i) => {
          const previous = (i + n - 1) % n, next = (i + 1) % n, a = ring[previous], c = ring[next];
          let error = 0;
          for (let j = (indices[previous] + 1) % original.length; j !== indices[next]; j = (j + 1) % original.length)
            error = Math.max(error, dist2(original[j], a, c));
          return {i, error, area: Math.abs((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x))};
        }).sort((a, b) => a.error - b.error || a.area - b.area || a.i - b.i);
        let removed = false;
        for (const {i} of choices) {
          work += vertices;
          if (work >= 20000000) break;
          if (!canRemoveBoundaryVertex(candidate, ri, hi, i)) continue;
          ring.splice(i, 1); indices.splice(i, 1);
          removed = true; break;
        }
        if (!removed) break;
      }
    }
  }
  return candidate;
}
/** Retry less simplification when necessary; never delete rings to meet a budget. */
export function simplifyContours(regions, width, height, tolerancePx=.75, maxCornersPerBoundary=20) {
  if(typeof tolerancePx!=='number' || !Number.isFinite(tolerancePx) || tolerancePx<0 || tolerancePx>4)
    failImport('invalidOptions','Contour tolerance must be between 0 and 4 working-image pixels.');
  if (maxCornersPerBoundary !== null && (!Number.isSafeInteger(maxCornersPerBoundary) || maxCornersPerBoundary < 3 || maxCornersPerBoundary > 4096))
    failImport('invalidOptions','The corner target must be an integer between 3 and 4096, or null to disable it.');
  const scale=100/Math.max(width,height), attempts=[...new Set([tolerancePx,tolerancePx/2,tolerancePx/4,0])];
  let lastError;
  for(const tolerance of attempts) {
    const candidate=regions.map(r=>({...r,outer:simplifyRing(r.outer,tolerance),holes:r.holes.map(h=>simplifyRing(h,tolerance))}));
    try {
      // Scale solely for numerical validation, not metric placement. Large photos
      // exceed the model's coordinate bounds if fed to metre validators directly.
      normalizeRegions(mapRegions(candidate,p=>({x:p.x*scale,z:p.z*scale})));
      let reduced = candidate;
      if (maxCornersPerBoundary !== null) {
        const proposed = reduceCorners(candidate, maxCornersPerBoundary);
        try {
          normalizeRegions(mapRegions(proposed,p=>({x:p.x*scale,z:p.z*scale})));
          reduced = proposed;
        } catch { /* Keep the validated original if numerical validation disagrees. */ }
      }
      const boundariesOverCornerTarget = maxCornersPerBoundary === null ? 0 : reduced.reduce((sum, r) =>
        sum + [r.outer, ...r.holes].filter(ring => ring.length > maxCornersPerBoundary).length, 0);
      return {regions:mapRegions(reduced,p=>({x:p.x,z:p.z})),tolerancePx:tolerance,
        maxCornersPerBoundary,boundariesOverCornerTarget};
    } catch(error) {lastError=error;}
  }
  failImport(lastError?.message==='areaTooComplex'?'areaTooComplex':'invalidTopology',
    'The mask exceeds the safe geometry budget or has invalid topology. No holes or regions were dropped.');
}
