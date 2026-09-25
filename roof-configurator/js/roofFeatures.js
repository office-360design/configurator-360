import { assembleLayoutPatches } from './presetLayout.js?v=layout-20';
import { cloneLayout, cross, distance, inside, insertPoint, onSegment, signedArea, triangulate, validateLayout } from './roofLayout.js?v=layout-20';

function clip(points, value) {
  const result = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], da = value(a), db = value(b);
    if (da >= -1e-8) result.push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  });
  return result;
}

export function addDormer(source, { faceIndex, x, z, width, wallRise, pitch }) {
  validateLayout(source);
  const face = source.faces[faceIndex];
  if (!face) throw new Error('Choose a roof surface for the dormer.');
  if (![x, z, width, wallRise, pitch].every(Number.isFinite) || width < 0.5 || width > 8 ||
    wallRise < 0.15 || wallRise > 5 || pitch < 5 || pitch > 60) {
    throw new Error('Use a width of 0.5–8 m, front wall rise of 0.15–5 m and pitch of 5–60°.');
  }
  const triangles = triangulate(face, source.vertices);
  const [a, b, c] = triangles[0].map(id => source.vertices[id]);
  const determinant = cross(a, b, c);
  const sx = ((b.h - a.h) * (c.z - a.z) - (c.h - a.h) * (b.z - a.z)) / determinant;
  const sz = ((b.x - a.x) * (c.h - a.h) - (c.x - a.x) * (b.h - a.h)) / determinant;
  const height = p => a.h + sx * (p.x - a.x) + sz * (p.z - a.z);
  if (face.some(id => Math.abs(height(source.vertices[id]) - source.vertices[id].h) > 1e-6)) {
    throw new Error('Choose a planar surface. Divide this folded surface first.');
  }
  const slope = Math.hypot(sx, sz);
  if (slope < 0.02) throw new Error('Choose a sloping roof surface for the dormer.');
  const uphill = { x: sx / slope, z: sz / slope };
  const across = { x: uphill.z, z: -uphill.x };
  const uv = p => ({ u: (p.x - x) * across.x + (p.z - z) * across.z,
    v: (p.x - x) * uphill.x + (p.z - z) * uphill.z });
  const world = (u, v) => ({ x: x + across.x * u + uphill.x * v, z: z + across.z * u + uphill.z * v });
  const half = width / 2, dormerSlope = Math.tan(pitch * Math.PI / 180);
  const base = height({ x, z }), ridge = base + wallRise + dormerSlope * half;
  const eaveDepth = wallRise / slope, ridgeDepth = (ridge - base) / slope;
  const outline = [world(-half, 0), world(0, 0), world(half, 0), world(half, eaveDepth), world(0, ridgeDepth), world(-half, eaveDepth)];
  const polygon = face.map(id => source.vertices[id]);
  // Require the whole footprint to lie strictly within its host surface.
  const margin = 0.08;
  for (const p of outline) {
    if (!inside(p, polygon)) throw new Error('The dormer must fit inside one surface. Move it downhill or reduce its size.');
    for (let i = 0; i < polygon.length; i++) {
      const q = polygon[i], r = polygon[(i + 1) % polygon.length];
      const t = Math.max(0, Math.min(1, ((p.x - q.x) * (r.x - q.x) + (p.z - q.z) * (r.z - q.z)) / distance(q, r) ** 2));
      if (distance(p, { x: q.x + t * (r.x - q.x), z: q.z + t * (r.z - q.z) }) < margin) {
        throw new Error('Leave at least 8 cm between the dormer and surface edges.');
      }
    }
  }
  // Partition the surrounding roof into five regions, leaving no polygon holes.
  const regions = [
    [p => -half - uv(p).u],
    [p => uv(p).u - half],
    [p => uv(p).u + half, p => half - uv(p).u, p => -uv(p).v],
    [p => uv(p).u + half, p => -uv(p).u, p => height(p) - (ridge + dormerSlope * uv(p).u)],
    [p => uv(p).u, p => half - uv(p).u, p => height(p) - (ridge - dormerSlope * uv(p).u)],
  ];
  const patches = [];
  regions.forEach((cuts, plane) => triangles.forEach(ids => {
    let points = ids.map(id => source.vertices[id]);
    cuts.forEach(cut => { points = clip(points, cut); });
    if (points.length >= 3 && Math.abs(signedArea(points)) > 1e-8) patches.push({ points, height, plane });
  }));
  patches.push({ points: [outline[0], outline[1], outline[4], outline[5]], height: p => ridge + dormerSlope * uv(p).u, plane: 5 });
  patches.push({ points: [outline[1], outline[2], outline[3], outline[4]], height: p => ridge - dormerSlope * uv(p).u, plane: 6 });
  const local = assembleLayoutPatches(patches);
  if (Math.abs(Math.abs(signedArea(polygon)) - Math.abs(signedArea(local.boundary.map(id => local.vertices[id])))) > 1e-6) {
    throw new Error('The dormer crosses the surface outline. Choose a wider part of the roof.');
  }
  const layout = cloneLayout(source);
  local.boundary.forEach(id => insertPoint(layout, local.vertices[id]));
  const hostBoundary = [...layout.faces[faceIndex]];
  const mapping = local.vertices.map(p => {
    let id = layout.vertices.findIndex(q => distance(p, q) < 1e-7 && Math.abs(p.h - q.h) < 1e-7);
    if (id < 0) {
      const samePosition = layout.vertices.findIndex(q => distance(p, q) < 1e-7);
      id = layout.vertices.length;
      layout.vertices.push({ ...p });
      if (samePosition >= 0) {
        const group = layout.planLinks?.find(ids => ids.includes(samePosition));
        if (group) group.push(id);
        else (layout.planLinks ||= []).push([samePosition, id]);
      }
    }
    return id;
  });
  const replacements = local.faces.map(ids => ids.flatMap((localId, i) => {
    const aId = mapping[localId], bId = mapping[ids[(i + 1) % ids.length]];
    const a = layout.vertices[aId], b = layout.vertices[bId];
    return [...new Set([aId, ...hostBoundary.filter(id => {
      const p = layout.vertices[id];
      return distance(p, a) > 1e-7 && distance(p, b) > 1e-7 && onSegment(p, a, b) &&
        Math.abs(p.h - (a.h + (b.h - a.h) * distance(a, p) / distance(a, b))) < 1e-7;
    })])].sort((i, j) => distance(a, layout.vertices[i]) - distance(a, layout.vertices[j]));
  }));
  layout.faces.splice(faceIndex, 1, replacements[0]);
  layout.faces.push(...replacements.slice(1));
  validateLayout(layout);
  return { layout, outline, ridgeHeight: ridge, depth: ridgeDepth,
    previewPoint: { ...world(0, ridgeDepth / 2), h: ridge },
    roofFaces: [layout.faces.length - 2, layout.faces.length - 1] };
}
