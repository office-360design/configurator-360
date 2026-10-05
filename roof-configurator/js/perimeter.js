import { cloneLayout, cross, inside, linkedPlanPoints, triangulate, validateLayout } from './roofLayout.js?v=layout-21';

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
