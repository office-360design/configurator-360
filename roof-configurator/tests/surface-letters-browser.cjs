const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOF_TEST_BROWSER || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.ROOF_TEST_THREE) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => {
      const file = route.request().url().split('three@0.169.0/')[1];
      return route.fulfill({ path: path.join(process.env.ROOF_TEST_THREE, file), contentType: 'text/javascript' });
    });
  }
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API, { timeout: 30000 });
  assert.equal(await page.locator('.intro-section').innerText(), 'Configure your roof');


  const toggle = page.locator('#surfaceLettersToggle');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await toggle.click();
  await page.waitForFunction(() => document.querySelectorAll('.roof-surface-letter').length === 2);
  assert.deepEqual(await page.locator('.roof-surface-letter').allTextContents(), ['A', 'B']);
  await toggle.click();
  assert.equal(await page.locator('.roof-surface-letter').count(), 0);
  await toggle.click();
  const saved = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(saved.showSurfaceLetters, true);
  await page.locator('[data-roof-type="hip"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.roof-surface-letter').length === 4);
  assert.deepEqual(await page.locator('.roof-surface-letter').allTextContents(), ['A', 'B', 'C', 'D']);
  await page.setViewportSize({width:390,height:844});
  if (await page.locator('#roofSidebarToggle').getAttribute('aria-expanded') === 'true') await page.locator('#roofSidebarToggle').click();
  assert.ok(await toggle.isVisible());
  await toggle.click();
  assert.equal(await page.locator('.roof-surface-letter').count(), 0);
  await page.evaluate(saved => window.ROOF_CONFIGURATOR_API.restoreState(saved), saved);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelectorAll('.roof-surface-letter').length === 2);
  await page.locator('.draw-mode-switch [data-roof-type="sketch"]').click();
  await page.locator('.slope-sketch-dialog [data-sketch="cancel"]').first().click();
  assert.ok(await toggle.isHidden());
  assert.equal(await page.locator('.roof-surface-letter').count(), 0);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS surface letter toggle, roof changes, mobile, state persistence and 2D visibility');
})().catch(error => { console.error(error); process.exit(1); });
