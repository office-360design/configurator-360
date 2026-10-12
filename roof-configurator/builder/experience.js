import { resolveProject } from "./geometry.js?v=builder-game-3";

// Presentation-only estimated pitch. Survey data and planner inputs are never
// replaced by this clone; unknown measured faces remain explicitly unknown.
export function previewRoof(project) {
  const copy = structuredClone(project);
  for (const part of copy.parts) if (part.pitch === null) part.pitch = 30;
  try {
    return resolveProject(copy);
  } catch {
    return resolveProject(project);
  }
}
export function roofPicture(
  resolved,
  { selected = null, width = 300, height = 190 } = {},
) {
  const faces = resolved.faces.map((f) => ({
    face: f,
    polys: f.rings.map((poly) => poly.map(f.toWorld)),
  }));
  const project = (p) => ({
    x: (p.x - p.y) * 0.85,
    y: (p.x + p.y) * 0.45 - p.h * 0.5,
  });
  const all = faces.flatMap((f) => f.polys.flat().map(project));
  if (!all.length) return "";
  const minX = Math.min(...all.map((p) => p.x)),
    maxX = Math.max(...all.map((p) => p.x)),
    minY = Math.min(...all.map((p) => p.y)),
    maxY = Math.max(...all.map((p) => p.y));
  const scale = Math.min(
    (width - 32) / Math.max(1, maxX - minX),
    (height - 30) / Math.max(1, maxY - minY),
  );
  const point = (p) => {
    const q = project(p);
    return [
      (q.x - (minX + maxX) / 2) * scale + width / 2,
      (q.y - (minY + maxY) / 2) * scale + height / 2,
    ].join(",");
  };
  faces.sort(
    (a, b) =>
      a.polys.flat().reduce((s, p) => s + p.x + p.y, 0) /
        a.polys.flat().length -
      b.polys.flat().reduce((s, p) => s + p.x + p.y, 0) / b.polys.flat().length,
  );
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${faces.map(({ face, polys }) => `<path d="${polys.map((poly) => "M" + poly.map(point).join("L") + "Z").join("")}" fill-rule="evenodd" fill="${face.part.id === selected ? "#0878c9" : face.normal?.z > 0 ? "#647b8d" : "#425867"}" stroke="#fff" stroke-width="1.3"/>`).join("")}</svg>`;
}
export function piecePicture(kind) {
  const project = {
    parts: [
      {
        id: "picture",
        name: "",
        kind,
        x: 0,
        z: 0,
        rotation: 0,
        width: 8,
        depth: 6,
        pitch: 30,
        eave: 0,
        shape: "rectangle",
        top: 4,
        offset: 1,
        vertices: null,
        constraints: {},
        edgeRoles: {},
        openings: [],
        dormers: [],
        productId: "antic",
        finish: "premium",
        colour: "#383e42",
        downhill: 0,
      },
    ],
    connections: [],
  };
  return roofPicture(resolveProject(project), { width: 180, height: 110 });
}
