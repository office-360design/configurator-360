import { state } from './state.js?v=2';
import { RoofScene } from './scene.js?v=3';
import { SolarUI } from './ui.js?v=4';
import { fetchPvgisAnnual } from './energyModel.js?v=2';
import {
  getSeasonPresetDate,
  getSolarContext,
  getSunTimes,
  getTodayInTimeZone,
  nearestRegionKey,
} from './solarPosition.js?v=1';
import {
  getFallbackCurrencyRate,
  normalizeCurrency,
  normalizeUnits,
  resolveCurrencyRate,
} from './preferences.js?v=1';

const initialPreferences = window.SOLAR_SHELL_PREFERENCES || {};
state.units = normalizeUnits(initialPreferences.units ?? state.units);
state.currency = normalizeCurrency(initialPreferences.currency ?? state.currency);
state.currencyRate = getFallbackCurrencyRate(state.currency);
state.currencyRateSource = state.currency === 'RON' ? 'reference currency' : 'temporary fallback estimate';
state.currencyRateIsFallback = state.currency !== 'RON';

const host = document.querySelector('#canvasHost');
const scene = new RoofScene(host);
const VIEW_ORDER = ['perspective', 'front', 'top'];
let currentView = 'perspective';
let lastMetrics = null;
let ui = null;
let preferenceRequest = 0;
let pvgisTimer = 0;
let pvgisController = null;
let simulationFrame = 0;
let simulationStartedAt = 0;
const SIMULATION_DURATION_MS = 18000;
const PVGIS_PROXY_ENDPOINT = String(window.SOLAR_PVGIS_PROXY_ENDPOINT || '').trim();

function syncViewButtons() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle('active', view === currentView && view !== 'reset');
  });
}

function toolsSnapshot() {
  const solar = scene.lastSolarContext || getSolarContext(state, state.simulationHour);
  return {
    showDimensions: state.showDimensions,
    showCompass: state.showCompass,
    showSunPath: state.showSunPath,
    sunPosition: state.sunPosition,
    northDirection: state.northDirection,
    nightPreview: state.nightPreview,
    simulationPlaying: state.simulationPlaying,
    simulationHour: state.simulationHour,
    simulationDate: state.simulationDate,
    locationMode: state.locationMode,
    locationLat: state.locationLat,
    locationLon: state.locationLon,
    locationLabel: state.locationLabel,
    locationTimeZone: state.locationTimeZone,
    currentView,
    units: state.units,
    currency: state.currency,
    solarElevationDeg: solar.elevationDeg,
    solarAzimuthDeg: solar.azimuthDeg,
    sunriseLabel: solar.times.sunriseLabel,
    sunsetLabel: solar.times.sunsetLabel,
    solarNoonLabel: solar.times.solarNoonLabel,
    daylightHours: solar.times.daylightHours,
    activeLocationLabel: solar.location.label,
    activeLocationLat: solar.location.lat,
    activeLocationLon: solar.location.lon,
    automaticNight: !solar.isDaylight,
  };
}

function emitToolsState() {
  window.dispatchEvent(new CustomEvent('solar-tools-state-change', { detail: toolsSnapshot() }));
}

async function refreshCurrencyRate(currency) {
  const requestId = ++preferenceRequest;
  const rateInfo = await resolveCurrencyRate(currency);
  if (requestId !== preferenceRequest || normalizeCurrency(currency) !== state.currency) return;
  state.currencyRate = rateInfo.rate;
  state.currencyRateDate = rateInfo.date || null;
  state.currencyRateSource = rateInfo.source;
  state.currencyRateIsFallback = Boolean(rateInfo.isFallback);
  ui?.setPreferences();
}

function applyShellPreferences(preferences = {}) {
  const nextUnits = normalizeUnits(preferences.units ?? state.units);
  const nextCurrency = normalizeCurrency(preferences.currency ?? state.currency);
  const unitsChanged = nextUnits !== state.units;
  const currencyChanged = nextCurrency !== state.currency;
  state.units = nextUnits;
  state.currency = nextCurrency;

  if (currencyChanged) {
    state.currencyRate = getFallbackCurrencyRate(nextCurrency);
    state.currencyRateDate = null;
    state.currencyRateSource = nextCurrency === 'RON' ? 'reference currency' : 'temporary fallback estimate';
    state.currencyRateIsFallback = nextCurrency !== 'RON';
  }

  if (unitsChanged) ui?.syncDimensionControls();
  ui?.setPreferences();
  if (currencyChanged) refreshCurrencyRate(nextCurrency);
}

function schedulePvgis() {
  window.clearTimeout(pvgisTimer);
  pvgisController?.abort();
  state.pvgisAnnualKWh = null;

  if (!PVGIS_PROXY_ENDPOINT) {
    state.pvgisStatus = 'calibrated';
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    return;
  }

  state.pvgisStatus = 'loading';
  if (lastMetrics) ui?.updateMetrics(lastMetrics);
  pvgisTimer = window.setTimeout(async () => {
    if (!lastMetrics?.systemKwp) return;
    pvgisController = new AbortController();
    try {
      const result = await fetchPvgisAnnual(state, lastMetrics, pvgisController.signal, PVGIS_PROXY_ENDPOINT);
      state.pvgisAnnualKWh = result.annualKWh;
      state.pvgisStatus = 'ready';
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.info('[Solar configurator] PVGIS proxy unavailable; using calibrated regional model.', error);
      state.pvgisAnnualKWh = null;
      state.pvgisStatus = 'fallback';
    }
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
  }, 650);
}

function rebuild({ fitCamera = false, scene: rebuildScene = true, pvgis = false } = {}) {
  if (rebuildScene || !lastMetrics) {
    lastMetrics = scene.rebuild(state, fitCamera);
  }
  scene.setEnvironment(state);
  scene.setCompassVisible(state.showCompass);
  if (fitCamera) {
    currentView = 'perspective';
    syncViewButtons();
  }
  ui?.updateMetrics(lastMetrics);
  emitToolsState();
  if (pvgis) schedulePvgis();
  return lastMetrics;
}

function applyView(view) {
  if (!VIEW_ORDER.includes(view)) return currentView;
  currentView = view;
  scene.setView(view, state, lastMetrics.ridgeElevation);
  syncViewButtons();
  emitToolsState();
  return currentView;
}

function stopSimulation({ keepHour = true } = {}) {
  if (simulationFrame) cancelAnimationFrame(simulationFrame);
  simulationFrame = 0;
  simulationStartedAt = 0;
  state.simulationPlaying = false;
  if (!keepHour) state.simulationHour = 12;
  scene.setEnvironment(state);
  ui?.updateInstantaneous(state.simulationHour);
  emitToolsState();
}

function animateSimulation(now) {
  if (!state.simulationPlaying) return;
  if (!simulationStartedAt) simulationStartedAt = now;
  const progress = Math.min(1, (now - simulationStartedAt) / SIMULATION_DURATION_MS);
  state.simulationHour = Math.min(23.9833, progress * 24);
  state.sunPosition = progress * 100;
  scene.setEnvironment(state);
  ui?.updateInstantaneous(state.simulationHour);
  emitToolsState();

  if (progress >= 1) {
    stopSimulation({ keepHour: true });
    return;
  }
  simulationFrame = requestAnimationFrame(animateSimulation);
}

function startSimulation() {
  stopSimulation({ keepHour: true });
  state.simulationHour = 0;
  state.sunPosition = 0;
  state.simulationPlaying = true;
  simulationStartedAt = 0;
  scene.setEnvironment(state);
  ui?.updateInstantaneous(0);
  emitToolsState();
  simulationFrame = requestAnimationFrame(animateSimulation);
}

ui = new SolarUI(state, rebuild);
lastMetrics = scene.rebuild(state, true);
scene.setEnvironment(state);
scene.setCompassVisible(state.showCompass);
ui.updateMetrics(lastMetrics);
ui.setPreferences();
syncViewButtons();
refreshCurrencyRate(state.currency);
schedulePvgis();

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view === 'reset') {
      currentView = 'perspective';
      scene.fitCamera(state, lastMetrics.ridgeElevation);
      syncViewButtons();
      emitToolsState();
      return;
    }
    applyView(view);
  });
});

const configuratorApi = {
  getState() {
    return toolsSnapshot();
  },

  setDimensionsVisible(visible) {
    state.showDimensions = Boolean(visible);
    rebuild({ fitCamera: false, pvgis: false });
    return state.showDimensions;
  },
  toggleDimensions() { return this.setDimensionsVisible(!state.showDimensions); },

  setCompassVisible(visible) {
    state.showCompass = Boolean(visible);
    scene.setCompassVisible(state.showCompass);
    emitToolsState();
    return state.showCompass;
  },
  toggleCompass() { return this.setCompassVisible(!state.showCompass); },

  setSunPathVisible(visible) {
    state.showSunPath = Boolean(visible);
    scene.setEnvironment(state);
    emitToolsState();
    return state.showSunPath;
  },
  toggleSunPath() { return this.setSunPathVisible(!state.showSunPath); },

  setSimulationHour(value) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    state.simulationHour = Math.min(23.9833, Math.max(0, Number(value) || 0));
    state.sunPosition = (state.simulationHour / 24) * 100;
    scene.setEnvironment(state);
    ui?.updateInstantaneous(state.simulationHour);
    emitToolsState();
    return state.simulationHour;
  },

  // Backwards-compatible percentage API used by older embedded shells.
  setSunPosition(value) {
    const pct = Math.min(100, Math.max(0, Number(value) || 0));
    const times = getSunTimes(state);
    const start = Number.isFinite(times.sunriseHour) ? times.sunriseHour : 6;
    const end = Number.isFinite(times.sunsetHour) ? times.sunsetHour : 18;
    return this.setSimulationHour(start + (end - start) * (pct / 100));
  },

  setNorthDirection(value) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    const number = Number(value) || 0;
    state.northDirection = ((number % 360) + 360) % 360;
    rebuild({ fitCamera: false, pvgis: true });
    return state.northDirection;
  },

  setSimulationDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return state.simulationDate;
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    state.simulationDate = String(dateString);
    rebuild({ fitCamera: false, scene: false, pvgis: false });
    return state.simulationDate;
  },

  setSeasonPreset(season) {
    return this.setSimulationDate(getSeasonPresetDate(state.simulationDate, season));
  },

  setToday() {
    return this.setSimulationDate(getTodayInTimeZone(state.locationTimeZone));
  },

  setLocation({ lat, lon, label } = {}) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    state.locationMode = 'exact';
    state.locationLat = latitude;
    state.locationLon = longitude;
    state.locationLabel = String(label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    state.region = nearestRegionKey(latitude, longitude);
    rebuild({ fitCamera: false, scene: false, pvgis: true });
    return { lat: latitude, lon: longitude, label: state.locationLabel };
  },

  useRegionalLocation(regionKey = state.region) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    if (regionKey) state.region = regionKey;
    state.locationMode = 'region';
    rebuild({ fitCamera: false, scene: false, pvgis: true });
    return state.region;
  },

  setNightPreview(enabled) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    state.nightPreview = Boolean(enabled);
    scene.setEnvironment(state);
    emitToolsState();
    return state.nightPreview;
  },

  setOrientation(view) { return applyView(view); },
  cycleOrientation() {
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    return applyView(VIEW_ORDER[(currentIndex + 1) % VIEW_ORDER.length]);
  },

  startSimulation,
  stopSimulation,
  toggleSimulation() {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    else startSimulation();
    return state.simulationPlaying;
  },
};

window.addEventListener('solar-preference-change', (event) => {
  applyShellPreferences(event.detail?.preferences || event.detail || {});
});

window.SOLAR_CONFIGURATOR_API = configuratorApi;
window.dispatchEvent(new CustomEvent('solar-configurator-ready', { detail: configuratorApi.getState() }));
emitToolsState();
