const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.ROOF_TEST_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  if (process.env.ROOF_TEST_THREE) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => route.fulfill({
      path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('three@0.169.0/')[1]),
      contentType: 'text/javascript',
    }));
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API);


  await page.locator('#editRoofLayout').click();
  await page.locator('[data-action="dormer"]').click();
  await page.locator('#dormerWidth').fill('1.8');
  await page.locator('#dormerRise').fill('0.6');
  await page.locator('#dormerZ').fill('-2.8');
  assert.ok(await page.locator('[data-action="applyDormer"]').isEnabled());
  await page.locator('[data-action="applyDormer"]').click();
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  const state = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(state.roofType, 'layout');
  assert.ok(state.roofLayout.planLinks.length >= 3);
  await page.screenshot({ path: '/tmp/dormer-render.png' });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS dormer from a preset, applying geometry and 3D rendering');
})().catch(error => { console.error(error); process.exit(1); });
