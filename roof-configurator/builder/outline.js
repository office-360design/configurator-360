import {
  validatePolygon,
  triangulate,
  signedArea,
  validateLayout,
} from "../js/roofLayout.js?v=layout-21";

// A house outline is a footprint, never a measured roof surface. Clipping
// planar roof pieces keeps concave outlines and surface lengths distinct.
export function sectionOutline(part) {
  if (!part.footprint)
    return [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.depth },
      { x: 0, y: part.depth },
    ];
  const maxX = Math.max(...part.footprint.map((p) => p.x));
  const maxY = Math.max(...part.footprint.map((p) => p.y));
  const result = part.footprint.map((p) => ({
    x: (p.x * part.width) / maxX,
    y: (p.y * part.depth) / maxY,
  }));
  for (const [key, length] of Object.entries(part.constraints || {})) {
    const a = result[Number(key)],
      b = result[(Number(key) + 1) % result.length];
    if (!a || Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - length) > 0.0001)
      throw Error("lockedMeasurement");
  }
  return result;
}
export function normalizeOutline(points) {
  validatePolygon(points.map((p) => ({ x: p.x, z: p.y })));
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  let vertices = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  if (signedArea(vertices.map((p) => ({ x: p.x, z: p.y }))) < 0)
    vertices.reverse();
  return {
    vertices,
    x: minX,
    z: minY,
    width: Math.max(...vertices.map((p) => p.x)),
    depth: Math.max(...vertices.map((p) => p.y)),
  };
}
function cut(poly, evaluate) {
  const out = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length],
      da = evaluate(a),
      db = evaluate(b);
    if (da >= -1e-8) out.push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  });
  return out.filter(
    (p, i) =>
      Math.hypot(
        p.x - out[(i + out.length - 1) % out.length].x,
        p.y - out[(i + out.length - 1) % out.length].y,
      ) > 1e-7,
  );
}
export function outlineLayout(part) {
  const outline = sectionOutline(part),
    slope = Math.tan(((part.pitch || 0) * Math.PI) / 180);
  const points = outline.map((p) => ({ x: p.x, z: p.y }));
  validatePolygon(points);
  let planes;
  const across = !!part.ridgeAcross;
  let extent = across ? part.width : part.depth,
    coordinate = (p) => (across ? p.x : p.y);
  if (part.waterEdge !== undefined) {
    const a = outline[part.waterEdge],
      b = outline[(part.waterEdge + 1) % outline.length];
    if (!a || !b) throw Error("invalidOutline");
    const len = Math.hypot(b.x - a.x, b.y - a.y),
      nx = -(b.y - a.y) / len,
      ny = (b.x - a.x) / len;
    const minimum = Math.min(...outline.map((p) => p.x * nx + p.y * ny));
    coordinate = (p) => p.x * nx + p.y * ny - minimum;
    extent = Math.max(...outline.map(coordinate));
  }
  if (part.roofAxisAngle !== undefined) {
    const angle = (part.roofAxisAngle * Math.PI) / 180,
      nx = Math.cos(angle),
      ny = Math.sin(angle);
    const min = Math.min(...outline.map((p) => p.x * nx + p.y * ny));
    coordinate = (p) => p.x * nx + p.y * ny - min;
    extent = Math.max(...outline.map(coordinate));
  }
  if (part.kind === "hip") {
    // A convex footprint has an exact equal-pitch roof from inward edge planes.
    // Concave hipped roofs need connected wings, rather than guessing valleys.
    if (
      outline.some((a, i) => {
        const b = outline[(i + 1) % outline.length],
          c = outline[(i + 2) % outline.length];
        return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-7;
      })
    )
      throw Error("hipNeedsWings");
    planes = outline.map((a, i) => {
      const b = outline[(i + 1) % outline.length],
        len = Math.hypot(b.x - a.x, b.y - a.y);
      return (p) =>
        (slope * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len;
    });
  } else if (part.kind === "shed") {
    planes = [
      (p) =>
        slope * (part.slopeReversed ? extent - coordinate(p) : coordinate(p)),
    ];
  } else
    planes = [
      (p) => slope * coordinate(p),
      (p) => slope * (extent - coordinate(p)),
    ];
  const vertices = [],
    faces = [],
    builderRoles = [];
  const vertex = (p) => {
    let id = vertices.findIndex(
      (v) => Math.hypot(v.x - p.x, v.z - p.z, v.h - p.h) < 1e-7,
    );
    if (id < 0) {
      id = vertices.length;
      vertices.push(p);
    }
    return id;
  };
  for (const tri of triangulate(
    points.map((_, i) => i),
    points,
  )) {
    for (let role = 0; role < planes.length; role++) {
      let poly = tri.map((i) => outline[i]);
      for (let j = 0; j < planes.length && poly.length >= 3; j++)
        if (j !== role) poly = cut(poly, (p) => planes[j](p) - planes[role](p));
      if (
        poly.length < 3 ||
        Math.abs(signedArea(poly.map((p) => ({ x: p.x, z: p.y })))) < 1e-7
      )
        continue;
      faces.push(
        poly.map((p) => vertex({ x: p.x, z: p.y, h: planes[role](p) })),
      );
      builderRoles.push(String(role));
    }
  }
  const boundary = outline.map((p) =>
    vertex({ x: p.x, z: p.y, h: Math.min(...planes.map((f) => f(p))) }),
  );
  // Clipping introduces T-junctions. Split every shared edge at the same IDs
  // before calling the legacy layout validator or dormer/quantity helpers.
  const split = (ids, boundaryEdge = false) =>
    ids.flatMap((id, i) => {
      const a = vertices[id],
        b = vertices[ids[(i + 1) % ids.length]],
        dx = b.x - a.x,
        dz = b.z - a.z,
        den = dx * dx + dz * dz;
      const hits = vertices
        .map((p, k) => ({
          k,
          t: ((p.x - a.x) * dx + (p.z - a.z) * dz) / den,
          p,
        }))
        .filter(
          ({ p, t }) =>
            t > 1e-7 &&
            t < 1 - 1e-7 &&
            Math.hypot(
              p.x - a.x - t * dx,
              p.z - a.z - t * dz,
              boundaryEdge ? 0 : p.h - a.h - t * (b.h - a.h),
            ) < 1e-6,
        )
        .sort((a, b) => a.t - b.t);
      return [id, ...hits.map((h) => h.k)];
    });
  return validateLayout({
    version: 1,
    vertices,
    boundary: split(boundary, true),
    faces: faces.map((ids) => split(ids)),
    builderRoles,
  });
}
