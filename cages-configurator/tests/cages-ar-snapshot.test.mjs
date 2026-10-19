import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { captureCagesARSnapshot } from '../js/ar/exportCages.js';

test('cage snapshot skips adjacent helpers without modifying the editor or its child list', () => {
  const root = new THREE.Group();
  for (const [name, excluded] of [['sleeper-a', true], ['sleeper-b', true], ['rebar', false], ['bore', true], ['head-label', true], ['tip-label', true]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name; mesh.userData.arExclude = excluded; root.add(mesh);
  }
  const before = JSON.stringify(root.toJSON());
  const snapshot = captureCagesARSnapshot(root);
  assert.equal(snapshot.stats.sourceMeshes, 1);
  assert.deepEqual(snapshot.stats.components, { rebar: 1 });
  assert.equal(JSON.stringify(root.toJSON()), before);
});

test('excluded helper subtrees containing meshes never enter the native model', () => {
  const root = new THREE.Group();
  const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, 12, 8), new THREE.MeshStandardMaterial());
  rebar.name = 'longitudinal-bar'; root.add(rebar);
  const bore = new THREE.Group(); bore.userData.arExclude = true;
  bore.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshStandardMaterial())); root.add(bore);
  const snapshot = captureCagesARSnapshot(root);
  assert.equal(snapshot.stats.sourceMeshes, 1);
  assert.equal(snapshot.stats.size.y, 12);
  assert.ok(snapshot.stats.size.x < .03);
});

test('editor and phone entry points load shared AR styles', () => {
  for (const file of ['index.html', 'ar.html']) {
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, /<link[^>]+rel="stylesheet"[^>]+href="\.\.\/shared-ui\/styles\/ar\.css\?v=/, file);
  }
});
