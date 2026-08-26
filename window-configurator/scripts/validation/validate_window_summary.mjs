import assert from 'node:assert/strict';
import { getWindowLayoutDefinition } from '../../src/client/js/window-layout-controller.js';
import {
    addWindowToState,
    createSingleWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
    mergeWindowsInState,
} from '../../src/client/js/window-layout-state.js';
import { buildWindowFabricationSummary } from '../../src/client/js/window-summary.js';

function makeSnapshot(layoutState, { openingCells = [], fixedCells = [], glassPieces = [] } = {}) {
    return {
        width: 1.2,
        height: 1.4,
        layoutState,
        openingCells,
        fixedCells,
        glassPieces,
    };
}

function build(snapshot, overrides = {}) {
    return buildWindowFabricationSummary({
        snapshot,
        profileSelection: { outerFrameProfileId: '575770', sashProfileId: '575790' },
        layoutSelection: { ...snapshot.layoutState, dividerProfileId: '575800', transProfileId: '575820' },
        glazingBeadCode: '573940',
        aluminiumRatePerKg: 8,
        glassRatePerSqm: 45,
        locale: 'en-US',
        ...overrides,
    });
}

{
    const state = createWindowStateFromLayoutDefinition(
        getWindowLayoutDefinition('vertical-fixed-fixed'),
        '575800',
        '575820'
    );
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        fixedCells: [
            { id: 'w1', width: 0.6, height: 1.4 },
            { id: 'w2', width: 0.6, height: 1.4 },
        ],
        glassPieces: [
            { cellId: 'w1', width: 0.52, height: 1.32, isFixed: true },
            { cellId: 'w2', width: 0.52, height: 1.32, isFixed: true },
        ],
    }));

    const frames = result.cuts.filter(cut => cut.category === 'frame');
    assert.equal(frames.length, 4, 'A mullion T must not split/notch the continuous outer frame in the cut list.');
    assert.deepEqual(
        frames.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [0.9, 0.9, 1.2, 1.2],
        'Frame cut lengths should be the finished outer dimensions at normal welded corners.'
    );
    assert.ok(frames.every(cut => cut.startJoint === 'miter' && cut.endJoint === 'miter'));

    const mullions = result.cuts.filter(cut => cut.category === 'mullion');
    assert.equal(mullions.length, 1);
    assert.equal(Number(mullions[0].lengthM.toFixed(3)), 0.836);
    assert.equal(mullions[0].startJoint, 'square-frame');
    assert.equal(mullions[0].endJoint, 'square-frame');
    assert.match(mullions[0].name, /between windows 1–2/, 'Mullions should identify the windows they separate.');
    assert.equal(Object.hasOwn(mullions[0], 'stockLengthM'), false, '6 m stock optimization is intentionally not part of this version.');

    const beads = result.cuts.filter(cut => cut.category === 'bead');
    assert.ok(beads.some(cut => cut.name.includes('Window 1')));
    assert.ok(beads.some(cut => cut.name.includes('Window 2')));
    const glass = result.bomItems.filter(item => item.category === 'glass');
    assert.ok(glass.some(item => item.name.includes('Window 1')));
    assert.ok(glass.some(item => item.name.includes('Window 2')));

    const firstFrameBom = result.bomItems.find(item => item.category === 'frame');
    assert.ok(firstFrameBom?.weightKg > 0);
    assert.equal(Number(firstFrameBom.price.toFixed(4)), Number((firstFrameBom.weightKg * 8).toFixed(4)));
    assert.ok(result.totals.total > 0);
}

{
    const state = createWindowStateFromLayoutDefinition(
        getWindowLayoutDefinition('top-fixed-bottom-sash-sash'),
        '575800',
        '575820'
    );
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        openingCells: [
            { id: 'w2', width: 0.6, height: 0.98 },
            { id: 'w3', width: 0.6, height: 0.98 },
        ],
        fixedCells: [{ id: 'w1', width: 1.2, height: 0.42 }],
    }));
    const dividers = result.cuts.filter(cut => cut.category === 'mullion');
    const horizontal = dividers.find(cut => cut.orientation === 'horizontal');
    const vertical = dividers.find(cut => cut.orientation === 'vertical');
    assert.ok(horizontal && vertical);
    assert.equal(horizontal.startJoint, 'square-frame');
    assert.equal(horizontal.endJoint, 'square-frame');
    assert.ok([vertical.startJoint, vertical.endJoint].includes('square-divider'), 'The branch transom/mullion must butt square into the continuous host member.');
    const sashes = result.cuts.filter(cut => cut.category === 'sash');
    assert.ok(sashes.some(cut => cut.name.includes('Window 2')));
    assert.ok(sashes.some(cut => cut.name.includes('Window 3')));
}

{
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: 'fixed-glazing' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState));
    const mixedIntersectionFrames = result.cuts.filter(cut => (
        cut.category === 'frame'
        && (cut.startJoint === 'square-divider' || cut.endJoint === 'square-divider')
    ));
    assert.ok(mixedIntersectionFrames.length >= 2, 'L/mixed frame-to-mullion intersections must end square, not with an invented 45° hole/socket.');
}


{
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w2', direction: 'right', type: 'fixed-glazing' });
    state = mergeWindowsInState(state, { cellAId: 'w1', cellBId: 'w2', type: 'fixed-glazing' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        fixedCells: [
            { id: state.windows[0].id, width: 1.2, height: 0.9 },
            { id: state.windows[1].id, width: 0.6, height: 0.9 },
        ],
    }));
    const beadNames = result.cuts.filter(cut => cut.category === 'bead').map(cut => cut.name);
    assert.ok(beadNames.some(name => name.includes('Window 1')));
    assert.ok(beadNames.some(name => name.includes('Window 2')));
    assert.ok(!beadNames.some(name => name.includes('Window 3')), 'BOM numbering must stay dense after a merge.');
}

{
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w2', direction: 'top', type: 'fixed-glazing' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState));
    const mullions = result.cuts.filter(cut => cut.category === 'mullion');
    const multiPair = mullions.find(cut => Array.isArray(cut.windowPairs) && cut.windowPairs.length > 1);
    assert.ok(multiPair, 'A continuous mullion through a grid should retain all adjacent window-pair identities.');
    assert.match(multiPair.name, /between windows .*1–2.*3–4|between windows .*1–3.*2–4/);
}

console.log('Window BOM/cut summary validation passed.');
