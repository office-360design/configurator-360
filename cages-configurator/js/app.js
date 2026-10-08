import { readShareState } from '../../shared-ui/src/shareState.js?v=platform-18';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';
import { CageScene } from './scene.js?v=cages-4';
import { sectionSvg } from './section.js?v=cages-4';
import {
  DEFAULT, LIM, PRESETS, barsFor, checks, clampState, fmt, markCode, model, sectionLabel, specText,
} from './model.js?v=cages-4';

await requireTenantConfiguratorAccess('cages');

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const VIEWS = ['all', 'head', 'axial'];
const UNITS = { T: 'mm', W: 'mm', sv: 'mm', sh: 'mm', linkStep: 'mm', trussCount: 'buc', bendLen: 'mm', bendIn: 'mm', D: 'mm', B: 'mm', H: 'mm', Lm: 'm', cover: 'mm', n: 'buc', free: 'mm', pitch: 'mm', pitchEnd: 'mm', zoneEnd: 'mm', ringStep: 'mm', spacerPer: 'buc', spacerStep: 'mm', qty: 'buc' };
const shared = await readShareState({ productType: 'cages' });
let S = clampState(shared && typeof shared === 'object' ? { ...DEFAULT, ...shared } : DEFAULT);
let viewIndex = 0;
let M = null;
const view = new CageScene($('#canvasHost'));

function fillSelect(select, values, value) {
  select.innerHTML = values.map(d => `<option value="${d}">Ø${d}</option>`).join('');
  select.value = String(value);
}

function syncUI() {
  const lim = LIM.pilot, wall = LIM.perete, isWall = S.type === 'perete';
  $$('[data-for]').forEach(el => { el.hidden = el.dataset.for !== S.type; });
  $$('[data-type]').forEach(b => { const on = b.dataset.type === S.type; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
  $$('[data-shape]').forEach(b => { const on = b.dataset.shape === S.shape; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
  $$('[data-show]').forEach(el => {
    const w = el.dataset.show;
    el.hidden = isWall || !(w === S.shape || (w === 'rect' && S.shape !== 'circ'));
  });
  $('#lblB').textContent = S.shape === 'patrat' ? 'Latură' : 'Lățime B';
  ['D', 'B', 'H'].forEach(k => { const r = $(`#r-${k}`), n = $(`#n-${k}`); r.min = n.min = lim.D[0]; r.max = n.max = lim.D[1]; });
  $('#r-pitch').max = $('#n-pitch').max = lim.p;
  $('#r-pitchEnd').max = $('#n-pitchEnd').max = S.pitch;
  ['#r-free', '#n-free', '#r-free-w', '#n-free-w'].forEach(id => { $(id).max = Math.min(2000, S.Lm * 1000 - 1000); });
  $('#r-L').max = $('#n-L').max = LIM[S.type].L / 1000;
  fillSelect($('#sel-dv'), barsFor(wall.dv), S.dv);
  fillSelect($('#sel-dh'), barsFor(wall.dh), S.dh);
  fillSelect($('#sel-dt'), barsFor(wall.dt), S.dt);
  fillSelect($('#sel-trussD'), barsFor(wall.dv), S.trussD);
  $('#r-sv').min = $('#n-sv').min = S.dv + 50;
  $('#r-sh').min = $('#n-sh').min = S.dh + 50;
  $('#trussSub').setAttribute('aria-disabled', String(!S.trusses));
  $('#spacerHint').textContent = isWall ? 'Roți din plastic pe ambele fețe' : 'Roți din plastic pe spirală';
  $('#spacerPerLabel').textContent = isWall ? 'Distanțieri pe față' : 'Distanțieri pe secțiune';
  fillSelect($('#sel-dl'), barsFor(lim.dl), S.dl);
  fillSelect($('#sel-ds'), barsFor(lim.ds), S.ds);
  $('#limGeo').textContent = isWall
    ? `T ${wall.T[0]}–${wall.T[1]} mm · L ≤ ${wall.L / 1000} m`
    : `${lim.D[0]}–${lim.D[1]} mm · L ≤ ${lim.L / 1000} m`;
  $('#limDl').textContent = `Ø${lim.dl[0]}–${lim.dl[1]} mm`;
  $('#limDs').textContent = `Ø${lim.ds[0]}–${lim.ds[1]} mm · pas ≤ ${lim.p} mm`;
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = Boolean(S[k]);
    else if (el.tagName === 'SELECT') el.value = String(S[k]);
    else if (document.activeElement !== el) el.value = S[k];
  });
  $$('[data-out]').forEach(out => {
    const k = out.dataset.out, value = k === 'Lm' ? fmt(S.Lm, 1) : fmt(S[k]);
    out.value = `${value} ${UNITS[k]}`;
  });
  $('#denseSub').setAttribute('aria-disabled', String(!S.dense));
  $('#ringsSub').setAttribute('aria-disabled', String(!S.rings));
  $('#spacersSub').setAttribute('aria-disabled', String(!S.spacers));
  $('#bendSub').setAttribute('aria-disabled', String(!S.headBend));
  $('#r-bendLen').max = $('#n-bendLen').max = Math.min(1000, Math.max(100, S.free));
  $('#r-bendIn').max = $('#n-bendIn').max = Math.round(Math.min(S.shape === 'circ' ? S.D : Math.min(S.B, S.H), 1400) * 0.3);
}

function render(m) {
  const lim = LIM[S.type], isWall = m.kind === 'wall';
  const reinforcement = isWall
    ? `2×${m.nv}Ø${S.dv} vert. · Ø${S.dh}/${S.sh} oriz. · agrafe Ø${S.dt}`
    : `${S.n}Ø${S.dl} ${S.grade} · SP Ø${S.ds}/${S.pitch}${S.dense ? ` (${S.pitchEnd})` : ''}`;
  $('#tag').innerHTML = `<div class="mark">${markCode(S)}</div>
    ${lim.name} · ${sectionLabel(S)} · L ${fmt(S.Lm, 2)} m<br>${reinforcement}<br>
    <b>${fmt(m.mass)} kg</b> / buc · ${fmt(m.mass / S.Lm, 1)} kg/m${m.bend ? ' · cap îndoit' : ''}`;
  $('#boreHint').textContent = isWall ? `Carcasă ${S.W} × ${fmt(m.Tc)} mm (perete ${S.T} mm)`
    : m.circ ? `Diametru foraj rezultat: Ø${m.boreB} mm` : `Secțiune panou rezultată: ${m.boreB}×${m.boreH} mm`;

  const rows = m.items.map(item => [item.name, item.desc, item.length == null ? '' : `${fmt(item.length, 1)} m`, item.kg == null ? '–' : fmt(item.kg, 1)]);
  const volume = m.volume;
  $('#qty').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Element</th><th>Descriere</th><th class="n">Lungime</th><th class="n">kg</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('')}
    <tr class="total"><td>Total / buc</td><td>${fmt(m.mass / S.Lm, 1)} kg/m</td><td class="n"></td><td class="n">${fmt(m.mass, 1)}</td></tr>
    <tr class="total"><td>Total comandă</td><td>${S.qty} buc</td><td class="n"></td><td class="n">${fmt(m.mass * S.qty)}</td></tr></tbody></table></div>
    <table class="extra"><tbody>
      <tr><td>${m.nodesLabel}</td><td class="n">${fmt(m.nodes)}</td></tr>
      <tr><td>${m.volumeLabel}</td><td class="n">${fmt(volume, 2)} m³</td></tr>
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
    if (refit || previous === null || Math.abs(previous - view.length) > 0.01) { viewIndex = 0; view.fit('all'); }
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
  if (el.dataset.k && el.type === 'number') {
    const value = parseFloat(String(el.value).replace(',', '.'));
    if (!Number.isNaN(value)) update({ ...S, [el.dataset.k]: value });
    // syncUI skips the focused field; show the clamped value there too.
    el.value = S[el.dataset.k];
  }
});
$$('[data-preset]').forEach(button => button.addEventListener('click', () => update({ ...DEFAULT, ...PRESETS[button.dataset.preset] }, true)));
$$('[data-type]').forEach(button => button.addEventListener('click', () => update({ ...S, type: button.dataset.type }, true)));
$$('[data-shape]').forEach(button => button.addEventListener('click', () => update({ ...S, shape: button.dataset.shape }, true)));
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

// Small API for tests and future shell integration.
window.CAGES_CONFIGURATOR_API = {
  captureState: () => ({ ...S }),
  restoreState(snapshot) { if (!snapshot || typeof snapshot !== 'object') return false; update({ ...DEFAULT, ...snapshot }, true); return true; },
  resetConfiguration() { update(DEFAULT, true); return true; },
  cycleCamera() { viewIndex = (viewIndex + 1) % VIEWS.length; view.fit(VIEWS[viewIndex]); return VIEWS[viewIndex]; },
  getModel: () => M,
};

syncUI();
schedule(true);
