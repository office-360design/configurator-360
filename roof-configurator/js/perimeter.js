import { cloneLayout, cross, signedArea, inside, linkedPlanPoints, triangulate, validateLayout } from './roofLayout.js?v=layout-21';

// Add an exterior triangle to one boundary edge. Existing faces and vertices
// remain untouched, including folded slopes, split connections and windows.
export function extendPerimeter(source, edge, point) {
  const boundary = source.boundary;
  const matches = (a, b) => linkedPlanPoints(source, a).includes(b);
  const index = boundary.findIndex((a, i) => edge?.length === 2 &&
    ((matches(a, edge[0]) && matches(boundary[(i + 1) % boundary.length], edge[1])) ||
     (matches(a, edge[1]) && matches(boundary[(i + 1) % boundary.length], edge[0]))));
  if (index < 0) throw new Error('Choose an outer perimeter edge to extend. Interior dividing edges cannot be extended.');
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) ||
      inside(point, boundary.map(id => source.vertices[id]))) {
    throw new Error('Place the new point outside the current perimeter.');
  }
  const aId = boundary[index], bId = boundary[(index + 1) % boundary.length];
  const face = source.faces.find(ids => ids.some((a, i) =>
    (matches(aId, a) && matches(bId, ids[(i + 1) % ids.length])) ||
    (matches(bId, a) && matches(aId, ids[(i + 1) % ids.length]))));
  const triangle = triangulate(face, source.vertices).find(ids =>
    ids.some(id => matches(aId, id)) && ids.some(id => matches(bId, id)));
  const [a, b, c] = triangle.map(id => source.vertices[id]);
  const height = (cross(point, b, c) * a.h + cross(a, point, c) * b.h + cross(a, b, point) * c.h) / cross(a, b, c);
  const next = cloneLayout(source);
  const id = next.vertices.length;
  next.vertices.push({ x: point.x, z: point.z, h: height });
  next.boundary.splice(index + 1, 0, id);
  const faceA = triangle.find(vertex => matches(aId, vertex));
  const faceB = triangle.find(vertex => matches(bId, vertex));
  next.faces.push([faceA, id, faceB]);
  return { layout: validateLayout(next), id };
}

// Close a concave bay with a chord between two existing boundary vertices.
// Try both boundary paths; only a path that adds area and retains the entire
// existing roof can be accepted. Validation rejects crossing chords and overlaps.
export function connectPerimeterPoints(source, start, end) {
  const indexOf = id => source.boundary.findIndex(vertex => linkedPlanPoints(source, vertex).includes(id));
  const startIndex = indexOf(start), endIndex = indexOf(end);
  if (startIndex < 0 || endIndex < 0) throw new Error('Choose two existing points on the outer perimeter.');
  if (startIndex === endIndex) throw new Error('Choose two different perimeter points.');
  const count = source.boundary.length;
  if ((startIndex + 1) % count === endIndex || (endIndex + 1) % count === startIndex) {
    throw new Error('These points are already connected by a perimeter edge.');
  }
  const path = (from, to) => {
    const ids = [source.boundary[from]];
    for (let i = (from + 1) % count; i !== to; i = (i + 1) % count) ids.push(source.boundary[i]);
    ids.push(source.boundary[to]);
    return ids;
  };
  const originalArea = Math.abs(signedArea(source.boundary.map(id => source.vertices[id])));
  for (const [from, to] of [[startIndex, endIndex], [endIndex, startIndex]]) {
    const next = cloneLayout(source);
    const face = path(from, to).map(id => {
      if (linkedPlanPoints(source, id).includes(start)) return start;
      if (linkedPlanPoints(source, id).includes(end)) return end;
      return id;
    });
    next.boundary = path(to, from);
    next.faces.push(face);
    const area = Math.abs(signedArea(next.boundary.map(id => next.vertices[id])));
    if (area <= originalArea + .000001) continue;
    try { return validateLayout(next); } catch { /* Try the other perimeter path. */ }
  }
  throw new Error('This connection cannot close an outside gap. Choose points across an open corner without crossing the roof or its edges.');
}
