import { newPart } from "./project.js?v=builder-game-3";
import { resolveProject } from "./geometry.js?v=builder-game-3";

// A tracing aid for the supplied paper sketch. Suggested heights/offsets are
// deliberately not treated as survey data. Only clearly readable edges lock.
export function addPaperSketch(project) {
  const start = project.parts.length
    ? Math.max(
        ...resolveProject(project).faces.flatMap((f) =>
          f.boardPolygons.flat().map((p) => p.x),
        ),
      ) + 2
    : 0;
  const definitions = [
    {
      shape: "custom",
      width: 10,
      depth: 4.2,
      x: 0,
      z: 0,
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 8.2, y: 3.4 },
        { x: 6.5, y: 3.4 },
        { x: 3, y: 4.2 },
      ],
      constraints: { 0: 10 },
    },
    { shape: "triangle", width: 3.66, depth: 2.6, offset: 1.83, x: 12, z: 0 },
    {
      shape: "trapezoid",
      width: 2.1,
      top: 1.7,
      depth: 3,
      offset: 1,
      x: 17,
      z: 0,
    },
    {
      shape: "trapezoid",
      width: 6,
      top: 4,
      depth: 2.5,
      offset: 0.3,
      x: 22,
      z: 0,
    },
    {
      shape: "triangle",
      width: 6.1,
      depth: 3,
      offset: 2.8,
      x: 15,
      z: 7,
      constraints: { 0: 6.1 },
    },
    {
      shape: "trapezoid",
      width: 13.6,
      top: 8.1,
      depth: 3.5,
      offset: 2.75,
      x: 0,
      z: 8,
      constraints: { 0: 13.6, 2: 8.1 },
    },
  ];
  const parts = definitions.map((options) =>
    newPart(project, "measured", {
      ...options,
      x: start + options.x,
      confirmed: false,
      exampleNote: "paperNote",
    }),
  );
  project.parts.push(...parts);
  return parts;
}
