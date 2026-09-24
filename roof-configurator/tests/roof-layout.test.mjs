import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultLayout, footprintLayout, splitSurface, layoutMetrics, validateLayout,
  insertPoint, cloneLayout,
} from '../js/roofLayout.js';
const rectangle = () => footprintLayout([
  { x: -5, z: -3 }, { x: 5, z: -3 }, { x: 5, z: 3 }, { x: -5, z: 3 },
]);
test('gable area is the analytical sum of its two slopes', () => {
  const result = layoutMetrics(defaultLayout());
  assert.equal(result.footprint, 70);
  assert.ok(Math.abs(result.roofArea - 20 * Math.hypot(3.5, 2)) < 1e-9);
});
test('concave footprint triangulation preserves area in either winding', () => {
  const points = [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 7 }, { x: 0, z: 7 }];
  for (const ring of [points, [...points].reverse()]) {
    const metrics = layoutMetrics(footprintLayout(ring));
    assert.equal(metrics.footprint, 36);
    assert.equal(metrics.roofArea, 36);
  }
});
test('division inserts shared endpoints and preserves source', () => {
  const original = rectangle();
  const next = splitSurface(original, [{ x: -5, z: 0 }, { x: 5, z: 0 }]);
  assert.equal(original.vertices.length, 4);
  assert.equal(next.faces.length, 2);
  for (const id of [4, 5]) {
    assert.equal(next.faces.filter(face => face.includes(id)).length, 2);
    next.vertices[id].h = 2;
  }
  assert.ok(Math.abs(layoutMetrics(next).roofArea - 20 * Math.hypot(3, 2)) < 1e-9);
});
test('multi-segment ridge works and can be divided again', () => {
  let next = splitSurface(rectangle(), [{ x: -5, z: 0 }, { x: -2, z: 0 }, { x: 2, z: 0 }, { x: 5, z: 0 }]);
  next = splitSurface(next, [{ x: -5, z: -3 }, { x: -2, z: 0 }]);
  assert.equal(next.faces.length, 3);
  assert.equal(layoutMetrics(next).roofArea, 60);
});
test('edge insertion updates all incident faces and interpolates height', () => {
  const next = defaultLayout();
  const id = insertPoint(next, { x: 0, z: 0 });
  assert.equal(next.vertices[id].h, 2);
  assert.equal(next.faces.filter(face => face.includes(id)).length, 2);
  validateLayout(next);
});
test('consecutive slopes retain all shared boundaries', () => {
  let next = rectangle();
  for (const x of [-2, 0, 2]) next = splitSurface(next, [{ x, z: -3 }, { x, z: 3 }]);
  next.vertices.forEach(p => { p.h = Math.abs(p.x) === 2 ? 2 : 0; });
  assert.equal(next.faces.length, 4);
  assert.ok(layoutMetrics(next).roofArea > 60);
});
test('rejects crossing perimeter, zero area, external cuts and invalid heights', () => {
  assert.throws(() => footprintLayout([{ x: 0, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 5 }, { x: 5, z: 0 }]));
  assert.throws(() => footprintLayout([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]));
  assert.throws(() => splitSurface(rectangle(), [{ x: -5, z: 0 }, { x: 0, z: 8 }, { x: 5, z: 0 }]));
  const next = defaultLayout();
  next.vertices[0].h = NaN;
  assert.throws(() => validateLayout(next));
});
test('restore rejects gaps, duplicates, invalid indices and crossing edits', () => {
  for (const edit of [
    l => l.faces.pop(), l => l.faces.push([...l.faces[0]]),
    l => l.faces[0].push(999), l => { l.vertices[2].x = -8; },
  ]) {
    const layout = cloneLayout(defaultLayout());
    edit(layout);
    assert.throws(() => validateLayout(layout));
  }
});
test('JSON round-trip preserves topology, heights and area', () => {
  const source = defaultLayout();
  const restored = validateLayout(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(layoutMetrics(source), layoutMetrics(restored));
});
