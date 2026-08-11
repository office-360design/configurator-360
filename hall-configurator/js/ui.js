import { buildBom, bomToCsv } from './bom.js?v=10';
import { estimateHallPrice, formatPrice } from './pricing.js?v=10';
import { normalizeOpening, normalizeOpenings, openingType, validateOpenings, wallLabel } from './openings.js?v=10';

const formatters = {
  length: (v) => `${v.toFixed(1)} m`,
  width: (v) => `${v.toFixed(1)} m`,
  eaveHeight: (v) => `${v.toFixed(2).replace(/\.00$/, '.0')} m`,
  pitch: (v) => `${Math.round(v)}°`,
  targetBaySpacing: (v) => `${v.toFixed(2).replace(/0$/, '')} m`,
  sectionCutPosition: (v) => `${Math.round(v)}%`,
};

const climateNotes = {
  none: 'General warehouse envelope with no active refrigeration package.',
  comfort: 'Comfort HVAC package with external condenser units and indoor air handling.',
  chilled: 'Chilled-storage package intended for approximately +2 to +8 °C operation.',
  frozen: 'Frozen-storage package intended for approximately -20 °C operation with additional refrigeration capacity.',
};

const modelSelects = new Set(['structurePreset', 'claddingProfile', 'buildingUse', 'climateSystem', 'rackDensity']);

export class HallUI {
  constructor(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;
    this.currentBuild = null;
    this.selectedOpeningId = null;
    this.placementType = null;
    this.bindAccordions();
    this.bindRanges();
    this.bindSelects();
    this.bindToggles();
    this.bindSwatches();
    this.bindExplode();
    this.bindEnvironmentPanel();
    this.bindBom();
    this.bindOpeningControls();
    this.applyStateToControls();
  }

  bindAccordions() {
    document.querySelectorAll('.accordion-section').forEach((section) => {
      const button = section.querySelector('.accordion-toggle');
      const panel = section.querySelector('.accordion-panel');
      button?.addEventListener('click', () => {
        const open = !section.classList.contains('is-open');
        section.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
        if (panel) panel.hidden = !open;
      });
    });
  }

  bindRanges() {
    document.querySelectorAll('[data-control]').forEach((control) => {
      const key = control.dataset.control;
      const range = control.querySelector('input[type="range"]');
      const number = control.querySelector('input[type="number"]');
      const output = control.querySelector('output');
      if (!range && !number) return;

      const update = (raw, source, { immediate = false } = {}) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const min = Number(source?.min ?? range?.min ?? number?.min ?? -Infinity);
        let max = Number(source?.max ?? range?.max ?? number?.max ?? Infinity);
        const value = Math.min(max, Math.max(min, parsed));
        this.state[key] = value;
        if (range) { range.max = String(max); range.value = String(value); }
        if (number) { number.max = String(max); number.value = String(value); }
        if (output) output.value = formatters[key]?.(value) ?? String(value);
        this.ensureOpeningLimits();

        if (key === 'sectionCutPosition') this.callbacks.onDisplayChange?.();
        else this.callbacks.onModelChange?.({ fitCamera: false, immediate });
      };

      range?.addEventListener('input', () => update(range.value, range, { immediate: key === 'sectionCutPosition' }));
      range?.addEventListener('change', () => update(range.value, range, { immediate: true }));
      number?.addEventListener('input', () => {
        const parsed = Number(number.value);
        if (Number.isFinite(parsed)) update(parsed, number, { immediate: false });
      });
      number?.addEventListener('change', () => update(number.value, number, { immediate: true }));
      number?.addEventListener('blur', () => update(number.value, number, { immediate: true }));
    });
  }

  ensureOpeningLimits() {
    normalizeOpenings(this.state);
  }

  bindSelects() {
    const bindings = {
      structurePreset: 'structurePreset',
      claddingProfile: 'claddingProfile',
      buildingUse: 'buildingUse',
      climateSystem: 'climateSystem',
      inspectionMode: 'inspectionMode',
      rackDensity: 'rackDensity',
      serviceVisibility: 'serviceVisibility',
    };
    Object.entries(bindings).forEach(([id, key]) => {
      document.querySelector(`#${id}`)?.addEventListener('change', (event) => {
        this.state[key] = event.target.value;
        if (key === 'buildingUse') this.applyUsePreset(event.target.value);
        this.updateClimateNote();
        if (key === 'inspectionMode') this.callbacks.onInspectionChange?.();
        else if (key === 'serviceVisibility') this.callbacks.onDisplayChange?.();
        else if (modelSelects.has(key)) this.callbacks.onModelChange?.({ fitCamera: false, immediate: true });
      });
    });
  }

  applyUsePreset(use) {
    if (use === 'cold') { this.state.climateSystem = 'frozen'; this.state.claddingProfile = 'sandwich'; }
    else if (use === 'food' && this.state.climateSystem === 'none') { this.state.climateSystem = 'chilled'; this.state.claddingProfile = 'sandwich'; }
    else if (use === 'workshop' && this.state.climateSystem === 'none') this.state.climateSystem = 'comfort';
    const climate = document.querySelector('#climateSystem');
    const cladding = document.querySelector('#claddingProfile');
    if (climate) climate.value = this.state.climateSystem;
    if (cladding) cladding.value = this.state.claddingProfile;
  }

  bindToggles() {
    const modelToggles = {
      secondaryStructureToggle: 'secondaryStructure',
      slabToggle: 'slab',
      roofSkylightsToggle: 'roofSkylights',
      guttersToggle: 'gutters',
      highBayLightingToggle: 'highBayLighting',
      fireSprinklersToggle: 'fireSprinklers',
    };
    Object.entries(modelToggles).forEach(([id, key]) => {
      document.querySelector(`#${id}`)?.addEventListener('change', (event) => {
        this.state[key] = event.target.checked;
        this.callbacks.onModelChange?.({ fitCamera: false, immediate: true });
      });
    });

    const displayToggles = {
      claddingToggle: 'showCladding',
      sceneryToggle: 'showScenery',
      sectionCutToggle: 'sectionCutEnabled',
      warehouseRackingToggle: 'warehouseRacking',
      forkliftClearanceToggle: 'forkliftClearance',
      serviceCoverageToggle: 'serviceCoverage',
    };
    Object.entries(displayToggles).forEach(([id, key]) => {
      document.querySelector(`#${id}`)?.addEventListener('change', (event) => {
        this.state[key] = event.target.checked;
        if (key === 'sectionCutEnabled') this.updateSectionCutControl();
        if (key === 'showScenery') this.callbacks.onSceneryChange?.();
        else this.callbacks.onDisplayChange?.();
      });
    });

    document.querySelector('#connectionDetailsToggle')?.addEventListener('change', (event) => {
      this.state.connectionDetails = event.target.checked;
      this.callbacks.onConnectionDetailsChange?.();
    });
  }

  bindSwatches() {
    const bind = (selector, key) => {
      document.querySelectorAll(`${selector} .swatch`).forEach((button) => {
        button.addEventListener('click', () => {
          this.state[key] = button.dataset.color;
          document.querySelectorAll(`${selector} .swatch`).forEach((item) => item.classList.toggle('selected', item === button));
          this.callbacks.onModelChange?.({ fitCamera: false, immediate: true });
        });
      });
    };
    bind('#wallSwatches', 'wallColor');
    bind('#roofSwatches', 'roofColor');
  }

  setExplodeValue(value, { notify = true } = {}) {
    this.state.explode = Math.max(0, Math.min(100, Number(value) || 0));
    const range = document.querySelector('#explodeRange');
    const output = document.querySelector('#explodeValue');
    const button = document.querySelector('#explodeToggleButton');
    if (range) range.value = String(this.state.explode);
    if (output) output.textContent = `${Math.round(this.state.explode)}%`;
    if (button) button.textContent = this.state.explode > 0 ? 'Assemble' : 'Explode';
    if (notify) this.callbacks.onExplode?.(this.state.explode);
  }

  bindExplode() {
    const range = document.querySelector('#explodeRange');
    const button = document.querySelector('#explodeToggleButton');
    range?.addEventListener('input', () => this.setExplodeValue(range.value));
    button?.addEventListener('click', () => this.setExplodeValue(this.state.explode > 0 ? 0 : 100));
  }

  bindEnvironmentPanel() {
    document.querySelector('#environmentCloseButton')?.addEventListener('click', () => this.callbacks.onEnvironmentPanelToggle?.(false));
    const sun = document.querySelector('#sunPositionRange');
    const north = document.querySelector('#northDirectionRange');
    sun?.addEventListener('input', () => {
      this.state.sunPosition = Number(sun.value);
      const output = document.querySelector('#sunPositionOutput'); if (output) output.textContent = `${Math.round(this.state.sunPosition * 100)}%`;
      this.callbacks.onEnvironmentChange?.();
    });
    north?.addEventListener('input', () => {
      this.state.northDirection = Number(north.value);
      const output = document.querySelector('#northDirectionOutput'); if (output) output.textContent = `${Math.round(this.state.northDirection)}°`;
      this.callbacks.onEnvironmentChange?.();
    });
    document.querySelector('#nightPreviewToggle')?.addEventListener('change', (event) => {
      this.state.nightPreview = event.target.checked;
      this.callbacks.onEnvironmentChange?.();
    });
    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.season = button.dataset.scene;
        document.querySelectorAll('[data-scene]').forEach((item) => item.classList.toggle('is-selected', item === button));
        this.callbacks.onEnvironmentChange?.();
      });
    });
  }

  setEnvironmentPanelOpen(open) {
    const panel = document.querySelector('#hallEnvironmentPanel');
    if (!panel) return;
    panel.classList.toggle('is-open', Boolean(open));
    panel.setAttribute('aria-hidden', String(!open));
  }

  bindBom() {
    const dialog = document.querySelector('#bomPanel');
    const close = () => {
      if (dialog?.open && dialog.close) dialog.close();
      else dialog?.removeAttribute('open');
    };
    document.querySelector('#bomOpenButton')?.addEventListener('click', () => {
      if (!validateOpenings(this.state).valid) { this.updateSummaryValidation(); return; }
      if (!dialog) return;
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    document.querySelector('#bomCloseButton')?.addEventListener('click', close);
    document.querySelector('#bomDoneButton')?.addEventListener('click', close);
    document.querySelector('#bomExportButton')?.addEventListener('click', () => this.exportBom());
    document.querySelector('#bomExportInlineButton')?.addEventListener('click', () => this.exportBom());
  }

  exportBom() {
    if (!this.currentBuild) return;
    if (!validateOpenings(this.state).valid) { this.updateSummaryValidation(); return; }
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

  bindOpeningControls() {
    document.querySelectorAll('[data-add-opening]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.dataset.addOpening;
        if (button.classList.contains('is-placement-active')) this.callbacks.onOpeningPlacementCancel?.();
        else this.callbacks.onOpeningAdd?.(type);
      });
    });

    const widthInput = document.querySelector('#openingWidthInput');
    const heightInput = document.querySelector('#openingHeightInput');
    const colorInput = document.querySelector('#openingColorInput');
    const sideSelect = document.querySelector('#openingSideSelect');
    const applyDimension = (key, input) => {
      const opening = this.getSelectedOpening();
      if (!opening) return;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      opening[key] = value;
      normalizeOpening(opening, this.state);
      input.value = opening[key].toFixed(2);
      this.callbacks.onOpeningEdit?.(opening.id, { immediate: true });
    };
    widthInput?.addEventListener('change', () => applyDimension('width', widthInput));
    heightInput?.addEventListener('change', () => applyDimension('height', heightInput));
    colorInput?.addEventListener('input', () => {
      const opening = this.getSelectedOpening();
      if (!opening) return;
      opening.color = colorInput.value;
      this.callbacks.onOpeningEdit?.(opening.id, { immediate: true });
    });
    sideSelect?.addEventListener('change', () => {
      const opening = this.getSelectedOpening();
      if (!opening) return;
      this.callbacks.onOpeningMoveToSide?.(opening.id, sideSelect.value);
    });
    document.querySelector('#openingDeleteButton')?.addEventListener('click', () => {
      if (this.selectedOpeningId) this.callbacks.onOpeningDelete?.(this.selectedOpeningId);
    });
    document.querySelector('#openingEditor')?.addEventListener('pointerdown', (event) => event.stopPropagation());
  }

  getSelectedOpening() {
    return normalizeOpenings(this.state).find((opening) => opening.id === this.selectedOpeningId) ?? null;
  }

  setPlacementMode(type = null) {
    this.placementType = type;
    document.querySelectorAll('[data-add-opening]').forEach((button) => {
      const active = Boolean(type) && button.dataset.addOpening === type;
      button.classList.toggle('is-placement-active', active);
      button.disabled = Boolean(type) && !active;
      const label = button.querySelector('b');
      const icon = button.querySelector('span');
      if (label) label.textContent = active ? 'Cancel placement' : `Add ${openingType(button.dataset.addOpening).label.toLowerCase()}`;
      if (icon) icon.textContent = active ? '×' : '＋';
    });
    const status = document.querySelector('#openingStatusText');
    if (status && type) {
      status.textContent = `Placing ${openingType(type).label.toLowerCase()}: move over any wall and click to confirm. Right-click or use Cancel placement to cancel.`;
      status.classList.remove('is-error');
    } else if (status && !this.selectedOpeningId) {
      status.textContent = 'Select an opening in the model to edit it.';
    }
  }

  setSelectedOpening(id) {
    this.selectedOpeningId = id ?? null;
    const editor = document.querySelector('#openingEditor');
    const opening = this.getSelectedOpening();
    if (!editor || !opening) {
      if (editor) editor.hidden = true;
      const status = document.querySelector('#openingStatusText');
      if (status && !this.placementType) status.textContent = 'Select an opening in the model to edit it.';
      return;
    }
    editor.hidden = false;
    document.querySelector('#openingEditorTitle').textContent = openingType(opening.type).label;
    document.querySelector('#openingEditorSide').textContent = wallLabel(opening.side);
    const sideSelect = document.querySelector('#openingSideSelect');
    if (sideSelect) sideSelect.value = opening.side;
    const spec = openingType(opening.type);
    const widthInput = document.querySelector('#openingWidthInput');
    const heightInput = document.querySelector('#openingHeightInput');
    if (widthInput) {
      widthInput.min = String(spec.minWidth);
      widthInput.max = String(Math.min(spec.maxWidth, Math.max(spec.minWidth, (opening.side === 'front' || opening.side === 'back' ? this.state.width : this.state.length) - .24)));
      widthInput.value = opening.width.toFixed(2);
    }
    if (heightInput) {
      heightInput.min = String(spec.minHeight);
      heightInput.max = String(Math.min(spec.maxHeight, Math.max(spec.minHeight, this.state.eaveHeight - .12)));
      heightInput.value = opening.height.toFixed(2);
    }
    const colorInput = document.querySelector('#openingColorInput');
    if (colorInput) colorInput.value = opening.color;
    this.updateOpeningValidation();
    const status = document.querySelector('#openingStatusText');
    if (status && !this.placementType) status.textContent = `${openingType(opening.type).label} selected · drag to move, use its borders or square handles to resize.`;
  }

  positionOpeningEditor(x, y, visible = true) {
    const editor = document.querySelector('#openingEditor');
    if (!editor || editor.hidden) return;
    editor.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    const safeX = Math.max(130, Math.min(window.innerWidth - 130, x));
    const safeY = Math.max(180, Math.min(window.innerHeight - 20, y));
    editor.style.left = `${safeX}px`;
    editor.style.top = `${safeY}px`;
  }

  updateOpeningValidation() {
    const validation = validateOpenings(this.state);
    const selected = this.getSelectedOpening();
    const warning = document.querySelector('#openingEditorWarning');
    if (warning) {
      const related = selected ? validation.overlaps.filter(({ a, b }) => a.id === selected.id || b.id === selected.id) : [];
      warning.hidden = related.length === 0;
      warning.textContent = related.length ? 'This opening overlaps another opening. Move or resize it before generating the summary.' : '';
    }
    const status = document.querySelector('#openingStatusText');
    if (status && !validation.valid && !this.placementType) {
      status.classList.add('is-error');
      status.textContent = `${validation.errors.length} opening collision${validation.errors.length === 1 ? '' : 's'} must be resolved.`;
    } else if (status) {
      status.classList.remove('is-error');
      if (!this.placementType && !selected) status.textContent = 'Select an opening in the model to edit it.';
    }
    return validation;
  }

  updateSectionCutControl() {
    document.querySelector('#sectionCutControl')?.classList.toggle('is-disabled', !this.state.sectionCutEnabled);
  }

  updateClimateNote() {
    const note = document.querySelector('#climateNote');
    if (note) note.textContent = climateNotes[this.state.climateSystem] ?? climateNotes.none;
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

    ['structurePreset', 'claddingProfile', 'buildingUse', 'climateSystem', 'inspectionMode', 'rackDensity', 'serviceVisibility'].forEach((id) => {
      const element = document.querySelector(`#${id}`);
      if (element) element.value = this.state[id];
    });
    const checkboxMap = {
      secondaryStructureToggle: this.state.secondaryStructure,
      slabToggle: this.state.slab,
      roofSkylightsToggle: this.state.roofSkylights,
      guttersToggle: this.state.gutters,
      highBayLightingToggle: this.state.highBayLighting,
      fireSprinklersToggle: this.state.fireSprinklers,
      claddingToggle: this.state.showCladding,
      sceneryToggle: this.state.showScenery,
      connectionDetailsToggle: this.state.connectionDetails,
      sectionCutToggle: this.state.sectionCutEnabled,
      warehouseRackingToggle: this.state.warehouseRacking,
      forkliftClearanceToggle: this.state.forkliftClearance,
      serviceCoverageToggle: this.state.serviceCoverage,
      nightPreviewToggle: this.state.nightPreview,
    };
    Object.entries(checkboxMap).forEach(([id, checked]) => { const element = document.querySelector(`#${id}`); if (element) element.checked = Boolean(checked); });
    document.querySelectorAll('#wallSwatches .swatch').forEach((button) => button.classList.toggle('selected', button.dataset.color === this.state.wallColor));
    document.querySelectorAll('#roofSwatches .swatch').forEach((button) => button.classList.toggle('selected', button.dataset.color === this.state.roofColor));
    const sun = document.querySelector('#sunPositionRange'); if (sun) sun.value = String(this.state.sunPosition);
    const sunOut = document.querySelector('#sunPositionOutput'); if (sunOut) sunOut.textContent = `${Math.round(this.state.sunPosition * 100)}%`;
    const north = document.querySelector('#northDirectionRange'); if (north) north.value = String(this.state.northDirection);
    const northOut = document.querySelector('#northDirectionOutput'); if (northOut) northOut.textContent = `${Math.round(this.state.northDirection)}°`;
    document.querySelectorAll('[data-scene]').forEach((button) => button.classList.toggle('is-selected', button.dataset.scene === this.state.season));
    this.setExplodeValue(this.state.explode, { notify: false });
    this.ensureOpeningLimits();
    this.updateSectionCutControl();
    this.updateClimateNote();
  }

  update(build) {
    this.currentBuild = build;
    const { metrics } = build;
    document.querySelector('#frameCountInfo').textContent = String(metrics.frameCount);
    document.querySelector('#actualSpacingInfo').textContent = `${metrics.bayCount} bays · ${metrics.actualBaySpacing.toFixed(2)} m actual spacing`;
    const profileInfo = document.querySelector('#profileInfo');
    if (profileInfo && build.profileSchedule) profileInfo.textContent = `${build.profileSchedule.columns} columns · ${build.profileSchedule.rafters} rafters · ${build.profileSchedule.purlins} purlins`;

    const openingValidation = validateOpenings(this.state);
    const lines = openingValidation.valid ? buildBom(this.state, build) : [];
    document.querySelector('#headerBomSummary').textContent = openingValidation.valid ? `${lines.length} lines` : 'Unavailable';
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

    this.updateSummary(lines, metrics);
  }

  updateSummary(lines, metrics) {
    if (!this.updateSummaryValidation()) return;
    const estimate = estimateHallPrice(this.state, this.currentBuild);
    document.querySelector('#summaryTotal').textContent = formatPrice(estimate.total, estimate.currency);
    const breakdown = document.querySelector('#summaryPriceBreakdown');
    breakdown.replaceChildren(...[
      ...estimate.items.map((item) => [item.label, formatPrice(item.amount, estimate.currency)]),
      ['Engineering & installation allowance', formatPrice(estimate.engineeringAndInstall, estimate.currency)],
    ].map(([label, value]) => {
      const row = document.createElement('div');
      row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return row;
    }));

    const metricsBox = document.querySelector('#summaryMetrics');
    metricsBox.innerHTML = `<div><span>Footprint</span><strong>${metrics.footprint.toFixed(1)} m²</strong></div><div><span>Portal frames</span><strong>${metrics.frameCount}</strong></div><div><span>Use</span><strong>${this.state.buildingUse.replace('-', ' ')}</strong></div><div><span>Climate</span><strong>${this.state.climateSystem}</strong></div>`;

    const preview = document.querySelector('#summaryBomList');
    preview.replaceChildren(...lines.slice(0, 8).map((line) => {
      const row = document.createElement('div');
      row.innerHTML = `<span>${line.name}</span><strong>${line.quantity} ${line.unit}</strong>`;
      return row;
    }));
    if (lines.length > 8) {
      const more = document.createElement('div');
      more.className = 'summary-bom-more';
      more.textContent = `+ ${lines.length - 8} additional BOM lines`;
      preview.append(more);
    }
  }

  updateSummaryValidation() {
    const validation = validateOpenings(this.state);
    const error = document.querySelector('#summaryValidationError');
    const content = document.querySelector('#summaryContent');
    const exportInline = document.querySelector('#bomExportInlineButton');
    const bomOpen = document.querySelector('#bomOpenButton');
    if (error) {
      error.hidden = validation.valid;
      error.innerHTML = validation.valid ? '' : `<strong>Summary unavailable</strong>${validation.errors.join('<br>')} Resolve all overlapping wall openings before pricing or BOM generation.`;
    }
    content?.classList.toggle('is-blocked', !validation.valid);
    if (exportInline) exportInline.disabled = !validation.valid;
    if (bomOpen) bomOpen.disabled = !validation.valid;
    this.updateOpeningValidation();
    return validation.valid;
  }

  captureState() { return structuredClone(this.state); }

  restoreState(snapshot) {
    if (!Array.isArray(snapshot?.openings)) this.state.openings = undefined;
    Object.assign(this.state, snapshot);
    normalizeOpenings(this.state);
    this.selectedOpeningId = null;
    this.setPlacementMode(null);
    this.applyStateToControls();
    this.callbacks.onModelChange?.({ fitCamera: true, immediate: true });
  }
}
