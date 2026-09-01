import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=38';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=3';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=4';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=3';

const tenantContext = await requireTenantConfiguratorAccess('cardbox');
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');

const history = new SharedUndoManager({
  capture: () => window.CARDBOX_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.CARDBOX_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const toolItems = resolveSharedTools([
  { id: 'dimensions', active: true },
  'camera',
  { id: 'technicalEdges', active: true },
]);

let shell;
shell = mountStandaloneConfiguratorShell({
  productType: 'Cardbox',
  productId: 'cardbox',
  storagePrefix: '360-configurator:cardbox',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: { viewAR: false, save: true, undo: true, reset: true, share: true },
  tools: { items: toolItems, placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 } },
  settingsPanel: {
    panelSelector: '.sidebar', toggleSelector: '#cardboxSidebarToggle', collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'cardbox-sidebar-collapsed', initiallyCollapsed: mobileLayoutQuery.matches,
  },
  configuratorPanel: { panelSelector: '.sidebar', priceSelector: '#summaryTotal', geometry: 'floating-right' },
  callbacks: {
    onUndo() { history.undo(); },
    async resetConfiguration() { return (await window.CARDBOX_CONFIGURATOR_API?.resetConfiguration?.()) !== false; },
    captureState() { return window.CARDBOX_CONFIGURATOR_API?.captureState?.(); },
    restoreState(snapshot) { return window.CARDBOX_CONFIGURATOR_API?.restoreState?.(snapshot) !== false; },
    getShareUrl() {
      const snapshot = window.CARDBOX_CONFIGURATOR_API?.captureState?.();
      return snapshot ? createShareUrl({ productType: 'cardbox', state: snapshot }) : window.location.href;
    },
    onPreferenceChange(path, value, preferences) {
      if (path === 'darkMode') window.CARDBOX_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
      if (path === 'locale') window.CARDBOX_CONFIGURATOR_API?.setLocale?.(preferences.locale);
      if (path === 'units') window.CARDBOX_CONFIGURATOR_API?.setUnits?.(preferences.units);
      if (path === 'currency') window.CARDBOX_CONFIGURATOR_API?.setCurrency?.(preferences.currency);
    },
    onToolsOpenChange(open) {
      if (mobileLayoutQuery.matches && open) shell?.setSettingsPanelCollapsed?.(true);
    },
    onSettingsPanelToggle(collapsed) {
      syncSidebarAccessibility(collapsed);
      if (mobileLayoutQuery.matches && !collapsed && shell?.toolsOpen) { shell.toolsOpen = false; shell.syncTools(); }
    },
  },
});

const sidebar = document.querySelector('.sidebar');
const appShell = document.querySelector('.app-shell');
history.bindSource(sidebar);

function syncSidebarAccessibility(collapsed = shell?.settingsPanelCollapsed) {
  if (!sidebar) return;
  const hidden = Boolean(collapsed); sidebar.inert = hidden; sidebar.setAttribute('aria-hidden', String(hidden));
}
function syncMobileLayout() {
  document.body.classList.toggle('cardbox-mobile-layout', mobileLayoutQuery.matches);
  shell?.setSettingsPanelCollapsed?.(mobileLayoutQuery.matches);
  syncSidebarAccessibility(shell?.settingsPanelCollapsed);
}
syncSidebarAccessibility(shell?.settingsPanelCollapsed);
document.body.classList.toggle('cardbox-mobile-layout', mobileLayoutQuery.matches);
mobileLayoutQuery.addEventListener?.('change', syncMobileLayout);

appShell?.addEventListener('pointerdown', (event) => {
  if (!mobileLayoutQuery.matches || shell?.settingsPanelCollapsed) return;
  if (event.target.closest('.sidebar, #cardboxSidebarToggle')) return;
  shell.setSettingsPanelCollapsed(true);
}, true);

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('[data-shared-configurator-panel-footer]')) return;
    if (event.target.closest('button, input, select, textarea, label, svg')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true); sidebar.addEventListener('input', markDirty, true); sidebar.addEventListener('change', markDirty, true);
}

shell.host?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-dimensions') window.CARDBOX_CONFIGURATOR_API?.toggleDimensions?.();
  else if (action === 'cycle-camera') window.CARDBOX_CONFIGURATOR_API?.cycleCamera?.();
  else if (action === 'toggle-technical-edges') window.CARDBOX_CONFIGURATOR_API?.toggleTechnicalEdges?.();
  else return;
  if (mobileLayoutQuery.matches && shell?.toolsOpen) { shell.toolsOpen = false; shell.syncTools(); }
});

window.CARDBOX_CONFIGURATOR_SHARED_SHELL = shell;
window.CARDBOX_CONFIGURATOR_UNDO_HISTORY = history;
window.CARDBOX_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.CARDBOX_CONFIGURATOR_API?.setLocale?.(shell.state.locale);
window.CARDBOX_CONFIGURATOR_API?.setUnits?.(shell.state.units);
window.CARDBOX_CONFIGURATOR_API?.setCurrency?.(shell.state.currency);
