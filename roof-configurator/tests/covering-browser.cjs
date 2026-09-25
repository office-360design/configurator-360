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
  for (const covering of ['generic', 'roca', 'teclado']) {
    const result = await page.evaluate(async covering => {
      const { lShapedLayout, footprintLayout } = await import('../roof-configurator/js/roofLayout.js?v=layout-16');
      const { buildRoofModel } = await import('../roof-configurator/js/roofFactory.js?v=layout-16');
      const api = window.ROOF_CONFIGURATOR_API;
      const state = { ...api.captureState(), roofType: 'layout', roofLayout: lShapedLayout(), covering, roofColor: '#374151' };
      api.restoreState(state);
      const { group: roofGroup, metrics } = buildRoofModel(state);
      if (!(metrics.footprint < 70)) throw new Error('Overhang must inset the building footprint');
      const walls = roofGroup.children.filter(mesh => mesh.name === 'drawn-wall');
      if (!walls.length) throw new Error('Custom supporting walls are missing');
      const patchCount = roofGroup.children.filter(mesh => /^drawn-slope-\d+-\d+$/.test(mesh.name)).length;
      // A concave plane still needs multiple convex rendering patches. Check
      // their actual shared vertices, not just the whole-plane L-roof case.
      const concave = footprintLayout(state.roofLayout.boundary.map(id => state.roofLayout.vertices[id]));
      const { group } = buildRoofModel({ ...state, roofLayout: concave });
      const samples = new Map();
      let joins = 0, maxPositionError = 0, maxNormalError = 0;
      group.traverse(mesh => {
        if (!/^drawn-slope-\d+-\d+$/.test(mesh.name)) return;
        const patch = mesh.name.split('-')[2];
        const uv = mesh.geometry.getAttribute('uv');
        const position = mesh.geometry.getAttribute('position');
        const normal = mesh.geometry.getAttribute('normal');
        for (let i = 0; i < uv.count; i++) {
          const key = `${patch}:${uv.getX(i).toFixed(5)}:${uv.getY(i).toFixed(5)}`;
          const p = [position.getX(i), position.getY(i), position.getZ(i)];
          const n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
          const previous = samples.get(key);
          if (previous && previous.mesh !== mesh.name) {
            joins++;
            maxPositionError = Math.max(maxPositionError, Math.hypot(...p.map((v, j) => v - previous.p[j])));
            maxNormalError = Math.max(maxNormalError, Math.hypot(...n.map((v, j) => v - previous.n[j])));
          } else samples.set(key, { mesh: mesh.name, p, n });
        }
      });
      const geometries = new Set(), materials = new Set();
      for (const root of [group, roofGroup]) root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      return { patchCount, joins, maxPositionError, maxNormalError };
    }, covering);
    assert.equal(result.patchCount, 6, `${covering}: each L-roof plane must be rendered whole, without an internal diagonal`);
    assert.ok(result.joins > 10, `${covering}: check shared vertices of a concave plane`);
    assert.ok(result.maxPositionError < 0.0001, `${covering}: covering must meet continuously: ${JSON.stringify(result)}`);
    assert.ok(result.maxNormalError < 0.002, `${covering}: shading must meet continuously: ${JSON.stringify(result)}`);
    const dimensions = page.locator('[aria-controls="roofPanelDimensions"]');
    if (await dimensions.getAttribute('aria-expanded') !== 'true') await dimensions.click();
    assert.ok(await page.locator('[data-control="overhang"]').isVisible());
    const control = page.locator('[data-control="overhang"] input[type="range"]');
    await control.evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().overhang), 0);
    await control.evaluate(input => { input.value = '0.6'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().overhang), 0.6);
    await page.mouse.move(630, 490);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/roof-covering-${covering}.png` });
    console.log(covering, result);
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: all three custom coverings have continuous positions and shading across triangulation.');
})().catch(error => { console.error(error); process.exit(1); });
