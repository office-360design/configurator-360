import { loadingLayout } from './logistics.js?v=hall-production-1';
import { commercialLayout } from './commercial.js?v=hall-production-1';
import { deriveHallMetrics } from './state.js?v=hall-production-1';
import { normalizeOpenings, openingLabel } from './openings.js?v=hall-production-1';
import { hallT, hallValueLabel, resolveHallLocale } from './i18n.js?v=hall-production-1';

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
  add(hallT(locale, 'pricing.envelope'), (metrics.netWallArea + (metrics.netRoofArea ?? metrics.roofArea)) * (claddingRates[state.claddingProfile] ?? 49), hallValueLabel('claddingProfile', state.claddingProfile, locale));
  add(hallT(locale, 'pricing.foundations'), state.slab ? metrics.footprint * 67 : metrics.frameCount * 2 * 920, hallT(locale, state.slab ? 'pricing.foundationsSlab' : 'pricing.foundationsPads'));

  const openings = normalizeOpenings(state);
  const addOpenings = (type, key, unitPrice, areaBase, minimum) => {
    const matches = openings.filter((opening) => opening.type === type && !(type === 'window' && opening.subtype === 'shopfront') && !(type === 'garage' && opening.subtype === 'sectional'));
    matches.forEach((opening, index) => add(
      `${hallT(locale, key)}${matches.length > 1 ? ` ${index + 1}` : ''}`,
      unitPrice * Math.max(minimum, (opening.width * opening.height) / areaBase),
      `${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m`,
    ));
  };
  addOpenings('garage', 'pricing.garage', 690, 1, 0);
  addOpenings('personnel', 'pricing.personnel', 980, 2.1, .75);
  addOpenings('window', 'pricing.window', 520, 1.8 * 1.25, .45);
  openings.filter((o) => o.type === 'entrance' || o.type === 'window' && o.subtype === 'shopfront').forEach((opening, index) => {
    const area = opening.width * opening.height;
    const rate = opening.type === 'window' ? area * 360 : opening.subtype === 'double-glass'
      ? 1800 * area / 4.5 : 4200 * area / 10.62;
    add(`${openingLabel(opening, locale)} ${index + 1}`, rate, hallT(locale, 'commercial.estimateNote'));
  });
  openings.filter((o) => o.type === 'garage' && o.subtype === 'sectional').forEach((o, index) => add(
    `${hallT(locale, 'garage.sectional')} ${index + 1}`, o.width * o.height * 430 + 850, hallT(locale, 'loading.estimateNote'),
  ));
  const loading = loadingLayout(state);
  for (const [key, amount] of [['apron', loading.apronArea * 68], ['bollards', loading.bollardCount * 185],
    ['markings', loading.markingCount * 140], ['numbers', loading.numberCount * 75]]) add(hallT(locale, `loading.bom.${key}`), amount, hallT(locale, 'loading.estimateNote'));
  const retail = commercialLayout(state);
  for (const [key, amount] of [
    ['canopy', retail.canopyArea * 330], ['sign', retail.signArea ? retail.signArea * 180 + 220 : 0],
    ['apron', retail.apronArea * 68], ['displays', retail.displayCount * 680], ['checkout', retail.checkoutCount * 1450],
  ]) add(hallT(locale, `commercial.bom.${key}`), amount, hallT(locale, 'commercial.estimateNote'));
  // Provisional demo allowance only, not a supplier quotation or airflow sizing.
  openings.filter((opening) => opening.type === 'vent').forEach((opening, index) => add(
    `${hallT(locale, 'pricing.vent')} ${index + 1}`,
    240 * Math.max(.5, opening.width * opening.height), hallT(locale, 'pricing.ventNote'),
  ));

  add(hallT(locale, 'pricing.climate'), metrics.footprint * (climateRates[state.climateSystem] ?? 0), hallValueLabel('climateSystem', state.climateSystem, locale));
  if (state.highBayLighting) add(hallT(locale, state.lightingStyle === 'linear-retail' ? 'lighting.linearRetail' : 'pricing.lighting'), metrics.highBayFixtureCount * (state.lightingStyle === 'linear-retail' ? 340 : 310), hallT(locale, 'pricing.fixtures', { count: metrics.highBayFixtureCount }));
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
