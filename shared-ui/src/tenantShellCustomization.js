import { resolveCustomization } from './tenantCustomization.js?v=foundation-1';

export function resolveTenantShellOptions(options, tenant, productId) {
  if (!tenant?.customization?.enabled) return { options, customization: null };
  const declared = options.capabilities || {};
  const customization = resolveCustomization({
    productId,
    published: tenant.customization,
    capabilities: tenant.capabilities,
    supportedFeatures: {
      save: declared.save !== false,
      share: declared.share !== false,
      viewAR: declared.viewAR === true,
      cart: productId !== 'bookshelf' && declared.cart !== false && declared.save !== false,
      quotation: productId !== 'bookshelf' && declared.quotation !== false,
      price: declared.price !== false,
    },
  });
  return {
    customization,
    options: { ...options, capabilities: { ...declared, ...customization.features } },
  };
}

export function primaryTextColor(color) {
  const channels = color.slice(1).match(/../g).map(part => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}

// Scope customization to the common shell/panel. 3D material colors and native
// product controls remain owned by product adapters, not broad CSS replacements.
export function applyTenantShellTheme(root, customization) {
  if (!root || !customization) return () => {};
  const previous = new Map();
  const set = (name, value) => {
    previous.set(name, [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
    root.style.setProperty(name, value);
  };
  const oldUi = root.getAttribute('data-tenant-ui');
  root.setAttribute('data-tenant-ui', 'true');
  const oldTheme = root.getAttribute('data-tenant-theme');
  const oldTools = root.getAttribute('data-tenant-tools-position');
  const theme = customization.theme || {};
  for (const key of ['primary', 'surface', 'text', 'muted', 'border']) {
    if (theme[key]) set(`--tenant-${key}`, theme[key]);
  }
  if (theme.primary) set('--tenant-primary-text', primaryTextColor(theme.primary));
  if (theme.radius) set('--tenant-radius', { none: '0px', small: '6px', medium: '12px', large: '18px' }[theme.radius]);
  if (theme.font) set('--tenant-font', theme.font === 'system' ? 'system-ui, sans-serif' : 'Inter, system-ui, sans-serif');
  if (Object.keys(theme).length) root.setAttribute('data-tenant-theme', 'true');
  const position = customization.layout?.desktop?.toolbarPosition;
  if (position) root.setAttribute('data-tenant-tools-position', position);
  return () => {
    for (const [name, [value, priority]] of previous) {
      if (value) root.style.setProperty(name, value, priority);
      else root.style.removeProperty(name);
    }
    for (const [name, value] of [['data-tenant-ui', oldUi], ['data-tenant-theme', oldTheme], ['data-tenant-tools-position', oldTools]]) {
      if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
    }
  };
}

export function loadTenantShellStyles() {
  if (document.querySelector('link[data-tenant-shell-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../styles/tenantUi.css?v=tenant-ui-2', import.meta.url).href;
  link.dataset.tenantShellStyles = '';
  document.head.append(link);
}
