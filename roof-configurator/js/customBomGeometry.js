import { defaultLayout, layoutMetrics, triangulate, cross } from './roofLayout.js?v=layout-21';
import { defaultSketch, sketchSlopes, sketchEdgeTotals } from './slopeSketch.js?v=sketch-1';

// Quantities are geometric estimates; coplanar seams never require ridge trim.
export function customBomGeometry(state) {
  const lengths = { ridge: 0, gable: 0, eaves: 0, gutterRuns: 0, sideFlashing: 0, valley: 0, ridgeCaps: 0 };
  if (state.roofType === 'sketch') {
    const slopes = sketchSlopes(state.slopeSketch || defaultSketch());
    const edges = sketchEdgeTotals(slopes);
    Object.assign(lengths, { ridge: edges.ridge + edges.hip, gable: edges.gable,
      eaves: edges.eave, sideFlashing: edges.wall + edges.valley, valley: edges.valley });
    lengths.gutterRuns = slopes.reduce((n, s) => n + s.quantity * s.edges.filter(e => e.type === 'eave').length, 0);
    return { roofArea: slopes.reduce((n, s) => n + s.area * s.quantity, 0), lengths };
  }
  const layout = state.roofLayout || defaultLayout();
  const metrics = layoutMetrics(layout);
  const edges = new Map(), ridgeDegrees = new Map();
  for (const face of layout.faces) for (const ids of triangulate(face, layout.vertices)) {
    for (let i = 0; i < 3; i++) {
      const a = ids[i], b = ids[(i + 1) % 3], key = [a, b].sort((a,b) => a-b).join(':');
      if (!edges.has(key)) edges.set(key, { a, b, triangles: [] });
      edges.get(key).triangles.push(ids);
    }
  }
  for (const { a, b, triangles } of edges.values()) {
    const p = layout.vertices[a], q = layout.vertices[b];
    const length = Math.hypot(p.x-q.x, p.z-q.z, p.h-q.h);
    if (triangles.length === 1) {
      const r = layout.vertices[triangles[0].find(id => id !== a && id !== b)];
      if (Math.abs(p.h-q.h) < .01 && r.h >= p.h - .01) {
        lengths.eaves += length; lengths.gutterRuns++;
      } else lengths.gable += length;
    } else if (triangles.length === 2) {
      const [u,v,w] = triangles[0].map(id => layout.vertices[id]);
      const r = layout.vertices[triangles[1].find(id => id !== a && id !== b)];
      const determinant = cross(u,v,w);
      const dx = ((v.h-u.h)*(w.z-u.z)-(w.h-u.h)*(v.z-u.z))/determinant;
      const dz = ((v.x-u.x)*(w.h-u.h)-(w.x-u.x)*(v.h-u.h))/determinant;
      const fold = r.h - (u.h + dx*(r.x-u.x) + dz*(r.z-u.z));
      if (fold < -1e-7) {
        lengths.ridge += length;
        for (const id of [a,b]) ridgeDegrees.set(id, (ridgeDegrees.get(id)||0)+1);
      } else if (fold > 1e-7) { lengths.valley += length; lengths.sideFlashing += length; }
    }
  }
  lengths.ridgeCaps = [...ridgeDegrees.values()].filter(n => n === 1).length;
  return { roofArea: metrics.roofArea, lengths };
}
