import { pitchRules, roofNames } from './state.js?v=15';
import { bomToCsv, calculateBom } from './bom.js?v=14';
import {
  displayLengthInputConfig,
  formatArea,
  formatCurrency,
  formatLength,
  fromDisplayLength,
  normalizeUnits,
  toDisplayLength,
} from './preferences.js?v=1';

const LENGTH_CONTROL_KEYS = new Set(['length', 'depth', 'wallHeight', 'overhang']);

export class RoofUI {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
    this.viewerTitle = document.querySelector('#viewerTitle');
    this.pitchRuleNote = document.querySelector('#pitchRuleNote');
    this.bomPanel = document.querySelector('#bomPanel');
    this.currentBom = null;
    this.lastMetrics = null;
    this.dimensionBindings = [];
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
      const isLength = LENGTH_CONTROL_KEYS.has(key);
      const baseMin = Number(range.min);
      const baseMax = Number(range.max);
      const baseStep = Number(range.step) || 0.1;

      const updateState = (metersOrValue) => {
        const minimum = Number(range.min);
        const maximum = Number(range.max);
        if (!Number.isFinite(metersOrValue)) return;
        const value = Math.min(maximum, Math.max(minimum, metersOrValue));
        this.state[key] = value;
        range.value = String(value);
        this.syncDimensionControls();
        this.onChange({ fitCamera: false });
      };

      range.addEventListener('input', () => updateState(Number(range.value)));

      const updateFromNumber = () => {
        if (number.value === '') return;
        const value = isLength
          ? fromDisplayLength(number.value, this.state.units)
          : Number(number.value);
        updateState(value);
      };

      number.addEventListener('change', updateFromNumber);
      number.addEventListener('blur', updateFromNumber);

      this.dimensionBindings.push({
        key, range, number, output, isLength, baseMin, baseMax, baseStep,
      });
    });

    this.syncDimensionControls();
  }

  syncDimensionControls() {
    const units = normalizeUnits(this.state.units);
    this.dimensionBindings.forEach((binding) => {
      const { key, range, number, output, isLength, baseMin, baseMax, baseStep } = binding;
      const value = Number(this.state[key]);
      range.value = String(value);

      if (!isLength) {
        number.value = String(Math.round(value));
        output.value = `${Math.round(value)}°`;
        return;
      }

      const config = displayLengthInputConfig(baseMin, baseMax, baseStep, units);
      const displayValue = toDisplayLength(value, units);
      number.min = String(config.min);
      number.max = String(config.max);
      number.step = String(config.step);
      number.value = config.decimals > 0
        ? displayValue.toFixed(config.decimals)
        : String(Math.round(displayValue));
      number.setAttribute('aria-label', `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} in ${config.ariaUnit}`);
      output.value = formatLength(value, units, { inchDecimals: key === 'overhang' ? 1 : 1 });
    });
  }

  setPreferences() {
    this.syncDimensionControls();
    if (this.lastMetrics) this.updateMetrics(this.lastMetrics);
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
      this.syncDimensionControls();
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

    document.querySelector('#bomTableBody')?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-bom-line-toggle]');
      if (!checkbox) return;
      this.setBomLineIncluded(checkbox.dataset.bomLineToggle, checkbox.checked);
    });

    document.querySelector('#bomToggleAll')?.addEventListener('change', (event) => {
      this.setAllBomLinesIncluded(event.target.checked);
    });

    document.querySelector('#bomIncludeAll')?.addEventListener('click', () => {
      this.setAllBomLinesIncluded(true);
    });

    document.querySelector('#bomExcludeAll')?.addEventListener('click', () => {
      this.setAllBomLinesIncluded(false);
    });
  }

  getExcludedBomItems() {
    return new Set(Array.isArray(this.state.excludedBomItems) ? this.state.excludedBomItems : []);
  }

  setBomLineIncluded(key, included) {
    if (!key) return;
    const excluded = this.getExcludedBomItems();
    if (included) excluded.delete(key);
    else excluded.add(key);
    this.state.excludedBomItems = [...excluded];
    if (this.lastMetrics) this.updateBom(this.lastMetrics);
  }

  setAllBomLinesIncluded(included) {
    if (!this.currentBom) return;
    const excluded = this.getExcludedBomItems();
    this.currentBom.lines.forEach((line) => {
      if (included) excluded.delete(line.key);
      else excluded.add(line.key);
    });
    this.state.excludedBomItems = [...excluded];
    if (this.lastMetrics) this.updateBom(this.lastMetrics);
  }

  exportBom() {
    if (!this.currentBom) return;
    const csv = `﻿${bomToCsv(this.currentBom)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sizeLabel = normalizeUnits(this.state.units) === 'imperial'
      ? `${toDisplayLength(this.state.length, 'imperial').toFixed(2)}x${toDisplayLength(this.state.depth, 'imperial').toFixed(2)}ft`
      : `${Math.round(this.state.length * 1000)}x${Math.round(this.state.depth * 1000)}mm`;
    link.download = `roof-bom-${this.state.roofType}-${sizeLabel}-${this.state.currency}.csv`;
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
      row.innerHTML = '<td colspan="7"><strong>No BOM generated</strong><small>Custom plan parsing is not implemented in this proof of concept.</small></td>';
      body.replaceChildren(row);
      this.updateBomSelectionControls(bom);

      const assumptionGrid = document.querySelector('#bomAssumptions');
      const status = document.createElement('div');
      status.innerHTML = `<span>Plan status</span><strong>${this.state.customPlan ? 'File selected' : 'Awaiting upload'}</strong>`;
      assumptionGrid.replaceChildren(status);
      const currencyNote = document.querySelector('#bomCurrencyNote');
      if (currencyNote) currencyNote.textContent = ' Currency conversion will be applied after a custom plan can generate a BOM.';
      document.querySelector('#bomExportButton').disabled = true;
      return;
    }

    document.querySelector('#bomExportButton').disabled = false;
    document.querySelector('#headerEstimateTotal').textContent = formatCurrency(bom.total, bom.currency);
    document.querySelector('#bomSubtotal').textContent = formatCurrency(bom.subtotal, bom.currency);
    document.querySelector('#bomVat').textContent = formatCurrency(bom.vat, bom.currency);
    document.querySelector('#bomTotal').textContent = formatCurrency(bom.total, bom.currency);

    const body = document.querySelector('#bomTableBody');
    body.replaceChildren(...bom.lines.map((line, index) => {
      const row = document.createElement('tr');
      row.classList.toggle('is-excluded', line.included === false);
      row.innerHTML = `
        <td class="bom-check-cell">
          <input
            type="checkbox"
            data-bom-line-toggle="${line.key}"
            aria-label="Include ${line.name} in BOM"
            ${line.included === false ? '' : 'checked'}
          />
        </td>
        <td>${index + 1}</td>
        <td><strong>${line.name}</strong>${line.note ? `<small>${line.note}</small>` : ''}</td>
        <td>${line.unit}</td>
        <td>${line.quantity}</td>
        <td>${formatCurrency(line.unitPrice, bom.currency)}</td>
        <td>${formatCurrency(line.value, bom.currency)}</td>
      `;
      return row;
    }));
    this.updateBomSelectionControls(bom);

    const assumptions = [
      ['Roof area', formatArea(bom.assumptions.roofArea, this.state.units)],
      ['Ridge / hip lines', formatLength(bom.assumptions.ridgeLength, this.state.units)],
      ['Eaves / gutters', formatLength(bom.assumptions.eavesLength, this.state.units)],
      ['Gable edges', formatLength(bom.assumptions.gableLength, this.state.units)],
      ['Valleys', formatLength(bom.assumptions.valleyLength, this.state.units)],
      ['Panel coverage', formatArea(bom.assumptions.panelEffectiveArea, this.state.units, 2)],
      ['Tile waste', `${bom.assumptions.wastePercent.toFixed(0)}%`],
    ];
    const currencyNote = document.querySelector('#bomCurrencyNote');
    if (currencyNote) {
      if (bom.currency === 'RON') {
        currencyNote.textContent = ' Prices are shown in RON, the original currency of the reference offer.';
      } else {
        const dateLabel = bom.exchangeRateDate ? ` for ${bom.exchangeRateDate}` : '';
        const fallbackLabel = bom.exchangeRateIsFallback ? ' (temporary offline fallback)' : '';
        currencyNote.textContent = ` Converted at 1 RON = ${bom.exchangeRate.toFixed(4)} ${bom.currency}${dateLabel}, using ${bom.exchangeRateSource}${fallbackLabel}.`;
      }
    }

    const assumptionGrid = document.querySelector('#bomAssumptions');
    assumptionGrid.replaceChildren(...assumptions.map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return item;
    }));
  }

  updateBomSelectionControls(bom) {
    const lines = bom?.lines ?? [];
    const includedCount = lines.filter((line) => line.included !== false).length;
    const totalCount = lines.length;
    const toggleAll = document.querySelector('#bomToggleAll');
    const includeAll = document.querySelector('#bomIncludeAll');
    const excludeAll = document.querySelector('#bomExcludeAll');
    const status = document.querySelector('#bomSelectionStatus');

    if (toggleAll) {
      toggleAll.disabled = totalCount === 0;
      toggleAll.checked = totalCount > 0 && includedCount === totalCount;
      toggleAll.indeterminate = includedCount > 0 && includedCount < totalCount;
    }
    if (includeAll) includeAll.disabled = totalCount === 0 || includedCount === totalCount;
    if (excludeAll) excludeAll.disabled = totalCount === 0 || includedCount === 0;
    if (status) status.textContent = `${includedCount} of ${totalCount} items included`;
  }

  updateMetrics(metrics) {
    this.lastMetrics = metrics;
    const prefix = metrics.approximate ? '~' : '';
    document.querySelector('#metricFootprint').textContent = `${prefix}${formatArea(metrics.footprint, this.state.units)}`;
    document.querySelector('#metricRoofArea').textContent = `${prefix}${formatArea(metrics.roofArea, this.state.units)}`;
    document.querySelector('#metricRidge').textContent = formatLength(metrics.ridgeElevation, this.state.units);
    document.querySelector('#metricPitch').textContent = `${Math.round(this.state.pitch)}°`;
    this.updateBom(metrics);
  }
}
