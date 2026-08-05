import { mountStandaloneConfiguratorShell } from './shared-ui/src/standaloneShell.js?v=2';

const shell = mountStandaloneConfiguratorShell({
  productType: 'Window',
  storagePrefix: '360-configurator:window',
  brandSrc: './shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: true,
    save: true,
    undo: false,
    reset: false,
    share: true,
  },
  callbacks: {
    onViewAR() {
      document.querySelector('#qr-ar-button')?.click();
    },
    onPreferenceChange(path, value) {
      if (path === 'defaultArPlatform') {
        document.querySelector(`.ar-platform-option[data-platform="${value}"]`)?.click();
      }
    },
    getShareUrl() {
      return window.location.href;
    },
  },
});

const controls = document.querySelector('#controls');
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
