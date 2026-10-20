import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FacadeScene } from '../js/scene.js';
import { createCortizo, cortizoModel } from '../js/cortizo.js';
import { DEFAULT_STATE, normalizeState } from '../js/facade.js';
import { loadData } from '../cortizo/src/load-node.js';
import { captureCurtainWallARSnapshot, waitForCurtainWallTextures, CURTAIN_WALL_AR_LIMITS } from '../js/ar/exportCurtainWall.js';
import { AR_PRODUCTS, arPhoneUrl, arModelUrl } from '../../shared-ui/src/ar/links.js';
import { AR_COPY } from '../../shared-ui/src/ar/i18n.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';

const cz = createCortizo(loadData());
function build(system, patch = {}) {
  const model = cortizoModel(normalizeState({ ...DEFAULT_STATE, ...patch, cortizo: { system, ...patch.cortizo } }), cz);
  const view = Object.create(FacadeScene.prototype);
  Object.assign(view, { scene: new THREE.Scene(), explode: { value: 0, scale: 1 },
    key: { shadow: { camera: new THREE.OrthographicCamera() }, position: new THREE.Vector3() },
    surface: { invalidate() {}, materials: { create(id, options = {}) {
      const material = id === 'glass.architectural' ? new THREE.MeshPhysicalMaterial({ transmission: 1, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial();
      if (options.color) material.color.set(options.color); return material;
    } } }, invalidate() {} });
  view.build(model); return { view, model };
}
const shape = snapshot => JSON.stringify(snapshot.model.geometries.map(g => g.data));
const json = root => JSON.stringify(root.toJSON());

test('curtain wall explicitly opts into shared AR, retains origin and locale on every country domain', () => {
  assert.ok(AR_PRODUCTS.includes('curtainwall'));
  assert.equal(isConfiguratorAREnabled('curtainwall', { viewAR: true }), true);
  assert.equal(isConfiguratorAREnabled('curtainwall'), false);
  for (const origin of ['https://www.360configurator.com', 'https://360configurator.ro', 'https://www.360konfigurator.de', 'https://www.360configurador.es', 'https://www.360configurateur.fr', 'https://www.360configuratore.it']) {
    for (const [locale, copy] of Object.entries(AR_COPY.curtainwall)) for (const mode of ['android', 'ios']) {
      const url = new URL(arPhoneUrl('A'.repeat(32), mode, locale, origin, 'curtainwall'));
      assert.equal(url.origin, origin); assert.equal(url.pathname, '/curtain-wall-configurator/ar.html');
      assert.equal(url.searchParams.get('lang'), locale); assert.equal(url.searchParams.get('mode'), mode);
      assert.deepEqual(Object.keys(copy).sort(), Object.keys(AR_COPY.curtainwall['en-US']).sort());
      assert.doesNotMatch(JSON.stringify(copy), /configured hall|hall configurator/i);
    }
  }
  assert.match(arModelUrl('A'.repeat(32), 'usdz', 'curtainwall'), /curtainwall\.usdz\?/);
  assert.equal(CURTAIN_WALL_AR_LIMITS.glb, 10 * 1024 * 1024);
});

test('all seven systems capture complete assembled geometry and preserve an exploded editor', () => {
  for (const system of ['TP52', 'SG52', 'TPH52', 'TPV52', 'ST52', 'SST52', 'SKY']) {
    const { view, model } = build(system);
    const assembled = captureCurtainWallARSnapshot(view.root);
    assert.equal(assembled.stats.sourceMeshes, view.root.children.filter(o => o.isMesh).length, system);
    assert.ok(assembled.stats.components.glass > 0, system);
    assert.ok(Math.abs(assembled.stats.size.x - (model.W + model.faceWidth) * .001) < .1, system);
    view.explode.value = .8; view.applyExplode();
    const before = json(view.scene), exploded = captureCurtainWallARSnapshot(view.root);
    assert.equal(shape(assembled), shape(exploded), system);
    assert.equal(json(view.scene), before, system);
    assert.ok(!Object.keys(exploded.stats.components).some(name => name.startsWith('building:')));
    const restored = new THREE.ObjectLoader().parse(exploded.model), bounds = new THREE.Box3().setFromObject(restored);
    assert.ok(Math.abs(bounds.min.y) < 1e-5, system);
    if (system === 'SKY') assert.ok(exploded.stats.size.z > model.H * .0005, 'skylight slope survives');
  }
});

test('grid, finishes, tinted glazing, vents and spandrel panels survive capture', () => {
  const a = build('TP52'), sa = captureCurtainWallARSnapshot(a.view.root);
  const b = build('TP52', { widths: [1200, 1600], heights: [900, 2400], rowTypes: ['spandrel', 'vision'],
    finishOutside: '9016', finishInside: '9005', sameFinish: false, glassTint: 'bronze', cortizo: { fields: [{ row: 1, col: 0, type: 'window' }] } });
  const sb = captureCurtainWallARSnapshot(b.view.root);
  assert.notEqual(shape(sa), shape(sb)); assert.ok(sb.stats.size.x < sa.stats.size.x);
  for (const component of ['panel', 'sash', 'glass']) assert.ok(sb.stats.components[component] > 0, component);
  for (const color of [0xf1f0ea, 0x0e0e10, 0xa8906f]) assert.ok(sb.model.materials.some(m => m.color === color));
  assert.ok(sb.model.materials.some(m => m.opacity > 0 && m.opacity < 1));
});

test('capture keeps source resources alive and rejects missing geometry', () => {
  const { view } = build('TP52'); let disposals = 0;
  view.root.traverse(o => { o.geometry?.addEventListener('dispose', () => disposals++); o.material?.addEventListener('dispose', () => disposals++); });
  captureCurtainWallARSnapshot(view.root); assert.equal(disposals, 0);
  assert.throws(() => captureCurtainWallARSnapshot(), { code: 'not-ready' });
  assert.throws(() => captureCurtainWallARSnapshot(new THREE.Group()), { code: 'not-ready' });
});

test('finish readiness re-reads current roots, rejects broken images and honours cancellation', async () => {
  const { view } = build('TP52'), getRoot = () => view.root;
  await waitForCurtainWallTextures(getRoot);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForCurtainWallTextures(getRoot, { signal: controller.signal }), { name: 'AbortError' });
  const material = view.root.children[0].material; material.map = new THREE.Texture();
  await assert.rejects(waitForCurtainWallTextures(getRoot, { timeoutMs: 0 }), { code: 'textures-unavailable' });
  material.map.image = { complete: true, naturalWidth: 0 };
  await assert.rejects(waitForCurtainWallTextures(getRoot), { code: 'textures-unavailable' });
  let reads = 0; material.map.image = undefined;
  await waitForCurtainWallTextures(() => { if (++reads === 2) material.map = null; return view.root; });
  assert.ok(reads >= 2);
});

test('editor and phone use shared AR styles, and Quick Look has one image child', () => {
  for (const file of ['index.html', 'ar.html']) assert.match(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), /shared-ui\/styles\/ar\.css/);
  const html = readFileSync(new URL('../ar.html', import.meta.url), 'utf8');
  const body = html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)[1];
  assert.match(body, /<img /); assert.doesNotMatch(body, /<span|<div|<button/);
});
