import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoofSheets, sheetProfiles, validateSheetProfile, sheetPlanCsv, partitionTargets } from '../js/sheetPlanner.js';
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


test('custom sections keep coverage while adding allowance for each sheet', () => {
  const layout = rectangle(2, 12.25);
  const automatic = planRoofSheets(layout, sheetProfiles.antic);
  const first = automatic.slopes[0].pieces[0].baseId;
  for (const parts of [[11, 11], [7, 7, 8]]) {
    const plan = planRoofSheets(layout, sheetProfiles.antic, { partitions: { [first]: parts } });
    assert.deepEqual(plan.slopes[0].pieces.filter(p => p.column === 1).map(p => p.modules), [...parts, 13]);
    assert.deepEqual(plan.slopes[0].pieces.filter(p => p.column === 2).map(p => p.modules), [22, 13]);
    close(plan.totals.modules, automatic.totals.modules);
    close(plan.totals.netArea, automatic.totals.netArea);
    close(plan.totals.linearMetres - automatic.totals.linearMetres, (parts.length - 1) * .1);
    assert.equal(plan.slopes[0].pieces.filter(p => p.baseId === first).reduce((n,p) => n + p.length - p.modules * 350, 0), parts.length * 100);
    assert.equal(new Set(plan.slopes[0].pieces.map(p => p.id)).size, plan.totals.count);
    checkCoverage(plan);
    assert.match(sheetPlanCsv(plan), new RegExp(',1,' + parts[0] + ','));
  }
});

test('bulk targets match original section lengths, even after splitting', () => {
  const layout = defaultLayout();
  const plan = planRoofSheets(layout, sheetProfiles.antic);
  const base = plan.slopes[0].pieces[0];
  assert.deepEqual(partitionTargets(plan, base.baseId, 'column'), [base.baseId]);
  const surface = partitionTargets(plan, base.baseId, 'surface');
  const global = partitionTargets(plan, base.baseId, 'global');
  assert.ok(surface.length > 1);
  assert.ok(global.length > surface.length);
  for (const key of global) assert.equal(plan.slopes.flatMap(s => s.pieces).find(p => p.baseId === key).baseModules, base.baseModules);
  const parts = [3, base.baseModules - 3];
  const next = planRoofSheets(layout, sheetProfiles.antic, {partitions: Object.fromEntries(global.map(key => [key, parts]))});
  assert.deepEqual(partitionTargets(next, base.baseId, 'global'), global);
  checkCoverage(next);
});

test('invalid partitions fail instead of changing roof coverage', () => {
  const layout = rectangle(1, 7.7);
  for (const parts of [[11,10], [1,21], [7.5,14.5], [23], [], [NaN], ['11',11]]) {
    assert.throws(() => planRoofSheets(layout, sheetProfiles.antic, {partitions:{'A-1.1':parts}}), /partition/);
  }
});


test('bulk partitioning skips different column lengths and repeated sections', () => {
  const pieces = (column, counts) => counts.map((baseModules, i) => ({column, baseModules, baseId:`A-${column}.${i+1}`}));
  const plan = {slopes:[{id:'A', pieces:[...pieces(1,[22,22,13]), ...pieces(2,[22,22,13]), ...pieces(3,[22,13])]}]};
  assert.deepEqual(partitionTargets(plan, 'A-1.1', 'surface'), ['A-1.1','A-2.1']);
});

test('independent 2D surfaces preserve true dimensions, distinct IDs and aggregate orders', () => {
  const surfaces = [
    [{x:0,y:0},{x:10,y:0},{x:8,y:5},{x:2,y:5}],
    [{x:0,y:0},{x:6,y:0},{x:3,y:4}],
  ];
  const plan = planRoofSheets({ surfaces }, sheetProfiles.antic);
  assert.equal(plan.drawnSurfaces, true);
  assert.deepEqual(plan.slopes.map(s => s.id), ['A','B']);
  close(plan.totals.netArea, 52);
  assert.deepEqual(plan.slopes.map(s => s.columns), [10,6]);
  assert.ok(plan.slopes.every(s => !s.warnings.some(w => /Pitch|Flat surface/.test(w))));
  assert.ok(plan.slopes[1].pieces.every(p => p.id.startsWith('B-')));
  checkCoverage(plan);
  assert.match(sheetPlanCsv(plan), /B-1.1/);
});

test('2D surface partitions target separate surfaces and retain total area', () => {
  const rectangle = [{x:0,y:0},{x:2,y:0},{x:2,y:7.7},{x:0,y:7.7}];
  const plan = planRoofSheets({surfaces:[rectangle,rectangle]}, sheetProfiles.antic, {
    partitions:{'B-1.1':[11,11]},
  });
  assert.deepEqual(plan.slopes[0].pieces.filter(p=>p.column===1).map(p=>p.modules),[22]);
  assert.deepEqual(plan.slopes[1].pieces.filter(p=>p.column===1).map(p=>p.modules),[11,11]);
  checkCoverage(plan);
  assert.throws(() => planRoofSheets({surfaces:[]},sheetProfiles.antic), /at least one/);
  assert.throws(() => planRoofSheets({surfaces:[[{x:0,y:0},{x:5,y:5},{x:5,y:0},{x:0,y:5}]]},sheetProfiles.antic));
});
