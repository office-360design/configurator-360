// Interfața configuratorului. Folosește createEngine (din bundle) și datele injectate în #data.
const DATA = JSON.parse(document.getElementById('data').textContent);
const engine = createEngine(DATA);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 0) => (x == null || isNaN(x) ? '–' : Number(x).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
const nums = (s) => String(s).split(/[;\s]+|,(?=\s)|,(?=\d{3,})/).map((x) => parseFloat(String(x).replace(',', '.'))).filter((x) => x > 0);
const pill = (lvl, t) => `<span class="pill ${lvl}">${esc(t)}</span>`;
const LVL = { ok: 'OK', warn: 'Atenție', bad: 'Nu trece' };
const RULES = DATA.rules;
const RKEY = { TP52: 'tp52', SG52: 'sg52', TPH52: 'tph52', TPV52: 'tpv52', ST52: 'st52', SST52: 'sst52', SKY: 'skylight' };
const EDGE = { pressure: 'presor + capac', clip: 'cleme + profil U', frame: 'ramă proprie', silicone: 'silicon pe garnitură de fund' };

// ── exemple de pornire (aceleași ca tests/examples.js) ───────────────────────────
const grid = { widths: [1500, 1500, 1500], heights: [1150, 2350], anchorSpacing: 3500 };
const EXAMPLES = {
  TP52: { system: 'TP52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard – nivel 1', totalMm: 32, panesMm: 12, ug: 1.0 }, options: { cap: 'COR-9142' } },
  SG52: { system: 'SG52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard siliconat – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 } },
  TPH52: { system: 'TPH52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 }, options: { cap: 'COR-9142' } },
  TPV52: { system: 'TPV52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 }, options: { cap: 'COR-9142' } },
  ST52: { system: 'ST52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', totalMm: 28, panesMm: 12, ug: 1.0 }, options: { clipFix: 'injecție' } },
  SST52: { system: 'SST52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', totalMm: 28, panesMm: 12, ug: 1.0 }, options: { clipFix: 'injecție' } },
  SKY: { system: 'SKY', grid: { widths: [1200, 1200, 1200], heights: [1800, 1800], anchorSpacing: 3600 }, loads: { windKPa: 0.6, snowKPa: 1.6, slopeDeg: 15 }, glass: { variant: 'Acoperiș', totalMm: 32, panesMm: 12, ug: 1.0 }, options: { skyTransomJoint: 'silicone', cap: 'COR-9142' } },
};
let P = structuredClone(EXAMPLES.TP52);
try { const s = localStorage.getItem('cortizo-project'); if (s) P = JSON.parse(s); } catch (e) { /* stocare indisponibilă */ }

// ── bara de sisteme ──────────────────────────────────────────────────────────────
function renderSysbar() {
  $('sysbar').innerHTML = engine.systems.map((s) => `<button type="button" data-sys="${s.id}" aria-pressed="${s.id === P.system}">${esc(s.name)}</button>`).join('');
  $('sysbar').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { P = structuredClone(EXAMPLES[b.dataset.sys]); renderAll(); }));
}

// ── formularul, adaptat sistemului ───────────────────────────────────────────────
function field(id, label, inner, hint = '') {
  return `<label for="${id}">${label}${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}
const inp = (id, val, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${esc(val)}" ${extra}>`;
const sel = (id, opts, val) => `<select id="${id}">${opts.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;

function renderForm() {
  const sysId = P.system, R = RULES[RKEY[sysId]], sysDef = engine.systems.find((s) => s.id === sysId);
  const opts = engine.options(sysId);
  if (!opts.find((o) => o.variant === P.glass.variant)) P.glass.variant = opts[0].variant;
  const vo = opts.find((o) => o.variant === P.glass.variant);
  const usesInner = ['SG52', 'TPH52', 'TPV52'].includes(sysId);
  const panes = vo.panes;
  if (usesInner && !panes.find((p) => p.inner === P.glass.innerPane)) P.glass.innerPane = panes[0].inner;
  const thk = (panes.find((p) => p.inner === (usesInner ? P.glass.innerPane : '')) || panes[0]).thicknesses;
  if (!thk.includes(+P.glass.totalMm)) P.glass.totalMm = thk.includes(32) ? 32 : thk[0];
  const sky = sysId === 'SKY', clip = ['SG52', 'TPH52', 'TPV52'].includes(sysId), frame = ['ST52', 'SST52'].includes(sysId);
  const dry = /uscată/.test(P.glass.variant);
  P.options = P.options || {};
  let h = '';
  h += `<fieldset style="border-top:0;padding-top:0"><legend>Grila ${sky ? 'acoperișului' : 'fațadei'}</legend>
    ${field('w', 'Lățimi module, de la stânga [mm]', inp('w', P.grid.widths.join(', ')), sky ? 'Distanța între axele căpriorilor.' : 'Distanța între axele montanților.')}
    ${field('h', sky ? 'Rânduri, de la coamă spre streașină [mm]' : 'Înălțimi rânduri, de sus în jos [mm]', inp('h', P.grid.heights.join(', ')), sky ? 'Măsurate în lungul pantei.' : 'Distanța între axele traverselor.')}
    ${field('L', sky ? 'Deschiderea căpriorului între reazeme [mm]' : 'Distanța între ancoraje [mm]', inp('L', P.grid.anchorSpacing, 'number', 'min="500" step="50"'))}
    <span class="hint-inline">Apăsați pe un câmp din elevație ca să-l schimbați în fereastră${R.blind_panel || ['TPH52', 'TPV52'].includes(sysId) ? ' sau panou opac' : ''}.</span>
  </fieldset>`;
  h += `<fieldset><legend>Încărcări</legend><div class="two">
    ${field('q', 'Vânt caracteristic [kN/m²]', inp('q', P.loads.windKPa, 'number', 'min="0.1" step="0.05"'))}
    ${sky ? field('sn', 'Zăpadă [kN/m²]', inp('sn', P.loads.snowKPa ?? 1.6, 'number', 'min="0" step="0.1"')) : ''}
    ${sky ? field('sl', `Pantă [°] (${R.slope_deg.min}–${R.slope_deg.max})`, inp('sl', P.loads.slopeDeg ?? 15, 'number', 'min="0" max="60" step="1"')) : ''}
    </div>
    <label for="cam"><span style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input id="cam" type="checkbox" style="width:auto"${P.options.allowReinforcement ? ' checked' : ''}> Permite cămașă de armare</span></label>
    ${clip || frame ? '<span class="hint-inline">Clemele se verifică la vântul de calcul = caracteristic × 1,5 (pag. 678).</span>' : ''}
  </fieldset>`;
  h += `<fieldset><legend>Sticlă</legend>
    ${opts.length > 1 ? field('var', 'Variantă', sel('var', opts.map((o) => o.variant), P.glass.variant)) : ''}
    <div class="two">
      ${usesInner ? field('inner', 'Foaie interioară', sel('inner', panes.map((p) => p.inner), P.glass.innerPane)) : ''}
      ${field('gt', 'Pachet total [mm]', sel('gt', thk, P.glass.totalMm))}
      ${field('gp', 'Foi de sticlă [mm]', inp('gp', P.glass.panesMm, 'number', 'min="4" step="1"'), 'suma foilor, fără camere')}
      ${clip ? field('go', 'Foaie exterioară [mm]', inp('go', P.glass.outerPaneMm ?? 8, 'number', 'min="6" step="1"')) : ''}
      ${clip ? field('gc', 'Cameră [mm]', sel('gc', [16, 18, 20], P.glass.chamberMm ?? 16)) : ''}
      ${field('ug', 'Ug [W/m²K]', inp('ug', P.glass.ug ?? 1.0, 'number', 'min="0.5" max="3" step="0.1"'))}
    </div>
    ${clip && dry ? field('dsil', 'Silicon profil U (garnitură uscată)', sel('dsil', ['SG-500', 'SG-550', 'IG-25 HM Plus'], P.options.drySilicone || 'SG-550')) : ''}
  </fieldset>`;
  h += `<fieldset><legend>Finisaj și execuție</legend>
    ${R.caps ? field('cap', 'Capac exterior', sel('cap', R.caps.filter((c) => c.code).map((c) => [c.code, `${c.code} · ${c.label}`]), P.options.cap || R.caps[0].code)) : ''}
    ${frame ? field('cf', 'Colțuri ramă', sel('cf', R.glass_frame.cleats.map((c) => [c.option, `${c.option} (pag. ${c.page})`]), P.options.clipFix || 'injecție')) : ''}
    ${sky ? field('stj', 'Rost pe traversele din acoperiș', sel('stj', [['silicone', 'silicon pe garnitură de fund (pag. 1234)'], ['inclined_cover', 'capac înclinat COR-9935 (pag. 1278)']], P.options.skyTransomJoint || 'silicone')) : ''}
    <div class="two">
      ${field('bar', 'Lungime bară [mm]', inp('bar', P.options.barMm ?? 6500, 'number', 'step="100"'))}
      ${field('kerf', 'Tăietură [mm]', inp('kerf', P.options.kerfMm ?? 5, 'number', 'step="1"'))}
    </div>
  </fieldset>
  <div class="flex"><button type="button" class="btn" id="reset">Exemplul ${esc(sysDef.name)}</button><button type="button" class="btn" id="copyjson">Copiază proiectul (JSON)</button><button type="button" class="btn" id="copycsv">Copiază lista (CSV)</button></div>`;
  $('f').innerHTML = h;
  $('principle').innerHTML = `<b>${esc(sysDef.name)}</b> · pag. ${esc(R.pages)}<br>${esc(R.principle)}<div class="edges">${Object.entries(R.edges || {}).map(([k, v]) => `<span>${{ vertical: 'verticală', horizontal: 'orizontală', rafter: 'căpriori', roof_transom: 'traverse acoperiș', vertical_wall: 'perete vertical' }[k] || k}: ${EDGE[v] || v}</span>`).join('')}<span>sticlă max. ${R.max_glass_mm} mm</span>${R.tests ? `<span>teste: aer ${esc(R.tests.air)} · apă ${esc(R.tests.water)} · vânt ${esc(R.tests.wind)}</span>` : ''}</div>`;
  $('reset').addEventListener('click', () => { P = structuredClone(EXAMPLES[P.system]); renderAll(); });
  $('copyjson').addEventListener('click', () => copyText(JSON.stringify(P, null, 2), 'Proiectul a fost copiat'));
  $('copycsv').addEventListener('click', () => copyText(toCSV(lastResult), 'Lista a fost copiată'));
}

function readForm() {
  const v = (id) => $(id)?.value;
  P.grid = { widths: nums(v('w')), heights: nums(v('h')), anchorSpacing: +v('L') || 3500 };
  P.loads = { windKPa: +v('q') || 1, ...(P.system === 'SKY' ? { snowKPa: +v('sn') || 0, slopeDeg: +v('sl') || 15 } : {}) };
  const prevVariant = P.glass.variant, prevInner = P.glass.innerPane;
  P.glass = { ...P.glass, variant: v('var') ?? P.glass.variant, innerPane: v('inner') ?? P.glass.innerPane, totalMm: +v('gt'), panesMm: +v('gp') || 12, ug: +v('ug') || 1, ...(v('go') ? { outerPaneMm: +v('go') } : {}), ...(v('gc') ? { chamberMm: +v('gc') } : {}) };
  P.options = { ...P.options, allowReinforcement: $('cam').checked, barMm: +v('bar') || 6500, kerfMm: +v('kerf') || 0, ...(v('cap') ? { cap: v('cap') } : {}), ...(v('cf') ? { clipFix: v('cf') } : {}), ...(v('stj') ? { skyTransomJoint: v('stj') } : {}), ...(v('dsil') ? { drySilicone: v('dsil') } : {}) };
  // câmpurile speciale în afara grilei noi se elimină
  P.fields = (P.fields || []).filter((f) => f.row < P.grid.heights.length && f.col < P.grid.widths.length);
  return prevVariant !== P.glass.variant || prevInner !== P.glass.innerPane;
}

// ── rezultate ─────────────────────────────────────────────────────────────────────
let lastResult = null;
function elev(R) {
  const W = R.geometry.widths, Hs = R.geometry.heights, tw = R.geometry.Wtot, th = R.geometry.Htot;
  const VW = 760, pad = { l: 56, r: 16, t: 46, b: 28 }; const sc = Math.min((VW - pad.l - pad.r) / tw, 440 / th); const Ht = th * sc + pad.t + pad.b;
  const ev = R.system.edges;
  let o = `<svg class="elev" viewBox="0 0 ${VW} ${Ht.toFixed(0)}" role="img" aria-label="Elevația, cu starea fiecărui câmp. Apăsați pe un câmp pentru a-i schimba tipul.">`;
  let y = pad.t;
  Hs.forEach((h, i) => { let x = pad.l; W.forEach((w, j) => {
    const f = R.fields.find((ff) => ff.i === i && ff.j === j);
    const fill = f.status === 'ok' ? 'var(--glass)' : f.status === 'warn' ? 'var(--warn-soft)' : 'var(--bad-soft)';
    const cx = x + w * sc / 2, cy = y + h * sc / 2;
    o += `<g class="cell" data-i="${i}" data-j="${j}" tabindex="0" role="button" aria-label="Câmp rând ${i + 1}, coloana ${j + 1}: ${f.type}"><rect x="${x + 3}" y="${y + 3}" width="${w * sc - 6}" height="${h * sc - 6}" fill="${fill}" stroke="none"/>`;
    if (f.type === 'window') o += `<polyline points="${x + 10},${y + 10} ${cx},${y + h * sc - 10} ${x + w * sc - 10},${y + 10}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 3"/>`;
    if (f.type === 'panel') o += `<rect x="${x + 8}" y="${y + 8}" width="${w * sc - 16}" height="${h * sc - 16}" fill="var(--alu)" opacity=".35"/>`;
    if (w * sc > 60 && h * sc > 34) o += `<text x="${cx}" y="${cy - 3}" font-size="11" text-anchor="middle" fill="currentColor">${fmt(f.kg)} kg</text><text x="${cx}" y="${cy + 11}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(f.label)}</text>`;
    o += '</g>'; x += w * sc; });
    o += `<text x="${pad.l - 8}" y="${y + h * sc / 2 + 4}" font-size="10.5" text-anchor="end" fill="var(--muted)">${h}</text>`; y += h * sc; });
  y = pad.t;
  for (let k = 0; k <= Hs.length; k++) { const silicone = ev.h === 'clip' || ev.h === 'silicone' || ev.h === 'frame'; o += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + tw * sc}" y2="${y}" stroke="${silicone ? 'var(--muted)' : 'var(--alu)'}" stroke-width="${silicone ? 2 : 5}"/>`; y += (Hs[k] || 0) * sc; }
  let x = pad.l;
  R.axes.forEach((a, j) => { const thin = ev.v === 'clip' || ev.v === 'frame';
    o += `<line x1="${x}" y1="${pad.t - 4}" x2="${x}" y2="${pad.t + th * sc + 4}" stroke="${thin ? 'var(--muted)' : 'var(--ink)'}" stroke-width="${thin ? 2 : 5}"/>`;
    o += `<text x="${x}" y="${pad.t - 24}" font-size="10" text-anchor="middle" fill="var(--muted)">M${j + 1}</text><text x="${x}" y="${pad.t - 11}" font-size="10" text-anchor="middle" fill="currentColor">${fmt(a.need)}</text>`;
    x += (W[j] || 0) * sc; });
  x = pad.l; W.forEach((w) => { o += `<text x="${x + w * sc / 2}" y="${pad.t + th * sc + 20}" font-size="10.5" text-anchor="middle" fill="var(--muted)">${w}</text>`; x += w * sc; });
  return o + '</svg>';
}

function render(R) {
  lastResult = R;
  const m = R.mullion, t = R.transom, sky = R.system.id === 'SKY';
  const nb = R.fields.filter((f) => f.status === 'bad').length, nw = R.fields.filter((f) => f.status === 'warn').length;
  let h = `<div class="kpis">
    <div class="kpi"><div class="l">${sky ? 'Căprior' : 'Montant'}</div><div class="v">${m ? esc(m.code) : 'niciunul'}</div><div class="s">${m ? `${m.depth} mm${m.reinforced ? ' + ' + esc(m.reinforcement) : ''} · Ix ${fmt(m.Ix, 1)} ≥ ${fmt(m.need, 1)}` : `Ix necesar ${fmt(Math.max(...R.axes.map((a) => a.need)), 1)} cm⁴`}</div></div>
    <div class="kpi"><div class="l">Traversă</div><div class="v">${t ? esc(t.code) : '–'}</div><div class="s">${t ? `Ix ${fmt(t.Ix, 1)} · necesar ${fmt(t.need, 1)}` : ''}</div></div>
    <div class="kpi"><div class="l">Câmpuri</div><div class="v">${R.fields.length - nb - nw} / ${R.fields.length}</div><div class="s">${nw ? nw + ' cu atenționări · ' : ''}${nb ? nb + ' nu trec' : 'fără probleme'}</div></div>
    <div class="kpi"><div class="l">Aluminiu</div><div class="v">${fmt(R.totals.kgAluminium)} kg</div><div class="s">${fmt(R.totals.kgAluminium / R.totals.facadeM2, 1)} kg/m² · vopsire ${fmt(R.totals.paintM2, 1)} m²</div></div>
    ${R.ucw ? `<div class="kpi"><div class="l">Ucw</div><div class="v">${fmt(R.ucw.ucw, 1)}</div><div class="s">W/m²K la Ug ${fmt(R.ucw.ug, 1)} (pag. 12)</div></div>` : ''}
  </div>`;
  h += `<div class="panel"><h3>Verificări</h3><div class="tbl"><table><tbody>${R.checks.map((c) => `<tr><td>${pill(c.level, LVL[c.level])}</td><td><b>${esc(c.title)}</b></td><td>${esc(c.text)}${c.page ? ` <span class="hint-inline">pag. ${c.page}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  const problems = R.fields.filter((f) => f.notes.length);
  h += `<div class="panel"><h3>${sky ? 'Plan acoperiș' : 'Elevație'} · Ix necesar pe fiecare ${sky ? 'căprior' : 'montant'} [cm⁴]</h3>${elev(R)}
    <div class="legend-row"><span><i class="sw" style="background:var(--glass);border-color:var(--glass)"></i>OK</span><span><i class="sw" style="background:var(--warn-soft);border-color:var(--warn)"></i>atenție</span><span><i class="sw" style="background:var(--bad-soft);border-color:var(--bad)"></i>nu trece</span><span>linie groasă = presor · linie subțire = rost cu cleme / silicon / ramă</span></div>
    ${problems.length ? `<div class="tbl" style="margin-top:10px"><table><tbody>${problems.map((f) => `<tr><td class="code">R${f.i + 1}·C${f.j + 1}</td><td>${f.notes.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  h += `<div class="panel"><h3>${sky ? 'Căpriori' : 'Montanți și ancoraje'}</h3><div class="tbl"><table><thead><tr><th>Ax</th><th class="n">b [mm]</th><th class="n">Ix nec. [cm⁴]</th><th class="n">Greutate / deschidere [kg]</th><th class="n">Orizontal [kN]</th><th>Ancoraje</th></tr></thead><tbody>${R.axes.map((a, i) => `<tr><td>M${i + 1}</td><td class="n">${fmt(a.b)}</td><td class="n">${fmt(a.need, 1)}</td><td class="n">${fmt(a.Rv)}</td><td class="n">${fmt(a.Rh, 2)}</td><td>${sky ? pill('warn', 'ghidaj perete') : a.anchors ? pill('ok', a.anchors + ' × 999183') : pill('bad', 'peste 3')}</td></tr>`).join('')}</tbody></table></div></div>`;
  const f0 = R.fields.find((f) => f.type !== 'window') || R.fields[0];
  const roleNames = { mullionGasket: 'Garnitură montant', transomGasket: 'Garnitură traversă', reducer: 'Reductor falț', supportStd: sky ? 'Tăviță sprijin (M1)' : 'Suport standard', supportHeavy: 'Suport sarcini mari', supportCross: 'Suport în cruce', block: 'Cală', rpt: 'Izolator RPT', rptTransom: 'Izolator traversă', pressureScrew: 'Șurub presor', pressureGasket: 'Garnitură presor', pipette: 'Pipetă', clipDouble: 'Clemă dublă', clipSingle: 'Clemă simplă', clipScrew: 'Șurub clemă', backer: 'Garnitură fund (silicon)', dryGasket: 'Garnitură uscată', sashGasket: 'Garnitură geam' };
  const rows = Object.entries(f0.roles).filter(([k, v]) => roleNames[k] && v && (!Array.isArray(v) || v.length)).map(([k, v]) => [roleNames[k], Array.isArray(v) ? v.join(' / ') : v]);
  h += `<div class="panel"><h3>Componente de vitraj · ${esc(P.glass.variant)}${P.glass.innerPane ? ' · ' + esc(P.glass.innerPane) : ''} · ${P.glass.totalMm} mm</h3><div class="tbl"><table><thead><tr><th>Rol</th><th>Referință</th><th>Descriere</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="code">${esc(b)}</td><td>${esc(b.split(/[+/]/).map((c) => c.trim()).map((c) => DATA.catalog.accessories.find((x) => x.code === c)?.desc_es || DATA.catalog.profiles.find((x) => x.code === c)?.desc_es || '').filter(Boolean).join(' + '))}</td></tr>`).join('') || '<tr><td colspan="3">Componentele acestui sistem vin din regulile ramei (vezi lista de accesorii).</td></tr>'}</tbody></table></div></div>`;
  h += `<div class="panel"><h3>Debitare · bare de ${fmt(R.input.options?.barMm ?? 6500)} mm</h3><div class="tbl"><table><thead><tr><th>Cod</th><th>Descriere</th><th>Rol</th><th>Lungimi [mm]</th><th class="n">Buc.</th><th class="n">m</th><th class="n">Bare</th><th class="n">Pierdere</th><th class="n">kg</th></tr></thead><tbody>${R.cuts.map((c) => `<tr><td class="code">${esc(c.code)}</td><td>${esc(c.desc)}</td><td>${esc(c.notes.join('; '))}</td><td class="code">${c.lengths.map((l) => fmt(l, l % 1 ? 1 : 0)).join(', ')}${c.overLength.length ? ' ' + pill('bad', 'peste bară') : ''}</td><td class="n">${c.n}</td><td class="n">${fmt(c.m, 2)}</td><td class="n">${c.bars}</td><td class="n">${fmt(c.waste * 100)} %</td><td class="n">${c.kg == null ? '–' : fmt(c.kg, 1)}</td></tr>`).join('')}</tbody></table></div></div>`;
  h += `<div class="panel"><h3>Accesorii</h3><div class="tbl"><table><thead><tr><th>Cod</th><th>Descriere</th><th class="n">Cantitate</th><th>Regulă de consum</th></tr></thead><tbody>${R.accessories.map((a) => `<tr><td class="code">${esc(a.code)}</td><td>${esc(a.desc)}</td><td class="n">${a.unit === 'm' ? fmt(a.qty, 1) + ' m' : fmt(a.qty) + ' buc'}</td><td>${esc(a.rules.join('; '))}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (R.notes.length) h += `<div class="panel"><h3>Note</h3>${R.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}</div>`;
  h += `<p class="note">Predimensionare cu valorile de serviciu din catalog (grindă simplu rezemată, E = 70.000 N/mm², săgeată L/200 max. 15 mm). Consumurile de garnituri, cale și pipete sunt reguli de lucru. Nu înlocuiește calculul static al proiectantului. Catalogul nu conține prețuri.</p>`;
  $('out').innerHTML = h;
  $('out').querySelectorAll('.cell').forEach((g) => {
    const act = () => cycleField(+g.dataset.i, +g.dataset.j);
    g.addEventListener('click', act); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
}

function cycleField(i, j) {
  const R = RULES[RKEY[P.system]];
  const types = ['glass']; if (R.awning_window || R.roof_window) types.push('window'); if (['TP52', 'TPH52', 'TPV52'].includes(P.system)) types.push('panel');
  P.fields = P.fields || [];
  const cur = P.fields.find((f) => f.row === i && f.col === j)?.type || 'glass';
  const next = types[(types.indexOf(cur) + 1) % types.length];
  P.fields = P.fields.filter((f) => !(f.row === i && f.col === j));
  if (next !== 'glass') P.fields.push({ row: i, col: j, type: next });
  run();
}

function toCSV(R) {
  if (!R) return '';
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['tip', 'cod', 'descriere', 'cantitate', 'unitate', 'bare', 'kg', 'lungimi_mm'].join(';')];
  R.cuts.forEach((c) => lines.push(['profil', c.code, q(c.desc), c.m.toFixed(2), 'm', c.bars, c.kg?.toFixed(1) ?? '', q(c.lengths.join(' '))].join(';')));
  R.accessories.forEach((a) => lines.push(['accesoriu', a.code, q(a.desc), a.qty, a.unit, '', '', ''].join(';')));
  return lines.join('\n');
}

function copyText(text, msg) {
  const done = () => toast(msg);
  try { navigator.clipboard.writeText(text).then(done, () => fallback()); } catch (e) { fallback(); }
  function fallback() { const ta = document.createElement('textarea'); ta.className = 'copy'; ta.value = text; $('out').prepend(ta); ta.select(); toast('Selectați textul și copiați-l manual'); }
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2200); }

function run() {
  try {
    if (!P.grid.widths.length || !P.grid.heights.length) { $('out').innerHTML = '<p class="note">Introduceți cel puțin o lățime și o înălțime, separate prin virgulă.</p>'; return; }
    render(engine.compute(P));
    try { localStorage.setItem('cortizo-project', JSON.stringify(P)); } catch (e) { /* ignorat */ }
  } catch (e) { $('out').innerHTML = `<p class="note">Nu am putut calcula: ${esc(e.message)}</p>`; }
}
function renderAll() { renderSysbar(); renderForm(); run(); }
$('f').addEventListener('change', () => { const reform = readForm(); if (reform) renderForm(); run(); });
$('f').addEventListener('input', (e) => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { readForm(); run(); } });
$('f').addEventListener('submit', (e) => e.preventDefault());

// ── fila Sisteme ─────────────────────────────────────────────────────────────────
function renderSystemsTab() {
  const cols = ['TP52', 'SG52', 'TPH52', 'TPV52', 'ST52', 'SST52', 'SKY'];
  const glassDed = { TP52: 'L−22 × H−22', SG52: 'L−22 × H−22', TPH52: 'L−22 × H−22', TPV52: 'L−22 × H−22', ST52: 'L−22 × H−22', SST52: 'L−60 × H−60', SKY: 'L−22 × H−22' };
  const vert = { TP52: 'presor + capac', SG52: 'cleme + profil U', TPH52: 'cleme + profil U', TPV52: 'presor + capac', ST52: 'ramă lipită', SST52: 'ramă cu ornament', SKY: 'presor + capac (căpriori)' };
  const hor = { TP52: 'presor + capac', SG52: 'cleme + profil U', TPH52: 'presor + capac', TPV52: 'cleme + profil U', ST52: 'ramă lipită', SST52: 'ramă cu ornament', SKY: 'silicon pe garnitură K' };
  const table = 'Tabel vitraj';
  const tbl = { TP52: 'TP (pag. 305–315)', SG52: 'SG pe foaie interioară (582–601)', TPH52: 'TPH + TP (777–801)', TPV52: 'TPV + SG (785–787)', ST52: 'suport după grosime (1029)', SST52: 'garnitură + reductor (1113)', SKY: 'acoperiș (1233–1235)' };
  const spec = { TP52: 'fereastră pag. 393 · zonă oarbă pag. 388', SG52: 'pas cleme · profil U în geam · limite geam (671–674)', TPH52: 'cleme doar pe verticală', TPV52: 'cleme doar pe orizontală', ST52: 'silicon structural · cuplaj COR-9971', SST52: 'fără silicon structural · vânt 1200 Pa', SKY: 'zăpadă + pantă · streașină COR-9912' };
  const row = (label, f) => `<tr><th>${label}</th>${cols.map((c) => `<td>${esc(f(c))}</td>`).join('')}</tr>`;
  $('cmp').innerHTML = `<thead><tr><th></th>${cols.map((c) => `<th>${esc(engine.systems.find((s) => s.id === c).name)}</th>`).join('')}</tr></thead><tbody>
    ${row('Verticală', (c) => vert[c])}${row('Orizontală', (c) => hor[c])}${row('Sticlă max.', (c) => RULES[RKEY[c]].max_glass_mm + ' mm')}${row('Sticlă =', (c) => glassDed[c])}${row(table, (c) => tbl[c])}
    ${row('Apă / vânt', (c) => { const t = RULES[RKEY[c]].tests; return `${t.water} / ${t.wind}`; })}${row('Specific', (c) => spec[c])}</tbody>`;
  const cards = [
    ['TP 52', 'Presorul preia vântul pe toate laturile, deci nu există verificare de cleme.', ['Debitare: traversă L−22, presor L−58, capac L−53 (pag. 379).', 'Componente din tabelul TP după grosimea pachetului; suport 4a/4b/4c.', 'Șuruburi de presor la 30 mm de capăt, apoi la max. 250 mm.', 'Variante: nivel 1, nivel 2, High Insulation, RC3 (sticlă P5A).']],
    ['SG 52', 'Vântul e preluat de cleme, deci pasul clemelor și dimensiunea geamului devin verificări de sine stătătoare.', ['Pas cleme din graficul pag. 678, la vânt × 1,5.', 'Clemă dublă pe rosturi interioare, simplă pe margine; mărimea după foaia interioară.', 'Profil U COR-9956 în camera de 16/18/20 mm, 1 bucată ≤ 1800 mm, altfel 2.', 'Limite geam: 4,5 m pe latură, L + H ≤ 6,5 m; la garnitură uscată lățimea după silicon.']],
    ['TPH 52', 'Combină TP pe orizontală cu SG pe verticală; folosește două tabele de vitraj.', ['Presor + capac pe traverse, cu deducerile TP.', 'Cleme și profil U doar pe laturile verticale.', 'Suporții și calele vin din tabelul TP, pentru că geamul stă pe presor.']],
    ['TPV 52', 'Inversul TPH: presor pe montanți, cleme pe orizontală, deci suportul și clemele sunt pe aceeași latură.', ['Presor vertical COR-9914 cu prelucrare TPV (pag. 897).', 'Cleme, suporți și garnitura de fund din tabelul SG cu aceeași foaie interioară.', 'Pipete la traversa de jos, ca la TP.']],
    ['ST 52', 'Sticla nu atinge structura: e lipită în atelier pe o ramă care se agață pe cleme și suporți.', ['Ramă COR-9982 L−22 × H−22 la 45°, cu platbandă COR-7298 pentru siliconul structural.', 'Suport de sticlă după grosimea geamului (999204…999191), 2 bucăți la L/10.', 'Cuplaj COR-9971 L−28,5, șuruburi la max. 250 mm; cleme 999030 pe 3 laturi.', 'Sticlă max. 38 mm.']],
    ['SST 52', 'Ca ST, dar geamul e ținut mecanic de ornamentul ramei, fără silicon structural.', ['Ramă COR-9983 L−22 × H−22; sticla e L−60 × H−60.', 'Garnitură și reductor după grosime (pag. 1113); sticlă max. 28 mm.', 'Capacitatea suportului COR-9942 nu e în catalog: câmpurile rămân cu atenționare.', 'Vânt testat 1200 Pa.']],
    ['Lucernario – Veranda', 'Singurul sistem cu zăpadă, pantă și etanșare diferită pe orizontală, ca apa să curgă liber.', ['q⊥ = vânt + zăpadă·cos²α + sticlă·cosα pentru căpriori și traverse.', 'Tăvițele de sprijin preiau doar componenta în lungul pantei.', 'Căpriori COR-9804…9810, pantă 7°–40°.', 'Îmbinare streașină cu cămașa COR-9912: L1 = A/cos(β/2), L2 = L1 + 200/tan(90° − β/2).']],
  ];
  $('cards').innerHTML = cards.map(([t, d, li]) => `<div class="panel"><h3>${esc(t)}</h3><p class="diff">${esc(d)}</p><ul>${li.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
}

// ── file ─────────────────────────────────────────────────────────────────────────
document.querySelectorAll('nav.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav.tabs button').forEach((x) => { const on = x === b; x.setAttribute('aria-selected', on); $(x.getAttribute('aria-controls')).hidden = !on; });
  try { localStorage.setItem('cortizo-tab', b.id); } catch (e) { /* ignorat */ }
}));
try { const t = localStorage.getItem('cortizo-tab'); if (t && $(t)) $(t).click(); } catch (e) { /* ignorat */ }
const hashTab = { '#sisteme': 't-sys', '#harta': 't-map', '#configurator': 't-cfg' }[location.hash];
if (hashTab) $(hashTab).click();
renderSystemsTab();
renderAll();
