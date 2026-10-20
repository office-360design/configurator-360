// Motorul configuratorului de pereți cortină Cortizo (TP 52, SG 52, TPH 52, TPV 52, ST 52, SST 52, Skylight – Veranda).
// Funcție pură: compute(project) → rezultat. Nu citește fișiere; datele vin prin createEngine(data).
//
// Ordinea etapelor (vezi docs/METODOLOGIE.md):
//  1. geometrie (axe, linii de traverse, câmpuri)      5. îmbinări montant–traversă
//  2. statică montanți → alegere montant (+ cămașă)     6. cleme / profil U / rame (după sistem)
//  3. traversă + verificare la vânt                      7. ancoraje
//  4. vitraj pe câmp: componente, greutate, suporți      8. debitare pe bare + accesorii

import { requiredInertia, pickMullion, pickTransom } from './core/statics.js';
import { clipPitch, clipsOnEdge, usableHorizontal, usableVertical } from './core/clips.js';
import { chooseSupports, chooseJoint } from './core/supports.js';
import { glazingIndex } from './core/glazing.js';
import { packBars } from './core/packing.js';
import { evalCut, evalGasket, splitRef, sum } from './core/util.js';
import { SYSTEMS, SYSTEM_LIST } from './systems/index.js';

const G = 9.81;
// Mesajele pleacă din motor ca chei cu parametri; textul se compune în limba interfeței
// (src/messages.js). Numerele rămân numere, ca să fie formatate după limbă.
const M = (key, params = {}) => ({ key, params });
const DT = (text) => ({ data: text }); // text din date/reguli, tradus prin tabelul DATA_TEXT

export function createEngine(data) {
  const glz = glazingIndex(data.catalog.glazing_tables);
  const prof = new Map(data.catalog.profiles.map((p) => [p.code, p]));
  const acc = new Map(data.catalog.accessories.map((a) => [a.code, a]));
  const ctx = { data, rules: data.rules, glz, prof, acc };
  // Denumirile din catalog se afișează doar în engleză (desc_en); textele în spaniolă nu se preiau.
  const describe = (code) => prof.get(code)?.desc_en || acc.get(code)?.desc_en || '';

  return {
    systems: SYSTEM_LIST,
    /** Variantele și grosimile disponibile pentru un sistem (pentru interfață). */
    options(systemId) {
      const s = SYSTEMS[systemId];
      if (systemId === 'ST52') return [{ variant: 'Standard', panes: [{ inner: '', thicknesses: ctx.rules.st52.glass_supports_by_thickness.rows.map((r) => r[1]) }] }];
      if (systemId === 'SST52') return [{ variant: 'Standard', panes: [{ inner: '', thicknesses: ctx.rules.sst52.glazing_table.rows.map((r) => r[0]) }] }];
      if (systemId === 'SKY') return [{ variant: 'Acoperiș', panes: [{ inner: '', thicknesses: ctx.rules.skylight.glazing_tables.roof.rows.map((r) => r[0]) }] }];
      return glz.variants(s.name).map((v) => ({ variant: v, panes: glz.options(s.name, v) }));
    },
    compute: (project) => compute(project, ctx, describe),
  };
}

function compute(project, ctx, describe) {
  const sys = SYSTEMS[project.system];
  if (!sys) throw new Error(`Unknown system: ${project.system}`);
  const C = ctx.rules.common;
  const SR = ctx.rules[sys.rules];
  const o = { allowReinforcement: false, barMm: C.bar_length_mm, kerfMm: 5, cap: SR.caps?.[0]?.code, skyTransomJoint: 'silicone', clipFix: 'injecție', ...project.options };
  const notes = [], checks = [];
  const check = (level, id, text, page) => checks.push({ level, id, title: M(`check.${id}`), text, page });

  // ── 1. Geometrie ────────────────────────────────────────────────────────────
  const W = project.grid.widths, H = project.grid.heights; // H: de sus în jos (pentru lucernar: în lungul pantei, de la coamă la streașină)
  const n = W.length, r = H.length, Htot = sum(H), Wtot = sum(W);
  const L = project.grid.anchorSpacing || Htot; // deschiderea montantului (distanța între ancoraje)
  const spans = Math.max(1, Math.ceil(Htot / L - 1e-6));
  const typeOf = (i, j) => (project.fields || []).find((f) => f.row === i && f.col === j)?.type || 'glass';

  // ── Încărcări ───────────────────────────────────────────────────────────────
  const qk = project.loads.windKPa;                          // vânt caracteristic [kN/m²]
  const suctionDesignPa = qk * 1000 * C.wind.design_factor;  // pentru graficul de cleme
  const panes = project.glass.panesMm;                       // grosimea totală a foilor de sticlă (fără camere)
  const gGlassKPa = (C.material.glass_kg_per_m2_per_mm * panes * G) / 1000;
  let qPerp = qk, slope = null;
  if (sys.sloped) {
    const a = ((project.loads.slopeDeg ?? 15) * Math.PI) / 180, s = project.loads.snowKPa ?? 0;
    // pe pantă: vânt perpendicular + zăpadă (pe proiecția orizontală → s·cos²α perpendicular) + greutatea sticlei (g·cosα)
    qPerp = qk + s * Math.cos(a) ** 2 + gGlassKPa * Math.cos(a);
    slope = { deg: project.loads.slopeDeg ?? 15, rad: a, snow: s, inPlaneKPa: (gGlassKPa + s * Math.cos(a)) * Math.sin(a) };
    const lim = SR.slope_deg;
    if (slope.deg < lim.min || slope.deg > lim.max) check('bad', 'slope', M('check.slope.outside', { deg: slope.deg, min: lim.min, max: lim.max }), lim._page);
  }

  // ── 2. Montanți ─────────────────────────────────────────────────────────────
  const axes = [];
  for (let j = 0; j <= n; j++) {
    const b = ((W[j - 1] || 0) + (W[j] || 0)) / 2;
    axes.push({ j, b, need: requiredInertia(qPerp, b, Math.min(L, Htot), C) });
  }
  const needMax = Math.max(...axes.map((a) => a.need));
  const mPick = pickMullion(ctx.data.catalog.mullions, needMax, { allowReinforcement: o.allowReinforcement, allowedCodes: sys.sloped ? SR.mullion_range : null });
  if (mPick) check('ok', 'mullion', M(mPick.reinforced ? 'check.mullion.okReinforced' : 'check.mullion.ok', { code: mPick.mullion.code, depth: mPick.mullion.depth_mm, sleeve: mPick.mullion.reinforcement, ix: mPick.Ix, need: needMax, reserve: (mPick.Ix / needMax - 1) * 100 }), mPick.mullion.page);
  else check('bad', 'mullion', M('check.mullion.none', { need: needMax }), 27);

  // ── 3. Traverse ─────────────────────────────────────────────────────────────
  const tPick = mPick ? pickTransom(ctx.data.catalog.transoms, mPick.mullion.depth_mm) : null;
  const lines = [];
  for (let k = 0; k <= r; k++) {
    const ht = ((H[k - 1] || 0) + (H[k] || 0)) / 2;
    lines.push({ k, ht, need: Math.max(...W.map((w) => requiredInertia(qPerp, ht, w, C))) });
  }
  const tNeed = Math.max(...lines.map((l) => l.need));
  if (tPick) check(tPick.Ix_cm4 >= tNeed ? 'ok' : 'bad', 'transom', M(tPick.Ix_cm4 >= tNeed ? 'check.transom.ok' : 'check.transom.weak', { code: tPick.code, ix: tPick.Ix_cm4, need: tNeed }), tPick.page);

  // ── 4–6. Câmpuri ────────────────────────────────────────────────────────────
  const D = SR.deductions || {};
  const fields = [];
  for (let i = 0; i < r; i++) for (let j = 0; j < n; j++) {
    const type = typeOf(i, j);
    const f = { i, j, type, Lax: W[j], Hax: H[i], variant: project.glass.variant, innerPane: project.glass.innerPane, glassMm: project.glass.totalMm, notes: [] };
    if (type === 'window') {
      const win = SR[sys.window];
      f.win = win;
      f.gw = evalCut(win.glass.w, f.Lax, f.Hax); f.gh = evalCut(win.glass.h, f.Lax, f.Hax);
      f.kg = C.material.glass_kg_per_m2_per_mm * panes * f.gw * f.gh / 1e6;
      const okSize = f.Lax >= win.Lm[0] && f.Lax <= win.Lm[1] && f.Hax >= win.Hm[0] && f.Hax <= win.Hm[1];
      const okKg = !win.max_kg || f.kg <= win.max_kg;
      f.status = okSize && okKg ? 'ok' : 'bad';
      f.label = M(okSize && okKg ? 'field.window' : !okKg && !okSize ? 'field.windowHeavySize' : !okKg ? 'field.windowHeavy' : 'field.windowSize');
      if (!okSize) f.notes.push(M('note.windowLimits', { wMin: win.Lm[0], wMax: win.Lm[1], hMin: win.Hm[0], hMax: win.Hm[1], page: win.page }));
      if (!okKg) f.notes.push(M('note.windowHeavy', { kg: f.kg, max: win.max_kg }));
    } else {
      f.gw = f.Lax - (D.glass_w ?? 22); f.gh = f.Hax - (D.glass_h ?? 22);
      f.kg = C.material.glass_kg_per_m2_per_mm * panes * f.gw * f.gh / 1e6;
    }
    f.area = f.gw * f.gh / 1e6;
    f.roles = sys.roles(ctx, f);
    // greutatea care apasă pe suporți: pe fațadă toată greutatea; pe pantă doar componenta din lungul pantei (+ zăpada)
    f.kgSupport = sys.sloped ? (slope.inPlaneKPa * f.area * 1000) / G : f.kg;

    if (type !== 'window') {
      if (sys.id === 'ST52') stSupports(f, SR, check);
      else if (sys.id === 'SST52') { f.supports = { refs: ['COR-9942'], qty: 2, label: M('support.sst', { ref: 'COR-9942', block: '999037' }), level: 'warn', cap: null }; f.notes.push(M('note.sstSupportCapacity', { ref: 'COR-9942' })); }
      else f.supports = chooseSupports(f.kgSupport, { std: f.roles.supportStd, heavy: f.roles.supportHeavy, cross: f.roles.supportCross }, ctx.data.catalog.glass_supports);
      f.status = f.supports.level; f.label = f.supports.label;
      if (type === 'panel') { f.label = M('field.panel'); }
      if (!f.roles.mullionGasket && !f.roles.supportStd && !['ST52', 'SST52'].includes(sys.id)) {
        f.status = 'bad'; f.label = M('field.noTableRow'); f.notes.push(M(f.innerPane ? 'note.noTableRowInner' : 'note.noTableRow', { mm: f.glassMm, inner: f.innerPane }));
      }
    }
    f.joint = chooseJoint(f.kg, C.mullion_transom_joints);
    if (!f.joint) { f.status = 'bad'; f.notes.push(M('note.glassOverJoint', { kg: f.kg, max: 400 })); }

    // cleme (SG/TPH/TPV pe laturile cu cleme; ST/SST pe ramă)
    if (sys.edges.v === 'clip' || sys.edges.h === 'clip' || sys.edges.v === 'frame') {
      const cp = clipPitch(suctionDesignPa, f.area, C.clip_chart);
      f.clipPitch = cp.pitch;
      if (!cp.pitch) { f.status = 'bad'; f.notes.push(M('note.clips', { reason: cp.reason })); }
    }
    systemFieldChecks(sys, SR, f, project, suctionDesignPa, ctx.rules.sg52);
    fields.push(f);
  }
  const worst = fields.reduce((a, f) => (f.kg > a.kg ? f : a), fields[0]);
  const jMax = chooseJoint(worst.kg, C.mullion_transom_joints);
  check(jMax ? 'ok' : 'bad', 'joint', jMax ? M('check.joint.ok', { joint: DT(jMax.label), kg: worst.kg, max: jMax.max_kg }) : M('check.joint.none', { kg: worst.kg, max: 400 }), jMax?.pages?.[0]);
  const nBad = fields.filter((f) => f.status === 'bad').length, nWarn = fields.filter((f) => f.status === 'warn').length;
  check(nBad ? 'bad' : nWarn ? 'warn' : 'ok', 'fields', M('check.fields.summary', { ok: fields.length - nBad - nWarn, warn: nWarn, bad: nBad }));
  if (sys.edges.v === 'clip' || sys.edges.h === 'clip' || sys.edges.v === 'frame') {
    const pitches = [...new Set(fields.map((f) => f.clipPitch).filter(Boolean))].sort((a, b) => a - b);
    check(pitches.length ? 'ok' : 'bad', 'clipPitch', pitches.length ? M('check.clipPitch.ok', { pa: suctionDesignPa, factor: C.wind.design_factor, pitches }) : M('check.clipPitch.none'), C.clip_chart._page[0]);
  }

  // ── 7. Ancoraje ─────────────────────────────────────────────────────────────
  const mullionKg = mPick ? mPick.kg_m : 0, transomKg = tPick ? tPick.kg_m : 0;
  axes.forEach((a) => {
    let kg = 0;
    fields.forEach((f) => { if (f.j === a.j - 1 || f.j === a.j) kg += f.kg / 2; });
    for (let k = 0; k <= r; k++) [a.j - 1, a.j].forEach((c) => { if (W[c]) kg += (transomKg * (W[c] - 22)) / 1000 / 2; });
    kg += (mullionKg * Htot) / 1000;
    a.Rv = kg / spans;
    a.Rh = (qPerp * a.b / 1000) * Math.min(L, Htot) / 1000; // kN
    const cap = C.anchors.capacities.find((x) => a.Rv <= x.vertical_kg && a.Rh <= x.horizontal_kN);
    a.anchors = cap ? cap.n : null;
  });
  if (sys.sloped) check('warn', 'anchors', M('check.anchors.skylight', { guides: 'COR-9830/31/32', pages: '1271–1275' }), 1275);
  else check(axes.every((a) => a.anchors) ? 'ok' : 'bad', 'anchors', M('check.anchors.summary', { spans, axes: axes.map((a, i) => (a.anchors ? M('check.anchors.axis', { axis: i + 1, n: a.anchors, ref: C.anchors.ref }) : M('check.anchors.axisOver', { axis: i + 1, max: 3 }))) }), C.anchors.page);

  // ── 8. Debitare și accesorii ────────────────────────────────────────────────
  const cut = new Map(), accs = new Map();
  const add = (code, len, qty = 1, note = '') => {
    if (!code || !(len > 0) || !qty) return;
    if (!cut.has(code)) cut.set(code, { code, pieces: [], notes: new Map() });
    const c = cut.get(code); for (let q = 0; q < qty; q++) c.pieces.push(Math.round(len * 10) / 10); if (note) c.notes.set(JSON.stringify(note), note);
  };
  const addA = (code, qty, unit, rule) => {
    if (!code || !qty) return;
    for (const { code: c, qty: m } of splitRef(code).length ? splitRef(code) : [{ code, qty: 1 }]) {
      const k = `${c}|${unit}`;
      if (!accs.has(k)) accs.set(k, { code: c, qty: 0, unit, rules: new Map() });
      const e = accs.get(k); e.qty += qty * m; e.rules.set(JSON.stringify(rule), rule);
    }
  };
  const spanLen = (s) => Math.min(L, Htot - s * L);
  const splice = (s) => (s < spans - 1 ? (L / 1000) * C.mullion_splice.gap_mm_per_m + C.mullion_splice.gap_extra_mm : 0);

  // montanți (+ cămașă) pe fiecare ax, înnădiți la fiecare ancoraj
  axes.forEach(() => {
    for (let s = 0; s < spans; s++) {
      if (mPick) add(mPick.mullion.code, spanLen(s) - splice(s), 1, M('bom.mullion'));
      if (mPick?.reinforced) add(mPick.mullion.reinforcement, spanLen(s) - splice(s), 1, M('bom.reinforcementFull'));
    }
    if (mPick && spans > 1 && mPick.mullion.reinforcement && !mPick.reinforced) add(mPick.mullion.reinforcement, C.mullion_splice.sleeve_length_mm, spans - 1, M('bom.spliceSleeve', { mm: C.mullion_splice.sleeve_length_mm }));
  });
  // traverse pe fiecare linie, între montanți
  for (let k = 0; k <= r; k++) W.forEach((w) => tPick && add(tPick.code, w - (D.transom ?? 22), 1, M('bom.transom')));
  const nTransomPieces = (r + 1) * n;
  if (tPick?.collar && jMax?.uses_collar) addA(tPick.collar, 2 * nTransomPieces, 'buc', M('bom.collar', { page: 186 }));
  if (jMax) jMax.parts.forEach((p) => addA(p, 2 * nTransomPieces, 'buc', M('bom.jointPart', { joint: DT(jMax.label) })));

  // rosturi după tip: presor+capac / cleme / silicon (lucernar) / rame (ST, SST)
  const pp = SR.pressure_plate || 'COR-9914';
  const screwsOn = (len) => Math.max(2, Math.ceil(Math.max(len - 2 * C.pressure_plate_screws.first_from_end_mm, 0) / C.pressure_plate_screws.max_pitch_mm) + 1);
  let pressureScrewCount = 0;
  if (sys.edges.v === 'pressure') axes.forEach(() => { for (let s = 0; s < spans; s++) { const l = spanLen(s); add(pp, l, 1, M('bom.pressureVertical')); add(o.cap, l, 1, M('bom.coverVertical')); pressureScrewCount += screwsOn(l); } });
  if (sys.edges.h === 'pressure') for (let k = 0; k <= r; k++) W.forEach((w) => { add(pp, w - D.pressure_horizontal, 1, M('bom.pressureHorizontal')); add(o.cap, w - D.cap_horizontal, 1, M('bom.coverHorizontal')); pressureScrewCount += screwsOn(w - D.pressure_horizontal); });
  if (sys.sloped && o.skyTransomJoint === 'inclined_cover') for (let k = 0; k <= r; k++) W.forEach((w) => { add(SR.inclined_cover_set.pressure, w - D.pressure_horizontal, 1, M('bom.pressureInclined')); add(SR.inclined_cover_set.cap, w - D.cap_horizontal, 1, M('bom.coverInclined')); pressureScrewCount += screwsOn(w - D.pressure_horizontal); });
  const r0 = fields[0].roles;
  if (pressureScrewCount && r0.pressureScrew) addA(r0.pressureScrew, pressureScrewCount, 'buc', M('bom.pressureScrew', { first: C.pressure_plate_screws.first_from_end_mm, pitch: C.pressure_plate_screws.max_pitch_mm, page: 897 }));

  // izolator RPT (toate sistemele cu presor sau cleme; ST/SST nu au)
  if (!sys.frame) {
    const rptV = sys.sloped ? r0.rpt : r0.rpt, rptH = sys.sloped ? r0.rptTransom : r0.rpt;
    splitRef(rptV).forEach(({ code, qty }) => axes.forEach(() => { for (let s = 0; s < spans; s++) add(code, spanLen(s), qty, M('bom.rptVertical')); }));
    splitRef(rptH).forEach(({ code, qty }) => { for (let k = 0; k <= r; k++) W.forEach((w) => add(code, w - (D.rpt_horizontal ?? 22), qty, M('bom.rptHorizontal'))); });
  }

  // rosturi etanșate (cleme SG pe verticală/orizontală, traverse de acoperiș)
  let jointM = 0, perimeterJointM = 0;
  const sealedV = sys.edges.v === 'clip', sealedH = sys.edges.h === 'clip' || (sys.sloped && o.skyTransomJoint === 'silicone');
  if (sealedV) for (let j = 0; j <= n; j++) H.forEach((h) => { if (j > 0 && j < n) jointM += h / 1000; else perimeterJointM += h / 1000; });
  if (sealedH) for (let k = 0; k <= r; k++) W.forEach((w) => { if (k > 0 && k < r) jointM += w / 1000; else perimeterJointM += w / 1000; });
  const dry = /uscată/.test(project.glass.variant || '');
  if (jointM) {
    if (dry) addA(r0.dryGasket, jointM, 'm', M('bom.dryGasket'));
    else { addA(r0.backer, jointM, 'm', M('bom.backer', { mm: 22 })); addA('SILICON-EXT', jointM, 'm', M('bom.sealingSilicone', { products: 'DC 791 / 756 SMS, Sikasil WS-605 S', mm: 22 })); }
    if (perimeterJointM) notes.push(M('note.perimeterJoints', { m: perimeterJointM }));
  }

  // cleme, profil U, poziționatoare (SG/TPH/TPV)
  if (sys.uProfile) clipSystemBOM({ sys, fields, W, H, n, r, C, addA, add, project });
  // rame ST/SST
  if (sys.frame) frameSystemBOM({ sys, SR, fields, C, add, addA, o });

  // garnituri pe fiecare geam (aproximare de consum, vezi docs)
  fields.forEach((f) => {
    if (f.type === 'window') return windowBOM(f, add, addA);
    const R = f.roles;
    addA(R.mullionGasket, 2 * f.gh / 1000, 'm', M('bom.mullionGasket'));
    addA(R.transomGasket, 2 * f.gw / 1000, 'm', M('bom.transomGasket'));
    const pg = R.pressureGasket || '999000';
    if (sys.edges.v === 'pressure') addA(pg, 2 * f.gh / 1000, 'm', M('bom.pressureGasketVertical'));
    if (sys.edges.h === 'pressure') addA(pg, 2 * f.gw / 1000, 'm', M('bom.pressureGasketHorizontal'));
    if (R.reducer && !sys.frame) splitRef(R.reducer).forEach(({ code }) => add(code, (2 * (f.gw + f.gh)) / 4, 4, M('bom.reducer')));
    if (R.block) addA(R.block, 2, 'buc', M('bom.wedge', { n: 2 }));
    if (f.supports?.qty) f.supports.refs.forEach((ref) => addA(ref, f.supports.qty, 'buc', M('bom.glassSupport')));
    if (R.pipette && f.i === r - 1) addA(R.pipette, 2, 'buc', M('bom.pipettes'));
    if (f.type === 'panel' && sys.panelFrame) {
      const bp = ctx.rules.tp52.blind_panel;
      add(bp.frame_vertical.code, evalCut(bp.frame_vertical.cut, f.Lax, f.Hax), 2, M('bom.blindFrame'));
      add(bp.frame_horizontal.code, evalCut(bp.frame_horizontal.cut, f.Lax, f.Hax), 2, M('bom.blindFrame'));
    }
  });
  if (!sys.sloped) addA(C.anchors.ref, sum(axes, (a) => a.anchors || 0) * spans, 'buc', M('bom.anchors'));

  // lucernar: îmbinarea de la streașină (cămașa COR-9912)
  if (sys.sloped && mPick) {
    const A = SR.eaves_joint.A_mm[mPick.mullion.code];
    if (A) {
      const beta = 90 - slope.deg, half = (beta / 2) * Math.PI / 180;
      const L1 = A / Math.cos(half), L2 = L1 + 200 / Math.tan(Math.PI / 2 - half);
      notes.push(M('note.eaves', { sleeve: SR.eaves_joint.sleeve, mullion: mPick.mullion.code, a: A, beta, l1: L1, l2: L2, page: 1272 }));
      add(SR.eaves_joint.sleeve, L2, n + 1, M('bom.eavesSleeve'));
      SR.eaves_joint.fixings.forEach(([c, q]) => addA(c, q * (n + 1), 'buc', M('bom.eavesFixing')));
    }
  }

  // ── Ieșiri ──────────────────────────────────────────────────────────────────
  const cuts = [...cut.values()].map((c) => {
    const p = ctx.prof.get(c.code); const m = sum(c.pieces) / 1000;
    const pk = packBars(c.pieces, o.barMm, o.kerfMm);
    return { code: c.code, desc: describe(c.code), notes: [...c.notes.values()], n: c.pieces.length, lengths: [...new Set(c.pieces)].sort((a, b) => b - a), m, kg: p?.kg_m ? m * p.kg_m : null, paint_m2: p?.paint_dm2_m ? (m * p.paint_dm2_m) / 100 : null, bars: pk.bars, waste: pk.waste, overLength: pk.overLength };
  });
  // Siliconii nu sunt produse Cortizo: descrierea lor e un mesaj, nu un text din catalog.
  const accessories = [...accs.values()].map((a) => ({ code: a.code, desc: a.code === 'SILICON-EXT' ? M('acc.sealingSilicone') : a.code === 'SILICON-STRUCT' ? M('acc.structuralSilicone') : describe(a.code), qty: a.unit === 'm' ? Math.round(a.qty * 10) / 10 : Math.ceil(a.qty), unit: a.unit, rules: [...a.rules.values()] }));
  cuts.filter((c) => c.overLength.length).forEach((c) => check('bad', 'cutting', M('check.cutting.overLength', { code: c.code, n: c.overLength.length, bar: o.barMm, lengths: c.overLength })));
  const ucw = ucwFor(ctx.data.catalog.ucw, sys.tableName || sys.name, project.glass.ug);

  return {
    system: { id: sys.id, name: sys.name, principle: SR.principle, edges: sys.edges, tests: SR.tests, pages: SR.pages },
    input: project,
    geometry: { widths: W, heights: H, n, r, Wtot, Htot, L, spans },
    loads: { windKPa: qk, suctionDesignPa, qPerpKPa: qPerp, slope, gGlassKPa },
    mullion: mPick && { code: mPick.mullion.code, depth: mPick.mullion.depth_mm, reinforced: mPick.reinforced, reinforcement: mPick.mullion.reinforcement, Ix: mPick.Ix, need: needMax, kg_m: mPick.kg_m },
    transom: tPick && { code: tPick.code, Ix: tPick.Ix_cm4, need: tNeed, collar: tPick.collar, ok: tPick.Ix_cm4 >= tNeed },
    axes, lines, fields, checks, cuts, accessories, notes, ucw,
    totals: { kgAluminium: sum(cuts, (c) => c.kg || 0), paintM2: sum(cuts, (c) => c.paint_m2 || 0), kgGlass: sum(fields, (f) => f.kg), glassM2: sum(fields, (f) => f.area), facadeM2: (Wtot * Htot) / 1e6 },
  };
}

// ── Specific pe sisteme ────────────────────────────────────────────────────────

function stSupports(f, SR, check) {
  const tb = SR.glass_supports_by_thickness.rows; // [ref, glass_mm, A_mm, N]
  const row = tb.find((x) => x[1] === f.glassMm) || tb.filter((x) => x[1] >= f.glassMm).sort((a, b) => a[1] - b[1])[0];
  if (!row) { f.supports = { refs: [], qty: 0, label: M('support.stTooThick', { max: 38 }), level: 'bad' }; return; }
  const capKg = (2 * row[3]) / G; // 2 suporți pe geam, rezistență de calcul pe bucată
  f.supports = { refs: [row[0]], qty: 2, cap: capKg, label: f.kg <= capKg ? M('support.count', { n: 2, ref: row[0] }) : M('support.fails'), level: f.kg <= capKg ? 'ok' : 'bad' };
  if (f.kg > capKg) f.notes.push(M('note.stSupport', { ref: row[0], cap: capKg, n: 2, kg: f.kg, page: 1029 }));
}

function systemFieldChecks(sys, SR, f, project, suctionPa, sg) {
  if (f.type === 'window') return;
  const t = project.glass.totalMm;
  if (SR.max_glass_mm && t > SR.max_glass_mm) { f.status = 'bad'; f.notes.push(M('note.maxGlass', { system: sys.name, mm: SR.max_glass_mm })); }
  if (sys.uProfile) {
    if (f.gw < 500 || f.gh < 300) { f.status = 'bad'; f.notes.push(M('note.sgMinGlass', { w: 500, h: 300, page: 669 })); }
    if (project.glass.chamberMm && ![16, 18, 20].includes(project.glass.chamberMm)) { f.status = 'bad'; f.notes.push(M('note.uProfileChambers', { list: [16, 18, 20], page: 670 })); }
  }
  if (sys.id === 'SG52' || sys.id === 'TPH52' || sys.id === 'TPV52') {
    const wM = f.gw / 1000, hM = f.gh / 1000;
    const dry = /uscată/.test(f.variant || '');
    if (!dry) {
      const lim = sg.max_glass_sealed;
      if (wM > lim.max_side_m || hM > lim.max_side_m || wM + hM > lim.max_w_plus_h_m) { f.status = 'bad'; f.notes.push(M('note.sgMaxGlass', { side: lim.max_side_m, sum: lim.max_w_plus_h_m, page: 671 })); }
    } else {
      const tbl = sg.max_glass_width_dry_m;
      const outer = project.glass.outerPaneMm, sil = project.options?.drySilicone || 'SG-550';
      const maxW = tbl?.[sil]?.[String(outer)];
      if (maxW && wM > maxW) { f.status = 'bad'; f.notes.push(M('note.sgDryWidth', { silicone: sil, outer, max: maxW, pages: '672–674' })); }
    }
    if (suctionPa > 1500 * 1.5) f.notes.push(M('note.sg1500', { pa: 1500, page: 671 }));
  }
}

function clipSystemBOM({ sys, fields, W, H, n, r, C, addA, add, project }) {
  const U = C.u_profile_sg, R = fields[0].roles;
  const pos = U.positioners[String(project.glass.chamberMm)];
  let dbl = 0, sgl = 0;
  // verticale cu cleme
  if (sys.edges.v === 'clip') for (let j = 0; j <= n; j++) H.forEach((h, i) => {
    const f = fields.find((x) => x.i === i && x.j === Math.min(j, n - 1));
    const c = clipsOnEdge(usableVertical(h), f?.clipPitch, C.clip_chart.min_clips_per_edge);
    if (j > 0 && j < n) dbl += c; else sgl += c;
  });
  // orizontale cu cleme
  if (sys.edges.h === 'clip') for (let k = 0; k <= r; k++) W.forEach((w, j) => {
    const f = fields.find((x) => x.j === j && x.i === Math.min(k, r - 1));
    const c = clipsOnEdge(usableHorizontal(w - 22), f?.clipPitch, C.clip_chart.min_clips_per_edge);
    if (k > 0 && k < r) dbl += c; else sgl += c;
  });
  addA(R.clipDouble, dbl, 'buc', M('bom.clipDouble', { pages: '678–679' }));
  addA(R.clipSingle, sgl, 'buc', M('bom.clipSingle'));
  addA(R.clipScrew, dbl + sgl, 'buc', M('bom.clipScrew'));
  // profil U în camera geamului, pe laturile prinse cu cleme
  fields.forEach((f) => {
    if (f.type === 'window') return;
    const edges = [];
    if (sys.edges.v === 'clip') edges.push(f.gh, f.gh);
    if (sys.edges.h === 'clip') edges.push(f.gw, f.gw);
    edges.forEach((e) => {
      const pieces = e <= U.one_piece_if_edge_le_mm ? 1 : U.pieces_if_longer;
      const len = (e - 60 - (pieces - 1) * U.gap_between_pieces_mm) / pieces;
      add(U.code, len, pieces, M('bom.uProfile'));
      if (pos) addA(pos, pieces * (Math.ceil((len - 2 * U.positioner_from_edge_mm) / U.positioner_max_spacing_mm) + 1), 'buc', M('bom.positioners'));
    });
  });
}

function frameSystemBOM({ sys, SR, fields, C, add, addA, o }) {
  const cl = SR.glass_frame.cleats.find((c) => c.option === o.clipFix) || SR.glass_frame.cleats[0];
  let clips = 0, couplingScrews = 0;
  fields.forEach((f) => {
    if (f.type === 'window') return;
    const fw = f.Lax - SR.deductions.frame_w, fh = f.Hax - SR.deductions.frame_h;
    add(SR.glass_frame.code, fw, 2, M('bom.glassFrame')); add(SR.glass_frame.code, fh, 2, M('bom.glassFrame'));
    cl.parts.forEach(([c, q]) => (c.startsWith('COR-') ? add(c, cl.cut_mm, q, M('bom.assemblyCleat', { mm: cl.cut_mm })) : addA(c, q, 'buc', M('bom.frameCorner', { option: DT(cl.option) }))));
    SR.frame_gaskets.forEach(([c, rule]) => addA(c, evalGasket(rule, fw, fh) / 1000, 'm', M('bom.frameGasket')));
    if (sys.id === 'ST52') {
      const sp = SR.structural_sealing_plate;
      add(sp.code, fw, 2, M('bom.sealingPlate')); add(sp.code, fh - sp.interruption_per_support_mm, 2, M('bom.sealingPlateInterrupted', { mm: sp.interruption_per_support_mm }));
      addA('SILICON-STRUCT', (2 * (f.gw + f.gh)) / 1000, 'm', M('bom.structuralSilicone', { products: 'SIKA SG500 / DC 993' }));
    }
    // clemele 999030 pe trei laturi (fără cea de jos)
    const pitch = f.clipPitch || 500;
    clips += clipsOnEdge(fw - 140, pitch) + 2 * clipsOnEdge(fh - 140, pitch);
    // cuplaj COR-9971 pe contur, șuruburi la max. 250 mm
    const cw = f.Lax - SR.deductions.coupling_horizontal, ch = f.Hax - SR.deductions.coupling_vertical;
    add(SR.coupling.code, cw, 2, M('bom.couplingTransoms')); add(SR.coupling.code, ch, 2, M('bom.couplingMullions'));
    [cw, cw, ch, ch].forEach((l) => { couplingScrews += Math.max(SR.coupling.min_screws, Math.ceil((l - 2 * SR.coupling.first_from_end_mm) / SR.coupling.max_pitch_mm) + 1); });
    add(SR.transom_support.code, SR.transom_support.cut_mm, SR.transom_support.per_glass, M('bom.transomSupport'));
    if (sys.id === 'SST52') { const R = f.roles; if (R.sashGasket) addA(R.sashGasket, (2 * (f.gw + f.gh)) / 1000, 'm', M('bom.sstGlassGasket', { page: 1113 })); if (R.reducer) add(R.reducer, (f.gw + f.gh) / 2, 4, M('bom.sstReducer', { page: 1113 })); }
  });
  addA(SR.clips.code, clips, 'buc', M('bom.frameClips', { code: SR.clips.code, pages: '1035 / 1153' }));
  addA(SR.coupling.screw, couplingScrews, 'buc', M('bom.couplingScrews', { first: SR.coupling.first_from_end_mm, pitch: SR.coupling.max_pitch_mm }));
}

function windowBOM(f, add, addA) {
  const w = f.win;
  w.profiles.forEach((p) => p.cuts.forEach(([expr, q]) => add(p.code, evalCut(expr, f.Lax, f.Hax), q, M('bom.windowPart', { part: DT(p.role) }))));
  w.accessories.forEach(([c, q]) => addA(c, q, 'buc', M('bom.windowAccessory', { page: w.page })));
  w.gaskets.forEach(([c, rule]) => addA(c, evalGasket(rule, f.Lax, f.Hax) / 1000, 'm', M('bom.windowGasket', { rule })));
}

function ucwFor(table, systemName, ug) {
  if (ug == null) return null;
  const col = table.columns.indexOf(systemName);
  if (col < 0) return null;
  const row = table.rows.reduce((best, r) => (Math.abs(r[0] - ug) < Math.abs(best[0] - ug) ? r : best), table.rows[0]);
  return { ug: row[0], ucw: row[col], page: table.page };
}
