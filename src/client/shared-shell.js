import { mountStandaloneConfiguratorShell } from './shared-ui/src/index.js';

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

window.WINDOW_CONFIGURATOR_SHARED_SHELL = shell;
