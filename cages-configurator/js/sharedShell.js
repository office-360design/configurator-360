import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=site-analytics-1';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { bindPanelAccordions } from '../../shared-ui/src/components/panelControls.js?v=panel-controls-1';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=locales-6';
import { createCagesARController } from './ar/controller.js?v=cages-ar-1';

const tenantContext = await requireTenantConfiguratorAccess('cages');
const compactViewport = window.matchMedia('(max-width: 760px)');
const api = () => window.CAGES_CONFIGURATOR_API;
const ar = createCagesARController({
  getAssembly: () => api()?.getARAssembly?.(),
  getLocale: () => window.CAGES_CONFIGURATOR_SHARED_SHELL?.state?.locale || 'ro-RO',
  onFeedback: (...args) => window.CAGES_CONFIGURATOR_SHARED_SHELL?.showFeedback?.(...args),
});

bindPanelAccordions(document.querySelector('.sidebar'));

const shell = mountStandaloneConfiguratorShell({
  productType: 'Cages',
  productId: 'cages',
  storagePrefix: '360-configurator:cages',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  // Save, share and quotation remain disabled until cages joins the backend
  // product catalogue. AR uses the shared public snapshot infrastructure.
  capabilities: { viewAR: true, save: false, undo: false, reset: true, share: false },
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
    onViewAR() { ar.open(); },
    async resetConfiguration() { return api()?.resetConfiguration?.() !== false; },
    captureState() { return api()?.captureState?.(); },
    restoreState(snapshot) { return api()?.restoreState?.(snapshot) ?? false; },
    // Camera tool: Ansamblu → Detaliu cap → Vedere axială.
    onToolAction({ toolId }) { if (toolId === 'camera') api()?.cycleCamera?.(); },
  },
});

compactViewport.addEventListener?.('change', event => shell.setSettingsPanelCollapsed?.(Boolean(event.matches)));

window.CAGES_CONFIGURATOR_SHARED_SHELL = shell;
