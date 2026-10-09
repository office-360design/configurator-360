const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CW_TEST_BROWSER || process.env.ROOF_TEST_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // /api/region-defaults only exists on the production server.
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/region-defaults')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:8080/curtain-wall-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CURTAIN_WALL_API?.getModel(), { timeout: 30000 });
  const api = (fn, arg) => page.evaluate(fn, arg);
  const shots = process.env.CW_TEST_SHOTS;

  // Default office facade: 4 bays × 4 rows, automatic profiles, glazing table components.
  await api(() => window.CURTAIN_WALL_API.setLocale('ro-RO'));
  assert.match(await page.locator('#tag .mark').textContent(), /6\.000 × 6\.600 mm · 4 × 4/);
  assert.equal(await api(() => window.CURTAIN_WALL_API.getModel().mullion.id), '150135');
  assert.equal(await page.locator('#bayList .track').count(), 4);
  assert.ok(await page.locator('#canvasHost canvas').isVisible());
  assert.equal(await page.locator('#elevation svg .cw-member').count() > 0, true);
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-default.png') });

  // Grid editing: add a bay, change a width, switch a row to vision.
  await page.locator('[data-action="add-bay"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().S.widths.length === 5);
  await page.locator('[data-bay="0"]').fill('2000');
  await page.locator('[data-bay="0"]').press('Enter');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().W === 8000);
  await page.locator('[data-row-type="0"]').selectOption('vision');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().panes.filter(p => p.spandrel).length === 5);

  // Presets and statics.
  await page.locator('[data-preset="storefront"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().H === 3000);
  await page.locator('#n-wind').fill('2');
  await page.locator('#n-wind').press('Enter');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().S.windLoad === 2);
  const deeper = await api(() => window.CURTAIN_WALL_API.getModel().mullion.depth);
  assert.ok(deeper >= 115, `mullion depth ${deeper}`);

  // Integrated cover strip hides the separate cover plates.
  await page.locator('[data-accordion="glazing"] .accordion-toggle').click();
  await page.locator('#sel-strip').selectOption('159230');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().S.strip === '159230');
  assert.ok(await page.locator('#coverFields').isHidden());

  // Tabs: node section, materials, checks.
  await page.locator('[data-tab="node"]').click();
  assert.ok(await page.locator('#node svg .cw-profile').isVisible());
  await page.locator('[data-tab="bom"]').click();
  assert.match(await page.locator('#bom').textContent(), /Stoßverbinder/);
  await page.locator('[data-tab="checks"]').click();
  assert.match(await page.locator('#checks').textContent(), /Ucw/);
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-checks.png') });

  // Locales follow the shell; every visible label is translated.
  for (const [locale, title] of [['en-US', 'Configure the facade'], ['de-DE', 'Fassade konfigurieren'], ['ro-RO', 'Configurează fațada']]) {
    await api(l => window.CURTAIN_WALL_API.setLocale(l), locale);
    assert.equal(await page.locator('.intro-section h1').textContent(), title);
  }
  // Camera cycle through the Tools API.
  assert.equal(await api(() => window.CURTAIN_WALL_API.cycleCamera()), 'front');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await api(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-phone.png') });

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('curtain wall browser check passed');
})().catch(error => { console.error(error); process.exit(1); });
