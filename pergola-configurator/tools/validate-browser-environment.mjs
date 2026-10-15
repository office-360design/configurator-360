/** Exercise real UI events and on-demand WebGL frames without forcing a render.
 * External services are blocked; nothing is submitted, shared or purchased.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, fs: { allow: [workspace] } },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    await page.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.testApp = { store, ui, scene };
        window.testFrame = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 96; canvas.height = 64;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(scene.renderer.domElement, 0, 0, 96, 64);
          let image = 2166136261;
          for (const value of ctx.getImageData(0, 0, 96, 64).data) image = Math.imul(image ^ value, 16777619);
          return { frames: scene.visualsApi.getDiagnostics().performance.drawnFrames, image };
        };
      ` });
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.testApp?.scene?.pergola);
    await page.evaluate(async () => { await testApp.scene.assets.ready; });
    await page.waitForFunction(() => testApp.scene.visualsApi.getDiagnostics().performance.skippedIdleFrames > 3);

    const snapshot = () => page.evaluate(() => testFrame());
    async function changesFrame(action, label) {
      const before = await snapshot();
      await action();
      await page.waitForFunction(before => {
        const current = testFrame();
        return current.frames > before.frames && current.image !== before.image;
      }, before);
      console.log(`PASS: ${viewport.width}px ${label} changes the visible frame without refresh.`);
    }
    const tool = id => page.locator(`[data-tool-id="${id}"]`);
    await page.getByRole('button', { name: 'Toggle tools', exact: true }).click();
    await tool('environment').click();
    await changesFrame(async () => {
      await page.locator('[data-path="environment.sunPosition"]').focus();
      await page.keyboard.press('End');
    }, 'sun position');
    assert.equal(await page.evaluate(() => testApp.store.get().environment.sunPosition), 1);
    await changesFrame(async () => {
      await page.locator('[data-path="environment.northDirection"]').focus();
      await page.keyboard.press('ArrowRight');
    }, 'north direction');
    for (const season of ['summer', 'studio', 'winter']) {
      await changesFrame(() => page.locator(`[data-option-path="environment.season"][data-option-value="${season}"]`).click(), season);
    }
    await page.locator('[data-environment-panel] [data-action="toggle-environment"]').click();
    // Mobile settings start collapsed. Close them again before using tools.
    if (viewport.width < 760) await page.locator('#pergolaSidebarToggle').click();
    await page.locator('[data-action="toggle-step-section"][data-step-id="accessories"]').click();
    await changesFrame(() => page.locator('[data-action="toggle-led"]').click(), 'LED enabled');
    await page.locator('[data-action="select-roof-rectangle"]').first().click();
    await changesFrame(() => page.locator('[data-action="spotlight-counter"][data-delta="1"]').click(), 'spotlight added');
    if (viewport.width < 760) await page.locator('#pergolaSidebarToggle').click();
    if (!await tool('environment').isVisible()) await page.getByRole('button', { name: 'Toggle tools', exact: true }).click();
    await tool('environment').click();
    for (const night of [true, false, true]) {
      await changesFrame(() => page.locator('[data-action="toggle-night"]').click(), `night=${night}`);
      const lights = await page.evaluate(() => {
        const result = { points: [], spots: [] };
        testApp.scene.pergola.traverse(object => {
          if (object.isPointLight) result.points.push(object.intensity);
          if (object.isSpotLight) result.spots.push(object.intensity);
        });
        return result;
      });
      assert.deepEqual(lights.points, Array(4).fill(night ? 1.8 : 0.12), `LED intensity night=${night}`);
      assert.deepEqual(lights.spots, [night ? 4.2 : 0.08], `spotlight intensity night=${night}`);
    }
    await page.locator('[data-environment-panel] [data-action="toggle-environment"]').click();
    for (const id of ['dimensions', 'compass', 'camera']) {
      await changesFrame(() => tool(id).click(), id);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${viewport.width}px sun, north, seasons, LED/spotlight day/night and view tools update without refresh.`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
