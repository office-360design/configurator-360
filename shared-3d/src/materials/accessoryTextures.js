// Local, seamless detail maps. These describe appearance, not measured porosity,
// thread counts or acoustic performance. No added geometry or alpha-test holes.
const TAU = 2 * Math.PI;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createAccessoryPixels(kind, size = 128) {
  if (!['fabric.weave', 'grille.perforated'].includes(kind)) throw new Error(`Unknown accessory texture: ${kind}`);
  if (!Number.isInteger(size) || size < 32 || size > 512) throw new RangeError('Accessory texture size must be 32..512.');
  const height = new Float32Array(size * size);
  const normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(normal.length);
  const color = kind === 'grille.perforated' ? new Uint8Array(normal.length) : null;
  const alpha = kind === 'fabric.weave' ? new Uint8Array(normal.length) : null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = y * size + x, p = i * 4;
    let h, r;
    if (kind === 'fabric.weave') {
      // Eight restrained warp/weft crossings per 12 mm tile. Mipmapping removes
      // the microscopic pattern naturally at product-view distances.
      const warp = (1 + Math.cos(TAU * u * 8)) * .5;
      const weft = (1 + Math.cos(TAU * v * 8)) * .5;
      const over = Math.sin(TAU * u * 4) * Math.sin(TAU * v * 4);
      h = .26 * warp + .26 * weft + .10 * over;
      r = .94 + .05 * (1 - Math.max(warp, weft));
      // Soft thread coverage, not binary cutouts: mipmaps converge to 0.825.
      // The material compensates that average to retain its 0.72 presentation
      // opacity when detail is toggled. This is not a measured openness rating.
      const coverage = 1 - (1 - warp) * (1 - weft);
      alpha[p] = alpha[p + 1] = alpha[p + 2] = Math.round((.30 + .70 * coverage) * 255);
      alpha[p + 3] = 255;
    } else {
      const row = Math.floor(v * 8);
      const cu = ((u * 8 + (row % 2) * .5) % 1 + 1) % 1;
      const cv = (v * 8) % 1;
      const distance = Math.hypot(cu - .5, cv - .5);
      const recess = 1 - smooth(.20, .32, distance);
      h = .25 * (1 - recess);
      r = .92 + .07 * recess;
      const tone = Math.round((1 - .65 * recess) * 255);
      color[p] = color[p + 1] = color[p + 2] = tone; color[p + 3] = 255;
    }
    height[i] = h;
    roughness[p] = roughness[p + 1] = roughness[p + 2] = Math.round(clamp(r) * 255); roughness[p + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    const dx = height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size];
    const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
    const length = Math.hypot(dx, dy, 1);
    normal[p] = Math.round((-dx / length * .5 + .5) * 255);
    normal[p + 1] = Math.round((-dy / length * .5 + .5) * 255);
    normal[p + 2] = Math.round((1 / length * .5 + .5) * 255); normal[p + 3] = 255;
  }
  return { color, normal, roughness, alpha };
}

export function registerAccessoryTextures(textures) {
  for (const kind of ['fabric.weave', 'grille.perforated']) {
    textures.register(kind, () => ({ size: 128, ...createAccessoryPixels(kind) }));
  }
}
