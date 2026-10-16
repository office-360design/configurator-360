// Cortizo systems (TP 52, SG 52, TPH 52, TPV 52, ST 52, SST 52, Skylight – Veranda)
// in the curtain wall configurator. The engine and the catalogue data live
// unchanged in ../cortizo (see cortizo/CLAUDE.md); this module only maps the
// configurator state to an engine project and the engine result to the model
// the 3D scene and the drawings use.
import { createEngine } from '../cortizo/src/engine.js?v=cortizo-2';
import { cortizoNodeParts } from './sections.js?v=cw-6';

export const CORTIZO_DATA_VERSION = 'cortizo-2';
const CATALOG = ['accessories', 'glass_supports', 'glazing_tables', 'mullions', 'profiles', 'transoms', 'ucw'];
const RULES = ['common', 'tp52', 'sg52', 'tph52', 'tpv52', 'st52', 'sst52', 'skylight'];
export const RULE_KEY = Object.freeze({ TP52: 'tp52', SG52: 'sg52', TPH52: 'tph52', TPV52: 'tpv52', ST52: 'st52', SST52: 'sst52', SKY: 'skylight' });
export const FACE_WIDTH = 52; // all Cortizo systems are 52 mm series
const CLIP_SYSTEMS = ['SG52', 'TPH52', 'TPV52'];
const FRAME_SYSTEMS = ['ST52', 'SST52'];
const PANEL_SYSTEMS = ['TP52', 'TPH52', 'TPV52'];

// Starting glass per system: the projects in cortizo/tests/examples.js.
export const SYSTEM_DEFAULTS = Object.freeze({
  TP52: { variant: 'Standard – nivel 1', totalMm: 32, panesMm: 12, cap: 'COR-9142' },
  SG52: { variant: 'Standard siliconat – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16 },
  TPH52: { variant: 'Standard – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, cap: 'COR-9142' },
  TPV52: { variant: 'Standard', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, cap: 'COR-9142' },
  ST52: { variant: 'Standard', totalMm: 28, panesMm: 12, clipFix: 'injecție' },
  SST52: { variant: 'Standard', totalMm: 28, panesMm: 12, clipFix: 'injecție' },
  SKY: { variant: 'Acoperiș', totalMm: 32, panesMm: 12, cap: 'COR-9142', skyTransomJoint: 'silicone', snowKPa: 1.6, slopeDeg: 15 },
});

export const DEFAULT_CORTIZO = Object.freeze({
  system: 'TP52', ug: 1.0, allowReinforcement: false, barMm: 6500, kerfMm: 5, drySilicone: 'SG-550', fields: [],
  ...SYSTEM_DEFAULTS.TP52,
});

export async function loadCortizoData(base = new URL('../cortizo/data/', import.meta.url), fetchImpl = fetch) {
  const read = async (dir, name) => {
    const response = await fetchImpl(new URL(`${dir}/${name}.json?v=${CORTIZO_DATA_VERSION}`, base));
    if (!response.ok) throw new Error(`Cortizo data ${dir}/${name}: HTTP ${response.status}`);
    return [name, await response.json()];
  };
  const [catalog, rules] = await Promise.all([
    Promise.all(CATALOG.map(name => read('catalog', name))),
    Promise.all(RULES.map(name => read('rules', name))),
  ]);
  return { catalog: Object.fromEntries(catalog), rules: Object.fromEntries(rules) };
}

export function createCortizo(data) {
  const engine = createEngine(data);
  return { data, engine, rules: data.rules };
}

export const usesInnerPane = system => CLIP_SYSTEMS.includes(system);
export const isClipSystem = system => CLIP_SYSTEMS.includes(system);
export const isFrameSystem = system => FRAME_SYSTEMS.includes(system);
export const supportsPanel = system => PANEL_SYSTEMS.includes(system);

// Field types a cell can cycle through (elevation click), per system.
export function fieldTypes(cortizo, system) {
  const R = cortizo.rules[RULE_KEY[system]];
  const types = ['glass'];
  if (R.awning_window || R.roof_window) types.push('window');
  if (supportsPanel(system)) types.push('panel');
  return types;
}

// Keep variant, inner pane and thickness on rows the catalogue tables have.
export function normalizeCortizo(input, cortizo) {
  const system = RULE_KEY[input?.system] ? input.system : DEFAULT_CORTIZO.system;
  const changedSystem = input?.system !== system;
  const C = { ...DEFAULT_CORTIZO, ...SYSTEM_DEFAULTS[system], ...(changedSystem ? {} : input), system };
  const options = cortizo.engine.options(system);
  if (!options.some(o => o.variant === C.variant)) C.variant = options[0].variant;
  const panes = options.find(o => o.variant === C.variant).panes;
  if (usesInnerPane(system)) {
    if (!panes.some(p => p.inner === C.innerPane)) C.innerPane = panes[0].inner;
  } else delete C.innerPane;
  const thicknesses = (panes.find(p => p.inner === (usesInnerPane(system) ? C.innerPane : '')) || panes[0]).thicknesses;
  if (!thicknesses.includes(Number(C.totalMm))) C.totalMm = thicknesses.includes(32) ? 32 : thicknesses[0];
  C.totalMm = Number(C.totalMm);
  C.panesMm = Math.min(Math.max(4, Number(C.panesMm) || 12), C.totalMm);
  C.ug = Math.min(Math.max(0.3, Number(C.ug) || 1), 3);
  if (isClipSystem(system)) {
    C.outerPaneMm = Math.min(Math.max(4, Number(C.outerPaneMm) || 8), C.panesMm);
    C.chamberMm = [16, 18, 20].includes(Number(C.chamberMm)) ? Number(C.chamberMm) : 16;
  } else { delete C.outerPaneMm; delete C.chamberMm; }
  const R = cortizo.rules[RULE_KEY[system]];
  const caps = (R.caps || []).filter(c => c.code).map(c => c.code);
  if (caps.length) { if (!caps.includes(C.cap)) C.cap = caps[0]; } else delete C.cap;
  const cleats = R.glass_frame?.cleats?.map(c => c.option) || [];
  if (cleats.length) { if (!cleats.includes(C.clipFix)) C.clipFix = cleats[0]; } else delete C.clipFix;
  if (system === 'SKY') {
    C.skyTransomJoint = C.skyTransomJoint === 'inclined_cover' ? 'inclined_cover' : 'silicone';
    C.snowKPa = Math.min(Math.max(0, Number(C.snowKPa ?? 1.6)), 10);
    C.slopeDeg = Math.min(Math.max(1, Number(C.slopeDeg) || 15), 60);
  } else { delete C.skyTransomJoint; delete C.snowKPa; delete C.slopeDeg; }
  C.allowReinforcement = Boolean(C.allowReinforcement);
  C.barMm = Math.min(Math.max(3000, Math.round(Number(C.barMm) || 6500)), 12000);
  C.kerfMm = Math.min(Math.max(0, Number(C.kerfMm ?? 5)), 20);
  C.drySilicone = ['SG-500', 'SG-550', 'IG-25 HM Plus'].includes(C.drySilicone) ? C.drySilicone : 'SG-550';
  const types = fieldTypes(cortizo, system);
  C.fields = (Array.isArray(C.fields) ? C.fields : []).filter(f => Number.isInteger(f?.row) && Number.isInteger(f?.col) && types.includes(f.type));
  return C;
}

// The configurator lists rows bottom-up (like the window configurator); the
// engine expects them top-down (for the skylight: from the ridge to the eaves).
export function toProject(S, C) {
  const rows = S.heights.length;
  const topDown = i => rows - 1 - i;
  const fields = [];
  S.rowTypes.forEach((type, row) => {
    if (type === 'spandrel' && supportsPanel(C.system)) S.widths.forEach((_, col) => fields.push({ row: topDown(row), col, type: 'panel' }));
  });
  C.fields.filter(f => f.row < rows && f.col < S.widths.length).forEach(f => {
    const at = fields.findIndex(x => x.row === topDown(f.row) && x.col === f.col);
    if (at >= 0) fields.splice(at, 1);
    fields.push({ row: topDown(f.row), col: f.col, type: f.type });
  });
  const glass = { variant: C.variant, totalMm: C.totalMm, panesMm: C.panesMm, ug: C.ug };
  if (usesInnerPane(C.system)) Object.assign(glass, { innerPane: C.innerPane, outerPaneMm: C.outerPaneMm, chamberMm: C.chamberMm });
  const options = { allowReinforcement: C.allowReinforcement, barMm: C.barMm, kerfMm: C.kerfMm, drySilicone: C.drySilicone };
  if (C.cap) options.cap = C.cap;
  if (C.clipFix) options.clipFix = C.clipFix;
  if (C.skyTransomJoint) options.skyTransomJoint = C.skyTransomJoint;
  return {
    system: C.system,
    grid: { widths: [...S.widths], heights: [...S.heights].reverse(), anchorSpacing: S.anchorSpacing },
    fields,
    loads: { windKPa: S.windLoad, ...(C.system === 'SKY' ? { snowKPa: C.snowKPa, slopeDeg: C.slopeDeg } : {}) },
    glass,
    options,
  };
}

const cumulative = values => values.reduce((acc, v) => [...acc, acc.at(-1) + v], [0]);

// Engine result → the model the scene and drawings read (xs/ys bottom-up,
// panes, mullions, transoms, mullion/transom, member sections).
export function cortizoModel(S, cortizo) {
  const C = normalizeCortizo(S.cortizo, cortizo);
  const project = toProject(S, C);
  const R = cortizo.engine.compute(project);
  const xs = cumulative(S.widths), ys = cumulative(S.heights);
  const W = xs.at(-1), H = ys.at(-1), rows = S.heights.length, half = FACE_WIDTH / 2;
  const glazing = { id: 'cortizo', label: [C.variant, C.innerPane].filter(Boolean).join(' · '), thickness: C.totalMm, glass: C.panesMm, Ug: C.ug };
  const panes = R.fields.map(f => {
    const row = rows - 1 - f.i;
    return { bay: f.j, row, x0: xs[f.j], x1: xs[f.j + 1], y0: ys[row], y1: ys[row + 1], width: f.gw, height: f.gh,
      spandrel: f.type === 'panel', window: f.type === 'window', kg: f.kg, status: f.status, label: f.label, notes: f.notes, field: f };
  });
  const depth = R.mullion?.depth || 0;
  const mullion = { id: R.mullion?.code || '—', depth: depth || 100 };
  const transom = { id: R.transom?.code || '—', depth: depth || 100 };
  const mullions = xs.map((x, index) => ({ index, x, length: H, axis: R.axes[index] }));
  const transoms = [];
  ys.forEach((y, line) => S.widths.forEach((w, bay) => transoms.push({ line, bay, y, x0: xs[bay] + half, x1: xs[bay + 1] - half, span: w, length: w - FACE_WIDTH })));
  return {
    S, C, project, result: R, glazing, xs, ys, W, H, panes, mullions, transoms, mullion, transom,
    edges: R.system.edges, faceWidth: FACE_WIDTH, slopeDeg: C.system === 'SKY' ? C.slopeDeg : null,
    // Section of a member by the fixing on its direction (v: mullions, h: transoms).
    section: role => cortizoNodeParts({ depth: depth || 100, thickness: C.totalMm, edge: R.system.edges[role === 'mullion' ? 'v' : 'h'] }),
  };
}

// Plain-text cutting and accessory list (tab separated, for the clipboard).
export function cortizoListText(model, qty = 1) {
  const R = model.result;
  const head = `Cortizo ${R.system.name} · ${model.W} × ${model.H} mm × ${qty}`;
  const cuts = R.cuts.map(c => ['profil', c.code, c.desc, `${(c.m * qty).toFixed(2)} m`, `${c.bars * qty} bare`, c.kg == null ? '' : `${(c.kg * qty).toFixed(1)} kg`].join('\t'));
  const accessories = R.accessories.map(a => ['accesoriu', a.code, a.desc, a.unit === 'm' ? `${(a.qty * qty).toFixed(1)} m` : `${a.qty * qty} buc`].join('\t'));
  return [head, ...cuts, ...accessories].join('\n');
}
