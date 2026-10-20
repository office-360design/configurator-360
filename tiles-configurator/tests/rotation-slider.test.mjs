import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, TILES, normalize, areaGeometry, layout, estimate } from '../js/model.js';

const near = (a, b, tolerance = 2e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const custom = [
  { x: 0, z: 0 },
  { x: 5.2, z: 0.3 },
  { x: 4.7, z: 3.8 },
  { x: 2.4, z: 3.1 },
  { x: 0.2, z: 4.1 },
];

for (const rotation of [0, 17, 37, 90, 181, 271, 359, 360])
  for (const [tile, catalog] of Object.entries(TILES))
    for (const pattern of catalog.patterns)
      test(`rotation ${rotation}° covers rectangle: ${tile}/${pattern}`, () => {
        const state = normalize({ ...DEFAULTS, length: 2.3, width: 1.7, rotation, tile, pattern, waste: 0 });
        assert.equal(state.rotation, rotation);
        const geometry = areaGeometry(state), pieces = layout(state);
        const covered = pieces.reduce((sum, p) => sum + (p.area ?? p.l * p.w), 0);
        near(covered, geometry.area);
        near(estimate(state, pieces).area, geometry.area);
        for (const piece of pieces) {
          assert.ok(Number.isFinite(piece.x) && Number.isFinite(piece.z));
          assert.ok((piece.area ?? 0) > 0);
        }
      });

for (const rotation of [13, 45, 123, 225, 347])
  for (const [tile, pattern] of [['square', 'stack'], ['parket', 'herringbone'], ['hbeton', 'interlocking']])
    test(`rotation ${rotation}° covers freeform: ${tile}/${pattern}`, () => {
      const state = normalize({ ...DEFAULTS, shape: 'custom', areaPoints: custom, rotation, tile, pattern, waste: 0 });
      const geometry = areaGeometry(state), pieces = layout(state);
      const covered = pieces.reduce((sum, p) => sum + (p.area ?? p.l * p.w), 0);
      near(covered, geometry.area);
    });

test('rotation input is clamped to the slider range', () => {
  assert.equal(normalize({ rotation: -10 }).rotation, 0);
  assert.equal(normalize({ rotation: 361 }).rotation, 360);
  assert.equal(normalize({ rotation: 42.5 }).rotation, 42.5);
  assert.equal(normalize({ rotation: 'bad' }).rotation, 0);
});

for (const rotation of [0, 33, 90, 217])
  test(`rotation ${rotation}° still excludes the house footprint`, () => {
    const state = normalize({
      ...DEFAULTS,
      length: 6,
      width: 4,
      tile: 'parket',
      pattern: 'running',
      rotation,
      houseEnabled: true,
      houseShape: 'rectangle',
      houseLength: 2,
      houseWidth: 1,
      houseX: 2,
      houseZ: 1.5,
      waste: 0,
    });
    const pieces = layout(state), estimateResult = estimate(state, pieces);
    near(estimateResult.grossArea, 24);
    near(estimateResult.houseArea, 2, 2e-4);
    near(estimateResult.area, 22, 2e-4);
  });
