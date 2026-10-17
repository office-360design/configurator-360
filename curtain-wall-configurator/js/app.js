import { readShareState } from '../../shared-ui/src/shareState.js?v=locales-6';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=locales-6';
import { getLocaleForHostname } from '../../shared-ui/src/config.js?v=locales-6';
import { DEFAULT_STATE, FINISHES, LIMITS, PRESETS, TINTS, fmt, normalizeState, setNumberLocale } from './facade.js?v=locales-6';
import { nodeSvg } from './drawings.js?v=locales-6';
import { applyTranslations, resolveLocale, translator } from './i18n.js?v=locales-6';
import { FacadeScene } from './scene.js?v=locales-6';
import { createCortizo, cortizoListText, cortizoModel, fieldTypes, loadCortizoData, normalizeCortizo } from './cortizo.js?v=locales-6';
import * as czUi from './cortizoUi.js?v=locales-6';

await requireTenantConfiguratorAccess('curtainwall');

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shared = await readShareState({ productType: 'curtainwall' });
let S = normalizeState(shared && typeof shared === 'object' ? shared : DEFAULT_STATE);
let M = null;
let locale = resolveLocale(window.CURTAIN_WALL_PREFERENCES?.locale || getLocaleForHostname(window.location.hostname));
let t = translator(locale);
let tab = 'elevation';
const view = new FacadeScene($('#canvasHost'));

// Cortizo catalogue data (≈1.4 MB of JSON), loaded once at start.
let CZ = null;
const czReady = loadCortizoData().then(data => { CZ = createCortizo(data); return true; }).catch(error => {
  console.error(error);
  $('#cortizoLoading').hidden = false;
  $('#cortizoLoading').textContent = t('cz.loadFailed');
  return false;
});

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
  $('#tintChips').innerHTML = TINTS.map(id => `<button type="button" class="chip" data-tint="${id}" aria-pressed="${S.glassTint === id}">${esc(t(`tint.${id}`))}</button>`).join('');
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
  $('#cortizoLoading').hidden = Boolean(CZ);
  if (!CZ) return;
  $('#systemName').textContent = CZ.engine.systems.find(s => s.id === S.cortizo.system).name;
  $('#cortizoSystem').innerHTML = czUi.systemControls(t, CZ, S.cortizo);
  $('#cortizoGlazing').innerHTML = czUi.glazingControls(t, CZ, S.cortizo);
}

function selectTab(next) {
  tab = next;
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
}

function render(m) {
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

// Layers from the outside in, with the catalogue article of each part.
function renderExplodeLegend(m) {
  const outside = FINISHES.find(f => f.id === S.finishOutside).color, inside = FINISHES.find(f => f.id === S.finishInside).color;
  const e = m.edges, roles = m.result.fields.find(f => f.type !== 'window')?.roles || {};
  const pressure = e.v === 'pressure' || e.h === 'pressure', sealed = e.v !== 'pressure' || e.h !== 'pressure';
  const vent = m.panes.find(p => p.window);
  const layers = [
    ...(pressure ? [['layer.cover', m.C.cap || '—', outside], ['layer.strip', 'COR-9914', outside], ['layer.gasketOuter', roles.pressureGasket || '999000', '#1d1f21'], ['layer.insulator', roles.rpt || 'RPT', '#d9b77c']] : []),
    ...(sealed ? [['layer.joint', roles.backer || roles.dryGasket || 'SILICON', '#1d1f21']] : []),
    ...(vent ? [['layer.sash', vent.field.win.profiles.map(p => p.code).join(' / '), outside]] : []),
    ['layer.glass', `${m.glazing.thickness} mm · ${m.glazing.label}`, '#a9c6d3'],
    ...(e.v === 'frame' ? [['layer.frame', m.C.system === 'ST52' ? 'COR-9982' : 'COR-9983', inside]] : []),
    ['layer.gasketInner', roles.mullionGasket || '—', '#1d1f21'],
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
  try { await navigator.clipboard.writeText(cortizoListText(M, S.qty)); $('#copyBom').textContent = '✓'; } catch { $('#copyBom').textContent = '!'; }
  setTimeout(() => { const b = $('#copyBom'); if (b) b.textContent = t('bom.copy'); }, 1400);
}

let pending = false, refit = false;
function schedule(fit = false) {
  refit = refit || fit;
  if (pending || !CZ) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const previous = M ? `${M.W}x${M.H}` : null;
    try {
      M = cortizoModel(S, CZ);
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
  if (CZ) S.cortizo = normalizeCortizo(S.cortizo || {}, CZ);
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
function cycleField(row, col) {
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
  const cell = event.target.closest?.('.cz-cell');
  if (cell && CZ) return cycleField(Number(cell.dataset.cellRow), Number(cell.dataset.cellCol));
  const el = event.target.closest('button');
  if (!el || el.closest('.shared-ui-host')) return;
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
document.addEventListener('keydown', event => {
  const cell = event.target.closest?.('.cz-cell');
  if (!cell || !CZ || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  cycleField(Number(cell.dataset.cellRow), Number(cell.dataset.cellCol));
});

function applyLocale(next) {
  locale = resolveLocale(next || locale);
  setNumberLocale(locale);
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
  ready: () => czReady,
  getScene: () => view,
  setLocale: applyLocale,
};

applyLocale(locale);
czReady.then(() => update(S, true));
