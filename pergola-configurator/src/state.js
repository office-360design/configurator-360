const STORAGE_KEY = 'pergola-configurator:v2';
const LEGACY_STORAGE_KEY = 'pergola-configurator:v1';

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

function createScreenSettings() {
  return {
    screen: {
      openness: 50,
      color: '#67757d',
    },
    'motorized-screen': {
      openness: 50,
      color: '#34444c',
    },
  };
}

function createSide() {
  return {
    type: 'none',
    screenSettings: createScreenSettings(),
  };
}

function createPoleOutlets() {
  return {
    front: null,
    right: null,
    back: null,
    left: null,
  };
}

function createOutlets() {
  return {
    frontLeft: createPoleOutlets(),
    frontRight: createPoleOutlets(),
    backLeft: createPoleOutlets(),
    backRight: createPoleOutlets(),
  };
}

export const DEFAULT_STATE = Object.freeze({
  step: 0,
  model: 'premium',
  installation: 'freestanding',
  mountedSide: 'back',
  units: 'metric',
  dimensions: {
    width: 5000,
    depth: 3500,
    height: 2700,
  },
  roof: {
    orientation: 'width',
    frameColor: '#26343c',
    louverColor: '#64727b',
    louverTilt: 28,
    drainage: 'integrated',
  },
  automation: 'remote',
  services: {
    transportation: false,
    assembly: false,
    warranty: true,
  },
  sides: {
    front: createSide(),
    back: createSide(),
    left: createSide(),
    right: createSide(),
  },
  accessories: {
    perimeterLed: {
      enabled: false,
      color: '#fff1b4',
    },
    spotlights: 0,
    heaters: {
      front: false,
      back: false,
      left: false,
      right: false,
    },
    sensors: {
      rain: {
        enabled: false,
        position: 'front-left',
      },
      wind: {
        enabled: false,
        position: 'back-right',
      },
    },
    speakers: {
      frontLeft: false,
      frontRight: false,
      backLeft: false,
      backRight: false,
    },
    outlets: createOutlets(),
  },
  environment: {
    sunPosition: 0.35,
    northDirection: 0,
    night: false,
    season: 'winter',
  },
  view: {
    dimensionsVisible: true,
    cameraPreset: 'perspective',
  },
  customer: {
    name: '',
    email: '',
    phone: '',
    postcode: '',
    notes: '',
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  const output = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target?.[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], value);
    } else {
      output[key] = value;
    }
  });
  return output;
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
      if (typeof settings.color !== 'string') {
        settings.color = createScreenSettings()[type].color;
      }
    });

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
    current.perimeterLed = {
      ...defaults.perimeterLed,
      enabled: legacy.perimeterLed,
    };
  } else {
    current.perimeterLed = deepMerge(defaults.perimeterLed, current.perimeterLed ?? {});
  }

  current.spotlights = Math.min(12, Math.max(0, Number(current.spotlights) || 0));

  if (typeof legacy.heaters === 'number') {
    const order = ['front', 'back', 'left', 'right'];
    current.heaters = { ...defaults.heaters };
    order.slice(0, Math.min(4, Math.max(0, legacy.heaters))).forEach((side) => {
      current.heaters[side] = true;
    });
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
      const value = current.outlets[pole][face];
      current.outlets[pole][face] = ['10', '50', '80'].includes(String(value))
        ? String(value)
        : null;
    });
  });

  state.accessories = current;
  delete state.accessories.rainSensor;
  delete state.accessories.windSensor;
}

function findFreeSensorPosition(state, unavailable) {
  return SENSOR_POSITIONS.find((position) => position !== unavailable)
    ?? SENSOR_POSITIONS[0];
}

function ensureSensorPositions(state) {
  const sensors = state.accessories.sensors;
  if (!SENSOR_POSITIONS.includes(sensors.rain.position)) {
    sensors.rain.position = DEFAULT_STATE.accessories.sensors.rain.position;
  }
  if (!SENSOR_POSITIONS.includes(sensors.wind.position)) {
    sensors.wind.position = DEFAULT_STATE.accessories.sensors.wind.position;
  }

  if (
    sensors.rain.enabled &&
    sensors.wind.enabled &&
    sensors.rain.position === sensors.wind.position
  ) {
    sensors.wind.position = findFreeSensorPosition(state, sensors.rain.position);
  }
}

function normalizeState(state, incoming = {}) {
  normalizeScreenSides(state, incoming);
  normalizeAccessories(state, incoming);
  ensureSensorPositions(state);
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
    const raw = window.localStorage.getItem(STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Stored configuration could not be loaded.', error);
    return null;
  }
}

export function poleIsAvailable(state, pole) {
  if (state.installation !== 'wall-mounted') return true;
  return !(
    (state.mountedSide === 'front' && pole.startsWith('front')) ||
    (state.mountedSide === 'back' && pole.startsWith('back')) ||
    (state.mountedSide === 'left' && pole.endsWith('Left')) ||
    (state.mountedSide === 'right' && pole.endsWith('Right'))
  );
}

export class ConfiguratorStore {
  constructor() {
    const incoming = readSharedState() ?? readStoredState() ?? {};
    this.state = normalizeState(deepMerge(clone(DEFAULT_STATE), incoming), incoming);
    this.listeners = new Set();
  }

  get() {
    return this.state;
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
    const sensorMatch = path.match(/^accessories\.sensors\.(rain|wind)\.position$/);
    if (sensorMatch) {
      const sensor = sensorMatch[1];
      const other = sensor === 'rain' ? 'wind' : 'rain';
      if (
        this.state.accessories.sensors[other].enabled &&
        this.state.accessories.sensors[other].position === value
      ) {
        return false;
      }
    }

    const parts = path.split('.');
    let cursor = this.state;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      cursor[part] ??= {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = value;

    if (path.match(/^accessories\.sensors\.(rain|wind)\.enabled$/)) {
      ensureSensorPositions(this.state);
    }

    this.notify({ path, ...meta });
    return true;
  }

  patch(partial, meta = {}) {
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
    this.state = clone(DEFAULT_STATE);
    window.history.replaceState({}, '', window.location.pathname);
    this.notify({ reset: true });
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
