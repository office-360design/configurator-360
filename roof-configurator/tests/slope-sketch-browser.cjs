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

  // Selecting the card replaces the 3D stage with the 2D slope overview.
  // Choosing the mode above the stage opens its editor straight away.
  await page.locator('.draw-mode-switch [data-roof-type="sketch"]').click();
  assert.ok(await page.locator('.slope-sketch-dialog').evaluate(dialog => dialog.open));
  assert.equal(await page.locator('.draw-mode-switch [data-roof-type="sketch"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.slope-sketch-dialog [data-sketch="cancel"]').first().click();
  const viewer = page.locator('#sketchViewer');
  assert.ok(await viewer.isVisible());
  assert.ok(await page.locator('#sketchLaunch').isVisible());
  assert.ok(await page.locator('#layoutLaunch').isHidden());
  assert.ok(await page.locator('.view-actions').isHidden());
  assert.equal(await viewer.locator('.sketch-card').count(), 2);
  assert.match(await page.locator('#metricRoofArea').textContent(), /50\.2 m²/);
  assert.equal(await viewer.locator('.sketch-card strong').first().textContent(), 'Slope A');
  assert.equal(await page.locator('#metricRidge').textContent(), '—');
  if (process.env.ROOF_TEST_SHOTS) await page.screenshot({ path: path.join(process.env.ROOF_TEST_SHOTS, 'sketch-viewer.png') });

  // Add a trapezoid with a decimal comma, as typed on site, and an impossible triangle.
  await page.locator('#editSlopeSketch').click();
  const editor = page.locator('.slope-sketch-dialog');
  await editor.locator('[data-add-shape="trapezoid"]').click();
  assert.equal(await editor.locator('.sketch-list li').count(), 3);
  await editor.locator('input[name="base"]').fill('10');
  await editor.locator('input[name="top"]').fill('3,8');
  await editor.locator('input[name="left"]').fill('3,7');
  await editor.locator('input[name="right"]').fill('4,2');
  await editor.locator('input[name="quantity"]').fill('2');
  assert.ok(await editor.locator('.sketch-error').isHidden());
  assert.match(await editor.locator('.sketch-preview-caption').textContent(), /× 2/);
  assert.match(await editor.locator('.sketch-edge b').nth(2).textContent(), /^3\.8 m$/);
  await editor.locator('select[name="edge-1"]').selectOption('valley');
  if (process.env.ROOF_TEST_SHOTS) await page.screenshot({ path: path.join(process.env.ROOF_TEST_SHOTS, 'sketch-editor.png') });
  await editor.locator('[data-add-shape="triangle"]').click();
  await editor.locator('input[name="base"]').fill('10');
  await editor.locator('input[name="left"]').fill('3');
  await editor.locator('input[name="right"]').fill('3');
  assert.match(await editor.locator('.sketch-error').textContent(), /cannot form a triangle/);
  assert.ok(await editor.locator('[data-sketch="apply"]').isDisabled());
  await editor.locator('[data-form-action="delete"]').click();
  assert.ok(await editor.locator('[data-sketch="apply"]').isEnabled());

  // Drag the ridge corner: the measurements follow, in 5 cm steps.
  await editor.locator('[data-add-shape="trapezoid"]').click();
  const before = await editor.locator('input[name="top"]').inputValue();
  const handle = await editor.locator('.sketch-preview [data-point="2"] circle').last().boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y - 30, { steps: 6 });
  await page.mouse.up();
  const top = Number(await editor.locator('input[name="top"]').inputValue());
  assert.notEqual(String(top), before);
  assert.ok(Math.abs(top / 0.05 - Math.round(top / 0.05)) < 1e-6, `top ${top} not on 5 cm`);
  assert.equal(await editor.locator('input[name="base"]').inputValue(), '10');
  // Double-click a length and type the exact value with a decimal comma.
  await editor.locator('.sketch-preview [data-edge="3"]').dblclick();
  const inline = editor.locator('.sketch-inline-input');
  await inline.fill('4,35');
  await inline.press('Enter');
  assert.equal(await editor.locator('input[name="left"]').inputValue(), '4.35');
  assert.match(await editor.locator('.sketch-preview [data-edge="3"]').textContent(), /^4\.35 m/);
  // Escape cancels the field without closing the editor.
  await editor.locator('.sketch-preview [data-height]').dblclick();
  await editor.locator('.sketch-inline-input').press('Escape');
  assert.ok(await editor.evaluate(dialog => dialog.open));
  assert.equal(await editor.locator('.sketch-inline-input').count(), 0);
  await editor.locator('.sketch-preview [data-height]').dblclick();
  await editor.locator('.sketch-inline-input').fill('3');
  await editor.locator('.sketch-inline-input').press('Enter');
  assert.match(await editor.locator('.sketch-preview-caption').textContent(), /Slope length 3 m/);
  await editor.locator('[data-form-action="delete"]').click();

  // Free polygon: add a point, then save everything.
  await editor.locator('[data-add-shape="polygon"]').click();
  await editor.locator('[data-form-action="addPoint"]').click();
  assert.equal(await editor.locator('.sketch-points tbody tr').count(), 5);
  assert.equal(await editor.locator('.sketch-edge').count(), 5);
  await editor.locator('[data-sketch="apply"]').click();
  assert.ok(!(await editor.evaluate(dialog => dialog.open)));
  assert.equal(await viewer.locator('.sketch-card').count(), 4);

  // State survives capture/restore and share snapshots.
  const snapshot = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(snapshot.roofType, 'sketch');
  assert.equal(snapshot.slopeSketch.slopes.length, 4);
  assert.equal(snapshot.slopeSketch.slopes[2].edges[1], 'valley');
  assert.ok(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.resetConfiguration()));
  assert.ok(await viewer.isHidden());
  assert.ok(await page.evaluate(s => window.ROOF_CONFIGURATOR_API.restoreState(s), snapshot));
  assert.equal(await viewer.locator('.sketch-card').count(), 4);
  const broken = structuredClone(snapshot);
  broken.slopeSketch.slopes[0].dims.base = -1;
  assert.equal(await page.evaluate(s => window.ROOF_CONFIGURATOR_API.restoreState(s), broken), false);

  // The cutting plan uses the drawn slopes directly.
  await page.locator('#sheetPlanOpenButton').click();
  const planner = page.locator('.sheet-planner');
  await planner.locator('.sheet-slope').first().waitFor();
  assert.equal(await planner.locator('[data-plan-slope]').count(), 4);
  assert.match(await planner.locator('.sheet-status').textContent(), /4 slopes/);
  assert.match(await planner.locator('.sheet-quantity').first().textContent(), /× 2 identical slopes/);
  assert.match(await planner.locator('.sheet-output').textContent(), /Edge lengths/);
  assert.match(await planner.locator('.sheet-output').textContent(), /Valley/);
  if (process.env.ROOF_TEST_SHOTS) await page.screenshot({ path: path.join(process.env.ROOF_TEST_SHOTS, 'sketch-planner.png') });
  await planner.locator('[data-sheet="close"]').first().click();

  // Romanian labels.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('roof-preference-change', { detail: { locale: 'ro-RO' } })));
  assert.equal(await page.locator('[data-roof-type="sketch"] span').innerText(), 'Desenează fiecare apă');
  assert.equal(await page.locator('#roofPanelTitle').innerText(), 'Configurează acoperișul');
  await page.locator('#editSlopeSketch').click();
  assert.match(await editor.locator('h2').textContent(), /Desenează fiecare apă/);
  assert.match(await editor.locator('.sketch-help').textContent(), /măsurate pe apă/);
  assert.match(await editor.locator('.sketch-form h3').textContent(), /^Apa A$/);
  await editor.locator('[data-sketch="cancel"]').first().click();

  // Phone layout keeps the editor usable without horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#editSlopeSketch').click();
  const overflow = await editor.evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  assert.ok(overflow <= 1, `editor overflows by ${overflow}px`);
  if (process.env.ROOF_TEST_SHOTS) await page.screenshot({ path: path.join(process.env.ROOF_TEST_SHOTS, 'sketch-mobile.png'), fullPage: false });

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('slope sketch browser check passed');
})().catch(error => { console.error(error); process.exit(1); });
