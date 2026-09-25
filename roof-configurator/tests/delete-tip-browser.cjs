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
  await page.evaluate(() => {
    const api = window.ROOF_CONFIGURATOR_API;
    api.restoreState({ ...api.captureState(), roofType: 'layout', roofLayout: {
      version: 1,
      vertices: [{ x: 0, z: 0, h: 0 }, { x: 10, z: 0, h: 0 },
        { x: 10, z: 2.5, h: 1.5 }, { x: 0, z: 2.5, h: 1.5 },
        { x: 11.75, z: 1.25, h: 0.86 }],
      boundary: [0, 1, 4, 2, 3], faces: [[0, 1, 2, 3], [1, 4, 2]],
    } });
  });
  const editor = page.locator('.roof-layout-dialog');
  const button = action => editor.locator(`[data-action="${action}"]`);
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('4');
  await button('delete').click();
  assert.match(await page.locator('.layout-summary').textContent(), /1 surfaces/);
  assert.equal(await page.locator('#layoutPointSelect option').count(), 5);
  await button('undo').click();
  assert.match(await page.locator('.layout-summary').textContent(), /2 surfaces/);
  await button('redo').click();
  assert.match(await page.locator('.layout-summary').textContent(), /1 surfaces/);
  await button('apply').click();
  const state = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.deepEqual(state.roofLayout.boundary, [0, 1, 2, 3]);
  assert.equal(state.roofLayout.vertices.length, 4);
  assert.equal(state.roofLayout.faces.length, 1);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: deleting triangular perimeter tip, undo/redo and applying the roof');
})().catch(error => { console.error(error); process.exit(1); });
