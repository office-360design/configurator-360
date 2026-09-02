import '../../shared-ui/styles/index.css';
import 'leaflet/dist/leaflet.css';
import './styles/gas.css';
import { RouteMap } from './map/RouteMap.js';
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
  ['#pressureInput', 'pipe.designPressureBar'],
  ['#coverInput', 'trench.coverM'],
  ['#trenchWidthInput', 'trench.widthM'],
  ['#beddingInput', 'trench.beddingM'],
  ['#startElevationInput', 'data.startElevationM'],
  ['#endElevationInput', 'data.endElevationM'],
];

const selectBindings = [
  ['#materialSelect', 'pipe.material'],
  ['#diameterSelect', 'pipe.diameterMm', Number],
  ['#sdrSelect', 'pipe.sdr'],
  ['#groundSourceSelect', 'data.groundSource'],
  ['#utilitySourceSelect', 'data.utilitySource'],
];

root.querySelectorAll('[data-route-mode]').forEach((button) => {
  button.addEventListener('click', () => store.setEditMode(button.dataset.routeMode));
});

root.querySelector('#removeWaypointButton')?.addEventListener('click', () => store.removeSelectedWaypoint());
root.querySelector('#clearWaypointsButton')?.addEventListener('click', () => store.clearWaypoints());
root.querySelector('#fitRouteButton')?.addEventListener('click', () => routeMap?.fitRoute());
root.querySelector('#groundTypeSelect')?.addEventListener('change', (event) => store.setSegmentSetting('groundType', event.target.value));
root.querySelector('#surfaceTypeSelect')?.addEventListener('change', (event) => store.setSegmentSetting('surfaceType', event.target.value));
root.querySelector('#stationInput')?.addEventListener('input', (event) => store.setStation(Number(event.target.value)));
root.querySelector('#osdCapacityInput')?.addEventListener('change', (event) => store.update('project.osdCapacityKnown', event.target.checked));

numericBindings.forEach(([selector, path]) => {
  root.querySelector(selector)?.addEventListener('change', (event) => store.update(path, Number(event.target.value)));
});

selectBindings.forEach(([selector, path, transform = String]) => {
  root.querySelector(selector)?.addEventListener('change', (event) => store.update(path, transform(event.target.value)));
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
  renderGasState(root, state);
  routeMap?.sync(state);
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
  routeMap?.destroy();
  sharedShellHandle.destroy();
}, { once: true });
