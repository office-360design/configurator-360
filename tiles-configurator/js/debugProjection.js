/** Read-only homogeneous clipping. Matrix arrays use Three.js column-major order.
 * This layer uses the CURRENT calibrated photo view, including manual correction;
 * it never applies an old model pose to draw the client's edited boundaries.
 */
const multiply = (m, p) => [0, 1, 2, 3].map(r => m[r]*p[0] + m[r+4]*p[1] + m[r+8]*p[2] + m[r+12]*p[3]);
const planes = [p => p[3]-1e-8, p => p[0]+p[3], p => p[3]-p[0],
  p => p[1]+p[3], p => p[3]-p[1], p => p[2]+p[3], p => p[3]-p[2]];
const mix = (a,b,t) => a.map((v,i) => v + (b[i]-v)*t);
const screen = (p,view) => ({x:(p[0]/p[3]+1)*view.width/2, y:(1-p[1]/p[3])*view.height/2});
export function groundClipPoint(point, view) {
  if (!view?.hasCalibration || !view.projection || !view.view) return null;
  const p = multiply(view.projection, multiply(view.view,
    [point.x-view.origin.x, view.groundY, point.z-view.origin.z, 1]));
  return p.every(Number.isFinite) ? p : null;
}
export function projectDebugRing(ring, view) {
  let polygon = ring.map(p => groundClipPoint(p, view));
  if (polygon.some(p => !p)) return [];
  for (const plane of planes) {
    const input = polygon; polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i+1)%input.length], da = plane(a), db = plane(b);
      if (da >= 0) polygon.push(a);
      if ((da >= 0) !== (db >= 0)) polygon.push(mix(a,b,da/(da-db)));
    }
    if (!polygon.length) break;
  }
  return polygon.map(p => screen(p,view));
}
export function projectDebugSegment(a,b,view) {
  a = groundClipPoint(a,view); b = groundClipPoint(b,view);
  if (!a || !b) return null;
  for (const plane of planes) {
    const da = plane(a), db = plane(b);
    if (da < 0 && db < 0) return null;
    if ((da >= 0) !== (db >= 0)) {
      const p = mix(a,b,da/(da-db)); if (da < 0) a=p; else b=p;
    }
  }
  return [screen(a,view),screen(b,view)];
}
export function debugGridSegments(design, view) {
  // Bound work independently of untrusted/distant contours. This is a local
  // metric grid, not a claim about gravity or physically verified scale.
  const p=(design?.areaRegions || []).flatMap(r=>r.outer);
  let x0=-5,x1=5,z0=-5,z1=5;
  if (p.length) { x0=Math.floor(Math.min(...p.map(p=>p.x)))-2; x1=Math.ceil(Math.max(...p.map(p=>p.x)))+2;
    z0=Math.floor(Math.min(...p.map(p=>p.z)))-2; z1=Math.ceil(Math.max(...p.map(p=>p.z)))+2; }
  if (x1-x0>100) x1=x0+100; if (z1-z0>100) z1=z0+100;
  const out=[];
  for(let x=x0;x<=x1;x++) {const s=projectDebugSegment({x,z:z0},{x,z:z1},view);if(s)out.push(s);}
  for(let z=z0;z<=z1;z++) {const s=projectDebugSegment({x:x0,z},{x:x1,z},view);if(s)out.push(s);}
  return out;
}
