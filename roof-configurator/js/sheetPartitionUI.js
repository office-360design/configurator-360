import { partitionTargets, validateSheetPartition } from './sheetPlanner.js?v=partition-37';

const sections = slope => [...new Map(slope.pieces.map(p => [p.baseId, p])).values()];

export class SheetPartitionUI {
  constructor(planner) {
    this.planner = planner;
    this.selected = new Map();
    planner.output.addEventListener('click', event => {
      if (planner.stale) return;
      const piece = event.target.closest('[data-piece-base]');
      const section = event.target.closest('[data-plan-slope]');
      if (!section) return;
      const index = Number(section.dataset.planSlope);
      if (piece) {
        this.selected.set(index, piece.dataset.pieceBase);
        this.refresh(index);
      }
      const action = event.target.closest('[data-partition-action]')?.dataset.partitionAction;
      if (action) this.apply(index, action === 'reset');
    });
    planner.output.addEventListener('change', event => {
      const section = event.target.closest('[data-plan-slope]');
      if (!section || planner.stale) return;
      const index = Number(section.dataset.planSlope);
      if (event.target.matches('[data-partition-column]')) {
        const piece = planner.plan.slopes[index].pieces.find(p => p.column === Number(event.target.value));
        this.selected.set(index, piece.baseId);
        this.refresh(index);
      } else if (event.target.matches('[data-partition-section]')) {
        this.selected.set(index, event.target.value);
        this.refresh(index);
      }
    });
  }

  markup(slope, index) {
    const all = sections(slope);
    const selected = all.find(p => p.baseId === this.selected.get(index)) || all[0];
    if (!selected) return '';
    this.selected.set(index, selected.baseId);
    const parts = slope.pieces.filter(p => p.baseId === selected.baseId).map(p => p.modules);
    const overlap = parts.length * this.planner.plan.profile.endOverlap;
    return `<fieldset class="sheet-partition"><legend>Column partition</legend>
      <p>Click a sheet in the diagram or select a column. Split one section; other sections stay unchanged.</p>
      <div class="sheet-partition-fields">
        <label>Column<select data-partition-column>${[...new Set(all.map(p => p.column))].map(column =>
          `<option value="${column}" ${column === selected.column ? 'selected' : ''}>${slope.id}-${column}</option>`).join('')}</select></label>
        <label>Original section<select data-partition-section>${all.filter(p => p.column === selected.column).map(p =>
          `<option value="${p.baseId}" ${p.baseId === selected.baseId ? 'selected' : ''}>${p.baseId} · ${p.baseModules}</option>`).join('')}</select></label>
        <label>Modules per sheet<input data-partition-value value="${parts.join(' + ')}" placeholder="11 + 11" autocomplete="off"></label>
        <label>Apply to<select data-partition-scope>
          <option value="column">Selected section only</option>
          <option value="surface">Same length on this surface</option>
          <option value="global">Same length on all surfaces</option>
        </select></label>
      </div>
      <p>${selected.baseModules} modules total · ${parts.length} sheets · ${overlap} mm total end allowance</p>
      <p>Enter module counts separated by +, from eave to ridge. Their sum must equal the original section.</p>
      <button type="button" data-partition-action="apply">Apply partition</button>
      <button type="button" data-partition-action="reset">Restore automatic partition</button>
      <p class="sheet-partition-error" data-partition-error role="alert" hidden></p>
    </fieldset>`;
  }

  refresh(index) {
    const planner = this.planner;
    const section = planner.output.querySelector(`[data-plan-slope="${index}"]`);
    section.querySelector('.sheet-partition').outerHTML = this.markup(planner.plan.slopes[index], index);
    this.highlight();
  }

  highlight() {
    this.planner.output.querySelectorAll('[data-plan-slope]').forEach(section => {
      const baseId = this.selected.get(Number(section.dataset.planSlope));
      const column = baseId?.split('.')[0];
      section.querySelectorAll('[data-piece-base]').forEach(piece => {
        piece.classList.toggle('selected-section', piece.dataset.pieceBase === baseId);
        piece.classList.toggle('selected-column', piece.dataset.pieceBase.split('.')[0] === column);
      });
    });
  }

  apply(index, reset) {
    const planner = this.planner;
    const section = planner.output.querySelector(`[data-plan-slope="${index}"]`);
    const error = section.querySelector('[data-partition-error]');
    try {
      const baseId = this.selected.get(index);
      const selected = planner.plan.slopes[index].pieces.find(p => p.baseId === baseId);
      const raw = section.querySelector('[data-partition-value]').value.trim();
      const parts = /^\d+(\s*\+\s*\d+)*$/.test(raw) ? raw.split('+').map(Number) : [];
      if (!reset) validateSheetPartition(parts, selected.baseModules, planner.plan.profile);
      const scope = section.querySelector('[data-partition-scope]').value;
      const partitions = structuredClone(planner.planSettings.partitions || {});
      for (const key of partitionTargets(planner.plan, baseId, scope)) {
        if (reset) delete partitions[key];
        else partitions[key] = parts;
      }
      planner.applyPartitions(partitions);
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    }
  }
}
