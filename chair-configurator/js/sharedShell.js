import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=platform-19';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-19';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=platform-19';

export function mountChairShell(api, tenantContext = null) {
  const compact = matchMedia('(max-width: 760px)');
  const shell = mountStandaloneConfiguratorShell({
    productType: 'Chair', productId: 'chair', storagePrefix: '360-configurator:chair',
    brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png', brandAlt: tenantContext?.companyName || '360 Configurator',
    capabilities: { viewAR: false, save: true, undo: false, reset: true, share: true },
    tools: { items: resolveSharedTools(['camera']), placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 } },
    settingsPanel: { panelSelector: '.chair-sidebar', toggleSelector: '#chairSidebarToggle', collapsedClass: 'is-collapsed', bodyCollapsedClass: 'chair-sidebar-collapsed', initiallyCollapsed: compact.matches },
    callbacks: {
      resetConfiguration() { api.resetConfiguration(); return true; },
      captureState() { return api.captureState(); },
      restoreState(snapshot) { return api.restoreState(snapshot); },
      getShareUrl() { return createShareUrl({ productType: 'chair', state: api.captureState() }); },
      onPreferenceChange(name, value, preferences) { api.setPreference(name, value, preferences); },
      onSettingsPanelToggle(collapsed) { api.setSidebarCollapsed(Boolean(collapsed)); },
      onToolAction({ toolId }) { if (toolId === 'camera') api.cycleCamera(); },
    },
  });
  compact.addEventListener?.('change', (event) => shell.setSettingsPanelCollapsed(Boolean(event.matches)));
  return shell;
}
