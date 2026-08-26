import assert from 'node:assert/strict';
import { getWindowLayoutDefinition } from '../../src/client/js/window-layout-controller.js';
import {
    addWindowToState,
    createSingleWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
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
    const layoutState = { topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
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
        [1.2, 1.2, 1.4, 1.4],
        'Frame cut lengths should be the finished outer dimensions at normal welded corners.'
    );
    assert.ok(frames.every(cut => cut.startJoint === 'miter' && cut.endJoint === 'miter'));

    const mullions = result.cuts.filter(cut => cut.category === 'mullion');
    assert.equal(mullions.length, 1);
    assert.equal(Number(mullions[0].lengthM.toFixed(3)), 1.336);
    assert.equal(mullions[0].startJoint, 'square-frame');
    assert.equal(mullions[0].endJoint, 'square-frame');
    assert.equal(Object.hasOwn(mullions[0], 'stockLengthM'), false, '6 m stock optimization is intentionally not part of this version.');

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
    const layoutState = { topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
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
}

{
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: 'fixed-glazing' });
    const layoutState = { topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState));
    const mixedIntersectionFrames = result.cuts.filter(cut => (
        cut.category === 'frame'
        && (cut.startJoint === 'square-divider' || cut.endJoint === 'square-divider')
    ));
    assert.ok(mixedIntersectionFrames.length >= 2, 'L/mixed frame-to-mullion intersections must end square, not with an invented 45° hole/socket.');
}

console.log('Window BOM/cut summary validation passed.');
