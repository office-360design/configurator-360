import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, PRESETS, LIM, checks, clampState, kgm, markCode, model, specText, weightLimit } from '../js/model.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('bar mass and weight limit follow the data sheet', () => {
  close(kgm(20), 2.46616, 1e-5); // Ø20: 2.466 kg/m
  assert.equal(weightLimit(12), 5000);
  assert.equal(weightLimit(20), 8000);
  assert.equal(weightLimit(16), 6500);
  assert.equal(weightLimit(24), 9600);
});

test('state is clamped to the manufacturing limits of each cage type', () => {
  const pile = clampState({ ...DEFAULT, D: 5000, Lm: 30, dl: 50, ds: 3, pitch: 900, n: 2, qty: 0 });
  assert.equal(pile.D, LIM.pilot.D[1]);
  assert.equal(pile.Lm, 24);
  assert.equal(pile.dl, 40);
  assert.equal(pile.ds, 8);
  assert.equal(pile.pitch, LIM.pilot.p);
  assert.equal(pile.n, 4);
  assert.equal(pile.qty, 1);
  const wall = clampState({ ...DEFAULT, type: 'perete', shape: 'patrat', B: 700, dl: 32, ds: 16, pitch: 400 });
  assert.equal(wall.B, 600);
  assert.equal(wall.H, 600, 'square sections keep H = B');
  assert.equal(wall.dl, 20);
  assert.equal(wall.ds, 12);
  assert.equal(wall.pitch, 300);
  assert.equal(clampState({ ...DEFAULT, pitch: 150, pitchEnd: 400 }).pitchEnd, 150, 'end pitch never exceeds the regular pitch');
});

test('circular pile: bars, spiral length and masses', () => {
  const S = clampState(DEFAULT);
  const m = model(S);
  assert.equal(m.bars.length, S.n);
  close(m.mBars, S.n * S.Lm * kgm(S.dl));
  // Spiral turns: closing turns, dense ends and regular middle add up to the spiral length.
  close(m.zones.at(-1).z1, m.Ls);
  assert.ok(m.Ttot > m.Ls / S.pitch, 'dense ends add turns');
  close(m.mass, m.mBars + m.mSpiral + m.mRings);
  assert.equal(m.boreB, S.D + 2 * S.cover);
  assert.equal(m.ringZ.length, 5); // (12 m - 1 m) / 2.5 m + 1
  assert.equal(m.weldRings, m.ringZ.length * S.n);
  assert.equal(markCode(S), 'PF-800-12');
});

test('rectangular wall cage: corner and side bars, clear spacing', () => {
  const S = clampState({ ...DEFAULT, ...PRESETS.pm });
  const m = model(S);
  assert.equal(m.bars.length, S.n);
  assert.equal(m.B, 400);
  assert.equal(m.H, 600);
  assert.ok(m.clear[0] > 0 && m.clear[0] <= m.clear[1]);
  for (const bar of m.bars) {
    assert.ok(Math.abs(bar.u) < m.B / 2 && Math.abs(bar.v) < m.H / 2, 'bars stay inside the cage');
  }
  assert.ok(!checks(S, m).some(c => c.t.includes('SR EN 1536 recomandă')), 'pile-only rules do not apply to walls');
});

test('checks flag overweight cages and bars that do not fit', () => {
  const heavy = clampState({ ...DEFAULT, D: 1400, Lm: 12, n: 60, dl: 40 });
  const heavyChecks = checks(heavy, model(heavy));
  assert.ok(heavyChecks.some(c => c.lv === 'err' && c.t.startsWith('Masa')));
  const crowded = clampState({ ...DEFAULT, D: 400, n: 60, dl: 40 });
  assert.ok(checks(crowded, model(crowded)).some(c => c.lv === 'err' && c.t.startsWith('Barele nu încap')));
  const ok = clampState(DEFAULT);
  assert.ok(checks(ok, model(ok)).every(c => c.lv !== 'err'));
  assert.match(specText(ok, model(ok)), /^CARCASĂ PILOT FORAT — PF-800-12/);
});
