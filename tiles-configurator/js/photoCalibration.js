const EPS = 1e-9;

const cross2 = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function solveLinear(matrix, rhs) {
  const n = rhs.length,
    a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < EPS) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) < EPS) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function homographyFromSquare(corners) {
  const world = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ],
    matrix = [],
    rhs = [];
  for (let i = 0; i < 4; i++) {
    const [x, z] = world[i],
      { x: u, y: v } = corners[i];
    matrix.push([x, z, 1, 0, 0, 0, -u * x, -u * z]);
    rhs.push(u);
    matrix.push([0, 0, 0, x, z, 1, -v * x, -v * z]);
    rhs.push(v);
  }
  const h = solveLinear(matrix, rhs);
  if (!h) return null;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize3 = (v) => {
  const n = norm3(v);
  return n > EPS ? v.map((value) => value / n) : null;
};
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function validCalibrationQuad(corners, { minEdge = 24, minArea = 900 } = {}) {
  if (!Array.isArray(corners) || corners.length !== 4) return false;
  const p = corners.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }));
  if (p.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minEdge) return false;
  }
  const turns = p.map((point, i) => cross2(point, p[(i + 1) % 4], p[(i + 2) % 4]));
  if (turns.some((turn) => Math.abs(turn) < 1)) return false;
  if (!(turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0))) return false;
  const area = Math.abs(
    p.reduce((sum, point, i) => {
      const next = p[(i + 1) % 4];
      return sum + point.x * next.y - point.y * next.x;
    }, 0) / 2,
  );
  return area >= minArea;
}

export function calibratePhotoCamera(corners, width, height) {
  width = Number(width);
  height = Number(height);
  if (!(width > 0 && height > 0) || !validCalibrationQuad(corners)) return null;
  const H = homographyFromSquare(corners);
  if (!H) return null;
  const cx = width / 2,
    cy = height / 2,
    h1 = [H[0][0], H[1][0], H[2][0]],
    h2 = [H[0][1], H[1][1], H[2][1]],
    h3 = [H[0][2], H[1][2], H[2][2]],
    a1 = h1[0] - cx * h1[2],
    b1 = h1[1] - cy * h1[2],
    a2 = h2[0] - cx * h2[2],
    b2 = h2[1] - cy * h2[2],
    focalCandidates = [];

  const orthDen = h1[2] * h2[2],
    orthNum = a1 * a2 + b1 * b2;
  if (Math.abs(orthDen) > EPS) {
    const f2 = -orthNum / orthDen;
    if (Number.isFinite(f2) && f2 > 1) focalCandidates.push(f2);
  }
  const equalDen = h1[2] * h1[2] - h2[2] * h2[2],
    equalNum = a1 * a1 + b1 * b1 - a2 * a2 - b2 * b2;
  if (Math.abs(equalDen) > EPS) {
    const f2 = -equalNum / equalDen;
    if (Number.isFinite(f2) && f2 > 1) focalCandidates.push(f2);
  }
  let focal = focalCandidates.length
    ? Math.sqrt(focalCandidates.reduce((sum, value) => sum + value, 0) / focalCandidates.length)
    : Math.max(width, height) * 1.2;
  focal = Math.min(Math.max(focal, Math.max(width, height) * 0.25), Math.max(width, height) * 8);

  const kinv = (h) => [(h[0] - cx * h[2]) / focal, (h[1] - cy * h[2]) / focal, h[2]],
    v1 = kinv(h1),
    v2 = kinv(h2),
    v3 = kinv(h3);
  let scale = 2 / (norm3(v1) + norm3(v2));
  if (!Number.isFinite(scale)) return null;
  if (scale * v3[2] < 0) scale *= -1;

  let rX = normalize3(v1.map((value) => value * scale));
  if (!rX) return null;
  const rawZ = v2.map((value) => value * scale),
    projection = dot3(rawZ, rX);
  let rZ = normalize3(rawZ.map((value, i) => value - projection * rX[i]));
  if (!rZ) return null;
  let rY = normalize3(cross3(rZ, rX));
  if (!rY) return null;
  rZ = normalize3(cross3(rX, rY));
  if (!rZ) return null;
  const t = v3.map((value) => value * scale);
  if (!(t[2] > 0.02)) return null;

  // OpenCV-style camera coordinates are x-right, y-down, z-forward. Three.js
  // camera coordinates are x-right, y-up, z-back, so flip camera Y and Z.
  const rCv = [
      [rX[0], rY[0], rZ[0]],
      [rX[1], rY[1], rZ[1]],
      [rX[2], rY[2], rZ[2]],
    ],
    viewMatrix = [
      rCv[0][0], rCv[0][1], rCv[0][2], t[0],
      -rCv[1][0], -rCv[1][1], -rCv[1][2], -t[1],
      -rCv[2][0], -rCv[2][1], -rCv[2][2], -t[2],
      0, 0, 0, 1,
    ],
    fov = (2 * Math.atan(height / (2 * focal)) * 180) / Math.PI;
  if (!(fov > 3 && fov < 150)) return null;
  return { focal, fov, viewMatrix };
}

export function projectCalibratedPoint(calibration, width, height, point) {
  if (!calibration || !Array.isArray(calibration.viewMatrix)) return null;
  const m = calibration.viewMatrix,
    x = Number(point?.x) || 0,
    y = Number(point?.y) || 0,
    z = Number(point?.z) || 0,
    cx = m[0] * x + m[1] * y + m[2] * z + m[3],
    cy = m[4] * x + m[5] * y + m[6] * z + m[7],
    cz = m[8] * x + m[9] * y + m[10] * z + m[11];
  if (cz >= -EPS) return null;
  const focal = calibration.focal;
  return {
    x: width / 2 + (focal * cx) / -cz,
    y: height / 2 - (focal * cy) / -cz,
    depth: -cz,
  };
}
