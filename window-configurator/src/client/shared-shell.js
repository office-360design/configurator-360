import { convertCartMoneyAmount, mountStandaloneConfiguratorShell } from './shared-ui/src/standaloneShell.js?v=39';
import { SharedUndoManager } from './shared-ui/src/history/undoManager.js?v=1';
import { createShareUrl } from './shared-ui/src/shareState.js?v=5';
import { applyWindowTranslations, resolveWindowLocale, windowT } from './js/i18n.js?v=1';
import { requireTenantConfiguratorAccess } from './shared-ui/src/tenantBootstrap.js?v=1';

const tenantContext = await requireTenantConfiguratorAccess('window');

const initialLocale = resolveWindowLocale();
applyWindowTranslations(initialLocale);
const t = (key, variables = {}, locale = null) => windowT(locale ?? window.WINDOW_CONFIGURATOR_SHARED_SHELL?.state?.locale ?? initialLocale, key, variables);

const history = new SharedUndoManager({
  capture: () => window.WINDOW_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.WINDOW_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const shell = mountStandaloneConfiguratorShell({
  productType: t('project.type'),
  productId: 'window',
  storagePrefix: '360-configurator:window',
  brandSrc: tenantContext?.logoUrl || './shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: {
    viewAR: true,
    save: true,
    undo: true,
    reset: true,
    share: true,
  },
  // Tools are deliberately opt-in. Window developers can select tools from the
  // root registry later; none are enabled by this shared-UI update.
  tools: {
    items: [],
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '#controls',
    toggleSelector: '#sidebar-toggle',
    collapsedClass: 'sidebar-collapsed',
    bodyCollapsedClass: 'sidebar-is-collapsed',
  },
  configuratorPanel: {
    panelSelector: '#controls',
    fallbackValue: 0,
    getEstimatedTotal({ currency = 'EUR', locale = initialLocale } = {}) {
      const totalEur = window.WINDOW_CONFIGURATOR_API?.getEstimatedTotalEur?.();
      if (totalEur === null || totalEur === undefined || !Number.isFinite(Number(totalEur))) return null;
      const converted = convertCartMoneyAmount(Number(totalEur), 'EUR', currency);
      // Window configurator only: keep the Estimated total at currency precision
      // (two decimals) without changing the shared formatter used by other products.
      // Returning the formatted text also makes cart persistence parse the exact
      // displayed cents instead of storing a separately rounded whole-unit value.
      try {
        return new Intl.NumberFormat(locale || 'en-US', {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(converted);
      } catch {
        return `${currency} ${converted.toFixed(2)}`;
      }
    },
  },
  callbacks: {
    onViewAR() {
      document.querySelector('#qr-ar-button')?.click();
    },
    captureState() {
      return window.WINDOW_CONFIGURATOR_API?.captureState?.();
    },
    restoreState(snapshot) {
      return window.WINDOW_CONFIGURATOR_API?.restoreState?.(snapshot);
    },
    onUndo() {
      history.undo();
    },
    async resetConfiguration() {
      const api = window.WINDOW_CONFIGURATOR_API;
      if (!api?.resetConfiguration) return false;
      return (await api.resetConfiguration()) !== false;
    },
    onPreferenceChange(path, value, preferences) {
      if (path === 'locale') {
        applyWindowTranslations(value);
      }
      if (path === 'defaultArPlatform') {
        document.querySelector(`.ar-platform-option[data-platform="${value}"]`)?.click();
      }
      window.dispatchEvent(new CustomEvent('window-preference-change', {
        detail: { name: path, value, preferences: { ...preferences } },
      }));
    },
    getShareUrl() {
      const snapshot = window.WINDOW_CONFIGURATOR_API?.captureState?.();
      return snapshot
        ? createShareUrl({ productType: 'window', state: snapshot })
        : window.location.href;
    },
  },
});



const controls = document.querySelector('#controls');
history.bindSource(controls);

if (controls) {
  const markDirty = (event) => {
    if (event.target.closest('[data-shared-configurator-panel-footer]')) return;
    if (event.target.closest('button, input, select, textarea, summary')) shell.markDirty();
  };
  controls.addEventListener('click', markDirty, true);
  controls.addEventListener('input', markDirty, true);
  controls.addEventListener('change', markDirty, true);
}

const preferredPlatform = shell.state?.defaultArPlatform;
if (preferredPlatform) {
  window.setTimeout(() => {
    document.querySelector(`.ar-platform-option[data-platform="${preferredPlatform}"]`)?.click();
  }, 0);
}

window.WINDOW_CONFIGURATOR_SHARED_SHELL = shell;
window.WINDOW_CONFIGURATOR_UNDO_HISTORY = history;
window.dispatchEvent(new CustomEvent('window-shared-shell-ready', {
  detail: { currency: shell.state?.currency || 'EUR' },
}));

window.addEventListener('window-pricing-updated', () => {
  shell.refreshConfiguratorPanelFooter();
});
