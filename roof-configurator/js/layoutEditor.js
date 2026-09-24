import {
  joinLayoutInPlace, splitLayoutInPlace, selectionSurfaces, linkedPlanPoints, moveLayoutPoint,
  deleteLayoutPoint, deleteLayoutEdge, cloneLayout, defaultLayout, distance, footprintLayout, insertPoint,
  layoutBounds, layoutMetrics, lShapedLayout, pitchedFootprint, splitSurface, validateLayout,
} from './roofLayout.js?v=layout-8';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

export class RoofLayoutEditor {
  constructor(state, onApply) {
    this.state = state;
    this.onApply = onApply;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'roof-layout-dialog';
    this.dialog.setAttribute('aria-labelledby', 'layoutTitle');
    this.dialog.innerHTML = `
      <header><div><small>ROOF DESIGN STUDIO</small><h2 id="layoutTitle">Draw your roof</h2></div>
        <button type="button" data-action="cancel" aria-label="Close layout editor">×</button></header>
      <div class="layout-toolbar" aria-label="Drawing tools">
        <button type="button" data-action="select">Select / move</button>
        <button type="button" data-action="draw">New perimeter</button>
        <button type="button" data-action="split">Divide surface</button>
        <button type="button" data-action="insert">Insert edge point</button>
        <button type="button" data-action="splitPlace">Split in place</button>
        <button type="button" data-action="joinPlace">Join in place</button>
        <button type="button" data-action="cycleCopy">Next copy</button>
        <button type="button" data-action="delete">Delete selected</button>
        <button type="button" data-action="finish">Close perimeter</button>
        <button type="button" data-action="undo">Undo</button>
        <button type="button" data-action="redo">Redo</button>
        <button type="button" data-action="fit">Fit</button>
        <button type="button" data-action="zoomIn" aria-label="Zoom in">+</button>
        <button type="button" data-action="zoomOut" aria-label="Zoom out">−</button>
      </div>
      <div class="layout-workspace">
        <div class="layout-drawing"><svg tabindex="0" aria-label="Roof plan drawing canvas" role="application"></svg></div>
        <aside>
          <p class="layout-help"></p>
          <label>Grid snap (metres)<select id="layoutSnap">
            <option value="0.1">0.10 m</option><option value="0.25" selected>0.25 m</option>
            <option value="0.5">0.50 m</option><option value="1">1.00 m</option>
          </select></label>
          <p>All editor coordinates are in <strong>metres</strong>. Height is measured above the wall top.</p>
          <label>Point<select id="layoutPointSelect"><option value="">Select a point</option></select></label>
          <fieldset class="layout-point"><legend>Selected point <span id="layoutPointName">—</span></legend>
            <label>X (m)<input id="layoutX" type="number" min="-100" max="100" step="any"></label>
            <label>Z (m)<input id="layoutZ" type="number" min="-100" max="100" step="any"></label>
            <label>Height above wall (m)<input id="layoutH" type="number" min="0" max="30" step="any"></label>
            <button type="button" data-action="point">Update point</button>
          </fieldset>
          <fieldset class="layout-detach"><legend>Split in place</legend>
            <p>Choose the adjoining surfaces to detach. Copies share their plan position but have independent heights. A wall closes any height difference. Join in place reconnects all copies of the selected point or edge endpoints, keeping the selected heights.</p>
            <div id="layoutSplitFaces"></div>
            <output id="layoutCopyInfo"></output>
          </fieldset>
          <label>Starter pitch (degrees)<input id="layoutPitch" type="number" min="5" max="60" step="any" value="30"></label>
          <button type="button" data-action="pitch">Generate pitched roof</button>
          <p>New perimeters start with two slopes. Generate pitched roof replaces the current divisions and heights; Undo restores them.</p>
          <label>Example<select id="layoutExample"><option value="gable">Two slopes</option>
            <option value="hip">Hip roof</option><option value="lshape">L-shaped roof</option>
            <option value="saw">Consecutive slopes</option></select></label>
          <button type="button" data-action="example">Load example</button>
          <output class="layout-summary"></output>
          <p>Draw the outer roof edge. The Eaves overhang control sets the walls back beneath it; zero places walls at the roof edge. Non-planar surfaces are divided into triangular slopes; dashed lines show these divisions.</p>
          <p>Layout mode does not yet calculate flashings, gutters or a price estimate.</p>
        </aside>
      </div>
      <footer><div role="status" aria-live="polite" class="layout-status"></div>
        <button type="button" data-action="abort">Cancel drawing</button>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="apply" class="layout-primary">Apply roof</button></footer>`;
    document.body.appendChild(this.dialog);
    this.svg = this.dialog.querySelector('svg');
    this.dialog.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => this.action(button.dataset.action));
    });
    this.svg.addEventListener('pointerdown', event => this.click(event));
    this.svg.addEventListener('pointermove', event => this.movePoint(event));
    this.svg.addEventListener('pointerup', event => this.endDrag(event));
    this.svg.addEventListener('pointercancel', event => this.endDrag(event, true));
    this.svg.addEventListener('lostpointercapture', event => this.endDrag(event, true));
    this.dialog.addEventListener('cancel', () => this.endDrag(null, true));
    this.dialog.querySelector('#layoutPointSelect').addEventListener('change', event => {
      this.selectedEdge = null;
      this.selected = event.target.value === '' ? null : Number(event.target.value);
      this.mode = 'select';
      this.path = [];
      this.render();
    });
    this.dialog.addEventListener('keydown', event => {
      if (event.target.matches('input, select')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.action(event.shiftKey ? 'redo' : 'undo');
      } else if (event.key === 'Enter' && this.mode === 'draw') {
        event.preventDefault();
        this.action('finish');
      } else if (['Delete', 'Backspace'].includes(event.key) && !this.path.length && this.mode === 'select') {
        event.preventDefault();
        this.action('delete');
      } else if (event.key === 'Backspace' && this.path.length) {
        event.preventDefault();
        this.path.pop();
        this.render();
      }
    });
  }

  open() {
    this.layout = cloneLayout(this.state.roofLayout || defaultLayout());
    this.history = [];
    this.future = [];
    this.path = [];
    this.mode = 'select';
    this.selected = null;
    this.selectedEdge = null;
    this.drag = null;
    this.dialog.querySelector('#layoutPitch').value = Math.max(5, Math.min(60, this.state.pitch || 30));
    this.fit();
    this.render();
    this.status('Changes are a draft until you apply the roof.');
    this.dialog.showModal();
    this.dialog.scrollTop = 0;
    this.dialog.querySelector('aside').scrollTop = 0;
  }

  status(message) {
    this.dialog.querySelector('.layout-status').textContent = message;
  }

  commit(next) {
    validateLayout(next);
    this.history.push(cloneLayout(this.layout));
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    this.layout = next;
    this.selectedEdge = null;
    if (!this.layout.vertices[this.selected]) this.selected = null;
    this.status('Draft updated.');
    this.render();
  }

  fit() {
    const bounds = layoutBounds(this.layout);
    this.center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    this.span = Math.max(10, (bounds.maxX - bounds.minX) * 0.9, (bounds.maxZ - bounds.minZ) * 1.3);
  }

  action(action) {
    this.endDrag(null, true);
    try {
      if (['select', 'draw', 'split', 'insert'].includes(action)) {
        this.mode = action;
        this.path = [];
        this.selected = null;
        this.selectedEdge = null;
      } else if (action === 'cancel') {
        this.dialog.close();
        return;
      } else if (action === 'abort') {
        this.path = [];
        this.mode = 'select';
      } else if (action === 'finish') {
        if (this.mode !== 'draw') return;
        this.commit(pitchedFootprint(this.path, this.starterPitch()));
        this.path = [];
        this.mode = 'select';
        this.selected = null;
        this.selectedEdge = null;
      } else if (action === 'pitch') {
        if (this.path.length) throw new Error('Finish or cancel the drawing first.');
        const perimeter = this.layout.boundary.map(id => this.layout.vertices[id]);
        this.commit(pitchedFootprint(perimeter, this.starterPitch()));
        this.selected = null;
        this.selectedEdge = null;
        this.mode = 'select';
      } else if (action === 'undo' || action === 'redo') {
        if (this.path.length) this.path.pop();
        else {
          const from = action === 'undo' ? this.history : this.future;
          const to = action === 'undo' ? this.future : this.history;
          if (from.length) {
            to.push(cloneLayout(this.layout));
            this.layout = from.pop();
            this.selected = null;
            this.selectedEdge = null;
          }
        }
      } else if (action === 'cycleCopy') {
        this.cycleCopy();
      } else if (action === 'joinPlace') {
        if (this.mode !== 'select') return;
        const next = joinLayoutInPlace(this.layout, this.selectionIds());
        this.selected = null;
        this.selectedEdge = null;
        this.commit(next);
        this.status('Copies joined using the selected heights. Undo restores the split and original heights.');
      } else if (action === 'splitPlace') {
        const ids = this.selectionIds();
        if (!ids.length || this.mode !== 'select') return;
        const faces = [...this.dialog.querySelectorAll('#layoutSplitFaces input:checked')]
          .map(input => Number(input.value));
        const result = splitLayoutInPlace(this.layout, ids, faces);
        this.commit(result.layout);
        this.selected = ids.length === 1 ? result.copies[0] : null;
        this.selectedEdge = ids.length === 2 ? result.copies : null;
        this.status('Split created. Use Next copy to select either side and change its height independently.');
      } else if (action === 'delete') {
        if (this.mode !== 'select' || this.path.length) return;
        let next;
        if (this.selected !== null) next = deleteLayoutPoint(this.layout, this.selected);
        else if (this.selectedEdge) next = deleteLayoutEdge(this.layout, ...this.selectedEdge);
        else return;
        this.selected = null;
        this.selectedEdge = null;
        this.commit(next);
        this.status('Selection deleted. Adjoining surfaces may merge; Undo restores the previous roof.');
      } else if (action === 'point') {
        if (this.selected === null) return;
        const fields = ['X', 'Z', 'H'].map(axis => this.dialog.querySelector(`#layout${axis}`));
        if (fields.some(input => input.value === '' || !input.checkValidity())) {
          throw new Error('Enter valid coordinates and a height between 0 and 30 m.');
        }
        const next = cloneLayout(this.layout);
        const [x, z, h] = fields.map(input => Number(input.value));
        moveLayoutPoint(next, this.selected, { x, z, h });
        this.commit(next);
      } else if (action === 'fit') {
        this.fit();
      } else if (action === 'zoomIn' || action === 'zoomOut') {
        this.span = Math.max(4, Math.min(220, this.span * (action === 'zoomIn' ? 0.8 : 1.25)));
      } else if (action === 'example') {
        const type = this.dialog.querySelector('#layoutExample').value;
        let next = defaultLayout();
        if (type === 'lshape') {
          next = lShapedLayout();
        } else if (type === 'hip') {
          next = {
            version: 1,
            vertices: [
              { x: -5, z: -3, h: 0 }, { x: 5, z: -3, h: 0 },
              { x: 5, z: 3, h: 0 }, { x: -5, z: 3, h: 0 },
              { x: -2, z: 0, h: 2 }, { x: 2, z: 0, h: 2 },
            ],
            boundary: [0, 1, 2, 3],
            faces: [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]],
          };
        } else if (type === 'saw') {
          next = footprintLayout([{ x: -6, z: -4 }, { x: 6, z: -4 }, { x: 6, z: 4 }, { x: -6, z: 4 }]);
          for (const x of [-3, 0, 3]) next = splitSurface(next, [{ x, z: -4 }, { x, z: 4 }]);
          next.vertices.forEach(p => { p.h = Math.abs(p.x) === 3 ? 2 : 0; });
        }
        this.commit(next);
        this.path = [];
        this.mode = 'select';
        this.selected = null;
        this.selectedEdge = null;
        this.fit();
      } else if (action === 'apply') {
        if (this.path.length) throw new Error('Finish or cancel the current drawing before applying.');
        validateLayout(this.layout);
        this.state.roofLayout = cloneLayout(this.layout);
        this.state.roofType = 'layout';
        this.onApply();
        this.dialog.close();
        return;
      }
      this.render();
    } catch (error) {
      this.status(error.message);
    }
  }

  selectionIds() {
    return this.selected !== null ? [this.selected] : this.selectedEdge || [];
  }

  selectionCopies() {
    if (this.selected !== null) return linkedPlanPoints(this.layout, this.selected).map(id => [id]);
    if (!this.selectedEdge) return [];
    const key = ids => ids.map(id => linkedPlanPoints(this.layout, id)[0]).sort((a, b) => a - b).join(':');
    const target = key(this.selectedEdge);
    const edges = new Map();
    this.layout.faces.forEach(face => face.forEach((a, i) => {
      const edge = [a, face[(i + 1) % face.length]].sort((a, b) => a - b);
      if (key(edge) === target) edges.set(edge.join(':'), edge);
    }));
    return [...edges.values()];
  }

  cycleCopy() {
    const copies = this.selectionCopies();
    if (copies.length < 2) return;
    const ids = this.selectionIds();
    const index = copies.findIndex(copy => copy.every(id => ids.includes(id)));
    const next = copies[(index + 1) % copies.length];
    this.selected = next.length === 1 ? next[0] : null;
    this.selectedEdge = next.length === 2 ? next : null;
  }

  starterPitch() {
    const input = this.dialog.querySelector('#layoutPitch');
    if (!input.value || !input.checkValidity()) throw new Error('Enter a starter pitch between 5° and 60°.');
    return Number(input.value);
  }

  rawPointer(event) {
    const point = new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(this.svg.getScreenCTM().inverse());
    return {
      x: this.center.x + (point.x - 400) / this.scale,
      z: this.center.z + (point.y - 300) / this.scale,
    };
  }

  movePoint(event) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!drag.moved && Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) < 3) return;
    drag.moved = true;
    const raw = this.rawPointer(event);
    const next = cloneLayout(drag.original);
    const point = next.vertices[drag.id];
    const snap = Number(this.dialog.querySelector('#layoutSnap').value);
    if (drag.heightMode) {
      point.h = Math.round((point.h + drag.start.z - raw.z) / snap) * snap;
    } else {
      point.x = Math.round((point.x + raw.x - drag.start.x) / snap) * snap;
      point.z = Math.round((point.z + raw.z - drag.start.z) / snap) * snap;
    }
    moveLayoutPoint(next, drag.id, { ...point });
    try {
      validateLayout(next);
      this.layout = next;
      drag.valid = true;
      this.render();
      this.status(drag.heightMode ? 'Release to set the height.' : 'Release to move the point. Shift-drag adjusts height.');
    } catch (error) {
      drag.valid = false;
      this.status(`${error.message} Release to cancel this move.`);
    }
  }

  endDrag(event, cancel = false) {
    const drag = this.drag;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    this.drag = null;
    if (this.svg.hasPointerCapture(drag.pointerId)) this.svg.releasePointerCapture(drag.pointerId);
    const next = this.layout;
    this.layout = drag.original;
    if (drag.moved && drag.valid && !cancel) this.commit(next);
    else {
      this.render();
      if (drag.moved) this.status('Move cancelled; the original point has been restored.');
    }
  }

  // Convert with the SVG screen matrix so touch and letterboxed canvases agree.
  pointer(event) {
    const raw = this.rawPointer(event);
    const tolerance = (this.svg.clientWidth < 500 ? 28 : 14) / this.scale;
    if (this.mode !== 'draw') {
      const id = this.layout.vertices.reduce((best, p, i) => distance(p, raw) < tolerance &&
        (best < 0 || distance(p, raw) < distance(this.layout.vertices[best], raw)) ? i : best, -1);
      if (id >= 0) {
        const chosen = this.mode !== 'select' && linkedPlanPoints(this.layout, id).includes(this.selected)
          ? this.selected : id;
        return { ...this.layout.vertices[chosen], id: chosen, edge: true };
      }
      let closest = null;
      this.layout.faces.forEach(face => face.forEach((id, i) => {
        const a = this.layout.vertices[id], b = this.layout.vertices[face[(i + 1) % face.length]];
        const length2 = distance(a, b) ** 2;
        const t = Math.max(0, Math.min(1, ((raw.x - a.x) * (b.x - a.x) + (raw.z - a.z) * (b.z - a.z)) / length2));
        const p = { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z), edge: true, edgeIds: [id, face[(i + 1) % face.length]] };
        if (distance(p, raw) < tolerance && (!closest || distance(p, raw) < distance(closest, raw))) closest = p;
      }));
      if (closest) return closest;
    }
    const snap = Number(this.dialog.querySelector('#layoutSnap').value);
    return { x: Math.round(raw.x / snap) * snap, z: Math.round(raw.z / snap) * snap };
  }

  click(event) {
    if (event.button !== 0 || this.drag || event.isPrimary === false) return;
    event.preventDefault();
    const point = this.pointer(event);
    try {
      if (this.mode === 'select') {
        const copies = point.id === undefined ? [] : linkedPlanPoints(this.layout, point.id);
        this.selected = copies.includes(this.selected) ? this.selected : point.id ?? null;
        this.selectedEdge = this.selected === null ? point.edgeIds ?? null : null;
        this.svg.focus();
        if (this.selected !== null) {
          this.drag = {
            pointerId: event.pointerId, id: this.selected,
            original: cloneLayout(this.layout), start: this.rawPointer(event),
            screenX: event.clientX, screenY: event.clientY,
            heightMode: event.shiftKey, moved: false, valid: true,
          };
          this.svg.setPointerCapture(event.pointerId);
        }
      } else if (this.mode === 'draw') {
        if (this.path.length >= 3 && distance(point, this.path[0]) < 14 / this.scale) {
          this.action('finish');
          return;
        }
        if (this.path.length >= 160) throw new Error('Maximum 160 perimeter points.');
        this.path.push(point);
      } else if (this.mode === 'insert') {
        const next = cloneLayout(this.layout);
        this.selected = insertPoint(next, point);
        this.commit(next);
        this.mode = 'select';
      } else if (this.mode === 'split') {
        if (!this.path.length && !point.edge) throw new Error('Start on an existing surface edge or point.');
        if (this.path.length && point.edge) {
          this.commit(splitSurface(this.layout, [...this.path, point]));
          this.path = [];
        } else this.path.push(point);
      }
      this.render();
    } catch (error) {
      this.status(error.message);
    }
  }

  render() {
    this.scale = 550 / this.span;
    const project = p => ({ x: 400 + (p.x - this.center.x) * this.scale, y: 300 + (p.z - this.center.z) * this.scale });
    const coords = points => points.map(p => { const v = project(p); return `${v.x},${v.y}`; }).join(' ');
    this.svg.setAttribute('viewBox', '0 0 800 600');
    this.svg.replaceChildren();
    const grid = Math.max(1, Math.ceil(this.span / 30));
    for (let n = -100; n <= 100; n += grid) {
      const a = project({ x: n, z: n });
      this.svg.append(svgElement('line', { x1: a.x, x2: a.x, y1: 0, y2: 600, class: 'layout-grid' }));
      this.svg.append(svgElement('line', { x1: 0, x2: 800, y1: a.y, y2: a.y, class: 'layout-grid' }));
    }
    if (this.mode !== 'draw') {
      this.layout.faces.forEach((face, i) => {
        this.svg.append(svgElement('polygon', {
          points: coords(face.map(id => this.layout.vertices[id])),
          fill: ['#dbeafe', '#d1fae5', '#fef3c7', '#ede9fe'][i % 4],
          class: selectionSurfaces(this.layout, this.selectionIds()).includes(i) ? 'layout-face attached' : 'layout-face',
        }));
      });
      const metrics = layoutMetrics(this.layout);
      metrics.triangles.forEach(triangle => {
        this.svg.append(svgElement('polygon', {
          points: coords(triangle.map(id => this.layout.vertices[id])), class: 'layout-triangle',
        }));
      });
      this.layout.boundary.forEach((id, index) => {
        const a = this.layout.vertices[id];
        const b = this.layout.vertices[this.layout.boundary[(index + 1) % this.layout.boundary.length]];
        const mid = project({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        const label = svgElement('text', { x: mid.x, y: mid.y + 16, 'text-anchor': 'middle' });
        label.textContent = `${distance(a, b).toFixed(2)} m`;
        this.svg.append(label);
      });
      if (this.selectedEdge) {
        const [a, b] = this.selectedEdge.map(id => project(this.layout.vertices[id]));
        this.svg.append(svgElement('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: '#dc2626', 'stroke-width': 5, 'pointer-events': 'none',
        }));
      }
      this.layout.vertices.forEach((p, id) => {
        const copies = linkedPlanPoints(this.layout, id);
        const visible = copies.includes(this.selected) ? this.selected : copies[0];
        if (id !== visible) return;
        const v = project(p);
        this.svg.append(svgElement('circle', { cx: v.x, cy: v.y, r: 7, class: id === this.selected ? 'layout-node selected' : 'layout-node' }));
        const rightSide = v.x > 600;
        const label = svgElement('text', {
          x: v.x + (rightSide ? -11 : 11), y: v.y - 10,
          'text-anchor': rightSide ? 'end' : 'start',
        });
        label.textContent = `${id + 1} · ${p.h.toFixed(2)} m${copies.length > 1 ? ` · copy ${copies.indexOf(id) + 1}/${copies.length}` : ''}`;
        this.svg.append(label);
      });
      this.dialog.querySelector('.layout-summary').textContent =
        `${this.layout.faces.length} surfaces · ${metrics.footprint.toFixed(2)} m² plan · ${metrics.roofArea.toFixed(2)} m² roof`;
    }
    if (this.path.length) {
      this.svg.append(svgElement('polyline', { points: coords(this.path), class: 'layout-path' }));
      this.path.forEach(p => {
        const v = project(p);
        this.svg.append(svgElement('circle', { cx: v.x, cy: v.y, r: 6, class: 'layout-node' }));
      });
    }
    const hints = {
      select: 'Split in place detaches chosen adjoining surfaces for independent height control. Next copy cycles stacked points or edges; attached surfaces are highlighted. Select a point or edge, then Delete selected (or Delete/Backspace). Removing a dividing edge merges its adjoining surfaces. Outer edges must stay closed. Drag a point to move it on the plan. Shift-drag up/down changes its height. You can also enter exact coordinates below. Shared points update adjoining surfaces.',
      draw: 'Click around the outer roof edge. Click the first point or Close perimeter to finish. This creates a pitched roof at the starter pitch and replaces the current draft.',
      split: 'Start on a surface edge, add optional interior points, then finish on another edge of the same surface. Raise the new points to form ridges, or lower them for valleys.',
      insert: 'Click an existing edge to add a shared point. Then set its height or coordinates.',
    };
    this.dialog.querySelector('.layout-help').textContent = hints[this.mode];
    const incident = selectionSurfaces(this.layout, this.selectionIds());
    const splitFaces = this.dialog.querySelector('#layoutSplitFaces');
    splitFaces.replaceChildren();
    incident.forEach((index, i) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = index;
      input.checked = i === 0;
      input.disabled = incident.length < 2;
      label.append(input, `Surface ${index + 1} (points ${this.layout.faces[index].map(id => id + 1).join(', ')})`);
      splitFaces.append(label);
    });
    const copies = this.selectionCopies();
    this.dialog.querySelector('#layoutCopyInfo').textContent = copies.length > 1
      ? `${copies.length} copies here. Selected ${this.selected !== null ? 'point' : 'edge'}: ${this.selectionIds().map(id => id + 1).join('–')}. Attached surfaces: ${incident.map(i => i + 1).join(', ')}.`
      : 'Select a shared point or dividing edge to split it.';
    this.dialog.querySelector('.layout-point').disabled = this.selected === null;
    this.dialog.querySelector('#layoutPointName').textContent = this.selected === null ? '—' : this.selected + 1;
    const pointSelect = this.dialog.querySelector('#layoutPointSelect');
    pointSelect.replaceChildren(new Option('Select a point', ''));
    this.layout.vertices.forEach((_, id) => pointSelect.add(new Option(`Point ${id + 1}`, String(id))));
    pointSelect.value = this.selected === null ? '' : String(this.selected);
    const point = this.layout.vertices[this.selected];
    for (const axis of ['x', 'z', 'h']) {
      this.dialog.querySelector(`#layout${axis.toUpperCase()}`).value = point ? Number(point[axis].toFixed(4)) : '';
    }
    this.dialog.querySelectorAll('[data-action]').forEach(button => {
      const action = button.dataset.action;
      if (['select', 'draw', 'split', 'insert'].includes(action)) button.setAttribute('aria-pressed', String(action === this.mode));
      if (action === 'splitPlace') button.disabled = this.mode !== 'select' || incident.length < 2;
      if (action === 'joinPlace') button.disabled = this.mode !== 'select' ||
        !this.selectionIds().some(id => linkedPlanPoints(this.layout, id).length > 1);
      if (action === 'cycleCopy') button.disabled = this.mode !== 'select' || copies.length < 2;
      if (action === 'delete') button.disabled = this.mode !== 'select' || (this.selected === null && !this.selectedEdge);
      if (action === 'finish') button.disabled = this.mode !== 'draw' || this.path.length < 3;
      if (action === 'undo') button.disabled = !this.history.length && !this.path.length;
      if (action === 'redo') button.disabled = !this.future.length || !!this.path.length;
    });
  }
}
