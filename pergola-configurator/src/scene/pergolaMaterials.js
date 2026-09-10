import * as THREE from 'three';
import { applyGeometrySurfaceUVs } from '../../../shared-3d/src/index.js?v=pergola-17';

export const PERGOLA_MATERIALS_VERSION = '20260910-pergola-materials-17';
const finish = (id, color, extra = {}) => ({ id, options: { color, ...extra } });
const coat = color => finish('aluminium.powderCoated', color);
const plastic = color => finish('plastic.rigid', color);
const rubber = color => finish('rubber.softTouch', color);
const steel = color => finish('steel.brushed', color);

/** Exact demo-asset node identities. Unknown future nodes retain their authored
 * materials instead of being guessed from a substring or recolored wholesale.
 * These are render-only choices, not BOM or manufacturer material declarations.
 */
export function resolvePergolaAccessorySurface(asset, name, context = {}) {
  if (asset === 'ledStrip') {
    if (name === 'led_channel') return finish('aluminium.bare', '#b8c0c3');
    if (name === 'led_diffuser') return finish('plastic.diffuser', context.color ?? '#fff4c6', {
      emissive: context.color ?? '#fff4c6', emissiveIntensity: 4.5,
    });
  } else if (asset === 'screenCassette') {
    if (name === 'screen_cassette') return coat('#202b30');
    if (name === 'screen_motor') return plastic('#202b30');
  } else if (asset === 'spotlight') {
    if (name === 'spot_lens') return finish('plastic.diffuser', '#fff4c6', {
      emissive: '#ffdf7a', emissiveIntensity: 3, roughness: 0.15,
    });
    if (name === 'spot_body' || name === 'spot_trim') return coat('#111719');
  } else if (asset === 'heater') {
    // Preserve the existing heated element (including its emission). Only the
    // opaque housing gets the common coating, not a plastic material near heat.
    if (['heater_body', 'heater_top', 'heater_end_left', 'heater_end_right'].includes(name)) return coat('#171b1d');
  } else if (asset === 'rainSensor') {
    if (name === 'rain_base') return plastic('#263238');
    if (name === 'rain_cap') return plastic('#e8eceb');
    if (/^rain_grid_\d+$/.test(name)) return steel('#c9d0d0');
  } else if (asset === 'windSensor') {
    if (name === 'wind_mast' || /^wind_arm_\d+$/.test(name)) return steel('#98a4a9');
    if (name === 'wind_mount') return coat('#222a2e');
    if (name === 'wind_hub' || /^wind_cup_\d+$/.test(name)) return plastic('#222a2e');
  } else if (asset === 'speaker') {
    if (name === 'speaker_shell') return plastic('#171d20');
    if (name === 'speaker_grille') return coat('#3b454a');
    if (name === 'speaker_bracket') return coat('#171d20');
    if (name === 'speaker_driver_top' || name === 'speaker_driver_bottom') return rubber('#3b454a');
  } else if (asset === 'handCrank') {
    if (name === 'crank_grip') return rubber('#566168');
    if (['crank_eye', 'crank_rod', 'crank_elbow'].includes(name)) return steel('#98a4a9');
    if (name === 'crank_gearbox') return coat('#566168');
  } else if (asset === 'wallSwitch') {
    if (name === 'switch_back') return plastic('#566168');
    if (name === 'switch_face') return plastic('#eceeea');
    if (name === 'switch_up' || name === 'switch_down') return plastic('#0878c9');
  }
  return null;
}

/** One palette per generated assembly. Shares immutable material variants within
 * the assembly; maps remain scene-library owned. It never mutates GLTF sources.
 */
export function createPergolaMaterialPalette(surfaces) {
  if (!surfaces?.create) throw new TypeError('A shared material library is required.');
  const variants = new Map();
  const palette = {
    get(id, options = {}) {
      const key = `${id}:${JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)))}`;
      if (!variants.has(key)) variants.set(key, surfaces.create(id, options));
      return variants.get(key);
    },
    styleAsset(root, asset, context = {}) {
      const replaced = new Set(), scale = new THREE.Vector3();
      root.updateMatrixWorld(true);
      root.traverse(mesh => {
        if (!mesh.isMesh) return;
        const recipe = resolvePergolaAccessorySurface(asset, mesh.name, context);
        if (!recipe) return;
        const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of previous) if (material) replaced.add(material);
        mesh.material = palette.get(recipe.id, { ...recipe.options, flatShading: !mesh.geometry?.attributes?.normal });
        mesh.userData.pergolaSurface = { asset, material: recipe.id, version: PERGOLA_MATERIALS_VERSION };
        // Existing fitted GLBs are independent clones. Apply metre-scale UVs
        // after fitting, without moving vertices or changing topology/normals.
        // Unknown, skinned, tangent or morph-authored assets keep authored UVs.
        const g = mesh.geometry;
        if (!mesh.isSkinnedMesh && g?.attributes?.position && !g.attributes.tangent
          && !Object.keys(g.morphAttributes ?? {}).length && surfaces.presets.get(recipe.id)?.texture) {
          mesh.getWorldScale(scale);
          if ([scale.x, scale.y, scale.z].every(value => Number.isFinite(value) && value > 0)) {
            g.computeBoundingBox();
            const size = g.boundingBox.getSize(new THREE.Vector3()).multiply(scale);
            const axis = ['x', 'y', 'z'][size.toArray().indexOf(Math.max(size.x, size.y, size.z))];
            const mapping = { mode: 'box', grainAxis: axis, scale: scale.toArray() };
            if (g.attributes.normal) applyGeometrySurfaceUVs(THREE, g, mapping);
            else {
              // Several shipped GLBs omit normals AND UVs. Derive a projection
              // basis in scratch storage only; the original keeps its exact
              // vertices/indices and derivative-based flat surface shading.
              const scratch = g.clone();
              try {
                scratch.computeVertexNormals();
                applyGeometrySurfaceUVs(THREE, scratch, mapping);
                g.setAttribute('uv', scratch.attributes.uv.clone());
                g.userData.surfaceUV = { ...scratch.userData.surfaceUV };
                g.userData.surfaceMapping = { ...scratch.userData.surfaceMapping };
              } finally { scratch.dispose(); }
            }
          }
        }
      });
      // Imported clones own their old materials. Do not leak replacements and
      // do not dispose anything still referenced by an unrecognized node.
      root.traverse(mesh => {
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) replaced.delete(m);
      });
      for (const m of replaced) if (![...variants.values()].includes(m)) m.dispose();
      return root;
    },
    releaseUnused(root) {
      const used = new Set();
      root.traverse(object => {
        for (const m of (Array.isArray(object.material) ? object.material : [object.material])) used.add(m);
      });
      for (const [key, material] of variants) if (!used.has(material)) { material.dispose(); variants.delete(key); }
    },
  };
  return palette;
}
