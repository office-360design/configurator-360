/** Dependency-resolution regression for the shared AR capture module.
 * Run from the repository root:
 * node --no-warnings --experimental-vm-modules --test pergola-configurator/tools/ar-build-resolution.test.mjs
 *
 * Declarative config checks use only Node's standard library. The final test
 * uses the installed Vite resolver. It must run (never skip) in CI, after
 * npm ci --prefix pergola-configurator. No cloud credentials are needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, normalize } from 'node:path';
import vm from 'node:vm';

const configURL = new URL('../vite.config.js', import.meta.url);
const projectURL = new URL('../', import.meta.url);
const localPath = (path) => fileURLToPath(new URL(path, projectURL));

// Vite's defineConfig is an identity helper for a declarative object. Loading
// only that helper in a VM makes the config contract testable offline without
// substituting a renderer, a Three.js version, or a bundler in the real app.
async function readDeclarativeConfig() {
  const context = vm.createContext({ URL, process: { cwd: () => localPath('./') } });
  const viteHelpers = new vm.SyntheticModule(['defineConfig', 'searchForWorkspaceRoot'], function () {
    this.setExport('defineConfig', (value) => value);
    this.setExport('searchForWorkspaceRoot', (path) => path);
  }, { context });
  const nodeURL = new vm.SyntheticModule(['fileURLToPath'], function () {
    this.setExport('fileURLToPath', fileURLToPath);
  }, { context });
  const module = new vm.SourceTextModule(await readFile(configURL, 'utf8'), {
    context,
    identifier: configURL.href,
    initializeImportMeta(meta) { meta.url = configURL.href; },
  });
  await module.link((specifier) => {
    if (specifier === 'vite') return viteHelpers;
    if (specifier === 'node:url') return nodeURL;
    throw new Error(`Unexpected dependency in the declarative build config: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace.default;
}
const config = await readDeclarativeConfig();

// Match the documented first-matching-alias semantics, including the regexp
// boundary: "three" must not accidentally turn "three/addons" into a file path.
function aliased(id) {
  for (const entry of config.resolve?.alias || []) {
    if (typeof entry.find === 'string') {
      if (id === entry.find || id.startsWith(`${entry.find}/`)) {
        return entry.replacement + id.slice(entry.find.length);
      }
    } else if (entry.find.test(id)) {
      return id.replace(entry.find, entry.replacement);
    }
  }
  return id;
}

const core = localPath('node_modules/three/build/three.module.js');

test('Bare Three.js resolves to the app-local ESM entry, not shared-3d or repo root', () => {
  assert.ok(isAbsolute(aliased('three')));
  assert.equal(normalize(aliased('three')), normalize(core));
  assert.notEqual(aliased('three'), 'three');
});

test('Both native exporters and their add-ons resolve within the same Three.js package', () => {
  for (const module of ['exporters/GLTFExporter.js', 'exporters/USDZExporter.js', 'controls/OrbitControls.js', 'utils/TextureUtils.js']) {
    const expected = localPath(`node_modules/three/examples/jsm/${module}`);
    assert.equal(normalize(aliased(`three/addons/${module}`)), normalize(expected));
    assert.equal(normalize(aliased(`three/examples/jsm/${module}`)), normalize(expected));
  }
});

test('Aliases preserve cache queries and do not match other package names', () => {
  const id = 'three/addons/exporters/GLTFExporter.js?v=test';
  assert.equal(aliased(id), `${localPath('node_modules/three/examples/jsm/exporters/GLTFExporter.js')}?v=test`);
  for (const id of ['three-other', '@vendor/three', './three.js', 'threeSomething']) assert.equal(aliased(id), id);
});

test('Three.js is deduplicated and not externalized out of the browser bundle', () => {
  assert.ok(config.resolve?.dedupe?.includes('three'));
  assert.equal(config.build.rollupOptions.external, undefined);
  assert.equal(config.build.rolldownOptions?.external, undefined);
});

test('Both editor and phone entries and the existing relative deployment base are retained', () => {
  assert.equal(config.base, './');
  assert.equal(config.build.rollupOptions.input.main, localPath('index.html'));
  assert.equal(config.build.rollupOptions.input.ar, localPath('ar.html'));
  assert.equal(config.build.outDir, 'dist');
  assert.equal(config.build.sourcemap, true);
});

test('Shared capture and Pergola export still use the host-provided Three.js import', async () => {
  const snapshot = await readFile(new URL('../shared-3d/src/ar/productSnapshot.js', projectURL), 'utf8');
  const exporter = await readFile(new URL('src/ar/exportPergola.js', projectURL), 'utf8');
  assert.match(snapshot, /import\s+\*\s+as\s+THREE\s+from\s+['"]three['"]/);
  assert.match(exporter, /productSnapshot\.js/);
  assert.match(exporter, /import\(['"]three\/addons\/exporters\/GLTFExporter\.js['"]\)/);
  assert.match(exporter, /import\(['"]three\/addons\/exporters\/USDZExporter\.js['"]\)/);
});

test('The real Vite resolver handles the out-of-package, cache-versioned shared import', async (t) => {
  let vite;
  try {
    vite = await import('vite');
  } catch (error) {
    const missingVite = error.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package 'vite'/.test(error.message);
    if (missingVite && !process.env.CI) {
      t.skip('Vite is not installed locally; CI requires npm ci and runs this integration test plus the full build.');
      return;
    }
    throw error;
  }
  const server = await vite.createServer({
    configFile: fileURLToPath(configURL),
    root: localPath('./'),
    logLevel: 'error',
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const container = server.environments?.client?.pluginContainer || server.pluginContainer;
    const importers = [
      localPath('src/main.js'),
      localPath('src/ar/exportPergola.js'),
      fileURLToPath(new URL('../shared-3d/src/ar/productSnapshot.js', projectURL)) + '?v=ar-completeness-1',
    ];
    for (const importer of importers) {
      const resolved = await container.resolveId('three', importer);
      assert.ok(resolved && !resolved.external, `Unbundled Three.js import from ${importer}`);
      assert.equal(normalize(resolved.id.split('?')[0]), normalize(core));
      for (const name of ['GLTFExporter', 'USDZExporter']) {
        const addon = await container.resolveId(`three/addons/exporters/${name}.js`, importer);
        assert.ok(addon && !addon.external, `Unbundled ${name} from ${importer}`);
        assert.equal(normalize(addon.id.split('?')[0]), normalize(localPath(`node_modules/three/examples/jsm/exporters/${name}.js`)));
      }
    }
  } finally {
    await server.close();
  }
});
