import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=13';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=3';
import { createShareUrl, encodeShareState } from '../../shared-ui/src/shareState.js?v=4';
import { getLocalizedConfiguratorUrl } from '../../shared-ui/src/config.js';
import { applyFenceTranslations, fenceT, resolveFenceLocale } from './i18n.js?v=3';

const initialLocale = resolveFenceLocale();
const compactViewport = window.matchMedia('(max-width: 760px)');
const isCompactViewport = () => compactViewport.matches;
applyFenceTranslations(initialLocale);
const t = (key, variables = {}, locale = null) => fenceT(locale ?? window.FENCE_CONFIGURATOR_SHARED_SHELL?.state?.locale ?? initialLocale, key, variables);

const history = new SharedUndoManager({
  capture: () => window.FENCE_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.FENCE_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const shell = mountStandaloneConfiguratorShell({
  productType: 'Fence',
  productId: 'fence',
  storagePrefix: '360-configurator:fence',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: { viewAR: false, save: true, undo: true, reset: true, share: true },
  tools: {
    items: resolveSharedTools([
      'environment',
      { id: 'dimensions', active: true },
      'compass',
      'camera',
      'technicalEdges',
    ]),
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#fenceSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'fence-sidebar-collapsed',
    initiallyCollapsed: isCompactViewport(),
  },
  callbacks: {
    onUndo() { history.undo(); },
    onReset() {
      if (window.confirm(t('reset.confirm'))) window.FENCE_CONFIGURATOR_API?.resetConfiguration?.();
    },
    captureState() {
      return window.FENCE_CONFIGURATOR_API?.captureState?.();
    },
    restoreState(snapshot) {
      return window.FENCE_CONFIGURATOR_API?.restoreState?.(snapshot);
    },
    getShareUrl() {
      const snapshot = window.FENCE_CONFIGURATOR_API?.captureState?.();
      return snapshot ? createShareUrl({ productType: 'fence', state: snapshot }) : window.location.href;
    },
    async getLocalizedUrl(nextLocale, fallbackTarget) {
      const snapshot = window.FENCE_CONFIGURATOR_API?.captureState?.();
      if (!snapshot) return fallbackTarget;

      // Language changes cross origins (.com / .ro / .de), so localStorage cannot
      // carry the live configuration with the navigation. Use the compact legacy
      // share payload only as a temporary cross-domain state handoff. Unlike the
      // normal Share action, this does not create a Firestore document.
      const encodedState = await encodeShareState('fence', snapshot);
      const localized = getLocalizedConfiguratorUrl(nextLocale, 'fence', window.location) || fallbackTarget;
      const target = new URL(localized, window.location.href);

      // A previous shared link may already contain a state id. Remove all state
      // transports before adding the current snapshot so the destination cannot
      // accidentally restore an older configuration instead.
      target.searchParams.delete('s');
      target.searchParams.delete('c');
      target.searchParams.delete('config');
      target.hash = `c=${encodedState}`;
      return target.href;
    },
    onPreferenceChange(name, value, preferences) {
      window.dispatchEvent(new CustomEvent('fence-preference-change', { detail: { name, value, preferences: { ...preferences } } }));
    },
    onToolsOpenChange(open) {
      if (open && isCompactViewport()) {
        shell.setSettingsPanelCollapsed?.(true);
        window.FENCE_CONFIGURATOR_API?.closeToolPanels?.();
      } else if (!open) {
        window.FENCE_CONFIGURATOR_API?.closeToolPanels?.();
      }
    },
    onSettingsPanelToggle(collapsed) {
      const panel = document.querySelector('.sidebar');
      if (panel) panel.inert = Boolean(collapsed && isCompactViewport());
      if (!collapsed && isCompactViewport()) {
        if (shell.toolsOpen) {
          shell.toolsOpen = false;
          shell.syncTools?.();
        }
        window.FENCE_CONFIGURATOR_API?.closeToolPanels?.();
      }
    },
  },
});

history.bindSource(document.querySelector('.sidebar'));

const sidebar = document.querySelector('.sidebar');
if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
  sidebar.inert = Boolean(shell.settingsPanelCollapsed && isCompactViewport());
}

const closeMobileSettingsFromViewer = () => {
  if (isCompactViewport() && !shell.settingsPanelCollapsed) shell.setSettingsPanelCollapsed(true);
};
document.querySelector('.viewer-stage')?.addEventListener('pointerdown', closeMobileSettingsFromViewer, { passive: true });

document.querySelector('#bomOpenButton')?.addEventListener('click', () => {
  if (!isCompactViewport()) return;
  shell.setSettingsPanelCollapsed?.(true);
  if (shell.toolsOpen) {
    shell.toolsOpen = false;
    shell.syncTools?.();
  }
  window.FENCE_CONFIGURATOR_API?.closeToolPanels?.();
});

compactViewport.addEventListener?.('change', (event) => {
  shell.setSettingsPanelCollapsed?.(Boolean(event.matches));
  if (sidebar) sidebar.inert = Boolean(event.matches && shell.settingsPanelCollapsed);
  if (!event.matches && shell.toolsOpen) shell.syncTools?.();
});

shell.host.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  const action = actionTarget?.dataset.action;
  if (!action) return;
  if (action === 'toggle-environment') window.FENCE_CONFIGURATOR_API?.toggleEnvironmentPanel?.();
  else if (action === 'toggle-dimensions') window.FENCE_CONFIGURATOR_API?.toggleDimensions?.();
  else if (action === 'toggle-compass') window.FENCE_CONFIGURATOR_API?.toggleCompass?.();
  else if (action === 'cycle-camera') window.FENCE_CONFIGURATOR_API?.cycleCamera?.();
  else if (action === 'toggle-technical-edges') window.FENCE_CONFIGURATOR_API?.toggleTechnicalEdges?.();

  if (isCompactViewport() && event.target.closest('[data-tool-id]')) {
    // Keep the selected tool/panel active, but get the vertical tool rail out
    // of the way of the model after a touch selection.
    shell.toolsOpen = false;
    shell.syncTools?.();
  }
});

window.FENCE_CONFIGURATOR_SHARED_SHELL = shell;
window.FENCE_CONFIGURATOR_UNDO_HISTORY = history;
window.FENCE_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.FENCE_CONFIGURATOR_API?.setPreferences?.(shell.state);
window.FENCE_CONFIGURATOR_API?.syncToolButtons?.();
