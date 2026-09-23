import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CONFIGURATOR_PUBLIC_PATHS } from '../../shared-ui/src/config.js';
import { TENANT_DOMAIN_ROOTS } from '../../shared-ui/src/tenantDomains.js';

// All Firebase, authentication and configurator responses are synthetic.
// Actual launcher and settings pages are served from this checkout.
const root = fileURLToPath(new URL('../../', import.meta.url));
const writes = [];
const plans = [['1', 1], ['3', 3], ['all', 10]].map(([id, maxConfigurators]) => ({
  id: `go_live_now_${id}`, name: `Go Live Now ${id}`, maxConfigurators, features: [],
}));
const tenant = {
  slug: 'acme', domain: 'acme.360configurator.com', companyName: 'ACME',
  status: 'active', ownerEmail: 'owner@example.test', planId: 'go_live_now_1',
  planName: '1 configurator', configurators: { solar: true }, subscription: { status: 'active' },
  plans, analytics: { month: '2026-09', currentMonth: {}, lifetime: {} },
  usage: { solar: {} }, auditEvents: [],
};
let lookupStatus = 200;
const authModule = `
export async function getFirebaseIdToken() { return 'synthetic'; }
export async function observeGoogleAuth(callback) { await callback({ uid: 'owner', email: 'owner@example.test' }); }
export async function signInWithGoogle() {}
export async function signOutGoogle() {}
`;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const errors = [];
try {
  const context = await browser.newContext();
  const configuratorPaths = new Set(Object.values(CONFIGURATOR_PUBLIC_PATHS).flatMap(Object.values));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname === 'firestore.googleapis.com') {
      const fields = {
        companyName: { stringValue: tenant.companyName }, status: { stringValue: tenant.status },
        ...(tenant.autoOpenSingleConfigurator === undefined ? {} : {
          autoOpenSingleConfigurator: { booleanValue: tenant.autoOpenSingleConfigurator },
        }),
        configurators: { mapValue: { fields: Object.fromEntries(
          Object.entries(tenant.configurators).map(([id, enabled]) => [id, { booleanValue: enabled }]),
        ) } },
      };
      return route.fulfill({ status: lookupStatus, json: { fields }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.hostname.endsWith('.cloudfunctions.net')) {
      const name = path.split('/').pop();
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization,content-type' } });
      }
      const data = route.request().postDataJSON()?.data || {};
      let result;
      if (['updateTenantDashboard', 'updateTenant'].includes(name)) {
        writes.push({ name, data });
        assert.equal(typeof data.autoOpenSingleConfigurator, 'boolean');
        tenant.autoOpenSingleConfigurator = data.autoOpenSingleConfigurator;
        result = tenant;
      } else if (name === 'provisionTenant') {
        writes.push({ name, data });
        result = { ...tenant, ...data, domain: `${data.slug}.360configurator.com`, url: `https://${data.slug}.360configurator.com/` };
      } else {
        result = { getTenantDashboard: tenant, getTenant: tenant, getTenantPlans: { plans },
          listTenants: { tenants: [tenant] }, getPlatformAnalytics: tenant.analytics }[name];
      }
      assert.ok(result, `Unexpected backend request: ${path}`);
      return route.fulfill({ json: { result }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    assert.ok(url.hostname === 'www.360configurator.com'
      || Object.values(TENANT_DOMAIN_ROOTS).some((base) => url.hostname === `acme.${base}`),
    `Unexpected network destination: ${url.hostname}`);
    if (path.endsWith('/firebaseAuth.js')) return route.fulfill({ contentType: 'text/javascript', body: authModule });
    if (configuratorPaths.has(path)) return route.fulfill({ contentType: 'text/html', body: '<h1 id="configurator">Configurator fixture</h1>' });
    if (path === '/previous/') return route.fulfill({ contentType: 'text/html', body: '<h1 id="previous">Previous page</h1>' });
    const aliases = {
      '/': 'shared-ui/tenant/index.html', '/dashboard/': 'shared-ui/tenant-dashboard/index.html',
      '/internal/tenant-provisioning/': 'shared-ui/admin/tenant-provisioning/index.html',
    };
    const file = resolve(root, aliases[path] || path.slice(1));
    assert.ok(file.startsWith(root));
    try {
      return route.fulfill({ contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream', body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: 'No fixture' });
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [locale, base] of Object.entries(TENANT_DOMAIN_ROOTS)) {
    const origin = `https://acme.${base}`;
    delete tenant.autoOpenSingleConfigurator;
    await page.goto(`${origin}/`);
    await page.waitForSelector('.tenant-configurator');
    assert.equal(await page.locator('.tenant-configurator').count(), 1, 'Legacy tenants keep the launcher');
    tenant.autoOpenSingleConfigurator = true;
    // Covers real navigation for all 30 localized product/domain combinations.
    for (const [product, path] of Object.entries(CONFIGURATOR_PUBLIC_PATHS[locale])) {
      tenant.configurators = { [product]: true };
      const transport = '?utm_source=homepage&savedConfig=abc#domainAuthHandoff=token&cartItem=item';
      await page.goto(`${origin}/${transport}`);
      await page.waitForURL(`${origin}${path}${transport}`);
      await page.waitForSelector('#configurator');
    }
    tenant.configurators = { solar: true, roof: true };
    await page.goto(`${origin}/`);
    await page.waitForSelector('.tenant-configurator');
    assert.equal(await page.locator('.tenant-configurator').count(), 2);
    tenant.configurators = {};
    await page.reload();
    await page.waitForSelector('.tenant-empty');
    tenant.configurators = { solar: true };
    tenant.status = 'suspended';
    await page.reload();
    await page.getByRole('heading', { name: 'Configurator site unavailable' }).waitFor();
    assert.equal(page.url(), `${origin}/`);
    tenant.status = 'active';
    for (const [code, heading] of [[404, 'Configurator site not found'], [503, 'Configurator temporarily unavailable']]) {
      lookupStatus = code;
      await page.reload();
      await page.getByRole('heading', { name: heading }).waitFor();
      assert.equal(page.url(), `${origin}/`);
    }
    lookupStatus = 200;
  }
  const origin = 'https://acme.360configurator.ro';
  await page.goto(`${origin}/previous/`);
  await page.goto(`${origin}/`);
  await page.waitForURL(`${origin}/configurator-solar/`);
  await page.goBack();
  await page.waitForSelector('#previous');
  assert.equal(page.url(), `${origin}/previous/`, 'Homepage replace must not create a back-button loop');

  // A returning owner can always open the dashboard and turn this setting off.
  await page.goto(`${origin}/dashboard/`);
  await page.waitForSelector('#dashboardWorkspace:not([hidden])');
  assert.equal(await page.locator('#autoOpenSingleConfigurator').isChecked(), true);
  await page.locator('#autoOpenSingleConfigurator').uncheck();
  await page.locator('#saveButton').click();
  await page.getByText('Changes saved.', { exact: true }).waitFor();
  assert.equal(writes.at(-1).data.autoOpenSingleConfigurator, false);
  await page.goto(`${origin}/`);
  await page.waitForSelector('.tenant-configurator');
  await page.goto('https://acme.360konfigurator.de/dashboard/');
  await page.waitForSelector('#dashboardWorkspace:not([hidden])');
  assert.equal(await page.locator('#autoOpenSingleConfigurator').isChecked(), false);
  await page.locator('#autoOpenSingleConfigurator').check();
  await page.locator('#saveButton').click();
  await page.getByText('Changes saved.', { exact: true }).waitFor();
  await page.reload();
  await page.waitForSelector('#dashboardWorkspace:not([hidden])');
  assert.equal(await page.locator('#autoOpenSingleConfigurator').isChecked(), true);
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await page.locator('.homepage-fieldset').screenshot({ path: resolve(root, 'artifacts/tenant-homepage-settings.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.locator('.homepage-fieldset').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Setting should fit on mobile');
  await page.locator('.homepage-fieldset').screenshot({ path: resolve(root, 'artifacts/tenant-homepage-settings-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('https://www.360configurator.com/internal/tenant-provisioning/');
  await page.waitForSelector('#adminWorkspace:not([hidden])');
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.waitForSelector('#tenantEditorForm:not([hidden])');
  assert.equal(await page.locator('#manageAutoOpenSingleConfigurator').isChecked(), true);
  await page.locator('#manageAutoOpenSingleConfigurator').uncheck();
  await page.locator('#saveTenantButton').click();
  await page.getByText('Tenant updated successfully.', { exact: true }).waitFor();
  assert.equal(writes.at(-1).name, 'updateTenant');
  assert.equal(writes.at(-1).data.autoOpenSingleConfigurator, false);
  assert.equal(await page.locator('#createAutoOpenSingleConfigurator').isChecked(), false);
  await page.locator('#companyName').fill('New company');
  await page.locator('#slug').fill('new-company');
  await page.locator('#createPlan').selectOption('go_live_now_1');
  await page.locator('#tenantForm input[name="configurator"][value="solar"]').check();
  await page.locator('#createAutoOpenSingleConfigurator').check();
  await page.locator('#createButton').click();
  await page.getByText('Tenant created successfully.', { exact: true }).waitFor();
  assert.equal(writes.at(-1).name, 'provisionTenant');
  assert.equal(writes.at(-1).data.autoOpenSingleConfigurator, true);
  assert.deepEqual(errors, []);
  console.log('Homepage browser checks passed: 30 localized redirects, legacy/failure states, history, owner/admin settings and mobile layout.');
} finally {
  await browser.close();
}
