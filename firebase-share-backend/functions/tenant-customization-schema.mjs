// Canonical browser/server contract. scripts/build/sync-tenant-customization.mjs
// copies this dependency-free module into shared-ui for static deployments.
export const CUSTOMIZATION_SCHEMA_VERSION = 1;
export const PRODUCT_IDS = Object.freeze([
  'window', 'pergola', 'roof', 'solar', 'hall', 'fence',
  'cardbox', 'tiles', 'chair', 'bookshelf',
]);
const FEATURES = ['save', 'share', 'viewAR', 'quotation', 'cart', 'price'];
const CATEGORIES = ['theme', 'layout', 'features', 'defaults', 'limits', 'catalogue'];
const EMPTY = Object.freeze({ schemaVersion: 1 });

// Product adapters extend these declarations as their behavior is integrated.
// No arbitrary state paths, CSS, HTML, scripts or unknown product fields pass.
export const PRODUCT_CUSTOMIZATION_DEFINITIONS = deepFreeze(Object.fromEntries(
  PRODUCT_IDS.map(id => [id, { fields: {}, catalogue: {}, features: [] }]),
));

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(path, 'expected a plain object');
  }
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(path, 'unsafe key');
  }
  return value;
}
function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, 'unsupported setting');
  }
}
function choice(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `expected one of ${allowed.join(', ')}`);
  return value;
}
function numeric(value, descriptor, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)
      || value < descriptor.min || value > descriptor.max
      || (descriptor.integer && !Number.isInteger(value))) fail(path, 'outside supported bounds');
  return value;
}
function field(value, descriptor, path) {
  if (descriptor.type === 'number') return numeric(value, descriptor, path);
  if (descriptor.type === 'boolean' && typeof value === 'boolean') return value;
  if (descriptor.type === 'enum') return choice(value, descriptor.values, path);
  fail(path, 'invalid value');
}
export function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validateLayer(input, path, definition = null) {
  keys(input, CATEGORIES, path);
  const output = {};
  for (const category of Object.keys(input)) {
    const values = object(input[category], `${path}.${category}`);
    const result = {};
    for (const [key, value] of Object.entries(values)) {
      const location = `${path}.${category}.${key}`;
      if (category === 'theme') {
        if (['primary', 'surface', 'text', 'muted', 'border', 'viewerBackground'].includes(key)) {
          if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(location, 'expected a six-digit hex color');
          result[key] = value.toUpperCase();
        } else if (key === 'radius') result[key] = choice(value, ['none', 'small', 'medium', 'large'], location);
        else if (key === 'font') result[key] = choice(value, ['system', 'inter'], location);
        else fail(location, 'unsupported theme token');
      } else if (category === 'layout') {
        if (key === 'desktop') {
          keys(value, ['panelSide', 'toolbarPosition'], location);
          result[key] = {};
          if (value.panelSide !== undefined) result[key].panelSide = choice(value.panelSide, ['left', 'right'], location);
          if (value.toolbarPosition !== undefined) result[key].toolbarPosition = choice(value.toolbarPosition,
            ['top-left', 'top-right', 'bottom-left', 'bottom-right'], location);
        } else if (key === 'mobile') {
          keys(value, ['panelMode'], location);
          result[key] = {};
          if (value.panelMode !== undefined) result[key].panelMode = choice(value.panelMode, ['drawer', 'bottom-sheet'], location);
        } else fail(location, 'unsupported layout setting');
      } else if (category === 'features') {
        if (![...FEATURES, ...(definition?.features || [])].includes(key)
            || typeof value !== 'boolean') fail(location, 'unsupported feature or non-boolean value');
        result[key] = value;
      } else if (category === 'defaults') {
        if (key === 'units') result[key] = choice(value, ['metric', 'imperial'], location);
        else if (key === 'currency') result[key] = choice(value, ['EUR', 'RON', 'USD'], location);
        else if (Object.hasOwn(definition?.fields || {}, key)) result[key] = field(value, definition.fields[key], location);
        else fail(location, 'product field is not registered');
      } else if (category === 'limits') {
        const descriptor = definition?.fields?.[key];
        if (!descriptor || descriptor.type !== 'number') fail(location, 'numeric product field is not registered');
        keys(value, ['min', 'max'], location);
        if (value.min === undefined || value.max === undefined) fail(location, 'min and max are required');
        const min = numeric(value.min, descriptor, location);
        const max = numeric(value.max, descriptor, location);
        if (min > max) fail(location, 'min exceeds max');
        result[key] = { min, max };
      } else if (category === 'catalogue') {
        const allowed = definition?.catalogue?.[key];
        if (!allowed || !Array.isArray(value) || !value.length || value.length > 200
            || new Set(value).size !== value.length
            || value.some(item => !allowed.includes(item))) fail(location, 'invalid catalogue selection');
        result[key] = [...value];
      }
    }
    output[category] = result;
  }
  for (const [key, range] of Object.entries(output.limits || {})) {
    const value = output.defaults?.[key];
    if (value !== undefined && (value < range.min || value > range.max)) fail(path, `${key} default is outside tenant limits`);
  }
  return output;
}

export function validateCustomization(input, definitions = PRODUCT_CUSTOMIZATION_DEFINITIONS) {
  keys(input, ['schemaVersion', ...CATEGORIES, 'products'], 'customization');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'unsupported customization schema');
  if (JSON.stringify(input).length > 64000) fail('customization', 'settings exceed 64,000 characters');
  const { schemaVersion, products, ...common } = input;
  const result = { schemaVersion, ...validateLayer(common, 'customization') };
  if (products !== undefined) {
    keys(products, Object.keys(definitions), 'products');
    result.products = {};
    for (const [id, settings] of Object.entries(products)) {
      result.products[id] = validateLayer(settings, `products.${id}`, definitions[id]);
    }
  }
  return result;
}

export function assertCustomizationPermissions(settings, capabilities, enabledProducts) {
  if (capabilities?.customization !== true) fail('plan', 'customization is not included');
  for (const layer of [settings, ...Object.values(settings.products || {})]) {
    for (const category of CATEGORIES) {
      if (Object.keys(layer[category] || {}).length && capabilities[category] !== true) fail(category, 'not included in plan');
    }
  }
  for (const id of Object.keys(settings.products || {})) {
    if (enabledProducts?.[id] !== true) fail(id, 'configurator is not enabled for this tenant');
  }
}

function merge(base, override) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key] || {}, value) : structuredClone(value);
  }
  return result;
}

export function normalizePublishedCustomization(value, definitions = PRODUCT_CUSTOMIZATION_DEFINITIONS) {
  if (value === undefined) return deepFreeze({ schemaVersion: 1, revision: 0, enabled: false, settings: { ...EMPTY } });
  keys(value, ['schemaVersion', 'revision', 'enabled', 'settings'], 'published customization');
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0
      || typeof value.enabled !== 'boolean' || (value.enabled && value.revision === 0)) {
    fail('published customization', 'invalid revision envelope');
  }
  return deepFreeze({ ...value, settings: validateCustomization(value.settings, definitions) });
}

// A pure resolver: caller-supplied product support is authoritative. Tenant
// settings can disable a supported feature, but cannot create a new capability.
export function resolveCustomization({ productId, builtIn = EMPTY, platform = EMPTY,
  published, capabilities = {}, supportedFeatures = {},
  definitions = PRODUCT_CUSTOMIZATION_DEFINITIONS } = {}) {
  if (!Object.hasOwn(definitions, productId)) fail('productId', 'unsupported configurator');
  published = normalizePublishedCustomization(published, definitions);
  let result = {};
  const layers = [validateCustomization(builtIn, definitions), validateCustomization(platform, definitions)];
  if (published?.enabled === true) {
    if (capabilities.customization !== true) fail('plan', 'published customization is not permitted');
    const settings = validateCustomization(published.settings, definitions);
    assertCustomizationPermissions(settings, capabilities,
      Object.fromEntries(Object.keys(definitions).map(id => [id, true])));
    layers.push(settings);
  }
  for (const { schemaVersion, products, ...common } of layers) {
    result = merge(merge(result, common), products?.[productId] || {});
  }
  validateLayer(result, productId, definitions[productId]);
  result.features = Object.fromEntries(Object.entries(supportedFeatures).map(([key, supported]) => [
    key, supported === true && result.features?.[key] !== false,
  ]));
  return deepFreeze({ ...result, schemaVersion: 1, revision: published?.revision || 0 });
}
