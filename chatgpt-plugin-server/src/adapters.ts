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
      if (question.default === undefined && !question.required) continue;
      if (requireExplicit && question.required) throw new ConfigurationError(`Please ask the user to explicitly choose ${question.label} before creating a configuration.`, question.id);
      value = clone(question.default);
      const isPendingExactLocation = product === 'solar'
        && raw.locationMode === 'exact'
        && ['locationLat', 'locationLon', 'locationLabel'].includes(question.id);
      if (question.required && !isPendingExactLocation) assumptions.push(`${question.label}: ${Array.isArray(value) ? 'none' : String(value)}`);
    }
    if (question.type === 'number') value = asNumber(value, question);
    if (question.type === 'boolean') value = Boolean(value);
    if (question.type === 'choice' && !question.choices?.includes(String(value))) {
      throw new ConfigurationError(`${question.label} must be one of: ${question.choices?.join(', ')}.`, question.id);
    }
    if (question.type === 'array' && !Array.isArray(value)) throw new ConfigurationError(`${question.label} must be an array.`, question.id);
    answers[question.id] = value;
  }
  if (product === 'solar' && raw.locationMode === 'exact'
    && ['locationLat', 'locationLon', 'locationLabel'].some(id => raw[id] === undefined || raw[id] === null || raw[id] === '')) {
    assumptions.push('Exact location: awaiting a confirmed address-search result');
  }
  if (product === 'solar' && requireExplicit && raw.locationMode === 'exact'
    && ['locationLat', 'locationLon', 'locationLabel'].some(id => raw[id] === undefined || raw[id] === null || raw[id] === '')) {
    throw new ConfigurationError('Search the customer’s address and use the confirmed search result before exact-site Solar analysis or creation.', 'locationLabel');
  }
  return { answers, assumptions };
}

export function pendingQuestions(product: ProductId, raw: JsonObject, limit = 3): Question[] {
  const normalized = normalizeAnswers(product, raw);
  return CATALOG[product].questions.filter(question => (
    question.required
    && !question.suppliedByTool
    &&
    normalized.answers[question.id] !== undefined
    && (raw[question.id] === undefined || raw[question.id] === null || raw[question.id] === '')
  )).slice(0, limit);
}

function baseView() {
  return { showDimensions: true, technicalEdges: false, compassVisible: false, cameraPreset: '3d', northDirection: 0, nightPreview: false };
}

function fenceState(a: JsonObject): JsonObject {
  const validRuns = a.layout === 'straight' ? ['a'] : a.layout === 'l' ? ['a', 'b'] : a.layout === 'u' ? ['a', 'b', 'c'] : a.layout === 'closed5' ? ['a', 'b', 'c', 'd', 'e'] : ['a', 'b', 'c', 'd'];
  const gates = (a.gates as unknown[]).map((item, index) => {
    const gate = (item && typeof item === 'object' ? item : {}) as JsonObject;
    const requestedRun = String(gate.runId ?? gate.run ?? '');
    if (!validRuns.includes(requestedRun)) throw new ConfigurationError(`Gate ${index + 1} run must be one of: ${validRuns.join(', ')}.`, 'gates');
    if (!['pedestrian', 'driveway'].includes(String(gate.type))) throw new ConfigurationError(`Gate ${index + 1} type must be pedestrian or driveway.`, 'gates');
    if (!['left', 'right'].includes(String(gate.handing))) throw new ConfigurationError(`Gate ${index + 1} handing must be left or right.`, 'gates');
    const position = Number(gate.position);
    if (!Number.isInteger(position) || position < 0) throw new ConfigurationError(`Gate ${index + 1} position must be a zero-based bay number.`, 'gates');
    return {
      id: `chatgpt-gate-${index + 1}`,
      type: gate.type,
      runId: requestedRun,
      position,
      handing: gate.handing,
    };
  });
  return { ...a, gates, ...baseView(), scenery: Boolean(a.scenery), sunPosition: 48, infillGap: a.infillGap };
}

function roofState(a: JsonObject): JsonObject {
  const minimumPitch = a.covering === 'roca' ? 14 : a.covering === 'teclado' ? 18 : 5;
  if (Number(a.pitch) < minimumPitch) throw new ConfigurationError(`The selected covering requires a pitch of at least ${minimumPitch} degrees.`, 'pitch');
  return { ...a, ...baseView(), showCompass: false, sunPosition: a.sunPosition, northDirection: a.northDirection, nightPreview: Boolean(a.nightPreview), technicalEdges: Boolean(a.technicalEdges), units: 'metric', currency: 'RON', locale: 'en-US', currencyRate: 1, excludedBomItems: [], customPlan: null };
}

function hallState(a: JsonObject): JsonObject {
  const limits = {
    personnel: { minWidth: 0.7, maxWidth: 2.4, minHeight: 1.8, maxHeight: 3.2 },
    garage: { minWidth: 2.2, maxWidth: 10, minHeight: 2.2, maxHeight: 7 },
    window: { minWidth: 0.5, maxWidth: 5, minHeight: 0.5, maxHeight: 3.5 },
  } as const;
  const openings = (a.openings as unknown[]).map((item, index) => {
    const opening = (item && typeof item === 'object' ? item : {}) as JsonObject;
    const type = String(opening.type) as keyof typeof limits;
    if (!limits[type]) throw new ConfigurationError(`Opening ${index + 1} type must be garage, personnel, or window.`, 'openings');
    const side = String(opening.side);
    if (!['front', 'right', 'back', 'left'].includes(side)) throw new ConfigurationError(`Opening ${index + 1} side must be front, right, back, or left.`, 'openings');
    const width = Number(opening.width); const height = Number(opening.height);
    if (!Number.isFinite(width) || width < limits[type].minWidth || width > limits[type].maxWidth) throw new ConfigurationError(`Opening ${index + 1} width must be ${limits[type].minWidth}–${limits[type].maxWidth} m.`, 'openings');
    if (!Number.isFinite(height) || height < limits[type].minHeight || height > limits[type].maxHeight || height > Number(a.eaveHeight) - 0.12) throw new ConfigurationError(`Opening ${index + 1} height does not fit the selected opening type and eave height.`, 'openings');
    const span = side === 'front' || side === 'back' ? Number(a.width) : Number(a.length);
    const offset = Number(opening.offset ?? 0); const bottom = Number(opening.bottom ?? (type === 'window' ? 2.15 : 0));
    if (Math.abs(offset) + width / 2 > span / 2 - 0.06) throw new ConfigurationError(`Opening ${index + 1} does not fit on the ${side} wall at offset ${offset} m.`, 'openings');
    if (bottom < 0 || bottom + height > Number(a.eaveHeight) - 0.06) throw new ConfigurationError(`Opening ${index + 1} vertical position does not fit below the eave.`, 'openings');
    return { id: String(opening.id || `chatgpt-opening-${index + 1}`), type, side, width, height, offset, bottom, color: String(opening.color || (type === 'garage' ? '#24445a' : type === 'window' ? '#8ec6df' : '#e5ebee')) };
  });
  for (let i = 0; i < openings.length; i += 1) for (let j = i + 1; j < openings.length; j += 1) {
    const x = openings[i]; const y = openings[j];
    if (x.side !== y.side) continue;
    const horizontal = Math.min(x.offset + x.width / 2, y.offset + y.width / 2) - Math.max(x.offset - x.width / 2, y.offset - y.width / 2);
    const vertical = Math.min(x.bottom + x.height, y.bottom + y.height) - Math.max(x.bottom, y.bottom);
    if (horizontal > 0.012 && vertical > 0.012) throw new ConfigurationError(`Openings ${i + 1} and ${j + 1} overlap on the ${x.side} wall.`, 'openings');
  }
  return {
    ...a, openings, ...baseView(), selectedHeaProfile: 'HEA 220', showCladding: Boolean(a.showCladding), showScenery: true,
    inspectionMode: 'all', sectionCutEnabled: false, sectionCutPosition: 50, connectionDetails: false,
    forkliftClearance: false, rackDensity: 'standard', serviceVisibility: 'all', serviceCoverage: false,
    sunPosition: 0.47, season: 'winter', nightPreview: Boolean(a.nightPreview), explode: a.explodedView ? 100 : 0,
  };
}

function side(value: unknown) {
  const source = value && typeof value === 'object' ? value as JsonObject : { type: value };
  const normalized = source.type === 'privacy' ? 'privacy-wall' : String(source.type);
  const allowed = ['none', 'screen', 'motorized-screen', 'glass', 'privacy-wall'];
  const requestedOpenness = Number(source.openness);
  const openness = Math.min(100, Math.max(0, Number.isFinite(requestedOpenness) ? requestedOpenness : 50));
  return {
    type: allowed.includes(normalized) ? normalized : 'none',
    screenSettings: {
      screen: { openness: normalized === 'screen' ? openness : 50, color: String(source.color || '#67757d') },
      'motorized-screen': { openness: normalized === 'motorized-screen' ? openness : 50, color: String(source.color || '#34444c') },
    },
    privacyColor: String(source.privacyColor || '#26343c'),
  };
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
  const selectedSegments: Record<string, ReturnType<typeof side>> = {};
  for (const entry of a.sides as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as JsonObject;
    if (String(item.segmentId || '')) selectedSegments[String(item.segmentId)] = side(item);
    else if (['front', 'back', 'left', 'right'].includes(String(item.side))) selectedSides[String(item.side)] = item.type;
  }
  const width = Number(a.widthMm); const depth = Number(a.depthMm);
  const distributed = distributePergolaAccessories(width, depth, a.installation, a.mountedSide, Number(a.spotlightCount), Number(a.heaterCount));
  const validSegmentIds = new Set(distributed.grid.segments.map(segment => segment.id));
  for (const id of Object.keys(selectedSegments)) {
    if (!validSegmentIds.has(id)) throw new ConfigurationError(`Side closing segment ${id} does not exist for the current pergola dimensions.`, 'sides');
    const segment = distributed.grid.segments.find(candidate => candidate.id === id);
    if (a.installation === 'wall-mounted' && segment?.boundary === a.mountedSide && selectedSegments[id].type !== 'none') {
      throw new ConfigurationError(`Side closing segment ${id} is occupied by the mounted wall.`, 'sides');
    }
  }
  if (a.installation === 'wall-mounted' && selectedSides[String(a.mountedSide)] !== 'none') {
    throw new ConfigurationError(`The ${String(a.mountedSide)} side is occupied by the mounted wall.`, 'sides');
  }
  const sideSegments = Object.fromEntries(distributed.grid.segments.map(segment => {
    const boundaryType = segment.boundary ? selectedSides[segment.boundary] : 'none';
    return [segment.id, selectedSegments[segment.id] || side(boundaryType)];
  }));
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
    sideSegments,
    accessories: {
      perimeterLed: { enabled: a.perimeterLed, color: '#fff1b4' }, spotlights: distributed.spotlights, heaters: distributed.heaters,
      sensors: { rain: { enabled: Boolean(rainPole), pole: rainPole }, wind: { enabled: Boolean(windPole), pole: windPole } },
      speakers: legacySpeakers, outlets: legacyOutlets,
    },
    environment: { sunPosition: Number(a.sunPosition) / 100, northDirection: a.northDirection, night: Boolean(a.nightPreview), season: a.season },
    view: { dimensionsVisible: true, cameraPreset: 'perspective', compassVisible: false }, customer: { name: '', email: '', phone: '', postcode: '', notes: '' },
  };
}

function solarState(a: JsonObject, raw: JsonObject = a): JsonObject {
  if (a.roofType === 'shed' && (a.roofSide === 'back' || a.roofSide === 'both')) throw new ConfigurationError('A single-slope roof supports the front roof plane only.', 'roofSide');
  if (Number(a.panelColumns) > Number(a.panelCount)) throw new ConfigurationError('Panel columns cannot exceed the requested panel count.', 'panelColumns');
  const exactLocationConfirmed = a.locationMode === 'exact'
    && Number.isFinite(Number(raw.locationLat))
    && Number.isFinite(Number(raw.locationLon))
    && String(raw.locationLabel || '').trim().length > 0;
  return {
    roofType: a.roofType, length: a.length, depth: a.depth, wallHeight: 3, pitch: a.pitch, overhang: 0.45, roofColor: '#6b7280', covering: 'generic',
    modulePreset: a.modulePreset, panelCount: a.panelCount, panelColumns: a.panelColumns, moduleOrientation: a.moduleOrientation, roofSide: a.roofSide,
    panelGap: 0.04, panelMargin: 0.32, effectivePanelCount: a.panelCount,
    region: a.region, locationMode: exactLocationConfirmed ? 'exact' : 'region', locationLat: exactLocationConfirmed ? a.locationLat : null,
    locationLon: exactLocationConfirmed ? a.locationLon : null, locationLabel: exactLocationConfirmed ? a.locationLabel : '',
    locationTimeZone: 'Europe/Bucharest', monthlyBillRon: a.monthlyBillRon, energyTariffRon: a.energyTariffRon, gridConnection: a.gridConnection,
    consumptionProfile: a.consumptionProfile, batteryEnabled: a.batteryEnabled, batteryAutoSize: a.batteryAutoSize,
    batteryCapacityKWh: a.batteryCapacityKWh, batteryReservePct: 10, batteryRoundTripEfficiency: 0.92,
    installationPricePerKwpRon: a.installationPricePerKwpRon, mountingPricePerPanelRon: a.mountingPricePerPanelRon,
    paperworkPriceRon: a.paperworkPriceRon, batteryPricePerKWhRon: a.batteryPricePerKWhRon, vatRate: Number(a.vatRatePct) / 100,
    showDimensions: false, technicalEdges: false, showCompass: true, showSunPath: true, sunPosition: 50, northDirection: a.roofBearingDeg, nightPreview: false,
    environmentLocalEastM: a.environmentLocalEastM, environmentLocalNorthM: a.environmentLocalNorthM, environmentLocalStepM: 1,
    units: 'metric', currency: 'RON', currencyRate: 1, excludedEstimateItems: [],
  };
}

function windowState(a: JsonObject): JsonObject {
  const expected = a.profileSetId === '2_4_Oeffnungselemnt_Vertikal'
    ? { frame: '575760', sash: '575780', accessory: 'b2-6' }
    : { frame: '575770', sash: '575790', accessory: a.profileSetId === '2_5_Oeffnungselemnt_Vertikal' ? 'b2-7' : 'b2-8' };
  if (a.outerFrameProfileId !== expected.frame || a.sashProfileId !== expected.sash) throw new ConfigurationError(`The selected CAD profile family requires outer frame ${expected.frame} and sash ${expected.sash}.`, 'profileSetId');
  if (a.accessoryPreset !== expected.accessory) throw new ConfigurationError(`The selected CAD profile family requires accessory preset ${expected.accessory}.`, 'accessoryPreset');
  if (a.outsideFinishType === 'coated' && !/^#[0-9a-f]{6}$/i.test(String(a.outsideColor))) throw new ConfigurationError('Outside coated colour must be a six-digit hex colour.', 'outsideColor');
  if (a.finishMode === 'different' && a.insideFinishType === 'coated' && !/^#[0-9a-f]{6}$/i.test(String(a.insideColor))) throw new ConfigurationError('Inside coated colour must be a six-digit hex colour.', 'insideColor');
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
          : product === 'solar' ? solarState(answers, raw)
            : windowState(answers);
  return { state, answers, assumptions, warnings: [] as string[] };
}

export function summarize(product: ProductId, state: JsonObject): JsonObject {
  if (product === 'fence') return { layout: state.layout, heightM: state.height, panelStyle: state.panelStyle, gateCount: Array.isArray(state.gates) ? state.gates.length : 0 };
  if (product === 'roof') return { roofType: state.roofType, footprintM2: Number(state.length) * Number(state.depth), pitchDeg: state.pitch, covering: state.covering };
  if (product === 'hall') return { dimensionsM: `${state.length} × ${state.width} × ${state.eaveHeight}`, footprintM2: Number(state.length) * Number(state.width), structure: state.structurePreset };
  if (product === 'pergola') { const d = state.dimensions as JsonObject; return { dimensionsMm: `${d.width} × ${d.depth} × ${d.height}`, installation: state.installation, automation: state.automation }; }
  if (product === 'solar') {
    const power = Number(state.panelCount) * ({ standard475: 0.475, compact450: 0.45, premium490: 0.49 }[String(state.modulePreset)] ?? 0);
    return { panelCount: state.panelCount, nominalPowerKwp: Number(power.toFixed(3)), battery: state.batteryEnabled ? (state.batteryAutoSize ? 'auto-sized' : `${state.batteryCapacityKWh} kWh`) : 'none' };
  }
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
      nightPreview: Boolean((state.environment as JsonObject)?.night),
      sides: Object.entries((state.sideSegments || {}) as Record<string, JsonObject>)
        .filter(([, config]) => config?.type && config.type !== 'none')
        .map(([segmentId, config]) => ({ segmentId, type: config.type })),
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
  if (product === 'solar') Object.assign(answers, {
    vatRatePct: Number(state.vatRate ?? 0.21) * 100,
    roofBearingDeg: state.northDirection,
    environmentLocalEastM: state.environmentLocalEastM,
    environmentLocalNorthM: state.environmentLocalNorthM,
  });
  return answers;
}
