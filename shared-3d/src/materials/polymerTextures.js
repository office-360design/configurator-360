// Compact deterministic microstructure for non-metal surfaces. No image requests,
// colour/dirt overlay, displacement, per-frame noise, or extra render pass.
export const POLYMER_TEXTURE_SIZE = 128;
export const POLYMER_TEXTURE_KINDS = Object.freeze(['polymer.molded', 'rubber.fine', 'polymer.cellular']);
const wrap = (n, length) => ((n % length) + length) % length;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function periodicNoise(u, v, frequency, seed) {
  const x = u * frequency, y = v * frequency, ix = Math.floor(x), iy = Math.floor(y);
  const smooth = t => t * t * (3 - 2 * t);
  const tx = smooth(x - ix), ty = smooth(y - iy);
  const at = (a, b) => hash(wrap(a, frequency), wrap(b, frequency), seed);
  return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty)
    + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
}

export function samplePolymerHeight(kind, u, v) {
  const medium = periodicNoise(u, v, 24, 131);
  const fine = periodicNoise(u, v, 48, 173);
  if (kind === 'polymer.molded') return medium * 0.65 + fine * 0.35;
  if (kind === 'rubber.fine') return medium * 0.35 + fine * 0.65;
  if (kind === 'polymer.cellular') {
    // Shallow closed-cell pores, not holes cut through a mesh or dirty albedo.
    const pores = Math.pow(clamp((0.65 - medium) / 0.65, 0, 1), 2);
    return -pores * 0.7 + fine * 0.3;
  }
  throw new Error(`Unknown polymer texture: ${kind}`);
}

export function createPolymerPixels(kind, size = POLYMER_TEXTURE_SIZE) {
  if (!POLYMER_TEXTURE_KINDS.includes(kind)) throw new Error(`Unknown polymer texture: ${kind}`);
  if (!Number.isInteger(size) || size < 64 || size > 512 || (size & (size - 1))) {
    throw new RangeError('Polymer map size must be a power of two from 64 to 512.');
  }
  const heights = new Float32Array(size * size);
  const normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    heights[y * size + x] = samplePolymerHeight(kind, x / size, y / size);
  }
  // Scale the finite difference so changing bake resolution does not change
  // the micro-normal amplitude. Material presets supply the restrained strength.
  const gradientScale = size / POLYMER_TEXTURE_SIZE;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, at = (a, b) => heights[wrap(b, size) * size + wrap(a, size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * gradientScale;
    const dy = (at(x, y + 1) - at(x, y - 1)) * gradientScale;
    const length = Math.hypot(dx, dy, 1), offset = i * 4;
    normal[offset] = Math.round((0.5 - dx / length * 0.5) * 255);
    normal[offset + 1] = Math.round((0.5 - dy / length * 0.5) * 255);
    normal[offset + 2] = Math.round((0.5 + 0.5 / length) * 255);
    normal[offset + 3] = 255;
    // Roughness maps multiply the preset. Keep the mean near one so Low and
    // detailed tiers remain the same finish rather than a glossy/matte switch.
    const value = Math.round(clamp(0.95 + heights[i] * 0.04, 0.93, 0.99) * 255);
    roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = value;
    roughness[offset + 3] = 255;
  }
  return { size, color: null, normal, roughness };
}

export function registerPolymerTextures(textures) {
  for (const kind of POLYMER_TEXTURE_KINDS) textures.register(kind, () => createPolymerPixels(kind));
}
