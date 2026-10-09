import { readShareState } from '../../shared-ui/src/shareState.js?v=platform-18';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';
import { COVER_PLATES, GLASS_THICKNESSES, GLAZING_PRESETS, PRESSURE_STRIPS, PROFILES } from './catalog.js?v=cw-1';
import { DEFAULT_STATE, FINISHES, LIMITS, PRESETS, checks, facadeModel, fmt, normalizeState } from './facade.js?v=cw-1';
import { elevationSvg, nodeSvg } from './drawings.js?v=cw-1';
import { applyTranslations, translator } from './i18n.js?v=cw-1';
import { FacadeScene } from './scene.js?v=cw-1';

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

function render(m) {
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
}

async function copyBom() {
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
    M = facadeModel(S);
    view.build(M);
    view.setNodeFocus(M);
    render(M);
    if (refit || previous !== `${M.W}x${M.H}`) view.setView('exterior');
    refit = false;
  });
}

function update(next, fit = false) {
  S = normalizeState(next);
  syncControls();
  schedule(fit);
}

document.addEventListener('change', event => {
  const el = event.target;
  if (el.closest('.shared-ui-host')) return;
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
  if (el.type === 'range' && el.dataset.k) update({ ...S, [el.dataset.k]: Number(el.value) });
});
document.addEventListener('click', event => {
  const el = event.target.closest('button');
  if (!el || el.closest('.shared-ui-host')) return;
  if (el.dataset.preset) return update({ ...S, ...PRESETS[el.dataset.preset] }, true);
  if (el.dataset.tint) return update({ ...S, glassTint: el.dataset.tint });
  if (el.dataset.finish) return update({ ...S, [el.dataset.finish]: el.dataset.id });
  if (el.dataset.removeBay != null) return update({ ...S, widths: S.widths.filter((_, i) => i !== +el.dataset.removeBay) });
  if (el.dataset.removeRow != null) {
    const keep = (_, i) => i !== +el.dataset.removeRow;
    return update({ ...S, heights: S.heights.filter(keep), rowTypes: S.rowTypes.filter(keep) });
  }
  if (el.dataset.action === 'add-bay' && S.widths.length < LIMITS.bays[1]) return update({ ...S, widths: [...S.widths, S.widths.at(-1)] });
  if (el.dataset.action === 'add-row' && S.heights.length < LIMITS.rows[1]) return update({ ...S, heights: [...S.heights, S.heights.at(-1)], rowTypes: [...S.rowTypes, S.rowTypes.at(-1)] });
  if (el.dataset.action === 'equal-bays') {
    const total = S.widths.reduce((a, b) => a + b, 0), n = S.widths.length;
    return update({ ...S, widths: S.widths.map((_, i) => Math.round(total / n) + (i === n - 1 ? total - Math.round(total / n) * n : 0)) });
  }
  if (el.dataset.tab) {
    tab = el.dataset.tab;
    $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
  }
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
  setView: name => view.setView(name),
  getModel: () => M,
  setLocale: applyLocale,
};

applyLocale(locale);
schedule(true);
