import { normalizeFootprint } from './footprint.js';
import { interlockingLayout } from './interlocking.js';
import { excludeHouse } from './house.js';
import { areaGeometry, triangulate, clipRect, polygonArea, polygonCurbs } from './area.js';
export { areaGeometry } from './area.js';
// Nominal WISE formats. Rates are editable demo values in RON, not supplier prices.
export const COLORS = {
  grey: '#969a98',
  charcoal: '#414748',
  red: '#a65343',
  brown: '#806453',
  sand: '#c9b796',
  white: '#d8d5ca',
  noir: ['#555957', '#9c9d96', '#72746d'],
  orange: '#c67c43',
  sahara: ['#c9b796', '#ac885d', '#ded0ad'],
  whiteMix: ['#d8d5ca', '#969a98', '#414748'],
  shellBrown: ['#806453', '#aa927b', '#c6b5a0'],
};
export const TILES = {
  hbeton: {
    name: 'H-Beton',
    length: 0.2,
    width: 0.165,
    thickness: 0.06,
    price: 90,
    profile: 'h',
    piecesPerM2: 35,
    colors: ['grey', 'red', 'charcoal'],
    patterns: ['interlocking'],
    source: 'https://wise.ro/produs/h-beton/',
  },
  granit: {
    name: 'Granit',
    length: 0.1,
    width: 0.1,
    thickness: 0.06,
    price: 95,
    colors: ['grey', 'white', 'charcoal', 'brown', 'orange', 'red'],
    patterns: ['stack', 'running', 'checker'],
    source: 'https://wise.ro/produs/879/',
  },
  tetraNova: {
    name: 'Tetra Nova',
    length: 0.3,
    width: 0.2,
    thickness: 0.06,
    price: 115,
    colors: ['noir', 'sahara', 'whiteMix', 'shellBrown'],
    patterns: ['running', 'stack', 'checker'],
    source: 'https://wise.ro/produs/pavaj-premium-rezidential/',
  },
  parket: {
    name: 'Parket',
    length: 0.2,
    width: 0.1,
    thickness: 0.06,
    price: 85,
    colors: ['grey', 'charcoal', 'red', 'brown', 'white', 'noir'],
    patterns: ['running', 'stack', 'herringbone', 'basket'],
    source: 'https://wise.ro/produs/parket/',
  },
  square: {
    name: 'Pătrat',
    length: 0.2,
    width: 0.2,
    thickness: 0.06,
    price: 80,
    colors: ['grey', 'charcoal', 'red', 'brown'],
    patterns: ['stack', 'running', 'checker'],
    source: 'https://wise.ro/produs/patrat/',
  },
  slab: {
    name: 'Dală 60 × 30 × 5',
    length: 0.6,
    width: 0.3,
    thickness: 0.05,
    price: 110,
    colors: ['grey', 'charcoal', 'brown', 'noir'],
    patterns: ['stack', 'running', 'herringbone', 'basket'],
    source: 'https://wise.ro/produse/',
  },
};
export const CURBS = {
  garden: {
    name: 'G600',
    length: 0.6,
    width: 0.05,
    height: 0.21,
    price: 18,
    colors: ['grey', 'charcoal', 'red', 'brown'],
    source: 'https://wise.ro/produs/bordura-g600/',
  },
  sidewalk: {
    name: 'T500',
    length: 0.5,
    width: 0.1,
    height: 0.15,
    price: 24,
    colors: ['grey', 'charcoal', 'red', 'brown', 'noir'],
    source: 'https://wise.ro/produs/bordura-t500/',
  },
};
export const DEFAULTS = Object.freeze({
  version: 1,
  houseFootprint: null,
  houseLocation: null,
  houseEnabled: false,
  houseShape: 'rectangle',
  houseLength: 3,
  houseWidth: 2,
  houseWingWidth: 1,
  houseWingDepth: 1,
  houseHeight: 2.6,
  houseX: 1.5,
  houseZ: 1,
  houseRotation: 0,
  shape: 'rectangle',
  areaPoints: null,
  runA: 6,
  runB: 4,
  runC: 4,
  runD: 4,
  angleB: 90,
  length: 6,
  width: 4,
  tile: 'parket',
  color: 'grey',
  accent: 'charcoal',
  pattern: 'running',
  rotation: 0,
  curb: 'garden',
  curbColor: 'charcoal',
  edges: [true, true, true, true],
  waste: 7,
  tileRate: 85,
  curbRate: 18,
});
const number = (v, d, min, max) =>
  Number.isFinite(Number(v)) && v !== null && v !== ''
    ? Math.min(max, Math.max(min, Number(v)))
    : d;
export function normalize(input = {}) {
  const s = { ...DEFAULTS, ...input };
  s.tile = Object.hasOwn(TILES, s.tile) ? s.tile : DEFAULTS.tile;
  const tile = TILES[s.tile];
  s.curb = Object.hasOwn(CURBS, s.curb) ? s.curb : DEFAULTS.curb;
  s.color = tile.colors.includes(s.color) ? s.color : tile.colors[0];
  s.accent = tile.colors.includes(s.accent) ? s.accent : tile.colors[1];
  s.curbColor = CURBS[s.curb].colors.includes(s.curbColor) ? s.curbColor : 'grey';
  s.pattern = tile.patterns.includes(s.pattern) ? s.pattern : tile.patterns[0];
  s.length = number(s.length, 6, 1, 20);
  s.width = number(s.width, 4, 1, 20);
  s.waste = number(s.waste, 7, 0, 30);
  s.tileRate = number(s.tileRate, tile.price, 0, 10000);
  s.curbRate = number(s.curbRate, CURBS[s.curb].price, 0, 10000);
  s.areaPoints = normalizeFootprint(s.areaPoints);
  s.shape =
    s.shape === 'custom' && s.areaPoints
      ? 'custom'
      : ['rectangle', 'closed4', 'closed5'].includes(s.shape)
        ? s.shape
        : 'rectangle';
  for (const key of ['runA', 'runB', 'runC', 'runD']) s[key] = number(s[key], DEFAULTS[key], 1, 20);
  s.angleB = number(s.angleB, 90, 30, 150);
  s.houseEnabled = s.houseEnabled === true;
  s.houseFootprint = normalizeFootprint(s.houseFootprint);
  s.houseLocation =
    s.houseLocation &&
    Number.isFinite(s.houseLocation.lat) &&
    Number.isFinite(s.houseLocation.lon) &&
    Math.abs(s.houseLocation.lat) <= 85 &&
    Math.abs(s.houseLocation.lon) <= 180
      ? {
          lat: s.houseLocation.lat,
          lon: s.houseLocation.lon,
          label: String(s.houseLocation.label || '').slice(0, 300),
        }
      : null;
  s.houseShape =
    s.houseShape === 'imported' && s.houseFootprint
      ? 'imported'
      : s.houseShape === 'l'
        ? 'l'
        : 'rectangle';
  for (const key of ['houseLength', 'houseWidth']) s[key] = number(s[key], DEFAULTS[key], 1, 20);
  if (s.houseShape === 'imported') {
    s.houseLength = Math.max(...s.houseFootprint.map((p) => p.x));
    s.houseWidth = Math.max(...s.houseFootprint.map((p) => p.z));
  }
  s.houseWingWidth = number(s.houseWingWidth, 1, 0.25, s.houseLength - 0.25);
  s.houseWingDepth = number(s.houseWingDepth, 1, 0.25, s.houseWidth - 0.25);
  s.houseHeight = number(s.houseHeight, 2.6, 0.5, 8);
  for (const key of ['houseX', 'houseZ']) s[key] = number(s[key], DEFAULTS[key], -20, 60);
  s.houseRotation = number(s.houseRotation, 0, 0, 360);
  s.rotation = number(s.rotation, 0, 0, 360);
  const edgeCount =
    s.shape === 'custom' ? s.areaPoints.length : s.shape === 'closed5' ? 5 : 4;
  s.edges = Array.from({ length: edgeCount }, (_, i) =>
    Array.isArray(s.edges) && typeof s.edges[i] === 'boolean' ? s.edges[i] : true,
  );
  return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, k === 'version' ? 1 : s[k]]));
}

export function layout(input) {
  const s = normalize(input),
    t = TILES[s.tile],
    area = areaGeometry(s),
    angle = (s.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    toGrid = (p) => ({ x: p.x * cos + p.z * sin, z: -p.x * sin + p.z * cos }),
    toWorld = (p) => ({ x: p.x * cos - p.z * sin, z: p.x * sin + p.z * cos }),
    site = triangulate(area.points).map((tri) => tri.map(toGrid)),
    sitePoints = area.points.map(toGrid),
    minX = Math.min(...sitePoints.map((p) => p.x)),
    maxX = Math.max(...sitePoints.map((p) => p.x)),
    minZ = Math.min(...sitePoints.map((p) => p.z)),
    maxZ = Math.max(...sitePoints.map((p) => p.z)),
    result = [];

  if (t.profile === 'h') return excludeHouse(interlockingLayout(s, t, area), s);

  const add = (x, z, l, w, accent = false, shadeRole) => {
    const fragments = site
      .map((tri) => clipRect(tri, x, z, l, w))
      .filter((poly) => poly.length >= 3 && polygonArea(poly) > 1e-8);
    const netArea = fragments.reduce((sum, poly) => sum + polygonArea(poly), 0);
    if (netArea < 1e-8) return;

    const center = toWorld({ x: x + l / 2, z: z + w / 2 }),
      cut = netArea < l * w - 1e-8,
      whole = [
        { x, z },
        { x: x + l, z },
        { x: x + l, z: z + w },
        { x, z: z + w },
      ].map(toWorld);

    result.push({
      ...(shadeRole === undefined ? {} : { shadeRole }),
      shadeX: center.x,
      shadeZ: center.z,
      x: center.x,
      z: center.z,
      l,
      w,
      rotation: s.rotation,
      accent,
      cut,
      area: netArea,
      polygon: cut ? undefined : whole,
      fragments: cut ? fragments.map((poly) => poly.map(toWorld)) : undefined,
    });
  };

  if (s.pattern === 'herringbone') {
    const u = t.width,
      i0 = Math.floor(minX / u) - 3,
      i1 = Math.ceil(maxX / u) + 3,
      j0 = Math.floor(minZ / u) - 3,
      j1 = Math.ceil(maxZ / u) + 3;
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const k = (((i - j) % 4) + 4) % 4;
        if (k === 0) add(i * u, j * u, 2 * u, u, false, 0);
        if (k === 3) add(i * u, j * u, u, 2 * u, false, 1);
      }
  } else if (s.pattern === 'basket') {
    const u = t.width,
      cell = 2 * u,
      i0 = Math.floor(minX / cell) - 2,
      i1 = Math.ceil(maxX / cell) + 2,
      j0 = Math.floor(minZ / cell) - 2,
      j1 = Math.ceil(maxZ / cell) + 2;
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++)
        for (let k = 0; k < 2; k++) {
          if ((i + j) % 2) add(i * cell + k * u, j * cell, u, 2 * u, false, 1);
          else add(i * cell, j * cell + k * u, 2 * u, u, false, 0);
        }
  } else {
    const row0 = Math.floor(minZ / t.width) - 2,
      row1 = Math.ceil(maxZ / t.width) + 2,
      col0 = Math.floor(minX / t.length) - 2,
      col1 = Math.ceil(maxX / t.length) + 2;
    for (let j = row0; j < row1; j++) {
      const shift = s.pattern === 'running' && Math.abs(j) % 2 ? -t.length / 2 : 0;
      for (let i = col0; i < col1; i++)
        add(
          i * t.length + shift,
          j * t.width,
          t.length,
          t.width,
          s.pattern === 'checker' && ((i + j) % 2 + 2) % 2 === 1,
        );
    }
  }
  return excludeHouse(result, s);
}

export function curbLayout(input) {
  const s = normalize(input),
    c = CURBS[s.curb],
    out = [];
  if (s.shape !== 'rectangle')
    return excludeHouse(polygonCurbs(s, c, areaGeometry(s)), s, { curbWidth: c.width });
  // Front/back extend over enabled side curbs: butt joints, no corner overlap.
  const extLeft = s.edges[3] ? c.width : 0,
    extRight = s.edges[1] ? c.width : 0;
  const lengths = [s.length + extLeft + extRight, s.width, s.length + extLeft + extRight, s.width];
  for (let side = 0; side < 4; side++)
    if (s.edges[side]) {
      const length = lengths[side],
        count = Math.ceil((length - 1e-9) / c.length);
      for (let i = 0; i < count; i++) {
        const size = Math.min(c.length, length - i * c.length),
          p = i * c.length + size / 2;
        out.push(
          side % 2 === 0
            ? {
                side,
                x: p - extLeft,
                z: side === 0 ? -c.width / 2 : s.width + c.width / 2,
                l: size,
                w: c.width,
              }
            : {
                side,
                x: side === 1 ? s.length + c.width / 2 : -c.width / 2,
                z: p,
                l: c.width,
                w: size,
              },
        );
      }
    }
  return excludeHouse(out, s, { curbWidth: c.width });
}

export function estimate(input, pieces = layout(input)) {
  const s = normalize(input),
    t = TILES[s.tile],
    curbs = curbLayout(s),
    geometry = areaGeometry(s),
    area = s.houseEnabled ? pieces.reduce((a, p) => a + (p.area ?? p.l * p.w), 0) : geometry.area,
    unitArea = t.piecesPerM2 ? 1 / t.piecesPerM2 : t.length * t.width;
  const rows = [];
  for (const accent of [false, true]) {
    const parts = pieces.filter((p) => p.accent === accent);
    if (!parts.length) continue;
    const net = parts.reduce((a, p) => a + (p.area ?? p.l * p.w), 0);
    const quantity = Math.max(
      parts.length,
      Math.ceil((net * (1 + s.waste / 100)) / unitArea - 1e-8),
    );
    rows.push({
      kind: 'tile',
      name: t.name,
      color: accent ? s.accent : s.color,
      quantity,
      unit: 'pcs',
      area: quantity * unitArea,
      rate: s.tileRate * unitArea,
      total: quantity * unitArea * s.tileRate,
    });
  }
  if (curbs.length)
    rows.push({
      kind: 'curb',
      name: CURBS[s.curb].name,
      color: s.curbColor,
      quantity: curbs.length,
      unit: 'pcs',
      rate: s.curbRate,
      total: curbs.length * s.curbRate,
    });
  return {
    area,
    grossArea: geometry.area,
    houseArea: Math.max(0, geometry.area - area),
    perimeter: geometry.perimeter,
    cutPieces: pieces.filter((p) => p.cut).length,
    installedPieces: pieces.length,
    curbLength: curbs.reduce((a, p) => a + (p.runLength ?? (p.side % 2 ? p.w : p.l)), 0),
    rows,
    total: rows.reduce((a, r) => a + r.total, 0),
  };
}
