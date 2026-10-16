import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../cortizo/src/load-node.js';
import { EXAMPLES } from '../cortizo/tests/examples.js';
import { createCortizo, cortizoListText, cortizoModel, fieldTypes, normalizeCortizo, toProject } from '../js/cortizo.js';
import { DEFAULT_STATE, normalizeState } from '../js/facade.js';
import { cortizoNodeParts } from '../js/sections.js';

const cz = createCortizo(loadData());
const state = (cortizo, extra = {}) => normalizeState({ ...DEFAULT_STATE, cortizo, ...extra });

test('the configurator project matches the Cortizo example for every system', () => {
  // Same grid as cortizo/tests/examples.js: rows listed bottom-up here, top-down in the engine.
  const grid = { widths: [1500, 1500, 1500], heights: [2350, 1150], rowTypes: ['vision', 'vision'], anchorSpacing: 3500, windLoad: 1 };
  for (const [id, example] of Object.entries(EXAMPLES)) {
    if (id === 'SKY') continue;
    const C = normalizeCortizo({ system: id }, cz);
    const project = toProject(state(C, grid), C);
    assert.deepEqual(project.grid, example.grid, id);
    assert.equal(project.glass.variant, example.glass.variant, id);
    assert.equal(project.glass.totalMm, example.glass.totalMm, id);
    // Same input ⇒ same mullion and cutting list as the standalone engine.
    const a = cz.engine.compute(project), b = cz.engine.compute(example);
    assert.equal(a.mullion.code, b.mullion.code, id);
    assert.deepEqual(a.cuts.map(c => [c.code, c.n]), b.cuts.map(c => [c.code, c.n]), id);
  }
});

test('catalogue options are enforced when the system changes', () => {
  const C = normalizeCortizo({ system: 'SG52', variant: 'nope', innerPane: '99+99', totalMm: 7, chamberMm: 13 }, cz);
  assert.equal(C.variant, 'Standard siliconat – nivel 1', 'system defaults when the system changes');
  const kept = normalizeCortizo({ ...C, variant: 'nope', totalMm: 7, chamberMm: 13 }, cz);
  const options = cz.engine.options('SG52');
  assert.ok(options.some(o => o.variant === kept.variant));
  assert.ok(options.find(o => o.variant === kept.variant).panes.some(p => p.inner === kept.innerPane && p.thicknesses.includes(kept.totalMm)));
  assert.equal(kept.chamberMm, 16);
  assert.equal(normalizeCortizo({ system: 'TP52', innerPane: '4+4' }, cz).innerPane, undefined, 'TP has no inner pane');
  assert.equal(normalizeCortizo({ system: 'XX' }, cz).system, 'TP52');
});

test('spandrel rows become opaque panels and clicked cells override them', () => {
  const C = normalizeCortizo({ system: 'TP52', fields: [{ row: 1, col: 0, type: 'window' }, { row: 0, col: 2, type: 'glass' }] }, cz);
  const S = state(C, { widths: [1500, 1500, 1500], heights: [900, 2400], rowTypes: ['spandrel', 'vision'] });
  const project = toProject(S, C);
  // Bottom row (row 0) is the last engine row (i = 1).
  assert.deepEqual(project.fields.filter(f => f.type === 'panel').map(f => [f.row, f.col]), [[1, 0], [1, 1]]);
  assert.deepEqual(project.fields.find(f => f.type === 'window'), { row: 0, col: 0, type: 'window' });
  assert.deepEqual(project.fields.find(f => f.type === 'glass'), { row: 1, col: 2, type: 'glass' });
  // SG 52 has no opaque panel: spandrel rows stay glass there.
  assert.deepEqual(fieldTypes(cz, 'SG52'), ['glass', 'window']);
  const sg = normalizeCortizo({ system: 'SG52' }, cz);
  assert.equal(toProject(state(sg, { heights: [900, 2400], rowTypes: ['spandrel', 'vision'] }), sg).fields.length, 0);
});

test('model for the scene: grid bottom-up, member sections follow the system edges', () => {
  const m = cortizoModel(state({ system: 'TPH52' }), cz);
  assert.deepEqual(m.xs, [0, 1500, 3000, 4500, 6000]);
  assert.equal(m.H, 6600);
  assert.equal(m.panes.length, 16);
  const bottom = m.panes.find(p => p.row === 0 && p.bay === 0);
  assert.equal(bottom.y0, 0);
  assert.equal(bottom.spandrel, true, 'default bottom row is a spandrel');
  assert.equal(m.mullion.id, m.result.mullion.code);
  // TPH: clips on the mullions (sealed joint), pressure plate on the transoms.
  const kinds = role => m.section(role).map(p => p.kind);
  assert.ok(kinds('mullion').includes('joint') && !kinds('mullion').includes('cover'));
  assert.ok(kinds('transom').includes('cover') && kinds('transom').includes('strip'));
  assert.ok(cortizoNodeParts({ depth: 105, thickness: 28, edge: 'frame' }).some(p => p.kind === 'frame'));
});

test('skylight carries slope and snow into the engine', () => {
  const m = cortizoModel(state({ system: 'SKY', slopeDeg: 20, snowKPa: 2 }), cz);
  assert.equal(m.slopeDeg, 20);
  assert.equal(m.project.loads.slopeDeg, 20);
  assert.equal(m.project.loads.snowKPa, 2);
  assert.ok(m.result.loads.qPerpKPa > m.project.loads.windKPa, 'snow and glass weight add to the perpendicular load');
  const steep = cortizoModel(state({ system: 'SKY', slopeDeg: 55 }), cz);
  assert.ok(steep.result.checks.some(c => c.level === 'bad' && c.title === 'Pantă'), 'slope outside 7–40° is reported');
});

test('cutting and accessory list text scales with the order quantity', () => {
  const m = cortizoModel(state({ system: 'TP52' }), cz);
  const one = cortizoListText(m, 1), two = cortizoListText(m, 2);
  assert.match(one, /^Cortizo TP 52 · 6000 × 6600 mm × 1/);
  const bars = text => Number(text.split('\n').find(l => l.includes(m.mullion.id)).match(/(\d+) bare/)[1]);
  assert.equal(bars(two), 2 * bars(one));
});
