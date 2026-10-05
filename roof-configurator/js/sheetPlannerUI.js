import { localizeFeature, featureText, featureLocale, translatedMarkup } from './featureI18n.js?v=connect-29';
import { planRoofSheets, sheetProfiles, sheetPlanCsv } from './sheetPlanner.js?v=connect-29';
import { presetRoofLayout } from './presetLayout.js?v=layout-21';
import { defaultLayout } from './roofLayout.js?v=layout-21';

const fields = [
  ['width', 'Total width (mm)'], ['usefulWidth', 'Usable width (mm)'],
  ['module', 'Module length (mm)'], ['endOverlap', 'End overlap / allowance (mm)'],
  ['minModules', 'Min. modules per sheet'], ['maxModules', 'Max. modules per sheet'],
  ['maxLength', 'Max. sheet length (mm)'], ['kgPerM2', 'Weight (kg/m²)'], ['minPitch', 'Minimum pitch (°)'],
];
const formatNumber = (value, locale) => value.toLocaleString(featureLocale(locale), { maximumFractionDigits: 2 });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const polygonPath = polygon => polygon.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z';
const points = polygon => polygon.map(p => `${p.x},${-p.y}`).join(' ');
const table = rows => `<div class="sheet-table-wrap"><table><thead><tr>${rows[0].map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const lengthTable = (groups, locale) => table([
  ['Length (mm)', 'Modules / sheet', 'Quantity', 'Piece IDs'],
  ...groups.map(g => [formatNumber(g.length, locale), g.modules, g.count, g.ids.join(', ')]),
]);

export function slopeDiagram(slope, profile, locale = 'en-US') {
  const pad = Math.max(slope.width, slope.height, 1) * 0.09;
  const stockTop = Math.max(slope.height, ...slope.pieces.map(p => p.y + p.length / 1000));
  const side = profile.width / 1000;
  const minX = Math.min(0, ...slope.pieces.map(p => p.stockX));
  const maxX = Math.max(slope.width, ...slope.pieces.map(p => p.stockX + side));
  const font = Math.max(0.06, Math.min(0.22, profile.usefulWidth / 1000 * 0.22));
  return `<svg class="sheet-diagram" viewBox="${minX - pad} ${-stockTop - pad} ${maxX - minX + 2 * pad} ${stockTop + 2.5 * pad}" role="img" aria-label="Unfolded cutting plan for slope ${slope.id}">
    ${slope.pieces.map((piece, i) => `<g>
      <rect x="${piece.stockX}" y="${-piece.y - piece.length / 1000}" width="${side}" height="${piece.length / 1000}" fill="none" stroke="#94a3b8" stroke-width=".012" stroke-dasharray=".06 .04"/>
      <path d="${piece.polygons.map(poly => polygonPath(poly.map(p => ({ x: p.x, y: -p.y })))).join(' ')}" fill="${i % 2 ? '#bfdbfe' : '#dbeafe'}"/>
      <rect x="${piece.x}" y="${-piece.y - piece.coverageLength}" width="${profile.usefulWidth / 1000}" height="${piece.coverageLength}" fill="none" stroke="#2563eb" stroke-width=".014"/>
      <text x="${piece.x + profile.usefulWidth / 2000}" y="${-piece.y - piece.coverageLength / 2}" font-size="${font}" text-anchor="middle" fill="#12345a" paint-order="stroke" stroke="white" stroke-width=".035">${piece.id}<tspan x="${piece.x + profile.usefulWidth / 2000}" dy="${font * 1.3}">${(piece.length / 1000).toLocaleString(featureLocale(locale), { maximumFractionDigits: 3 })} m</tspan></text>
      <title>${piece.id}: ${piece.modules} modules, ${piece.length} mm stock length</title>
    </g>`).join('')}
    ${slope.outline.map(edge => `<polyline points="${points(edge)}" fill="none" stroke="#0f172a" stroke-width=".025"/>`).join('')}
    <text x="${slope.reverse ? slope.width : 0}" y="${pad * 0.75}" font-size="${font * 1.1}" text-anchor="${slope.reverse ? 'end' : 'start'}" fill="#1d4ed8">↑ START · ${slope.reverse ? 'right to left ←' : 'left to right →'}</text>
  </svg>`;
}

function overview(plan) {
  const vertices = plan.slopes.flatMap(s => s.planPolygons.flat());
  const minX = Math.min(...vertices.map(p => p.x)), maxX = Math.max(...vertices.map(p => p.x));
  const minZ = Math.min(...vertices.map(p => p.z)), maxZ = Math.max(...vertices.map(p => p.z));
  const pad = Math.max(maxX - minX, maxZ - minZ) * 0.07;
  return `<svg class="sheet-overview" viewBox="${minX - pad} ${minZ - pad} ${maxX - minX + 2 * pad} ${maxZ - minZ + 2 * pad}" role="img" aria-label="Roof plan with covering slope labels">
    ${plan.slopes.map((slope, i) => {
      // Largest triangle centroid keeps labels inside concave slopes and outside dormer holes.
      const triangle = slope.planPolygons.reduce((best, p) => {
        const size = t => Math.abs((t[1].x - t[0].x) * (t[2].z - t[0].z) - (t[2].x - t[0].x) * (t[1].z - t[0].z));
        return size(p) > size(best) ? p : best;
      });
      const x = triangle.reduce((sum, p) => sum + p.x, 0) / 3, z = triangle.reduce((sum, p) => sum + p.z, 0) / 3;
      const color = ['#bfdbfe', '#a7f3d0', '#fde68a', '#ddd6fe'][i % 4];
      return `<path d="${slope.planPolygons.map(poly => polygonPath(poly.map(p => ({ x: p.x, y: p.z })))).join(' ')}" fill="${color}"/><text x="${x}" y="${z}" text-anchor="middle" dominant-baseline="middle" font-size="${pad * .6}" font-weight="700" fill="#0f172a" paint-order="stroke" stroke="white" stroke-width=".04">${slope.id}</text>`;
    }).join('')}
  </svg>`;
}

export class SheetPlannerUI {
  constructor(state) {
    this.state = state;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'sheet-planner';
    this.dialog.setAttribute('aria-labelledby', 'sheetPlanTitle');
    this.dialog.innerHTML = `<header><div><small>ROOF COVERING</small><h2 id="sheetPlanTitle">Sheet cutting plan</h2></div><button type="button" data-sheet="close" aria-label="Close sheet planner">×</button></header>
      <div class="sheet-actions">
        <span class="sheet-update-note" role="status">Generate a cutting plan from the settings below.</span>
        <button type="submit" form="sheetPlanSettings" class="sheet-primary">Generate plan</button>
      </div>
      <p class="sheet-error" role="alert" hidden></p>
      <div class="sheet-workspace"><form id="sheetPlanSettings" class="sheet-settings">
        <label>Profile<select name="preset"><option value="antic">350 mm profile</option><option value="clasic">365 mm profile</option><option value="custom">Custom profile</option></select></label>
        <div class="sheet-fields">${fields.map(([key, label]) => `<label>${label}<input type="number" name="${key}" step="${['minModules', 'maxModules'].includes(key) ? '1' : 'any'}" required></label>`).join('')}</div>
        <p class="sheet-profile-note"></p>
        <label>Start side<select name="direction"><option value="left">Left to right</option><option value="right">Right to left</option></select></label>
        <label>Start offset (mm)<input name="offset" type="number" value="0" min="0" step="any" required></label>
        <p>Sheets run uphill. Each length is a whole number of modules plus the end allowance. Excess at the last sheet is trimmed. Width overlap = total − usable width.</p>
        <p>Profile sizes are independent of the visual roof covering. Vertical walls, flashings, fasteners and offcut reuse are excluded. Verify overlap and fixing details with the supplier before ordering.</p>
      </form><div class="sheet-output" aria-live="polite"></div></div>
      <footer><span class="sheet-status" role="status"></span><button type="button" data-sheet="csv">Export CSV</button><button type="button" data-sheet="print">Print / PDF</button><button type="button" data-sheet="close">Done</button></footer>`;
    document.body.append(this.dialog);
    this.translation = localizeFeature(this.dialog, () => this.state.locale);
    window.addEventListener('roof-locale-applied', () => {
      if (this.plan) { this.render(); this.buttons(!this.stale); }
      this.translation.refresh();
    });
    this.dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-slope-svg]');
      if (!button || !this.plan || this.stale) return;
      const index = Number(button.dataset.slopeSvg);
      const slope = this.plan.slopes[index];
      const markup = translatedMarkup(slopeDiagram(slope, this.plan.profile, this.state.locale), this.state.locale).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" ');
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const link = document.createElement('a');
      link.href = url; link.download = `roof-slope-${slope.id}.svg`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    this.form = this.dialog.querySelector('form');
    this.output = this.dialog.querySelector('.sheet-output');
    this.form.elements.preset.addEventListener('change', () => {
      const preset = sheetProfiles[this.form.elements.preset.value];
      if (preset) this.setFields(preset);
      this.note();
      this.invalidate();
    });
    this.form.addEventListener('input', event => {
      if (fields.some(([key]) => key === event.target.name)) this.form.elements.preset.value = 'custom';
      this.note();
      this.invalidate();
    });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.generate(); });
    this.dialog.querySelectorAll('[data-sheet]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.sheet === 'close') this.dialog.close();
      if (button.dataset.sheet === 'csv' && this.plan) this.download();
      if (button.dataset.sheet === 'print' && this.plan) this.print();
    }));
  }

  setFields(profile) { fields.forEach(([key]) => { this.form.elements[key].value = profile[key]; }); }

  note() {
    const preset = this.form.elements.preset.value;
    this.profileNote = preset === 'clasic'
      ? 'Photo discrepancy: table width 1,100 mm; diagram 1,080 mm (used here). 22 × 365 + 125 = 8,155 mm, above the printed 8,150 mm maximum, so 21 modules are allowed. End allowance of 125 mm is inferred from the listed minimum length; confirm with supplier.'
      : preset === 'antic' ? '350 mm profile reference: 1,130 / 1,000 mm width, 350 mm module, 3–22 modules. The 100 mm end allowance is inferred from the listed sheet lengths; confirm with supplier.'
      : 'Custom dimensions. Length = modules × module length + end allowance. The maximum length also limits the allowed module count.';
    this.dialog.querySelector('.sheet-profile-note').textContent = this.profileNote;
  }

  open() {
    const saved = this.state.sheetPlanOptions;
    this.form.elements.preset.value = saved?.preset || 'antic';
    this.setFields(saved?.profile || sheetProfiles.antic);
    this.form.elements.direction.value = saved?.direction || 'left';
    this.form.elements.offset.value = saved?.offset || 0;
    this.note();
    this.plan = null;
    this.dialog.querySelector('.sheet-primary').textContent = 'Generate plan';
    this.output.replaceChildren();
    this.dialog.showModal();
    this.generate();
  }

  invalidate() {
    this.stale = true;
    this.dialog.querySelector('.sheet-error').hidden = true;
    this.dialog.querySelector('.sheet-actions').classList.add('needs-update');
    this.dialog.querySelector('.sheet-update-note').textContent = this.plan
      ? 'Settings changed. The previous plan is shown below. Update it to use the new settings.'
      : 'Settings changed. Generate a plan to use the new settings.';
    this.dialog.querySelector('.sheet-primary').textContent = this.plan ? 'Update plan' : 'Generate plan';
    this.dialog.querySelector('.sheet-status').textContent = 'Update required · Exports paused';
    this.buttons(false);
  }

  buttons(enabled) {
    ['csv', 'print'].forEach(action => { this.dialog.querySelector(`[data-sheet="${action}"]`).disabled = !enabled; });
    this.output.querySelectorAll('[data-slope-svg]').forEach(button => { button.disabled = !enabled; });
  }

  generate() {
    this.buttons(false);
    this.stale = true;
    const errorMessage = this.dialog.querySelector('.sheet-error');
    errorMessage.hidden = true;
    try {
      if (this.state.roofType === 'custom') throw new Error('Draw a roof layout first. An uploaded image does not contain measurable roof surfaces.');
      const profile = Object.fromEntries(fields.map(([key]) => [key, Number(this.form.elements[key].value || NaN)]));
      profile.name = sheetProfiles[this.form.elements.preset.value]?.name || 'Custom profile';
      const settings = { direction: this.form.elements.direction.value, offset: Number(this.form.elements.offset.value || 0) };
      const layout = this.state.roofType === 'layout' ? this.state.roofLayout || defaultLayout() : presetRoofLayout(this.state);
      this.plan = planRoofSheets(layout, profile, settings);
      this.planProfileNote = this.profileNote;
      this.state.sheetPlanOptions = { preset: this.form.elements.preset.value, profile, ...settings };
      this.render();
      this.stale = false;
      this.dialog.querySelector('.sheet-actions').classList.remove('needs-update');
      this.dialog.querySelector('.sheet-update-note').textContent = 'Plan is up to date. Changing settings keeps this preview until you update it.';
      this.dialog.querySelector('.sheet-primary').textContent = 'Update plan';
      this.buttons(true);
      this.dialog.querySelector('.sheet-status').textContent = `${this.plan.slopes.length} slopes · ${this.plan.totals.count} sheets`;
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
      this.dialog.querySelector('.sheet-actions').classList.add('needs-update');
      this.dialog.querySelector('.sheet-update-note').textContent = this.plan
        ? 'Could not update. The previous plan is still shown below; correct the settings and try again.'
        : 'Could not generate a plan. Correct the settings and try again.';
      this.dialog.querySelector('.sheet-status').textContent = this.plan ? 'Previous plan · Exports paused' : 'Plan unavailable';
    }
  }

  render() {
    const { profile, totals, slopes, groups } = this.plan;
    const number = value => formatNumber(value, this.state.locale);
    const stats = [['Sheets', totals.count], ['Modules', totals.modules], ['Roof area', `${number(totals.netArea)} m²`],
      ['Order area', `${number(totals.stockArea)} m²`], ['Cut allowance', `${number(totals.cutArea)} m²`],
      ['Overlap / end allowance', `${number(totals.overlapArea)} m²`], ['Total sheet length', `${number(totals.linearMetres)} m`],
      ['Estimated weight', `${number(totals.weight)} kg`]];
    this.output.innerHTML = `<section class="sheet-report-summary"><h2>${escape(profile.name)} · Cutting plan</h2>
      <p>${profile.width} mm total / ${profile.usefulWidth} mm usable width · ${profile.module} mm module · ${profile.endOverlap} mm end allowance · ${profile.minModules}–${profile.allowedMaxModules} modules/sheet</p><p>Start: ${slopes[0].reverse ? 'right to left' : 'left to right'} · Offset: ${number(slopes[0].offset)} mm</p>
      <div class="sheet-stats">${stats.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('')}</div>
      ${overview(this.plan)}<p>Plan view: letters identify connected coplanar slopes, combining subdivisions from the editor. Roof area includes the roof edges as drawn (including overhangs); vertical closing walls are excluded.</p>
      <p>Order area includes all rectangular sheets. Cut allowance is unused effective coverage; overlap / end allowance includes side laps and extra sheet length. Neither assumes offcut reuse. Weight uses the listed kg/m² against order area.</p>
      ${profile.allowedMaxModules < profile.maxModules ? '<p class="sheet-warning">Maximum module count reduced to respect the maximum physical sheet length.</p>' : ''}
      <p class="sheet-warning">${escape(this.planProfileNote)}</p></section>
      ${slopes.map((slope, index) => `<section class="sheet-slope"><h2>Slope ${slope.id}</h2><button type="button" data-slope-svg="${index}">Download diagram (SVG)</button><p>${number(slope.netArea)} m² · ${number(slope.pitch)}° pitch · ${slope.pieces.length} sheets · ${slope.columns} columns · ${number(slope.stockArea)} m² order area</p>
        ${slope.warnings.map(w => `<p class="sheet-warning">${escape(w)}</p>`).join('')}
        ${slopeDiagram(slope, profile, this.state.locale)}<p class="sheet-legend">Black: roof cut line · Blue: usable sheet area · Dashed: full ordered sheet · ↑ Uphill installation start</p>
        ${lengthTable(slope.groups, this.state.locale)}<p>Dimensions follow the actual slope, not its horizontal projection. Piece IDs are slope–column.segment, counted from the selected start side and from eave to ridge.</p></section>`).join('')}
      <section class="sheet-slope"><h2>Combined order list</h2>${lengthTable(groups, this.state.locale)}<p><strong>${totals.count} sheets · ${totals.modules} modules · ${number(totals.stockArea)} m² ordered</strong></p>
      <p>This is a geometric cutting estimate. Cut-outs remain offcuts; reuse, trim accessories and fixing quantities are not optimized.</p></section>`;
  }

  download() {
    if (!this.plan || this.stale) return;
    const url = URL.createObjectURL(new Blob(['\uFEFF' + sheetPlanCsv(this.plan, text => featureText(this.state.locale, text))], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'roof-sheet-plan.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  print() {
    if (!this.plan || this.stale) return;
    const frame = document.createElement('iframe');
    this.translation.refresh();
    frame.title = featureText(this.state.locale, 'Printable roof cutting plan');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="${featureLocale(this.state.locale)}"><head><title>${featureText(this.state.locale, 'Roof sheet cutting plan')}</title><style>
      @page { size:A4 landscape; margin:12mm; } body { font:11px Arial,sans-serif; color:#172c45; }
      button { display:none; } h2 { font-size:20px; margin:8px 0; } p { line-height:1.4; } section { break-before:page; } section:first-child { break-before:auto; }
      .sheet-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:8px; } article { padding:8px;border:1px solid #ccc; } article span,article strong { display:block; } article strong { font-size:18px; }
      .sheet-overview { display:block;height:85mm;width:100%; } .sheet-diagram { display:block;width:100%;height:85mm; }
      table { border-collapse:collapse;width:100%;font-size:11px; } th,td { border:1px solid #aaa;padding:5px;text-align:left; } td:last-child { overflow-wrap:anywhere; } tr { break-inside:avoid; }
      .sheet-warning { color:#854d0e; } .sheet-legend { font-size:10px; }
    </style></head><body>${this.output.innerHTML}</body></html>`);
    doc.close();
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 100);
  }
}
