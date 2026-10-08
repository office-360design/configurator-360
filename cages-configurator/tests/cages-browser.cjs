const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CAGES_TEST_BROWSER || process.env.ROOF_TEST_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8080/cages-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CAGES_CONFIGURATOR_API?.getModel(), { timeout: 30000 });
  const shots = process.env.CAGES_TEST_SHOTS;

  // Default pile: tag, quantities, checks and section are filled in; the canvas renders.
  assert.match(await page.locator('#tag .mark').textContent(), /^PF-800-12$/);
  assert.match(await page.locator('#qty').textContent(), /Bare longitudinale/);
  assert.ok(await page.locator('#checks li').count() >= 4);
  assert.equal(await page.locator('#sectionSvg circle').count(), 1 + 12);
  assert.ok(await page.locator('#canvasHost canvas').isVisible());
  if (shots) await page.screenshot({ path: path.join(shots, 'cages-default.png') });

  // Diaphragm wall preset: rectangular section, wall limits.
  await page.locator('[data-preset="pm"]').click();
  await page.waitForFunction(() => window.CAGES_CONFIGURATOR_API.captureState().type === 'perete');
  await page.waitForTimeout(200);
  assert.match(await page.locator('#tag .mark').textContent(), /^PM-400x600-14$/);
  assert.ok(await page.locator('[data-show="drept"]').isVisible());
  assert.ok(await page.locator('[data-show="circ"]').isHidden());
  assert.equal(await page.locator('#sel-dl option').last().textContent(), 'Ø20');
  if (shots) await page.screenshot({ path: path.join(shots, 'cages-wall.png') });

  // Typed values are clamped to the machine limits.
  await page.locator('label[for="t-pilot"]').click();
  await page.locator('label[for="s-circ"]').click();
  await page.locator('#n-D').fill('5000');
  await page.locator('#n-D').press('Enter');
  await page.locator('#n-D').blur();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#n-D').inputValue(), '1400');
  // An overweight cage shows an error.
  await page.locator('#n-n').fill('60');
  await page.locator('#n-n').blur();
  await page.selectOption('#sel-dl', '40');
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#tag.over').count() === 1);
  assert.ok(await page.locator('#checks .pill.err').count() >= 1);
  // Views and overlays.
  await page.locator('[data-view="head"]').click();
  await page.locator('#c-bore').check();

  // Phone layout.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
  if (shots) await page.screenshot({ path: path.join(shots, 'cages-phone.png') });

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('cages configurator browser check passed');
})().catch(error => { console.error(error); process.exit(1); });
