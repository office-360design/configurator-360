/** Run the actual shell, UI and WebGL renderer against local assets.
 * Requires Playwright; CHROMIUM_PATH can select an installed browser.
 * External services are blocked. No configuration is submitted or shared.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**', route => route.abort());
  await page.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.testApp = { store, ui, scene, sharedShell };` });
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.testApp?.scene?.pergola);
  // Exercise imported GLB parts as well as the procedural fallback models.
  await page.evaluate(async () => { await testApp.scene.assets.ready; });
  assert.equal(await page.evaluate(() => testApp.scene.assets.has('handCrank')), true);

  let comparisons = 0;
  async function assertVisibleModel(label) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = await page.evaluate(() => {
      const { scene } = testApp;
      const bounds = scene.renderer.domElement.getBoundingClientRect();
      return {
        attached: scene.pergola.parent === scene.pergolaGroup,
        visible: scene.pergola.visible,
        children: scene.pergola.children.length,
        canvas: bounds.width > 100 && bounds.height > 100,
        context: !scene.renderer.getContext().isContextLost(),
      };
    });
    assert.ok(state.attached && state.visible && state.children > 0 && state.canvas && state.context, label);
    assert.deepEqual(errors, [], label);
    comparisons++;
  }
  for (const step of ['structure', 'finish', 'automation']) {
    await page.evaluate(step => { testApp.ui.expandedStep = step; testApp.ui.render(); }, step);
    const options = await page.locator('.configurator-sidebar [data-option-path]').evaluateAll(nodes =>
      nodes.map(node => ({ path: node.dataset.optionPath, value: node.dataset.optionValue })));
    for (const option of options) {
      const button = page.locator(`[data-option-path="${option.path}"][data-option-value="${option.value}"]`).first();
      if (!await button.count() || await button.isDisabled()) continue;
      await button.evaluate(node => node.click());
      await assertVisibleModel(`${option.path}=${option.value}`);
    }
  }

  for (const dark of [true, false, true]) {
    await page.evaluate(dark => {
      testApp.sharedShell.setPreference('darkMode', dark);
      testApp.store.update('darkMode', dark);
    }, dark);
    for (const step of ['structure', 'finish', 'automation', 'sides', 'accessories', 'summary']) {
      await page.evaluate(step => { testApp.ui.expandedStep = step; testApp.ui.render(); }, step);
      await page.mouse.move(0, 0);
      const button = page.locator('.accordion-section.is-open > .accordion-toggle');
      assert.equal(await button.evaluate(node => getComputedStyle(node).backgroundColor),
        dark ? 'rgb(32, 53, 74)' : 'rgb(238, 248, 253)', `${dark}/${step}`);
      await assertVisibleModel(`theme ${dark}/${step}`);
    }
  }

  // A future build failure must retain the last visible model.
  assert.equal(await page.evaluate(() => {
    const { scene } = testApp;
    const previous = scene.pergola;
    const create = scene.surfaceSystem.materials.create;
    let failed = false;
    scene.surfaceSystem.materials.create = () => { throw new Error('Injected build failure'); };
    try { scene.rebuildPergola(); } catch { failed = true; }
    finally { scene.surfaceSystem.materials.create = create; }
    return failed && scene.pergola === previous && previous.parent === scene.pergolaGroup;
  }), true);
  console.log(`PASS: ${comparisons} real WebGL option/theme checks; failed rebuild retains the visible model.`);
} finally {
  await browser?.close();
  await server.close();
}
