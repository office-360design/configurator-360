import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=curtainwall-ar-1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { bindPanelAccordions } from '../../shared-ui/src/components/panelControls.js?v=panel-controls-1';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=locales-6';
import { createCurtainWallARController } from './ar/controller.js?v=curtainwall-ar-1';

const tenantContext = await requireTenantConfiguratorAccess('curtainwall');
const compactViewport = window.matchMedia('(max-width: 760px)');
const api = () => window.CURTAIN_WALL_API;
const ar = createCurtainWallARController({
  getSnapshot: options => {
    if (!api()?.captureARSnapshot) { const error = new Error('not-ready'); error.code = 'not-ready'; throw error; }
    return api().captureARSnapshot(options);
  },
  getLocale: () => window.CURTAIN_WALL_SHARED_SHELL?.state?.locale || 'en-US',
  onFeedback: (...args) => window.CURTAIN_WALL_SHARED_SHELL?.showFeedback?.(...args),
});

bindPanelAccordions(document.querySelector('.sidebar'));

const shell = mountStandaloneConfiguratorShell({
  productType: 'Curtain wall',
  productId: 'curtainwall',
  storagePrefix: '360-configurator:curtainwall',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  // Save, share and quotation need the product in the backend catalogue.
  capabilities: { viewAR: true, save: false, undo: false, reset: true, share: false },
  tools: {
    items: resolveSharedTools(['camera', 'explode']),
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#cwSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'cw-sidebar-collapsed',
    initiallyCollapsed: compactViewport.matches,
  },
  callbacks: {
    onViewAR() { ar.open(); },
    async resetConfiguration() { return api()?.resetConfiguration?.() !== false; },
    captureState() { return api()?.captureState?.(); },
    restoreState(snapshot) { return api()?.restoreState?.(snapshot) ?? false; },
    // Camera tool: exterior → elevation → interior → node close-up.
    // Explode tool: separates every layer of the mullion/transom node.
    onToolAction({ toolId }) {
      if (toolId === 'camera') api()?.cycleCamera?.();
      if (toolId === 'explode') shell.setToolActive?.('explode', Boolean(api()?.toggleExploded?.()));
    },
    onPreferenceChange(name, value, preferences) {
      window.CURTAIN_WALL_PREFERENCES = { ...preferences };
      window.dispatchEvent(new CustomEvent('curtainwall-preference-change', { detail: { name, value, preferences: { ...preferences } } }));
    },
  },
});

window.CURTAIN_WALL_PREFERENCES = { ...shell.state };
window.dispatchEvent(new CustomEvent('curtainwall-preference-change', { detail: { name: 'initial', preferences: { ...shell.state } } }));
compactViewport.addEventListener?.('change', event => shell.setSettingsPanelCollapsed?.(Boolean(event.matches)));
window.CURTAIN_WALL_SHARED_SHELL = shell;
window.addEventListener('curtainwall-exploded', event => shell.setToolActive?.('explode', Boolean(event.detail?.exploded)));
