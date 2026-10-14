import { drainageBoundaryKey, layoutDrainageEdges, recommendedDrainage } from './drainageLayout.js?v=drainage-49';

const svg = (tag, attrs) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
  return el;
};
export class EditorDrainage {
  constructor(editor) {
    this.editor = editor;
    this.panel = document.createElement('details');
    this.panel.className = 'editor-drainage';
    this.panel.innerHTML = `<summary>Gutters and downpipes</summary>
      <p>Select a perimeter edge on the plan or below. Blue lines are gutters; circles are downpipes.</p>
      <label>Perimeter edge<select class="drain-edge"></select></label>
      <label><input type="checkbox" class="drain-gutter"> Gutter on this edge</label>
      <label>Downpipe position (%)<input class="drain-position" type="number" min="0" max="100" step="1" value="50"></label>
      <button type="button" data-drain="add">Add downpipe</button>
      <label>Downpipe<select class="drain-pipe"></select></label><button type="button" data-drain="move">Move downpipe</button><button type="button" data-drain="remove">Remove downpipe</button>
      <button type="button" data-drain="clear">Remove edge downpipes</button>
      <button type="button" data-drain="auto">Use recommended placement</button>
      <p>Recommendations include level eaves and low valley corners. Confirm drainage capacity and outlets with your installer.</p>`;
    editor.dialog.querySelector('.layout-workspace aside').prepend(this.panel);
    this.panel.addEventListener('toggle', () => { if (editor.layout) editor.render(); });
    this.panel.querySelector('.drain-edge').addEventListener('change', event => {
      const edge = layoutDrainageEdges(editor.layout)[Number(event.target.value)];
      editor.selected = null; editor.selectedEdge = [edge.a,edge.b]; editor.render();
    });
    this.panel.querySelector('.drain-gutter').addEventListener('change', event => this.change('gutter',event.target.checked));
    this.panel.addEventListener('click', event => {
      const action = event.target.closest('[data-drain]')?.dataset.drain;
      if (action) this.change(action);
    });
  }
  change(action,value) {
    const e = this.editor;
    if (e.mode !== 'select' || e.drag || e.windowTool?.active || e.dormer || e.meet) {
      e.feedback('Finish the current editing operation before changing drainage.'); return;
    }
    const next = structuredClone(e.layout);
    const edges = action === 'auto' ? recommendedDrainage(next) : layoutDrainageEdges(next);
    const selected = edges[this.index || 0];
    if (!selected) return;
    if (action === 'gutter') selected.gutter = value;
    if (action === 'clear') selected.pipes = [];
    if (['add','move','remove'].includes(action) && selected.pipes == null) {
      const a=next.vertices[selected.a], b=next.vertices[selected.b];
      const t = Math.min(.49,.12/Math.hypot(b.x-a.x,b.z-a.z,b.h-a.h));
      selected.pipes = selected.gutter ? (e.state.drainagePosition === 'start' ? [t] : e.state.drainagePosition === 'end' ? [1-t] : [t,1-t]) : [];
    }
    const pipeIndex = Number(this.panel.querySelector('.drain-pipe').value);
    if (action === 'remove') selected.pipes.splice(pipeIndex,1);
    if (action === 'add' || action === 'move') {
      const input = this.panel.querySelector('.drain-position');
      if (!input.value || !input.checkValidity()) { e.feedback('Enter a downpipe position from 0 to 100%.'); return; }
      const t = Number(input.value)/100;
      if (action === 'move') selected.pipes.splice(pipeIndex,1);
      selected.pipes = [...new Set([...(selected.pipes || []),t])].sort((a,b)=>a-b);
    }
    next.drainage = {boundaryKey:drainageBoundaryKey(next),edges};
    e.commit(next);
    e.selectedEdge = [selected.a,selected.b];
    e.render();
  }
  render(project) {
    const e = this.editor, edges = layoutDrainageEdges(e.layout);
    const selected = edges.findIndex(edge => e.selectedEdge?.includes(edge.a) && e.selectedEdge?.includes(edge.b));
    this.index = selected >= 0 ? selected : Math.min(this.index || 0,edges.length-1);
    const select = this.panel.querySelector('.drain-edge');
    select.innerHTML = edges.map((edge,i)=>`<option value="${i}">${edge.a+1} → ${edge.b+1}</option>`).join('');
    select.value = String(this.index);
    const edge = edges[this.index];
    const a = e.layout.vertices[edge.a], b = e.layout.vertices[edge.b];
    const t = Math.min(.49,.12/Math.hypot(b.x-a.x,b.z-a.z,b.h-a.h));
    const pipes = edge.pipes ?? (edge.gutter ? (e.state.drainagePosition === 'start' ? [t] : e.state.drainagePosition === 'end' ? [1-t] : [t,1-t]) : []);
    this.panel.querySelector('.drain-pipe').innerHTML = pipes.map((t,i)=>`<option value="${i}">${i+1} · ${Math.round(t*100)}%</option>`).join('');
    for (const action of ['move','remove']) this.panel.querySelector(`[data-drain="${action}"]`).disabled = !pipes.length;
    this.panel.querySelector('.drain-gutter').checked = !!edges[this.index]?.gutter;
    if (!this.panel.open && !e.layout.drainage && !e.state.showDrainage) return;
    const overlay = svg('g',{'pointer-events':'none','class':'layout-drainage-overlay'});
    for (const edge of edges) {
      const a=project(e.layout.vertices[edge.a]), b=project(e.layout.vertices[edge.b]);
      if(edge.gutter) overlay.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#0284c7','stroke-width':5,opacity:.8}));
      const positions = edge.pipes ?? (edge.gutter ? (e.state.drainagePosition === 'start' ? [.02] : e.state.drainagePosition === 'end' ? [.98] : [.02,.98]) : []);
      for(const t of positions) overlay.append(svg('circle',{cx:a.x+(b.x-a.x)*t,cy:a.y+(b.y-a.y)*t,r:7,fill:'#0284c7',stroke:'white','stroke-width':2}));
    }
    e.svg.append(overlay);
  }
}
