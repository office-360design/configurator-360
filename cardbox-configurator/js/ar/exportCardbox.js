import * as THREE from 'three';
import { captureProductARSnapshot } from '../../../shared-3d/src/ar/productSnapshot.js?v=ar-completeness-1';

export const CARDBOX_AR_LIMITS = Object.freeze({ glb: 10 * 1024 * 1024, usdz: 24 * 1024 * 1024 });
function fail(code) { const error = new Error(code); error.code = code; throw error; }

/** Wait for the newest artwork generation, including a restore/resize which
 * replaces an earlier pending image render. Abort/timeout never changes the editor.
 */
export async function waitForCardboxArtwork(getTask, { signal, fontsReady, timeoutMs = 15000 } = {}) {
  let timer, abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { const error = new Error('not-ready'); error.code = 'not-ready'; reject(error); }, timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve(fontsReady), interrupted]);
    for (;;) {
      const task = getTask();
      await Promise.race([Promise.resolve(task), interrupted]);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (task === getTask()) return;
    }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

/** Snapshot the current rendered packaging rather than constructing a default box.
 * Editor coordinates are millimetres. Only the product and committed artwork are
 * included. Inspection transparency/lift/hide-artwork are undone on copies, while
 * actual upper/lower closure rotations remain exactly as captured.
 */
export function captureCardboxARSnapshot({ boxGroup, textGroup, imageGroup, closureGroup, featureGroup, lidLiftMm = 0, closures = {} } = {}) {
  if (!boxGroup?.isObject3D || !boxGroup.children.length) fail('not-ready');
  if (!Number.isFinite(lidLiftMm) || lidLiftMm < 0) fail('invalid-configuration');
  const source = new THREE.Group();
  source.scale.setScalar(0.001);
  const copiedMaterials = new Map(), ownGeometries = new Set(), ownMaterials = new Set();
  const restoreMaterial = material => {
    if (!material) fail('invalid-geometry');
    if (copiedMaterials.has(material)) return copiedMaterials.get(material);
    const copy = material.clone();
    const base = material.userData?.cardboxPresentationBase;
    if (base) for (const key of ['transparent', 'opacity', 'depthWrite', 'alphaTest']) copy[key] = base[key];
    copiedMaterials.set(material, copy); ownMaterials.add(copy);
    return copy;
  };

  // Native AR exporters do not consistently support Line/LineLoop primitives.
  // Retain the configured closure/handle reinforcement cues as fine physical
  // seams in the export, but not the editor's technical wireframe or selection.
  function lineAsMesh(line) {
    const p = line.geometry?.getAttribute('position');
    if (!p?.count) return null;
    const material = restoreMaterial(line.material);
    const group = new THREE.Group(); group.name = 'closure-or-reinforcement-detail';
    group.position.copy(line.position); group.quaternion.copy(line.quaternion); group.scale.copy(line.scale);
    const total = line.geometry.index?.count || p.count;
    const at = i => new THREE.Vector3().fromBufferAttribute(p, line.geometry.index ? line.geometry.index.getX(i) : i);
    const first = Math.max(0, line.geometry.drawRange.start);
    const end = Math.min(total, first + line.geometry.drawRange.count);
    let travelled = 0;
    const emit = (a, b) => {
      const distance = a.distanceTo(b); if (distance < 1e-5) return;
      const geometry = new THREE.CylinderGeometry(0.3, 0.3, distance, 4, 1, false);
      ownGeometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'closure-or-reinforcement-detail';
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(mesh);
    };
    function segment(a, b) {
      const length = a.distanceTo(b); if (length < 1e-5) return;
      if (!material.isLineDashedMaterial) emit(a, b);
      else {
        const scale = Math.max(1e-6, material.scale || 1);
        const dash = Math.max(0.1, material.dashSize / scale), gap = Math.max(0.1, material.gapSize / scale), period = dash + gap;
        let cursor = 0;
        while (cursor < length - 1e-5) {
          const phase = (travelled + cursor) % period;
          const remaining = phase < dash ? dash - phase : period - phase;
          const next = Math.min(length, cursor + Math.max(remaining, 1e-5));
          if (phase < dash) emit(a.clone().lerp(b, cursor / length), a.clone().lerp(b, next / length));
          cursor = next;
        }
      }
      travelled += length;
    }
    for (let i = first + 1; i < end; i++) segment(at(i - 1), at(i));
    if (line.isLineLoop && end - first > 2) segment(at(end - 1), at(first));
    return group;
  }
  function clean(object, family, onSurface = false) {
    const isSurface = Boolean(object.userData.cardboxSurface);
    if (object.userData.arExclude || (object.isMesh && object.material?.depthTest === false)) return false;
    const closure = object.userData.cardboxToolSurface || (object.userData.top ? 'top' : object.userData.bottom ? 'bottom' : '');
    if ((closure === 'top' || closure === 'bottom') && closures[closure] === 'open') return false;
    if (closure === 'top' && !onSurface) object.position.y -= lidLiftMm;
    if (object.isMesh) {
      object.material = Array.isArray(object.material) ? object.material.map(restoreMaterial) : restoreMaterial(object.material);
      if (!object.name) object.name = isSurface ? `box-${object.userData.faceKey || 'panel'}-${object.userData.surfaceSideFactor < 0 ? 'inner' : 'outer'}`
        : object.userData.cardboxText ? 'printed-text' : object.userData.cardboxImage ? 'printed-image' : family;
    }
    for (const child of [...object.children]) {
      if (child.isLine) {
        const physical = !child.isLineSegments && (family === 'closures' || family === 'features' || (child.isLineLoop && isSurface));
        object.remove(child);
        if (physical && child.visible && !child.userData.arExclude) {
          const closure = child.userData.cardboxToolSurface;
          if ((closure === 'top' || closure === 'bottom') && closures[closure] === 'open') continue;
          const replacement = lineAsMesh(child);
          if (replacement) {
            if (closure === 'top' && !isSurface && !onSurface) replacement.position.y -= lidLiftMm;
            object.add(replacement);
          }
        }
      } else if (!clean(child, family, onSurface || isSurface)) object.remove(child);
    }
    return true;
  }
  try {
    for (const [family, original] of [['panels', boxGroup], ['text', textGroup], ['images', imageGroup], ['closures', closureGroup], ['features', featureGroup]]) {
      if (!original) continue;
      if (!original.isObject3D) fail('invalid-geometry');
      const part = original.clone(true); // borrows geometry/textures, copies transforms
      part.position.y = 0; // The whole-box inspection lift is not a product dimension.
      if (family === 'text' || family === 'images') part.visible = true;
      clean(part, family); source.add(part);
    }
    source.updateMatrixWorld(true);
    return captureProductARSnapshot(source, { product: 'cardbox' });
  } finally {
    ownGeometries.forEach(g => g.dispose());
    ownMaterials.forEach(m => m.dispose());
    // Never dispose the live editor's borrowed textures or surface geometry.
  }
}

function disposeExport(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

export async function createCardboxFirebaseARAsset(snapshot, format, onProgress = () => {}) {
  if (!Object.hasOwn(CARDBOX_AR_LIMITS, format)) fail('invalid-format');
  if (!snapshot?.model?.object) fail('not-ready');
  onProgress('building');
  const root = await new THREE.ObjectLoader().parseAsync(snapshot.model);
  try {
    root.updateMatrixWorld(true); onProgress('exporting');
    await new Promise(resolve => setTimeout(resolve, 0));
    let output;
    if (format === 'glb') {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      output = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    } else {
      // Use the same pinned r169 runtime as the Cardbox editor/import map.
      const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
      output = await new USDZExporter().parseAsync(root, {
        quickLookCompatible: true, maxTextureSize: 1024, onlyVisible: true,
        includeAnchoringProperties: true,
        ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
      });
    }
    const binary = output instanceof ArrayBuffer ? output : ArrayBuffer.isView(output)
      ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) : null;
    if (!binary || binary.byteLength < 128) fail('export-failed');
    if (binary.byteLength > CARDBOX_AR_LIMITS[format]) fail('model-too-large');
    return { blob: new Blob([binary], { type: format === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip' }), format, stats: snapshot.stats };
  } finally { disposeExport(root); }
}
