// Google Analytics on the configurators (shared-ui/src/siteAnalytics.js), in a real browser:
// consent first, the website's property, public domains only, enumerated events only.
// Requests to Google are intercepted, so nothing reaches the real property.
// Run: node scripts/validation/site-analytics.browser.mjs
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); await stat(file); }
  catch { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const hosts = ['www.360configurator.com', 'www.360configuratore.it', 'acme.360configurator.com'];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [`--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(', ')}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let checks = 0;

async function open(host, pathname, { context } = {}) {
  context ??= await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const google = [];
  await page.route('**/api/region-defaults**', (route) => route.abort());
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => { google.push(route.request().url()); route.fulfill({ status: 204, body: '' }); });
  await page.goto(`http://${host}${pathname}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.shared-ui-host, [data-shared-shell], header'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { page, context, google };
}
const banner = (page) => page.locator('.site-analytics-consent');
const dataLayerEvents = (page) => page.evaluate(() => (window.dataLayer || []).map((entry) => Array.from(entry)).filter((args) => args[0] === 'event').map((args) => [args[1], args[2]?.product]));

try {
  // 1. Public domain, no choice yet: the banner shows, nothing is loaded from Google.
  let { page, context, google } = await open('www.360configurator.com', '/roof-configurator/');
  assert.equal(await banner(page).count(), 1, 'banner on a first visit');
  assert.equal(google.length, 0, 'nothing loads before consent');
  assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
  checks += 3;

  // 2. Allow: GA loads with the website's property and sends the configurator view.
  await banner(page).locator('[data-consent="granted"]').click();
  await page.waitForTimeout(500);
  assert.equal(await banner(page).count(), 0);
  assert.ok(google.some((url) => url.includes('gtag/js?id=G-2E433G5VM7')), 'gtag script requested');
  assert.deepEqual((await dataLayerEvents(page)).find(([name]) => name === 'configurator_view'), ['configurator_view', 'roof']);
  checks += 3;

  // 3. A shared choice on the same domain: next page loads GA without asking again.
  ({ page, google } = await open('www.360configurator.com', '/roof-configurator/', { context }));
  assert.equal(await banner(page).count(), 0, 'no banner once decided');
  assert.ok(google.some((url) => url.includes('G-2E433G5VM7')));
  // Only the enumerated event and the product id go out (share copies a link).
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-action="share"]').first().click().catch(() => {});
  await page.waitForTimeout(400);
  for (const [, args] of (await page.evaluate(() => (window.dataLayer || []).map((entry) => Array.from(entry)).filter((a) => a[0] === 'event').map((a) => [a[1], a[2]])))) {
    assert.deepEqual(Object.keys(args).sort(), ['language', 'page_type', 'product'], 'only enumerated parameters');
  }
  checks += 3;

  // 4. Settings › Cookies › Manage reopens the choice; refusing withdraws consent.
  await page.evaluate(() => document.querySelector('[data-action="cookies-placeholder"]')?.click());
  await page.waitForTimeout(200);
  assert.equal(await banner(page).count(), 1, 'cookies settings reopen the banner');
  await banner(page).locator('[data-consent="denied"]').click();
  assert.equal(await page.evaluate(() => window['ga-disable-G-2E433G5VM7']), true);
  await context.close();
  checks += 2;

  // 5. Refused on a country domain: no banner on the next visit and nothing loads.
  ({ page, context, google } = await open('www.360configuratore.it', '/roof-configurator/'));
  const italian = await banner(page).locator('h2').textContent().catch(() => '');
  await banner(page).locator('[data-consent="denied"]').click();
  ({ page, google } = await open('www.360configuratore.it', '/roof-configurator/', { context }));
  assert.equal(await banner(page).count(), 0);
  assert.equal(google.length, 0, 'nothing loads after a refusal');
  await context.close();
  checks += 2;

  // 6. Never on a customer host, in the website's embedded preview, or on an internal test visit.
  for (const [host, pathname] of [['acme.360configurator.com', '/roof-configurator/'], ['www.360configurator.com', '/roof-configurator/?embed=preview'], ['www.360configurator.com', '/roof-configurator/?360_test=1']]) {
    ({ page, context, google } = await open(host, pathname));
    assert.equal(await banner(page).count(), 0, `${host}${pathname}: no banner`);
    assert.equal(google.length, 0, `${host}${pathname}: nothing loads`);
    await context.close();
    checks += 2;
  }
  console.log(`site analytics browser check passed: ${checks} checks (Italian banner: "${italian}").`);
} finally {
  await browser.close();
  server.close();
}
