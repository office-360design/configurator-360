const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CAGES_TEST_BROWSER || process.env.ROOF_TEST_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  // /api/region-defaults only exists on the production server.
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/region-defaults')) errors.push(`${response.status()} ${response.url()}`); });
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
  assert.match(await page.locator('#tag .mark').textContent(), /^PM-800x2500-15$/);
  // Diaphragm wall: panel controls replace the pile section, spiral and rings.
  assert.ok(await page.locator('[data-out="T"]').isVisible());
  assert.ok(await page.locator('[data-show="circ"]').isHidden());
  assert.ok(await page.locator('[data-accordion="spiral"]').isHidden());
  assert.ok(await page.locator('[data-accordion="wall"]').isVisible());
  assert.match(await page.locator('#qty').textContent(), /Bare verticale.*Bare orizontale.*Agrafe/s);
  assert.equal(await page.locator('#sel-dv option').last().textContent(), 'Ø32');
  if (shots) await page.screenshot({ path: path.join(shots, 'cages-wall.png') });

  // Typed values are clamped to the machine limits.
  await page.locator('[data-type="pilot"]').click();
  await page.locator('[data-shape="circ"]').click();
  assert.equal(await page.locator('[data-type="pilot"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#n-D').fill('5000');
  await page.locator('#n-D').press('Enter');
  await page.locator('#n-D').blur();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#n-D').inputValue(), '1400');
  assert.equal(await page.locator('[data-out="D"]').textContent(), '1.400 mm');
  // Head bend controls and no mass limit in the tag.
  await page.locator('[data-accordion="bars"] .accordion-toggle').click();
  assert.ok(await page.locator('#c-headBend').isChecked());
  assert.doesNotMatch(await page.locator('#tag').textContent(), /limită/);
  assert.match(await page.locator('#tag').textContent(), /cap îndoit/);
  await page.locator('#n-n').fill('60');
  await page.locator('#n-n').blur();
  await page.selectOption('#sel-dl', '40');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#checks .pill.err').count(), 0);
  assert.equal(await page.evaluate(() => window.CAGES_CONFIGURATOR_API.cycleCamera()), 'head');
  await page.locator('#c-bore').check();
  // Shared 360Configurator shell: top bar and Tools.
  assert.ok(await page.locator('[data-shared-tools]').count() === 1);
  assert.ok(await page.locator('.sidebar.shared-panel-controls').isVisible());

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
