export const DIMENSION_LIMITS = Object.freeze({
  width: Object.freeze({ min: 2000, max: 20000 }),
  depth: Object.freeze({ min: 2000, max: 20000 }),
  height: Object.freeze({ min: 2000, max: 3000 }),
});

export const MAX_POLE_SPAN_MM = 5000;
export const POLE_FACES = ['front', 'right', 'back', 'left'];

export function clampDimensionValue(key, value) {
  const limits = DIMENSION_LIMITS[key];
  if (!limits) return Number(value);
  const numeric = Number(value);
  const fallback = key === 'height' ? 2700 : key === 'width' ? 5000 : 3500;
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.round(Math.min(limits.max, Math.max(limits.min, safe)));
}

export function normalizeDimensions(dimensions = {}) {
  return {
    width: clampDimensionValue('width', dimensions.width),
    depth: clampDimensionValue('depth', dimensions.depth),
    height: clampDimensionValue('height', dimensions.height),
  };
}

export function poleGridCounts(dimensions = {}) {
  const normalized = normalizeDimensions(dimensions);
  return {
    columns: Math.max(2, Math.ceil(normalized.width / MAX_POLE_SPAN_MM) + 1),
    rows: Math.max(2, Math.ceil(normalized.depth / MAX_POLE_SPAN_MM) + 1),
  };
}

export function poleId(row, column) {
  return `r${row}c${column}`;
}

export function parsePoleId(id) {
  const match = String(id ?? '').match(/^r(\d+)c(\d+)$/);
  return match ? { row: Number(match[1]), column: Number(match[2]) } : null;
}

export function horizontalSegmentId(row, column) {
  return `h-r${row}-c${column}`;
}

export function verticalSegmentId(row, column) {
  return `v-r${row}-c${column}`;
}

export function buildPoleGrid(dimensions = {}) {
  const normalized = normalizeDimensions(dimensions);
  const { rows, columns } = poleGridCounts(normalized);
  const poles = [];
  const segments = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = poleId(row, column);
      const xRatio = columns === 1 ? 0.5 : column / (columns - 1);
      const zRatio = rows === 1 ? 0.5 : row / (rows - 1);
      poles.push({
        id,
        row,
        column,
        xRatio,
        zRatio,
        label: `Pole ${row + 1}-${column + 1}`,
        isFront: row === 0,
        isBack: row === rows - 1,
        isLeft: column === 0,
        isRight: column === columns - 1,
      });
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const id = horizontalSegmentId(row, column);
      segments.push({
        id,
        axis: 'horizontal',
        row,
        column,
        a: poleId(row, column),
        b: poleId(row, column + 1),
        aFace: 'right',
        bFace: 'left',
        boundary: row === 0 ? 'front' : row === rows - 1 ? 'back' : null,
        lengthMm: (normalized.width - 150) / (columns - 1),
      });
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = verticalSegmentId(row, column);
      segments.push({
        id,
        axis: 'vertical',
        row,
        column,
        a: poleId(row, column),
        b: poleId(row + 1, column),
        aFace: 'back',
        bFace: 'front',
        boundary: column === 0 ? 'left' : column === columns - 1 ? 'right' : null,
        lengthMm: (normalized.depth - 150) / (rows - 1),
      });
    }
  }

  return { ...normalized, rows, columns, poles, segments };
}

export function getPole(gridOrDimensions, id) {
  const grid = gridOrDimensions?.poles ? gridOrDimensions : buildPoleGrid(gridOrDimensions);
  return grid.poles.find((pole) => pole.id === id) ?? null;
}

export function getSegment(gridOrDimensions, id) {
  const grid = gridOrDimensions?.segments ? gridOrDimensions : buildPoleGrid(gridOrDimensions);
  return grid.segments.find((segment) => segment.id === id) ?? null;
}

export function getConnectedSegment(gridOrDimensions, poleIdValue, face) {
  const grid = gridOrDimensions?.segments ? gridOrDimensions : buildPoleGrid(gridOrDimensions);
  return grid.segments.find((segment) => (
    (segment.a === poleIdValue && segment.aFace === face)
    || (segment.b === poleIdValue && segment.bFace === face)
  )) ?? null;
}

export function connectedFaceForSegment(segment, poleIdValue) {
  if (!segment) return null;
  if (segment.a === poleIdValue) return segment.aFace;
  if (segment.b === poleIdValue) return segment.bFace;
  return null;
}

export function poleUnavailableOnMountedSide(gridOrDimensions, poleIdValue, mountedSide) {
  const grid = gridOrDimensions?.poles ? gridOrDimensions : buildPoleGrid(gridOrDimensions);
  const pole = getPole(grid, poleIdValue);
  if (!pole) return true;
  if (mountedSide === 'front') return pole.isFront;
  if (mountedSide === 'back') return pole.isBack;
  if (mountedSide === 'left') return pole.isLeft;
  if (mountedSide === 'right') return pole.isRight;
  return false;
}

export function segmentUnavailableOnMountedSide(gridOrDimensions, segment, mountedSide) {
  const grid = gridOrDimensions?.segments ? gridOrDimensions : buildPoleGrid(gridOrDimensions);
  if (!segment) return true;
  if (segment.boundary === mountedSide) return true;
  return poleUnavailableOnMountedSide(grid, segment.a, mountedSide)
    || poleUnavailableOnMountedSide(grid, segment.b, mountedSide);
}

export function legacyCornerMap(dimensions = {}) {
  const grid = buildPoleGrid(dimensions);
  return {
    frontLeft: poleId(0, 0),
    frontRight: poleId(0, grid.columns - 1),
    backLeft: poleId(grid.rows - 1, 0),
    backRight: poleId(grid.rows - 1, grid.columns - 1),
  };
}

export function roofCellId(row, column) {
  return `roof-r${row}-c${column}`;
}

export function buildRoofCells(dimensions = {}) {
  const grid = buildPoleGrid(dimensions);
  const cellWidthMm = (grid.width - 150) / Math.max(1, grid.columns - 1);
  const cellDepthMm = (grid.depth - 150) / Math.max(1, grid.rows - 1);
  const cells = [];

  for (let row = 0; row < grid.rows - 1; row += 1) {
    for (let column = 0; column < grid.columns - 1; column += 1) {
      cells.push({
        id: roofCellId(row, column),
        row,
        column,
        label: `Roof rectangle ${row + 1}-${column + 1}`,
        widthMm: cellWidthMm,
        depthMm: cellDepthMm,
        frontLeft: poleId(row, column),
        frontRight: poleId(row, column + 1),
        backLeft: poleId(row + 1, column),
        backRight: poleId(row + 1, column + 1),
      });
    }
  }

  return cells;
}

export function getRoofCell(gridOrDimensions, id) {
  const dimensions = gridOrDimensions?.dimensions ?? gridOrDimensions;
  return buildRoofCells(dimensions).find((cell) => cell.id === id) ?? null;
}
