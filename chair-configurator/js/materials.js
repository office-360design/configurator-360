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

function fbm(u, v, seed = 19, octaves = 4, scale = 4, gain = .5) {
  let total = 0;
  let amplitude = .5;
  let frequency = scale;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += (noise(u, v, frequency, frequency, seed + i * 13) * 2 - 1) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return norm > 0 ? total / norm : 0;
}

function ridge(value, width = .22, power = 2.5) {
  const t = Math.max(0, 1 - Math.abs(value) / width);
  return Math.pow(t, power);
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

function woodField(spec, u, v) {
  const vertical = spec.orientation !== 'horizontal';
  const across = vertical ? u : v;
  const along = vertical ? v : u;
  const broad = fbm(across * .85 + along * .14, along * .45, spec.seed + 3, 4, 2.4, .52);
  const medium = fbm(across * 2.3 + along * .2, along * .9, spec.seed + 9, 4, 3.5, .55);
  const fine = fbm(across * 8.5 + along * .45, along * 6.0, spec.seed + 17, 3, 11, .55);
  const curlNoise = fbm(across * 6.0, along * 2.2, spec.seed + 29, 4, 2.6, .58);
  const curl = Math.sin(TAU * ((across * (spec.grain ?? 9)) + broad * (spec.open ?? .16) + medium * .18 + fine * .03));
  const ring = Math.sin(TAU * ((along * (spec.ringFreq ?? (spec.grain ?? 10))) + broad * (spec.open ?? .16) * 1.6 + medium * .34 + fine * .04));

  let signal = vertical ? ring : curl;
  let figure = 0;
  let pore = 0;
  let knots = 0;
  let cracks = 0;
  let banding = 0;

  switch (spec.style) {
    case 'cathedral': {
      const cathedrals = Math.sin(TAU * (along * (spec.grain ?? 7) + Math.abs(broad) * 1.6 + medium * .45));
      signal = cathedrals;
      figure = ridge(curlNoise - .05, .44, 1.6) * (spec.figure ?? .12);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 7) * 3.6) + medium * .5))), 11) * (spec.pores ?? .08);
      break;
    }
    case 'ring-porous': {
      signal = Math.sin(TAU * (along * (spec.grain ?? 9) + broad * 1.1 + medium * .3));
      figure = Math.sin(TAU * (across * 1.5 + along * 1.1 + broad * .6)) * (spec.figure ?? .08);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 9) * 5.2) + broad * 3.4))), 13) * (spec.pores ?? .1);
      break;
    }
    case 'knotty': {
      signal = Math.sin(TAU * (along * (spec.grain ?? 7) + broad * 1.2 + medium * .35));
      const clusterA = ridge(fbm(across * 1.1, along * .9, spec.seed + 41, 3, 1.4, .55) - .28, .10, 1.8);
      const clusterB = ridge(fbm(across * .8 + .27, along * 1.3, spec.seed + 53, 3, 1.1, .55) + .12, .09, 2.0);
      const knotCenters = [
        [0.22, 0.2, clusterA],
        [0.72, 0.62, clusterB],
        [0.48, 0.82, ridge(fbm(across * 1.3 + .41, along * .8, spec.seed + 67, 3, 1.0, .6) - .18, .08, 1.8)],
      ];
      for (const [cx, cy, weight] of knotCenters) {
        const dx = across - cx;
        const dy = along - cy;
        const dist = Math.hypot(dx * (1.2 + weight * 1.4), dy * (1.1 + weight * 1.6));
        const swirl = ridge(dist - (.13 + weight * .12), .16, 1.8) * (1.1 + weight * 1.5);
        knots += swirl;
      }
      figure = knots * .28;
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 7) * 4.2) + broad * 2.2))), 14) * (spec.pores ?? .03);
      break;
    }
    case 'swirled': {
      const river = Math.sin(TAU * (across * 2.2 + broad * 1.1 + curlNoise * .9));
      signal = Math.sin(TAU * (along * (spec.grain ?? 6.5) + river * .75 + medium * .25));
      figure = ridge(river, .55, 1.2) * (spec.figure ?? .2) + Math.sin(TAU * (across * 5.4 + along * 1.6)) * .04;
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 6.5) * 3.6) + river * 2.4))), 12) * (spec.pores ?? .07);
      break;
    }
    case 'streaked': {
      const stripes = Math.sin(TAU * (across * (spec.grain ?? 14) + medium * .18));
      signal = stripes;
      banding = Math.sin(TAU * (across * ((spec.grain ?? 14) * .45) + broad * 1.2)) * (spec.figure ?? .16);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (across * ((spec.grain ?? 14) * 2.8) + medium * .6))), 14) * (spec.pores ?? .08);
      break;
    }
    case 'striped': {
      const stripes = Math.sin(TAU * (along * (spec.grain ?? 22) + medium * .16));
      signal = stripes;
      banding = Math.sin(TAU * (along * ((spec.grain ?? 22) * .4) + broad * .5)) * (spec.figure ?? .12);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 22) * 3.6) + fine * .6))), 16) * (spec.pores ?? .04);
      break;
    }
    case 'weathered': {
      signal = Math.sin(TAU * (along * (spec.grain ?? 8) + broad * 1.35 + medium * .4));
      const splitA = ridge(Math.sin(TAU * (across * 5.2 + fine * 1.4)), .10, 2.4) * .35;
      const splitB = ridge(Math.sin(TAU * (across * 9.2 + broad * .8 + .21)), .08, 2.8) * .22;
      cracks = (splitA + splitB) * (spec.cracks ?? .18);
      figure = Math.abs(curlNoise) * (spec.figure ?? .12);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 8) * 3.1) + broad * 2.6))), 10) * (spec.pores ?? .06);
      break;
    }
    case 'bamboo': {
      signal = Math.sin(TAU * (along * (spec.grain ?? 24) + broad * .08));
      const nodes = ridge(Math.sin(TAU * (across * (spec.nodeFreq ?? 4.2))), .18, 2.2) * .14;
      figure = nodes;
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 24) * 2.3)))), 14) * (spec.pores ?? .01);
      break;
    }
    default: {
      signal = Math.sin(TAU * (along * (spec.grain ?? 12) + broad * (spec.open ?? .12) * 1.2 + medium * .32));
      figure = Math.sin(TAU * (across * 1.6 + along * 1.5 + curlNoise * .5)) * (spec.figure ?? .05);
      pore = Math.pow(Math.max(0, Math.sin(TAU * (along * ((spec.grain ?? 12) * 4.4) + broad * 2.1))), 14) * (spec.pores ?? .03);
      break;
    }
  }

  const mineral = fbm(across * 12.0, along * 12.0, spec.seed + 91, 2, 16, .5) * .02;
  const contrast = spec.contrast ?? .08;
  const grainTone = signal * contrast;
  const figureTone = figure * 1.1 + banding * .8;
  const wear = cracks * 1.5 + knots * .4;
  const tone = clamp(.84 + grainTone + figureTone + mineral - pore - wear, .18, 1);
  const roughness = clamp((spec.roughness ?? .55) + cracks * .22 + pore * .18 - figure * .04 + Math.abs(mineral) * .18, .3, .98);
  const height = signal * .18 + figure * .25 + banding * .15 - pore * .46 - cracks * .58 + knots * .32;
  return { tone, roughness, height };
}

function createWoodPixels(spec, size = 256) {
  const color = rgba(size);
  const roughness = rgba(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const p = i * 4;
      const field = woodField(spec, u, v);
      writeGray(color, p, field.tone);
      writeGray(roughness, p, field.roughness);
      height[i] = field.height;
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
  wood('beech', ['Beech', 'Fag', 'Buche'], '#b78352', { seed: 3, style: 'straight', grain: 13, contrast: .05, roughness: .52, open: .06, pores: .02, figure: .02 }),
  wood('oak', ['Oak', 'Stejar', 'Eiche'], '#9a6a3a', { seed: 5, style: 'cathedral', grain: 8, contrast: .11, roughness: .57, open: .2, pores: .14, figure: .08 }),
  wood('ash', ['Ash', 'Frasin', 'Esche'], '#baa07c', { seed: 7, style: 'ring-porous', grain: 9, contrast: .1, roughness: .55, open: .2, pores: .12, figure: .07 }),
  wood('maple', ['Maple', 'Arțar', 'Ahorn'], '#c8a97c', { seed: 11, style: 'straight', grain: 16, contrast: .035, roughness: .49, open: .05, pores: .012, figure: .05 }),
  wood('birch', ['Birch', 'Mesteacăn', 'Birke'], '#caa77b', { seed: 13, style: 'straight', grain: 18, contrast: .04, roughness: .5, open: .05, pores: .015, figure: .03 }),
  wood('walnut', ['Walnut', 'Nuc', 'Walnuss'], '#65412b', { seed: 17, style: 'swirled', grain: 6, contrast: .13, roughness: .49, open: .28, pores: .08, figure: .18 }),
  wood('cherry', ['Cherry', 'Cireș', 'Kirschbaum'], '#9a5036', { seed: 19, style: 'straight', grain: 11, contrast: .07, roughness: .47, open: .11, pores: .022, figure: .08 }),
  wood('mahogany', ['Mahogany', 'Mahon', 'Mahagoni'], '#713829', { seed: 23, style: 'streaked', grain: 13, contrast: .06, roughness: .46, open: .09, pores: .05, figure: .12 }),
  wood('teak', ['Teak', 'Teak', 'Teak'], '#93643a', { seed: 29, style: 'streaked', grain: 14, contrast: .07, roughness: .51, open: .08, pores: .05, figure: .06 }),
  wood('wenge', ['Wenge', 'Wenge', 'Wenge'], '#2c211c', { seed: 31, style: 'streaked', grain: 22, contrast: .16, roughness: .58, open: .06, pores: .09, figure: .18 }),
  wood('ebony', ['Ebony', 'Abanos', 'Ebenholz'], '#272321', { seed: 37, style: 'striped', grain: 24, contrast: .055, roughness: .43, open: .03, pores: .012, figure: .04 }),
  wood('pine', ['Pine', 'Pin', 'Kiefer'], '#c49a62', { seed: 41, style: 'knotty', grain: 6.5, contrast: .12, roughness: .63, open: .28, pores: .025, figure: .11 }),
  wood('cedar', ['Cedar', 'Cedru', 'Zeder'], '#a65f44', { seed: 43, style: 'knotty', grain: 8.5, contrast: .09, roughness: .61, open: .16, pores: .028, figure: .09 }),
  wood('acacia', ['Acacia', 'Salcâm', 'Akazie'], '#8f6339', { seed: 47, style: 'swirled', grain: 7, contrast: .12, roughness: .57, open: .22, pores: .06, figure: .16 }),
  wood('elm', ['Elm', 'Ulm', 'Ulme'], '#9a7248', { seed: 53, style: 'cathedral', grain: 8.5, contrast: .11, roughness: .56, open: .18, pores: .08, figure: .1 }),
  wood('bamboo', ['Bamboo', 'Bambus', 'Bambus'], '#c1a46c', { seed: 59, style: 'bamboo', orientation: 'horizontal', grain: 26, nodeFreq: 4.2, contrast: .045, roughness: .53, open: .025, pores: .01, figure: .02 }),
  wood('chestnut', ['Chestnut', 'Castan', 'Kastanie'], '#8f6440', { seed: 61, style: 'cathedral', grain: 7.4, contrast: .11, roughness: .56, open: .22, pores: .11, figure: .09 }),
  wood('olive', ['Olive', 'Măslin', 'Olive'], '#9f7449', { seed: 67, style: 'swirled', grain: 5.8, contrast: .14, roughness: .52, open: .28, pores: .06, figure: .22 }),
  wood('rosewood', ['Rosewood', 'Palisandru', 'Palisander'], '#6f402d', { seed: 71, style: 'streaked', grain: 18, contrast: .15, roughness: .49, open: .12, pores: .05, figure: .2 }),
  wood('zebrawood', ['Zebrawood', 'Zebrano', 'Zebrano'], '#a27747', { seed: 73, style: 'streaked', grain: 16, contrast: .19, roughness: .54, open: .08, pores: .055, figure: .24 }),
  wood('hickory', ['Hickory', 'Hicori', 'Hickory'], '#b28a5d', { seed: 79, style: 'ring-porous', grain: 8.6, contrast: .12, roughness: .58, open: .2, pores: .12, figure: .09 }),
  wood('larch', ['Larch', 'Larice', 'Lärche'], '#b47a4d', { seed: 83, style: 'knotty', grain: 7.2, contrast: .1, roughness: .61, open: .2, pores: .02, figure: .08 }),
  wood('alder', ['Alder', 'Arin', 'Erle'], '#af7d56', { seed: 89, style: 'straight', grain: 12.5, contrast: .055, roughness: .51, open: .08, pores: .02, figure: .05 }),
  wood('reclaimed', ['Reclaimed', 'Reciclat rustic', 'Altholz rustikal'], '#856244', { seed: 97, style: 'weathered', grain: 7.8, contrast: .13, roughness: .66, open: .22, pores: .06, figure: .14, cracks: .2 }),
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

export const WOOD_COLOURS = Object.freeze(['#d3ad7c','#b78352','#93663f','#70452e','#3e2b23','#1f1c1b','#d6c6a7','#9b5f3d','#7f5a3e','#b28a5d']);
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
        texture: textureId, normalStrength: .16, tile: [0.68, 0.12],
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
