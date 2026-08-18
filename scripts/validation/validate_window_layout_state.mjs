import {
    FIXED_WINDOW_TYPE,
    SASH_WINDOW_TYPE,
    addWindowToState,
    classifyWindowState,
    createSingleWindowState,
    deriveWindowTopology,
    mergeWindowsInState,
    resolveDividerConnection,
} from '../../src/client/js/window-layout-state.js';

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

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

state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: FIXED_WINDOW_TYPE });
shape = classifyWindowState(state);
assert(shape.kind === 't-grid', 'Adding above one bay of a two-bay assembly must produce a T topology.');
assert(state.windows.find(cell => cell.id === 'w2').rect.y1 === 1, 'The neighbouring boundary cell must stretch when the assembly expands, preserving a rectangular outer frame.');
topology = deriveWindowTopology(state);
assert(topology.dividers.length === 3, 'A three-cell T partition has three cell-to-cell connection segments.');
assert(topology.mergeCandidates.length === 1, 'Only the branch pair whose union is rectangular should expose a merge action.');
assert(topology.addCandidates.length === 0, 'Once the maximum of three windows is reached, no add buttons should remain.');

const merge = topology.mergeCandidates[0];
state = mergeWindowsInState(state, {
    cellAId: merge.cellAId,
    cellBId: merge.cellBId,
    type: SASH_WINDOW_TYPE,
});
assert(state.windows.length === 2, 'Merging must remove the mullion and replace two cells with one window.');

assert(resolveDividerConnection(FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE).templateId === 'mullion-fixed-fixed', 'Fixed/fixed connection mapping failed.');
assert(resolveDividerConnection(SASH_WINDOW_TYPE, SASH_WINDOW_TYPE).templateId === 'mullion-sash-sash', 'Sash/sash connection mapping failed.');
assert(resolveDividerConnection(SASH_WINDOW_TYPE, FIXED_WINDOW_TYPE).reversed === true, 'Sash/fixed must reverse the authored fixed/sash join.');

if (errors.length) {
    console.error('Window layout state validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout state valid: outward add, frame-to-divider replacement, T expansion, per-divider join mapping, and merge passed.');
}
