import { FINISHES, PANEL_STYLES, activeRunIds, deriveFenceMetrics, normalizeFenceState } from './state.js?v=2';
import { buildFenceBom, fenceBomCsv, formatMoney } from './bom.js?v=2';
import { applyFenceTranslations, fenceT, resolveFenceLocale } from './i18n.js?v=2';

const CONTROL_CONFIG = Object.freeze({
  runA: { kind: 'length', min: 2, max: 30, step: 0.25 },
  runB: { kind: 'length', min: 2, max: 20, step: 0.25 },
  runC: { kind: 'length', min: 2, max: 20, step: 0.25 },
  angleB: { kind: 'angle', min: 30, max: 150, step: 1 },
  height: { kind: 'length', min: 0.8, max: 2.6, step: 0.05 },
  targetBayWidth: { kind: 'length', min: 1, max: 3, step: 0.05 },
  infillGap: { kind: 'small', min: 0.015, max: 0.12, step: 0.005 },
});

export class FenceUI {
  constructor(state, callbacks = {}, locale = resolveFenceLocale()) {
    this.state = state;
    this.callbacks = callbacks;
    this.locale = locale;
    this.units = 'metric';
    this.currency = 'EUR';
    this.bind();
    this.setLocale(locale);
  }

  bind() {
    document.querySelectorAll('[data-accordion]').forEach((section) => {
      const button = section.querySelector('.accordion-toggle');
      const panel = section.querySelector('.accordion-panel');
      button?.addEventListener('click', () => {
        const open = !section.classList.contains('is-open');
        section.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
        if (panel) panel.hidden = !open;
      });
    });

    document.querySelectorAll('[data-layout]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.layout = button.dataset.layout;
        this.commit({ fitCamera: true });
      });
    });

    document.querySelectorAll('[data-panel-style]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.panelStyle = button.dataset.panelStyle;
        this.commit();
      });
    });

    document.querySelectorAll('[data-finish]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.finish = button.dataset.finish;
        this.commit();
      });
    });

    document.querySelectorAll('[data-control]').forEach((control) => this.bindNumericControl(control));

    bindSelect('#gateType', (value) => { this.state.gateType = value; this.commit(); });
    bindSelect('#gateRun', (value) => { this.state.gateRun = value; this.state.gatePosition = 0; this.commit(); });
    bindSelect('#gateHanding', (value) => { this.state.gateHanding = value; this.commit(); });
    bindSelect('#foundationType', (value) => { this.state.foundation = value; this.commit(); });

    document.querySelector('#gatePosition')?.addEventListener('input', (event) => {
      this.state.gatePosition = Number(event.target.value);
      this.commit({ immediate: true });
    });

    document.querySelector('#sceneryToggle')?.addEventListener('change', (event) => {
      this.state.scenery = event.target.checked;
      this.callbacks.onDisplayChange?.();
      this.update();
    });

    document.querySelector('#bomOpenButton')?.addEventListener('click', () => document.querySelector('#bomPanel')?.showModal());
    document.querySelector('#bomDoneButton')?.addEventListener('click', () => document.querySelector('#bomPanel')?.close());
    document.querySelector('#bomClose')?.addEventListener('click', () => document.querySelector('#bomPanel')?.close());
    document.querySelector('#bomExportInlineButton')?.addEventListener('click', () => this.exportCsv());
    document.querySelector('#bomExportDialogButton')?.addEventListener('click', () => this.exportCsv());
  }

  bindNumericControl(control) {
    const key = control.dataset.control;
    const config = CONTROL_CONFIG[key];
    if (!config) return;
    const range = control.querySelector('input[type="range"]');
    const number = control.querySelector('input[type="number"]');
    const updateFromDisplay = (input, immediate = false) => {
      const metric = this.toMetric(Number(input.value), config.kind);
      this.state[key] = metric;
      normalizeFenceState(this.state);
      this.commit({ immediate });
    };
    range?.addEventListener('input', () => updateFromDisplay(range, true));
    number?.addEventListener('change', () => updateFromDisplay(number, false));
    number?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { number.blur(); }
    });
  }

  commit(options = {}) {
    normalizeFenceState(this.state);
    this.callbacks.onModelChange?.(options);
    this.update();
  }

  update(build = null) {
    const metrics = build?.metrics ?? deriveFenceMetrics(this.state);
    this.syncChoices();
    this.syncNumericControls();
    this.syncGateControls(metrics);
    this.syncSummary(metrics);
  }

  syncChoices() {
    document.querySelectorAll('[data-layout]').forEach((button) => {
      const selected = button.dataset.layout === this.state.layout;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-panel-style]').forEach((button) => {
      const selected = button.dataset.panelStyle === this.state.panelStyle;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-finish]').forEach((button) => {
      const selected = button.dataset.finish === this.state.finish;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      const finish = FINISHES[button.dataset.finish];
      if (finish) button.style.setProperty('--swatch', finish.color);
    });
    setValue('#gateType', this.state.gateType);
    setValue('#gateRun', this.state.gateRun);
    setValue('#gateHanding', this.state.gateHanding);
    setValue('#foundationType', this.state.foundation);
    const scenery = document.querySelector('#sceneryToggle');
    if (scenery) scenery.checked = this.state.scenery;

    const isClosed = this.state.layout === 'closed';
    document.querySelector('#runBControl')?.toggleAttribute('hidden', this.state.layout === 'straight');
    document.querySelector('#runCControl')?.toggleAttribute('hidden', !['u', 'closed'].includes(this.state.layout));
    document.querySelector('#angleBControl')?.toggleAttribute('hidden', !isClosed);
    document.querySelector('#closingRunInfo')?.toggleAttribute('hidden', !isClosed);
    document.querySelector('#gapControl')?.toggleAttribute('hidden', !['vertical', 'horizontal'].includes(this.state.panelStyle));

    setText('#runALabel', fenceT(this.locale, isClosed ? 'dimension.closedRunA' : 'dimension.runA'));
    setText('#runBLabel', fenceT(this.locale, isClosed ? 'dimension.closedRunB' : 'dimension.runB'));
    setText('#runCLabel', fenceT(this.locale, isClosed ? 'dimension.closedRunC' : 'dimension.runC'));
  }

  syncNumericControls() {
    Object.entries(CONTROL_CONFIG).forEach(([key, config]) => {
      const control = document.querySelector(`[data-control="${key}"]`);
      if (!control) return;
      const range = control.querySelector('input[type="range"]');
      const number = control.querySelector('input[type="number"]');
      const output = control.querySelector('output');
      const value = this.fromMetric(this.state[key], config.kind);
      const min = this.fromMetric(config.min, config.kind);
      const max = this.fromMetric(config.max, config.kind);
      const step = this.displayStep(config.step, config.kind);
      [range, number].forEach((input) => {
        if (!input) return;
        input.min = String(round(min, this.units === 'imperial' ? 2 : 1));
        input.max = String(round(max, this.units === 'imperial' ? 2 : 1));
        input.step = String(step);
        input.value = String(round(value, config.kind === 'small' ? 1 : 2));
      });
      if (output) output.textContent = this.formatControlValue(this.state[key], config.kind);
    });

    const metrics = deriveFenceMetrics(this.state);
    const closingRun = metrics.runs.find((run) => run.id === 'd');
    if (closingRun) setText('#closingRunValue', this.formatLength(closingRun.length));
    const hint = document.querySelector('#bayInfo');
    if (hint) {
      const average = metrics.totalLength / metrics.bayCount;
      hint.textContent = fenceT(this.locale, 'dimension.bayHint', { count: metrics.bayCount, width: this.formatLength(average) });
    }
  }

  syncGateControls(metrics) {
    const active = new Set(activeRunIds(this.state));
    const closed = this.state.layout === 'closed';
    const closedRunLabels = { a: 'AB', b: 'BC', c: 'CD', d: 'DA' };
    document.querySelectorAll('#gateRun option').forEach((option) => {
      option.hidden = !active.has(option.value);
      option.disabled = !active.has(option.value);
      option.textContent = closed ? closedRunLabels[option.value] ?? option.value.toUpperCase() : option.value.toUpperCase();
    });
    const gateOptions = document.querySelector('#gateOptions');
    gateOptions?.toggleAttribute('hidden', this.state.gateType === 'none');
    document.querySelector('#gateHandingWrap')?.toggleAttribute('hidden', this.state.gateType !== 'pedestrian');

    const gateRun = metrics.runs.find((run) => run.id === this.state.gateRun) ?? metrics.runs[0];
    const span = this.state.gateType === 'driveway' ? Math.min(2, gateRun?.bayCount ?? 1) : 1;
    const max = Math.max(0, (gateRun?.bayCount ?? 1) - span);
    const slider = document.querySelector('#gatePosition');
    if (slider) {
      slider.max = String(max);
      slider.value = String(Math.min(this.state.gatePosition, max));
      slider.disabled = max === 0;
    }
    const label = document.querySelector('#gatePositionValue');
    if (label) {
      const from = Math.min(this.state.gatePosition, max) + 1;
      const to = span > 1 ? `–${from + span - 1}` : '';
      label.textContent = fenceT(this.locale, 'gate.positionHint', { from, to });
    }
  }

  syncSummary(metrics) {
    const bom = buildFenceBom(this.state, { locale: this.locale });
    setText('#summaryTotal', formatMoney(bom.totalEur, this.currency, this.locale));
    const breakdown = document.querySelector('#summaryPriceBreakdown');
    if (breakdown) breakdown.innerHTML = [
      summaryRow(fenceT(this.locale, 'summary.materials'), formatMoney(bom.materialTotal, this.currency, this.locale)),
      summaryRow(fenceT(this.locale, 'summary.installation'), formatMoney(bom.installation, this.currency, this.locale)),
      summaryRow(fenceT(this.locale, 'summary.engineering'), formatMoney(bom.engineering, this.currency, this.locale)),
    ].join('');
    const summaryMetrics = document.querySelector('#summaryMetrics');
    if (summaryMetrics) summaryMetrics.innerHTML = [
      metricCard(fenceT(this.locale, 'summary.length'), this.formatLength(metrics.totalLength)),
      metricCard(fenceT(this.locale, 'summary.bays'), String(metrics.bayCount)),
      metricCard(fenceT(this.locale, 'summary.posts'), String(metrics.postCount)),
      metricCard(fenceT(this.locale, 'summary.gate'), metrics.gate ? fenceT(this.locale, metrics.gate.type === 'driveway' ? 'gate.driveway' : 'gate.pedestrian') : fenceT(this.locale, 'summary.noGate')),
    ].join('');

    const preview = document.querySelector('#summaryBomList');
    if (preview) preview.innerHTML = bom.items.slice(0, 4).map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.quantity))} ${escapeHtml(item.unit)}</strong></div>`).join('');
    setText('#headerBomSummary', fenceT(this.locale, 'summary.itemCount', { count: bom.items.length }));
    this.renderBomDialog(bom);
  }

  renderBomDialog(bom) {
    const tbody = document.querySelector('#bomTableBody');
    if (!tbody) return;
    tbody.innerHTML = bom.items.map((entry) => `
      <tr>
        <td><strong>${escapeHtml(entry.label)}</strong></td>
        <td>${escapeHtml(String(entry.quantity))}</td>
        <td>${escapeHtml(entry.unit)}</td>
        <td>${escapeHtml(formatMoney(entry.unitPriceEur, this.currency, this.locale))}</td>
        <td>${escapeHtml(formatMoney(entry.totalEur, this.currency, this.locale))}</td>
      </tr>`).join('');
    setText('#bomDialogTotal', formatMoney(bom.totalEur, this.currency, this.locale));
  }

  captureState() {
    return structuredClone(this.state);
  }

  restoreState(snapshot) {
    Object.keys(this.state).forEach((key) => delete this.state[key]);
    Object.assign(this.state, structuredClone(snapshot));
    normalizeFenceState(this.state);
    this.callbacks.onModelChange?.({ fitCamera: true, immediate: true });
    this.update();
  }

  setPreferences({ units = this.units, currency = this.currency } = {}) {
    this.units = units;
    this.currency = currency;
    this.update();
  }

  setLocale(locale) {
    this.locale = resolveFenceLocale(locale);
    applyFenceTranslations(this.locale);
    this.update();
  }

  exportCsv() {
    const csv = fenceBomCsv(this.state, { currency: this.currency, locale: this.locale });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fence-bom.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  fromMetric(value, kind) {
    if (kind === 'angle') return value;
    if (kind === 'small') return this.units === 'imperial' ? value * 39.37007874 : value * 1000;
    return this.units === 'imperial' ? value * 3.280839895 : value;
  }

  toMetric(value, kind) {
    if (kind === 'angle') return value;
    if (kind === 'small') return this.units === 'imperial' ? value / 39.37007874 : value / 1000;
    return this.units === 'imperial' ? value / 3.280839895 : value;
  }

  displayStep(metricStep, kind) {
    if (kind === 'angle') return metricStep;
    if (kind === 'small') return this.units === 'imperial' ? 0.1 : Math.max(1, Math.round(metricStep * 1000));
    return this.units === 'imperial' ? 0.1 : metricStep;
  }

  formatControlValue(value, kind) {
    if (kind === 'angle') return `${Math.round(value)}°`;
    if (kind === 'small') return this.units === 'imperial' ? `${(value * 39.37007874).toFixed(1)} in` : `${Math.round(value * 1000)} mm`;
    return this.formatLength(value);
  }

  formatLength(value) {
    return this.units === 'imperial' ? `${(value * 3.280839895).toFixed(value < 3 ? 1 : 0)} ft` : `${value.toFixed(value < 3 ? 2 : 1)} m`;
  }
}

function bindSelect(selector, callback) {
  document.querySelector(selector)?.addEventListener('change', (event) => callback(event.target.value));
}
function setValue(selector, value) { const element = document.querySelector(selector); if (element) element.value = value; }
function setText(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value; }
function summaryRow(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function metricCard(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
