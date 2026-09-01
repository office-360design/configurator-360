import type { JsonObject, ProductId } from './catalog.js';

const n = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function hall(state: JsonObject) {
  const length = n(state.length); const width = n(state.width); const eave = n(state.eaveHeight); const pitch = n(state.pitch);
  const footprint = length * width; const bays = Math.max(1, Math.ceil(length / n(state.targetBaySpacing, 6))); const frames = bays + 1;
  const rise = Math.tan(pitch * Math.PI / 180) * width / 2; const roofArea = 2 * (width / 2 / Math.cos(pitch * Math.PI / 180)) * length;
  const grossWallArea = 2 * length * eave + 2 * width * eave + width * rise;
  const openings = state.openings as Array<JsonObject>; const openingArea = openings.reduce((sum, item) => sum + n(item.width) * n(item.height), 0);
  const netWallArea = Math.max(0, grossWallArea - openingArea);
  const fixtures = state.highBayLighting ? Math.max(2, Math.ceil(footprint / 55)) : 0;
  const sprinklers = state.fireSprinklers ? Math.max(4, Math.ceil(footprint / 18)) : 0;
  const skylights = state.roofSkylights ? Math.max(2, Math.ceil(length / 8) * 2) : 0;
  const refrigerationUnits = state.climateSystem === 'frozen' ? Math.max(1, Math.ceil(footprint / 170)) : state.climateSystem === 'chilled' ? Math.max(1, Math.ceil(footprint / 240)) : 0;
  const structureRates: Record<string, number> = { light: 72, standard: 88, heavy: 108 }; const claddingRates: Record<string, number> = { trapezoidal: 34, sandwich: 59, 'standing-seam': 66 }; const climateRates: Record<string, number> = { none: 0, comfort: 38, chilled: 105, frozen: 178 };
  let subtotal = footprint * (structureRates[String(state.structurePreset)] || 88) + (state.secondaryStructure ? footprint * 24 : 0) + (netWallArea + roofArea) * (claddingRates[String(state.claddingProfile)] ?? 49) + (state.slab ? footprint * 67 : frames * 2 * 920);
  for (const opening of openings) { const area = n(opening.width) * n(opening.height); subtotal += opening.type === 'garage' ? 690 * area : opening.type === 'personnel' ? 980 * Math.max(0.75, area / 2.1) : 520 * Math.max(0.45, area / 2.25); }
  subtotal += footprint * (climateRates[String(state.climateSystem)] || 0) + fixtures * 310 + (state.fireSprinklers ? footprint * 24 : 0) + skylights * 790 + (state.gutters ? (length * 2 + eave * 4) * 48 : 0);
  return { footprintM2: round(footprint), bayCount: bays, actualBaySpacingM: round(length / bays, 2), frameCount: frames, ridgeHeightM: round(eave + rise, 2), roofAreaM2: round(roofArea), grossWallAreaM2: round(grossWallArea), openingAreaM2: round(openingArea), netWallAreaM2: round(netWallArea), openingCount: openings.length, highBayFixtureCount: fixtures, sprinklerHeadCount: sprinklers, skylightCount: skylights, refrigerationUnitCount: refrigerationUnits, bomSummary: { portalFrames: frames, roofEnvelopeM2: round(roofArea), netWallEnvelopeM2: round(netWallArea), concreteSlabM2: state.slab ? round(footprint) : 0, openings: openings.map(item => ({ type: item.type, side: item.side, widthM: item.width, heightM: item.height })), highBayFixtures: fixtures, sprinklerHeads: sprinklers, skylightModules: skylights, refrigerationUnits }, indicativeSubtotalEur: Math.round(subtotal), engineeringAndInstallationEur: Math.round(subtotal * 0.12), indicativeTotalEur: Math.round(subtotal * 1.12), caveat: 'Indicative concept estimate only; structural engineering, foundations, fire design and local code verification are required.' };
}

function windowAnalysis(state: JsonObject) {
  const width = n(state.widthM); const height = n(state.heightM); const layout = String(state.layoutId);
  const panes = ['vertical-fixed-fixed-fixed', 'horizontal-fixed-fixed-fixed', 'top-fixed-bottom-sash-sash'].includes(layout) ? 3 : layout === 'single' ? 1 : 2;
  const sashCounts: Record<string, number> = { single: 1, 'vertical-divider': 1, 'vertical-fixed-fixed': 0, 'vertical-fixed-fixed-fixed': 0, 'vertical-sash-sash': 2, 'horizontal-divider': 1, 'horizontal-fixed-fixed': 0, 'horizontal-fixed-fixed-fixed': 0, 'top-fixed-bottom-sash-sash': 2 };
  const openingSashes = sashCounts[layout] ?? 0;
  const framePerimeter = 2 * (width + height); const dividerLength = panes > 1 ? (panes - 1) * height : 0; const sashPerimeter = openingSashes * 2 * (width / panes + height);
  const aluminiumKg = framePerimeter * 1.105 + dividerLength * 1.475 + sashPerimeter * 1.007;
  const glassArea = Math.max(0, (width - 0.114) * (height - 0.114) - dividerLength * 0.088);
  const accessory = state.accessoryPreset === 'b2-8' ? 160 : 120;
  const material = aluminiumKg * 8 + glassArea * 80 + accessory;
  return { overallAreaM2: round(width * height, 2), paneCount: panes, openingSashCount: openingSashes, estimatedProfileLengthM: round(framePerimeter + dividerLength + sashPerimeter, 2), estimatedAluminiumWeightKg: round(aluminiumKg, 2), estimatedGlassAreaM2: round(glassArea, 2), bomSummary: { outerFrameProfile: state.outerFrameProfileId, outerFrameLengthM: round(framePerimeter, 2), sashProfile: state.sashProfileId, sashLengthM: round(sashPerimeter, 2), dividerProfile: '575800', dividerLengthM: round(dividerLength, 2), glassThicknessMm: state.glassThicknessMm, glassAreaM2: round(glassArea, 2), accessoryPreset: state.accessoryPreset }, indicativeNetMaterialEur: Math.round(material), caveat: 'Chat estimate uses the configured overall topology. Open the full CAD configurator for fabrication cuts, exact gaskets/accessories and authoritative material totals; labour, VAT, delivery and installation are excluded.' };
}

function roof(state: JsonObject) {
  const length = n(state.length); const depth = n(state.depth); const pitch = n(state.pitch) * Math.PI / 180; const overhang = n(state.overhang);
  const slope = (depth / 2 + overhang) / Math.cos(pitch); const roofArea = state.roofType === 'shed' ? (length + 2 * overhang) * ((depth + 2 * overhang) / Math.cos(pitch)) : 2 * (length + 2 * overhang) * slope;
  const ridge = state.roofType === 'shed' ? length + 2 * overhang : state.roofType === 'hip' ? Math.max(0, length - depth) : length + 2 * overhang;
  return { footprintM2: round(length * depth), roofAreaM2: round(roofArea), approximateRidgeM: round(ridge), eavesM: round(2 * (length + 2 * overhang)), pitchDeg: n(state.pitch), covering: state.covering, caveat: 'Concept quantities only; complex L-shaped/dormer valleys and final flashing/waste must be checked in the full BOM.' };
}

function pergola(state: JsonObject) {
  const d = state.dimensions as JsonObject; const width = n(d.width) / 1000; const depth = n(d.depth) / 1000; const accessories = state.accessories as JsonObject;
  const spots = Object.values((accessories.spotlights || {}) as Record<string, number>).reduce((sum, value) => sum + n(value), 0);
  const heaters = Object.values((accessories.heaters || {}) as Record<string, JsonObject>).reduce((sum, value) => sum + Number(value.first) + Number(value.second), 0);
  const base = width * depth * 520; const total = base + (state.installation === 'wall-mounted' ? 420 : 680) + (spots * 85) + (heaters * 620) + (((accessories.perimeterLed as JsonObject)?.enabled) ? 590 : 0);
  return { footprintM2: round(width * depth), spotlightCount: spots, heaterCount: heaters, indicativeTotalEur: Math.round(total), caveat: 'Indicative product estimate; side systems, services and site-specific installation can change the final quotation.' };
}

function fence(state: JsonObject) {
  const runKeys = ['runA', 'runB', 'runC', 'runD', 'runE']; const layoutCounts: Record<string, number> = { straight: 1, l: 2, u: 3, closed: 4, closed5: 5 }; const count = layoutCounts[String(state.layout)] || 1;
  const length = runKeys.slice(0, count).reduce((sum, key) => sum + n(state[key]), 0); const bays = Math.max(count, Math.ceil(length / n(state.targetBayWidth, 2)));
  return { totalRunLengthM: round(length, 2), approximateBayCount: bays, postCount: bays + (String(state.layout).startsWith('closed') ? 0 : 1), gateCount: Array.isArray(state.gates) ? state.gates.length : 0, caveat: 'Bay count is an initial distribution; the full configurator resolves each run and gate position.' };
}

export function analyzeProduct(product: ProductId, state: JsonObject): JsonObject {
  if (product === 'hall') return hall(state);
  if (product === 'window') return windowAnalysis(state);
  if (product === 'roof') return roof(state);
  if (product === 'pergola') return pergola(state);
  if (product === 'fence') return fence(state);
  return {};
}
