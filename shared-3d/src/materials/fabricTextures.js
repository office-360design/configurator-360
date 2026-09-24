// A compact, periodic weave. No downloaded images, displacement, geometry holes,
// per-frame noise, or extra rendering pass. Thread pitch is set by the material.
export const FABRIC_TEXTURE_SIZE = 128;
const TAU = Math.PI * 2;
const wrap = (n, size) => ((n % size) + size) % size;

export function sampleScreenWeave(u, v) {
  const x = u * 8, y = v * 8;
  const warp = Math.pow(0.5 + 0.5 * Math.cos(TAU * x), 1.5);
  const weft = Math.pow(0.5 + 0.5 * Math.cos(TAU * y), 1.5);
  const crossing = Math.cos(Math.PI * x) * Math.cos(Math.PI * y);
  const height = (warp + weft) * 0.24 + crossing * (warp - weft) * 0.035;
  const coverage = 1 - (1 - warp) * (1 - weft);
  // Sub-pixel pores average with mipmaps instead of switching between hard
  // alpha-test holes. This is visual see-through, not a measured openness rating.
  return { height, alpha: 0.82 + coverage * 0.18, roughness: 0.96 + coverage * 0.025 };
}

export function createScreenWeavePixels(size = FABRIC_TEXTURE_SIZE) {
  if (!Number.isInteger(size) || size < 64 || size > 512 || (size & (size - 1))) {
    throw new RangeError('Fabric map size must be a power of two from 64 to 512.');
  }
  const heights = new Float32Array(size * size);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const alpha = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, p = i * 4;
    const sample = sampleScreenWeave(x / size, y / size);
    heights[i] = sample.height;
    alpha[p] = alpha[p + 1] = alpha[p + 2] = Math.round(sample.alpha * 255);
    roughness[p] = roughness[p + 1] = roughness[p + 2] = Math.round(sample.roughness * 255);
    alpha[p + 3] = roughness[p + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (a, b) => heights[wrap(b, size) * size + wrap(a, size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * size / FABRIC_TEXTURE_SIZE;
    const dy = (at(x, y + 1) - at(x, y - 1)) * size / FABRIC_TEXTURE_SIZE;
    const length = Math.hypot(dx, dy, 1), p = (y * size + x) * 4;
    normal[p] = Math.round((0.5 - dx / length * 0.5) * 255);
    normal[p + 1] = Math.round((0.5 - dy / length * 0.5) * 255);
    normal[p + 2] = Math.round((0.5 + 0.5 / length) * 255);
    normal[p + 3] = 255;
  }
  return { size, color: null, normal, roughness, alpha };
}
