import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as policy from '../../shared-ui/src/tenantDomains.js';
import { getTenantSlugForHostname, TENANT_CONFIGURATORS } from '../../shared-ui/src/tenantBootstrap.js';
import { getLocaleForHostname, getLocalizedConfiguratorUrl, CONFIGURATOR_PUBLIC_PATHS } from '../../shared-ui/src/config.js';
import { migrateTenantDomains } from '../../firebase-share-backend/iam/authorize-existing-tenant-auth-domains.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const hosts = policy.tenantDomainsForSlug('acme');
const origins = hosts.map((host) => `https://${host}`);
const tenant = () => ({
  slug: 'acme', domain: hosts[0], status: 'active', plan: 'go_live_now',
  ownerUid: 'owner', ownerEmail: 'owner@example.test',
  configurators: { roof: true, solar: true }, solarUsageLimits: { dataLayersPerMonth: 2 },
});
const request = (origin, uid = 'owner') => ({
  auth: { uid, token: { email: 'owner@example.test', email_verified: true } },
  rawRequest: { headers: { origin } },
});

// Real module code runs against memory-only IAM/database adapters. Tests never
// contact Firebase, use real user credentials or alter a production tenant.
function memoryDb() {
  const documents = new Map();
  let autoId = 0;
  const ref = (path = '') => ({
    path, id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id = `auto-${++autoId}`) => ref(`${path}/${id}`),
    get: async () => ({ id: path.split('/').at(-1), ref: ref(path), exists: documents.has(path), data: () => documents.get(path) }),
  });
  const db = ref();
  // Serialize transactions like Firestore; stage mutations until callback success.
  let tail = Promise.resolve();
  db.runTransaction = (fn) => {
    const result = tail.then(async () => {
      const mutations = [];
      const tx = {
        get: (reference) => reference.get(),
        set: (reference, data, opts) => mutations.push(() => documents.set(reference.path, opts?.merge ? { ...documents.get(reference.path), ...data } : data)),
        update: (reference, data) => mutations.push(() => documents.set(reference.path, { ...documents.get(reference.path), ...data })),
        create: (reference, data) => mutations.push(() => { assert.ok(!documents.has(reference.path)); documents.set(reference.path, data); }),
        delete: (reference) => mutations.push(() => documents.delete(reference.path)),
      };
      const value = await fn(tx);
      mutations.forEach((mutate) => mutate());
      return value;
    });
    tail = result.catch(() => {});
    return result;
  };
  return { db, documents };
}
function backendHarness() {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  class Timestamp {
    constructor(ms) { this.ms = ms; }
    static now() { return new Timestamp(Date.now()); }
    static fromMillis(ms) { return new Timestamp(ms); }
    toMillis() { return this.ms; }
  }
  const { db, documents } = memoryDb();
  const adapters = {
    'firebase-functions/v2/core': { onInit() {} },
    'firebase-functions/v2/firestore': { onDocumentCreated: (_o, fn) => fn },
    'firebase-functions/v2/https': { HttpsError, onCall: (_o, fn) => fn },
    'firebase-functions/logger': { info() {}, warn() {}, error() {} },
    'google-auth-library': { GoogleAuth: class {} },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: {}, AggregateField: {}, Timestamp },
  };
  const context = vm.createContext({
    Buffer, URL, console, process: { env: {} }, exports: {}, mockDb: db,
    require(name) {
      if (name === './tenantDomains.cjs') return policy;
      if (name === 'node:crypto') return require(name);
      assert.ok(adapters[name], name); return adapters[name];
    },
  });
  vm.runInContext(read('firebase-share-backend/functions/index.js'), context);
  vm.runInContext('db = mockDb;', context);
  const api = vm.runInContext(`({ requireAllowedConfiguratorOrigin,
    requireSavedConfigurationScope, userSavedItemsCollection, requireUserCartScope,
    userShoppingCartItemsCollection, configuratorAnalyticsScopeForRequest,
    requireTenantDashboardOwner, ensureFirebaseAuthorizedDomain, withTenantAuthDomainLock,
    tenantDashboardViewFromSnapshot })`, context);
  return { api, context, documents };
}

for (const [locale, root] of Object.entries(policy.TENANT_DOMAIN_ROOTS)) {
  test(`${root}: aliases preserve canonical identity and locale for all ten configurators`, () => {
    const hostname = `acme.${root}`;
    assert.equal(getTenantSlugForHostname(hostname), 'acme');
    assert.equal(getLocaleForHostname(hostname), locale);
    assert.equal(policy.tenantDomainContext(hostname).canonicalDomain, hosts[0]);
    for (const [targetLocale, targetRoot] of Object.entries(policy.TENANT_DOMAIN_ROOTS)) {
      for (const product of Object.keys(TENANT_CONFIGURATORS)) {
        const target = new URL(getLocalizedConfiguratorUrl(targetLocale, product,
          new URL(`https://${hostname}/${product}-configurator/?x=1#savedConfig=my-save`)));
        assert.equal(target.hostname, `acme.${targetRoot}`);
        assert.equal(target.pathname, CONFIGURATOR_PUBLIC_PATHS[targetLocale][product]);
        assert.equal(target.search, '?x=1');
        assert.equal(target.hash, '#savedConfig=my-save');
      }
    }
  });
}
test('reserved names, nested names, suffix lookalikes and malformed origins fail closed', () => {
  for (const root of Object.values(policy.TENANT_DOMAIN_ROOTS)) {
    for (const name of [...policy.RESERVED_TENANT_SLUGS, 'nested.acme', '-acme', 'acme-', 'a'.repeat(41)]) {
      assert.equal(policy.tenantDomainContext(`${name}.${root}`), null);
    }
    assert.equal(policy.tenantDomainContext(root), null);
    assert.equal(policy.tenantDomainContext(`acme.${root}.evil.test`), null);
  }
  for (const origin of ['https://acme.360configurator.ro:444', 'http://acme.360configurator.ro',
    'https://user@acme.360configurator.ro', 'https://acme.360configurator.ro/path',
    'https://acme.360configurator.ro?x=1', 'null']) assert.equal(policy.tenantOriginContext(origin), null);
  assert.equal(policy.tenantDomainContext('ACME.360CONFIGURATOR.RO.').slug, 'acme');
  assert.equal(policy.tenantRecordMatchesHost({ domain: 'other.360configurator.com', domains: hosts }, hosts[1]), false);
});
test('backend deployment copies match browser domain policy', async () => {
  const cjs = require('../../firebase-share-backend/functions/tenantDomains.cjs');
  const solar = await import('../../solar-google-api/src/tenantDomains.mjs');
  for (const host of [...hosts, 'bad.360configurator.de', 'www.360configurator.ro', 'nested.acme.360configurator.com']) {
    assert.deepEqual(cjs.tenantDomainContext(host), policy.tenantDomainContext(host));
    assert.deepEqual(solar.tenantDomainContext(host), policy.tenantDomainContext(host));
  }
});
test('public canonical paths remain localized; public URLs never become tenants', () => {
  assert.equal(new URL(getLocalizedConfiguratorUrl('ro-RO', 'roof', new URL('https://www.360configurator.com/'))).pathname, '/configurator-acoperis/');
  assert.equal(new URL(getLocalizedConfiguratorUrl('de-DE', 'roof', new URL('https://www.360configurator.ro/'))).hostname, 'www.360konfigurator.de');
});
test('save, cart and analytics scopes are identical across aliases, isolated across tenants', async () => {
  const { api, documents } = backendHarness();
  documents.set('/tenants/acme', tenant());
  const scopes = [];
  for (const origin of origins) {
    const save = await api.requireSavedConfigurationScope(request(origin), 'roof');
    const cart = await api.requireUserCartScope(request(origin));
    const analytics = await api.configuratorAnalyticsScopeForRequest(request(origin), 'roof');
    assert.equal(analytics.scopeId, 'tenant--acme');
    assert.equal(await api.requireAllowedConfiguratorOrigin(origin), origin);
    scopes.push([api.userSavedItemsCollection('owner', 'roof', save.tenantSlug).path,
      api.userShoppingCartItemsCollection('owner', 'roof', cart.tenantSlug).path]);
  }
  assert.deepEqual(scopes[0], scopes[1]); assert.deepEqual(scopes[1], scopes[2]);
  documents.set('/tenants/other', { ...tenant(), slug: 'other', domain: 'other.360configurator.com' });
  const other = await api.requireSavedConfigurationScope(request('https://other.360configurator.ro'), 'roof');
  assert.notEqual(api.userSavedItemsCollection('owner', 'roof', other.tenantSlug).path, scopes[0][0]);
  for (const origin of ['https://www.360configurator.com', 'https://www.360configurator.ro', 'https://www.360konfigurator.de']) {
    assert.equal((await api.requireSavedConfigurationScope(request(origin), 'roof')).tenantSlug, '');
    assert.equal((await api.configuratorAnalyticsScopeForRequest(request(origin), 'roof')).scopeId, 'platform');
  }
});
test('suspension, missing identity and disabled products block all tenant aliases', async () => {
  for (const data of [undefined, { ...tenant(), status: 'suspended' }, { ...tenant(), domain: 'other.360configurator.com' }]) {
    const { api, documents } = backendHarness();
    if (data) documents.set('/tenants/acme', data);
    for (const origin of origins) {
      for (const run of [() => api.requireAllowedConfiguratorOrigin(origin),
        () => api.requireSavedConfigurationScope(request(origin), 'roof'),
        () => api.requireUserCartScope(request(origin)),
        () => api.configuratorAnalyticsScopeForRequest(request(origin), 'roof')]) {
        await assert.rejects(run, { code: 'permission-denied' });
      }
    }
  }
  const { api, documents } = backendHarness(); documents.set('/tenants/acme', tenant());
  for (const origin of origins) await assert.rejects(() => api.requireSavedConfigurationScope(request(origin), 'chair'), { code: 'permission-denied' });
});
test('dashboard ownership binds once on a verified alias and still requires the same UID everywhere', async () => {
  const { api, documents } = backendHarness();
  documents.set('/tenants/acme', { ...tenant(), ownerUid: '' });
  const owner = await api.requireTenantDashboardOwner(request(origins[1]));
  assert.equal(owner.slug, 'acme'); assert.equal(documents.get('/tenants/acme').ownerUid, 'owner');
  assert.equal([...documents.keys()].filter((path) => path.startsWith('/tenantAuditLogs/')).length, 1);
  for (const origin of origins) {
    await api.requireTenantDashboardOwner(request(origin));
    await assert.rejects(() => api.requireTenantDashboardOwner(request(origin, 'stranger')), { code: 'permission-denied' });
  }
  documents.get('/tenants/acme').status = 'suspended';
  await api.requireTenantDashboardOwner(request(origins[2])); // Owner can manage a suspended account.
  assert.equal([...documents.keys()].filter((path) => path.startsWith('/tenantAuditLogs/')).length, 1);
});
test('Auth provisioning merges all three domains once and cooperates with the migration lock', async () => {
  const { api, context, documents } = backendHarness();
  let config = { authorizedDomains: ['www.360configurator.com', 'legacy.example.test'] };
  let writes = 0;
  context.mockConfigRequest = async ({ method, body } = {}) => {
    if (method === 'PATCH') { writes += 1; config = plain(body); }
    return config;
  };
  vm.runInContext('identityToolkitConfigRequest = mockConfigRequest;', context);
  assert.equal(await api.ensureFirebaseAuthorizedDomain(hosts[0]), true);
  assert.ok([...hosts, 'legacy.example.test'].every((domain) => config.authorizedDomains.includes(domain)));
  assert.equal(writes, 1);
  assert.equal(await api.ensureFirebaseAuthorizedDomain(hosts[0]), false);
  assert.equal(writes, 1);
  const lock = '/tenantProvisioningSystem/authDomainLock';
  assert.equal(documents.has(lock), false);
  documents.set(lock, { owner: 'migration', expiresAt: { toMillis: () => Date.now() + 120_000 } });
  await assert.rejects(() => api.ensureFirebaseAuthorizedDomain(hosts[0]), { code: 'aborted' });
  assert.equal(documents.get(lock).owner, 'migration');
});
test('Auth update failures release owned lease and do not clear existing domains', async () => {
  const { api, context, documents } = backendHarness();
  context.mockConfigRequest = async () => { throw new Error('simulated provider outage'); };
  vm.runInContext('identityToolkitConfigRequest = mockConfigRequest;', context);
  await assert.rejects(() => api.ensureFirebaseAuthorizedDomain(hosts[0]), /provider outage/);
  assert.equal(documents.has('/tenantProvisioningSystem/authDomainLock'), false);
  await assert.rejects(() => api.ensureFirebaseAuthorizedDomain('unknown.evil.test'));
});
test('Solar aliases use one shared monthly quota and reject cross-tenant origins', async () => {
  const { db, documents } = memoryDb();
  documents.set('/tenants/acme', tenant());
  const context = vm.createContext({ ...policy, Firestore: class { constructor() { return db; } }, process: { env: {} }, URL });
  const source = read('solar-google-api/src/tenantUsage.mjs').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const api = vm.runInContext('({resolveSolarRequestContext, consumeTenantSolarMetric})', context);
  const contexts = [];
  for (const origin of origins) {
    const req = new Request(`${origin}/api/solar/google-solar`);
    contexts.push(await api.resolveSolarRequestContext(req));
    assert.equal(contexts.at(-1).tenantSlug, 'acme');
  }
  await api.consumeTenantSolarMetric(contexts[0], 'dataLayers');
  await api.consumeTenantSolarMetric(contexts[1], 'dataLayers');
  await assert.rejects(() => api.consumeTenantSolarMetric(contexts[2], 'dataLayers'), { status: 429 });
  assert.equal([...documents.keys()].filter((path) => path.startsWith('/tenantUsage/')).length, 1);
  assert.equal(await api.resolveSolarRequestContext(new Request(`${origins[1]}/api/solar/pvgis`, { headers: { Origin: 'https://other.360configurator.ro' } })), null);
  assert.equal(await api.resolveSolarRequestContext(new Request('https://www.360configurator.ro/api/solar/pvgis', { headers: { Origin: origins[1] } })), null);
  for (const host of ['www.360configurator.com', 'www.360configurator.ro', 'www.360konfigurator.de']) {
    assert.equal((await api.resolveSolarRequestContext(new Request(`https://${host}/api/solar/pvgis`))).kind, 'platform');
  }
});

function migrationHarness({ status = 'active', domain = hosts[0], duplicateDomains = false } = {}) {
  let config = { authorizedDomains: duplicateDomains ? [hosts[0], hosts[0], hosts[0], 'legacy.test'] : [hosts[0], 'legacy.test'] };
  let lock = null;
  const calls = [];
  const document = {
    name: 'projects/configurator-360/databases/(default)/documents/tenants/acme', updateTime: '2026-09-01T00:00:00Z',
    fields: { slug: { stringValue: 'acme' }, status: { stringValue: status }, plan: { stringValue: 'go_live_now' }, ...(domain ? { domain: { stringValue: domain } } : {}) },
  };
  const call = async (url, opts = {}) => {
    const parsed = new URL(url); calls.push({ url: parsed, ...opts });
    const method = opts.method || 'GET';
    if (parsed.hostname === 'identitytoolkit.googleapis.com') {
      if (method === 'PATCH') config = opts.body;
      return plain(config);
    }
    if (parsed.pathname.endsWith('/authDomainLock')) {
      if (method === 'PATCH') { assert.equal(lock, null); assert.equal(parsed.searchParams.get('currentDocument.exists'), 'false'); lock = { ...opts.body, updateTime: 'lock-version' }; }
      if (method === 'DELETE') { assert.equal(parsed.searchParams.get('currentDocument.updateTime'), 'lock-version'); lock = null; }
      return lock;
    }
    if (parsed.pathname.endsWith('/tenants')) return { documents: [document] };
    assert.ok(parsed.pathname.endsWith('/tenants/acme'));
    if (method === 'PATCH') {
      assert.equal(parsed.searchParams.get('currentDocument.updateTime'), document.updateTime);
      assert.ok(!Object.keys(opts.body.fields).some((key) => ['status', 'ownerUid', 'configurators', 'subscription', 'planId'].includes(key)));
      assert.deepEqual(parsed.searchParams.getAll('updateMask.fieldPaths').sort(), Object.keys(opts.body.fields).sort());
    }
    return document;
  };
  return { call, calls, config: () => config, locked: () => Boolean(lock) };
}
for (const status of ['active', 'suspended']) {
  test(`migration backfills ${status} legacy tenant with conditional field-only writes`, async () => {
    const harness = migrationHarness({ status, domain: '', duplicateDomains: true });
    await migrateTenantDomains({ args: ['acme'], request: harness.call, log() {} });
    assert.ok([...hosts, 'legacy.test'].every((value) => harness.config().authorizedDomains.includes(value)));
    assert.equal(harness.locked(), false);
    const before = harness.calls.filter((call) => call.url.hostname === 'identitytoolkit.googleapis.com' && call.method === 'PATCH').length;
    await migrateTenantDomains({ args: ['acme'], request: harness.call, log() {} });
    assert.equal(harness.calls.filter((call) => call.url.hostname === 'identitytoolkit.googleapis.com' && call.method === 'PATCH').length, before);
  });
}
test('migration dry run makes no writes and bad tenant ownership is rejected before Auth access', async () => {
  const harness = migrationHarness();
  await migrateTenantDomains({ args: ['--all', '--dry-run'], request: harness.call, log() {} });
  assert.ok(harness.calls.every((call) => !call.method));
  const bad = migrationHarness({ domain: 'other.360configurator.com' });
  await assert.rejects(() => migrateTenantDomains({ args: ['acme'], request: bad.call, log() {} }), /valid Go Live Now identity/);
  assert.equal(bad.calls.length, 1);
});

test('cart editing and share transport preserve the customer when changing domains', async () => {
  const current = new URL(`${origins[0]}/roof-configurator/`);
  const context = vm.createContext({ URL, URLSearchParams, window: { location: current }, getTenantSlugForHostname, getLocaleForHostname, getLocalizedConfiguratorUrl });
  // Evaluate the actual shell methods with inert imported dependencies. We do
  // not instantiate the renderer or call authentication in this offline test.
  const source = read('shared-ui/src/standaloneShell.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const proto = vm.runInContext('StandaloneConfiguratorShell.prototype', context);
  const target = new URL(proto.buildCartEditTarget.call({}, 'roof', 'item-1', `${origins[2]}/roof-configurator/`));
  assert.equal(target.hostname, hosts[2]);
  assert.equal(target.pathname, '/dach-konfigurator/');
  assert.equal(target.hash, '#cartProduct=roof&cartItem=item-1');
  for (const [locale, root] of Object.entries(policy.TENANT_DOMAIN_ROOTS)) {
    for (const product of Object.keys(TENANT_CONFIGURATORS)) {
      const edit = new URL(proto.buildCartEditTarget.call({}, product, 'item-1',
        `https://acme.${root}/solar-configurator/?old=1#s=old-share`));
      assert.equal(edit.hostname, `acme.${root}`);
      assert.equal(edit.pathname, CONFIGURATOR_PUBLIC_PATHS[locale][product]);
      assert.equal(edit.search, '');
      assert.equal(edit.hash, `#cartProduct=${product}&cartItem=item-1`);
    }
  }
  assert.equal(proto.buildCartEditTarget.call({}, 'roof', 'item-1', 'https://other.360configurator.ro/'), null);
  const share = new URL(await proto.buildSharedDomainTarget.call({ productId: 'roof', options: { callbacks: {
    getShareUrl: () => 'https://www.360configurator.com/roof-configurator/#s=test-snapshot',
  } } }, 'ro-RO'));
  assert.equal(share.hostname, hosts[1]);
  assert.equal(share.pathname, '/configurator-acoperis/');
  assert.equal(share.hash, '#s=test-snapshot');
});
