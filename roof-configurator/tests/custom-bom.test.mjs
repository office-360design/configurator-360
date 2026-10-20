import test from 'node:test';
import assert from 'node:assert/strict';
import { customBomGeometry } from '../js/customBomGeometry.js';
import { calculateBom, bomToCsv } from '../js/bom.js';
import { defaultLayout, layoutMetrics } from '../js/roofLayout.js';
const state = { roofType: 'layout', roofLayout: defaultLayout(), wallHeight: 3, covering: 'metal', currency: 'RON', locale: 'en-US' };
test('drawn gable counts real edges once and ignores coplanar triangulation seams', () => {
  const { lengths, roofArea } = customBomGeometry(state);
  assert.equal(roofArea, layoutMetrics(state.roofLayout).roofArea);
  assert.equal(lengths.ridge, 10);
  assert.equal(lengths.eaves, 20);
  assert.equal(lengths.valley, 0);
  assert.equal(lengths.ridgeCaps, 2);
  assert.ok(Math.abs(lengths.gable - 4 * Math.hypot(3.5,2)) < 1e-8);
});
test('measured slope copies count area and shared trims correctly', () => {
  const result = customBomGeometry({ roofType: 'sketch', slopeSketch: { version: 1, slopes: [
    { shape: 'rectangle', dims: { base: 10, height: 4 }, quantity: 2 }
  ] } });
  assert.equal(result.roofArea, 80);
  assert.equal(result.lengths.ridge, 10);
  assert.equal(result.lengths.eaves, 20);
  assert.equal(result.lengths.gable, 16);
});
test('custom estimate supports exclusions, conversion and CSV; images remain unestimated', () => {
  const bom = calculateBom(state, {});
  assert.ok(bom.lines.length > 0 && bom.total > 0 && bom.customEstimate);
  assert.ok(bom.lines.every(l => Number.isFinite(l.value) && Number.isInteger(l.quantity)));
  const converted = calculateBom({ ...state, currency: 'EUR', currencyRate: .2 }, {});
  assert.ok(Math.abs(converted.total - bom.total * .2) < 1e-8);
  const excluded = calculateBom({ ...state, excludedBomItems: bom.lines.map(l => l.key) }, {});
  assert.equal(excluded.total, 0);
  assert.match(bomToCsv(bom), /RON/);
  assert.equal(calculateBom({ ...state, roofType: 'custom' }, {}).lines.length, 0);
});
test('roof with no eaves does not invent drainage', () => {
  const bom = calculateBom({ ...state, roofType: 'sketch', slopeSketch: {version:1, slopes:[
    {shape:'rectangle', dims:{base:4,height:3}, edges:['wall','wall','wall','wall']}
  ]}}, {});
  assert.equal(bom.lines.some(l => l.key.startsWith('downpipe') || l.key === 'gutter-outlet'), false);
});
