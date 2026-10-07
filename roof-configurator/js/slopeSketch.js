// Slopes measured on site and drawn one by one at their true size (on the slope,
// not in plan). Points use slope coordinates in metres: x along the eave, y uphill.
// There is no 3D topology: each slope is an independent flat polygon.
import { validatePolygon } from './roofLayout.js?v=layout-21';

export const SKETCH_VERSION = 1;
export const MAX_SKETCH_SLOPES = 40;
export const MAX_SKETCH_QUANTITY = 20;
export const MAX_SKETCH_LENGTH = 60;

// Ridge, hip and valley edges are shared by two slopes, so each drawing counts half.
export const edgeTypes = {
  eave: { name: 'Eave', shared: false },
  ridge: { name: 'Ridge', shared: true },
  hip: { name: 'Hip', shared: true },
  valley: { name: 'Valley', shared: true },
  gable: { name: 'Verge', shared: false },
  wall: { name: 'Wall abutment', shared: false },
};

export const sketchShapes = {
  triangle: { name: 'Triangle', dims: [['base', 'Eave (base)'], ['left', 'Left side'], ['right', 'Right side']],
    edges: ['eave', 'hip', 'hip'] },
  trapezoid: { name: 'Trapezoid', dims: [['base', 'Eave (base)'], ['top', 'Ridge (top)'], ['left', 'Left side'], ['right', 'Right side']],
    edges: ['eave', 'hip', 'ridge', 'hip'] },
  rectangle: { name: 'Rectangle', dims: [['base', 'Eave (base)'], ['height', 'Slope length']],
    edges: ['eave', 'gable', 'ridge', 'gable'] },
  parallelogram: { name: 'Parallelogram', dims: [['base', 'Eave (base)'], ['side', 'Side length'], ['height', 'Slope length']],
    edges: ['eave', 'valley', 'ridge', 'valley'] },
  polygon: { name: 'Free polygon', dims: [], edges: [] },
};

const round = value => Math.round(value * 1e4) / 1e4;
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function measure(dims, key, label) {
  const value = Number(dims?.[key]);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SKETCH_LENGTH) {
    throw new Error(`${label}: enter a length from 0.01 to ${MAX_SKETCH_LENGTH} m.`);
  }
  return value;
}

// Builds the outline from the lengths a roofer measures: the eave, the ridge
// (parallel to the eave) and the sloping sides. The height is derived.
export function sketchPoints(slope) {
  const shape = sketchShapes[slope?.shape];
  if (!shape) throw new Error('Choose a slope shape.');
  const dims = slope.dims || {};
  const get = key => measure(dims, key, shape.dims.find(([k]) => k === key)[1]);
  if (slope.shape === 'polygon') {
    if (!Array.isArray(slope.points)) throw new Error('Add at least three points.');
    return slope.points.map(p => ({ x: Number(p.x), y: Number(p.y) }));
  }
  if (slope.shape === 'rectangle') {
    const base = get('base'), height = get('height');
    return [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base, y: height }, { x: 0, y: height }];
  }
  if (slope.shape === 'parallelogram') {
    const base = get('base'), side = get('side'), height = get('height');
    if (side < height - 1e-9) throw new Error('The side cannot be shorter than the slope length.');
    const shift = Math.sqrt(side * side - height * height) * (dims.lean === 'left' ? -1 : 1);
    return [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base + shift, y: height }, { x: shift, y: height }];
  }
  if (slope.shape === 'triangle') {
    const base = get('base'), left = get('left'), right = get('right');
    if (left + right <= base + 1e-6 || base + left <= right + 1e-6 || base + right <= left + 1e-6) {
      throw new Error('These three sides cannot form a triangle. Check the measurements.');
    }
    const apex = (base * base + left * left - right * right) / (2 * base);
    return [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: apex, y: Math.sqrt(left * left - apex * apex) }];
  }
  const base = get('base'), top = get('top'), left = get('left'), right = get('right');
  const difference = base - top;
  if (Math.abs(difference) < 1e-6) {
    throw new Error('Eave and ridge are equal. Use a rectangle or a parallelogram instead.');
  }
  // Horizontal offsets of the ridge ends: a + c = base - top and a² - c² = left² - right².
  const a = (difference + (left * left - right * right) / difference) / 2;
  const heightSquared = left * left - a * a;
  if (heightSquared <= 1e-6) throw new Error('These sides are too short for the eave and ridge lengths. Check the measurements.');
  const height = Math.sqrt(heightSquared);
  return [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: a + top, y: height }, { x: a, y: height }];
}

// Validates one slope and returns its normalized geometry (min corner at 0, 0).
export function sketchSlopeGeometry(slope) {
  const raw = sketchPoints(slope);
  if (raw.length < 3 || raw.length > 60 || raw.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('A slope needs 3 to 60 points with valid coordinates.');
  }
  const minX = Math.min(...raw.map(p => p.x)), minY = Math.min(...raw.map(p => p.y));
  const points = raw.map(p => ({ x: round(p.x - minX), y: round(p.y - minY) }));
  const width = Math.max(...points.map(p => p.x)), height = Math.max(...points.map(p => p.y));
  if (width > MAX_SKETCH_LENGTH || height > MAX_SKETCH_LENGTH) throw new Error(`A slope must fit within ${MAX_SKETCH_LENGTH} × ${MAX_SKETCH_LENGTH} m.`);
  validatePolygon(points.map(p => ({ x: p.x, z: p.y })));
  // Keep the drawing counter-clockwise so edge i always runs from point i to i + 1.
  const signed = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y, 0) / 2;
  if (signed < 0) throw new Error('List the points anticlockwise, starting at the eave.');
  const quantity = slope.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SKETCH_QUANTITY) {
    throw new Error(`Identical slopes must be a whole number from 1 to ${MAX_SKETCH_QUANTITY}.`);
  }
  const pitch = slope.pitch ?? null;
  if (pitch !== null && (!Number.isFinite(pitch) || pitch < 0 || pitch >= 90)) throw new Error('Pitch must be from 0 to 89°.');
  const fallback = sketchShapes[slope.shape].edges;
  const edges = points.map((p, i) => {
    const type = slope.edges?.[i] ?? fallback[i] ?? (i === 0 ? 'eave' : 'gable');
    if (!edgeTypes[type]) throw new Error('Unknown edge type.');
    return { type, length: length(p, points[(i + 1) % points.length]) };
  });
  return { points, width, height, area: Math.abs(signed), quantity, pitch, edges };
}

export function validateSketch(sketch) {
  if (!sketch || typeof sketch !== 'object' || sketch.version !== SKETCH_VERSION || !Array.isArray(sketch.slopes)) {
    throw new Error('Invalid slope drawing.');
  }
  if (!sketch.slopes.length || sketch.slopes.length > MAX_SKETCH_SLOPES) {
    throw new Error(`Draw from 1 to ${MAX_SKETCH_SLOPES} slopes.`);
  }
  return sketch.slopes.map(sketchSlopeGeometry);
}

export const sketchSlopes = sketch => validateSketch(sketch);

export function sketchArea(sketch) {
  return sketchSlopes(sketch).reduce((sum, slope) => sum + slope.area * slope.quantity, 0);
}

// Linear metres per edge type for flashing and trim estimates.
export function sketchEdgeTotals(slopes) {
  const totals = Object.fromEntries(Object.keys(edgeTypes).map(type => [type, 0]));
  slopes.forEach(slope => slope.edges.forEach(edge => {
    totals[edge.type] += edge.length * (slope.quantity ?? 1) * (edgeTypes[edge.type].shared ? 0.5 : 1);
  }));
  return totals;
}

// Starter slopes from a roofer's sheet (one hip-roof trapezoid and one end
// triangle). Identical copies are left for the user to set.
export function defaultSketch() {
  return { version: SKETCH_VERSION, slopes: [
    { shape: 'trapezoid', dims: { base: 13.6, top: 8.1, left: 4.5, right: 4.5 }, quantity: 1, pitch: null, edges: ['eave', 'hip', 'ridge', 'hip'] },
    { shape: 'triangle', dims: { base: 6.8, left: 4.8, right: 4.8 }, quantity: 1, pitch: null, edges: ['eave', 'hip', 'hip'] },
  ] };
}

export function newSketchSlope(shape) {
  const dims = { triangle: { base: 6, left: 4, right: 4 }, trapezoid: { base: 10, top: 5, left: 4, right: 4 },
    rectangle: { base: 8, height: 4 }, parallelogram: { base: 3, side: 4.5, height: 4, lean: 'right' }, polygon: {} }[shape];
  const slope = { shape, dims, quantity: 1, pitch: null, edges: [...sketchShapes[shape].edges] };
  if (shape === 'polygon') {
    slope.points = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 6, y: 3.5 }, { x: 2, y: 3.5 }];
    slope.edges = ['eave', 'hip', 'ridge', 'hip'];
  }
  return slope;
}

const snap = (value, step) => Math.round(Math.round(value / step) * step * 1e4) / 1e4;

// Moves point `index` of a drawn outline to `target` while keeping the shape's
// rules: eave and ridge stay level, rectangles stay square, parallelograms parallel.
export function dragSketchPoint(shape, points, index, target) {
  const next = points.map(p => ({ ...p }));
  const dx = target.x - points[index].x, dy = target.y - points[index].y;
  if (shape === 'polygon') {
    next[index] = { x: target.x, y: target.y };
  } else if (shape === 'rectangle') {
    // Corners: 0 eave left, 1 eave right, 2 ridge right, 3 ridge left.
    (index === 1 || index === 2 ? [1, 2] : [0, 3]).forEach(i => { next[i].x = target.x; });
    (index >= 2 ? [2, 3] : [0, 1]).forEach(i => { next[i].y = target.y; });
  } else if (shape === 'parallelogram') {
    // The ridge moves as one edge; an eave corner moves its whole side.
    const moved = index >= 2 ? [2, 3] : [index, index === 0 ? 3 : 2];
    moved.forEach(i => { next[i].x += dx; next[i].y += index >= 2 ? dy : 0; });
  } else if (index <= 1) {
    next[index].x = target.x;
  } else {
    next[index] = { x: target.x, y: target.y };
    if (shape === 'trapezoid') next[index === 2 ? 3 : 2].y = target.y;
  }
  return next;
}

// Rebuilds a slope's measurements from an edited outline, rounded to `step` metres.
export function slopeFromPoints(slope, points, step = 0.01) {
  const next = structuredClone(slope);
  const r = value => snap(value, step);
  const [p0, p1, p2, p3] = points;
  if (slope.shape === 'triangle') next.dims = { base: r(p1.x - p0.x), left: r(length(p0, p2)), right: r(length(p1, p2)) };
  else if (slope.shape === 'trapezoid') next.dims = { base: r(p1.x - p0.x), top: r(p2.x - p3.x), left: r(length(p0, p3)), right: r(length(p1, p2)) };
  else if (slope.shape === 'rectangle') next.dims = { base: r(p1.x - p0.x), height: r(p3.y - p0.y) };
  else if (slope.shape === 'parallelogram') {
    const shift = p3.x - p0.x, height = p3.y - p0.y;
    next.dims = { base: r(p1.x - p0.x), side: r(Math.hypot(shift, height)), height: r(height), lean: shift < 0 ? 'left' : 'right' };
  } else next.points = points.map(p => ({ x: r(p.x), y: r(p.y) }));
  return next;
}

// Overwrites one measured edge, as typed on the drawing.
export function setSketchEdgeLength(slope, index, value) {
  const next = structuredClone(slope);
  const keys = { triangle: ['base', 'right', 'left'], trapezoid: ['base', 'right', 'top', 'left'],
    rectangle: ['base', 'height', 'base', 'height'], parallelogram: ['base', 'side', 'base', 'side'] }[slope.shape];
  if (keys) {
    next.dims[keys[index]] = value;
    return next;
  }
  // Free polygon: slide the edge's end point along the edge.
  const a = next.points[index], b = next.points[(index + 1) % next.points.length];
  const current = length(a, b) || 1;
  b.x = round(a.x + (b.x - a.x) * value / current);
  b.y = round(a.y + (b.y - a.y) * value / current);
  return next;
}

// Overwrites the slope length (eave to ridge), keeping the eave and the
// horizontal positions of the upper points.
export function setSketchHeight(slope, value) {
  if (slope.shape === 'rectangle') return { ...structuredClone(slope), dims: { ...slope.dims, height: value } };
  const geometry = sketchSlopeGeometry(slope);
  const scale = value / geometry.height;
  return slopeFromPoints(slope, geometry.points.map(p => ({ x: p.x, y: p.y * scale })), 1e-4);
}
