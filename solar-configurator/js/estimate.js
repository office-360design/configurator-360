import { modulePresets } from './state.js?v=8';
import { normalizeCurrency } from './preferences.js?v=2';
import { solarModuleLabel, solarT, resolveSolarLocale } from './i18n.js?v=1';

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

export function calculateSolarEstimate(state, solarMetrics, simulation, locale = null) {
  const resolvedLocale = resolveSolarLocale(locale);
  const t = (key, variables = {}) => solarT(resolvedLocale, key, variables);
  const module = modulePresets[state.modulePreset] || modulePresets.standard475;
  const panels = Math.max(0, Math.round(solarMetrics.placedPanels || 0));
  const systemKwp = Math.max(0, Number(solarMetrics.systemKwp) || 0);
  const batteryCapacity = state.batteryEnabled ? Math.max(0, Number(simulation?.batteryCapacity) || 0) : 0;

  const lines = [];
  addLine(lines, 'panels', t('estimate.line.panels', { module: solarModuleLabel(state.modulePreset, resolvedLocale) }), t('unit.pcs'), panels, module.panelPriceRon, `${module.powerW} W · ${module.lengthM.toFixed(3)} × ${module.widthM.toFixed(3)} m`);
  addLine(lines, 'mounting', t('estimate.line.mounting'), t('unit.panel'), panels, Math.max(0, Number(state.mountingPricePerPanelRon) || 0), t('estimate.note.mounting'));
  addLine(lines, 'inverter', t('estimate.line.inverter', { phase: t(state.gridConnection === 'three' ? 'estimate.phase.three' : 'estimate.phase.single'), power: Math.max(3, Math.ceil(systemKwp)) }), t('unit.pcs'), systemKwp > 0 ? 1 : 0, inverterPriceRon(systemKwp, state.gridConnection), t('estimate.note.inverter'));
  addLine(lines, 'installation', t('estimate.line.installation'), 'kWp', Number(systemKwp.toFixed(2)), Math.max(0, Number(state.installationPricePerKwpRon) || 0), t('estimate.note.installation'));
  addLine(lines, 'paperwork', t('estimate.line.paperwork'), t('unit.lot'), systemKwp > 0 ? 1 : 0, Math.max(0, Number(state.paperworkPriceRon) || 0));
  addLine(lines, 'battery', t('estimate.line.battery', { capacity: batteryCapacity.toFixed(0) }), 'kWh', batteryCapacity, Math.max(0, Number(state.batteryPricePerKWhRon) || 0), t('estimate.note.battery'));

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
    exchangeRateSource: state.currencyRateSource || 'reference',
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

export function estimateToCsv(estimate, locale = null) {
  const resolvedLocale = resolveSolarLocale(locale);
  const t = (key, variables = {}) => solarT(resolvedLocale, key, variables);
  const currency = estimate.currency || 'RON';
  const rows = [
    [t('csv.number'), t('csv.item'), t('csv.unit'), t('csv.quantity'), t('csv.unitPriceVat', { currency }), t('csv.valueVat', { currency })],
    ...estimate.lines.filter((line) => line.included !== false).map((line, index) => [
      index + 1,
      line.name,
      line.unit,
      line.quantity,
      line.unitPrice.toFixed(2),
      line.value.toFixed(2),
    ]),
    [],
    ['', t('csv.subtotal'), '', '', '', estimate.subtotal.toFixed(2)],
    ['', t('csv.vat', { rate: Math.round(estimate.vatRate * 100) }), '', '', '', estimate.vat.toFixed(2)],
    ['', t('csv.total'), '', '', '', estimate.total.toFixed(2)],
  ];

  return rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return `"${value.replaceAll('"', '""')}"`;
  }).join(',')).join('\n');
}
