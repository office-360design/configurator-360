import { layoutDrainageEdges, edgeOutward } from './drainageLayout.js?v=drainage-49';
import * as THREE from 'three';
import { presetRoofLayout } from './presetLayout.js?v=layout-21';
import { defaultLayout, layoutBounds } from './roofLayout.js?v=layout-21';

// Perimeter drainage follows saved placements, or recommended eaves and valley
// outlets. Coordinates match the rendered roof model.
export function drainageRuns(state) {
  if (['custom', 'sketch'].includes(state.roofType)) return [];
  const layout = state.roofType === 'layout' ? state.roofLayout || defaultLayout() : presetRoofLayout(state);
  const bounds = layoutBounds(layout);
  const cx = state.roofType === 'layout' ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cz = state.roofType === 'layout' ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const runs = layoutDrainageEdges(layout).filter(edge => edge.gutter || edge.pipes?.length).map(edge => {
    const point = id => { const p = layout.vertices[id]; return {x:p.x-cx,y:state.wallHeight+.05+p.h,z:p.z-cz}; };
    return {a:point(edge.a),b:point(edge.b),outward:edgeOutward(layout,edge.a,edge.b),gutter:edge.gutter,pipes:edge.pipes};
  });
  // Merge consecutive collinear eave sections before placing downpipes.
  for (let i = 0; i < runs.length && runs.length > 1;) {
    const a = runs[i], j = (i+1)%runs.length, b = runs[j];
    if (a.gutter && b.gutter && a.pipes == null && b.pipes == null && Math.hypot(a.b.x-b.a.x,a.b.y-b.a.y,a.b.z-b.a.z) < .001 &&
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
    if (run.gutter) {
    const gutter = add(new THREE.ExtrudeGeometry(section,{depth:length,bevelEnabled:false,curveSegments:12}), `gutter-${index}`);
    gutter.position.copy(a); gutter.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
    }
    const positions = run.pipes ? run.pipes.map(t => Math.max(.04,Math.min(length-.04,t*length))) : !run.gutter ? [] : state.drainagePosition === 'start' ? [.12] : state.drainagePosition === 'end' ? [length-.12] : [.12,length-.12];
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
