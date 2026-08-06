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


const toolsAnchor = document.querySelector('#roofToolsAnchor');
let relocatedToolsButton = null;
let toolsPositionFrame = 0;

function positionToolsButton() {
  toolsPositionFrame = 0;
  if (!toolsAnchor || !relocatedToolsButton?.isConnected) return;

  const anchorRect = toolsAnchor.getBoundingClientRect();
  relocatedToolsButton.style.setProperty('--roof-tools-left', `${Math.round(anchorRect.left)}px`);
  relocatedToolsButton.style.setProperty('--roof-tools-top', `${Math.round(anchorRect.top)}px`);
}

function scheduleToolsPosition() {
  if (toolsPositionFrame) return;
  toolsPositionFrame = requestAnimationFrame(positionToolsButton);
}

function relocateToolsButton() {
  if (!toolsAnchor) return true;

  const toolsButton = [...document.querySelectorAll('button')].find((button) => {
    const text = button.textContent?.replace(/\s+/g, ' ').trim().toLowerCase();
    const ariaLabel = button.getAttribute('aria-label')?.trim().toLowerCase();
    const title = button.getAttribute('title')?.trim().toLowerCase();
    return text === 'tools' || ariaLabel === 'tools' || title === 'tools';
  });

  if (!toolsButton) return false;

  // Keep the button inside the shared shell DOM so its original ancestor-based
  // styles continue to apply. Only move it visually to the roof toolbar anchor.
  relocatedToolsButton = toolsButton;
  toolsButton.classList.add('roof-relocated-tools-button');
  scheduleToolsPosition();
  return true;
}

if (!relocateToolsButton()) {
  const toolsObserver = new MutationObserver(() => {
    if (relocateToolsButton()) toolsObserver.disconnect();
  });
  toolsObserver.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('resize', scheduleToolsPosition);
new ResizeObserver(scheduleToolsPosition).observe(toolsAnchor);
requestAnimationFrame(scheduleToolsPosition);

