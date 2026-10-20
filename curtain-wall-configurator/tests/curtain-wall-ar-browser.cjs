// Exact production Three.js, real WebGL and GLB/USDZ exporters, local storage.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { validateAsset } = require('../../firebase-share-backend/functions/hall-ar-core.cjs');

(async () => {
  const root = path.resolve(__dirname, '../..'), productPath = 'curtain-wall-configurator';
  const artifacts = process.env.CW_AR_ARTIFACTS || path.join(root, 'tmp/curtain-wall-ar');
  await mkdir(artifacts, { recursive: true });
  const index = await readFile(path.join(root, productPath, 'index.html'), 'utf8');
  const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const fixture = '/curtain-wall-configurator/node_modules/three/';
  const version = imports.three.match(/three@([^/]+)\//)[1];
  assert.equal(JSON.parse(await readFile(path.join(root, fixture, 'package.json'), 'utf8')).version, version);
  const uploads = [], errors = [], consoleLogs = [], sessions = new Map(), reports = [];
  let origin, rejectUpload = false, rejectHead = false, browser, page;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    try {
      if (url.pathname === '/__ar/publishHallAR') {
        if (rejectUpload) return json(503, { error: { code: 'service-unavailable' } });
        assert.equal(url.searchParams.get('product'), 'curtainwall');
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks), format = req.headers['x-hall-ar-format']; validateAsset(format, bytes);
        const id = String(sessions.size + 1).padStart(32, 'F');
        const session = { id, product: 'curtainwall', format, byteLength: bytes.length, expiresAtMs: Date.now() + 86400000 };
        sessions.set(id, { session, bytes }); uploads.push(session); return json(201, session);
      }
      if (url.pathname.startsWith('/__ar/getHallAR')) {
        const stored = sessions.get(url.searchParams.get('id'));
        if (!stored) return json(404, { error: { code: 'not-found' } });
        if (url.searchParams.get('asset') !== '1') return json(200, stored.session);
        if (rejectHead && req.method === 'HEAD') return json(503, { error: { code: 'service-unavailable' } });
        res.writeHead(200, { 'Content-Length': String(stored.bytes.length),
          'Content-Type': stored.session.format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' });
        return res.end(req.method === 'HEAD' ? undefined : stored.bytes);
      }
      if (url.pathname.startsWith('/api/')) return json(503, { error: { code: 'offline-test' } });
      const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
      if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      let content = await readFile(filename);
      if (filename === path.join(root, productPath, 'index.html')) content = content.toString()
        .replaceAll(imports.three, fixture + 'build/three.module.js').replaceAll(imports['three/addons/'], fixture + 'examples/jsm/');
      if (filename === path.join(root, 'shared-ui/src/ar/links.js')) content = content.toString()
        .replace("'https://europe-west1-configurator-360.cloudfunctions.net'", JSON.stringify(origin + '/__ar'));
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(content);
    } catch (error) {
      if (url.pathname.startsWith('/__ar/')) { errors.push(error.message); json(500, { error: { code: 'invalid-model' } }); }
      else { if (!url.pathname.includes('favicon')) errors.push('Missing local resource: ' + url.pathname); res.writeHead(404).end(); }
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CW_TEST_BROWSER || process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleLogs.push(msg.text()); });
    await page.route(/^https:\/\//, route => route.abort());
    await page.goto(origin + '/' + productPath + '/');
    await page.waitForFunction(() => window.CURTAIN_WALL_API?.getModel() && window.CURTAIN_WALL_SHARED_SHELL);
    assert.equal(await page.evaluate(async () => (await import('three')).REVISION), '160');
    const dialog = page.locator('#curtainwallARDialog');
    const open = () => page.locator('[data-action="view-ar"]').evaluate(button => button.click());
    const ready = () => page.waitForFunction(() => !!document.querySelector('#curtainwallARDialog [data-open]')?.getAttribute('href'), null, { timeout: 60000 });
    let androidLink, iosLink;
    for (const system of ['TP52', 'SG52', 'TPH52', 'TPV52', 'ST52', 'SST52', 'SKY']) {
      await page.evaluate(system => CURTAIN_WALL_API.restoreState({ widths: [1500, 1500, 1500], heights: [900, 2400], rowTypes: ['spandrel', 'vision'], cortizo: { system } }), system);
      await page.waitForFunction(id => CURTAIN_WALL_API.getModel()?.C.system === id, system);
      const report = await page.evaluate(async () => {
        const api = CURTAIN_WALL_API, scene = api.getScene();
        const assembled = await api.captureARSnapshot();
        const physicalMeshes = scene.root.children.filter(o => o.isMesh).length;
        if (assembled.stats.sourceMeshes !== physicalMeshes) throw Error('Missing physical façade components');
        api.setExploded(true);
        await new Promise((resolve, reject) => {
          const deadline = performance.now() + 20000;
          const frame = () => {
            if (scene.explode.value === 1) resolve();
            else if (performance.now() >= deadline) reject(Error('Exploded animation did not finish'));
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        const { waitForStableView } = await import('/bookshelf-configurator/tests/camera-guard.mjs');
        await waitForStableView(scene.camera, scene.controls, document.querySelector('#canvasHost'));
        const geometryBefore = JSON.stringify(scene.root.toJSON()), stateBefore = JSON.stringify(api.captureState());
        const cameraBefore = JSON.stringify([scene.camera.position, scene.camera.quaternion, scene.controls.target]);
        const exploded = await api.captureARSnapshot();
        if (JSON.stringify(assembled.model.geometries.map(g => g.data)) !== JSON.stringify(exploded.model.geometries.map(g => g.data))) throw Error('Exploded offsets leaked into AR');
        const geometryAfter = JSON.stringify(scene.root.toJSON()), stateAfter = JSON.stringify(api.captureState());
        if (geometryAfter !== geometryBefore) {
          let index = 0; while (geometryBefore[index] === geometryAfter[index]) index++;
          throw Error('Capture changed geometry at ' + index + ': ' + geometryBefore.slice(index - 80, index + 150) + ' => ' + geometryAfter.slice(index - 80, index + 150));
        }
        if (stateAfter !== stateBefore) throw Error('Capture changed state: ' + stateBefore + ' => ' + stateAfter);
        if (JSON.stringify([scene.camera.position, scene.camera.quaternion, scene.controls.target]) !== cameraBefore) throw Error('Capture moved camera');
        if (scene.exploded !== 1) throw Error('Capture stopped exploded view');
        return { stats: assembled.stats, model: assembled.model };
      });
      await open(); await ready(); assert.equal(uploads.at(-1).format, 'glb');
      const loaded = await page.evaluate(async () => {
        const url = document.querySelector('#curtainwallARDialog [data-open]').href;
        const id = new URL(url).searchParams.get('id');
        const { arModelUrl } = await import('/shared-ui/src/ar/links.js?v=curtainwall-ar-1');
        const THREE = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const bytes = await (await fetch(arModelUrl(id, 'glb', 'curtainwall'))).arrayBuffer();
        const result = await new GLTFLoader().parseAsync(bytes, '');
        const bounds = new THREE.Box3().setFromObject(result.scene);
        return { minY: bounds.min.y, size: bounds.getSize(new THREE.Vector3()).toArray() };
      });
      assert.ok(Math.abs(loaded.minY) < 1e-4);
      ['x', 'y', 'z'].forEach((axis, i) => assert.ok(Math.abs(loaded.size[i] - report.stats.size[axis]) < 1e-4));
      assert.ok(report.model.materials.some(m => m.opacity > 0 && m.opacity < 1), 'glazing remains transparent');
      androidLink = await dialog.locator('[data-open]').getAttribute('href');
      assert.equal(await dialog.evaluate(el => getComputedStyle(el).borderRadius), '22px');
      assert.ok(await dialog.locator('[data-qr] svg').isVisible());
      await dialog.locator('[value="ios"]').check(); await ready(); assert.equal(uploads.at(-1).format, 'usdz');
      iosLink = await dialog.locator('[data-open]').getAttribute('href');
      const count = uploads.length; await dialog.locator('[value="android"]').check(); await ready(); assert.equal(uploads.length, count);
      if (system === 'TP52' || system === 'SKY') await page.screenshot({ path: path.join(artifacts, system + '-qr.png') });
      await dialog.locator('[data-close]').click();
      await page.evaluate(() => CURTAIN_WALL_API.setExploded(false));
      reports.push({ system, stats: report.stats, sizes: uploads.slice(-2).map(s => s.byteLength) });
      console.log(system + ': real GLB/USDZ, assembled geometry, native scale and styled QR passed');
    }
    // An edit immediately followed by AR must capture the pending new grid.
    const fresh = await page.evaluate(async () => {
      CURTAIN_WALL_API.restoreState({ widths: [1100, 1300], heights: [2400], rowTypes: ['vision'], glassTint: 'blue', finishOutside: '9016', cortizo: { system: 'TP52', fields: [{ row: 0, col: 0, type: 'window' }] } });
      return (await CURTAIN_WALL_API.captureARSnapshot()).stats;
    });
    assert.ok(fresh.size.x < 2.6 && fresh.components.sash > 0);
    for (const locale of ['ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT', 'en-US']) {
      await page.evaluate(locale => { CURTAIN_WALL_SHARED_SHELL.state.locale = locale; }, locale);
      await open(); await ready(); assert.ok((await dialog.locator('[data-open]').getAttribute('href')).includes('lang=' + locale));
      assert.doesNotMatch(await dialog.innerText(), /configured hall|hall configurator/i); await dialog.locator('[data-close]').click();
    }
    rejectHead = true; await open(); await dialog.locator('[data-error]').waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('[data-qr]').isVisible(), false); rejectHead = false;
    await dialog.locator('[data-retry]').click(); await ready(); await dialog.locator('[data-close]').click();
    rejectUpload = true; await open(); await dialog.locator('[data-error]').waitFor({ state: 'visible' });
    rejectUpload = false; await dialog.locator('[data-retry]').click(); await ready();
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok((await dialog.boundingBox()).width <= 390);
    await page.screenshot({ path: path.join(artifacts, 'mobile-qr.png') }); await dialog.locator('[data-close]').click();
    for (const [mode, link] of [['ios', iosLink], ['android', androidLink]]) {
      await page.goto(link); const launch = page.locator('#arPhoneLaunch'); await launch.waitFor({ state: 'visible' });
      const href = await launch.getAttribute('href');
      if (mode === 'ios') { assert.equal(await launch.getAttribute('rel'), 'ar'); assert.equal(await launch.locator(':scope > img').count(), 1); assert.match(href, /curtainwall\.usdz\?.*#allowsContentScaling=1$/); }
      else { assert.match(href, /^intent:\/\/arvr\.google\.com/); assert.ok(decodeURIComponent(href).includes('curtainwall.glb?')); }
    }
    assert.deepEqual(errors, []);
    console.log('Curtain wall AR: all systems, actual exporters, QR/retry/cache, locales, mobile and both phone launchers passed.');
  } catch (error) {
    await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {}); throw error;
  } finally {
    await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ reports, uploads, errors, consoleLogs }, null, 2));
    await browser?.close(); await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
