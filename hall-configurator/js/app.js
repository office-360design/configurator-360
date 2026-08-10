import { state, deriveHallMetrics } from './state.js?v=5';
import { HallScene } from './scene.js?v=5';
import { HallUI } from './ui.js?v=5';

const scene = new HallScene(document.querySelector('#canvasHost'));
let scheduled = 0;
let lastFitCamera = false;

const ui = new HallUI(state, {
  onModelChange({ fitCamera = false } = {}) {
    lastFitCamera ||= fitCamera;
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      const build = scene.rebuild(state, { fitCamera: lastFitCamera });
      lastFitCamera = false;
      ui.update(build);
      window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
    });
  },
  onExplode(value) {
    scene.setExplode(value);
    window.HALL_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
  },
  onView(view) {
    if (view === 'reset') scene.fitCamera(state, deriveHallMetrics(state));
    else scene.setView(view, state, deriveHallMetrics(state));
  },
});

const initialBuild = scene.rebuild(state, { fitCamera: true });
ui.update(initialBuild);

function applyHallDarkMode(enabled) {
  const dark = Boolean(enabled);
  document.querySelector('.app-shell')?.classList.toggle('is-dark-mode', dark);
  scene.setDarkMode(dark);
}

window.HALL_CONFIGURATOR_API = {
  captureState: () => ui.captureState(),
  restoreState: (snapshot) => ui.restoreState(snapshot),
  getState: () => structuredClone(state),
  setDarkMode: applyHallDarkMode,
  resetView: () => scene.fitCamera(state, deriveHallMetrics(state)),
  rebuild: () => {
    const build = scene.rebuild(state, { fitCamera: false });
    ui.update(build);
  },
};

// sharedShell mounts before this module, so explicitly inherit its initial theme.
applyHallDarkMode(Boolean(window.HALL_CONFIGURATOR_SHARED_SHELL?.state?.darkMode));
