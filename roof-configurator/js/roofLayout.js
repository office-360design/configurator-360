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
  if (layout.planLinks !== undefined) {
    if (!Array.isArray(layout.planLinks) || layout.planLinks.length > 160) {
      throw new Error('Invalid split-point links.');
    }
    const used = new Set();
    const canonical = layout.vertices.map((_, id) => id);
    layout.planLinks.forEach(ids => {
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 160 || ids.some(id =>
        !Number.isInteger(id) || !layout.vertices[id] || used.has(id))) {
        throw new Error('Invalid or overlapping split-point links.');
      }
      ids.forEach(id => {
        if (used.has(id) || distance(layout.vertices[id], layout.vertices[ids[0]]) > EPS) {
          throw new Error('Split points must remain aligned in plan.');
        }
        used.add(id);
        canonical[id] = ids[0];
      });
    });
    const plain = { ...layout };
    delete plain.planLinks;
    plain.faces = layout.faces.map(face => face.map(id => canonical[id]));
    plain.boundary = layout.boundary.map(id => canonical[id]);
    validateLayout(plain);
    return layout;
  }
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
  if (existing >= 0) {
    return linkedPlanPoints(layout, existing).includes(point.id) ? point.id : existing;
  }
  const rings = [layout.boundary, ...layout.faces];
  const copies = new Map();
  const key = (a, b) => [a, b].sort((x, y) => x - y).join(':');
  rings.forEach(ring => {
    for (let i = 0; i < ring.length; i++) {
      const aId = ring[i], bId = ring[(i + 1) % ring.length];
      const a = layout.vertices[aId], b = layout.vertices[bId];
      if (!onSegment(point, a, b)) continue;
      const edgeKey = key(aId, bId);
      if (!copies.has(edgeKey)) {
        copies.set(edgeKey, layout.vertices.length);
        layout.vertices.push({ x: point.x, z: point.z,
          h: a.h + (b.h - a.h) * distance(a, point) / distance(a, b) });
      }
      ring.splice(i + 1, 0, copies.get(edgeKey));
      break;
    }
  });
  if (!copies.size) throw new Error('Start and finish the dividing line on a surface edge.');
  if (copies.size > 1) linkPlanPoints(layout, [...copies.values()]);
  return (point.edgeIds && copies.get(key(...point.edgeIds))) ?? [...copies.values()][0];
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

// Two perpendicular hipped wings share a level ridge and drain toward a
// continuous eaves line. The re-entrant corner joins the ridge bend by a valley.
export function lShapedLayout() {
  const ridgeHeight = 2 * Math.tan(Math.PI / 6);
  return validateLayout({
    version: 1,
    vertices: [
      { x: -5, z: -4, h: 0 },
      { x: 5, z: -4, h: 0 },
      { x: 5, z: 0, h: 0 },
      { x: 0, z: 0, h: 0 },
      { x: 0, z: 4, h: 0 },
      { x: -5, z: 4, h: 0 },
      { x: -2.5, z: -2, h: ridgeHeight },
      { x: 3, z: -2, h: ridgeHeight },
      { x: -2.5, z: 1.5, h: ridgeHeight },
    ],
    boundary: [0, 1, 2, 3, 4, 5],
    faces: [
      [0, 1, 7, 6], // Main wing, outside slope.
      [1, 2, 7], // Main wing hip.
      [2, 3, 6, 7], // Main wing, valley side.
      [3, 4, 8, 6], // Return wing, valley side.
      [4, 5, 8], // Return wing hip.
      [5, 0, 6, 8], // Return wing, outside slope.
    ],
  });
}

// Rendering patches share one plane even when editing/topology splits that
// plane into several faces. Only the patch perimeter is a physical roof edge.
export function roofSurfaceGroups(layout) {
  const renderId = id => linkedPlanPoints(layout, id).find(other =>
    Math.abs(layout.vertices[other].h - layout.vertices[id].h) < EPS);
  const triangles = layout.faces.flatMap(face => triangulate(face, layout.vertices))
    .map(triangle => triangle.map(renderId));
  const groups = [];
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(id => layout.vertices[id]);
    const u = { x: b.x - a.x, y: b.h - a.h, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.h - a.h, z: c.z - a.z };
    const normal = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const length = Math.hypot(normal.x, normal.y, normal.z);
    const sign = normal.y < 0 ? -1 : 1;
    for (const axis of ['x', 'y', 'z']) normal[axis] *= sign / length;
    const constant = normal.x * a.x + normal.y * a.h + normal.z * a.z;
    let group = groups.find(candidate =>
      Math.hypot(candidate.normal.x - normal.x, candidate.normal.y - normal.y,
        candidate.normal.z - normal.z) < 1e-8 &&
      Math.abs(candidate.constant - constant) < 1e-7);
    if (!group) {
      group = { normal, constant, triangles: [], boundary: [] };
      groups.push(group);
    }
    group.triangles.push(triangle);
  }
  groups.forEach(group => {
    const edges = new Map();
    group.triangles.forEach(triangle => triangle.forEach((a, index) => {
      const b = triangle[(index + 1) % triangle.length];
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }));
    group.boundary = [...edges.values()];
    group.patches = mergeConvexPatches(group.triangles, layout.vertices);
  });
  return groups;
}

// Render convex coplanar regions as whole polygons. Besides reducing geometry,
// this avoids introducing a second tessellation through curved tile profiles.
function mergeConvexPatches(triangles, vertices) {
  const patches = triangles.map(triangle => [...triangle]);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < patches.length; i++) {
      for (let j = i + 1; j < patches.length; j++) {
        const a = patches[i], b = patches[j];
        for (let edge = 0; edge < a.length; edge++) {
          const start = a[edge], end = a[(edge + 1) % a.length];
          const reverse = b.findIndex((id, k) => id === end && b[(k + 1) % b.length] === start);
          if (reverse < 0) continue;
          const merged = [
            ...Array.from({ length: a.length }, (_, k) => a[(edge + 1 + k) % a.length]),
            ...Array.from({ length: b.length - 2 }, (_, k) => b[(reverse + 2 + k) % b.length]),
          ];
          if (new Set(merged).size !== merged.length) continue;
          const convex = merged.every((id, k) => cross(vertices[id],
            vertices[merged[(k + 1) % merged.length]],
            vertices[merged[(k + 2) % merged.length]]) >= -EPS);
          if (!convex) continue;
          patches[i] = merged;
          patches.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return patches;
}

// The editable perimeter remains the roof edge. Offset the supporting walls
// inward in plan, retaining collinear points where a gable meets its ridge.
export function layoutWallFootprint(layout, requested = 0) {
  const ring = layout.boundary.map(id => layout.vertices[id]);
  const winding = Math.sign(signedArea(ring));
  const segmentDistance = (p, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  };
  function offset(amount) {
    const result = ring.map((p, i) => {
      const previous = ring[(i + ring.length - 1) % ring.length];
      const next = ring[(i + 1) % ring.length];
      const a = distance(previous, p), b = distance(p, next);
      const n1 = { x: winding * (previous.z - p.z) / a, z: winding * (p.x - previous.x) / a };
      const n2 = { x: winding * (p.z - next.z) / b, z: winding * (next.x - p.x) / b };
      const denominator = 1 + n1.x * n2.x + n1.z * n2.z;
      if (denominator < EPS) throw new Error('Overhang corner is too sharp.');
      return { x: p.x + amount * (n1.x + n2.x) / denominator,
        z: p.z + amount * (n1.z + n2.z) / denominator };
    });
    validatePolygon(result);
    if (Math.sign(signedArea(result)) !== winding) throw new Error('Collapsed wall footprint.');
    result.forEach((p, i) => {
      const q = result[(i + 1) % result.length];
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((q.x - p.x) * (b.x - a.x) + (q.z - p.z) * (b.z - a.z) <= EPS) {
        throw new Error('Collapsed wall edge.');
      }
      for (const sample of [p, { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }]) {
        if (!inside(sample, ring) || ring.some((v, j) =>
          segmentDistance(sample, v, ring[(j + 1) % ring.length]) < amount - EPS)) {
          throw new Error('Overhang exceeds the footprint.');
        }
      }
    });
    return result;
  }
  const target = Math.max(0, Math.min(1.2, Number(requested) || 0));
  try { return { points: offset(target), overhang: target }; } catch { /* Limit narrow layouts. */ }
  let low = 0, high = target;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    try { offset(mid); low = mid; } catch { high = mid; }
  }
  const overhang = Math.floor(low * 1000) / 1000;
  return { points: offset(overhang), overhang };
}

// Split each wall at every roof plane transition so its top follows gables,
// hips and valleys without cutting across a change of slope.
export function layoutWallSegments(layout, footprint) {
  const triangles = layout.faces.flatMap(face => triangulate(face, layout.vertices))
    .map(ids => ids.map(id => layout.vertices[id]));
  const height = (p, triangle) => {
    if (!triangle) throw new Error('Wall lies outside the roof.');
    const [a, b, c] = triangle;
    const area = cross(a, b, c);
    return (cross(p, b, c) * a.h + cross(a, p, c) * b.h + cross(a, b, p) * c.h) / area;
  };
  return footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const cuts = [0, 1];
    triangles.forEach(triangle => triangle.forEach((c, j) => {
      const d = triangle[(j + 1) % 3];
      const ex = d.x - c.x, ez = d.z - c.z;
      const det = dx * ez - dz * ex;
      if (Math.abs(det) < EPS) return;
      const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / det;
      const u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / det;
      if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) cuts.push(t);
    }));
    cuts.sort((x, y) => x - y);
    const positions = cuts.filter((t, j) => !j || t - cuts[j - 1] > EPS)
      .map(t => ({ x: a.x + dx * t, z: a.z + dz * t }));
    return positions.slice(1).map((p, j) => {
      const q = positions[j];
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      const triangle = triangles.find(t => inside(mid, t));
      return [q, p].map(point => ({ ...point, h: height(point, triangle) }));
    });
  });
}

function compactLayout(layout) {
  const used = new Set([...layout.boundary, ...layout.faces.flat()]);
  const ids = [...used].sort((a, b) => a - b);
  const remap = ring => ring.map(id => ids.indexOf(id));
  const next = { ...layout, vertices: ids.map(id => layout.vertices[id]),
    boundary: remap(layout.boundary), faces: layout.faces.map(remap) };
  if (layout.planLinks) next.planLinks = layout.planLinks
    .map(group => group.filter(id => used.has(id))).filter(group => group.length > 1).map(remap);
  return validateLayout(next);
}

// Trace the outside of adjoining faces after dissolving their shared edges.
function mergeLayoutFaces(layout, indices) {
  const edges = new Map();
  indices.forEach(index => {
    const face = layout.faces[index];
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length];
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    });
  });
  const remaining = [...edges.values()];
  const ring = [remaining[0][0]];
  while (remaining.length) {
    const index = remaining.findIndex(edge => edge.includes(ring.at(-1)));
    if (index < 0) throw new Error('These surfaces cannot be merged into one closed surface.');
    const [a, b] = remaining.splice(index, 1)[0];
    const next = a === ring.at(-1) ? b : a;
    if (next === ring[0]) {
      if (remaining.length) throw new Error('Deleting this would leave a hole in the roof.');
      break;
    }
    ring.push(next);
  }
  layout.faces = layout.faces.filter((_, i) => !indices.includes(i));
  layout.faces.push(ring);
}

export function deleteLayoutEdge(source, a, b) {
  const next = cloneLayout(source);
  const incident = next.faces.flatMap((face, index) => face.some((id, i) =>
    (id === a && face[(i + 1) % face.length] === b) ||
    (id === b && face[(i + 1) % face.length] === a)) ? [index] : []);
  if (incident.length !== 2) {
    throw new Error('The outer perimeter must stay closed. Delete a point to reshape it; only dividing edges can be removed.');
  }
  mergeLayoutFaces(next, incident);
  return compactLayout(next);
}

export function deleteLayoutPoint(source, id) {
  if (linkedPlanPoints(source, id).length > 1) {
    throw new Error('This point belongs to a split connection. Undo the split before deleting it.');
  }
  if (!Number.isInteger(id) || !source.vertices[id]) throw new Error('Select a point first.');
  if (source.boundary.includes(id) && source.boundary.length <= 3) {
    throw new Error('The roof perimeter needs at least three points.');
  }
  const next = cloneLayout(source);
  next.boundary = next.boundary.filter(vertex => vertex !== id);
  next.faces = next.faces.map(face => face.filter(vertex => vertex !== id));
  // Removing an edge subdivision preserves the adjoining surfaces when possible.
  try { return compactLayout(next); } catch { /* A junction needs its faces merged. */ }
  const merged = cloneLayout(source);
  const incident = merged.faces.flatMap((face, index) => face.includes(id) ? [index] : []);
  mergeLayoutFaces(merged, incident);
  merged.boundary = merged.boundary.filter(vertex => vertex !== id);
  merged.faces = merged.faces.map(face => face.filter(vertex => vertex !== id));
  return compactLayout(merged);
}

// Explicit plan links permit coincident points with independent heights.
// They never weld heights; they only preserve the closed plan topology.
export function linkedPlanPoints(layout, id) {
  return layout.planLinks?.find(ids => ids.includes(id)) || [id];
}

export function moveLayoutPoint(layout, id, point) {
  linkedPlanPoints(layout, id).forEach(linked => {
    layout.vertices[linked].x = point.x;
    layout.vertices[linked].z = point.z;
  });
  layout.vertices[id].h = point.h;
}

function linkPlanPoints(layout, ids) {
  const existing = layout.planLinks || [];
  const joined = new Set(ids);
  existing.filter(group => group.some(id => joined.has(id)))
    .forEach(group => group.forEach(id => joined.add(id)));
  layout.planLinks = [...existing.filter(group => !group.some(id => joined.has(id))), [...joined]];
}

export function selectionSurfaces(layout, ids) {
  return layout.faces.flatMap((face, index) => {
    const matches = ids.length === 1 ? face.includes(ids[0]) : face.some((a, i) => {
      const b = face[(i + 1) % face.length];
      return (a === ids[0] && b === ids[1]) || (a === ids[1] && b === ids[0]);
    });
    return matches ? [index] : [];
  });
}

export function splitLayoutInPlace(source, ids, detachedFaces) {
  validateLayout(source);
  if (![1, 2].includes(ids.length) || new Set(ids).size !== ids.length) {
    throw new Error('Select a shared point or edge.');
  }
  const incident = selectionSurfaces(source, ids);
  if (incident.length < 2) throw new Error('This selection is already independent or lies on the outer perimeter.');
  if (!detachedFaces.length || detachedFaces.length >= incident.length ||
    new Set(detachedFaces).size !== detachedFaces.length || detachedFaces.some(i => !incident.includes(i))) {
    throw new Error('Choose at least one adjoining surface and leave at least one on the original side.');
  }
  const next = cloneLayout(source);
  const copies = ids.map(id => {
    const copy = next.vertices.length;
    next.vertices.push({ ...next.vertices[id] });
    linkPlanPoints(next, [id, copy]);
    return copy;
  });
  detachedFaces.forEach(index => {
    next.faces[index] = next.faces[index].map(id => ids.includes(id) ? copies[ids.indexOf(id)] : id);
  });
  return { layout: validateLayout(next), copies };
}

// Each discontinuous shared plan edge creates a vertical closure. If the two
// height profiles cross, split at the crossing instead of making a bow-tie quad.
export function layoutStepWalls(layout) {
  const canonical = id => linkedPlanPoints(layout, id)[0];
  const edges = new Map();
  layout.faces.forEach(face => face.forEach((a, i) => {
    const b = face[(i + 1) % face.length];
    const pair = canonical(a) < canonical(b) ? [a, b] : [b, a];
    const key = pair.map(canonical).join(':');
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(pair.map(id => layout.vertices[id]));
  }));
  const walls = [];
  for (const sides of edges.values()) {
    if (sides.length !== 2) continue;
    const [[a, b], [c, d]] = sides;
    const da = a.h - c.h, db = b.h - d.h;
    if (Math.abs(da) < EPS && Math.abs(db) < EPS) continue;
    const cuts = da * db < 0 ? [0, da / (da - db), 1] : [0, 1];
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t });
    cuts.slice(1).forEach((t, i) => {
      const polygon = [lerp(a, b, cuts[i]), lerp(a, b, t), lerp(c, d, t), lerp(c, d, cuts[i])];
      const unique = polygon.filter((p, j) => !polygon.slice(0, j).some(q =>
        distance(p, q) < EPS && Math.abs(p.h - q.h) < EPS));
      if (unique.length >= 3) walls.push(unique);
    });
  }
  return walls;
}
