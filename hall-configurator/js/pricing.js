import { deriveHallMetrics } from './state.js?v=12';
import { normalizeOpenings } from './openings.js?v=13';
import { hallT, hallValueLabel, resolveHallLocale } from './i18n.js?v=1';

const structureRates = { light: 72, standard: 88, heavy: 108 };
const claddingRates = { trapezoidal: 34, sandwich: 59, 'standing-seam': 66 };
const climateRates = { none: 0, comfort: 38, chilled: 105, frozen: 178 };

export function estimateHallPrice(state, build, locale = resolveHallLocale()) {
  const metrics = build?.metrics ?? deriveHallMetrics(state);
  const items = [];
  const add = (label, amount, note = '') => {
    if (amount <= 0) return;
    items.push({ label, amount, note });
  };

  add(hallT(locale, 'pricing.primary'), metrics.footprint * (structureRates[state.structurePreset] ?? structureRates.standard), hallT(locale, 'pricing.primaryNote'));
  if (state.secondaryStructure) add(hallT(locale, 'pricing.secondary'), metrics.footprint * 24, hallT(locale, 'pricing.secondaryNote'));
  add(hallT(locale, 'pricing.envelope'), (metrics.netWallArea + metrics.roofArea) * (claddingRates[state.claddingProfile] ?? 49), hallValueLabel('claddingProfile', state.claddingProfile, locale));
  add(hallT(locale, 'pricing.foundations'), state.slab ? metrics.footprint * 67 : metrics.frameCount * 2 * 920, hallT(locale, state.slab ? 'pricing.foundationsSlab' : 'pricing.foundationsPads'));

  const openings = normalizeOpenings(state);
  const addOpenings = (type, key, unitPrice, areaBase, minimum) => {
    const matches = openings.filter((opening) => opening.type === type);
    matches.forEach((opening, index) => add(
      `${hallT(locale, key)}${matches.length > 1 ? ` ${index + 1}` : ''}`,
      unitPrice * Math.max(minimum, (opening.width * opening.height) / areaBase),
      `${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m`,
    ));
  };
  addOpenings('garage', 'pricing.garage', 690, 1, 0);
  addOpenings('personnel', 'pricing.personnel', 980, 2.1, .75);
  addOpenings('window', 'pricing.window', 520, 1.8 * 1.25, .45);

  add(hallT(locale, 'pricing.climate'), metrics.footprint * (climateRates[state.climateSystem] ?? 0), hallValueLabel('climateSystem', state.climateSystem, locale));
  if (state.highBayLighting) add(hallT(locale, 'pricing.lighting'), metrics.highBayFixtureCount * 310, hallT(locale, 'pricing.fixtures', { count: metrics.highBayFixtureCount }));
  if (state.fireSprinklers) add(hallT(locale, 'pricing.sprinklers'), metrics.footprint * 24, hallT(locale, 'pricing.heads', { count: metrics.sprinklerHeadCount }));
  if (state.roofSkylights) add(hallT(locale, 'pricing.skylights'), metrics.skylightCount * 790, hallT(locale, 'pricing.modules', { count: metrics.skylightCount }));
  if (state.gutters) add(hallT(locale, 'pricing.gutters'), (state.length * 2 + state.eaveHeight * 4) * 48);

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const engineeringAndInstall = subtotal * 0.12;
  const total = subtotal + engineeringAndInstall;
  return { items, subtotal, engineeringAndInstall, total, currency: 'EUR' };
}

export function formatPrice(amount, currency = 'EUR', locale = resolveHallLocale()) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
