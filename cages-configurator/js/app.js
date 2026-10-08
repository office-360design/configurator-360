import { CageScene } from './scene.js?v=cages-1';
import { sectionSvg } from './section.js?v=cages-1';
import {
  DEFAULT, LIM, PRESETS, barsFor, checks, clampState, fmt, markCode, model, sectionLabel, specText, weightLimit,
} from './model.js?v=cages-1';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let S = clampState(DEFAULT);
let M = null;
const view = new CageScene($('#canvasHost'));

function fillSelect(select, values, value) {
  select.innerHTML = values.map(d => `<option value="${d}">Ø${d}</option>`).join('');
  select.value = String(value);
}

function syncUI() {
  const lim = LIM[S.type];
  $(`input[name=type][value=${S.type}]`).checked = true;
  $(`input[name=shape][value=${S.shape}]`).checked = true;
  $$('[data-show]').forEach(el => {
    const w = el.dataset.show;
    el.hidden = !(w === S.shape || (w === 'rect' && S.shape !== 'circ'));
  });
  $('#lblB').textContent = S.shape === 'patrat' ? 'Latură' : 'Lățime B';
  ['D', 'B', 'H'].forEach(k => { const r = $(`#r-${k}`), n = $(`#n-${k}`); r.min = n.min = lim.D[0]; r.max = n.max = lim.D[1]; });
  $('#r-pitch').max = $('#n-pitch').max = lim.p;
  $('#r-pitchEnd').max = $('#n-pitchEnd').max = S.pitch;
  $('#r-free').max = $('#n-free').max = Math.min(2000, S.Lm * 1000 - 1000);
  $('#r-L').max = $('#n-L').max = lim.L / 1000;
  fillSelect($('#sel-dl'), barsFor(lim.dl), S.dl);
  fillSelect($('#sel-ds'), barsFor(lim.ds), S.ds);
  $('#limGeo').textContent = `${lim.D[0]}–${lim.D[1]} mm · L ≤ ${lim.L / 1000} m`;
  $('#limDl').textContent = `Ø${lim.dl[0]}–${lim.dl[1]} mm`;
  $('#limDs').textContent = `Ø${lim.ds[0]}–${lim.ds[1]} mm · pas ≤ ${lim.p} mm`;
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = Boolean(S[k]);
    else if (el.tagName === 'SELECT') el.value = String(S[k]);
    else if (document.activeElement !== el) el.value = S[k];
  });
  $('#denseSub').setAttribute('aria-disabled', String(!S.dense));
  $('#ringsSub').setAttribute('aria-disabled', String(!S.rings));
  $('#spacersSub').setAttribute('aria-disabled', String(!S.spacers));
}

function render(m) {
  const lim = LIM[S.type], limit = weightLimit(S.Lm), over = m.mass > limit;
  const tag = $('#tag');
  tag.classList.toggle('over', over);
  tag.innerHTML = `<div class="mark">${markCode(S)}</div>
    ${lim.name} · ${sectionLabel(S)} · L ${fmt(S.Lm, 2)} m<br>${S.n}Ø${S.dl} ${S.grade} · SP Ø${S.ds}/${S.pitch}${S.dense ? ` (${S.pitchEnd})` : ''}<br>
    <b>${fmt(m.mass)} kg</b> / buc · limită ~${fmt(limit)} kg
    <div class="gauge" aria-hidden="true"><i style="width:${Math.min(100, m.mass / limit * 100).toFixed(1)}%"></i></div>`;
  $('#boreHint').textContent = m.circ ? `Diametru foraj rezultat: Ø${m.boreB} mm` : `Secțiune panou rezultată: ${m.boreB}×${m.boreH} mm`;

  const rows = [
    ['Bare longitudinale', `${S.n} × ${fmt(S.Lm, 2)} m Ø${S.dl}`, `${fmt(S.n * S.Lm, 1)} m`, fmt(m.mBars, 1)],
    ['Spirală', `${fmt(m.Ttot, 1)} spire Ø${S.ds}`, `${fmt(m.spiralLen / 1000, 1)} m`, fmt(m.mSpiral, 1)],
  ];
  if (S.rings) rows.push(['Inele rigidizare', `${m.ringZ.length} buc Ø${S.ringD}`, `${fmt(m.ringZ.length * m.ringPerim / 1000, 1)} m`, fmt(m.mRings, 1)]);
  if (S.spacers) rows.push(['Distanțieri', `${m.spacerZ.length * S.spacerPer} buc`, '', '–']);
  const volume = m.Ac / 1e6 * S.Lm;
  $('#qty').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Element</th><th>Descriere</th><th class="n">Lungime</th><th class="n">kg</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('')}
    <tr class="total"><td>Total / buc</td><td>${fmt(m.mass / S.Lm, 1)} kg/m</td><td class="n"></td><td class="n">${fmt(m.mass, 1)}</td></tr>
    <tr class="total"><td>Total comandă</td><td>${S.qty} buc</td><td class="n"></td><td class="n">${fmt(m.mass * S.qty)}</td></tr></tbody></table></div>
    <table class="extra"><tbody>
      <tr><td>Puncte de sudură / buc</td><td class="n">${fmt(m.weldCount + m.weldRings)}</td></tr>
      <tr><td>Volum beton ${S.type === 'pilot' ? 'pilot' : 'panou'} (${m.circ ? `Ø${m.boreB}` : `${m.boreB}×${m.boreH}`})</td><td class="n">${fmt(volume, 2)} m³</td></tr>
      <tr><td>Consum armătură</td><td class="n">${fmt(m.mass / volume)} kg/m³</td></tr>
    </tbody></table>`;

  $('#checks').innerHTML = checks(S, m).map(c => `<li><span class="pill ${c.lv}">${c.lv === 'ok' ? 'OK' : c.lv === 'warn' ? 'Atenție' : 'Eroare'}</span><span>${c.t}</span></li>`).join('');
  $('#specText').value = specText(S, m);
  $('#sectionSvg').innerHTML = sectionSvg(S, m);
}

let pending = false, refit = false;
function schedule(fitAfter = false) {
  refit = refit || fitAfter;
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const previous = view.length;
    M = model(S);
    view.build(S, M);
    render(M);
    if (refit || previous === null || Math.abs(previous - view.length) > 0.01) view.fit('all');
    refit = false;
  });
}

function update(next, fitAfter = false) {
  S = clampState(next);
  syncUI();
  schedule(fitAfter);
}

document.addEventListener('input', event => {
  const el = event.target, k = el.dataset.k;
  if (!k || el.type === 'number') return; // typed numbers apply on change
  const next = { ...S };
  if (el.type === 'checkbox') next[k] = el.checked;
  else if (k === 'grade') next[k] = el.value;
  else { const value = parseFloat(el.value); if (Number.isNaN(value)) return; next[k] = value; }
  update(next);
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.name === 'type' || el.name === 'shape') return update({ ...S, [el.name]: el.value }, true);
  if (el.dataset.k && el.type === 'number') {
    const value = parseFloat(String(el.value).replace(',', '.'));
    if (!Number.isNaN(value)) update({ ...S, [el.dataset.k]: value });
    // syncUI skips the focused field; show the clamped value there too.
    el.value = S[el.dataset.k];
  }
});
$$('[data-preset]').forEach(button => button.addEventListener('click', () => update({ ...DEFAULT, ...PRESETS[button.dataset.preset] }, true)));
$$('[data-view]').forEach(button => button.addEventListener('click', () => view.fit(button.dataset.view)));
$('#c-welds').addEventListener('change', event => view.setWelds(event.target.checked));
$('#c-bore').addEventListener('change', event => view.setBore(event.target.checked));

$('#copyBtn').addEventListener('click', async () => {
  const text = $('#specText').value, button = $('#copyBtn');
  try { await navigator.clipboard.writeText(text); button.textContent = 'Copiat'; }
  catch {
    const area = $('#specText');
    area.style.left = '0'; area.select();
    try { document.execCommand('copy'); button.textContent = 'Copiat'; } catch { button.textContent = 'Selectat'; }
    area.style.left = '-9999px';
  }
  setTimeout(() => { button.textContent = 'Copiază fișa'; }, 1600);
});

const refreshTheme = () => { view.applyTheme(); if (M) $('#sectionSvg').innerHTML = sectionSvg(S, M); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshTheme);
new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Small API for tests and future shell integration.
window.CAGES_CONFIGURATOR_API = {
  captureState: () => ({ ...S }),
  restoreState(snapshot) { if (!snapshot || typeof snapshot !== 'object') return false; update({ ...DEFAULT, ...snapshot }, true); return true; },
  resetConfiguration() { update(DEFAULT, true); return true; },
  getModel: () => M,
};

syncUI();
schedule(true);
