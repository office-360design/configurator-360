import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  validateCustomization, normalizePublishedCustomization, resolveCustomization,
  assertCustomizationPermissions,
} from '../../shared-ui/src/tenantCustomization.js';
import { resolveTenantContext } from '../../shared-ui/src/tenantBootstrap.js';
const require = createRequire(import.meta.url);
const { buildTenantPlanCatalog, tenantPublicPolicy, isManagedTenant } = require('../../firebase-share-backend/functions/tenant-plans.cjs');
const plans = buildTenantPlanCatalog({ go_live_now_1: {
  id: 'go_live_now_1', name: 'Go Live Now — 1 configurator', shortName: '1 configurator',
  displayOrder: 10, features: [], maxConfigurators: 1,
} });
const capabilities = plans.go_live_custom_1.capabilities;
const envelope = settings => ({ schemaVersion: 1, revision: 1, enabled: true, settings });

test('legacy plans keep their allowance; customization and hosting are independent', () => {
  assert.equal(plans.go_live_now_1.capabilities.customization, false);
  assert.equal(plans.go_live_custom_1.capabilities.customization, true);
  assert.equal(plans.go_live_custom_1.maxConfigurators, 1);
  assert.equal(plans.go_live_custom_1.deploymentMode, 'shared');
  assert.ok(isManagedTenant({ plan: 'go_live_custom' }));
  assert.ok(!isManagedTenant({ plan: 'unrecognized' }));
});
test('valid settings normalize without modifying caller data', () => {
  const input = { schemaVersion: 1, theme: { primary: '#aabbcc' }, products: { roof: { features: { cart: false } } } };
  const result = validateCustomization(input);
  assert.equal(result.theme.primary, '#AABBCC');
  assert.equal(input.theme.primary, '#aabbcc');
});
test('unknown, executable and malformed fields are rejected', () => {
  for (const input of [
    { schemaVersion: 2 }, { schemaVersion: 1, css: 'body{}' },
    { schemaVersion: 1, theme: { primary: 'url(javascript:x)' } },
    { schemaVersion: 1, products: { unknown: {} } },
    { schemaVersion: 1, defaults: { width: 3 } },
    { schemaVersion: 1, features: { share: 'false' } },
    { schemaVersion: 1, layout: { desktop: { panelSide: 'center' } } },
    JSON.parse('{"schemaVersion":1,"theme":{"__proto__":{"polluted":true}}}'),
  ]) assert.throws(() => validateCustomization(input));
  assert.equal({}.polluted, undefined);
});
test('product descriptor validates defaults, physical limits and catalogue membership', () => {
  const definitions = { roof: { fields: { width: { type: 'number', min: 1, max: 20 } }, catalogue: { profiles: ['a','b'] } } };
  const settings = { schemaVersion: 1, products: { roof: { defaults: { width: 5 }, limits: { width: { min: 2, max: 10 } }, catalogue: { profiles: ['a'] } } } };
  assert.deepEqual(validateCustomization(settings, definitions), settings);
  for (const range of [{ min: 11, max: 10 }, { min: 1, max: 21 }, { min: 6, max: 10 }]) {
    assert.throws(() => validateCustomization({ ...settings, products: { roof: { ...settings.products.roof, limits: { width: range } } } }, definitions));
  }
  assert.throws(() => validateCustomization({ schemaVersion: 1, products: { roof: { catalogue: { profiles: ['c'] } } } }, definitions));
});
test('plan and enabled product permissions constrain publishing', () => {
  const settings = validateCustomization({ schemaVersion: 1, products: { roof: { theme: { primary: '#ffffff' } } } });
  assert.throws(() => assertCustomizationPermissions(settings, {}, { roof: true }));
  assert.throws(() => assertCustomizationPermissions(settings, capabilities, { roof: false }));
  assert.throws(() => assertCustomizationPermissions(settings, { ...capabilities, theme: false }, { roof: true }));
  assert.doesNotThrow(() => assertCustomizationPermissions(settings, capabilities, { roof: true }));
});
test('resolution applies platform, tenant and product precedence without inventing support', () => {
  const result = resolveCustomization({ productId: 'roof', capabilities,
    builtIn: { schemaVersion: 1, theme: { primary: '#111111', surface: '#FFFFFF' } },
    platform: { schemaVersion: 1, theme: { primary: '#222222' } },
    published: envelope({ schemaVersion: 1, theme: { primary: '#333333' }, products: { roof: { theme: { primary: '#444444' }, features: { save: false, viewAR: true } } } }),
    supportedFeatures: { save: true, viewAR: false, share: true },
  });
  assert.equal(result.theme.primary, '#444444');
  assert.equal(result.theme.surface, '#FFFFFF');
  assert.deepEqual(result.features, { save: false, viewAR: false, share: true });
  assert.ok(Object.isFrozen(result.theme));
});
test('downgrades remove public overrides and upgrades require explicit restoration', () => {
  const before = { customization: envelope({ schemaVersion: 1, theme: { primary: '#123456' } }) };
  const downgraded = tenantPublicPolicy(plans.go_live_now_1, before);
  assert.equal(downgraded.customization.enabled, false);
  assert.equal(downgraded.customization.revision, 1);
  assert.deepEqual(downgraded.customization.settings, { schemaVersion: 1 });
  assert.equal(tenantPublicPolicy(plans.go_live_custom_1, downgraded).customization.enabled, false);
  assert.equal(before.customization.settings.theme.primary, '#123456');
});
test('published envelopes fail closed; absent legacy configuration stays valid', () => {
  assert.equal(normalizePublishedCustomization().enabled, false);
  assert.throws(() => normalizePublishedCustomization({ schemaVersion: 2 }));
  assert.throws(() => resolveCustomization({ productId: 'roof', published: envelope({ schemaVersion: 1 }) }));
  assert.throws(() => resolveCustomization({ productId: 'roof', capabilities, published: { ...envelope({ schemaVersion: 1 }), revision: -1 } }));
});
function firestore(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'string') return { stringValue: value };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, firestore(v)])) } };
}
test('bootstrap loads legacy and custom tenant records; invalid policy blocks access', async t => {
  const base = { companyName: 'Example', status: 'active', configurators: { roof: true } };
  let data = base;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => firestore(data).mapValue }));
  let context = await resolveTenantContext({ hostname: 'example.360configurator.com' });
  assert.equal(context.exists, true);
  assert.equal(context.customization.enabled, false);
  data = { ...base, capabilities, customization: envelope({ schemaVersion: 1, theme: { primary: '#123456' } }) };
  context = await resolveTenantContext({ hostname: 'example.360configurator.com' });
  assert.equal(context.customization.revision, 1);
  data.customization = { schemaVersion: 99 };
  context = await resolveTenantContext({ hostname: 'example.360configurator.com' });
  assert.equal(context.exists, false);
  assert.equal(context.error, 'configuration');
});
test('deployment exports, CI and private subcollection rules include the foundation', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/deploy-firebase-share.yml', import.meta.url), 'utf8');
  for (const name of ['getTenantCustomization', 'saveTenantCustomizationDraft', 'previewTenantCustomization', 'publishTenantCustomization', 'rollbackTenantCustomization']) assert.ok(workflow.includes(`functions:${name}`));
  const rules = await readFile(new URL('../../firebase-share-backend/firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/tenants\/\{tenantSlug\}\/\{document=\*\*\} \{\s*allow read, write: if false;/);
});
