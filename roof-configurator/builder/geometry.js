import {
  validatePolygon,
  triangulate,
  inside,
  signedArea,
  validateLayout,
  onSegment,
  roofSurfaceGroups,
} from "../js/roofLayout.js?v=layout-21";
import { presetRoofLayout } from "../js/presetLayout.js?v=layout-21";
import { outlineLayout, sectionOutline } from "./outline.js?v=builder-game-3";
import { addDormer } from "../js/roofFeatures.js?v=layout-21";
import {
  roofWindowGeometry,
  cutRoofWindows,
} from "../js/roofWindows.js?v=windows-24";

const EPS = 1e-7;
export const radians = (degrees) => (degrees * Math.PI) / 180;
export const area = (points) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a.x * b.y - b.x * a.y;
    }, 0),
  ) / 2;
const signed = (points) =>
  points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;
const ring = (points) => (signed(points) < 0 ? [...points].reverse() : points);
export function clip(points, value) {
  const out = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length],
      da = value(a),
      db = value(b);
    if (da >= -EPS) out.push({ ...a });
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db),
        p = {};
      for (const key of Object.keys(a))
        if (typeof a[key] === "number") p[key] = a[key] + t * (b[key] - a[key]);
      out.push(p);
    }
  });
  return clean(out);
}
function clean(points) {
  return points.filter(
    (p, i) =>
      Math.hypot(
        p.x - points[(i + points.length - 1) % points.length].x,
        p.y - points[(i + points.length - 1) % points.length].y,
      ) > EPS,
  );
}
export function subtractConvex(points, cuts) {
  let pending = points;
  const output = [];
  for (const cut of cuts) {
    if (!pending.length) break;
    const outside = clip(pending, (p) => -cut(p));
    if (outside.length >= 3 && area(outside) > EPS) output.push(outside);
    pending = clip(pending, cut);
  }
  return output;
}
function polygonCuts(points) {
  const polygon = ring(points);
  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
}
export function shapePoints(part) {
  let points;
  if (part.vertices) points = part.vertices.map((p) => ({ ...p }));
  else if (part.shape === "triangle")
    points = [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.offset, y: part.depth },
    ];
  else if (part.shape === "trapezoid")
    points = [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.offset + part.top, y: part.depth },
      { x: part.offset, y: part.depth },
    ];
  else
    points = [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.depth },
      { x: 0, y: part.depth },
    ];
  if (
    points.length > 100 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error("invalidOutline");
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  points = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  if (
    Math.max(...points.map((p) => p.x)) > 40 ||
    Math.max(...points.map((p) => p.y)) > 40
  )
    throw new Error("sizeLimit");
  validatePolygon(points.map((p) => ({ x: p.x, z: p.y })));
  for (const [edge, length] of Object.entries(part.constraints)) {
    const a = points[Number(edge)],
      b = points[(Number(edge) + 1) % points.length];
    if (
      !a ||
      !Number.isFinite(length) ||
      Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - length) > 0.001
    )
      throw new Error("lockedMeasurement");
  }
  for (const [diagonal, length] of Object.entries(part.diagonals || {})) {
    const [i, j] = diagonal.split(":").map(Number),
      a = points[i],
      b = points[j];
    if (!a || !b || Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - length) > 0.001)
      throw new Error("lockedMeasurement");
  }
  return ring(points);
}
export function setEdgeLength(part, edge, length) {
  if (!Number.isFinite(length) || length < 0.05 || length > 40)
    throw new Error("sizeLimit");
  const points = shapePoints(part),
    a = points[edge],
    next = (edge + 1) % points.length,
    b = points[next];
  const scale = length / Math.hypot(b.x - a.x, b.y - a.y);
  points[next] = { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale };
  part.vertices = points;
  part.shape = "custom";
  part.constraints[edge] = length;
  const size = bounds(shapePoints(part));
  part.width = size.width;
  part.depth = size.height;
  return part;
}
export function nextDiagonalCorner(part) {
  const points = shapePoints(part);
  for (let i = 2; i < points.length - 1; i++)
    if (!part.diagonals?.["0:" + i]) return i;
  return null;
}
export function setDiagonal(part, length, corner = 2) {
  const points = shapePoints(part);
  if (
    points.length < 4 ||
    !Number.isInteger(corner) ||
    corner < 2 ||
    corner >= points.length - 1
  )
    throw new Error("diagonalNeedsCorners");
  if (!Number.isFinite(length) || length < 0.05 || length > 57)
    throw new Error("sizeLimit");
  const sides = points.map((a, i) =>
    Math.hypot(
      a.x - points[(i + 1) % points.length].x,
      a.y - points[(i + 1) % points.length].y,
    ),
  );
  const output = [
    { x: 0, y: 0 },
    { x: sides[0], y: 0 },
  ];
  // A fan of measured diagonals determines the angles without a coordinate form.
  // Remaining radii retain the current suggested outline until measured.
  for (let i = 2; i < points.length; i++) {
    const radius =
      i === corner
        ? length
        : i === points.length - 1
          ? sides.at(-1)
          : (part.diagonals?.["0:" + i] ??
            Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y));
    const previous = output[i - 1],
      d = Math.hypot(previous.x, previous.y),
      side = sides[i - 1];
    const along = (radius * radius + d * d - side * side) / (2 * d),
      height2 = radius * radius - along * along;
    if (height2 < -1e-7) throw new Error("lockedMeasurement");
    const oldA = {
        x: points[i - 1].x - points[0].x,
        y: points[i - 1].y - points[0].y,
      },
      oldB = { x: points[i].x - points[0].x, y: points[i].y - points[0].y };
    const sign = oldA.x * oldB.y - oldA.y * oldB.x < 0 ? -1 : 1,
      height = sign * Math.sqrt(Math.max(0, height2));
    output.push({
      x: (along * previous.x - height * previous.y) / d,
      y: (along * previous.y + height * previous.x) / d,
    });
  }
  part.vertices = output;
  part.shape = "custom";
  part.diagonals = { ...part.diagonals, ["0:" + corner]: length };
  const size = bounds(shapePoints(part));
  part.width = size.width;
  part.depth = size.height;
  return part;
}
export function localLayout(part) {
  if (part.kind === "imported")
    return structuredClone(validateLayout(part.layout));
  if (
    part.footprint ||
    part.ridgeAcross ||
    part.slopeReversed ||
    part.waterEdge !== undefined ||
    part.roofAxisAngle !== undefined
  )
    return outlineLayout(part);
  return presetRoofLayout({
    roofType: part.kind,
    length: part.width,
    depth: part.depth,
    pitch: part.pitch,
    overhang: 0,
    wallHeight: 3,
  });
}
function rotate(p, angle) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
export function boardPoint(part, p) {
  const q = rotate({ x: p.x, y: -p.y }, radians(part.rotation));
  return { x: part.x + q.x, y: part.z + q.y };
}
export function localBoardPoint(part, p) {
  const q = rotate(
    { x: p.x - part.x, y: p.y - part.z },
    -radians(part.rotation),
  );
  return { x: q.x, y: -q.y };
}
export function extendSection(part, edge, distance = 2) {
  if (
    !["gable", "hip", "shed"].includes(part.kind) ||
    !Number.isInteger(edge) ||
    edge < 0 ||
    edge > 3 ||
    !Number.isFinite(distance) ||
    distance <= 0
  )
    throw Error("invalidOutline");
  const dx = edge === 3 ? -distance : 0,
    dz = edge === 0 ? -distance : 0,
    angle = radians(part.rotation);
  part.x += dx * Math.cos(angle) - dz * Math.sin(angle);
  part.z += dx * Math.sin(angle) + dz * Math.cos(angle);
  part[edge % 2 === 0 ? "depth" : "width"] += distance;
  return part;
}
function worldPoint(part, p) {
  const q = rotate({ x: p.x, y: p.z }, radians(part.rotation));
  return { x: q.x + part.x, y: q.y + part.z, h: p.h + part.eave };
}
function basis(points) {
  const a = points[0],
    b = points[1],
    c = points.find(
      (p) =>
        Math.abs((b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)) > EPS,
    );
  if (!c) throw new Error("invalidOutline");
  const determinant = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(determinant) < EPS) throw new Error("invalidOutline");
  const sx =
    ((b.h - a.h) * (c.y - a.y) - (c.h - a.h) * (b.y - a.y)) / determinant;
  const sz =
    ((b.x - a.x) * (c.h - a.h) - (c.x - a.x) * (b.h - a.h)) / determinant;
  const gradient = Math.hypot(sx, sz),
    scale = Math.hypot(1, gradient),
    dx = gradient > EPS ? sx / gradient : 0,
    dz = gradient > EPS ? sz / gradient : -1;
  const height = (p) => a.h + sx * (p.x - a.x) + sz * (p.y - a.y);
  const flatten = (p) => ({
    x: p.x * dz - p.y * dx,
    y: (p.x * dx + p.y * dz + p.h * gradient) / scale,
  });
  const raw = points.map(flatten),
    minX = Math.min(...raw.map((p) => p.x)),
    minY = Math.min(...raw.map((p) => p.y));
  const toLocal = (p) => {
    const q = flatten(p);
    return { x: q.x - minX, y: q.y - minY };
  };
  const constant = a.h - sx * a.x - sz * a.y;
  const toWorld = (p) => {
    const u = p.x + minX,
      v = (p.y + minY - (constant * gradient) / scale) / scale;
    const q = { x: u * dz + v * dx, y: -u * dx + v * dz };
    return { ...q, h: height(q) };
  };
  return {
    height,
    toLocal,
    toWorld,
    pitch: (Math.atan(gradient) * 180) / Math.PI,
    normal: { x: -sx / scale, y: 1 / scale, z: -sz / scale },
    across: { x: dz, y: -dx },
    uphill: { x: dx, y: dz },
  };
}
function partFaces(part) {
  if (part.kind === "measured") {
    const original = shapePoints(part),
      angle = radians(part.downhill),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const canonical = original.map((p) => ({
      x: p.x * c + p.y * s,
      y: -p.x * s + p.y * c,
    }));
    const minX = Math.min(...canonical.map((p) => p.x)),
      minY = Math.min(...canonical.map((p) => p.y));
    const outline = ring(
      canonical.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    );
    const theta = radians(part.pitch || 0),
      rot = radians(part.rotation);
    const originalToLocal = (p) => ({
      x: p.x * c + p.y * s - minX,
      y: -p.x * s + p.y * c - minY,
    });
    const toBoard = (p) =>
      boardPoint(part, {
        x: (p.x + minX) * c - (p.y + minY) * s,
        y: (p.x + minX) * s + (p.y + minY) * c,
      });
    const toWorld = (p) => {
      const a = p.x + minX,
        v = p.y + minY;
      const q = rotate(
        {
          x: a * c - v * s * Math.cos(theta),
          y: -a * s - v * c * Math.cos(theta),
        },
        rot,
      );
      return {
        x: part.x + q.x,
        y: part.z + q.y,
        h: part.eave + v * Math.sin(theta),
      };
    };
    return [
      {
        id: part.id + ":0",
        role: "0",
        part,
        outline,
        polygons: [outline],
        pitch: part.pitch,
        assembled: part.pitch !== null,
        toWorld,
        original,
        board: original.map((p) => boardPoint(part, p)),
        toBoard,
        originalToLocal,
        toLocalBoard: (p) => originalToLocal(localBoardPoint(part, p)),
        normal: part.pitch === null ? null : basis(outline.map(toWorld)).normal,
      },
    ];
  }
  let layout = localLayout(part);
  const originX = Math.min(...layout.vertices.map((p) => p.x)),
    originZ = Math.min(...layout.vertices.map((p) => p.z));
  layout.vertices.forEach((p) => {
    p.x -= originX;
    p.z -= originZ;
  });
  layout.roofWindows?.forEach((w) => {
    w.x -= originX;
    w.z -= originZ;
  });
  const roles = layout.builderRoles || layout.faces.map((_, i) => String(i));
  if (part.kind === "imported") {
    const groups = roofSurfaceGroups(layout);
    layout.faces.forEach((ids, i) => {
      const tri = triangulate(ids, layout.vertices)[0];
      roles[i] = String(
        groups.findIndex((g) =>
          g.triangles.some((t) => tri.every((v) => t.includes(v))),
        ),
      );
    });
  }
  const localFrames = new Map(),
    worldFrames = new Map();
  layout.faces.forEach((ids, i) => {
    const role = roles[i];
    if (!localFrames.has(role)) {
      localFrames.set(
        role,
        basis(
          ids.map((id) => ({
            x: layout.vertices[id].x,
            y: layout.vertices[id].z,
            h: layout.vertices[id].h,
          })),
        ),
      );
      worldFrames.set(
        role,
        basis(ids.map((id) => worldPoint(part, layout.vertices[id]))),
      );
    }
  });
  for (const dormer of part.dormers) {
    const role = String(dormer.faceIndex || 0),
      frame = localFrames.get(role);
    if (!frame) throw new Error("chooseFace");
    const point = frame.toWorld({ x: dormer.x, y: dormer.y });
    const host = layout.faces.findIndex(
      (ids, i) =>
        roles[i] === role &&
        inside(
          { x: point.x, z: point.y },
          ids.map((id) => layout.vertices[id]),
        ),
    );
    if (host < 0) throw new Error("openingOutside");
    const before = layout.faces.length;
    const result = addDormer(layout, {
      faceIndex: host,
      x: point.x,
      z: point.y,
      width: dormer.width,
      wallRise: dormer.wallRise || 0.6,
      pitch: dormer.pitch || 30,
    });
    layout = result.layout;
    for (let i = before; i < layout.faces.length; i++) roles[i] = role;
    roles[result.roofFaces[0]] = "d-" + dormer.id + "-left";
    roles[result.roofFaces[1]] = "d-" + dormer.id + "-right";
  }
  const grouped = new Map();
  const importedWindows = layout.roofWindows ? roofWindowGeometry(layout) : [];
  layout.faces.forEach((ids, i) => {
    const points = ids.map((id) => {
      const p = worldPoint(part, layout.vertices[id]);
      return { x: p.x, y: p.y, h: p.h };
    });
    const triangles = triangulate(ids, layout.vertices).map((ids) =>
      ids.map((id) => {
        const p = worldPoint(part, layout.vertices[id]);
        return { x: p.x, y: p.y, h: p.h };
      }),
    );
    const role = roles[i];
    if (!grouped.has(role)) {
      const frame = worldFrames.get(role) || basis(points);
      grouped.set(role, {
        id: part.id + ":" + role,
        role,
        part,
        ...frame,
        assembled: true,
        worldPolygons: [],
        board: points,
      });
    }
    const windows = importedWindows.map((w) => ({
      ...w,
      x: worldPoint(part, { x: w.x, z: w.z, h: 0 }).x,
      z: worldPoint(part, { x: w.x, z: w.z, h: 0 }).y,
      across: {
        x:
          w.across.x * Math.cos(radians(part.rotation)) -
          w.across.z * Math.sin(radians(part.rotation)),
        z:
          w.across.x * Math.sin(radians(part.rotation)) +
          w.across.z * Math.cos(radians(part.rotation)),
      },
      uphill: {
        x:
          w.uphill.x * Math.cos(radians(part.rotation)) -
          w.uphill.z * Math.sin(radians(part.rotation)),
        z:
          w.uphill.x * Math.sin(radians(part.rotation)) +
          w.uphill.z * Math.cos(radians(part.rotation)),
      },
      normal: {
        x:
          w.normal.x * Math.cos(radians(part.rotation)) -
          w.normal.z * Math.sin(radians(part.rotation)),
        y: w.normal.y,
        z:
          w.normal.x * Math.sin(radians(part.rotation)) +
          w.normal.z * Math.cos(radians(part.rotation)),
      },
      group: w.group,
    }));
    windows.forEach((w, i) => {
      const p = worldPoint(part, importedWindows[i].corners[0]);
      w.group = {
        constant: w.normal.x * p.x + w.normal.y * p.h + w.normal.z * p.y,
      };
    });
    grouped.get(role).worldPolygons.push(
      ...triangles.flatMap((triangle) =>
        cutRoofWindows(
          triangle.map((p) => ({ x: p.x, z: p.y, h: p.h })),
          windows,
        ).map((poly) => poly.map((p) => ({ x: p.x, y: p.z, h: p.h }))),
      ),
    );
  });
  return [...grouped.values()].map((f) => ({
    ...f,
    toBoard: (p) => {
      const q = f.toWorld(p);
      return { x: q.x, y: q.y };
    },
    toLocalBoard: (p) => f.toLocal({ ...p, h: f.height(p) }),
  }));
}
// Openings keep their physical position when the sheet/uphill axis is changed.
// Rotation is in the face's surface plane, independent of the board rotation.
export function openingCorners(opening) {
  const angle = radians(opening.rotation || 0),
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => {
    const x = (u * opening.width) / 2,
      y = (v * opening.length) / 2;
    return { x: opening.x + x * c - y * s, y: opening.y + x * s + y * c };
  });
}
export function changeDownhill(part, value) {
  if (!Number.isFinite(value)) throw new Error("numberInvalid");
  if (part.kind !== "measured") {
    part.downhill = value;
    return;
  }
  const before = partFaces(part)[0],
    old = part.downhill;
  const centres = part.openings.map((o) => before.toBoard(o));
  part.downhill = value;
  const after = partFaces(part)[0];
  part.openings.forEach((o, i) => {
    const centre = after.toLocalBoard(centres[i]);
    o.x = centre.x;
    o.y = centre.y;
    o.rotation = ((o.rotation || 0) + old - value) % 360;
  });
}
function boundarySegments(polygons) {
  const points = [...new Map(polygons.flat().map((p) => [key(p), p])).values()],
    edges = new Map();
  for (const polygon of polygons)
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const between = points
        .filter((p) =>
          onSegment({ x: p.x, z: p.y }, { x: a.x, z: a.y }, { x: b.x, z: b.y }),
        )
        .sort(
          (p, q) =>
            Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y),
        );
      for (let j = 0; j + 1 < between.length; j++) {
        const x = between[j],
          y = between[j + 1],
          reverse = key(y) + ":" + key(x);
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(key(x) + ":" + key(y), [x, y]);
      }
    }
  return [...edges.values()];
}
const key = (p) => Math.round(p.x * 1e7) + "," + Math.round(p.y * 1e7);
export function boundaryRings(polygons) {
  const edges = boundarySegments(polygons),
    rings = [];
  while (edges.length) {
    const first = edges.shift(),
      points = [first[0]],
      start = key(first[0]);
    let current = first[1],
      steps = 0;
    while (key(current) !== start && steps++ < 1000) {
      points.push(current);
      const index = edges.findIndex((edge) => key(edge[0]) === key(current));
      if (index < 0) throw new Error("invalidOutline");
      current = edges.splice(index, 1)[0][1];
    }
    if (points.length >= 3 && area(points) > EPS) rings.push(points);
  }
  return rings;
}
export function resolveProject(project) {
  const faces = project.parts.flatMap(partFaces),
    triangles = faces
      .filter((f) => f.worldPolygons)
      .flatMap((f) =>
        f.worldPolygons.map((polygon) => ({
          face: f,
          polygon,
          cuts: polygonCuts(polygon),
        })),
      );
  for (const face of faces) {
    if (face.worldPolygons) {
      let polygons = face.worldPolygons;
      for (const other of triangles) {
        if (other.face.part.id === face.part.id) continue;
        const difference = (p) => other.face.height(p) - face.height(p);
        const tie = other.face.part.id < face.part.id;
        polygons = polygons.flatMap((poly) => {
          const differences = poly.map(difference);
          if (
            differences.every((v) => v < EPS) &&
            (!tie || differences.some((v) => Math.abs(v) > EPS))
          )
            return [poly];
          const cuts = [
            ...other.cuts,
            (p) => difference(p) - (tie ? 0 : EPS * 2),
          ];
          return subtractConvex(poly, cuts);
        });
      }
      face.polygons = polygons.map((poly) => ring(poly.map(face.toLocal)));
      face.boardPolygons = polygons;
    } else face.boardPolygons = [face.board];
    const openings = face.part.openings.filter((o) => o.faceId === face.id);
    for (const opening of openings) {
      const rectangle = openingCorners(opening);
      const covered = face.polygons.reduce((sum, poly) => {
        let p = poly;
        for (const cut of polygonCuts(rectangle)) p = clip(p, cut);
        return sum + area(p);
      }, 0);
      if (Math.abs(covered - opening.width * opening.length) > 1e-6)
        throw new Error("openingOutside");
      face.polygons = face.polygons.flatMap((poly) =>
        subtractConvex(poly, polygonCuts(rectangle)),
      );
    }
    face.rings = face.polygons.length ? boundaryRings(face.polygons) : [];
    face.area = face.polygons.reduce((sum, poly) => sum + area(poly), 0);
    face.label =
      face.part.name +
      (face.part.kind === "measured"
        ? ""
        : "." +
          (Number.isInteger(Number(face.role))
            ? Number(face.role) + 1
            : "D" +
              (2 *
                ((face.part.dormers.find((d) =>
                  face.role.startsWith("d-" + d.id + "-"),
                )?.labelOrdinal ||
                  face.part.dormers.findIndex((d) =>
                    face.role.startsWith("d-" + d.id + "-"),
                  ) + 1) -
                  1) +
                (face.role.endsWith("left") ? 1 : 2))));
    face.openings = openings;
    face.bounds = bounds(face.polygons.flat());
    face.edges = boundarySegments(face.polygons);
    face.edgeAnnotations = [];
    const measured = face.part.kind === "measured",
      raw = measured ? face.original : sectionOutline(face.part);
    for (const [index, role] of Object.entries(face.part.edgeRoles)) {
      if (role === "unmarked") continue;
      const a = raw[Number(index)],
        b = raw[(Number(index) + 1) % raw.length];
      if (!a || !b) continue;
      const mapped = measured
        ? [a, b].map(face.originalToLocal)
        : [a, b].map((p) => {
            const q = rotate(p, radians(face.part.rotation));
            return face.toLocalBoard({
              x: q.x + face.part.x,
              y: q.y + face.part.z,
            });
          });
      const [p, q] = mapped;
      for (const edge of face.edges)
        if (
          edge.every((v) =>
            onSegment(
              { x: v.x, z: v.y },
              { x: p.x, z: p.y },
              { x: q.x, z: q.y },
            ),
          )
        )
          face.edgeAnnotations.push({ role, edge });
    }
  }
  const visible = faces.filter((f) => f.area > EPS),
    folds = [],
    adjacentParts = new Set();
  resolveMeasuredConnections(project, visible);
  const worldEdges = visible
    .filter((f) => f.assembled)
    .flatMap((f) =>
      f.edges.map((edge) => ({ face: f, edge: edge.map(f.toWorld) })),
    );
  for (let i = 0; i < worldEdges.length; i++)
    for (let j = i + 1; j < worldEdges.length; j++) {
      const a = worldEdges[i],
        b = worldEdges[j];
      if (a.face.id === b.face.id) continue;
      const overlap = edgeOverlap(a.edge, b.edge);
      if (!overlap) continue;
      const edge = overlap.a,
        otherEdge = overlap.b;
      adjacentParts.add([a.face.part.id, b.face.part.id].sort().join("|"));
      if (edge.some((p, k) => Math.abs(p.h - otherEdge[k].h) > 1e-5)) {
        if (a.face.part.id !== b.face.part.id)
          folds.push({
            type: "heightStep",
            edge: edge.map((p, k) => (p.h > otherEdge[k].h ? p : otherEdge[k])),
            lower: edge.map((p, k) =>
              p.h > otherEdge[k].h ? otherEdge[k] : p,
            ),
            faces: [a.face.id, b.face.id],
          });
        continue;
      }
      if (
        a.face.normal &&
        b.face.normal &&
        Math.hypot(
          a.face.normal.x - b.face.normal.x,
          a.face.normal.y - b.face.normal.y,
          a.face.normal.z - b.face.normal.z,
        ) < 1e-6
      )
        continue;
      const mid = {
        x: (edge[0].x + edge[1].x) / 2,
        y: (edge[0].y + edge[1].y) / 2,
      };
      const tangent = { x: edge[1].x - edge[0].x, y: edge[1].y - edge[0].y },
        length = Math.hypot(tangent.x, tangent.y);
      const side = {
        x: (-tangent.y / length) * 0.01,
        y: (tangent.x / length) * 0.01,
      };
      const difference =
        a.face.height && b.face.height
          ? a.face.height({ x: mid.x + side.x, y: mid.y + side.y }) -
            b.face.height({ x: mid.x + side.x, y: mid.y + side.y })
          : 1;
      folds.push({
        type:
          a.face.part.id !== b.face.part.id && difference > 0
            ? "valley"
            : Math.abs(edge[0].h - edge[1].h) > 0.001
              ? "hip"
              : "ridge",
        edge,
        faces: [a.face.id, b.face.id],
      });
    }
  const issues = visible
    .filter((f) => !f.assembled)
    .map((f) => ({
      partId: f.part.id,
      faceId: f.id,
      message: f.pitch === null ? "pitchMissing" : "assemblyIncomplete",
    }));
  for (const connection of project.connections.filter(
    (c) => c.type === "section",
  )) {
    if (!adjacentParts.has([connection.from, connection.to].sort().join("|")))
      issues.push({ partId: connection.to, message: "connectionIncomplete" });
  }
  return {
    faces: visible,
    folds,
    area: visible.reduce((sum, f) => sum + f.area, 0),
    unassembled: visible.filter((f) => !f.assembled).map((f) => f.id),
    issues,
  };
}
function edgeOverlap(a, b) {
  const dx = a[1].x - a[0].x,
    dy = a[1].y - a[0].y,
    l2 = dx * dx + dy * dy;
  if (l2 < EPS) return null;
  if (
    b.some(
      (p) =>
        Math.abs(dx * (p.y - a[0].y) - dy * (p.x - a[0].x)) >
        1e-5 * Math.sqrt(l2),
    )
  )
    return null;
  const project = (p) => ((p.x - a[0].x) * dx + (p.y - a[0].y) * dy) / l2,
    ends = b.map(project),
    lo = Math.max(0, Math.min(...ends)),
    hi = Math.min(1, Math.max(...ends));
  if (hi - lo < 1e-6 || ends[0] <= ends[1]) return null;
  const interpolate = (edge, t) => ({
    x: edge[0].x + (edge[1].x - edge[0].x) * t,
    y: edge[0].y + (edge[1].y - edge[0].y) * t,
    h: edge[0].h + (edge[1].h - edge[0].h) * t,
  });
  return {
    a: [lo, hi].map((t) => interpolate(a, t)),
    b: [lo, hi].map((t) => interpolate(b, (t - ends[0]) / (ends[1] - ends[0]))),
  };
}
const vec = (p) => [p.x, p.h, p.y],
  point = (v) => ({ x: v[0], h: v[1], y: v[2] });
const add = (a, b) => a.map((x, i) => x + b[i]),
  sub = (a, b) => a.map((x, i) => x - b[i]),
  mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
function axisRotate(v, axis, angle) {
  return add(
    add(mul(v, Math.cos(angle)), mul(cross(axis, v), Math.sin(angle))),
    mul(axis, dot(axis, v) * (1 - Math.cos(angle))),
  );
}
function resolveMeasuredConnections(project, faces) {
  const pending = [
      ...project.connections.filter((c) => c.type === "measured-edge"),
    ],
    done = new Set(),
    targets = new Set();
  for (const c of pending) {
    if (targets.has(c.to)) throw new Error("invalidConnection");
    targets.add(c.to);
  }
  let attempts = 0;
  while (pending.length && attempts++ < pending.length + 200) {
    const index = pending.findIndex(
      (c) => !targets.has(c.from) || done.has(c.from),
    );
    if (index < 0) throw new Error("invalidConnection");
    const connection = pending.splice(index, 1)[0],
      from = faces.find((f) => f.part.id === connection.from),
      to = faces.find((f) => f.part.id === connection.to);
    if (!from || !to) throw new Error("invalidConnection");
    done.add(to.part.id);
    if (from.pitch === null || to.pitch === null) {
      to.assembled = false;
      continue;
    }
    const source = from.original,
      target = to.original,
      a = source[connection.fromEdge],
      b = source[(connection.fromEdge + 1) % source.length],
      c = target[connection.toEdge],
      d = target[(connection.toEdge + 1) % target.length];
    if (!a || !c) throw new Error("invalidConnection");
    const s0 = vec(from.toWorld(from.originalToLocal(b))),
      s1 = vec(from.toWorld(from.originalToLocal(a))),
      t0 = vec(to.toWorld(to.originalToLocal(c))),
      t1 = vec(to.toWorld(to.originalToLocal(d)));
    const u = unit(sub(t1, t0)),
      v = unit(sub(s1, s0));
    if (
      Math.abs(Math.hypot(...sub(s1, s0)) - Math.hypot(...sub(t1, t0))) > 0.001
    )
      throw new Error("edgeLengthMismatch");
    let axis = cross(u, v),
      angle = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (Math.hypot(...axis) < EPS)
      axis = unit(
        Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0]),
      );
    else axis = unit(axis);
    const align = (p) => axisRotate(p, axis, angle),
      normal = align([to.normal.x, to.normal.y, to.normal.z]),
      A = normal[1] - v[1] * dot(v, normal),
      B = cross(v, normal)[1],
      C = v[1] * dot(v, normal),
      r = Math.hypot(A, B),
      wanted = Math.cos(radians(to.pitch));
    if (r < EPS || Math.abs((wanted - C) / r) > 1 + EPS)
      throw new Error("invalidConnection");
    const shift = Math.atan2(B, A),
      span = Math.acos(Math.max(-1, Math.min(1, (wanted - C) / r))),
      choices = [shift + span, shift - span];
    const phi = choices.sort((a, b) => Math.abs(a) - Math.abs(b))[0],
      old = to.toWorld;
    to.toWorld = (p) =>
      point(add(s0, axisRotate(align(sub(vec(old(p)), t0)), v, phi)));
    const n = axisRotate(normal, v, phi);
    to.normal = { x: n[0], y: n[1], z: n[2] };
    to.assembled = from.assembled;
  }
}
export function bounds(points) {
  if (!points.length)
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x)),
    maxY = Math.max(...points.map((p) => p.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
// Filling internal holes on a second height plane lets the unmodified legacy
// validator/planner consume one face. Filler planes are discarded by the adapter.
export function plannerLayout(face) {
  const polygons = mergePolygons(face.polygons),
    rings = boundaryRings(polygons);
  const outers = rings.filter((p) => signed(p) > 0),
    holes = rings.filter((p) => signed(p) < 0);
  if (outers.length !== 1)
    return outers
      .map((outer) => {
        const contained = polygons.filter((poly) =>
          inside(
            { x: poly[0].x, z: poly[0].y },
            outer.map((p) => ({ x: p.x, z: p.y })),
          ),
        );
        return plannerLayout({ polygons: contained });
      })
      .flat();
  const all = [...polygons, ...holes.map(ring)],
    points = all.flat();
  const unique = [...new Map(points.map((p) => [key(p), p])).values()],
    vertices = [],
    faces = [],
    ids = new Map(),
    positions = new Map();
  function vertex(p, h) {
    const k = key(p) + ":" + h;
    if (!ids.has(k)) {
      const id = vertices.length;
      ids.set(k, id);
      vertices.push({ x: p.x, z: p.y, h });
      positions.set(key(p), [...(positions.get(key(p)) || []), id]);
    }
    return ids.get(k);
  }
  all.forEach((poly, index) => {
    const h = index < polygons.length ? 0 : 1,
      face = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const chain = unique
        .filter(
          (p) =>
            onSegment(
              { x: p.x, z: p.y },
              { x: a.x, z: a.y },
              { x: b.x, z: b.y },
            ) && key(p) !== key(b),
        )
        .sort(
          (p, q) =>
            Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y),
        );
      chain.forEach((p) => face.push(vertex(p, h)));
    });
    faces.push(face);
  });
  const boundary = outers[0].map((p) => vertex(p, 0));
  const planLinks = [...positions.values()].filter((ids) => ids.length > 1);
  const layout = {
    version: 1,
    vertices,
    faces,
    boundary,
    ...(planLinks.length ? { planLinks } : {}),
  };
  try {
    return [validateLayout(layout)];
  } catch (error) {
    error.layout = layout;
    throw error;
  }
}
// Collapse triangulation and envelope-cut seams before invoking legacy limits.
// A merge is permitted only when the union has one outer loop and no holes.
export function mergePolygons(input) {
  const polygons = input.map((p) => ring(p));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < polygons.length; i++)
      for (let j = i + 1; j < polygons.length; j++) {
        const loops = boundaryRings([polygons[i], polygons[j]]);
        if (
          loops.length === 1 &&
          new Set(loops[0].map(key)).size === loops[0].length &&
          Math.abs(area(loops[0]) - area(polygons[i]) - area(polygons[j])) <
            1e-6
        ) {
          polygons[i] = loops[0];
          polygons.splice(j, 1);
          changed = true;
          break outer;
        }
      }
  }
  return polygons.map(simplifyRing);
}
function simplifyRing(input) {
  const points = [...input];
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
        dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (
        Math.hypot(b.x - a.x, b.y - a.y) < 1e-6 ||
        (Math.abs(cross) < 1e-7 && dot >= 0)
      ) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return points;
}
export function attachMeasured(project, fromId, fromEdge, toId, toEdge) {
  const from = project.parts.find((p) => p.id === fromId),
    to = project.parts.find((p) => p.id === toId);
  if (
    !from ||
    !to ||
    from === to ||
    from.kind !== "measured" ||
    to.kind !== "measured"
  )
    throw new Error("measuredConnectionOnly");
  const a = shapePoints(from),
    b = shapePoints(to),
    a0 = a[fromEdge],
    a1 = a[(fromEdge + 1) % a.length],
    b0 = b[toEdge],
    b1 = b[(toEdge + 1) % b.length];
  if (
    !a0 ||
    !b0 ||
    Math.abs(
      Math.hypot(a1.x - a0.x, a1.y - a0.y) -
        Math.hypot(b1.x - b0.x, b1.y - b0.y),
    ) > 0.001
  )
    throw new Error("edgeLengthMismatch");
  const world0 = boardPoint(from, a0),
    world1 = boardPoint(from, a1);
  to.rotation =
    ((Math.atan2(world0.y - world1.y, world0.x - world1.x) -
      Math.atan2(-(b1.y - b0.y), b1.x - b0.x)) *
      180) /
    Math.PI;
  const rotated = boardPoint({ ...to, x: 0, z: 0 }, b0);
  to.x = world1.x - rotated.x;
  to.z = world1.y - rotated.y;
  project.connections.push({
    from: from.id,
    fromEdge,
    to: to.id,
    toEdge,
    type: "measured-edge",
  });
  return project;
}
