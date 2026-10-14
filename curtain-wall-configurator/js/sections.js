// Cross-sections of the GCW 050 node in mm, after the catalogue drawings
// (profile pages 5–11, pressure strips page 26, cover plates page 24 and the
// heat calculation node). Local axes: x across the 50 mm face (−25…25), z
// through the facade with z = 0 at the glass-side face of the mullion,
// negative into the building and positive outwards. Shapes are simplified
// outlines suitable for rendering, not fabrication drawings.
import { COVER_PLATES, PRESSURE_STRIPS, SYSTEM } from './catalog.js?v=cw-2';

const HALF = SYSTEM.faceWidth / 2;
export const GLASS_GAP = 10; // profile face → inner glass face (heat calculation node)
const GASKET = 5; // outer gasket between glass and pressure strip
const BOSS = { half: 7, height: 12 }; // screw channel towards the glass joint
const WALL = 2.5;

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// Each part: { kind, contour: [[x, z]...], holes: [[[x, z]...]] }.
export function nodeParts({ depth, thickness, stripId, coverId }) {
  const strip = PRESSURE_STRIPS[stripId];
  const glassOut = GLASS_GAP + thickness;
  const stripBase = glassOut + GASKET;
  const parts = [];
  // Hollow mullion/transom tube with the screw channel boss.
  parts.push({
    kind: 'profile',
    contour: [[-HALF, -depth], [HALF, -depth], [HALF, 0], [BOSS.half, 0], [BOSS.half, BOSS.height], [-BOSS.half, BOSS.height], [-BOSS.half, 0], [-HALF, 0]],
    holes: [rect(-HALF + WALL, -depth + WALL, HALF - WALL, -WALL), rect(-2.5, 2, 2.5, BOSS.height - 1)],
  });
  // Inner glazing gaskets on the profile face, outer gaskets under the strip.
  for (const side of [-1, 1]) {
    parts.push({ kind: 'gasketInner', contour: side < 0 ? rect(-23, 3, -13, GLASS_GAP) : rect(13, 3, 23, GLASS_GAP), holes: [] });
    parts.push({ kind: 'gasketOuter', contour: side < 0 ? rect(-23, glassOut, -13, stripBase) : rect(13, glassOut, 23, stripBase), holes: [] });
  }
  // Insulator between the glass edges (only above the boss).
  if (glassOut - BOSS.height > 2) parts.push({ kind: 'insulator', contour: rect(-9, BOSS.height, 9, glassOut + 2), holes: [] });
  // Pressure strip, then the clip-on cover plate when the strip needs one.
  const sw = (strip.width || SYSTEM.faceWidth) / 2;
  if (strip.cover) {
    parts.push({ kind: 'strip', contour: rect(-sw, stripBase, sw, stripBase + strip.depth), holes: [] });
    const c = COVER_PLATES[coverId].depth;
    parts.push({ kind: 'cover', contour: [[-HALF, stripBase], [-HALF + 2, stripBase], [-HALF + 2, stripBase + c - 2], [HALF - 2, stripBase + c - 2], [HALF - 2, stripBase], [HALF, stripBase], [HALF, stripBase + c], [-HALF, stripBase + c]], holes: [] });
  } else {
    const d = strip.depth;
    parts.push({ kind: 'cover', contour: [[-HALF, stripBase], [-HALF + 2, stripBase], [-HALF + 2, stripBase + d - 2], [HALF - 2, stripBase + d - 2], [HALF - 2, stripBase], [HALF, stripBase], [HALF, stripBase + d], [-HALF, stripBase + d]], holes: [] });
  }
  return parts;
}

// Outermost z of the node (for the outer face of caps).
export function nodeOuterZ({ thickness, stripId, coverId }) {
  const strip = PRESSURE_STRIPS[stripId];
  const base = GLASS_GAP + thickness + GASKET;
  return base + (strip.cover ? COVER_PLATES[coverId].depth : strip.depth);
}
