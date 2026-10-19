/** Production Three.js and real native exporters. No live accounts or uploads.
 * Install root dependencies and `npm ci --prefix solar-configurator` first.
 * CHROMIUM_PATH can select an installed Chromium/Edge browser.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = resolve(process.env.SOLAR_AR_ARTIFACTS || resolve(root, 'tmp/solar-ar-runtime'));
const { validateAsset } = createRequire(import.meta.url)('../../firebase-share-backend/functions/hall-ar-core.cjs');
const index = await readFile(resolve(root, 'solar-configurator/index.html'), 'utf8');
const imports = JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const version = imports.three.match(/three@([^/]+)\//)[1];
const installed = JSON.parse(await readFile(resolve(root, 'solar-configurator/node_modules/three/package.json'), 'utf8'));
assert.equal(installed.version, version, 'Runtime tests must use the production import-map version');
const pageErrors = [], consoleErrors = [], exports = [], uploads = [], sessions = new Map();
let rejectUpload = false;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    const json = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (path === '/__ar/publishHallAR') {
      if (rejectUpload) { json(503, { error: { code: 'service-unavailable' } }); return; }
      const format = req.headers['x-hall-ar-format'], product = url.searchParams.get('product');
      assert.equal(product, 'solar');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks); validateAsset(format, bytes);
      const id = String(sessions.size + 1).padStart(32, 'A');
      const session = { id, product, format, byteLength: bytes.length, expiresAtMs: Date.now() + 86400000 };
      uploads.push(session); sessions.set(id, { session, bytes }); json(201, session); return;
    }
    if (path.startsWith('/__ar/getHallAR')) {
      const stored = sessions.get(url.searchParams.get('id'));
      if (!stored) { json(404, { error: { code: 'not-found' } }); return; }
      if (url.searchParams.get('asset') !== '1') { json(200, stored.session); return; }
      res.writeHead(200, { 'Content-Length': String(stored.bytes.length),
        'Content-Type': stored.session.format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' });
      res.end(req.method === 'HEAD' ? undefined : stored.bytes); return;
    }
    if (path.startsWith('/api/')) {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'offline-test' } }));
      return;
    }
    const filename = resolve(root, `.${decodeURIComponent(path)}`, path.endsWith('/') ? 'index.html' : '');
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
    let content = await readFile(filename);
    if (filename === resolve(root, 'solar-configurator/index.html')) {
      content = content.toString().replaceAll(imports.three, '/solar-configurator/node_modules/three/build/three.module.js')
        .replaceAll(imports['three/addons/'], '/solar-configurator/node_modules/three/examples/jsm/')
        .replace(/<script src="https:\/\/unpkg.com\/leaflet[^>]*><\/script>/, '');
    }
    // Serve a local endpoint only in this harness. No production upload can be
    // made, even if external request interception is unavailable in a browser.
    if (filename === resolve(root, 'shared-ui/src/ar/links.js')) {
      content = content.toString().replace("'https://europe-west1-configurator-360.cloudfunctions.net'", JSON.stringify(origin + '/__ar'));
    }
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(artifacts, { recursive: true });
let browser, page;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  // Account/auth and geographic services are outside this test's scope.
  await page.route(/^https:\/\//, route => route.abort());
  await page.goto(`${origin}/solar-configurator/`);
  await page.waitForFunction(() => !!window.SOLAR_CONFIGURATOR_API && !!window.SOLAR_CONFIGURATOR_SHARED_SHELL);
  assert.equal(await page.evaluate(async () => (await import('three')).REVISION), '169');
  // Exercise the public editor API with all physical roof/array face variants.
  for (const roofType of ['gable', 'hip', 'shed']) for (const moduleOrientation of ['portrait', 'landscape']) for (const roofSide of ['front', 'back', 'both']) {
    const config = { roofType, moduleOrientation, roofSide, panelCount: 8, length: 12, depth: 9, environmentEnabled: false, environmentAutoLoad: false };
    const result = await page.evaluate(async config => {
      const api = SOLAR_CONFIGURATOR_API;
      if (!api.restoreState(config)) throw Error('Cannot restore test configuration');
      const before = JSON.stringify(api.captureState()), snapshot = await api.captureARSnapshot();
      const { createSolarFirebaseARAsset } = await import('./js/ar/exportSolar.js?v=solar-ar-1');
      const files = {};
      for (const format of ['glb', 'usdz']) {
        const asset = await createSolarFirebaseARAsset(snapshot, format);
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        files[format] = btoa(binary);
        if (format === 'glb') {
          const THREE = await import('three');
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          const loaded = await new GLTFLoader().parseAsync(await asset.blob.arrayBuffer(), '');
          const bounds = new THREE.Box3().setFromObject(loaded.scene), size = bounds.getSize(new THREE.Vector3());
          if (Math.abs(bounds.min.y) > 0.0001 || ['x', 'y', 'z'].some(axis => Math.abs(size[axis] - snapshot.stats.size[axis]) > 0.0001)) throw Error('Native model scale/ground differs from editor');
        }
      }
      if (JSON.stringify(api.captureState()) !== before) throw Error('AR changed the configuration');
      return { files, stats: snapshot.stats };
    }, config);
    assert.ok(result.stats.panelCount > 0);
    assert.equal(result.stats.components['solar-panel-glass'], result.stats.panelCount);
    const sizes = {};
    for (const [format, base64] of Object.entries(result.files)) {
      const bytes = Buffer.from(base64, 'base64'); validateAsset(format, bytes); sizes[format] = bytes.length;
      if (format === 'usdz') {
        assert.match(bytes.toString(), /metersPerUnit = 1/);
        assert.match(bytes.toString(), /upAxis = "Y"/);
      }
    }
    exports.push({ config, sizes, stats: result.stats });
  }
  console.log('All 36 production-version native files passed binary, scale and grounding checks.');
  const dialog = page.locator('#solarARDialog');
  const open = () => page.locator('[data-action="view-ar"]').evaluate(button => button.click());
  const ready = () => page.waitForFunction(() => !!document.querySelector('#solarARDialog [data-open]')?.getAttribute('href'));
  await open(); await ready();
  assert.equal(uploads.at(-1).format, 'glb');
  await dialog.locator('[value="ios"]').check(); await ready();
  assert.equal(uploads.at(-1).format, 'usdz');
  const iosLink = await dialog.locator('[data-open]').getAttribute('href');
  const count = uploads.length;
  await dialog.locator('[value="android"]').check(); await ready(); assert.equal(uploads.length, count, 'Switching back should reuse the immutable snapshot');
  const androidLink = await dialog.locator('[data-open]').getAttribute('href');
  await page.screenshot({ path: resolve(artifacts, 'solar-ar-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await dialog.boundingBox()).width <= 390);
  await page.screenshot({ path: resolve(artifacts, 'solar-ar-mobile.png') });
  await dialog.locator('[data-close]').click();
  rejectUpload = true; await open();
  await page.waitForFunction(() => !document.querySelector('#solarARDialog [data-error]').hidden);
  assert.equal(await dialog.locator('[data-open]').isVisible(), false);
  rejectUpload = false; await dialog.locator('[data-retry]').click(); await ready(); await dialog.locator('[data-close]').click();
  // Open the actual phone HTML and shared controller for each native platform.
  for (const [mode, link] of [['ios', iosLink], ['android', androidLink]]) {
    const target = new URL(link); await page.goto(`${origin}${target.pathname}${target.search}`);
    await page.locator('#arPhoneLaunch').waitFor({ state: 'visible' });
    const launch = page.locator('#arPhoneLaunch'), href = await launch.getAttribute('href');
    if (mode === 'ios') { assert.equal(await launch.getAttribute('rel'), 'ar'); assert.equal(await launch.locator(':scope > img').count(), 1); assert.match(href, /solar\.usdz\?.*#allowsContentScaling=1$/); }
    else { assert.match(href, /^intent:\/\/arvr\.google\.com\/scene-viewer/); assert.ok(decodeURIComponent(href).includes('solar.glb?')); }
  }
  assert.deepEqual(pageErrors, []);
  console.log(`Solar AR: ${exports.length} configurations, 36 real Three.js ${version} GLB/USDZ exports, QR upload/retry/cache and both phone launchers passed.`);
} catch (error) {
  await page?.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ version, exports, uploads, pageErrors, consoleErrors }, null, 2));
  await browser?.close(); await new Promise(done => server.close(done));
}
