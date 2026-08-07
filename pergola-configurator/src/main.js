import './styles/pergola.css';
import '../../shared-ui/styles/index.css';
import './styles/pergola-theme-overrides.css';
import { ConfiguratorStore } from './state.js';
import { PergolaScene } from './scene/PergolaScene.js';
import { ConfiguratorUI } from './ui/ConfiguratorUI.js';

const root = document.querySelector('#app');

if (!root) {
  throw new Error('The #app mount element is missing.');
}

const store = new ConfiguratorStore();
const ui = new ConfiguratorUI(root, store);
const viewport = root.querySelector('[data-viewport]');

if (!viewport) {
  throw new Error('The 3D viewport mount element is missing.');
}

let scene;

try {
  scene = new PergolaScene(viewport, store);
  ui.attachScene(scene);
} catch (error) {
  console.error('The 3D scene could not be initialized.', error);
  viewport.innerHTML = `
    <div class="webgl-error">
      <strong>3D preview unavailable</strong>
      <p>Your browser or graphics driver could not initialize WebGL.</p>
    </div>
  `;
}

window.addEventListener('beforeunload', () => {
  scene?.destroy();
  ui.destroy();
});
