import { roofWindowGeometry, cutRoofWindows } from './roofWindows.js?v=windows-24';
import { roofSurfaceGroups, validateLayout, inside } from './roofLayout.js?v=layout-21';

// Dimensions transcribed from the two supplied Rodach catalogue photographs.
// End overlap is the inferred length allowance: length - modules * module pitch.
export const sheetProfiles = {
  antic: { name: '350 mm profile', width: 1130, usefulWidth: 1000, module: 350,
    endOverlap: 100, minModules: 3, maxModules: 22, maxLength: 7800,
    kgPerM2: 5.9, minPitch: 20 },
  clasic: { name: '365 mm profile', width: 1170, usefulWidth: 1080, module: 365,
    endOverlap: 125, minModules: 3, maxModules: 22, maxLength: 8150,
    kgPerM2: 4.9, minPitch: 14 },
};

export function validateSheetProfile(profile) {
  const p = { ...profile };
  for (const key of ['width', 'usefulWidth', 'module', 'endOverlap', 'minModules', 'maxModules', 'maxLength', 'kgPerM2', 'minPitch']) {
    if (!Number.isFinite(p[key])) throw new Error('Enter a valid number for every profile dimension.');
  }
  if (p.width < 100 || p.width > 3000 || p.usefulWidth < 100 || p.usefulWidth > p.width) {
    throw new Error('Sheet width must be 100–3,000 mm; usable width must be at least 100 mm and no wider than the sheet.');
  }
  if (p.module < 50 || p.module > 2000 || p.endOverlap < 0 || p.endOverlap > 1000 ||
      p.maxLength < 100 || p.maxLength > 20000 || p.kgPerM2 < 0 || p.kgPerM2 > 100 ||
      p.minPitch < 0 || p.minPitch > 89) throw new Error('Check the module, overlap, maximum length, weight and minimum pitch.');
  if (![p.minModules, p.maxModules].every(Number.isInteger) || p.minModules < 1 ||
      p.maxModules < p.minModules || p.maxModules > 100) throw new Error('Use whole module counts from 1 to 100; maximum must be at least minimum.');
  p.allowedMaxModules = Math.min(p.maxModules, Math.floor((p.maxLength - p.endOverlap + 1e-7) / p.module));
  if (p.allowedMaxModules < p.minModules) throw new Error('The maximum sheet length cannot fit the minimum module count plus end overlap.');
  return p;
}

const edgeKey = (a, b) => [a, b].sort((x, y) => x - y).join(':');
export const slopeLetter = i => (i >= 26 ? slopeLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + i % 26);
const area = polygon => Math.abs(polygon.reduce((sum, a, i) => {
  const b = polygon[(i + 1) % polygon.length];
  return sum + a.x * b.y - b.x * a.y;
}, 0)) / 2;

function clip(polygon, axis, bound, sign) {
  const result = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const da = sign * (a[axis] - bound), db = sign * (b[axis] - bound);
    if (da >= -1e-9) result.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      result.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  });
  return result;
}
const clipStrip = (polygon, left, right) => clip(clip(polygon, 'x', left, 1), 'x', right, -1);

// A plane may contain separate roofs. Only edge-connected triangles are one slope.
function connectedSlopes(layout) {
  return roofSurfaceGroups(layout).flatMap(group => {
    const remaining = new Set(group.triangles.map((_, i) => i));
    const edges = new Map();
    group.triangles.forEach((ids, i) => ids.forEach((a, k) => {
      const key = edgeKey(a, ids[(k + 1) % 3]);
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(i);
    }));
    const components = [];
    while (remaining.size) {
      const queue = [remaining.values().next().value], triangles = [];
      remaining.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const ids = group.triangles[queue[i]];
        triangles.push(ids);
        ids.forEach((a, k) => (edges.get(edgeKey(a, ids[(k + 1) % 3])) || []).forEach(next => {
          if (remaining.delete(next)) queue.push(next);
        }));
      }
      const boundary = new Map();
      triangles.forEach(ids => ids.forEach((a, k) => {
        const b = ids[(k + 1) % 3], key = edgeKey(a, b);
        if (boundary.has(key)) boundary.delete(key); else boundary.set(key, [a, b]);
      }));
      components.push({ normal: group.normal, triangles, boundary: [...boundary.values()] });
    }
    return components;
  });
}

export function groupSheetLengths(pieces) {
  const groups = new Map();
  pieces.forEach(piece => {
    const key = `${piece.modules}:${piece.length}`;
    if (!groups.has(key)) groups.set(key, { modules: piece.modules, length: piece.length, count: 0, ids: [] });
    const group = groups.get(key);
    group.count++;
    group.ids.push(piece.id);
  });
  return [...groups.values()].sort((a, b) => a.length - b.length);
}

export function planRoofSheets(layout, profile, settings = {}) {
  validateLayout(layout);
  const windows = roofWindowGeometry(layout);
  const p = validateSheetProfile(profile);
  const useful = p.usefulWidth / 1000, module = p.module / 1000;
  let pieceCount = 0;
  const slopes = connectedSlopes(layout).map((group, index) => {
    const { normal } = group;
    const sx = -normal.x / normal.y, sz = -normal.z / normal.y;
    const gradient = Math.hypot(sx, sz), scale = Math.hypot(1, gradient);
    const dx = gradient > 1e-8 ? sx / gradient : 0;
    const dz = gradient > 1e-8 ? sz / gradient : 1;
    const flatten = v => ({ x: v.x * dz - v.z * dx, y: (v.x * dx + v.z * dz + v.h * gradient) / scale });
    const hostPolygons = group.triangles.map(ids => ids.map(id => layout.vertices[id]));
    const cutPolygons = hostPolygons.flatMap(polygon => cutRoofWindows(polygon, windows));
    const triangles = cutPolygons.map(polygon => polygon.map(flatten));
    const openings = windows.filter(window => hostPolygons.some(polygon =>
      polygon.some(p => Math.abs(window.normal.x * p.x + window.normal.y * p.h +
        window.normal.z * p.z - window.group.constant) < 1e-7)) &&
      hostPolygons.some(polygon => inside(window, polygon)));
    const all = triangles.flat();
    const minX = Math.min(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y));
    const local = pt => ({ x: pt.x - minX, y: pt.y - minY });
    const polygons = triangles.map(points => points.map(local));
    const width = Math.max(...all.map(p => p.x)) - minX;
    const height = Math.max(...all.map(p => p.y)) - minY;
    const options = settings.slopes?.[index] || {};
    const offset = Number(options.offset ?? settings.offset ?? 0) / 1000;
    const reverse = (options.direction ?? settings.direction) === 'right';
    if (!Number.isFinite(offset) || offset < 0 || offset >= useful) throw new Error('Start offset must be from 0 up to (but below) the usable sheet width.');
    const columns = Math.ceil((width + offset - 1e-9) / useful);
    if (columns > 3000) throw new Error('Too many sheet columns. Increase the usable width.');
    const pieces = [];
    for (let column = 0; column < columns; column++) {
      const left = reverse ? width + offset - (column + 1) * useful : column * useful - offset;
      const clipped = polygons.map(poly => clipStrip(poly, left, left + useful)).filter(poly => poly.length >= 3 && area(poly) > 1e-10);
      // Separate full-width gaps (e.g. dormers) while allowing cut-outs in a sheet.
      const intervals = clipped.map(poly => [Math.min(...poly.map(p => p.y)), Math.max(...poly.map(p => p.y))]).sort((a, b) => a[0] - b[0]);
      const runs = [];
      intervals.forEach(([start, end]) => {
        const last = runs.at(-1);
        if (last && start <= last[1] + 1e-8) last[1] = Math.max(last[1], end);
        else runs.push([start, end]);
      });
      // Share one module grid across columns so tile courses line up. Merge
      // nearby gaps when rounding would otherwise order overlapping sheets.
      const alignedRuns = [];
      runs.forEach(([start, end]) => {
        const low = Math.floor((start + 1e-8) / module) * module;
        let count = Math.max(p.minModules, Math.ceil((end - low - 1e-8) / module));
        const sheetCount = Math.ceil(count / p.allowedMaxModules);
        count = Math.max(count, sheetCount * p.minModules);
        const high = low + count * module;
        const last = alignedRuns.at(-1);
        if (last && low <= last[1] + 1e-8) {
          const count = Math.round((Math.max(last[1], high) - last[0]) / module);
          last[1] = last[0] + Math.max(count, Math.ceil(count / p.allowedMaxModules) * p.minModules) * module;
        } else alignedRuns.push([low, high]);
      });
      let segment = 0;
      for (const [start, end] of alignedRuns) {
        let y = start;
        while (y < end - 1e-8) {
          const remaining = Math.round((end - y) / module);
          const sheetsLeft = Math.ceil(remaining / p.allowedMaxModules);
          const modules = Math.min(p.allowedMaxModules, remaining - (sheetsLeft - 1) * p.minModules);
          const coverageLength = modules * module;
          const cuts = clipped.map(poly => clip(clip(poly, 'y', y, 1), 'y', y + coverageLength, -1))
            .filter(poly => poly.length >= 3 && area(poly) > 1e-10);
          pieces.push({ id: `${slopeLetter(index)}-${column + 1}.${++segment}`, column: column + 1,
            modules, length: modules * p.module + p.endOverlap, x: left, y,
            stockX: reverse ? left - (p.width - p.usefulWidth) / 1000 : left,
            coverageLength, polygons: cuts, netArea: cuts.reduce((sum, poly) => sum + area(poly), 0) });
          y += coverageLength;
          if (++pieceCount > 10000) throw new Error('Too many pieces. Increase the sheet dimensions.');
        }
      }
    }
    const pitch = Math.atan(gradient) * 180 / Math.PI;
    const netArea = polygons.reduce((sum, poly) => sum + area(poly), 0);
    const stockArea = pieces.reduce((sum, piece) => sum + p.width * piece.length / 1e6, 0);
    const usefulArea = pieces.reduce((sum, piece) => sum + useful * piece.coverageLength, 0);
    const warnings = [];
    if (pitch + 1e-6 < p.minPitch) warnings.push(`Pitch ${pitch.toFixed(1)}° is below this profile’s ${p.minPitch}° minimum.`);
    if (gradient < 1e-8) warnings.push('Flat surface: sheet direction defaults to the plan Z axis.');
    return { id: slopeLetter(index), pitch, width, height, pieces, polygons, columns, reverse, offset: offset * 1000,
      outline: [...group.boundary.map(ids => ids.map(id => local(flatten(layout.vertices[id])))),
        ...openings.flatMap(window => window.corners.map((p, i) =>
          [p, window.corners[(i + 1) % 4]].map(p => local(flatten(p)))))],
      planPolygons: cutPolygons.flatMap(poly => poly.slice(1, -1).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]])),
      netArea, stockArea, usefulArea, cutArea: Math.max(0, usefulArea - netArea),
      overlapArea: stockArea - usefulArea, warnings, groups: groupSheetLengths(pieces) };
  });
  const pieces = slopes.flatMap(slope => slope.pieces);
  const sum = key => slopes.reduce((total, slope) => total + slope[key], 0);
  const totals = { count: pieces.length, modules: pieces.reduce((sum, p) => sum + p.modules, 0),
    linearMetres: pieces.reduce((sum, p) => sum + p.length / 1000, 0),
    netArea: sum('netArea'), stockArea: sum('stockArea'), cutArea: sum('cutArea'), overlapArea: sum('overlapArea') };
  totals.weight = totals.stockArea * p.kgPerM2;
  return { profile: p, slopes, totals, groups: groupSheetLengths(pieces) };
}

export function sheetPlanCsv(plan, translate = text => text) {
  const rows = [['Slope', 'Piece', 'Column', 'Modules', 'Length mm', 'Width mm', 'Usable width mm', 'Net covered m2', 'Stock m2']];
  plan.slopes.forEach(slope => slope.pieces.forEach(piece => rows.push([slope.id, piece.id, piece.column, piece.modules,
    piece.length, plan.profile.width, plan.profile.usefulWidth, piece.netArea.toFixed(4), (piece.length * plan.profile.width / 1e6).toFixed(4)])));
  rows.push([], ['TOTAL pieces', plan.totals.count], ['TOTAL modules', plan.totals.modules],
    ['Roof area m2', plan.totals.netArea.toFixed(4)], ['Stock area m2', plan.totals.stockArea.toFixed(4)],
    ['Cut allowance m2', plan.totals.cutArea.toFixed(4)], ['Overlap / end allowance m2', plan.totals.overlapArea.toFixed(4)]);
  // Keep machine-readable decimal points; translate headings without changing IDs or quantities.
  return rows.map((row, index) => row.map((cell, column) => {
    const value = String(index === 0 || (column === 0 && row.length === 2) ? translate(cell) : cell);
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }).join(',')).join('\r\n');
}
