import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=bookshelf-point1-42';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=platform-18';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=platform-18';
import { resolveTenantContext } from '../../shared-ui/src/tenantBootstrap.js?v=platform-18';

const resolvedTenantContext = await resolveTenantContext();
const tenantContext = resolvedTenantContext?.isTenant && resolvedTenantContext?.exists && resolvedTenantContext?.status === 'active'
  ? resolvedTenantContext
  : null;
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');

const history = new SharedUndoManager({
  capture: () => window.BOOKSHELF_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.BOOKSHELF_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const toolItems = resolveSharedTools([
  { id: 'dimensions', active: true },
  'camera',
]);

let shell;
shell = mountStandaloneConfiguratorShell({
  productType: 'Bookshelf',
  productId: 'bookshelf',
  storagePrefix: '360-configurator:bookshelf',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: { viewAR: false, save: true, undo: true, reset: true, share: true },
  tools: { items: toolItems, placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 } },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#bookshelfSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'bookshelf-sidebar-collapsed',
    initiallyCollapsed: mobileLayoutQuery.matches,
  },
  configuratorPanel: {
    panelSelector: '.sidebar',
    geometry: 'floating-right',
  },
  callbacks: {
    onUndo() { history.undo(); },
    async resetConfiguration() { return (await window.BOOKSHELF_CONFIGURATOR_API?.resetConfiguration?.()) !== false; },
    captureState() { return window.BOOKSHELF_CONFIGURATOR_API?.captureState?.(); },
    restoreState(snapshot) { return window.BOOKSHELF_CONFIGURATOR_API?.restoreState?.(snapshot) !== false; },
    getShareUrl() {
      const snapshot = window.BOOKSHELF_CONFIGURATOR_API?.captureState?.();
      return snapshot ? createShareUrl({ productType: 'bookshelf', state: snapshot }) : window.location.href;
    },
    onPreferenceChange(path, value, preferences) {
      if (path === 'darkMode') window.BOOKSHELF_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
      if (path === 'locale') {
        window.BOOKSHELF_CONFIGURATOR_API?.setLocale?.(preferences.locale);
        queueMicrotask(syncBookshelfLocalShell);
      }
      if (path === 'units') window.BOOKSHELF_CONFIGURATOR_API?.setUnits?.(preferences.units);
      if (path === 'currency') window.BOOKSHELF_CONFIGURATOR_API?.setCurrency?.(preferences.currency);
    },
    onToolsOpenChange(open) {
      if (mobileLayoutQuery.matches && open) shell?.setSettingsPanelCollapsed?.(true);
    },
    onSettingsPanelToggle(collapsed) {
      syncSidebarAccessibility(collapsed);
      if (mobileLayoutQuery.matches && !collapsed && shell?.toolsOpen) {
        shell.toolsOpen = false;
        shell.syncTools();
      }
    },
  },
});

const BOOKSHELF_QUOTE_LABELS = Object.freeze({
  'en-US': 'Ask for quotation',
  'ro-RO': 'Cere ofertă',
  'de-DE': 'Angebot anfragen',
});

function syncBookshelfLocalShell() {
  const quoteButton = document.querySelector('[data-shared-panel-add-to-cart]');
  if (!quoteButton) return;
  quoteButton.textContent = BOOKSHELF_QUOTE_LABELS[shell.state.locale] || BOOKSHELF_QUOTE_LABELS['en-US'];
  quoteButton.disabled = false;
  quoteButton.setAttribute('aria-disabled', 'false');
  quoteButton.setAttribute('aria-label', quoteButton.textContent);
  quoteButton.title = quoteButton.textContent;
}

const sharedFooterRefresh = shell.refreshConfiguratorPanelFooter?.bind(shell);
if (sharedFooterRefresh) {
  shell.refreshConfiguratorPanelFooter = (...args) => {
    const result = sharedFooterRefresh(...args);
    syncBookshelfLocalShell();
    return result;
  };
}
syncBookshelfLocalShell();

// The bookshelf uses a direct quotation request instead of the shared cart.
// Capture the footer click before the shared add-to-cart handler sees it so
// this configurator never creates a hidden cart item.
document.addEventListener('click', (event) => {
  const quoteButton = event.target.closest?.('[data-shared-panel-add-to-cart]');
  if (!quoteButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const shareUrl = shell.options?.callbacks?.getShareUrl?.() || window.location.href;
  const subject = 'Bookshelf quotation request';
  const body = `Hello,\n\nI would like to request a quotation for this bookshelf configuration:\n${shareUrl}`;
  window.location.href = `mailto:office@360configurator.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}, true);

const sidebar = document.querySelector('.sidebar');
const appShell = document.querySelector('.app-shell');

function syncSidebarAccessibility(collapsed = shell?.settingsPanelCollapsed) {
  if (!sidebar) return;
  const hidden = Boolean(collapsed);
  sidebar.inert = hidden;
  sidebar.setAttribute('aria-hidden', String(hidden));
}
function syncMobileLayout() {
  document.body.classList.toggle('bookshelf-mobile-layout', mobileLayoutQuery.matches);
  shell?.setSettingsPanelCollapsed?.(mobileLayoutQuery.matches);
  syncSidebarAccessibility(shell?.settingsPanelCollapsed);
}

syncSidebarAccessibility(shell?.settingsPanelCollapsed);
document.body.classList.toggle('bookshelf-mobile-layout', mobileLayoutQuery.matches);
mobileLayoutQuery.addEventListener?.('change', syncMobileLayout);

appShell?.addEventListener('pointerdown', (event) => {
  if (!mobileLayoutQuery.matches || shell?.settingsPanelCollapsed) return;
  if (event.target.closest('.sidebar, #bookshelfSidebarToggle')) return;
  shell.setSettingsPanelCollapsed(true);
}, true);

let settingsWasOpenBeforePointer = false;
shell.host?.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('[data-action="toggle-account-settings"]')) return;
  settingsWasOpenBeforePointer = Boolean(shell.host.querySelector('[data-account-settings]')?.classList.contains('is-open'));
}, true);

shell.host?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-account-settings') {
    // The shared shell normally handles this itself. If the account menu was
    // re-rendered during the same click and the visible state did not change,
    // recover locally instead of leaving the Settings button inert.
    queueMicrotask(() => {
      const settings = shell.host.querySelector('[data-account-settings]');
      const nowOpen = Boolean(settings?.classList.contains('is-open'));
      if (nowOpen === settingsWasOpenBeforePointer) {
        shell.accountSettingsOpen = !settingsWasOpenBeforePointer;
        shell.renderHost?.();
        shell.sync?.();
      }
    });
    return;
  }
  if (action === 'toggle-dimensions') {
    const active = window.BOOKSHELF_CONFIGURATOR_API?.toggleDimensions?.();
    shell.setToolActive?.('dimensions', Boolean(active));
  } else if (action === 'cycle-camera') {
    window.BOOKSHELF_CONFIGURATOR_API?.cycleCamera?.();
  } else {
    return;
  }
  if (mobileLayoutQuery.matches && shell?.toolsOpen) {
    shell.toolsOpen = false;
    shell.syncTools();
  }
});

window.BOOKSHELF_CONFIGURATOR_SHARED_SHELL = shell;
window.BOOKSHELF_CONFIGURATOR_UNDO_HISTORY = history;
window.BOOKSHELF_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.BOOKSHELF_CONFIGURATOR_API?.setLocale?.(shell.state.locale);
window.BOOKSHELF_CONFIGURATOR_API?.setUnits?.(shell.state.units);
window.BOOKSHELF_CONFIGURATOR_API?.setCurrency?.(shell.state.currency);
