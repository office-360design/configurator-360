// Markup for the Cortizo systems: sidebar controls and the documentation
// sheet (elevation with field status, checks, cutting list, accessories,
// systems comparison and logic map). Catalogue names are the English ones (desc_en)
// and engine messages are Romanian, as in cortizo/; labels around them follow the configurator locale.
import { RULE_KEY, fieldTypes, isClipSystem, isFrameSystem, usesInnerPane } from './cortizo.js?v=cw-5';

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 0) => (x == null || Number.isNaN(Number(x)) ? '–' : Number(x).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
const LV = { ok: 'ok', warn: 'warn', bad: 'err' };
const pill = (level, t) => `<span class="pill ${LV[level] || level}">${esc(t(`cz.level.${level}`))}</span>`;
const page = (t, p) => (p ? ` <small class="cz-page">${esc(t('cz.page', { p }))}</small>` : '');
const options = (list, value) => list.map(o => { const [v, label] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`; }).join('');

export function systemControls(t, cortizo, C) {
  const R = cortizo.rules[RULE_KEY[C.system]];
  const chips = cortizo.engine.systems.map(s => `<button type="button" class="chip" data-cz-system="${s.id}" aria-pressed="${s.id === C.system}">${esc(s.name)}</button>`).join('');
  const edges = Object.entries(R.edges || {}).map(([k, v]) => `<span>${esc(t(`cz.edgeDir.${k}`))}: ${esc(t(`cz.edge.${v}`))}</span>`).join('');
  const tests = R.tests ? `<span>${esc(t('cz.tests', { air: R.tests.air, water: R.tests.water, wind: R.tests.wind }))}</span>` : '';
  return `<div class="chip-row" role="group" aria-label="${esc(t('cz.system'))}">${chips}</div>
    <div class="info-card cz-principle"><strong>${esc(cortizo.engine.systems.find(s => s.id === C.system).name)} · ${esc(t('cz.pages', { p: R.pages }))}</strong>
      <small>${esc(R.principle)}</small><div class="cz-edges">${edges}<span>${esc(t('cz.maxGlass', { mm: R.max_glass_mm }))}</span>${tests}</div></div>`;
}

export function profileControls(t, cortizo, C, model) {
  const m = model?.result?.mullion, tr = model?.result?.transom;
  const sky = C.system === 'SKY', R = cortizo.rules.skylight;
  return `${sky ? `<div class="select-pair">
      <label><span class="select-label">${esc(t('cz.snow'))}</span><input class="number-input" type="number" data-cz="snowKPa" min="0" max="10" step="0.1" value="${C.snowKPa}"></label>
      <label><span class="select-label">${esc(t('cz.slope', { min: R.slope_deg.min, max: R.slope_deg.max }))}</span><input class="number-input" type="number" data-cz="slopeDeg" min="1" max="60" step="1" value="${C.slopeDeg}"></label>
    </div>` : ''}
    <label class="toggle-row"><span><b>${esc(t('cz.reinforcement'))}</b></span><input type="checkbox" data-cz="allowReinforcement"${C.allowReinforcement ? ' checked' : ''}><i></i></label>
    <div class="info-card"><strong>${m ? esc(t('cz.autoPick', { mullion: m.code, depth: m.depth, reinf: m.reinforced ? ` + ${m.reinforcement}` : '', transom: tr?.code || '—' })) : esc(t('cz.noMullion'))}</strong>
      <small>${esc(t(isClipSystem(C.system) || isFrameSystem(C.system) ? 'cz.profileHintClips' : 'cz.profileHint'))}</small></div>`;
}

export function glazingControls(t, cortizo, C) {
  const R = cortizo.rules[RULE_KEY[C.system]];
  const opts = cortizo.engine.options(C.system);
  const panes = opts.find(o => o.variant === C.variant).panes;
  const inner = usesInnerPane(C.system);
  const thk = (panes.find(p => p.inner === (inner ? C.innerPane : '')) || panes[0]).thicknesses;
  const clip = isClipSystem(C.system), frame = isFrameSystem(C.system), dry = /uscată/.test(C.variant);
  const label = (key, control) => `<label><span class="select-label">${esc(t(key))}</span>${control}</label>`;
  const num = (k, v, min, max, step) => `<input class="number-input" type="number" data-cz="${k}" min="${min}" max="${max}" step="${step}" value="${v}">`;
  const sel = (k, list, v) => `<select data-cz="${k}">${options(list, v)}</select>`;
  return `<div class="control-list">
    ${opts.length > 1 ? label('cz.variant', sel('variant', opts.map(o => o.variant), C.variant)) : ''}
    <div class="select-pair">
      ${inner ? label('cz.innerPane', sel('innerPane', panes.map(p => p.inner), C.innerPane)) : ''}
      ${label('cz.total', sel('totalMm', thk.map(v => [v, `${v} mm`]), C.totalMm))}
      ${label('cz.panes', num('panesMm', C.panesMm, 4, C.totalMm, 1))}
      ${clip ? label('cz.outerPane', num('outerPaneMm', C.outerPaneMm, 4, 30, 1)) : ''}
      ${clip ? label('cz.chamber', sel('chamberMm', [16, 18, 20].map(v => [v, `${v} mm`]), C.chamberMm)) : ''}
      ${label('glazing.ug', num('ug', C.ug, 0.3, 3, 0.1))}
    </div>
    ${clip && dry ? label('cz.drySilicone', sel('drySilicone', ['SG-500', 'SG-550', 'IG-25 HM Plus'], C.drySilicone)) : ''}
    ${R.caps ? label('cz.cap', sel('cap', R.caps.filter(c => c.code).map(c => [c.code, `${c.code} · ${c.label}`]), C.cap)) : ''}
    ${frame ? label('cz.cleats', sel('clipFix', R.glass_frame.cleats.map(c => [c.option, `${c.option} (pag. ${c.page})`]), C.clipFix)) : ''}
    ${C.system === 'SKY' ? label('cz.skyJoint', sel('skyTransomJoint', [['silicone', t('cz.skyJoint.silicone')], ['inclined_cover', t('cz.skyJoint.inclined')]], C.skyTransomJoint)) : ''}
    <div class="select-pair">
      ${label('cz.bar', num('barMm', C.barMm, 3000, 12000, 100))}
      ${label('cz.kerf', num('kerfMm', C.kerfMm, 0, 20, 1))}
    </div>
    <small class="source-note">${esc(t('cz.clickHint', { types: fieldTypes(cortizo, C.system).map(x => t(`cz.field.${x}`)).join(' / ') }))}</small>
  </div>`;
}

const STATUS_CLASS = { ok: 'cz-ok', warn: 'cz-warn', bad: 'cz-bad' };

// Elevation with the status of every field; cells are buttons that cycle the
// field type (glass → vent → opaque panel), Ix required above every mullion.
export function elevationSvg(model, t) {
  const { xs, ys, W, H, panes, result: R } = model;
  const pad = 70, scale = Math.min(560 / W, 380 / H);
  const w = W * scale, h = H * scale, vw = w + pad * 2, vh = h + pad * 2;
  const X = x => pad + x * scale, Y = y => pad + h - y * scale;
  const face = Math.max(2, model.faceWidth * scale);
  const thinV = ['clip', 'frame'].includes(R.system.edges.v), thinH = ['clip', 'frame', 'silicone'].includes(R.system.edges.h);
  const cells = panes.map(p => {
    const x = X(p.x0) + face / 2, y = Y(p.y1) + face / 2, cw = (p.x1 - p.x0) * scale - face, ch = (p.y1 - p.y0) * scale - face;
    const cx = x + cw / 2, cy = y + ch / 2;
    const type = p.window ? 'window' : p.spandrel ? 'panel' : 'glass';
    const vent = p.window ? `<polyline points="${x + 6},${y + 6} ${cx},${y + ch - 6} ${x + cw - 6},${y + 6}" class="cz-vent"/>` : '';
    const text = cw > 64 && ch > 34 ? `<text x="${cx}" y="${cy - 2}">${fmt(p.kg)} kg</text><text x="${cx}" y="${cy + 11}" class="cz-sub">${esc(p.label)}</text>` : '';
    return `<g class="cz-cell" data-cell-row="${p.row}" data-cell-col="${p.bay}" tabindex="0" role="button" aria-label="${esc(t('cz.cellAria', { row: p.row + 1, col: p.bay + 1, type: t(`cz.field.${type}`) }))}">
      <rect x="${x}" y="${y}" width="${cw}" height="${ch}" class="${STATUS_CLASS[p.status] || 'cz-ok'} ${p.spandrel ? 'cw-spandrel' : ''}"/>${vent}${text}</g>`;
  }).join('');
  const verticals = xs.map(x => `<rect x="${X(x) - face / 2}" y="${Y(H) - face / 2}" width="${face}" height="${h + face}" class="cw-member${thinV ? ' cz-thin' : ''}"/>`).join('');
  const horizontals = ys.map(y => xs.slice(0, -1).map((x, i) => `<rect x="${X(x) + face / 2}" y="${Y(y) - face / 2}" width="${(xs[i + 1] - x) * scale - face}" height="${face}" class="cw-member${thinH ? ' cz-thin' : ''}"/>`).join('')).join('');
  const need = R.axes.map((a, i) => `<text x="${X(xs[i])}" y="${Y(H) - 16}" class="cz-need">M${i + 1} · ${fmt(a.need, 0)}</text>`).join('');
  const dimX = xs.slice(0, -1).map((x, i) => `<line x1="${X(x)}" y1="${Y(0) + 26}" x2="${X(xs[i + 1])}" y2="${Y(0) + 26}"/><text x="${(X(x) + X(xs[i + 1])) / 2}" y="${Y(0) + 22}">${xs[i + 1] - x}</text>`).join('');
  const dimY = ys.slice(0, -1).map((y, i) => `<line x1="${X(0) - 26}" y1="${Y(y)}" x2="${X(0) - 26}" y2="${Y(ys[i + 1])}"/><text x="${X(0) - 30}" y="${(Y(y) + Y(ys[i + 1])) / 2}" transform="rotate(-90 ${X(0) - 30} ${(Y(y) + Y(ys[i + 1])) / 2})">${ys[i + 1] - y}</text>`).join('');
  const problems = panes.filter(p => p.notes.length).map(p => `<li><b>${esc(t('cz.cell', { row: p.row + 1, col: p.bay + 1 }))}</b> ${p.notes.map(esc).join(' ')}</li>`).join('');
  return `<svg class="cw-elevation cz-elevation" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${esc(t('drawing.elevation'))}">
    <g>${cells}${horizontals}${verticals}</g><g class="cz-needs">${need}</g>
    <g class="cw-dim">${dimX}${dimY}
      <line x1="${X(0)}" y1="${Y(0) + 50}" x2="${X(W)}" y2="${Y(0) + 50}"/><text x="${X(W / 2)}" y="${Y(0) + 46}" class="cw-total">${fmt(W)} mm</text>
      <line x1="${X(0) - 50}" y1="${Y(0)}" x2="${X(0) - 50}" y2="${Y(H)}"/><text x="${X(0) - 54}" y="${Y(H / 2)}" class="cw-total" transform="rotate(-90 ${X(0) - 54} ${Y(H / 2)})">${fmt(H)} mm</text>
    </g>
  </svg>
  <div class="cz-legend"><span><i class="cz-ok"></i>${esc(t('cz.level.ok'))}</span><span><i class="cz-warn"></i>${esc(t('cz.level.warn'))}</span><span><i class="cz-bad"></i>${esc(t('cz.level.bad'))}</span><span>${esc(t('cz.legendLines'))}</span><span>${esc(t('cz.legendNeed'))}</span></div>
  ${problems ? `<ul class="cz-problems">${problems}</ul>` : ''}`;
}

const ROLE_NAMES = ['mullionGasket', 'transomGasket', 'reducer', 'supportStd', 'supportHeavy', 'supportCross', 'block', 'rpt', 'rptTransom', 'pressureScrew', 'pressureGasket', 'pipette', 'clipDouble', 'clipSingle', 'clipScrew', 'backer', 'dryGasket', 'sashGasket'];

export function checksPanel(model, t, cortizo) {
  const R = model.result;
  const describe = code => code.split(/[+/]/).map(c => c.trim()).map(c => cortizo.data.catalog.accessories.find(x => x.code === c)?.desc_en || cortizo.data.catalog.profiles.find(x => x.code === c)?.desc_en || '').filter(Boolean).join(' + ');
  const checks = R.checks.map(c => `<li>${pill(c.level, t)}<span><b>${esc(c.title)}</b> ${esc(c.text)}${page(t, c.page)}</span></li>`).join('');
  const sky = R.system.id === 'SKY';
  const axes = R.axes.map((a, i) => `<tr><td>M${i + 1}</td><td class="n">${fmt(a.b)}</td><td class="n">${fmt(a.need, 1)}</td><td class="n">${fmt(a.Rv)}</td><td class="n">${fmt(a.Rh, 2)}</td><td>${sky ? pill('warn', t) : a.anchors ? `${a.anchors} × 999183` : pill('bad', t)}</td></tr>`).join('');
  const f0 = R.fields.find(f => f.type !== 'window') || R.fields[0];
  const roles = ROLE_NAMES.filter(k => f0.roles[k] && (!Array.isArray(f0.roles[k]) || f0.roles[k].length))
    .map(k => { const ref = Array.isArray(f0.roles[k]) ? f0.roles[k].join(' / ') : f0.roles[k]; return `<tr><td>${esc(t(`cz.role.${k}`))}</td><td class="code">${esc(ref)}</td><td>${esc(describe(ref))}</td></tr>`; }).join('');
  const ucw = R.ucw ? `<div class="big">${fmt(R.ucw.ucw, 1)} <small>W/m²K</small></div><p class="note">${esc(t('cz.ucw', { ug: fmt(R.ucw.ug, 1), p: R.ucw.page }))}</p>` : '<div class="big">—</div>';
  return `<div class="checks-grid"><ul class="checks">${checks}</ul>
      <div class="perf"><h3>${esc(t('perf.ucw'))}</h3>${ucw}
        <div class="totals cz-totals">
          <article><span>${esc(t('totals.aluminium'))}</span><strong>${fmt(R.totals.kgAluminium)} kg</strong></article>
          <article><span>${esc(t('cz.kgm2'))}</span><strong>${fmt(R.totals.kgAluminium / R.totals.facadeM2, 1)}</strong></article>
          <article><span>${esc(t('totals.glass'))}</span><strong>${fmt(R.totals.glassM2, 1)} m² · ${fmt(R.totals.kgGlass)} kg</strong></article>
          <article><span>${esc(t('totals.coatingOut'))}</span><strong>${fmt(R.totals.paintM2, 1)} m²</strong></article>
        </div></div></div>
    <h3 class="cz-h">${esc(t(sky ? 'cz.rafters' : 'cz.anchors'))}</h3>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('cz.axis'))}</th><th class="n">b [mm]</th><th class="n">Ix nec. [cm⁴]</th><th class="n">${esc(t('cz.Rv'))}</th><th class="n">${esc(t('cz.Rh'))}</th><th>${esc(t('cz.anchorCol'))}</th></tr></thead><tbody>${axes}</tbody></table></div>
    <h3 class="cz-h">${esc(t('cz.components', { variant: model.C.variant, inner: model.C.innerPane ? ` · ${model.C.innerPane}` : '', mm: model.C.totalMm }))}</h3>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('cz.role'))}</th><th>${esc(t('bom.article'))}</th><th>${esc(t('bom.item'))}</th></tr></thead><tbody>${roles || `<tr><td colspan="3">${esc(t('cz.frameComponents'))}</td></tr>`}</tbody></table></div>
    ${R.notes.length ? `<h3 class="cz-h">${esc(t('cz.notes'))}</h3>${R.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}` : ''}
    <p class="note">${esc(t('cz.disclaimer'))}</p>`;
}

export function bomPanel(model, t, qty = 1) {
  const R = model.result;
  const cuts = R.cuts.map(c => `<tr><td class="code">${esc(c.code)}</td><td>${esc(c.desc)}<small class="cz-rule">${esc(c.notes.join('; '))}</small></td><td class="code">${c.lengths.map(l => fmt(l, l % 1 ? 1 : 0)).join(', ')}${c.overLength.length ? ` ${pill('bad', t)}` : ''}</td><td class="n">${c.n * qty}</td><td class="n">${fmt(c.m * qty, 2)}</td><td class="n">${c.bars * qty}</td><td class="n">${fmt(c.waste * 100)}%</td><td class="n">${c.kg == null ? '–' : fmt(c.kg * qty, 1)}</td></tr>`).join('');
  const accessories = R.accessories.map(a => `<tr><td class="code">${esc(a.code)}</td><td>${esc(a.desc)}<small class="cz-rule">${esc(a.rules.join('; '))}</small></td><td class="n">${a.unit === 'm' ? `${fmt(a.qty * qty, 1)} m` : `${fmt(a.qty * qty)} ${esc(t('unit.pcs'))}`}</td></tr>`).join('');
  return `<div class="bom-head"><strong>${esc(qty > 1 ? t('totals.order', { qty }) : t('cz.cutting', { bar: fmt(model.C.barMm) }))}</strong><button type="button" class="copy" id="copyBom">${esc(t('bom.copy'))}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('bom.article'))}</th><th>${esc(t('bom.item'))}</th><th>${esc(t('cz.lengths'))}</th><th class="n">${esc(t('unit.pcs'))}</th><th class="n">m</th><th class="n">${esc(t('cz.bars'))}</th><th class="n">${esc(t('cz.waste'))}</th><th class="n">kg</th></tr></thead><tbody>${cuts}</tbody></table></div>
    <h3 class="cz-h">${esc(t('cz.accessories'))}</h3>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('bom.article'))}</th><th>${esc(t('bom.item'))}</th><th class="n">${esc(t('bom.qty'))}</th></tr></thead><tbody>${accessories}</tbody></table></div>
    <p class="note">${esc(t('cz.bomNote'))}</p>`;
}

// Systems comparison and methodology cards (cortizo/docs/METODOLOGIE.md).
const CMP = {
  vert: { TP52: 'presor + capac', SG52: 'cleme + profil U', TPH52: 'cleme + profil U', TPV52: 'presor + capac', ST52: 'ramă lipită', SST52: 'ramă cu ornament', SKY: 'presor + capac (căpriori)' },
  hor: { TP52: 'presor + capac', SG52: 'cleme + profil U', TPH52: 'presor + capac', TPV52: 'cleme + profil U', ST52: 'ramă lipită', SST52: 'ramă cu ornament', SKY: 'silicon pe garnitură K' },
  glass: { TP52: 'L−22 × H−22', SG52: 'L−22 × H−22', TPH52: 'L−22 × H−22', TPV52: 'L−22 × H−22', ST52: 'L−22 × H−22', SST52: 'L−60 × H−60', SKY: 'L−22 × H−22' },
  table: { TP52: 'TP (pag. 305–315)', SG52: 'SG pe foaie interioară (582–601)', TPH52: 'TPH + TP (777–801)', TPV52: 'TPV + SG (785–787)', ST52: 'suport după grosime (1029)', SST52: 'garnitură + reductor (1113)', SKY: 'acoperiș (1233–1235)' },
  spec: { TP52: 'fereastră pag. 393 · zonă oarbă pag. 388', SG52: 'pas cleme · profil U în geam · limite geam (671–674)', TPH52: 'cleme doar pe verticală', TPV52: 'cleme doar pe orizontală', ST52: 'silicon structural · cuplaj COR-9971', SST52: 'fără silicon structural · vânt 1200 Pa', SKY: 'zăpadă + pantă · streașină COR-9912' },
};
const CARDS = [
  ['TP 52', 'Presorul preia vântul pe toate laturile, deci nu există verificare de cleme.', ['Debitare: traversă L−22, presor L−58, capac L−53 (pag. 379).', 'Componente din tabelul TP după grosimea pachetului; suport 4a/4b/4c.', 'Șuruburi de presor la 30 mm de capăt, apoi la max. 250 mm.', 'Variante: nivel 1, nivel 2, High Insulation, RC3 (sticlă P5A).']],
  ['SG 52', 'Vântul e preluat de cleme, deci pasul clemelor și dimensiunea geamului devin verificări de sine stătătoare.', ['Pas cleme din graficul pag. 678, la vânt × 1,5.', 'Clemă dublă pe rosturi interioare, simplă pe margine; mărimea după foaia interioară.', 'Profil U COR-9956 în camera de 16/18/20 mm, 1 bucată ≤ 1800 mm, altfel 2.', 'Limite geam: 4,5 m pe latură, L + H ≤ 6,5 m; la garnitură uscată lățimea după silicon.']],
  ['TPH 52', 'Combină TP pe orizontală cu SG pe verticală; folosește două tabele de vitraj.', ['Presor + capac pe traverse, cu deducerile TP.', 'Cleme și profil U doar pe laturile verticale.', 'Suporții și calele vin din tabelul TP, pentru că geamul stă pe presor.']],
  ['TPV 52', 'Inversul TPH: presor pe montanți, cleme pe orizontală, deci suportul și clemele sunt pe aceeași latură.', ['Presor vertical COR-9914 cu prelucrare TPV (pag. 897).', 'Cleme, suporți și garnitura de fund din tabelul SG cu aceeași foaie interioară.', 'Pipete la traversa de jos, ca la TP.']],
  ['ST 52', 'Sticla nu atinge structura: e lipită în atelier pe o ramă care se agață pe cleme și suporți.', ['Ramă COR-9982 L−22 × H−22 la 45°, cu platbandă COR-7298 pentru siliconul structural.', 'Suport de sticlă după grosimea geamului (999204…999191), 2 bucăți la L/10.', 'Cuplaj COR-9971 L−28,5, șuruburi la max. 250 mm; cleme 999030 pe 3 laturi.', 'Sticlă max. 38 mm.']],
  ['SST 52', 'Ca ST, dar geamul e ținut mecanic de ornamentul ramei, fără silicon structural.', ['Ramă COR-9983 L−22 × H−22; sticla e L−60 × H−60.', 'Garnitură și reductor după grosime (pag. 1113); sticlă max. 28 mm.', 'Capacitatea suportului COR-9942 nu e în catalog: câmpurile rămân cu atenționare.', 'Vânt testat 1200 Pa.']],
  ['Skylight – Veranda', 'Singurul sistem cu zăpadă, pantă și etanșare diferită pe orizontală, ca apa să curgă liber.', ['q⊥ = vânt + zăpadă·cos²α + sticlă·cosα pentru căpriori și traverse.', 'Tăvițele de sprijin preiau doar componenta în lungul pantei.', 'Căpriori COR-9804…9810, pantă 7°–40°.', 'Îmbinare streașină cu cămașa COR-9912: L1 = A/cos(β/2), L2 = L1 + 200/tan(90° − β/2).']],
];

export function systemsPanel(t, cortizo) {
  const ids = Object.keys(RULE_KEY);
  const name = id => cortizo.engine.systems.find(s => s.id === id).name;
  const row = (label, f) => `<tr><th>${esc(label)}</th>${ids.map(id => `<td>${esc(f(id))}</td>`).join('')}</tr>`;
  const rules = id => cortizo.rules[RULE_KEY[id]];
  return `<p class="note">${esc(t('cz.systemsIntro'))}</p>
    <div class="table-wrap"><table class="cz-cmp"><thead><tr><th></th>${ids.map(id => `<th>${esc(name(id))}</th>`).join('')}</tr></thead><tbody>
      ${row(t('cz.edgeDir.vertical'), id => CMP.vert[id])}${row(t('cz.edgeDir.horizontal'), id => CMP.hor[id])}
      ${row(t('cz.maxGlassRow'), id => `${rules(id).max_glass_mm} mm`)}${row(t('cz.glassSize'), id => CMP.glass[id])}${row(t('cz.glazingTable'), id => CMP.table[id])}
      ${row(t('cz.waterWind'), id => `${rules(id).tests.water} / ${rules(id).tests.wind}`)}${row(t('cz.specific'), id => CMP.spec[id])}
    </tbody></table></div>
    <div class="cz-cards">${CARDS.map(([title, lead, items]) => `<article><h3>${esc(title)}</h3><p>${esc(lead)}</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('')}</div>`;
}

// The logic map is generated by cortizo/scripts/make-map.py (cortizo/web/map.html).
let mapMarkup = null;
export async function mapPanel(t) {
  if (mapMarkup == null) {
    try {
      const response = await fetch(new URL('../cortizo/web/map.html?v=cw-5', import.meta.url));
      mapMarkup = response.ok ? await response.text() : '';
    } catch { mapMarkup = ''; }
  }
  return `<p class="note">${esc(t('cz.mapIntro'))}</p><div class="cz-map">${mapMarkup || esc(t('cz.mapMissing'))}</div>`;
}
