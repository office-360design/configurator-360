import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=3';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=2';

const icon = (body) => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${body}
  </svg>
`;

const tools = [
  ...resolveSharedTools([
    {
      id: 'environment',
      label: 'Sun & orientation',
      icon: icon('<circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M5.1 5.1l1.5 1.5M17.4 17.4l1.5 1.5M18.9 5.1l-1.5 1.5M6.6 17.4l-1.5 1.5"></path>'),
    },
    {
      id: 'dimensions',
      label: 'Dimensions',
      icon: icon('<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"></path>'),
    },
    {
      id: 'compass',
      label: 'Compass',
      active: true,
      icon: icon('<circle cx="12" cy="12" r="8.5"></circle><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7z"></path><path d="M12 1.7v2M12 20.3v2M1.7 12h2M20.3 12h2"></path>'),
    },
    {
      id: 'camera',
      label: 'Change orientation',
      icon: icon('<circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"></path>'),
    },
  ]),
  {
    id: 'simulation',
    action: 'toggle-simulation',
    label: 'Run day simulation',
    icon: icon('<path d="M8 5v14l11-7z"></path>'),
  },
];

const shell = mountStandaloneConfiguratorShell({
  productType: 'Solar',
  storagePrefix: '360-configurator:solar',
  brandSrc: '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: false,
    reset: true,
    share: true,
  },
  tools: {
    items: tools,
    placement: { side: 'left', direction: 'down', offsetX: 0, offsetY: 0 },
  },
  callbacks: {
    onReset() {
      document.querySelector('[data-view="reset"]')?.click();
    },
    getShareUrl() { return window.location.href; },
    onPreferenceChange(name, value, preferences) {
      const snapshot = { ...preferences };
      window.SOLAR_SHELL_PREFERENCES = snapshot;
      window.dispatchEvent(new CustomEvent('solar-preference-change', {
        detail: { name, value, preferences: snapshot },
      }));
    },
  },
});

window.SOLAR_SHELL_PREFERENCES = { ...shell.state };
window.dispatchEvent(new CustomEvent('solar-preference-change', {
  detail: { name: 'initial', value: null, preferences: { ...shell.state } },
}));

const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('#solarSidebarToggle');
function setSidebarCollapsed(collapsed) {
  sidebar?.classList.toggle('is-collapsed', collapsed);
  document.body.classList.toggle('roof-sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Show solar settings' : 'Hide solar settings');
  sidebarToggle?.setAttribute('title', collapsed ? 'Show solar settings' : 'Hide solar settings');
}
sidebarToggle?.addEventListener('click', () => setSidebarCollapsed(!sidebar?.classList.contains('is-collapsed')));

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
}

const toolsAnchor = document.querySelector('#solarToolsAnchor');
const environmentPanel = document.querySelector('#solarEnvironmentPanel');
const environmentClose = document.querySelector('#solarEnvironmentClose');
const sunPositionControl = document.querySelector('#sunPositionControl');
const sunPositionValue = document.querySelector('#sunPositionValue');
const northDirectionControl = document.querySelector('#northDirectionControl');
const northDirectionValue = document.querySelector('#northDirectionValue');
const nightPreviewToggle = document.querySelector('#nightPreviewToggle');
let relocatedToolsToolbar = null;
let toolsPositionFrame = 0;

const getApi = () => window.SOLAR_CONFIGURATOR_API;
const getToolButton = (toolId) => shell.host.querySelector(`[data-tool-id="${toolId}"]`);

function setToolState(toolId, { active = false, disabled = false, title = null } = {}) {
  const button = getToolButton(toolId);
  if (!button) return;
  button.classList.toggle('is-active', Boolean(active));
  button.disabled = Boolean(disabled);
  button.setAttribute('aria-disabled', String(Boolean(disabled)));
  button.setAttribute('aria-pressed', String(Boolean(active)));
  if (title) {
    button.title = title;
    button.setAttribute('aria-label', title);
  }
}

function positionToolsUi() {
  toolsPositionFrame = 0;
  if (!toolsAnchor || !relocatedToolsToolbar?.isConnected) return;
  const anchorRect = toolsAnchor.getBoundingClientRect();
  const toolbarLeft = Math.round(anchorRect.left);
  const toolbarTop = Math.round(anchorRect.top);
  relocatedToolsToolbar.style.setProperty('--roof-tools-left', `${toolbarLeft}px`);
  relocatedToolsToolbar.style.setProperty('--roof-tools-top', `${toolbarTop}px`);
  if (!environmentPanel) return;
  const panelWidth = Math.min(390, Math.max(296, window.innerWidth - 24));
  const launcherWidth = relocatedToolsToolbar.querySelector('.tool-launcher')?.getBoundingClientRect().width || 74;
  let panelLeft = toolbarLeft + launcherWidth + 14;
  let panelTop = toolbarTop;
  if (panelLeft + panelWidth > window.innerWidth - 12) {
    panelLeft = 12;
    panelTop = toolbarTop + 58;
  }
  panelTop = Math.min(panelTop, Math.max(12, window.innerHeight - 430));
  environmentPanel.style.setProperty('--roof-environment-left', `${Math.round(panelLeft)}px`);
  environmentPanel.style.setProperty('--roof-environment-top', `${Math.round(panelTop)}px`);
  environmentPanel.style.setProperty('--roof-environment-width', `${Math.round(panelWidth)}px`);
}

function scheduleToolsPosition() {
  if (toolsPositionFrame) return;
  toolsPositionFrame = requestAnimationFrame(positionToolsUi);
}

function relocateToolsToolbar() {
  if (!toolsAnchor) return true;
  const toolbar = shell.host.querySelector('[data-shared-tools]');
  if (!toolbar) return false;
  relocatedToolsToolbar = toolbar;
  toolbar.classList.add('roof-relocated-tools-toolbar');
  scheduleToolsPosition();
  return true;
}

function setEnvironmentPanelOpen(open) {
  if (!environmentPanel) return;
  const isOpen = Boolean(open);
  environmentPanel.hidden = !isOpen;
  environmentPanel.classList.toggle('is-open', isOpen);
  setToolState('environment', { active: isOpen, title: 'Sun and roof orientation' });
  scheduleToolsPosition();
}

function syncToolsState(detail = getApi()?.getState?.()) {
  if (!detail) return;
  setToolState('dimensions', { active: Boolean(detail.showDimensions), title: 'Toggle dimensions' });
  setToolState('compass', { active: Boolean(detail.showCompass), title: detail.showCompass ? 'Hide compass' : 'Show compass' });
  setToolState('simulation', {
    active: Boolean(detail.simulationPlaying),
    title: detail.simulationPlaying ? 'Pause day simulation' : 'Run day simulation',
  });
  const order = ['perspective', 'front', 'top'];
  const names = { perspective: '3D', front: 'Front', top: 'Top' };
  const index = Math.max(0, order.indexOf(detail.currentView));
  const nextView = order[(index + 1) % order.length];
  setToolState('camera', { title: `Change orientation: ${names[nextView]}` });

  if (sunPositionControl) sunPositionControl.value = String(detail.sunPosition ?? 50);
  if (sunPositionValue) sunPositionValue.textContent = `${Math.round(detail.sunPosition ?? 50)}%`;
  if (northDirectionControl) northDirectionControl.value = String(detail.northDirection ?? 0);
  if (northDirectionValue) northDirectionValue.textContent = `${Math.round(detail.northDirection ?? 0)}°`;
  if (nightPreviewToggle) nightPreviewToggle.checked = Boolean(detail.nightPreview);
}

shell.host.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget?.dataset.action === 'toggle-tools') {
    if (!shell.toolsOpen) setEnvironmentPanelOpen(false);
    scheduleToolsPosition();
    return;
  }

  const button = event.target.closest('[data-tool-id]');
  if (!button || button.disabled) return;
  const toolId = button.dataset.toolId;
  const api = getApi();
  if (!api) return;

  if (toolId === 'environment') setEnvironmentPanelOpen(environmentPanel?.hidden ?? true);
  else if (toolId === 'dimensions') { setEnvironmentPanelOpen(false); api.toggleDimensions(); }
  else if (toolId === 'compass') { setEnvironmentPanelOpen(false); api.toggleCompass(); }
  else if (toolId === 'camera') { setEnvironmentPanelOpen(false); api.cycleOrientation(); }
  else if (toolId === 'simulation') { setEnvironmentPanelOpen(false); api.toggleSimulation(); }
});

environmentClose?.addEventListener('click', () => setEnvironmentPanelOpen(false));
sunPositionControl?.addEventListener('input', () => {
  const value = Number(sunPositionControl.value);
  if (sunPositionValue) sunPositionValue.textContent = `${Math.round(value)}%`;
  getApi()?.setSunPosition(value);
});
northDirectionControl?.addEventListener('input', () => {
  const value = Number(northDirectionControl.value);
  if (northDirectionValue) northDirectionValue.textContent = `${Math.round(value)}°`;
  getApi()?.setNorthDirection(value);
});
nightPreviewToggle?.addEventListener('change', () => getApi()?.setNightPreview(nightPreviewToggle.checked));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !environmentPanel?.hidden) setEnvironmentPanelOpen(false);
});
window.addEventListener('solar-configurator-ready', (event) => syncToolsState(event.detail));
window.addEventListener('solar-tools-state-change', (event) => syncToolsState(event.detail));
window.addEventListener('resize', scheduleToolsPosition);

if (!relocateToolsToolbar()) {
  const toolsObserver = new MutationObserver(() => {
    if (relocateToolsToolbar()) toolsObserver.disconnect();
  });
  toolsObserver.observe(document.body, { childList: true, subtree: true });
}
if (toolsAnchor) new ResizeObserver(scheduleToolsPosition).observe(toolsAnchor);
requestAnimationFrame(() => {
  scheduleToolsPosition();
  syncToolsState();
});

window.SOLAR_CONFIGURATOR_SHARED_SHELL = shell;
