// Fence-compatible perimeter construction, plus planar clipping for paving.
const EPS = 1e-8;
export const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
export const polygonArea = (p) =>
  Math.abs(
    p.reduce((a, v, i) => {
      const n = p[(i + 1) % p.length];
      return a + v.x * n.z - n.x * v.z;
    }, 0),
  ) / 2;
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
export function areaGeometry(s) {
  let points;
  if (s.shape === 'custom') {
    if (!Array.isArray(s.areaPoints) || s.areaPoints.length < 3 || s.areaPoints.length > 64)
      throw new Error('invalidArea');
    points = s.areaPoints.map((p) => ({ x: Number(p?.x), z: Number(p?.z) }));
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)))
      throw new Error('invalidArea');
  } else if (!s.shape || s.shape === 'rectangle')
    points = [
      { x: 0, z: 0 },
      { x: s.length, z: 0 },
      { x: s.length, z: s.width },
      { x: 0, z: s.width },
    ];
  else {
    const A = { x: 0, z: 0 },
      B = { x: s.runA, z: 0 },
      heading = Math.PI - (s.angleB * Math.PI) / 180;
    const next = (p, l, h) => ({ x: p.x + l * Math.cos(h), z: p.z + l * Math.sin(h) });
    const C = next(B, s.runB, heading);
    const D =
      s.shape === 'closed4'
        ? { x: C.x - s.runC, z: C.z }
        : next(C, s.runC, heading + Math.PI * 0.4);
    points = [A, B, C, D];
    if (s.shape === 'closed5') points.push(next(D, s.runD, heading + Math.PI * 0.8));
  }
  const n = points.length;
  const onSegment = (a, b, p) =>
    Math.abs(cross(a, b, p)) < EPS &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.z >= Math.min(a.z, b.z) - EPS &&
    p.z <= Math.max(a.z, b.z) + EPS;
  for (let i = 0; i < n; i++) {
    const a = points[i],
      b = points[(i + 1) % n],
      prev = points[(i + n - 1) % n];
    if (distance(a, b) < 0.1) throw new Error('invalidArea');
    const cosine =
      ((prev.x - a.x) * (b.x - a.x) + (prev.z - a.z) * (b.z - a.z)) /
      (distance(prev, a) * distance(a, b));
    if (Math.abs(cosine) > Math.cos((10 * Math.PI) / 180)) throw new Error('invalidArea');
    for (let j = i + 2; j < n; j++) {
      if ((j + 1) % n === i) continue;
      const c = points[j],
        d = points[(j + 1) % n];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        throw new Error('invalidArea');
    }
  }
  const signed =
    points.reduce((a, p, i) => a + p.x * points[(i + 1) % n].z - p.z * points[(i + 1) % n].x, 0) /
    2;
  if (signed < (s.shape === 'custom' ? 1 : 0.1)) throw new Error('invalidArea');
  const minX = Math.min(...points.map((p) => p.x)),
    minZ = Math.min(...points.map((p) => p.z));
  points = points.map((p) => ({ x: p.x - minX, z: p.z - minZ }));
  const lengths = points.map((p, i) => distance(p, points[(i + 1) % n])),
    width = Math.max(...points.map((p) => p.x)),
    depth = Math.max(...points.map((p) => p.z));
  if (s.shape === 'custom' && (width < 1 || depth < 1 || width > 20 || depth > 20))
    throw new Error('invalidArea');
  return {
    points,
    lengths,
    area: signed,
    perimeter: lengths.reduce((a, b) => a + b, 0),
    width,
    depth,
  };
}

export function triangulate(points) {
  const remaining = points.map((_, i) => i),
    triangles = [];
  while (remaining.length > 3) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = points[remaining[(i + remaining.length - 1) % remaining.length]],
        b = points[remaining[i]],
        c = points[remaining[(i + 1) % remaining.length]];
      if (cross(a, b, c) <= EPS) continue;
      if (
        remaining.some((k) => {
          const p = points[k];
          return (
            p !== a &&
            p !== b &&
            p !== c &&
            cross(a, b, p) >= -EPS &&
            cross(b, c, p) >= -EPS &&
            cross(c, a, p) >= -EPS
          );
        })
      )
        continue;
      triangles.push([a, b, c]);
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error('invalidArea');
  }
  triangles.push(remaining.map((i) => points[i]));
  return triangles;
}

export function clipRect(points, x, z, l, w) {
  let result = points;
  for (const [axis, bound, sign] of [
    ['x', x, 1],
    ['x', x + l, -1],
    ['z', z, 1],
    ['z', z + w, -1],
  ]) {
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length],
        da = (a[axis] - bound) * sign,
        db = (b[axis] - bound) * sign;
      if (da >= -EPS) result.push(a);
      if (da >= -EPS !== db >= -EPS) {
        const t = da / (da - db);
        result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
  }
  return result.filter((p, i) => distance(p, result[(i + 1) % result.length]) > EPS);
}
// Outward miter joins follow the actual outline; disabled neighbours get square ends.
export function polygonCurbs(s, c, g) {
  const p = g.points,
    n = p.length;
  const directions = p.map((a, i) => {
    const b = p[(i + 1) % n],
      length = distance(a, b);
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  });
  const normal = (d) => ({ x: d.z * c.width, z: -d.x * c.width });
  function outer(i, side, neighbour) {
    const v = p[i],
      d = directions[side],
      o = normal(d);
    if (!s.edges[neighbour]) return { x: v.x + o.x, z: v.z + o.z };
    const e = directions[neighbour],
      q = normal(e),
      den = d.x * e.z - d.z * e.x;
    const t = ((q.x - o.x) * e.z - (q.z - o.z) * e.x) / den;
    return { x: v.x + o.x + t * d.x, z: v.z + o.z + t * d.z };
  }
  const result = [];
  for (let i = 0; i < n; i++)
    if (s.edges[i]) {
      const a = p[i],
        b = p[(i + 1) % n],
        d = directions[i];
      const band = [a, outer(i, i, (i + n - 1) % n), outer((i + 1) % n, i, (i + 1) % n), b];
      const local = band.map((v) => ({
        x: (v.x - a.x) * d.x + (v.z - a.z) * d.z,
        z: (v.x - a.x) * d.z - (v.z - a.z) * d.x,
      }));
      const low = Math.min(...local.map((v) => v.x)),
        high = Math.max(...local.map((v) => v.x));
      for (let start = low; start < high - EPS; start += c.length) {
        const poly = clipRect(local, start, 0, Math.min(c.length, high - start), c.width);
        if (poly.length < 3 || polygonArea(poly) < EPS) continue;
        const polygon = poly.map((v) => ({
          x: a.x + v.x * d.x + v.z * d.z,
          z: a.z + v.x * d.z - v.z * d.x,
        }));
        result.push({ side: i, polygon, runLength: Math.min(c.length, high - start) });
      }
    }
  return result;
}
