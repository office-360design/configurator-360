import { state, deriveHallMetrics } from './state.js?v=8';
import { HallScene } from './scene.js?v=8';
import { HallUI } from './ui.js?v=8';

const scene = new HallScene(document.querySelector('#canvasHost'));
let rebuildTimer = 0;
let lastFitCamera = false;
let environmentPanelOpen = false;
let currentBuild = null;

function syncToolButtons() {
  const setActive = (id, active) => document.querySelector(`[data-tool-id="${id}"]`)?.classList.toggle('is-active', Boolean(active));
  setActive('environment', environmentPanelOpen);
  setActive('dimensions', state.showDimensions);
  setActive('compass', state.compassVisible);
  setActive('technical-edges', state.technicalEdges);
  setActive('explode', state.explode > 0);
}

function rebuildNow({ fitCamera = false } = {}) {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = 0;
  currentBuild = scene.rebuild(state, { fitCamera: fitCamera || lastFitCamera });
  lastFitCamera = false;
  ui.update(currentBuild);
  scene.applyDisplayState(state);
  scene.applyEnvironment(state);
  syncToolButtons();
  window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  return currentBuild;
}

function scheduleRebuild({ fitCamera = false, immediate = false } = {}) {
  lastFitCamera ||= fitCamera;
  if (immediate) {
    rebuildNow({ fitCamera: lastFitCamera });
    return;
  }
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => rebuildNow({ fitCamera: lastFitCamera }), 110);
}

const ui = new HallUI(state, {
  onModelChange(options = {}) { scheduleRebuild(options); },
  onDisplayChange() {
    scene.applyDisplayState(state);
    scene.updateDimensions(state, currentBuild?.metrics ?? deriveHallMetrics(state));
    syncToolButtons();
    window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  },
  onSceneryChange() {
    scene.updateEnvironment(state, { force: true });
    scene.applyEnvironment(state);
    window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  },
  onInspectionChange() {
    const needsDetails = state.inspectionMode === 'connections' || state.inspectionMode === 'foundations';
    if (needsDetails && !currentBuild?.detailGeometry) rebuildNow();
    else scene.applyDisplayState(state);
    syncToolButtons();
  },
  onConnectionDetailsChange() {
    if (state.connectionDetails && !currentBuild?.detailGeometry) rebuildNow();
    else scene.applyDisplayState(state);
  },
  onExplode(value) {
    if (value > 0 && !currentBuild?.detailGeometry) rebuildNow();
    scene.setExplode(value, state);
    scene.applyDisplayState(state);
    syncToolButtons();
    window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  },
  onEnvironmentChange() {
    scene.applyEnvironment(state);
    syncToolButtons();
    window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  },
  onEnvironmentPanelToggle(open) {
    environmentPanelOpen = Boolean(open);
    ui.setEnvironmentPanelOpen(environmentPanelOpen);
    syncToolButtons();
  },
  onView(view) {
    if (view === 'reset') scene.fitCamera(state, deriveHallMetrics(state));
    else scene.setView(view, state, deriveHallMetrics(state));
  },
});

currentBuild = scene.rebuild(state, { fitCamera: true });
ui.update(currentBuild);
scene.applyDisplayState(state);
scene.applyEnvironment(state);

function applyHallDarkMode(enabled) {
  const dark = Boolean(enabled);
  document.querySelector('.app-shell')?.classList.toggle('is-dark-mode', dark);
  scene.setDarkMode(dark, state);
}

function toggleEnvironmentPanel() {
  environmentPanelOpen = !environmentPanelOpen;
  ui.setEnvironmentPanelOpen(environmentPanelOpen);
  syncToolButtons();
}

function closeToolPanels() {
  if (!environmentPanelOpen) return;
  environmentPanelOpen = false;
  ui.setEnvironmentPanelOpen(false);
  syncToolButtons();
}

function toggleDimensions() {
  state.showDimensions = !state.showDimensions;
  scene.updateDimensions(state, currentBuild?.metrics ?? deriveHallMetrics(state));
  syncToolButtons();
}

function toggleCompass() {
  state.compassVisible = !state.compassVisible;
  scene.applyEnvironment(state);
  syncToolButtons();
}

function cycleCamera() {
  const presets = ['3d', 'front', 'side', 'top'];
  const index = Math.max(0, presets.indexOf(state.cameraPreset));
  state.cameraPreset = presets[(index + 1) % presets.length];
  scene.setView(state.cameraPreset, state, currentBuild?.metrics ?? deriveHallMetrics(state));
}

function toggleTechnicalEdges() {
  state.technicalEdges = !state.technicalEdges;
  rebuildNow();
}

function toggleExplode() {
  ui.setExplodeValue(state.explode > 0 ? 0 : 100);
}

window.HALL_CONFIGURATOR_API = {
  captureState: () => ui.captureState(),
  restoreState: (snapshot) => ui.restoreState(snapshot),
  getState: () => structuredClone(state),
  setDarkMode: applyHallDarkMode,
  resetView: () => scene.fitCamera(state, deriveHallMetrics(state)),
  rebuild: () => rebuildNow(),
  toggleEnvironmentPanel,
  closeToolPanels,
  toggleDimensions,
  toggleCompass,
  cycleCamera,
  toggleTechnicalEdges,
  toggleExplode,
  syncToolButtons,
};

applyHallDarkMode(Boolean(window.HALL_CONFIGURATOR_SHARED_SHELL?.state?.darkMode));
syncToolButtons();
