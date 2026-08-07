import { state } from './state.js?v=1';
import { RoofScene } from './scene.js?v=2';
import { SolarUI } from './ui.js?v=3';
import { fetchPvgisAnnual } from './energyModel.js?v=1';
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

function emitToolsState() {
  window.dispatchEvent(new CustomEvent('solar-tools-state-change', {
    detail: {
      showDimensions: state.showDimensions,
      showCompass: state.showCompass,
      sunPosition: state.sunPosition,
      northDirection: state.northDirection,
      nightPreview: state.nightPreview,
      simulationPlaying: state.simulationPlaying,
      simulationHour: state.simulationHour,
      currentView,
    },
  }));
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

  // JRC explicitly blocks browser AJAX access to PVGIS. Static deployments
  // therefore use the calibrated regional model unless a same-origin/server
  // proxy endpoint is supplied by the host application.
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
  ui?.updateInstantaneous(state.simulationHour);
  emitToolsState();
}

function animateSimulation(now) {
  if (!state.simulationPlaying) return;
  if (!simulationStartedAt) simulationStartedAt = now;
  const progress = Math.min(1, (now - simulationStartedAt) / SIMULATION_DURATION_MS);
  const hour = progress * 24;
  state.simulationHour = Math.min(23.99, hour);

  if (hour >= 6 && hour <= 18) {
    state.nightPreview = false;
    state.sunPosition = ((hour - 6) / 12) * 100;
  } else {
    state.nightPreview = true;
    state.sunPosition = hour < 6 ? 0 : 100;
  }
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
  state.simulationPlaying = true;
  simulationStartedAt = 0;
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
    return {
      showDimensions: state.showDimensions,
      showCompass: state.showCompass,
      sunPosition: state.sunPosition,
      northDirection: state.northDirection,
      nightPreview: state.nightPreview,
      simulationPlaying: state.simulationPlaying,
      simulationHour: state.simulationHour,
      currentView,
      units: state.units,
      currency: state.currency,
    };
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

  setSunPosition(value) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    state.sunPosition = Math.min(100, Math.max(0, Number(value) || 0));
    state.simulationHour = 6 + (state.sunPosition / 100) * 12;
    state.nightPreview = false;
    scene.setEnvironment(state);
    ui?.updateInstantaneous(state.simulationHour);
    emitToolsState();
    return state.sunPosition;
  },

  setNorthDirection(value) {
    const number = Number(value) || 0;
    state.northDirection = ((number % 360) + 360) % 360;
    rebuild({ fitCamera: false, pvgis: true });
    return state.northDirection;
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
