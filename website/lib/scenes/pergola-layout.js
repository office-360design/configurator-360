// Kept in sync with pergola-configurator/src/layout.js. The marketing preview
// uses the configurator's real 5 m support-span topology rather than a visual
// approximation.
export const MAX_POLE_SPAN_MM = 5000;

function normalizeDimensions(dimensions = {}) {
  return {
    width: Math.round(Math.min(20000, Math.max(2000, Number(dimensions.width) || 5000))),
    depth: Math.round(Math.min(20000, Math.max(2000, Number(dimensions.depth) || 3500))),
    height: Math.round(Math.min(3000, Math.max(2000, Number(dimensions.height) || 2700))),
  };
}

export function buildPoleGrid(dimensions = {}) {
  const normalized = normalizeDimensions(dimensions);
  const columns = Math.max(2, Math.ceil(normalized.width / MAX_POLE_SPAN_MM) + 1);
  const rows = Math.max(2, Math.ceil(normalized.depth / MAX_POLE_SPAN_MM) + 1);
  const poles = [];
  const segments = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      poles.push({
        id: `r${row}c${column}`,
        row,
        column,
        xRatio: column / (columns - 1),
        zRatio: row / (rows - 1),
        label: `Pole ${row + 1}-${column + 1}`,
      });
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      segments.push({
        id: `h-r${row}-c${column}`,
        axis: 'horizontal', row, column,
        a: `r${row}c${column}`, b: `r${row}c${column + 1}`,
        boundary: row === 0 ? 'front' : row === rows - 1 ? 'back' : null,
        lengthMm: (normalized.width - 150) / (columns - 1),
      });
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      segments.push({
        id: `v-r${row}-c${column}`,
        axis: 'vertical', row, column,
        a: `r${row}c${column}`, b: `r${row + 1}c${column}`,
        boundary: column === 0 ? 'left' : column === columns - 1 ? 'right' : null,
        lengthMm: (normalized.depth - 150) / (rows - 1),
      });
    }
  }

  return { ...normalized, rows, columns, poles, segments };
}
