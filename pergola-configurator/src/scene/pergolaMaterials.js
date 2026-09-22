import * as THREE from 'three';
import { applyGeometrySurfaceUVs } from '../../../shared-3d/src/geometry/surfaceMapping.js?v=platform-18';

export const PERGOLA_MATERIALS_VERSION = '20260910-pergola-materials-17';

// Render roles, not manufacturing BOM assignments. Material variants are lazy,
// per-build; images/maps remain owned by the scene's shared MaterialLibrary.
export function createPergolaMaterialAdapter(surfaces) {
  if (!surfaces) return null;
  const cache = new Map();
  let importedFlags = null; // Synchronous per-adapter scope, never shared by scenes.
  const get = (id, options = {}) => {
    if (importedFlags) options = { ...options, ...importedFlags };
    const key = JSON.stringify([id, options]);
    if (!cache.has(key)) cache.set(key, surfaces.create(id, options));
    return cache.get(key);
  };
  const coated = color => get('aluminium.powderCoated', { color });
  const rigid = color => get('plastic.rigid', { color });
  const satin = color => get('metal.satin', { color });
  const rubber = color => get('rubber.epdm', { color });

  /** Only independent accessory clones from AssetLibrary enter here. Replace
   * and release their old material instances, never the borrowed source maps.
   * Positions, normals, indices, groups and fitted transforms remain untouched.
   */
  function style(model, resolve) {
    const retired = new Set(), retained = new Set();
    model.updateWorldMatrix(true, true);
    model.traverse(child => {
      if (!child.isMesh) return;
      const previousFlags = importedFlags;
      // Demo GLBs often have no NORMAL attribute. Keep derivative flat shading
      // for those meshes; do not mutate a material also used by normal-authored
      // generated meshes, or manufacture/weld any new vertices.
      importedFlags = { flatShading: !child.geometry?.attributes?.normal };
      let next;
      try { next = resolve(child.name || '', child); } finally { importedFlags = previousFlags; }
      if (!next) return;
      for (const old of Array.isArray(child.material) ? child.material : [child.material]) if (old && old !== next) retired.add(old);
      child.material = next;
      const definition = surfaces.presets.get(next.userData.surface.id);
      const g = child.geometry;
      if (!(definition.texture || definition.textureSet) || !g?.attributes?.position) return;
      // Imported tangent/morph/skinned geometry keeps its authored mapping.
      if (child.isSkinnedMesh || g.attributes.tangent || Object.keys(g.morphAttributes || {}).length) return;
      if (g.userData.surfaceUV?.preserve) return;
      const e = child.matrixWorld.elements;
      const scale = [Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])];
      if (!scale.every(v => Number.isFinite(v) && v > 0)) return;
      g.computeBoundingBox();
      const size = g.boundingBox.getSize(new THREE.Vector3()).toArray().map((v, i) => v * scale[i]);
      const grainAxis = ['x', 'y', 'z'][size.indexOf(Math.max(...size))];
      // An indexed box with shared corners and no normals cannot support
      // independent face UV seams without splitting geometry. Project its
      // broad visible face instead. This is suitable for the small demo skins
      // and speaker grille; retain all authored topology/normals unchanged.
      const normalAxis = ['x', 'y', 'z'].filter(a => a !== grainAxis)
        .sort((a, b) => size[['x', 'y', 'z'].indexOf(a)] - size[['x', 'y', 'z'].indexOf(b)])[0];
      applyGeometrySurfaceUVs(THREE, g, g.attributes.normal
        ? { mode: 'box', grainAxis, scale }
        : { mode: 'planar', grainAxis, normalAxis, scale });
    });
    // Protect any instance still referenced by an unclassified part.
    model.traverse(child => {
      for (const m of Array.isArray(child.material) ? child.material : [child.material]) if (m) retained.add(m);
    });
    for (const old of retired) if (!retained.has(old)) old.dispose();
    return model;
  }
  return { get, coated, rigid, satin, rubber, style };
}
