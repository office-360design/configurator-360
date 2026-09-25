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
    const { defaultLayout, splitLayoutInPlace } = await import('../roof-configurator/js/roofLayout.js?v=layout-17');
    const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
    copies.forEach(id => { layout.vertices[id].h = 3.5; });
    const api = window.ROOF_CONFIGURATOR_API;
    const state = { ...api.captureState(), roofType: 'layout', roofLayout: layout };
    api.restoreState(state);
    return state;
  });
  const editor = page.locator('.roof-layout-dialog');
  const button = action => editor.locator(`[data-action="${action}"]`);
  await page.locator('#editRoofLayout').click();
  assert.ok(await button('joinPlace').isDisabled());
  await page.locator('#layoutPointSelect').selectOption('6');
  await button('joinPlace').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 8);
  await button('undo').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 9);
  await button('redo').click();
  await button('apply').click();
  let current = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(current.roofLayout.vertices[2].h, 3.5);
  assert.equal(current.roofLayout.planLinks.length, 1);
  await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), saved);
  await page.locator('#editRoofLayout').click();
  const ridge = await editor.locator('svg').evaluate(svg => {
    const nodes = svg.querySelectorAll('.layout-node');
    const a = nodes[2], b = nodes[5];
    const p = new DOMPoint((+a.getAttribute('cx') + +b.getAttribute('cx')) / 2,
      (+a.getAttribute('cy') + +b.getAttribute('cy')) / 2).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(ridge.x, ridge.y);
  await button('joinPlace').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 7);
  await button('undo').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 9);
  await button('redo').click();
  await button('apply').click();
  current = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(current.roofLayout.planLinks, undefined);
  assert.equal(current.roofLayout.faces.length, 2);
  assert.equal(current.roofLayout.vertices[2].h, 3.5);
  assert.equal(current.roofLayout.vertices[5].h, 3.5);
  const walls = await page.evaluate(async state => {
    const { buildRoofModel } = await import('../roof-configurator/js/roofFactory.js?v=layout-17');
    const { group } = buildRoofModel(state);
    const count = group.children.filter(mesh => mesh.name === 'drawn-step-wall').length;
    const materials = new Set();
    group.traverse(mesh => { mesh.geometry?.dispose(); if (mesh.material) materials.add(mesh.material); });
    materials.forEach(material => material.dispose());
    return count;
  }, current);
  assert.equal(walls, 0);
  assert.equal(await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), current), true);
  await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('6');
  await button('joinPlace').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 8);
  assert.equal(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: point/edge joining, selected heights, wall removal, undo/redo, saved layouts and mobile');
})().catch(error => { console.error(error); process.exit(1); });
