import { state, deriveHallMetrics } from './state.js?v=2';
import { HallScene } from './scene.js?v=2';
import { HallUI } from './ui.js?v=2';

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

window.HALL_CONFIGURATOR_API = {
  captureState: () => ui.captureState(),
  restoreState: (snapshot) => ui.restoreState(snapshot),
  getState: () => structuredClone(state),
  setDarkMode: (enabled) => scene.setDarkMode(Boolean(enabled)),
  rebuild: () => {
    const build = scene.rebuild(state, { fitCamera: false });
    ui.update(build);
  },
};
