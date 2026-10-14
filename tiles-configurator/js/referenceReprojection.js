import { normalizeRegions } from './pavingRegions.js';

/** Preserve each ring and its identity when changing calibration. A failed point,
 * horizon crossing or invalid topology rejects the WHOLE change, never a hole.
 */
export function reprojectRegions(regions, project, unproject) {
  const mapRing = ring => ring.map(p => {
    const pixel = project(p);
    const q = pixel && unproject(pixel);
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.z))
      throw new Error('The new reference square cannot project the whole design. Adjust it; no regions or holes were removed.');
    return { x: q.x, z: q.z };
  });
  return normalizeRegions(regions.map(r => ({ ...structuredClone(r),
    outer: mapRing(r.outer), holes: r.holes.map(mapRing),
  })));
}
