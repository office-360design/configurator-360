import {
    FIXED_WINDOW_TYPE,
    MAX_WINDOW_CELLS,
    SASH_WINDOW_TYPE,
    addWindowToState,
    classifyWindowState,
    createSingleWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
    mergeWindowsInState,
    normalizeWindowState,
    resolveDividerConnection,
    setTransBetweenWindowsInState,
    setWindowTypeInState,
} from '../../src/client/js/window-layout-state.js';

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const cell = (state, id) => state.windows.find(windowCell => windowCell.id === id);

let leftState = createSingleWindowState({ type: SASH_WINDOW_TYPE });
leftState = addWindowToState(leftState, { cellId: 'w1', direction: 'left', type: FIXED_WINDOW_TYPE });
const leftTopology = deriveWindowTopology(leftState);
const leftDivider = leftTopology.dividers[0];
assert(leftDivider?.orientation === 'vertical', 'Adding left must replace the old left frame with a vertical mullion.');
assert(leftDivider?.negativeCellId !== 'w1' && leftDivider?.positiveCellId === 'w1', 'The newly added left window must sit outside the original window, with the original window on the right of the new mullion.');
assert(leftTopology.frameEdges.some(edge => edge.cellId !== 'w1' && edge.side === 'left'), 'The added left window must receive the new outer left frame.');
assert(!leftTopology.frameEdges.some(edge => edge.cellId === 'w1' && edge.side === 'left'), 'The original window left frame must be removed after adding left.');

let state = createSingleWindowState({ type: FIXED_WINDOW_TYPE });
state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: SASH_WINDOW_TYPE });
let shape = classifyWindowState(state);
assert(shape.kind === 'linear' && shape.orientation === 'vertical', 'Adding right must create two vertical bays.');
let topology = deriveWindowTopology(state);
assert(topology.dividers.length === 1, 'Two adjacent windows must create one mullion.');
assert(topology.dividers[0].templateId === 'mullion-fixed-sash', 'Fixed/sash adjacency must use the mixed CAD join.');
assert(topology.addCandidates.every(candidate => !(candidate.cellId === 'w1' && candidate.direction === 'right')), 'The replaced frame side must no longer expose an add button.');

const beforeLNeighbour = { ...cell(state, 'w2').rect };
state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: FIXED_WINDOW_TYPE });
shape = classifyWindowState(state);
assert(shape.kind === 'grid', 'Adding above one bay of a two-bay assembly must produce an L/grid topology, not a legacy rectangular T.');
assert(
    JSON.stringify(cell(state, 'w2').rect) === JSON.stringify(beforeLNeighbour),
    'Adding an L branch must not resize or stretch the neighbouring window.'
);
assert(cell(state, 'w3').rect.x0 === 0 && cell(state, 'w3').rect.x1 === 1 && cell(state, 'w3').rect.y0 === 1 && cell(state, 'w3').rect.y1 === 2,
    'The added L window must be one full window outside the selected top frame.');
topology = deriveWindowTopology(state);
assert(topology.dividers.length === 2, 'A three-window L has exactly two cell-to-cell mullion segments.');
assert(topology.mergeCandidates.length === 2, 'Both adjacent pairs of a three-window L should be mergeable when each pair forms a rectangle.');
assert(topology.addCandidates.length > 0, 'Adding windows must remain available after three windows.');

state = addWindowToState(state, { cellId: 'w2', direction: 'top', type: SASH_WINDOW_TYPE });
assert(state.windows.length === 4, 'A fourth window must be addable; the editable layout is not limited to three windows.');
assert(classifyWindowState(state).kind === 'grid', 'A four-window 2x2 assembly must use generic grid classification.');
assert(deriveWindowTopology(state).addCandidates.length > 0, 'Add buttons must remain available beyond four windows.');

const normalizedFour = normalizeWindowState({
    dividerProfileId: state.dividerProfileId,
    windows: state.windows,
});
assert(normalizedFour.windows.length === 4, 'Normalizing a saved state must not truncate windows after the third cell.');
assert(MAX_WINDOW_CELLS > 3, 'The configured editable-window limit must allow more than three windows.');

const lRotations = [
    { first: 'right', second: 'top' },
    { first: 'right', second: 'bottom' },
    { first: 'left', second: 'top' },
    { first: 'left', second: 'bottom' },
    { first: 'top', second: 'right' },
    { first: 'top', second: 'left' },
    { first: 'bottom', second: 'right' },
    { first: 'bottom', second: 'left' },
];
for (const { first, second } of lRotations) {
    let lState = createSingleWindowState({ type: FIXED_WINDOW_TYPE });
    lState = addWindowToState(lState, { cellId: 'w1', direction: first, type: SASH_WINDOW_TYPE });
    lState = addWindowToState(lState, { cellId: 'w1', direction: second, type: FIXED_WINDOW_TYPE });
    const lShape = classifyWindowState(lState);
    assert(lShape.kind === 'grid', `L layout ${first} then ${second} must not be classified as t-grid.`);
    assert(deriveWindowTopology(lState).dividers.length === 2, `L layout ${first} then ${second} must have exactly two mullions.`);
}

const legacyT = createWindowStateFromLayoutDefinition({
    layoutKind: 't-grid',
    dividerOrientation: 'grid',
    cells: [FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE, SASH_WINDOW_TYPE],
    topRowFraction: 0.3,
});
const legacyTShape = classifyWindowState(legacyT);
assert(legacyTShape.kind === 't-grid' && legacyTShape.spanningSide === 'top', 'A real rectangular legacy T layout must still classify as t-grid.');

let mergeState = createSingleWindowState({ type: FIXED_WINDOW_TYPE });
mergeState = addWindowToState(mergeState, { cellId: 'w1', direction: 'right', type: SASH_WINDOW_TYPE });
const merge = deriveWindowTopology(mergeState).mergeCandidates[0];
mergeState = mergeWindowsInState(mergeState, {
    cellAId: merge.cellAId,
    cellBId: merge.cellBId,
    type: SASH_WINDOW_TYPE,
});
assert(mergeState.windows.length === 1, 'Merging must remove the mullion and replace two cells with one window.');

let transState = createSingleWindowState({ type: SASH_WINDOW_TYPE, transProfileId: '575830' });
transState = addWindowToState(transState, { cellId: 'w1', direction: 'right', type: SASH_WINDOW_TYPE });
let transTopology = deriveWindowTopology(transState);
assert(transTopology.transCandidates.length === 1, 'Two side-by-side sashes must expose one trans button.');
assert(transTopology.dividers.length === 1, 'Before trans is enabled the sash pair must still use a structural mullion.');
const transCandidate = transTopology.transCandidates[0];
transState = setTransBetweenWindowsInState(transState, {
    cellAId: transCandidate.cellAId,
    cellBId: transCandidate.cellBId,
    enabled: true,
});
transTopology = deriveWindowTopology(transState);
assert(transState.transProfileId === '575830', 'The selected trans profile must be kept in window state.');
assert(transState.transConnections.length === 1, 'Enabling trans must create one sash-pair relationship.');
assert(transTopology.dividers.length === 0, 'A trans must replace the structural mullion on the shared sash boundary.');
assert(transTopology.transSegments.length === 1, 'The shared sash boundary must become one trans line piece.');
assert(transTopology.transSegments[0].ownerCellId === transTopology.transSegments[0].positiveCellId, 'The right/positive sash must own the trans by default.');
assert(transTopology.transSegments[0].templateId === 'trans-sash-sash', 'The trans edge must use the dedicated sash/trans/sash join.');
transState = setWindowTypeInState(transState, transCandidate.cellBId, FIXED_WINDOW_TYPE);
assert(transState.transConnections.length === 0, 'Changing either trans sash to fixed glazing must automatically remove the trans relationship.');

assert(resolveDividerConnection(FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE).templateId === 'mullion-fixed-fixed', 'Fixed/fixed connection mapping failed.');
assert(resolveDividerConnection(SASH_WINDOW_TYPE, SASH_WINDOW_TYPE).templateId === 'mullion-sash-sash', 'Sash/sash connection mapping failed.');
assert(resolveDividerConnection(SASH_WINDOW_TYPE, FIXED_WINDOW_TYPE).reversed === true, 'Sash/fixed must reverse the authored fixed/sash join.');

if (errors.length) {
    console.error('Window layout state validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout state valid: outward add, arbitrary cell count, L/T classification, frame-to-divider replacement, per-divider join mapping, merge, and floating-trans topology passed.');
}
