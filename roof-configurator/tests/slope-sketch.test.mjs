import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSketch, sketchArea, sketchSlopeGeometry, validateSketch, SKETCH_VERSION,
  dragSketchPoint, slopeFromPoints, setSketchEdgeLength, setSketchHeight } from '../js/slopeSketch.js';
import { planSketchSheets, sheetProfiles, sheetPlanCsv } from '../js/sheetPlanner.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const sketch = (...slopes) => ({ version: SKETCH_VERSION, slopes });

test('trapezoid and triangle heights are derived from measured sides', () => {
  // Values from a roofer's sheet: 13.60 eave, 8.10 ridge, 4.50 hips.
  const trapezoid = sketchSlopeGeometry({ shape: 'trapezoid', dims: { base: 13.6, top: 8.1, left: 4.5, right: 4.5 } });
  close(trapezoid.height, Math.sqrt(4.5 ** 2 - 2.75 ** 2), 1e-4);
  close(trapezoid.area, (13.6 + 8.1) / 2 * trapezoid.height, 1e-3);
  const triangle = sketchSlopeGeometry({ shape: 'triangle', dims: { base: 6.8, left: 4.8, right: 4.8 } });
  close(triangle.height, Math.sqrt(4.8 ** 2 - 3.4 ** 2), 1e-4);
  // Every edge length matches the measurement it was built from.
  assert.deepEqual(trapezoid.edges.map(e => Math.round(e.length * 100) / 100), [13.6, 4.5, 8.1, 4.5]);
  assert.deepEqual(triangle.edges.map(e => e.type), ['eave', 'hip', 'hip']);
});

test('asymmetric trapezoid, rectangle and parallelogram close correctly', () => {
  const asym = sketchSlopeGeometry({ shape: 'trapezoid', dims: { base: 10, top: 4, left: 5, right: 4 } });
  assert.deepEqual(asym.edges.map(e => Math.round(e.length * 1e4) / 1e4), [10, 4, 4, 5]);
  const rect = sketchSlopeGeometry({ shape: 'rectangle', dims: { base: 8, height: 4 } });
  close(rect.area, 32);
  const para = sketchSlopeGeometry({ shape: 'parallelogram', dims: { base: 3, side: 5, height: 4, lean: 'left' } });
  close(para.area, 12);
  close(para.width, 6);
  close(para.edges[1].length, 5);
});

test('impossible measurements are rejected with an explanation', () => {
  assert.throws(() => sketchSlopeGeometry({ shape: 'triangle', dims: { base: 10, left: 3, right: 3 } }), /cannot form a triangle/);
  assert.throws(() => sketchSlopeGeometry({ shape: 'trapezoid', dims: { base: 10, top: 2, left: 3, right: 3 } }), /too short/);
  assert.throws(() => sketchSlopeGeometry({ shape: 'trapezoid', dims: { base: 5, top: 5, left: 3, right: 3 } }), /rectangle or a parallelogram/);
  assert.throws(() => sketchSlopeGeometry({ shape: 'rectangle', dims: { base: 'x', height: 3 } }), /Eave \(base\)/);
  assert.throws(() => sketchSlopeGeometry({ shape: 'rectangle', dims: { base: 4, height: 3 }, quantity: 0 }), /Identical slopes/);
  assert.throws(() => sketchSlopeGeometry({ shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 0 }] }), /anticlockwise/);
  assert.throws(() => validateSketch({ version: SKETCH_VERSION, slopes: [] }), /1 to/);
});

test('cutting plan counts identical slopes in the totals and order list', () => {
  const single = planSketchSheets(sketch({ shape: 'rectangle', dims: { base: 5, height: 3.5 } }), sheetProfiles.antic);
  const double = planSketchSheets(sketch({ shape: 'rectangle', dims: { base: 5, height: 3.5 }, quantity: 2 }), sheetProfiles.antic);
  assert.equal(single.totals.count, 5);
  assert.equal(double.totals.count, 10);
  close(double.totals.netArea, 35);
  close(double.totals.netArea + double.totals.cutArea + double.totals.overlapArea, double.totals.stockArea);
  assert.equal(double.groups[0].count, 10);
  assert.match(double.groups[0].ids[0], /×2$/);
  assert.match(sheetPlanCsv(double).split('\r\n')[0], /Identical slopes$/);
  // Rectangle 3.5 m uphill on a 350 mm module: exactly 10 modules per sheet.
  assert.ok(single.slopes[0].pieces.every(p => p.modules === 10));
});

test('example sketch area, coverage and shared edge lengths', () => {
  const example = defaultSketch();
  const plan = planSketchSheets(example, sheetProfiles.clasic);
  close(plan.totals.netArea, sketchArea(example), 1e-4);
  for (const slope of plan.slopes) close(slope.pieces.reduce((s, p) => s + p.netArea, 0), slope.netArea);
  assert.ok(example.slopes.every(slope => slope.quantity === 1));
  close(plan.edgeTotals.eave, 13.6 + 6.8, 1e-6);
  close(plan.edgeTotals.ridge, 8.1 / 2, 1e-6);
  close(plan.edgeTotals.hip, (2 * 4.5 + 2 * 4.8) / 2, 1e-3);
  assert.ok(plan.slopes.every(s => s.planPolygons.length));
});

test('dragging keeps eave and ridge level and snaps measurements', () => {
  const slope = { shape: 'trapezoid', dims: { base: 10, top: 5, left: 4, right: 4 }, edges: ['eave', 'hip', 'ridge', 'hip'] };
  const start = sketchSlopeGeometry(slope).points;
  // Ridge corner dragged up and right: both ridge points rise, the eave stays.
  const outline = dragSketchPoint('trapezoid', start, 2, { x: start[2].x + 1, y: start[2].y + 0.5 });
  close(outline[3].y, outline[2].y);
  close(outline[0].y, 0);
  const next = slopeFromPoints(slope, outline, 0.05);
  assert.equal(next.dims.base, 10);
  assert.equal(next.dims.top, 6);
  for (const value of Object.values(next.dims)) close(value / 0.05, Math.round(value / 0.05));
  // Eave corners slide along the eave only.
  const eave = dragSketchPoint('triangle', start.slice(0, 3), 1, { x: 12, y: 3 });
  close(eave[1].y, 0);
  close(eave[1].x, 12);
  // A rectangle corner moves both its sides; a parallelogram ridge moves as one edge.
  const rect = dragSketchPoint('rectangle', [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }], 2, { x: 9, y: 5 });
  assert.deepEqual(slopeFromPoints({ shape: 'rectangle' }, rect).dims, { base: 9, height: 5 });
  const para = dragSketchPoint('parallelogram', [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 4 }, { x: 3, y: 4 }], 3, { x: 1, y: 4 });
  assert.deepEqual(slopeFromPoints({ shape: 'parallelogram' }, para).dims, { base: 3, side: 4.12, height: 4, lean: 'right' });
});

test('typed lengths overwrite the matching measurement', () => {
  const trapezoid = { shape: 'trapezoid', dims: { base: 10, top: 5, left: 4, right: 4 } };
  assert.equal(setSketchEdgeLength(trapezoid, 2, 6).dims.top, 6);
  assert.equal(setSketchEdgeLength(trapezoid, 3, 4.5).dims.left, 4.5);
  assert.equal(trapezoid.dims.top, 5, 'original slope is unchanged');
  close(sketchSlopeGeometry(setSketchHeight(trapezoid, 3)).height, 3, 1e-3);
  const polygon = { shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 6, y: 3 }, { x: 2, y: 3 }] };
  close(sketchSlopeGeometry(setSketchEdgeLength(polygon, 0, 10)).edges[0].length, 10);
  const para = { shape: 'parallelogram', dims: { base: 3, side: 5, height: 4, lean: 'right' } };
  const lower = sketchSlopeGeometry(setSketchHeight(para, 3));
  close(lower.height, 3, 1e-3);
  close(lower.points[3].x - lower.points[0].x, 3, 1e-3);
});
