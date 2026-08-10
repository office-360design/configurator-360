import { modulePresets, regionPresets, roofNames } from './state.js?v=2';
import {
  estimateAnnualProduction,
  estimateDailyConsumption,
  instantaneousPowerAtHour,
  simulateDay,
  sunClearsPvgisHorizon,
} from './energyModel.js?v=3';
import { calculateSolarEstimate, estimateToCsv } from './estimate.js?v=1';
import { formatAzimuth, getActiveLocation, getSeasonForDate, getSolarContext } from './solarPosition.js?v=2';
import {
  displayLengthInputConfig,
  formatArea,
  formatCurrency,
  formatLength,
  fromDisplayLength,
  normalizeUnits,
  toDisplayLength,
} from './preferences.js?v=1';

const LENGTH_CONTROL_KEYS = new Set(['length', 'depth']);
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export class SolarUI {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
    this.lastMetrics = null;
    this.currentEstimate = null;
    this.currentSimulation = null;
    this.currentProduction = null;
    this.dimensionBindings = [];

    this.bindRoofTypes();
    this.bindRanges();
    this.bindSolarControls();
    this.bindEnergyControls();
    this.bindBatteryControls();
    this.bindPricingControls();
    this.bindToggles();
    this.bindEstimate();
    this.syncAllControls();
  }

  bindRoofTypes() {
    document.querySelectorAll('[data-roof-type]').forEach((button) => {
      button.addEventListener('click', () => {
        const activePreset = this.getMatchingLayoutPreset();
        this.state.roofType = button.dataset.roofType;
        document.querySelectorAll('[data-roof-type]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        this.syncRoofSideAvailability();
        if (activePreset) this.applyLayoutPreset(activePreset.columns, activePreset.rows);
        else this.syncLayoutPresets();
        document.querySelector('#viewerTitle').textContent = roofNames[this.state.roofType] || 'Solar roof';
        this.onChange({ fitCamera: true, pvgis: true });
      });
    });
  }

  bindRanges() {
    document.querySelectorAll('[data-control]').forEach((control) => {
      const key = control.dataset.control;
      const range = control.querySelector('input[type="range"]');
      const number = control.querySelector('input[type="number"]');
      const output = control.querySelector('output');
      if (!range || !number || !output) return;
      const isLength = LENGTH_CONTROL_KEYS.has(key);
      const baseMin = Number(range.min);
      const baseMax = Number(range.max);
      const baseStep = Number(range.step) || 0.1;

      const updateState = (raw) => {
        const value = Math.min(Number(range.max), Math.max(Number(range.min), raw));
        if (!Number.isFinite(value)) return;
        this.state[key] = value;
        range.value = String(value);
        this.syncDimensionControls();
        this.onChange({ fitCamera: false, pvgis: true });
      };

      range.addEventListener('input', () => updateState(Number(range.value)));
      const updateNumber = () => {
        if (number.value === '') return;
        updateState(isLength ? fromDisplayLength(number.value, this.state.units) : Number(number.value));
      };
      number.addEventListener('change', updateNumber);
      number.addEventListener('blur', updateNumber);

      this.dimensionBindings.push({ key, range, number, output, isLength, baseMin, baseMax, baseStep });
    });
  }

  syncDimensionControls() {
    const units = normalizeUnits(this.state.units);
    this.dimensionBindings.forEach((binding) => {
      const { key, range, number, output, isLength, baseMin, baseMax, baseStep } = binding;
      const value = numeric(this.state[key]);
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
      number.value = config.decimals > 0 ? displayValue.toFixed(config.decimals) : String(Math.round(displayValue));
      output.value = formatLength(value, units, { inchDecimals: 1 });
    });
  }

  getLayoutMultiplier(roofSide = this.state.roofSide, roofType = this.state.roofType) {
    return roofType !== 'shed' && roofSide === 'both' ? 2 : 1;
  }

  getMatchingLayoutPreset(roofSide = this.state.roofSide, roofType = this.state.roofType) {
    const multiplier = this.getLayoutMultiplier(roofSide, roofType);
    const columns = Math.max(1, Math.round(Number(this.state.panelColumns) || 1));
    const totalPanels = Math.max(1, Math.round(Number(this.state.panelCount) || 1));
    for (const button of document.querySelectorAll('[data-layout-preset]')) {
      const match = String(button.dataset.layoutPreset || '').match(/^(\d+)x(\d+)$/i);
      if (!match) continue;
      const presetColumns = Number(match[1]);
      const presetRows = Number(match[2]);
      if (presetColumns === columns && presetColumns * presetRows * multiplier === totalPanels) {
        return { columns: presetColumns, rows: presetRows };
      }
    }
    return null;
  }

  syncPanelCountControls() {
    const countRange = document.querySelector('#panelCountRange');
    const countInput = document.querySelector('#panelCountInput');
    if (countRange) countRange.value = String(this.state.panelCount);
    if (countInput) countInput.value = String(this.state.panelCount);
  }

  applyLayoutPreset(columns, rows) {
    const multiplier = this.getLayoutMultiplier();
    this.state.panelColumns = columns;
    this.state.panelCount = Math.min(80, columns * rows * multiplier);

    this.syncPanelCountControls();
    const colRange = document.querySelector('#panelColumnsRange');
    const colInput = document.querySelector('#panelColumnsInput');
    if (colRange) colRange.value = String(this.state.panelColumns);
    if (colInput) colInput.value = String(this.state.panelColumns);
    this.syncLayoutPresets();
  }

  bindSolarControls() {
    const moduleSelect = document.querySelector('#modulePresetSelect');
    moduleSelect?.addEventListener('change', () => {
      this.state.modulePreset = moduleSelect.value;
      this.renderModuleReference();
      this.onChange({ fitCamera: false, pvgis: true });
    });

    this.bindPairedNumber('panelCount', 'panelCountRange', 'panelCountInput', (value) => {
      this.state.panelCount = Math.round(value);
      this.syncLayoutPresets();
      this.onChange({ fitCamera: false, pvgis: true });
    });
    this.bindPairedNumber('panelColumns', 'panelColumnsRange', 'panelColumnsInput', (value) => {
      this.state.panelColumns = Math.round(value);
      this.syncLayoutPresets();
      this.onChange({ fitCamera: false, pvgis: true });
    });

    document.querySelectorAll('[data-layout-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const match = String(button.dataset.layoutPreset || '').match(/^(\d+)x(\d+)$/i);
        if (!match) return;
        const columns = Math.min(10, Math.max(1, Number(match[1])));
        const rows = Math.max(1, Number(match[2]));
        this.applyLayoutPreset(columns, rows);
        this.onChange({ fitCamera: false, pvgis: true });
      });
    });

    document.querySelectorAll('[data-module-orientation]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.moduleOrientation = button.dataset.moduleOrientation;
        this.syncPressed('[data-module-orientation]', button);
        this.onChange({ fitCamera: false, pvgis: true });
      });
    });

    document.querySelectorAll('[data-roof-side]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const activePreset = this.getMatchingLayoutPreset();
        this.state.roofSide = button.dataset.roofSide;
        this.syncPressed('[data-roof-side]', button);
        if (activePreset) this.applyLayoutPreset(activePreset.columns, activePreset.rows);
        else this.syncLayoutPresets();
        this.onChange({ fitCamera: false, pvgis: true });
      });
    });
  }

  syncRoofSideAvailability() {
    const singleSlope = this.state.roofType === 'shed';
    if (singleSlope && (this.state.roofSide === 'back' || this.state.roofSide === 'both')) {
      this.state.roofSide = 'front';
    }

    document.querySelectorAll('[data-roof-side]').forEach((button) => {
      const unavailable = singleSlope && (button.dataset.roofSide === 'back' || button.dataset.roofSide === 'both');
      button.disabled = unavailable;
      button.setAttribute('aria-disabled', String(unavailable));
      button.title = unavailable ? 'Not available for a one-slope roof' : '';
      button.setAttribute('aria-pressed', String(button.dataset.roofSide === this.state.roofSide));
    });
  }

  bindPairedNumber(key, rangeId, inputId, callback) {
    const range = document.querySelector(`#${rangeId}`);
    const input = document.querySelector(`#${inputId}`);
    if (!range || !input) return;
    const apply = (value) => {
      const next = Math.min(Number(range.max), Math.max(Number(range.min), numeric(value, this.state[key])));
      this.state[key] = next;
      range.value = String(next);
      input.value = String(Math.round(next));
      callback(next);
    };
    range.addEventListener('input', () => apply(range.value));
    input.addEventListener('change', () => apply(input.value));
    input.addEventListener('blur', () => apply(input.value));
  }

  syncLayoutPresets() {
    const multiplier = this.getLayoutMultiplier();
    document.querySelectorAll('[data-layout-preset]').forEach((button) => {
      const match = String(button.dataset.layoutPreset || '').match(/^(\d+)x(\d+)$/i);
      const active = match
        && Number(match[1]) === this.state.panelColumns
        && Number(match[1]) * Number(match[2]) * multiplier === this.state.panelCount;
      button.setAttribute('aria-pressed', String(Boolean(active)));
    });
  }

  bindEnergyControls() {
    document.querySelectorAll('[data-grid-connection]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.gridConnection = button.dataset.gridConnection;
        this.syncPressed('[data-grid-connection]', button);
        this.onChange({ fitCamera: false, scene: false, pvgis: false });
      });
    });

    document.querySelectorAll('[data-region]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.region = button.dataset.region;
        this.state.locationMode = 'region';
        this.syncPressed('[data-region]', button);
        this.onChange({ fitCamera: false, scene: false, pvgis: true });
      });
    });

    const bill = document.querySelector('#monthlyBillInput');
    const tariff = document.querySelector('#energyTariffInput');
    const updateEnergy = () => {
      this.state.monthlyBillRon = Math.max(0, numeric(bill?.value, this.state.monthlyBillRon));
      this.state.energyTariffRon = Math.max(0.05, numeric(tariff?.value, this.state.energyTariffRon));
      this.onChange({ fitCamera: false, scene: false, pvgis: false });
    };
    bill?.addEventListener('input', updateEnergy);
    tariff?.addEventListener('input', updateEnergy);
    document.querySelector('#exactLocationButton')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('solar-open-location-picker'));
    });

    document.querySelectorAll('[data-consumption-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.consumptionProfile = button.dataset.consumptionProfile;
        this.syncPressed('[data-consumption-profile]', button);
        this.onChange({ fitCamera: false, scene: false, pvgis: false });
      });
    });
  }

  bindBatteryControls() {
    const enabled = document.querySelector('#batteryEnabledToggle');
    const auto = document.querySelector('#batteryAutoToggle');
    const capacityRange = document.querySelector('#batteryCapacityRange');
    const capacityInput = document.querySelector('#batteryCapacityInput');

    enabled?.addEventListener('change', () => {
      this.state.batteryEnabled = enabled.checked;
      this.syncBatteryControls();
      this.onChange({ fitCamera: false, scene: false, pvgis: false });
    });
    auto?.addEventListener('change', () => {
      this.state.batteryAutoSize = auto.checked;
      this.syncBatteryControls();
      this.onChange({ fitCamera: false, scene: false, pvgis: false });
    });

    const applyCapacity = (value) => {
      const next = Math.min(20, Math.max(2, numeric(value, 5)));
      this.state.batteryCapacityKWh = next;
      if (capacityRange) capacityRange.value = String(next);
      if (capacityInput) capacityInput.value = String(next);
      this.onChange({ fitCamera: false, scene: false, pvgis: false });
    };
    capacityRange?.addEventListener('input', () => applyCapacity(capacityRange.value));
    capacityInput?.addEventListener('change', () => applyCapacity(capacityInput.value));
  }

  bindPricingControls() {
    const mappings = [
      ['mountingPriceInput', 'mountingPricePerPanelRon'],
      ['installationPriceInput', 'installationPricePerKwpRon'],
      ['paperworkPriceInput', 'paperworkPriceRon'],
      ['batteryPriceInput', 'batteryPricePerKWhRon'],
    ];
    mappings.forEach(([id, key]) => {
      const input = document.querySelector(`#${id}`);
      input?.addEventListener('input', () => {
        this.state[key] = Math.max(0, numeric(input.value, this.state[key]));
        this.onChange({ fitCamera: false, scene: false, pvgis: false });
      });
    });
    const vatInput = document.querySelector('#vatRateInput');
    vatInput?.addEventListener('input', () => {
      this.state.vatRate = Math.min(0.5, Math.max(0, numeric(vatInput.value, 21) / 100));
      this.onChange({ fitCamera: false, scene: false, pvgis: false });
    });
  }

  bindToggles() {
    document.querySelector('#wireframeToggle')?.addEventListener('change', (event) => {
      this.state.technicalEdges = event.target.checked;
      this.onChange({ fitCamera: false, pvgis: false });
    });
    document.querySelector('#simulationPlayButton')?.addEventListener('click', () => {
      window.SOLAR_CONFIGURATOR_API?.toggleSimulation?.();
    });
  }

  bindEstimate() {
    document.querySelector('#estimateExportButton')?.addEventListener('click', () => this.exportEstimate());
    document.querySelector('#estimateTableBody')?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-estimate-line-toggle]');
      if (!checkbox) return;
      const excluded = new Set(this.state.excludedEstimateItems || []);
      if (checkbox.checked) excluded.delete(checkbox.dataset.estimateLineToggle);
      else excluded.add(checkbox.dataset.estimateLineToggle);
      this.state.excludedEstimateItems = [...excluded];
      if (this.lastMetrics) this.updateMetrics(this.lastMetrics);
    });
  }

  syncPressed(selector, activeButton = null) {
    document.querySelectorAll(selector).forEach((button) => {
      const active = activeButton ? button === activeButton : button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(active));
    });
  }

  syncAllControls() {
    this.syncDimensionControls();
    const moduleSelect = document.querySelector('#modulePresetSelect');
    if (moduleSelect) moduleSelect.value = this.state.modulePreset;
    const countRange = document.querySelector('#panelCountRange');
    const countInput = document.querySelector('#panelCountInput');
    if (countRange) countRange.value = String(this.state.panelCount);
    if (countInput) countInput.value = String(this.state.panelCount);
    const colRange = document.querySelector('#panelColumnsRange');
    const colInput = document.querySelector('#panelColumnsInput');
    if (colRange) colRange.value = String(this.state.panelColumns);
    if (colInput) colInput.value = String(this.state.panelColumns);

    document.querySelectorAll('[data-roof-type]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.roofType === this.state.roofType)));
    document.querySelectorAll('[data-module-orientation]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.moduleOrientation === this.state.moduleOrientation)));
    this.syncRoofSideAvailability();
    this.syncLayoutPresets();
    document.querySelectorAll('[data-grid-connection]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.gridConnection === this.state.gridConnection)));
    document.querySelectorAll('[data-region]').forEach((button) => button.setAttribute('aria-pressed', String(this.state.locationMode !== 'exact' && button.dataset.region === this.state.region)));
    document.querySelectorAll('[data-consumption-profile]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.consumptionProfile === this.state.consumptionProfile)));

    const bill = document.querySelector('#monthlyBillInput');
    const tariff = document.querySelector('#energyTariffInput');
    if (bill) bill.value = String(this.state.monthlyBillRon);
    if (tariff) tariff.value = String(this.state.energyTariffRon);
    document.querySelector('#viewerTitle').textContent = roofNames[this.state.roofType] || 'Solar roof';
    this.renderModuleReference();
    this.syncBatteryControls();

    const priceMap = {
      mountingPriceInput: this.state.mountingPricePerPanelRon,
      installationPriceInput: this.state.installationPricePerKwpRon,
      paperworkPriceInput: this.state.paperworkPriceRon,
      batteryPriceInput: this.state.batteryPricePerKWhRon,
      vatRateInput: this.state.vatRate * 100,
    };
    Object.entries(priceMap).forEach(([id, value]) => {
      const input = document.querySelector(`#${id}`);
      if (input) input.value = String(value);
    });
  }

  syncBatteryControls() {
    const enabled = document.querySelector('#batteryEnabledToggle');
    const auto = document.querySelector('#batteryAutoToggle');
    const manual = document.querySelector('#batteryManualControls');
    if (enabled) enabled.checked = this.state.batteryEnabled;
    if (auto) {
      auto.checked = this.state.batteryAutoSize;
      auto.disabled = !this.state.batteryEnabled;
    }
    if (manual) manual.hidden = !this.state.batteryEnabled || this.state.batteryAutoSize;
  }

  renderModuleReference() {
    const module = modulePresets[this.state.modulePreset] || modulePresets.standard475;
    const element = document.querySelector('#moduleReference');
    if (!element) return;
    element.innerHTML = `<strong>${module.powerW} W · ${(module.efficiency * 100).toFixed(1)}%</strong><span>${module.lengthM.toFixed(3)} × ${module.widthM.toFixed(3)} m · ${module.note}</span>`;
  }

  setPreferences() {
    this.syncDimensionControls();
    if (this.lastMetrics) this.updateMetrics(this.lastMetrics);
  }

  updateMetrics(metrics) {
    this.lastMetrics = metrics;
    this.state.effectivePanelCount = metrics.placedPanels;
    this.currentProduction = estimateAnnualProduction(this.state, metrics);
    this.currentSimulation = simulateDay(this.state, metrics, this.currentProduction);
    this.currentEstimate = calculateSolarEstimate(this.state, metrics, this.currentSimulation);

    document.querySelector('#metricSystemSize').textContent = `${metrics.systemKwp.toFixed(2)} kWp`;
    document.querySelector('#metricPanels').textContent = `${metrics.placedPanels} panels`;
    document.querySelector('#metricDaily').textContent = `${this.currentProduction.dailyAverageKWh.toFixed(1)} kWh`;
    document.querySelector('#metricAnnual').textContent = `${Math.round(this.currentProduction.annualKWh).toLocaleString('en-US')} kWh`;

    const layout = document.querySelector('#layoutReadout');
    if (layout) {
      const surfaceCount = Math.max(1, metrics.selectedSurfaces?.length || 1);
      const panelsPerSurface = Math.ceil(Math.max(1, this.state.panelCount) / surfaceCount);
      const rowsPerSurface = Math.ceil(panelsPerSurface / Math.max(1, this.state.panelColumns));
      layout.textContent = surfaceCount > 1
        ? `${this.state.panelColumns} × ${rowsPerSurface} per side · ${this.state.panelCount} total`
        : `${this.state.panelColumns} × ${rowsPerSurface} target grid · ${this.state.moduleOrientation}`;
    }
    const fitWarning = document.querySelector('#panelFitWarning');
    if (fitWarning) {
      fitWarning.hidden = !metrics.fitWarning;
      fitWarning.textContent = metrics.fitWarning || '';
    }

    const consumption = estimateDailyConsumption(this.state);
    document.querySelector('#energyConsumptionReadout').textContent = `${consumption.dailyKWh.toFixed(1)} kWh/day`;
    document.querySelector('#energyProductionReadout').textContent = `${this.currentSimulation.dailyGeneration.toFixed(1)} kWh/day`;
    document.querySelector('#selfSufficiencyReadout').textContent = `${this.currentSimulation.selfSufficiency.toFixed(0)}%`;
    document.querySelector('#gridImportReadout').textContent = `${this.currentSimulation.gridImport.toFixed(1)} kWh`;
    document.querySelector('#gridExportReadout').textContent = `${this.currentSimulation.gridExport.toFixed(1)} kWh`;
    document.querySelector('#batteryCapacityReadout').textContent = this.state.batteryEnabled ? `${this.currentSimulation.batteryCapacity.toFixed(0)} kWh` : 'No battery';

    const sourceBadge = document.querySelector('#productionSourceBadge');
    if (sourceBadge) {
      const status = this.state.pvgisStatus === 'loading' ? 'Updating PVGIS…' : this.currentProduction.source;
      sourceBadge.textContent = status;
      sourceBadge.dataset.status = this.state.pvgisStatus;
    }
    const region = regionPresets[this.state.region] || regionPresets.muntenia;
    const activeLocation = getActiveLocation(this.state);
    document.querySelectorAll('[data-region]').forEach((button) => {
      button.setAttribute('aria-pressed', String(this.state.locationMode !== 'exact' && button.dataset.region === this.state.region));
    });
    const regionDetail = document.querySelector('#regionDetail');
    if (regionDetail) {
      if (activeLocation.mode === 'exact' && this.state.pvgisStatus === 'ready') {
        regionDetail.textContent = `${activeLocation.label} · ${Math.round(this.currentProduction.specificYield)} kWh/kWp/year · ${this.state.pvgisUseHorizon ? 'terrain horizon on' : 'terrain horizon off'}`;
      } else {
        regionDetail.textContent = activeLocation.mode === 'exact'
          ? `${activeLocation.label} · exact sun geometry · annual yield calibrated to ${region.city}`
          : `${region.city} reference · ${Math.round(this.currentProduction.specificYield)} kWh/kWp/year`;
      }
    }
    const exactLocationButton = document.querySelector('#exactLocationButton');
    if (exactLocationButton) exactLocationButton.textContent = activeLocation.mode === 'exact' ? 'Change exact location' : 'Choose exact location';
    const dateReadout = document.querySelector('#simulationDateReadout');
    if (dateReadout) {
      const season = getSeasonForDate(this.state.simulationDate);
      dateReadout.textContent = `${this.state.simulationDate} · ${season} · sunrise ${this.currentSimulation.sunriseLabel} / sunset ${this.currentSimulation.sunsetLabel}`;
    }

    this.renderChart();
    this.updateInstantaneous(this.state.simulationHour);
    this.updateEstimate();
  }

  updateInstantaneous(hour) {
    this.state.simulationHour = Math.max(0, Math.min(23.99, numeric(hour, 12)));
    if (!this.currentSimulation) return;
    const point = instantaneousPowerAtHour(this.currentSimulation, this.state.simulationHour);
    const totalMinutes = Math.min(1439, Math.max(0, Math.round(this.state.simulationHour * 60)));
    const time = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    document.querySelector('#simulationTimeReadout').textContent = time;
    document.querySelector('#instantProduction').textContent = `${point.production.toFixed(2)} kW`;
    document.querySelector('#instantConsumption').textContent = `${point.consumption.toFixed(2)} kW`;
    document.querySelector('#instantBattery').textContent = this.state.batteryEnabled ? `${point.socPct.toFixed(0)}%` : '—';
    const solar = getSolarContext(this.state, this.state.simulationHour);
    const sunReadout = document.querySelector('#liveSunReadout');
    const clearsTerrain = sunClearsPvgisHorizon(this.state, solar);
    if (sunReadout) {
      if (solar.isDaylight && !clearsTerrain) {
        sunReadout.textContent = `Sun behind terrain horizon · ${solar.elevationDeg.toFixed(1)}° · ${formatAzimuth(solar.azimuthDeg)}`;
      } else if (solar.isDaylight) {
        sunReadout.textContent = `Sun ${solar.elevationDeg.toFixed(1)}° high · ${formatAzimuth(solar.azimuthDeg)}`;
      } else {
        sunReadout.textContent = `Sun below horizon · ${formatAzimuth(solar.azimuthDeg)}`;
      }
    }
    const play = document.querySelector('#simulationPlayButton');
    if (play) play.textContent = this.state.simulationPlaying ? 'Pause day simulation' : 'Run day simulation';
    this.renderChart();
  }

  renderChart() {
    const svg = document.querySelector('#simulationChart');
    if (!svg || !this.currentSimulation) return;
    const width = 720;
    const height = 230;
    const left = 42;
    const right = 16;
    const top = 18;
    const bottom = 34;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const hours = this.currentSimulation.hours;
    const maxValue = Math.max(0.5, ...hours.flatMap((item) => [item.production, item.consumption]));
    const x = (hour) => left + (hour / 24) * plotW;
    const y = (value) => top + plotH - (value / maxValue) * plotH;
    const path = (key) => hours.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index + 0.5).toFixed(1)} ${y(item[key]).toFixed(1)}`).join(' ');
    const batteryPath = this.state.batteryEnabled
      ? hours.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index + 0.5).toFixed(1)} ${(top + plotH - (item.socPct / 100) * plotH).toFixed(1)}`).join(' ')
      : '';
    const currentX = x(this.state.simulationHour);

    const ticks = [0, 6, 12, 18, 24].map((hour) => `<text x="${x(hour)}" y="${height - 10}" text-anchor="middle">${String(hour).padStart(2, '0')}</text>`).join('');
    const grid = [0.25, 0.5, 0.75, 1].map((fraction) => {
      const yy = top + plotH - fraction * plotH;
      return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" class="chart-grid"/><text x="${left - 8}" y="${yy + 4}" text-anchor="end">${(maxValue * fraction).toFixed(1)}</text>`;
    }).join('');

    const sunriseX = x(Math.max(0, Math.min(24, this.currentSimulation.sunriseHour ?? 6)));
    const sunsetX = x(Math.max(0, Math.min(24, this.currentSimulation.sunsetHour ?? 18)));
    const nightBands = `
      <rect x="${left}" y="${top}" width="${Math.max(0, sunriseX - left)}" height="${plotH}" class="chart-night"/>
      <rect x="${sunsetX}" y="${top}" width="${Math.max(0, width - right - sunsetX)}" height="${plotH}" class="chart-night"/>`;

    svg.innerHTML = `
      ${nightBands}
      <g class="chart-axis">${grid}${ticks}</g>
      <path d="${path('production')}" class="chart-production"/>
      <path d="${path('consumption')}" class="chart-consumption"/>
      ${batteryPath ? `<path d="${batteryPath}" class="chart-battery"/>` : ''}
      <line x1="${currentX}" x2="${currentX}" y1="${top}" y2="${top + plotH}" class="chart-current"/>
    `;
  }

  updateEstimate() {
    const estimate = this.currentEstimate;
    if (!estimate) return;
    document.querySelector('#headerEstimateTotal').textContent = formatCurrency(estimate.total, estimate.currency);
    document.querySelector('#estimateSubtotal').textContent = formatCurrency(estimate.subtotal, estimate.currency);
    document.querySelector('#estimateVat').textContent = formatCurrency(estimate.vat, estimate.currency);
    document.querySelector('#estimateTotal').textContent = formatCurrency(estimate.total, estimate.currency);

    const body = document.querySelector('#estimateTableBody');
    body?.replaceChildren(...estimate.lines.map((line, index) => {
      const row = document.createElement('tr');
      row.classList.toggle('is-excluded', line.included === false);
      row.innerHTML = `
        <td class="bom-check-cell"><input type="checkbox" data-estimate-line-toggle="${line.key}" ${line.included === false ? '' : 'checked'} aria-label="Include ${line.name}"></td>
        <td>${index + 1}</td>
        <td><strong>${line.name}</strong>${line.note ? `<small>${line.note}</small>` : ''}</td>
        <td>${line.unit}</td>
        <td>${typeof line.quantity === 'number' ? Number(line.quantity.toFixed?.(2) ?? line.quantity) : line.quantity}</td>
        <td>${formatCurrency(line.unitPrice, estimate.currency)}</td>
        <td>${formatCurrency(line.value, estimate.currency)}</td>
      `;
      return row;
    }) || []);

    const assumptions = [
      ['Installed PV', `${estimate.assumptions.systemKwp.toFixed(2)} kWp`],
      ['Panels', `${estimate.assumptions.panels}`],
      ['Array area', formatArea(estimate.assumptions.installedAreaM2, this.state.units, 1)],
      ['Battery', this.state.batteryEnabled ? `${estimate.assumptions.batteryCapacity.toFixed(0)} kWh` : 'No storage'],
      ['Grid', estimate.assumptions.gridConnection === 'three' ? 'Three-phase' : 'Single-phase'],
      ['VAT', `${Math.round(estimate.vatRate * 100)}% included`],
    ];
    const grid = document.querySelector('#estimateAssumptions');
    grid?.replaceChildren(...assumptions.map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return item;
    }));

    const currencyNote = document.querySelector('#estimateCurrencyNote');
    if (currencyNote) {
      currencyNote.textContent = estimate.currency === 'RON'
        ? ' Prices are shown in RON.'
        : ` Converted from RON using ${estimate.exchangeRateSource}${estimate.exchangeRateDate ? ` (${estimate.exchangeRateDate})` : ''}${estimate.exchangeRateIsFallback ? ' — fallback rate' : ''}.`;
    }
  }

  exportEstimate() {
    if (!this.currentEstimate) return;
    const blob = new Blob([`\ufeff${estimateToCsv(this.currentEstimate)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `solar-estimate-${this.currentEstimate.assumptions.systemKwp.toFixed(2)}kwp-${this.state.currency}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
