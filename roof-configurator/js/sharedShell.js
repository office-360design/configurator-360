import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=3';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=1';

const history = new SharedUndoManager({
  capture: () => window.ROOF_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.ROOF_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const shell = mountStandaloneConfiguratorShell({
  productType: 'Roof',
  storagePrefix: '360-configurator:roof',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: true,
    reset: true,
    share: true,
  },
  // The shared framework renders an empty Tools launcher. Roof developers can
  // opt into specific shared tools later without another configurator receiving them.
  tools: {
    items: [],
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#roofSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'roof-sidebar-collapsed',
  },
  callbacks: {
    onUndo() {
      history.undo();
    },
    onReset() {
      document.querySelector('[data-view="reset"]')?.click();
    },
    getShareUrl() {
      return window.location.href;
    },
  },
});

const sidebar = document.querySelector('.sidebar');
history.bindSource(sidebar);
history.bindSource(document.querySelector('.model-options'));

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
}

window.ROOF_CONFIGURATOR_SHARED_SHELL = shell;
window.ROOF_CONFIGURATOR_UNDO_HISTORY = history;
