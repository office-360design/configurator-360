import { state, pitchRules, roofNames } from './state.js?v=16';
import { RoofScene } from './scene.js?v=18';
import { RoofUI } from './ui.js?v=17';
import {
  getFallbackCurrencyRate,
  normalizeCurrency,
  normalizeUnits,
  resolveCurrencyRate,
} from './preferences.js?v=2';
import { readShareState } from '../../shared-ui/src/shareState.js?v=4';
import { applyRoofTranslations, resolveRoofLocale } from './i18n.js?v=1';

const VIEW_ORDER = ['perspective', 'front', 'top'];
const DEFAULT_ROOF_STATE = structuredClone(state);
const ROOF_SHARE_NUMBERS = ['length', 'depth', 'wallHeight', 'pitch', 'overhang', 'sunPosition', 'northDirection'];
const ROOF_SHARE_BOOLEANS = ['showDimensions', 'technicalEdges', 'showCompass', 'nightPreview'];

function applySharedRoofState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (Object.prototype.hasOwnProperty.call(roofNames, snapshot.roofType)) state.roofType = snapshot.roofType;
  if (Object.prototype.hasOwnProperty.call(pitchRules, snapshot.covering)) state.covering = snapshot.covering;
  if (typeof snapshot.roofColor === 'string' && /^#[0-9a-f]{6}$/i.test(snapshot.roofColor)) state.roofColor = snapshot.roofColor;

  ROOF_SHARE_NUMBERS.forEach((key) => {
    const value = Number(snapshot[key]);
    if (Number.isFinite(value)) state[key] = value;
  });
  ROOF_SHARE_BOOLEANS.forEach((key) => {
    if (typeof snapshot[key] === 'boolean') state[key] = snapshot[key];
  });

  if (snapshot.customPlan === null || (snapshot.customPlan && typeof snapshot.customPlan === 'object')) {
    state.customPlan = snapshot.customPlan ? structuredClone(snapshot.customPlan) : null;
  }
  if (Array.isArray(snapshot.excludedBomItems)) {
    state.excludedBomItems = snapshot.excludedBomItems.filter((item) => typeof item === 'string');
  }

  const rule = pitchRules[state.covering] ?? pitchRules.generic;
  state.pitch = Math.max(rule.minimum, state.pitch);
}

const sharedRoofState = await readShareState({ productType: 'roof' });
applySharedRoofState(sharedRoofState);

const initialPreferences = window.ROOF_SHELL_PREFERENCES || {};
state.units = normalizeUnits(initialPreferences.units ?? state.units);
state.currency = normalizeCurrency(initialPreferences.currency ?? state.currency);
state.locale = resolveRoofLocale(initialPreferences.locale ?? state.locale);
applyRoofTranslations(state.locale);
state.currencyRate = getFallbackCurrencyRate(state.currency);
state.currencyRateSource = state.currency === 'RON' ? 'reference' : 'temporary-fallback';
state.currencyRateIsFallback = state.currency !== 'RON';

const host = document.querySelector('#canvasHost');
const scene = new RoofScene(host);
scene.setLocale(state.locale);
let currentView = VIEW_ORDER.includes(sharedRoofState?.currentView) ? sharedRoofState.currentView : 'perspective';
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
      technicalEdges: state.technicalEdges,
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
  const nextLocale = resolveRoofLocale(preferences.locale ?? state.locale);
  const unitsChanged = nextUnits !== state.units;
  const currencyChanged = nextCurrency !== state.currency;
  const localeChanged = nextLocale !== state.locale;

  state.units = nextUnits;
  state.currency = nextCurrency;
  state.locale = nextLocale;

  if (localeChanged) {
    applyRoofTranslations(state.locale);
    scene.setLocale(state.locale);
  }

  if (currencyChanged) {
    state.currencyRate = getFallbackCurrencyRate(nextCurrency);
    state.currencyRateDate = null;
    state.currencyRateSource = nextCurrency === 'RON' ? 'reference' : 'temporary-fallback';
    state.currencyRateIsFallback = nextCurrency !== 'RON';
  }

  if (unitsChanged && lastMetrics) {
    rebuild({ fitCamera: false });
    ui?.syncDimensionControls();
  } else {
    ui?.setPreferences();
  }

  if (localeChanged) emitToolsState();
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
ui.applyStateToControls();
lastMetrics = scene.rebuild(state, true);
scene.setEnvironment(state);
scene.setCompassVisible(state.showCompass);
ui.updateMetrics(lastMetrics);
ui.setPreferences();
if (currentView !== 'perspective') scene.setView(currentView, state, lastMetrics.ridgeElevation);
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

function resetConfiguration() {
  const shellPreferences = {
    units: state.units,
    currency: state.currency,
    locale: state.locale,
    currencyRate: state.currencyRate,
    currencyRateDate: state.currencyRateDate,
    currencyRateSource: state.currencyRateSource,
    currencyRateIsFallback: state.currencyRateIsFallback,
  };
  Object.assign(state, structuredClone(DEFAULT_ROOF_STATE), shellPreferences);
  currentView = 'perspective';
  ui?.applyStateToControls();
  rebuild({ fitCamera: true });
  ui?.setPreferences();
  window.history.replaceState({}, '', window.location.pathname);
  emitToolsState();
  return true;
}

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
      technicalEdges: state.technicalEdges,
      currentView,
      units: state.units,
      currency: state.currency,
      locale: state.locale,
    };
  },

  captureState() {
    return {
      roofType: state.roofType,
      length: state.length,
      depth: state.depth,
      wallHeight: state.wallHeight,
      pitch: state.pitch,
      overhang: state.overhang,
      covering: state.covering,
      roofColor: state.roofColor,
      showDimensions: state.showDimensions,
      technicalEdges: state.technicalEdges,
      showCompass: state.showCompass,
      sunPosition: state.sunPosition,
      northDirection: state.northDirection,
      nightPreview: state.nightPreview,
      customPlan: state.customPlan ? structuredClone(state.customPlan) : null,
      excludedBomItems: [...state.excludedBomItems],
      currentView,
    };
  },

  restoreState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    applySharedRoofState(snapshot);
    const restoredView = VIEW_ORDER.includes(snapshot.currentView) ? snapshot.currentView : 'perspective';
    ui?.applyStateToControls();
    rebuild({ fitCamera: true });
    if (restoredView !== 'perspective') applyView(restoredView);
    emitToolsState();
    return true;
  },

  resetConfiguration,

  setDimensionsVisible(visible) {
    if (state.roofType === 'custom') return state.showDimensions;
    state.showDimensions = Boolean(visible);
    rebuild({ fitCamera: false });
    return state.showDimensions;
  },

  toggleDimensions() {
    return this.setDimensionsVisible(!state.showDimensions);
  },

  setTechnicalEdges(visible) {
    state.technicalEdges = Boolean(visible);
    const wireframeToggle = document.querySelector('#wireframeToggle');
    if (wireframeToggle) wireframeToggle.checked = state.technicalEdges;
    rebuild({ fitCamera: false });
    return state.technicalEdges;
  },

  toggleTechnicalEdges() {
    return this.setTechnicalEdges(!state.technicalEdges);
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
