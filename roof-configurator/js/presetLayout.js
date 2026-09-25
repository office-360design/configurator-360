import { validateLayout, signedArea, onSegment, distance, cross } from './roofLayout.js?v=layout-19';

const rounded = value => Math.round(value * 1e7) / 1e7;
const key = p => `${rounded(p.x)},${rounded(p.z)}`;
const rect = (x0, x1, z0, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
function clip(points, heightDifference) {
  const result = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], da = heightDifference(a), db = heightDifference(b);
    if (da >= -1e-8) result.push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const t = da / (da - db);
      result.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
    }
  });
  return result;
}

// Assemble plane patches, removing cell boundaries and retaining separate
// heights at dormer/wing steps. Explicit plan links join their X/Z positions.
export function assembleLayoutPatches(patches) {
  patches = patches.filter(p => p.points.length >= 3 && Math.abs(signedArea(p.points)) > 1e-8);
  const positions = [...new Map(patches.flatMap(p => p.points).map(p => [key(p), p])).values()];
  const byPlane = new Map();
  for (const patch of patches) {
    let points = patch.points;
    if (signedArea(points) < 0) points = [...points].reverse();
    const edges = byPlane.get(patch.plane) || new Map();
    byPlane.set(patch.plane, edges);
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const chain = positions.filter(p => onSegment(p, a, b)).sort((p, q) => distance(a, p) - distance(a, q));
      for (let j = 0; j + 1 < chain.length; j++) {
        const start = chain[j], end = chain[j + 1];
        const reverse = `${key(end)}:${key(start)}`;
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(`${key(start)}:${key(end)}`, [start, end, patch.height]);
      }
    });
  }
  const rings = [];
  for (const edges of byPlane.values()) {
    while (edges.size) {
      const first = edges.values().next().value;
      const points = [], height = first[2];
      let current = first[0];
      do {
        const entry = [...edges].find(([, edge]) => key(edge[0]) === key(current));
        if (!entry) throw new Error('Cannot connect preset roof surfaces.');
        points.push(current);
        current = entry[1][1];
        edges.delete(entry[0]);
      } while (key(current) !== key(first[0]));
      // Remove cell subdivision points before joining adjacent planes.
      let changed = true;
      while (changed && points.length > 3) {
        changed = false;
        for (let i = 0; i < points.length; i++) {
          if (Math.abs(cross(points[(i + points.length - 1) % points.length], points[i], points[(i + 1) % points.length])) < 1e-8) {
            points.splice(i, 1); changed = true; break;
          }
        }
      }
      rings.push({ points, height });
    }
  }
  const corners = [...new Map(rings.flatMap(r => r.points).map(p => [key(p), p])).values()];
  const vertices = [], faces = [], ids = new Map(), links = new Map();
  for (const ring of rings) {
    const face = [];
    ring.points.forEach((a, i) => {
      const b = ring.points[(i + 1) % ring.points.length];
      const chain = corners.filter(p => onSegment(p, a, b) && key(p) !== key(b))
        .sort((p, q) => distance(a, p) - distance(a, q));
      chain.forEach(p => {
        const h = ring.height(p), fullKey = `${key(p)},${rounded(h)}`;
        if (!ids.has(fullKey)) {
          const id = vertices.length;
          ids.set(fullKey, id); vertices.push({ x: p.x, z: p.z, h });
          links.set(key(p), [...(links.get(key(p)) || []), id]);
        }
        face.push(ids.get(fullKey));
      });
    });
    faces.push(face);
  }
  const perimeter = new Map();
  faces.forEach(face => face.forEach((a, i) => {
    const b = face[(i + 1) % face.length], reverse = `${key(vertices[b])}:${key(vertices[a])}`;
    if (perimeter.has(reverse)) perimeter.delete(reverse);
    else perimeter.set(`${key(vertices[a])}:${key(vertices[b])}`, [a, b]);
  }));
  const boundary = [], first = perimeter.values().next().value[0];
  let current = first;
  do {
    const entry = [...perimeter].find(([, edge]) => key(vertices[edge[0]]) === key(vertices[current]));
    if (!entry) throw new Error('Cannot close preset roof perimeter.');
    boundary.push(entry[1][0]); current = entry[1][1]; perimeter.delete(entry[0]);
  } while (key(vertices[current]) !== key(vertices[first]));
  const planLinks = [...links.values()].filter(group => group.length > 1);
  return validateLayout({ version: 1, vertices, faces, boundary, ...(planLinks.length ? { planLinks } : {}) });
}

export function presetRoofLayout(state) {
  const { length: l, depth: d, overhang: o, pitch } = state;
  const slope = Math.tan(pitch * Math.PI / 180), x = l / 2 + o, z = d / 2 + o;
  const patches = [];
  const add = (points, height, plane = patches.length) => patches.push({ points, height, plane });
  const front = p => slope * (p.z + d / 2), back = p => slope * (d / 2 - p.z);
  if (state.roofType === 'shed') {
    add(rect(-x, x, -z, z), p => slope * (p.z + d / 2) - 0.05);
  } else if (state.roofType === 'hip') {
    const rotated = d > l, a = Math.max(l, d) / 2 + o, b = Math.min(l, d) / 2 + o, r = a - b;
    const transform = ([px, pz, h]) => ({ x: rotated ? pz : px, z: rotated ? -px : pz, h: h - 0.05 });
    const vertices = [[-a,-b,0],[a,-b,0],[a,b,0],[-a,b,0],[-r,0,slope*b],[r,0,slope*b]].map(transform);
    const faces = r < 1e-8 ? [[0,1,4],[1,2,4],[2,3,4],[3,0,4]] : [[0,1,5,4],[1,2,5],[2,3,4,5],[3,0,4]];
    return validateLayout({ version: 1, vertices: r < 1e-8 ? vertices.slice(0,5) : vertices, faces, boundary: [0,1,2,3] });
  } else if (state.roofType === 'lshape') {
    const mx = -l * 0.29, mz = -d * 0.22, wx = -l * 0.08 + o, fz = d * 0.06 + o;
    const planes = [
      { contains: p => p.z <= mz, height: p => slope * (d * 0.28 + p.z - mz) },
      { contains: p => p.z >= mz && p.z <= fz, height: p => slope * (d * 0.28 - p.z + mz) },
      { contains: p => p.x <= mx, height: p => slope * (l * 0.21 + p.x - mx) },
      { contains: p => p.x >= mx && p.x <= wx, height: p => slope * (l * 0.21 - p.x + mx) },
    ];
    const xs = [-x, mx, wx, x], zs = [-z, mz, fz, z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const center = { x: (xs[i] + xs[i+1]) / 2, z: (zs[j] + zs[j+1]) / 2 };
      const active = planes.map((plane, id) => ({ ...plane, id })).filter(p => p.contains(center));
      for (const plane of active) {
        let points = rect(xs[i], xs[i+1], zs[j], zs[j+1]);
        for (const other of active) if (other.id !== plane.id) points = clip(points, p => plane.height(p) - other.height(p));
        add(points, plane.height, plane.id);
      }
    }
  } else if (state.roofType === 'dormer') {
    const f = -d * 0.34, bottom = front({ z: f }) + 0.012;
    const ds = Math.tan(Math.max(22, Math.min(30, pitch)) * Math.PI / 180);
    const half = Math.min(l * 0.13, 1.3, Math.max(0.55, (slope*d/2 - 0.08 - bottom - 0.28) / ds));
    const wall = Math.max(bottom + 0.28, Math.min(bottom + Math.min(0.72, state.wallHeight * 0.24), slope*d/2 - ds*half - 0.06));
    const ridge = wall + ds*half, w = half + Math.min(0.18, o*0.32), eave = ridge - ds*w;
    const fz = f - Math.min(0.22, o*0.22), bz = Math.min(-0.045, eave/slope - d/2), rz = Math.min(-0.025, ridge/slope - d/2);
    const points = pairs => pairs.map(([x,z]) => ({x,z}));
    add(points([[-x,-z],[x,-z],[x,fz],[w,fz],[0,fz],[-w,fz],[-x,fz]]), front);
    add(points([[-x,fz],[-w,fz],[-w,bz],[0,rz],[0,0],[-x,0]]), front);
    add(points([[w,fz],[x,fz],[x,0],[0,0],[0,rz],[w,bz]]), front);
    add(points([[-w,fz],[0,fz],[0,rz],[-w,bz]]), p => ridge + ds*p.x);
    add(points([[0,fz],[w,fz],[w,bz],[0,rz]]), p => ridge - ds*p.x);
    add(rect(-x,x,0,z), back);
  } else if (state.roofType === 'gable') {
    add(rect(-x,x,-z,0), front); add(rect(-x,x,0,z), back);
  } else throw new Error('Choose a preset roof or an existing drawn layout to edit.');
  try { return assembleLayoutPatches(patches); }
  catch (error) {
    if (state.roofType === 'dormer') throw new Error(`Dormer details must fit the editor’s 5 cm edge and 0.05 m² surface limits. ${error.message}`);
    throw error;
  }
}
