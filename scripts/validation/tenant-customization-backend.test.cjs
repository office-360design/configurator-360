'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createTenantCustomizationHandlers } = require('../../firebase-share-backend/functions/tenant-customization.cjs');
const { buildTenantPlanCatalog, isManagedTenant, tenantPublicPolicy } = require('../../firebase-share-backend/functions/tenant-plans.cjs');
const source = fs.readFileSync(new URL('../../firebase-share-backend/functions/index.js', `file://${__filename}`), 'utf8');
const catalogExpression = source.slice(source.indexOf('buildTenantPlanCatalog({'), source.indexOf('const TENANT_SLUG_PATTERN')).trim().replace(/;$/, '');
const plans = vm.runInNewContext(catalogExpression, { buildTenantPlanCatalog, ALLOWED_PRODUCTS: new Set(Array(10).keys()) });

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function setup() {
  const documents = new Map([
    ['tenants/acme', { plan: 'go_live_custom', planId: 'go_live_custom_1', status: 'active', ownerUid: 'owner', configurators: { roof: true } }],
    ['tenantPublic/acme', { ...tenantPublicPolicy(plans.go_live_custom_1), companyName: 'Acme' }],
  ]);
  let counter = 0;
  function ref(path) { return { path, doc: id => ref(`${path}/${id || `auto${++counter}`}`), collection: id => ref(`${path}/${id}`) }; }
  const db = {
    collection: path => ref(path),
    async runTransaction(callback) {
      const pending = [];
      let writing = false;
      const transaction = {
        get: async reference => {
          assert.equal(writing, false, 'Firestore reads must precede writes');
          return { exists: documents.has(reference.path), data: () => structuredClone(documents.get(reference.path)) };
        },
      };
      for (const method of ['set','create','update']) transaction[method] = (reference, data) => {
        writing = true;
        pending.push({ method, path: reference.path, data: structuredClone(data) });
      };
      const result = await callback(transaction);
      for (const { method, path } of pending) {
        if (method === 'create') assert.equal(documents.has(path), false, 'immutable revisions must not be overwritten');
        if (method === 'update') assert.ok(documents.has(path));
      }
      for (const { method, path, data } of pending) documents.set(path, method === 'update' ? { ...documents.get(path), ...data } : data);
      return result;
    },
  };
  const handlers = createTenantCustomizationHandlers({
    getDb: () => db, HttpsError, Timestamp: { now: () => 12345 },
    authorize: async request => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in');
      return { slug: 'acme', uid: request.auth.uid, actorType: 'tenant_owner' };
    },
    isManagedTenant, tenantPlan: id => plans[id], validateTenantPlanId: id => id,
    tenantPublicPolicy, createAudit: value => value,
    auditRef: slug => db.collection(`tenantAuditLogs/${slug}/events`).doc(),
  });
  const call = (name, data = {}, uid = 'owner') => handlers[name]({ data, auth: uid ? { uid } : null });
  const tenant = () => documents.get('tenants/acme');
  const publicData = () => documents.get('tenantPublic/acme');
  return { documents, call, tenant, publicData };
}
const settings = { schemaVersion: 1, theme: { primary: '#123456' }, products: { roof: { features: { cart: false } } } };
const lease = (expectedRevision = 0, expectedDraftVersion = 0) => ({ expectedRevision, expectedDraftVersion });
const code = expected => error => error.code === expected;

test('catalog adds all three custom allowances while preserving legacy IDs', () => {
  assert.equal(Object.keys(plans).length, 6);
  for (const count of ['1','3','all']) {
    assert.equal(plans[`go_live_custom_${count}`].maxConfigurators, plans[`go_live_now_${count}`].maxConfigurators);
  }
});
test('draft and preview remain private; publication is atomic and audited', async () => {
  const f = setup();
  assert.deepEqual(await f.call('saveTenantCustomizationDraft', { ...lease(), settings }), { revision: 0, draftVersion: 1 });
  assert.equal(f.publicData().customization.enabled, false);
  const preview = await f.call('previewTenantCustomization', lease(0,1));
  assert.deepEqual(preview.settings, settings);
  assert.equal(f.publicData().customization.revision, 0);
  assert.deepEqual(await f.call('publishTenantCustomization', lease(0,1)), { revision: 1, draftVersion: 2 });
  assert.deepEqual(f.publicData().customization.settings, settings);
  assert.equal(f.publicData().ownerUid, undefined);
  assert.equal(f.publicData().draft, undefined);
  assert.ok(f.documents.has('tenants/acme/customizationRevisions/1'));
  assert.equal([...f.documents.keys()].filter(k => k.startsWith('tenantAuditLogs/')).length, 2);
});
test('stale saves, stale publications and missing lease are rejected without writes', async () => {
  const f = setup();
  await f.call('saveTenantCustomizationDraft', { ...lease(), settings });
  await assert.rejects(f.call('saveTenantCustomizationDraft', { ...lease(), settings }), code('aborted'));
  await assert.rejects(f.call('publishTenantCustomization', lease()), code('aborted'));
  await assert.rejects(f.call('publishTenantCustomization', {}), code('invalid-argument'));
  assert.equal(f.publicData().customization.revision, 0);
});
test('rollback creates a new immutable revision and invalidates an older draft', async () => {
  const f = setup();
  await f.call('saveTenantCustomizationDraft', { ...lease(), settings });
  await f.call('publishTenantCustomization', lease(0,1));
  await f.call('saveTenantCustomizationDraft', { ...lease(1,2), settings: { schemaVersion: 1, theme: { primary: '#FFFFFF' } } });
  await f.call('publishTenantCustomization', lease(1,3));
  await f.call('rollbackTenantCustomization', { expectedRevision: 2, revision: 1 });
  assert.equal(f.publicData().customization.revision, 3);
  assert.deepEqual(f.publicData().customization.settings, settings);
  assert.equal(f.documents.get('tenants/acme/customizationRevisions/2').settings.theme.primary, '#FFFFFF');
  await assert.rejects(f.call('publishTenantCustomization', lease(3,4)), code('aborted'));
  await assert.rejects(f.call('rollbackTenantCustomization', { expectedRevision: 3, revision: 999 }), code('not-found'));
});
test('standard plan, inactive tenant, reassigned owner and anonymous writes are blocked', async () => {
  const f = setup();
  await assert.rejects(f.call('saveTenantCustomizationDraft', { ...lease(), settings }, null), code('unauthenticated'));
  await assert.rejects(f.call('saveTenantCustomizationDraft', { ...lease(), settings }, 'intruder'), code('permission-denied'));
  f.tenant().planId = 'go_live_now_1';
  await assert.rejects(f.call('saveTenantCustomizationDraft', { ...lease(), settings }), code('permission-denied'));
  f.tenant().planId = 'go_live_custom_1';
  f.tenant().status = 'suspended';
  await assert.rejects(f.call('saveTenantCustomizationDraft', { ...lease(), settings }), code('failed-precondition'));
  assert.equal(f.documents.has('tenants/acme/customization/state'), false);
});
test('publication revalidates product and plan permissions after draft creation', async () => {
  const f = setup();
  await f.call('saveTenantCustomizationDraft', { ...lease(), settings });
  f.tenant().configurators.roof = false;
  await assert.rejects(f.call('publishTenantCustomization', lease(0,1)), code('invalid-argument'));
  f.tenant().configurators.roof = true;
  f.tenant().planId = 'go_live_now_1';
  await assert.rejects(f.call('publishTenantCustomization', lease(0,1)), code('permission-denied'));
  assert.equal(f.publicData().customization.revision, 0);
});
test('downgrade preserves private history; upgrade and rollback explicitly restore it', async () => {
  const f = setup();
  await f.call('saveTenantCustomizationDraft', { ...lease(), settings });
  await f.call('publishTenantCustomization', lease(0,1));
  Object.assign(f.tenant(), { plan: 'go_live_now', planId: 'go_live_now_1' });
  Object.assign(f.publicData(), tenantPublicPolicy(plans.go_live_now_1, f.publicData()));
  const view = await f.call('getTenantCustomization');
  assert.equal(view.published.enabled, false);
  assert.deepEqual(view.draft, settings);
  Object.assign(f.tenant(), { plan: 'go_live_custom', planId: 'go_live_custom_1' });
  Object.assign(f.publicData(), tenantPublicPolicy(plans.go_live_custom_1, f.publicData()));
  await f.call('rollbackTenantCustomization', { expectedRevision: 1, revision: 1 });
  assert.equal(f.publicData().customization.enabled, true);
});
test('actual authorization dispatcher requires admin origin and allowlist for explicit tenant selection', async () => {
  const start = source.indexOf('async function authorizeTenantCustomization(');
  const end = source.indexOf('\nconst customizationHandlers', start);
  const calls = [];
  const authorize = vm.runInNewContext(`${source.slice(start,end)}\nauthorizeTenantCustomization`, {
    requireTenantAdminOrigin: request => { calls.push('origin'); if (request.origin !== 'internal') throw new Error('bad origin'); },
    requireTenantProvisioningAdmin: async request => { calls.push('admin'); if (!request.admin) throw new Error('not admin'); return { uid: 'admin' }; },
    validateTenantSlug: slug => { if (slug !== 'acme') throw new Error('invalid slug'); return slug; },
    requireTenantDashboardOwner: async () => { calls.push('owner'); return { uid: 'owner', slug: 'host-derived' }; },
  });
  assert.equal((await authorize({ data: {} })).slug, 'host-derived');
  await assert.rejects(authorize({ data: { tenantSlug: 'acme' }, admin: true }), /bad origin/);
  await assert.rejects(authorize({ data: { tenantSlug: 'acme' }, origin: 'internal' }), /not admin/);
  assert.equal((await authorize({ data: { tenantSlug: 'acme' }, origin: 'internal', admin: true })).actorType, 'admin');
  assert.ok(calls.includes('origin') && calls.includes('admin') && calls.includes('owner'));
});
