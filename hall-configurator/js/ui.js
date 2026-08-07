import { deriveHallMetrics } from './state.js?v=1';
import { buildBom, bomToCsv } from './bom.js?v=1';

const formatters = {
  length: (v) => `${v.toFixed(1)} m`,
  width: (v) => `${v.toFixed(1)} m`,
  eaveHeight: (v) => `${v.toFixed(2).replace(/\.00$/, '.0')} m`,
  pitch: (v) => `${Math.round(v)}°`,
  targetBaySpacing: (v) => `${v.toFixed(2).replace(/0$/, '')} m`,
  rollerDoorWidth: (v) => `${v.toFixed(2).replace(/0$/, '')} m`,
  rollerDoorHeight: (v) => `${v.toFixed(2).replace(/0$/, '')} m`,
};

export class HallUI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;
    this.currentBuild = null;
    this.bindRanges();
    this.bindSelects();
    this.bindToggles();
    this.bindSwatches();
    this.bindViews();
    this.bindExplode();
    this.bindBom();
    this.applyStateToControls();
  }

  bindRanges() {
    document.querySelectorAll('[data-control]').forEach((control) => {
      const key = control.dataset.control;
      const range = control.querySelector('input[type="range"]');
      const number = control.querySelector('input[type="number"]');
      const output = control.querySelector('output');
      if (!range || !number) return;

      const update = (raw, source, { fitCamera = false } = {}) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        let min = Number(source.min);
        let max = Number(source.max);
        if (key === 'rollerDoorWidth') max = Math.min(max, Math.max(2.5, this.state.width - 1.2));
        if (key === 'rollerDoorHeight') max = Math.min(max, Math.max(2.5, this.state.eaveHeight - .2));
        const value = Math.min(max, Math.max(min, parsed));
        this.state[key] = value;
        range.max = String(max);
        number.max = String(max);
        range.value = String(value);
        number.value = String(value);
        if (output) output.value = formatters[key]?.(value) ?? String(value);
        this.ensureOpeningLimits();
        this.callbacks.onModelChange?.({ fitCamera });
      };

      range.addEventListener('input', () => update(range.value, range));
      number.addEventListener('input', () => {
        const parsed = Number(number.value);
        if (Number.isFinite(parsed)) update(parsed, number);
      });
      number.addEventListener('blur', () => update(number.value, number));
    });
  }

  ensureOpeningLimits() {
    const widthControl = document.querySelector('[data-control="rollerDoorWidth"]');
    const heightControl = document.querySelector('[data-control="rollerDoorHeight"]');
    const maxWidth = Math.min(8, Math.max(2.5, this.state.width - 1.2));
    const maxHeight = Math.min(6, Math.max(2.5, this.state.eaveHeight - .2));
    this.state.rollerDoorWidth = Math.min(this.state.rollerDoorWidth, maxWidth);
    this.state.rollerDoorHeight = Math.min(this.state.rollerDoorHeight, maxHeight);
    if (widthControl) {
      widthControl.querySelectorAll('input').forEach((input) => { input.max = String(maxWidth); input.value = String(this.state.rollerDoorWidth); });
      widthControl.querySelector('output').value = formatters.rollerDoorWidth(this.state.rollerDoorWidth);
    }
    if (heightControl) {
      heightControl.querySelectorAll('input').forEach((input) => { input.max = String(maxHeight); input.value = String(this.state.rollerDoorHeight); });
      heightControl.querySelector('output').value = formatters.rollerDoorHeight(this.state.rollerDoorHeight);
    }
  }

  bindSelects() {
    document.querySelector('#structurePreset')?.addEventListener('change', (event) => {
      this.state.structurePreset = event.target.value;
      this.callbacks.onModelChange?.({ fitCamera: false });
    });
    document.querySelector('#claddingProfile')?.addEventListener('change', (event) => {
      this.state.claddingProfile = event.target.value;
      this.callbacks.onModelChange?.({ fitCamera: false });
    });
  }

  bindToggles() {
    const toggles = {
      secondaryStructureToggle: 'secondaryStructure',
      slabToggle: 'slab',
      rollerDoorToggle: 'rollerDoor',
      personnelDoorToggle: 'personnelDoor',
      windowsToggle: 'windows',
      dimensionsToggle: 'showDimensions',
      edgesToggle: 'technicalEdges',
      claddingToggle: 'showCladding',
    };
    Object.entries(toggles).forEach(([id, key]) => {
      document.querySelector(`#${id}`)?.addEventListener('change', (event) => {
        this.state[key] = event.target.checked;
        if (key === 'rollerDoor') this.updateDoorControls();
        this.callbacks.onModelChange?.({ fitCamera: false });
      });
    });
  }

  bindSwatches() {
    const bind = (selector, key) => {
      document.querySelectorAll(`${selector} .swatch`).forEach((button) => {
        button.addEventListener('click', () => {
          this.state[key] = button.dataset.color;
          document.querySelectorAll(`${selector} .swatch`).forEach((item) => item.classList.toggle('selected', item === button));
          this.callbacks.onModelChange?.({ fitCamera: false });
        });
      });
    };
    bind('#wallSwatches', 'wallColor');
    bind('#roofSwatches', 'roofColor');
  }

  bindViews() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
        this.callbacks.onView?.(view);
      });
    });
  }

  bindExplode() {
    const range = document.querySelector('#explodeRange');
    const value = document.querySelector('#explodeValue');
    const button = document.querySelector('#explodeToggleButton');
    range?.addEventListener('input', () => {
      this.state.explode = Number(range.value);
      value.textContent = `${Math.round(this.state.explode)}%`;
      button.textContent = this.state.explode > 0 ? 'Assemble' : 'Explode';
      this.callbacks.onExplode?.(this.state.explode);
    });
    button?.addEventListener('click', () => {
      this.state.explode = this.state.explode > 0 ? 0 : 100;
      range.value = String(this.state.explode);
      value.textContent = `${this.state.explode}%`;
      button.textContent = this.state.explode > 0 ? 'Assemble' : 'Explode';
      this.callbacks.onExplode?.(this.state.explode);
    });
  }

  bindBom() {
    const dialog = document.querySelector('#bomPanel');
    const close = () => {
      if (dialog?.open && dialog.close) dialog.close();
      else dialog?.removeAttribute('open');
    };
    document.querySelector('#bomOpenButton')?.addEventListener('click', () => {
      if (!dialog) return;
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    document.querySelector('#bomCloseButton')?.addEventListener('click', close);
    document.querySelector('#bomDoneButton')?.addEventListener('click', close);
    document.querySelector('#bomExportButton')?.addEventListener('click', () => this.exportBom());
  }

  exportBom() {
    if (!this.currentBuild) return;
    const lines = buildBom(this.state, this.currentBuild);
    const blob = new Blob([`\ufeff${bomToCsv(lines)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hall-bom-${this.state.width.toFixed(1)}x${this.state.length.toFixed(1)}m.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  updateDoorControls() {
    document.querySelector('#rollerDoorControls')?.classList.toggle('is-disabled', !this.state.rollerDoor);
  }

  applyStateToControls() {
    document.querySelectorAll('[data-control]').forEach((control) => {
      const key = control.dataset.control;
      const value = Number(this.state[key]);
      if (!Number.isFinite(value)) return;
      control.querySelectorAll('input').forEach((input) => { input.value = String(value); });
      const output = control.querySelector('output');
      if (output) output.value = formatters[key]?.(value) ?? String(value);
    });

    document.querySelector('#structurePreset').value = this.state.structurePreset;
    document.querySelector('#claddingProfile').value = this.state.claddingProfile;
    const checkboxMap = {
      secondaryStructureToggle: this.state.secondaryStructure,
      slabToggle: this.state.slab,
      rollerDoorToggle: this.state.rollerDoor,
      personnelDoorToggle: this.state.personnelDoor,
      windowsToggle: this.state.windows,
      dimensionsToggle: this.state.showDimensions,
      edgesToggle: this.state.technicalEdges,
      claddingToggle: this.state.showCladding,
    };
    Object.entries(checkboxMap).forEach(([id, checked]) => { const element = document.querySelector(`#${id}`); if (element) element.checked = Boolean(checked); });
    document.querySelectorAll('#wallSwatches .swatch').forEach((button) => button.classList.toggle('selected', button.dataset.color === this.state.wallColor));
    document.querySelectorAll('#roofSwatches .swatch').forEach((button) => button.classList.toggle('selected', button.dataset.color === this.state.roofColor));
    const explodeRange = document.querySelector('#explodeRange');
    if (explodeRange) explodeRange.value = String(this.state.explode);
    document.querySelector('#explodeValue').textContent = `${Math.round(this.state.explode)}%`;
    document.querySelector('#explodeToggleButton').textContent = this.state.explode > 0 ? 'Assemble' : 'Explode';
    this.ensureOpeningLimits();
    this.updateDoorControls();
  }

  update(build) {
    this.currentBuild = build;
    const { metrics } = build;
    document.querySelector('#frameCountInfo').textContent = String(metrics.frameCount);
    document.querySelector('#actualSpacingInfo').textContent = `${metrics.bayCount} bays · ${metrics.actualBaySpacing.toFixed(2)} m actual spacing`;
    document.querySelector('#metricFootprint').textContent = `${metrics.footprint.toFixed(0)} m²`;
    document.querySelector('#metricFrames').textContent = String(metrics.frameCount);
    document.querySelector('#metricSpacing').textContent = `${metrics.actualBaySpacing.toFixed(2)} m`;
    document.querySelector('#metricRidge').textContent = `${metrics.ridgeElevation.toFixed(2)} m`;

    const lines = buildBom(this.state, build);
    document.querySelector('#headerBomSummary').textContent = `${lines.length} lines`;
    const tbody = document.querySelector('#bomTableBody');
    tbody.replaceChildren(...lines.map((line, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${index + 1}</td><td><strong>${line.name}</strong></td><td>${line.unit}</td><td>${line.quantity}</td><td>${line.notes ?? ''}</td>`;
      return tr;
    }));

    const assumptions = [
      ['Footprint', `${metrics.footprint.toFixed(1)} m²`],
      ['Roof area', `${metrics.roofArea.toFixed(1)} m²`],
      ['Net wall area', `${metrics.netWallArea.toFixed(1)} m²`],
      ['Portal frames', `${metrics.frameCount}`],
      ['Bays', `${metrics.bayCount}`],
      ['Actual spacing', `${metrics.actualBaySpacing.toFixed(2)} m`],
    ];
    const grid = document.querySelector('#bomAssumptions');
    grid.replaceChildren(...assumptions.map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return item;
    }));
  }

  captureState() {
    return structuredClone(this.state);
  }

  restoreState(snapshot) {
    Object.assign(this.state, snapshot);
    this.applyStateToControls();
    this.callbacks.onModelChange?.({ fitCamera: true });
  }
}
