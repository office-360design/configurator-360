import { createShareUrl, readShareState as readEncodedShareState } from '../../shared-ui/src/shareState.js';
import {
  DIMENSION_LIMITS,
  POLE_FACES as LAYOUT_POLE_FACES,
  buildPoleGrid,
  clampDimensionValue,
  connectedFaceForSegment,
  getConnectedSegment,
  getPole,
  getSegment,
  legacyCornerMap,
  normalizeDimensions,
  poleUnavailableOnMountedSide,
  segmentUnavailableOnMountedSide,
} from './layout.js';

const STORAGE_KEY = 'pergola-configurator:v9';
const LEGACY_STORAGE_KEYS = [
  'pergola-configurator:v8',
  'pergola-configurator:v7',
  'pergola-configurator:v6',
  'pergola-configurator:v5',
  'pergola-configurator:v4',
  'pergola-configurator:v3',
  'pergola-configurator:v2',
  'pergola-configurator:v1',
];

export const SCREEN_TYPES = ['screen', 'motorized-screen'];
export const SENSOR_POSITIONS = [
  'front-left',
  'front-center',
  'front-right',
  'left-center',
  'right-center',
  'back-left',
  'back-center',
  'back-right',
];
const LEGACY_SUPPORT_POLES = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
export const POLE_FACES = LAYOUT_POLE_FACES;
export const POLE_MOUNT_TYPES = ['speaker', 'outlet', 'hand-crank', 'switch'];

const MOUNT_HEIGHT_LIMITS = Object.freeze({
  speaker: { min: 15, max: 70, default: 66 },
  outlet: { min: 15, max: 72, default: 35 },
  'hand-crank': { min: 18, max: 62, default: 45 },
  switch: { min: 15, max: 72, default: 52 },
});

const MOUNT_PHYSICAL_HEIGHT_METERS = Object.freeze({
  speaker: 0.24,
  outlet: 0.148,
  'hand-crank': 0.78,
  switch: 0.14,
});
const MOUNT_VERTICAL_CLEARANCE_METERS = 0.06;
const MINIMUM_PERGOLA_HEIGHT_METERS = 2.0;

function createScreenSettings() {
  return {
    screen: { openness: 50, color: '#67757d' },
    'motorized-screen': { openness: 50, color: '#34444c' },
  };
}

function createSide() {
  return {
    type: 'none',
    screenSettings: createScreenSettings(),
    privacyColor: '#26343c',
  };
}

function createPoleFaceMounts() {
  return {
    speaker: null,
    outlet: null,
    'hand-crank': null,
    switch: null,
  };
}

function createPoleFaces() {
  return {
    front: createPoleFaceMounts(),
    right: createPoleFaceMounts(),
    back: createPoleFaceMounts(),
    left: createPoleFaceMounts(),
  };
}

function createPoleMounts(dimensions = DEFAULT_STATE?.dimensions ?? { width: 5000, depth: 3500, height: 2700 }) {
  const mounts = {};
  buildPoleGrid(dimensions).poles.forEach((pole) => { mounts[pole.id] = createPoleFaces(); });
  return mounts;
}

function createSideSegments(dimensions = DEFAULT_STATE?.dimensions ?? { width: 5000, depth: 3500, height: 2700 }) {
  const segments = {};
  buildPoleGrid(dimensions).segments.forEach((segment) => { segments[segment.id] = createSide(); });
  return segments;
}

export function getPoleGrid(state) {
  return buildPoleGrid(state?.dimensions ?? state ?? DEFAULT_STATE.dimensions);
}

export function getSupportPoleIds(state) {
  return getPoleGrid(state).poles.map((pole) => pole.id);
}

export function getPoleLabel(state, poleId) {
  return getPole(getPoleGrid(state), poleId)?.label ?? poleId;
}

export function getSideSegmentConfig(state, segmentId) {
  return state.sideSegments?.[segmentId] ?? createSide();
}

export function getSideSegment(state, segmentId) {
  return getSegment(getPoleGrid(state), segmentId);
}

export function getPoleMountHeightLimits(type) {
  return MOUNT_HEIGHT_LIMITS[type] ?? MOUNT_HEIGHT_LIMITS.outlet;
}

function clampMountHeight(type, value) {
  const limits = getPoleMountHeightLimits(type);
  const number = Number(value);
  if (!Number.isFinite(number)) return limits.default;
  return Math.round(Math.min(limits.max, Math.max(limits.min, number)));
}

export function createPoleMount(type, options = {}) {
  if (!POLE_MOUNT_TYPES.includes(type)) return null;
  const mount = {
    type,
    height: clampMountHeight(type, options.height),
  };
  if (type === 'outlet') mount.outletType = options.outletType === 'us' ? 'us' : 'eu';
  return mount;
}

export const DEFAULT_STATE = Object.freeze({
  step: 0,
  model: 'premium',
  installation: 'freestanding',
  mountedSide: 'back',
  locale: 'en-US',
  units: 'imperial',
  currency: 'USD',
  quality: 'balanced',
  defaultArPlatform: 'android',
  darkMode: false,
  dimensions: { width: 5000, depth: 3500, height: 2700 },
  roof: {
    orientation: 'width',
    frameColor: '#26343c',
    louverColor: '#64727b',
    louverTilt: 28,
    drainage: 'integrated',
  },
  automation: 'remote',
  services: { transportation: false, assembly: false, warranty: true },
  sides: {
    front: createSide(),
    back: createSide(),
    left: createSide(),
    right: createSide(),
  },
  accessories: {
    perimeterLed: { enabled: false, color: '#fff1b4' },
    spotlights: 0,
    heaters: { front: false, back: false, left: false, right: false },
    sensors: {
      rain: { enabled: false, position: 'front-left' },
      wind: { enabled: false, position: 'back-right' },
    },
  },
  sideSegments: createSideSegments({ width: 5000, depth: 3500, height: 2700 }),
  poleMounts: createPoleMounts({ width: 5000, depth: 3500, height: 2700 }),
  environment: { sunPosition: 0.35, northDirection: 0, night: false, season: 'winter' },
  view: { dimensionsVisible: true, cameraPreset: 'perspective', compassVisible: false },
  customer: { name: '', email: '', phone: '', postcode: '', notes: '' },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const output = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (
      value && typeof value === 'object' && !Array.isArray(value)
      && target?.[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function normalizePreferences(state, incoming = {}, options = {}) {
  const profiles = {
    'en-US': { units: 'imperial', currency: 'USD' },
    'ro-RO': { units: 'metric', currency: 'RON' },
  };

  const incomingLocale = typeof incoming.locale === 'string' && profiles[incoming.locale]
    ? incoming.locale
    : null;
  const currentLocale = typeof state.locale === 'string' && profiles[state.locale]
    ? state.locale
    : null;
  const locale = incomingLocale ?? currentLocale ?? 'en-US';
  const defaults = profiles[locale];

  state.locale = locale;

  if (options.migrateLegacy && !incomingLocale) {
    state.units = defaults.units;
    state.currency = defaults.currency;
    return;
  }

  state.units = ['metric', 'imperial'].includes(state.units)
    ? state.units
    : defaults.units;
  state.currency = ['USD', 'RON'].includes(state.currency)
    ? state.currency
    : defaults.currency;
  state.quality = ['low', 'balanced', 'high'].includes(state.quality)
    ? state.quality
    : 'balanced';
  state.defaultArPlatform = ['android', 'ios'].includes(state.defaultArPlatform)
    ? state.defaultArPlatform
    : 'android';
  state.darkMode = Boolean(state.darkMode);
}

function normalizeDimensionState(state) {
  state.dimensions = normalizeDimensions(state.dimensions ?? DEFAULT_STATE.dimensions);
}

export function getDimensionLimits(key) {
  return DIMENSION_LIMITS[key] ?? null;
}

export function normalizeDimensionInput(key, value) {
  return clampDimensionValue(key, value);
}

function normalizeScreenSides(state, incoming = {}) {
  Object.keys(state.sides).forEach((side) => {
    const current = state.sides[side] ?? createSide();
    const legacy = incoming.sides?.[side] ?? {};
    current.screenSettings = deepMerge(createScreenSettings(), current.screenSettings ?? {});

    if (Number.isFinite(Number(legacy.openness))) {
      const type = SCREEN_TYPES.includes(current.type) ? current.type : 'screen';
      current.screenSettings[type].openness = Number(legacy.openness);
    }
    if (typeof legacy.color === 'string') {
      const type = SCREEN_TYPES.includes(current.type) ? current.type : 'screen';
      current.screenSettings[type].color = legacy.color;
    }

    SCREEN_TYPES.forEach((type) => {
      const settings = current.screenSettings[type];
      settings.openness = Math.min(100, Math.max(0, Number(settings.openness) || 0));
      if (typeof settings.color !== 'string') settings.color = createScreenSettings()[type].color;
    });

    if (typeof current.privacyColor !== 'string') current.privacyColor = '#26343c';
    delete current.openness;
    delete current.color;
    state.sides[side] = current;
  });
}

function normalizeAccessories(state, incoming = {}) {
  const defaults = clone(DEFAULT_STATE.accessories);
  const legacy = incoming.accessories ?? {};
  const current = state.accessories ?? {};

  if (typeof legacy.perimeterLed === 'boolean') {
    current.perimeterLed = { ...defaults.perimeterLed, enabled: legacy.perimeterLed };
  } else {
    current.perimeterLed = deepMerge(defaults.perimeterLed, current.perimeterLed ?? {});
  }

  current.spotlights = Math.min(12, Math.max(0, Number(current.spotlights) || 0));

  if (typeof legacy.heaters === 'number') {
    const order = ['front', 'back', 'left', 'right'];
    current.heaters = { ...defaults.heaters };
    order.slice(0, Math.min(4, Math.max(0, legacy.heaters))).forEach((side) => { current.heaters[side] = true; });
  } else {
    current.heaters = deepMerge(defaults.heaters, current.heaters ?? {});
  }

  if (typeof legacy.rainSensor === 'boolean' || typeof legacy.windSensor === 'boolean') {
    current.sensors = deepMerge(defaults.sensors, current.sensors ?? {});
    current.sensors.rain.enabled = Boolean(legacy.rainSensor);
    current.sensors.wind.enabled = Boolean(legacy.windSensor);
  } else {
    current.sensors = deepMerge(defaults.sensors, current.sensors ?? {});
  }

  state.accessories = current;
  delete state.accessories.rainSensor;
  delete state.accessories.windSensor;
  delete state.accessories.outletType;
}

function findFreeSensorPosition(unavailable) {
  return SENSOR_POSITIONS.find((position) => position !== unavailable) ?? SENSOR_POSITIONS[0];
}

function ensureSensorPositions(state) {
  const sensors = state.accessories.sensors;
  if (!SENSOR_POSITIONS.includes(sensors.rain.position)) sensors.rain.position = DEFAULT_STATE.accessories.sensors.rain.position;
  if (!SENSOR_POSITIONS.includes(sensors.wind.position)) sensors.wind.position = DEFAULT_STATE.accessories.sensors.wind.position;
  if (sensors.rain.enabled && sensors.wind.enabled && sensors.rain.position === sensors.wind.position) {
    sensors.wind.position = findFreeSensorPosition(sensors.rain.position);
  }
}

export function poleIsAvailable(state, pole) {
  const grid = getPoleGrid(state);
  if (!getPole(grid, pole)) return false;
  if (state.installation !== 'wall-mounted') return true;
  return !poleUnavailableOnMountedSide(grid, pole, state.mountedSide);
}

export function segmentIsAvailable(state, segmentId) {
  const grid = getPoleGrid(state);
  const segment = getSegment(grid, segmentId);
  if (!segment) return false;
  if (state.installation !== 'wall-mounted') return true;
  return !segmentUnavailableOnMountedSide(grid, segment, state.mountedSide);
}

export function getConnectedSegmentForPoleFace(state, pole, face) {
  return getConnectedSegment(getPoleGrid(state), pole, face)?.id ?? null;
}

// Backwards-compatible name used by older UI code. Dynamic layouts connect a pole face to a segment.
export function getConnectedSideForPoleFace(poleOrState, faceOrPole, maybeFace) {
  if (maybeFace !== undefined) return getConnectedSegmentForPoleFace(poleOrState, faceOrPole, maybeFace);
  return null;
}

export function poleFaceIsAvailable(state, pole, face) {
  if (!poleIsAvailable(state, pole) || !POLE_FACES.includes(face)) return false;
  const segmentId = getConnectedSegmentForPoleFace(state, pole, face);
  if (!segmentId) return true;
  if (!segmentIsAvailable(state, segmentId)) return false;
  return getSideSegmentConfig(state, segmentId).type === 'none';
}

function normalizePoleMountValue(value, expectedType = null) {
  if (!value || typeof value !== 'object') return null;
  const type = expectedType ?? value.type;
  if (!POLE_MOUNT_TYPES.includes(type)) return null;
  return createPoleMount(type, {
    height: value.height,
    outletType: value.outletType ?? value.typeStandard ?? value.standard,
  });
}

function normalizePoleFaceValue(value) {
  const normalized = createPoleFaceMounts();
  if (!value || typeof value !== 'object') return normalized;

  if (!Array.isArray(value) && POLE_MOUNT_TYPES.includes(value.type)) {
    normalized[value.type] = normalizePoleMountValue(value);
    return normalized;
  }

  const entries = Array.isArray(value)
    ? value.map((mount) => [mount?.type, mount])
    : Object.entries(value);

  entries.forEach(([type, mount]) => {
    if (!POLE_MOUNT_TYPES.includes(type)) return;
    normalized[type] = normalizePoleMountValue(mount, type);
  });
  return normalized;
}

export function getPoleFaceMounts(state, pole, face) {
  return state.poleMounts?.[pole]?.[face] ?? createPoleFaceMounts();
}

export function faceHasMountedItems(state, pole, face) {
  return Object.values(getPoleFaceMounts(state, pole, face)).some(Boolean);
}

function findAvailableFace(state, pole, mounts = null, type = null) {
  const source = mounts ?? state.poleMounts;
  const faces = POLE_FACES.filter((face) => poleFaceIsAvailable(state, pole, face));
  const acceptsType = (face) => !type || !source?.[pole]?.[face]?.[type];
  return faces.find((face) => acceptsType(face) && !Object.values(source?.[pole]?.[face] ?? {}).some(Boolean))
    ?? faces.find(acceptsType)
    ?? null;
}

function legacyOutletMount(value) {
  if (value === null || value === false || value === 'off' || value === '') return null;
  if (typeof value === 'number') return createPoleMount('outlet', { height: value });
  if (typeof value === 'object') {
    return createPoleMount('outlet', {
      height: value.height ?? value.level ?? value.position,
      outletType: value.type,
    });
  }
  return createPoleMount('outlet');
}

function migrateLegacyPoleMounts(state, incoming) {
  const mounts = createPoleMounts(state.dimensions);
  const legacyAccessories = incoming.accessories ?? {};
  const corners = legacyCornerMap(state.dimensions);

  LEGACY_SUPPORT_POLES.forEach((legacyPole) => {
    const pole = corners[legacyPole];
    if (!pole) return;
    POLE_FACES.forEach((face) => {
      const legacyOutlet = legacyAccessories.outlets?.[legacyPole]?.[face];
      if (legacyOutlet && poleFaceIsAvailable(state, pole, face)) {
        mounts[pole][face].outlet = legacyOutletMount(legacyOutlet);
      }
    });
  });

  LEGACY_SUPPORT_POLES.forEach((legacyPole) => {
    const pole = corners[legacyPole];
    if (!legacyAccessories.speakers?.[legacyPole] || !poleIsAvailable(state, pole)) return;
    const face = findAvailableFace(state, pole, mounts, 'speaker');
    if (face) mounts[pole][face].speaker = createPoleMount('speaker');
  });

  const legacyAutomation = incoming.automationSettings ?? {};
  if (state.automation === 'manual') {
    const preferredLegacyPole = LEGACY_SUPPORT_POLES.includes(legacyAutomation.manual?.pole)
      ? legacyAutomation.manual.pole
      : 'frontRight';
    const preferredPole = corners[preferredLegacyPole];
    const orderedPoles = [preferredPole, ...getSupportPoleIds(state).filter((pole) => pole !== preferredPole)].filter(Boolean);
    for (const pole of orderedPoles) {
      if (!poleIsAvailable(state, pole)) continue;
      const face = findAvailableFace(state, pole, mounts, 'hand-crank');
      if (!face) continue;
      mounts[pole][face]['hand-crank'] = createPoleMount('hand-crank', { height: legacyAutomation.manual?.height });
      break;
    }
  }

  if (state.automation === 'wall-switch') {
    LEGACY_SUPPORT_POLES.forEach((legacyPole) => {
      const pole = corners[legacyPole];
      const height = legacyAutomation.wallSwitches?.[legacyPole];
      if (!pole || height === null || height === false || height === 'off' || height === undefined) return;
      const face = findAvailableFace(state, pole, mounts, 'switch');
      if (face) mounts[pole][face].switch = createPoleMount('switch', { height });
    });
  }

  return mounts;
}

function mountTypeAllowedForAutomation(state, type) {
  if (type === 'hand-crank') return state.automation === 'manual';
  if (type === 'switch') return state.automation === 'wall-switch';
  return true;
}

export function countPoleMounts(state, type = null) {
  let count = 0;
  getSupportPoleIds(state).forEach((pole) => {
    POLE_FACES.forEach((face) => {
      Object.entries(getPoleFaceMounts(state, pole, face)).forEach(([mountType, mount]) => {
        if (mount && (!type || mountType === type)) count += 1;
      });
    });
  });
  return count;
}

export function findPoleMount(state, type) {
  for (const pole of getSupportPoleIds(state)) {
    for (const face of POLE_FACES) {
      const mount = getPoleFaceMounts(state, pole, face)[type];
      if (mount) return { pole, face, type, mount };
    }
  }
  return null;
}

function pergolaHeightMeters(state) {
  const configuredHeight = Number(state.dimensions?.height) / 1000;
  return Number.isFinite(configuredHeight) && configuredHeight > 0
    ? configuredHeight
    : MINIMUM_PERGOLA_HEIGHT_METERS;
}

function mountVerticalHalfSpanPercent(state, type) {
  const physicalHeight = MOUNT_PHYSICAL_HEIGHT_METERS[type] ?? MOUNT_PHYSICAL_HEIGHT_METERS.outlet;
  return (physicalHeight / 2 / pergolaHeightMeters(state)) * 100;
}

function mountsOverlapVertically(state, first, second) {
  if (!first || !second) return false;
  const height = pergolaHeightMeters(state);
  const requiredSeparation = mountVerticalHalfSpanPercent(state, first.type)
    + mountVerticalHalfSpanPercent(state, second.type)
    + (MOUNT_VERTICAL_CLEARANCE_METERS / height) * 100;
  return Math.abs(Number(first.height) - Number(second.height)) < requiredSeparation;
}

export function findPoleMountCollisions(state, pole, face, type, mount = null) {
  const candidate = mount ?? getPoleFaceMounts(state, pole, face)[type];
  if (!candidate) return [];
  return Object.entries(getPoleFaceMounts(state, pole, face))
    .filter(([otherType, otherMount]) => otherType !== type && otherMount && mountsOverlapVertically(state, candidate, otherMount))
    .map(([otherType, otherMount]) => ({ pole, face, type: otherType, mount: otherMount }));
}

export function findPoleMountCollision(state, pole, face, type, mount = null) {
  return findPoleMountCollisions(state, pole, face, type, mount)[0] ?? null;
}

export function getPoleMountConflictMap(state) {
  const map = {};
  getSupportPoleIds(state).forEach((pole) => {
    POLE_FACES.forEach((face) => {
      const faceMounts = getPoleFaceMounts(state, pole, face);
      const types = new Set();
      const pairs = [];
      POLE_MOUNT_TYPES.forEach((type, index) => {
        const mount = faceMounts[type];
        if (!mount) return;
        POLE_MOUNT_TYPES.slice(index + 1).forEach((otherType) => {
          const otherMount = faceMounts[otherType];
          if (!otherMount || !mountsOverlapVertically(state, mount, otherMount)) return;
          types.add(type);
          types.add(otherType);
          pairs.push([type, otherType]);
        });
      });
      if (types.size) {
        map[pole] ??= {};
        map[pole][face] = { types: [...types], pairs };
      }
    });
  });
  return map;
}

export function hasPoleMountConflicts(state) {
  return Object.keys(getPoleMountConflictMap(state)).length > 0;
}

export function getPergolaConfigurationIssues(state) {
  const issues = [];
  if (hasPoleMountConflicts(state)) {
    issues.push({
      code: 'pole-overlap',
      message: 'Invalid pergola configuration. There are overlapping items.',
    });
  }
  if (state.automation === 'manual' && countPoleMounts(state, 'hand-crank') === 0) {
    issues.push({
      code: 'missing-hand-crank',
      message: 'Invalid pergola configuration. You must place one hand crank for the pergola in the Accessories tab.',
    });
  }
  if (state.automation === 'wall-switch' && countPoleMounts(state, 'switch') === 0) {
    issues.push({
      code: 'missing-switch',
      message: 'Invalid pergola configuration. You must place at least one switch for the pergola in the Accessories tab.',
    });
  }
  return issues;
}

export function isPergolaConfigurationValid(state) {
  return getPergolaConfigurationIssues(state).length === 0;
}

export function findAvailablePoleMountHeight(state, pole, face, type, preferredHeight = null) {
  const limits = getPoleMountHeightLimits(type);
  const preferred = clampMountHeight(type, preferredHeight ?? limits.default);
  const candidates = [];
  for (let height = limits.min; height <= limits.max; height += 1) candidates.push(height);
  candidates.sort((first, second) => Math.abs(first - preferred) - Math.abs(second - preferred));
  for (const height of candidates) {
    const candidate = createPoleMount(type, { height });
    if (!findPoleMountCollision(state, pole, face, type, candidate)) return height;
  }
  return null;
}

function orderedMountSlots(state, type, preferredPole = null) {
  const poleIds = getSupportPoleIds(state);
  const orderedPoles = preferredPole && poleIds.includes(preferredPole)
    ? [preferredPole, ...poleIds.filter((pole) => pole !== preferredPole)]
    : poleIds;
  const slots = [];
  orderedPoles.forEach((pole) => {
    if (!poleIsAvailable(state, pole)) return;
    POLE_FACES.forEach((face) => {
      if (poleFaceIsAvailable(state, pole, face) && !getPoleFaceMounts(state, pole, face)[type]) {
        slots.push({ pole, face });
      }
    });
  });
  return slots;
}

function findFirstMountSlot(state, type, preferredPole = null) {
  const slots = orderedMountSlots(state, type, preferredPole);
  return slots.find(({ pole, face }) => !faceHasMountedItems(state, pole, face)) ?? slots[0] ?? null;
}

function removeOtherMountsOfType(state, type, pole, face) {
  getSupportPoleIds(state).forEach((otherPole) => {
    POLE_FACES.forEach((otherFace) => {
      if (otherPole === pole && otherFace === face) return;
      state.poleMounts[otherPole][otherFace][type] = null;
    });
  });
}

function ensureAutomationMountRules(state) {
  if (state.automation !== 'manual') {
    getSupportPoleIds(state).forEach((pole) => {
      POLE_FACES.forEach((face) => { state.poleMounts[pole][face]['hand-crank'] = null; });
    });
  }

  if (state.automation !== 'wall-switch') {
    getSupportPoleIds(state).forEach((pole) => {
      POLE_FACES.forEach((face) => { state.poleMounts[pole][face].switch = null; });
    });
  }

  if (state.automation === 'manual') {
    const cranks = [];
    getSupportPoleIds(state).forEach((pole) => {
      POLE_FACES.forEach((face) => {
        if (state.poleMounts[pole][face]['hand-crank']) cranks.push({ pole, face });
      });
    });
    cranks.slice(1).forEach(({ pole, face }) => { state.poleMounts[pole][face]['hand-crank'] = null; });
  }
}

function placeRequiredAutomationMount(state) {
  if (state.automation === 'manual' && countPoleMounts(state, 'hand-crank') === 0) {
    const slot = findFirstMountSlot(state, 'hand-crank');
    if (slot) state.poleMounts[slot.pole][slot.face]['hand-crank'] = createPoleMount('hand-crank');
  }
  if (state.automation === 'wall-switch' && countPoleMounts(state, 'switch') === 0) {
    const slot = findFirstMountSlot(state, 'switch');
    if (slot) state.poleMounts[slot.pole][slot.face].switch = createPoleMount('switch');
  }
}

function normalizePoleMounts(state, incoming = {}, options = {}) {
  const blank = createPoleMounts(state.dimensions);
  let source = blank;

  if (options.migrateLegacy && !(incoming.poleMounts && typeof incoming.poleMounts === 'object')) {
    source = migrateLegacyPoleMounts(state, incoming);
  } else {
    const incomingMounts = incoming.poleMounts && typeof incoming.poleMounts === 'object'
      ? incoming.poleMounts
      : state.poleMounts ?? {};
    const corners = legacyCornerMap(state.dimensions);
    Object.entries(incomingMounts).forEach(([sourcePole, faces]) => {
      const targetPole = blank[sourcePole] ? sourcePole : corners[sourcePole];
      if (!targetPole || !blank[targetPole]) return;
      blank[targetPole] = deepMerge(blank[targetPole], faces ?? {});
    });
    source = blank;
  }

  state.poleMounts = source;
  getSupportPoleIds(state).forEach((pole) => {
    state.poleMounts[pole] = deepMerge(createPoleFaces(), state.poleMounts[pole] ?? {});
    POLE_FACES.forEach((face) => {
      const faceMounts = normalizePoleFaceValue(state.poleMounts[pole][face]);
      POLE_MOUNT_TYPES.forEach((type) => {
        const mount = faceMounts[type];
        if (!mount || !poleFaceIsAvailable(state, pole, face) || !mountTypeAllowedForAutomation(state, type)) {
          faceMounts[type] = null;
        }
      });
      state.poleMounts[pole][face] = faceMounts;
    });
  });

  ensureAutomationMountRules(state);
  delete state.automationSettings;
  delete state.accessories.speakers;
  delete state.accessories.outlets;
}

export function canPlacePoleMount(state, pole, face, type) {
  if (!POLE_MOUNT_TYPES.includes(type)) return false;
  if (!poleFaceIsAvailable(state, pole, face)) return false;
  if (!mountTypeAllowedForAutomation(state, type)) return false;
  if (type === 'hand-crank') return state.automation === 'manual';
  return true;
}

export function getSegmentMountPairs(state, segmentId) {
  const segment = getSideSegment(state, segmentId);
  if (!segment) return [];
  return [
    { pole: segment.a, face: segment.aFace },
    { pole: segment.b, face: segment.bFace },
  ];
}

export function segmentHasMountedItems(state, segmentId) {
  return getSegmentMountPairs(state, segmentId).some(({ pole, face }) => faceHasMountedItems(state, pole, face));
}

export function sideHasMountedItems(state, side) {
  return getPoleGrid(state).segments
    .filter((segment) => segment.boundary === side)
    .some((segment) => segmentHasMountedItems(state, segment.id));
}

export function hasConfiguredSideSegments(state) {
  return getPoleGrid(state).segments.some((segment) => getSideSegmentConfig(state, segment.id).type !== 'none');
}

export function hasPoleMountedItems(state) {
  return countPoleMounts(state) > 0;
}

export function hasLayoutCustomizations(state) {
  return hasPoleMountedItems(state) || hasConfiguredSideSegments(state);
}

function normalizeSideConfig(config = {}) {
  const normalized = deepMerge(createSide(), config ?? {});
  normalized.screenSettings = deepMerge(createScreenSettings(), normalized.screenSettings ?? {});
  SCREEN_TYPES.forEach((type) => {
    normalized.screenSettings[type].openness = Math.min(100, Math.max(0, Number(normalized.screenSettings[type].openness) || 0));
    if (typeof normalized.screenSettings[type].color !== 'string') normalized.screenSettings[type].color = createScreenSettings()[type].color;
  });
  if (typeof normalized.privacyColor !== 'string') normalized.privacyColor = '#26343c';
  if (!['none', 'screen', 'motorized-screen', 'privacy-wall', 'glass'].includes(normalized.type)) normalized.type = 'none';
  return normalized;
}

function normalizeSideSegments(state, incoming = {}, options = {}) {
  const grid = getPoleGrid(state);
  const blank = createSideSegments(state.dimensions);
  const incomingSegments = incoming.sideSegments && typeof incoming.sideSegments === 'object'
    ? incoming.sideSegments
    : (!options.migrateLegacy ? state.sideSegments ?? {} : {});

  grid.segments.forEach((segment) => {
    let source = incomingSegments[segment.id];
    if (!source && options.migrateLegacy && segment.boundary && incoming.sides?.[segment.boundary]) {
      source = incoming.sides[segment.boundary];
    }
    blank[segment.id] = normalizeSideConfig(source ?? blank[segment.id]);
    if (!segmentIsAvailable({ ...state, sideSegments: blank }, segment.id)) blank[segment.id].type = 'none';
  });
  state.sideSegments = blank;
}

function normalizeState(state, incoming = {}, options = {}) {
  normalizePreferences(state, incoming, options);
  normalizeDimensionState(state);
  normalizeScreenSides(state, incoming);
  normalizeAccessories(state, incoming);
  ensureSensorPositions(state);
  normalizeSideSegments(state, incoming, options);
  normalizePoleMounts(state, incoming, options);
  return state;
}

function readSharedState() {
  return readEncodedShareState({ productType: 'pergola' });
}

function readStoredState() {
  try {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
    return null;
  } catch (error) {
    console.warn('Stored configuration could not be loaded.', error);
    return null;
  }
}

function setAtPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function mountPathParts(path) {
  const match = path.match(/^poleMounts\.([^.]+)\.([^.]+)\.([^.]+)(?:\.(height|outletType))?$/);
  if (!match || !POLE_MOUNT_TYPES.includes(match[3])) return null;
  return {
    pole: match[1],
    face: match[2],
    type: match[3],
    field: match[4] ?? null,
  };
}

export class ConfiguratorStore {
  constructor() {
    const incoming = readSharedState() ?? readStoredState() ?? {};
    this.state = normalizeState(deepMerge(clone(DEFAULT_STATE), incoming), incoming, { migrateLegacy: true });
    this.listeners = new Set();
    this.lastError = '';
    this.history = [];
    this.historyLimit = 100;
    this.continuousHistoryPath = null;
    this.continuousHistoryTimer = null;
  }

  get() { return this.state; }
  getLastError() { return this.lastError; }
  canUndo() { return this.history.length > 0; }

  recordHistory(path = '', meta = {}) {
    if (meta.skipHistory) return;

    if (meta.continuous && path && this.continuousHistoryPath === path) {
      window.clearTimeout(this.continuousHistoryTimer);
      this.continuousHistoryTimer = window.setTimeout(() => {
        this.continuousHistoryPath = null;
        this.continuousHistoryTimer = null;
      }, 450);
      return;
    }

    this.history.push(clone(this.state));
    if (this.history.length > this.historyLimit) this.history.shift();

    window.clearTimeout(this.continuousHistoryTimer);
    if (meta.continuous && path) {
      this.continuousHistoryPath = path;
      this.continuousHistoryTimer = window.setTimeout(() => {
        this.continuousHistoryPath = null;
        this.continuousHistoryTimer = null;
      }, 450);
    } else {
      this.continuousHistoryPath = null;
      this.continuousHistoryTimer = null;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  notify(meta = {}) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('Configuration could not be saved locally.', error);
    }
    this.listeners.forEach((listener) => listener(this.state, meta));
  }

  update(path, value, meta = {}) {
    this.lastError = '';

    const dimensionMatch = path.match(/^dimensions\.(width|depth|height)$/);
    if (dimensionMatch) return this.setDimensions({ [dimensionMatch[1]]: value }, meta);

    const sensorMatch = path.match(/^accessories\.sensors\.(rain|wind)\.position$/);
    if (sensorMatch) {
      const sensor = sensorMatch[1];
      const other = sensor === 'rain' ? 'wind' : 'rain';
      if (this.state.accessories.sensors[other].enabled && this.state.accessories.sensors[other].position === value) {
        this.lastError = 'That roof position is already occupied by the other sensor.';
        return false;
      }
    }

    const segmentMatch = path.match(/^sideSegments\.([^.]+)\.type$/);
    if (segmentMatch && value !== 'none') {
      if (!segmentIsAvailable(this.state, segmentMatch[1])) {
        this.lastError = 'That grid segment is not available for a side closing.';
        return false;
      }
      if (segmentHasMountedItems(this.state, segmentMatch[1])) {
        this.lastError = 'Remove the components from the two connected pole faces before closing this segment.';
        return false;
      }
    }

    const mountPath = mountPathParts(path);
    let normalizedValue = value;
    if (mountPath) {
      const currentMount = this.state.poleMounts?.[mountPath.pole]?.[mountPath.face]?.[mountPath.type] ?? null;
      if (mountPath.field === 'height') {
        if (!currentMount) return false;
        normalizedValue = clampMountHeight(mountPath.type, value);
      } else if (mountPath.field === 'outletType') {
        if (mountPath.type !== 'outlet' || !currentMount) return false;
        normalizedValue = value === 'us' ? 'us' : 'eu';
      } else {
        normalizedValue = normalizePoleMountValue(value, mountPath.type);
      }
    }

    const candidate = clone(this.state);
    setAtPath(candidate, path, normalizedValue);

    if (mountPath && !mountPath.field && normalizedValue && mountPath.type === 'hand-crank') {
      removeOtherMountsOfType(candidate, 'hand-crank', mountPath.pole, mountPath.face);
    }

    if (mountPath) {
      const mount = candidate.poleMounts?.[mountPath.pole]?.[mountPath.face]?.[mountPath.type] ?? null;
      if (mount && !canPlacePoleMount(candidate, mountPath.pole, mountPath.face, mountPath.type)) {
        this.lastError = 'That component is not available on this pole face.';
        return false;
      }

      if (mount && !mountPath.field) {
        const safeHeight = findAvailablePoleMountHeight(
          candidate,
          mountPath.pole,
          mountPath.face,
          mountPath.type,
          mount.height,
        );
        if (safeHeight !== null) {
          candidate.poleMounts[mountPath.pole][mountPath.face][mountPath.type].height = safeHeight;
        }
      }

    }

    const normalizedCandidate = normalizeState(candidate, candidate);
    if (path === 'automation') placeRequiredAutomationMount(normalizedCandidate);

    this.recordHistory(path, meta);
    this.state = normalizedCandidate;
    this.notify({ path, ...meta });
    return true;
  }

  setDimensions(partial = {}, meta = {}) {
    const nextDimensions = normalizeDimensions({ ...this.state.dimensions, ...partial });
    const changed = ['width', 'depth', 'height'].some((key) => nextDimensions[key] !== this.state.dimensions[key]);
    if (!changed) return true;

    this.recordHistory(meta.path ?? 'dimensions', meta);
    const candidate = clone(this.state);
    candidate.dimensions = nextDimensions;
    candidate.poleMounts = createPoleMounts(nextDimensions);
    candidate.sideSegments = createSideSegments(nextDimensions);
    candidate.sides = {
      front: createSide(), back: createSide(), left: createSide(), right: createSide(),
    };
    this.state = normalizeState(candidate, candidate);
    this.notify({ path: meta.path ?? 'dimensions', dimensionsReset: true, ...meta });
    return true;
  }

  patch(partial, meta = {}) {
    if (partial?.dimensions) return this.setDimensions(partial.dimensions, meta);
    this.recordHistory(meta.path ?? 'patch', meta);
    this.state = normalizeState(deepMerge(this.state, partial), partial);
    this.notify(meta);
    return true;
  }

  nextStep(maxStep) {
    this.state.step = Math.min(maxStep, this.state.step + 1);
    this.notify({ path: 'step' });
  }

  previousStep() {
    this.state.step = Math.max(0, this.state.step - 1);
    this.notify({ path: 'step' });
  }

  reset() {
    this.recordHistory('reset');
    this.state = clone(DEFAULT_STATE);
    window.history.replaceState({}, '', window.location.pathname);
    this.notify({ reset: true });
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    window.clearTimeout(this.continuousHistoryTimer);
    this.continuousHistoryPath = null;
    this.continuousHistoryTimer = null;
    this.state = previous;
    this.notify({ undo: true, skipHistory: true });
    return true;
  }

  getShareUrl() {
    const shareState = clone(this.state);
    shareState.step = 0;
    return createShareUrl({ productType: 'pergola', state: shareState });
  }
}
