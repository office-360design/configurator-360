import '../../shared-ui/styles/index.css';
import 'leaflet/dist/leaflet.css';
import './styles/gas.css';
import { RouteElevationController } from './elevation/routeElevation.js';
import { RouteMap } from './map/RouteMap.js';
import { RouteObstacleController } from './obstacles/routeObstacles.js';
import { applyGasTranslations } from './i18n.js';
import { GasConfiguratorStore } from './state.js';
import { renderGasLayout } from './ui/layout.js';
import { renderGasState } from './ui/renderers.js';
import { mountGasSharedShell } from './ui/sharedShell.js';

const root = document.querySelector('#app');
if (!root) throw new Error('The #app mount element is missing.');

renderGasLayout(root);
const store = new GasConfiguratorStore();
let routeMap = null;
let resizeTimer = 0;
let elevationProfile = { status: 'idle', routeKey: '', samples: [] };
let obstacleScreening = { status: 'idle', routeKey: '', features: [], events: [] };

const elevationController = new RouteElevationController({
  onChange(nextProfile) {
    elevationProfile = nextProfile;
    renderGasState(root, store.get(), elevationProfile, obstacleScreening);
  },
});

const obstacleController = new RouteObstacleController({
  onChange(nextScreening) {
    obstacleScreening = nextScreening;
    const state = store.get();
    renderGasState(root, state, elevationProfile, obstacleScreening);
    routeMap?.sync(state, obstacleScreening);
  },
});

const sharedShellHandle = mountGasSharedShell({
  store,
  onSettingsPanelToggle() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => routeMap?.resize(), 210);
  },
});
const sharedShell = sharedShellHandle.shell;

const mapLoading = root.querySelector('#mapLoading');
const mapError = root.querySelector('#mapError');

try {
  routeMap = new RouteMap(root.querySelector('#routeMap'), store, {
    onLoadingChange(loading) {
      if (mapLoading) mapLoading.hidden = !loading;
    },
    onError(error) {
      if (mapError) mapError.hidden = !error;
    },
  });
} catch (error) {
  console.error('The route map could not be created.', error);
  if (mapLoading) mapLoading.hidden = true;
  if (mapError) mapError.hidden = false;
}

const numericBindings = [
  ['#trenchWidthInput', 'trench.widthM'],
  ['#beddingInput', 'trench.beddingM'],
  ['#startElevationInput', 'data.startElevationM'],
  ['#endElevationInput', 'data.endElevationM'],
];

const selectBindings = [
  ['#beddingMaterialSelect', 'trench.beddingMaterial'],
  ['#groundSourceSelect', 'data.groundSource'],
  ['#utilitySourceSelect', 'data.utilitySource'],
];

root.querySelectorAll('[data-route-mode]').forEach((button) => {
  button.addEventListener('click', () => store.setEditMode(button.dataset.routeMode));
});

root.querySelectorAll('[data-map-layer]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!routeMap) return;
    const visible = routeMap.toggleReferenceLayer(button.dataset.mapLayer);
    button.classList.toggle('is-active', visible);
    button.setAttribute('aria-pressed', String(visible));
  });
});

root.querySelector('#removeWaypointButton')?.addEventListener('click', () => store.removeSelectedWaypoint());
root.querySelector('#clearWaypointsButton')?.addEventListener('click', () => store.clearWaypoints());
root.querySelector('#fitRouteButton')?.addEventListener('click', () => routeMap?.fitRoute());
root.querySelector('#fitExistingNetworkButton')?.addEventListener('click', () => routeMap?.fitExistingNetwork());
root.querySelector('#snapToNearestNetworkButton')?.addEventListener('click', () => {
  if (store.snapStartToNearestNetwork()) store.setEditMode('setB');
});
root.querySelector('#connectionToleranceInput')?.addEventListener('change', (event) => {
  store.update('connection.snapToleranceM', Number(event.target.value), {
    source: 'connection-tolerance',
  });
});
root.querySelector('#retryElevationButton')?.addEventListener('click', () => {
  elevationController.retry(store.get().route.points);
});
root.querySelector('#retryObstacleScreeningButton')?.addEventListener('click', () => {
  const state = store.get();
  obstacleController.retry(state.route.points, {
    enabled: state.screening.obstaclesEnabled,
    proximityThresholdM: state.screening.proximityThresholdM,
  });
});
root.querySelector('#groundTypeSelect')?.addEventListener('change', (event) => store.setSegmentSetting('groundType', event.target.value));
root.querySelector('#surfaceTypeSelect')?.addEventListener('change', (event) => store.setSegmentSetting('surfaceType', event.target.value));
root.querySelector('#stationInput')?.addEventListener('input', (event) => store.setStation(Number(event.target.value)));
root.querySelector('#osdCapacityInput')?.addEventListener('change', (event) => store.update('project.osdCapacityKnown', event.target.checked));
root.querySelector('#obstacleScreeningEnabledInput')?.addEventListener('change', (event) => store.update('screening.obstaclesEnabled', event.target.checked));
root.querySelector('#obstacleProximityInput')?.addEventListener('change', (event) => store.update('screening.proximityThresholdM', Number(event.target.value)));
root.querySelector('#coverOsdAgreementInput')?.addEventListener('change', (event) => store.update('regulatory.reducedCover.osdAgreement', event.target.checked));
root.querySelector('#coverProtectionInput')?.addEventListener('change', (event) => store.update('regulatory.reducedCover.additionalProtection', event.target.checked));
root.querySelector('#materialSelect')?.addEventListener('change', (event) => store.setPipeSelection({ material: event.target.value }));
root.querySelector('#diameterSelect')?.addEventListener('change', (event) => store.setPipeSelection({ diameterMm: Number(event.target.value) }));
root.querySelector('#sdrSelect')?.addEventListener('change', (event) => store.setPipeSelection({ sdr: event.target.value }));
root.querySelector('#pressureInput')?.addEventListener('change', (event) => store.setPipeSelection({ designPressureBar: Number(event.target.value) }));
root.querySelector('#coverInput')?.addEventListener('change', (event) => store.setTrenchCover(Number(event.target.value)));

root.querySelector('#addRouteEventButton')?.addEventListener('click', () => store.addRouteEvent());
root.querySelector('#removeRouteEventButton')?.addEventListener('click', () => store.removeSelectedRouteEvent());
root.querySelector('#routeEventList')?.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-route-event-id]');
  if (button) store.selectRouteEvent(button.dataset.routeEventId);
});
root.querySelector('#routeEventLabelInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('label', event.target.value));
root.querySelector('#routeEventStationInput')?.addEventListener('input', (event) => store.setRouteEventStation(Number(event.target.value)));
root.querySelector('#routeEventTypeSelect')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('type', event.target.value));
root.querySelector('#routeEventSourceSelect')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('source', event.target.value));
root.querySelector('#routeEventMethodSelect')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.installationMethod', event.target.value));
root.querySelector('#routeEventUtilityTypeSelect')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.utilityType', event.target.value));
root.querySelector('#routeEventGasPositionSelect')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.gasPosition', event.target.value));
root.querySelector('#routeEventAngleInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.angleDeg', Number(event.target.value)));
root.querySelector('#routeEventWidthInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.obstacleWidthM', Number(event.target.value)));
root.querySelector('#routeEventClearanceInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.verticalClearanceM', Number(event.target.value)));
root.querySelector('#routeEventSleeveInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.protectiveSleeve', event.target.checked));
root.querySelector('#routeEventOwnerApprovalInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('crossing.ownerApprovalDocumented', event.target.checked));
root.querySelector('#routeEventConfirmedInput')?.addEventListener('change', (event) => store.updateSelectedRouteEvent('confirmed', event.target.checked));

numericBindings.forEach(([selector, path]) => {
  root.querySelector(selector)?.addEventListener('change', (event) => store.update(path, Number(event.target.value)));
});

selectBindings.forEach(([selector, path, transform = String]) => {
  root.querySelector(selector)?.addEventListener('change', (event) => store.update(path, transform(event.target.value)));
});

root.querySelector('#obstacleEventList')?.addEventListener('click', (event) => {
  const configuredButton = event.target?.closest?.('[data-obstacle-route-event-id]');
  if (configuredButton) {
    store.selectRouteEvent(configuredButton.dataset.obstacleRouteEventId);
    store.setEditMode('inspect');
    return;
  }

  const addButton = event.target?.closest?.('[data-obstacle-event-add]');
  if (addButton) {
    const screeningEvent = obstacleScreening.events?.find((candidate) => (
      candidate.id === addButton.dataset.obstacleEventAdd
    ));
    if (screeningEvent) store.addRouteEventFromObstacle(screeningEvent);
    return;
  }

  const button = event.target?.closest?.('[data-obstacle-event-station]');
  if (!button) return;
  const stationM = Number(button.dataset.obstacleEventStation);
  const segmentId = button.dataset.obstacleEventSegment;
  if (segmentId) store.selectSegment(segmentId, stationM);
  else store.setStation(stationM);
  store.setEditMode('inspect');
});

root.querySelector('#profileSvg')?.addEventListener('pointerdown', (event) => {
  const svg = event.currentTarget;
  const matrix = svg.getScreenCTM();
  if (!matrix) return;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  const progress = Math.max(0, Math.min(1, (local.x - 48) / (720 - 48 - 16)));
  const current = store.get();
  const stationInput = root.querySelector('#stationInput');
  const total = Number(stationInput?.max) || 0;
  store.setStation(total * progress);
  if (current.route.editMode !== 'inspect') store.setEditMode('inspect');
});

const unsubscribe = store.subscribe((state) => {
  applyGasTranslations(root, state.preferences.locale);
  document.documentElement.lang = state.preferences.locale.split('-')[0];
  renderGasState(root, state, elevationProfile, obstacleScreening);
  routeMap?.sync(state, obstacleScreening);
  elevationController.request(state.route.points);
  obstacleController.request(state.route.points, {
    enabled: state.screening.obstaclesEnabled,
    proximityThresholdM: state.screening.proximityThresholdM,
  });
  ['locale', 'units', 'currency', 'darkMode'].forEach((preference) => {
    sharedShell.setPreference?.(preference, state.preferences[preference]);
  });
});

const onResize = () => routeMap?.resize();
window.addEventListener('resize', onResize, { passive: true });

window.addEventListener('beforeunload', () => {
  window.clearTimeout(resizeTimer);
  window.removeEventListener('resize', onResize);
  unsubscribe();
  elevationController.destroy();
  obstacleController.destroy();
  routeMap?.destroy();
  sharedShellHandle.destroy();
}, { once: true });
