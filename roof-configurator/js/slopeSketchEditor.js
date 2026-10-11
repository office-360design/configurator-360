import { localizeFeature, featureLocale } from './featureI18n.js?v=sketch-1';
import { slopeLetter } from './sheetPlanner.js?v=sketch-1';
import {
  defaultSketch, dragSketchPoint, edgeTypes, newSketchSlope, setSketchEdgeLength, setSketchHeight,
  sketchShapes, sketchSlopeGeometry, slopeFromPoints,
  MAX_SKETCH_QUANTITY, MAX_SKETCH_SLOPES, SKETCH_VERSION,
} from './slopeSketch.js?v=sketch-1';

const edgeColors = { eave: '#1260aa', ridge: '#c2410c', hip: '#d97706', valley: '#7c3aed', gable: '#64748b', wall: '#78350f' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Roofers type decimal commas ("4,50"); accept both separators.
const parseLength = value => {
  const text = String(value).trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
};
const shapeIcons = {
  triangle: 'M4 26h28L18 6z',
  trapezoid: 'M2 26h32l-8-18H10z',
  rectangle: 'M4 26h28V8H4z',
  parallelogram: 'M2 26h22l10-18H12z',
  polygon: 'M3 26h30l-6-10-6 2-4-10-9 8z',
};

// Draws one slope at its true size: x along the eave, y uphill. Interactive
// drawings add draggable corner handles and editable length labels.
export function sketchSlopeSvg(geometry, locale, { letter = '', labels = true, className = 'sketch-svg', interactive = false, viewBox = null, offset = { x: 0, y: 0 } } = {}) {
  const { points, width, height, edges } = geometry;
  const span = Math.max(width, height, 1);
  const pad = span * 0.16, font = span * 0.045;
  const number = value => value.toLocaleString(featureLocale(locale), { maximumFractionDigits: 2 });
  const p = pt => `${pt.x},${-pt.y}`;
  const editable = interactive ? ' class="sketch-length" role="button" tabindex="0"' : '';
  const editHint = interactive ? '<title>Double-click to type the exact length</title>' : '';
  const edgeMarkup = edges.map((edge, i) => {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    // Anticlockwise outline: (dy, -dx) points outwards.
    const nx = dy / len, ny = -dx / len;
    const mx = (a.x + b.x) / 2 + nx * font * 1.1, my = (a.y + b.y) / 2 + ny * font * 1.1;
    return `<line x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}" stroke="${edgeColors[edge.type]}" stroke-width="${span * (edge.type === 'eave' ? 0.012 : 0.008)}" stroke-linecap="round"><title>${edgeTypes[edge.type].name}</title></line>
      ${labels ? `<text${editable} ${interactive ? `data-edge="${i}"` : ''} x="${mx}" y="${-my}" font-size="${font}" text-anchor="middle" dominant-baseline="middle" fill="${edgeColors[edge.type]}" paint-order="stroke" stroke="white" stroke-width="${font * 0.25}">${number(edge.length)} m${editHint}</text>` : ''}`;
  }).join('');
  const handleSize = span * 0.016;
  const handles = interactive ? points.map((pt, i) => `<g class="sketch-handle" data-point="${i}"><circle cx="${pt.x}" cy="${-pt.y}" r="${handleSize * 3}" fill="transparent"/><circle cx="${pt.x}" cy="${-pt.y}" r="${handleSize}" fill="#fff" stroke="#1260aa" stroke-width="${handleSize * 0.45}"/><title>Drag to change the shape</title></g>`).join('') : '';
  const cx = points.reduce((sum, pt) => sum + pt.x, 0) / points.length, cy = points.reduce((sum, pt) => sum + pt.y, 0) / points.length;
  return `<svg class="${className}" viewBox="${viewBox || `${-pad} ${-height - pad} ${width + 2 * pad} ${height + 2 * pad}`}" role="img" aria-label="Slope ${escape(letter)}">
    <g transform="translate(${offset.x} ${-offset.y})">
    <polygon points="${points.map(p).join(' ')}" fill="#dbeafe" stroke="none"/>
    ${edgeMarkup}
    ${labels ? `<line x1="${width + pad * 0.45}" y1="0" x2="${width + pad * 0.45}" y2="${-height}" stroke="#94a3b8" stroke-width="${span * 0.004}" stroke-dasharray="${font * 0.4} ${font * 0.3}"/>
      <text${editable} ${interactive ? 'data-height=""' : ''} x="${width + pad * 0.55}" y="${-height / 2}" font-size="${font * 0.9}" fill="#475569" writing-mode="tb">↑ ${number(height)} m${editHint}</text>` : ''}
    <text x="${cx}" y="${-cy}" font-size="${font * (labels ? 1.5 : 3)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#0f172a" pointer-events="none">${escape(letter)}</text>
    ${handles}
    </g>
  </svg>`;
}

export class SlopeSketchEditor {
  constructor(state, onApply) {
    this.state = state;
    this.onApply = onApply;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'slope-sketch-dialog';
    this.dialog.setAttribute('aria-labelledby', 'slopeSketchTitle');
    this.dialog.innerHTML = `<header><div><small>ON-SITE MEASUREMENTS</small><h2 id="slopeSketchTitle">Draw each slope</h2></div>
        <button type="button" data-sketch="cancel" aria-label="Close slope drawing">×</button></header>
      <div class="sketch-workspace">
        <aside class="sketch-sidebar">
          <ol class="sketch-list" aria-label="Slopes"></ol>
          <p class="sketch-add-label">Add slope</p>
          <div class="sketch-add">${Object.entries(sketchShapes).map(([shape, def]) => `<button type="button" data-add-shape="${shape}" title="${def.name}"><svg viewBox="0 0 36 30" aria-hidden="true"><path d="${shapeIcons[shape]}"/></svg><span>${def.name}</span></button>`).join('')}</div>
        </aside>
        <section class="sketch-main">
          <div class="sketch-preview"></div>
          <p class="sketch-preview-hint">Drag the points to shape the slope · Double-click a length to type it exactly · Hold Alt for 1 cm steps</p>
          <p class="sketch-error" role="alert" hidden></p>
          <form class="sketch-form" novalidate></form>
        </section>
      </div>
      <footer><span class="sketch-status" role="status"></span>
        <button type="button" data-sketch="cancel">Cancel</button>
        <button type="button" data-sketch="apply" class="sketch-primary">Save slopes</button></footer>`;
    document.body.appendChild(this.dialog);
    this.list = this.dialog.querySelector('.sketch-list');
    this.form = this.dialog.querySelector('.sketch-form');
    this.preview = this.dialog.querySelector('.sketch-preview');
    this.error = this.dialog.querySelector('.sketch-error');
    this.translation = localizeFeature(this.dialog, () => this.state.locale);
    this.dialog.querySelectorAll('[data-sketch]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.sketch === 'cancel') this.dialog.close();
      if (button.dataset.sketch === 'apply') this.apply();
    }));
    this.dialog.querySelectorAll('[data-add-shape]').forEach(button => button.addEventListener('click', () => this.add(button.dataset.addShape)));
    this.list.addEventListener('click', event => {
      const item = event.target.closest('[data-slope-index]');
      if (item) this.select(Number(item.dataset.slopeIndex));
    });
    this.form.addEventListener('input', event => this.edit(event.target));
    this.form.addEventListener('change', event => this.edit(event.target, true));
    this.form.addEventListener('click', event => {
      const action = event.target.closest('[data-form-action]')?.dataset.formAction;
      if (action) this.formAction(action, event.target.closest('[data-form-action]'));
    });
    this.form.addEventListener('submit', event => event.preventDefault());
    this.bindPreview();
  }

  // Dragging works in the frame of the drawing at drag start: the view stays
  // fixed and the shape is re-anchored on a corner that did not move.
  bindPreview() {
    const toSlope = event => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(this.drag.inverse);
      return { x: point.x, y: -point.y };
    };
    this.preview.addEventListener('pointerdown', event => {
      const handle = event.target.closest('[data-point]');
      if (!handle || event.button > 0) return;
      const svg = handle.ownerSVGElement;
      const { geometry } = this.geometry(this.slope);
      if (!geometry) return;
      event.preventDefault();
      this.closeInline(false);
      this.drag = { index: Number(handle.dataset.point), start: geometry.points, viewBox: svg.getAttribute('viewBox'),
        inverse: svg.getScreenCTM().inverse(), offset: { x: 0, y: 0 }, pointerId: event.pointerId };
      this.preview.setPointerCapture(event.pointerId);
      this.preview.classList.add('dragging');
    });
    this.preview.addEventListener('pointermove', event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { index, start } = this.drag;
      const outline = dragSketchPoint(this.slope.shape, start, index, toSlope(event));
      const candidate = slopeFromPoints(this.slope, outline, event.altKey ? 0.01 : 0.05);
      const { geometry } = this.geometry(candidate);
      if (!geometry) return; // Keep the last valid shape until the pointer returns.
      this.draft.slopes[this.selected] = candidate;
      const anchor = (index + 2) % start.length;
      this.drag.offset = { x: start[anchor].x - geometry.points[anchor].x, y: start[anchor].y - geometry.points[anchor].y };
      this.syncInputs();
      this.refresh();
    });
    const end = event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.drag = null;
      this.preview.classList.remove('dragging');
      this.refresh();
    };
    this.preview.addEventListener('pointerup', end);
    this.preview.addEventListener('pointercancel', end);
    this.preview.addEventListener('dblclick', event => {
      const label = event.target.closest('[data-edge], [data-height]');
      if (label) this.openInline(label);
    });
    // Touch has no reliable double tap: a tap on a length opens the field.
    this.preview.addEventListener('click', event => {
      const label = event.target.closest('[data-edge], [data-height]');
      if (label && event.pointerType && event.pointerType !== 'mouse') this.openInline(label);
    });
    this.preview.addEventListener('keydown', event => {
      const label = event.target.closest?.('[data-edge], [data-height]');
      if (label && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.openInline(label); }
    });
  }

  openInline(label) {
    this.closeInline(false);
    const { geometry } = this.geometry(this.slope);
    if (!geometry) return;
    const isHeight = label.hasAttribute('data-height');
    const index = isHeight ? null : Number(label.dataset.edge);
    const current = isHeight ? geometry.height : geometry.edges[index].length;
    const box = label.getBoundingClientRect(), host = this.preview.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'sketch-inline-input';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = String(Math.round(current * 100) / 100);
    input.setAttribute('aria-label', isHeight ? 'Slope length' : `Edge ${index + 1}`);
    input.style.left = `${box.left + box.width / 2 - host.left}px`;
    input.style.top = `${box.top + box.height / 2 - host.top}px`;
    this.inline = { input, index, isHeight };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.closeInline(true); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeInline(false); }
    });
    input.addEventListener('blur', () => this.closeInline(true));
    this.preview.append(input);
    input.focus();
    input.select();
  }

  closeInline(commit) {
    const inline = this.inline;
    if (!inline) return;
    this.inline = null;
    const value = parseLength(inline.input.value);
    inline.input.remove();
    if (!commit || !Number.isFinite(value)) return;
    this.draft.slopes[this.selected] = inline.isHeight
      ? setSketchHeight(this.slope, value) : setSketchEdgeLength(this.slope, inline.index, value);
    this.renderForm();
    this.refresh();
  }

  syncInputs() {
    const slope = this.slope;
    Object.entries(slope.dims || {}).forEach(([key, value]) => {
      const input = this.form.elements[key];
      if (input) input.value = String(value);
    });
    (slope.points || []).forEach((point, i) => {
      if (this.form.elements[`px-${i}`]) this.form.elements[`px-${i}`].value = String(point.x);
      if (this.form.elements[`py-${i}`]) this.form.elements[`py-${i}`].value = String(point.y);
    });
  }

  open(index = 0) {
    this.draft = structuredClone(this.state.slopeSketch || defaultSketch());
    this.selected = Math.min(Math.max(0, index), this.draft.slopes.length - 1);
    this.renderForm();
    this.refresh();
    this.dialog.showModal();
  }

  get slope() { return this.draft.slopes[this.selected]; }

  geometry(slope) {
    try { return { geometry: sketchSlopeGeometry(slope) }; }
    catch (error) { return { error: error.message }; }
  }

  add(shape) {
    if (this.draft.slopes.length >= MAX_SKETCH_SLOPES) return;
    this.draft.slopes.push(newSketchSlope(shape));
    this.select(this.draft.slopes.length - 1);
  }

  select(index) {
    this.selected = index;
    this.renderForm();
    this.refresh();
  }

  formAction(action, button) {
    const slope = this.slope;
    if (action === 'duplicate' && this.draft.slopes.length < MAX_SKETCH_SLOPES) {
      this.draft.slopes.splice(this.selected + 1, 0, structuredClone(slope));
      return this.select(this.selected + 1);
    }
    if (action === 'delete' && this.draft.slopes.length > 1) {
      this.draft.slopes.splice(this.selected, 1);
      return this.select(Math.min(this.selected, this.draft.slopes.length - 1));
    }
    if (action === 'addPoint' && slope.points.length < 60) {
      // Insert halfway along the closing edge so the outline stays valid.
      const a = slope.points.at(-1), b = slope.points[0];
      slope.points.push({ x: Math.round((a.x + b.x) * 50) / 100, y: Math.round((a.y + b.y) * 50) / 100 });
      slope.edges.splice(slope.points.length - 1, 0, 'gable');
    }
    if (action === 'removePoint' && slope.points.length > 3) {
      const index = Number(button.dataset.point);
      slope.points.splice(index, 1);
      slope.edges.splice(index, 1);
    }
    this.renderForm();
    this.refresh();
  }

  edit(input, committed = false) {
    const slope = this.slope;
    const name = input.name;
    if (!name) return;
    if (name === 'shape') {
      if (committed && input.value !== slope.shape) {
        const next = newSketchSlope(input.value);
        next.quantity = slope.quantity;
        next.pitch = slope.pitch;
        this.draft.slopes[this.selected] = next;
        this.renderForm();
      }
    } else if (name === 'quantity') slope.quantity = Number(input.value);
    else if (name === 'pitch') slope.pitch = input.value.trim() === '' ? null : parseLength(input.value);
    else if (name === 'lean') slope.dims.lean = input.value;
    else if (name.startsWith('edge-')) slope.edges[Number(name.slice(5))] = input.value;
    else if (name.startsWith('px-') || name.startsWith('py-')) slope.points[Number(name.slice(3))][name[1]] = parseLength(input.value);
    else slope.dims[name] = parseLength(input.value);
    this.refresh();
  }

  renderForm() {
    const slope = this.slope;
    const def = sketchShapes[slope.shape];
    const letter = slopeLetter(this.selected);
    const value = v => (Number.isFinite(v) ? String(v) : '');
    const field = (name, label, current, hint = 'm') => `<label class="sketch-field">${label}<span><input name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${escape(value(current))}" required><em>${hint}</em></span></label>`;
    this.form.innerHTML = `<div class="sketch-form-head"><h3>Slope ${letter}</h3>
        <button type="button" data-form-action="duplicate">Duplicate</button>
        <button type="button" data-form-action="delete" ${this.draft.slopes.length > 1 ? '' : 'disabled'}>Delete</button></div>
      <div class="sketch-grid">
        <label class="sketch-field">Shape<select name="shape">${Object.entries(sketchShapes).map(([shape, d]) => `<option value="${shape}" ${shape === slope.shape ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        ${def.dims.map(([key, label]) => field(key, label, slope.dims[key])).join('')}
        ${slope.shape === 'parallelogram' ? `<label class="sketch-field">Ridge shifted<select name="lean"><option value="right" ${slope.dims.lean !== 'left' ? 'selected' : ''}>To the right</option><option value="left" ${slope.dims.lean === 'left' ? 'selected' : ''}>To the left</option></select></label>` : ''}
        <label class="sketch-field">Identical slopes<span><input name="quantity" type="number" min="1" max="${MAX_SKETCH_QUANTITY}" step="1" value="${slope.quantity}"><em>×</em></span></label>
        ${field('pitch', 'Pitch (optional)', slope.pitch, '°')}
      </div>
      ${slope.shape === 'polygon' ? `<fieldset class="sketch-points"><legend>Points</legend>
        <p>Start at the left end of the eave and go anticlockwise: along the eave, then up and around. X runs along the eave, Y up the slope.</p>
        <table><thead><tr><th>#</th><th>X (m)</th><th>Y (m)</th><th></th></tr></thead><tbody>
        ${slope.points.map((pt, i) => `<tr><td>${i + 1}</td><td><input name="px-${i}" type="text" inputmode="decimal" value="${escape(value(pt.x))}" aria-label="Point ${i + 1} X"></td><td><input name="py-${i}" type="text" inputmode="decimal" value="${escape(value(pt.y))}" aria-label="Point ${i + 1} Y"></td><td><button type="button" data-form-action="removePoint" data-point="${i}" aria-label="Remove point ${i + 1}" ${slope.points.length > 3 ? '' : 'disabled'}>×</button></td></tr>`).join('')}
        </tbody></table><button type="button" data-form-action="addPoint">Add point</button></fieldset>` : ''}
      <fieldset class="sketch-edges"><legend>Edges</legend><div class="sketch-edge-rows"></div>
        <p>Edge types give the ridge, hip, valley, eave and verge lengths for trims.</p></fieldset>
      <p class="sketch-help">Enter the lengths measured on the slope itself, not on the plan. The slope length (eave to ridge) is calculated from the sides. Sheets run from the eave up.</p>`;
  }

  renderEdges(geometry) {
    const rows = this.form.querySelector('.sketch-edge-rows');
    const count = geometry ? geometry.edges.length : this.slope.edges.length;
    const number = v => v.toLocaleString(featureLocale(this.state.locale), { maximumFractionDigits: 2 });
    if (rows.children.length !== count) {
      rows.innerHTML = Array.from({ length: count }, (_, i) => `<label class="sketch-edge"><i></i><span>Edge ${i + 1}</span><b></b>
        <select name="edge-${i}">${Object.entries(edgeTypes).map(([type, edge]) => `<option value="${type}">${edge.name}</option>`).join('')}</select></label>`).join('');
    }
    [...rows.children].forEach((row, i) => {
      const type = geometry?.edges[i]?.type ?? this.slope.edges[i] ?? 'gable';
      row.querySelector('select').value = type;
      row.querySelector('i').style.background = edgeColors[type];
      row.querySelector('b').textContent = geometry ? `${number(geometry.edges[i].length)} m` : '—';
    });
  }

  refresh() {
    const results = this.draft.slopes.map(slope => this.geometry(slope));
    const current = results[this.selected];
    const number = v => v.toLocaleString(featureLocale(this.state.locale), { maximumFractionDigits: 2 });
    this.list.innerHTML = results.map((result, i) => {
      const slope = this.draft.slopes[i];
      return `<li><button type="button" data-slope-index="${i}" aria-current="${i === this.selected}" class="${result.error ? 'invalid' : ''}">
        ${result.geometry ? sketchSlopeSvg(result.geometry, this.state.locale, { letter: slopeLetter(i), labels: false, className: 'sketch-thumb' }) : '<span class="sketch-thumb sketch-thumb-error">!</span>'}
        <span><strong>Slope ${slopeLetter(i)}</strong><small>${sketchShapes[slope.shape].name}</small>
        <small>${result.geometry ? `${number(result.geometry.area)} m²` : 'Check measurements'}${slope.quantity > 1 ? ` · ×${slope.quantity}` : ''}</small></span></button></li>`;
    }).join('');
    if (this.inline) this.closeInline(false);
    const view = this.drag ? { viewBox: this.drag.viewBox, offset: this.drag.offset } : {};
    this.preview.innerHTML = current.geometry
      ? sketchSlopeSvg(current.geometry, this.state.locale, { letter: slopeLetter(this.selected), interactive: true, ...view })
        + `<p class="sketch-preview-caption">${number(current.geometry.area)} m² · <span>Slope length</span> ${number(current.geometry.height)} m${this.slope.quantity > 1 ? ` · × ${this.slope.quantity} = ${number(current.geometry.area * this.slope.quantity)} m²` : ''}</p>`
      : '<p class="sketch-preview-empty">The preview appears when the measurements form a valid slope.</p>';
    this.error.hidden = !current.error;
    this.error.textContent = current.error || '';
    this.renderEdges(current.geometry);
    const valid = results.filter(r => r.geometry);
    const total = valid.reduce((sum, r) => sum + r.geometry.area * (r.geometry.quantity || 1), 0);
    const invalid = results.length - valid.length;
    this.dialog.querySelector('.sketch-status').textContent = invalid
      ? `${invalid} slope(s) need correcting`
      : `${results.length} slopes · ${number(total)} m² total roof area`;
    this.dialog.querySelector('[data-sketch="apply"]').disabled = Boolean(invalid);
  }

  apply() {
    const invalid = this.draft.slopes.findIndex(slope => this.geometry(slope).error);
    if (invalid >= 0) return this.select(invalid);
    this.state.slopeSketch = { version: SKETCH_VERSION, slopes: structuredClone(this.draft.slopes) };
    this.dialog.close();
    this.onApply();
  }
}

// Read-only 2D overview shown in place of the 3D viewer.
export function renderSketchViewer(container, state, onEdit) {
  const number = v => v.toLocaleString(featureLocale(state.locale), { maximumFractionDigits: 2 });
  const sketch = state.slopeSketch || defaultSketch();
  const slopes = sketch.slopes.map(slope => sketchSlopeGeometry(slope));
  const total = slopes.reduce((sum, s) => sum + s.area * s.quantity, 0);
  container.innerHTML = `<div class="sketch-viewer-head"><div><strong>${number(total)} m²</strong><span>Total roof area · ${slopes.reduce((n, s) => n + s.quantity, 0)} slopes</span></div>
      <button type="button" data-viewer-edit="0">Edit slopes</button></div>
    <div class="sketch-viewer-grid">${slopes.map((geometry, i) => `<button type="button" class="sketch-card" data-viewer-edit="${i}">
      ${sketchSlopeSvg(geometry, state.locale, { letter: slopeLetter(i) })}
      <span><strong>Slope ${slopeLetter(i)}${geometry.quantity > 1 ? ` × ${geometry.quantity}` : ''}</strong>
      <small>${number(geometry.area)} m²${geometry.quantity > 1 ? ` each · ${number(geometry.area * geometry.quantity)} m² total` : ''}</small></span></button>`).join('')}</div>
    <p class="sketch-viewer-note">2D only: these slopes are not joined into a 3D roof. Open Sheet cutting plan for the panel layout and order list.</p>`;
  container.querySelectorAll('[data-viewer-edit]').forEach(button => button.addEventListener('click', () => onEdit(Number(button.dataset.viewerEdit))));
  return total;
}
