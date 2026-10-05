import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  normalize,
  areaGeometry,
  layout,
  estimate,
  curbLayout,
} from '../js/model.js';
import { polygonArea } from '../js/area.js';

const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

const concave = [
  { x: 4, z: 3 },
  { x: 10, z: 3 },
  { x: 10, z: 5 },
  { x: 7, z: 5 },
  { x: 7, z: 8 },
  { x: 4, z: 8 },
];

test('freeform area normalizes scene coordinates and preserves every corner', () => {
  const state = normalize({
    ...DEFAULTS,
    shape: 'custom',
    areaPoints: concave,
    edges: [false, true, false, true, false, true],
  });
  assert.equal(state.shape, 'custom');
  assert.equal(state.areaPoints.length, 6);
  assert.equal(Math.min(...state.areaPoints.map((p) => p.x)), 0);
  assert.equal(Math.min(...state.areaPoints.map((p) => p.z)), 0);
  assert.deepEqual(state.edges, [false, true, false, true, false, true]);

  const geometry = areaGeometry(state);
  near(geometry.area, 21);
  near(polygonArea(geometry.points), 21);
  near(geometry.width, 6);
  near(geometry.depth, 5);
});

test('freeform paving clips layouts to a concave polygon', () => {
  for (const [tile, pattern] of [
    ['square', 'stack'],
    ['parket', 'running'],
    ['hbeton', 'interlocking'],
  ]) {
    const state = normalize({
      ...DEFAULTS,
      shape: 'custom',
      areaPoints: concave,
      tile,
      pattern,
      waste: 0,
    });
    const pieces = layout(state);
    const covered = pieces.reduce((sum, piece) => sum + (piece.area ?? piece.l * piece.w), 0);
    near(covered, 21, 2e-5);
    near(estimate(state, pieces).grossArea, 21);
  }
});

test('freeform curbs keep one edge toggle per polygon side', () => {
  const state = normalize({
    ...DEFAULTS,
    shape: 'custom',
    areaPoints: concave,
    edges: [true, false, true, false, true, false],
  });
  const parts = curbLayout(state);
  assert.ok(parts.length > 0);
  for (const part of parts) assert.equal(state.edges[part.side], true);
});

test('clockwise freeform input is accepted and converted to a usable outline', () => {
  const state = normalize({
    ...DEFAULTS,
    shape: 'custom',
    areaPoints: [...concave].reverse(),
  });
  assert.equal(state.shape, 'custom');
  near(areaGeometry(state).area, 21);
  assert.ok(layout(state).length > 0);
});

test('invalid freeform polygons do not become persisted custom state', () => {
  const crossing = [
    { x: 0, z: 0 },
    { x: 4, z: 4 },
    { x: 0, z: 4 },
    { x: 4, z: 0 },
  ];
  const state = normalize({ ...DEFAULTS, shape: 'custom', areaPoints: crossing });
  assert.equal(state.shape, 'rectangle');
  assert.equal(state.areaPoints, null);
  assert.throws(() => areaGeometry({ shape: 'custom', areaPoints: crossing }), /invalidArea/);
});
