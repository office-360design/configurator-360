const TAU = Math.PI * 2;
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

function hash(x, y, seed = 19) {
  let n = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise(u, v, fx, fy, seed = 19) {
  const x = u * fx;
  const y = v * fy;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const wrap = (i, size) => ((i % size) + size) % size;
  const at = (a, b) => hash(wrap(a, fx), wrap(b, fy), seed);
  const smooth = (t) => t * t * (3 - 2 * t);
  const tx = smooth(x - ix);
  const ty = smooth(y - iy);
  const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
  const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

function rgba(size) { return new Uint8Array(size * size * 4); }
function writeGray(target, p, value) {
  const n = Math.round(clamp(value) * 255);
  target[p] = target[p + 1] = target[p + 2] = n;
  target[p + 3] = 255;
}

function normalMap(height, size) {
  const normal = rgba(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const p = (y * size + x) * 4;
      const left = height[y * size + (x + size - 1) % size];
      const right = height[y * size + (x + 1) % size];
      const down = height[((y + size - 1) % size) * size + x];
      const up = height[((y + 1) % size) * size + x];
      const dx = right - left;
      const dy = up - down;
      const len = Math.hypot(dx, dy, 1);
      normal[p] = Math.round((-dx / len * .5 + .5) * 255);
      normal[p + 1] = Math.round((-dy / len * .5 + .5) * 255);
      normal[p + 2] = Math.round((1 / len * .5 + .5) * 255);
      normal[p + 3] = 255;
    }
  }
  return normal;
}

function createWoodPixels(spec, size = 256) {
  const color = rgba(size);
  const roughness = rgba(size);
  const height = new Float32Array(size * size);
  const freq = spec.grain ?? 12;
  const openness = spec.open ?? .16;
  const pores = spec.pores ?? .08;
  const figure = spec.figure ?? .12;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const p = i * 4;
      const longitudinal = noise(u, v, 7, 3, spec.seed) - .5;
      const warp = longitudinal * openness + Math.sin(TAU * u * 1.35) * .025;
      const rings = Math.sin(TAU * (v * freq + warp + noise(u, v, 2, 9, spec.seed + 3) * .18));
      const fine = noise(u, v, 32, 96, spec.seed + 9) - .5;
      const med = noise(u, v, 14, 36, spec.seed + 5) - .5;
      const pore = Math.pow(Math.max(0, Math.sin(TAU * (v * (freq * 4.4) + warp * 4))), 14) * pores;
      const figureWave = Math.sin(TAU * (u * 1.7 + v * 2.1 + noise(u, v, 4, 4, spec.seed + 17) * .7)) * figure;
      const tone = clamp(.82 + rings * spec.contrast + med * .11 + fine * .035 + figureWave - pore, .45, 1);
      writeGray(color, p, tone);
      writeGray(roughness, p, clamp(spec.roughness + med * .08 + pore * .18, .32, .92));
      height[i] = rings * .18 + med * .22 + fine * .06 - pore * .55 + figureWave * .22;
    }
  }
  return { size, color, roughness, normal: normalMap(height, size) };
}

function fabricHeight(kind, u, v, seed) {
  const warp = Math.sin(TAU * u * 34);
  const weft = Math.sin(TAU * v * 34);
  const fine = noise(u, v, 90, 90, seed) - .5;
  if (kind === 'linen') return warp * .28 + weft * .25 + fine * .18;
  if (kind === 'canvas') return Math.abs(warp) * .34 + Math.abs(weft) * .34 + fine * .09;
  if (kind === 'wool') return noise(u, v, 28, 28, seed) * .55 + fine * .24;
  if (kind === 'tweed') return warp * .18 + weft * .18 + Math.sin(TAU * (u + v) * 15) * .23 + fine * .15;
  if (kind === 'chenille') return Math.sin(TAU * u * 22) * .38 + noise(u, v, 16, 70, seed) * .25 + fine * .12;
  if (kind === 'boucle') {
    const curls = Math.sin(TAU * noise(u, v, 24, 24, seed) * 4.5);
    return curls * .42 + noise(u, v, 52, 52, seed + 2) * .22;
  }
  if (kind === 'velvet') return Math.sin(TAU * u * 78) * .12 + noise(u, v, 16, 88, seed) * .16;
  if (kind === 'microfiber') return noise(u, v, 72, 72, seed) * .18 + fine * .1;
  if (kind === 'felt') return noise(u, v, 48, 48, seed) * .24 + fine * .12;
  if (kind === 'herringbone') {
    const band = Math.floor(v * 18) % 2 ? u + v : u - v;
    return Math.sin(TAU * band * 24) * .34 + fine * .08;
  }
  if (kind === 'basket') return Math.sin(TAU * u * 18) * Math.sin(TAU * v * 18) * .45 + fine * .08;
  if (kind === 'ribbed') return Math.sin(TAU * u * 24) * .48 + weft * .08 + fine * .08;
  if (kind === 'denim') return Math.sin(TAU * (u + v) * 38) * .27 + Math.sin(TAU * (u - v) * 40) * .14 + fine * .12;
  if (kind === 'melange') return warp * .14 + weft * .14 + noise(u, v, 20, 20, seed) * .26 + fine * .16;
  return warp * .24 + weft * .24 + fine * .12;
}

function createFabricPixels(spec, size = 128) {
  const color = rgba(size);
  const roughness = rgba(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const p = i * 4;
      const h = fabricHeight(spec.pattern, u, v, spec.seed);
      const fleck = noise(u, v, 48, 48, spec.seed + 13) - .5;
      height[i] = h;
      writeGray(color, p, clamp(.87 + h * .055 + fleck * spec.fleck, .62, 1));
      writeGray(roughness, p, clamp(spec.roughness + fleck * .05 - h * .025, .55, .99));
    }
  }
  return { size, color, roughness, normal: normalMap(height, size) };
}

const wood = (id, labels, color, spec) => Object.freeze({ id, labels, color, spec: Object.freeze(spec) });
const fabric = (id, labels, color, spec) => Object.freeze({ id, labels, color, spec: Object.freeze(spec) });

export const WOOD_TYPES = Object.freeze([
  wood('beech', ['Beech', 'Fag', 'Buche'], '#b78352', { seed: 3, grain: 13, contrast: .055, roughness: .52, open: .08, pores: .025, figure: .03 }),
  wood('oak', ['Oak', 'Stejar', 'Eiche'], '#9a6a3a', { seed: 5, grain: 9, contrast: .10, roughness: .56, open: .18, pores: .12, figure: .05 }),
  wood('ash', ['Ash', 'Frasin', 'Esche'], '#b99a6a', { seed: 7, grain: 8, contrast: .11, roughness: .55, open: .22, pores: .10, figure: .08 }),
  wood('maple', ['Maple', 'Arțar', 'Ahorn'], '#c6a374', { seed: 11, grain: 17, contrast: .035, roughness: .49, open: .05, pores: .015, figure: .06 }),
  wood('birch', ['Birch', 'Mesteacăn', 'Birke'], '#c3a070', { seed: 13, grain: 18, contrast: .04, roughness: .50, open: .06, pores: .02, figure: .035 }),
  wood('walnut', ['Walnut', 'Nuc', 'Walnuss'], '#65412b', { seed: 17, grain: 7, contrast: .13, roughness: .50, open: .25, pores: .075, figure: .14 }),
  wood('cherry', ['Cherry', 'Cireș', 'Kirschbaum'], '#9a5036', { seed: 19, grain: 11, contrast: .07, roughness: .47, open: .12, pores: .025, figure: .09 }),
  wood('mahogany', ['Mahogany', 'Mahon', 'Mahagoni'], '#713829', { seed: 23, grain: 12, contrast: .065, roughness: .46, open: .10, pores: .05, figure: .12 }),
  wood('teak', ['Teak', 'Teak', 'Teak'], '#93643a', { seed: 29, grain: 12, contrast: .07, roughness: .51, open: .09, pores: .05, figure: .035 }),
  wood('wenge', ['Wenge', 'Wenge', 'Wenge'], '#2c211c', { seed: 31, grain: 15, contrast: .14, roughness: .57, open: .06, pores: .10, figure: .015 }),
  wood('ebony', ['Ebony', 'Abanos', 'Ebenholz'], '#272321', { seed: 37, grain: 20, contrast: .045, roughness: .43, open: .035, pores: .018, figure: .02 }),
  wood('pine', ['Pine', 'Pin', 'Kiefer'], '#c49a62', { seed: 41, grain: 7, contrast: .14, roughness: .62, open: .28, pores: .025, figure: .10 }),
  wood('cedar', ['Cedar', 'Cedru', 'Zeder'], '#a65f44', { seed: 43, grain: 10, contrast: .09, roughness: .60, open: .18, pores: .03, figure: .08 }),
  wood('acacia', ['Acacia', 'Salcâm', 'Akazie'], '#8f6339', { seed: 47, grain: 8, contrast: .12, roughness: .57, open: .20, pores: .07, figure: .15 }),
  wood('elm', ['Elm', 'Ulm', 'Ulme'], '#9a7248', { seed: 53, grain: 8, contrast: .10, roughness: .56, open: .19, pores: .08, figure: .11 }),
  wood('bamboo', ['Bamboo', 'Bambus', 'Bambus'], '#c1a46c', { seed: 59, grain: 24, contrast: .045, roughness: .53, open: .025, pores: .01, figure: .02 }),
]);

export const FABRIC_TYPES = Object.freeze([
  fabric('linen', ['Linen', 'In', 'Leinen'], '#b88162', { pattern: 'linen', seed: 3, roughness: .92, fleck: .08, sheen: .16, sheenRoughness: .8 }),
  fabric('canvas', ['Cotton canvas', 'Pânză de bumbac', 'Baumwollcanvas'], '#a86e50', { pattern: 'canvas', seed: 5, roughness: .91, fleck: .045, sheen: .12, sheenRoughness: .85 }),
  fabric('wool', ['Wool', 'Lână', 'Wolle'], '#847b70', { pattern: 'wool', seed: 7, roughness: .96, fleck: .11, sheen: .18, sheenRoughness: .88 }),
  fabric('tweed', ['Tweed', 'Tweed', 'Tweed'], '#6f716b', { pattern: 'tweed', seed: 11, roughness: .94, fleck: .13, sheen: .14, sheenRoughness: .9 }),
  fabric('chenille', ['Chenille', 'Șenilă', 'Chenille'], '#8c625d', { pattern: 'chenille', seed: 13, roughness: .93, fleck: .09, sheen: .28, sheenRoughness: .78 }),
  fabric('boucle', ['Bouclé', 'Bouclé', 'Bouclé'], '#d0c0aa', { pattern: 'boucle', seed: 17, roughness: .98, fleck: .10, sheen: .08, sheenRoughness: .95 }),
  fabric('velvet', ['Velvet', 'Catifea', 'Samt'], '#6e3f4c', { pattern: 'velvet', seed: 19, roughness: .68, fleck: .025, sheen: .82, sheenRoughness: .42 }),
  fabric('microfiber', ['Microfiber', 'Microfibră', 'Mikrofaser'], '#876a5b', { pattern: 'microfiber', seed: 23, roughness: .79, fleck: .04, sheen: .38, sheenRoughness: .64 }),
  fabric('felt', ['Felt', 'Fetru', 'Filz'], '#747773', { pattern: 'felt', seed: 29, roughness: .98, fleck: .10, sheen: .06, sheenRoughness: .96 }),
  fabric('herringbone', ['Herringbone', 'Herringbone', 'Fischgrat'], '#807267', { pattern: 'herringbone', seed: 31, roughness: .91, fleck: .045, sheen: .17, sheenRoughness: .84 }),
  fabric('basket', ['Basket weave', 'Țesătură coș', 'Korbgewebe'], '#9b826a', { pattern: 'basket', seed: 37, roughness: .92, fleck: .04, sheen: .13, sheenRoughness: .86 }),
  fabric('ribbed', ['Ribbed weave', 'Țesătură striată', 'Rippengewebe'], '#766760', { pattern: 'ribbed', seed: 41, roughness: .89, fleck: .04, sheen: .22, sheenRoughness: .78 }),
  fabric('denim', ['Denim', 'Denim', 'Denim'], '#45627a', { pattern: 'denim', seed: 43, roughness: .88, fleck: .065, sheen: .12, sheenRoughness: .86 }),
  fabric('melange', ['Melange', 'Melanj', 'Melange'], '#8e8882', { pattern: 'melange', seed: 47, roughness: .94, fleck: .14, sheen: .12, sheenRoughness: .9 }),
]);

export const WOOD_COLOURS = Object.freeze(['#d3ad7c','#b78352','#93663f','#70452e','#3e2b23','#1f1c1b','#d6c6a7','#9b5f3d']);
export const FABRIC_COLOURS = Object.freeze(['#d8cbb9','#b88162','#824d3b','#40536b','#26384a','#6e3f4c','#9b7d95','#6c7a68','#9b8a6b','#585653','#17191b','#e7e4de']);

export function registerChairMaterials(materials) {
  for (const item of WOOD_TYPES) {
    const textureId = `chair.wood.${item.id}`;
    if (!materials.textures.providers.has(textureId)) {
      materials.textures.register(textureId, () => createWoodPixels(item.spec));
    }
    const materialId = `wood.furniture.${item.id}`;
    if (!materials.presets.has(materialId)) {
      materials.register(materialId, {
        type: 'physical', color: item.color, metalness: 0, roughness: item.spec.roughness,
        envMapIntensity: .78, clearcoat: .18, clearcoatRoughness: .36,
        texture: textureId, normalStrength: .14, tile: [0.72, 0.11],
      });
    }
  }
  for (const item of FABRIC_TYPES) {
    const textureId = `chair.fabric.${item.id}`;
    if (!materials.textures.providers.has(textureId)) {
      materials.textures.register(textureId, () => createFabricPixels(item.spec));
    }
    const materialId = `fabric.upholstery.${item.id}`;
    if (!materials.presets.has(materialId)) {
      materials.register(materialId, {
        type: 'physical', color: item.color, metalness: 0, roughness: item.spec.roughness,
        envMapIntensity: .36, sheen: item.spec.sheen, sheenRoughness: item.spec.sheenRoughness,
        sheenColor: '#ffffff', texture: textureId, normalStrength: .12, tile: [0.018, 0.018],
      });
    }
  }
}

export function materialLabel(item, locale = 'en-US') {
  const index = locale === 'ro-RO' ? 1 : locale === 'de-DE' ? 2 : 0;
  return item.labels[index] || item.labels[0];
}
