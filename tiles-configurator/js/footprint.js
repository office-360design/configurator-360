import { cross, polygonArea, triangulate } from './area.js';
export function normalizeFootprint(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 64) return null;
  let p = value.map((v) => ({ x: Number(v?.x), z: Number(v?.z) }));
  if (p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.z))) return null;
  if (Math.hypot(p[0].x - p.at(-1).x, p[0].z - p.at(-1).z) < 1e-7) p.pop();
  if (p.length < 3) return null;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) return null;
    for (let j = i + 2; j < p.length; j++) {
      if ((j + 1) % p.length === i) continue;
      const c = p[j],
        d = p[(j + 1) % p.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
        Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
        Math.max(a.z, b.z) >= Math.min(c.z, d.z) &&
        Math.max(c.z, d.z) >= Math.min(a.z, b.z)
      )
        return null;
    }
  }
  const minX = Math.min(...p.map((v) => v.x)),
    minZ = Math.min(...p.map((v) => v.z));
  p = p.map((v) => ({ x: v.x - minX, z: v.z - minZ }));
  const width = Math.max(...p.map((v) => v.x)),
    depth = Math.max(...p.map((v) => v.z));
  if (width < 1 || depth < 1 || width > 20 || depth > 20 || polygonArea(p) < 1) return null;
  if (
    p.reduce((s, v, i) => s + v.x * p[(i + 1) % p.length].z - v.z * p[(i + 1) % p.length].x, 0) < 0
  )
    p.reverse();
  try {
    triangulate(p);
  } catch {
    return null;
  }
  return p;
}

export function mappedFootprint(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) return null;
  const first = geometry[0],
    last = geometry.at(-1);
  if (first.lat !== last.lat || first.lon !== last.lon) return null;
  return normalizeFootprint(
    geometry.map((v) => ({
      x: (v.lon - first.lon) * 111320 * Math.cos((first.lat * Math.PI) / 180),
      z: (first.lat - v.lat) * 111320,
    })),
  );
}

function halfPlane(poly, a, b, inside) {
  const out = [],
    sign = inside ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dp = cross(a, b, p) * sign,
      dq = cross(a, b, q) * sign;
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
    }
  }
  return out;
}
// Each outside strip is emitted once; the remaining inside proceeds to the next edge.
export function subtractFootprint(polygons, triangles) {
  let result = polygons;
  for (const tri of triangles)
    result = result.flatMap((poly) => {
      let inside = poly;
      const outside = [];
      for (let i = 0; i < 3 && inside.length; i++) {
        const a = tri[i],
          b = tri[(i + 1) % 3],
          part = halfPlane(inside, a, b, false);
        if (part.length >= 3 && polygonArea(part) > 1e-9) outside.push(part);
        inside = halfPlane(inside, a, b, true);
      }
      return outside;
    });
  return result;
}
