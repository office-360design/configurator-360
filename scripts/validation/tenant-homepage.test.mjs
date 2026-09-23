import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { singleConfiguratorHomepageUrl } from '../../shared-ui/src/tenantHomepage.js';
import { resolveTenantContext, TENANT_CONFIGURATORS } from '../../shared-ui/src/tenantBootstrap.js';
import { CONFIGURATOR_PUBLIC_PATHS } from '../../shared-ui/src/config.js';
import * as policy from '../../shared-ui/src/tenantDomains.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const tenant = (overrides = {}) => ({
  slug: 'acme', domain: 'acme.360configurator.com', companyName: 'ACME',
  plan: 'go_live_now', planId: 'go_live_now_1', status: 'active',
  ownerUid: 'owner', ownerEmail: 'owner@example.test', configurators: { solar: true },
  ...overrides,
});
const context = (overrides = {}) => ({
  ...tenant(), isTenant: true, exists: true, autoOpenSingleConfigurator: true, ...overrides,
});
const location = (path = '/') => new URL(`https://acme.360configurator.ro${path}`);
const ownerRequest = (data = {}, root = '360configurator.ro', uid = 'owner') => ({
  data, auth: { uid, token: { email: 'owner@example.test', email_verified: true } },
  rawRequest: { headers: { origin: `https://acme.${root}` } },
});
const adminRequest = (data = {}) => ({
  data: { slug: 'acme', ...data },
  auth: { uid: 'admin', token: { email: 'admin@example.test', email_verified: true } },
  rawRequest: { headers: { origin: 'https://www.360configurator.com' } },
});

// Run real callables against transactional memory adapters, never production.
function backendHarness({ existing = true, initial = {}, failAudit = false } = {}) {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  class Timestamp {
    constructor(ms) { this.ms = ms; }
    static now() { return new Timestamp(Date.now()); }
    static fromMillis(ms) { return new Timestamp(ms); }
    toMillis() { return this.ms; }
  }
  const deleted = Symbol('delete');
  const documents = new Map();
  let id = 0;
  const snapshot = (path) => ({
    id: path.split('/').at(-1), exists: documents.has(path),
    data: () => documents.get(path), ref: reference(path),
  });
  const query = (path, key = '', direction = 'asc', limit = Infinity) => ({
    limit: (count) => query(path, key, direction, count),
    get: async () => {
      const docs = [...documents.keys()]
        .filter((item) => item.startsWith(`${path}/`) && !item.slice(path.length + 1).includes('/'))
        .map(snapshot).sort((a, b) => {
          const av = a.data()[key]?.toMillis?.() || 0;
          const bv = b.data()[key]?.toMillis?.() || 0;
          return direction === 'desc' ? bv - av : av - bv;
        }).slice(0, limit);
      return { docs, empty: !docs.length };
    },
  });
  const reference = (path = '') => ({
    path, id: path.split('/').at(-1),
    doc: (name = `event-${++id}`) => reference(`${path}/${name}`),
    collection: (name) => reference(`${path}/${name}`),
    get: async () => snapshot(path),
    orderBy: (key, direction) => query(path, key, direction),
  });
  const db = reference();
  db.runTransaction = async (operation) => {
    const staged = [];
    const transaction = {
      get: async (ref) => { assert.equal(staged.length, 0, 'Reads must precede transaction writes'); return snapshot(ref.path); },
      update: (ref, data) => {
        assert.ok(documents.has(ref.path), `Missing document: ${ref.path}`);
        staged.push(() => {
          const next = { ...documents.get(ref.path), ...data };
          for (const key of Object.keys(next)) if (next[key] === deleted) delete next[key];
          documents.set(ref.path, next);
        });
      },
      create: (ref, data) => {
        assert.ok(!documents.has(ref.path), `Existing document: ${ref.path}`);
        if (failAudit && ref.path.startsWith('/tenantAuditLogs/')) throw new Error('Synthetic audit failure');
        staged.push(() => documents.set(ref.path, data));
      },
    };
    const value = await operation(transaction);
    staged.forEach((apply) => apply());
    return value;
  };
  const adapters = {
    'firebase-functions/v2/core': { onInit() {} },
    'firebase-functions/v2/firestore': { onDocumentCreated: (_options, fn) => fn },
    'firebase-functions/v2/https': { HttpsError, onCall: (_options, fn) => fn },
    'firebase-functions/logger': { info() {}, warn() {}, error() {} },
    'google-auth-library': { GoogleAuth: class {} },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth() {} },
    'firebase-admin/firestore': { getFirestore: () => db, Timestamp, AggregateField: {}, FieldValue: { delete: () => deleted } },
  };
  const sandbox = vm.createContext({
    Buffer, URL, console, process: { env: {} }, exports: {}, mockDb: db, authCalls: 0,
    require(name) {
      if (name === './tenantDomains.cjs') return policy;
      if (name === 'node:crypto') return require(name);
      assert.ok(adapters[name], `Unexpected dependency: ${name}`);
      return adapters[name];
    },
  });
  vm.runInContext(read('firebase-share-backend/functions/index.js'), sandbox);
  vm.runInContext(`db = mockDb;
    ensureFirebaseAuthorizedDomain = async () => { authCalls += 1; };
  `, sandbox);
  documents.set('/tenantProvisioningAdmins/admin', { active: true, email: 'admin@example.test' });
  if (existing) {
    documents.set('/tenants/acme', tenant(initial));
    documents.set('/tenantPublic/acme', {
      slug: 'acme', companyName: 'ACME', status: 'active', configurators: { solar: true },
      ...(initial.autoOpenSingleConfigurator !== undefined ? { autoOpenSingleConfigurator: initial.autoOpenSingleConfigurator } : {}),
    });
  }
  return {
    api: sandbox.exports, documents, sandbox,
    privateData: () => documents.get('/tenants/acme'),
    publicData: () => documents.get('/tenantPublic/acme'),
    audits: () => [...documents.entries()].filter(([path]) => path.startsWith('/tenantAuditLogs/acme/events/')).map(([, data]) => data),
  };
}

for (const [locale, root] of Object.entries(policy.TENANT_DOMAIN_ROOTS)) {
  test(`${root}: each of ten single-configurator homepages uses the public localized route`, () => {
    for (const product of Object.keys(TENANT_CONFIGURATORS)) {
      assert.equal(singleConfiguratorHomepageUrl(context({ configurators: { [product]: true } }),
        new URL(`https://acme.${root}/`)), `https://acme.${root}${CONFIGURATOR_PUBLIC_PATHS[locale][product]}`);
    }
  });
}
test('legacy, opted-out, multiple, empty, disabled, suspended and failed lookups do not redirect', () => {
  for (const overrides of [
    { autoOpenSingleConfigurator: undefined }, { autoOpenSingleConfigurator: false },
    ...['true', 1, null, {}, []].map((value) => ({ autoOpenSingleConfigurator: value })),
    { configurators: {} }, { configurators: { solar: false } },
    { configurators: { solar: 'true' } }, { configurators: { solar: true, roof: true } },
    { configurators: { unknown: true } }, { status: 'suspended' }, { exists: false },
    { isTenant: false }, { error: 'network' },
  ]) assert.equal(singleConfiguratorHomepageUrl(context(overrides), location()), '');
});
test('pending plans are ignored and capacity does not determine single-configurator routing', () => {
  assert.ok(singleConfiguratorHomepageUrl(context({ planId: 'go_live_now_all',
    pendingPlanChange: { configurators: { roof: true, solar: true } },
  }), location()).endsWith('/configurator-solar/'));
  assert.equal(singleConfiguratorHomepageUrl(context({ configurators: { roof: true, solar: true },
    pendingPlanChange: { configurators: { solar: true } },
  }), location()), '');
});
test('redirect is restricted to this tenant homepage; dashboard and direct app pages stay accessible', () => {
  for (const href of [
    'https://www.360configurator.ro/', 'https://other.360configurator.ro/',
    'https://acme.360configurator.ro.evil.test/', 'http://acme.360configurator.ro/',
    'https://acme.360configurator.ro:444/', 'https://acme.360configurator.ro/dashboard/',
    'https://acme.360configurator.ro/configurator-solar/',
    'https://acme.360configurator.ro/shared-ui/tenant/index.html',
  ]) assert.equal(singleConfiguratorHomepageUrl(context(), new URL(href)), '');
  assert.equal(singleConfiguratorHomepageUrl(context(), {}), '');
});
test('query and fragment survive unchanged and a supplied next/redirect URL cannot select the destination', () => {
  const source = location('/?utm_source=test&next=https%3A%2F%2Fevil.test&savedConfig=abc#domainAuthHandoff=secret&cartItem=123');
  const target = new URL(singleConfiguratorHomepageUrl(context({ redirectUrl: 'https://evil.test' }), source));
  assert.equal(target.origin, source.origin);
  assert.equal(target.pathname, '/configurator-solar/');
  assert.equal(target.search, source.search);
  assert.equal(target.hash, source.hash);
});
test('public bootstrap exposes a strictly boolean preference, defaulting legacy records to off', async (t) => {
  for (const [value, expected] of [[undefined, false], [false, false], [true, true], ['true', false]]) {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ fields: {
      companyName: { stringValue: 'ACME' }, status: { stringValue: 'active' },
      ...(value === undefined ? {} : { autoOpenSingleConfigurator: typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value } }),
    } }) }));
    assert.equal((await resolveTenantContext({ hostname: 'acme.360configurator.ro' })).autoOpenSingleConfigurator, expected);
    t.mock.restoreAll();
  }
});
test('provisioning persists the opted-in preference in both records and defaults legacy requests to off', async () => {
  for (const preference of [undefined, false, true]) {
    const h = backendHarness({ existing: false });
    const data = { companyName: 'ACME', configurators: { solar: true }, planId: 'go_live_now_1',
      ...(preference === undefined ? {} : { autoOpenSingleConfigurator: preference }),
    };
    const result = await h.api.provisionTenant(adminRequest(data));
    assert.equal(result.autoOpenSingleConfigurator, preference === true);
    assert.equal(h.privateData().autoOpenSingleConfigurator, preference === true);
    assert.equal(h.publicData().autoOpenSingleConfigurator, preference === true);
    assert.equal(h.audits().length, 1);
    assert.ok(h.audits()[0].details.changes.some((item) => item.includes('Open single configurator')));
  }
});
test('owner changes synchronize both records, API views and audit; omitted fields preserve the setting', async () => {
  const h = backendHarness();
  for (const root of Object.values(policy.TENANT_DOMAIN_ROOTS)) {
    assert.equal((await h.api.getTenantDashboard(ownerRequest({}, root))).autoOpenSingleConfigurator, false);
  }
  const result = await h.api.updateTenantDashboard(ownerRequest({ autoOpenSingleConfigurator: true }));
  assert.equal(result.autoOpenSingleConfigurator, true);
  assert.equal(h.publicData().autoOpenSingleConfigurator, true);
  assert.equal(h.audits().length, 1);
  assert.ok(h.audits()[0].details.changedFields.includes('homepage behavior'));
  assert.equal(result.auditEvents[0].actorEmail, undefined);
  assert.equal(result.auditEvents[0].details, undefined);
  await h.api.updateTenantDashboard(ownerRequest({ companyName: 'Updated' }));
  assert.equal(h.privateData().autoOpenSingleConfigurator, true);
  assert.equal(h.publicData().autoOpenSingleConfigurator, true);
  const count = h.audits().length;
  await h.api.updateTenantDashboard(ownerRequest({ autoOpenSingleConfigurator: true }));
  assert.equal(h.audits().length, count, 'Saving the unchanged preference adds no audit event');
  assert.equal((await h.api.getTenant(adminRequest())).autoOpenSingleConfigurator, true);
  await h.api.updateTenantDashboard(ownerRequest({ autoOpenSingleConfigurator: false }));
  assert.equal(h.privateData().autoOpenSingleConfigurator, false);
  assert.equal(h.publicData().autoOpenSingleConfigurator, false);
});
test('admin updates synchronize the preference and keep it through suspension, reactivation and unrelated edits', async () => {
  const h = backendHarness();
  const result = await h.api.updateTenant(adminRequest({ autoOpenSingleConfigurator: true }));
  assert.equal(result.autoOpenSingleConfigurator, true);
  assert.equal(h.publicData().autoOpenSingleConfigurator, true);
  assert.ok(h.audits()[0].summary.includes('homepage behavior'));
  for (const status of ['suspended', 'active']) {
    const updated = await h.api.updateTenant(adminRequest({ status }));
    assert.equal(updated.autoOpenSingleConfigurator, true);
    const target = singleConfiguratorHomepageUrl(context(h.publicData()), location());
    assert.equal(Boolean(target), status === 'active');
  }
  assert.equal(h.privateData().ownerUid, 'owner');
});
test('non-boolean values are rejected without metadata writes or Auth provisioning', async () => {
  for (const value of [null, 'true', 'false', 1, 0, [], {}]) {
    for (const operation of ['provisionTenant', 'updateTenant', 'updateTenantDashboard']) {
      const h = backendHarness({ existing: operation !== 'provisionTenant' });
      const before = plain([...h.documents]);
      const data = { autoOpenSingleConfigurator: value, companyName: 'ACME', configurators: { solar: true } };
      const req = operation === 'updateTenantDashboard' ? ownerRequest(data) : adminRequest(data);
      await assert.rejects(h.api[operation](req), { code: 'invalid-argument' });
      assert.deepEqual(plain([...h.documents]), before);
      assert.equal(h.sandbox.authCalls, 0);
    }
  }
});
test('unauthorized or unverified owners, foreign origins and non-admins cannot write the preference', async () => {
  const h = backendHarness();
  const data = { autoOpenSingleConfigurator: true };
  for (const req of [
    { ...ownerRequest(data), auth: null }, ownerRequest(data, '360configurator.ro', 'stranger'),
    { ...ownerRequest(data), auth: { uid: 'owner', token: { email: 'owner@example.test', email_verified: false } } },
    { ...ownerRequest(data), rawRequest: { headers: { origin: 'https://other.360configurator.ro' } } },
  ]) await assert.rejects(h.api.updateTenantDashboard(req));
  await assert.rejects(h.api.updateTenant({ ...adminRequest(data), auth: ownerRequest().auth }), { code: 'permission-denied' });
  assert.equal(h.privateData().autoOpenSingleConfigurator, undefined);
  assert.equal(h.audits().length, 0);
});
test('pending plan changes do not prematurely change the homepage target; approval uses live entitlements', async () => {
  const h = backendHarness();
  await h.api.updateTenantDashboard(ownerRequest({ autoOpenSingleConfigurator: true,
    planId: 'go_live_now_3', configurators: { solar: true, roof: true },
  }));
  assert.equal(h.privateData().planId, 'go_live_now_1');
  assert.ok(singleConfiguratorHomepageUrl(context(h.publicData()), location()).endsWith('/configurator-solar/'));
  await h.api.resolveTenantPlanChange(adminRequest({ decision: 'approve' }));
  assert.equal(h.privateData().autoOpenSingleConfigurator, true);
  assert.equal(singleConfiguratorHomepageUrl(context(h.publicData()), location()), '');
  await h.api.updateTenantDashboard(ownerRequest({ planId: 'go_live_now_1', configurators: { roof: true } }));
  assert.equal(singleConfiguratorHomepageUrl(context(h.publicData()), location()), '');
  await h.api.resolveTenantPlanChange(adminRequest({ decision: 'approve' }));
  assert.ok(singleConfiguratorHomepageUrl(context(h.publicData()), location()).endsWith('/configurator-acoperis/'));
});
test('audit failure rolls back both private and public preference changes', async () => {
  for (const operation of ['updateTenant', 'updateTenantDashboard']) {
    const h = backendHarness({ failAudit: true });
    const before = plain([...h.documents]);
    const data = { autoOpenSingleConfigurator: true };
    await assert.rejects(h.api[operation](operation === 'updateTenant' ? adminRequest(data) : ownerRequest(data)), /Synthetic audit failure/);
    assert.deepEqual(plain([...h.documents]), before);
  }
});
