import { CATALOG, type JsonObject, type ProductId, type Question } from './catalog.js';

export class ConfigurationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function asNumber(value: unknown, question: Question): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ConfigurationError(`${question.label} must be a number.`, question.id);
  if (question.min !== undefined && n < question.min) throw new ConfigurationError(`${question.label} must be at least ${question.min}${question.unit ? ` ${question.unit}` : ''}.`, question.id);
  if (question.max !== undefined && n > question.max) throw new ConfigurationError(`${question.label} must be at most ${question.max}${question.unit ? ` ${question.unit}` : ''}.`, question.id);
  return n;
}

function conditionIsActive(condition: string | undefined, values: JsonObject) {
  if (!condition) return true;
  return condition.split('&&').every(part => {
    const expression = part.trim();
    const negated = expression.match(/^!([A-Za-z0-9_]+)$/);
    if (negated) return !Boolean(values[negated[1]]);
    const bare = expression.match(/^([A-Za-z0-9_]+)$/);
    if (bare) return Boolean(values[bare[1]]);
    const comparison = expression.match(/^([A-Za-z0-9_]+)\s*(==|!=)\s*([A-Za-z0-9_-]+)$/);
    if (comparison) {
      const [, key, operator, expected] = comparison;
      return operator === '==' ? String(values[key]) === expected : String(values[key]) !== expected;
    }
    const included = expression.match(/^([A-Za-z0-9_]+)\s+in\s+\[([^\]]+)\]$/);
    if (included) return included[2].split(',').map(item => item.trim()).includes(String(values[included[1]]));
    return false;
  });
}

export function normalizeAnswers(product: ProductId, raw: JsonObject, { requireExplicit = false } = {}): { answers: JsonObject; assumptions: string[] } {
  const spec = CATALOG[product];
  const answers: JsonObject = {};
  const assumptions: string[] = [];
  for (const question of spec.questions) {
    const conditionValues = { ...Object.fromEntries(spec.questions.map(item => [item.id, item.default])), ...raw, ...answers };
    if (!conditionIsActive(question.when, conditionValues)) continue;
    let value = raw[question.id];
    if (value === undefined || value === null || value === '') {
      if (requireExplicit) throw new ConfigurationError(`Please ask the user to explicitly choose ${question.label} before creating a configuration.`, question.id);
      value = clone(question.default);
      assumptions.push(`${question.label}: ${Array.isArray(value) ? 'none' : String(value)}`);
    }
    if (question.type === 'number') value = asNumber(value, question);
    if (question.type === 'boolean') value = Boolean(value);
    if (question.type === 'choice' && !question.choices?.includes(String(value))) {
      throw new ConfigurationError(`${question.label} must be one of: ${question.choices?.join(', ')}.`, question.id);
    }
    if (question.type === 'array' && !Array.isArray(value)) throw new ConfigurationError(`${question.label} must be an array.`, question.id);
    answers[question.id] = value;
  }
  return { answers, assumptions };
}

function baseView() {
  return { showDimensions: true, technicalEdges: false, compassVisible: false, cameraPreset: '3d', northDirection: 0, nightPreview: false };
}

function fenceState(a: JsonObject): JsonObject {
  const validRuns = a.layout === 'straight' ? ['a'] : a.layout === 'l' ? ['a', 'b'] : a.layout === 'u' ? ['a', 'b', 'c'] : a.layout === 'closed5' ? ['a', 'b', 'c', 'd', 'e'] : ['a', 'b', 'c', 'd'];
  const gates = (a.gates as unknown[]).map((item, index) => {
    const gate = (item && typeof item === 'object' ? item : {}) as JsonObject;
    const runId = validRuns.includes(String(gate.runId ?? gate.run ?? 'a')) ? String(gate.runId ?? gate.run ?? 'a') : 'a';
    return {
      id: `chatgpt-gate-${index + 1}`,
      type: gate.type === 'driveway' ? 'driveway' : 'pedestrian',
      runId,
      position: Math.max(0, Math.floor(Number(gate.position ?? 0))),
      handing: gate.handing === 'left' ? 'left' : 'right',
    };
  });
  return { ...a, gates, ...baseView(), scenery: Boolean(a.scenery), sunPosition: 48, infillGap: a.infillGap };
}

function roofState(a: JsonObject): JsonObject {
  const minimumPitch = a.covering === 'roca' ? 14 : a.covering === 'teclado' ? 18 : 5;
  if (Number(a.pitch) < minimumPitch) throw new ConfigurationError(`The selected covering requires a pitch of at least ${minimumPitch} degrees.`, 'pitch');
  return { ...a, ...baseView(), showCompass: false, sunPosition: 42, units: 'metric', currency: 'RON', locale: 'en-US', currencyRate: 1, excludedBomItems: [], customPlan: null };
}

function hallState(a: JsonObject): JsonObject {
  return {
    ...a, ...baseView(), selectedHeaProfile: 'HEA 220', showCladding: a.claddingProfile !== 'none', showScenery: true,
    inspectionMode: 'all', sectionCutEnabled: false, sectionCutPosition: 50, connectionDetails: false,
    forkliftClearance: false, rackDensity: 'standard', serviceVisibility: 'all', serviceCoverage: false,
    sunPosition: 0.47, season: 'winter', explode: 0,
  };
}

function side(type: unknown) {
  const normalized = type === 'privacy' ? 'privacy-wall' : String(type);
  const allowed = ['none', 'screen', 'motorized-screen', 'glass', 'privacy-wall'];
  return { type: allowed.includes(normalized) ? normalized : 'none', screenSettings: { screen: { openness: 50, color: '#67757d' }, 'motorized-screen': { openness: 50, color: '#34444c' } }, privacyColor: '#26343c' };
}

type PergolaSegment = { id: string; boundary: string | null };

function pergolaGrid(width: number, depth: number) {
  const columns = Math.max(2, Math.ceil(width / 5000) + 1);
  const rows = Math.max(2, Math.ceil(depth / 5000) + 1);
  const cells = Array.from({ length: (rows - 1) * (columns - 1) }, (_, index) => ({
    id: `roof-r${Math.floor(index / (columns - 1))}-c${index % (columns - 1)}`,
    width: (width - 150) / (columns - 1), depth: (depth - 150) / (rows - 1),
  }));
  const segments: PergolaSegment[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns - 1; column += 1) {
    segments.push({ id: `h-r${row}-c${column}`, boundary: row === 0 ? 'front' : row === rows - 1 ? 'back' : null });
  }
  for (let row = 0; row < rows - 1; row += 1) for (let column = 0; column < columns; column += 1) {
    segments.push({ id: `v-r${row}-c${column}`, boundary: column === 0 ? 'left' : column === columns - 1 ? 'right' : null });
  }
  return { columns, rows, cells, segments };
}

function spotlightCapacity(length: number, maximum: number) {
  return Math.max(1, Math.min(maximum, Math.floor(Math.max(0, length - 840) / 900) + 1));
}

function distributePergolaAccessories(width: number, depth: number, installation: unknown, mountedSide: unknown, spotlightCount: number, heaterCount: number) {
  const grid = pergolaGrid(width, depth);
  const spotlights: Record<string, number> = {};
  let remainingLights = Math.round(spotlightCount);
  for (const cell of grid.cells) {
    const capacity = Math.min(12, spotlightCapacity(cell.width, 4) * spotlightCapacity(cell.depth, 3));
    const count = Math.min(capacity, remainingLights);
    if (count > 0) spotlights[cell.id] = count;
    remainingLights -= count;
  }
  if (remainingLights > 0) throw new ConfigurationError(`This pergola geometry supports ${spotlightCount - remainingLights} spotlights, not ${spotlightCount}.`, 'spotlightCount');

  const availableSegments = grid.segments.filter(segment => installation !== 'wall-mounted' || segment.boundary !== mountedSide);
  const heaters: Record<string, { first: boolean; second: boolean }> = {};
  let remainingHeaters = Math.round(heaterCount);
  for (const segment of availableSegments) {
    if (remainingHeaters <= 0) break;
    heaters[segment.id] = { first: true, second: remainingHeaters > 1 };
    remainingHeaters -= Math.min(2, remainingHeaters);
  }
  if (remainingHeaters > 0) throw new ConfigurationError(`This pergola geometry supports ${heaterCount - remainingHeaters} heaters, not ${heaterCount}.`, 'heaterCount');

  const availableCorners = [
    { legacy: 'frontLeft', pole: 'r0c0', boundary: ['front', 'left'], face: 'front' },
    { legacy: 'frontRight', pole: `r0c${grid.columns - 1}`, boundary: ['front', 'right'], face: 'front' },
    { legacy: 'backLeft', pole: `r${grid.rows - 1}c0`, boundary: ['back', 'left'], face: 'back' },
    { legacy: 'backRight', pole: `r${grid.rows - 1}c${grid.columns - 1}`, boundary: ['back', 'right'], face: 'back' },
  ].filter(corner => installation !== 'wall-mounted' || !corner.boundary.includes(String(mountedSide)));
  return { grid, spotlights, heaters, availableCorners };
}

function pergolaState(a: JsonObject): JsonObject {
  const selectedSides: Record<string, unknown> = { front: 'none', back: 'none', left: 'none', right: 'none' };
  for (const entry of a.sides as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as JsonObject;
    if (['front', 'back', 'left', 'right'].includes(String(item.side))) selectedSides[String(item.side)] = item.type;
  }
  const width = Number(a.widthMm); const depth = Number(a.depthMm);
  const distributed = distributePergolaAccessories(width, depth, a.installation, a.mountedSide, Number(a.spotlightCount), Number(a.heaterCount));
  const rainPole = a.rainSensor ? distributed.availableCorners[0]?.pole ?? null : null;
  const windPole = a.windSensor ? distributed.availableCorners.find(corner => corner.pole !== rainPole)?.pole ?? null : null;
  const speakerCorner = a.speaker ? distributed.availableCorners[0] : undefined;
  const outletCorner = a.outlet ? distributed.availableCorners.find(corner => corner.pole !== speakerCorner?.pole) ?? distributed.availableCorners[0] : undefined;
  const legacySpeakers = speakerCorner ? { [speakerCorner.legacy]: true } : {};
  const legacyOutlets = outletCorner ? { [outletCorner.legacy]: { [outletCorner.face]: true } } : {};
  return {
    step: 0, model: a.model, installation: a.installation, mountedSide: a.mountedSide,
    locale: 'en-US', units: 'metric', currency: 'EUR', quality: 'balanced', defaultArPlatform: 'android', darkMode: false,
    dimensions: { width, depth, height: a.heightMm },
    roof: { orientation: a.roofOrientation, frameColor: a.frameColor, louverColor: a.louverColor, louverTilt: a.louverTilt, drainage: a.drainage },
    automation: a.automation,
    services: { transportation: a.transportation, assembly: a.assembly, warranty: a.warranty },
    sides: Object.fromEntries(Object.entries(selectedSides).map(([key, value]) => [key, side(value)])),
    accessories: {
      perimeterLed: { enabled: a.perimeterLed, color: '#fff1b4' }, spotlights: distributed.spotlights, heaters: distributed.heaters,
      sensors: { rain: { enabled: Boolean(rainPole), pole: rainPole }, wind: { enabled: Boolean(windPole), pole: windPole } },
      speakers: legacySpeakers, outlets: legacyOutlets,
    },
    environment: { sunPosition: 0.35, northDirection: 0, night: false, season: 'winter' },
    view: { dimensionsVisible: true, cameraPreset: 'perspective', compassVisible: false }, customer: { name: '', email: '', phone: '', postcode: '', notes: '' },
  };
}

function solarState(a: JsonObject): JsonObject {
  return {
    roofType: a.roofType, length: a.length, depth: a.depth, wallHeight: 3, pitch: a.pitch, overhang: 0.45, roofColor: '#6b7280', covering: 'generic',
    modulePreset: a.modulePreset, panelCount: a.panelCount, panelColumns: a.panelColumns, moduleOrientation: a.moduleOrientation, roofSide: a.roofSide,
    panelGap: 0.04, panelMargin: 0.32, effectivePanelCount: a.panelCount,
    region: a.region, locationMode: a.locationMode, locationLat: a.locationMode === 'exact' ? a.locationLat : null,
    locationLon: a.locationMode === 'exact' ? a.locationLon : null, locationLabel: a.locationMode === 'exact' ? a.locationLabel : '',
    locationTimeZone: 'Europe/Bucharest', monthlyBillRon: a.monthlyBillRon, energyTariffRon: a.energyTariffRon, gridConnection: a.gridConnection,
    consumptionProfile: a.consumptionProfile, batteryEnabled: a.batteryEnabled, batteryAutoSize: a.batteryAutoSize,
    batteryCapacityKWh: a.batteryCapacityKWh, batteryReservePct: 10, batteryRoundTripEfficiency: 0.92,
    installationPricePerKwpRon: a.installationPricePerKwpRon, mountingPricePerPanelRon: a.mountingPricePerPanelRon,
    paperworkPriceRon: a.paperworkPriceRon, batteryPricePerKWhRon: a.batteryPricePerKWhRon, vatRate: Number(a.vatRatePct) / 100,
    showDimensions: false, technicalEdges: false, showCompass: true, showSunPath: true, sunPosition: 50, northDirection: 0, nightPreview: false,
    units: 'metric', currency: 'RON', currencyRate: 1, excludedEstimateItems: [],
  };
}

function windowState(a: JsonObject): JsonObject {
  const finish = (type: unknown, color: unknown) => ({ type, presetId: type === 'coated' ? 'custom' : String(type), color });
  return {
    widthM: a.widthM, heightM: a.heightM, layoutId: a.layoutId, windowLayout: a.layoutId,
    profile: a.profileSetId, profileSetId: a.profileSetId, cadAssemblyId: a.profileSetId, cadAssembly: a.profileSetId,
    outerFrameProfileId: a.outerFrameProfileId, sashProfileId: a.sashProfileId, dividerProfileId: '575800', transProfileId: '575820',
    glassThicknessMm: a.glassThicknessMm, glazingBeadCode: '573940', glassAnchorGasket: '224063', movingGlassSideGasket: '224378',
    openingMode: a.openingMode, openAngle: a.openAngle, handleSide: a.handleSide,
    finishMode: a.finishMode, colour: a.outsideColor,
    outsideFinish: finish(a.outsideFinishType, a.outsideColor),
    insideFinish: a.finishMode === 'same' ? finish(a.outsideFinishType, a.outsideColor) : finish(a.insideFinishType, a.insideColor),
    accessoryPreset: a.accessoryPreset, accessories: {}, exploded: false, showHouse: a.showHouse,
    frameSides: { top: true, bottom: true, left: true, right: true }, sectionView: false, debugColors: false,
  };
}

export function buildState(product: ProductId, raw: JsonObject, options?: { requireExplicit?: boolean }) {
  const { answers, assumptions } = normalizeAnswers(product, raw, options);
  const state = product === 'fence' ? fenceState(answers)
    : product === 'roof' ? roofState(answers)
      : product === 'hall' ? hallState(answers)
        : product === 'pergola' ? pergolaState(answers)
          : product === 'solar' ? solarState(answers)
            : windowState(answers);
  return { state, answers, assumptions, warnings: [] as string[] };
}

export function summarize(product: ProductId, state: JsonObject): JsonObject {
  if (product === 'fence') return { layout: state.layout, heightM: state.height, panelStyle: state.panelStyle, gateCount: Array.isArray(state.gates) ? state.gates.length : 0 };
  if (product === 'roof') return { roofType: state.roofType, footprintM2: Number(state.length) * Number(state.depth), pitchDeg: state.pitch, covering: state.covering };
  if (product === 'hall') return { dimensionsM: `${state.length} × ${state.width} × ${state.eaveHeight}`, footprintM2: Number(state.length) * Number(state.width), structure: state.structurePreset };
  if (product === 'pergola') { const d = state.dimensions as JsonObject; return { dimensionsMm: `${d.width} × ${d.depth} × ${d.height}`, installation: state.installation, automation: state.automation }; }
  if (product === 'solar') return { panelCount: state.panelCount, nominalPowerKwp: Number(state.panelCount) * ({ standard475: 0.475, compact450: 0.45, premium490: 0.49 }[String(state.modulePreset)] ?? 0), battery: state.batteryEnabled ? `${state.batteryCapacityKWh} kWh` : 'none' };
  return { dimensionsM: `${state.widthM} × ${state.heightM}`, layout: state.layoutId, openingMode: state.openingMode, profile: state.profileSetId };
}

export function mergeRevision(product: ProductId, previousAnswers: JsonObject, changes: JsonObject) {
  return buildState(product, { ...previousAnswers, ...changes }, { requireExplicit: true });
}

export function answersFromState(product: ProductId, state: JsonObject): JsonObject {
  const answers: JsonObject = {};
  for (const question of CATALOG[product].questions) {
    if (state[question.id] !== undefined) answers[question.id] = state[question.id];
  }
  if (product === 'pergola') {
    const dimensions = (state.dimensions || {}) as JsonObject;
    const roof = (state.roof || {}) as JsonObject;
    const services = (state.services || {}) as JsonObject;
    Object.assign(answers, {
      widthMm: dimensions.width, depthMm: dimensions.depth, heightMm: dimensions.height,
      roofOrientation: roof.orientation, louverTilt: roof.louverTilt, frameColor: roof.frameColor,
      louverColor: roof.louverColor, drainage: roof.drainage,
      transportation: services.transportation, assembly: services.assembly, warranty: services.warranty,
    });
  }
  if (product === 'window') {
    const outside = (state.outsideFinish || {}) as JsonObject;
    const inside = (state.insideFinish || {}) as JsonObject;
    Object.assign(answers, {
      layoutId: state.layoutId || state.windowLayout, outsideFinishType: outside.type,
      outsideColor: outside.color || state.colour, insideFinishType: inside.type, insideColor: inside.color,
    });
  }
  if (product === 'solar') answers.vatRatePct = Number(state.vatRate ?? 0.21) * 100;
  return answers;
}
