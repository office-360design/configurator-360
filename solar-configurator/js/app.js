import { state } from './state.js?v=6';
import { RoofScene } from './scene.js?v=8';
import { SolarUI } from './ui.js?v=6';
import { fetchPvgisSiteEstimate } from './energyModel.js?v=4';
import { loadGeographicEnvironment } from './environmentLoader.js?v=3';
import {
  getSeasonPresetDate,
  getSolarContext,
  getSunTimes,
  getTodayInTimeZone,
  nearestRegionKey,
} from './solarPosition.js?v=2';
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
let pvgisHealthController = null;
let simulationFrame = 0;
let simulationStartedAt = 0;
let environmentController = null;
let environmentRequest = 0;
const SIMULATION_DURATION_MS = 18000;
const PVGIS_PROXY_STORAGE_KEY = '360-configurator:solar:pvgis-proxy-endpoint';

function readStoredPvgisEndpoint() {
  try { return String(window.localStorage?.getItem(PVGIS_PROXY_STORAGE_KEY) || '').trim(); } catch { return ''; }
}

function normalizePvgisEndpoint(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, window.location.href);
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.toString().replace(/\?$/, '');
  } catch {
    return '';
  }
}

state.pvgisProxyEndpoint = normalizePvgisEndpoint(window.SOLAR_PVGIS_PROXY_ENDPOINT || readStoredPvgisEndpoint());
state.pvgisProxyHealthStatus = state.pvgisProxyEndpoint ? 'unknown' : 'unconfigured';
state.pvgisProxyHealthMessage = state.pvgisProxyEndpoint ? 'Proxy URL saved; connection not tested yet.' : 'No proxy URL configured.';
const LOCAL_POSITION_LIMIT_M = 60;

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
    pvgisTerrainBlocked: Boolean(solar.terrainBlocked),
    pvgisTerrainHorizonElevationDeg: Number.isFinite(Number(solar.terrainHorizonElevationDeg)) ? Number(solar.terrainHorizonElevationDeg) : null,
    environmentEnabled: state.environmentEnabled,
    environmentAutoLoad: state.environmentAutoLoad,
    environmentRadiusM: state.environmentRadiusM,
    terrainEnabled: state.terrainEnabled,
    buildingsEnabled: state.buildingsEnabled,
    roadsEnabled: state.roadsEnabled,
    treesEnabled: state.treesEnabled,
    terrainExaggeration: state.terrainExaggeration,
    environmentStatus: state.environmentStatus,
    environmentMessage: state.environmentMessage,
    environmentCenterElevationM: state.environmentCenterElevationM,
    environmentBuildingCount: state.environmentBuildingCount,
    environmentRoadCount: state.environmentRoadCount,
    environmentTreeCount: state.environmentTreeCount,
    environmentHasTerrain: state.environmentHasTerrain,
    environmentLocalEastM: state.environmentLocalEastM,
    environmentLocalNorthM: state.environmentLocalNorthM,
    environmentLocalStepM: state.environmentLocalStepM,
    replaceHostBuilding: state.replaceHostBuilding,
    environmentHostBuildingCount: state.environmentHostBuildingCount,
    localBuildingShadingEnabled: state.localBuildingShadingEnabled,
    localBuildingShadingStatus: state.localBuildingShadingStatus,
    localBuildingShadingMessage: state.localBuildingShadingMessage,
    localBuildingShadeContributorCount: state.localBuildingShadeContributorCount,
    localBuildingShadePanelCount: state.localBuildingShadePanelCount,
    localBuildingAnnualLossPct: state.localBuildingAnnualLossPct,
    environmentLoaded: scene.hasGeographicEnvironment(),
    pvgisStatus: state.pvgisStatus,
    pvgisMessage: state.pvgisMessage,
    pvgisAnnualKWh: state.pvgisAnnualKWh,
    pvgisSpecificYield: Number(state.pvgisAnnualKWh) > 0 && Number(lastMetrics?.systemKwp) > 0 ? Number(state.pvgisAnnualKWh) / Number(lastMetrics.systemKwp) : null,
    pvgisMonthlyKWh: state.pvgisMonthlyKWh,
    pvgisDatabase: state.pvgisDatabase,
    pvgisUpdatedAt: state.pvgisUpdatedAt,
    pvgisUseHorizon: state.pvgisUseHorizon,
    pvgisShowHorizon: state.pvgisShowHorizon,
    pvgisHorizonProfile: state.pvgisHorizonProfile,
    pvgisHorizonSamples: Array.isArray(state.pvgisHorizonProfile) ? state.pvgisHorizonProfile.length : 0,
    pvgisHorizonMaxDeg: Array.isArray(state.pvgisHorizonProfile) && state.pvgisHorizonProfile.length
      ? Math.max(...state.pvgisHorizonProfile.map((point) => Number(point.elevationDeg) || 0))
      : null,
    pvgisSurfaceCount: Array.isArray(state.pvgisSurfaceResults) ? state.pvgisSurfaceResults.length : 0,
    pvgisProxyEndpoint: state.pvgisProxyEndpoint,
    pvgisProxyConfigured: Boolean(state.pvgisProxyEndpoint),
    pvgisProxyHealthStatus: state.pvgisProxyHealthStatus,
    pvgisProxyHealthMessage: state.pvgisProxyHealthMessage,
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
  emitToolsState();
}

function clearPvgisData() {
  state.pvgisAnnualKWh = null;
  state.pvgisMonthlyKWh = null;
  state.pvgisHorizonProfile = null;
  state.pvgisSurfaceResults = [];
  state.pvgisDatabase = '';
  state.pvgisUpdatedAt = null;
}


async function testPvgisProxyEndpoint(endpoint = state.pvgisProxyEndpoint) {
  const normalized = normalizePvgisEndpoint(endpoint);
  pvgisHealthController?.abort();
  pvgisHealthController = null;

  if (!normalized) {
    state.pvgisProxyHealthStatus = 'unconfigured';
    state.pvgisProxyHealthMessage = 'Enter the public Netlify Function URL, then apply it.';
    emitToolsState();
    return { ok: false, status: 'unconfigured' };
  }

  state.pvgisProxyHealthStatus = 'testing';
  state.pvgisProxyHealthMessage = 'Testing proxy connection…';
  emitToolsState();

  const controller = new AbortController();
  pvgisHealthController = controller;
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  try {
    const healthUrl = new URL(normalized);
    healthUrl.searchParams.set('tool', 'health');
    const response = await fetch(healthUrl.toString(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* handled below */ }

    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!payload?.ok) throw new Error('Health endpoint did not return the expected { ok: true } response.');

    if (normalized !== state.pvgisProxyEndpoint) return { ok: false, status: 'stale' };
    state.pvgisProxyHealthStatus = 'ready';
    state.pvgisProxyHealthMessage = `Connected · ${payload.platform || 'proxy'} · ${payload.upstream || 'PVGIS'}`;
    emitToolsState();
    schedulePvgis({ immediate: true });
    return { ok: true, payload };
  } catch (error) {
    if (normalized !== state.pvgisProxyEndpoint) return { ok: false, status: 'stale' };
    state.pvgisProxyHealthStatus = 'error';
    if (error?.name === 'AbortError') {
      state.pvgisProxyHealthMessage = 'Connection timed out. Check that the Netlify project is public and reachable.';
    } else if (Number(error?.status) === 401 || Number(error?.status) === 403) {
      state.pvgisProxyHealthMessage = `Proxy returned HTTP ${error.status}. The Netlify project is private/protected; make the production deploy public.`;
    } else if (Number(error?.status)) {
      state.pvgisProxyHealthMessage = `Proxy test failed with HTTP ${error.status}: ${error.message}`;
    } else {
      state.pvgisProxyHealthMessage = `Could not reach the proxy from this page. Check public access and CORS. ${error?.message || ''}`.trim();
    }
    if (state.locationMode === 'exact') {
      state.pvgisStatus = 'fallback';
      state.pvgisMessage = `${state.pvgisProxyHealthMessage} Regional production fallback remains active.`;
    }
    emitToolsState();
    return { ok: false, error };
  } finally {
    window.clearTimeout(timeoutId);
    if (pvgisHealthController === controller) pvgisHealthController = null;
  }
}

function schedulePvgis({ immediate = false } = {}) {
  window.clearTimeout(pvgisTimer);
  pvgisController?.abort();
  pvgisController = null;
  clearPvgisData();

  if (state.locationMode !== 'exact') {
    state.pvgisStatus = 'calibrated';
    state.pvgisMessage = 'Regional PVGIS-calibrated fallback is active. Choose an exact location for live site data.';
    scene.setEnvironment(state);
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
    return;
  }

  const endpoint = normalizePvgisEndpoint(state.pvgisProxyEndpoint);
  if (!endpoint) {
    state.pvgisStatus = 'unconfigured';
    state.pvgisMessage = 'Exact sun geometry is active, but the PVGIS proxy is not configured. Annual yield is using the regional fallback.';
    scene.setEnvironment(state);
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
    return;
  }

  state.pvgisStatus = 'loading';
  state.pvgisMessage = state.pvgisUseHorizon
    ? 'Loading exact-location PVGIS yield and terrain horizon…'
    : 'Loading exact-location PVGIS yield without terrain-horizon losses…';
  if (lastMetrics) ui?.updateMetrics(lastMetrics);
  emitToolsState();

  const run = async () => {
    if (!lastMetrics?.systemKwp) return;
    pvgisController = new AbortController();
    try {
      const result = await fetchPvgisSiteEstimate(state, lastMetrics, pvgisController.signal, endpoint);
      state.pvgisAnnualKWh = result.annualKWh;
      state.pvgisMonthlyKWh = result.monthlyKWh;
      state.pvgisHorizonProfile = result.horizonProfile;
      state.pvgisSurfaceResults = result.surfaceResults;
      state.pvgisDatabase = result.database || 'PVGIS-SARAH3';
      state.pvgisUpdatedAt = new Date().toISOString();
      state.pvgisStatus = 'ready';
      const horizonText = state.pvgisUseHorizon
        ? (result.horizonProfile?.length ? `terrain horizon loaded (${result.horizonProfile.length} samples)` : 'PVGIS terrain horizon applied to yield')
        : 'terrain-horizon losses disabled';
      state.pvgisMessage = `${state.pvgisDatabase || 'PVGIS'} exact-site model ready · ${result.surfaceResults.length} roof section${result.surfaceResults.length === 1 ? '' : 's'} · ${horizonText}.`;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.info('[Solar configurator] PVGIS proxy unavailable; using calibrated regional model.', error);
      clearPvgisData();
      state.pvgisStatus = 'fallback';
      state.pvgisMessage = `PVGIS unavailable (${error?.message || 'request failed'}). Regional calibrated yield remains active.`;
    }
    scene.setEnvironment(state);
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
  };

  if (immediate) run();
  else pvgisTimer = window.setTimeout(run, 650);
}

function clearEnvironmentStats(message = 'Choose an exact location to load 3D context.') {
  state.environmentCenterElevationM = null;
  state.environmentBuildingCount = 0;
  state.environmentRoadCount = 0;
  state.environmentTreeCount = 0;
  state.environmentHasTerrain = false;
  state.environmentHostBuildingCount = 0;
  state.localBuildingShadingModel = null;
  state.localBuildingShadingStatus = 'inactive';
  state.localBuildingShadingMessage = 'Load nearby buildings to estimate local obstruction shading.';
  state.localBuildingShadeContributorCount = 0;
  state.localBuildingShadePanelCount = 0;
  state.localBuildingAnnualLossPct = 0;
  state.environmentMessage = message;
}

function syncLocalBuildingShadingModel() {
  if (!scene.hasGeographicEnvironment()) {
    state.localBuildingShadingModel = null;
    state.localBuildingShadingStatus = 'inactive';
    state.localBuildingShadingMessage = 'Load nearby buildings to estimate local obstruction shading.';
    state.localBuildingShadeContributorCount = 0;
    state.localBuildingShadePanelCount = 0;
    state.localBuildingAnnualLossPct = 0;
    return null;
  }

  const model = scene.computeLocalBuildingShadingModel(state);
  state.localBuildingShadingModel = model;
  state.localBuildingShadeContributorCount = model?.contributorIds?.length || 0;
  state.localBuildingShadePanelCount = model?.panelCount || 0;
  if (!model?.panelCount) {
    state.localBuildingShadingStatus = 'inactive';
    state.localBuildingShadingMessage = 'No fitted solar panels are available for local shading analysis.';
  } else if (!model?.buildingCount) {
    state.localBuildingShadingStatus = 'ready';
    state.localBuildingShadingMessage = 'No nearby mapped buildings can obstruct the current array.';
  } else if (!model?.contributorIds?.length) {
    state.localBuildingShadingStatus = 'ready';
    state.localBuildingShadingMessage = 'Nearby buildings loaded; none rise above the panel horizon from the current house position.';
  } else {
    state.localBuildingShadingStatus = 'ready';
    state.localBuildingShadingMessage = `${model.contributorIds.length} nearby building${model.contributorIds.length === 1 ? '' : 's'} can shade the current solar array.`;
  }
  scene.syncBuildingShadingVisuals(state);
  return model;
}

function syncEnvironmentSceneMetrics(data = scene.geographicData) {
  if (!data) {
    state.environmentHostBuildingCount = 0;
    syncLocalBuildingShadingModel();
    return;
  }
  const metrics = scene.getGeographicMetrics(state);
  state.environmentCenterElevationM = metrics.houseElevationM ?? data.terrain?.centerElevationM ?? null;
  state.environmentBuildingCount = data.buildings?.length || 0;
  state.environmentRoadCount = data.roads?.length || 0;
  state.environmentTreeCount = data.trees?.length || 0;
  state.environmentHasTerrain = Boolean(data.terrain);
  state.environmentHostBuildingCount = metrics.hostBuildingCount || 0;
  syncLocalBuildingShadingModel();
}

function syncEnvironmentForLocationMode() {
  if (state.locationMode === 'exact') return;
  environmentController?.abort();
  environmentController = null;
  environmentRequest += 1;
  if (scene.hasGeographicEnvironment()) scene.clearGeographicEnvironment();
  state.environmentStatus = 'inactive';
  clearEnvironmentStats('Choose an exact location to load terrain and nearby OpenStreetMap context.');
}

async function refreshGeographicEnvironment({ forceRefresh = false } = {}) {
  if (state.locationMode !== 'exact') {
    syncEnvironmentForLocationMode();
    emitToolsState();
    return null;
  }
  if (!state.environmentEnabled) {
    state.environmentStatus = 'hidden';
    state.environmentMessage = '3D geographic context is turned off.';
    scene.syncGeographicLayerVisibility(state);
    emitToolsState();
    return scene.geographicData;
  }

  const latitude = Number(state.locationLat);
  const longitude = Number(state.locationLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const hadExistingEnvironment = scene.hasGeographicEnvironment();
  environmentController?.abort();
  const requestId = ++environmentRequest;
  const controller = new AbortController();
  environmentController = controller;
  state.environmentStatus = 'loading';
  state.environmentMessage = forceRefresh
    ? 'Refreshing elevation and mapped surroundings…'
    : 'Loading elevation, buildings, roads and mapped trees…';
  emitToolsState();

  const applyProgress = (data) => {
    if (controller.signal.aborted || requestId !== environmentRequest || !data) return;
    scene.setGeographicEnvironment(data, state);
    syncEnvironmentSceneMetrics(data);
    state.environmentStatus = 'loading';
    if (data.progressStage === 'terrain') {
      state.environmentMessage = 'Terrain is ready; loading nearby buildings, roads and mapped trees…';
    } else if (data.progressStage === 'osm') {
      state.environmentMessage = data.terrain
        ? 'Mapped surroundings are ready; finishing terrain…'
        : 'Mapped surroundings are ready; loading terrain elevation…';
    }
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
  };

  try {
    const data = await loadGeographicEnvironment({
      lat: latitude,
      lon: longitude,
      radiusM: state.environmentRadiusM,
      terrainSegments: state.environmentRadiusM >= 300 ? 72 : 64,
      signal: controller.signal,
      forceRefresh,
      onProgress: applyProgress,
    });
    if (requestId !== environmentRequest || controller.signal.aborted) return null;
    scene.setGeographicEnvironment(data, state);
    syncEnvironmentSceneMetrics(data);
    if (data.errors?.length) {
      state.environmentStatus = 'partial';
      state.environmentMessage = `Context loaded with limited data: ${data.errors.join(' · ')}`;
    } else {
      state.environmentStatus = 'ready';
      state.environmentMessage = 'Real terrain and nearby mapped context loaded.';
    }
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
    return data;
  } catch (error) {
    if (error?.name === 'AbortError' || requestId !== environmentRequest) return null;
    console.info('[Solar configurator] Geographic environment unavailable.', error);
    if (hadExistingEnvironment && scene.hasGeographicEnvironment()) {
      state.environmentStatus = 'partial';
      state.environmentMessage = 'Refresh failed; keeping the previously loaded local environment.';
    } else {
      scene.clearGeographicEnvironment();
      state.environmentStatus = 'error';
      clearEnvironmentStats('Could not load geographic context. The solar configurator remains usable with the flat reference ground.');
    }
    emitToolsState();
    return null;
  } finally {
    if (environmentController === controller) environmentController = null;
  }
}

function rebuild({ fitCamera = false, scene: rebuildScene = true, pvgis = false } = {}) {
  if (state.locationMode !== 'exact') syncEnvironmentForLocationMode();
  if (rebuildScene || !lastMetrics) {
    lastMetrics = scene.rebuild(state, fitCamera);
    if (scene.hasGeographicEnvironment()) syncLocalBuildingShadingModel();
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
if (scene.hasGeographicEnvironment()) syncLocalBuildingShadingModel();
ui.updateMetrics(lastMetrics);
ui.setPreferences();
syncViewButtons();
refreshCurrencyRate(state.currency);
schedulePvgis();
if (state.pvgisProxyEndpoint) testPvgisProxyEndpoint(state.pvgisProxyEndpoint);

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

    // Bearing changes do not alter the roof geometry, but they DO change the
    // true azimuth of every panel-bearing roof plane. Rebuild only the solar
    // array so its surface metadata (and Auto best face selection) is refreshed
    // without rebuilding the whole roof model.
    const solarMetrics = scene.rebuildSolarArray(state);
    lastMetrics = {
      ...lastMetrics,
      ...solarMetrics,
      solarMetrics,
    };

    // The geographic context is drawn in true-North coordinates while the
    // configurable house stays fixed in viewer space, so refresh it as well.
    // This also updates the mapped host-building overlap after a bearing change.
    if (scene.hasGeographicEnvironment()) {
      scene.rebuildGeographicEnvironment(state);
      syncEnvironmentSceneMetrics();
    }

    scene.setEnvironment(state);
    ui?.updateMetrics(lastMetrics);
    emitToolsState();
    schedulePvgis();
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
    environmentController?.abort();
    environmentRequest += 1;
    scene.clearGeographicEnvironment();
    clearEnvironmentStats();
    state.locationMode = 'exact';
    state.locationLat = latitude;
    state.locationLon = longitude;
    state.locationLabel = String(label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    state.environmentLocalEastM = 0;
    state.environmentLocalNorthM = 0;
    state.region = nearestRegionKey(latitude, longitude);
    rebuild({ fitCamera: false, scene: false, pvgis: true });
    if (state.environmentEnabled && state.environmentAutoLoad) refreshGeographicEnvironment();
    return { lat: latitude, lon: longitude, label: state.locationLabel };
  },

  useRegionalLocation(regionKey = state.region) {
    if (state.simulationPlaying) stopSimulation({ keepHour: true });
    if (regionKey) state.region = regionKey;
    state.locationMode = 'region';
    rebuild({ fitCamera: false, scene: false, pvgis: true });
    return state.region;
  },

  async setPvgisProxyEndpoint(value) {
    const endpoint = normalizePvgisEndpoint(value);
    state.pvgisProxyEndpoint = endpoint;
    try {
      if (endpoint) window.localStorage?.setItem(PVGIS_PROXY_STORAGE_KEY, endpoint);
      else window.localStorage?.removeItem(PVGIS_PROXY_STORAGE_KEY);
    } catch {
      // Storage can be disabled by the browser; the current session still works.
    }

    clearPvgisData();
    if (!endpoint) {
      state.pvgisProxyHealthStatus = 'unconfigured';
      state.pvgisProxyHealthMessage = 'No proxy URL configured.';
      schedulePvgis({ immediate: true });
      emitToolsState();
      return { endpoint: '', ok: false };
    }

    state.pvgisProxyHealthStatus = 'unknown';
    state.pvgisProxyHealthMessage = 'Proxy URL saved; testing connection…';
    emitToolsState();
    const result = await testPvgisProxyEndpoint(endpoint);
    return { endpoint: state.pvgisProxyEndpoint, ...result };
  },

  testPvgisProxy() {
    return testPvgisProxyEndpoint(state.pvgisProxyEndpoint);
  },

  setPvgisUseHorizon(enabled) {
    state.pvgisUseHorizon = Boolean(enabled);
    schedulePvgis({ immediate: true });
    return state.pvgisUseHorizon;
  },

  setPvgisHorizonVisible(visible) {
    state.pvgisShowHorizon = Boolean(visible);
    scene.setEnvironment(state);
    emitToolsState();
    return state.pvgisShowHorizon;
  },

  refreshPvgis() {
    schedulePvgis({ immediate: true });
    return true;
  },

  refreshEnvironment() {
    return refreshGeographicEnvironment({ forceRefresh: true });
  },

  setEnvironmentEnabled(enabled) {
    state.environmentEnabled = Boolean(enabled);
    if (!state.environmentEnabled) {
      state.environmentStatus = scene.hasGeographicEnvironment() ? 'hidden' : 'inactive';
      state.environmentMessage = '3D geographic context is turned off.';
      scene.syncGeographicLayerVisibility(state);
      emitToolsState();
    } else if (scene.hasGeographicEnvironment()) {
      state.environmentStatus = 'ready';
      state.environmentMessage = 'Real terrain and nearby mapped context loaded.';
      scene.syncGeographicLayerVisibility(state);
      scene.rebuildGeographicEnvironment(state);
      syncEnvironmentSceneMetrics();
      if (lastMetrics) ui?.updateMetrics(lastMetrics);
      emitToolsState();
    } else if (state.locationMode === 'exact') refreshGeographicEnvironment();
    return state.environmentEnabled;
  },

  setEnvironmentRadius(radiusM) {
    state.environmentRadiusM = Math.min(400, Math.max(80, Number(radiusM) || 180));
    if (state.locationMode === 'exact' && state.environmentEnabled) refreshGeographicEnvironment();
    else emitToolsState();
    return state.environmentRadiusM;
  },

  setEnvironmentLayer(layer, enabled) {
    const keyMap = { terrain: 'terrainEnabled', buildings: 'buildingsEnabled', roads: 'roadsEnabled', trees: 'treesEnabled' };
    const key = keyMap[layer];
    if (!key) return null;
    state[key] = Boolean(enabled);
    if (layer === 'terrain' && scene.hasGeographicEnvironment()) scene.rebuildGeographicEnvironment(state);
    else scene.syncGeographicLayerVisibility(state);
    emitToolsState();
    return state[key];
  },

  setTerrainExaggeration(value) {
    state.terrainExaggeration = Math.min(3, Math.max(0.25, Number(value) || 1));
    if (scene.hasGeographicEnvironment()) scene.rebuildGeographicEnvironment(state);
    emitToolsState();
    return state.terrainExaggeration;
  },

  setLocalPositionOffset({ eastM = state.environmentLocalEastM, northM = state.environmentLocalNorthM } = {}) {
    const east = Math.min(LOCAL_POSITION_LIMIT_M, Math.max(-LOCAL_POSITION_LIMIT_M, Number(eastM) || 0));
    const north = Math.min(LOCAL_POSITION_LIMIT_M, Math.max(-LOCAL_POSITION_LIMIT_M, Number(northM) || 0));
    state.environmentLocalEastM = Math.round(east * 10) / 10;
    state.environmentLocalNorthM = Math.round(north * 10) / 10;
    if (scene.hasGeographicEnvironment()) {
      scene.rebuildGeographicEnvironment(state);
      scene.setEnvironment(state);
      syncEnvironmentSceneMetrics();
      if (lastMetrics) ui?.updateMetrics(lastMetrics);
    }
    // The local offset represents the actual configured house position inside the
    // loaded map context, so refresh the exact-site model at that adjusted point.
    if (state.locationMode === 'exact') schedulePvgis();
    emitToolsState();
    return { eastM: state.environmentLocalEastM, northM: state.environmentLocalNorthM };
  },

  adjustLocalPosition(eastDeltaM = 0, northDeltaM = 0) {
    return this.setLocalPositionOffset({
      eastM: state.environmentLocalEastM + (Number(eastDeltaM) || 0),
      northM: state.environmentLocalNorthM + (Number(northDeltaM) || 0),
    });
  },

  resetLocalPosition() {
    return this.setLocalPositionOffset({ eastM: 0, northM: 0 });
  },

  setLocalPositionStep(value) {
    state.environmentLocalStepM = Math.min(10, Math.max(0.25, Number(value) || 1));
    emitToolsState();
    return state.environmentLocalStepM;
  },

  setReplaceHostBuilding(enabled) {
    state.replaceHostBuilding = Boolean(enabled);
    if (scene.hasGeographicEnvironment()) {
      scene.rebuildGeographicEnvironment(state);
      scene.setEnvironment(state);
      syncEnvironmentSceneMetrics();
      if (lastMetrics) ui?.updateMetrics(lastMetrics);
    }
    emitToolsState();
    return state.replaceHostBuilding;
  },

  setLocalBuildingShadingEnabled(enabled) {
    state.localBuildingShadingEnabled = Boolean(enabled);
    if (scene.hasGeographicEnvironment() && !state.localBuildingShadingModel) syncLocalBuildingShadingModel();
    scene.syncBuildingShadingVisuals(state);
    if (lastMetrics) ui?.updateMetrics(lastMetrics);
    emitToolsState();
    return state.localBuildingShadingEnabled;
  },

  focusEnvironment() {
    const focused = scene.fitEnvironment(state);
    if (focused) {
      currentView = 'perspective';
      syncViewButtons();
      emitToolsState();
    }
    return focused;
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
