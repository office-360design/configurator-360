import assert from 'node:assert/strict';
import { getWindowLayoutDefinition } from '../../src/client/js/window-layout-controller.js';
import {
    addWindowToState,
    createSingleWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
    mergeWindowsInState,
    setTransBetweenWindowsInState,
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
        glassRatePerSqm: 80,
        gasketRatePerM: 4,
        insulationRatePerM: 2.5,
        foamRatePerM: 1.5,
        lockingBarRatePerM: 3,
        glazingBridgeRatePerM: 2,
        drainageCapRatePerPc: 0.75,
        otherComponentRatePerUnit: 2,
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
    assert.equal(
        Number(result.totals.total.toFixed(4)),
        Number((result.totals.aluminiumWeightKg * 8 + result.totals.glassAreaSqm * 80 + result.totals.accessoryTotal).toFixed(4)),
        'The window total must use €8/kg aluminium plus €80/m² glass plus the profile polymer/insulation material.'
    );
    assert.ok(result.totals.total > 0);

    const noGlassResult = build(makeSnapshot(layoutState, {
        fixedCells: [
            { id: 'w1', width: 0.6, height: 1.4 },
            { id: 'w2', width: 0.6, height: 1.4 },
        ],
        glassPieces: [
            { cellId: 'w1', width: 0.52, height: 1.32, isFixed: true },
            { cellId: 'w2', width: 0.52, height: 1.32, isFixed: true },
        ],
    }), { glassEnabled: false });
    assert.equal(noGlassResult.totals.glassEnabled, false);
    assert.equal(noGlassResult.totals.glassTotal, null);
    assert.equal(
        Number(noGlassResult.totals.total.toFixed(4)),
        Number((noGlassResult.totals.aluminiumTotal + noGlassResult.totals.accessoryTotal).toFixed(4)),
        'When glass is disabled, total should omit glass cost.'
    );
}


{
    // Two 600 x 900 fixed windows side by side: each top/bottom glazing bead
    // terminates at one 32 mm outer-frame side and one 19 mm mullion side.
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        fixedCells: state.windows.map(cell => ({ id: cell.id, width: 0.6, height: 0.9 })),
    }));
    const w1Beads = result.cuts.filter(cut => cut.category === 'bead' && cut.windowNumber === 1);
    const horizontal = w1Beads.filter(cut => cut.orientation === 'horizontal').map(cut => Number(cut.lengthM.toFixed(3)));
    const vertical = w1Beads.filter(cut => cut.orientation === 'vertical').map(cut => Number(cut.lengthM.toFixed(3)));
    assert.deepEqual(horizontal, [0.549, 0.549], '600 - 32 - 19 = 549 mm for frame-to-mullion fixed glazing beads.');
    assert.deepEqual(vertical, [0.836, 0.836], '900 - 32 - 32 = 836 mm where both bead ends terminate at outer frames.');
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



{
    // Default 2x2 fixed layout: every visible window is 600 x 900 mm. The
    // glazing-bead saw length must be inside that module, not the renderer's
    // 613/913 mm CAD connection-seat rectangle.
    let state = createSingleWindowState({ type: 'fixed-glazing', dividerProfileId: '575800' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w1', direction: 'top', type: 'fixed-glazing' });
    state = addWindowToState(state, { cellId: 'w2', direction: 'top', type: 'fixed-glazing' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        fixedCells: state.windows.map(cell => ({
            id: cell.id,
            width: 0.6,
            height: 0.9,
            // Reproduce the old renderer connection rectangle that caused the
            // incorrect 613/913 mm BOM values.
            fixedAccessoryWidth: 0.613,
            fixedAccessoryHeight: 0.913,
        })),
    }));

    const frameCuts = result.cuts.filter(cut => cut.category === 'frame');
    assert.deepEqual(
        frameCuts.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [1.2, 1.2, 1.8, 1.8],
        '2x2 outer-frame cuts must equal the complete 1200 x 1800 mm construction.'
    );

    const fixedBeads = result.cuts.filter(cut => cut.category === 'bead' && cut.windowNumber === 4);
    assert.deepEqual(
        fixedBeads.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [0.549, 0.549, 0.849, 0.849],
        'A 600 x 900 corner fixed light uses 32 mm frame-side and 19 mm mullion-side glazing-bead saw offsets, not renderer connection spans.'
    );

    const verticalMullion = result.cuts.find(cut => cut.category === 'mullion' && cut.orientation === 'vertical');
    assert.equal(Number(verticalMullion.lengthM.toFixed(3)), 1.736, 'Full-height mullion must follow H - 64 mm.');
    const horizontalBranches = result.cuts.filter(cut => cut.category === 'mullion' && cut.orientation === 'horizontal');
    assert.deepEqual(
        horizontalBranches.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [0.524, 0.524],
        'At a cross, each branch must stop at the face of the continuous 88 mm mullion.'
    );
}

{
    // A standalone 600 x 900 sash: the sash mitre long-point dimension is
    // reduced by 27 mm per frame side, then its glazing bead is reduced by a
    // further 49 mm per sash side.
    let state = createSingleWindowState({ type: 'opening-sash', dividerProfileId: '575800' });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    let result = build(makeSnapshot(layoutState, {
        openingCells: [{ id: 'w1', width: 0.6, height: 0.9 }],
    }));
    const sashCuts = result.cuts.filter(cut => cut.category === 'sash');
    assert.deepEqual(
        sashCuts.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [0.546, 0.546, 0.846, 0.846],
        'Standalone sash cuts must be 546 x 846 mm for a 600 x 900 mm outer-frame module (27 mm per side).'
    );
    const sashBeads = result.cuts.filter(cut => cut.category === 'bead');
    assert.deepEqual(
        sashBeads.map(cut => Number(cut.lengthM.toFixed(3))).sort((a, b) => a - b),
        [0.448, 0.448, 0.748, 0.748],
        'Sash glazing beads must subtract the 49 mm sash face on each side from the sash saw length.'
    );

    state = addWindowToState(state, { cellId: 'w1', direction: 'right', type: 'opening-sash' });
    state = setTransBetweenWindowsInState(state, { cellAId: 'w1', cellBId: 'w2', enabled: true });
    const transLayoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    result = build(makeSnapshot(transLayoutState, {
        openingCells: [{ id: 'w1', width: 0.6, height: 0.9 }, { id: 'w2', width: 0.6, height: 0.9 }],
    }));
    const transCut = result.cuts.find(cut => cut.category === 'trans');
    assert.equal(Number(transCut.lengthM.toFixed(3)), 0.766, 'Double-vent profile must follow X = h - 80 mm using the corrected 846 mm sash height.');
}

{
    const state = createSingleWindowState({ type: 'opening-sash', dividerProfileId: '575800', widthM: 1.2, heightM: 1.4 });
    const layoutState = { windowState: state, topology: deriveWindowTopology(state), dividerProfileId: '575800', transProfileId: '575820' };
    const result = build(makeSnapshot(layoutState, {
        openingCells: [{ id: 'w1', width: 1.2, height: 1.4 }],
        glassPieces: [{ cellId: 'w1', width: 1.02, height: 1.22, isFixed: false }],
    }), {
        accessorySelection: {
            accessories: {
                'locking-bar': { enabled: true, available: true, profileId: '275701' },
                'centre-gasket': { enabled: true, available: true, profileId: '224068' },
                'insulation-profile': { enabled: true, available: true, profileId: '200988' },
                'rebate-gasket': { enabled: true, available: true, profileId: '245472' },
                'outer-glazing-gasket': { enabled: true, available: true, profileId: '224063' },
                'inner-glazing-gasket': { enabled: true, available: true, profileId: '224378' },
                'glazing-bridge': { enabled: true, available: true, profileId: '288319' },
                'drainage-cap': { enabled: true, available: true, profileId: '208694' },
            },
        },
    });
    const accessories = result.bomItems.filter(item => item.type === 'accessory');
    assert.equal(accessories.length, 12, 'Profile material colours plus all enabled/available modeled accessory families should enter the BOM.');
    assert.ok(accessories.every(item => item.price > 0 && item.weightKg > 0));
    const drainage = accessories.find(item => item.profileId === '208694');
    assert.equal(drainage.quantity, 3, 'A 1200 mm bottom drainage field should receive three drainage caps at <=650 mm spacing.');
    assert.equal(drainage.materialGroup, 'other');
    assert.equal(drainage.unit, 'pc');
    assert.equal(Number(drainage.rateEurPerUnit.toFixed(2)), 0.75);
    assert.equal(Number(drainage.price.toFixed(3)), 2.25, 'Drainage caps should be priced by piece count (3 * €0.75 = €2.25).');
    assert.equal(drainage.priceBasis, 'piece-count');
    assert.ok(result.totals.accessoryTotal > 0);
    assert.ok(result.totals.accessoryWeightKg > 0);
    assert.ok(result.totals.gasketTotal > 0, 'EPDM/gasket-colour parts need their own subtotal.');
    assert.ok(result.totals.insulationTotal > 0, 'Insulation-bar-colour parts need their own subtotal.');
    assert.ok(result.totals.foamTotal > 0, 'Foam-colour profile components need their own subtotal.');
    assert.ok(result.totals.otherComponentTotal > 0, 'Other-colour components need their own subtotal.');
    assert.equal(result.totals.drainageCapQuantity, 3);
    assert.ok(result.totals.gasketLengthM > 0);
    assert.ok(result.totals.insulationLengthM > 0);
    assert.ok(result.totals.foamLengthM > 0);
    assert.ok(result.totals.lockingBarLengthM > 0);
    assert.ok(result.totals.glazingBridgeLengthM > 0);
    assert.equal(
        Number(result.totals.accessoryTotal.toFixed(6)),
        Number((result.totals.gasketTotal + result.totals.insulationTotal + result.totals.foamTotal + result.totals.otherComponentTotal).toFixed(6)),
        'The non-aluminium subtotal must be the sum of the four material-colour groups.'
    );
    assert.equal(
        Number(result.totals.total.toFixed(4)),
        Number((result.totals.aluminiumTotal + result.totals.glassTotal + result.totals.accessoryTotal).toFixed(4)),
        'Material total must include the enabled accessory/plastic BOM.'
    );
}

console.log('Window BOM/cut summary validation passed.');
