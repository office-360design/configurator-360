import { mountStandaloneConfiguratorShell } from './shared-ui/src/standaloneShell.js?v=3';
import { SharedUndoManager } from './shared-ui/src/history/undoManager.js?v=1';
import { createShareUrl } from './shared-ui/src/shareState.js?v=1';

const history = new SharedUndoManager({
  capture: () => window.WINDOW_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.WINDOW_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const shell = mountStandaloneConfiguratorShell({
  productType: 'Window',
  storagePrefix: '360-configurator:window',
  brandSrc: './shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: true,
    save: true,
    undo: true,
    reset: false,
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
  callbacks: {
    onViewAR() {
      document.querySelector('#qr-ar-button')?.click();
    },
    onUndo() {
      history.undo();
    },
    onPreferenceChange(path, value) {
      if (path === 'defaultArPlatform') {
        document.querySelector(`.ar-platform-option[data-platform="${value}"]`)?.click();
      }
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
