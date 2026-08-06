import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=2';

const shell = mountStandaloneConfiguratorShell({
  productType: 'Roof',
  storagePrefix: '360-configurator:roof',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: false,
    reset: true,
    share: true,
  },
  callbacks: {
    onReset() {
      document.querySelector('[data-view="reset"]')?.click();
    },
    getShareUrl() {
      return window.location.href;
    },
  },
});

const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('#roofSidebarToggle');

function setSidebarCollapsed(collapsed) {
  sidebar?.classList.toggle('is-collapsed', collapsed);
  document.body.classList.toggle('roof-sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Show roof settings' : 'Hide roof settings');
  sidebarToggle?.setAttribute('title', collapsed ? 'Show roof settings' : 'Hide roof settings');
}

sidebarToggle?.addEventListener('click', () => {
  setSidebarCollapsed(!sidebar?.classList.contains('is-collapsed'));
});

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
}

window.ROOF_CONFIGURATOR_SHARED_SHELL = shell;
