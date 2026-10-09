import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROFILES, SYSTEM, estimatedKgPerM, frameUf, getProfile, glazingComponents } from '../js/catalog.js';
import {
  DEFAULT_STATE, PRESETS, checks, cutPlan, deadIRequired, facadeModel, mullionPieces, normalizeState, windIRequired,
} from '../js/facade.js';
import { MESSAGES } from '../js/i18n.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('profile table matches the GCW 050 catalogue pages 5–11', () => {
  assert.deepEqual(PROFILES.map(p => p.depth), [30, 55, 75, 95, 115, 135, 155, 175, 195]);
  assert.equal(getProfile('150095').Ix, 100.46);
  assert.equal(getProfile('150095').Iy, 24.75);
  assert.equal(getProfile('150195').Ix, 695.53);
  assert.equal(getProfile('150075').connector, '750603');
  // Ix and Iy grow with depth.
  PROFILES.slice(1).forEach((p, i) => { assert.ok(p.Ix > PROFILES[i].Ix && p.Iy > PROFILES[i].Iy); });
  // Estimated mass is plausible for 50 mm aluminium tubes (≈ 1.5–4 kg/m).
  PROFILES.slice(1).forEach(p => { const kg = estimatedKgPerM(p); assert.ok(kg > 1.2 && kg < 4.5, `${p.id} ${kg}`); });
});

test('glazing table rows transcribed from the catalogue', () => {
  // Spot checks against the printed table (glass / strip → screw, support, insulator, drainage).
  const row = (t, strip) => { const c = glazingComponents(t, strip); return [c.screw.id, c.glassSupport, c.insulator, c.drainage]; };
  assert.deepEqual(row(12, '159301'), ['815532', '750632', null, null]);
  assert.deepEqual(row(14, '159301'), ['815538', '750632', null, null]);
  assert.deepEqual(row(24, '159310'), ['815542', '750633', '760382', '750029']);
  assert.deepEqual(row(32, '159210'), ['816550', '750634', '760382', null]);
  assert.deepEqual(row(32, '159310'), ['815550', '750634', '760382', '750027']);
  assert.deepEqual(row(40, '159301'), ['815565', '750635', '760383', null]);
  assert.deepEqual(row(50, '159225'), ['816570', '750637', '760384', null]);
  assert.deepEqual(row(52, '159310'), ['815570', '750637', '760385', '750045']);
  assert.deepEqual(row(64, '159301'), ['815585', '750638', '760385', null]);
  assert.equal(glazingComponents(13, '159301'), null, 'odd thickness is not in the table');
  assert.equal(glazingComponents(66, '159301'), null);
});

test('Uf follows the heat calculation diagram', () => {
  close(frameUf(24, 55), 1.515, 1e-9);
  close(frameUf(64, 195), 0.775, 1e-9);
  assert.ok(frameUf(32, 135) > frameUf(32, 55), 'deeper profiles have a slightly higher Uf');
  assert.ok(frameUf(30, 95) < frameUf(28, 95) && frameUf(30, 95) > frameUf(32, 95), 'interpolated between thicknesses');
  assert.equal(frameUf(20, 95), null);
});

test('deflection formulas: l/200 max 15 mm for wind, min(3 mm, B/500) for dead load', () => {
  // 0.8 kN/m², 1.5 m tributary, 3.3 m span: 5·1.2·3300⁴ / (384·70000·15) mm⁴.
  close(windIRequired(0.8, 1500, 3300), 5 * 1.2 * 3300 ** 4 / (384 * 70000 * 15) / 1e4, 1e-9);
  // Long spans use the 15 mm cap instead of l/200.
  close(windIRequired(1, 1000, 4000), 5 * 1 * 4000 ** 4 / (384 * 70000 * 15) / 1e4, 1e-9);
  close(windIRequired(1, 1000, 2000), 5 * 1 * 2000 ** 4 / (384 * 70000 * 10) / 1e4, 1e-9);
  // 1000 N pane on a 1500 mm transom, blocks 150 mm from the ends, f = 3 mm.
  close(deadIRequired(1000, 1500), 500 * 150 * (3 * 1500 ** 2 - 4 * 150 ** 2) / (24 * 70000 * 3) / 1e4, 1e-9);
});

test('automatic profiles are the smallest that pass every member', () => {
  const m = facadeModel(DEFAULT_STATE);
  assert.equal(m.W, 6000);
  assert.equal(m.H, 6600);
  assert.equal(m.span, 3300);
  assert.equal(m.mullion.id, '150135');
  const smaller = PROFILES[PROFILES.findIndex(p => p.id === m.mullion.id) - 1];
  assert.ok(smaller.Ix < m.need.mullion, 'the next smaller mullion would fail');
  assert.ok(m.transom.Ix >= m.need.transomX && m.transom.Iy >= m.need.transomY);
  assert.ok(checks(m).every(c => c.lv !== 'err'));
  // Higher wind needs a deeper mullion.
  assert.ok(facadeModel({ ...DEFAULT_STATE, windLoad: 2 }).mullion.depth > m.mullion.depth);
  // An impossible span is reported, not hidden.
  const huge = facadeModel({ ...DEFAULT_STATE, windLoad: 3, anchorSpacing: 7000, widths: [4000, 4000], heights: [3500, 3500] });
  assert.ok(checks(huge).some(c => c.key === 'check.noMullion'));
  // A manual undersized mullion is flagged.
  assert.ok(checks(facadeModel({ ...DEFAULT_STATE, mullion: '150055' })).some(c => c.lv === 'err' && c.key === 'check.mullionWind'));
});

test('grid, panes and transoms follow the axis grid', () => {
  const m = facadeModel(PRESETS.storefront);
  assert.deepEqual(m.xs, [0, 1200, 3000, 4800, 6000]);
  assert.equal(m.mullions.length, 5);
  assert.equal(m.transoms.length, 2 * 4, 'bottom and top transom in every bay');
  assert.equal(m.transoms[0].length, 1200 - SYSTEM.faceWidth);
  assert.equal(m.panes[0].width, 1200 - 22);
  assert.ok(m.transoms.filter(t => t.line === 1).every(t => t.IyReq === 0), 'the top transom carries no pane');
});

test('cutting plan and mullion splices', () => {
  const plan = cutPlan([3300, 3300, 2700, 1450, 1450]);
  assert.equal(plan.bars, 3);
  assert.ok(plan.cuts.every(cuts => cuts.reduce((s, c) => s + c, 0) + 5 * (cuts.length - 1) <= 6000));
  assert.deepEqual(mullionPieces(6600, 3300), [3300, 3300]);
  assert.deepEqual(mullionPieces(5000, 3300), [5000]);
  assert.deepEqual(mullionPieces(7500, 2500), [5000, 2500]);
  assert.throws(() => cutPlan([6500]));
});

test('bill of materials quantities', () => {
  const m = facadeModel(DEFAULT_STATE);
  const item = id => m.bom.items.find(i => i.id === id);
  assert.equal(item(m.transom.connector).qty, 2 * m.transoms.length);
  assert.equal(item('445001').qty, 5, 'one splice per mullion at 3.3 m');
  assert.equal(item('750634').qty, 2 * m.panes.length, 'two glass supports per pane');
  const strip = m.bom.totals.mullionM + m.bom.totals.transomM;
  assert.equal(item('159301').qty, Math.ceil(strip / 6));
  assert.equal(item('760006').qty, Math.ceil(2 * strip / 50));
  close(m.bom.totals.mullionM, 5 * 6.6, 1e-9);
  close(m.bom.totals.transomM, 5 * 4 * 1.45, 1e-9);
  // Integrated covers have no separate cover plates.
  const integrated = facadeModel({ ...DEFAULT_STATE, strip: '159230' });
  assert.ok(!integrated.bom.items.some(i => i.key === 'bom.coverMullion'));
});

test('Ucw is a weighted mean of glass, panel and frame', () => {
  const m = facadeModel(DEFAULT_STATE);
  const th = m.thermal;
  close(th.Ag + th.Ap + th.Af, th.total, 1e-9);
  assert.ok(th.Ucw > th.Up && th.Ucw < th.Uf);
  const triple = facadeModel({ ...DEFAULT_STATE, glazing: 'tgu-44' });
  assert.ok(triple.thermal.Ucw < th.Ucw);
  assert.equal(facadeModel({ ...DEFAULT_STATE, glazing: 'custom', customThickness: 20 }).thermal, null);
});

test('state is normalised to the system limits', () => {
  const S = normalizeState({ widths: [100, 9000], heights: [], rowTypes: ['x'], mullion: 'nope', windLoad: 9, customThickness: 33, glazing: 'custom' });
  assert.deepEqual(S.widths, [400, 4000]);
  assert.deepEqual(S.heights, DEFAULT_STATE.heights);
  assert.equal(S.rowTypes[0], 'vision');
  assert.equal(S.mullion, 'auto');
  assert.equal(S.windLoad, 3);
  assert.equal(S.customThickness, 34, 'rounded to the 2 mm glazing table steps');
});

test('translations exist in every locale for every key used', () => {
  const sources = ['../js/app.js', '../js/facade.js', '../js/drawings.js', '../index.html'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const used = new Set([...sources.matchAll(/['"`]((?:check|bom|unit|totals|perf|node|drawing|tag|grid|profiles|glazing|tint|finish|order|section|preset|tab|stage|toggle|strip)\.[\w.]+)['"`]/g)].map(m => m[1]).filter(k => !k.endsWith('.')));
  for (const locale of Object.keys(MESSAGES)) {
    for (const key of used) assert.ok(key in MESSAGES[locale], `${locale} lacks ${key}`);
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), Object.keys(MESSAGES['ro-RO']).sort(), `${locale} key parity`);
  }
});
