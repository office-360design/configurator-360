import { readShareState } from '../../shared-ui/src/shareState.js?v=platform-18';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';
import { COVER_PLATES, GLASS_THICKNESSES, GLAZING_PRESETS, PRESSURE_STRIPS, PROFILES } from './catalog.js?v=cw-3';
import { DEFAULT_STATE, FINISHES, LIMITS, PRESETS, checks, facadeModel, fmt, normalizeState } from './facade.js?v=cw-3';
import { elevationSvg, nodeSvg } from './drawings.js?v=cw-3';
import { applyTranslations, translator } from './i18n.js?v=cw-3';
import { FacadeScene } from './scene.js?v=cw-3';
import { createCortizo, cortizoListText, cortizoModel, fieldTypes, loadCortizoData, normalizeCortizo } from './cortizo.js?v=cw-3';
import * as czUi from './cortizoUi.js?v=cw-3';

await requireTenantConfiguratorAccess('curtainwall');

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shared = await readShareState({ productType: 'curtainwall' });
let S = normalizeState(shared && typeof shared === 'object' ? shared : DEFAULT_STATE);
let M = null;
let locale = window.CURTAIN_WALL_PREFERENCES?.locale || 'ro-RO';
let t = translator(locale);
let tab = 'elevation';
const view = new FacadeScene($('#canvasHost'));
// Cortizo catalogue (≈1.4 MB of JSON) is loaded the first time it is needed.
let CZ = null, czLoading = null;
function ensureCortizo() {
  czLoading ||= loadCortizoData().then(data => { CZ = createCortizo(data); return CZ; }).catch(error => {
    console.error(error);
    czLoading = null;
    $('#cortizoLoading').hidden = false;
    $('#cortizoLoading').textContent = t('cz.loadFailed');
    return null;
  });
  return czLoading;
}
const isCortizo = () => S.brand === 'cortizo' && CZ;

function options(select, list, value) {
  select.innerHTML = list.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  select.value = String(value);
}

function renderTracks() {
  $('#bayList').innerHTML = S.widths.map((w, i) => `<div class="track bay">
      <span>${esc(t('grid.bay', { n: i + 1 }))}</span>
      <input type="number" inputmode="numeric" min="${LIMITS.width[0]}" max="${LIMITS.width[1]}" step="10" value="${w}" data-bay="${i}" aria-label="${esc(t('grid.bay', { n: i + 1 }))} (mm)">
      <button type="button" class="mini" data-remove-bay="${i}" aria-label="${esc(t('grid.remove'))}" ${S.widths.length > 1 ? '' : 'disabled'}>×</button></div>`).join('');
  $('#rowList').innerHTML = S.heights.map((h, i) => `<div class="track">
      <span>${esc(t('grid.row', { n: i + 1 }))}</span>
      <input type="number" inputmode="numeric" min="${LIMITS.height[0]}" max="${LIMITS.height[1]}" step="10" value="${h}" data-row="${i}" aria-label="${esc(t('grid.row', { n: i + 1 }))} (mm)">
      <select data-row-type="${i}" aria-label="${esc(t('grid.row', { n: i + 1 }))}">
        <option value="vision" ${S.rowTypes[i] === 'vision' ? 'selected' : ''}>${esc(t('grid.vision'))}</option>
        <option value="spandrel" ${S.rowTypes[i] === 'spandrel' ? 'selected' : ''}>${esc(t('grid.spandrel'))}</option>
      </select>
      <button type="button" class="mini" data-remove-row="${i}" aria-label="${esc(t('grid.remove'))}" ${S.heights.length > 1 ? '' : 'disabled'}>×</button></div>`).join('');
}

function syncControls() {
  const profileOptions = [['auto', t('profiles.auto')], ...PROFILES.map(p => [p.id, `${p.id} · ${p.depth} mm · Ix ${fmt(p.Ix, 1)}`])];
  options($('#sel-mullion'), profileOptions, S.mullion);
  options($('#sel-transom'), profileOptions, S.transom);
  options($('#sel-glazing'), [...GLAZING_PRESETS.map(p => [p.id, `${p.thickness} mm · ${p.label} · Ug ${fmt(p.Ug, 1)}`]), ['custom', t('glazing.custom')]], S.glazing);
  options($('#sel-thickness'), GLASS_THICKNESSES.map(v => [v, `${v} mm`]), S.customThickness);
  options($('#sel-strip'), Object.keys(PRESSURE_STRIPS).map(id => [id, `${id} · ${t(`strip.${id}`)}`]), S.strip);
  const covers = Object.values(COVER_PLATES).map(c => [c.id, `${c.id} · ${c.depth} mm`]);
  options($('#sel-coverMullion'), covers, S.coverMullion);
  options($('#sel-coverTransom'), covers, S.coverTransom);
  $('#customGlazing').hidden = S.glazing !== 'custom';
  $('#coverFields').hidden = !PRESSURE_STRIPS[S.strip].cover;
  $('#tintChips').innerHTML = ['clear', 'neutral', 'blue', 'bronze'].map(id => `<button type="button" class="chip" data-tint="${id}" aria-pressed="${S.glassTint === id}">${esc(t(`tint.${id}`))}</button>`).join('');
  const swatches = (key) => FINISHES.map(f => `<button type="button" class="swatch" style="background:${f.color}" data-finish="${key}" data-id="${f.id}" title="${esc(f.label)}" aria-label="${esc(f.label)}" aria-pressed="${S[key] === f.id}"></button>`).join('');
  $('#outsideSwatches').innerHTML = swatches('finishOutside');
  $('#insideSwatches').innerHTML = swatches('finishInside');
  $('#insideFinish').hidden = S.sameFinish;
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = Boolean(S[k]);
    else if (el.tagName !== 'SELECT' && document.activeElement !== el) el.value = S[k];
  });
  $$('[data-out]').forEach(out => {
    const k = out.dataset.out;
    out.value = k === 'windLoad' ? `${fmt(S.windLoad, 2)} kN/m²` : k === 'qty' ? `${S.qty}` : `${fmt(S[k])} mm`;
  });
  renderTracks();
  syncBrand();
}

function syncBrand() {
  const cortizo = Boolean(isCortizo());
  $$('[data-brand]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.brand === S.brand)));
  $('#brandName').textContent = cortizo ? CZ.engine.systems.find(s => s.id === S.cortizo.system).name : S.brand === 'cortizo' ? 'Cortizo' : 'GCW 050';
  $('#cortizoLoading').hidden = !(S.brand === 'cortizo' && !CZ);
  for (const [id, show] of [['#cortizoSystem', cortizo], ['#cortizoProfiles', cortizo], ['#cortizoGlazing', cortizo], ['#gutmannProfiles', !cortizo], ['#gutmannGlazing', !cortizo]]) $(id).hidden = !show;
  $$('[data-brand-only]').forEach(b => { b.hidden = b.dataset.brandOnly !== (cortizo ? 'cortizo' : 'gutmann'); });
  if ($(`[data-tab="${tab}"]`)?.hidden) selectTab('elevation');
  $('#sourceNote').textContent = t(cortizo ? 'cz.source' : 'order.source');
  if (!cortizo) return;
  $('#cortizoSystem').innerHTML = czUi.systemControls(t, CZ, S.cortizo);
  $('#cortizoGlazing').innerHTML = czUi.glazingControls(t, CZ, S.cortizo);
}

function selectTab(next) {
  tab = next;
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
}

function bomTable(m) {
  const groups = ['profiles', 'connectors', 'glazing', 'infill'];
  const rows = groups.flatMap(g => {
    const items = m.bom.items.filter(i => i.group === g);
    if (!items.length) return [];
    return [`<tr class="group"><td colspan="4">${esc(t(`bom.group.${g}`))}</td></tr>`,
      ...items.map(i => `<tr><td class="code">${esc(i.id)}</td><td>${esc(t(i.key, i.vars))}</td><td class="n">${fmt(i.qty * S.qty)} ${esc(t(i.unit))}</td><td>${i.note ? esc(t(i.note, i.noteVars)) : ''}</td></tr>`)];
  }).join('');
  const T = m.bom.totals;
  const tiles = [
    [t('totals.aluminium'), `${fmt(T.aluminiumKg * S.qty)} kg`],
    [t('totals.coatingIn'), `${fmt(T.coatingInside * S.qty, 1)} m²`],
    ...(T.coatingOutside != null ? [[t('totals.coatingOut'), `${fmt(T.coatingOutside * S.qty, 1)} m²`]] : []),
    [t('totals.glass'), `${fmt(T.glassArea * S.qty, 2)} m²`],
    [t('totals.spandrel'), `${fmt(T.spandrelArea * S.qty, 2)} m²`],
    [t('totals.infillKg'), `${fmt(T.infillKg * S.qty)} kg`],
  ];
  return `<div class="bom-head"><strong>${esc(S.qty > 1 ? t('totals.order', { qty: S.qty }) : t('tab.bom'))}</strong><button type="button" class="copy" id="copyBom">${esc(t('bom.copy'))}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('bom.article'))}</th><th>${esc(t('bom.item'))}</th><th class="n">${esc(t('bom.qty'))}</th><th>${esc(t('bom.details'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="totals">${tiles.map(([a, b]) => `<article><span>${esc(a)}</span><strong>${esc(b)}</strong></article>`).join('')}</div>
    <p class="note">${esc(t('totals.note'))}</p>`;
}

function checksPanel(m) {
  const list = checks(m).map(c => `<li><span class="pill ${c.lv}">${c.lv === 'ok' ? 'OK' : c.lv === 'warn' ? '!' : '×'}</span><span>${esc(t(c.key, c.vars))}</span></li>`).join('');
  const th = m.thermal;
  const perf = th ? `<div class="big">${fmt(th.Ucw, 2)} <small>W/m²K</small></div>
      <table><tbody>
        <tr><td>${esc(t('perf.uf'))}</td><td class="n">${fmt(th.Uf, 2)}</td></tr>
        <tr><td>${esc(t('perf.ug'))}</td><td class="n">${fmt(th.Ug, 1)}</td></tr>
        <tr><td>${esc(t('perf.up'))}</td><td class="n">${fmt(th.Up, 2)}</td></tr>
        <tr><td>${esc(t('perf.psi'))}</td><td class="n">${fmt(th.psi, 2)}</td></tr>
      </tbody></table>` : `<div class="big">—</div>`;
  return `<div class="checks-grid"><ul class="checks">${list}</ul>
    <div class="perf"><h3>${esc(t('perf.title'))} · ${esc(t('perf.ucw'))}</h3>${perf}<p class="note">${esc(t('perf.note'))}</p></div></div>`;
}

function renderCortizo(m) {
  const R = m.result, ok = R.fields.filter(f => f.status === 'ok').length;
  $('#tag').innerHTML = `<div class="mark">${esc(t('cz.tag1', { system: R.system.name, w: fmt(m.W), h: fmt(m.H), bays: S.widths.length, rows: S.heights.length }))}</div>
    ${esc(t('cz.tag2', { mullion: m.mullion.id, transom: m.transom.id, t: m.glazing.thickness }))}<br>
    ${esc(t('cz.tag3', { ok, total: R.fields.length, kg: fmt(R.totals.kgAluminium * S.qty) }))}${R.ucw ? ` · Ucw ${fmt(R.ucw.ucw, 1)} W/m²K` : ''}`;
  $('#gridTotal').textContent = t('grid.total', { w: fmt(m.W), h: fmt(m.H) });
  $('#cortizoProfiles').innerHTML = czUi.profileControls(t, CZ, S.cortizo, m);
  $('#elevation').innerHTML = czUi.elevationSvg(m, t);
  $('#node').innerHTML = nodeSvg(m, t);
  $('#bom').innerHTML = czUi.bomPanel(m, t, S.qty);
  $('#checks').innerHTML = czUi.checksPanel(m, t, CZ);
  $('#systems').innerHTML = czUi.systemsPanel(t, CZ);
  czUi.mapPanel(t).then(html => { $('#map').innerHTML = html; });
  $('#copyBom').addEventListener('click', copyBom);
  renderExplodeLegend(m);
}

function render(m) {
  if (m.brand === 'cortizo') return renderCortizo(m);
  const area = (m.W + 50) * (m.H + 50) / 1e6;
  $('#tag').innerHTML = `<div class="mark">${esc(t('tag.line1', { w: fmt(m.W), h: fmt(m.H), bays: S.widths.length, rows: S.heights.length }))}</div>
    ${esc(t('tag.line2', { mullion: m.mullion.id, transom: m.transom.id, t: m.glazing.thickness }))}<br>
    ${esc(m.thermal ? t('tag.line3', { ucw: fmt(m.thermal.Ucw, 2), area: fmt(area * S.qty, 1) }) : t('tag.noUcw'))}`;
  $('#gridTotal').textContent = t('grid.total', { w: fmt(m.W), h: fmt(m.H) });
  $('#autoPick').textContent = t('profiles.autoPick', { mullion: m.mullion.id, md: m.mullion.depth, transom: m.transom.id, td: m.transom.depth });
  $('#elevation').innerHTML = elevationSvg(m, t);
  $('#node').innerHTML = nodeSvg(m, t);
  $('#bom').innerHTML = bomTable(m);
  $('#checks').innerHTML = checksPanel(m);
  $('#copyBom').addEventListener('click', copyBom);
  renderExplodeLegend(m);
}

// Layers from the outside in, with the catalogue article of each part.
function renderExplodeLegend(m) {
  const outside = FINISHES.find(f => f.id === S.finishOutside).color, inside = FINISHES.find(f => f.id === S.finishInside).color;
  if (m.brand === 'cortizo') {
    const e = m.edges, roles = m.result.fields.find(f => f.type !== 'window')?.roles || {};
    const pressure = e.v === 'pressure' || e.h === 'pressure', sealed = e.v !== 'pressure' || e.h !== 'pressure';
    const layers = [
      ...(pressure ? [['layer.cover', m.C.cap || '—', outside], ['layer.strip', 'COR-9914', outside], ['layer.gasketOuter', roles.pressureGasket || '999000', '#1d1f21'], ['layer.insulator', roles.rpt || 'RPT', '#d9b77c']] : []),
      ...(sealed ? [['layer.joint', roles.backer || roles.dryGasket || 'SILICON', '#1d1f21']] : []),
      ...(m.panes.some(p => p.window) ? [['layer.sash', m.panes.find(p => p.window).field.win.profiles.map(p => p.code).join(' / '), outside]] : []),
      ['layer.glass', `${m.glazing.thickness} mm · ${m.glazing.label}`, '#a9c6d3'],
      ...(e.v === 'frame' ? [['layer.frame', m.C.system === 'ST52' ? 'COR-9982' : 'COR-9983', inside]] : []),
      ['layer.gasketInner', roles.mullionGasket || '—', '#1d1f21'],
      ['layer.transom', `${m.transom.id} · ${m.transom.depth} mm`, inside],
      ['layer.mullion', `${m.mullion.id} · ${m.mullion.depth} mm`, inside],
    ];
    $('#explodeLegend').innerHTML = layers.map(([key, code, color]) => `<li><i style="background:${color}"></i><span>${esc(t(key))}</span><b>${esc(code)}</b></li>`).join('');
    return;
  }
  const strip = PRESSURE_STRIPS[S.strip];
  const layers = [
    ['layer.cover', strip.cover ? `${S.coverMullion} / ${S.coverTransom}` : S.strip, outside],
    ...(strip.cover ? [['layer.strip', S.strip, outside]] : []),
    ['layer.gasketOuter', '760006', '#1d1f21'],
    ...(m.components?.insulator ? [['layer.insulator', m.components.insulator, '#d9b77c']] : []),
    ['layer.glass', `${m.glazing.thickness} mm · ${m.glazing.label}`, '#a9c6d3'],
    ['layer.gasketInner', '760110', '#1d1f21'],
    ['layer.transom', `${m.transom.id} · ${m.transom.depth} mm`, inside],
    ['layer.mullion', `${m.mullion.id} · ${m.mullion.depth} mm`, inside],
  ];
  $('#explodeLegend').innerHTML = layers.map(([key, code, color]) => `<li><i style="background:${color}"></i><span>${esc(t(key))}</span><b>${esc(code)}</b></li>`).join('');
}

function setExploded(on, amount = Number($('#explodeAmount').value) || 1) {
  view.setExploded(on ? amount : 0);
  $('#explodePanel').hidden = !on;
  if (on) view.setView('exploded');
  window.dispatchEvent(new CustomEvent('curtainwall-exploded', { detail: { exploded: on } }));
  return on;
}

async function copyBom() {
  if (M.brand === 'cortizo') {
    try { await navigator.clipboard.writeText(cortizoListText(M, S.qty)); $('#copyBom').textContent = '✓'; } catch { $('#copyBom').textContent = '!'; }
    setTimeout(() => { const b = $('#copyBom'); if (b) b.textContent = t('bom.copy'); }, 1400);
    return;
  }
  const lines = M.bom.items.map(i => [i.id, t(i.key, i.vars), `${i.qty * S.qty} ${t(i.unit)}`, i.note ? t(i.note, i.noteVars) : ''].join('\t'));
  const text = [`GUTMANN GCW 050 · ${fmt(M.W)} × ${fmt(M.H)} mm × ${S.qty}`, ...lines].join('\n');
  try { await navigator.clipboard.writeText(text); $('#copyBom').textContent = '✓'; } catch { $('#copyBom').textContent = '!'; }
  setTimeout(() => { const b = $('#copyBom'); if (b) b.textContent = t('bom.copy'); }, 1400);
}

let pending = false, refit = false;
function schedule(fit = false) {
  refit = refit || fit;
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const previous = M ? `${M.W}x${M.H}` : null;
    try {
      M = isCortizo() ? cortizoModel(S, CZ) : facadeModel(S);
    } catch (error) {
      console.error(error);
      $('#checks').innerHTML = `<p class="note">${esc(error.message)}</p>`;
      return;
    }
    view.build(M);
    view.setNodeFocus(M);
    render(M);
    if (refit || previous !== `${M.W}x${M.H}`) view.setView('exterior');
    refit = false;
  });
}

function update(next, fit = false) {
  S = normalizeState(next);
  if (S.brand === 'cortizo') {
    if (!CZ) {
      syncControls();
      ensureCortizo().then(loaded => update(loaded ? S : { ...S, brand: 'gutmann' }, true));
      return;
    }
    S.cortizo = normalizeCortizo(S.cortizo || {}, CZ);
  }
  syncControls();
  schedule(fit);
}

// Cortizo inputs edit S.cortizo; numeric fields stay numbers.
const CZ_TEXT = new Set(['variant', 'innerPane', 'cap', 'clipFix', 'skyTransomJoint', 'drySilicone']);
function cortizoInput(el) {
  const k = el.dataset.cz;
  const value = el.type === 'checkbox' ? el.checked : CZ_TEXT.has(k) ? el.value : parseFloat(String(el.value).replace(',', '.'));
  if (typeof value === 'number' && Number.isNaN(value)) return syncControls();
  update({ ...S, cortizo: { ...S.cortizo, [k]: value } });
}

// Elevation click: glass → vent → opaque panel (where the system has them).
function cycleCortizoField(row, col) {
  const types = fieldTypes(CZ, S.cortizo.system);
  const fields = S.cortizo.fields.filter(f => !(f.row === row && f.col === col));
  const rowPanel = S.rowTypes[row] === 'spandrel' && types.includes('panel');
  const current = S.cortizo.fields.find(f => f.row === row && f.col === col)?.type || (rowPanel ? 'panel' : 'glass');
  const next = types[(types.indexOf(current) + 1) % types.length];
  if (next !== 'glass' || rowPanel) fields.push({ row, col, type: next });
  update({ ...S, cortizo: { ...S.cortizo, fields } });
}

document.addEventListener('change', event => {
  const el = event.target;
  if (el.closest('.shared-ui-host')) return;
  if (el.dataset.cz) return cortizoInput(el);
  if (el.dataset.bay != null) { const widths = [...S.widths]; widths[+el.dataset.bay] = Number(el.value); return update({ ...S, widths }); }
  if (el.dataset.row != null) { const heights = [...S.heights]; heights[+el.dataset.row] = Number(el.value); return update({ ...S, heights }); }
  if (el.dataset.rowType != null) { const rowTypes = [...S.rowTypes]; rowTypes[+el.dataset.rowType] = el.value; return update({ ...S, rowTypes }); }
  const k = el.dataset.k;
  if (!k) return;
  if (el.type === 'checkbox') return update({ ...S, [k]: el.checked });
  if (el.tagName === 'SELECT') return update({ ...S, [k]: ['customThickness'].includes(k) ? Number(el.value) : el.value });
  const value = parseFloat(String(el.value).replace(',', '.'));
  if (Number.isNaN(value)) return syncControls();
  update({ ...S, [k]: value });
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'explodeAmount') return view.setExploded(Number(el.value));
  if (el.type === 'range' && el.dataset.k) update({ ...S, [el.dataset.k]: Number(el.value) });
});
document.addEventListener('click', event => {
  const el = event.target.closest('button');
  if (!el || el.closest('.shared-ui-host')) return;
  if (el.dataset.brand) return update({ ...S, brand: el.dataset.brand }, true);
  if (el.dataset.czSystem) return update({ ...S, cortizo: { system: el.dataset.czSystem } }, true);
  if (el.dataset.preset) return update({ ...S, ...PRESETS[el.dataset.preset] }, true);
  if (el.dataset.tint) return update({ ...S, glassTint: el.dataset.tint });
  if (el.dataset.finish) return update({ ...S, [el.dataset.finish]: el.dataset.id });
  if (el.dataset.removeBay != null) return update({ ...S, widths: S.widths.filter((_, i) => i !== +el.dataset.removeBay) });
  if (el.dataset.removeRow != null) {
    const keep = (_, i) => i !== +el.dataset.removeRow;
    return update({ ...S, heights: S.heights.filter(keep), rowTypes: S.rowTypes.filter(keep) });
  }
  if (el.dataset.action === 'assemble') return setExploded(false);
  if (el.dataset.action === 'add-bay' && S.widths.length < LIMITS.bays[1]) return update({ ...S, widths: [...S.widths, S.widths.at(-1)] });
  if (el.dataset.action === 'add-row' && S.heights.length < LIMITS.rows[1]) return update({ ...S, heights: [...S.heights, S.heights.at(-1)], rowTypes: [...S.rowTypes, S.rowTypes.at(-1)] });
  if (el.dataset.action === 'equal-bays') {
    const total = S.widths.reduce((a, b) => a + b, 0), n = S.widths.length;
    return update({ ...S, widths: S.widths.map((_, i) => Math.round(total / n) + (i === n - 1 ? total - Math.round(total / n) * n : 0)) });
  }
  if (el.dataset.tab) selectTab(el.dataset.tab);
});
document.addEventListener('click', event => {
  const cell = event.target.closest?.('.cz-cell');
  if (cell && isCortizo()) cycleCortizoField(Number(cell.dataset.cellRow), Number(cell.dataset.cellCol));
});
document.addEventListener('keydown', event => {
  const cell = event.target.closest?.('.cz-cell');
  if (!cell || !isCortizo() || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  cycleCortizoField(Number(cell.dataset.cellRow), Number(cell.dataset.cellCol));
});

function applyLocale(next) {
  locale = next || locale;
  t = translator(locale);
  document.documentElement.lang = locale.slice(0, 2);
  applyTranslations(document, t);
  syncControls();
  if (M) render(M);
}
window.addEventListener('curtainwall-preference-change', event => {
  if (!['locale', 'initial'].includes(event.detail?.name)) return;
  const nextLocale = event.detail?.preferences?.locale;
  if (nextLocale && nextLocale !== locale) applyLocale(nextLocale);
});

window.CURTAIN_WALL_API = {
  captureState: () => structuredClone(S),
  restoreState(snapshot) { if (!snapshot || typeof snapshot !== 'object') return false; update({ ...DEFAULT_STATE, ...snapshot }, true); return true; },
  resetConfiguration() { update(DEFAULT_STATE, true); return true; },
  cycleCamera: () => view.cycleView(),
  toggleExploded: () => setExploded(view.exploded === 0),
  setExploded: (on, amount) => setExploded(Boolean(on), amount ?? 1),
  isExploded: () => view.exploded > 0,
  setView: name => view.setView(name),
  getModel: () => M,
  ready: () => (S.brand === 'cortizo' ? ensureCortizo().then(Boolean) : Promise.resolve(true)),
  getScene: () => view,
  setLocale: applyLocale,
};

applyLocale(locale);
if (S.brand === 'cortizo') update(S, true);
else schedule(true);
