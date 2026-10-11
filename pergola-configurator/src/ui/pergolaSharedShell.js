import { mountStandaloneConfiguratorShell } from '../../../shared-ui/src/standaloneShell.js?v=firebase-ar-4';
import { resolveSharedTools } from '../../../shared-ui/src/tools/registry.js?v=platform-18';
import { escapeHtml } from '../../../shared-ui/src/utils.js?v=platform-18';
import { pergolaT } from '../i18n.js?v=platform-18';
import { calculatePrice, formatMoney } from '../pricing.js?v=platform-18';

import { createPergolaARController } from '../ar/controller.js?v=pergola-ar-2';

function cloneState(state) {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

export function mountPergolaSharedShell({ store, ui, tenantContext = null }) {
  const initial = store.get();
  const t = (key, variables = {}, locale = null) => pergolaT(locale ?? store.get().locale, key, variables);

  let shell;
  const ar = createPergolaARController({
    getScene: () => ui.scene,
    getState: () => store.get(),
    onFeedback: (message, tone, duration) => shell?.showFeedback?.(message, tone, duration),
  });

  shell = mountStandaloneConfiguratorShell({
    productType: 'Pergola',
    productId: 'pergola',
    storagePrefix: 'pergola-configurator',
    brandSrc: tenantContext?.logoUrl || './assets/360CONFIGURATOR.png',
    brandAlt: tenantContext?.companyName || '360 Configurator',
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
    settingsPanel: {
      panelSelector: '.configurator-sidebar',
      toggleSelector: '#pergolaSidebarToggle',
      collapsedClass: 'is-collapsed',
      bodyCollapsedClass: 'pergola-sidebar-collapsed',
      initiallyCollapsed: ui.mobileLayoutQuery.matches,
    },
    configuratorPanel: {
      panelSelector: '.configurator-sidebar',
      footerSelector: '[data-sidebar-footer]',
      bodySelector: '.sidebar-scroll',
      geometry: 'floating-right',
      getEstimatedTotal() {
        const state = store.get();
        return formatMoney(calculatePrice(state).total, state.currency, state.locale);
      },
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
        ar.open();
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
      onSettingsPanelToggle(collapsed) {
        ui.setSidebarHidden(collapsed, { fromSharedShell: true });
      },
      onAccountAction(action) {
        // Profile is now fully owned by the Common UI. Do not open the legacy
        // Pergola placeholder modal behind it.
        if (action === 'help') ui.showModal(t('modal.helpTitle'), `<p>${escapeHtml(t('modal.helpBody'))}</p>`);
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
  let arLocale = store.get().locale;
  const unsubscribeAR = store.subscribe(state => {
    if (state.locale !== arLocale) { arLocale = state.locale; ar.refresh(); }
  });
  const destroyShell = shell.destroy?.bind(shell);
  shell.destroy = () => { unsubscribeAR?.(); ar.destroy(); destroyShell?.(); };
  return shell;
}
