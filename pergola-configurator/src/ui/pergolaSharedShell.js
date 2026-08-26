import { mountStandaloneConfiguratorShell } from '../../../shared-ui/src/standaloneShell.js?v=23';
import { resolveSharedTools } from '../../../shared-ui/src/tools/registry.js?v=12';
import { escapeHtml } from '../../../shared-ui/src/utils.js?v=12';
import { pergolaT } from '../i18n.js';

function cloneState(state) {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

export function mountPergolaSharedShell({ store, ui }) {
  const initial = store.get();
  const t = (key, variables = {}, locale = null) => pergolaT(locale ?? store.get().locale, key, variables);

  const shell = mountStandaloneConfiguratorShell({
    productType: 'Pergola',
    productId: 'pergola',
    storagePrefix: 'pergola-configurator',
    brandSrc: './assets/360CONFIGURATOR.png',
    brandAlt: '360 Configurator',
    capabilities: { viewAR: true, save: true, undo: true, reset: true, share: true },
    tools: {
      items: resolveSharedTools([
        'environment',
        { id: 'dimensions', active: Boolean(initial.view.dimensionsVisible) },
        { id: 'compass', active: Boolean(initial.view.compassVisible) },
        'camera',
      ]),
      placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
    },
    callbacks: {
      onUndo() {
        if (!store.undo?.()) ui.showToast(t('feedback.nothingToUndo'));
      },
      resetConfiguration() {
        store.reset();
        return true;
      },
      onViewAR() {
        const state = store.get();
        const platform = state.defaultArPlatform === 'ios' ? 'iOS' : 'Android';
        ui.showModal(t('modal.arTitle'), `<p>${escapeHtml(t('modal.arPlatform', { platform }))}</p><p>${escapeHtml(t('modal.arUnavailable'))}</p>`);
      },
      captureState() {
        return cloneState(store.get());
      },
      restoreState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        store.patch(cloneState(snapshot), { path: 'saved-configuration', skipHistory: true });
        return true;
      },
      getShareUrl() {
        return store.getShareUrl();
      },
      onPreferenceChange(path, value) {
        store.update(path, value, { path });
      },
      onAccountAction(action) {
        if (action === 'profile') ui.showModal(t('modal.profileTitle'), `<p>${escapeHtml(t('modal.profileBody'))}</p>`);
        else if (action === 'help') ui.showModal(t('modal.helpTitle'), `<p>${escapeHtml(t('modal.helpBody'))}</p>`);
        else if (action === 'cookies') ui.showToast(t('feedback.cookiesUnavailable'));
      },
      onToolAction({ toolId }) {
        const state = store.get();
        if (toolId === 'environment') ui.toggleEnvironmentPanel();
        else if (toolId === 'dimensions') store.update('view.dimensionsVisible', !state.view.dimensionsVisible);
        else if (toolId === 'compass') store.update('view.compassVisible', !state.view.compassVisible);
        else if (toolId === 'camera') ui.cycleCameraPreset();
      },
    },
  });

  const preferences = shell.state;
  store.patch({
    locale: preferences.locale,
    units: preferences.units,
    currency: preferences.currency,
    quality: preferences.quality,
    defaultArPlatform: preferences.defaultArPlatform,
    darkMode: preferences.darkMode,
  }, { path: 'shared-shell-preferences', skipHistory: true });

  ui.attachSharedShell(shell);
  return shell;
}
