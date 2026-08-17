import './styles/pergola.css';
import '../../shared-ui/styles/index.css';
import './styles/pergola-theme-overrides.css';
import { ConfiguratorStore } from './state.js';
import { readShareState } from '../../shared-ui/src/shareState.js';
import { applyConfiguratorSeo } from '../../shared-ui/src/configuratorSeo.js';
import { getLanguageProfile, getLocaleForHostname } from '../../shared-ui/src/config.js';
import { PergolaScene } from './scene/PergolaScene.js';
import { ConfiguratorUI } from './ui/ConfiguratorUI.js';

applyConfiguratorSeo('pergola');

const root = document.querySelector('#app');

if (!root) {
  throw new Error('The #app mount element is missing.');
}

const sharedState = await readShareState({ productType: 'pergola' });
const store = new ConfiguratorStore(sharedState);
const domainLocale = getLocaleForHostname(window.location.hostname);
const domainProfile = getLanguageProfile(domainLocale);
if (store.get().locale !== domainLocale) {
  store.patch({
    locale: domainLocale,
    units: domainProfile.units,
    currency: domainProfile.currency,
  }, { path: 'domain-locale', skipHistory: true });
}
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
