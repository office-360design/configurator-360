export const FINISHES = Object.freeze({
  anthracite: { color: '#343a40', labelKey: 'finish.anthracite', multiplier: 1 },
  black: { color: '#181b1e', labelKey: 'finish.black', multiplier: 1.04 },
  white: { color: '#e7e7e2', labelKey: 'finish.white', multiplier: 1.05 },
  bronze: { color: '#5e5145', labelKey: 'finish.bronze', multiplier: 1.08 },
  wood: { color: '#9b6539', labelKey: 'finish.wood', multiplier: 1.18 },
});

export const PANEL_STYLES = Object.freeze({
  vertical: { labelKey: 'panel.vertical', pricePerM2: 145, material: 'Powder-coated aluminium vertical slats' },
  horizontal: { labelKey: 'panel.horizontal', pricePerM2: 160, material: 'Powder-coated aluminium horizontal slats' },
  privacy: { labelKey: 'panel.privacy', pricePerM2: 185, material: 'Solid aluminium privacy panel' },
  mesh: { labelKey: 'panel.mesh', pricePerM2: 82, material: 'Welded steel mesh panel' },
});

export const DEFAULT_FENCE_STATE = Object.freeze({
  layout: 'straight',
  runA: 8,
  runB: 5,
  runC: 5,
  height: 1.8,
  targetBayWidth: 2,
  panelStyle: 'vertical',
  finish: 'anthracite',
  infillGap: 0.035,
  foundation: 'concrete',
  gateType: 'pedestrian',
  gateRun: 'a',
  gatePosition: 1,
  gateHanding: 'right',
  scenery: true,
  showDimensions: true,
  compassVisible: false,
  technicalEdges: false,
  cameraPreset: '3d',
  sunPosition: 48,
  northDirection: 0,
  nightPreview: false,
});

export function createFenceState(source = {}) {
  return normalizeFenceState({ ...structuredClone(DEFAULT_FENCE_STATE), ...structuredClone(source) });
}

export function activeRunIds(state) {
  if (state.layout === 'straight') return ['a'];
  if (state.layout === 'l') return ['a', 'b'];
  return ['a', 'b', 'c'];
}

export function runLength(state, runId) {
  return Number(state[`run${runId.toUpperCase()}`] ?? 0);
}

export function deriveRun(state, runId) {
  const length = Math.max(1, runLength(state, runId));
  const target = Math.max(0.8, Number(state.targetBayWidth) || 2);
  const bayCount = Math.max(1, Math.round(length / target));
  return {
    id: runId,
    length,
    bayCount,
    bayWidth: length / bayCount,
  };
}

export function deriveFenceMetrics(state) {
  const runs = activeRunIds(state).map((runId) => deriveRun(state, runId));
  const bayCount = runs.reduce((sum, run) => sum + run.bayCount, 0);
  const totalLength = runs.reduce((sum, run) => sum + run.length, 0);
  const cornerCount = Math.max(0, runs.length - 1);
  const area = totalLength * state.height;
  const gate = deriveGate(state, runs);
  const removedGatePosts = gate ? Math.max(0, gate.span - 1) : 0;
  const postCount = bayCount + 1 - removedGatePosts;
  return { runs, bayCount, totalLength, cornerCount, postCount, area, gate };
}

export function deriveGate(state, runs = deriveFenceMetricsWithoutGate(state).runs) {
  if (state.gateType === 'none') return null;
  const active = new Set(runs.map((run) => run.id));
  const runId = active.has(state.gateRun) ? state.gateRun : runs[0]?.id;
  const run = runs.find((item) => item.id === runId);
  if (!run) return null;
  const span = state.gateType === 'driveway' ? Math.min(2, run.bayCount) : 1;
  const maxStart = Math.max(0, run.bayCount - span);
  const startBay = Math.min(maxStart, Math.max(0, Math.floor(Number(state.gatePosition) || 0)));
  return {
    type: state.gateType,
    runId,
    startBay,
    span,
    width: run.bayWidth * span,
    handing: state.gateHanding,
  };
}

function deriveFenceMetricsWithoutGate(state) {
  const runs = activeRunIds(state).map((runId) => deriveRun(state, runId));
  return { runs };
}

export function normalizeFenceState(state) {
  const next = state;
  if (!['straight', 'l', 'u'].includes(next.layout)) next.layout = 'straight';
  next.runA = clampNumber(next.runA, 2, 30, 8);
  next.runB = clampNumber(next.runB, 2, 20, 5);
  next.runC = clampNumber(next.runC, 2, 20, 5);
  next.height = clampNumber(next.height, 0.8, 2.6, 1.8);
  next.targetBayWidth = clampNumber(next.targetBayWidth, 1, 3, 2);
  next.infillGap = clampNumber(next.infillGap, 0.015, 0.12, 0.035);
  if (!PANEL_STYLES[next.panelStyle]) next.panelStyle = 'vertical';
  if (!FINISHES[next.finish]) next.finish = 'anthracite';
  if (!['concrete', 'baseplate'].includes(next.foundation)) next.foundation = 'concrete';
  if (!['none', 'pedestrian', 'driveway'].includes(next.gateType)) next.gateType = 'none';
  if (!['a', 'b', 'c'].includes(next.gateRun)) next.gateRun = 'a';
  if (!['left', 'right'].includes(next.gateHanding)) next.gateHanding = 'right';
  next.gatePosition = Math.max(0, Math.floor(Number(next.gatePosition) || 0));
  next.scenery = Boolean(next.scenery);
  next.showDimensions = Boolean(next.showDimensions);
  next.compassVisible = Boolean(next.compassVisible);
  next.technicalEdges = Boolean(next.technicalEdges);
  next.nightPreview = Boolean(next.nightPreview);
  next.sunPosition = clampNumber(next.sunPosition, 0, 100, 48);
  next.northDirection = clampNumber(next.northDirection, 0, 359, 0);
  if (!['3d', 'front', 'top'].includes(next.cameraPreset)) next.cameraPreset = '3d';

  const metrics = deriveFenceMetricsWithoutGate(next);
  const runIds = metrics.runs.map((run) => run.id);
  if (!runIds.includes(next.gateRun)) next.gateRun = runIds[0] || 'a';
  const gateRun = metrics.runs.find((run) => run.id === next.gateRun);
  if (gateRun) {
    const span = next.gateType === 'driveway' ? Math.min(2, gateRun.bayCount) : 1;
    next.gatePosition = Math.min(next.gatePosition, Math.max(0, gateRun.bayCount - span));
  }
  return next;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
