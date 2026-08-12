import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=3';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=2';
import { formatAzimuth, getSeasonForDate } from './solarPosition.js?v=2';

const icon = (body) => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${body}
  </svg>
`;

const tools = [
  ...resolveSharedTools([
    {
      id: 'environment',
      label: 'Location & environment',
      icon: icon('<circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M5.1 5.1l1.5 1.5M17.4 17.4l1.5 1.5M18.9 5.1l-1.5 1.5M6.6 17.4l-1.5 1.5"></path>'),
    },
    {
      id: 'dimensions',
      label: 'Dimensions',
      icon: icon('<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"></path>'),
    },
    {
      id: 'compass',
      label: 'Compass',
      active: true,
      icon: icon('<circle cx="12" cy="12" r="8.5"></circle><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7z"></path><path d="M12 1.7v2M12 20.3v2M1.7 12h2M20.3 12h2"></path>'),
    },
    {
      id: 'camera',
      label: 'Change orientation',
      icon: icon('<circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"></path>'),
    },
  ]),
  {
    id: 'simulation',
    action: 'toggle-simulation',
    label: 'Run day simulation',
    icon: icon('<path d="M8 5v14l11-7z"></path>'),
  },
];

const shell = mountStandaloneConfiguratorShell({
  productType: 'Solar',
  storagePrefix: '360-configurator:solar',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: false,
    reset: true,
    share: true,
  },
  tools: {
    items: tools,
    placement: { side: 'left', direction: 'down', offsetX: 0, offsetY: 0 },
  },
  callbacks: {
    onReset() {
      document.querySelector('[data-view="reset"]')?.click();
    },
    getShareUrl() { return window.location.href; },
    onPreferenceChange(name, value, preferences) {
      const snapshot = { ...preferences };
      window.SOLAR_SHELL_PREFERENCES = snapshot;
      window.dispatchEvent(new CustomEvent('solar-preference-change', {
        detail: { name, value, preferences: snapshot },
      }));
    },
  },
});

window.SOLAR_SHELL_PREFERENCES = { ...shell.state };
window.dispatchEvent(new CustomEvent('solar-preference-change', {
  detail: { name: 'initial', value: null, preferences: { ...shell.state } },
}));

const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('#solarSidebarToggle');
function setSidebarCollapsed(collapsed) {
  sidebar?.classList.toggle('is-collapsed', collapsed);
  document.body.classList.toggle('roof-sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Show solar settings' : 'Hide solar settings');
  sidebarToggle?.setAttribute('title', collapsed ? 'Show solar settings' : 'Hide solar settings');
}
sidebarToggle?.addEventListener('click', () => setSidebarCollapsed(!sidebar?.classList.contains('is-collapsed')));

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
}

const toolsAnchor = document.querySelector('#solarToolsAnchor');
const environmentPanel = document.querySelector('#solarEnvironmentPanel');
const environmentClose = document.querySelector('#solarEnvironmentClose');
const simulationTimeControl = document.querySelector('#simulationTimeControl');
const simulationTimeValue = document.querySelector('#simulationTimeValue');
const simulationDateControl = document.querySelector('#simulationDateControl');
const environmentTodayButton = document.querySelector('#environmentTodayButton');
const northDirectionControl = document.querySelector('#northDirectionControl');
const northDirectionValue = document.querySelector('#northDirectionValue');
const nightPreviewToggle = document.querySelector('#nightPreviewToggle');
const sunPathToggle = document.querySelector('#sunPathToggle');
const environmentChooseLocation = document.querySelector('#environmentChooseLocation');
const environmentLocationMode = document.querySelector('#environmentLocationMode');
const environmentLocationLabel = document.querySelector('#environmentLocationLabel');
const environmentCoordinates = document.querySelector('#environmentCoordinates');
const environmentContextBlock = document.querySelector('.solar-context-block');
const environmentContextStatus = document.querySelector('#environmentContextStatus');
const environmentEnabledToggle = document.querySelector('#environmentEnabledToggle');
const environmentRadiusControl = document.querySelector('#environmentRadiusControl');
const terrainExaggerationControl = document.querySelector('#terrainExaggerationControl');
const terrainLayerToggle = document.querySelector('#terrainLayerToggle');
const buildingsLayerToggle = document.querySelector('#buildingsLayerToggle');
const roadsLayerToggle = document.querySelector('#roadsLayerToggle');
const treesLayerToggle = document.querySelector('#treesLayerToggle');
const localPositionAdjuster = document.querySelector('#localPositionAdjuster');
const localPositionReadout = document.querySelector('#localPositionReadout');
const localPositionStepControl = document.querySelector('#localPositionStepControl');
const localPositionResetButton = document.querySelector('#localPositionResetButton');
const localPositionNudgeButtons = [...document.querySelectorAll('[data-local-east][data-local-north]')];
const replaceHostBuildingToggle = document.querySelector('#replaceHostBuildingToggle');
const localBuildingShadingToggle = document.querySelector('#localBuildingShadingToggle');
const localBuildingAnnualLossValue = document.querySelector('#localBuildingAnnualLossValue');
const localBuildingContributorValue = document.querySelector('#localBuildingContributorValue');
const localBuildingShadingMessage = document.querySelector('#localBuildingShadingMessage');
const environmentRefreshButton = document.querySelector('#environmentRefreshButton');
const environmentFocusButton = document.querySelector('#environmentFocusButton');
const environmentAltitudeValue = document.querySelector('#environmentAltitudeValue');
const environmentBuildingsValue = document.querySelector('#environmentBuildingsValue');
const environmentRoadsValue = document.querySelector('#environmentRoadsValue');
const environmentTreesValue = document.querySelector('#environmentTreesValue');
const environmentHostBuildingValue = document.querySelector('#environmentHostBuildingValue');
const environmentContextMessage = document.querySelector('#environmentContextMessage');
const sunriseValue = document.querySelector('#sunriseValue');
const sunsetValue = document.querySelector('#sunsetValue');
const sunElevationValue = document.querySelector('#sunElevationValue');
const sunAzimuthValue = document.querySelector('#sunAzimuthValue');
const solarNoonValue = document.querySelector('#solarNoonValue');
const pvgisBlock = document.querySelector('.solar-pvgis-block');
const pvgisStatusLabel = document.querySelector('#pvgisStatusLabel');
const pvgisAnnualValue = document.querySelector('#pvgisAnnualValue');
const pvgisSpecificYieldValue = document.querySelector('#pvgisSpecificYieldValue');
const pvgisHorizonValue = document.querySelector('#pvgisHorizonValue');
const pvgisSectionsValue = document.querySelector('#pvgisSectionsValue');
const pvgisDatabaseValue = document.querySelector('#pvgisDatabaseValue');
const pvgisUseHorizonToggle = document.querySelector('#pvgisUseHorizonToggle');
const pvgisShowHorizonToggle = document.querySelector('#pvgisShowHorizonToggle');
const pvgisRefreshButton = document.querySelector('#pvgisRefreshButton');
const pvgisMessage = document.querySelector('#pvgisMessage');
const pvgisProxyInput = document.querySelector('#pvgisProxyInput');
const pvgisProxyApplyButton = document.querySelector('#pvgisProxyApplyButton');
const pvgisProxyFeedback = document.querySelector('#pvgisProxyFeedback');
const googleSolarBlock = document.querySelector('#googleSolarBlock');
const googleSolarStatusLabel = document.querySelector('#googleSolarStatusLabel');
const googleSolarAccessCode = document.querySelector('#googleSolarAccessCode');
const googleSolarUnlockButton = document.querySelector('#googleSolarUnlockButton');
const googleSolarLockButton = document.querySelector('#googleSolarLockButton');
const googleSolarAccessFeedback = document.querySelector('#googleSolarAccessFeedback');
const googleSolarAnalyzeButton = document.querySelector('#googleSolarAnalyzeButton');
const googleSolarRefreshButton = document.querySelector('#googleSolarRefreshButton');
const googleSolarShadingToggle = document.querySelector('#googleSolarShadingToggle');
const googleSolarDsmToggle = document.querySelector('#googleSolarDsmToggle');
const googleSolarMaskToggle = document.querySelector('#googleSolarMaskToggle');
const googleSolarRawDsmToggle = document.querySelector('#googleSolarRawDsmToggle');
const googleSolarReferenceToggle = document.querySelector('#googleSolarReferenceToggle');
const googleSolarImageryValue = document.querySelector('#googleSolarImageryValue');
const googleSolarRoofAreaValue = document.querySelector('#googleSolarRoofAreaValue');
const googleSolarMaxPanelsValue = document.querySelector('#googleSolarMaxPanelsValue');
const googleSolarSunshineValue = document.querySelector('#googleSolarSunshineValue');
const googleSolarSegmentsValue = document.querySelector('#googleSolarSegmentsValue');
const googleSolarLayoutValue = document.querySelector('#googleSolarLayoutValue');
const googleSolarShadePanelsValue = document.querySelector('#googleSolarShadePanelsValue');
const googleSolarLossValue = document.querySelector('#googleSolarLossValue');
const googleSolarDsmValue = document.querySelector('#googleSolarDsmValue');
const googleSolarMaskValue = document.querySelector('#googleSolarMaskValue');
const googleSolarReferenceValue = document.querySelector('#googleSolarReferenceValue');
const googleSolarMainRoofValue = document.querySelector('#googleSolarMainRoofValue');
const googleSolarMessage = document.querySelector('#googleSolarMessage');
const googleSolarCacheValue = document.querySelector('#googleSolarCacheValue');
const googleSolarProxyMessage = document.querySelector('#googleSolarProxyMessage');
let relocatedToolsToolbar = null;
let toolsPositionFrame = 0;
let lastToolsState = null;

const getApi = () => window.SOLAR_CONFIGURATOR_API;
const getToolButton = (toolId) => shell.host.querySelector(`[data-tool-id="${toolId}"]`);

function formatHour(decimalHour) {
  const totalMinutes = Math.min(1439, Math.max(0, Math.round((Number(decimalHour) || 0) * 60)));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function formatAltitude(meters, units = 'metric') {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '—';
  if (units === 'imperial') return `${Math.round(value * 3.28084)} ft`;
  return `${Math.round(value)} m`;
}

function formatLocalDistance(meters, units = 'metric', digits = 1) {
  const value = Number(meters) || 0;
  if (units === 'imperial') return `${(value * 3.28084).toFixed(digits)} ft`;
  return `${value.toFixed(digits)} m`;
}

function formatGoogleDate(date) {
  if (!date || !Number(date.year)) return '—';
  return `${String(date.year).padStart(4, '0')}-${String(date.month || 1).padStart(2, '0')}-${String(date.day || 1).padStart(2, '0')}`;
}

function formatGoogleArea(areaM2, units = 'metric') {
  const value = Number(areaM2);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return units === 'imperial' ? `${Math.round(value * 10.7639)} ft²` : `${Math.round(value)} m²`;
}

function formatLocalPosition(eastM, northM, units = 'metric') {
  const east = Number(eastM) || 0;
  const north = Number(northM) || 0;
  if (Math.abs(east) < 0.05 && Math.abs(north) < 0.05) return 'Centered';
  const sign = (value) => (value >= 0 ? '+' : '−');
  return `E ${sign(east)}${formatLocalDistance(Math.abs(east), units)} · N ${sign(north)}${formatLocalDistance(Math.abs(north), units)}`;
}

function syncLocalStepLabels(units = 'metric') {
  if (!localPositionStepControl) return;
  [...localPositionStepControl.options].forEach((option) => {
    const meters = Number(option.value) || 1;
    option.textContent = units === 'imperial'
      ? formatLocalDistance(meters, 'imperial')
      : `${meters % 1 ? meters.toFixed(1) : meters.toFixed(0)} m`;
  });
}

function setToolState(toolId, { active = false, disabled = false, title = null } = {}) {
  const button = getToolButton(toolId);
  if (!button) return;
  button.classList.toggle('is-active', Boolean(active));
  button.disabled = Boolean(disabled);
  button.setAttribute('aria-disabled', String(Boolean(disabled)));
  button.setAttribute('aria-pressed', String(Boolean(active)));
  if (title) {
    button.title = title;
    button.setAttribute('aria-label', title);
  }
}

function positionToolsUi() {
  toolsPositionFrame = 0;
  if (!toolsAnchor || !relocatedToolsToolbar?.isConnected) return;
  const anchorRect = toolsAnchor.getBoundingClientRect();
  const toolbarLeft = Math.round(anchorRect.left);
  const toolbarTop = Math.round(anchorRect.top);
  relocatedToolsToolbar.style.setProperty('--roof-tools-left', `${toolbarLeft}px`);
  relocatedToolsToolbar.style.setProperty('--roof-tools-top', `${toolbarTop}px`);
  if (!environmentPanel) return;
  const panelWidth = Math.min(430, Math.max(310, window.innerWidth - 24));
  const launcherWidth = relocatedToolsToolbar.querySelector('.tool-launcher')?.getBoundingClientRect().width || 74;
  let panelLeft = toolbarLeft + launcherWidth + 14;
  let panelTop = Math.max(12, Math.min(toolbarTop, 72));
  if (panelLeft + panelWidth > window.innerWidth - 12) {
    panelLeft = 12;
    panelTop = Math.max(12, Math.min(toolbarTop + 58, 72));
  }
  environmentPanel.style.setProperty('--roof-environment-left', `${Math.round(panelLeft)}px`);
  environmentPanel.style.setProperty('--roof-environment-top', `${Math.round(panelTop)}px`);
  environmentPanel.style.setProperty('--roof-environment-width', `${Math.round(panelWidth)}px`);
}

function scheduleToolsPosition() {
  if (toolsPositionFrame) return;
  toolsPositionFrame = requestAnimationFrame(positionToolsUi);
}

function relocateToolsToolbar() {
  if (!toolsAnchor) return true;
  const toolbar = shell.host.querySelector('[data-shared-tools]');
  if (!toolbar) return false;
  relocatedToolsToolbar = toolbar;
  toolbar.classList.add('roof-relocated-tools-toolbar');
  scheduleToolsPosition();
  return true;
}

function setEnvironmentPanelOpen(open) {
  if (!environmentPanel) return;
  const isOpen = Boolean(open);
  environmentPanel.hidden = !isOpen;
  environmentPanel.classList.toggle('is-open', isOpen);
  setToolState('environment', { active: isOpen, title: 'Location, 3D environment, sun and roof orientation' });
  scheduleToolsPosition();
}

function syncToolsState(detail = getApi()?.getState?.()) {
  if (!detail) return;
  lastToolsState = detail;
  setToolState('dimensions', { active: Boolean(detail.showDimensions), title: 'Toggle dimensions' });
  setToolState('compass', { active: Boolean(detail.showCompass), title: detail.showCompass ? 'Hide compass' : 'Show compass' });
  setToolState('simulation', {
    active: Boolean(detail.simulationPlaying),
    title: detail.simulationPlaying ? 'Pause day simulation' : 'Run day simulation',
  });
  const order = ['perspective', 'front', 'top'];
  const names = { perspective: '3D', front: 'Front', top: 'Top' };
  const index = Math.max(0, order.indexOf(detail.currentView));
  const nextView = order[(index + 1) % order.length];
  setToolState('camera', { title: `Change orientation: ${names[nextView]}` });

  if (simulationTimeControl) simulationTimeControl.value = String(detail.simulationHour ?? 12);
  if (simulationTimeValue) simulationTimeValue.textContent = formatHour(detail.simulationHour ?? 12);
  if (simulationDateControl) simulationDateControl.value = detail.simulationDate || '';
  if (northDirectionControl) northDirectionControl.value = String(detail.northDirection ?? 0);
  if (northDirectionValue) northDirectionValue.textContent = formatAzimuth(detail.northDirection ?? 0);
  if (nightPreviewToggle) nightPreviewToggle.checked = Boolean(detail.nightPreview);
  if (sunPathToggle) sunPathToggle.checked = Boolean(detail.showSunPath);
  if (sunriseValue) sunriseValue.textContent = `Sunrise ${detail.sunriseLabel || '—'}`;
  if (sunsetValue) sunsetValue.textContent = `Sunset ${detail.sunsetLabel || '—'}`;
  if (sunElevationValue) sunElevationValue.textContent = `${Number(detail.solarElevationDeg || 0).toFixed(1)}°`;
  if (sunAzimuthValue) sunAzimuthValue.textContent = formatAzimuth(detail.solarAzimuthDeg || 0);
  if (solarNoonValue) solarNoonValue.textContent = detail.solarNoonLabel || '—';
  if (environmentLocationMode) environmentLocationMode.textContent = detail.locationMode === 'exact' ? 'Exact location' : 'Regional reference';
  if (environmentLocationLabel) environmentLocationLabel.textContent = detail.activeLocationLabel || 'Bucharest reference';
  if (environmentCoordinates) environmentCoordinates.textContent = `${Number(detail.activeLocationLat || 0).toFixed(5)}, ${Number(detail.activeLocationLon || 0).toFixed(5)}`;
  if (localPositionReadout) localPositionReadout.textContent = formatLocalPosition(detail.environmentLocalEastM, detail.environmentLocalNorthM, detail.units);
  if (localPositionStepControl) localPositionStepControl.value = String(detail.environmentLocalStepM ?? 1);
  syncLocalStepLabels(detail.units);

  const exactLocation = detail.locationMode === 'exact';
  const contextEnabled = Boolean(detail.environmentEnabled);
  const contextLoading = detail.environmentStatus === 'loading';
  const statusLabels = {
    inactive: 'Choose exact location',
    loading: 'Loading…',
    ready: 'Loaded',
    partial: 'Partially loaded',
    error: 'Unavailable',
    hidden: 'Hidden',
  };
  if (environmentContextStatus) environmentContextStatus.textContent = statusLabels[detail.environmentStatus] || 'Ready';
  if (environmentEnabledToggle) {
    environmentEnabledToggle.checked = contextEnabled;
    environmentEnabledToggle.disabled = !exactLocation;
  }
  if (environmentRadiusControl) {
    environmentRadiusControl.value = String(detail.environmentRadiusM ?? 180);
    environmentRadiusControl.disabled = !exactLocation || !contextEnabled || contextLoading;
  }
  if (terrainExaggerationControl) {
    terrainExaggerationControl.value = String(detail.terrainExaggeration ?? 1);
    terrainExaggerationControl.disabled = !exactLocation || !contextEnabled || contextLoading;
  }
  const layerControls = [
    [terrainLayerToggle, detail.terrainEnabled],
    [buildingsLayerToggle, detail.buildingsEnabled],
    [roadsLayerToggle, detail.roadsEnabled],
    [treesLayerToggle, detail.treesEnabled],
  ];
  layerControls.forEach(([control, checked]) => {
    if (!control) return;
    control.checked = Boolean(checked);
    control.disabled = !exactLocation || !contextEnabled || contextLoading;
  });
  const localAdjustEnabled = exactLocation && contextEnabled && Boolean(detail.environmentLoaded) && !contextLoading;
  localPositionAdjuster?.classList.toggle('is-disabled', !localAdjustEnabled);
  if (localPositionStepControl) localPositionStepControl.disabled = !localAdjustEnabled;
  if (localPositionResetButton) localPositionResetButton.disabled = !localAdjustEnabled;
  localPositionNudgeButtons.forEach((button) => { button.disabled = !localAdjustEnabled; });
  if (replaceHostBuildingToggle) {
    replaceHostBuildingToggle.checked = detail.replaceHostBuilding !== false;
    replaceHostBuildingToggle.disabled = !exactLocation || !contextEnabled || !detail.environmentLoaded || contextLoading;
  }
  if (localBuildingShadingToggle) {
    localBuildingShadingToggle.checked = detail.localBuildingShadingEnabled !== false;
    localBuildingShadingToggle.disabled = !exactLocation || !detail.environmentLoaded || contextLoading;
  }
  if (localBuildingAnnualLossValue) {
    localBuildingAnnualLossValue.textContent = detail.localBuildingShadingEnabled === false
      ? 'Off'
      : (detail.environmentLoaded ? `${Number(detail.localBuildingAnnualLossPct || 0).toFixed(1)}%` : '—');
  }
  if (localBuildingContributorValue) {
    localBuildingContributorValue.textContent = detail.environmentLoaded
      ? `${Number(detail.localBuildingShadeContributorCount || 0)} building${Number(detail.localBuildingShadeContributorCount || 0) === 1 ? '' : 's'}`
      : '—';
  }
  if (localBuildingShadingMessage) {
    localBuildingShadingMessage.textContent = detail.localBuildingShadingEnabled === false
      ? 'Nearby-building production shading is disabled. The buildings can still remain visible in 3D.'
      : (detail.localBuildingShadingMessage || 'Load nearby buildings to estimate local obstruction shading.');
  }
  if (environmentRefreshButton) {
    environmentRefreshButton.disabled = !exactLocation || !contextEnabled || contextLoading;
    environmentRefreshButton.textContent = contextLoading ? 'Loading…' : 'Load / refresh';
  }
  if (environmentFocusButton) environmentFocusButton.disabled = !Boolean(detail.environmentLoaded) || !contextEnabled;
  if (environmentAltitudeValue) environmentAltitudeValue.textContent = formatAltitude(detail.environmentCenterElevationM, detail.units);
  if (environmentBuildingsValue) environmentBuildingsValue.textContent = detail.environmentLoaded ? String(detail.environmentBuildingCount ?? 0) : '—';
  if (environmentRoadsValue) environmentRoadsValue.textContent = detail.environmentLoaded ? String(detail.environmentRoadCount ?? 0) : '—';
  if (environmentTreesValue) environmentTreesValue.textContent = detail.environmentLoaded ? String(detail.environmentTreeCount ?? 0) : '—';
  if (environmentHostBuildingValue) {
    const count = Number(detail.environmentHostBuildingCount) || 0;
    environmentHostBuildingValue.textContent = detail.environmentLoaded ? (count ? `${count} detected` : 'None') : '—';
  }
  if (environmentContextMessage) environmentContextMessage.textContent = detail.environmentMessage || 'Choose an exact location to load geographic context.';
  environmentContextBlock?.classList.toggle('is-loading', contextLoading);
  environmentContextBlock?.classList.toggle('is-error', detail.environmentStatus === 'error');

  const pvgisLabels = {
    calibrated: 'Regional fallback',
    unconfigured: 'Proxy not configured',
    loading: 'Loading PVGIS…',
    ready: 'Exact site ready',
    fallback: 'PVGIS unavailable',
  };
  if (pvgisStatusLabel) {
    pvgisStatusLabel.textContent = pvgisLabels[detail.pvgisStatus] || 'PVGIS';
    pvgisStatusLabel.dataset.status = detail.pvgisStatus || '';
  }
  if (pvgisAnnualValue) pvgisAnnualValue.textContent = Number(detail.pvgisAnnualKWh) > 0 ? `${Math.round(detail.pvgisAnnualKWh).toLocaleString('en-US')} kWh/y` : '—';
  if (pvgisSpecificYieldValue) pvgisSpecificYieldValue.textContent = Number(detail.pvgisSpecificYield) > 0 ? `${Math.round(detail.pvgisSpecificYield)} kWh/kWp` : '—';
  if (pvgisHorizonValue) pvgisHorizonValue.textContent = Number(detail.pvgisHorizonSamples) > 0 ? `${detail.pvgisHorizonSamples} pts · max ${Number(detail.pvgisHorizonMaxDeg || 0).toFixed(1)}°` : '—';
  if (pvgisSectionsValue) pvgisSectionsValue.textContent = Number(detail.pvgisSurfaceCount) > 0 ? String(detail.pvgisSurfaceCount) : '—';
  if (pvgisDatabaseValue) pvgisDatabaseValue.textContent = detail.pvgisDatabase || '—';
  if (pvgisUseHorizonToggle) {
    pvgisUseHorizonToggle.checked = detail.pvgisUseHorizon !== false;
    pvgisUseHorizonToggle.disabled = detail.locationMode !== 'exact' || !detail.pvgisProxyConfigured || detail.pvgisStatus === 'loading';
  }
  if (pvgisShowHorizonToggle) {
    pvgisShowHorizonToggle.checked = detail.pvgisShowHorizon !== false;
    pvgisShowHorizonToggle.disabled = !Number(detail.pvgisHorizonSamples);
  }
  if (pvgisRefreshButton) {
    pvgisRefreshButton.disabled = detail.locationMode !== 'exact' || !detail.pvgisProxyConfigured || detail.pvgisStatus === 'loading';
    pvgisRefreshButton.textContent = detail.pvgisStatus === 'loading' ? 'Loading PVGIS…' : 'Refresh PVGIS';
  }
  if (pvgisMessage) pvgisMessage.textContent = detail.pvgisMessage || '';
  if (pvgisProxyInput && document.activeElement !== pvgisProxyInput) pvgisProxyInput.value = detail.pvgisProxyEndpoint || '';
  if (pvgisProxyApplyButton) {
    const health = detail.pvgisProxyHealthStatus || (detail.pvgisProxyConfigured ? 'unknown' : 'unconfigured');
    pvgisProxyApplyButton.disabled = health === 'testing';
    pvgisProxyApplyButton.textContent = health === 'testing'
      ? 'Testing connection…'
      : health === 'ready'
        ? 'Connected ✓'
        : health === 'error'
          ? 'Retry proxy'
          : 'Apply proxy URL';
    pvgisProxyApplyButton.dataset.status = health;
  }
  if (pvgisProxyFeedback) {
    pvgisProxyFeedback.textContent = detail.pvgisProxyHealthMessage || '';
    pvgisProxyFeedback.dataset.status = detail.pvgisProxyHealthStatus || '';
  }
  pvgisBlock?.classList.toggle('is-loading', detail.pvgisStatus === 'loading');
  pvgisBlock?.classList.toggle('is-error', detail.pvgisStatus === 'fallback' || detail.pvgisStatus === 'unconfigured');

  const googleUnlocked = detail.googleSolarAccessStatus === 'unlocked';
  const googleLoading = detail.googleSolarStatus === 'loading';
  const googleProxyReady = detail.googleSolarProxyStatus === 'ready';
  const googleStatus = !googleProxyReady
    ? (detail.googleSolarProxyStatus === 'testing' ? 'loading' : detail.googleSolarProxyStatus === 'setup' ? 'setup' : detail.googleSolarProxyStatus === 'error' ? 'error' : 'locked')
    : detail.googleSolarAccessStatus === 'unlocking'
      ? 'unlocking'
      : !googleUnlocked
        ? 'locked'
        : detail.googleSolarStatus || 'inactive';
  const googleLabels = {
    locked: 'Locked',
    unlocking: 'Unlocking…',
    setup: 'Netlify setup needed',
    loading: 'Analyzing…',
    ready: 'Detailed site ready',
    stale: 'Analysis stale',
    error: 'Analysis unavailable',
    inactive: 'Ready to analyze',
    unavailable: 'Exact location needed',
  };
  if (googleSolarStatusLabel) {
    googleSolarStatusLabel.textContent = googleLabels[googleStatus] || 'Google Solar';
    googleSolarStatusLabel.dataset.status = googleStatus;
  }
  if (googleSolarAccessCode) {
    googleSolarAccessCode.disabled = googleUnlocked || detail.googleSolarAccessStatus === 'unlocking' || !googleProxyReady;
    if (googleUnlocked && document.activeElement !== googleSolarAccessCode) googleSolarAccessCode.value = '';
  }
  if (googleSolarUnlockButton) {
    googleSolarUnlockButton.disabled = googleUnlocked || detail.googleSolarAccessStatus === 'unlocking' || !googleProxyReady;
    googleSolarUnlockButton.textContent = detail.googleSolarAccessStatus === 'unlocking'
      ? 'Unlocking…'
      : googleUnlocked
        ? 'Unlocked ✓'
        : 'Unlock Google Solar';
  }
  if (googleSolarLockButton) googleSolarLockButton.hidden = !googleUnlocked;
  if (googleSolarAccessFeedback) {
    googleSolarAccessFeedback.textContent = detail.googleSolarAccessMessage || '';
    googleSolarAccessFeedback.dataset.status = detail.googleSolarAccessStatus === 'unlocked'
      ? 'unlocked'
      : detail.googleSolarAccessStatus === 'unlocking'
        ? 'unlocking'
        : (String(detail.googleSolarAccessMessage || '').toLowerCase().includes('incorrect') ? 'error' : 'locked');
  }
  if (googleSolarAnalyzeButton) {
    googleSolarAnalyzeButton.disabled = !googleUnlocked || !googleProxyReady || !exactLocation || googleLoading;
    googleSolarAnalyzeButton.textContent = googleLoading ? 'Analyzing site…' : 'Analyze selected property';
  }
  if (googleSolarRefreshButton) {
    googleSolarRefreshButton.disabled = !googleUnlocked || !googleProxyReady || !exactLocation || googleLoading;
    googleSolarRefreshButton.textContent = googleLoading ? 'Please wait…' : 'Re-check cached data';
  }
  if (googleSolarShadingToggle) {
    googleSolarShadingToggle.checked = detail.googleSolarShadingEnabled !== false;
    googleSolarShadingToggle.disabled = !Number(detail.googleSolarShadePanelCount) || googleLoading;
  }
  if (googleSolarDsmToggle) {
    googleSolarDsmToggle.checked = detail.googleSolarDsmEnabled !== false;
    googleSolarDsmToggle.disabled = !detail.googleSolarSurfaceAvailable || googleLoading || !detail.environmentLoaded;
  }
  if (googleSolarMaskToggle) {
    googleSolarMaskToggle.checked = detail.googleSolarBuildingMaskVisible !== false;
    googleSolarMaskToggle.disabled = !detail.googleSolarSurfaceAvailable || googleLoading || detail.googleSolarDsmEnabled === false;
  }
  if (googleSolarRawDsmToggle) {
    googleSolarRawDsmToggle.checked = detail.googleSolarRawDsmVisible === true;
    googleSolarRawDsmToggle.disabled = !detail.googleSolarSurfaceAvailable || googleLoading || detail.googleSolarDsmEnabled === false || !detail.environmentLoaded;
  }
  if (googleSolarReferenceToggle) {
    googleSolarReferenceToggle.checked = detail.googleSolarReferenceBuildingVisible !== false;
    googleSolarReferenceToggle.disabled = !detail.googleSolarSurfaceAvailable || !detail.googleSolarHostDetected || googleLoading || detail.googleSolarDsmEnabled === false || !detail.environmentLoaded;
  }
  if (googleSolarImageryValue) {
    const quality = detail.googleSolarImageryQuality || '—';
    const imageryDate = formatGoogleDate(detail.googleSolarImageryDate);
    googleSolarImageryValue.textContent = quality === '—' ? '—' : `${quality} · ${imageryDate}`;
  }
  if (googleSolarRoofAreaValue) googleSolarRoofAreaValue.textContent = formatGoogleArea(detail.googleSolarRoofAreaM2, detail.units);
  if (googleSolarMaxPanelsValue) googleSolarMaxPanelsValue.textContent = Number(detail.googleSolarMaxPanels) > 0 ? String(detail.googleSolarMaxPanels) : '—';
  if (googleSolarSunshineValue) googleSolarSunshineValue.textContent = Number(detail.googleSolarMaxSunshineHours) > 0 ? `${Math.round(detail.googleSolarMaxSunshineHours)} h/y` : '—';
  if (googleSolarSegmentsValue) googleSolarSegmentsValue.textContent = Number(detail.googleSolarRoofSegmentCount) > 0 ? String(detail.googleSolarRoofSegmentCount) : '—';
  if (googleSolarLayoutValue) {
    googleSolarLayoutValue.textContent = Number(detail.googleSolarClosestConfigPanels) > 0
      ? `${detail.googleSolarClosestConfigPanels} panels · ${Math.round(Number(detail.googleSolarClosestConfigKWh) || 0).toLocaleString('en-US')} kWh DC/y`
      : '—';
  }
  if (googleSolarShadePanelsValue) googleSolarShadePanelsValue.textContent = Number(detail.googleSolarShadePanelCount) > 0 ? String(detail.googleSolarShadePanelCount) : '—';
  if (googleSolarLossValue) {
    googleSolarLossValue.textContent = Number(detail.googleSolarShadePanelCount) > 0 && detail.googleSolarShadingEnabled !== false
      ? `${Number(detail.googleSolarAnnualLossPct || 0).toFixed(1)}%`
      : '—';
  }
  if (googleSolarDsmValue) {
    if (!detail.googleSolarSurfaceAvailable) googleSolarDsmValue.textContent = '—';
    else if (detail.googleSolarDsmEnabled === false) googleSolarDsmValue.textContent = 'Available · refinement off';
    else {
      const buildings = Number(detail.googleSolarRefinedBuildingCount || 0) + Number(detail.googleSolarGoogleOnlyBuildingCount || 0);
      const extra = Number(detail.googleSolarGoogleOnlyBuildingCount || 0) > 0 ? ` · ${detail.googleSolarGoogleOnlyBuildingCount} Google-only` : '';
      googleSolarDsmValue.textContent = `Hybrid · ${buildings} buildings${extra} · ${Number(detail.googleSolarCanopyCount || 0)} canopy`;
    }
  }
  if (googleSolarMaskValue) {
    googleSolarMaskValue.textContent = detail.googleSolarSurfaceAvailable
      ? `${detail.googleSolarHostDetected ? 'Host detected' : 'No host match'} · ${Number(detail.googleSolarSurfaceRooftopCoveragePct || 0).toFixed(0)}% roof pixels`
      : '—';
  }
  if (googleSolarReferenceValue) {
    const score = Number(detail.googleSolarReferenceMatchScore || 0);
    const label = detail.googleSolarReferenceMatchLabel || '—';
    const distance = Number(detail.googleSolarReferenceDistanceM);
    const distanceText = Number.isFinite(distance) ? ` · ${formatLocalDistance(distance, detail.units, 1)} offset` : '';
    googleSolarReferenceValue.textContent = detail.googleSolarHostDetected ? `${label} · ${score}%${distanceText}` : '—';
  }
  if (googleSolarMainRoofValue) {
    const pitch = Number(detail.googleSolarReferenceMainPitchDeg);
    const azimuth = Number(detail.googleSolarReferenceMainAzimuthDeg);
    googleSolarMainRoofValue.textContent = Number.isFinite(pitch) && Number.isFinite(azimuth)
      ? `${pitch.toFixed(1)}° pitch · ${formatAzimuth(azimuth)}`
      : '—';
  }
  if (googleSolarMessage) googleSolarMessage.textContent = detail.googleSolarMessage || '';
  if (googleSolarProxyMessage) googleSolarProxyMessage.textContent = detail.googleSolarProxyMessage || '';
  if (googleSolarCacheValue) {
    const cache = detail.googleSolarCacheInfo || {};
    if (cache.browserCached) googleSolarCacheValue.textContent = 'Browser cache · no proxy work';
    else if (Number(detail.googleSolarShadePanelCount) > 0) {
      const googleCalls = Number(cache.upstreamBillableRequests || 0);
      const tiffs = Number(cache.hourlyShadeTiffsCached || 0);
      const surfaceText = cache.googleSurfaceModel
        ? 'DSM/mask reused'
        : Number(cache.surfaceGeoTiffsDownloaded || 0)
          ? `${cache.surfaceGeoTiffsDownloaded} DSM/mask TIFF${Number(cache.surfaceGeoTiffsDownloaded) === 1 ? '' : 's'} downloaded`
          : 'DSM/mask ready';
      googleSolarCacheValue.textContent = googleCalls
        ? `${googleCalls} Google request${googleCalls === 1 ? '' : 's'} · ${tiffs}/12 shade TIFFs reused · ${surfaceText}`
        : `Netlify cache · ${tiffs || 12}/12 shade TIFFs reused · ${surfaceText}`;
    } else googleSolarCacheValue.textContent = '—';
  }
  googleSolarBlock?.classList.toggle('is-loading', googleLoading);

  const season = getSeasonForDate(detail.simulationDate);
  document.querySelectorAll('[data-season-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.seasonPreset === season));
  });
}

shell.host.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget?.dataset.action === 'toggle-tools') {
    if (!shell.toolsOpen) setEnvironmentPanelOpen(false);
    scheduleToolsPosition();
    return;
  }

  const button = event.target.closest('[data-tool-id]');
  if (!button || button.disabled) return;
  const toolId = button.dataset.toolId;
  const api = getApi();
  if (!api) return;

  if (toolId === 'environment') setEnvironmentPanelOpen(environmentPanel?.hidden ?? true);
  else if (toolId === 'dimensions') { setEnvironmentPanelOpen(false); api.toggleDimensions(); }
  else if (toolId === 'compass') { setEnvironmentPanelOpen(false); api.toggleCompass(); }
  else if (toolId === 'camera') { setEnvironmentPanelOpen(false); api.cycleOrientation(); }
  else if (toolId === 'simulation') { setEnvironmentPanelOpen(false); api.toggleSimulation(); }
});

environmentClose?.addEventListener('click', () => setEnvironmentPanelOpen(false));
simulationTimeControl?.addEventListener('input', () => {
  const value = Number(simulationTimeControl.value);
  if (simulationTimeValue) simulationTimeValue.textContent = formatHour(value);
  getApi()?.setSimulationHour(value);
});
simulationDateControl?.addEventListener('change', () => getApi()?.setSimulationDate(simulationDateControl.value));
environmentTodayButton?.addEventListener('click', () => getApi()?.setToday());
document.querySelectorAll('[data-season-preset]').forEach((button) => {
  button.addEventListener('click', () => getApi()?.setSeasonPreset(button.dataset.seasonPreset));
});
northDirectionControl?.addEventListener('input', () => {
  const value = Number(northDirectionControl.value);
  if (northDirectionValue) northDirectionValue.textContent = formatAzimuth(value);
  getApi()?.setNorthDirection(value);
});
nightPreviewToggle?.addEventListener('change', () => getApi()?.setNightPreview(nightPreviewToggle.checked));
sunPathToggle?.addEventListener('change', () => getApi()?.setSunPathVisible(sunPathToggle.checked));
environmentEnabledToggle?.addEventListener('change', () => { getApi()?.setEnvironmentEnabled(environmentEnabledToggle.checked); shell.markDirty(); });
environmentRadiusControl?.addEventListener('change', () => { getApi()?.setEnvironmentRadius(environmentRadiusControl.value); shell.markDirty(); });
terrainExaggerationControl?.addEventListener('change', () => { getApi()?.setTerrainExaggeration(terrainExaggerationControl.value); shell.markDirty(); });
terrainLayerToggle?.addEventListener('change', () => { getApi()?.setEnvironmentLayer('terrain', terrainLayerToggle.checked); shell.markDirty(); });
buildingsLayerToggle?.addEventListener('change', () => { getApi()?.setEnvironmentLayer('buildings', buildingsLayerToggle.checked); shell.markDirty(); });
roadsLayerToggle?.addEventListener('change', () => { getApi()?.setEnvironmentLayer('roads', roadsLayerToggle.checked); shell.markDirty(); });
treesLayerToggle?.addEventListener('change', () => { getApi()?.setEnvironmentLayer('trees', treesLayerToggle.checked); shell.markDirty(); });
localPositionStepControl?.addEventListener('change', () => { getApi()?.setLocalPositionStep(localPositionStepControl.value); shell.markDirty(); });
localPositionNudgeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const step = Number(localPositionStepControl?.value || lastToolsState?.environmentLocalStepM || 1);
    getApi()?.adjustLocalPosition(
      (Number(button.dataset.localEast) || 0) * step,
      (Number(button.dataset.localNorth) || 0) * step,
    );
    shell.markDirty();
  });
});
localPositionResetButton?.addEventListener('click', () => { getApi()?.resetLocalPosition(); shell.markDirty(); });
replaceHostBuildingToggle?.addEventListener('change', () => { getApi()?.setReplaceHostBuilding(replaceHostBuildingToggle.checked); shell.markDirty(); });
localBuildingShadingToggle?.addEventListener('change', () => { getApi()?.setLocalBuildingShadingEnabled(localBuildingShadingToggle.checked); shell.markDirty(); });
environmentRefreshButton?.addEventListener('click', () => getApi()?.refreshEnvironment());
environmentFocusButton?.addEventListener('click', () => getApi()?.focusEnvironment());
pvgisUseHorizonToggle?.addEventListener('change', () => { getApi()?.setPvgisUseHorizon(pvgisUseHorizonToggle.checked); shell.markDirty(); });
pvgisShowHorizonToggle?.addEventListener('change', () => { getApi()?.setPvgisHorizonVisible(pvgisShowHorizonToggle.checked); shell.markDirty(); });
pvgisRefreshButton?.addEventListener('click', () => getApi()?.refreshPvgis());
const applyPvgisProxy = async () => {
  const api = getApi();
  if (!api) {
    if (pvgisProxyFeedback) {
      pvgisProxyFeedback.textContent = 'Configurator is still loading. Try again in a moment.';
      pvgisProxyFeedback.dataset.status = 'error';
    }
    return;
  }
  await api.setPvgisProxyEndpoint(pvgisProxyInput?.value || '');
  shell.markDirty();
};
pvgisProxyApplyButton?.addEventListener('click', applyPvgisProxy);
pvgisProxyInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); applyPvgisProxy(); } });

const unlockGoogleSolarAccess = async () => {
  const code = String(googleSolarAccessCode?.value || '');
  if (!code) {
    if (googleSolarAccessFeedback) {
      googleSolarAccessFeedback.textContent = 'Enter the demo access code first.';
      googleSolarAccessFeedback.dataset.status = 'error';
    }
    return;
  }
  await getApi()?.unlockGoogleSolar?.(code);
};
googleSolarUnlockButton?.addEventListener('click', unlockGoogleSolarAccess);
googleSolarAccessCode?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); unlockGoogleSolarAccess(); }
});
googleSolarLockButton?.addEventListener('click', () => getApi()?.lockGoogleSolar?.());
googleSolarAnalyzeButton?.addEventListener('click', () => getApi()?.refreshGoogleSolar?.(false));
googleSolarRefreshButton?.addEventListener('click', () => getApi()?.refreshGoogleSolar?.(true));
googleSolarShadingToggle?.addEventListener('change', () => {
  getApi()?.setGoogleSolarShadingEnabled?.(googleSolarShadingToggle.checked);
  shell.markDirty();
});
googleSolarDsmToggle?.addEventListener('change', () => {
  getApi()?.setGoogleSolarDsmEnabled?.(googleSolarDsmToggle.checked);
  shell.markDirty();
});
googleSolarMaskToggle?.addEventListener('change', () => {
  getApi()?.setGoogleSolarBuildingMaskVisible?.(googleSolarMaskToggle.checked);
  shell.markDirty();
});
googleSolarRawDsmToggle?.addEventListener('change', () => {
  getApi()?.setGoogleSolarRawDsmVisible?.(googleSolarRawDsmToggle.checked);
  shell.markDirty();
});
googleSolarReferenceToggle?.addEventListener('change', () => {
  getApi()?.setGoogleSolarReferenceBuildingVisible?.(googleSolarReferenceToggle.checked);
  shell.markDirty();
});

// Exact-location picker remains intentionally bounded to Romania for now,
// matching the existing production model and Europe/Bucharest time zone.
const locationDialog = document.querySelector('#locationPickerDialog');
const locationMapElement = document.querySelector('#locationMap');
const locationPickerClose = document.querySelector('#locationPickerClose');
const locationPickerCancel = document.querySelector('#locationPickerCancel');
const locationPickerUse = document.querySelector('#locationPickerUse');
const locationSearchInput = document.querySelector('#locationSearchInput');
const locationSearchButton = document.querySelector('#locationSearchButton');
const locationSearchResults = document.querySelector('#locationSearchResults');
const locationGeolocateButton = document.querySelector('#locationGeolocateButton');
const locationSelectionLabel = document.querySelector('#locationSelectionLabel');
const locationSelectionCoordinates = document.querySelector('#locationSelectionCoordinates');
let locationMap = null;
let locationMarker = null;
let pendingLocation = null;

const ROMANIA_BOUNDS = {
  south: 43.55,
  west: 20.15,
  north: 48.35,
  east: 29.85,
};

function inRomaniaBounds(lat, lon) {
  return lat >= ROMANIA_BOUNDS.south && lat <= ROMANIA_BOUNDS.north
    && lon >= ROMANIA_BOUNDS.west && lon <= ROMANIA_BOUNDS.east;
}

function setPendingLocation(lat, lon, label = 'Selected map point', { moveMap = true } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (!inRomaniaBounds(latitude, longitude)) {
    if (locationSelectionLabel) locationSelectionLabel.textContent = 'Location selection is currently limited to Romania.';
    if (locationSelectionCoordinates) locationSelectionCoordinates.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    if (locationPickerUse) locationPickerUse.disabled = true;
    return false;
  }
  pendingLocation = { lat: latitude, lon: longitude, label };
  if (locationSelectionLabel) locationSelectionLabel.textContent = label;
  if (locationSelectionCoordinates) locationSelectionCoordinates.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  if (locationPickerUse) locationPickerUse.disabled = false;
  if (locationMap && window.L) {
    if (!locationMarker) locationMarker = window.L.marker([latitude, longitude]).addTo(locationMap);
    else locationMarker.setLatLng([latitude, longitude]);
    if (moveMap) locationMap.setView([latitude, longitude], Math.max(locationMap.getZoom(), 14));
  }
  return true;
}

function ensureLocationMap() {
  if (locationMap || !locationMapElement) return;
  if (!window.L) {
    locationMapElement.textContent = 'Map library could not be loaded. Check the network connection and reopen the picker.';
    return;
  }
  const detail = lastToolsState || getApi()?.getState?.() || {};
  const lat = Number(detail.activeLocationLat) || 44.4268;
  const lon = Number(detail.activeLocationLon) || 26.1025;
  locationMap = window.L.map(locationMapElement, {
    minZoom: 6,
    maxZoom: 19,
    maxBounds: [[ROMANIA_BOUNDS.south, ROMANIA_BOUNDS.west], [ROMANIA_BOUNDS.north, ROMANIA_BOUNDS.east]],
    maxBoundsViscosity: 0.8,
  }).setView([lat, lon], 11);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(locationMap);
  locationMap.on('click', (event) => setPendingLocation(event.latlng.lat, event.latlng.lng, 'Selected map point', { moveMap: false }));
}

function openLocationPicker() {
  if (!locationDialog) return;
  ensureLocationMap();
  const detail = lastToolsState || getApi()?.getState?.() || {};
  const lat = Number(detail.activeLocationLat) || 44.4268;
  const lon = Number(detail.activeLocationLon) || 26.1025;
  setPendingLocation(lat, lon, detail.activeLocationLabel || 'Current location', { moveMap: false });
  if (typeof locationDialog.showModal === 'function' && !locationDialog.open) locationDialog.showModal();
  else locationDialog.setAttribute('open', '');
  requestAnimationFrame(() => {
    locationMap?.invalidateSize();
    locationMap?.setView([lat, lon], detail.locationMode === 'exact' ? 15 : 11);
  });
}

function closeLocationPicker() {
  if (!locationDialog) return;
  if (typeof locationDialog.close === 'function' && locationDialog.open) locationDialog.close();
  else locationDialog.removeAttribute('open');
}

function renderSearchResults(items) {
  if (!locationSearchResults) return;
  locationSearchResults.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'solar-location-search-empty';
    empty.textContent = 'No Romanian locations found. You can still click directly on the map.';
    locationSearchResults.appendChild(empty);
    locationSearchResults.hidden = false;
    return;
  }
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'solar-location-result';
    const title = document.createElement('strong');
    title.textContent = item.display_name || 'Search result';
    const coords = document.createElement('small');
    coords.textContent = `${Number(item.lat).toFixed(5)}, ${Number(item.lon).toFixed(5)}`;
    button.append(title, coords);
    button.addEventListener('click', () => {
      setPendingLocation(item.lat, item.lon, item.display_name || 'Search result');
      locationSearchResults.hidden = true;
    });
    locationSearchResults.appendChild(button);
  });
  locationSearchResults.hidden = false;
}

async function searchLocation() {
  const query = String(locationSearchInput?.value || '').trim();
  if (!query) return;
  if (locationSearchButton) locationSearchButton.disabled = true;
  if (locationSelectionLabel) locationSelectionLabel.textContent = 'Searching…';
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '5',
      countrycodes: 'ro',
      addressdetails: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'en,ro;q=0.9' },
    });
    if (!response.ok) throw new Error(`Search HTTP ${response.status}`);
    renderSearchResults(await response.json());
    if (locationSelectionLabel) locationSelectionLabel.textContent = pendingLocation?.label || 'Choose one of the search results';
  } catch (error) {
    console.info('[Solar configurator] Location search unavailable.', error);
    renderSearchResults([]);
    if (locationSelectionLabel) locationSelectionLabel.textContent = 'Search unavailable — click directly on the map.';
  } finally {
    if (locationSearchButton) locationSearchButton.disabled = false;
  }
}

environmentChooseLocation?.addEventListener('click', openLocationPicker);
window.addEventListener('solar-open-location-picker', openLocationPicker);
locationPickerClose?.addEventListener('click', closeLocationPicker);
locationPickerCancel?.addEventListener('click', closeLocationPicker);
locationPickerUse?.addEventListener('click', () => {
  if (!pendingLocation) return;
  getApi()?.setLocation(pendingLocation);
  shell.markDirty();
  closeLocationPicker();
});
locationSearchButton?.addEventListener('click', searchLocation);
locationSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchLocation();
  }
});
locationGeolocateButton?.addEventListener('click', () => {
  if (!navigator.geolocation) {
    if (locationSelectionLabel) locationSelectionLabel.textContent = 'Browser geolocation is not available.';
    return;
  }
  if (locationSelectionLabel) locationSelectionLabel.textContent = 'Requesting browser location…';
  navigator.geolocation.getCurrentPosition(
    (position) => setPendingLocation(position.coords.latitude, position.coords.longitude, 'My current location'),
    () => { if (locationSelectionLabel) locationSelectionLabel.textContent = 'Could not access your location. Choose a point on the map instead.'; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !environmentPanel?.hidden && !locationDialog?.open) setEnvironmentPanelOpen(false);
});
window.addEventListener('solar-configurator-ready', (event) => syncToolsState(event.detail));
window.addEventListener('solar-tools-state-change', (event) => syncToolsState(event.detail));
window.addEventListener('resize', scheduleToolsPosition);

if (!relocateToolsToolbar()) {
  const toolsObserver = new MutationObserver(() => {
    if (relocateToolsToolbar()) toolsObserver.disconnect();
  });
  toolsObserver.observe(document.body, { childList: true, subtree: true });
}
if (toolsAnchor) new ResizeObserver(scheduleToolsPosition).observe(toolsAnchor);
requestAnimationFrame(() => {
  scheduleToolsPosition();
  syncToolsState();
});

window.SOLAR_CONFIGURATOR_SHARED_SHELL = shell;
