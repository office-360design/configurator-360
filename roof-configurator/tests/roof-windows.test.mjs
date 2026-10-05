import test from 'node:test';
import assert from 'node:assert/strict';
import { roofWindowGeometry, cutRoofWindows } from '../js/roofWindows.js';
import { footprintLayout, roofSurfaceGroups, signedArea } from '../js/roofLayout.js';
import { planRoofSheets, sheetProfiles } from '../js/sheetPlanner.js';

const roof = () => {
  const layout = footprintLayout([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }]);
  layout.vertices.forEach(p => { p.h = p.z * .5; });
  layout.roofWindows = [{ x: 3, z: 3, width: .78, length: 1.18 }];
  return layout;
};

test('roof window dimensions are measured in the slope and cut the exact area', () => {
  const layout = roof(), windows = roofWindowGeometry(layout), corners = windows[0].corners;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, a.h - b.h);
  assert.ok(Math.abs(distance(corners[0], corners[1]) - .78) < 1e-8);
  assert.ok(Math.abs(distance(corners[1], corners[2]) - 1.18) < 1e-8);
  const polygons = roofSurfaceGroups(layout).flatMap(g => g.patches.map(ids => ids.map(id => layout.vertices[id])));
  const area = polys => polys.reduce((sum, p) => sum + Math.abs(signedArea(p)) * Math.hypot(1, .5), 0);
  const clipped = polygons.flatMap(p => cutRoofWindows(p, windows));
  assert.ok(Math.abs(area(polygons) - area(clipped) - .78 * 1.18) < 1e-8);
  const plan = planRoofSheets(layout, sheetProfiles.antic);
  assert.ok(Math.abs(plan.totals.netArea - area(clipped)) < 1e-8);
  assert.equal(plan.slopes.length, 1);
});

test('multiple windows survive serialization and roof rotation', () => {
  const layout = roof();
  layout.roofWindows.push({ x: 5, z: 3, width: 1, length: 1.4 });
  const rotate = p => { const x = p.x; p.x = x * .6 - p.z * .8; p.z = x * .8 + p.z * .6; };
  layout.vertices.forEach(rotate); layout.roofWindows.forEach(rotate);
  assert.equal(roofWindowGeometry(JSON.parse(JSON.stringify(layout))).length, 2);
  const plan = planRoofSheets(layout, sheetProfiles.antic);
  assert.ok(Math.abs(plan.totals.netArea - (48 * Math.hypot(1, .5) - .78 * 1.18 - 1.4)) < 1e-7);
});

test('windows reject overlaps, edge crossings, flat hosts and invalid dimensions', () => {
  let layout = roof(); layout.roofWindows.push({ ...layout.roofWindows[0], x: 3.1 });
  assert.throws(() => roofWindowGeometry(layout), /overlap/);
  layout = roof(); layout.roofWindows[0].x = .2;
  assert.throws(() => roofWindowGeometry(layout), /8 cm/);
  layout = roof(); layout.vertices.forEach(p => { p.h = 0; });
  assert.throws(() => roofWindowGeometry(layout), /sloping/);
  layout = roof(); layout.roofWindows[0].length = NaN;
  assert.throws(() => roofWindowGeometry(layout), /width/);
});

test('folds through an existing window are rejected', () => {
  const layout = roof();
  layout.roofWindows[0].x = 4;
  layout.vertices[0].h += 1;
  assert.throws(() => roofWindowGeometry(layout), /8 cm/);
});
