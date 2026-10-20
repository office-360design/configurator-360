import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from '../../window-configurator/src/client/lib/three.module.js';
import { readCameraState, assertCameraUnchanged, waitForStableView, CAMERA_EPSILON } from './camera-guard.mjs';

function fixture() {
  const host = { clientWidth: 966, clientHeight: 825 };
  const camera = new PerspectiveCamera(38, host.clientWidth / host.clientHeight, 1, 18000);
  const controls = { target: new Vector3(0, 850, 0) };
  camera.position.set(1500, 1250, 1850);
  camera.lookAt(controls.target);
  return { camera, controls, host, read: () => readCameraState(camera, controls, host) };
}

test('camera baseline is detached, and harmless matrix-cache refreshes do not change the view', () => {
  const f = fixture(), before = f.read();
  f.camera.updateMatrixWorld(true);
  assertCameraUnchanged(before, f.read());
  f.camera.position.x += 1;
  assert.equal(before.position[0], 1500);
  assert.throws(() => assertCameraUnchanged(before, f.read()), /camera.position.0/);
});

test('tiny floating-point roundoff is allowed but actual movement is rejected', () => {
  const f = fixture(), before = f.read();
  f.camera.position.x += CAMERA_EPSILON / 4;
  assertCameraUnchanged(before, f.read());
  f.camera.position.x += 0.001;
  assert.throws(() => assertCameraUnchanged(before, f.read()), /camera.position/);
});

for (const [label, mutate, expected] of [
  ['camera translation', f => f.camera.position.y += 1, /camera.position/],
  ['camera rotation', f => f.camera.rotateY(0.01), /camera.quaternion/],
  ['orbit target', f => f.controls.target.z += 1, /camera.target/],
  ['zoom', f => f.camera.zoom *= 1.01, /camera.lens.zoom/],
  ['field of view', f => f.camera.fov += 0.1, /camera.lens.fov/],
  ['aspect ratio from a one-pixel resize', f => f.camera.aspect = 966 / 824, /camera.lens.aspect/],
  ['projection-only mutation', f => f.camera.projectionMatrix.elements[0] += 0.01, /camera.projection/],
  ['viewport resize', f => f.host.clientHeight += 1, /camera.viewport/],
]) {
  test(`the preservation assertion still rejects ${label}`, () => {
    const f = fixture(), before = f.read();
    mutate(f);
    assert.throws(() => assertCameraUnchanged(before, f.read()), expected);
  });
}

test('non-finite values and missing properties do not pass as numerical noise', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const f = fixture(), before = f.read();
    f.camera.position.x = value;
    assert.throws(() => assertCameraUnchanged(before, f.read()), /camera.position/);
  }
  const f = fixture(), before = f.read(), after = f.read();
  delete after.lens.aspect;
  assert.throws(() => assertCameraUnchanged(before, after), /structure differs/);
});

test('baseline waits for a delayed viewport resize and matching camera projection', async () => {
  const f = fixture();
  let frames = 0;
  const current = await waitForStableView(f.camera, f.controls, f.host, {
    nextFrame: async () => {
      frames += 1;
      if (frames === 2) f.host.clientHeight = 824;
      // Simulate ResizeObserver's later delivery rather than forcing a resize.
      if (frames === 5) {
        f.camera.aspect = f.host.clientWidth / f.host.clientHeight;
        f.camera.updateProjectionMatrix();
      }
    },
  });
  assert.ok(frames >= 9);
  assert.equal(current.viewport.height, 824);
  assert.equal(current.lens.aspect, 966 / 824);
  assertCameraUnchanged(current, f.read());
});

test('a continuously moving camera times out rather than accepting an unstable baseline', async () => {
  const f = fixture();
  await assert.rejects(waitForStableView(f.camera, f.controls, f.host, {
    maxFrames: 10,
    nextFrame: async () => { f.camera.position.x += 1; },
  }), /did not settle/);
});

test('a stale projection times out even if the viewport has stopped changing', async () => {
  const f = fixture();
  f.host.clientHeight += 1;
  await assert.rejects(waitForStableView(f.camera, f.controls, f.host, {
    maxFrames: 10, nextFrame: async () => {},
  }), /did not settle/);
});
