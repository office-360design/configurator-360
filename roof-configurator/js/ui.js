import { pitchRules, roofNames } from './state.js?v=13';
import { bomToCsv, calculateBom, formatLei } from './bom.js?v=12';

const formatters = {
  length: (value) => `${value.toFixed(1)} m`,
  depth: (value) => `${value.toFixed(1)} m`,
  wallHeight: (value) => `${value.toFixed(1)} m`,
  pitch: (value) => `${Math.round(value)}°`,
  overhang: (value) => `${value.toFixed(2)} m`,
};

export class RoofUI {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
    this.viewerTitle = document.querySelector('#viewerTitle');
    this.pitchRuleNote = document.querySelector('#pitchRuleNote');
    this.bomPanel = document.querySelector('#bomPanel');
    this.currentBom = null;
    this.bindRoofTypes();
    this.bindRanges();
    this.bindCovering();
    this.bindSwatches();
    this.bindToggles();
    this.bindBom();
    this.bindCustomPlan();
    this.updateCustomMode();
  }

  bindRoofTypes() {
    document.querySelectorAll('[data-roof-type]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.roofType = button.dataset.roofType;
        document.querySelectorAll('[data-roof-type]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        this.viewerTitle.textContent = roofNames[this.state.roofType];
        this.updateCustomMode();
        this.onChange({ fitCamera: true });
      });
    });
  }

  bindRanges() {
    document.querySelectorAll('[data-control]').forEach((control) => {
      const key = control.dataset.control;
      const range = control.querySelector('input[type="range"]');
      const number = control.querySelector('input[type="number"]');
      const output = control.querySelector('output');

      const update = (raw, source) => {
        const min = Number(source.min);
        const max = Number(source.max);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const value = Math.min(max, Math.max(min, parsed));
        this.state[key] = value;
        range.value = String(value);
        number.value = String(value);
        output.value = formatters[key](value);
        this.onChange({ fitCamera: false });
      };

      range.addEventListener('input', () => update(range.value, range));
      number.addEventListener('input', () => update(number.value, number));
      number.addEventListener('blur', () => update(number.value, number));
    });
  }

  bindCovering() {
    const select = document.querySelector('#coveringSelect');
    select.addEventListener('change', () => {
      this.state.covering = select.value;
      const rule = pitchRules[this.state.covering];
      const pitchControl = document.querySelector('[data-control="pitch"]');
      const range = pitchControl.querySelector('input[type="range"]');
      const number = pitchControl.querySelector('input[type="number"]');
      const output = pitchControl.querySelector('output');
      range.min = String(rule.minimum);
      number.min = String(rule.minimum);
      this.pitchRuleNote.textContent = rule.note;
      if (this.state.pitch < rule.minimum) {
        this.state.pitch = rule.minimum;
        range.value = String(rule.minimum);
        number.value = String(rule.minimum);
        output.value = `${rule.minimum}°`;
      }
      this.onChange({ fitCamera: false });
    });
  }

  bindSwatches() {
    document.querySelectorAll('.swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        this.state.roofColor = swatch.dataset.color;
        document.querySelectorAll('.swatch').forEach((item) => item.classList.toggle('selected', item === swatch));
        this.onChange({ fitCamera: false });
      });
    });
  }

  bindToggles() {
    document.querySelector('#wireframeToggle')?.addEventListener('change', (event) => {
      this.state.technicalEdges = event.target.checked;
      this.onChange({ fitCamera: false });
    });
  }


  updateCustomMode() {
    const isCustom = this.state.roofType === 'custom';
    const panel = document.querySelector('#customPlanPanel');
    const notice = document.querySelector('#customViewerNotice');
    if (panel) panel.hidden = !isCustom;
    if (notice) notice.hidden = !isCustom;
  }

  bindCustomPlan() {
    const input = document.querySelector('#customPlanInput');
    const dropzone = document.querySelector('#customPlanDropzone');
    const removeButton = document.querySelector('#customPlanRemove');
    if (!input || !dropzone) return;

    const selectFile = (file) => {
      if (!file) return;
      this.state.customPlan = {
        name: file.name,
        size: file.size,
        type: file.type || 'Unknown file type',
        lastModified: file.lastModified,
      };
      this.renderCustomPlanFile();
      if (this.state.roofType === 'custom') this.onChange({ fitCamera: false });
    };

    input.addEventListener('change', () => selectFile(input.files?.[0]));

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragging');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-dragging');
      });
    });

    dropzone.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));

    removeButton?.addEventListener('click', () => {
      this.state.customPlan = null;
      input.value = '';
      this.renderCustomPlanFile();
      if (this.state.roofType === 'custom') this.onChange({ fitCamera: false });
    });

    this.renderCustomPlanFile();
  }

  renderCustomPlanFile() {
    const fileCard = document.querySelector('#customPlanFile');
    const dropzone = document.querySelector('#customPlanDropzone');
    const name = document.querySelector('#customPlanFileName');
    const meta = document.querySelector('#customPlanFileMeta');
    if (!fileCard || !dropzone || !name || !meta) return;

    const file = this.state.customPlan;
    fileCard.hidden = !file;
    dropzone.hidden = Boolean(file);
    if (!file) return;

    const size = file.size < 1024 * 1024
      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    name.textContent = file.name;
    meta.textContent = `${size} · Uploaded for future processing`;
  }


  bindBom() {
    document.querySelector('#bomExportButton')?.addEventListener('click', () => this.exportBom());
  }

  exportBom() {
    if (!this.currentBom) return;
    const csv = `﻿${bomToCsv(this.currentBom)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roof-bom-${this.state.roofType}-${this.state.length.toFixed(1)}x${this.state.depth.toFixed(1)}m.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  updateBom(metrics) {
    const bom = calculateBom(this.state, metrics);
    this.currentBom = bom;

    if (this.state.roofType === 'custom') {
      document.querySelector('#headerEstimateTotal').textContent = 'Awaiting plan';
      document.querySelector('#bomSubtotal').textContent = '—';
      document.querySelector('#bomVat').textContent = '—';
      document.querySelector('#bomTotal').textContent = '—';

      const body = document.querySelector('#bomTableBody');
      const row = document.createElement('tr');
      row.className = 'bom-empty-row';
      row.innerHTML = '<td colspan="6"><strong>No BOM generated</strong><small>Custom plan parsing is not implemented in this proof of concept.</small></td>';
      body.replaceChildren(row);

      const assumptionGrid = document.querySelector('#bomAssumptions');
      const status = document.createElement('div');
      status.innerHTML = `<span>Plan status</span><strong>${this.state.customPlan ? 'File selected' : 'Awaiting upload'}</strong>`;
      assumptionGrid.replaceChildren(status);
      document.querySelector('#bomExportButton').disabled = true;
      return;
    }

    document.querySelector('#bomExportButton').disabled = false;
    document.querySelector('#headerEstimateTotal').textContent = `${formatLei(bom.total)} lei`;
    document.querySelector('#bomSubtotal').textContent = `${formatLei(bom.subtotal)} lei`;
    document.querySelector('#bomVat').textContent = `${formatLei(bom.vat)} lei`;
    document.querySelector('#bomTotal').textContent = `${formatLei(bom.total)} lei`;

    const body = document.querySelector('#bomTableBody');
    body.replaceChildren(...bom.lines.map((line, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${line.name}</strong>${line.note ? `<small>${line.note}</small>` : ''}</td>
        <td>${line.unit}</td>
        <td>${line.quantity}</td>
        <td>${formatLei(line.unitPrice)}</td>
        <td>${formatLei(line.value)}</td>
      `;
      return row;
    }));

    const assumptions = [
      ['Roof area', `${bom.assumptions.roofArea.toFixed(1)} m²`],
      ['Ridge / hip lines', `${bom.assumptions.ridgeLength.toFixed(1)} m`],
      ['Eaves / gutters', `${bom.assumptions.eavesLength.toFixed(1)} m`],
      ['Gable edges', `${bom.assumptions.gableLength.toFixed(1)} m`],
      ['Valleys', `${bom.assumptions.valleyLength.toFixed(1)} m`],
      ['Panel coverage', `${bom.assumptions.panelEffectiveArea.toFixed(2)} m²`],
      ['Tile waste', `${bom.assumptions.wastePercent.toFixed(0)}%`],
    ];
    const assumptionGrid = document.querySelector('#bomAssumptions');
    assumptionGrid.replaceChildren(...assumptions.map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return item;
    }));
  }

  updateMetrics(metrics) {
    const prefix = metrics.approximate ? '~' : '';
    document.querySelector('#metricFootprint').textContent = `${prefix}${metrics.footprint.toFixed(1)} m²`;
    document.querySelector('#metricRoofArea').textContent = `${prefix}${metrics.roofArea.toFixed(1)} m²`;
    document.querySelector('#metricRidge').textContent = `${metrics.ridgeElevation.toFixed(2)} m`;
    document.querySelector('#metricPitch').textContent = `${Math.round(this.state.pitch)}°`;
    this.updateBom(metrics);
  }
}
