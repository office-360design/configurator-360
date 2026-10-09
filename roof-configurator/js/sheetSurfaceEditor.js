import { validateSheetSurfaces, slopeLetter } from './sheetPlanner.js?v=surfaces-44';
import { localizeFeature } from './featureI18n.js?v=surfaces-44';

// Separate state and dialog: editing a cutting surface never changes the 3D roof.
export class SheetSurfaceEditor {
  constructor(state, onApply) {
    this.state = state;
    this.onApply = onApply;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'sheet-surface-editor';
    this.dialog.setAttribute('aria-labelledby', 'sheetSurfaceTitle');
    this.dialog.innerHTML = `<header><h2 id="sheetSurfaceTitle">Draw 2D surfaces</h2><button data-action="cancel" aria-label="Close">×</button></header>
      <p>Use actual surface dimensions in metres, not the horizontal roof projection. Sheets run upwards on this drawing. These surfaces do not change the 3D roof.</p>
      <div class="surface-tools">
        <label>Surface<select class="surface-list"></select></label>
        <button data-action="draw">Draw new surface</button><button data-action="rectangle">Rectangle</button>
        <button data-action="triangle">Triangle</button><button data-action="trapezoid">Trapezoid</button>
        <button data-action="duplicate">Duplicate surface</button><button data-action="delete">Delete surface</button>
        <button data-action="undo">↶ <span>Undo</span></button><button data-action="redo">↷ <span>Redo</span></button>
      </div>
      <div class="surface-size"><label>Width (m)<input class="surface-width" type="number" min="0.1" max="40" step="0.1" value="10"></label>
        <label>Height (m)<input class="surface-height" type="number" min="0.1" max="40" step="0.1" value="5"></label>
        <button data-action="resize">Resize surface</button><label>Grid (m)<select class="surface-grid"><option>0.1</option><option selected>0.5</option><option>1</option></select></label>
        <button data-action="finish">Close surface</button><button data-action="back">Remove last point</button><button data-action="stop">Cancel drawing</button></div>
      <div class="surface-edit-workspace"><svg viewBox="0 0 800 520" aria-label="2D surface drawing canvas"></svg>
        <div class="surface-coordinates"><h3>Point coordinates (m)</h3><p>Click to draw. Drag points or edit their coordinates.</p><div class="surface-points"></div></div></div>
      <p class="surface-error" role="alert" hidden></p>
      <footer><span class="surface-hint" role="status"></span><button data-action="cancel">Cancel</button><button data-action="apply" class="sheet-primary">Use surfaces</button></footer>`;
    document.body.append(this.dialog);
    this.svg = this.dialog.querySelector('svg');
    this.list = this.dialog.querySelector('.surface-list');
    this.translation = localizeFeature(this.dialog, () => state.locale);
    this.dialog.addEventListener('click', event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action) this.action(action);
    });
    this.list.addEventListener('change', () => {
      this.index = Number(this.list.value); this.path = null; this.render();
    });
    this.dialog.querySelector('.surface-points').addEventListener('change', event => {
      const input = event.target;
      if (!input.dataset.axis) return;
      const next = structuredClone(this.surfaces);
      next[this.index][Number(input.dataset.point)][input.dataset.axis] = Number(input.value);
      this.commit(next);
    });
    this.svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.drag) return;
      event.preventDefault();
      const point = this.pointer(event);
      if (this.path) {
        if (this.path.length >= 3 && Math.hypot(point.x - this.path[0].x, point.y - this.path[0].y) < .2) this.action('finish');
        else { this.path.push(point); this.render(false); }
        return;
      }
      const id = event.target.dataset.point;
      if (id == null) return;
      this.drag = { id: Number(id), pointerId: event.pointerId, before: structuredClone(this.surfaces) };
      this.svg.setPointerCapture(event.pointerId);
    });
    this.svg.addEventListener('pointermove', event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.surfaces[this.index][this.drag.id] = this.pointer(event);
      this.render(false);
    });
    const end = event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const next = structuredClone(this.surfaces);
      this.surfaces = this.drag.before;
      this.drag = null;
      if (event.type === 'pointercancel') this.render();
      else this.commit(next);
    };
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  }

  open() {
    this.surfaces = structuredClone(this.state.sheetSurfaces || []);
    this.index = 0; this.path = null; this.drag = null; this.history = []; this.future = [];
    this.error(''); this.render(); this.dialog.showModal();
  }

  error(message) {
    const el = this.dialog.querySelector('.surface-error');
    el.textContent = message; el.hidden = !message;
  }

  commit(next) {
    try {
      validateSheetSurfaces(next);
      this.history.push(structuredClone(this.surfaces));
      if (this.history.length > 60) this.history.shift();
      this.future = []; this.surfaces = next;
      this.index = Math.max(0, Math.min(this.index, next.length - 1));
      this.error(''); this.render(); return true;
    } catch (error) { this.error(error.message); this.render(); return false; }
  }

  action(action) {
    this.error('');
    const next = structuredClone(this.surfaces);
    const selected = next[this.index];
    if (action === 'cancel') { this.dialog.close(); return; }
    if (action === 'apply') {
      if (this.path) { this.error('Close or cancel the current drawing first.'); return; }
      if (!next.length) { this.error('Draw at least one surface first.'); return; }
      this.state.sheetSurfaces = next;
      this.dialog.close(); this.onApply(); return;
    }
    if (action === 'draw') { this.path = [{x:0,y:0}]; this.render(); return; }
    if (action === 'stop') { this.path = null; this.render(); return; }
    if (action === 'back') { if (this.path?.length > 1) this.path.pop(); this.render(false); return; }
    if (action === 'finish') {
      if (!this.path) return;
      if (this.commit([...next, this.path])) { this.index = next.length; this.path = null; this.render(); }
      return;
    }
    if (action === 'undo' || action === 'redo') {
      const from = action === 'undo' ? this.history : this.future;
      const to = action === 'undo' ? this.future : this.history;
      if (from.length) { to.push(next); this.surfaces = from.pop(); this.index = Math.max(0, Math.min(this.index, this.surfaces.length - 1)); }
      this.path = null; this.render(); return;
    }
    if (action === 'delete' && selected) { next.splice(this.index, 1); this.commit(next); }
    if (action === 'duplicate' && selected) { next.push(structuredClone(selected)); if (this.commit(next)) { this.index = next.length - 1; this.render(); } }
    if (['rectangle', 'triangle', 'trapezoid', 'resize'].includes(action)) {
      const width = Number(this.dialog.querySelector('.surface-width').value);
      const height = Number(this.dialog.querySelector('.surface-height').value);
      if (!(width > 0 && height > 0 && width <= 40 && height <= 40)) { this.error('Enter width and height greater than zero and up to 40 m.'); return; }
      if (action === 'resize') {
        if (!selected) return;
        const minX = Math.min(...selected.map(p => p.x)), minY = Math.min(...selected.map(p => p.y));
        const w = Math.max(...selected.map(p => p.x)) - minX, h = Math.max(...selected.map(p => p.y)) - minY;
        next[this.index] = selected.map(p => ({x:(p.x-minX)*width/w, y:(p.y-minY)*height/h}));
      } else {
        const top = action === 'triangle' ? [{x:width/2,y:height}] : action === 'trapezoid'
          ? [{x:width*.8,y:height},{x:width*.2,y:height}] : [{x:width,y:height},{x:0,y:height}];
        next.push([{x:0,y:0},{x:width,y:0},...top]);
      }
      if (this.commit(next)) { this.path = null; if (action !== 'resize') this.index = next.length - 1; this.render(); }
    }
  }

  pointer(event) {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    const grid = Number(this.dialog.querySelector('.surface-grid').value);
    return { x: +(Math.round(((p.x - 65) / this.scale + this.minX) / grid) * grid).toFixed(4),
      y: +(Math.round(((455 - p.y) / this.scale + this.minY) / grid) * grid).toFixed(4) };
  }

  render(fit = true) {
    const polygon = this.path || this.surfaces[this.index] || [];
    if (fit || !this.scale) {
      this.minX = Math.min(0, ...polygon.map(p => p.x)); this.minY = Math.min(0, ...polygon.map(p => p.y));
      const w = Math.max(12, ...polygon.map(p => p.x)) - this.minX;
      const h = Math.max(8, ...polygon.map(p => p.y)) - this.minY;
      this.scale = Math.min(660 / (w * 1.15), 380 / (h * 1.15));
    }
    const project = p => ({x:65+(p.x-this.minX)*this.scale,y:455-(p.y-this.minY)*this.scale});
    const origin = project({x:0,y:0});
    const grid = this.scale;
    const compact = window.matchMedia("(max-width: 680px)").matches;
    const font = compact ? 22 : 14;
    const radius = compact ? 17 : 11;
    const coords = polygon.map(project);
    this.svg.innerHTML = `<defs><pattern id="surfaceGrid" x="${origin.x}" y="${origin.y}" width="${grid}" height="${grid}" patternUnits="userSpaceOnUse"><path d="M ${grid} 0 L 0 0 0 ${grid}" fill="none" stroke="#dce5ef"/></pattern></defs>
      <rect width="800" height="520" fill="#f8fafc"/><rect width="800" height="520" fill="url(#surfaceGrid)"/>
      <path d="M 0 ${origin.y} H 800 M ${origin.x} 0 V 520" stroke="#64748b"/>
      <text x="${origin.x+8}" y="${origin.y+22}" font-size="${font}">(0, 0)</text><text x="20" y="24" font-size="${font}">↑ Y (m)</text><text x="724" y="495" font-size="${font}">X (m) →</text>
      <${this.path ? 'polyline' : 'polygon'} points="${coords.map(p => `${p.x},${p.y}`).join(' ')}" fill="${this.path ? 'none' : '#bfdbfe'}" stroke="#2563eb" stroke-width="2"/>
      ${coords.map((p,i) => {
        const next = polygon[(i+1)%polygon.length], q = coords[(i+1)%coords.length];
        const label = (!this.path || i < coords.length-1) && next ? `<text x="${(p.x+q.x)/2}" y="${(p.y+q.y)/2-10}" text-anchor="middle" font-size="${font}" paint-order="stroke" stroke="white" stroke-width="4" fill="#172c45">${Math.hypot(next.x-polygon[i].x,next.y-polygon[i].y).toFixed(2)} m</text>` : '';
        return `${label}<circle data-point="${i}" cx="${p.x}" cy="${p.y}" r="${radius}" fill="white" stroke="#2563eb" stroke-width="3"/><text x="${p.x+15}" y="${p.y-12}" font-size="${font}">${i+1}</text>`;
      }).join('')}`;
    this.list.innerHTML = this.surfaces.map((_,i) => `<option value="${i}">${slopeLetter(i)}</option>`).join('');
    this.list.value = String(this.index);
    this.dialog.querySelector('.surface-points').innerHTML = this.path ? '' : polygon.map((p,i) => `<label>${i+1} · X <input aria-label="${i+1} X" data-point="${i}" data-axis="x" type="number" step="0.1" value="${p.x}"> Y <input aria-label="${i+1} Y" data-point="${i}" data-axis="y" type="number" step="0.1" value="${p.y}"></label>`).join('');
    if (fit && polygon.length && !this.path) {
      this.dialog.querySelector('.surface-width').value = +(Math.max(...polygon.map(p=>p.x))-Math.min(...polygon.map(p=>p.x))).toFixed(4);
      this.dialog.querySelector('.surface-height').value = +(Math.max(...polygon.map(p=>p.y))-Math.min(...polygon.map(p=>p.y))).toFixed(4);
    }
    this.dialog.querySelector('.surface-hint').textContent = this.path ? 'Click to add points, then close the surface.' : 'Sheets run upwards along Y. Grid lines are 1 m apart.';
    for (const action of ['finish','back','stop']) this.dialog.querySelector(`[data-action="${action}"]`).disabled = !this.path;
    for (const action of ['delete','duplicate','resize']) this.dialog.querySelector(`[data-action="${action}"]`).disabled = !!this.path || !this.surfaces.length;
    this.dialog.querySelector('[data-action="undo"]').disabled = !this.history.length;
    this.dialog.querySelector('[data-action="redo"]').disabled = !this.future.length;
    this.translation.refresh();
  }
}
