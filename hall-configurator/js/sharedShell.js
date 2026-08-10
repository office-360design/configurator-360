import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=5';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=1';

const history = new SharedUndoManager({
  capture: () => window.HALL_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.HALL_CONFIGURATOR_API?.restoreState?.(snapshot),
});

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
  tools: { items: [], placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 } },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#hallSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'hall-sidebar-collapsed',
  },
  callbacks: {
    onUndo() { history.undo(); },
    onReset() { window.HALL_CONFIGURATOR_API?.resetView?.(); },
    getShareUrl() { return window.location.href; },
    onPreferenceChange(path, value) {
      if (path === 'darkMode') window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
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

window.HALL_CONFIGURATOR_SHARED_SHELL = shell;
window.HALL_CONFIGURATOR_UNDO_HISTORY = history;
window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
