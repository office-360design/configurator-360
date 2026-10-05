import test from 'node:test';
import assert from 'node:assert/strict';
import { extendPerimeter } from '../js/perimeter.js';
import { footprintLayout, layoutMetrics, splitSurface, splitLayoutInPlace, validateLayout } from '../js/roofLayout.js';
import { roofWindowGeometry } from '../js/roofWindows.js';
const roof = () => {
  const layout = footprintLayout([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }]);
  layout.vertices.forEach(p => { p.h = p.z * .5; });
  layout.roofWindows = [{ x: 4, z: 3, width: .78, length: 1.18 }];
  return layout;
};
test('extension preserves existing geometry and windows and follows the edge slope', () => {
  const source = roof(), before = structuredClone(source);
  const { layout, id } = extendPerimeter(source, [2, 3], { x: 4, z: 8 });
  assert.deepEqual(source, before);
  assert.deepEqual(layout.vertices.slice(0, 4), source.vertices);
  assert.deepEqual(layout.faces.slice(0, 1), source.faces);
  assert.deepEqual(layout.roofWindows, source.roofWindows);
  assert.equal(roofWindowGeometry(layout).length, 1);
  assert.equal(layout.vertices[id].h, 4);
  assert.equal(layoutMetrics(layout).footprint, 56);
  assert.equal(layout.boundary.length, 5);
});
test('repeated extensions can form a rectangular addition', () => {
  const first = extendPerimeter(roof(), [2, 3], { x: 8, z: 8 });
  const second = extendPerimeter(first.layout, [first.id, 3], { x: 0, z: 8 });
  assert.equal(layoutMetrics(second.layout).footprint, 64);
  validateLayout(second.layout);
});
test('reject interior edges, interior points and crossing extensions without mutating source', () => {
  const source = splitSurface(roof(), [{ x: 4, z: 0 }, { x: 4, z: 6 }]);
  const before = structuredClone(source);
  assert.throws(() => extendPerimeter(source, [4, 5], { x: 10, z: 3 }), /outer perimeter/);
  assert.throws(() => extendPerimeter(source, [0, 4], { x: 2, z: 1 }), /outside/);
  assert.throws(() => extendPerimeter(source, [0, 4], { x: 2, z: 8 }));
  assert.deepEqual(source, before);
});
test('extension supports linked boundary copies with independent heights', () => {
  const divided = splitSurface(roof(), [{ x: 4, z: 0 }, { x: 4, z: 6 }]);
  const split = splitLayoutInPlace(divided, [4, 5], [0]);
  const source = split.layout || split;
  const edge = [source.boundary[0], source.boundary[1]];
  const added = extendPerimeter(source, edge, { x: 2, z: -2 });
  validateLayout(added.layout);
  assert.deepEqual(added.layout.planLinks, source.planLinks);
});
