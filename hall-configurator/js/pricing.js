import { deriveHallMetrics } from './state.js?v=5';

const structureRates = { light: 72, standard: 88, heavy: 108 };
const claddingRates = { trapezoidal: 34, sandwich: 59, 'standing-seam': 66 };
const climateRates = { none: 0, comfort: 38, chilled: 105, frozen: 178 };

export function estimateHallPrice(state, build) {
  const metrics = build?.metrics ?? deriveHallMetrics(state);
  const items = [];
  const add = (label, amount, note = '') => {
    if (amount <= 0) return;
    items.push({ label, amount, note });
  };

  add('Primary steel structure', metrics.footprint * (structureRates[state.structurePreset] ?? structureRates.standard), 'Portal frames and primary steel');
  if (state.secondaryStructure) add('Secondary structure', metrics.footprint * 24, 'Purlins, girts, bracing and connection steel');
  add('Wall and roof envelope', (metrics.netWallArea + metrics.roofArea) * (claddingRates[state.claddingProfile] ?? 49), state.claddingProfile);
  add('Foundations and floor', state.slab ? metrics.footprint * 67 : metrics.frameCount * 2 * 920, state.slab ? 'Slab, pads and pedestals' : 'Pads and pedestals');
  if (state.rollerDoor) add('Industrial roller shutter', state.rollerDoorWidth * state.rollerDoorHeight * 690, 'Framed motor-ready shutter');
  if (state.personnelDoor) add('Personnel door', 980);
  if (state.windows) add('Framed side windows', 4 * 520);
  add('Climate / refrigeration system', metrics.footprint * (climateRates[state.climateSystem] ?? 0), state.climateSystem);
  if (state.highBayLighting) add('High-bay LED lighting', metrics.highBayFixtureCount * 310, `${metrics.highBayFixtureCount} fixtures`);
  if (state.fireSprinklers) add('Fire sprinkler visual package', metrics.footprint * 24, `${metrics.sprinklerHeadCount} heads`);
  if (state.roofSkylights) add('Roof skylights', metrics.skylightCount * 790, `${metrics.skylightCount} modules`);
  if (state.gutters) add('Gutters and downpipes', (state.length * 2 + state.eaveHeight * 4) * 48);

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const engineeringAndInstall = subtotal * 0.12;
  const total = subtotal + engineeringAndInstall;
  return { items, subtotal, engineeringAndInstall, total, currency: 'EUR' };
}

export function formatPrice(amount, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
