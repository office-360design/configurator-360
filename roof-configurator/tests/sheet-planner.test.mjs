import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoofSheets, sheetProfiles, validateSheetProfile, sheetPlanCsv } from '../js/sheetPlanner.js';
import { defaultLayout, layoutMetrics } from '../js/roofLayout.js';
import { presetRoofLayout } from '../js/presetLayout.js';
import { addDormer } from '../js/roofFeatures.js';

const rectangle = (width, run, rise = 0) => ({ version: 1, vertices: [
  { x: 0, z: 0, h: 0 }, { x: width, z: 0, h: 0 },
  { x: width, z: run, h: rise }, { x: 0, z: run, h: rise },
], boundary: [0, 1, 2, 3], faces: [[0, 1, 2, 3]] });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const checkCoverage = plan => {
  for (const slope of plan.slopes) {
    close(slope.pieces.reduce((sum, p) => sum + p.netArea, 0), slope.netArea);
    for (const piece of slope.pieces) {
      assert.ok(piece.modules >= plan.profile.minModules);
      assert.ok(piece.modules <= plan.profile.maxModules);
      assert.ok(piece.length <= plan.profile.maxLength);
      close(piece.y / (plan.profile.module / 1000), Math.round(piece.y / (plan.profile.module / 1000)));
    }
  }
  close(plan.totals.netArea + plan.totals.cutArea + plan.totals.overlapArea, plan.totals.stockArea);
};

test('catalogue presets preserve dimensions and respect conflicting Clasic max length', () => {
  assert.equal(validateSheetProfile(sheetProfiles.antic).allowedMaxModules, 22);
  assert.equal(validateSheetProfile(sheetProfiles.clasic).allowedMaxModules, 21);
  assert.equal(sheetProfiles.clasic.usefulWidth, 1080);
  assert.equal(sheetProfiles.antic.minModules * sheetProfiles.antic.module + sheetProfiles.antic.endOverlap, 1150);
  assert.equal(sheetProfiles.clasic.minModules * sheetProfiles.clasic.module + sheetProfiles.clasic.endOverlap, 1220);
});
test('rectangle uses effective width, real slope length, modular lengths and full stock area', () => {
  const source = rectangle(2, 2.8, 2.1), before = structuredClone(source);
  const plan = planRoofSheets(source, sheetProfiles.antic);
  assert.equal(plan.totals.count, 2);
  assert.equal(plan.totals.modules, 20);
  assert.equal(plan.slopes[0].pieces[0].length, 3600);
  close(plan.totals.netArea, 7);
  close(plan.totals.stockArea, 8.136);
  close(plan.totals.cutArea, 0);
  assert.deepEqual(source, before);
  checkCoverage(plan);
});
test('long runs split within the module range and preserve minimum size', () => {
  const plan = planRoofSheets(rectangle(1, 8.05), sheetProfiles.antic);
  assert.deepEqual(plan.slopes[0].pieces.map(p => p.modules), [20, 3]);
  assert.equal(plan.totals.count, 2);
  close(plan.totals.cutArea, 0);
  checkCoverage(plan);
  checkCoverage(planRoofSheets(rectangle(1, 8.05), { ...sheetProfiles.antic, minModules: 22 }));
  checkCoverage(planRoofSheets(rectangle(1, 15.75), { ...sheetProfiles.antic, minModules: 20 }));
});
test('coplanar subdivisions are one slope while genuine folds stay separate', () => {
  const layout = rectangle(3, 4, 2);
  layout.faces = [[0, 1, 2], [0, 2, 3]];
  assert.equal(planRoofSheets(layout, sheetProfiles.antic).slopes.length, 1);
  layout.vertices[1].h = 1;
  assert.equal(planRoofSheets(layout, sheetProfiles.antic).slopes.length, 2);
});
test('hips, L roofs and dormer cutouts retain full true area without double counting', () => {
  for (const roofType of ['shed', 'gable', 'hip', 'lshape', 'dormer']) {
    const layout = presetRoofLayout({ roofType, length: 10, depth: 7, overhang: .45, pitch: 30, wallHeight: 3 });
    const plan = planRoofSheets(layout, sheetProfiles.antic);
    checkCoverage(plan);
    close(plan.totals.netArea, layoutMetrics(layout).roofArea);
  }
  const layout = addDormer(defaultLayout(), { faceIndex: 0, x: 0, z: -2.75, width: 1.6, wallRise: .5, pitch: 25 }).layout;
  checkCoverage(planRoofSheets(layout, sheetProfiles.clasic, { direction: 'right', offset: 300 }));
});
test('offset and start side affect sheet positions while preserving coverage', () => {
  const layout = rectangle(2.5, 3);
  const left = planRoofSheets(layout, sheetProfiles.antic, { offset: 600 });
  const right = planRoofSheets(layout, sheetProfiles.antic, { direction: 'right', offset: 600 });
  assert.equal(left.totals.count, 4);
  assert.notEqual(left.slopes[0].pieces[0].x, right.slopes[0].pieces[0].x);
  close(left.totals.netArea, right.totals.netArea);
  checkCoverage(left); checkCoverage(right);
});
test('reject invalid dimensions and offsets; warn about unsuitable slope pitch', () => {
  for (const patch of [{ usefulWidth: 1500 }, { module: 0 }, { endOverlap: NaN }, { minModules: 2.5 }, { maxLength: 300 }]) {
    assert.throws(() => planRoofSheets(defaultLayout(), { ...sheetProfiles.antic, ...patch }));
  }
  assert.throws(() => planRoofSheets(defaultLayout(), sheetProfiles.antic, { offset: 1000 }));
  assert.ok(planRoofSheets(rectangle(2, 3), sheetProfiles.antic).slopes[0].warnings.length);
});
test('CSV piece quantities and grouped order counts reconcile', () => {
  const plan = planRoofSheets(defaultLayout(), sheetProfiles.clasic);
  assert.equal(plan.groups.reduce((sum, g) => sum + g.count, 0), plan.totals.count);
  assert.equal(sheetPlanCsv(plan).split('\r\n').filter(row => /^[A-Z]+,/.test(row)).length, plan.totals.count);
});
