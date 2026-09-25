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

  const draw = await page.locator('[data-roof-type="layout"]').boundingBox();
  const gable = await page.locator('[data-roof-type="gable"]').boundingBox();
  assert.ok(draw.width >= gable.width * 2.8);
  const before = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  await page.locator('#editRoofLayout').click();
  assert.equal(await page.locator('.layout-surface-label').count(), 2);
  await page.locator('.roof-layout-dialog [data-action="cancel"]').last().click();
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState()), before);
  await page.locator('#editRoofLayout').click();
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  const after = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(after.roofType, 'layout');
  assert.equal(after.roofLayout.faces.length, 2);
  assert.ok(after.roofLayout.vertices.some(p => p.h < 0));
  await page.screenshot({path: '/tmp/preset-edit-render.png'});
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS full-width layout card, preset editor launch, cancellation and 3D conversion');
})().catch(error => { console.error(error); process.exit(1); });
