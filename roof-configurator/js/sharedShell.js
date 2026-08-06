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

window.ROOF_CONFIGURATOR_UNDO_HISTORY = history;
