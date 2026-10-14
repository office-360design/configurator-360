import * as THREE from 'three';
import { TILES, CURBS, COLORS, layout, curbLayout, areaGeometry } from '../model.js';
import { polygonArea } from '../area.js';
import { pavementCutSurfaces, curbCutSurfaces } from '../surfaceLayout.js?v=tiles-ar-1';
import { stoneAppearance } from '../stoneAppearance.js';

export const PAVEMENT_TOP_Y = 0.004;
export const CURB_EXPOSED_HEIGHT = 0.035;
const MAX_TRIANGLES = 300000;
function fail(code) { const e = new Error(code); e.code = code; throw e; }

/** Concrete's seeded detail, encoded as a portable normal map for both viewers.
 * The noise is the same deterministic sequence as the editor, not an external
 * texture download. Colours are per-stone materials (also work in Quick Look).
 */
function concreteNormalMap() {
  const side = 128, noise = new Uint8Array(side * side);
  let seed = 17;
  for (let i = 0; i < noise.length; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    noise[i] = 170 + (seed % 65);
  }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) fail('export-failed');
  const image = ctx.createImageData(side, side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const at = (a,b) => noise[((b + side) % side) * side + ((a + side) % side)] / 255;
    const nx = (at(x-1,y) - at(x+1,y)) * 0.45;
    const ny = (at(x,y-1) - at(x,y+1)) * 0.45;
    const n = Math.hypot(nx,ny,1), i = (y * side + x) * 4;
    image.data.set([Math.round((nx/n+1)*127.5),Math.round((ny/n+1)*127.5),Math.round((1/n+1)*127.5),255],i);
  }
  ctx.putImageData(image,0,0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.name = 'Pavement concrete detail';
  return texture;
}

/** Rebuild only the configured paving product. House footprints still cut the
 * tiles and curbs, but the context house, site photo and editing overlays are
 * never uploaded. Full stone/curb thickness is retained below finished grade.
 */
export function buildPavementARModel(state, { textures = true } = {}) {
  const parts = layout(state), curbs = curbLayout(state), bounds = areaGeometry(state);
  const cuts = pavementCutSurfaces(parts,state), curbCuts = curbCutSurfaces(curbs,state);
  const plain = parts.filter(p => !p.fragments), plainCurbs = curbs.filter(p => !p.polygon && !p.fragments);
  const root = new THREE.Group(); root.name = 'Configured pavement';
  const materials = new Map(), geometries = new Set();
  let normalMap = null, triangles = 0;
  // Every rectangular solid needs 12 triangles; fail explicitly, never drop
  // later stones/curbs just to produce a smaller model.
  if ((plain.length + plainCurbs.length) * 12 > MAX_TRIANGLES) fail('model-too-large');
  function materialFor(stone, colour) {
    const look = stoneAppearance(stone,COLORS[colour]);
    const c = new THREE.Color(look.base).multiplyScalar(look.brightness);
    const key = c.getHexString();
    if (!materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, normalMap });
      material.name = `Pavement ${colour} ${key}`; materials.set(key,material);
    }
    return materials.get(key);
  }
  function add(geometry, material, name) {
    geometries.add(geometry);
    triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
    if (triangles > MAX_TRIANGLES) fail('model-too-large');
    const mesh = new THREE.Mesh(geometry,material); mesh.name=name; root.add(mesh); return mesh;
  }
  const dispose = () => {
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());normalMap?.dispose();
    root.clear();
  };
  try {
    if (textures) normalMap=concreteNormalMap();
    const box = new THREE.BoxGeometry(1,1,1);geometries.add(box);
    function boxes(pieces, height, baseY, colorFor, name) {
      for (const p of pieces) {
        const mesh=add(box,materialFor(p,colorFor(p)),name);
        mesh.position.set(p.x-bounds.width/2,baseY+height/2,p.z-bounds.depth/2);
        mesh.rotation.y=-THREE.MathUtils.degToRad(Number(p.rotation)||0);
        mesh.scale.set(Math.max(0.001,p.l-0.003),height,Math.max(0.001,p.w-0.003));
      }
    }
    function polygons(items,height,baseY,name) {
      for (const {polygon,color,stone} of items) {
        if (polygon.length<3 || polygonArea(polygon)<1e-9) continue;
        const shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(p.x,-p.z)));
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
        geometry.rotateX(-Math.PI/2);
        geometry.translate(-bounds.width/2,baseY,-bounds.depth/2);
        add(geometry,materialFor(stone,color),name);
      }
    }
    const thickness=TILES[state.tile].thickness, curbHeight=CURBS[state.curb].height;
    boxes(plain,thickness,PAVEMENT_TOP_Y-thickness,p=>p.accent?state.accent:state.color,'pavement-tile');
    polygons(cuts,thickness,PAVEMENT_TOP_Y-thickness,'pavement-cut-tile');
    const exposed=Math.min(CURB_EXPOSED_HEIGHT,curbHeight);
    boxes(plainCurbs,curbHeight,exposed-curbHeight,()=>state.curbColor,'pavement-curb');
    polygons(curbCuts,curbHeight,exposed-curbHeight,'pavement-cut-curb');
    root.updateMatrixWorld(true);
    if (!parts.length || !root.children.length) fail('empty-pavement');
    return { root, dispose, counts: { tiles: parts.length, curbs: curbs.length, triangles } };
  } catch(error) { dispose();throw error; }
}
