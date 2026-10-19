// The building the curtain wall hangs on, scaled to the facade: concrete
// floor slabs at every anchor level with columns behind them, and the steel
// anchor brackets that fix each mullion to the slab edge. For the skylight:
// a support wall at the ridge and an eaves beam on posts, with brackets at both
// ends of every rafter. Dimensions in mm; the shapes are indicative (the
// anchor type comes from the catalogue, its geometry does not).
export const BUILDING = Object.freeze({
  bracketGap: 120,       // mullion back face → slab edge (bracket zone)
  slabThickness: 250,
  slabOverhang: 400,     // slab beyond the facade ends
  depthMin: 4000, depthMax: 9000, depthRatio: 0.55,
  column: 400, columnSpacing: 6000, columnInset: 1200,
  bracket: { plate: 8, fin: 6, finHeight: 160, base: 180, width: 140 },
  eavesHeight: 2400, wallThickness: 250, post: 120, beam: { w: 160, h: 220 },
});

// Anchor levels from the bottom up: every anchor spacing, plus the top.
export function anchorLevels(H, spacing) {
  const levels = [];
  for (let y = 0; y < H - 1; y += spacing) levels.push(y);
  levels.push(H);
  return levels;
}

const box = (x0, y0, z0, x1, y1, z1) => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) });

// Boxes in the facade's own coordinates (x along the facade from its left
// end, y up from its bottom edge, z = 0 at the glass face, negative inwards).
export function facadeBuilding(model) {
  const B = BUILDING, { W, H, xs } = model, depth = model.mullion.depth;
  const edge = -(depth + B.bracketGap);
  const buildingDepth = Math.min(B.depthMax, Math.max(B.depthMin, W * B.depthRatio));
  const levels = anchorLevels(H, model.S.anchorSpacing);
  const concrete = [], steel = [];
  levels.forEach(y => concrete.push(box(-B.slabOverhang, y - B.slabThickness, edge, W + B.slabOverhang, y, edge - buildingDepth)));
  // Columns between consecutive slabs, on a regular grid behind the slab edge.
  const n = Math.max(2, Math.ceil(W / B.columnSpacing) + 1);
  const cz = edge - B.columnInset;
  for (let i = 0; i < levels.length - 1; i++) {
    for (let c = 0; c < n; c++) {
      const x = B.column / 2 + (c * (W - B.column)) / (n - 1);
      concrete.push(box(x - B.column / 2, levels[i], cz - B.column / 2, x + B.column / 2, levels[i + 1] - B.slabThickness, cz + B.column / 2));
    }
  }
  // Brackets: a base plate on the slab and two fins either side of the mullion.
  const k = B.bracket, half = model.faceWidth / 2;
  xs.forEach(x => levels.forEach(y => {
    steel.push(box(x - k.width / 2, y, edge - k.base, x + k.width / 2, y + k.plate, edge));
    for (const side of [-1, 1]) {
      const fx = x + side * (half + k.fin / 2);
      steel.push(box(fx - k.fin / 2, y, edge - k.base / 2, fx + k.fin / 2, y + k.finHeight, -depth + 30));
    }
  }));
  // Camera focus for the anchor close-up: first interior mullion on the first upper slab.
  const focus = { x: xs[Math.min(1, xs.length - 1)], y: levels[Math.min(1, levels.length - 1)], z: edge };
  return { concrete, steel, anchors: xs.length * levels.length, levels, focus };
}

// Skylight: boxes relative to the eaves line (x along the eaves, y up from
// the ground, z towards the outside). The roof plane is the facade rotated
// about its bottom edge to the slope and lifted to the eaves height, so a
// point (y, z) of the facade lands at (E + y·sin α + z·cos α, −y·cos α + z·sin α).
export function skylightBuilding(model) {
  const B = BUILDING, { W, H, xs } = model, depth = model.mullion.depth;
  const a = (model.slopeDeg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
  const E = B.eavesHeight;
  const at = (y, z) => ({ y: E + y * sin + z * cos, z: -y * cos + z * sin });
  const eaves = at(0, -depth), ridge = at(H, -depth), ridgeTop = at(H, 0);
  const wallZ = Math.min(ridge.z, ridgeTop.z) - B.bracketGap;
  const concrete = [box(-B.slabOverhang, 0, wallZ, W + B.slabOverhang, ridgeTop.y + 600, wallZ - B.wallThickness)];
  const steel = [];
  const k = B.bracket, half = model.faceWidth / 2;
  // Eaves beam under the rafter ends, on posts.
  const beamTop = eaves.y, beamZ = eaves.z;
  steel.push(box(-B.post, beamTop - B.beam.h, beamZ - B.beam.w / 2, W + B.post, beamTop, beamZ + B.beam.w / 2));
  const posts = Math.max(2, Math.ceil(W / 3000) + 1);
  for (let i = 0; i < posts; i++) {
    const x = B.post / 2 + (i * (W - B.post)) / (posts - 1);
    steel.push(box(x - B.post / 2, 0, beamZ - B.post / 2, x + B.post / 2, beamTop - B.beam.h, beamZ + B.post / 2));
  }
  xs.forEach(x => {
    for (const side of [-1, 1]) {
      const fx = x + side * (half + k.fin / 2);
      // Eaves: fins from the beam up the rafter side.
      steel.push(box(fx - k.fin / 2, beamTop, beamZ - k.width / 2, fx + k.fin / 2, beamTop + k.finHeight, beamZ + k.width / 2));
      // Ridge: fins from the rafter end back to the wall.
      steel.push(box(fx - k.fin / 2, ridge.y - k.finHeight / 2, ridge.z + 40, fx + k.fin / 2, ridge.y + k.finHeight / 2, wallZ));
    }
    steel.push(box(x - k.width / 2, ridge.y - k.finHeight / 2, wallZ + k.plate, x + k.width / 2, ridge.y + k.finHeight / 2, wallZ));
  });
  const focus = { x: xs[Math.min(1, xs.length - 1)], y: ridge.y, z: wallZ };
  return { concrete, steel, anchors: 2 * xs.length, eavesHeight: E, focus };
}
