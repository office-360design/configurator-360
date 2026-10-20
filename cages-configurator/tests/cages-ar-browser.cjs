// Real r169 editor/exporters and local HTTP publication. Uses the pinned Three
// fixture installed by `npm ci --prefix solar-configurator`; no live uploads.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { validateAsset } = require('../../firebase-share-backend/functions/hall-ar-core.cjs');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const artifacts = process.env.CAGES_TEST_SHOTS || path.join(root, 'tmp/cages-ar');
  await mkdir(artifacts, { recursive: true });
  const index = await readFile(path.join(root, 'cages-configurator/index.html'), 'utf8');
  const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const version = imports.three.match(/three@([^/]+)\//)[1];
  const fixture = '/solar-configurator/node_modules/three/';
  assert.equal(JSON.parse(await readFile(path.join(root, fixture, 'package.json'), 'utf8')).version, version);
  const uploads = [], errors = [], sessions = new Map(), reports = [];
  let origin, rejectUpload = false, browser, page;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    try {
      if (url.pathname === '/__ar/publishHallAR') {
        if (rejectUpload) return json(503, { error: { code: 'service-unavailable' } });
        assert.equal(url.searchParams.get('product'), 'cages');
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks), format = req.headers['x-hall-ar-format'];
        validateAsset(format, bytes);
        const id = String(sessions.size + 1).padStart(32, 'C');
        const session = { id, product: 'cages', format, byteLength: bytes.length, expiresAtMs: Date.now() + 86400000 };
        sessions.set(id, { session, bytes }); uploads.push(session);
        await writeFile(path.join(artifacts, `${id}.${format}`), bytes);
        return json(201, session);
      }
      if (url.pathname.startsWith('/__ar/getHallAR')) {
        const stored = sessions.get(url.searchParams.get('id'));
        if (!stored) return json(404, { error: { code: 'not-found' } });
        if (url.searchParams.get('asset') !== '1') return json(200, stored.session);
        res.writeHead(200, { 'Content-Length': String(stored.bytes.length),
          'Content-Type': stored.session.format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' });
        return res.end(req.method === 'HEAD' ? undefined : stored.bytes);
      }
      if (url.pathname.startsWith('/api/')) return json(503, { error: { code: 'offline-test' } });
      const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
      if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      let content = await readFile(filename);
      if (filename === path.join(root, 'cages-configurator/index.html')) content = content.toString()
        .replaceAll(imports.three, fixture + 'build/three.module.js')
        .replaceAll(imports['three/addons/'], fixture + 'examples/jsm/');
      // Route native XHR/fetch to this server even if request interception fails.
      if (filename === path.join(root, 'shared-ui/src/ar/links.js')) content = content.toString()
        .replace("'https://europe-west1-configurator-360.cloudfunctions.net'", JSON.stringify(origin + '/__ar'));
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(content);
    } catch (error) {
      if (url.pathname.startsWith('/__ar/')) { errors.push(error.message); json(500, { error: { code: 'invalid-model' } }); }
      else res.writeHead(404).end();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CAGES_TEST_BROWSER || process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https:\/\//, route => route.abort());
    await page.goto(origin + '/cages-configurator/');
    await page.waitForFunction(() => window.CAGES_CONFIGURATOR_API?.getARAssembly() && window.CAGES_CONFIGURATOR_SHARED_SHELL);
    const ready = () => page.waitForFunction(() => !!document.querySelector('#cagesARDialog [data-open]')?.getAttribute('href'), null, { timeout: 90000 });
    const dialog = page.locator('#cagesARDialog');
    const open = () => page.locator('[data-action="view-ar"]').evaluate(button => button.click());
    let iosLink;
    for (const preset of ['default', 'pm']) {
      if (preset !== 'default') {
        await page.locator(`[data-preset="${preset}"]`).click();
        await page.waitForFunction(() => window.CAGES_CONFIGURATOR_API.getModel().kind === 'wall');
      }
      // Display-only bore must never enter the physical product, even if shown.
      await page.locator('#c-bore').check();
      const capture = await page.evaluate(async () => {
        const { captureCagesARSnapshot } = await import('./js/ar/exportCages.js?v=cages-ar-2');
        const root = CAGES_CONFIGURATOR_API.getARAssembly(), before = JSON.stringify(root.toJSON());
        const snapshot = captureCagesARSnapshot(root);
        if (JSON.stringify(root.toJSON()) !== before) throw Error('Capture changed editor geometry');
        if (snapshot.model.materials.some(m => m.opacity === .1)) throw Error('Bore helper leaked into AR');
        return snapshot.stats;
      });
      await open(); await ready();
      assert.equal(uploads.at(-1).format, 'glb');
      const style = await dialog.evaluate(el => ({ radius: getComputedStyle(el).borderRadius, width: el.getBoundingClientRect().width }));
      assert.equal(style.radius, '22px'); assert.ok(style.width <= 560);
      assert.ok(await dialog.locator('[data-qr] svg').isVisible());
      await page.screenshot({ path: path.join(artifacts, `cages-${preset}-ar.png`) });
      await dialog.locator('[value="ios"]').check(); await ready();
      assert.equal(uploads.at(-1).format, 'usdz'); iosLink = await dialog.locator('[data-open]').getAttribute('href');
      const count = uploads.length;
      await dialog.locator('[value="android"]').check(); await ready(); assert.equal(uploads.length, count);
      await dialog.locator('[data-close]').click();
      reports.push({ preset, stats: capture }); console.log(`${preset}: real GLB, USDZ and styled QR dialog passed`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    rejectUpload = true; await open();
    await dialog.locator('[data-error]').waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('[data-qr]').isVisible(), false);
    rejectUpload = false; await dialog.locator('[data-retry]').click(); await ready();
    assert.ok((await dialog.boundingBox()).width <= 390);
    await page.screenshot({ path: path.join(artifacts, 'cages-ar-mobile.png') });
    await dialog.locator('[data-close]').click();
    await page.goto(iosLink);
    const launch = page.locator('#arPhoneLaunch'); await launch.waitFor({ state: 'visible' });
    assert.equal(await launch.getAttribute('rel'), 'ar'); assert.equal(await launch.locator(':scope > img').count(), 1);
    assert.match(await launch.getAttribute('href'), /cages\.usdz\?.*#allowsContentScaling=1$/);
    assert.deepEqual(errors, []);
    console.log('Cages AR: pile/wall native exports, shared styling, QR, switching, retry and phone launcher passed.');
  } catch (error) {
    await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {}); throw error;
  } finally {
    await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ reports, uploads, errors }, null, 2));
    await browser?.close(); await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
