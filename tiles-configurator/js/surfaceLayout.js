import { clipRect } from './area.js';

/** Inset visible cut faces without changing the layout's nominal/BOM areas. */
export function pavementCutSurfaces(parts, state) {
  const cuts = [];
  for (const p of parts) for (const fragment of p.fragments || []) {
    const rotated = Math.abs((Number(p.rotation) || 0) % 180) > 1e-6;
    let polygon;
    if (p.profile) {
      polygon = fragment.map(v => ({ x: p.x + (v.x - p.x) * 0.985, z: p.z + (v.z - p.z) * 0.985 }));
    } else if (rotated) {
      const cx = fragment.reduce((sum, v) => sum + v.x, 0) / fragment.length;
      const cz = fragment.reduce((sum, v) => sum + v.z, 0) / fragment.length;
      const inset = Math.min(0.02, 0.0015 / Math.max(0.001, Math.min(p.l, p.w)));
      const factor = Math.max(0.9, 1 - inset);
      polygon = fragment.map(v => ({ x: cx + (v.x - cx) * factor, z: cz + (v.z - cz) * factor }));
    } else {
      polygon = clipRect(fragment, p.x - p.l / 2 + 0.0015, p.z - p.w / 2 + 0.0015,
        Math.max(0.001, p.l - 0.003), Math.max(0.001, p.w - 0.003));
    }
    cuts.push({ polygon, color: p.accent ? state.accent : state.color, stone: p });
  }
  return cuts;
}

export function curbCutSurfaces(curbs, state) {
  return curbs.flatMap(p => (p.fragments || (p.polygon ? [p.polygon] : []))
    .map(polygon => ({ polygon, stone: p })))
    .map(p => {
      const cx = p.polygon.reduce((a, v) => a + v.x, 0) / p.polygon.length;
      const cz = p.polygon.reduce((a, v) => a + v.z, 0) / p.polygon.length;
      return {
        polygon: p.polygon.map(v => ({ x: cx + (v.x - cx) * 0.996, z: cz + (v.z - cz) * 0.996 })),
        color: state.curbColor, stone: p.stone,
      };
    });
}
