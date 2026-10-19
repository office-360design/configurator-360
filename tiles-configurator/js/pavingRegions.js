/**
 * Paving geometry in one fixed, metric coordinate frame.
 * Rings are open arrays (no repeated closing point), outer rings CCW and holes CW.
 * No rasterisation, convex hull, bounding-box recentering, or lossy simplification.
 * State/boolean entry points validate and return new values; geometry helpers consume validated regions.
 */
export const REGION_LIMITS = Object.freeze({ vertices: 4096, rings: 128, regions: 64,
  coordinate: 1000, extent: 200, triangles: 32768, candidates: 150000,
  pieces: 60000, fragments: 60000, clipWork: 2000000 });
const EPS = 1e-8;
// Coordinates, not object identity, key these bounded caches: callers may edit
// their own snapshots and can never bypass validation by reusing an array.
const ringCache = new Map(), topologyCache = new Map();
function remember(cache, key, value, maximum) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > maximum) cache.delete(cache.keys().next().value);
}
const area2 = (p) => p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z;
}, 0);
export const ringArea = (p) => Math.abs(area2(p)) / 2;
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
const bounds = (p) => p.reduce((b, v) => ({ minX: Math.min(b.minX, v.x), minZ: Math.min(b.minZ, v.z),
  maxX: Math.max(b.maxX, v.x), maxZ: Math.max(b.maxZ, v.z) }),
{ minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
const overlaps = (a, b) => a.minX <= b.maxX + EPS && b.minX <= a.maxX + EPS &&
  a.minZ <= b.maxZ + EPS && b.minZ <= a.maxZ + EPS;
const invalid = () => { throw new Error('invalidRegions'); };
const limit = () => { throw new Error('areaTooComplex'); };
function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) <= EPS * Math.max(1, distance(a, b)) &&
    p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
    p.z >= Math.min(a.z, b.z) - EPS && p.z <= Math.max(a.z, b.z) + EPS;
}
/** -1 outside, 0 on the boundary, 1 inside. */
export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(a, b, p)) return 0;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside ? 1 : -1;
}
export function pointInRegions(p, regions) {
  return regions.some((r) => pointInRing(p, r.outer) >= 0 &&
    !r.holes.some((h) => pointInRing(p, h) >= 0));
}
function intersections(a, b, c, d) {
  if (!overlaps(bounds([a, b]), bounds([c, d]))) return [];
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const den = rx * sz - rz * sx, qx = c.x - a.x, qz = c.z - a.z;
  if (Math.abs(den) > 1e-12 * Math.max(1, Math.hypot(rx, rz) * Math.hypot(sx, sz))) {
    const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
      ? [[Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))]] : [];
  }
  if (Math.abs(qx * rz - qz * rx) > EPS * Math.max(1, Math.hypot(rx, rz))) return [];
  const rr = rx * rx + rz * rz, ss = sx * sx + sz * sz;
  const pairs = [];
  for (const p of [a, b, c, d]) {
    if (!onSegment(a, b, p) || !onSegment(c, d, p)) continue;
    pairs.push([((p.x - a.x) * rx + (p.z - a.z) * rz) / rr,
      ((p.x - c.x) * sx + (p.z - c.z) * sz) / ss]);
  }
  return pairs;
}
export function cleanRing(input, clockwise = false) {
  if (!Array.isArray(input) || input.length < 3) invalid();
  if (input.length > REGION_LIMITS.vertices + 1) limit();
  const p = [];
  for (const v of input) {
    if (!v || typeof v.x !== 'number' || typeof v.z !== 'number' ||
        !Number.isFinite(v.x) || !Number.isFinite(v.z)) invalid();
    if (Math.abs(v.x) > REGION_LIMITS.coordinate || Math.abs(v.z) > REGION_LIMITS.coordinate) limit();
    const q = { x: v.x, z: v.z };
    if (!p.length || distance(p.at(-1), q) > EPS) p.push(q);
  }
  if (p.length > 1 && distance(p[0], p.at(-1)) <= EPS) p.pop();
  if (p.length < 3 || ringArea(p) < 1e-7) invalid();
  const cacheKey = `${clockwise}:${JSON.stringify(p)}`;
  if (ringCache.has(cacheKey)) return ringCache.get(cacheKey).map((v) => ({ ...v }));
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], prev = p[(i + p.length - 1) % p.length];
    // Straight redundant vertices are valid; doubling back is not.
    if (Math.abs(cross(prev, a, b)) < EPS &&
        (prev.x - a.x) * (b.x - a.x) + (prev.z - a.z) * (b.z - a.z) > EPS) invalid();
    for (let j = i + 2; j < p.length; j++) {
      if ((j + 1) % p.length === i) continue;
      if (intersections(a, b, p[j], p[(j + 1) % p.length]).length) invalid();
    }
  }
  if ((area2(p) < 0) !== clockwise) p.reverse();
  remember(ringCache, cacheKey, p.map((v) => ({ ...v })), 32);
  return p;
}
function ringsIntersect(a, b, allowPointTouch = false) {
  if (!overlaps(bounds(a), bounds(b))) return false;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const hits = intersections(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
    if (!hits.length) continue;
    if (!allowPointTouch || hits.some(([t, u]) => t > EPS && t < 1 - EPS || u > EPS && u < 1 - EPS))
      return true;
    // A common edge is not an isolated point touch.
    if (hits.some(([t]) => Math.abs(t - hits[0][0]) > EPS)) return true;
  }
  return false;
}
/** Local topology check for removing one vertex from already validated regions.
 * Only the replacement chord and the swept triangle can change the topology.
 */
export function canRemoveBoundaryVertex(regions, regionIndex, holeIndex, vertexIndex) {
  const region = regions[regionIndex], ring = holeIndex < 0 ? region.outer : region.holes[holeIndex],
    n = ring.length, previous = (vertexIndex + n - 1) % n,
    a = ring[previous], b = ring[vertexIndex], c = ring[(vertexIndex + 1) % n];
  if (n <= 3 || distance(a, c) <= EPS) return false;
  const before = area2(ring), after = before - cross(a, b, c);
  if (Math.abs(after) < 2e-7 || (before < 0) !== (after < 0)) return false;
  for (const r of regions) for (const boundary of [r.outer, ...r.holes]) {
    // A whole hole or island can lie in the swept triangle without crossing
    // the new chord. Reject that containment change as well as intersections.
    if (boundary !== ring && Math.abs(cross(a, b, c)) > EPS && pointInRing(boundary[0], [a, b, c]) >= 0) return false;
    for (let i = 0; i < boundary.length; i++) {
      if (boundary === ring && (i === previous || i === vertexIndex)) continue;
      const hits = intersections(a, c, boundary[i], boundary[(i + 1) % boundary.length]);
      // Only the two existing neighbouring edges may share chord endpoints.
      if (hits.length && (boundary !== ring ||
          i !== (previous + n - 1) % n && i !== (vertexIndex + 1) % n ||
          hits.some(([t]) => Math.abs(t - hits[0][0]) > EPS) ||
          hits.some(([t, u]) => t > EPS && t < 1 - EPS || u > EPS && u < 1 - EPS))) return false;
    }
  }
  return true;
}
const ringSamples = (p) => p.flatMap((a, i) => [a, mix(a, p[(i + 1) % p.length], .5)]);
const strictlyInRegion = (p, r) => pointInRing(p, r.outer) === 1 &&
  r.holes.every((h) => pointInRing(p, h) === -1);
/** Strict topology validation. Empty is a deliberate, valid paving selection. */
export function normalizeRegions(input) {
  if (!Array.isArray(input)) invalid();
  if (input.length > REGION_LIMITS.regions) limit();
  let vertices = 0, rings = 0;
  const ids = new Set();
  const regions = input.map((r, i) => {
    if (!r || !Array.isArray(r.holes ?? [])) invalid();
    const rawRings = [r.outer, ...(r.holes || [])];
    for (const p of rawRings) {
      if (!Array.isArray(p)) invalid();
      vertices += p.length; rings++;
    }
    if (vertices > REGION_LIMITS.vertices || rings > REGION_LIMITS.rings) limit();
    const outer = cleanRing(r.outer), holes = (r.holes || []).map((h) => cleanRing(h, true));
    let id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) && !ids.has(r.id) ? r.id : `region-${i + 1}`;
    while (ids.has(id)) id += '-new';
    ids.add(id);
    // Edge flags are authoritative when supplied; otherwise use the boundary
    // toggle. Reverse edge indices along with clockwise input coordinates.
    const edges = [outer, ...holes].map((ring, n) => {
      const supplied = r.curbs?.edges?.[n], reverse = (area2(rawRings[n]) < 0) !== (n > 0);
      return ring.map((_, k) => {
        const index = reverse ? (ring.length - 2 - k + ring.length) % ring.length : k;
        return Array.isArray(supplied) && supplied.length === ring.length && typeof supplied[index] === 'boolean'
          ? supplied[index] : n === 0 ? r.curbs?.outer !== false : r.curbs?.holes?.[n - 1] === true;
      });
    });
    return { id, outer, holes, curbs: { outer: edges[0].some(Boolean),
      holes: edges.slice(1).map((e) => e.some(Boolean)), edges } };

  });
  const topologyKey = JSON.stringify(regions.map((r) => [r.outer, ...r.holes]));
  if (topologyCache.has(topologyKey)) return regions;
  for (const r of regions) {
    r.holes.forEach((h, i) => {
      if (pointInRing(h[0], r.outer) !== 1 || ringsIntersect(h, r.outer)) invalid();
      for (let j = 0; j < i; j++) {
        const other = r.holes[j];
        if (ringsIntersect(h, other) || pointInRing(h[0], other) >= 0 || pointInRing(other[0], h) >= 0) invalid();
      }
    });
  }
  for (let i = 0; i < regions.length; i++) for (let j = 0; j < i; j++) {
    const a = regions[i], b = regions[j];
    if (!overlaps(bounds(a.outer), bounds(b.outer))) continue;
    for (const ra of [a.outer, ...a.holes]) for (const rb of [b.outer, ...b.holes])
      if (ringsIntersect(ra, rb, true)) invalid();
    if (ringSamples(a.outer).some((p) => strictlyInRegion(p, b)) ||
        ringSamples(b.outer).some((p) => strictlyInRegion(p, a))) invalid();
  }
  if (regions.length) {
    const b = bounds(regions.flatMap((r) => r.outer));
    if (b.maxX - b.minX > REGION_LIMITS.extent || b.maxZ - b.minZ > REGION_LIMITS.extent) limit();
  }
  remember(topologyCache, topologyKey, true, 8);
  return regions;
}
export function regionGeometry(regions, origin = { x: 0, z: 0 }) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z) ||
      Math.abs(origin.x) > REGION_LIMITS.coordinate || Math.abs(origin.z) > REGION_LIMITS.coordinate) invalid();
  const all = regions.flatMap((r) => r.outer);
  const b = all.length ? bounds(all) : { minX: origin.x, maxX: origin.x, minZ: origin.z, maxZ: origin.z };
  const boundaries = regions.flatMap((r, region) => [r.outer, ...r.holes].map((points, ring) => ({
    key: `${r.id}:${ring}`, region, ring, hole: ring > 0, points,
    enabled: r.curbs.edges?.[ring]?.some(Boolean) ?? (ring ? r.curbs.holes[ring - 1] : r.curbs.outer),
    edges: r.curbs.edges?.[ring],
    lengths: points.map((p, i) => distance(p, points[(i + 1) % points.length])),
  })));
  return { regionMode: true, ...b, width: b.maxX - b.minX, depth: b.maxZ - b.minZ,
    centerX: origin.x, centerZ: origin.z, regions, boundaries,
    points: regions[0]?.outer || [], lengths: boundaries[0]?.lengths || [],
    area: regions.reduce((sum, r) => sum + ringArea(r.outer) - r.holes.reduce((s, h) => s + ringArea(h), 0), 0),
    perimeter: boundaries.reduce((sum, b) => sum + b.lengths.reduce((s, l) => s + l, 0), 0),
  };
}
function edgesOf(regions, owner) {
  return regions.flatMap((r) => [r.outer, ...r.holes].flatMap((p) => p.map((a, i) => ({
    a, b: p[(i + 1) % p.length], owner, cuts: [0, 1],
  }))));
}
function simplifyStraight(p) {
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (onSegment(a, c, b)) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
const sameRing = (a, b) => {
  const x = simplifyStraight([...a]), y = simplifyStraight([...b]);
  return x.length === y.length && x.every((p) => y.some((q) => distance(p, q) <= EPS));
};
/** Polygon union/difference by splitting and classifying planar boundary edges. */
export function combineRegions(input, patchPoints, operation = 'add') {
  if (!['add', 'remove'].includes(operation)) invalid();
  const a = normalizeRegions(input), patch = cleanRing(patchPoints),
    b = normalizeRegions([{ outer: patch, holes: [] }]);
  if (!a.length) return operation === 'remove' ? [] : b;
  const edgesA = edgesOf(a, 0), edgesB = edgesOf(b, 1), edges = [...edgesA, ...edgesB];
  if (edges.length > REGION_LIMITS.vertices) limit();
  for (const e of edgesA) for (const f of edgesB)
    for (const [t, u] of intersections(e.a, e.b, f.a, f.b)) { e.cuts.push(t); f.cuts.push(u); }
  const pool = new Map();
  const key = (p) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;
  const intern = (p) => {
    // Search neighbouring quantisation cells so almost-identical intersections join.
    const ix = Math.round(p.x / EPS), iz = Math.round(p.z / EPS);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const q = pool.get(`${ix + dx},${iz + dz}`);
      if (q && distance(p, q) <= EPS) return q;
    }
    pool.set(key(p), p); return p;
  };
  const output = new Map(), boolean = (x, y) => operation === 'add' ? x || y : x && !y;
  for (const e of edges) {
    const cuts = e.cuts.sort((x, y) => x - y).filter((t, i, ts) => i === 0 || t - ts[i - 1] > 1e-10);
    for (let i = 1; i < cuts.length; i++) {
      let p = intern(mix(e.a, e.b, cuts[i - 1])), q = intern(mix(e.a, e.b, cuts[i]));
      if (distance(p, q) <= EPS) continue;
      const mid = mix(p, q, .5), other = e.owner ? edgesA : edgesB;
      const coincident = other.find((f) => onSegment(f.a, f.b, mid) &&
        Math.abs(cross(p, q, f.a)) <= EPS * Math.max(1, distance(p, q)) &&
        Math.abs(cross(p, q, f.b)) <= EPS * Math.max(1, distance(p, q)));
      let ol, or;
      if (coincident) {
        const same = (q.x - p.x) * (coincident.b.x - coincident.a.x) +
          (q.z - p.z) * (coincident.b.z - coincident.a.z) > 0;
        ol = same; or = !same;
      } else { ol = or = pointInRegions(mid, e.owner ? a : b); }
      const left = e.owner ? boolean(ol, true) : boolean(true, ol),
        right = e.owner ? boolean(or, false) : boolean(false, or);
      if (left === right) continue;
      if (!left) [p, q] = [q, p];
      output.set(`${key(p)}>${key(q)}`, { a: p, b: q, used: false });
      if (output.size > REGION_LIMITS.vertices * 4) limit();
    }
  }
  const adjacency = new Map();
  for (const e of output.values()) {
    const k = key(e.a); if (!adjacency.has(k)) adjacency.set(k, []); adjacency.get(k).push(e);
  }
  const loops = [], tau = Math.PI * 2;
  for (const first of output.values()) {
    if (first.used) continue;
    let e = first; const loop = [], start = key(e.a);
    for (let guard = 0; ; guard++) {
      if (e.used || guard > output.size) invalid();
      e.used = true; loop.push(e.a);
      if (key(e.b) === start) break;
      const candidates = (adjacency.get(key(e.b)) || []).filter((n) => !n.used);
      if (!candidates.length) invalid();
      const back = Math.atan2(e.a.z - e.b.z, e.a.x - e.b.x);
      // The next half-edge immediately clockwise from the reverse edge bounds the same left face.
      const turn = (n) => (back - Math.atan2(n.b.z - n.a.z, n.b.x - n.a.x) + tau) % tau;
      candidates.sort((x, y) => turn(x) - turn(y)); e = candidates[0];
    }
    if (loop.length >= 3 && ringArea(loop) >= 1e-7) loops.push(simplifyStraight(loop));
  }
  const outers = loops.filter((p) => area2(p) > 0), holes = loops.filter((p) => area2(p) < 0);
  const result = outers.map((outer, i) => {
    const old = a.find((r) => sameRing(r.outer, outer));
    return { id: old?.id || `region-new-${i + 1}`, outer, holes: [],
      curbs: { outer: old?.curbs.outer ?? a.some((r) => r.curbs.outer), holes: [] } };
  });
  for (const h of holes) {
    const owner = result.filter((r) => pointInRing(h[0], r.outer) === 1)
      .sort((x, y) => ringArea(x.outer) - ringArea(y.outer))[0];
    if (!owner) invalid();
    owner.holes.push(h);
    owner.curbs.holes.push(a.some((r) => r.holes.some((old, i) => r.curbs.holes[i] && sameRing(old, h))));
  }
  if (result.length === a.length && result.every((r) => a.some((old) =>
    sameRing(old.outer, r.outer) && old.holes.length === r.holes.length &&
    old.holes.every((h) => r.holes.some((q) => sameRing(h, q)))))) return a;
  // Retain enabled/disabled edges that survive a correction; new internal edges
  // do not gain curbs by accident. The UI can opt in an entire boundary later.
  for (const r of result) {
    r.curbs.edges = [r.outer, ...r.holes].map((ring, ri) => ring.map((p, i) => {
      const mid = mix(p, ring[(i + 1) % ring.length], .5);
      for (const old of a) for (let h = 0; h <= old.holes.length; h++) {
        const oldRing = h ? old.holes[h - 1] : old.outer;
        const edge = oldRing.findIndex((v, j) => onSegment(v, oldRing[(j + 1) % oldRing.length], mid));
        if (edge >= 0) return old.curbs.edges[h][edge];
      }
      return ri === 0 && r.curbs.outer;
    }));
  }
  return normalizeRegions(result);
}
/**
 * Scan bands are split at every vertex ordinate. Within a band, intersections
 * cannot change order for a valid polygon. Pairing them (even/odd) emits disjoint
 * trapezoids, including holes and islands, then two CCW triangles per trapezoid.
 */
export function triangulateRegions(regions) {
  const triangles = [];
  for (const r of regions) {
    const rings = [r.outer, ...r.holes], points = rings.flat(),
      zs = [...new Set(points.map((p) => p.z))].sort((a, b) => a - b),
      edges = rings.flatMap((p) => p.map((a, i) => [a, p[(i + 1) % p.length]]))
        .filter(([a, b]) => a.z !== b.z);
    const atZ = ([a, b], z) => ({ x: a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z), z });
    for (let j = 1; j < zs.length; j++) {
      const low = zs[j - 1], high = zs[j];
      if (high - low < 1e-10) continue;
      const mid = (low + high) / 2,
        active = edges.filter(([a, b]) => Math.min(a.z, b.z) < mid && Math.max(a.z, b.z) > mid)
          .sort((a, b) => atZ(a, mid).x - atZ(b, mid).x);
      if (active.length % 2) invalid();
      for (let i = 0; i < active.length; i += 2) {
        const a = atZ(active[i], low), b = atZ(active[i + 1], low),
          c = atZ(active[i + 1], high), d = atZ(active[i], high);
        for (const tri of [[a, b, c], [a, c, d]]) if (cross(...tri) > 1e-12) triangles.push(tri);
        if (triangles.length > REGION_LIMITS.triangles) limit();
      }
    }
  }
  return triangles;
}
/** Bounded spatial index: tile clipping examines nearby triangles, not every contour triangle. */
export function triangleIndex(triangles, cell = .5) {
  const buckets = new Map(), large = [], boxes = triangles.map(bounds);
  const cells = (b) => [Math.floor(b.minX / cell), Math.floor(b.maxX / cell),
    Math.floor(b.minZ / cell), Math.floor(b.maxZ / cell)];
  boxes.forEach((b, i) => {
    const [x0, x1, z0, z1] = cells(b);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 512) { large.push(i); return; }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = `${x}:${z}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i);
    }
  });
  return (x, z, l, w) => {
    const b = { minX: x, minZ: z, maxX: x + l, maxZ: z + w }, ids = new Set(large),
      [x0, x1, z0, z1] = cells(b);
    for (let xx = x0; xx <= x1; xx++) for (let zz = z0; zz <= z1; zz++)
      for (const i of buckets.get(`${xx}:${zz}`) || []) ids.add(i);
    return [...ids].filter((i) => overlaps(b, boxes[i])).map((i) => triangles[i]);
  };
}
