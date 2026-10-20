/** Test-only camera preservation checks. Never pause or alter the live editor.
 * Compare meaningful view properties, not serialization caches. The tiny
 * absolute tolerance permits floating-point roundoff, not visible movement.
 */
export const CAMERA_EPSILON = 1e-9;

export function readCameraState(camera, controls, host) {
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    up: camera.up.toArray(),
    scale: camera.scale.toArray(),
    target: controls.target.toArray(),
    lens: {
      fov: camera.fov, aspect: camera.aspect, zoom: camera.zoom,
      near: camera.near, far: camera.far, focus: camera.focus,
      filmGauge: camera.filmGauge, filmOffset: camera.filmOffset,
    },
    projection: camera.projectionMatrix.toArray(),
    view: camera.view ? { ...camera.view } : null,
    viewport: { width: host.clientWidth, height: host.clientHeight },
  };
}

export function assertCameraUnchanged(before, after, path = 'camera') {
  if (typeof before === 'number' && typeof after === 'number') {
    if (!Number.isFinite(before) || !Number.isFinite(after)
      || Math.abs(before - after) > CAMERA_EPSILON) {
      throw new Error(`Camera changed at ${path}: ${before} -> ${after}`);
    }
  } else if (before && after && typeof before === 'object' && typeof after === 'object') {
    const keys = Object.keys(before).sort();
    if (Array.isArray(before) !== Array.isArray(after)
      || JSON.stringify(keys) !== JSON.stringify(Object.keys(after).sort())) {
      throw new Error(`Camera changed at ${path}: state structure differs`);
    }
    for (const key of keys) assertCameraUnchanged(before[key], after[key], `${path}.${key}`);
  } else if (before !== after) {
    throw new Error(`Camera changed at ${path}: ${before} -> ${after}`);
  }
}

/** Called BEFORE the export baseline, never after an export to hide a change.
 * A capture awaits requestAnimationFrame; ResizeObserver can finish a pending
 * layout resize in that time. Wait until the measured viewport and projection
 * agree and remain stable over consecutive frames before taking a baseline.
 */
export async function waitForStableView(camera, controls, host, {
  nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve)),
  maxFrames = 180,
  stableFrames = 4,
} = {}) {
  let previous = null, stable = 0, current;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    await nextFrame();
    current = readCameraState(camera, controls, host);
    const { width, height } = current.viewport;
    const ready = width > 0 && height > 0 && Number.isFinite(camera.aspect)
      && Math.abs(camera.aspect - width / height) <= CAMERA_EPSILON;
    if (ready && previous) {
      try {
        assertCameraUnchanged(previous, current);
        stable += 1;
      } catch {
        stable = 0;
      }
    } else {
      stable = 0;
    }
    if (stable >= stableFrames) return current;
    previous = current;
  }
  throw new Error(`Editor view did not settle before AR test: ${JSON.stringify(current)}`);
}
