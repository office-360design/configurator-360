// Configurator state shared by the grid, the 3D scene and the Cortizo
// adapter (cortizo.js). The grid follows the window configurator's track
// model: column widths and row heights are axis-to-axis distances in mm;
// rows are listed from the bottom up.
export const LIMITS = Object.freeze({
  bays: [1, 20], rows: [1, 20], width: [400, 4000], height: [300, 5000],
  wind: [0.3, 3.0], anchorSpacing: [1000, 7000], qty: [1, 999],
});

export const FINISHES = Object.freeze([
  { id: '7016', label: 'RAL 7016', color: '#383e42' },
  { id: '9005', label: 'RAL 9005', color: '#0e0e10' },
  { id: '9006', label: 'RAL 9006', color: '#a1a1a0' },
  { id: '9007', label: 'RAL 9007', color: '#878581' },
  { id: '9016', label: 'RAL 9016', color: '#f1f0ea' },
  { id: '8019', label: 'RAL 8019', color: '#403a3a' },
  { id: 'E6C0', label: 'Eloxat natur', color: '#c3c6c8' },
]);

export const TINTS = Object.freeze(['clear', 'neutral', 'blue', 'bronze']);

export const DEFAULT_STATE = Object.freeze({
  version: 2,
  widths: [1500, 1500, 1500, 1500],
  heights: [900, 2400, 900, 2400],
  rowTypes: ['spandrel', 'vision', 'spandrel', 'vision'],
  windLoad: 0.8,
  anchorSpacing: 3300,
  finishOutside: '7016',
  finishInside: '7016',
  sameFinish: true,
  glassTint: 'neutral',
  showBuilding: true,
  qty: 1,
  // Cortizo system, glass and execution; validated against the catalogue in cortizo.js.
  cortizo: null,
});

export const PRESETS = Object.freeze({
  storefront: { widths: [1200, 1800, 1800, 1200], heights: [3000], rowTypes: ['vision'], anchorSpacing: 3000, windLoad: 0.6 },
  office: { widths: [1500, 1500, 1500, 1500], heights: [900, 2400, 900, 2400], rowTypes: ['spandrel', 'vision', 'spandrel', 'vision'], anchorSpacing: 3300, windLoad: 0.8 },
  atrium: { widths: [1800, 1800, 1800], heights: [2500, 2500, 2500], rowTypes: ['vision', 'vision', 'vision'], anchorSpacing: 3750, windLoad: 1.0 },
});

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const round = v => Math.round(Number(v) || 0);

export function normalizeState(input = {}) {
  const S = { ...DEFAULT_STATE, ...input };
  const list = (values, range, fallback) => {
    const array = Array.isArray(values) && values.length ? values : fallback;
    return array.slice(0, LIMITS.bays[1]).map(v => clamp(round(v), range));
  };
  S.widths = list(S.widths, LIMITS.width, DEFAULT_STATE.widths);
  S.heights = list(S.heights, LIMITS.height, DEFAULT_STATE.heights);
  const types = Array.isArray(S.rowTypes) ? S.rowTypes : [];
  S.rowTypes = S.heights.map((_, i) => (types[i] === 'spandrel' ? 'spandrel' : 'vision'));
  S.windLoad = Math.round(clamp(Number(S.windLoad) || 0.8, LIMITS.wind) * 100) / 100;
  S.anchorSpacing = clamp(round(S.anchorSpacing), LIMITS.anchorSpacing);
  if (!FINISHES.some(f => f.id === S.finishOutside)) S.finishOutside = DEFAULT_STATE.finishOutside;
  if (!FINISHES.some(f => f.id === S.finishInside)) S.finishInside = DEFAULT_STATE.finishInside;
  S.sameFinish = Boolean(S.sameFinish);
  S.showBuilding = S.showBuilding !== false;
  if (S.sameFinish) S.finishInside = S.finishOutside;
  if (!TINTS.includes(S.glassTint)) S.glassTint = DEFAULT_STATE.glassTint;
  S.qty = clamp(round(S.qty) || 1, LIMITS.qty);
  S.cortizo = S.cortizo && typeof S.cortizo === 'object' ? { ...S.cortizo } : null;
  // Fields of the former GUTMANN GCW 050 model (saved before version 2) are dropped.
  for (const key of ['brand', 'mullion', 'transom', 'glazing', 'customThickness', 'customGlass', 'customUg', 'strip', 'coverMullion', 'coverTransom']) delete S[key];
  S.version = 2;
  return S;
}

export const fmt = (x, d = 0) => Number(x).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
