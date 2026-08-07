import { modulePresets } from './state.js?v=2';
import { normalizeCurrency } from './preferences.js?v=1';

export const VAT_RATE = 0.21;

function inverterPriceRon(systemKwp, gridConnection = 'single') {
  const size = Math.max(1, Number(systemKwp) || 0);
  const phaseAllowance = gridConnection === 'three' ? 900 : 0;
  return Math.round(2200 + 340 * Math.min(12, size) + phaseAllowance);
}

function addLine(lines, key, name, unit, quantity, unitPriceRon, note = '') {
  if (!(quantity > 0)) return;
  lines.push({
    key,
    name,
    unit,
    quantity,
    unitPriceRon,
    valueRon: quantity * unitPriceRon,
    note,
  });
}

export function calculateSolarEstimate(state, solarMetrics, simulation) {
  const module = modulePresets[state.modulePreset] || modulePresets.standard475;
  const panels = Math.max(0, Math.round(solarMetrics.placedPanels || 0));
  const systemKwp = Math.max(0, Number(solarMetrics.systemKwp) || 0);
  const batteryCapacity = state.batteryEnabled ? Math.max(0, Number(simulation?.batteryCapacity) || 0) : 0;

  const lines = [];
  addLine(lines, 'panels', `${module.label} solar module`, 'pcs', panels, module.panelPriceRon, `${module.powerW} W · ${module.lengthM.toFixed(3)} × ${module.widthM.toFixed(3)} m`);
  addLine(lines, 'mounting', 'Roof mounting structure & clamps', 'panel', panels, Math.max(0, Number(state.mountingPricePerPanelRon) || 0), 'Indicative mounting allowance');
  addLine(lines, 'inverter', `Hybrid-ready ${state.gridConnection === 'three' ? 'three-phase' : 'single-phase'} inverter ~${Math.max(3, Math.ceil(systemKwp))} kW`, 'pcs', systemKwp > 0 ? 1 : 0, inverterPriceRon(systemKwp, state.gridConnection), 'Indicative inverter allowance');
  addLine(lines, 'installation', 'DC/AC electrical works, cabling & installation', 'kWp', Number(systemKwp.toFixed(2)), Math.max(0, Number(state.installationPricePerKwpRon) || 0), 'Scales with installed peak power');
  addLine(lines, 'paperwork', 'Design, commissioning & prosumer documentation allowance', 'lot', systemKwp > 0 ? 1 : 0, Math.max(0, Number(state.paperworkPriceRon) || 0));
  addLine(lines, 'battery', `LiFePO₄ storage · ${batteryCapacity.toFixed(0)} kWh`, 'kWh', batteryCapacity, Math.max(0, Number(state.batteryPricePerKWhRon) || 0), 'Shown only when storage is enabled');

  const excluded = new Set(Array.isArray(state.excludedEstimateItems) ? state.excludedEstimateItems : []);
  const currency = normalizeCurrency(state.currency);
  const rate = currency === 'RON' ? 1 : Math.max(0.0001, Number(state.currencyRate) || 1);
  const converted = lines.map((line) => ({
    ...line,
    included: !excluded.has(line.key),
    unitPrice: line.unitPriceRon * rate,
    value: line.valueRon * rate,
  }));

  const total = converted.reduce((sum, line) => sum + (line.included ? line.value : 0), 0);
  const vatRate = Math.min(0.5, Math.max(0, Number(state.vatRate) || VAT_RATE));
  const subtotal = total / (1 + vatRate);
  const vat = total - subtotal;

  return {
    lines: converted,
    subtotal,
    vat,
    total,
    vatRate,
    currency,
    exchangeRate: rate,
    exchangeRateDate: state.currencyRateDate || null,
    exchangeRateSource: state.currencyRateSource || 'reference currency',
    exchangeRateIsFallback: Boolean(state.currencyRateIsFallback),
    assumptions: {
      panels,
      systemKwp,
      batteryCapacity,
      panelPriceRon: module.panelPriceRon,
      installedAreaM2: solarMetrics.arrayAreaM2 || 0,
      gridConnection: state.gridConnection,
    },
  };
}

export function estimateToCsv(estimate) {
  const currency = estimate.currency || 'RON';
  const rows = [
    ['Nr.', 'Item', 'Unit', 'Qty.', `Unit price incl. VAT (${currency})`, `Value incl. VAT (${currency})`],
    ...estimate.lines.filter((line) => line.included !== false).map((line, index) => [
      index + 1,
      line.name,
      line.unit,
      line.quantity,
      line.unitPrice.toFixed(2),
      line.value.toFixed(2),
    ]),
    [],
    ['', 'Subtotal before VAT', '', '', '', estimate.subtotal.toFixed(2)],
    ['', `VAT ${Math.round(estimate.vatRate * 100)}%`, '', '', '', estimate.vat.toFixed(2)],
    ['', 'Estimated total incl. VAT', '', '', '', estimate.total.toFixed(2)],
  ];

  return rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return `"${value.replaceAll('"', '""')}"`;
  }).join(',')).join('\n');
}
