import { state } from './state.js?v=14';
import { RoofScene } from './scene.js?v=16';
import { RoofUI } from './ui.js?v=14';
import {
  getFallbackCurrencyRate,
  normalizeCurrency,
  normalizeUnits,
  resolveCurrencyRate,
} from './preferences.js?v=1';

const initialPreferences = window.ROOF_SHELL_PREFERENCES || {};
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

function syncViewButtons() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle('active', view === currentView && view !== 'reset');
  });
}

function emitToolsState() {
  window.dispatchEvent(new CustomEvent('roof-tools-state-change', {
    detail: {
      roofType: state.roofType,
      dimensionsAvailable: state.roofType !== 'custom',
      showDimensions: state.showDimensions,
      showCompass: state.showCompass,
      sunPosition: state.sunPosition,
      northDirection: state.northDirection,
      nightPreview: state.nightPreview,
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

  if (unitsChanged && lastMetrics) {
    rebuild({ fitCamera: false });
    ui?.syncDimensionControls();
  } else {
    ui?.setPreferences();
  }

  if (currencyChanged) refreshCurrencyRate(nextCurrency);
}

function rebuild({ fitCamera = false } = {}) {
  lastMetrics = scene.rebuild(state, fitCamera);
  scene.setEnvironment(state);
  scene.setCompassVisible(state.showCompass);
  if (fitCamera) {
    currentView = 'perspective';
    syncViewButtons();
  }
  ui?.updateMetrics(lastMetrics);
  emitToolsState();
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

ui = new RoofUI(state, rebuild);
lastMetrics = scene.rebuild(state, true);
scene.setEnvironment(state);
scene.setCompassVisible(state.showCompass);
ui.updateMetrics(lastMetrics);
ui.setPreferences();
syncViewButtons();
refreshCurrencyRate(state.currency);

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
      roofType: state.roofType,
      dimensionsAvailable: state.roofType !== 'custom',
      showDimensions: state.showDimensions,
      showCompass: state.showCompass,
      sunPosition: state.sunPosition,
      northDirection: state.northDirection,
      nightPreview: state.nightPreview,
      currentView,
      units: state.units,
      currency: state.currency,
    };
  },

  setDimensionsVisible(visible) {
    if (state.roofType === 'custom') return state.showDimensions;
    state.showDimensions = Boolean(visible);
    rebuild({ fitCamera: false });
    return state.showDimensions;
  },

  toggleDimensions() {
    return this.setDimensionsVisible(!state.showDimensions);
  },

  setCompassVisible(visible) {
    state.showCompass = Boolean(visible);
    scene.setCompassVisible(state.showCompass);
    emitToolsState();
    return state.showCompass;
  },

  toggleCompass() {
    return this.setCompassVisible(!state.showCompass);
  },

  setSunPosition(value) {
    state.sunPosition = Math.min(100, Math.max(0, Number(value) || 0));
    scene.setEnvironment(state);
    emitToolsState();
    return state.sunPosition;
  },

  setNorthDirection(value) {
    const number = Number(value) || 0;
    state.northDirection = Math.min(360, Math.max(0, number));
    scene.setEnvironment(state);
    emitToolsState();
    return state.northDirection;
  },

  setNightPreview(enabled) {
    state.nightPreview = Boolean(enabled);
    scene.setEnvironment(state);
    emitToolsState();
    return state.nightPreview;
  },

  setOrientation(view) {
    return applyView(view);
  },

  cycleOrientation() {
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    return applyView(VIEW_ORDER[(currentIndex + 1) % VIEW_ORDER.length]);
  },
};

window.addEventListener('roof-preference-change', (event) => {
  applyShellPreferences(event.detail?.preferences || event.detail || {});
});

window.ROOF_CONFIGURATOR_API = configuratorApi;
window.dispatchEvent(new CustomEvent('roof-configurator-ready', { detail: configuratorApi.getState() }));
emitToolsState();
