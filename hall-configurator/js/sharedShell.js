import { HALL_TEMPLATES } from './templates.js?v=hall-production-1';
import { createHallTemplateDialog } from './templateDialog.js?v=hall-production-1';
import { mountTemplatesMenu } from '../../shared-ui/src/components/templatesMenu.js?v=templates-1';
import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=tenant-branding-1';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=platform-18';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=platform-18';
import { applyHallTranslations, hallT, resolveHallLocale } from './i18n.js?v=hall-production-1';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';

const tenantContext = await requireTenantConfiguratorAccess('hall');

const initialLocale = resolveHallLocale();
applyHallTranslations(initialLocale);
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');
const t = (key, variables = {}, locale = null) => hallT(locale ?? window.HALL_CONFIGURATOR_SHARED_SHELL?.state?.locale ?? initialLocale, key, variables);

const history = new SharedUndoManager({
  capture: () => window.HALL_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.HALL_CONFIGURATOR_API?.restoreState?.(snapshot),
});

// Every launcher item comes from the shared tools registry. The hall only wires
// scene-specific behavior to those shared actions below.
const toolItems = resolveSharedTools([
  'environment',
  { id: 'dimensions', active: true },
  'compass',
  'camera',
  'technicalEdges',
  'explode',
]);

let shell;
let templatesMenu = null;
let templateDialog = null;
shell = mountStandaloneConfiguratorShell({
  productType: 'Hall',
  productId: 'hall',
  storagePrefix: '360-configurator:hall',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: {
    viewAR: false,
    save: true,
    undo: true,
    reset: true,
    share: true,
  },
  tools: {
    items: toolItems,
    // Expand horizontally from the Tools launcher, matching the common
    // configurator interaction instead of pinning a vertical button strip.
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#hallSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'hall-sidebar-collapsed',
    initiallyCollapsed: mobileLayoutQuery.matches,
  },
  configuratorPanel: {
    panelSelector: '.sidebar',
    priceSelector: '#summaryTotal',
    geometry: 'floating-right',
  },
  callbacks: {
    onUndo() { history.undo(); },
    async resetConfiguration() {
      const api = window.HALL_CONFIGURATOR_API;
      if (!api?.resetConfiguration) return false;
      return (await api.resetConfiguration()) !== false;
    },
    captureState() {
      return window.HALL_CONFIGURATOR_API?.captureState?.();
    },
    restoreState(snapshot) {
      const api = window.HALL_CONFIGURATOR_API;
      if (!api?.restoreState) return false;
      api.restoreState(snapshot);
      return true;
    },
    getShareUrl() {
      const snapshot = window.HALL_CONFIGURATOR_API?.captureState?.();
      return snapshot
        ? createShareUrl({ productType: 'hall', state: snapshot })
        : window.location.href;
    },
    onPreferenceChange(path, value, preferences) {
      if (path === 'darkMode') window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
      if (path === 'locale') {
        applyHallTranslations(preferences.locale);
        templatesMenu?.setLabels(hallTemplateLabels(preferences.locale));
        templatesMenu?.setItems(hallTemplateItems(preferences.locale));
        templateDialog?.refresh();
      }
      window.dispatchEvent(new CustomEvent('hall-preference-change', { detail: { name: path, value, preferences: { ...preferences } } }));
    },
    onToolsOpenChange(open) {
      if (open) templatesMenu?.close();
      if (mobileLayoutQuery.matches && open) {
        shell?.setSettingsPanelCollapsed?.(true);
      }
      if (!open) window.HALL_CONFIGURATOR_API?.closeToolPanels?.();
    },
    onSettingsPanelToggle(collapsed) {
      syncSidebarAccessibility(collapsed);
      if (mobileLayoutQuery.matches && !collapsed) {
        templatesMenu?.close();
        if (shell?.toolsOpen) {
          shell.toolsOpen = false;
          shell.syncTools();
        }
        window.HALL_CONFIGURATOR_API?.closeToolPanels?.();
      }
    },
  },
});


function hallTemplateLabels(locale = shell?.state.locale ?? initialLocale) {
  return {
    launcher: hallT(locale, 'templates.label'),
    title: hallT(locale, 'templates.title'),
    close: hallT(locale, 'templates.close'),
    empty: hallT(locale, 'templates.empty'),
  };
}

function hallTemplateItems(locale = shell?.state.locale ?? initialLocale) {
  return HALL_TEMPLATES.map((item) => ({ ...item, name: hallT(locale, item.nameKey) }));
}

templateDialog = createHallTemplateDialog({
  getLocale: () => shell?.state.locale ?? initialLocale,
  applyTemplate(id) {
    const api = window.HALL_CONFIGURATOR_API;
    if (!api?.applyTemplate) throw new Error('Hall configurator is still loading.');
    return api.applyTemplate(id);
  },
  onApplied() { shell?.showFeedback?.(t('templates.applied'), 'success', 2000); },
});

templatesMenu = mountTemplatesMenu({
  enabled: true,
  host: shell.host,
  idPrefix: 'hall',
  labels: hallTemplateLabels(),
  items: hallTemplateItems(),
  classes: { grid: 'hall-template-grid', image: 'hall-template-card-image' },
  onSelect(item) {
    templatesMenu?.close();
    templateDialog.open(item);
    return false;
  },
  beforeOpen() {
    window.HALL_CONFIGURATOR_API?.closeToolPanels?.();
    if (mobileLayoutQuery.matches) shell?.setSettingsPanelCollapsed?.(true);
  },
});

history.bindSource(document.querySelector('.sidebar'));

const sidebar = document.querySelector('.sidebar');
const appShell = document.querySelector('.app-shell');

function syncSidebarAccessibility(collapsed = shell?.settingsPanelCollapsed) {
  if (!sidebar) return;
  const hidden = Boolean(collapsed);
  sidebar.inert = hidden;
  sidebar.setAttribute('aria-hidden', String(hidden));
}

function syncMobileLayout() {
  document.body.classList.toggle('hall-mobile-layout', mobileLayoutQuery.matches);
  if (mobileLayoutQuery.matches) shell?.setSettingsPanelCollapsed?.(true);
  else shell?.setSettingsPanelCollapsed?.(false);
  syncSidebarAccessibility(shell?.settingsPanelCollapsed);
}

syncSidebarAccessibility(shell?.settingsPanelCollapsed);
document.body.classList.toggle('hall-mobile-layout', mobileLayoutQuery.matches);
mobileLayoutQuery.addEventListener?.('change', syncMobileLayout);

appShell?.addEventListener('pointerdown', (event) => {
  if (!mobileLayoutQuery.matches || shell?.settingsPanelCollapsed) return;
  if (event.target.closest('.sidebar, #hallSidebarToggle')) return;
  shell.setSettingsPanelCollapsed(true);
  event.preventDefault();
  event.stopPropagation();
}, true);

if (sidebar) {
  const markDirty = (event) => {
    if (event.target.closest('[data-shared-configurator-panel-footer]')) return;
    if (event.target.closest('button, input, select, textarea, label')) shell.markDirty();
  };
  sidebar.addEventListener('click', markDirty, true);
  sidebar.addEventListener('input', markDirty, true);
  sidebar.addEventListener('change', markDirty, true);
}

shell.host?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'toggle-environment') window.HALL_CONFIGURATOR_API?.toggleEnvironmentPanel?.();
  else if (action === 'toggle-dimensions') window.HALL_CONFIGURATOR_API?.toggleDimensions?.();
  else if (action === 'toggle-compass') window.HALL_CONFIGURATOR_API?.toggleCompass?.();
  else if (action === 'cycle-camera') window.HALL_CONFIGURATOR_API?.cycleCamera?.();
  else if (action === 'toggle-technical-edges') window.HALL_CONFIGURATOR_API?.toggleTechnicalEdges?.();
  else if (action === 'toggle-explode-tool') window.HALL_CONFIGURATOR_API?.toggleExplode?.();
  else return;

  if (mobileLayoutQuery.matches) {
    shell?.setSettingsPanelCollapsed?.(true);
    if (shell?.toolsOpen) {
      shell.toolsOpen = false;
      shell.syncTools();
    }
  }
});

window.HALL_CONFIGURATOR_SHARED_SHELL = shell;
window.HALL_CONFIGURATOR_UNDO_HISTORY = history;
window.HALL_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.HALL_CONFIGURATOR_API?.syncToolButtons?.();
