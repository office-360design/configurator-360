import { cross, polygonArea, triangulate } from './area.js';

// Clip a polygon against a CCW convex polygon (the site's triangles).
export function clipConvex(points, boundary) {
  let result = points;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i],
      b = boundary[(i + 1) % boundary.length],
      input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        dp = cross(a, b, p),
        dq = cross(a, b, q);
      if (dp >= -1e-10) result.push(p);
      if (dp >= -1e-10 !== dq >= -1e-10) {
        const ratio = dp / (dp - dq);
        result.push({ x: p.x + (q.x - p.x) * ratio, z: p.z + (q.z - p.z) * ratio });
      }
    }
  }
  // A corner lying on the clipping boundary can be emitted both as an
  // intersection and as a retained vertex. Keep one copy for triangulation.
  return result.filter((point, i) => {
    const previous = result[(i + result.length - 1) % result.length];
    return Math.hypot(point.x - previous.x, point.z - previous.z) > 1e-10;
  });
}

// Simplified nominal H profile. Half-staggered rows tessellate exactly;
// the row pitch includes nominal joints and matches WISE's 35 pcs/m².
export function interlockingLayout(s, t, area) {
  const angle = (s.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    toGrid = (p) => ({ x: p.x * cos + p.z * sin, z: -p.x * sin + p.z * cos }),
    toWorld = (p) => ({ x: p.x * cos - p.z * sin, z: p.x * sin + p.z * cos }),
    pitch = 1 / (t.piecesPerM2 * t.length),
    d = t.width - pitch,
    l = t.length,
    w = t.width;
  const outline = [
    [0, 0],
    [l * 0.2, 0],
    [l * 0.3, d],
    [l * 0.7, d],
    [l * 0.8, 0],
    [l, 0],
    [l, w],
    [l * 0.8, w],
    [l * 0.7, pitch],
    [l * 0.3, pitch],
    [l * 0.2, w],
    [0, w],
  ].map(([x, z]) => ({ x, z }));
  const base = triangulate(outline),
    site = triangulate(area.points).map((tri) => tri.map(toGrid)),
    sitePoints = area.points.map(toGrid),
    minX = Math.min(...sitePoints.map((p) => p.x)),
    maxX = Math.max(...sitePoints.map((p) => p.x)),
    minZ = Math.min(...sitePoints.map((p) => p.z)),
    maxZ = Math.max(...sitePoints.map((p) => p.z)),
    result = [],
    j0 = Math.floor((minZ - w) / pitch) - 1,
    j1 = Math.ceil(maxZ / pitch) + 1,
    i0 = Math.floor((minX - l) / l) - 1,
    i1 = Math.ceil(maxX / l) + 1;

  for (let j = j0; j < j1; j++)
    for (let i = i0; i < i1; i++) {
      const x = i * l + ((Math.abs(j) % 2) * l) / 2,
        z = j * pitch;
      if (x + l <= minX || x >= maxX || z + w <= minZ || z >= maxZ) continue;
      const whole = outline.map((p) => ({ x: p.x + x, z: p.z + z }));
      const fragments = base
        .flatMap((tri) => {
          const polygon = tri.map((p) => ({ x: p.x + x, z: p.z + z }));
          return site.map((boundary) => clipConvex(polygon, boundary));
        })
        .filter((p) => p.length >= 3 && polygonArea(p) > 1e-10);
      const net = fragments.reduce((sum, p) => sum + polygonArea(p), 0);
      if (net < 1e-8) continue;
      const cut = net < 1 / t.piecesPerM2 - 1e-8,
        center = toWorld({ x: x + l / 2, z: z + w / 2 });
      result.push({
        x: center.x,
        z: center.z,
        shadeX: center.x,
        shadeZ: center.z,
        l,
        w,
        rotation: s.rotation,
        accent: false,
        cut,
        area: net,
        profile: true,
        outline: whole.map(toWorld),
        fragments: (cut ? fragments : [whole]).map((poly) => poly.map(toWorld)),
      });
    }
  return result;
}
