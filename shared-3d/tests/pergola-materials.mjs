import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { MaterialLibrary, MATERIAL_PRESETS, GeometryLibrary, disposeObjectResources } from '../src/index.js';
import { sampleScreenWeave, createScreenWeavePixels } from '../src/materials/fabricTextures.js';
import { createPergolaMaterialPalette, resolvePergolaAccessorySurface } from '../../pergola-configurator/src/scene/pergolaMaterials.js';
import { fitAssetToBox } from '../../pergola-configurator/src/scene/AssetLibrary.js';
import { buildPergola } from '../../pergola-configurator/src/scene/buildPergola.js';
import { loadPergolaMaterialAssets, pergolaMaterialCases } from './helpers/pergolaMaterialFixtures.mjs';
import { productGeometrySnapshot } from './helpers/geometrySnapshot.mjs';
const sha = v => createHash('sha256').update(v).digest('hex');
const assets = await loadPergolaMaterialAssets();
const ids = ['fabric.screen', 'steel.brushed', 'plastic.diffuser', 'rubber.softTouch'];

for (const id of ids) test(`accessory ${id} uses standard PBR without new physical layers`, () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false }); const m = lib.create(id);
  assert.equal(m.isMeshStandardMaterial, true); assert.equal(!!m.isMeshPhysicalMaterial, false);
  assert.equal(m.metalness, id === 'steel.brushed' ? 1 : 0); assert.equal(m.displacementMap, null);
  if (id !== 'fabric.screen') { assert.equal(m.transparent, false); assert.equal(m.opacity, 1); }
  lib.dispose(); assert.equal(lib.textures.size, 0);
});
test('fabric is seamless, deterministic, restrained and has no albedo overlay', () => {
  const a = createScreenWeavePixels(), b = createScreenWeavePixels();
  assert.equal(a.color, null); assert.equal(a.size, 128);
  for (const k of ['normal', 'roughness', 'alpha']) assert.equal(sha(a[k]), sha(b[k]));
  for (const [u, v] of [[0, 0], [.13, .57], [-.7, 1.02]]) {
    const a = sampleScreenWeave(u, v), b = sampleScreenWeave(u + 1, v - 1);
    for (const key of Object.keys(a)) assert.ok(Math.abs(a[key] - b[key]) < 1e-10);
  }
  for (let i = 0; i < a.normal.length; i += 4) {
    assert.ok(a.alpha[i + 1] >= 209); assert.ok(a.normal[i + 2] >= 250);
    const n = Array.from(a.normal.slice(i, i + 3), v => v / 127.5 - 1);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < .015);
  }
  for (const n of [0, 63, 127, 1024, NaN]) assert.throws(() => createScreenWeavePixels(n));
});
test('screen Low is lightweight and retains comparable see-through after tier changes', () => {
  let requests = 0;
  const lib = new MaterialLibrary(THREE, { quality: 'low', loadTexture: () => { requests++; throw Error(); } });
  const m = lib.create('fabric.screen', { color: '#8f9a95' }); assert.equal(lib.textures.size, 0);
  const lowOpacity = m.opacity;
  for (let i = 0; i < 3; i++) {
    lib.setQuality('balanced');
    for (const map of [m.alphaMap, m.normalMap, m.roughnessMap]) {
      assert.equal(map.image.width, 128); assert.equal(map.colorSpace, THREE.NoColorSpace);
      assert.equal(map.wrapT, THREE.RepeatWrapping); assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
    }
    const pixels = m.alphaMap.image.data; let mean = 0;
    for (let i = 1; i < pixels.length; i += 4) mean += pixels[i] / 255 / (pixels.length / 4);
    assert.ok(Math.abs(m.opacity * mean - lowOpacity) < .02);
    const map = m.alphaMap; lib.setQuality('high'); assert.equal(m.alphaMap, map);
    lib.setQuality('low'); assert.equal(m.alphaMap, null); assert.equal(m.normalMap, null); assert.equal(m.roughnessMap, null);
    assert.equal(m.color.getHexString(), '8f9a95'); assert.equal(m.transparent, true); assert.equal(m.depthWrite, false);
  }
  assert.equal(requests, 0); assert.equal(lib.textures.size, 3); lib.dispose();
});
test('cloned emissive diffusers preserve tint and strength through quality and environment updates', () => {
  const lib = new MaterialLibrary(THREE), a = lib.create('plastic.diffuser', { color: '#b8d1e9', emissive: '#1267cf', emissiveIntensity: 4.5 }), b = lib.clone(a);
  b.color.set('#ffffff');
  for (const q of ['low', 'high', 'balanced']) {
    lib.setQuality(q); lib.setEnvironmentIntensity(.12); lib.setEnvironmentIntensity(1);
    assert.equal(a.color.getHexString(), 'b8d1e9'); assert.equal(b.color.getHexString(), 'ffffff');
    assert.equal(b.emissive.getHexString(), '1267cf'); assert.equal(b.emissiveIntensity, 4.5); assert.equal(b.transparent, false);
  }
  lib.dispose();
});
test('LED channel is not accidentally emissive; only the diffuser glows', () => {
  assert.equal(resolvePergolaAccessorySurface('ledStrip', 'led_channel').id, 'aluminium.bare');
  assert.equal(resolvePergolaAccessorySurface('ledStrip', 'led_channel').options.emissive, undefined);
  assert.equal(resolvePergolaAccessorySurface('ledStrip', 'led_diffuser').id, 'plastic.diffuser');
  assert.equal(resolvePergolaAccessorySurface('ledStrip', 'unrecognized_part'), null);
  assert.equal(resolvePergolaAccessorySurface('futureAsset', 'led_diffuser'), null);
});
test('one assembly palette reuses variants without leaving unreferenced materials', () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false }), palette = createPergolaMaterialPalette(lib);
  const a = palette.get('plastic.rigid', { color: '#fff', roughness: .4 }), b = palette.get('plastic.rigid', { roughness: .4, color: '#fff' });
  assert.equal(a, b); palette.get('rubber.softTouch');
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(), a)); palette.releaseUnused(root);
  assert.equal(lib.materials.size, 1); disposeObjectResources(root, { materialFilter: () => true }); assert.equal(lib.materials.size, 0); lib.dispose();
});
test('asset replacement releases orphan clone materials, retains shared unknown nodes and original sources', () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false }), palette = createPergolaMaterialPalette(lib);
  const model = assets.clone('speaker');
  const before = productGeometrySnapshot(model, { excludeAttributes: ['uv'] }).hash;
  const orphan = model.getObjectByName('speaker_shell').material; let disposed = 0; orphan.addEventListener('dispose', () => disposed++);
  const untouched = new THREE.Mesh(new THREE.BoxGeometry(), orphan); untouched.name = 'future-speaker-part'; model.add(untouched);
  palette.styleAsset(model, 'speaker'); assert.equal(disposed, 0); assert.equal(untouched.material, orphan);
  model.remove(untouched); untouched.geometry.dispose(); palette.styleAsset(model, 'speaker');
  assert.equal(productGeometrySnapshot(model, { excludeAttributes: ['uv'] }).hash, before);
  for (const o of assets.sources.get('speaker').children) if (o.isMesh) assert.equal(o.material.userData.surface, undefined);
  orphan.dispose(); disposeObjectResources(model, { materialFilter: () => true }); lib.dispose();
});
test('fitted hardware mapping respects physical scale without altering vertices, normals or transforms', () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false }), palette = createPergolaMaterialPalette(lib);
  const model = fitAssetToBox(assets.clone('handCrank'), new THREE.Vector3(.23, .78, .12));
  const before = productGeometrySnapshot(model, { excludeAttributes: ['uv'] }).hash;
  palette.styleAsset(model, 'handCrank');
  assert.equal(productGeometrySnapshot(model, { excludeAttributes: ['uv'] }).hash, before);
  let textured = 0;
  model.traverse(o => { if (o.material?.normalMap) { textured++; assert.equal(o.geometry.userData.surfaceUV.units, 'metres'); } });
  assert.ok(textured >= 3); disposeObjectResources(model, { materialFilter: () => true }); assert.equal(lib.materials.size, 0); lib.dispose();
});
for (const item of pergolaMaterialCases()) test(`Pergola accessories/material lifetime: ${item.name}`, () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false }), geo = new GeometryLibrary(THREE);
  const input = JSON.stringify(item.state), group = buildPergola(item.state, assets, lib, geo);
  assert.equal(JSON.stringify(item.state), input);
  const meshes = []; group.traverse(o => { if (o.isMesh) meshes.push(o); });
  const before = productGeometrySnapshot(group).hash;
  for (const q of ['low', 'high', 'balanced']) { lib.setQuality(q); assert.equal(productGeometrySnapshot(group).hash, before); }
  for (const mesh of meshes) for (const a of Object.values(mesh.geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
  if (item.name.includes('screen') && item.name.endsWith('open-100')) assert.equal(lib.getDiagnostics().activeMaterials['fabric.screen'], undefined);
  if (item.name.includes('screen') && !item.name.endsWith('open-100')) assert.ok(meshes.some(m => m.material?.userData.surface?.id === 'fabric.screen'));
  disposeObjectResources(group, { materialFilter: () => true });
  assert.equal(lib.materials.size, 0, 'no orphan managed materials'); assert.equal(geo.geometries.size, 0);
  lib.dispose(); geo.dispose();
});
test.after(() => assets.dispose());
