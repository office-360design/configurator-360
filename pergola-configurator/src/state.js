const STORAGE_KEY = 'pergola-configurator:v4';
const LEGACY_STORAGE_KEYS = ['pergola-configurator:v3', 'pergola-configurator:v2', 'pergola-configurator:v1'];

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

const MIN_MOUNT_HEIGHT = 10;
const MAX_MOUNT_HEIGHT = 80;
const MOUNT_CLEARANCE = 12;
const SPEAKER_HEIGHT = 78;

const POLE_FACE_RULES = Object.freeze({
  frontLeft: {
    front: { exterior: true },
    left: { exterior: true },
    back: { side: 'front' },
    right: { side: 'left' },
  },
  frontRight: {
    front: { exterior: true },
    right: { exterior: true },
    back: { side: 'front' },
    left: { side: 'right' },
  },
  backLeft: {
    back: { exterior: true },
    left: { exterior: true },
    front: { side: 'back' },
    right: { side: 'left' },
  },
  backRight: {
    back: { exterior: true },
    right: { exterior: true },
    front: { side: 'back' },
    left: { side: 'right' },
  },
});

const FACE_PREFERENCE = Object.freeze({
  frontLeft: ['right', 'back', 'front', 'left'],
  frontRight: ['left', 'back', 'front', 'right'],
  backLeft: ['right', 'front', 'back', 'left'],
  backRight: ['left', 'front', 'back', 'right'],
});

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

function createOutletMount(type = 'eu', height = 50) {
  return { type, height };
}

function createPoleOutlets() {
  return { front: null, right: null, back: null, left: null };
}

function createOutlets() {
  return {
    frontLeft: createPoleOutlets(),
    frontRight: createPoleOutlets(),
    backLeft: createPoleOutlets(),
    backRight: createPoleOutlets(),
  };
}

function createWallSwitches() {
  return {
    frontLeft: null,
    frontRight: 55,
    backLeft: null,
    backRight: null,
  };
}

export const DEFAULT_STATE = Object.freeze({
  step: 0,
  model: 'premium',
  installation: 'freestanding',
  mountedSide: 'back',
  units: 'metric',
  dimensions: { width: 5000, depth: 3500, height: 2700 },
  roof: {
    orientation: 'width',
    frameColor: '#26343c',
    louverColor: '#64727b',
    louverTilt: 28,
    drainage: 'integrated',
  },
  automation: 'remote',
  automationSettings: {
    manual: { pole: 'frontRight', height: 55 },
    wallSwitches: createWallSwitches(),
  },
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
    speakers: { frontLeft: false, frontRight: false, backLeft: false, backRight: false },
    outlets: createOutlets(),
  },
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

function clampHeight(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(MAX_MOUNT_HEIGHT, Math.max(MIN_MOUNT_HEIGHT, number)));
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

function normalizeAutomation(state) {
  const defaults = clone(DEFAULT_STATE.automationSettings);
  state.automationSettings = deepMerge(defaults, state.automationSettings ?? {});
  const manual = state.automationSettings.manual;
  if (!SUPPORT_POLES.includes(manual.pole) || !poleIsAvailable(state, manual.pole)) {
    manual.pole = SUPPORT_POLES.find((pole) => poleIsAvailable(state, pole)) ?? 'frontRight';
  }
  manual.height = clampHeight(manual.height, 55);

  SUPPORT_POLES.forEach((pole) => {
    const value = state.automationSettings.wallSwitches[pole];
    state.automationSettings.wallSwitches[pole] = value === null || value === false || value === 'off'
      ? null
      : clampHeight(value, 55);
    if (!poleIsAvailable(state, pole)) state.automationSettings.wallSwitches[pole] = null;
  });
}

function normalizeOutletValue(value) {
  if (value === null || value === false || value === 'off' || value === '') return null;
  if (typeof value === 'number') return createOutletMount('eu', clampHeight(value, 50));
  if (typeof value === 'object') {
    return createOutletMount(
      value.type === 'us' ? 'us' : 'eu',
      clampHeight(value.height ?? value.level ?? value.position ?? 50, 50),
    );
  }
  return createOutletMount('eu', 50);
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

  if (typeof legacy.speakers === 'boolean') {
    current.speakers = { ...defaults.speakers };
    if (legacy.speakers) {
      current.speakers.frontLeft = true;
      current.speakers.frontRight = true;
    }
  } else {
    current.speakers = deepMerge(defaults.speakers, current.speakers ?? {});
  }

  current.outlets = deepMerge(defaults.outlets, current.outlets ?? {});
  SUPPORT_POLES.forEach((pole) => {
    POLE_FACES.forEach((face) => {
      current.outlets[pole][face] = normalizeOutletValue(current.outlets[pole][face]);
    });
  });

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
    (state.mountedSide === 'front' && pole.startsWith('front')) ||
    (state.mountedSide === 'back' && pole.startsWith('back')) ||
    (state.mountedSide === 'left' && pole.endsWith('Left')) ||
    (state.mountedSide === 'right' && pole.endsWith('Right'))
  );
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

function heightConflict(a, b, clearance = MOUNT_CLEARANCE) {
  return a !== null && b !== null && Math.abs(Number(a) - Number(b)) < clearance;
}

function outletHeight(mount) {
  return mount && typeof mount === 'object' ? mount.height : null;
}

function outletBlocksFace(state, pole, face, height) {
  return heightConflict(outletHeight(state.accessories.outlets?.[pole]?.[face]), height);
}

export function resolveSpeakerFace(state, pole) {
  if (!poleIsAvailable(state, pole)) return null;
  const candidates = FACE_PREFERENCE[pole] ?? POLE_FACES;
  return candidates.find((face) => (
    poleFaceIsAvailable(state, pole, face) && !outletBlocksFace(state, pole, face, SPEAKER_HEIGHT)
  )) ?? null;
}

export function resolvePoleMountFace(state, kind, pole, height) {
  if (!poleIsAvailable(state, pole)) return null;
  const normalizedHeight = clampHeight(height, 55);
  const speakerFace = state.accessories.speakers?.[pole] ? resolveSpeakerFace(state, pole) : null;
  const candidates = FACE_PREFERENCE[pole] ?? POLE_FACES;

  return candidates.find((face) => {
    if (!poleFaceIsAvailable(state, pole, face)) return false;
    if (outletBlocksFace(state, pole, face, normalizedHeight)) return false;
    if (kind !== 'speaker' && speakerFace === face && heightConflict(SPEAKER_HEIGHT, normalizedHeight)) return false;
    return true;
  }) ?? null;
}

function activeAutomationMountIsValid(state) {
  if (state.automation === 'manual') {
    const { pole, height } = state.automationSettings.manual;
    return Boolean(resolvePoleMountFace(state, 'manual', pole, height));
  }
  if (state.automation === 'wall-switch') {
    return SUPPORT_POLES.every((pole) => {
      const height = state.automationSettings.wallSwitches[pole];
      return height === null || Boolean(resolvePoleMountFace(state, 'switch', pole, height));
    });
  }
  return true;
}

function speakersAreValid(state) {
  return SUPPORT_POLES.every((pole) => (!state.accessories.speakers[pole] || Boolean(resolveSpeakerFace(state, pole))));
}

export function canPlaceOutlet(state, pole, face, mountOrHeight) {
  if (!poleFaceIsAvailable(state, pole, face)) return false;
  const candidate = clone(state);
  candidate.accessories.outlets[pole][face] = normalizeOutletValue(mountOrHeight);
  return speakersAreValid(candidate) && activeAutomationMountIsValid(candidate);
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

function sideHasMountedItems(state, side) {
  const pairs = getSideMountPairs(side);
  return pairs.some(({ pole, face }) => {
    if (state.accessories.outlets?.[pole]?.[face]) return true;
    if (state.accessories.speakers?.[pole] && resolveSpeakerFace(state, pole) === face) return true;
    if (state.automation === 'manual') {
      const manual = state.automationSettings.manual;
      if (manual.pole === pole && resolvePoleMountFace(state, 'manual', pole, manual.height) === face) return true;
    }
    if (state.automation === 'wall-switch') {
      const height = state.automationSettings.wallSwitches[pole];
      if (height !== null && resolvePoleMountFace(state, 'switch', pole, height) === face) return true;
    }
    return false;
  });
}

function normalizePoleMountedItems(state) {
  SUPPORT_POLES.forEach((pole) => {
    if (!poleIsAvailable(state, pole)) {
      state.accessories.speakers[pole] = false;
      state.automationSettings.wallSwitches[pole] = null;
      POLE_FACES.forEach((face) => { state.accessories.outlets[pole][face] = null; });
      return;
    }
    POLE_FACES.forEach((face) => {
      if (!poleFaceIsAvailable(state, pole, face)) state.accessories.outlets[pole][face] = null;
    });
    if (state.accessories.speakers[pole] && !resolveSpeakerFace(state, pole)) state.accessories.speakers[pole] = false;
  });

  const manual = state.automationSettings.manual;
  if (!poleIsAvailable(state, manual.pole)) {
    manual.pole = SUPPORT_POLES.find((pole) => poleIsAvailable(state, pole)) ?? 'frontRight';
  }
  if (state.automation === 'manual' && !resolvePoleMountFace(state, 'manual', manual.pole, manual.height)) {
    const replacement = SUPPORT_POLES.find((pole) => poleIsAvailable(state, pole) && resolvePoleMountFace(state, 'manual', pole, manual.height));
    if (replacement) manual.pole = replacement;
  }

  if (state.automation === 'wall-switch') {
    SUPPORT_POLES.forEach((pole) => {
      const height = state.automationSettings.wallSwitches[pole];
      if (height !== null && !resolvePoleMountFace(state, 'switch', pole, height)) {
        state.automationSettings.wallSwitches[pole] = null;
      }
    });
  }
}

function normalizeState(state, incoming = {}, options = {}) {
  normalizeScreenSides(state, incoming);
  normalizeAutomation(state);
  normalizeAccessories(state, incoming);
  ensureSensorPositions(state);
  if (options.resolveMounts !== false) normalizePoleMountedItems(state);
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

export class ConfiguratorStore {
  constructor() {
    const incoming = readSharedState() ?? readStoredState() ?? {};
    this.state = normalizeState(deepMerge(clone(DEFAULT_STATE), incoming), incoming);
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

    let normalizedValue = value;
    if (
      path === 'automationSettings.manual.height' ||
      path.match(/^automationSettings\.wallSwitches\.[^.]+$/) ||
      path.match(/^accessories\.outlets\.[^.]+\.[^.]+\.height$/)
    ) {
      normalizedValue = value === null || value === false || value === 'off' || value === '' ? null : clampHeight(value, 50);
    }
    if (path.match(/^accessories\.outlets\.[^.]+\.[^.]+\.type$/)) {
      normalizedValue = value === 'us' ? 'us' : 'eu';
    }

    const candidate = clone(this.state);
    setAtPath(candidate, path, normalizedValue);

    const strictMountUpdate = Boolean(path.match(/^(accessories\.(outlets|speakers)|automationSettings\.(manual|wallSwitches))/));
    normalizeState(candidate, candidate, { resolveMounts: !strictMountUpdate });

    const sideMatch = path.match(/^sides\.(front|back|left|right)\.type$/);
    if (sideMatch && value !== 'none') {
      const side = sideMatch[1];
      if (sideHasMountedItems(candidate, side)) {
        this.lastError = 'That side must remain open until the pole-mounted accessories on it are removed.';
        return false;
      }
    }

    const outletMatch = path.match(/^accessories\.outlets\.([^.]+)\.([^.]+)(?:\.(height|type))?$/);
    if (outletMatch) {
      const [, pole, face] = outletMatch;
      const mount = candidate.accessories.outlets[pole][face];
      if (mount !== null && !canPlaceOutlet(candidate, pole, face, mount)) {
        this.lastError = 'This outlet would overlap another pole accessory or a side closing.';
        return false;
      }
    }

    const switchMatch = path.match(/^automationSettings\.wallSwitches\.([^.]+)$/);
    if (switchMatch && normalizedValue !== null) {
      const pole = switchMatch[1];
      if (!resolvePoleMountFace(candidate, 'switch', pole, normalizedValue)) {
        this.lastError = 'No unobstructed mounting face is available at this switch height.';
        return false;
      }
    }

    if (path === 'automationSettings.manual.pole' || path === 'automationSettings.manual.height') {
      const { pole, height } = candidate.automationSettings.manual;
      if (!resolvePoleMountFace(candidate, 'manual', pole, height)) {
        this.lastError = 'No unobstructed mounting face is available for the hand crank there.';
        return false;
      }
    }

    if (path.match(/^accessories\.speakers\.[^.]+$/) && normalizedValue) {
      const pole = path.split('.').at(-1);
      if (!resolveSpeakerFace(candidate, pole) || !activeAutomationMountIsValid(candidate)) {
        this.lastError = 'The selected pole has no collision-free face for a speaker.';
        return false;
      }
    }

    this.recordHistory(path, meta);
    this.state = candidate;
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
