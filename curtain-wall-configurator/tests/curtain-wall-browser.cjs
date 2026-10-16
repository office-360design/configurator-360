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
  await page.waitForFunction(() => window.CURTAIN_WALL_API?.getModel(), null, { timeout: 30000 });
  const api = (fn, arg) => page.evaluate(fn, arg);
  const shots = process.env.CW_TEST_SHOTS;

  // Default office facade on Cortizo TP 52: 4 bays × 4 rows, mullion from statics.
  await api(() => window.CURTAIN_WALL_API.setLocale('ro-RO'));
  assert.match(await page.locator('#tag .mark').textContent(), /^Cortizo TP 52 · 6\.000 × 6\.600 mm · 4 × 4/);
  assert.equal(await api(() => window.CURTAIN_WALL_API.getModel().mullion.id), await api(() => window.CURTAIN_WALL_API.getModel().result.mullion.code));
  assert.equal(await page.locator('#bayList .track').count(), 4);
  assert.ok(await page.locator('#canvasHost canvas').isVisible());
  assert.equal(await page.locator('.cz-cell').count(), 16);
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-default.png') });

  // Grid editing: add a bay, change a width, switch a row to vision.
  await page.locator('[data-action="add-bay"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().S.widths.length === 5);
  await page.locator('[data-bay="0"]').fill('2000');
  await page.locator('[data-bay="0"]').press('Enter');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().W === 8000);
  await page.locator('[data-row-type="0"]').selectOption('vision');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().panes.filter(p => p.spandrel).length === 5);

  // Presets and statics: more wind needs a deeper mullion.
  await page.locator('[data-preset="storefront"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().H === 3000);
  const before = await api(() => window.CURTAIN_WALL_API.getModel().mullion.depth);
  await page.locator('#n-wind').fill('2');
  await page.locator('#n-wind').press('Enter');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().S.windLoad === 2);
  assert.ok(await api(() => window.CURTAIN_WALL_API.getModel().mullion.depth) > before);

  // The seven systems on the same grid.
  for (const system of ['TP52', 'SG52', 'TPH52', 'TPV52', 'ST52', 'SST52', 'SKY']) {
    await page.locator(`[data-cz-system="${system}"]`).click();
    await page.waitForFunction(id => window.CURTAIN_WALL_API.getModel()?.C?.system === id, system);
    const m = await api(() => { const r = window.CURTAIN_WALL_API.getModel().result; return { mullion: r.mullion?.code, cuts: r.cuts.length, accessories: r.accessories.length }; });
    assert.ok(m.mullion && m.cuts > 0 && m.accessories > 0, `${system}: ${JSON.stringify(m)}`);
  }
  assert.equal(await api(() => window.CURTAIN_WALL_API.getScene().root.rotation.x !== 0), true, 'the skylight leans at its slope');
  await page.locator('[data-cz-system="TP52"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel()?.C?.system === 'TP52');

  // A click on a field in the elevation turns it into a vent.
  await page.locator('.cz-cell[data-cell-row="0"][data-cell-col="1"]').click();
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().panes.some(p => p.window));
  // Glass build from the TP table drives the components.
  await page.locator('[data-accordion="glazing"] .accordion-toggle').click();
  await page.locator('[data-cz="totalMm"]').selectOption('28');
  await page.waitForFunction(() => window.CURTAIN_WALL_API.getModel().C.totalMm === 28);

  // Sheet tabs.
  await page.locator('[data-tab="node"]').click();
  assert.ok(await page.locator('#node svg .cw-part').first().isVisible());
  await page.locator('[data-tab="bom"]').click();
  assert.match(await page.locator('#bom').textContent(), /COR-98/);
  await page.locator('[data-tab="checks"]').click();
  assert.match(await page.locator('#checks').textContent(), /pag\. 27/);
  await page.locator('[data-tab="systems"]').click();
  assert.ok(await page.locator('.cz-cmp th').count() >= 8);
  await page.locator('[data-tab="map"]').click();
  await page.waitForSelector('#map svg.map');
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-cortizo.png') });

  // Locales follow the shell.
  for (const [locale, title] of [['en-US', 'Configure the facade'], ['de-DE', 'Fassade konfigurieren'], ['ro-RO', 'Configurează fațada']]) {
    await api(l => window.CURTAIN_WALL_API.setLocale(l), locale);
    assert.equal(await page.locator('.intro-section h1').textContent(), title);
  }
  // Exploded view: every node layer separates along the facade normal.
  await api(() => window.CURTAIN_WALL_API.setExploded(true));
  await page.waitForTimeout(900);
  assert.ok(await page.locator('#explodePanel').isVisible());
  assert.ok(await page.locator('#explodeLegend li').count() >= 7);
  const offsets = await api(() => Object.fromEntries(window.CURTAIN_WALL_API.getScene().root.children.map(m => [m.name, m.position.z])));
  assert.ok(offsets['mullion:profile'] < offsets['transom:profile'] && offsets['transom:profile'] < 0, 'profiles move inwards');
  assert.ok(offsets['mullion:cover'] > offsets['mullion:gasketOuter'] && offsets['mullion:gasketOuter'] > offsets.glass, 'outer layers move outwards in order');
  await page.locator('[data-action="assemble"]').click();
  await page.waitForTimeout(900);
  assert.ok(await page.locator('#explodePanel').isHidden());
  assert.equal(await api(() => window.CURTAIN_WALL_API.getScene().root.children.every(m => Math.abs(m.position.z) < 1e-9)), true);
  assert.equal(await api(() => window.CURTAIN_WALL_API.cycleCamera()), 'front');
  assert.ok(await api(() => window.CURTAIN_WALL_API.getScene().building.userData.anchors > 0), 'the building carries the anchors');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await api(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
  if (shots) await page.screenshot({ path: path.join(shots, 'cw-phone.png') });

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('curtain wall browser check passed');
})().catch(error => { console.error(error); process.exit(1); });
