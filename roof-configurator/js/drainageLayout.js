import { signedArea } from './roofLayout.js?v=layout-21';

export const drainageBoundaryKey = layout => JSON.stringify([layout.vertices.length, layout.boundary]);

export function recommendedDrainage(layout) {
  const edges = layout.boundary.map((a, i) => {
    const b = layout.boundary[(i + 1) % layout.boundary.length];
    const start = layout.vertices[a], end = layout.vertices[b];
    const face = layout.faces.find(ids => ids.some((id, j) =>
      (id === a && ids[(j+1)%ids.length] === b) || (id === b && ids[(j+1)%ids.length] === a)));
    const gutter = Math.abs(start.h-end.h) < .01 && face && !face.some(id => layout.vertices[id].h < start.h-.01);
    return {a,b,gutter:!!gutter,pipes:null};
  });
  // A valley terminating at a sharp low perimeter corner needs an outlet even
  // when both adjacent roof edges slope. Route those gutters to the low point.
  layout.boundary.forEach((id,i) => {
    const prev = edges[(i+edges.length-1)%edges.length], next = edges[i];
    const p = layout.vertices[id];
    const interiorUphill = layout.faces.some(face => face.includes(id) && face.some(other =>
      !layout.boundary.includes(other) && layout.vertices[other].h > p.h+.01));
    if (interiorUphill && layout.vertices[prev.a].h > p.h+.01 && layout.vertices[next.b].h > p.h+.01) {
      prev.gutter = next.gutter = true;
      prev.pipes = [1]; next.pipes = [];
      prev.valleyOutlet = next.valleyOutlet = true;
    }
  });
  return edges;
}

export function layoutDrainageEdges(layout) {
  const recommended = recommendedDrainage(layout);
  const saved = layout.drainage;
  if (!saved || saved.boundaryKey !== drainageBoundaryKey(layout) || !Array.isArray(saved.edges)) return recommended;
  return recommended.map(edge => {
    const custom = saved.edges.find(item => item.a === edge.a && item.b === edge.b);
    return custom ? {...edge, gutter:!!custom.gutter,
      pipes:Array.isArray(custom.pipes) ? custom.pipes.filter(t=>Number.isFinite(t)&&t>=0&&t<=1).slice(0,20) : null} : edge;
  });
}

export function edgeOutward(layout,a,b) {
  const p = layout.vertices[a], q = layout.vertices[b];
  const length = Math.hypot(q.x-p.x,q.z-p.z) || 1;
  const sign = Math.sign(signedArea(layout.boundary.map(id=>layout.vertices[id]))) || 1;
  return {x:sign*(q.z-p.z)/length,z:-sign*(q.x-p.x)/length};
}
