import { roofSurfaceGroups, inside, signedArea } from './roofLayout.js?v=layout-21';

// Windows are measured in the slope plane, with their long axis uphill.
// Their centres remain in plan coordinates; host planes are resolved after edits.
export function clipWindowPolygon(polygon, value) {
  const result = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const da = value(a), db = value(b);
    if (da >= -1e-9) result.push(a);
    if (da * db < -1e-18) {
      const t = da / (da - db);
      result.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z),
        h: a.h + t * (b.h - a.h) });
    }
  });
  return result;
}

function rectangleCuts(window, margin = 0) {
  const { x, z, width, length, across, uphill, scale } = window;
  const u = p => (p.x - x) * across.x + (p.z - z) * across.z;
  const v = p => ((p.x - x) * uphill.x + (p.z - z) * uphill.z) * scale;
  return [p => u(p) + width / 2 + margin, p => width / 2 + margin - u(p),
    p => v(p) + length / 2 + margin, p => length / 2 + margin - v(p)];
}

export function roofWindowGeometry(layout) {
  const windows = layout.roofWindows || [];
  if (!Array.isArray(windows) || windows.length > 30) throw new Error('Use at most 30 roof windows.');
  const groups = windows.length ? roofSurfaceGroups(layout) : [];
  const result = windows.map((window, index) => {
    const { x, z, width, length } = window;
    if (![x, z, width, length].every(Number.isFinite) || width < .3 || width > 3 || length < .4 || length > 4) {
      throw new Error('Roof window width must be 0.3–3 m and height along the slope 0.4–4 m.');
    }
    const group = groups.find(g => g.triangles.some(ids => inside({ x, z }, ids.map(id => layout.vertices[id]))));
    if (!group) throw new Error(`Window ${index + 1} must be inside a roof slope.`);
    const { normal, constant } = group;
    const sx = -normal.x / normal.y, sz = -normal.z / normal.y;
    const slope = Math.hypot(sx, sz), scale = Math.hypot(1, slope);
    if (slope < .02) throw new Error('Choose a sloping roof surface for the window.');
    const uphill = { x: sx / slope, z: sz / slope };
    const across = { x: uphill.z, z: -uphill.x };
    const height = p => (constant - normal.x * p.x - normal.z * p.z) / normal.y;
    const point = (u, v) => {
      const p = { x: x + across.x * u + uphill.x * v / scale,
        z: z + across.z * u + uphill.z * v / scale };
      return { ...p, h: height(p) };
    };
    const geometry = { ...window, index, group, normal, uphill, across, scale, point,
      corners: [point(-width / 2, -length / 2), point(width / 2, -length / 2),
        point(width / 2, length / 2), point(-width / 2, length / 2)] };
    const cuts = rectangleCuts(geometry, .08);
    const covered = group.triangles.reduce((sum, ids) => {
      let polygon = ids.map(id => layout.vertices[id]);
      cuts.forEach(cut => { polygon = clipWindowPolygon(polygon, cut); });
      return sum + Math.abs(signedArea(polygon)) * scale;
    }, 0);
    if (Math.abs(covered - (width + .16) * (length + .16)) > 1e-6) {
      throw new Error(`Window ${index + 1}: leave 8 cm inside the slope, clear of ridges, valleys and edges.`);
    }
    return geometry;
  });
  result.forEach((a, i) => result.slice(i + 1).forEach(b => {
    let overlap = b.corners;
    rectangleCuts(a, .08).forEach(cut => { overlap = clipWindowPolygon(overlap, cut); });
    if (Math.abs(signedArea(overlap)) > 1e-8) throw new Error('Roof windows must not overlap. Leave at least 8 cm between them.');
  }));
  return result;
}

export function cutRoofWindows(polygon, windows) {
  let pieces = [polygon];
  windows.forEach(window => {
    if (polygon.some(p => Math.abs(window.normal.x * p.x + window.normal.y * p.h +
      window.normal.z * p.z - window.group.constant) > 1e-6)) return;
    pieces = pieces.flatMap(piece => {
      let remainder = piece;
      const outside = [];
      rectangleCuts(window).forEach(cut => {
        const part = clipWindowPolygon(remainder, p => -cut(p));
        if (part.length >= 3 && Math.abs(signedArea(part)) > 1e-9) outside.push(part);
        remainder = clipWindowPolygon(remainder, cut);
      });
      return outside;
    });
  });
  return pieces;
}
