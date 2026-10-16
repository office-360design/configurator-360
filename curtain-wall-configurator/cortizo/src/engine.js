// Motorul configuratorului de pereți cortină Cortizo (TP 52, SG 52, TPH 52, TPV 52, ST 52, SST 52, Lucernario).
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

export function createEngine(data) {
  const glz = glazingIndex(data.catalog.glazing_tables);
  const prof = new Map(data.catalog.profiles.map((p) => [p.code, p]));
  const acc = new Map(data.catalog.accessories.map((a) => [a.code, a]));
  const ctx = { data, rules: data.rules, glz, prof, acc };
  const describe = (code) => prof.get(code)?.desc_es || acc.get(code)?.desc_es || '';

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
  if (!sys) throw new Error(`Sistem necunoscut: ${project.system}`);
  const C = ctx.rules.common;
  const SR = ctx.rules[sys.rules];
  const o = { allowReinforcement: false, barMm: C.bar_length_mm, kerfMm: 5, cap: SR.caps?.[0]?.code, skyTransomJoint: 'silicone', clipFix: 'injecție', ...project.options };
  const notes = [], checks = [];
  const check = (level, title, text, page) => checks.push({ level, title, text, page });

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
    if (slope.deg < lim.min || slope.deg > lim.max) check('bad', 'Pantă', `Panta de ${slope.deg}° e în afara intervalului din catalog (${lim.min}°–${lim.max}°).`, lim._page);
  }

  // ── 2. Montanți ─────────────────────────────────────────────────────────────
  const axes = [];
  for (let j = 0; j <= n; j++) {
    const b = ((W[j - 1] || 0) + (W[j] || 0)) / 2;
    axes.push({ j, b, need: requiredInertia(qPerp, b, Math.min(L, Htot), C) });
  }
  const needMax = Math.max(...axes.map((a) => a.need));
  const mPick = pickMullion(ctx.data.catalog.mullions, needMax, { allowReinforcement: o.allowReinforcement, allowedCodes: sys.sloped ? SR.mullion_range : null });
  if (mPick) check('ok', 'Montant', `${mPick.mullion.code} (${mPick.mullion.depth_mm} mm)${mPick.reinforced ? ` cu cămașa ${mPick.mullion.reinforcement}` : ''}: Ix ${mPick.Ix.toFixed(1)} cm⁴ ≥ ${needMax.toFixed(1)} cm⁴ necesar (rezervă ${((mPick.Ix / needMax - 1) * 100).toFixed(0)} %).`, mPick.mullion.page);
  else check('bad', 'Montant', `Niciun montant nu atinge Ix ${needMax.toFixed(1)} cm⁴. Permiteți cămașa, micșorați distanța între ancoraje sau lățimea modulelor.`, 27);

  // ── 3. Traverse ─────────────────────────────────────────────────────────────
  const tPick = mPick ? pickTransom(ctx.data.catalog.transoms, mPick.mullion.depth_mm) : null;
  const lines = [];
  for (let k = 0; k <= r; k++) {
    const ht = ((H[k - 1] || 0) + (H[k] || 0)) / 2;
    lines.push({ k, ht, need: Math.max(...W.map((w) => requiredInertia(qPerp, ht, w, C))) });
  }
  const tNeed = Math.max(...lines.map((l) => l.need));
  if (tPick) check(tPick.Ix_cm4 >= tNeed ? 'ok' : 'bad', 'Traversă', `${tPick.code}: Ix ${tPick.Ix_cm4} cm⁴ față de ${tNeed.toFixed(1)} cm⁴ necesar pe cel mai lat modul.${tPick.Ix_cm4 >= tNeed ? '' : ' Alegeți un montant mai adânc (traversa îl urmează) sau module mai înguste.'}`, tPick.page);

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
      f.label = `fereastră${okKg ? '' : ' – prea grea'}${okSize ? '' : ' – dimensiuni'}`;
      if (!okSize) f.notes.push(`Fereastra are limitele ${win.Lm.join('–')} × ${win.Hm.join('–')} mm (pag. ${win.page}).`);
      if (!okKg) f.notes.push(`Geamul ferestrei are ${f.kg.toFixed(0)} kg, peste ${win.max_kg} kg.`);
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
      else if (sys.id === 'SST52') { f.supports = { refs: ['COR-9942'], qty: 2, label: '2 × COR-9942 + cale 999037', level: 'warn', cap: null }; f.notes.push('Capacitatea suportului COR-9942 pentru SST 52 nu e dată în catalog – de cerut de la Cortizo.'); }
      else f.supports = chooseSupports(f.kgSupport, { std: f.roles.supportStd, heavy: f.roles.supportHeavy, cross: f.roles.supportCross }, ctx.data.catalog.glass_supports);
      f.status = f.supports.level; f.label = f.supports.label;
      if (type === 'panel') { f.label = 'panou opac'; }
      if (!f.roles.mullionGasket && !f.roles.supportStd && !['ST52', 'SST52'].includes(sys.id)) {
        f.status = 'bad'; f.label = 'grosime fără tabel'; f.notes.push(`Nu există rând în tabelul de vitraj pentru ${f.glassMm} mm${f.innerPane ? ` (foaie interioară ${f.innerPane})` : ''}.`);
      }
    }
    f.joint = chooseJoint(f.kg, C.mullion_transom_joints);
    if (!f.joint) { f.status = 'bad'; f.notes.push(`Geamul are ${f.kg.toFixed(0)} kg, peste 400 kg pe o traversă.`); }

    // cleme (SG/TPH/TPV pe laturile cu cleme; ST/SST pe ramă)
    if (sys.edges.v === 'clip' || sys.edges.h === 'clip' || sys.edges.v === 'frame') {
      const cp = clipPitch(suctionDesignPa, f.area, C.clip_chart);
      f.clipPitch = cp.pitch;
      if (!cp.pitch) { f.status = 'bad'; f.notes.push(`Cleme: ${cp.reason}.`); }
    }
    systemFieldChecks(sys, SR, f, project, suctionDesignPa, ctx.rules.sg52);
    fields.push(f);
  }
  const worst = fields.reduce((a, f) => (f.kg > a.kg ? f : a), fields[0]);
  const jMax = chooseJoint(worst.kg, C.mullion_transom_joints);
  check(jMax ? 'ok' : 'bad', 'Îmbinare montant–traversă', jMax ? `${jMax.label}: cel mai greu geam ${worst.kg.toFixed(0)} kg ≤ ${jMax.max_kg} kg.` : `Cel mai greu geam are ${worst.kg.toFixed(0)} kg, peste 400 kg.`, jMax?.pages?.[0]);
  const nBad = fields.filter((f) => f.status === 'bad').length, nWarn = fields.filter((f) => f.status === 'warn').length;
  check(nBad ? 'bad' : nWarn ? 'warn' : 'ok', 'Câmpuri', `${fields.length - nBad - nWarn} fără observații, ${nWarn} cu suporți speciali, ${nBad} care nu trec.`);
  if (sys.edges.v === 'clip' || sys.edges.h === 'clip' || sys.edges.v === 'frame') {
    const pitches = [...new Set(fields.map((f) => f.clipPitch).filter(Boolean))].sort((a, b) => a - b);
    check(pitches.length ? 'ok' : 'bad', 'Pas cleme', pitches.length ? `Sucțiune de calcul ${suctionDesignPa.toFixed(0)} Pa (q × 1,5) → pas maxim ${pitches.join(' / ')} mm după suprafața geamului.` : 'Nu se poate stabili pasul clemelor.', C.clip_chart._page[0]);
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
  if (sys.sloped) check('warn', 'Ancoraje', 'La lucernar reacțiunile sunt calculate, dar prinderea se face cu ghidaj la perete COR-9830/31/32 și pe montanți laterali (pag. 1271–1275) – de verificat de proiectant.', 1275);
  else check(axes.every((a) => a.anchors) ? 'ok' : 'bad', 'Ancoraje', `${spans} deschidere(i) pe montant · ${axes.map((a, i) => `M${i + 1}: ${a.anchors ? `${a.anchors}× ${C.anchors.ref}` : 'peste 3 ancore'}`).join(' · ')}`, C.anchors.page);

  // ── 8. Debitare și accesorii ────────────────────────────────────────────────
  const cut = new Map(), accs = new Map();
  const add = (code, len, qty = 1, note = '') => {
    if (!code || !(len > 0) || !qty) return;
    if (!cut.has(code)) cut.set(code, { code, pieces: [], notes: new Set() });
    const c = cut.get(code); for (let q = 0; q < qty; q++) c.pieces.push(Math.round(len * 10) / 10); if (note) c.notes.add(note);
  };
  const addA = (code, qty, unit, rule) => {
    if (!code || !qty) return;
    for (const { code: c, qty: m } of splitRef(code).length ? splitRef(code) : [{ code, qty: 1 }]) {
      const k = `${c}|${unit}`;
      if (!accs.has(k)) accs.set(k, { code: c, qty: 0, unit, rules: new Set() });
      const e = accs.get(k); e.qty += qty * m; e.rules.add(rule);
    }
  };
  const spanLen = (s) => Math.min(L, Htot - s * L);
  const splice = (s) => (s < spans - 1 ? (L / 1000) * C.mullion_splice.gap_mm_per_m + C.mullion_splice.gap_extra_mm : 0);

  // montanți (+ cămașă) pe fiecare ax, înnădiți la fiecare ancoraj
  axes.forEach(() => {
    for (let s = 0; s < spans; s++) {
      if (mPick) add(mPick.mullion.code, spanLen(s) - splice(s), 1, 'montant');
      if (mPick?.reinforced) add(mPick.mullion.reinforcement, spanLen(s) - splice(s), 1, 'cămașă de armare pe toată lungimea');
    }
    if (mPick && spans > 1 && mPick.mullion.reinforcement && !mPick.reinforced) add(mPick.mullion.reinforcement, C.mullion_splice.sleeve_length_mm, spans - 1, 'manșon de înnădire 400 mm');
  });
  // traverse pe fiecare linie, între montanți
  for (let k = 0; k <= r; k++) W.forEach((w) => tPick && add(tPick.code, w - (D.transom ?? 22), 1, 'traversă'));
  const nTransomPieces = (r + 1) * n;
  if (tPick?.collar && jMax?.uses_collar) addA(tPick.collar, 2 * nTransomPieces, 'buc', 'guler la fiecare capăt de traversă (pag. 186)');
  if (jMax) jMax.parts.forEach((p) => addA(p, 2 * nTransomPieces, 'buc', `${jMax.label.toLowerCase()} – la fiecare capăt de traversă`));

  // rosturi după tip: presor+capac / cleme / silicon (lucernar) / rame (ST, SST)
  const pp = SR.pressure_plate || 'COR-9914';
  const screwsOn = (len) => Math.max(2, Math.ceil(Math.max(len - 2 * C.pressure_plate_screws.first_from_end_mm, 0) / C.pressure_plate_screws.max_pitch_mm) + 1);
  let pressureScrewCount = 0;
  if (sys.edges.v === 'pressure') axes.forEach(() => { for (let s = 0; s < spans; s++) { const l = spanLen(s); add(pp, l, 1, 'presor vertical'); add(o.cap, l, 1, 'capac vertical'); pressureScrewCount += screwsOn(l); } });
  if (sys.edges.h === 'pressure') for (let k = 0; k <= r; k++) W.forEach((w) => { add(pp, w - D.pressure_horizontal, 1, 'presor orizontal'); add(o.cap, w - D.cap_horizontal, 1, 'capac orizontal'); pressureScrewCount += screwsOn(w - D.pressure_horizontal); });
  if (sys.sloped && o.skyTransomJoint === 'inclined_cover') for (let k = 0; k <= r; k++) W.forEach((w) => { add(SR.inclined_cover_set.pressure, w - D.pressure_horizontal, 1, 'presor pentru capac înclinat'); add(SR.inclined_cover_set.cap, w - D.cap_horizontal, 1, 'capac înclinat'); pressureScrewCount += screwsOn(w - D.pressure_horizontal); });
  const r0 = fields[0].roles;
  if (pressureScrewCount && r0.pressureScrew) addA(r0.pressureScrew, pressureScrewCount, 'buc', `șurub presor: primul la ${C.pressure_plate_screws.first_from_end_mm} mm, apoi max. ${C.pressure_plate_screws.max_pitch_mm} mm (pag. 897)`);

  // izolator RPT (toate sistemele cu presor sau cleme; ST/SST nu au)
  if (!sys.frame) {
    const rptV = sys.sloped ? r0.rpt : r0.rpt, rptH = sys.sloped ? r0.rptTransom : r0.rpt;
    splitRef(rptV).forEach(({ code, qty }) => axes.forEach(() => { for (let s = 0; s < spans; s++) add(code, spanLen(s), qty, 'izolator RPT vertical'); }));
    splitRef(rptH).forEach(({ code, qty }) => { for (let k = 0; k <= r; k++) W.forEach((w) => add(code, w - (D.rpt_horizontal ?? 22), qty, 'izolator RPT orizontal')); });
  }

  // rosturi etanșate (cleme SG pe verticală/orizontală, traverse de acoperiș)
  let jointM = 0, perimeterJointM = 0;
  const sealedV = sys.edges.v === 'clip', sealedH = sys.edges.h === 'clip' || (sys.sloped && o.skyTransomJoint === 'silicone');
  if (sealedV) for (let j = 0; j <= n; j++) H.forEach((h) => { if (j > 0 && j < n) jointM += h / 1000; else perimeterJointM += h / 1000; });
  if (sealedH) for (let k = 0; k <= r; k++) W.forEach((w) => { if (k > 0 && k < r) jointM += w / 1000; else perimeterJointM += w / 1000; });
  const dry = /uscată/.test(project.glass.variant || '');
  if (jointM) {
    if (dry) addA(r0.dryGasket, jointM, 'm', 'garnitură uscată în rosturile dintre geamuri');
    else { addA(r0.backer, jointM, 'm', 'garnitură de fund sub silicon, în rosturile de 22 mm'); addA('SILICON-EXT', jointM, 'm', 'silicon de etanșare exterior (DC 791 / 756 SMS sau Sikasil WS-605 S) – rost 22 mm'); }
    if (perimeterJointM) notes.push(`Rosturile perimetrale (${perimeterJointM.toFixed(1)} m) se rezolvă cu detaliile de racord la clădire (pornire, coronament, lateral) – nu sunt incluse în listă.`);
  }

  // cleme, profil U, poziționatoare (SG/TPH/TPV)
  if (sys.uProfile) clipSystemBOM({ sys, fields, W, H, n, r, C, addA, add, project });
  // rame ST/SST
  if (sys.frame) frameSystemBOM({ sys, SR, fields, C, add, addA, o });

  // garnituri pe fiecare geam (aproximare de consum, vezi docs)
  fields.forEach((f) => {
    if (f.type === 'window') return windowBOM(f, add, addA);
    const R = f.roles;
    addA(R.mullionGasket, 2 * f.gh / 1000, 'm', 'garnitură interioară pe laturile verticale');
    addA(R.transomGasket, 2 * f.gw / 1000, 'm', 'garnitură interioară pe laturile orizontale');
    const pg = R.pressureGasket || '999000';
    if (sys.edges.v === 'pressure') addA(pg, 2 * f.gh / 1000, 'm', 'garnitură exterioară de presor (verticală)');
    if (sys.edges.h === 'pressure') addA(pg, 2 * f.gw / 1000, 'm', 'garnitură exterioară de presor (orizontală)');
    if (R.reducer && !sys.frame) splitRef(R.reducer).forEach(({ code }) => add(code, (2 * (f.gw + f.gh)) / 4, 4, 'reductor de falț pe perimetrul geamului'));
    if (R.block) addA(R.block, 2, 'buc', 'cale de sprijin (2 pe geam, la L/10)');
    if (f.supports?.qty) f.supports.refs.forEach((ref) => addA(ref, f.supports.qty, 'buc', 'suport de sticlă'));
    if (R.pipette && f.i === r - 1) addA(R.pipette, 2, 'buc', 'pipete de drenaj la capetele traversei de jos');
    if (f.type === 'panel' && sys.panelFrame) {
      const bp = ctx.rules.tp52.blind_panel;
      add(bp.frame_vertical.code, evalCut(bp.frame_vertical.cut, f.Lax, f.Hax), 2, 'ramă zonă oarbă');
      add(bp.frame_horizontal.code, evalCut(bp.frame_horizontal.cut, f.Lax, f.Hax), 2, 'ramă zonă oarbă');
    }
  });
  if (!sys.sloped) addA(C.anchors.ref, sum(axes, (a) => a.anchors || 0) * spans, 'buc', 'ancore pe montant, la fiecare deschidere');

  // lucernar: îmbinarea de la streașină (cămașa COR-9912)
  if (sys.sloped && mPick) {
    const A = SR.eaves_joint.A_mm[mPick.mullion.code];
    if (A) {
      const beta = 90 - slope.deg, half = (beta / 2) * Math.PI / 180;
      const L1 = A / Math.cos(half), L2 = L1 + 200 / Math.tan(Math.PI / 2 - half);
      notes.push(`Streașină: cămașa ${SR.eaves_joint.sleeve} pentru ${mPick.mullion.code}: A = ${A} mm, β = ${beta}°, L1 = ${L1.toFixed(1)} mm, L2 = ${L2.toFixed(1)} mm (pag. 1272).`);
      add(SR.eaves_joint.sleeve, L2, n + 1, 'cămașă îmbinare streașină (L2)');
      SR.eaves_joint.fixings.forEach(([c, q]) => addA(c, q * (n + 1), 'buc', 'fixare îmbinare streașină'));
    }
  }

  // ── Ieșiri ──────────────────────────────────────────────────────────────────
  const cuts = [...cut.values()].map((c) => {
    const p = ctx.prof.get(c.code); const m = sum(c.pieces) / 1000;
    const pk = packBars(c.pieces, o.barMm, o.kerfMm);
    return { code: c.code, desc: describe(c.code), notes: [...c.notes], n: c.pieces.length, lengths: [...new Set(c.pieces)].sort((a, b) => b - a), m, kg: p?.kg_m ? m * p.kg_m : null, paint_m2: p?.paint_dm2_m ? (m * p.paint_dm2_m) / 100 : null, bars: pk.bars, waste: pk.waste, overLength: pk.overLength };
  });
  const accessories = [...accs.values()].map((a) => ({ code: a.code, desc: a.code === 'SILICON-EXT' ? 'Silicon de etanșare (nu e produs Cortizo)' : describe(a.code), qty: a.unit === 'm' ? Math.round(a.qty * 10) / 10 : Math.ceil(a.qty), unit: a.unit, rules: [...a.rules] }));
  cuts.filter((c) => c.overLength.length).forEach((c) => check('bad', 'Debitare', `${c.code}: ${c.overLength.length} bucăți mai lungi decât bara de ${o.barMm} mm (${c.overLength.join(', ')} mm). Micșorați distanța între ancoraje sau comandați bare mai lungi.`));
  const ucw = ucwFor(ctx.data.catalog.ucw, sys.name, project.glass.ug);

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
  if (!row) { f.supports = { refs: [], qty: 0, label: 'grosime peste 38 mm', level: 'bad' }; return; }
  const capKg = (2 * row[3]) / G; // 2 suporți pe geam, rezistență de calcul pe bucată
  f.supports = { refs: [row[0]], qty: 2, cap: capKg, label: f.kg <= capKg ? `2 × ${row[0]}` : 'nu trece', level: f.kg <= capKg ? 'ok' : 'bad' };
  if (f.kg > capKg) f.notes.push(`Suportul ${row[0]} duce ${capKg.toFixed(0)} kg cu 2 bucăți (pag. 1029); geamul are ${f.kg.toFixed(0)} kg.`);
}

function systemFieldChecks(sys, SR, f, project, suctionPa, sg) {
  if (f.type === 'window') return;
  const t = project.glass.totalMm;
  if (SR.max_glass_mm && t > SR.max_glass_mm) { f.status = 'bad'; f.notes.push(`${sys.name} acceptă sticlă de max. ${SR.max_glass_mm} mm.`); }
  if (sys.uProfile) {
    if (f.gw < 500 || f.gh < 300) { f.status = 'bad'; f.notes.push('Sticla SG are minim 500 × 300 mm (pag. 669).'); }
    if (project.glass.chamberMm && ![16, 18, 20].includes(project.glass.chamberMm)) { f.status = 'bad'; f.notes.push('Profilul U SG funcționează doar cu camere de 16, 18 sau 20 mm (pag. 670).'); }
  }
  if (sys.id === 'SG52' || sys.id === 'TPH52' || sys.id === 'TPV52') {
    const wM = f.gw / 1000, hM = f.gh / 1000;
    const dry = /uscată/.test(f.variant || '');
    if (!dry) {
      const lim = sg.max_glass_sealed;
      if (wM > lim.max_side_m || hM > lim.max_side_m || wM + hM > lim.max_w_plus_h_m) { f.status = 'bad'; f.notes.push(`Geam prea mare pentru lipirea profilului U: max. ${lim.max_side_m} m pe latură și lățime + înălțime ≤ ${lim.max_w_plus_h_m} m (pag. 671).`); }
    } else {
      const tbl = sg.max_glass_width_dry_m;
      const outer = project.glass.outerPaneMm, sil = project.options?.drySilicone || 'SG-550';
      const maxW = tbl?.[sil]?.[String(outer)];
      if (maxW && wM > maxW) { f.status = 'bad'; f.notes.push(`Cu garnitură uscată și ${sil}, foaia exterioară de ${outer} mm permite lățime max. ${maxW} m (pag. 672–674).`); }
    }
    if (suctionPa > 1500 * 1.5) f.notes.push('Dimensiunile maxime ale geamului SG sunt date pentru 1500 Pa – peste această valoare e nevoie de studiu specific (pag. 671).');
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
  addA(R.clipDouble, dbl, 'buc', 'clemă dublă pe rosturile dintre două geamuri (pag. 678–679)');
  addA(R.clipSingle, sgl, 'buc', 'clemă simplă pe marginea fațadei');
  addA(R.clipScrew, dbl + sgl, 'buc', 'un șurub la fiecare clemă');
  // profil U în camera geamului, pe laturile prinse cu cleme
  fields.forEach((f) => {
    if (f.type === 'window') return;
    const edges = [];
    if (sys.edges.v === 'clip') edges.push(f.gh, f.gh);
    if (sys.edges.h === 'clip') edges.push(f.gw, f.gw);
    edges.forEach((e) => {
      const pieces = e <= U.one_piece_if_edge_le_mm ? 1 : U.pieces_if_longer;
      const len = (e - 60 - (pieces - 1) * U.gap_between_pieces_mm) / pieces;
      add(U.code, len, pieces, 'profil U lipit în camera geamului (la producătorul de sticlă)');
      if (pos) addA(pos, pieces * (Math.ceil((len - 2 * U.positioner_from_edge_mm) / U.positioner_max_spacing_mm) + 1), 'buc', 'poziționatoare profil U (se scot după uscarea siliconului)');
    });
  });
}

function frameSystemBOM({ sys, SR, fields, C, add, addA, o }) {
  const cl = SR.glass_frame.cleats.find((c) => c.option === o.clipFix) || SR.glass_frame.cleats[0];
  let clips = 0, couplingScrews = 0;
  fields.forEach((f) => {
    if (f.type === 'window') return;
    const fw = f.Lax - SR.deductions.frame_w, fh = f.Hax - SR.deductions.frame_h;
    add(SR.glass_frame.code, fw, 2, 'ramă geam, tăiată la 45°'); add(SR.glass_frame.code, fh, 2, 'ramă geam, tăiată la 45°');
    cl.parts.forEach(([c, q]) => (c.startsWith('COR-') ? add(c, cl.cut_mm, q, 'echer de asamblare 41,4 mm') : addA(c, q, 'buc', `colț ramă (${cl.option})`)));
    SR.frame_gaskets.forEach(([c, rule]) => addA(c, evalGasket(rule, fw, fh) / 1000, 'm', 'garnitură ramă'));
    if (sys.id === 'ST52') {
      const sp = SR.structural_sealing_plate;
      add(sp.code, fw, 2, 'platbandă pentru siliconul structural'); add(sp.code, fh - sp.interruption_per_support_mm, 2, 'platbandă pentru siliconul structural (întreruptă 100 mm la suporți)');
      addA('SILICON-STRUCT', (2 * (f.gw + f.gh)) / 1000, 'm', 'silicon structural SIKA SG500 / DC 993 pe perimetrul geamului');
    }
    // clemele 999030 pe trei laturi (fără cea de jos)
    const pitch = f.clipPitch || 500;
    clips += clipsOnEdge(fw - 140, pitch) + 2 * clipsOnEdge(fh - 140, pitch);
    // cuplaj COR-9971 pe contur, șuruburi la max. 250 mm
    const cw = f.Lax - SR.deductions.coupling_horizontal, ch = f.Hax - SR.deductions.coupling_vertical;
    add(SR.coupling.code, cw, 2, 'cuplaj pe traverse'); add(SR.coupling.code, ch, 2, 'cuplaj pe montanți');
    [cw, cw, ch, ch].forEach((l) => { couplingScrews += Math.max(SR.coupling.min_screws, Math.ceil((l - 2 * SR.coupling.first_from_end_mm) / SR.coupling.max_pitch_mm) + 1); });
    add(SR.transom_support.code, SR.transom_support.cut_mm, SR.transom_support.per_glass, 'suport pe traversă, la L/10');
    if (sys.id === 'SST52') { const R = f.roles; if (R.sashGasket) addA(R.sashGasket, (2 * (f.gw + f.gh)) / 1000, 'm', 'garnitură geam (tabel pag. 1113)'); if (R.reducer) add(R.reducer, (f.gw + f.gh) / 2, 4, 'reductor de falț (tabel pag. 1113)'); }
  });
  addA(SR.clips.code, clips, 'buc', 'cleme 999030 pe trei laturi ale ramei (pag. 1035 / 1153)');
  addA(SR.coupling.screw, couplingScrews, 'buc', 'șuruburi cuplaj: la 30 mm de capete, max. 250 mm');
}

function windowBOM(f, add, addA) {
  const w = f.win;
  w.profiles.forEach((p) => p.cuts.forEach(([expr, q]) => add(p.code, evalCut(expr, f.Lax, f.Hax), q, `fereastră – ${p.role}`)));
  w.accessories.forEach(([c, q]) => addA(c, q, 'buc', `fereastră (pag. ${w.page})`));
  w.gaskets.forEach(([c, rule]) => addA(c, evalGasket(rule, f.Lax, f.Hax) / 1000, 'm', `garnitură fereastră ${rule}`));
}

function ucwFor(table, systemName, ug) {
  if (ug == null) return null;
  const col = table.columns.indexOf(systemName);
  if (col < 0) return null;
  const row = table.rows.reduce((best, r) => (Math.abs(r[0] - ug) < Math.abs(best[0] - ug) ? r : best), table.rows[0]);
  return { ug: row[0], ucw: row[col], page: table.page };
}
