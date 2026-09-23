import { convertCartMoneyAmount, mountStandaloneConfiguratorShell } from './shared-ui/src/standaloneShell.js?v=tenant-routes-1';
import { SharedUndoManager } from './shared-ui/src/history/undoManager.js?v=1';
import { createShareUrl } from './shared-ui/src/shareState.js?v=5';
import { resolveSharedTools } from './shared-ui/src/tools/registry.js?v=13';
import { applyWindowTranslations, resolveWindowLocale, windowT } from './js/i18n.js?v=platform-18';
import { mountWindowTemplates } from './js/window-templates.js?v=8';
import { requireTenantConfiguratorAccess } from './shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';

const tenantContext = await requireTenantConfiguratorAccess('window');

const initialLocale = resolveWindowLocale();
applyWindowTranslations(initialLocale);
const t = (key, variables = {}, locale = null) => windowT(locale ?? window.WINDOW_CONFIGURATOR_SHARED_SHELL?.state?.locale ?? initialLocale, key, variables);

const CAMERA_VIEW_TEXT = Object.freeze({
  'en-US': Object.freeze({ outside: 'Outside', inside: 'Inside', prefix: 'Camera' }),
  'ro-RO': Object.freeze({ outside: 'Exterior', inside: 'Interior', prefix: 'Cameră' }),
  'de-DE': Object.freeze({ outside: 'Außen', inside: 'Innen', prefix: 'Kamera' }),
});

let shell = null;
let windowLayoutControlsVisible = true;

const PHONE_UI_MEDIA_QUERY = '(max-width: 760px)';

function isPhoneUi() {
  return window.matchMedia?.(PHONE_UI_MEDIA_QUERY)?.matches === true;
}

function closePhoneEditorPanels() {
  if (!isPhoneUi()) return;

  const selectedWindowPanel = document.getElementById('selected-window-panel');
  if (selectedWindowPanel && !selectedWindowPanel.hidden) {
    document.getElementById('selectedWindowClose')?.click();
  }

  const componentSelectionPopup = document.getElementById('component-selection-popup');
  if (componentSelectionPopup && !componentSelectionPopup.hidden) {
    document.getElementById('component-selection-close')?.click();
  }
}

function closePhoneSettingsPanel() {
  if (!isPhoneUi()) return;
  if (document.body.classList.contains('sidebar-is-collapsed')) return;
  shell?.setSettingsPanelCollapsed?.(true);
}

function bindPhonePanelExclusivity() {
  const selectedWindowPanel = document.getElementById('selected-window-panel');
  const componentSelectionPopup = document.getElementById('component-selection-popup');

  const syncSelectedWindowLauncherVisibility = () => {
    const selectedWindowOpen = Boolean(selectedWindowPanel && !selectedWindowPanel.hidden);
    document.body.classList.toggle('phone-window-editor-open', selectedWindowOpen);

    if (!isPhoneUi() || !selectedWindowOpen) return;

    const toolsLauncher = document.querySelector(
      '.shared-ui-host [data-shared-tools] > .tool-launcher[data-action="toggle-tools"]'
    );
    if (toolsLauncher?.getAttribute('aria-expanded') === 'true') toolsLauncher.click();

    const templatesLauncher = document.getElementById('window-templates-launcher');
    if (templatesLauncher?.getAttribute('aria-expanded') === 'true') templatesLauncher.click();
  };

  const editorPanelObserver = new MutationObserver((mutations) => {
    syncSelectedWindowLauncherVisibility();
    if (!isPhoneUi()) return;
    if (!mutations.some(({ target }) => target instanceof HTMLElement && !target.hidden)) return;
    closePhoneSettingsPanel();
  });

  [selectedWindowPanel, componentSelectionPopup].forEach((panel) => {
    if (panel) editorPanelObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  });
  syncSelectedWindowLauncherVisibility();

  const settingsPanelObserver = new MutationObserver(() => {
    if (!isPhoneUi()) return;
    if (document.body.classList.contains('sidebar-is-collapsed')) return;
    closePhoneEditorPanels();
  });
  settingsPanelObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Keep the invariant true if the page starts with the settings panel open.
  if (!document.body.classList.contains('sidebar-is-collapsed')) {
    closePhoneEditorPanels();
  }
}

function getCameraViewText() {
  return CAMERA_VIEW_TEXT[shell?.state?.locale] || CAMERA_VIEW_TEXT['en-US'];
}

function enableWindowSharedTools() {
  if (document.getElementById('window-shared-tools-styles')) return;
  const style = document.createElement('style');
  style.id = 'window-shared-tools-styles';
  style.textContent = `
/* Window opts into Common UI tools. Override the legacy rule that hid the
   complete shared Tools launcher in this configurator. */
body.shared-ui-mounted .shared-ui-host [data-shared-tools] {
  display: flex !important;
}

/* Window-only edit-control visibility. The layout overlay owns every +, merge
   and double-vent button, so hiding the overlay removes the whole button set
   without changing the configured window layout. */
body.window-layout-controls-hidden .window-layout-overlay {
  display: none !important;
}
`;
  document.head.appendChild(style);
}

function cycleWindowCameraView() {
  const api = window.WINDOW_CAMERA_VIEW_API;
  if (!api?.getViewSide || !api?.setViewSide) return null;
  const nextSide = api.getViewSide() === 'outside' ? 'inside' : 'outside';
  api.setViewSide(nextSide);
  const labels = getCameraViewText();
  shell?.showFeedback?.(`${labels.prefix}: ${labels[nextSide]}`);
  return nextSide;
}

function toggleWindowDimensions() {
  const api = window.WINDOW_DIMENSIONS_API;
  if (!api?.toggle) return null;
  const visible = Boolean(api.toggle());
  shell?.setToolActive?.('dimensions', visible);
  return visible;
}

function setWindowLayoutControlsVisible(visible) {
  windowLayoutControlsVisible = Boolean(visible);
  if (!windowLayoutControlsVisible) {
    document.querySelector('.window-type-wheel-close')?.click();
  }
  document.body.classList.toggle('window-layout-controls-hidden', !windowLayoutControlsVisible);
  shell?.setToolActive?.('window-layout-controls', windowLayoutControlsVisible);
  return windowLayoutControlsVisible;
}

function toggleWindowLayoutControls() {
  return setWindowLayoutControlsVisible(!windowLayoutControlsVisible);
}

enableWindowSharedTools();

const history = new SharedUndoManager({
  capture: () => window.WINDOW_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.WINDOW_CONFIGURATOR_API?.restoreState?.(snapshot),
});

shell = mountStandaloneConfiguratorShell({
  productType: t('project.type'),
  productId: 'window',
  storagePrefix: '360-configurator:window',
  brandSrc: tenantContext?.logoUrl || './shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: true,
    reset: true,
    share: true,
  },
  tools: {
    // Use the same Common UI dimensions and camera tools as the other
    // configurators. Window edit buttons are an explicit Window-only opt-in.
    items: resolveSharedTools([
      { id: 'dimensions', active: true },
      { id: 'window-layout-controls', active: true },
      'camera',
    ]),
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
    onToolAction({ toolId }) {
      if (toolId === 'dimensions') toggleWindowDimensions();
      else if (toolId === 'camera') cycleWindowCameraView();
      else if (toolId === 'window-layout-controls') toggleWindowLayoutControls();
    },
  },
});

bindPhonePanelExclusivity();
mountWindowTemplates();

// The shared tools are rendered before the Three.js scene APIs exist. Disable
// them until their corresponding Window APIs announce that they are ready.
shell.setToolDisabled('dimensions', !window.WINDOW_DIMENSIONS_API);
shell.setToolDisabled('camera', !window.WINDOW_CAMERA_VIEW_API);

window.addEventListener('window-dimensions-api-ready', (event) => {
  shell.setToolDisabled('dimensions', false);
  shell.setToolActive('dimensions', event.detail?.visible !== false);
});
window.addEventListener('window-dimensions-visibility-changed', (event) => {
  shell.setToolActive('dimensions', event.detail?.visible !== false);
});
window.addEventListener('window-camera-view-api-ready', () => {
  shell.setToolDisabled('camera', false);
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
