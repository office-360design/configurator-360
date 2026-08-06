import { state } from './state.js?v=12';
import { RoofScene } from './scene.js?v=14';
import { RoofUI } from './ui.js?v=12';

const host = document.querySelector('#canvasHost');
const scene = new RoofScene(host);
let lastMetrics = null;

const ui = new RoofUI(state, ({ fitCamera = false } = {}) => {
  lastMetrics = scene.rebuild(state, fitCamera);
  ui.updateMetrics(lastMetrics);
});

lastMetrics = scene.rebuild(state, true);
ui.updateMetrics(lastMetrics);

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view === 'reset') scene.fitCamera(state, lastMetrics.ridgeElevation);
    else scene.setView(view, state, lastMetrics.ridgeElevation);

    if (view !== 'reset') {
      document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
    }
  });
});
