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
  const endpoint = (run, point) => {
    let nx = run.outward.x, nz = run.outward.z;
    const neighbor = runs.find(other => other !== run && other.gutter && run.gutter &&
      [other.a,other.b].some(p => Math.hypot(p.x-point.x,p.y-point.y,p.z-point.z) < .001));
    if (neighbor) {
      const denominator = 1 + nx*neighbor.outward.x + nz*neighbor.outward.z;
      if (denominator > .2) {
        nx = (nx+neighbor.outward.x)/denominator;
        nz = (nz+neighbor.outward.z)/denominator;
      }
    }
    return new THREE.Vector3(point.x+nx*.065,point.y-.045,point.z+nz*.065);
  };
  runs.forEach((run, index) => {
    const {outward:n} = run;
    const a = endpoint(run,run.a), b = endpoint(run,run.b);
    const length = a.distanceTo(b), direction = b.clone().sub(a).normalize();
    if (length < .05) return;
    // Fix the roll using world up, instead of the shortest arbitrary rotation
    // between two tangents (which can invert the gutter on descending edges).
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    if (right.lengthSq() < .5) return;
    const up = new THREE.Vector3().crossVectors(direction,right).normalize();
    const frame = new THREE.Matrix4().makeBasis(right,up,direction);
    const gutterRadius = radius * 1.5;
    const section = new THREE.Shape();
    section.absarc(0,0,gutterRadius,Math.PI,Math.PI*2,false);
    section.absarc(0,0,gutterRadius-.005,Math.PI*2,Math.PI,true);
    section.closePath();
    if (run.gutter) {
    const gutter = add(new THREE.ExtrudeGeometry(section,{depth:length,bevelEnabled:false,curveSegments:12}), `gutter-${index}`);
    gutter.position.copy(a); gutter.quaternion.setFromRotationMatrix(frame);
    }
    const positions = run.pipes ? run.pipes.map(t => t*length) : !run.gutter ? [] : state.drainagePosition === 'start' ? [.12] : state.drainagePosition === 'end' ? [length-.12] : [.12,length-.12];
    positions.forEach((offset, pipeIndex) => {
      const top = a.clone().addScaledVector(direction,offset);
      // The outlet follows the transformed cross-section, including its
      // horizontal shift on a sloping gutter. Overlap the wall slightly.
      let inlet = top.clone().addScaledVector(up,-gutterRadius+.008);
      const joint = offset < .001 ? run.a : offset > length-.001 ? run.b : null;
      const corner = joint && runs.some(other => other !== run && other.gutter &&
        [other.a,other.b].some(p => Math.hypot(p.x-joint.x,p.y-joint.y,p.z-joint.z) < .001));
      if (corner) {
        const height = gutterRadius * 2;
        const collector = add(new THREE.CylinderGeometry(gutterRadius*1.55,radius,height,20,1,true),`collector-${index}-${pipeIndex}`);
        collector.position.copy(top).add(new THREE.Vector3(0,-height/2,0));
        inlet = top.clone().add(new THREE.Vector3(0,-height+.008,0));
      }
      // Bring the pipe back towards the wall beneath the overhang.
      const inset = Math.max(0, state.overhang - radius - .035);
      const wall = inlet.clone().add(new THREE.Vector3(-n.x*inset,-.5,-n.z*inset));
      if (wall.y < .4) return;
      const points = [inlet,
        inlet.clone().add(new THREE.Vector3(0,-.18,0)),wall,
        new THREE.Vector3(wall.x,.3,wall.z),new THREE.Vector3(wall.x+n.x*.25,.18,wall.z+n.z*.25)];
      const path = new THREE.CurvePath();
      for(let i=1;i<points.length;i++) path.add(new THREE.LineCurve3(points[i-1],points[i]));
      add(new THREE.TubeGeometry(path,32,radius,12,false),`downpipe-${index}-${pipeIndex}`);
    });
  });
  return group;
}
