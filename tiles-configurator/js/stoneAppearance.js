// Hash nominal stone positions, never array indices: clipping/filtering a row
// must not recolour its neighbours or create periodic palette stripes.
function mix(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function stoneAppearance(stone, palette) {
  const polygon = stone.polygon || stone.fragments?.[0];
  const x = stone.shadeX ?? stone.x ?? polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const z = stone.shadeZ ?? stone.z ?? polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length;
  const seed = mix(mix(Math.round(x * 100000)) ^ Math.imul(Math.round(z * 100000), 0x9e3779b1));
  // Woven bonds need consistent contrast between their two directions.
  // Use the darkest/lightest tones of the chosen mix, retaining only subtle
  // per-stone brightness variation. This role is assigned before clipping.
  let base = Array.isArray(palette) ? palette[seed % palette.length] : palette;
  if (Array.isArray(palette) && stone.shadeRole !== undefined) {
    const luminance = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * (n >>> 16) + 0.7152 * ((n >>> 8) & 255) + 0.0722 * (n & 255);
    };
    const tones = [...palette].sort((a, b) => luminance(a) - luminance(b));
    base = stone.shadeRole === 0 ? tones[0] : tones[tones.length - 1];
  }
  return { base, brightness: 0.96 + (mix(seed ^ 0x68bc21eb) / 4294967296) * 0.08 };
}
