import { FINISHES, PANEL_STYLES, deriveFenceMetrics } from './state.js?v=2';
import { fenceT } from './i18n.js?v=2';

const FX = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });

export function currencyRate(currency = 'EUR') {
  return FX[currency] ?? 1;
}

export function formatMoney(valueEur, currency = 'EUR', locale = 'en-US') {
  const rate = currencyRate(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: FX[currency] ? currency : 'EUR',
    maximumFractionDigits: 0,
  }).format(valueEur * rate);
}

export function buildFenceBom(state, { locale = 'en-US' } = {}) {
  const metrics = deriveFenceMetrics(state);
  const style = PANEL_STYLES[state.panelStyle] ?? PANEL_STYLES.vertical;
  const finish = FINISHES[state.finish] ?? FINISHES.anthracite;
  const gateBayCount = metrics.gate?.span ?? 0;
  const panelBayCount = Math.max(0, metrics.bayCount - gateBayCount);
  const panelArea = metrics.area - (metrics.gate ? metrics.gate.width * state.height : 0);

  const postUnit = 66 * finish.multiplier;
  const panelUnit = style.pricePerM2 * finish.multiplier;
  const footingUnit = state.foundation === 'baseplate' ? 48 : 34;
  const gateUnit = metrics.gate?.type === 'driveway' ? 1180 : metrics.gate?.type === 'pedestrian' ? 520 : 0;
  const hardwareUnit = 13.5;

  const items = [
    item('posts', fenceT(locale, 'bom.item.posts'), metrics.postCount, 'pcs', postUnit),
    item('panels', fenceT(locale, `bom.item.panel.${state.panelStyle}`), round(panelArea, 2), 'm²', panelUnit),
    item('foundations', fenceT(locale, state.foundation === 'baseplate' ? 'bom.item.foundation.baseplate' : 'bom.item.foundation.concrete'), metrics.postCount, 'pcs', footingUnit),
    item('hardware', fenceT(locale, 'bom.item.hardware'), panelBayCount, 'sets', hardwareUnit),
  ];

  if (metrics.gate) {
    items.push(item(
      'gate',
      fenceT(locale, metrics.gate.type === 'driveway' ? 'bom.item.gate.driveway' : 'bom.item.gate.pedestrian'),
      1,
      'set',
      gateUnit * finish.multiplier,
    ));
  }

  if (state.panelStyle === 'vertical' || state.panelStyle === 'horizontal') {
    const slatPitch = state.panelStyle === 'vertical' ? 0.115 : 0.145;
    const slatCount = state.panelStyle === 'vertical'
      ? Math.max(0, Math.round((metrics.totalLength - (metrics.gate?.width ?? 0)) / slatPitch))
      : Math.max(0, Math.round(state.height / slatPitch) * panelBayCount);
    items.push(item('slats', fenceT(locale, 'bom.item.slats'), slatCount, 'pcs', 0));
  }

  const materialTotal = items.reduce((sum, entry) => sum + entry.totalEur, 0);
  const installation = materialTotal * 0.16;
  const engineering = 95 + metrics.runs.length * 28;
  const totalEur = materialTotal + installation + engineering;

  return {
    items,
    materialTotal,
    installation,
    engineering,
    totalEur,
    metrics,
  };
}

export function fenceBomCsv(state, { currency = 'EUR', locale = 'en-US' } = {}) {
  const bom = buildFenceBom(state, { locale });
  const rate = currencyRate(currency);
  const rows = [
    ['Item', 'Quantity', 'Unit', `Unit price (${currency})`, `Total (${currency})`],
    ...bom.items.map((entry) => [
      entry.label,
      entry.quantity,
      entry.unit,
      round(entry.unitPriceEur * rate, 2),
      round(entry.totalEur * rate, 2),
    ]),
    [],
    ['Material subtotal', '', '', '', round(bom.materialTotal * rate, 2)],
    ['Installation allowance', '', '', '', round(bom.installation * rate, 2)],
    ['Engineering allowance', '', '', '', round(bom.engineering * rate, 2)],
    ['Indicative total', '', '', '', round(bom.totalEur * rate, 2)],
    [],
    ['Generated', new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date())],
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function item(id, label, quantity, unit, unitPriceEur) {
  return {
    id,
    label,
    quantity,
    unit,
    unitPriceEur,
    totalEur: quantity * unitPriceEur,
  };
}

function csvCell(value = '') {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
