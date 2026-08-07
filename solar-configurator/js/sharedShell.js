import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=3';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=2';
import { formatAzimuth, getSeasonForDate } from './solarPosition.js?v=1';

const icon = (body) => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${body}
  </svg>
`;

const tools = [
  ...resolveSharedTools([
    {
      id: 'environment',
      label: 'Location & sun',
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
const sunriseValue = document.querySelector('#sunriseValue');
const sunsetValue = document.querySelector('#sunsetValue');
const sunElevationValue = document.querySelector('#sunElevationValue');
const sunAzimuthValue = document.querySelector('#sunAzimuthValue');
const solarNoonValue = document.querySelector('#solarNoonValue');
let relocatedToolsToolbar = null;
let toolsPositionFrame = 0;
let lastToolsState = null;

const getApi = () => window.SOLAR_CONFIGURATOR_API;
const getToolButton = (toolId) => shell.host.querySelector(`[data-tool-id="${toolId}"]`);

function formatHour(decimalHour) {
  const totalMinutes = Math.min(1439, Math.max(0, Math.round((Number(decimalHour) || 0) * 60)));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
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
  setToolState('environment', { active: isOpen, title: 'Location, sun and roof orientation' });
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

// Exact-location picker. Phase 1 deliberately keeps the picker within Romania,
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
    if (locationSelectionLabel) locationSelectionLabel.textContent = 'Phase 1 location selection is limited to Romania.';
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
