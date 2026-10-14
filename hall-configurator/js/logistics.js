/** Optional loading-yard details. These are layout previews, not vehicle-sweep calculations. */
export const LOGISTICS_DEFAULTS = Object.freeze({
  loadingApron: false, loadingApronDepth: 12,
  loadingBayMarkings: false, loadingBayProtection: false, loadingBayNumbers: false,
  warehouseLayout: 'standard',
});

export function normalizeLogistics(state) {
  for (const key of ['loadingApron', 'loadingBayMarkings', 'loadingBayProtection', 'loadingBayNumbers']) state[key] = state[key] === true;
  const depth = Number(state.loadingApronDepth);
  state.loadingApronDepth = Number.isFinite(depth) ? Math.max(6, Math.min(24, depth)) : LOGISTICS_DEFAULTS.loadingApronDepth;
  state.warehouseLayout = state.warehouseLayout === 'loading-aisles' ? 'loading-aisles' : 'standard';
  return state;
}

export function isSectionalDoor(opening) {
  return opening.type === 'garage' && opening.subtype === 'sectional';
}

/** Exterior accessories follow each floor-level sectional door, including after edits. */
export function loadingLayout(state) {
  const openings = Array.isArray(state.openings) ? state.openings : [];
  const sideOrder = ['front', 'right', 'back', 'left'];
  const doors = openings.filter((o) => isSectionalDoor(o) && o.bottom < .02)
    .sort((a, b) => sideOrder.indexOf(a.side) - sideOrder.indexOf(b.side) || a.offset - b.offset);
  const depthValue = Number(state.loadingApronDepth);
  const depth = Number.isFinite(depthValue) ? Math.max(6, Math.min(24, depthValue)) : 12;
  const sides = [...new Set(doors.map((o) => o.side))];
  const bays = doors.map((opening, index) => {
    const span = ['front', 'back'].includes(opening.side) ? state.width : state.length;
    const obstructed = openings.some((other) => other.id !== opening.id && other.side === opening.side
      && other.bottom < 1.25 && other.bottom + other.height > 0
      && Math.abs(other.offset - opening.offset) < (other.width + opening.width) / 2 + .65);
    const edgeClear = Math.abs(opening.offset) + opening.width / 2 + .6 < span / 2;
    return {
      opening, number: String(index + 1).padStart(2, '0'),
      protection: Boolean(state.loadingBayProtection && edgeClear && !obstructed),
      markings: Boolean(state.loadingBayMarkings && state.loadingApron && edgeClear && !obstructed),
      numberPlate: Boolean(state.loadingBayNumbers && opening.bottom + opening.height + .82 < state.eaveHeight),
    };
  });
  return {
    bays, sides, depth,
    apronArea: state.loadingApron ? sides.reduce((sum, side) => sum + (['front', 'back'].includes(side) ? state.width : state.length) * depth, 0) : 0,
    bollardCount: bays.filter((b) => b.protection).length * 2,
    markingCount: bays.filter((b) => b.markings).length,
    numberCount: bays.filter((b) => b.numberPlate).length,
    unavailable: openings.some((o) => isSectionalDoor(o) && o.bottom >= .02)
      || bays.some((b) => (state.loadingBayProtection && !b.protection)
        || (state.loadingBayMarkings && state.loadingApron && !b.markings)
        || (state.loadingBayNumbers && !b.numberPlate)),
  };
}

/** Rack blocks leave end cross-aisles, a central drive-through aisle and loading-side staging.
 * Blocks are omitted around edited ground-level openings rather than blocking access. */
export function storageRackLayout(state) {
  if (state.width < 16 || state.length < 20) return { blocks: [], zones: [] };
  const halfW = state.width / 2, halfL = state.length / 2;
  const bays = loadingLayout(state).bays;
  const loadingSides = new Set(bays.map((b) => b.opening.side));
  const rightStaging = loadingSides.has('right') ? 6 : 1.5;
  const leftStaging = loadingSides.has('left') ? 6 : 1.5;
  const minX = -halfW + leftStaging, maxX = halfW - rightStaging;
  const rackDepth = 1.1;
  const spacing = state.rackDensity === 'light' ? 5 : state.rackDensity === 'dense' ? 3.3 : 4;
  const aisleHalf = Math.max(2.7, ...((state.openings || []).filter((o) => o.type === 'garage' && ['front','back'].includes(o.side)).map((o) => Math.abs(o.offset) + o.width / 2 + .2)));
  const blocks = [];
  const lanes = [];
  for (let x = minX + rackDepth / 2 + .8; x <= maxX - rackDepth / 2 - .5; x += spacing) if (Math.abs(x) - rackDepth / 2 > aisleHalf) lanes.push(x);
  // A right-hand rack row may not lie on the left-origin spacing grid.
  const rightRow = maxX - rackDepth / 2 - .8;
  if (rightRow - rackDepth / 2 > aisleHalf && lanes.every((x) => Math.abs(x - rightRow) >= spacing - .1)) lanes.push(rightRow);
  for (const x of lanes) for (const [start, end] of [[-halfL + 6, -3], [3, halfL - 6]]) {
    if (end - start < 3) continue;
    const blocked = (state.openings || []).some((o) => {
      if (o.bottom > 1.5) return false;
      if (o.side === 'left' && x < 0 || o.side === 'right' && x > 0) return start < o.offset + o.width / 2 + .6 && end > o.offset - o.width / 2 - .6 && !isSectionalDoor(o);
      return false;
    });
    if (!blocked) blocks.push({ x, z: (start + end) / 2, depth: rackDepth, length: end - start, height: Math.min(4.5, state.eaveHeight - 1.2) });
  }
  const zones = [
    { name: 'main-forklift-aisle', x: 0, z: 0, width: aisleHalf * 2, length: state.length - .5 },
    { name: 'forklift-middle-cross-aisle', x: 0, z: 0, width: state.width - 1, length: 6 },
    ...[-1,1].map((sign) => ({ name: `forklift-end-cross-aisle-${sign}`, x: 0, z: sign * (halfL - 3), width: state.width - 1, length: 5.5 })),
  ];
  if (loadingSides.has('right')) zones.push({ name: 'loading-staging-right', x: halfW - 3, z: 0, width: 5.7, length: state.length - 12 });
  if (loadingSides.has('left')) zones.push({ name: 'loading-staging-left', x: -halfW + 3, z: 0, width: 5.7, length: state.length - 12 });
  return { blocks, zones };
}

/** Keep decorative scenery off loading surfaces and immediate vehicle approaches. */
export function loadingSceneryExclusions(state) {
  const layout = loadingLayout(state), hw = state.width / 2, hl = state.length / 2;
  const rectangles = [];
  if (state.loadingApron) for (const side of layout.sides) {
    if (side === 'right') rectangles.push({ minX: hw, maxX: hw + .175 + layout.depth, minZ: -hl, maxZ: hl });
    if (side === 'left') rectangles.push({ minX: -hw - .175 - layout.depth, maxX: -hw, minZ: -hl, maxZ: hl });
    if (side === 'front') rectangles.push({ minX: -hw, maxX: hw, minZ: -hl - .175 - layout.depth, maxZ: -hl });
    if (side === 'back') rectangles.push({ minX: -hw, maxX: hw, minZ: hl, maxZ: hl + .175 + layout.depth });
  }
  if (state.warehouseLayout === 'loading-aisles') for (const o of state.openings || []) {
    if (o.type !== 'garage' || o.bottom > .02) continue;
    const lo = o.offset - o.width / 2 - .8, hi = o.offset + o.width / 2 + .8;
    if (o.side === 'front') rectangles.push({ minX: lo, maxX: hi, minZ: -hl - 10, maxZ: -hl });
    if (o.side === 'back') rectangles.push({ minX: lo, maxX: hi, minZ: hl, maxZ: hl + 10 });
    if (o.side === 'left') rectangles.push({ minX: -hw - 10, maxX: -hw, minZ: lo, maxZ: hi });
    if (o.side === 'right') rectangles.push({ minX: hw, maxX: hw + 10, minZ: lo, maxZ: hi });
  }
  return rectangles;
}
