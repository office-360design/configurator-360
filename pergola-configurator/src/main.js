import './styles/pergola.css?v=pergola-panel-1';
import '../../shared-ui/styles/ar.css?v=firebase-ar-3';
import '../../shared-ui/styles/index.css?v=platform-18';
import './styles/pergola-theme-overrides.css?v=pergola-panel-1';
import '../../shared-ui/styles/panelControls.css?v=pergola-panel-1';
import './styles/panel-adapter.css?v=pergola-panel-1';
import { ConfiguratorStore } from './state.js?v=locales-6';
import { readShareState } from '../../shared-ui/src/shareState.js?v=locales-6';
import { applyConfiguratorSeo } from '../../shared-ui/src/configuratorSeo.js?v=locales-6';
import { getLanguageProfile, getLocaleForHostname } from '../../shared-ui/src/config.js?v=locales-6';
import { PergolaScene } from './scene/PergolaScene.js?v=locales-6';
import { ConfiguratorUI } from './ui/ConfiguratorUI.js?v=mobile-panels-1';
import { mountPergolaSharedShell } from './ui/pergolaSharedShell.js?v=mobile-panels-1';
import { pergolaT } from './i18n.js?v=locales-6';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=locales-6';
import { mountPergolaEmbedPreviewControls } from './ui/embedPreviewControls.js?v=mobile-panels-1';
import { initializePergolaColorCatalog } from './color-catalog.js';

const tenantContext = await requireTenantConfiguratorAccess('pergola');

applyConfiguratorSeo('pergola');

const root = document.querySelector('#app');

if (!root) {
  throw new Error('The #app mount element is missing.');
}

const [sharedState] = await Promise.all([
  readShareState({ productType: 'pergola' }),
  initializePergolaColorCatalog(),
]);
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
const sharedShell = mountPergolaSharedShell({ store, ui, tenantContext });
const viewport = root.querySelector('[data-viewport]');

if (!viewport) {
  throw new Error('The 3D viewport mount element is missing.');
}

let scene;
const embedPreviewControls = mountPergolaEmbedPreviewControls({ store, viewport });

try {
  scene = new PergolaScene(viewport, store);
  ui.attachScene(scene);
} catch (error) {
  console.error('The 3D scene could not be initialized.', error);
  viewport.innerHTML = `
    <div class="webgl-error">
      <strong>${pergolaT(domainLocale, 'app.webglTitle')}</strong>
      <p>${pergolaT(domainLocale, 'app.webglBody')}</p>
    </div>
  `;
}

window.addEventListener('beforeunload', () => {
  scene?.destroy();
  embedPreviewControls?.destroy();
  sharedShell?.destroy();
  ui.destroy();
});
