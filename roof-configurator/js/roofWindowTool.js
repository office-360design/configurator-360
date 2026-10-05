import { inside } from './roofLayout.js?v=layout-21';
import { drawAlignmentPreview } from './alignmentPreview.js?v=windows-24';
import { roofWindowGeometry } from './roofWindows.js?v=windows-24';

export class RoofWindowTool {
  constructor(editor) {
    this.editor = editor;
    this.panel = document.createElement('fieldset');
    this.panel.className = 'layout-window';
    this.panel.hidden = true;
    this.panel.innerHTML = `<div class="layout-section-heading" data-window="heading">Roof window</div>
      <label>Window<select data-window="selection"></select></label>
      <p>Click a slope or drag the selected window to move it. Choose Update window to save. Height is measured along the slope.</p>
      <div class="layout-coordinate-row">
        <label>Width (m)<input data-window="width" type="number" min="0.3" max="3" step="0.01" value="0.78"><input data-window="widthSlider" aria-label="Window width (m)" type="range" min=".3" max="3" step="0.01" value=".78"></label>
        <label>Height (m)<input data-window="length" type="number" min="0.4" max="4" step="0.01" value="1.18"><input data-window="lengthSlider" aria-label="Window height (m)" type="range" min=".4" max="4" step="0.01" value="1.18"></label>
      </div>
      <div class="layout-coordinate-row">
        <label>Centre X (m)<input data-window="x" type="number" step="0.1"></label>
        <label>Centre Z (m)<input data-window="z" type="number" step="0.1"></label>
      </div>
      <label class="window-snap"><input data-window="snap" type="checkbox">Snap movement to grid</label>
      <div class="window-move-controls">
        <button type="button" data-window="snapNow">Snap centre to grid</button>
        <button type="button" data-move="-1,0" aria-label="Move window left one grid step">←</button>
        <button type="button" data-move="0,-1" aria-label="Move window up one grid step">↑</button>
        <button type="button" data-move="0,1" aria-label="Move window down one grid step">↓</button>
        <button type="button" data-move="1,0" aria-label="Move window right one grid step">→</button>
      </div>
      <small data-window="gridNote"></small>
      <output data-window="status" aria-live="polite"></output>
      <svg data-window="preview" role="img" aria-label="Roof window preview" hidden></svg>
      <div class="layout-action-row">
        <button type="button" data-window="save" class="layout-primary">Add window</button>
        <button type="button" data-window="remove">Delete window</button>
        <button type="button" data-window="cancel">Cancel</button>
      </div>`;
    editor.dialog.querySelector('aside').prepend(this.panel);
    this.panel.addEventListener('input', event => {
      const key = event.target.dataset.window;
      if (key?.endsWith('Slider')) this.field(key.replace('Slider', '')).value = event.target.value;
      if (['width', 'length'].includes(key) && event.target.value !== '') this.field(`${key}Slider`).value = event.target.value;
      if (event.target.matches('input') && key !== 'snap') this.preview();
    });
    this.field('snapNow').addEventListener('click', () => this.moveByGrid(0, 0));
    this.panel.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
      this.moveByGrid(...button.dataset.move.split(',').map(Number));
    }));
    this.field('selection').addEventListener('change', () => this.select());
    this.field('cancel').addEventListener('click', () => { this.close(); editor.render(); });
    this.field('save').addEventListener('click', () => {
      if (!this.result) return;
      const next = this.result;
      this.close();
      editor.commit(next);
      editor.status('Roof window saved. Apply roof to see it in 3D.');
    });
    this.field('remove').addEventListener('click', () => {
      const index = Number(this.field('selection').value);
      if (index < 0) return;
      const next = structuredClone(editor.layout);
      next.roofWindows.splice(index, 1);
      this.close();
      editor.commit(next);
    });
  }

  field(name) { return this.panel.querySelector(`[data-window="${name}"]`); }

  open(index = -1) {
    const editor = this.editor;
    editor.stopMeet(); editor.stopDormer();
    editor.mode = 'select'; editor.path = []; editor.panEnabled = false;
    editor.selected = null; editor.selectedEdge = null;
    this.active = true;
    this.panel.hidden = false;
    this.field('selection').replaceChildren(new Option('New window', '-1'),
      ...(editor.layout.roofWindows || []).map((_, i) => new Option(`Window ${i + 1}`, String(i))));
    this.field('selection').value = String(index);
    this.select();
    this.panel.scrollIntoView({ block: 'nearest' });
  }

  select() {
    const index = Number(this.field('selection').value);
    const existing = this.editor.layout.roofWindows?.[index];
    this.field('heading').textContent = existing ? `Window W${index + 1} selected` : 'New roof window';
    this.field('save').textContent = existing ? 'Update window' : 'Add window';
    this.field('remove').disabled = !existing;
    for (const key of ['width', 'length', 'x', 'z']) {
      this.field(key).value = existing?.[key] ?? ({ width: .78, length: 1.18, x: '', z: '' }[key]);
    }
    for (const key of ['width', 'length']) this.field(`${key}Slider`).value = this.field(key).value;
    this.preview();
  }

  close() { this.editor.clearFeedback('window'); this.active = false; this.panel.hidden = true; this.result = null; }

  gridStep() { return Number(this.editor.dialog.querySelector('#layoutSnap').value); }

  moveByGrid(dx, dz) {
    if (!this.field('x').value || !this.field('z').value) return;
    const step = this.gridStep();
    this.place({ x: (Math.round(Number(this.field('x').value) / step) + dx) * step,
      z: (Math.round(Number(this.field('z').value) / step) + dz) * step });
  }

  beginDrag(event, index) {
    if (!this.active || Number(this.field('selection').value) !== index) this.open(index);
    this.editor.drag = { kind: 'window', pointerId: event.pointerId,
      start: this.editor.rawPointer(event), x: Number(this.field('x').value), z: Number(this.field('z').value),
      screenX: event.clientX, screenY: event.clientY, moved: false };
    this.editor.svg.setPointerCapture(event.pointerId);
  }

  moveDrag(event, drag) {
    if (!drag.moved && Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) < 3) return;
    drag.moved = true;
    const point = this.editor.rawPointer(event);
    this.place({ x: drag.x + point.x - drag.start.x, z: drag.z + point.z - drag.start.z });
  }

  finishDrag(drag, cancel) {
    if (cancel || !this.result) {
      this.field('x').value = drag.x;
      this.field('z').value = drag.z;
      this.preview();
      this.editor.status('Window move cancelled; previous position restored.');
    }
  }

  place(point) {
    if (this.field('snap').checked) {
      const step = this.gridStep();
      point = { x: Math.round(point.x / step) * step, z: Math.round(point.z / step) * step };
    }
    this.field('x').value = point.x.toFixed(3);
    this.field('z').value = point.z.toFixed(3);
    this.preview();
  }

  preview() {
    this.result = null;
    this.field('preview').setAttribute('hidden', '');
    try {
      const window = Object.fromEntries(['width', 'length', 'x', 'z'].map(key =>
        [key, this.field(key).value === '' ? NaN : Number(this.field(key).value)]));
      if (!Number.isFinite(window.x) || !Number.isFinite(window.z)) throw new Error('Click inside a slope to position the window.');
      const next = structuredClone(this.editor.layout);
      next.roofWindows ||= [];
      const index = Number(this.field('selection').value);
      if (index < 0) next.roofWindows.push(window); else next.roofWindows[index] = window;
      const geometry = roofWindowGeometry(next);
      const previewWindow = geometry[index < 0 ? geometry.length - 1 : index];
      drawAlignmentPreview(this.field('preview'), next, -1, previewWindow.point(0, 0));
      this.field('preview').removeAttribute('hidden');
      this.result = next;
      this.editor.previewFeedback(this.field('status'), 'Ready. The blue rectangle shows the roof opening.', true, { owner: 'window' });
    } catch (error) {
      const x = this.field('x').value, z = this.field('z').value;
      const missingPosition = x === '' || z === '';
      this.editor.previewFeedback(this.field('status'), error.message, false, {
        owner: 'window', warning: missingPosition,
        points: missingPosition ? [] : [{ x: Number(x), z: Number(z) }],
      });
    }
    this.field('gridNote').textContent = `Grid step: ${this.gridStep()} m (Roof properties → Grid snap).`;
    this.field('save').disabled = !this.result;
    this.editor.render();
  }

  surfaceLabelPoint(face, vertices, project, preferred) {
    const polygon = face.map(id => project(vertices[id]));
    const toPlan = p => ({ x: p.x, z: p.y });
    const obstacles = roofWindowGeometry(this.result || this.editor.layout).map(window => {
      const points = window.corners.map(project);
      return { minX: Math.min(...points.map(p => p.x)) - 40, maxX: Math.max(...points.map(p => p.x)) + 40,
        minY: Math.min(...points.map(p => p.y)) - 40, maxY: Math.max(...points.map(p => p.y)) + 40 };
    });
    const clear = p => inside(toPlan(p), polygon.map(toPlan)) &&
      !obstacles.some(box => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY);
    if (clear(preferred)) return preferred;
    const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
    const candidates = [];
    for (let u = 1; u < 20; u++) for (let v = 1; v < 20; v++) {
      const p = { x: Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * u / 20,
        y: Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * v / 20 };
      if (clear(p)) candidates.push(p);
    }
    candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) -
      Math.hypot(b.x - preferred.x, b.y - preferred.y));
    return candidates[0] || preferred;
  }

  draw(svg, project) {
    const layout = this.result || this.editor.layout;
    for (const window of roofWindowGeometry(layout)) {
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      shape.setAttribute('points', window.corners.map(p => { const q = project(p); return `${q.x},${q.y}`; }).join(' '));
      const selected = this.active && (Number(this.field('selection').value) === window.index ||
        (Number(this.field('selection').value) < 0 && this.result && window.index === layout.roofWindows.length - 1));
      shape.setAttribute('class', `layout-roof-window${selected ? ' selected' : ''}`);
      shape.setAttribute('aria-label', `Window W${window.index + 1}${selected ? ', selected' : ''}`);
      if (selected) for (const corner of window.corners) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const p = project(corner);
        handle.setAttribute('cx', p.x); handle.setAttribute('cy', p.y); handle.setAttribute('r', 5);
        handle.setAttribute('class', 'window-selection-handle');
        svg.append(handle);
      }
      shape.dataset.roofWindow = window.index;
      svg.append(shape);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const p = project(window);
      label.setAttribute('x', p.x); label.setAttribute('y', p.y);
      label.setAttribute('text-anchor', 'middle');
      label.textContent = `W${window.index + 1}${selected ? ' · selected' : ''}`;
      label.setAttribute('class', 'window-label');
      label.setAttribute('y', p.y - (selected ? 10 : 0));
      label.style.pointerEvents = 'none';
      svg.append(label);
    }
  }
}
