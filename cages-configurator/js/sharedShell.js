import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=tenant-branding-1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { bindPanelAccordions } from '../../shared-ui/src/components/panelControls.js?v=panel-controls-1';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';

const tenantContext = await requireTenantConfiguratorAccess('cages');
const compactViewport = window.matchMedia('(max-width: 760px)');
const api = () => window.CAGES_CONFIGURATOR_API;

bindPanelAccordions(document.querySelector('.sidebar'));

const shell = mountStandaloneConfiguratorShell({
  productType: 'Cages',
  productId: 'cages',
  storagePrefix: '360-configurator:cages',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  // Save, share and quotation need 'cages' in the backend product catalogue,
  // which also adds it to the tenant plans. Enable them once that is decided.
  capabilities: { viewAR: false, save: false, undo: false, reset: true, share: false },
  tools: {
    items: resolveSharedTools(['camera']),
    placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 },
  },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#cagesSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'cages-sidebar-collapsed',
    initiallyCollapsed: compactViewport.matches,
  },
  callbacks: {
    async resetConfiguration() { return api()?.resetConfiguration?.() !== false; },
    captureState() { return api()?.captureState?.(); },
    restoreState(snapshot) { return api()?.restoreState?.(snapshot) ?? false; },
    // Camera tool: Ansamblu → Detaliu cap → Vedere axială.
    onToolAction({ toolId }) { if (toolId === 'camera') api()?.cycleCamera?.(); },
  },
});

compactViewport.addEventListener?.('change', event => shell.setSettingsPanelCollapsed?.(Boolean(event.matches)));

window.CAGES_CONFIGURATOR_SHARED_SHELL = shell;
