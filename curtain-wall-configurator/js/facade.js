// Stick curtain wall model on a mullion/transom grid (GUTMANN GCW 050).
// Pure functions; all lengths in mm unless named otherwise. The grid follows
// the window configurator's track model: column widths and row heights are
// axis-to-axis distances; rows are listed from the bottom up.
import {
  COVER_PLATES, GASKETS, GLASS_SUPPORTS, GLAZING_PRESETS, INSULATORS, PRESSURE_STRIPS, PROFILES, SPANDREL, SYSTEM,
  estimatedKgPerM, frameUf, getProfile, glazingComponents,
} from './catalog.js?v=cw-1';

export const LIMITS = Object.freeze({
  bays: [1, 20], rows: [1, 20], width: [400, 4000], height: [300, 5000],
  wind: [0.3, 3.0], anchorSpacing: [1000, 7000], qty: [1, 999],
});
// Glass edge sits 11 mm from the member axis (half of the insulator gap).
export const GLASS_EDGE = 11;
export const SCREW_SPACING = 250; // pressure strip screws, indicative
export const SAW_KERF = 5;

export const FINISHES = Object.freeze([
  { id: '7016', label: 'RAL 7016', color: '#383e42' },
  { id: '9005', label: 'RAL 9005', color: '#0e0e10' },
  { id: '9006', label: 'RAL 9006', color: '#a1a1a0' },
  { id: '9007', label: 'RAL 9007', color: '#878581' },
  { id: '9016', label: 'RAL 9016', color: '#f1f0ea' },
  { id: '8019', label: 'RAL 8019', color: '#403a3a' },
  { id: 'E6C0', label: 'Eloxat natur', color: '#c3c6c8' },
]);

export const DEFAULT_STATE = Object.freeze({
  version: 1,
  widths: [1500, 1500, 1500, 1500],
  heights: [900, 2400, 900, 2400],
  rowTypes: ['spandrel', 'vision', 'spandrel', 'vision'],
  mullion: 'auto',
  transom: 'auto',
  glazing: 'dgu-32',
  customThickness: 32,
  customGlass: 12,
  customUg: 1.0,
  strip: '159301',
  coverMullion: '159020',
  coverTransom: '159012',
  windLoad: 0.8,
  anchorSpacing: 3300,
  finishOutside: '7016',
  finishInside: '7016',
  sameFinish: true,
  glassTint: 'neutral',
  qty: 1,
});

export const PRESETS = Object.freeze({
  storefront: { widths: [1200, 1800, 1800, 1200], heights: [3000], rowTypes: ['vision'], anchorSpacing: 3000, windLoad: 0.6 },
  office: { widths: [1500, 1500, 1500, 1500], heights: [900, 2400, 900, 2400], rowTypes: ['spandrel', 'vision', 'spandrel', 'vision'], anchorSpacing: 3300, windLoad: 0.8 },
  atrium: { widths: [1800, 1800, 1800], heights: [2500, 2500, 2500], rowTypes: ['vision', 'vision', 'vision'], anchorSpacing: 3750, windLoad: 1.0, glazing: 'tgu-44' },
});

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const round = v => Math.round(Number(v) || 0);

export function normalizeState(input = {}) {
  const S = { ...DEFAULT_STATE, ...input };
  const list = (values, range, fallback) => {
    const array = Array.isArray(values) && values.length ? values : fallback;
    return array.slice(0, LIMITS.bays[1]).map(v => clamp(round(v), range));
  };
  S.widths = list(S.widths, LIMITS.width, DEFAULT_STATE.widths);
  S.heights = list(S.heights, LIMITS.height, DEFAULT_STATE.heights);
  const types = Array.isArray(S.rowTypes) ? S.rowTypes : [];
  S.rowTypes = S.heights.map((_, i) => (types[i] === 'spandrel' ? 'spandrel' : 'vision'));
  if (S.mullion !== 'auto' && !getProfile(S.mullion)) S.mullion = 'auto';
  if (S.transom !== 'auto' && !getProfile(S.transom)) S.transom = 'auto';
  if (S.glazing !== 'custom' && !GLAZING_PRESETS.some(p => p.id === S.glazing)) S.glazing = DEFAULT_STATE.glazing;
  S.customThickness = clamp(2 * Math.round((Number(S.customThickness) || 32) / 2), [12, 64]);
  S.customGlass = Math.min(Math.max(4, Number(S.customGlass) || 12), S.customThickness);
  S.customUg = Math.min(Math.max(0.3, Number(S.customUg) || 1), 3);
  if (!PRESSURE_STRIPS[S.strip]) S.strip = DEFAULT_STATE.strip;
  if (!COVER_PLATES[S.coverMullion]) S.coverMullion = DEFAULT_STATE.coverMullion;
  if (!COVER_PLATES[S.coverTransom]) S.coverTransom = DEFAULT_STATE.coverTransom;
  S.windLoad = Math.round(clamp(Number(S.windLoad) || 0.8, LIMITS.wind) * 100) / 100;
  S.anchorSpacing = clamp(round(S.anchorSpacing), LIMITS.anchorSpacing);
  if (!FINISHES.some(f => f.id === S.finishOutside)) S.finishOutside = DEFAULT_STATE.finishOutside;
  if (!FINISHES.some(f => f.id === S.finishInside)) S.finishInside = DEFAULT_STATE.finishInside;
  S.sameFinish = Boolean(S.sameFinish);
  if (S.sameFinish) S.finishInside = S.finishOutside;
  if (!['clear', 'neutral', 'blue', 'bronze'].includes(S.glassTint)) S.glassTint = DEFAULT_STATE.glassTint;
  S.qty = clamp(round(S.qty) || 1, LIMITS.qty);
  S.version = 1;
  return S;
}

export function glazingOf(S) {
  if (S.glazing === 'custom') return { id: 'custom', label: `${S.customThickness} mm`, thickness: S.customThickness, glass: S.customGlass, Ug: S.customUg, psi: S.customUg < 0.8 ? 0.04 : 0.06 };
  return GLAZING_PRESETS.find(p => p.id === S.glazing);
}

const cumulative = values => values.reduce((acc, v) => [...acc, acc.at(-1) + v], [0]);

// Required second moments of area (cm⁴), simply supported members.
export function windIRequired(q, tributary, span) {
  const f = Math.min(span / SYSTEM.windDeflection.ratio, SYSTEM.windDeflection.max);
  const p = q * 1e-3 * tributary; // N/mm
  return (5 * p * span ** 4) / (384 * SYSTEM.E * f) / 1e4;
}
export function deadIRequired(weightN, span) {
  const a = Math.min(SYSTEM.deadLoad.blockInset, span / 4);
  const f = Math.min(SYSTEM.deadLoad.max, span / SYSTEM.deadLoad.ratio);
  const P = weightN / 2;
  return (P * a * (3 * span * span - 4 * a * a)) / (24 * SYSTEM.E * f) / 1e4;
}

const smallest = test => PROFILES.find(test) || null;

export function facadeModel(input) {
  const S = normalizeState(input);
  const glazing = glazingOf(S);
  const xs = cumulative(S.widths), ys = cumulative(S.heights);
  const W = xs.at(-1), H = ys.at(-1);
  const half = SYSTEM.faceWidth / 2;

  // Panes (vision glass or opaque spandrel) per bay and row.
  const panes = [];
  S.heights.forEach((h, row) => S.widths.forEach((w, bay) => {
    const pw = w - 2 * GLASS_EDGE, ph = h - 2 * GLASS_EDGE;
    const spandrel = S.rowTypes[row] === 'spandrel';
    const kg = spandrel ? SPANDREL.kgPerM2 * pw * ph / 1e6 : 2.5 * glazing.glass * pw * ph / 1e6; // 25 kN/m³ ≈ 2.5 kg/(m²·mm)
    panes.push({ bay, row, x0: xs[bay], x1: xs[bay + 1], y0: ys[row], y1: ys[row + 1], width: pw, height: ph, spandrel, kg,
      visibleArea: (w - SYSTEM.faceWidth) * (h - SYSTEM.faceWidth) / 1e6 });
  }));

  // Mullions: continuous over the full height, anchored every anchorSpacing.
  const span = Math.min(S.anchorSpacing, H);
  const mullions = xs.map((x, i) => {
    const tributary = ((S.widths[i - 1] || 0) + (S.widths[i] || 0)) / 2;
    return { index: i, x, length: H, tributary, IxReq: windIRequired(S.windLoad, tributary, span) };
  });
  // Transoms on every row line (bottom and top included), between mullions.
  const transoms = [];
  ys.forEach((y, line) => S.widths.forEach((w, bay) => {
    const tributary = ((S.heights[line - 1] || 0) + (S.heights[line] || 0)) / 2;
    const above = panes.find(p => p.bay === bay && p.row === line);
    const weightN = above ? above.kg * 9.81 : 0;
    transoms.push({ line, bay, y, x0: xs[bay] + half, x1: xs[bay + 1] - half, span: w, length: w - SYSTEM.faceWidth, tributary,
      IxReq: windIRequired(S.windLoad, tributary, w), IyReq: weightN ? deadIRequired(weightN, w) : 0, carriesKg: above?.kg || 0 });
  }));

  const needMullion = Math.max(...mullions.map(m => m.IxReq));
  const needTransomX = Math.max(...transoms.map(t => t.IxReq));
  const needTransomY = Math.max(...transoms.map(t => t.IyReq));
  const autoMullion = smallest(p => p.Ix >= needMullion);
  const mullion = S.mullion === 'auto' ? (autoMullion || PROFILES.at(-1)) : getProfile(S.mullion);
  const autoTransom = smallest(p => p.Ix >= needTransomX && p.Iy >= needTransomY);
  let transom = S.transom === 'auto' ? (autoTransom || PROFILES.at(-1)) : getProfile(S.transom);
  // Transoms are never deeper than the mullions they connect to.
  const transomCapped = S.transom === 'auto' && transom.depth > mullion.depth;
  if (transomCapped) transom = mullion;

  const components = glazingComponents(glazing.thickness, S.strip);
  const Uf = frameUf(glazing.thickness, mullion.depth);
  const model = { S, glazing, xs, ys, W, H, panes, mullions, transoms, span, mullion, transom, autoMullion, autoTransom, transomCapped,
    need: { mullion: needMullion, transomX: needTransomX, transomY: needTransomY }, components, Uf,
    thermal: thermal(S, glazing, panes, W, H, Uf) };
  model.bom = billOfMaterials(model);
  return model;
}

// Ucw per EN ISO 12631 (component method), using visible areas.
function thermal(S, glazing, panes, W, H, Uf) {
  if (Uf == null) return null;
  const total = (W + SYSTEM.faceWidth) * (H + SYSTEM.faceWidth) / 1e6;
  let AgUg = 0, ApUp = 0, Ag = 0, Ap = 0, lg = 0;
  for (const p of panes) {
    if (p.spandrel) { Ap += p.visibleArea; ApUp += p.visibleArea * SPANDREL.Up; }
    else {
      Ag += p.visibleArea; AgUg += p.visibleArea * glazing.Ug;
      lg += 2 * ((p.x1 - p.x0 - SYSTEM.faceWidth) + (p.y1 - p.y0 - SYSTEM.faceWidth)) / 1000;
    }
  }
  const Af = total - Ag - Ap;
  const Ucw = (AgUg + ApUp + Af * Uf + lg * glazing.psi) / total;
  return { Ucw, Uf, Ug: glazing.Ug, Up: SPANDREL.Up, psi: glazing.psi, Ag, Ap, Af, lg, total };
}

// Cut pieces into 6 m bars (first fit decreasing, saw kerf between pieces).
export function cutPlan(pieces, bar = SYSTEM.barLength) {
  const bars = [];
  [...pieces].sort((a, b) => b - a).forEach(piece => {
    if (piece > bar) throw new Error(`Piece ${piece} mm is longer than a ${bar} mm bar.`);
    const fit = bars.find(b => b.free >= piece + (b.cuts.length ? SAW_KERF : 0));
    if (fit) { fit.free -= piece + (fit.cuts.length ? SAW_KERF : 0); fit.cuts.push(piece); }
    else bars.push({ free: bar - piece, cuts: [piece] });
  });
  const used = pieces.reduce((s, p) => s + p, 0);
  return { bars: bars.length, cuts: bars.map(b => b.cuts), waste: bars.length ? 1 - used / (bars.length * bar) : 0 };
}

// Split a continuous mullion into pieces ≤ bar length at anchor (floor) lines.
export function mullionPieces(length, anchorSpacing, bar = SYSTEM.barLength) {
  if (length <= bar) return [length];
  const perPiece = Math.max(1, Math.floor(bar / anchorSpacing)) * anchorSpacing;
  const step = perPiece <= bar ? perPiece : bar;
  const pieces = [];
  let rest = length;
  while (rest > bar) { pieces.push(step); rest -= step; }
  pieces.push(rest);
  return pieces;
}

const sum = values => values.reduce((s, v) => s + v, 0);

// Bill of materials. Names and notes are i18n keys with variables; article
// numbers are the catalogue's.
export function billOfMaterials(model) {
  const { S, mullion, transom, components, glazing, panes, mullions, transoms } = model;
  const items = [];
  const add = (group, id, key, vars, qty, unit, note = null, noteVars = {}) => items.push({ group, id, key, vars, qty, unit, note, noteVars });
  const mullionCuts = mullions.flatMap(m => mullionPieces(m.length, S.anchorSpacing));
  const transomCuts = transoms.map(t => t.length);
  const shared = mullion.id === transom.id;
  const mullionM = sum(mullionCuts) / 1000, transomM = sum(transomCuts) / 1000;
  const splices = mullionCuts.length - mullions.length;
  const plans = {};
  if (shared) {
    plans.shared = cutPlan([...mullionCuts, ...transomCuts]);
    add('profiles', mullion.id, 'bom.profileBoth', { depth: mullion.depth }, plans.shared.bars, 'unit.bars',
      'bom.cutNote', { m: fmt(mullionM + transomM, 1), waste: fmt(plans.shared.waste * 100, 1) });
  } else {
    plans.mullion = cutPlan(mullionCuts); plans.transom = cutPlan(transomCuts);
    add('profiles', mullion.id, 'bom.profileMullion', { depth: mullion.depth }, plans.mullion.bars, 'unit.bars',
      'bom.cutNote', { m: fmt(mullionM, 1), waste: fmt(plans.mullion.waste * 100, 1) });
    add('profiles', transom.id, 'bom.profileTransom', { depth: transom.depth }, plans.transom.bars, 'unit.bars',
      'bom.cutNote', { m: fmt(transomM, 1), waste: fmt(plans.transom.waste * 100, 1) });
  }
  add('connectors', transom.connector, 'bom.connector', { depth: transom.depth }, 2 * transoms.length, 'unit.pcs', 'bom.perTransom2');
  if (splices > 0) add('connectors', '445001', 'bom.jointProfile', { length: mullion.jointLength }, splices, 'unit.pcs', 'bom.spliceNote');

  const stripLength = mullionM + transomM;
  const strip = PRESSURE_STRIPS[S.strip];
  add('glazing', strip.id, `strip.${strip.id}`, {}, Math.ceil(stripLength / 6), 'unit.bars', 'bom.metres', { m: fmt(stripLength, 1) });
  if (strip.cover) {
    add('glazing', S.coverMullion, 'bom.coverMullion', { depth: COVER_PLATES[S.coverMullion].depth }, Math.ceil(mullionM / 6), 'unit.bars', 'bom.metres', { m: fmt(mullionM, 1) });
    add('glazing', S.coverTransom, 'bom.coverTransom', { depth: COVER_PLATES[S.coverTransom].depth }, Math.ceil(transomM / 6), 'unit.bars', 'bom.metres', { m: fmt(transomM, 1) });
  }
  if (components) {
    const screws = sum([...mullionCuts, ...transomCuts].map(l => Math.ceil(l / SCREW_SPACING) + 1));
    add('glazing', components.screw.id, 'bom.screw', { length: components.screw.length }, screws, 'unit.pcs', 'bom.screwNote', { spacing: SCREW_SPACING });
    if (components.insulator) add('glazing', components.insulator, 'bom.insulator', { name: INSULATORS[components.insulator] }, Math.ceil(stripLength / 6), 'unit.bars', 'bom.metres', { m: fmt(stripLength, 1) });
    add('glazing', GASKETS.outside.id, 'bom.gasketOutside', {}, Math.ceil(2 * stripLength / GASKETS.outside.roll), 'unit.rolls', 'bom.metres', { m: fmt(2 * stripLength, 1) });
    add('glazing', GASKETS.inside.id, 'bom.gasketInside', {}, Math.ceil(2 * stripLength / GASKETS.inside.roll), 'unit.rolls', 'bom.metres', { m: fmt(2 * stripLength, 1) });
    add('glazing', components.glassSupport, 'bom.glassSupport', { name: GLASS_SUPPORTS[components.glassSupport] }, 2 * panes.length, 'unit.pcs', 'bom.perPane2');
    if (components.drainage) add('glazing', components.drainage, 'bom.drainage', {}, transoms.filter(t => t.line < S.heights.length).length, 'unit.sets', 'bom.perTransom1');
  }
  const groups = new Map();
  panes.forEach(p => {
    const key = `${p.spandrel ? 'S' : 'G'}:${p.width}x${p.height}`;
    const g = groups.get(key) || { spandrel: p.spandrel, width: p.width, height: p.height, count: 0, kg: p.kg };
    g.count++; groups.set(key, g);
  });
  [...groups.values()].forEach(g => add('infill', g.spandrel ? 'PANEL' : 'IGU', g.spandrel ? 'bom.panel' : 'bom.glass',
    { build: glazing.label, t: glazing.thickness }, g.count, 'unit.pcs', 'bom.paneNote',
    { w: g.width, h: g.height, area: fmt(g.width * g.height / 1e6, 2), kg: fmt(g.kg) }));

  const aluminiumKg = mullionM * estimatedKgPerM(mullion) + transomM * estimatedKgPerM(transom);
  const coatingInside = (mullionM * mullion.coat[0] + transomM * transom.coat[0]) / 1000;
  const coatingOutside = strip.cover ? (mullionM * COVER_PLATES[S.coverMullion].coat[0] + transomM * COVER_PLATES[S.coverTransom].coat[0]) / 1000 : null;
  return {
    items, plans, mullionCuts, transomCuts,
    totals: {
      mullionM, transomM, aluminiumKg, coatingInside, coatingOutside, splices,
      glassArea: sum(panes.filter(p => !p.spandrel).map(p => p.width * p.height)) / 1e6,
      spandrelArea: sum(panes.filter(p => p.spandrel).map(p => p.width * p.height)) / 1e6,
      infillKg: sum(panes.map(p => p.kg)),
    },
  };
}

export const fmt = (x, d = 0) => Number(x).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });

// Static, glazing and handling checks.
export function checks(model) {
  const { S, mullion, transom, mullions, transoms, panes, components, glazing, need, autoMullion, autoTransom, transomCapped, span } = model;
  const out = [];
  const push = (lv, key, vars = {}) => out.push({ lv, key, vars });
  const ratio = (req, have) => req / have;
  const uM = ratio(need.mullion, mullion.Ix);
  push(uM <= 1 ? 'ok' : 'err', 'check.mullionWind', { profile: mullion.id, req: fmt(need.mullion, 1), have: fmt(mullion.Ix, 1), pct: fmt(uM * 100), span: fmt(span), q: fmt(S.windLoad, 2) });
  const uTx = ratio(need.transomX, transom.Ix), uTy = ratio(need.transomY, transom.Iy);
  push(uTx <= 1 ? 'ok' : 'err', 'check.transomWind', { profile: transom.id, req: fmt(need.transomX, 1), have: fmt(transom.Ix, 1), pct: fmt(uTx * 100) });
  push(uTy <= 1 ? 'ok' : 'err', 'check.transomDead', { profile: transom.id, req: fmt(need.transomY, 1), have: fmt(transom.Iy, 1), pct: fmt(uTy * 100) });
  if (S.mullion === 'auto' && !autoMullion) push('err', 'check.noMullion');
  if (S.transom === 'auto' && !autoTransom) push('err', 'check.noTransom');
  if (transomCapped) push('warn', 'check.transomCapped');
  if (transom.depth > mullion.depth) push('warn', 'check.transomDeeper');
  const heaviest = Math.max(...panes.map(p => p.kg));
  push(heaviest <= SYSTEM.maxPaneKg ? 'ok' : 'err', 'check.paneWeight', { kg: fmt(heaviest), max: SYSTEM.maxPaneKg });
  if (!components) push('err', 'check.glazingTable', { t: glazing.thickness });
  else push('ok', 'check.glazing', { t: glazing.thickness, screw: components.screw.id, support: components.glassSupport });
  if (glazing.thickness > SYSTEM.maxInfill) push('err', 'check.maxInfill', { max: SYSTEM.maxInfill });
  if (Math.max(...mullions.map(m => m.length)) > SYSTEM.barLength) push('warn', 'check.splice', { bar: SYSTEM.barLength / 1000, span: fmt(S.anchorSpacing) });
  if (model.Uf == null) push('warn', 'check.noUf');
  return out;
}
