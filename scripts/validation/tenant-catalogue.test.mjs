import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import { TENANT_CONFIGURATORS } from '../../shared-ui/src/tenantBootstrap.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const products = ['window', 'pergola', 'roof', 'solar', 'hall', 'fence', 'cardbox', 'tiles', 'chair', 'bookshelf'];
const additions = ['tiles', 'cardbox', 'chair', 'bookshelf'];
const sorted = (items) => Array.from(items).sort();
const plain = (value) => JSON.parse(JSON.stringify(value));
const functionsSource = read('firebase-share-backend/functions/index.js');

// Execute the real backend module with inert Firebase adapters: no credentials,
// network or production database is used by these regression tests.
function backendHarness() {
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  class Timestamp {
    constructor(ms) { this.ms = ms; }
    static now() { return new Timestamp(Date.now()); }
    static fromMillis(ms) { return new Timestamp(ms); }
    toMillis() { return this.ms; }
  }
  const documents = new Map();
  const reference = (path = '') => ({
    path,
    collection: (name) => reference(`${path}/${name}`),
    doc: (id) => reference(`${path}/${id}`),
    get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }),
  });
  const mockDb = reference();
  const adapters = {
    'firebase-functions/v2/core': { onInit() {} },
    'firebase-functions/v2/firestore': { onDocumentCreated: (_options, handler) => handler },
    'firebase-functions/v2/https': { HttpsError, onCall: (_options, handler) => handler },
    'firebase-functions/logger': { info() {}, warn() {}, error() {} },
    'google-auth-library': { GoogleAuth: class {} },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth() {} },
    'firebase-admin/firestore': { getFirestore: () => mockDb, FieldValue: {}, AggregateField: {}, Timestamp },
  };
  const require = createRequire(import.meta.url);
  const context = vm.createContext({
    Buffer, URL, console, process: { env: {} }, exports: {}, mockDb,
    require(name) {
      if (name === 'node:crypto') return require(name);
      assert.ok(adapters[name], `Unexpected backend dependency: ${name}`);
      return adapters[name];
    },
  });
  vm.runInContext(functionsSource, context, { filename: 'firebase-functions/index.js' });
  vm.runInContext('db = mockDb;', context);
  const api = vm.runInContext(`({
    ALLOWED_PRODUCTS, TENANT_PLAN_CATALOG, normalizedTenantConfigurators,
    validateConfiguratorsForPlan, inferredTenantPlanId, publicTenantPlanCatalog,
    createTenantPendingPlanChange, normalizedConfiguratorAnalytics,
    validateConfiguratorAnalyticsProduct, configuratorAnalyticsScopeForRequest,
    validateSavedConfigurationPayload, validateSharePayload,
    requireSavedConfigurationScope, userSavedItemsCollection,
  })`, context);
  return { api, documents };
}

function bootstrapHarness({ hostname = 'acme.360configurator.com', fields = {}, status = 200 } = {}) {
  const elements = [];
  let requests = 0;
  const node = () => ({ dataset: {}, classList: { add() {} }, append(value) { elements.push(value); } });
  const document = { documentElement: node(), head: node(), body: node(), createElement: node };
  const context = vm.createContext({
    document, location: { hostname }, URL,
    fetch: async () => {
      requests += 1;
      return { ok: status === 200, status, json: async () => ({ fields }) };
    },
  });
  const source = read('shared-ui/src/tenantBootstrap.js').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const api = vm.runInContext('({ requireTenantConfiguratorAccess, resolveTenantContext })', context);
  return { api, document, elements, requests: () => requests };
}

function publicFields(configurators, status = 'active') {
  return {
    companyName: { stringValue: 'ACME' },
    status: { stringValue: status },
    configurators: { mapValue: { fields: Object.fromEntries(
      Object.entries(configurators).map(([id, enabled]) => [id, { booleanValue: enabled }]),
    ) } },
  };
}

const enabled = Object.fromEntries(products.map((product) => [product, true]));
const request = (hostname) => ({ rawRequest: { headers: { origin: `https://${hostname}` } } });

 test('tenant registry, backend and each admin/dashboard selector contain the same ten products', () => {
  const { api } = backendHarness();
  assert.deepEqual(sorted(Object.keys(TENANT_CONFIGURATORS)), sorted(products));
  assert.deepEqual(sorted(api.ALLOWED_PRODUCTS), sorted(products));
  for (const [file, names] of [
    ['shared-ui/admin/tenant-provisioning/index.html', ['configurator', 'manageConfigurator']],
    ['shared-ui/tenant-dashboard/index.html', ['configurator']],
  ]) {
    for (const name of names) {
      const selected = [...read(file).matchAll(new RegExp(`name="${name}" value="([a-z]+)"`, 'g'))]
        .map((match) => match[1]);
      assert.deepEqual(sorted(selected), sorted(products), `${file}: ${name}`);
    }
  }
  for (const product of additions) {
    assert.equal(TENANT_CONFIGURATORS[product].path, `/${product}-configurator/`);
  }
  for (const file of ['shared-ui/src/tenantProvisioningAdmin.js', 'shared-ui/src/tenantDashboard.js']) {
    assert.match(read(file), /Object\.values\(TENANT_CONFIGURATORS\)/);
  }
});

test('all plan accepts ten products, smaller plans still enforce their limits', () => {
  const { api } = backendHarness();
  assert.equal(api.TENANT_PLAN_CATALOG.go_live_now_all.maxConfigurators, products.length);
  assert.deepEqual(plain(api.validateConfiguratorsForPlan(enabled, 'go_live_now_all')), enabled);
  assert.throws(() => api.validateConfiguratorsForPlan(enabled, 'go_live_now_3'), { code: 'failed-precondition' });
  assert.throws(() => api.validateConfiguratorsForPlan({ chair: true, tiles: true }, 'go_live_now_1'), { code: 'failed-precondition' });
  const plans = api.publicTenantPlanCatalog();
  assert.ok(plans.find((plan) => plan.id === 'go_live_now_all').features.includes('All 10 standard configurators'));
  for (const product of additions) {
    assert.equal(api.validateConfiguratorsForPlan({ [product]: true }, 'go_live_now_1')[product], true);
  }
  const pending = api.createTenantPendingPlanChange({ planId: 'go_live_now_all', configurators: enabled, actor: { uid: 'owner' } });
  assert.deepEqual(plain(pending.configurators), enabled);
});

test('legacy selections remain unchanged: adding catalogue entries does not enable products', () => {
  const { api } = backendHarness();
  const legacy = api.normalizedTenantConfigurators({ window: true, roof: true });
  assert.equal(legacy.window, true);
  assert.equal(legacy.roof, true);
  for (const product of additions) assert.equal(legacy[product], false);
  assert.equal(api.inferredTenantPlanId(legacy), 'go_live_now_3');
});

test('all four enabled configurators pass bootstrap with tenant branding and one shared fetch', async () => {
  const fixture = bootstrapHarness({ fields: publicFields(enabled) });
  for (const product of additions) {
    const tenant = await fixture.api.requireTenantConfiguratorAccess(product);
    assert.equal(tenant.companyName, 'ACME');
    assert.equal(tenant.configurators[product], true);
  }
  assert.equal(fixture.requests(), 1);
});

test('disabled, suspended and nonexistent tenants do not pass the bootstrap gate', async () => {
  for (const product of additions) {
    for (const options of [
      { fields: publicFields({ roof: true }) },
      { fields: publicFields(enabled, 'suspended') },
      { status: 404 },
    ]) {
      const fixture = bootstrapHarness(options);
      let passed = false;
      void fixture.api.requireTenantConfiguratorAccess(product).then(() => { passed = true; });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(passed, false, product);
      assert.equal(fixture.document.documentElement.dataset.tenantAccessBlocked, 'true', product);
    }
  }
  for (const hostname of ['www.360configurator.com', 'aks.360configurator.com', 'www.360configurator.ro']) {
    const fixture = bootstrapHarness({ hostname });
    assert.equal(await fixture.api.requireTenantConfiguratorAccess('bookshelf'), null);
    assert.equal(fixture.requests(), 0);
  }
});

test('renderer entry points are gated independently; bookshelf remains quotation-only', () => {
  for (const product of additions) {
    const source = read(`${product}-configurator/js/app.js`);
    const gate = source.indexOf(`await requireTenantConfiguratorAccess('${product}')`);
    assert.ok(gate >= 0, `${product} is missing its app-level gate`);
    const firstSideEffect = source.search(/document\.|new THREE\.|new ChairScene\(|mountLocationPicker\(/);
    assert.ok(firstSideEffect > gate, `${product} initializes before the entitlement gate`);
  }
  for (const product of ['bookshelf', 'cardbox']) {
    assert.match(read(`${product}-configurator/js/sharedShell.js`), new RegExp(`await requireTenantConfiguratorAccess\\('${product}'\\)`));
  }
  const bookshelfShell = read('bookshelf-configurator/js/sharedShell.js');
  assert.match(bookshelfShell, /requestBookshelfQuotation/);
  assert.match(bookshelfShell, /Ask for quotation/);
  assert.match(read('shared-ui/src/standaloneShell.js'), /quotationLabel: this\.productId === 'bookshelf' \? '' : quotationLabel/);
});

test('save and analytics backend scopes accept only enabled products on active tenants', async () => {
  const { api, documents } = backendHarness();
  documents.set('/tenants/acme', { status: 'active', domain: 'acme.360configurator.com', configurators: enabled });
  for (const product of additions) {
    assert.equal(api.validateConfiguratorAnalyticsProduct(product), product);
    api.validateSavedConfigurationPayload(product, 'Test project', '{"test":true}');
    api.validateSharePayload(product, '{"test":true}');
    assert.equal((await api.requireSavedConfigurationScope(request('acme.360configurator.com'), product)).tenantSlug, 'acme');
    assert.equal((await api.configuratorAnalyticsScopeForRequest(request('acme.360configurator.com'), product)).scopeId, 'tenant--acme');
    assert.notEqual(api.userSavedItemsCollection('owner', product, 'acme').path, api.userSavedItemsCollection('owner', product, 'other').path);
    for (const tenant of [
      { status: 'active', domain: 'acme.360configurator.com', configurators: { roof: true } },
      { status: 'suspended', domain: 'acme.360configurator.com', configurators: enabled },
    ]) {
      documents.set('/tenants/acme', tenant);
      await assert.rejects(api.requireSavedConfigurationScope(request('acme.360configurator.com'), product), { code: 'permission-denied' });
      await assert.rejects(api.configuratorAnalyticsScopeForRequest(request('acme.360configurator.com'), product), { code: 'permission-denied' });
    }
    documents.set('/tenants/acme', { status: 'active', domain: 'acme.360configurator.com', configurators: enabled });
  }
  documents.delete('/tenants/acme');
  await assert.rejects(api.requireSavedConfigurationScope(request('acme.360configurator.com'), 'bookshelf'), { code: 'permission-denied' });
  assert.equal((await api.requireSavedConfigurationScope(request('www.360configurator.com'), 'bookshelf')).tenantSlug, '');
  assert.equal((await api.configuratorAnalyticsScopeForRequest(request('www.360configurator.com'), 'tiles')).scopeId, 'platform');
});

test('analytics totals and read/create share rules cover the entire supported catalogue', () => {
  const { api } = backendHarness();
  const data = Object.fromEntries(products.map((id) => [id, { accesses: 3, logins: 2, configurationsCreated: 1 }]));
  assert.deepEqual(plain(api.normalizedConfiguratorAnalytics({ configurators: data })), data);
  const allowlists = [...read('firebase-share-backend/firestore.rules').matchAll(/\.p in \[([^\]]+)\]/g)];
  assert.equal(allowlists.length, 2);
  for (const [, list] of allowlists) {
    assert.deepEqual(sorted([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])), sorted(products));
  }
  for (const file of ['shared-ui/src/savedConfigurations.js', 'shared-ui/src/configuratorAnalytics.js']) {
    const list = read(file).match(/new Set\(\[([^\]]+)\]/)[1];
    assert.deepEqual(sorted([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])), sorted(products));
  }
});
