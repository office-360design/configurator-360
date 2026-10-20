// Cross-section of the Cortizo 52 mm mullion/transom node in mm. Local axes:
// x across the 52 mm face, z through the facade with z = 0 at the glass-side
// face of the profile, negative into the building and positive outwards.
// Shapes are simplified outlines suitable for rendering, not fabrication drawings.
export const GLASS_GAP = 10; // profile face → inner glass face
const GASKET = 5; // outer gasket between glass and pressure plate
const BOSS = { half: 7, height: 12 }; // screw channel towards the glass joint
const WALL = 2.5;

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// The node depends on how the glass is held on that member (rules/<system>.json
// "edges"): pressure plate + cap, SG clips with a sealed joint, the glass frame
// of ST/SST, or silicone on a backer (skylight transoms). Shapes are visual
// outlines; plate and cap depths are not in the catalogue and are indicative.
export const CORTIZO_FACE = 52;
export function cortizoNodeParts({ depth, thickness, edge }) {
  const half = CORTIZO_FACE / 2;
  const glassOut = GLASS_GAP + thickness;
  const parts = [{
    kind: 'profile',
    contour: [[-half, -depth], [half, -depth], [half, 0], [BOSS.half, 0], [BOSS.half, BOSS.height], [-BOSS.half, BOSS.height], [-BOSS.half, 0], [-half, 0]],
    holes: [rect(-half + WALL, -depth + WALL, half - WALL, -WALL), rect(-2.5, 2, 2.5, BOSS.height - 1)],
  }];
  for (const side of [-1, 1]) parts.push({ kind: 'gasketInner', contour: side < 0 ? rect(-24, 3, -14, GLASS_GAP) : rect(14, 3, 24, GLASS_GAP), holes: [] });
  if (edge === 'pressure') {
    const stripBase = glassOut + GASKET;
    for (const side of [-1, 1]) parts.push({ kind: 'gasketOuter', contour: side < 0 ? rect(-24, glassOut, -14, stripBase) : rect(14, glassOut, 24, stripBase), holes: [] });
    parts.push({ kind: 'insulator', contour: rect(-10, BOSS.height, 10, glassOut + 2), holes: [] });
    parts.push({ kind: 'strip', contour: rect(-half, stripBase, half, stripBase + 6), holes: [] });
    const c = 16, base = stripBase + 6;
    parts.push({ kind: 'cover', contour: [[-half, base - 6], [-half + 2, base - 6], [-half + 2, base + c - 2], [half - 2, base + c - 2], [half - 2, base - 6], [half, base - 6], [half, base + c], [-half, base + c]], holes: [] });
    return parts;
  }
  if (edge === 'frame') {
    // Glass bonded (ST) or held (SST) on its own frame, hooked onto the mullion.
    for (const side of [-1, 1]) parts.push({ kind: 'frame', contour: side < 0 ? rect(-half, GLASS_GAP - 8, -11, GLASS_GAP) : rect(11, GLASS_GAP - 8, half, GLASS_GAP), holes: [] });
  }
  // Clips / frame / silicone: a flush 22 mm sealed joint between the glass edges.
  parts.push({ kind: 'joint', contour: rect(-11, GLASS_GAP, 11, glassOut), holes: [] });
  return parts;
}
