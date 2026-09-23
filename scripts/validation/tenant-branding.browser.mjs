import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CONFIGURATOR_PUBLIC_PATHS, LOCALE_HOSTS } from '../../shared-ui/src/config.js';
import { TENANT_DOMAIN_ROOTS } from '../../shared-ui/src/tenantDomains.js';

// Real shared shell / launcher / dashboard, with synthetic tenant and auth
// responses. No live customer data, Google requests or 3D renderer is involved.
const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const tenant = {
  slug: 'acme', domain: 'acme.360configurator.com', companyName: 'ACME Industries',
  status: 'active', logoUrl: 'https://acme.360configurator.com/fixture-logo.svg',
  configurators: { solar: true, roof: true }, planId: 'go_live_now_3',
  planName: 'Go Live Now 3', subscription: { status: 'active' },
  plans: [{ id: 'go_live_now_3', name: 'Go Live Now 3', maxConfigurators: 3 }],
  analytics: { month: '2026-09', currentMonth: {}, lifetime: {} }, usage: { solar: {} }, auditEvents: [],
};
const auth = `
export async function observeGoogleAuth(callback) {
  await callback(location.pathname === '/dashboard/' ? { uid: 'owner', email: 'owner@example.test' } : null);
  return () => {};
}
export async function getFirebaseIdToken() { return 'synthetic'; }
export async function signInWithGoogle() {}
export async function signOutGoogle() {}
export async function createDomainAuthHandoff() {}
export async function redeemDomainAuthHandoff() {}
export async function signInWithDomainCustomToken() {}
`;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname === 'firestore.googleapis.com') {
      const fields = {
        companyName: { stringValue: tenant.companyName }, status: { stringValue: tenant.status },
        logoUrl: { stringValue: tenant.logoUrl },
        autoOpenSingleConfigurator: { booleanValue: tenant.autoOpenSingleConfigurator === true },
        configurators: { mapValue: { fields: Object.fromEntries(
          Object.entries(tenant.configurators).map(([id, enabled]) => [id, { booleanValue: enabled }]),
        ) } },
      };
      return route.fulfill({ json: { fields }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.hostname.endsWith('.cloudfunctions.net')) {
      assert.ok(path.endsWith('/getTenantDashboard'), `Unexpected backend request: ${path}`);
      return route.fulfill({ json: { result: tenant }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const hosts = [...Object.values(TENANT_DOMAIN_ROOTS).map((host) => `acme.${host}`), ...Object.values(LOCALE_HOSTS)];
    assert.ok(hosts.includes(url.hostname), `Unexpected network destination: ${url.hostname}`);
    if (path.endsWith('/firebaseAuth.js')) return route.fulfill({ contentType: 'text/javascript', body: auth });
    if (path.endsWith('/configuratorAnalytics.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: `
        export async function recordConfiguratorAccessOnce() {}
        export async function recordConfiguratorAnalyticsEvent() {}
      ` });
    }
    if (path === '/api/region-defaults') return route.fulfill({ json: { country: 'RO' } });
    if (path === '/fixture-logo.svg') {
      const tall = url.searchParams.has('tall');
      return route.fulfill({ contentType: 'image/svg+xml', body: `
        <svg xmlns="http://www.w3.org/2000/svg" width="${tall ? 80 : 280}" height="80" viewBox="0 0 ${tall ? 80 : 280} 80">
          <rect width="100%" height="100%" rx="8" fill="#132e46"/>
          <text x="50%" y="53" text-anchor="middle" font-family="sans-serif" font-size="${tall ? 23 : 46}" font-weight="700" fill="white">ACME</text>
        </svg>` });
    }
    const appPaths = Object.values(CONFIGURATOR_PUBLIC_PATHS).flatMap(Object.values);
    if (appPaths.includes(path)) {
      const style = url.searchParams.get('style') === 'index' ? 'index' : 'standalone';
      const productId = url.searchParams.get('product') || 'solar';
      assert.match(productId, /^[a-z]+$/);
      return route.fulfill({ contentType: 'text/html', body: `
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
          <link rel="stylesheet" href="/shared-ui/styles/${style}.css?v=tenant-branding-1">
          <style>body{margin:0;background:#eef2f5}.scene-fixture{padding:90px 30px;font:20px sans-serif;color:#445564}</style>
        </head><body><main class="scene-fixture">Configurator viewport (test fixture)</main>
        <script type="module">
          import { resolveTenantContext } from '/shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';
          import { mountStandaloneConfiguratorShell } from '/shared-ui/src/standaloneShell.js?v=tenant-branding-1';
          await resolveTenantContext();
          window.shell = mountStandaloneConfiguratorShell({
            productId: '${productId}', productType: '${productId}',
            brandSrc: '/shared-ui/assets/360CONFIGURATOR.png', brandAlt: '360 Configurator',
            callbacks: { captureState: () => ({ test: true }) },
          });
        </script></body></html>` });
    }
    if (path === '/' && Object.values(LOCALE_HOSTS).includes(url.hostname)) {
      return route.fulfill({ contentType: 'text/html', body: '<h1>Public marketing site fixture</h1>' });
    }
    const aliases = { '/': 'shared-ui/tenant/index.html', '/dashboard/': 'shared-ui/tenant-dashboard/index.html' };
    const file = resolve(root, aliases[path] || path.slice(1));
    assert.ok(file.startsWith(root));
    try {
      return route.fulfill({ contentType: { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[extname(file)] || 'application/octet-stream', body: await readFile(file) });
    } catch { return route.fulfill({ status: 404, body: 'No fixture' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  async function checkBadge(host) {
    const badge = page.locator('.tenant-platform-brand');
    await badge.waitFor();
    assert.equal(await badge.count(), 1);
    assert.equal(await badge.getAttribute('href'), `https://${host}/`);
    assert.equal(await badge.getAttribute('target'), '_blank');
    assert.match(await badge.getAttribute('rel'), /noopener/);
    await page.locator('.tenant-platform-brand img').evaluate((img) => img.decode());
    assert.ok(await page.locator('.tenant-platform-brand img').evaluate((img) => img.naturalWidth > 0));
    assert.equal(await page.locator('a a').count(), 0, 'No nested links');
  }
  async function checkHeader(width) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const selectors = {
      header: '.site-header', primary: '.brand',
      badge: '.tenant-platform-brand', actions: '.site-header__actions',
      name: '.project-name-shell', nameInput: '.project-name-input',
    };
    const boxes = {};
    for (const [key, selector] of Object.entries(selectors)) {
      boxes[key] = await page.locator(selector).boundingBox();
    }
    try {
      const { header, primary, badge, actions, name, nameInput } = boxes;
      assert.ok(header && primary && badge && actions, 'Required branding and controls must stay rendered');
      assert.ok(Math.abs(header.height - 47) < 1, `Header height changed at ${width}px`);
      for (const [key, box] of Object.entries({ primary, badge, actions, name, nameInput })) {
        if (!box) continue; // Existing phone layout hides the project-name control.
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${key} offscreen at ${width}px`);
        assert.ok(box.y >= -1 && box.y + box.height <= header.height + 1, `${key} outside bar at ${width}px`);
      }
      assert.ok(primary.x + primary.width <= badge.x + 1 || primary.y + primary.height <= badge.y + 1, 'Brand marks must not overlap');
      assert.ok(primary.x + primary.width <= actions.x + 1, `Tenant logo overlaps actions at ${width}px`);
      assert.ok(badge.x + badge.width <= actions.x + 1, `Attribution overlaps actions at ${width}px`);
      if (name) {
        assert.ok(name.x >= Math.max(primary.x + primary.width, badge.x + badge.width) - 1, `Name overlaps branding at ${width}px`);
        assert.ok(name.x + name.width <= actions.x + 1, `Name overlaps actions at ${width}px`);
      }
      const badgeImage = await page.locator('.tenant-platform-brand img').boundingBox();
      const tenantImage = page.locator('.brand img');
      if (await tenantImage.count()) {
        const primaryImage = await tenantImage.boundingBox();
        assert.ok(badgeImage.height < primaryImage.height, 'Platform mark should be smaller');
      }
    } catch (error) {
      console.error('BRANDING_LAYOUT', page.url(), JSON.stringify(boxes));
      await page.screenshot({ path: resolve(artifacts, `tenant-branding-failure-${width}.png`) });
      errors.push(error.message);
    }
  }
  for (const [locale, base] of Object.entries(TENANT_DOMAIN_ROOTS)) {
    const origin = `https://acme.${base}`;
    for (const [product, path] of Object.entries(CONFIGURATOR_PUBLIC_PATHS[locale])) {
      tenant.configurators = { [product]: true };
      await page.goto(`${origin}${path}?product=${product}`);
      await page.waitForFunction(() => window.shell?.authInitialized);
      await checkBadge(LOCALE_HOSTS[locale]);
      assert.equal(await page.locator('.brand img').getAttribute('src'), tenant.logoUrl);
    }
    // This also covers direct entry from the optional single-configurator homepage.
    tenant.configurators = { solar: true };
    tenant.autoOpenSingleConfigurator = true;
    await page.goto(`${origin}/`);
    await page.waitForURL(`${origin}${CONFIGURATOR_PUBLIC_PATHS[locale].solar}`);
    await checkBadge(LOCALE_HOSTS[locale]);
    tenant.autoOpenSingleConfigurator = false;
    await page.goto(`${origin}/`);
    await checkBadge(LOCALE_HOSTS[locale]);
    if (locale === 'ro-RO') await page.screenshot({ path: resolve(artifacts, 'tenant-branding-launcher.png') });
    await page.goto(`${origin}/dashboard/`);
    await page.waitForSelector('#dashboardWorkspace:not([hidden])');
    await checkBadge(LOCALE_HOSTS[locale]);
    assert.equal(await page.locator('#headerLogo').getAttribute('src'), tenant.logoUrl);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) {
        const offenders = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).flatMap((node) => {
          const box = node.getBoundingClientRect();
          if (!box.width || !box.height || (box.right <= innerWidth + 1 && box.left >= -1)) return [];
          return [{ tag: node.tagName, id: node.id, className: node.className, x: box.x, right: box.right, width: box.width }];
        }));
        console.error('DASHBOARD_LAYOUT', width, JSON.stringify(offenders));
        await page.screenshot({ path: resolve(artifacts, `tenant-branding-dashboard-${width}.png`) });
        errors.push(`Dashboard overflow: ${width}`);
      }
    }
  }
  for (const style of ['index', 'standalone']) {
    await page.goto(`https://acme.360configurator.ro/configurator-solar/?style=${style}`);
    await page.waitForFunction(() => window.shell?.authInitialized);
    for (const authenticated of [false, true]) {
      await page.evaluate((authenticated) => {
        shell.authUser = authenticated ? { uid: 'owner', email: 'owner@example.test' } : null;
        shell.projectName = 'A deliberately long saved configuration name';
        shell.renderHost(); shell.sync();
      }, authenticated);
      for (const width of [320, 360, 375, 390, 480, 600, 760, 768, 1024, 1440]) await checkHeader(width);
    }
    await page.screenshot({ path: resolve(artifacts, `tenant-branding-header-${style}.png`) });
    await checkHeader(390);
    await page.screenshot({ path: resolve(artifacts, `tenant-branding-mobile-${style}.png`) });
    await page.evaluate(() => { shell.state.darkMode = true; shell.renderHost(); shell.sync(); });
    await checkBadge(LOCALE_HOSTS['ro-RO']);
    await checkHeader(320);
    await page.screenshot({ path: resolve(artifacts, `tenant-branding-dark-${style}.png`) });
  }
  // No custom logo: render the customer name rather than two platform logos.
  tenant.logoUrl = '';
  tenant.companyName = 'A very long customer company name '.repeat(3).trim();
  await page.goto('https://acme.360configurator.ro/configurator-solar/');
  await page.waitForFunction(() => window.shell?.authInitialized);
  await checkHeader(320);
  assert.equal(await page.locator('.brand img').count(), 0);
  assert.equal(await page.locator('.tenant-brand-name').textContent(), tenant.companyName);
  await checkBadge(LOCALE_HOSTS['ro-RO']);
  // Locale changes and host rerenders cannot remove or duplicate attribution.
  await page.evaluate(() => { shell.state.locale = 'de-DE'; shell.renderHost(); shell.sync(); });
  await checkBadge(LOCALE_HOSTS['ro-RO']);
  const previousUrl = page.url();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('.tenant-platform-brand').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), 'https://www.360configurator.ro/');
  assert.equal(page.url(), previousUrl, 'Attribution must not navigate away from the configuration');
  await popup.close();
  for (const [locale, host] of Object.entries(LOCALE_HOSTS)) {
    await page.goto(`https://${host}${CONFIGURATOR_PUBLIC_PATHS[locale].solar}`);
    await page.waitForFunction(() => window.shell?.authInitialized);
    assert.equal(await page.locator('.tenant-platform-brand').count(), 0, 'Public site must not gain duplicate branding');
    assert.equal(await page.locator('.brand img').count(), 1);
  }
  assert.deepEqual(errors, []);
  console.log('Tenant co-branding browser checks passed: 30 shared-shell routes, launcher, dashboard, mobile, dark mode and rerenders.');
} finally {
  await browser.close();
}
