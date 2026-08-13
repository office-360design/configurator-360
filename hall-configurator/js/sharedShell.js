import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=7';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=3';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=1';

const history = new SharedUndoManager({
  capture: () => window.HALL_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.HALL_CONFIGURATOR_API?.restoreState?.(snapshot),
});

// Every launcher item comes from the shared tools registry. The hall only wires
// scene-specific behavior to those shared actions below.
const toolItems = resolveSharedTools([
  'environment',
  { id: 'dimensions', active: true },
  'compass',
  'camera',
  'technicalEdges',
  'explode',
]);

const shell = mountStandaloneConfiguratorShell({
  productType: 'Hall',
  storagePrefix: '360-configurator:hall',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: true,
    reset: true,
    share: true,
  },
  tools: {
    items: toolItems,
    // Expand horizontally from the Tools launcher, matching the common
    // configurator interaction instead of pinning a vertical button strip.
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#hallSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'hall-sidebar-collapsed',
  },
  callbacks: {
    onUndo() { history.undo(); },
    onReset() { window.HALL_CONFIGURATOR_API?.resetView?.(); },
    getShareUrl() {
      const snapshot = window.HALL_CONFIGURATOR_API?.captureState?.();
      return snapshot
        ? createShareUrl({ productType: 'hall', state: snapshot })
        : window.location.href;
    },
    onPreferenceChange(path, value) {
      if (path === 'darkMode') window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
    },
    onToolsOpenChange(open) {
      if (!open) window.HALL_CONFIGURATOR_API?.closeToolPanels?.();
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
}

shell.host?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'toggle-environment') window.HALL_CONFIGURATOR_API?.toggleEnvironmentPanel?.();
  else if (action === 'toggle-dimensions') window.HALL_CONFIGURATOR_API?.toggleDimensions?.();
  else if (action === 'toggle-compass') window.HALL_CONFIGURATOR_API?.toggleCompass?.();
  else if (action === 'cycle-camera') window.HALL_CONFIGURATOR_API?.cycleCamera?.();
  else if (action === 'toggle-technical-edges') window.HALL_CONFIGURATOR_API?.toggleTechnicalEdges?.();
  else if (action === 'toggle-explode-tool') window.HALL_CONFIGURATOR_API?.toggleExplode?.();
});

window.HALL_CONFIGURATOR_SHARED_SHELL = shell;
window.HALL_CONFIGURATOR_UNDO_HISTORY = history;
window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.HALL_CONFIGURATOR_API?.syncToolButtons?.();
