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
  const editor = page.locator('.roof-layout-dialog');
  const button = action => editor.locator(`[data-action="${action}"]`);
  const initial = await page.evaluate(async () => {
    const { defaultLayout } = await import('../roof-configurator/js/roofLayout.js?v=layout-8');
    const api = window.ROOF_CONFIGURATOR_API;
    const state = { ...api.captureState(), roofType: 'layout', roofLayout: defaultLayout(), overhang: 0 };
    api.restoreState(state);
    return state;
  });
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('2');
  await button('splitPlace').click();
  assert.equal(await page.locator('#layoutPointSelect').inputValue(), '6');
  await page.locator('#layoutH').fill('3');
  await button('point').click();
  await button('cycleCopy').click();
  assert.equal(await page.locator('#layoutPointSelect').inputValue(), '2');
  assert.equal(await page.locator('#layoutH').inputValue(), '2');
  await button('cycleCopy').click();
  assert.equal(await page.locator('#layoutH').inputValue(), '3');
  await button('undo').click();
  await button('undo').click();
  assert.equal(await page.locator('#layoutPointSelect option').count(), 7);
  await button('redo').click();
  await button('redo').click();
  await button('apply').click();
  const pointState = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(pointState.roofLayout.vertices[2].h, 2);
  assert.equal(pointState.roofLayout.vertices[6].h, 3);
  assert.deepEqual(pointState.roofLayout.planLinks, [[2, 6]]);
  console.log('PASS: point split, copy cycling, independent heights and undo/redo');
  await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), initial);
  await page.locator('#editRoofLayout').click();
  const ridge = await editor.locator('svg').evaluate(svg => {
    const nodes = svg.querySelectorAll('.layout-node');
    const a = nodes[2], b = nodes[5];
    const p = new DOMPoint((+a.getAttribute('cx') + +b.getAttribute('cx')) / 2,
      (+a.getAttribute('cy') + +b.getAttribute('cy')) / 2).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(ridge.x, ridge.y);
  await button('splitPlace').click();
  assert.match(await page.locator('#layoutCopyInfo').textContent(), /2 copies/);
  const firstCopy = await page.locator('#layoutCopyInfo').textContent();
  await button('cycleCopy').click();
  assert.notEqual(await page.locator('#layoutCopyInfo').textContent(), firstCopy);
  for (const id of ['6', '7']) {
    await page.locator('#layoutPointSelect').selectOption(id);
    await page.locator('#layoutH').fill('3.5');
    await button('point').click();
  }
  await page.screenshot({ path: '/tmp/roof-split-editor.png' });
  await button('apply').click();
  const saved = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(saved.roofLayout.planLinks.length, 2);
  for (const covering of ['generic', 'roca', 'teclado']) {
    const result = await page.evaluate(async ({ saved, covering }) => {
      const { buildRoofModel } = await import('../roof-configurator/js/roofFactory.js?v=layout-8');
      const state = { ...saved, covering };
      window.ROOF_CONFIGURATOR_API.restoreState(state);
      const { group } = buildRoofModel(state);
      const walls = group.children.filter(mesh => mesh.name === 'drawn-step-wall');
      const finite = walls.every(mesh => [...mesh.geometry.attributes.position.array].every(Number.isFinite));
      const materials = new Set();
      group.traverse(mesh => { mesh.geometry?.dispose(); if (mesh.material) materials.add(mesh.material); });
      materials.forEach(material => material.dispose());
      return { count: walls.length, finite };
    }, { saved, covering });
    assert.deepEqual(result, { count: 1, finite: true });
  }
  await page.screenshot({ path: '/tmp/roof-split-wall.png' });
  await page.evaluate(() => window.ROOF_CONFIGURATOR_API.resetConfiguration());
  assert.equal(await page.evaluate(state => window.ROOF_CONFIGURATOR_API.restoreState(state), saved), true);
  assert.deepEqual(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().roofLayout), saved.roofLayout);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#editRoofLayout').click();
  await page.locator('#layoutPointSelect').selectOption('6');
  await button('cycleCopy').click();
  assert.equal(await page.locator('#layoutPointSelect').inputValue(), '2');
  assert.equal(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.screenshot({ path: '/tmp/roof-split-mobile.png' });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: split edges, vertical walls with all coverings, save/restore and mobile cycling');
})().catch(error => { console.error(error); process.exit(1); });
