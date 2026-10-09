import { roofWindowGeometry, cutRoofWindows } from './roofWindows.js?v=windows-24';
import { roofSurfaceGroups, validateLayout, footprintLayout, inside, triangulate } from './roofLayout.js?v=layout-21';
import { sketchSlopes, sketchEdgeTotals } from './slopeSketch.js?v=sketch-1';

// Dimensions transcribed from the supplied profile reference photographs.
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
export function connectedSlopes(layout) {
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
    group.count += piece.quantity ?? 1;
    group.ids.push(piece.quantity > 1 ? `${piece.id} ×${piece.quantity}` : piece.id);
  });
  return [...groups.values()].sort((a, b) => a.length - b.length);
}

// Partitions replace an automatic sheet section, retaining its coverage and grid.
export function validateSheetPartition(parts, modules, profile) {
  const p = validateSheetProfile(profile);
  if (!Array.isArray(parts) || !parts.length || parts.length > 100 ||
      parts.some(n => !Number.isInteger(n) || n < p.minModules || n > p.allowedMaxModules)) {
    throw new Error('Each partition must use whole module counts within the profile limits.');
  }
  if (parts.reduce((sum, n) => sum + n, 0) !== modules) {
    throw new Error('The partition must add up to the original module count.');
  }
  return parts;
}

export function partitionTargets(plan, baseId, scope) {
  const columns = plan.slopes.flatMap(slope => {
    const byColumn = new Map();
    for (const piece of slope.pieces) {
      if (!byColumn.has(piece.column)) byColumn.set(piece.column, new Map());
      byColumn.get(piece.column).set(piece.baseId, piece);
    }
    return [...byColumn.values()].map(sections => ({ slope: slope.id, sections: [...sections.values()] }));
  });
  const selectedColumn = columns.find(column => column.sections.some(p => p.baseId === baseId));
  if (!selectedColumn) throw new Error('Select a column section first.');
  if (scope === 'column') return [baseId];
  const sectionIndex = selectedColumn.sections.findIndex(p => p.baseId === baseId);
  const signature = column => column.sections.map(p => p.baseModules).join('+');
  // Match the original full column partition, then replace the corresponding
  // section only. Two equal sections in one long column remain independent.
  return columns.filter(column => (scope === 'global' || column.slope === selectedColumn.slope) &&
    signature(column) === signature(selectedColumn)).map(column => column.sections[sectionIndex].baseId);
}

// Strips one unfolded slope. Polygons use slope coordinates: x along the eave, y uphill.
function stripSlope(index, polygons, width, p, settings, counter) {
  const useful = p.usefulWidth / 1000, module = p.module / 1000;
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
    let segment = 0, baseSegment = 0;
    for (const [start, end] of alignedRuns) {
      let y = start;
      while (y < end - 1e-8) {
        const remaining = Math.round((end - y) / module);
        const sheetsLeft = Math.ceil(remaining / p.allowedMaxModules);
        const baseModules = Math.min(p.allowedMaxModules, remaining - (sheetsLeft - 1) * p.minModules);
        const baseId = `${slopeLetter(index)}-${column + 1}.${++baseSegment}`;
        const parts = settings.partitions?.[baseId] || [baseModules];
        validateSheetPartition(parts, baseModules, p);
        for (const modules of parts) {
          const coverageLength = modules * module;
          const cuts = clipped.map(poly => clip(clip(poly, 'y', y, 1), 'y', y + coverageLength, -1))
            .filter(poly => poly.length >= 3 && area(poly) > 1e-10);
          pieces.push({ id: `${slopeLetter(index)}-${column + 1}.${++segment}`, column: column + 1,
            baseId, baseModules, modules, length: modules * p.module + p.endOverlap, x: left, y,
            stockX: reverse ? left - (p.width - p.usefulWidth) / 1000 : left,
            coverageLength, polygons: cuts, netArea: cuts.reduce((sum, poly) => sum + area(poly), 0) });
          y += coverageLength;
          if (++counter.pieces > 10000) throw new Error('Too many pieces. Increase the sheet dimensions.');
        }
      }
    }
  }
  const netArea = polygons.reduce((sum, poly) => sum + area(poly), 0);
  const stockArea = pieces.reduce((sum, piece) => sum + p.width * piece.length / 1e6, 0);
  const usefulArea = pieces.reduce((sum, piece) => sum + useful * piece.coverageLength, 0);
  return { id: slopeLetter(index), pieces, polygons, columns, reverse, offset: offset * 1000,
    netArea, stockArea, usefulArea, cutArea: Math.max(0, usefulArea - netArea),
    overlapArea: stockArea - usefulArea, groups: groupSheetLengths(pieces) };
}

// Identical slopes (quantity > 1) are planned once and counted per copy.
function planTotals(p, slopes) {
  const copies = slope => slope.quantity ?? 1;
  const pieces = slopes.flatMap(slope => slope.pieces.map(piece => ({ ...piece, quantity: copies(slope) })));
  const sum = key => slopes.reduce((total, slope) => total + slope[key] * copies(slope), 0);
  const totals = { count: pieces.reduce((sum, p) => sum + p.quantity, 0),
    modules: pieces.reduce((sum, p) => sum + p.modules * p.quantity, 0),
    linearMetres: pieces.reduce((sum, p) => sum + p.length / 1000 * p.quantity, 0),
    netArea: sum('netArea'), stockArea: sum('stockArea'), cutArea: sum('cutArea'), overlapArea: sum('overlapArea') };
  totals.weight = totals.stockArea * p.kgPerM2;
  return { profile: p, slopes, totals, groups: groupSheetLengths(pieces) };
}

// Independent unfolded polygons use real surface metres, with Y along the sheets.
export function validateSheetSurfaces(surfaces) {
  if (!Array.isArray(surfaces) || surfaces.length > 40) throw new Error('Use up to 40 surfaces.');
  return surfaces.map(points => {
    if (!Array.isArray(points) || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Draw a closed surface with at least three points.');
    return footprintLayout(points.map(p => ({ x: p.x, z: p.y })));
  });
}

function planDrawnSurfaces(surfaces, profile, settings) {
  const layouts = validateSheetSurfaces(surfaces);
  if (!layouts.length) throw new Error('Draw at least one surface first.');
  const plans = layouts.map((layout, index) => planRoofSheets(layout, profile, {
    ...settings, surfaceIndex: index,
  }));
  const slopes = plans.flatMap(plan => plan.slopes);
  const totals = Object.fromEntries(Object.keys(plans[0].totals).map(key =>
    [key, plans.reduce((sum, plan) => sum + plan.totals[key], 0)]));
  return { profile: plans[0].profile, slopes, totals, drawnSurfaces: true,
    groups: groupSheetLengths(slopes.flatMap(slope => slope.pieces)) };
}

export function planRoofSheets(layout, profile, settings = {}) {
  if (layout.surfaces) return planDrawnSurfaces(layout.surfaces, profile, settings);
  validateLayout(layout);
  const windows = roofWindowGeometry(layout);
  const p = validateSheetProfile(profile);
  const counter = { pieces: 0 };
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
    const strips = stripSlope(settings.surfaceIndex ?? index, polygons, width, p, settings, counter);
    const pitch = Math.atan(gradient) * 180 / Math.PI;
    const warnings = [];
    if (settings.surfaceIndex == null && pitch + 1e-6 < p.minPitch) warnings.push(`Pitch ${pitch.toFixed(1)}° is below this profile’s ${p.minPitch}° minimum.`);
    if (settings.surfaceIndex == null && gradient < 1e-8) warnings.push('Flat surface: sheet direction defaults to the plan Z axis.');
    return { ...strips, pitch, width, height,
      outline: [...group.boundary.map(ids => ids.map(id => local(flatten(layout.vertices[id])))),
        ...openings.flatMap(window => window.corners.map((p, i) =>
          [p, window.corners[(i + 1) % 4]].map(p => local(flatten(p)))))],
      planPolygons: cutPolygons.flatMap(poly => poly.slice(1, -1).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]])),
      warnings };
  });
  return planTotals(p, slopes);
}

// Slopes drawn individually at their true size (see slopeSketch.js). There is no
// 3D roof: the overview places the slopes side by side.
export function planSketchSheets(sketch, profile, settings = {}) {
  const p = validateSheetProfile(profile);
  const counter = { pieces: 0 };
  let planX = 0;
  const slopes = sketchSlopes(sketch).map((slope, index) => {
    const ring = slope.points.map(pt => ({ x: pt.x, z: pt.y }));
    const polygons = triangulate(ring.map((_, i) => i), ring).map(ids => ids.map(i => slope.points[i]));
    const strips = stripSlope(index, polygons, slope.width, p, settings, counter);
    const warnings = [];
    if (slope.pitch != null && slope.pitch + 1e-6 < p.minPitch) warnings.push(`Pitch ${slope.pitch.toFixed(1)}° is below this profile’s ${p.minPitch}° minimum.`);
    const planPolygons = polygons.map(poly => poly.map(pt => ({ x: planX + pt.x, z: -pt.y })));
    planX += slope.width + 1;
    return { ...strips, pitch: slope.pitch, width: slope.width, height: slope.height, quantity: slope.quantity,
      outline: slope.points.map((pt, i) => [pt, slope.points[(i + 1) % slope.points.length]]),
      planPolygons, warnings, edges: slope.edges };
  });
  const plan = planTotals(p, slopes);
  plan.edgeTotals = sketchEdgeTotals(slopes);
  return plan;
}

export function sheetPlanCsv(plan, translate = text => text) {
  const rows = [['Slope', 'Piece', 'Column', 'Modules', 'Length mm', 'Width mm', 'Usable width mm', 'Net covered m2', 'Stock m2', 'Identical slopes']];
  plan.slopes.forEach(slope => slope.pieces.forEach(piece => rows.push([slope.id, piece.id, piece.column, piece.modules,
    piece.length, plan.profile.width, plan.profile.usefulWidth, piece.netArea.toFixed(4), (piece.length * plan.profile.width / 1e6).toFixed(4), slope.quantity ?? 1])));
  rows.push([], ['TOTAL pieces', plan.totals.count], ['TOTAL modules', plan.totals.modules],
    ['Roof area m2', plan.totals.netArea.toFixed(4)], ['Stock area m2', plan.totals.stockArea.toFixed(4)],
    ['Cut allowance m2', plan.totals.cutArea.toFixed(4)], ['Overlap / end allowance m2', plan.totals.overlapArea.toFixed(4)]);
  // Keep machine-readable decimal points; translate headings without changing IDs or quantities.
  return rows.map((row, index) => row.map((cell, column) => {
    const value = String(index === 0 || (column === 0 && row.length === 2) ? translate(cell) : cell);
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }).join(',')).join('\r\n');
}
