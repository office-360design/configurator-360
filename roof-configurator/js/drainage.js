import * as THREE from 'three';
import { presetRoofLayout } from './presetLayout.js?v=layout-21';
import { defaultLayout, layoutBounds, signedArea } from './roofLayout.js?v=layout-21';

// Only level perimeter edges that receive runoff get gutters. Sloping verges
// and high shed edges are excluded. Coordinates match the rendered roof model.
export function drainageRuns(state) {
  if (['custom', 'sketch'].includes(state.roofType)) return [];
  const layout = state.roofType === 'layout' ? state.roofLayout || defaultLayout() : presetRoofLayout(state);
  const bounds = layoutBounds(layout);
  const cx = state.roofType === 'layout' ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cz = state.roofType === 'layout' ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const orientation = Math.sign(signedArea(layout.boundary.map(id => layout.vertices[id]))) || 1;
  const runs = [];
  layout.boundary.forEach((id, i) => {
    const next = layout.boundary[(i + 1) % layout.boundary.length];
    const a = layout.vertices[id], b = layout.vertices[next];
    if (Math.abs(a.h - b.h) > .01) return;
    const face = layout.faces.find(ids => ids.some((v, j) =>
      (v === id && ids[(j + 1) % ids.length] === next) ||
      (v === next && ids[(j + 1) % ids.length] === id)));
    if (!face || face.some(v => layout.vertices[v].h < a.h - .01)) return;
    const length = Math.hypot(b.x-a.x, b.z-a.z);
    if (length < .25) return;
    const outward = {x:orientation*(b.z-a.z)/length, z:-orientation*(b.x-a.x)/length};
    const point = p => ({x:p.x-cx, y:state.wallHeight+.05+p.h, z:p.z-cz});
    runs.push({a:point(a), b:point(b), outward});
  });
  // Merge consecutive collinear eave sections before placing downpipes.
  for (let i = 0; i < runs.length && runs.length > 1;) {
    const a = runs[i], j = (i+1)%runs.length, b = runs[j];
    if (Math.hypot(a.b.x-b.a.x,a.b.y-b.a.y,a.b.z-b.a.z) < .001 &&
        Math.hypot(a.outward.x-b.outward.x,a.outward.z-b.outward.z) < .001) {
      a.b = b.b; runs.splice(j,1); i = 0;
    } else i++;
  }
  return runs;
}

export function createDrainage(state) {
  const group = new THREE.Group();
  group.name = 'roof-drainage';
  if (!state.showDrainage) return group;
  let runs;
  try { runs = drainageRuns(state); } catch { return group; }
  if (!runs.length) return group;
  const radius = ([80,100,120].includes(state.drainageDiameter) ? state.drainageDiameter : 100) / 2000;
  const material = new THREE.MeshStandardMaterial({color:state.drainageColor === 'roof' ? state.roofColor : '#293544',metalness:.55,roughness:.4,side:THREE.DoubleSide});
  const add = (geometry, name) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  runs.forEach((run, index) => {
    const {outward:n} = run;
    const toVector = p => new THREE.Vector3(p.x+n.x*.065, p.y-.045, p.z+n.z*.065);
    const a = toVector(run.a), b = toVector(run.b);
    const length = a.distanceTo(b), direction = b.clone().sub(a).normalize();
    const gutterRadius = radius * 1.5;
    const section = new THREE.Shape();
    section.absarc(0,0,gutterRadius,Math.PI,Math.PI*2,false);
    section.absarc(0,0,gutterRadius-.005,Math.PI*2,Math.PI,true);
    section.closePath();
    const gutter = add(new THREE.ExtrudeGeometry(section,{depth:length,bevelEnabled:false,curveSegments:12}), `gutter-${index}`);
    gutter.position.copy(a); gutter.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
    const positions = state.drainagePosition === 'start' ? [.12] : state.drainagePosition === 'end' ? [length-.12] : [.12,length-.12];
    positions.forEach((offset, pipeIndex) => {
      const top = a.clone().addScaledVector(direction,offset);
      // Bring the pipe back towards the wall beneath the overhang.
      const inset = Math.max(0, state.overhang - radius - .035);
      const wall = top.clone().add(new THREE.Vector3(-n.x*inset,-.5,-n.z*inset));
      if (wall.y < .4) return;
      const points = [top.clone().add(new THREE.Vector3(0,-gutterRadius,0)),
        top.clone().add(new THREE.Vector3(0,-.22,0)),wall,
        new THREE.Vector3(wall.x,.3,wall.z),new THREE.Vector3(wall.x+n.x*.25,.18,wall.z+n.z*.25)];
      const path = new THREE.CurvePath();
      for(let i=1;i<points.length;i++) path.add(new THREE.LineCurve3(points[i-1],points[i]));
      add(new THREE.TubeGeometry(path,32,radius,12,false),`downpipe-${index}-${pipeIndex}`);
    });
  });
  return group;
}
