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
  const saved = await page.evaluate(async () => {
    const { alignmentFixture } = await import('../roof-configurator/tests/alignment-fixture.mjs');
    const { layout } = alignmentFixture();
    const api = window.ROOF_CONFIGURATOR_API;
    const state = { ...api.captureState(), roofType: 'layout', roofLayout: layout };
    api.restoreState(state);
    return state;
  });
  const editor = page.locator('.roof-layout-dialog');
  const button = action => editor.locator(`[data-action="${action}"]`);
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('12');
  await button('meet').click();
  // Pick the target on the plan, rather than requiring the surface dropdown.
  await editor.locator('polygon.layout-face[data-face="0"]').click({ position: { x: 60, y: 20 } });
  assert.equal(await page.locator('#meetTarget').inputValue(), '0');
  assert.ok(await page.locator('#meetPreview').isVisible());
  assert.match(await page.locator('#meetResult').textContent(), /height 0.750 m/);
  await page.locator('#meetMode').selectOption('height');
  assert.ok(await button('applyMeet').isDisabled());
  await page.locator('#meetDirection').selectOption('3');
  assert.match(await page.locator('#meetResult').textContent(), /Z 1.667 m, height 1.000 m/);
  assert.ok(await editor.locator('.layout-meet-ghost').isVisible());
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout), saved.roofLayout);
  await page.screenshot({ path: '/tmp/roof-alignment-preview.png' });
  await page.locator('#meetHeight').fill('10');
  assert.ok(await button('applyMeet').isDisabled());
  assert.equal(await editor.locator('.layout-meet-ghost').count(), 0);
  await page.locator('#meetHeight').fill('1');
  await button('applyMeet').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 13);
  await button('undo').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 14);
  await button('redo').click();
  await button('apply').click();
  const aligned = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(aligned.roofLayout.planLinks, undefined);
  const point = aligned.roofLayout.vertices.find(p => p.x === 8 && Math.abs(p.z - 5 / 3) < 1e-8);
  assert.equal(point.h, 1);
  assert.equal(await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), aligned), true);
  await page.screenshot({ path: '/tmp/roof-alignment-result.png' });
  console.log('PASS: target picking, both previews, invalid move, reconnection, undo/redo and save/restore');
  await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('12');
  await button('meet').click();
  await page.locator('#meetTarget').selectOption('0');
  assert.ok(await page.locator('#meetPreview').isVisible());
  assert.equal(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.screenshot({ path: '/tmp/roof-alignment-mobile.png' });
  await button('cancelMeet').click();
  await button('apply').click();
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout), saved.roofLayout);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: mobile preview and cancellation preserve the original draft');
})().catch(error => { console.error(error); process.exit(1); });
