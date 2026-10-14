import { normalize, areaGeometry } from './model.js';
import { normalizeRegions, combineRegions } from './pavingRegions.js';

/** Migrate without moving the image, house, pattern grid, or camera. */
export function asRegionState(input) {
  const state = normalize(input);
  if (state.shape === 'regions') return state;
  const g = areaGeometry(state);
  return normalize({ ...state, shape: 'regions', areaPoints: null,
    areaOrigin: { x: g.centerX, z: g.centerZ },
    areaRegions: [{ id: 'region-1', outer: g.points, holes: [],
      curbs: { outer: state.edges.some(Boolean), holes: [], edges: [[...state.edges]] } }],
  });
}
export function clearPaving(input) {
  const state = asRegionState(input);
  return normalize({ ...state, areaRegions: [] });
}
export function applyPavingPatch(input, points, operation, { sceneCoordinates = false } = {}) {
  const state = asRegionState(input), origin = state.areaOrigin;
  const local = points.map((p) => ({
    x: p.x + (sceneCoordinates ? origin.x : 0),
    z: p.z + (sceneCoordinates ? origin.z : 0),
  }));
  const regions = operation === 'replace'
    ? normalizeRegions([{ id: 'region-1', outer: local, holes: [] }])
    : combineRegions(state.areaRegions, local, operation);
  return normalize({ ...state, areaRegions: regions });
}
export function replaceBoundary(input, key, points) {
  const state = asRegionState(input), regions = structuredClone(state.areaRegions),
    boundary = areaGeometry(state).boundaries.find((b) => b.key === key);
  if (!boundary) throw new Error('invalidRegions');
  if (boundary.ring) regions[boundary.region].holes[boundary.ring - 1] = points;
  else regions[boundary.region].outer = points;
  // Moving a boundary never unions it with neighbours or drops a crossed hole.
  return normalize({ ...state, areaRegions: regions });
}
export function editBoundaryVertex(input, key, index, operation) {
  const state = asRegionState(input), b = areaGeometry(state).boundaries.find((b) => b.key === key);
  if (!b || !Number.isInteger(index) || index < 0 || index >= b.points.length) throw new Error('invalidRegions');
  const points = b.points.map((p) => ({ ...p }));
  if (operation === 'delete') {
    if (points.length <= 3) throw new Error('invalidRegions');
    points.splice(index, 1);
  } else if (operation === 'insert') {
    const a = points[index], c = points[(index + 1) % points.length];
    points.splice(index + 1, 0, { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 });
  } else throw new Error('invalidRegions');
  const r = state.areaRegions[b.region];
  if (operation === 'insert') r.curbs.edges[b.ring].splice(index + 1, 0, r.curbs.edges[b.ring][index]);
  else r.curbs.edges[b.ring].splice(index, 1);
  return replaceBoundary(state, key, points);
}
