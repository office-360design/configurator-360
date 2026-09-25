const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/editor-fixture', route => route.fulfill({ contentType: 'text/html', body: '<link rel="stylesheet" href="/roof-configurator/layout-editor.css"><body></body>' }));
  await page.goto('http://127.0.0.1:8080/editor-fixture');
  await page.evaluate(async () => {
    const { RoofLayoutEditor } = await import('/roof-configurator/js/layoutEditor.js?v=layout-11');
    window.editor = new RoofLayoutEditor({ pitch: 30 }, () => {});
    window.editor.open();
  });
  const action = name => page.locator(`[data-action="${name}"]`);
  const checkBounds = async () => {
    const result = await page.evaluate(() => {
      const dialog = document.querySelector('dialog');
      return { fits: dialog.scrollWidth <= dialog.clientWidth + 1, footer: dialog.querySelector('footer').getBoundingClientRect().bottom <= innerHeight };
    });
    assert.deepEqual(result, { fits: true, footer: true });
  };
  await checkBounds();
  const drawing = await page.locator('.layout-drawing').boundingBox();
  for (const name of ['undo', 'redo', 'fit', 'zoomIn', 'zoomOut']) {
    const box = await action(name).boundingBox();
    assert.ok(box.x >= drawing.x && box.y >= drawing.y && box.y < drawing.y + 60);
  }
  assert.ok(await action('undo').isDisabled());
  await action('zoomIn').click();
  const zoomed = await page.evaluate(() => window.editor.span);
  await action('zoomOut').click();
  assert.ok(await page.evaluate(() => window.editor.span) > zoomed);
  await action('fit').click();
  await page.locator('#layoutPointSelect').selectOption('0');
  await page.locator('#layoutH').fill('1');
  await action('point').click();
  await action('undo').click();
  await action('redo').click();
  assert.equal(await page.evaluate(() => window.editor.layout.vertices[0].h), 1);
  await page.getByRole('button', { name: 'Coordinates help', exact: true }).focus();
  assert.equal(await page.locator('.layout-tip:popover-open').count(), 1);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('dialog').isVisible());
  assert.ok((await page.locator('.layout-mode-hint').boundingBox()).y < 850);
  await page.getByRole('button', { name: 'Coordinates help', exact: true }).click();
  assert.equal(await page.locator('.layout-tip:popover-open').count(), 1);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/roof-editor-desktop.png' });
  for (const viewport of [{ width: 1024, height: 768 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport);
    await checkBounds();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await checkBounds();
  await page.screenshot({ path: '/tmp/roof-editor-mobile.png' });
  await page.locator('.layout-setup summary').click();
  await page.locator('#layoutExample').selectOption('lshape');
  await action('example').click();
  assert.match(await page.locator('.layout-summary').textContent(), /6 surfaces/);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS editor desktop/mobile layout, zoom, history, help and examples');
})().catch(error => { console.error(error); process.exit(1); });
