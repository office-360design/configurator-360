import * as THREE from 'three';

// A closed rectangular panel with real rectangular apertures. A grid sweep also
// supports floor-reaching doors and overlapping openings while editing: unlike
// overlapping Shape holes, those cases do not produce invalid triangulation.
// Coordinates are in the panel's XY plane, centred on its middle; thickness is Z.
export function rectangularPanelGeometry(width, height, thickness, apertures = []) {
  if (![width, height, thickness].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Panel dimensions must be positive finite numbers.');
  }
  const x0 = -width / 2, x1 = width / 2;
  const y0 = -height / 2, y1 = height / 2;
  const epsilon = 1e-7;
  const holes = apertures.map((hole) => ({
    left: Math.max(x0, hole.left), right: Math.min(x1, hole.right),
    bottom: Math.max(y0, hole.bottom), top: Math.min(y1, hole.top),
  })).filter((hole) => Object.values(hole).every(Number.isFinite)
    && hole.right - hole.left > epsilon && hole.top - hole.bottom > epsilon);
  const unique = (values) => values.sort((a, b) => a - b)
    .filter((value, i, sorted) => i === 0 || value - sorted[i - 1] > epsilon);
  const xs = unique([x0, x1, ...holes.flatMap((hole) => [hole.left, hole.right])]);
  const ys = unique([y0, y1, ...holes.flatMap((hole) => [hole.bottom, hole.top])]);
  const solid = Array.from({ length: xs.length - 1 }, (_, i) =>
    Array.from({ length: ys.length - 1 }, (_, j) => !holes.some((hole) => {
      const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
      return x > hole.left && x < hole.right && y > hole.bottom && y < hole.top;
    })));
  const vertices = [], normals = [], uvs = [];
  const quad = (a, b, c, d, normal) => {
    for (const p of [a, b, c, a, c, d]) {
      vertices.push(...p); normals.push(...normal);
      uvs.push((p[0] - x0) / width, (p[1] - y0) / height);
    }
  };
  const back = -thickness / 2, front = thickness / 2;
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      if (!solid[i][j]) continue;
      const l = xs[i], r = xs[i + 1], b = ys[j], t = ys[j + 1];
      quad([l,b,front], [r,b,front], [r,t,front], [l,t,front], [0,0,1]);
      quad([r,b,back], [l,b,back], [l,t,back], [r,t,back], [0,0,-1]);
      if (!solid[i - 1]?.[j]) quad([l,b,back], [l,b,front], [l,t,front], [l,t,back], [-1,0,0]);
      if (!solid[i + 1]?.[j]) quad([r,b,front], [r,b,back], [r,t,back], [r,t,front], [1,0,0]);
      if (!solid[i]?.[j - 1]) quad([l,b,back], [r,b,back], [r,b,front], [l,b,front], [0,-1,0]);
      if (!solid[i]?.[j + 1]) quad([l,t,front], [r,t,front], [r,t,back], [l,t,back], [0,1,0]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Reused for panel seam lines and secondary members so neither crosses a void.
export function subtractIntervals(start, end, blocked = []) {
  let spans = [[start, end]];
  for (const [a, b] of blocked) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    spans = spans.flatMap(([l, r]) => b <= l || a >= r ? [[l, r]] :
      [[l, Math.min(a, r)], [Math.max(b, l), r]].filter(([s, e]) => e - s > 1e-6));
  }
  return spans;
}
