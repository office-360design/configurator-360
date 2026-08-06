const STORAGE_KEY = 'pergola-configurator:v7';
const LEGACY_STORAGE_KEYS = [
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
export const SUPPORT_POLES = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
export const POLE_FACES = ['front', 'right', 'back', 'left'];
export const POLE_MOUNT_TYPES = ['speaker', 'outlet', 'hand-crank', 'switch'];

const POLE_FACE_RULES = Object.freeze({
  frontLeft: {
    front: { exterior: true },
    left: { exterior: true },
    right: { side: 'front' },
    back: { side: 'left' },
  },
  frontRight: {
    front: { exterior: true },
    right: { exterior: true },
    left: { side: 'front' },
    back: { side: 'right' },
  },
  backLeft: {
    back: { exterior: true },
    left: { exterior: true },
    right: { side: 'back' },
    front: { side: 'left' },
  },
  backRight: {
    back: { exterior: true },
    right: { exterior: true },
    left: { side: 'back' },
    front: { side: 'right' },
  },
});

const FACE_PREFERENCE = Object.freeze({
  frontLeft: ['right', 'back', 'front', 'left'],
  frontRight: ['left', 'back', 'front', 'right'],
  backLeft: ['right', 'front', 'back', 'left'],
  backRight: ['left', 'front', 'back', 'right'],
});

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
const MINIMUM_PERGOLA_HEIGHT_METERS = 2.2;

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

function createPoleFaces() {
  return { front: null, right: null, back: null, left: null };
}

function createPoleMounts() {
  return {
    frontLeft: createPoleFaces(),
    frontRight: createPoleFaces(),
    backLeft: createPoleFaces(),
    backRight: createPoleFaces(),
  };
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
  poleMounts: createPoleMounts(),
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
  if (!SUPPORT_POLES.includes(pole)) return false;
  if (state.installation !== 'wall-mounted') return true;
  return !(
    (state.mountedSide === 'front' && pole.startsWith('front'))
    || (state.mountedSide === 'back' && pole.startsWith('back'))
    || (state.mountedSide === 'left' && pole.endsWith('Left'))
    || (state.mountedSide === 'right' && pole.endsWith('Right'))
  );
}

export function getConnectedSideForPoleFace(pole, face) {
  return POLE_FACE_RULES[pole]?.[face]?.side ?? null;
}

export function poleFaceIsAvailable(state, pole, face) {
  if (!poleIsAvailable(state, pole)) return false;
  const rule = POLE_FACE_RULES[pole]?.[face];
  if (!rule) return false;
  if (rule.exterior) return true;
  const side = state.sides?.[rule.side];
  if (state.installation === 'wall-mounted' && state.mountedSide === rule.side) return false;
  return !side || side.type === 'none';
}

function normalizePoleMountValue(value) {
  if (!value || typeof value !== 'object' || !POLE_MOUNT_TYPES.includes(value.type)) return null;
  return createPoleMount(value.type, {
    height: value.height,
    outletType: value.outletType ?? value.typeStandard ?? value.standard ?? value.type,
  });
}

function findAvailableFace(state, pole, occupied = null) {
  const faces = FACE_PREFERENCE[pole] ?? POLE_FACES;
  return faces.find((face) => poleFaceIsAvailable(state, pole, face) && !occupied?.[pole]?.[face]) ?? null;
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
  const mounts = createPoleMounts();
  const legacyAccessories = incoming.accessories ?? {};

  SUPPORT_POLES.forEach((pole) => {
    POLE_FACES.forEach((face) => {
      const legacyOutlet = legacyAccessories.outlets?.[pole]?.[face];
      if (legacyOutlet && poleFaceIsAvailable(state, pole, face)) {
        mounts[pole][face] = legacyOutletMount(legacyOutlet);
      }
    });
  });

  SUPPORT_POLES.forEach((pole) => {
    if (!legacyAccessories.speakers?.[pole] || !poleIsAvailable(state, pole)) return;
    const face = findAvailableFace(state, pole, mounts);
    if (face) mounts[pole][face] = createPoleMount('speaker');
  });

  const legacyAutomation = incoming.automationSettings ?? {};
  if (state.automation === 'manual') {
    const preferredPole = SUPPORT_POLES.includes(legacyAutomation.manual?.pole)
      ? legacyAutomation.manual.pole
      : 'frontRight';
    const orderedPoles = [preferredPole, ...SUPPORT_POLES.filter((pole) => pole !== preferredPole)];
    for (const pole of orderedPoles) {
      if (!poleIsAvailable(state, pole)) continue;
      const face = findAvailableFace(state, pole, mounts);
      if (!face) continue;
      mounts[pole][face] = createPoleMount('hand-crank', { height: legacyAutomation.manual?.height });
      break;
    }
  }

  if (state.automation === 'wall-switch') {
    SUPPORT_POLES.forEach((pole) => {
      const height = legacyAutomation.wallSwitches?.[pole];
      if (height === null || height === false || height === 'off' || height === undefined) return;
      const face = findAvailableFace(state, pole, mounts);
      if (face) mounts[pole][face] = createPoleMount('switch', { height });
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
  SUPPORT_POLES.forEach((pole) => {
    POLE_FACES.forEach((face) => {
      const mount = state.poleMounts?.[pole]?.[face];
      if (mount && (!type || mount.type === type)) count += 1;
    });
  });
  return count;
}

export function findPoleMount(state, type) {
  for (const pole of SUPPORT_POLES) {
    for (const face of POLE_FACES) {
      const mount = state.poleMounts?.[pole]?.[face];
      if (mount?.type === type) return { pole, face, mount };
    }
  }
  return null;
}

function mountVerticalHalfSpanPercent(type) {
  const physicalHeight = MOUNT_PHYSICAL_HEIGHT_METERS[type] ?? MOUNT_PHYSICAL_HEIGHT_METERS.outlet;
  return (physicalHeight / 2 / MINIMUM_PERGOLA_HEIGHT_METERS) * 100;
}

function mountsOverlapVertically(first, second) {
  if (!first || !second) return false;
  const requiredSeparation = mountVerticalHalfSpanPercent(first.type)
    + mountVerticalHalfSpanPercent(second.type)
    + (MOUNT_VERTICAL_CLEARANCE_METERS / MINIMUM_PERGOLA_HEIGHT_METERS) * 100;
  return Math.abs(Number(first.height) - Number(second.height)) < requiredSeparation;
}

export function findPoleMountCollision(state, pole, face, mount = null) {
  const candidate = mount ?? state.poleMounts?.[pole]?.[face];
  if (!candidate) return null;
  for (const otherFace of POLE_FACES) {
    if (otherFace === face) continue;
    const otherMount = state.poleMounts?.[pole]?.[otherFace];
    if (otherMount && mountsOverlapVertically(candidate, otherMount)) {
      return { pole, face: otherFace, mount: otherMount };
    }
  }
  return null;
}

function findNearestNonOverlappingHeight(state, pole, face, mount) {
  const limits = getPoleMountHeightLimits(mount.type);
  const preferred = clampMountHeight(mount.type, mount.height);
  const candidates = [];
  for (let height = limits.min; height <= limits.max; height += 1) candidates.push(height);
  candidates.sort((first, second) => Math.abs(first - preferred) - Math.abs(second - preferred));
  for (const height of candidates) {
    const candidate = { ...mount, height };
    if (!findPoleMountCollision(state, pole, face, candidate)) return height;
  }
  return null;
}

function orderedMountSlots(state, preferredPole = null) {
  const orderedPoles = preferredPole && SUPPORT_POLES.includes(preferredPole)
    ? [preferredPole, ...SUPPORT_POLES.filter((pole) => pole !== preferredPole)]
    : SUPPORT_POLES;
  const slots = [];
  orderedPoles.forEach((pole) => {
    if (!poleIsAvailable(state, pole)) return;
    const faces = FACE_PREFERENCE[pole] ?? POLE_FACES;
    faces.forEach((face) => {
      if (poleFaceIsAvailable(state, pole, face)) slots.push({ pole, face });
    });
  });
  return slots;
}

function findFirstMountSlot(state, preferredPole = null) {
  const slots = orderedMountSlots(state, preferredPole);
  return slots.find(({ pole, face }) => !state.poleMounts?.[pole]?.[face]) ?? slots[0] ?? null;
}

function resolvePoleMountCollisions(state) {
  SUPPORT_POLES.forEach((pole) => {
    const mounts = POLE_FACES
      .map((face) => ({ face, mount: state.poleMounts?.[pole]?.[face] ?? null }))
      .filter(({ mount }) => Boolean(mount))
      .sort((first, second) => {
        const priority = (entry) => {
          if (entry.mount.type === 'hand-crank' && state.automation === 'manual') return 0;
          if (entry.mount.type === 'switch' && state.automation === 'wall-switch') return 1;
          return 2;
        };
        return priority(first) - priority(second);
      });

    POLE_FACES.forEach((face) => { state.poleMounts[pole][face] = null; });
    mounts.forEach(({ face, mount }) => {
      const safeHeight = findNearestNonOverlappingHeight(state, pole, face, mount);
      if (safeHeight !== null) state.poleMounts[pole][face] = { ...mount, height: safeHeight };
    });
  });
}

function ensureRequiredAutomationMounts(state) {
  if (state.automation !== 'manual') {
    SUPPORT_POLES.forEach((pole) => {
      POLE_FACES.forEach((face) => {
        if (state.poleMounts[pole][face]?.type === 'hand-crank') state.poleMounts[pole][face] = null;
      });
    });
  }

  if (state.automation !== 'wall-switch') {
    SUPPORT_POLES.forEach((pole) => {
      POLE_FACES.forEach((face) => {
        if (state.poleMounts[pole][face]?.type === 'switch') state.poleMounts[pole][face] = null;
      });
    });
  }

  if (state.automation === 'manual') {
    const cranks = [];
    SUPPORT_POLES.forEach((pole) => {
      POLE_FACES.forEach((face) => {
        if (state.poleMounts[pole][face]?.type === 'hand-crank') cranks.push({ pole, face });
      });
    });
    cranks.slice(1).forEach(({ pole, face }) => { state.poleMounts[pole][face] = null; });
    if (cranks.length === 0) {
      const slot = findFirstMountSlot(state, 'frontRight');
      if (slot) state.poleMounts[slot.pole][slot.face] = createPoleMount('hand-crank');
    }
  }

  if (state.automation === 'wall-switch' && countPoleMounts(state, 'switch') === 0) {
    const slot = findFirstMountSlot(state, 'frontRight');
    if (slot) state.poleMounts[slot.pole][slot.face] = createPoleMount('switch');
  }
}

function normalizePoleMounts(state, incoming = {}, options = {}) {
  const shouldMigrateLegacy = options.migrateLegacy
    && !(incoming.poleMounts && typeof incoming.poleMounts === 'object');
  const source = shouldMigrateLegacy
    ? migrateLegacyPoleMounts(state, incoming)
    : deepMerge(createPoleMounts(), state.poleMounts ?? {});
  state.poleMounts = source;

  SUPPORT_POLES.forEach((pole) => {
    state.poleMounts[pole] = deepMerge(createPoleFaces(), state.poleMounts[pole] ?? {});
    POLE_FACES.forEach((face) => {
      const mount = normalizePoleMountValue(state.poleMounts[pole][face]);
      if (
        !mount
        || !poleFaceIsAvailable(state, pole, face)
        || !mountTypeAllowedForAutomation(state, mount.type)
      ) {
        state.poleMounts[pole][face] = null;
      } else {
        state.poleMounts[pole][face] = mount;
      }
    });
  });

  ensureRequiredAutomationMounts(state);
  resolvePoleMountCollisions(state);
  ensureRequiredAutomationMounts(state);
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

function getSideMountPairs(side) {
  const pairs = [];
  Object.entries(POLE_FACE_RULES).forEach(([pole, faces]) => {
    Object.entries(faces).forEach(([face, rule]) => {
      if (rule.side === side) pairs.push({ pole, face });
    });
  });
  return pairs;
}

export function sideHasMountedItems(state, side) {
  return getSideMountPairs(side).some(({ pole, face }) => Boolean(state.poleMounts?.[pole]?.[face]));
}

function normalizeState(state, incoming = {}, options = {}) {
  normalizePreferences(state, incoming, options);
  normalizeScreenSides(state, incoming);
  normalizeAccessories(state, incoming);
  ensureSensorPositions(state);
  normalizePoleMounts(state, incoming, options);
  return state;
}

function readSharedState() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('config');
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(escape(window.atob(encoded)));
    return JSON.parse(json);
  } catch (error) {
    console.warn('The shared configuration could not be decoded.', error);
    return null;
  }
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
  const match = path.match(/^poleMounts\.([^.]+)\.([^.]+)(?:\.(height|outletType))?$/);
  if (!match) return null;
  return { pole: match[1], face: match[2], field: match[3] ?? null };
}

function removeOtherHandCranks(state, pole, face) {
  SUPPORT_POLES.forEach((otherPole) => {
    POLE_FACES.forEach((otherFace) => {
      if (otherPole === pole && otherFace === face) return;
      if (state.poleMounts?.[otherPole]?.[otherFace]?.type === 'hand-crank') {
        state.poleMounts[otherPole][otherFace] = null;
      }
    });
  });
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

    const sensorMatch = path.match(/^accessories\.sensors\.(rain|wind)\.position$/);
    if (sensorMatch) {
      const sensor = sensorMatch[1];
      const other = sensor === 'rain' ? 'wind' : 'rain';
      if (this.state.accessories.sensors[other].enabled && this.state.accessories.sensors[other].position === value) {
        this.lastError = 'That roof position is already occupied by the other sensor.';
        return false;
      }
    }

    const sideMatch = path.match(/^sides\.(front|back|left|right)\.type$/);
    if (sideMatch && value !== 'none' && sideHasMountedItems(this.state, sideMatch[1])) {
      this.lastError = 'Remove the components from both connected pole faces before closing this side.';
      return false;
    }

    const mountPath = mountPathParts(path);
    let normalizedValue = value;
    if (mountPath) {
      const currentMount = this.state.poleMounts?.[mountPath.pole]?.[mountPath.face] ?? null;
      if (mountPath.field === 'height') {
        if (!currentMount) return false;
        normalizedValue = clampMountHeight(currentMount.type, value);
      } else if (mountPath.field === 'outletType') {
        if (currentMount?.type !== 'outlet') return false;
        normalizedValue = value === 'us' ? 'us' : 'eu';
      } else {
        normalizedValue = normalizePoleMountValue(value);
      }
    }

    const candidate = clone(this.state);
    setAtPath(candidate, path, normalizedValue);

    if (mountPath && !mountPath.field && normalizedValue?.type === 'hand-crank') {
      removeOtherHandCranks(candidate, mountPath.pole, mountPath.face);
    }

    if (mountPath) {
      const mount = candidate.poleMounts?.[mountPath.pole]?.[mountPath.face] ?? null;
      if (mount && !canPlacePoleMount(candidate, mountPath.pole, mountPath.face, mount.type)) {
        this.lastError = 'That component is not available on this pole face.';
        return false;
      }
      if (mount) {
        if (mountPath.field === 'height') {
          const collision = findPoleMountCollision(candidate, mountPath.pole, mountPath.face);
          if (collision) {
            this.lastError = `This height overlaps the ${collision.mount.type.replace('-', ' ')} on the ${collision.face} face.`;
            return false;
          }
        } else if (!mountPath.field) {
          const safeHeight = findNearestNonOverlappingHeight(candidate, mountPath.pole, mountPath.face, mount);
          if (safeHeight === null) {
            this.lastError = 'There is no collision-free height available on this pole. Move or remove another component first.';
            return false;
          }
          candidate.poleMounts[mountPath.pole][mountPath.face].height = safeHeight;
        }
      }
      if (candidate.automation === 'manual' && countPoleMounts(candidate, 'hand-crank') === 0) {
        this.lastError = 'Manual automation requires one hand crank. Move it to another face before replacing it.';
        return false;
      }
      if (candidate.automation === 'wall-switch' && countPoleMounts(candidate, 'switch') === 0) {
        this.lastError = 'Switch automation requires at least one switch. Add another switch before removing this one.';
        return false;
      }
    }

    const normalizedCandidate = normalizeState(candidate, candidate);

    this.recordHistory(path, meta);
    this.state = normalizedCandidate;
    this.notify({ path, ...meta });
    return true;
  }

  patch(partial, meta = {}) {
    this.recordHistory(meta.path ?? 'patch', meta);
    this.state = normalizeState(deepMerge(this.state, partial), partial);
    this.notify(meta);
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
    const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(shareState))));
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('config', encoded);
    return url.toString();
  }
}
