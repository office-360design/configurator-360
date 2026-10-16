import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING, anchorLevels, facadeBuilding, skylightBuilding } from '../js/building.js';

const model = (W, H, extra = {}) => {
  const widths = Array.from({ length: Math.round(W / 1500) }, () => 1500);
  const xs = widths.reduce((acc, w) => [...acc, acc.at(-1) + w], [0]);
  return { W: xs.at(-1), H, xs, faceWidth: 52, mullion: { depth: 105 }, S: { anchorSpacing: 3300 }, ...extra };
};
const span = (boxes, k) => [Math.min(...boxes.map(b => b[`${k}0`])), Math.max(...boxes.map(b => b[`${k}1`]))];

test('a slab at every anchor level, the top included', () => {
  assert.deepEqual(anchorLevels(6600, 3300), [0, 3300, 6600]);
  assert.deepEqual(anchorLevels(3000, 3300), [0, 3000]);
  assert.deepEqual(anchorLevels(7000, 3300), [0, 3300, 6600, 7000]);
});

test('the building scales with the facade', () => {
  const small = facadeBuilding(model(3000, 3000)), big = facadeBuilding(model(12000, 9900));
  const slabs = b => b.concrete.filter(c => c.y1 - c.y0 === BUILDING.slabThickness);
  assert.equal(slabs(small).length, 2);
  assert.equal(slabs(big).length, 4);
  assert.deepEqual(span(big.concrete, 'x'), [-BUILDING.slabOverhang, 12000 + BUILDING.slabOverhang]);
  assert.equal(span(big.concrete, 'y')[1], 9900, 'the top slab is at the facade top');
  const depth = b => -span(b.concrete, 'z')[0];
  assert.ok(depth(big) > depth(small), 'wider facades get a deeper building');
  // Slab edges stay clear of the mullions by the bracket zone.
  assert.equal(span(big.concrete, 'z')[1], -(105 + BUILDING.bracketGap));
});

test('one bracket set per mullion and anchor level, reaching the mullion', () => {
  const m = model(6000, 6600), b = facadeBuilding(m);
  assert.equal(b.anchors, m.xs.length * 3);
  assert.equal(b.steel.length, b.anchors * 3, 'base plate + two fins');
  const fins = b.steel.filter(s => s.x1 - s.x0 === BUILDING.bracket.fin);
  assert.ok(fins.every(f => f.z1 > -105 && f.z0 < -(105 + BUILDING.bracketGap)), 'fins span from the slab to the mullion side');
});

test('skylight: ridge wall behind the top, eaves beam under the bottom', () => {
  const m = model(6000, 3600, { slopeDeg: 15 });
  const b = skylightBuilding(m);
  const wall = b.concrete[0], a = 15 * Math.PI / 180;
  assert.ok(wall.y1 > BUILDING.eavesHeight + 3600 * Math.sin(a), 'the wall rises above the ridge');
  assert.ok(wall.z1 < -3600 * Math.cos(a), 'the wall stands behind the ridge');
  assert.equal(b.anchors, 2 * m.xs.length);
});
