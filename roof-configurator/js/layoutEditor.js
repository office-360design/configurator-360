import {
  meetRoofSlope, alignmentDirections, inside, triangulate, onSegment, addLayoutPoint,
  joinLayoutInPlace, splitLayoutInPlace, selectionSurfaces, linkedPlanPoints, moveLayoutPoint,
  deleteLayoutPoint, deleteLayoutEdge, cloneLayout, defaultLayout, distance, footprintLayout,
  layoutFoldEdges, layoutSlopeDirections, layoutBounds, layoutMetrics, lShapedLayout, pitchedFootprint, splitSurface, validateLayout,
} from './roofLayout.js?v=layout-16';

import { drawAlignmentPreview } from './alignmentPreview.js?v=layout-16';

function surfaceLetter(index) {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + (n - 1) % 26) + label;
  }
  return label;
}

// Use the polygon centroid, falling back inside a triangle for concave faces.
function surfaceLabelPosition(face, vertices) {
  const points = face.map(id => vertices[id]);
  let area = 0, x = 0, z = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  });
  const center = { x: x / (3 * area), z: z / (3 * area) };
  if (inside(center, points)) return center;
  const triangles = triangulate(face, vertices).map(ids => ids.map(id => vertices[id]));
  const size = ([a, b, c]) => Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
  const triangle = triangles.reduce((best, current) => size(current) > size(best) ? current : best);
  return { x: triangle.reduce((sum, p) => sum + p.x, 0) / 3,
    z: triangle.reduce((sum, p) => sum + p.z, 0) / 3 };
}

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
    let helpId = 0;
    const help = (label, text) => {
      const id = `layoutHelp${++helpId}`;
      return `<span class="layout-help-wrap"><button type="button" class="layout-info"
        aria-label="${label} help" popovertarget="${id}">i</button>
        <span id="${id}" popover class="layout-tip">${text}</span></span>`;
    };
    this.dialog.innerHTML = `
      <header><div><small>ROOF DESIGN STUDIO</small><h2 id="layoutTitle">Draw your roof</h2></div>
        <button type="button" data-action="cancel" aria-label="Close layout editor">×</button></header>
      <div class="layout-toolbar" aria-label="Drawing tools">
        <button type="button" data-action="select">Select / move</button>
        <button type="button" data-action="draw">New perimeter</button>
        <button type="button" data-action="split">Divide surface</button>
        <button type="button" data-action="insert">Insert point</button>
        <button type="button" data-action="meet">Meet roof slope</button>
        <button type="button" data-action="splitPlace">Split in place</button>
        <button type="button" data-action="joinPlace">Join in place</button>
        <button type="button" data-action="cycleCopy">Next copy</button>
        <button type="button" data-action="delete">Delete selected</button>
        <button type="button" data-action="finish">Close perimeter</button>
      </div>
      <div class="layout-workspace">
        <div class="layout-drawing">
          <svg tabindex="0" aria-label="Roof plan drawing canvas" role="application"></svg>
          <div class="layout-canvas-controls layout-history" role="group" aria-label="History">
            <button type="button" data-action="undo" title="Undo (Ctrl/⌘ Z)"><span aria-hidden="true">↶</span> Undo</button>
            <button type="button" data-action="redo" title="Redo (Ctrl/⌘ Shift Z)"><span aria-hidden="true">↷</span> Redo</button>
          </div>
          <div class="layout-canvas-controls layout-zoom" role="group" aria-label="View controls">
            <button type="button" data-action="zoomOut" aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" data-action="zoomIn" aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" data-action="fit" title="Fit roof in view">Fit</button>
          </div>
          <div class="layout-canvas-controls layout-overlays">
            <button type="button" data-action="slopeArrows" aria-pressed="false" title="Show downhill slope directions">↘ Slope arrows</button>
          </div>
          <div class="layout-mode-hint"><span id="layoutModeLabel">Select / move</span>
            ${help('Drawing tools', '<span class="layout-help"></span>')}</div>
        </div>
        <aside aria-label="Roof properties">
          <div class="layout-panel-heading">Roof properties
            ${help('Coordinates', 'All coordinates are in metres. Heights are measured above the wall top. Drag points to move them; Shift-drag changes height.')}</div>
          <fieldset class="layout-meet" aria-labelledby="layoutMeetTitle" hidden><div class="layout-section-heading"><span id="layoutMeetTitle">Meet roof slope</span> ${help('Meet roof slope', "Keep position adjusts height. Keep height moves the point along a connected edge. The target’s other points stay fixed. Split copies share X/Z; the selected copy and target copy reconnect at the meeting height.")}</div>
            <label>Target slope<select id="meetTarget"></select></label>
            <button type="button" data-action="pickTarget">Pick slope on plan</button>
            <label>Alignment<select id="meetMode"><option value="position">Keep position</option>
              <option value="height">Keep height</option></select></label>
            <div id="meetHeightControls" hidden>
              <label>Height above wall (m)<input id="meetHeight" type="number" min="0" max="30" step="any"></label>
              <label>Edge direction<select id="meetDirection"></select></label>
              <button type="button" data-action="pickDirection">Pick connected edge</button>
            </div>
            <output id="meetResult" aria-live="polite"></output>
            <svg id="meetPreview" role="img" aria-label="3D alignment preview" hidden></svg>
            <button type="button" data-action="applyMeet" disabled>Apply alignment</button>
            <button type="button" data-action="cancelMeet">Cancel alignment</button>
          </fieldset>
          <div class="layout-select-row"><label>Grid snap<select id="layoutSnap">
            <option value="0.1">0.10 m</option><option value="0.25" selected>0.25 m</option>
            <option value="0.5">0.50 m</option><option value="1">1.00 m</option>
          </select></label>
          <label>Point<select id="layoutPointSelect"><option value="">Select a point</option></select></label></div>
          <fieldset class="layout-point"><legend>Selected point <span id="layoutPointName">—</span></legend>
            <div class="layout-coordinate-row"><label>X (m)<input id="layoutX" type="number" min="-100" max="100" step="any"></label>
            <label>Z (m)<input id="layoutZ" type="number" min="-100" max="100" step="any"></label>
            <label>Height (m)<input id="layoutH" type="number" min="0" max="30" step="any"></label></div>
            <button type="button" data-action="point">Update point</button>
          </fieldset>
          <fieldset class="layout-detach"><legend>Connected surfaces
            ${help('Split and join', 'Choose adjoining surfaces to detach using the checkboxes or Pick surfaces on plan, then use Split in place. Copies share position but have independent heights. Join in place reconnects copies using the selected heights. Next copy cycles coincident points or edges.')}</legend>
            <button type="button" data-action="pickSplitFaces">Pick surfaces on plan</button>
            <div id="layoutSplitFaces"></div>
            <output id="layoutCopyInfo"></output>
          </fieldset>
          <details class="layout-setup"><summary>Roof setup &amp; examples</summary>
          <label>Starter pitch (degrees) ${help('Starter pitch', 'New perimeters start with two slopes. Generate pitched roof replaces all current divisions and heights. Undo restores them.')}<input id="layoutPitch" type="number" min="5" max="60" step="any" value="30"></label>
          <button type="button" data-action="pitch">Generate pitched roof</button>
          <label>Example<select id="layoutExample"><option value="gable">Two slopes</option>
            <option value="hip">Hip roof</option><option value="lshape">L-shaped roof</option>
            <option value="saw">Consecutive slopes</option></select></label>
          <button type="button" data-action="example">Load example</button>
          </details>
          <div class="layout-panel-heading layout-totals"><output class="layout-summary"></output>
            ${help('Roof layout', 'Draw the outer roof edge. Eaves overhang sets the walls back beneath it. Non-planar surfaces are triangulated; dashed lines show those divisions. Layout mode does not yet calculate flashings, gutters or a price estimate.')}</div>
        </aside>
      </div>
      <footer><div role="status" aria-live="polite" class="layout-status"></div>
        <button type="button" data-action="abort">Cancel drawing</button>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="apply" class="layout-primary">Apply roof</button></footer>`;
    const icons = { select: '↖', draw: '⬡', split: '╱', insert: '⊕', meet: '∠',
      splitPlace: '⇉', joinPlace: '⋈', cycleCopy: '⇄', delete: '×', finish: '✓' };
    this.dialog.querySelectorAll('.layout-toolbar button').forEach(button => {
      const icon = document.createElement('span');
      icon.className = 'layout-tool-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = icons[button.dataset.action];
      const label = document.createElement('span');
      label.className = 'layout-tool-label';
      label.textContent = button.textContent;
      button.replaceChildren(icon, label);
    });
    document.body.appendChild(this.dialog);
    this.dialog.querySelectorAll('.layout-info').forEach(button => {
      const tip = this.dialog.querySelector(`#${button.getAttribute('popovertarget')}`);
      const show = () => {
        tip.showPopover();
        const rect = button.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(rect.right - tip.offsetWidth, innerWidth - tip.offsetWidth - 8))}px`;
        tip.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - tip.offsetHeight - 8))}px`;
      };
      button.addEventListener('click', event => { event.preventDefault(); show(); });
      button.addEventListener('mouseenter', show);
      button.addEventListener('mouseleave', () => { if (document.activeElement !== button) tip.hidePopover(); });
      button.addEventListener('focus', show);
      button.addEventListener('blur', () => tip.hidePopover());
      // Click also positions the native popover for touch users.
      tip.addEventListener('toggle', () => { if (tip.matches(':popover-open')) show(); });
    });
    this.svg = this.dialog.querySelector('svg');
    this.dialog.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => this.action(button.dataset.action));
    });
    this.svg.addEventListener('pointerdown', event => this.click(event));
    this.svg.addEventListener('pointermove', event => this.movePoint(event));
    this.svg.addEventListener('pointerup', event => this.endDrag(event));
    this.svg.addEventListener('pointercancel', event => this.endDrag(event, true));
    this.svg.addEventListener('lostpointercapture', event => this.endDrag(event, true));
    this.dialog.addEventListener('cancel', () => { this.endDrag(null, true); this.stopMeet(); });
    ['meetTarget', 'meetMode', 'meetDirection', 'meetHeight'].forEach(id => {
      this.dialog.querySelector(`#${id}`).addEventListener('input', () => this.previewMeet());
    });
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
    this.stopMeet();
    this.layout = cloneLayout(this.state.roofLayout || defaultLayout());
    this.pickingSplitFaces = false;
    this.splitSelectionKey = null;
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
    this.pickingSplitFaces = false;
    this.splitSelectionKey = null;
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
    if (!['slopeArrows', 'pickSplitFaces', 'splitPlace', 'fit', 'zoomIn', 'zoomOut'].includes(action)) this.pickingSplitFaces = false;
    try {
      const meetActions = ['meet', 'pickTarget', 'pickDirection', 'applyMeet', 'cancelMeet', 'slopeArrows', 'fit', 'zoomIn', 'zoomOut'];
      if (this.meet && !meetActions.includes(action)) {
        if (action === 'apply') throw new Error('Apply or cancel the alignment preview first.');
        this.stopMeet();
      }
      if (action === 'slopeArrows') {
        this.showSlopeArrows = !this.showSlopeArrows;
      } else if (action === 'pickSplitFaces') {
        this.pickingSplitFaces = !this.pickingSplitFaces;
        this.status(this.pickingSplitFaces ? 'Click adjoining surfaces to toggle them. Highlighted surfaces will detach; then choose Split in place.' : 'Surface selection ready. Choose Split in place to detach the highlighted surfaces.');
      } else if (action === 'meet') {
        this.startMeet();
      } else if (action === 'pickTarget' || action === 'pickDirection') {
        if (!this.meet) return;
        this.mode = action === 'pickTarget' ? 'meetTarget' : 'meetDirection';
      } else if (action === 'cancelMeet') {
        this.stopMeet();
        this.status('Alignment cancelled. The draft is unchanged.');
      } else if (action === 'applyMeet') {
        if (!this.meet?.result) return;
        const next = this.meet.result.layout;
        this.stopMeet();
        this.selected = null;
        this.commit(next);
        this.status('Roof aligned. Undo restores the previous junction.');
      } else if (['select', 'draw', 'split', 'insert'].includes(action)) {
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

  stopMeet() {
    this.meet = null;
    if (this.mode?.startsWith('meet')) this.mode = 'select';
    this.dialog.querySelector('.layout-meet').hidden = true;
  }

  startMeet() {
    if (this.selected === null) throw new Error('Select the point to align first.');
    this.meet = { pointId: this.selected, result: null };
    this.mode = 'meetTarget';
    this.path = [];
    this.dialog.querySelector('.layout-meet').hidden = false;
    const targets = this.dialog.querySelector('#meetTarget');
    targets.replaceChildren(new Option('Choose a slope or click it on the plan', ''));
    this.layout.faces.forEach((face, index) => targets.add(new Option(
      `Surface ${surfaceLetter(index)} · points ${face.map(id => id + 1).join(', ')}`, index)));
    const directions = this.dialog.querySelector('#meetDirection');
    directions.replaceChildren(new Option('Choose a connected edge', ''));
    alignmentDirections(this.layout, this.selected).forEach(id => directions.add(new Option(
      `Point ${this.selected + 1} — point ${id + 1}`, id)));
    this.dialog.querySelector('#meetHeight').value = this.layout.vertices[this.selected].h;
    this.dialog.querySelector('#meetMode').value = 'position';
    this.previewMeet();
    this.dialog.querySelector('.layout-meet').scrollIntoView({ block: 'nearest' });
  }

  previewMeet() {
    if (!this.meet) return;
    const get = id => this.dialog.querySelector(`#${id}`);
    this.meet.result = null;
    get('meetPreview').toggleAttribute('hidden', true);
    this.dialog.querySelector('[data-action="applyMeet"]').disabled = true;
    get('meetHeightControls').hidden = get('meetMode').value !== 'height';
    try {
      if (get('meetTarget').value === '') throw new Error('Choose the target roof slope.');
      const result = meetRoofSlope(this.layout, {
        pointId: this.meet.pointId, faceIndex: Number(get('meetTarget').value),
        mode: get('meetMode').value,
        height: get('meetHeight').value === '' ? NaN : Number(get('meetHeight').value),
        directionId: get('meetDirection').value === '' ? null : Number(get('meetDirection').value),
      });
      this.meet.result = result;
      get('meetResult').textContent = `Preview: X ${result.position.x.toFixed(3)} m, Z ${result.position.z.toFixed(3)} m, height ${result.position.h.toFixed(3)} m. Plan move ${result.distance.toFixed(3)} m.`
        + (result.reconnected ? ' Selected and target copies will reconnect.' : '');
      get('meetPreview').toggleAttribute('hidden', false);
      drawAlignmentPreview(get('meetPreview'), result.layout, Number(get('meetTarget').value), result.position);
      this.dialog.querySelector('[data-action="applyMeet"]').disabled = false;
    } catch (error) {
      get('meetResult').textContent = error.message;
    }
    this.render();
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
      if (this.meet) {
        if (this.mode === 'meetDirection') {
          const linked = linkedPlanPoints(this.layout, this.meet.pointId);
          const ids = point.edgeIds;
          const neighbor = ids?.find(id => !linked.includes(id));
          if (!ids?.some(id => linked.includes(id)) ||
            !alignmentDirections(this.layout, this.meet.pointId).includes(neighbor)) {
            throw new Error('Click a connected edge away from its endpoints, or choose it in the direction list.');
          }
          this.dialog.querySelector('#meetDirection').value = neighbor;
        } else {
          const raw = this.rawPointer(event);
          const element = event.target.closest('.layout-face');
          const index = element ? Number(element.dataset.face) : this.layout.faces.findIndex(face =>
            inside(raw, face.map(id => this.layout.vertices[id])));
          if (index < 0) throw new Error('Click inside the target roof slope.');
          this.dialog.querySelector('#meetTarget').value = index;
        }
        this.previewMeet();
      } else if (this.pickingSplitFaces) {
        const raw = this.rawPointer(event);
        const index = this.layout.faces.findIndex(face => inside(raw, face.map(id => this.layout.vertices[id])));
        if (!selectionSurfaces(this.layout, this.selectionIds()).includes(index)) {
          throw new Error('Choose a surface adjoining the selected point or edge.');
        }
        if (this.detachFaces.has(index)) this.detachFaces.delete(index);
        else this.detachFaces.add(index);
      } else if (this.mode === 'select') {
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
        const added = addLayoutPoint(this.layout, point);
        this.selected = added.id;
        this.commit(added.layout);
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
    const incident = selectionSurfaces(this.layout, this.selectionIds());
    const selectionKey = `${this.selectionIds().join(':')}|${JSON.stringify(this.layout.faces)}`;
    if (selectionKey !== this.splitSelectionKey) {
      this.splitSelectionKey = selectionKey;
      this.detachFaces = new Set(incident.slice(0, 1));
      this.pickingSplitFaces = false;
    }
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
          'data-face': i,
          fill: ['#dbeafe', '#d1fae5', '#fef3c7', '#ede9fe'][i % 4],
          class: this.meet && this.dialog.querySelector('#meetTarget').value === String(i) ? 'layout-face meet-target'
            : incident.includes(i) ? `layout-face attached${this.detachFaces.has(i) && incident.length > 1 ? ' detach-selected' : ''}`
              : `layout-face${this.pickingSplitFaces ? ' detach-unavailable' : ''}`,
        }));
      });
      const metrics = layoutMetrics(this.layout);
      layoutFoldEdges(this.layout).forEach(edge => {
        this.svg.append(svgElement('polyline', {
          points: coords(edge.map(id => this.layout.vertices[id])), class: 'layout-triangle',
        }));
      });
      if (this.showSlopeArrows) {
        layoutSlopeDirections(this.layout).forEach(({ center, direction, clearance, faceIndex }) => {
          const p = project(center);
          const length = Math.min(28, clearance * this.scale * 0.7);
          if (length < 3) return;
          const dx = direction.x, dy = direction.z;
          const tip = { x: p.x + dx * length, y: p.y + dy * length };
          const wing = length * 0.38;
          const arrow = svgElement('path', {
            d: `M ${p.x - dx * length} ${p.y - dy * length} L ${tip.x} ${tip.y} M ${tip.x - dx * wing - dy * wing} ${tip.y - dy * wing + dx * wing} L ${tip.x} ${tip.y} L ${tip.x - dx * wing + dy * wing} ${tip.y - dy * wing - dx * wing}`,
            class: 'layout-slope-arrow', 'aria-label': `Downhill on surface ${surfaceLetter(faceIndex)}`,
          });
          this.svg.append(arrow);
        });
      }
      this.layout.faces.forEach((face, index) => {
        const point = project(surfaceLabelPosition(face, this.layout.vertices));
        const label = svgElement('text', { x: point.x, y: point.y,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          class: 'layout-surface-label', 'pointer-events': 'none',
          'aria-label': `Surface ${surfaceLetter(index)}` });
        label.textContent = surfaceLetter(index);
        this.svg.append(label);
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
      const dividingFaces = this.mode === 'split' ? this.layout.faces.filter(face =>
        !this.path.length || (face.some((id, i) => onSegment(this.path[0], this.layout.vertices[id],
          this.layout.vertices[face[(i + 1) % face.length]])) &&
          this.path.every(point => inside(point, face.map(id => this.layout.vertices[id]))))) : [];
      const eligible = new Set(dividingFaces.flat());
      this.layout.vertices.forEach((p, id) => {
        const copies = linkedPlanPoints(this.layout, id);
        const visible = copies.includes(this.selected) ? this.selected : copies[0];
        if (id !== visible) return;
        const v = project(p);
        this.svg.append(svgElement('circle', { cx: v.x, cy: v.y, r: 7, class: `layout-node${id === this.selected ? ' selected' : ''}${this.mode === 'split' ? (eligible.has(id) ? ' division-eligible' : ' division-muted') : ''}` }));
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
        this.svg.append(svgElement('circle', { cx: v.x, cy: v.y, r: 8, class: 'layout-node division-path' }));
      });
    }
    if (this.meet?.result) {
      const original = project(this.layout.vertices[this.meet.pointId]);
      const ghost = project(this.meet.result.position);
      this.svg.append(svgElement('line', {
        x1: original.x, y1: original.y, x2: ghost.x, y2: ghost.y, class: 'layout-meet-guide',
      }));
      this.svg.append(svgElement('circle', { cx: ghost.x, cy: ghost.y, r: 11, class: 'layout-meet-ghost' }));
    }
    const hints = {
      meetTarget: 'Click the target slope, then choose Keep position or Keep height. Review the ghost point and 3D preview before applying.',
      meetDirection: 'Click the connected ridge or edge to follow. The point can move along its line in either direction.',

      select: 'Split in place detaches chosen adjoining surfaces for independent height control. Next copy cycles stacked points or edges; attached surfaces are highlighted. Select a point or edge, then Delete selected (or Delete/Backspace). Removing a dividing edge merges its adjoining surfaces. Outer edges must stay closed. Drag a point to move it on the plan. Shift-drag up/down changes its height. You can also enter exact coordinates below. Shared points update adjoining surfaces.',
      draw: 'Click around the outer roof edge. Click the first point or Close perimeter to finish. This creates a pitched roof at the starter pitch and replaces the current draft.',
      split: 'Start on a surface edge, add optional interior points, then finish on another edge of the same surface. Raise the new points to form ridges, or lower them for valleys.',
      insert: 'Click an edge or inside a surface to add a point. Interior points connect to surrounding corners and keep the current roof height. Move or raise the point to shape the roof.',
    };
    this.dialog.querySelector('.layout-help').textContent = hints[this.mode];
    this.dialog.querySelector('#layoutModeLabel').textContent = { select: 'Drag to move · Shift-drag for height', draw: 'Click to draw · Click first point to close', split: 'Draw a line between surface edges', insert: 'Click an edge or surface to add a point', meetTarget: 'Choose a target slope', meetDirection: 'Choose a connected edge' }[this.mode];
    if (this.pickingSplitFaces) this.dialog.querySelector('#layoutModeLabel').textContent = 'Click surfaces to toggle · Split in place to confirm';
    this.dialog.querySelector('.layout-detach').hidden = incident.length < 2 && this.selectionCopies().length < 2;
    const splitFaces = this.dialog.querySelector('#layoutSplitFaces');
    splitFaces.replaceChildren();
    incident.forEach((index, i) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = index;
      input.checked = this.detachFaces.has(index);
      input.addEventListener('change', () => {
        if (input.checked) this.detachFaces.add(index);
        else this.detachFaces.delete(index);
        this.render();
      });
      input.disabled = incident.length < 2;
      label.append(input, `Surface ${surfaceLetter(index)} (points ${this.layout.faces[index].map(id => id + 1).join(', ')})`);
      splitFaces.append(label);
    });
    const copies = this.selectionCopies();
    this.dialog.querySelector('#layoutCopyInfo').textContent = copies.length > 1
      ? `${copies.length} copies here. Selected ${this.selected !== null ? 'point' : 'edge'}: ${this.selectionIds().map(id => id + 1).join('–')}. Attached surfaces: ${incident.map(surfaceLetter).join(', ')}.`
      : incident.length >= 2
        ? `${this.detachFaces.size} of ${incident.length} surfaces selected to detach. Leave at least one attached.`
        : 'Select a shared point or dividing edge to split it.';
    this.dialog.querySelector('.layout-point').disabled = this.selected === null || Boolean(this.meet);
    this.dialog.querySelector('#layoutPointName').textContent = this.selected === null ? '—' : this.selected + 1;
    const pointSelect = this.dialog.querySelector('#layoutPointSelect');
    pointSelect.replaceChildren(new Option('Select a point', ''));
    this.layout.vertices.forEach((_, id) => pointSelect.add(new Option(`Point ${id + 1}`, String(id))));
    pointSelect.disabled = Boolean(this.meet);
    pointSelect.value = this.selected === null ? '' : String(this.selected);
    const point = this.layout.vertices[this.selected];
    for (const axis of ['x', 'z', 'h']) {
      this.dialog.querySelector(`#layout${axis.toUpperCase()}`).value = point ? Number(point[axis].toFixed(4)) : '';
    }
    this.dialog.querySelectorAll('[data-action]').forEach(button => {
      const action = button.dataset.action;
      if (['select', 'draw', 'split', 'insert'].includes(action)) button.setAttribute('aria-pressed', String(action === this.mode));
      if (action === 'slopeArrows') button.setAttribute('aria-pressed', String(Boolean(this.showSlopeArrows)));
      if (action === 'meet') button.disabled = this.mode !== 'select' || this.selected === null;
      if (action === 'pickSplitFaces') {
        button.disabled = this.mode !== 'select' || incident.length < 2;
        button.setAttribute('aria-pressed', String(Boolean(this.pickingSplitFaces)));
        button.textContent = this.pickingSplitFaces ? 'Done picking surfaces' : 'Pick surfaces on plan';
      }
      if (action === 'splitPlace') button.disabled = this.mode !== 'select' || incident.length < 2 ||
        !this.detachFaces.size || this.detachFaces.size === incident.length;
      if (action === 'joinPlace') button.disabled = this.mode !== 'select' ||
        !this.selectionIds().some(id => linkedPlanPoints(this.layout, id).length > 1);
      if (action === 'cycleCopy') button.disabled = this.mode !== 'select' || copies.length < 2;
      if (action === 'delete') button.disabled = this.mode !== 'select' || (this.selected === null && !this.selectedEdge);
      if (action === 'finish') button.hidden = this.mode !== 'draw';
      if (action === 'abort') button.hidden = !this.path.length;
      if (action === 'finish') button.disabled = this.mode !== 'draw' || this.path.length < 3;
      if (action === 'undo') button.disabled = !this.history.length && !this.path.length;
      if (action === 'redo') button.disabled = !this.future.length || !!this.path.length;
    });
  }
}
