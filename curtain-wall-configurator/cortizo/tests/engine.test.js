// Teste de regresie pentru motor. Rulare: npm test (Node ≥ 20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine.js';
import { loadData } from '../src/load-node.js';
import { requiredInertia } from '../src/core/statics.js';
import { clipPitch } from '../src/core/clips.js';
import { evalCut, evalGasket, splitRef } from '../src/core/util.js';
import { EXAMPLES } from './examples.js';

const data = loadData();
const engine = createEngine(data);
const C = data.rules.common;

test('Ix necesar – exemplul din foaia Excel (q 1 kN/m², b 1500, L 3500) = 279,1 cm⁴', () => {
  assert.equal(requiredInertia(1.0, 1500, 3500, C).toFixed(1), '279.1');
});

test('graficul de cleme (pag. 678)', () => {
  assert.equal(clipPitch(900, 5, C.clip_chart).pitch, 500);   // sub 1000 Pa e mereu 500
  assert.equal(clipPitch(1500, 2, C.clip_chart).pitch, 500);
  assert.equal(clipPitch(2500, 2, C.clip_chart).pitch, 400);
  assert.equal(clipPitch(2500, 3.5, C.clip_chart).pitch, 250);
  assert.equal(clipPitch(1200, 5.8, C.clip_chart).pitch, 300); // triunghiul de 300 mm din dreapta-jos
  assert.equal(clipPitch(2900, 5.5, C.clip_chart).pitch, null); // zonă nepermisă
});

test('formule de debitare și consum', () => {
  assert.equal(evalCut('L-85', 1200, 1400), 1115);
  assert.equal(evalCut('H - 89.2', 1200, 1400), 1310.8);
  assert.equal(evalGasket('2L+2H', 1000, 500), 3000);
  assert.deepEqual(splitRef('COR-9843 + COR-9842 (x2)'), [{ code: 'COR-9843', qty: 1 }, { code: 'COR-9842', qty: 2 }]);
  assert.deepEqual(splitRef('COR 9840 + COR-9843').map((x) => x.code), ['COR-9840', 'COR-9843']);
});

test('fiecare sistem calculează exemplul fără erori', () => {
  for (const [id, p] of Object.entries(EXAMPLES)) {
    const R = engine.compute(p);
    assert.ok(R.mullion, `${id}: montant ales`);
    assert.ok(R.transom, `${id}: traversă aleasă`);
    assert.ok(R.cuts.length > 2, `${id}: listă de debitare`);
    assert.ok(R.accessories.length > 3, `${id}: accesorii`);
  }
});

test('TP 52, 32 mm: suportul standard e 999041 (pag. 305) și 154 kg cer 4 suporți', () => {
  const p = structuredClone(EXAMPLES.TP52);
  p.grid = { widths: [1500, 1500], heights: [3500], anchorSpacing: 3500 };
  const R = engine.compute(p);
  assert.equal(R.mullion.code, 'COR-9804');
  assert.equal(R.fields[0].supports.refs[0], '999041');
  assert.equal(R.fields[0].supports.qty, 4);
  assert.equal(R.transom.collar, '999149');
});

test('SG 52: geam prea mare pentru profilul U e respins (pag. 671)', () => {
  const p = structuredClone(EXAMPLES.SG52);
  p.grid = { widths: [3500], heights: [3500], anchorSpacing: 3500 };
  const R = engine.compute(p);
  assert.equal(R.fields[0].status, 'bad');
});

test('SG 52: profilul U cere camere de 16/18/20 mm', () => {
  const p = structuredClone(EXAMPLES.SG52); p.glass.chamberMm = 14;
  assert.ok(engine.compute(p).fields.every((f) => f.status === 'bad'));
});

test('TPH / TPV: cleme doar pe direcția corectă', () => {
  const h = engine.compute(EXAMPLES.TPH52), v = engine.compute(EXAMPLES.TPV52);
  assert.ok(h.cuts.some((c) => c.notes.includes('presor orizontal')) && !h.cuts.some((c) => c.notes.includes('presor vertical')));
  assert.ok(v.cuts.some((c) => c.notes.includes('presor vertical')) && !v.cuts.some((c) => c.notes.includes('presor orizontal')));
});

test('ST 52: suportul după grosime (28 mm → 999196) și ramă la 45°', () => {
  const R = engine.compute(EXAMPLES.ST52);
  assert.equal(R.fields[0].supports.refs[0], '999196');
  assert.ok(R.cuts.find((c) => c.code === 'COR-9982'));
});

test('SST 52: sticla e L−60 × H−60', () => {
  const R = engine.compute(EXAMPLES.SST52);
  assert.equal(R.fields[0].gw, 1440);
});

test('Lucernar: panta în afara 7°–40° e semnalată, montantul e din gama 130–250', () => {
  const p = structuredClone(EXAMPLES.SKY); p.loads.slopeDeg = 5;
  const R = engine.compute(p);
  assert.ok(R.checks.some((c) => c.title === 'Pantă' && c.level === 'bad'));
  assert.ok(data.rules.skylight.mullion_range.includes(R.mullion.code));
});

test('Fereastră proiectantă TP 52: lista de profile de la pag. 393', () => {
  const p = structuredClone(EXAMPLES.TP52);
  p.grid = { widths: [1200], heights: [1400], anchorSpacing: 3500 };
  p.fields = [{ row: 0, col: 0, type: 'window' }];
  const R = engine.compute(p);
  const sash = R.cuts.find((c) => c.code === 'COR-9975');
  assert.deepEqual(sash.lengths, [1316, 1115]); // H−84, L−85
});
