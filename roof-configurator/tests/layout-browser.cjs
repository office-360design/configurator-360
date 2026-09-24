const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOF_TEST_BROWSER || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.ROOF_TEST_THREE) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => {
      const path = route.request().url().split('three@0.169.0/')[1];
      return route.fulfill({ path: require('node:path').join(process.env.ROOF_TEST_THREE, path), contentType: 'text/javascript' });
    });
  }
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  await page.goto('http://127.0.0.1:8080/roof-configurator/?profile', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API, { timeout: 30000 });
  await page.locator('[data-roof-type="layout"]').click();
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutExample').selectOption('hip');
  await page.locator('.roof-layout-dialog [data-action="example"]').click();
  await page.screenshot({ path: '/tmp/roof-layout-desktop.png' });
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  const saved = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(saved.roofType, 'layout');
  assert.equal(saved.roofLayout.faces.length, 4);
  await page.screenshot({ path: '/tmp/roof-layout-3d.png' });
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutExample').selectOption('saw');
  await page.locator('.roof-layout-dialog [data-action="example"]').click();
  await page.locator('.roof-layout-dialog [data-action="undo"]').click();
  assert.match(await page.locator('.layout-summary').textContent(), /4 surfaces/);
  await page.locator('.roof-layout-dialog [data-action="redo"]').click();
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  const saw = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(saw.roofLayout.faces.length, 4);
  assert.equal(await page.evaluate(s => window.ROOF_CONFIGURATOR_API.restoreState(s), saved), true);
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout), saved.roofLayout);
  const invalid = structuredClone(saved);
  invalid.roofLayout.vertices[0].x = null;
  assert.equal(await page.evaluate(s => window.ROOF_CONFIGURATOR_API.restoreState(s), invalid), false);
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout), saved.roofLayout);
  await page.locator('#editRoofLayout').click();
  await page.locator('.roof-layout-dialog [data-action="draw"]').click();
  const svg = page.locator('.layout-drawing svg');
  const clickAt = async (x, y) => {
    const p = await svg.evaluate((el, p) => {
      const v = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
      return { x: v.x, y: v.y };
    }, { x, y });
    await page.mouse.click(p.x, p.y);
  };
  for (const p of [[220, 180], [560, 180], [560, 400], [220, 400]]) await clickAt(...p);
  await page.locator('.roof-layout-dialog [data-action="finish"]').click();
  assert.match(await page.locator('.layout-summary').textContent(), /1 surfaces/);
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout.faces.length), 1);
  await page.locator('#editRoofLayout').click();
  // Click actual projected node coordinates for selection.
  const node = await page.locator('.layout-node').first().boundingBox();
  await page.mouse.click(node.x + node.width / 2, node.y + node.height / 2);
  await page.locator('#layoutH').fill('2');
  await page.locator('.roof-layout-dialog [data-action="point"]').click();
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout.vertices[0].h), 2);
  await page.locator('#editRoofLayout').click();
  await page.locator('.roof-layout-dialog [data-action="split"]').click();
  for (const id of [0, 2]) {
    const box = await page.locator('.layout-node').nth(id).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  assert.match(await page.locator('.layout-summary').textContent(), /2 surfaces/);
  await page.locator('.roof-layout-dialog [data-action="apply"]').click();
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout.faces.length), 2);
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutExample').selectOption('hip');
  await page.locator('.roof-layout-dialog [data-action="example"]').click();
  await page.locator('.roof-layout-dialog [data-action="cancel"]').last().click();
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout.faces.length), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#editRoofLayout').click();
  await page.screenshot({ path: '/tmp/roof-layout-mobile.png' });
  assert.equal(await page.locator('.roof-layout-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.locator('.roof-layout-dialog [data-action="cancel"]').last().click();
  await page.evaluate(() => window.ROOF_CONFIGURATOR_API.resetConfiguration());
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofType), 'gable');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: desktop/mobile editor, drawing, point heights, examples, undo/redo, 3D, restore rejection, reset.');
})().catch(error => { console.error(error); process.exit(1); });
