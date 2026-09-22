import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise the actual pages with synthetic Firebase responses. Nothing is sent
// to production, and no real account or tenant is created by this smoke test.
const root = fileURLToPath(new URL('../../', import.meta.url));
const products = ['window', 'pergola', 'roof', 'solar', 'hall', 'fence', 'cardbox', 'tiles', 'chair', 'bookshelf'];
const additions = ['tiles', 'cardbox', 'chair', 'bookshelf'];
const configurators = Object.fromEntries(products.map((id) => [id, additions.includes(id)]));
const metrics = Object.fromEntries(products.map((id) => [id, { accesses: 3, logins: 2, configurationsCreated: 1 }]));
const plans = [['1', 1], ['3', 3], ['all', 10]].map(([id, maxConfigurators]) => ({
  id: `go_live_now_${id}`, name: `Go Live Now ${id}`, maxConfigurators, features: [],
}));
const tenant = {
  slug: 'acme', domain: 'acme.360configurator.com', companyName: 'ACME',
  status: 'active', ownerEmail: 'owner@example.test', planId: 'go_live_now_all',
  planName: 'All configurators', configurators, subscription: { status: 'active' },
  plans, analytics: { month: '2026-09', currentMonth: metrics, lifetime: metrics },
  usage: { solar: {} }, auditEvents: [],
};
const authModule = `
export async function getFirebaseIdToken() { return 'local-test'; }
export async function observeGoogleAuth(callback) {
  await callback({ uid: 'owner', email: 'owner@example.test' });
}
export async function signInWithGoogle() {}
export async function signOutGoogle() {}
`;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const context = await browser.newContext();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/firebaseAuth.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: authModule });
    }
    if (url.hostname.endsWith('.cloudfunctions.net')) {
      const result = {
        getTenantDashboard: tenant, getTenant: tenant, getTenantPlans: { plans },
        listTenants: { tenants: [tenant] }, getPlatformAnalytics: tenant.analytics,
      }[path.split('/').pop()];
      assert.ok(result, `Unexpected backend request: ${path}`);
      return route.fulfill({ json: { result }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.hostname === 'firestore.googleapis.com') {
      const fields = {
        companyName: { stringValue: 'ACME' }, status: { stringValue: 'active' },
        configurators: { mapValue: { fields: Object.fromEntries(
          Object.entries(configurators).map(([id, enabled]) => [id, { booleanValue: enabled }]),
        ) } },
      };
      return route.fulfill({ json: { fields }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const aliases = {
      '/': 'shared-ui/tenant/index.html',
      '/dashboard/': 'shared-ui/tenant-dashboard/index.html',
      '/internal/tenant-provisioning/': 'shared-ui/admin/tenant-provisioning/index.html',
    };
    const file = resolve(root, aliases[path] || path.slice(1));
    assert.ok(file.startsWith(root), 'Unexpected asset path');
    try {
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: 'Asset not present in test fixture' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('https://acme.360configurator.com/');
  await page.waitForSelector('.tenant-configurator');
  const links = await page.locator('.tenant-configurator').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  assert.deepEqual(links.sort(), additions.map((id) => `/${id}-configurator/`).sort());

  await page.goto('https://acme.360configurator.com/dashboard/');
  await page.waitForSelector('#dashboardWorkspace:not([hidden])');
  assert.equal(await page.locator('input[name="configurator"]').count(), 10);
  assert.equal(await page.locator('input[name="configurator"]:checked').count(), 4);
  for (const body of ['monthAnalyticsBody', 'lifetimeAnalyticsBody']) {
    assert.equal(await page.locator(`#${body} tr`).count(), 4);
    for (const label of ['Cardbox', 'Pavement', 'Chair', 'Bookshelf']) {
      assert.ok((await page.locator(`#${body}`).innerText()).includes(label));
    }
  }
  assert.equal(await page.locator('#metricAccesses').innerText(), '12');
  await page.locator('#showAllAnalytics').check();
  assert.equal(await page.locator('#monthAnalyticsBody tr').count(), 10);
  assert.equal(await page.locator('#lifetimeAnalyticsBody tr').count(), 10);
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'artifacts/tenant-catalogue-dashboard.png'), fullPage: true });

  await page.goto('https://www.360configurator.com/internal/tenant-provisioning/');
  await page.waitForSelector('#adminWorkspace:not([hidden])');
  assert.equal(await page.locator('input[name="configurator"]').count(), 10);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.waitForSelector('#tenantEditorForm:not([hidden])');
  assert.equal(await page.locator('input[name="manageConfigurator"]').count(), 10);
  assert.equal(await page.locator('input[name="manageConfigurator"]:checked').count(), 4);
  for (const label of ['Cardbox', 'Pavement', 'Chair', 'Bookshelf']) {
    assert.ok((await page.locator('#tenantList').innerText()).includes(label));
  }
  assert.deepEqual(errors, []);
  console.log('Tenant catalogue browser smoke passed: launcher, dashboard, analytics and admin selectors.');
} finally {
  await browser.close();
}
