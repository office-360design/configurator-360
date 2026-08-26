import {
    FIXED_WINDOW_TYPE,
    MAX_WINDOW_CELLS,
    SASH_WINDOW_TYPE,
    addWindowToState,
    classifyWindowState,
    createSingleWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
    getTransOwnerHandleSide,
    getWindowActualSizeInState,
    getWindowUnmergeGuide,
    mergeWindowsInState,
    unmergeWindowInState,
    normalizeWindowState,
    parseWindowState,
    resolveDividerConnection,
    serializeWindowState,
    setTransBetweenWindowsInState,
    setWindowTypeInState,
    setWindowSizeInState,
} from '../../src/client/js/window-layout-state.js';

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const cell = (state, id) => state.windows.find(windowCell => windowCell.id === id);

const singleState = createSingleWindowState({ type: SASH_WINDOW_TYPE });
const singleTopology = deriveWindowTopology(singleState);
assert(singleTopology.addCandidates.length === 4, 'A single starting window must expose four add buttons.');
assert(
    ['bottom', 'left', 'right', 'top'].every(direction =>
        singleTopology.addCandidates.some(candidate => candidate.direction === direction)
    ),
    'The starting window must be addable from left, right, top, and bottom.'
);
const singleSize = getWindowActualSizeInState(singleState, 'w1');
assert(
    Math.abs(singleSize.widthM - 0.6) < 1e-9
        && Math.abs(singleSize.heightM - 0.9) < 1e-9
        && Math.abs(singleSize.structuralWidthM - 0.574) < 1e-9
        && Math.abs(singleSize.structuralHeightM - 0.874) < 1e-9,
    'A new standalone window must default to 600 x 900 while storing a 13 mm structural inset on every exposed side.'
);
let sizedPair = addWindowToState(singleState, { cellId: 'w1', direction: 'right', type: FIXED_WINDOW_TYPE });
assert(
    sizedPair.windows.every(windowCell => {
        const size = getWindowActualSizeInState(sizedPair, windowCell.id);
        return Math.abs(size.widthM - 0.6) < 1e-9 && Math.abs(size.heightM - 0.9) < 1e-9;
    }),
    'Adding a neighbour must create a 600 x 900 window and preserve the independent width of the original column.'
);
sizedPair = setWindowSizeInState(sizedPair, 'w1', { widthM: 0.75 });
assert(
    Math.abs(getWindowActualSizeInState(sizedPair, 'w1').widthM - 0.75) < 1e-9
        && Math.abs(getWindowActualSizeInState(sizedPair, 'w2').widthM - 0.6) < 1e-9,
    'Changing one window width must resize its column without changing another column.'
);
assert(
    Math.abs(getWindowActualSizeInState(sizedPair, 'w1').heightM - 0.9) < 1e-9
        && Math.abs(getWindowActualSizeInState(sizedPair, 'w2').heightM - 0.9) < 1e-9,
    'Changing width alone must never modify the row height.'
);

let customAddState = createSingleWindowState({ type: FIXED_WINDOW_TYPE });
customAddState = setWindowSizeInState(customAddState, 'w1', { widthM: 0.4, heightM: 0.4 });
customAddState = addWindowToState(customAddState, { cellId: 'w1', direction: 'right', type: FIXED_WINDOW_TYPE });
assert(
    Math.abs(getWindowActualSizeInState(customAddState, 'w1').widthM - 0.4) < 1e-9
        && Math.abs(getWindowActualSizeInState(customAddState, 'w1').heightM - 0.4) < 1e-9
        && Math.abs(getWindowActualSizeInState(customAddState, 'w2').widthM - 0.6) < 1e-9
        && Math.abs(getWindowActualSizeInState(customAddState, 'w2').heightM - 0.4) < 1e-9,
    'Adding right to a 400 x 400 window must preserve the 400 mm row height and default only the new width to 600 mm.'
);
customAddState = addWindowToState(customAddState, { cellId: 'w2', direction: 'top', type: FIXED_WINDOW_TYPE });
customAddState = setWindowSizeInState(customAddState, 'w3', { widthM: 0.55, heightM: 0.5 });
customAddState = addWindowToState(customAddState, { cellId: 'w1', direction: 'top', type: FIXED_WINDOW_TYPE });
const filledCell = customAddState.windows.find(windowCell => windowCell.id === 'w4');
const filledSize = getWindowActualSizeInState(customAddState, filledCell?.id);
assert(
    Math.abs(filledSize?.widthM - 0.4) < 1e-9
        && Math.abs(filledSize?.heightM - 0.5) < 1e-9,
    'Filling an already established row and column must inherit both dimensions and apply neither the 600 mm nor 900 mm default.'
);

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

let pairedSashState = createSingleWindowState({ type: FIXED_WINDOW_TYPE });
pairedSashState = addWindowToState(pairedSashState, { cellId: 'w1', direction: 'right', type: FIXED_WINDOW_TYPE });
pairedSashState = setWindowTypeInState(pairedSashState, 'w1', SASH_WINDOW_TYPE, 'left');
pairedSashState = setWindowTypeInState(pairedSashState, 'w2', SASH_WINDOW_TYPE, 'left');
assert(
    cell(pairedSashState, 'w1')?.handleSide === 'left' && cell(pairedSashState, 'w2')?.handleSide === 'left',
    'Ordinary side-by-side sashes must keep the opening sides selected by the user until trans is enabled.'
);

let addedSashPair = createSingleWindowState({ type: SASH_WINDOW_TYPE, handleSide: 'left' });
addedSashPair = addWindowToState(addedSashPair, { cellId: 'w1', direction: 'right', type: SASH_WINDOW_TYPE, handleSide: 'right' });
assert(
    cell(addedSashPair, 'w1')?.handleSide === 'left' && cell(addedSashPair, 'w2')?.handleSide === 'right',
    'Adding a sash beside another sash must not silently change either handle side.'
);

let addedLeftSashPair = createSingleWindowState({ type: SASH_WINDOW_TYPE, handleSide: 'right' });
addedLeftSashPair = addWindowToState(addedLeftSashPair, { cellId: 'w1', direction: 'left', type: SASH_WINDOW_TYPE, handleSide: 'left' });
const leftAddedCell = addedLeftSashPair.windows.find(windowCell => windowCell.id !== 'w1');
assert(
    leftAddedCell?.handleSide === 'left' && cell(addedLeftSashPair, 'w1')?.handleSide === 'right',
    'Adding the second sash on the left must also preserve the explicitly selected handle sides.'
);

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
assert(
    getWindowUnmergeGuide(mergeState, 'w1')?.orientation === 'vertical',
    'A merged window must expose its last restorable merge boundary.'
);
const restoredMergeState = unmergeWindowInState(mergeState, { cellId: 'w1' });
assert(restoredMergeState.windows.length === 2, 'Unmerge must restore the merged window to two cells.');
assert(deriveWindowTopology(restoredMergeState).dividers.length === 1, 'Unmerge must restore the mullion between the two cells.');
assert(
    restoredMergeState.windows.map(windowCell => windowCell.type).sort().join(',')
        === [FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE].sort().join(','),
    'Unmerge must restore the original per-cell fixed/sash types from before the merge.'
);
assert(
    !getWindowUnmergeGuide(restoredMergeState, 'w1'),
    'The merge guide used for unmerge must be consumed after the split.'
);
const serializedMergeState = parseWindowState(serializeWindowState(mergeState));
const restoredSerializedMergeState = unmergeWindowInState(serializedMergeState, { cellId: 'w1' });
assert(
    restoredSerializedMergeState.windows.map(windowCell => windowCell.type).sort().join(',')
        === [FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE].sort().join(','),
    'Serialized merged states must preserve the original per-cell types needed by unmerge.'
);

const mergedTopology = deriveWindowTopology(mergeState);
const mergedTopAdds = mergedTopology.addCandidates
    .filter(candidate => candidate.cellId === 'w1' && candidate.direction === 'top')
    .sort((a, b) => a.start - b.start);
const mergedBottomAdds = mergedTopology.addCandidates
    .filter(candidate => candidate.cellId === 'w1' && candidate.direction === 'bottom')
    .sort((a, b) => a.start - b.start);
assert(
    mergedTopAdds.length === 2
        && mergedTopAdds[0].start === 0 && mergedTopAdds[0].end === 1
        && mergedTopAdds[1].start === 1 && mergedTopAdds[1].end === 2,
    'Merging two side-by-side windows must keep two separate add positions along the merged top edge.'
);
assert(
    mergedBottomAdds.length === 2
        && mergedBottomAdds[0].start === 0 && mergedBottomAdds[0].end === 1
        && mergedBottomAdds[1].start === 1 && mergedBottomAdds[1].end === 2,
    'Merging two side-by-side windows must keep two separate add positions along the merged bottom edge.'
);
const mergedWithNeighbour = addWindowToState(mergeState, {
    cellId: 'w1',
    direction: 'top',
    type: FIXED_WINDOW_TYPE,
    start: mergedTopAdds[1].start,
    end: mergedTopAdds[1].end,
});
const mergedNeighbour = mergedWithNeighbour.windows.find(windowCell => windowCell.id !== 'w1');
assert(
    mergedNeighbour?.rect.x0 === 1
        && mergedNeighbour?.rect.x1 === 2
        && mergedNeighbour?.rect.y0 === 1
        && mergedNeighbour?.rect.y1 === 2,
    'Adding next to one half of a merged window must create one normal bay, not another merged-width window.'
);

let transState = createSingleWindowState({ type: SASH_WINDOW_TYPE, handleSide: 'left', transProfileId: '575830' });
transState = addWindowToState(transState, { cellId: 'w1', direction: 'right', type: SASH_WINDOW_TYPE, handleSide: 'left' });
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
assert(
    cell(transState, transCandidate.cellAId)?.handleSide === 'right'
        && cell(transState, transCandidate.cellBId)?.handleSide === 'left',
    'Pressing T on two side-by-side sashes must move the left sash handle to the right and keep/move the right sash handle to the left.'
);
assert(transTopology.dividers.length === 0, 'A trans must replace the structural mullion on the shared sash boundary.');
assert(transTopology.transSegments.length === 1, 'The shared sash boundary must become one trans line piece.');
assert(transTopology.transSegments[0].ownerCellId === transTopology.transSegments[0].positiveCellId, 'The right/positive sash must own the trans by default.');
assert(
    getTransOwnerHandleSide(transTopology.transSegments[0]) === 'left',
    'A right/positive trans-owner sash must put its handle on the trans side so it hinges on the outer right frame and opens left-to-right.'
);
assert(
    getTransOwnerHandleSide({
        ...transTopology.transSegments[0],
        ownerCellId: transTopology.transSegments[0].negativeCellId,
    }) === 'right',
    'A left/negative trans-owner sash must mirror the rule and hinge on the outer left frame.'
);
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
    console.log('Window layout state valid: per-window grid sizing, directional 600/900 defaults, inherited established tracks, outward add, arbitrary cell count, L/T classification, frame-to-divider replacement, merge, and floating-trans topology passed.');
}
