import test from 'node:test';
import assert from 'node:assert/strict';
import { addDormer } from '../js/roofFeatures.js';
import { cloneLayout, defaultLayout, layoutMetrics, layoutStepWalls, validateLayout, splitLayoutInPlace } from '../js/roofLayout.js';
const options = { faceIndex: 0, x: 0, z: -2.7, width: 1.6, wallRise: 0.5, pitch: 25 };
test('dormer adds editable slopes and closing walls without changing the footprint or source', () => {
  const source = defaultLayout(), original = cloneLayout(source);
  const result = addDormer(source, options);
  validateLayout(result.layout);
  assert.deepEqual(source, original);
  assert.equal(layoutMetrics(result.layout).footprint, layoutMetrics(source).footprint);
  assert.ok(layoutStepWalls(result.layout).length >= 3);
  assert.ok(result.layout.planLinks.length >= 3);
  assert.equal(result.roofFaces.length, 2);
  assert.ok(result.layout.faces.length > source.faces.length);
  const serialized = JSON.parse(JSON.stringify(result.layout));
  validateLayout(serialized);
});
test('dormer follows rotated slope directions and preserves existing split heights', () => {
  let source = splitLayoutInPlace(defaultLayout(), [2, 5], [1]).layout;
  source.vertices.at(-1).h += 0.4;
  source.vertices.forEach(p => { const x = p.x, z = p.z; p.x = z; p.z = -x; });
  const result = addDormer(source, { ...options, x: -2.7, z: 0 });
  validateLayout(result.layout);
  for (const p of source.vertices) assert.ok(result.layout.vertices.some(q => q.x === p.x && q.z === p.z && q.h === p.h));
  assert.ok(result.outline.some(p => p.x > -2.7));
});
test('invalid placement and dimensions leave the source untouched', () => {
  const source = defaultLayout(), original = cloneLayout(source);
  for (const patch of [{ x: 5 }, { width: 8 }, { wallRise: 4 }, { width: NaN }, { pitch: 0 }]) {
    assert.throws(() => addDormer(source, { ...options, ...patch }));
    assert.deepEqual(source, original);
  }
  const flat = defaultLayout(); flat.vertices.forEach(p => { p.h = 0; });
  assert.throws(() => addDormer(flat, options), /sloping/);
  const folded = defaultLayout(); folded.vertices[0].h = 1;
  assert.throws(() => addDormer(folded, options), /planar/);
});

test('a second dormer can be added on another slope', () => {
  const first = addDormer(defaultLayout(), options);
  const second = addDormer(first.layout, { ...options, faceIndex: 1, z: 2.7 });
  validateLayout(second.layout);
  assert.equal(layoutMetrics(second.layout).footprint, 70);
  assert.ok(second.layout.vertices.length > first.layout.vertices.length);
});

test('default dormer placement merges numerically coincident corners near zero', () => {
  const result = addDormer(defaultLayout(), { faceIndex: 0, x: 0, z: -1.75, width: 1.4, wallRise: 0.3, pitch: 25 });
  validateLayout(result.layout);
  assert.equal(layoutMetrics(result.layout).footprint, 70);
});
