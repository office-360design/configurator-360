// Serializable roof topology. Coordinates and heights are metres; h is above wall height.
// Shared vertex indices keep adjacent faces watertight when a point is edited.
const EPS = 1e-7;
export const cloneLayout = (layout) => structuredClone(layout);
export const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function signedArea(points) {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.z - q.x * p.z;
  }, 0) / 2;
}
export function onSegment(p, a, b) {
  return Math.abs(cross(a, b, p)) < EPS &&
    p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
    p.z >= Math.min(a.z, b.z) - EPS && p.z <= Math.max(a.z, b.z) + EPS;
}
function intersects(a, b, c, d) {
  return (cross(a, b, c) * cross(a, b, d) < -EPS &&
    cross(c, d, a) * cross(c, d, b) < -EPS) ||
    onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
export function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (onSegment(p, a, b)) return true;
    if ((a.z > p.z) !== (b.z > p.z) &&
      p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}
export function validatePolygon(points) {
  if (points.length < 3 || Math.abs(signedArea(points)) < 0.05) {
    throw new Error('Draw at least three points enclosing 0.05 m² or more.');
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (distance(a, b) < 0.05) throw new Error('Points must be at least 5 cm apart.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) {
        throw new Error('Edges cannot cross or touch another edge.');
      }
    }
  }
}
export function triangulate(ids, vertices) {
  const ring = [...ids];
  if (signedArea(ring.map(i => vertices[i])) < 0) ring.reverse();
  const triangles = [];
  while (ring.length > 3) {
    let found = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length];
      const b = ring[i], c = ring[(i + 1) % ring.length];
      if (cross(vertices[a], vertices[b], vertices[c]) <= EPS) continue;
      if (ring.some(id => ![a, b, c].includes(id) &&
        inside(vertices[id], [vertices[a], vertices[b], vertices[c]]))) continue;
      triangles.push([a, b, c]);
      ring.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error('This surface cannot be triangulated. Check its points.');
  }
  if (Math.abs(cross(...ring.map(i => vertices[i]))) > EPS) triangles.push(ring);
  return triangles;
}
export function validateLayout(layout) {
  if (!layout || layout.version !== 1 || !Array.isArray(layout.vertices) ||
    !Array.isArray(layout.faces) || !Array.isArray(layout.boundary) ||
    layout.vertices.length > 160 || layout.faces.length > 160 || !layout.faces.length) {
    throw new Error('Invalid roof layout (maximum 160 points and surfaces).');
  }
  layout.vertices.forEach(p => {
    if (!p || ![p.x, p.z, p.h].every(Number.isFinite) ||
      Math.abs(p.x) > 100 || Math.abs(p.z) > 100 || p.h < 0 || p.h > 30) {
      throw new Error('Coordinates must be within ±100 m and heights between 0 and 30 m.');
    }
  });
  const rings = [layout.boundary, ...layout.faces];
  rings.forEach(ids => {
    if (!Array.isArray(ids) || ids.length > 160 || new Set(ids).size !== ids.length ||
      ids.some(i => !Number.isInteger(i) || !layout.vertices[i])) throw new Error('Invalid surface indices.');
    validatePolygon(ids.map(i => layout.vertices[i]));
    triangulate(ids, layout.vertices);
  });
  const boundary = layout.boundary.map(i => layout.vertices[i]);
  if (layout.vertices.some(p => !inside(p, boundary))) throw new Error('Points must stay inside the perimeter.');
  const bounds = layoutBounds(layout);
  if (bounds.maxX - bounds.minX > 40 || bounds.maxZ - bounds.minZ > 40) {
    throw new Error('This editor supports roofs up to 40 × 40 m.');
  }
  const edges = new Map();
  const key = (a, b) => [a, b].sort((x, y) => x - y).join(':');
  layout.faces.forEach(face => face.forEach((a, i) => {
    const k = key(a, face[(i + 1) % face.length]);
    edges.set(k, (edges.get(k) || 0) + 1);
  }));
  layout.boundary.forEach((a, i) => {
    const k = key(a, layout.boundary[(i + 1) % layout.boundary.length]);
    if (edges.get(k) !== 1) throw new Error('The perimeter must enclose all roof surfaces.');
    edges.delete(k);
  });
  if ([...edges.values()].some(n => n !== 2)) throw new Error('Roof surfaces must share complete edges.');
  const total = layout.faces.reduce((sum, face) => sum + Math.abs(signedArea(face.map(i => layout.vertices[i]))), 0);
  if (Math.abs(total - Math.abs(signedArea(boundary))) > 1e-5) throw new Error('Surfaces overlap or leave a gap.');
  // Reject crossing internal edges, including after moving a shared point.
  const segments = [...new Map(layout.faces.flatMap(face => face.map((a, i) => {
    const b = face[(i + 1) % face.length];
    return [key(a, b), [a, b]];
  }))).values()];
  segments.forEach(([a, b], i) => segments.slice(i + 1).forEach(([c, d]) => {
    if ([a, b].some(id => id === c || id === d)) return;
    if (intersects(layout.vertices[a], layout.vertices[b], layout.vertices[c], layout.vertices[d])) {
      throw new Error('Roof surface edges cannot cross.');
    }
  }));
  return layout;
}
export function footprintLayout(points) {
  const vertices = points.map(p => ({ x: p.x, z: p.z, h: 0 }));
  const boundary = vertices.map((_, i) => i);
  return validateLayout({ version: 1, vertices, boundary, faces: [[...boundary]] });
}
export function defaultLayout() {
  return {
    version: 1,
    vertices: [
      { x: -5, z: -3.5, h: 0 }, { x: 5, z: -3.5, h: 0 },
      { x: 5, z: 0, h: 2 }, { x: 5, z: 3.5, h: 0 },
      { x: -5, z: 3.5, h: 0 }, { x: -5, z: 0, h: 2 },
    ],
    boundary: [0, 1, 2, 3, 4, 5],
    faces: [[0, 1, 2, 5], [5, 2, 3, 4]],
  };
}
// Insert an edge point into every incident face, preserving shared topology.
export function insertPoint(layout, point) {
  const existing = layout.vertices.findIndex(p => distance(p, point) < EPS);
  if (existing >= 0) return existing;
  let height;
  const rings = [layout.boundary, ...layout.faces];
  const id = layout.vertices.length;
  rings.forEach(ring => {
    for (let i = 0; i < ring.length; i++) {
      const a = layout.vertices[ring[i]], b = layout.vertices[ring[(i + 1) % ring.length]];
      if (!onSegment(point, a, b)) continue;
      height = a.h + (b.h - a.h) * distance(a, point) / distance(a, b);
      ring.splice(i + 1, 0, id);
      break;
    }
  });
  if (height === undefined) throw new Error('Start and finish the dividing line on a surface edge.');
  layout.vertices.push({ x: point.x, z: point.z, h: height });
  return id;
}
export function splitSurface(source, path) {
  if (path.length < 2) throw new Error('Choose the start and end of a dividing line.');
  const layout = cloneLayout(source);
  const start = insertPoint(layout, path[0]);
  const end = insertPoint(layout, path.at(-1));
  if (start === end) throw new Error('Choose different start and end points.');
  const index = layout.faces.findIndex(face => face.includes(start) && face.includes(end) &&
    path.slice(1, -1).every(p => inside(p, face.map(i => layout.vertices[i]))));
  if (index < 0) throw new Error('Divide one surface at a time.');
  const face = layout.faces[index];
  const a = face.indexOf(start), b = face.indexOf(end);
  const walk = (from, to) => {
    const result = [face[from]];
    for (let i = (from + 1) % face.length; i !== to; i = (i + 1) % face.length) result.push(face[i]);
    result.push(face[to]);
    return result;
  };
  const middle = path.slice(1, -1).map(p => {
    layout.vertices.push({ x: p.x, z: p.z, h: (layout.vertices[start].h + layout.vertices[end].h) / 2 });
    return layout.vertices.length - 1;
  });
  layout.faces.splice(index, 1, [...walk(a, b), ...[...middle].reverse()], [...walk(b, a), ...middle]);
  return validateLayout(layout);
}
export function layoutBounds(layout) {
  const xs = layout.vertices.map(p => p.x), zs = layout.vertices.map(p => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
export function layoutMetrics(layout) {
  validateLayout(layout);
  let roofArea = 0;
  const triangles = layout.faces.flatMap(face => triangulate(face, layout.vertices));
  triangles.forEach(ids => {
    const [a, b, c] = ids.map(i => layout.vertices[i]);
    const u = [b.x - a.x, b.h - a.h, b.z - a.z];
    const v = [c.x - a.x, c.h - a.h, c.z - a.z];
    roofArea += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  });
  return { triangles, roofArea, footprint: Math.abs(signedArea(layout.boundary.map(i => layout.vertices[i]))) };
}

// A predictable two-slope starter, clipped to the user's perimeter. Splitting
// every interior ridge interval also handles concave outlines with several wings.
export function pitchedFootprint(points, pitch = 30) {
  let layout = footprintLayout(points);
  if (!Number.isFinite(pitch) || pitch < 5 || pitch > 60) {
    throw new Error('Starter pitch must be between 5° and 60°.');
  }
  const bounds = layoutBounds(layout);
  const across = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ ? 'z' : 'x';
  const along = across === 'z' ? 'x' : 'z';
  const values = points.map(p => p[across]);
  const low = Math.min(...values), high = Math.max(...values);
  const middle = (low + high) / 2;
  const halfSpan = (high - low) / 2;
  const slope = Math.tan(pitch * Math.PI / 180);
  if (halfSpan * slope > 30) throw new Error('Reduce the pitch to keep the roof height within 30 m.');
  const crossings = [];
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    if (Math.abs(a[across] - middle) < EPS) crossings.push({ x: a.x, z: a.z });
    if ((a[across] - middle) * (b[across] - middle) < -EPS) {
      const t = (middle - a[across]) / (b[across] - a[across]);
      crossings.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
    }
  });
  crossings.sort((a, b) => a[along] - b[along]);
  const unique = crossings.filter((p, i) => !i || distance(p, crossings[i - 1]) > EPS);
  for (let i = 0; i + 1 < unique.length; i++) {
    const a = unique[i], b = unique[i + 1];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const onBoundary = points.some((p, j) => onSegment(mid, p, points[(j + 1) % points.length]));
    if (inside(mid, points) && !onBoundary) layout = splitSurface(layout, [a, b]);
  }
  layout.vertices.forEach(p => {
    p.h = Math.max(0, halfSpan - Math.abs(p[across] - middle)) * slope;
  });
  return validateLayout(layout);
}
