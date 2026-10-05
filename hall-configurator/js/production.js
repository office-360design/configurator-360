/** Generic production-floor planning, in metres. Not process/egress engineering. */
export const PRODUCTION_DEFAULTS = Object.freeze({
  productionLayout: false,
  productionFlow: 'front-to-back',
  productionCellCount: 4,
  productionEquipment: true,
  productionStaging: true,
  productionMarkings: true,
  productionUtilities: false,
});

export function normalizeProduction(state) {
  for (const key of ['productionLayout', 'productionEquipment', 'productionStaging', 'productionMarkings', 'productionUtilities']) {
    state[key] = typeof state[key] === 'boolean' ? state[key] : PRODUCTION_DEFAULTS[key];
  }
  state.productionFlow = state.productionFlow === 'back-to-front' ? 'back-to-front' : 'front-to-back';
  const count = Number(state.productionCellCount);
  state.productionCellCount = Number.isFinite(count) ? Math.max(2, Math.min(6, Math.round(count))) : 4;
  // These are alternative floor plans, not compatible layers of furniture.
  if (state.productionLayout) {
    state.warehouseRacking = false;
    state.forkliftClearance = false;
    state.retailDisplays = false;
  }
  return state;
}

export function footprint(item) {
  return { minX: item.x - item.width / 2, maxX: item.x + item.width / 2,
    minZ: item.z - item.length / 2, maxZ: item.z + item.length / 2 };
}
export function footprintsOverlap(a, b, clearance = 0) {
  return a.minX < b.maxX + clearance && a.maxX > b.minX - clearance
    && a.minZ < b.maxZ + clearance && a.maxZ > b.minZ - clearance;
}

/** Floor-level opening approaches: do not silently fill an edited doorway with equipment. */
export function productionOpeningClearances(state) {
  const hw = state.width / 2, hl = state.length / 2;
  return (state.openings || []).filter(o => o.bottom < 2.6 && o.type !== 'vent' && o.type !== 'window')
    .map(o => {
      const lo = o.offset - o.width / 2 - .65, hi = o.offset + o.width / 2 + .65;
      const reach = o.type === 'garage' ? Math.max(5.5, o.height + 1) : 3.0;
      const bounds = o.side === 'front' ? { minX: lo, maxX: hi, minZ: -hl, maxZ: -hl + reach }
        : o.side === 'back' ? { minX: lo, maxX: hi, minZ: hl - reach, maxZ: hl }
        : o.side === 'left' ? { minX: -hw, maxX: -hw + reach, minZ: lo, maxZ: hi }
        : { minX: hw - reach, maxX: hw, minZ: lo, maxZ: hi };
      return { ...bounds, id: o.id };
    });
}

export function productionLayout(state) {
  const empty = { active: false, available: false, machines: [], benches: [], staging: [], zones: [],
    gates: [], utilityRuns: [], requestedCells: Number(state.productionCellCount) || 4,
    capacity: 0, suppressed: 0, missingGates: false, utilityLength: 0 };
  if (!state.productionLayout) return empty;
  const width = Number(state.width), length = Number(state.length), height = Number(state.eaveHeight);
  if (![width, length, height].every(Number.isFinite)) return { ...empty, active: true };
  const direction = state.productionFlow === 'back-to-front' ? -1 : 1;
  const gates = ['front', 'back'].flatMap(side => {
    // Use the largest floor-level gate on each end as the material route.
    const door = (state.openings || []).filter(o => o.type === 'garage' && o.side === side && o.bottom < .02)
      .sort((a, b) => b.width - a.width || String(a.id).localeCompare(String(b.id)))[0];
    if (!door) return [];
    return [{ opening: door, role: (side === 'front') === (direction === 1) ? 'intake' : 'dispatch',
      signAvailable: door.height + .82 < height }];
  });
  const common = { ...empty, active: true, gates, direction, missingGates: gates.length !== 2 };
  if (width < 16 || length < 24 || height < 4) return common;
  const hw = width / 2, hl = length / 2;
  const aisleMin = Math.min(-2.5, ...gates.map(g => g.opening.offset - g.opening.width / 2 - .3));
  const aisleMax = Math.max(2.5, ...gates.map(g => g.opening.offset + g.opening.width / 2 + .3));
  const aisle = { id: 'production-through-aisle', kind: 'flow', x: (aisleMin + aisleMax) / 2,
    z: 0, width: aisleMax - aisleMin, length: length - .35 };
  const walkway = { id: 'production-pedestrian-route', kind: 'pedestrian', x: hw - 1.35, z: 0, width: 1.1, length: length - 1 };
  const zones = [aisle, walkway, ...[-1, 1].map(sign => ({ id: `production-crosswalk-${sign}`, kind: 'crosswalk',
    x: 0, z: sign * (hl - 2), width: width - 1.6, length: 1.2 }))];
  const requestedCells = Math.max(2, Math.min(6, Math.round(Number(state.productionCellCount) || 4)));
  const workLength = length - 16;
  const capacity = Math.min(6, Math.floor(workLength / 4.5));
  const cells = Math.min(requestedCells, capacity);
  const cellSpan = workLength / Math.max(1, cells);
  const leftMin = -hw + 1.15, leftMax = aisleMin - .65;
  const rightMin = aisleMax + .65, rightMax = hw - 2.35;
  const approaches = productionOpeningClearances(state);
  const clear = item => !approaches.some(r => footprintsOverlap(footprint(item), r, .1));
  const machines = [], benches = [], staging = [];
  let suppressed = 0;
  for (let index = 0; index < cells; index += 1) {
    const z = direction * (-workLength / 2 + (index + .5) * cellSpan);
    if (state.productionEquipment) {
      const machine = { id: `production-machine-${index + 1}`, kind: 'machine', index,
        x: (leftMin + leftMax) / 2, z, width: 3.0, length: 3.5, height: 2.5 };
      const bench = { id: `production-workbench-${index + 1}`, index,
        kind: index === cells - 1 ? 'packing' : index === cells - 2 ? 'inspection' : 'assembly',
        x: (rightMin + rightMax) / 2, z, width: 2.0, length: 3.2, height: 1.65 };
      if (leftMax - leftMin >= machine.width && clear(machine)) machines.push(machine); else suppressed++;
      if (rightMax - rightMin >= bench.width && clear(bench)) benches.push(bench); else suppressed++;
    }
  }
  if (state.productionStaging) for (const sign of [-1, 1]) for (const [side, lo, hi] of [['left', leftMin, leftMax], ['right', rightMin, rightMax]]) {
    const item = { id: `production-stock-${sign}-${side}`, kind: sign === -direction ? 'raw' : 'finished',
      x: (lo + hi) / 2, z: sign * (hl - 5), width: 2.4, length: 3.6, height: 1.8 };
    if (hi - lo >= item.width && clear(item)) staging.push(item); else suppressed++;
  }
  const utilityY = Math.min(4.7, height - .8);
  // Longitudinal services remain over the work cells, never below an open gate.
  const utilityRuns = state.productionUtilities ? [
    { id: 'production-utilities-left', x: (leftMin + leftMax) / 2, y: utilityY, z: 0, length: workLength, drops: machines },
    { id: 'production-utilities-right', x: (rightMin + rightMax) / 2, y: utilityY, z: 0, length: workLength, drops: benches },
  ].filter((r, i) => (i === 0 ? leftMax - leftMin : rightMax - rightMin) >= 2.0) : [];
  return { ...common, available: true, machines, benches, staging, zones, requestedCells, capacity,
    suppressed, utilityRuns, utilityLength: utilityRuns.reduce((sum, r) => sum + r.length, 0) };
}
