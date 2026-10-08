import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, PRESETS, LIM, checks, clampState, evenlyAlong, kgm, markCode, model, specText } from '../js/model.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('bar mass per metre (steel 7850 kg/m³)', () => {
  close(kgm(20), 2.46616, 1e-5); // Ø20: 2.466 kg/m
  close(kgm(10), 0.61654, 1e-5);
});

test('masses add up element by element (1160×970 pile, 12Ø20, Ø10/150)', () => {
  const S = clampState({ ...DEFAULT, shape: 'drept', B: 1160, H: 970, headBend: false });
  const m = model(S);
  close(m.mBars, 12 * 12 * kgm(20));
  close(m.mSpiral, m.spiralLen / 1000 * kgm(10));
  close(m.mRings, m.ringZ.length * m.ringPerim / 1000 * kgm(16));
  close(m.mass, m.mBars + m.mSpiral + m.mRings);
  assert.ok(Math.abs(m.mass - 617.5) < 1, `mass ${m.mass}`);
});

test('head bend: bars curve inwards in the starter zone and gain the arc length', () => {
  const S = clampState(DEFAULT);
  const m = model(S);
  assert.ok(m.bend, 'default cage has the bent head');
  assert.equal(m.bend.len, 400);
  assert.equal(m.bend.inward, 120);
  assert.ok(m.bend.arc > m.bend.len && m.bend.arc < m.bend.len + m.bend.inward);
  close(m.barLength, m.L - m.bend.len + m.bend.arc);
  assert.ok(m.ringZ.every(z => z < m.L - m.bend.len), 'no ring inside the bend');
  // The bend needs starter bars; without them it is reported, not drawn.
  const none = clampState({ ...DEFAULT, free: 0 });
  assert.equal(model(none).bend, null);
  assert.ok(checks(none, model(none)).some(c => c.lv === 'warn' && c.t.startsWith('Capul îndoit')));
  assert.equal(model(clampState({ ...DEFAULT, free: 300 })).bend.len, 300, 'bend fits within the starter bars');
  assert.match(specText(S, m), /Cap îndoit \(coșuleț\)/);
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
  const wall = clampState({ ...DEFAULT, type: 'perete', T: 2000, W: 500, Lm: 40, dv: 40, dh: 8, dt: 20, sv: 60, sh: 20, linkEvery: 9 });
  assert.equal(wall.T, LIM.perete.T[1]);
  assert.equal(wall.W, LIM.perete.W[0]);
  assert.equal(wall.Lm, 30);
  assert.equal(wall.dv, 32);
  assert.equal(wall.dh, 10);
  assert.equal(wall.dt, 16);
  assert.equal(wall.sv, wall.dv + 50, 'pitch leaves at least 50 mm between bars');
  assert.equal(wall.sh, wall.dh + 50);
  assert.equal(wall.linkEvery, 4);
  assert.equal(clampState({ ...DEFAULT, pitch: 150, pitchEnd: 400 }).pitchEnd, 150, 'end pitch never exceeds the regular pitch');
});

test('circular pile: bars, spiral length and masses', () => {
  const S = clampState(DEFAULT);
  const m = model(S);
  assert.equal(m.bars.length, S.n);
  close(m.mBars, S.n * m.barLength / 1000 * kgm(S.dl));
  // Spiral turns: closing turns, dense ends and regular middle add up to the spiral length.
  close(m.zones.at(-1).z1, m.Ls);
  assert.ok(m.Ttot > m.Ls / S.pitch, 'dense ends add turns');
  close(m.mass, m.mBars + m.mSpiral + m.mRings);
  assert.equal(m.boreB, S.D + 2 * S.cover);
  assert.equal(m.ringZ.length, 5); // (12 m - 1 m) / 2.5 m + 1
  assert.equal(m.weldRings, m.ringZ.length * S.n);
  assert.equal(markCode(S), 'PF-800-12');
});

test('diaphragm wall panel: two faces of bars, links, trusses and masses', () => {
  const S = clampState({ ...DEFAULT, ...PRESETS.pm });
  const m = model(S);
  assert.equal(m.kind, 'wall');
  assert.equal(m.Tc, 800 - 2 * 75);
  // 2500 mm wide at 150 mm: 17 verticals per face, edge bars inside the width.
  assert.equal(m.nv, 17);
  assert.equal(m.verticals.length, 17);
  close(m.verticals[0], -(2500 - 25) / 2);
  close(m.verticals.at(-1), (2500 - 25) / 2);
  // Horizontals stop below the 1 m starter bars at the head.
  assert.ok(m.horizontals.at(-1) <= m.Ls);
  assert.equal(m.nh, Math.floor((14000 - 16) / 200) + 1);
  // Every 2nd vertical tied, both edges always tied.
  assert.equal(m.linkCols[0], 0);
  assert.equal(m.linkCols.at(-1), 16);
  assert.equal(m.nLinks, m.linkRows.length * m.linkCols.length);
  close(m.mV, 2 * 17 * 15 * kgm(25));
  close(m.mH, 2 * m.nh * 2.5 * kgm(16));
  close(m.mass, m.mV + m.mH + m.mLinks + m.mTruss);
  assert.equal(m.trussU.length, 3);
  // Usual diaphragm wall consumption is about 80–150 kg/m³.
  const ratio = m.mass / m.volume;
  assert.ok(ratio > 80 && ratio < 150, `kg/m³ ${ratio}`);
  assert.equal(markCode(S), 'PM-800x2500-15');
  assert.match(specText(S, m), /^CARCASĂ PERETE MULAT — PM-800x2500-15/);
  assert.ok(!checks(S, m).some(c => c.t.includes('SR EN 1536 recomandă')), 'pile-only rules do not apply to walls');
  assert.ok(m.items.every(item => item.kg == null || item.kg > 0));
  // Without trusses the panel stiffness is flagged.
  const bare = clampState({ ...S, trusses: false });
  assert.ok(checks(bare, model(bare)).some(c => c.lv === 'warn' && c.t.startsWith('Fără zăbrele')));
});

test('checks flag bars that do not fit; there is no mass limit', () => {
  const heavy = clampState({ ...DEFAULT, D: 1400, Lm: 12, n: 60, dl: 40 });
  assert.ok(!checks(heavy, model(heavy)).some(c => /Mas[aă]/.test(c.t)));
  const crowded = clampState({ ...DEFAULT, D: 400, n: 60, dl: 40 });
  assert.ok(checks(crowded, model(crowded)).some(c => c.lv === 'err' && c.t.startsWith('Barele nu încap')));
  const ok = clampState(DEFAULT);
  assert.ok(checks(ok, model(ok)).every(c => c.lv !== 'err'));
  assert.match(specText(ok, model(ok)), /^CARCASĂ PILOT FORAT — PF-800-12/);
});

test('rings and spacers always sit inside the cage, also for short cages', () => {
  assert.deepEqual(evenlyAlong(12000, 2500), [1000, 3500, 6000, 8500, 11000]);
  assert.deepEqual(evenlyAlong(2000, 2500), [1000]);
  for (let Lm = 1; Lm <= 24; Lm += 0.5) {
    for (const extra of [{}, { headBend: false }, { free: 0 }]) {
      const S = clampState({ ...DEFAULT, ...extra, Lm });
      const m = model(S);
      for (const z of m.ringZ) assert.ok(z > 0 && z < m.L, `ring at ${z} outside L=${m.L}`);
      for (const z of m.spacerZ) assert.ok(z > 0 && z <= m.Ls, `spacer at ${z} outside spiral ${m.Ls}`);
      assert.ok(m.spacerZ.length >= 1);
    }
  }
});
