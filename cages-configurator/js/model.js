// Rebar cage model for bored piles and diaphragm walls. Pure functions: all
// lengths are millimetres unless the name says otherwise (Lm is metres).

// Manufacturing limits from the Damila Producție data sheet (MEP GAM 1500 HS).
export const LIM = {
  pilot: { dl: [8, 40], D: [200, 1400], ds: [8, 16], L: 24000, p: 500, name: 'Pilot forat', code: 'PF' },
  perete: { dl: [8, 20], D: [160, 600], ds: [8, 12], L: 24000, p: 300, name: 'Perete mulat', code: 'PM' },
};
export const BARS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40];
export const RING_DIAMETERS = [12, 14, 16, 20, 25];
export const GRADES = ['BST500S', 'B500C', 'PC52'];

// kg/m for a round bar, steel density 7850 kg/m³.
export const kgm = d => 0.0061654 * d * d;

export const fmt = (x, d = 0) => Number(x).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });

export const DEFAULT = {
  type: 'pilot', shape: 'circ', D: 800, B: 500, H: 500, Lm: 12, cover: 75, n: 12, dl: 20, grade: 'BST500S', free: 500,
  ds: 10, pitch: 150, dense: true, pitchEnd: 100, zoneEnd: 1500, closing: true, rings: true, ringD: 16, ringStep: 2500,
  spacers: true, spacerPer: 4, spacerStep: 3000, qty: 10,
  headBend: true, bendLen: 400, bendIn: 120,
};

export const PRESETS = {
  p600: { type: 'pilot', shape: 'circ', D: 600, Lm: 12, n: 10, dl: 16, ds: 8, pitch: 200, dense: true, pitchEnd: 100, zoneEnd: 1200, free: 600, rings: true, ringD: 14, ringStep: 2500, cover: 75, qty: 24 },
  p1200: { type: 'pilot', shape: 'circ', D: 1200, Lm: 20, n: 24, dl: 28, ds: 12, pitch: 200, dense: true, pitchEnd: 100, zoneEnd: 2500, free: 1000, rings: true, ringD: 20, ringStep: 2000, cover: 75, qty: 6 },
  pm: { type: 'perete', shape: 'drept', B: 400, H: 600, Lm: 14, n: 14, dl: 16, ds: 10, pitch: 200, dense: true, pitchEnd: 100, zoneEnd: 1000, free: 500, rings: false, cover: 70, qty: 18 },
};

export const barsFor = range => BARS.filter(d => d >= range[0] && d <= range[1]);

// Returns a copy of the state clamped to the manufacturing limits.
export function clampState(state) {
  const S = { ...state };
  const lim = LIM[S.type] || LIM.pilot;
  if (!LIM[S.type]) S.type = 'pilot';
  if (!['circ', 'patrat', 'drept'].includes(S.shape)) S.shape = 'circ';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const nearest = (list, value) => list.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  S.D = clamp(Math.round(S.D), lim.D[0], lim.D[1]);
  S.B = clamp(Math.round(S.B), lim.D[0], lim.D[1]);
  S.H = clamp(Math.round(S.H), lim.D[0], lim.D[1]);
  if (S.shape === 'patrat') S.H = S.B;
  S.Lm = clamp(Math.round(S.Lm * 2) / 2, 1, lim.L / 1000);
  const dls = barsFor(lim.dl);
  if (!dls.includes(+S.dl)) S.dl = nearest(dls, +S.dl || 0);
  S.dl = +S.dl;
  const dss = barsFor(lim.ds);
  if (!dss.includes(+S.ds)) S.ds = nearest(dss, +S.ds || 0);
  S.ds = +S.ds;
  if (!RING_DIAMETERS.includes(+S.ringD)) S.ringD = nearest(RING_DIAMETERS, +S.ringD || 0);
  S.ringD = +S.ringD;
  if (!GRADES.includes(S.grade)) S.grade = GRADES[0];
  S.pitch = clamp(Math.round(S.pitch), 50, lim.p);
  S.pitchEnd = clamp(Math.round(S.pitchEnd), 50, S.pitch);
  S.n = clamp(Math.round(S.n), 4, 60);
  S.cover = clamp(Math.round(S.cover), 40, 150);
  S.free = clamp(Math.round(S.free), 0, Math.min(2000, S.Lm * 1000 - 1000));
  S.zoneEnd = clamp(Math.round(S.zoneEnd), 300, 4000);
  S.ringStep = clamp(Math.round(S.ringStep), 1500, 4000);
  S.spacerPer = clamp(Math.round(S.spacerPer), 3, 8);
  S.spacerStep = clamp(Math.round(S.spacerStep), 1500, 5000);
  S.qty = clamp(Math.round(S.qty) || 1, 1, 999);
  // The head bend sits in the starter-bar zone, inside the cage.
  S.bendLen = clamp(Math.round(S.bendLen) || 0, 100, 1000);
  S.bendIn = clamp(Math.round(S.bendIn) || 0, 30, Math.round(Math.min(S.shape === 'circ' ? S.D : Math.min(S.B, S.H), 1400) * 0.3));
  for (const key of ['dense', 'closing', 'rings', 'spacers', 'headBend']) S[key] = Boolean(S[key]);
  return S;
}

// Cage geometry. `path(s, offset)` walks the spiral centreline (s in 0..1 per
// turn), optionally offset inwards. The axis z runs from the tip (0) to the head.
export function model(S) {
  const L = S.Lm * 1000, ds = +S.ds, dl = +S.dl;
  const circ = S.shape === 'circ';
  const B = circ ? S.D : S.B, H = circ ? S.D : (S.shape === 'patrat' ? S.B : S.H);
  const off = ds / 2 + dl / 2; // spiral centreline → bar centre
  let path, perimS, clear = [];
  const bars = [];
  if (circ) {
    const R = S.D / 2 - ds / 2;
    path = (s, o = 0) => { const r = R - o, a = 2 * Math.PI * s; return [r * Math.cos(a), r * Math.sin(a)]; };
    perimS = 2 * Math.PI * R;
    const Rl = R - off;
    for (let i = 0; i < S.n; i++) {
      const s = i / S.n + 0.25 / S.n, a = 2 * Math.PI * s;
      bars.push({ u: Rl * Math.cos(a), v: Rl * Math.sin(a), s });
    }
    const c = 2 * Math.PI * Rl / S.n - dl;
    clear = [c, c];
  } else {
    const hw0 = B / 2 - ds / 2, hh0 = H / 2 - ds / 2, rc0 = off;
    const outline = o => {
      const hw = hw0 - o, hh = hh0 - o, rc = Math.max(rc0 - o, 1);
      const sx = 2 * (hw - rc), sy = 2 * (hh - rc), ar = Math.PI / 2 * rc;
      const segs = [
        { t: 'l', len: sy, p0: [hw, -(hh - rc)], d: [0, 1] },
        { t: 'a', len: ar, c: [hw - rc, hh - rc], a0: 0, r: rc },
        { t: 'l', len: sx, p0: [hw - rc, hh], d: [-1, 0] },
        { t: 'a', len: ar, c: [-(hw - rc), hh - rc], a0: Math.PI / 2, r: rc },
        { t: 'l', len: sy, p0: [-hw, hh - rc], d: [0, -1] },
        { t: 'a', len: ar, c: [-(hw - rc), -(hh - rc)], a0: Math.PI, r: rc },
        { t: 'l', len: sx, p0: [-(hw - rc), -hh], d: [1, 0] },
        { t: 'a', len: ar, c: [hw - rc, -(hh - rc)], a0: 1.5 * Math.PI, r: rc },
      ];
      let acc = 0;
      segs.forEach(g => { g.s0 = acc; acc += g.len; });
      const P = acc;
      const f = s => {
        const x = ((s % 1) + 1) % 1 * P;
        for (const g of segs) {
          if (x <= g.s0 + g.len || g === segs[7]) {
            const t = x - g.s0;
            if (g.t === 'l') return [g.p0[0] + g.d[0] * t, g.p0[1] + g.d[1] * t];
            const a = g.a0 + t / g.r;
            return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
          }
        }
        return [0, 0];
      };
      return { f, segs, P };
    };
    const base = outline(0);
    perimS = base.P;
    const cache = {};
    path = (s, o = 0) => {
      if (!o) return base.f(s);
      const key = o.toFixed(2);
      return (cache[key] || (cache[key] = outline(o))).f(s);
    };
    // Corner bars sit in the bends; side bars are spread by straight length.
    const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]];
    [1, 3, 5, 7].forEach(i => { const g = base.segs[i]; bars.push({ u: g.c[0], v: g.c[1], s: (g.s0 + g.len / 2) / base.P }); });
    const rem = S.n - 4, sides = [0, 2, 4, 6].map(i => base.segs[i]);
    const tot = sides.reduce((a, g) => a + g.len, 0);
    const k = sides.map(g => rem * g.len / tot), kf = k.map(Math.floor);
    const left = rem - kf.reduce((a, b) => a + b, 0);
    k.map((v, i) => [v - kf[i], i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => { kf[i]++; });
    sides.forEach((g, si) => {
      const m = kf[si], nrm = inward[si];
      for (let j = 1; j <= m; j++) {
        const t = g.len * j / (m + 1), p = [g.p0[0] + g.d[0] * t, g.p0[1] + g.d[1] * t];
        bars.push({ u: p[0] + nrm[0] * off, v: p[1] + nrm[1] * off, s: (g.s0 + t) / base.P });
      }
      clear.push(g.len / (m + 1) - dl);
    });
    clear = [Math.min(...clear), Math.max(...clear)];
  }
  // Spiral zones along the axis: closing turns, dense ends, regular middle.
  const Ls = L - S.free;
  const pc = Math.max(ds * 1.3, 14), endLen = S.closing ? 1.5 * pc : 0;
  const zone = S.dense ? Math.max(0, Math.min(S.zoneEnd, (Ls - 2 * endLen) / 2)) : 0;
  const mid = Math.max(0, Ls - 2 * endLen - 2 * zone);
  const zones = [];
  let z = 0, T = 0;
  const add = (len, p) => { if (len <= 0) return; zones.push({ z0: z, z1: z + len, p, T0: T, T1: T + len / p }); z += len; T += len / p; };
  add(endLen, pc); add(zone, S.pitchEnd); add(mid, S.pitch); add(zone, S.pitchEnd); add(endLen, pc);
  const Ttot = T;
  const Tinv = t => { for (const g of zones) { if (t <= g.T1 + 1e-9) return g.z0 + (t - g.T0) * g.p; } return Ls; };
  let spiralLen = 0;
  zones.forEach(g => { spiralLen += (g.T1 - g.T0) * Math.hypot(perimS, g.p); });
  // Head bend ("coșuleț"): the bars curve inwards over the starter-bar zone and
  // end pointing to the axis (quarter ellipse, semi-axes bendLen × bendIn).
  const bend = S.headBend && S.free >= 100
    ? { len: Math.min(S.bendLen, S.free), inward: S.bendIn }
    : null;
  if (bend) {
    let arc = 0, prev = [0, 0];
    for (let i = 1; i <= 64; i++) {
      const a = i / 64 * Math.PI / 2, q = [bend.len * Math.sin(a), bend.inward * (1 - Math.cos(a))];
      arc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
    }
    bend.arc = arc;
  }
  const barLength = L - (bend ? bend.len - bend.arc : 0);
  // Stiffening rings, centred along the cage and kept clear of the head bend.
  const ringOff = off + dl / 2 + (+S.ringD) / 2;
  let ringZ = [];
  if (S.rings) {
    const cnt = Math.max(2, Math.floor((L - 1000) / S.ringStep) + 1), span = (cnt - 1) * S.ringStep, z0 = (L - span) / 2;
    for (let i = 0; i < cnt; i++) ringZ.push(z0 + i * S.ringStep);
    if (bend) ringZ = ringZ.filter(z => z < L - bend.len - 50);
  }
  let ringPerim;
  if (circ) ringPerim = 2 * Math.PI * (S.D / 2 - ds / 2 - ringOff);
  else {
    ringPerim = 0;
    let prev = path(0, ringOff);
    for (let i = 1; i <= 200; i++) { const q = path(i / 200, ringOff); ringPerim += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  }
  const spacerZ = [];
  if (S.spacers) {
    const cnt = Math.max(2, Math.floor((L - 1000) / S.spacerStep) + 1), span = (cnt - 1) * S.spacerStep, z0 = (L - span) / 2;
    for (let i = 0; i < cnt; i++) spacerZ.push(z0 + i * S.spacerStep);
  }
  // Welds where the spiral crosses each bar (drawn up to 40 000).
  const welds = [];
  let weldCount = 0;
  bars.forEach((b, bi) => {
    for (let t = b.s; t <= Ttot; t += 1) { weldCount++; if (welds.length < 40000) welds.push([Tinv(t), bi]); }
  });
  const weldRings = ringZ.length * S.n;
  const mBars = S.n * barLength / 1000 * kgm(dl);
  const mSpiral = spiralLen / 1000 * kgm(ds);
  const mRings = ringZ.length * ringPerim / 1000 * kgm(+S.ringD);
  const mass = mBars + mSpiral + mRings;
  const boreB = B + 2 * S.cover, boreH = H + 2 * S.cover;
  const Ac = circ ? Math.PI * boreB * boreB / 4 : boreB * boreH; // mm²
  const As = S.n * Math.PI * dl * dl / 4;
  return { L, B, H, ds, dl, off, circ, path, bars, bend, barLength, perimS, clear, zones, Ttot, Tinv, Ls, spiralLen, ringZ, ringOff, ringPerim, spacerZ,
    welds, weldCount, weldRings, mBars, mSpiral, mRings, mass, boreB, boreH, Ac, As };
}

// Indicative checks (SR EN 1536 / 1538); they do not replace the designer's calculation.
export function checks(S, m) {
  const lim = LIM[S.type], out = [];
  const push = (lv, t) => out.push({ lv, t });
  const dimTxt = m.circ ? `Ø${S.D} mm` : `${m.B}×${m.H} mm`;
  push('ok', `Secțiune ${dimTxt} în domeniul de fabricație ${lim.D[0]}–${lim.D[1]} mm.`);
  if (S.headBend && !m.bend) push('warn', 'Capul îndoit are nevoie de mustăți de minim 100 mm. Măriți mustățile la cap.');
  const cmin = Math.round(m.clear[0]), cmax = Math.round(m.clear[1]);
  if (cmin < 0) push('err', `Barele nu încap pe perimetru (${S.n}Ø${S.dl}). Micșorați numărul sau diametrul barelor.`);
  else if (cmin < 100) push('warn', `Distanța liberă între bare ${cmin} mm < 100 mm. Poate îngreuna curgerea betonului (recomandare uzuală SR EN 1536/1538).`);
  else push('ok', `Distanța liberă între bare ${cmin === cmax ? cmin : `${cmin}–${cmax}`} mm.`);
  if (cmax > 400) push('warn', `Distanță între bare ${cmax} mm > 400 mm (recomandare uzuală).`);
  if (S.type === 'pilot') {
    if (S.dl < 12) push('warn', 'SR EN 1536 recomandă bare longitudinale de minim Ø12.');
    const Ac = m.Ac / 1e6, As = m.As;
    let need, rule;
    if (Ac <= 0.5) { need = 0.005 * m.Ac; rule = '0,5% Ac'; } else if (Ac <= 1.0) { need = 2500; rule = '25 cm²'; } else { need = 0.0025 * m.Ac; rule = '0,25% Ac'; }
    const pct = As / m.Ac * 100;
    if (As < need) push('warn', `Armare longitudinală ${fmt(As / 100, 1)} cm² (${fmt(pct, 2)}%) sub minimul orientativ ${rule} = ${fmt(need / 100, 1)} cm² (SR EN 1536).`);
    else push('ok', `Armare longitudinală ${fmt(As / 100, 1)} cm² = ${fmt(pct, 2)}% din aria forajului (min. ${rule}).`);
  }
  if (S.ds < S.dl / 4) push('warn', `Fir spirală Ø${S.ds} < Ø${S.dl}/4. Regula uzuală cere Ø spirală ≥ ¼ din Ø bară longitudinală.`);
  else push('ok', `Spirală Ø${S.ds}, pas ${S.pitch} mm (max. ${lim.p} mm la ${lim.name.toLowerCase()}).`);
  if (S.n > 40) push('warn', `${S.n} bare: verificați cu producătorul capacitatea de alimentare a utilajului.`);
  return out;
}

export const sectionLabel = S => (S.shape === 'circ' ? `Ø${S.D}` : (S.shape === 'patrat' ? `${S.B}×${S.B}` : `${S.B}×${S.H}`));
export const markCode = S => `${LIM[S.type].code}-${S.shape === 'circ' ? S.D : `${S.B}x${S.shape === 'patrat' ? S.B : S.H}`}-${String(S.Lm).replace('.', ',')}`;

// Plain-text specification for copying into an order.
export function specText(S, m) {
  const lim = LIM[S.type];
  const spiral = `Ø${S.ds} ${S.grade}, pas curent ${S.pitch} mm`
    + (S.dense ? `, capete ${S.pitchEnd} mm pe ${fmt(S.zoneEnd / 1000, 2)} m` : '')
    + (S.closing ? ', spire de închidere' : '');
  return [
    `CARCASĂ ${lim.name.toUpperCase()} — ${markCode(S)}`,
    `Secțiune: ${({ circ: 'circulară', patrat: 'pătrată', drept: 'dreptunghiulară' })[S.shape]} ${sectionLabel(S)} mm, L = ${fmt(S.Lm, 2)} m, acoperire ${S.cover} mm (${m.circ ? `foraj Ø${m.boreB}` : `panou ${m.boreB}×${m.boreH}`} mm)`,
    `Longitudinale: ${S.n}Ø${S.dl} ${S.grade}, L = ${fmt(S.Lm, 2)} m${S.free ? `, mustăți ${S.free} mm la cap` : ''}`,
    m.bend ? `Cap îndoit (coșuleț): îndoire pe ${m.bend.len} mm, retragere ${m.bend.inward} mm spre interior; lungime desfășurată bară ${fmt(m.barLength / 1000, 2)} m` : null,
    `Spirală: ${spiral}`,
    S.rings ? `Inele rigidizare: ${m.ringZ.length} × Ø${S.ringD} la ${fmt(S.ringStep / 1000, 2)} m` : null,
    S.spacers ? `Distanțieri: ${S.spacerPer}/secțiune la ${fmt(S.spacerStep / 1000, 2)} m (${m.spacerZ.length * S.spacerPer} buc/carcasă)` : null,
    `Masă: ${fmt(m.mass)} kg/buc × ${S.qty} buc = ${fmt(m.mass * S.qty)} kg`,
    `Puncte sudură: ${fmt(m.weldCount + m.weldRings)}/buc`,
  ].filter(Boolean).join('\n');
}
