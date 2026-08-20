import {
    getDividerArrowAlongCoordinate,
    getDividerCrossSectionMetrics,
    getDividerSegmentAlongCoordinate,
    getFixedGlassPanePlacement,
    getHorizontalConnectionFaceDirection,
    getFrameDividerSocketInset,
    getFrameDividerMiterContactStart,
    getFrameGridMiterInset,
    getFrameMixedPlusMiterInset,
    getFrameShiftedDividerSocketInset,
    getFrameReentrantMiterInset,
    getFrameSidePlacements,
    getLinearDividerLayout,
    getTopFixedBottomSashSashLayout,
    getEditableWindowTopologyGeometry,
    getEditableCellInteriorPlacement,
    getEditableDividerSegmentPlacement,
    getEditableReentrantFramePlacement,
    getEditableFixedGlazingDividerCadTransform,
    getReentrantFillerTriangle,
} from '../../src/client/js/window-layout-geometry.js';

import {
    addWindowToState,
    deriveWindowTopology,
    mergeWindowsInState,
    normalizeWindowState,
    setTransBetweenWindowsInState,
} from '../../src/client/js/window-layout-state.js';

const errors = [];
const assert = (condition, message) => {
    if (!condition) errors.push(message);
};

const metrics = getDividerCrossSectionMetrics({
    minX: 56,
    maxX: 144,
    minY: 135,
    maxY: 200,
});
assert(metrics.faceSpanMm === 88, 'Divider CAD X must become the visible face span.');
assert(metrics.depthSpanMm === 65, 'Divider CAD Y must become the profile depth.');

const mixedPlusContactStart = getFrameDividerMiterContactStart({
    dividerFaceSpan: 0.088,
    frameInwardSpan: 0.065,
});
assert(
    Math.abs(mixedPlusContactStart - 0.021) < 1e-12,
    'The active 575760 frame and 575800 mullion must keep the 21 mm mixed-+ apex relation.'
);
assert(
    Math.abs(getFrameMixedPlusMiterInset({
        inwardDistance: 0,
        dividerFaceSpan: 0.088,
        frameInwardSpan: 0.065,
    })) < 1e-12
        && Math.abs(getFrameMixedPlusMiterInset({
            inwardDistance: 0.021,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
        }) + 0.021) < 1e-12
        && Math.abs(getFrameMixedPlusMiterInset({
            inwardDistance: 0.065,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
        }) - 0.023) < 1e-12,
    'A mixed-+ frame cut must keep the outer edge on the structural endpoint, extend 21 mm at the shared apex, and retract 23 mm at the inner edge.'
);
assert(
    Math.abs(getFrameShiftedDividerSocketInset({
        inwardDistance: 0,
        dividerFaceSpan: 0.088,
        frameInwardSpan: 0.065,
        centerShift: 0.021,
        localEnd: 'positive',
    })) < 1e-12
        && Math.abs(getFrameShiftedDividerSocketInset({
            inwardDistance: 0.021,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
            centerShift: 0.021,
            localEnd: 'positive',
        }) + 0.021) < 1e-12
        && Math.abs(getFrameShiftedDividerSocketInset({
            inwardDistance: 0.021,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
            centerShift: 0.021,
            localEnd: 'negative',
        }) - 0.021) < 1e-12
        && Math.abs(getFrameShiftedDividerSocketInset({
            inwardDistance: 0.065,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
            centerShift: 0.021,
            localEnd: 'positive',
        }) - 0.023) < 1e-12
        && Math.abs(getFrameShiftedDividerSocketInset({
            inwardDistance: 0.065,
            dividerFaceSpan: 0.088,
            frameInwardSpan: 0.065,
            centerShift: 0.021,
            localEnd: 'negative',
        }) - 0.065) < 1e-12,
    'A shifted outside-frame socket must keep the outer seam on the equal-window grid, pass through the +21 mm mullion centre, and finish on the shifted mullion faces.'
);

const verticalTop = getFrameSidePlacements({
    orientation: 'vertical',
    width: 1.2,
    height: 1.5,
    side: 'top',
});
assert(verticalTop.length === 2, 'A vertical mullion must split the top frame into two pieces.');
assert(
    verticalTop[0].originX === -0.3 && verticalTop[1].originX === 0.3,
    'Vertical-layout frame pieces must meet at the divider centre.'
);
assert(
    verticalTop[0].windowCell === 'fixed'
        && verticalTop[1].windowCell === 'opening',
    'The verified mixed join must remain fixed-left and sash-right without mirroring.'
);
assert(
    verticalTop[0].localJointEnd === 'positive'
        && verticalTop[1].localJointEnd === 'negative',
    'Top frame halves must identify the local extrusion end that meets the mullion.'
);
const verticalBottom = getFrameSidePlacements({
    orientation: 'vertical',
    width: 1.2,
    height: 1.5,
    side: 'bottom',
});
assert(
    verticalBottom[0].localJointEnd === 'negative'
        && verticalBottom[1].localJointEnd === 'positive',
    'Bottom frame halves must reverse the local divider-joint ends because bottom extrusion runs in the opposite world direction.'
);
assert(
    getFrameSidePlacements({
        orientation: 'vertical',
        width: 1.2,
        height: 1.5,
        side: 'left',
    }).length === 1,
    'A vertical mullion must keep the left and right outer frames continuous.'
);

const horizontalLeft = getFrameSidePlacements({
    orientation: 'horizontal',
    width: 1.2,
    height: 1.6,
    side: 'left',
});
assert(horizontalLeft.length === 2, 'A horizontal transom must split the side frame into two pieces.');
assert(
    horizontalLeft[0].originY === -0.4 && horizontalLeft[1].originY === 0.4,
    'Horizontal-layout frame pieces must meet at the transom centre.'
);
assert(
    horizontalLeft[0].localJointEnd === 'positive'
        && horizontalLeft[1].localJointEnd === 'negative',
    'The left frame must apply the divider socket cut to the ends that actually meet the transom.'
);
const horizontalRight = getFrameSidePlacements({
    orientation: 'horizontal',
    width: 1.2,
    height: 1.6,
    side: 'right',
});
assert(
    horizontalRight[0].localJointEnd === 'negative'
        && horizontalRight[1].localJointEnd === 'positive',
    'The mirrored right frame must reverse the local transom-joint ends.'
);

const acceptedSingleDivider = getLinearDividerLayout({
    axisLength: 1.2,
    cellTypes: ['fixed-glazing', 'fixed-glazing'],
    // Real fixed/fixed CAD seats are intentionally asymmetric around the
    // mullion centre. They must size the cells without translating the mullion.
    dividerSeats: [{ left: -0.036893485763644165, right: 0.05963295627220266 }],
});
assert(
    acceptedSingleDivider.dividerPositions.length === 1
        && Math.abs(acceptedSingleDivider.dividerPositions[0]) < 1e-12,
    'A one-mullion/transom layout must preserve the accepted structural centre at zero even when CAD cell seats are asymmetric.'
);
assert(
    Math.abs(acceptedSingleDivider.cells[0].end - (-0.036893485763644165)) < 1e-12
        && Math.abs(acceptedSingleDivider.cells[1].start - 0.05963295627220266) < 1e-12,
    'Single-divider cells must still use their exact CAD-derived left/right boundaries around the centred divider.'
);

const repeatedLayout = getLinearDividerLayout({
    axisLength: 1.2,
    cellTypes: ['fixed-glazing', 'fixed-glazing', 'fixed-glazing'],
    // Use the real asymmetric fixed/fixed CAD seats. They are valid accessory
    // connection seats but must not move the two structural mullion centres.
    dividerSeats: [
        { left: -0.036893485763644165, right: 0.05963295627220266 },
        { left: -0.036893485763644165, right: 0.05963295627220266 },
    ],
});
assert(
    repeatedLayout.dividerPositions.length === 2
        && repeatedLayout.cells.length === 3
        && Math.abs(repeatedLayout.dividerPositions[0] - (-0.2)) < 1e-12
        && Math.abs(repeatedLayout.dividerPositions[1] - 0.2) < 1e-12,
    'Three fixed bays must keep the two structural divider centres on exact thirds even when CAD seats are asymmetric.'
);
assert(
    Math.max(...repeatedLayout.cells.map(cell => cell.span))
        - Math.min(...repeatedLayout.cells.map(cell => cell.span)) < 1e-9,
    'Repeated layouts must keep all complete window bays exactly equal.'
);
assert(
    repeatedLayout.cells.some(cell => Math.abs(cell.connectionSpan - cell.span) > 1e-3),
    'Repeated layouts must retain a separate CAD connection rectangle instead of moving structural divider centres to absorb seat offsets.'
);

const repeatedColumnGlass = repeatedLayout.cells.map(cell => getFixedGlassPanePlacement({
    width: cell.connectionSpan,
    height: 1.5,
    centerX: cell.connectionCenter,
    centerY: 0,
    outerInset: 0.05,
}));
assert(
    repeatedColumnGlass.every((pane, index) => {
        const cell = repeatedLayout.cells[index];
        const paneStart = pane.centerX - pane.width / 2;
        const paneEnd = pane.centerX + pane.width / 2;
        return Math.abs(paneStart - (cell.connectionStart + 0.05)) < 1e-12
            && Math.abs(paneEnd - (cell.connectionEnd - 0.05)) < 1e-12;
    }),
    'Three-column glass must be derived from each exact CAD connection rectangle, then use the same 50 mm inset as accepted fixed layouts.'
);
assert(
    repeatedColumnGlass.every(pane => (
        Math.abs(pane.leftInset - 0.05) < 1e-12
        && Math.abs(pane.rightInset - 0.05) < 1e-12
    )),
    'Repeated fixed glass must not use a hand-tuned internal stretch once CAD connection seats are available.'
);

const repeatedRowGlass = repeatedLayout.cells.map(cell => getFixedGlassPanePlacement({
    width: 1.2,
    height: cell.connectionSpan,
    centerX: 0,
    centerY: cell.connectionCenter,
    outerInset: 0.05,
}));
assert(
    repeatedRowGlass.every((pane, index) => {
        const cell = repeatedLayout.cells[index];
        const paneStart = pane.centerY - pane.height / 2;
        const paneEnd = pane.centerY + pane.height / 2;
        return Math.abs(paneStart - (cell.connectionStart + 0.05)) < 1e-12
            && Math.abs(paneEnd - (cell.connectionEnd - 0.05)) < 1e-12;
    }),
    'Three-row glass must derive bottom/top placement from the exact CAD transom connection seats and then apply the accepted 50 mm inset.'
);
const repeatedTop = getFrameSidePlacements({
    orientation: 'vertical',
    width: 1.2,
    height: 1.5,
    side: 'top',
    dividerPositions: repeatedLayout.dividerPositions,
    cellTypes: ['fixed-glazing', 'fixed-glazing', 'fixed-glazing'],
});
assert(
    repeatedTop.length === 3,
    'Two vertical mullions must split the top perimeter frame into three pieces.'
);
assert(
    repeatedTop[1].localJointEnds.includes('negative')
        && repeatedTop[1].localJointEnds.includes('positive'),
    'The middle perimeter-frame piece must receive a mullion socket at both ends.'
);
const repeatedHorizontal = getFrameSidePlacements({
    orientation: 'horizontal',
    width: 1.2,
    height: 1.5,
    side: 'left',
    dividerPositions: [-0.25, 0.25],
    cellTypes: ['fixed-glazing', 'fixed-glazing', 'fixed-glazing'],
});
assert(
    repeatedHorizontal.length === 3
        && repeatedHorizontal[1].localJointEnds.includes('negative')
        && repeatedHorizontal[1].localJointEnds.includes('positive'),
    'Two horizontal transoms must split a side frame into three pieces with two-ended sockets on the middle piece.'
);

const tLayout = getTopFixedBottomSashSashLayout({
    width: 1.2,
    height: 1.5,
    topRowFraction: 0.30,
    horizontalFixedBoundary: -0.0369,
    horizontalSashBoundary: 0.0596,
    verticalLeftSashBoundary: -0.052,
    verticalRightSashBoundary: 0.052,
});
assert(
    Math.abs(tLayout.transomCenterY - 0.30) < 1e-12,
    'The T layout transom must keep the reference image proportion with a 30% top light.'
);
assert(
    tLayout.fixedCells.length === 1
        && tLayout.openingCells.length === 2
        && tLayout.fixedCells[0].centerY > tLayout.transomCenterY
        && tLayout.openingCells.every(cell => cell.centerY < tLayout.transomCenterY),
    'The T layout must place one fixed pane above two opening sashes.'
);
assert(
    tLayout.openingCells[0].handleSide === 'right'
        && tLayout.openingCells[1].handleSide === 'left',
    'The two lower sash handles must face the central mullion.'
);
assert(
    Math.abs(tLayout.openingCells[0].width - tLayout.openingCells[1].width) < 1e-12,
    'Symmetric sash/sash CAD seats must produce equal lower sash widths.'
);
assert(
    tLayout.fixedCells[0].dividerJoinSideByBoundary.bottom === 'left',
    'The top fixed pane must use the mixed join fixed-side CAD seat on its lower transom boundary.'
);

assert(
    getHorizontalConnectionFaceDirection({
        lowerCellType: 'opening-sash',
        upperCellType: 'fixed-glazing',
        joinLeftCell: 'fixed-glazing',
        joinRightCell: 'opening-sash',
    }) === 1,
    'The T-layout transom must rotate join-left/fixed onto the upper window side.'
);

const dividerFaceSpan = 0.088;
const frameInwardSpan = 0.075;
const straightContactSpan = frameInwardSpan - dividerFaceSpan / 2;
assert(
    Math.abs(getFrameDividerSocketInset({
        inwardDistance: 0.02,
        dividerFaceSpan,
        frameInwardSpan,
    })) < 1e-9,
    'The outer part of the split frame must stay vertical so the left/right pieces still meet.'
);
assert(
    Math.abs(getFrameDividerSocketInset({
        inwardDistance: straightContactSpan,
        dividerFaceSpan,
        frameInwardSpan,
    })) < 1e-9,
    'The 45-degree mullion contact must start only after the straight frame-to-frame contact region.'
);
assert(
    Math.abs(getFrameDividerSocketInset({
        inwardDistance: 0.04,
        dividerFaceSpan,
        frameInwardSpan,
    }) - (0.04 - straightContactSpan)) < 1e-9,
    'The inner frame joint must open at exactly 45 degrees once it reaches the mullion-contact region.'
);
assert(
    Math.abs(getFrameDividerSocketInset({
        inwardDistance: frameInwardSpan,
        dividerFaceSpan,
        frameInwardSpan,
    }) - dividerFaceSpan / 2) < 1e-9,
    'The diagonal frame face must reach the mullion shoulder at the inner edge of the frame section.'
);

const length = 1.5;
const faceSpan = dividerFaceSpan;
const lowerTip = getDividerArrowAlongCoordinate({
    extrusionT: 0,
    length,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
});
const lowerShoulder = getDividerArrowAlongCoordinate({
    extrusionT: 0,
    length,
    faceOffset: faceSpan / 2,
    faceSpan,
    frameInwardSpan,
});
const upperTip = getDividerArrowAlongCoordinate({
    extrusionT: 1,
    length,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
});
const upperShoulder = getDividerArrowAlongCoordinate({
    extrusionT: 1,
    length,
    faceOffset: faceSpan / 2,
    faceSpan,
    frameInwardSpan,
});
assert(
    Math.abs(lowerTip - (-length / 2 + straightContactSpan)) < 1e-9,
    'The lower mullion V tip must stop above the outer frame face, after the straight left/right contact region.'
);
assert(
    Math.abs(upperTip - (length / 2 - straightContactSpan)) < 1e-9,
    'The upper mullion V tip must mirror the lower joint.'
);
assert(
    Math.abs(lowerShoulder - (-length / 2 + frameInwardSpan)) < 1e-9,
    'The lower V shoulder must meet the inner edge of the bottom frame section.'
);
assert(
    Math.abs(upperShoulder - (length / 2 - frameInwardSpan)) < 1e-9,
    'The upper V shoulder must meet the inner edge of the top frame section.'
);

const quarterPoint = getDividerArrowAlongCoordinate({
    extrusionT: 0.25,
    length,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
});
const midpoint = getDividerArrowAlongCoordinate({
    extrusionT: 0.5,
    length,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
});
const threeQuarterPoint = getDividerArrowAlongCoordinate({
    extrusionT: 0.75,
    length,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
});
assert(
    Math.abs(midpoint) < 1e-9,
    'A centerline vertex inserted halfway through the extrusion must stay halfway through the mullion.'
);
assert(
    quarterPoint > lowerTip && quarterPoint < midpoint
        && threeQuarterPoint > midpoint && threeQuarterPoint < upperTip,
    'Inserted mullion vertices must interpolate continuously between the two triangular ends instead of snapping to an end.'
);
assert(
    Math.abs(quarterPoint + threeQuarterPoint) < 1e-9,
    'The two 90-degree mullion tips must remain longitudinally symmetric after topology splitting.'
);


const tLeftGasketInnerAtOuterFace = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: straightContactSpan,
    faceSpan,
    frameInwardSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: straightContactSpan,
});
const tLeftGasketInnerAtShoulder = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: frameInwardSpan,
    faceSpan,
    frameInwardSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: frameInwardSpan,
});
const tRightGasketInnerAtShoulder = getDividerSegmentAlongCoordinate({
    extrusionT: 0,
    length: 0.6,
    faceOffset: frameInwardSpan,
    faceSpan,
    frameInwardSpan,
    negativeEndMode: 'socket',
    positiveEndMode: 'arrow',
    socketInwardDistance: frameInwardSpan,
});
assert(
    Math.abs(tLeftGasketInnerAtOuterFace - 0.3) < 1e-9,
    'The T-layout sash-side horizontal gasket socket must stay on the centre split plane before the vertical-mullion V begins.'
);
assert(
    Math.abs(tLeftGasketInnerAtShoulder - (0.3 - faceSpan / 2)) < 1e-9
        && Math.abs(tRightGasketInnerAtShoulder - (-0.3 + faceSpan / 2)) < 1e-9,
    'The two horizontal gasket halves must open symmetrically at 45 degrees around the vertical mullion, matching the accepted top-frame socket shape.'
);

// The structural T joint uses the mullion/transom profile on both axes. The
// two transom halves therefore keep touching over the upper half of their face
// and open into a 90-degree socket over the lower half. The vertical mullion
// extends to the transom's top-face datum so its arrow end fills that socket.
const tStructuralJointSpan = faceSpan;
const tStructuralHalfFace = tStructuralJointSpan / 2;

// A divider-mounted component must inherit the structural transom's exact
// socket plane rather than being shortened by its own independent centre trim.
// With the same host joint parameters, a component vertex at any face offset
// lands on the same 45-degree line as the structural profile at that offset.
const tMountedComponentFaceOffset = tStructuralHalfFace * 0.8;
const tMountedComponentLeftInner = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: tMountedComponentFaceOffset,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: tMountedComponentFaceOffset + tStructuralHalfFace,
});
const tMountedComponentRightInner = getDividerSegmentAlongCoordinate({
    extrusionT: 0,
    length: 0.6,
    faceOffset: tMountedComponentFaceOffset,
    faceSpan,
    frameInwardSpan,
    negativeFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'socket',
    positiveEndMode: 'arrow',
    socketInwardDistance: tMountedComponentFaceOffset + tStructuralHalfFace,
});
assert(
    Math.abs(tMountedComponentLeftInner - (0.3 - tMountedComponentFaceOffset)) < 1e-9
        && Math.abs(tMountedComponentRightInner - (-0.3 + tMountedComponentFaceOffset)) < 1e-9,
    'A T-transom-mounted gasket/component must be cut by the same 45-degree socket plane as the structural transom instead of using a separate hard-coded centre stop.'
);
const tStructuralLeftTop = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: -tStructuralHalfFace,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: 0,
});
const tStructuralLeftApex = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: tStructuralHalfFace,
});
const tStructuralLeftLowerShoulder = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: 0.6,
    faceOffset: tStructuralHalfFace,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'arrow',
    positiveEndMode: 'socket',
    socketInwardDistance: tStructuralJointSpan,
});
const tStructuralRightLowerShoulder = getDividerSegmentAlongCoordinate({
    extrusionT: 0,
    length: 0.6,
    faceOffset: tStructuralHalfFace,
    faceSpan,
    frameInwardSpan,
    negativeFrameInwardSpan: tStructuralJointSpan,
    negativeEndMode: 'socket',
    positiveEndMode: 'arrow',
    socketInwardDistance: tStructuralJointSpan,
});
assert(
    Math.abs(tStructuralLeftTop - 0.3) < 1e-9
        && Math.abs(tStructuralLeftApex - 0.3) < 1e-9,
    'The two structural transom halves must remain joined on the top side down to the V apex.'
);
assert(
    Math.abs(tStructuralLeftLowerShoulder - (0.3 - tStructuralHalfFace)) < 1e-9
        && Math.abs(tStructuralRightLowerShoulder - (-0.3 + tStructuralHalfFace)) < 1e-9,
    'The structural transom inner ends must open symmetrically into a 90-degree V socket below the centre contact point.'
);

const tStructuralVerticalLength = 1.0;
const tStructuralVerticalTip = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: tStructuralVerticalLength,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
});
const tStructuralVerticalShoulder = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: tStructuralVerticalLength,
    faceOffset: tStructuralHalfFace,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
});
const tStructuralNominalTopY = tLayout.transomCenterY + tStructuralHalfFace;
const tStructuralVerticalCenterY = tStructuralNominalTopY - tStructuralVerticalLength / 2;
assert(
    Math.abs(tStructuralVerticalCenterY + tStructuralVerticalTip - tLayout.transomCenterY) < 1e-9,
    'The lower vertical mullion V tip must land on the T transom centre plane.'
);
assert(
    Math.abs(
        tStructuralVerticalCenterY
        + tStructuralVerticalShoulder
        - (tLayout.transomCenterY - tStructuralHalfFace)
    ) < 1e-9,
    'The lower vertical mullion V shoulders must land on the lower face of the split T transom.'
);

// A gasket mounted on the lower vertical mullion must inherit that same
// structural span and the same positive-end V cut. Its top is therefore
// determined by its CAD face offset on the shared 45-degree plane, rather than
// by a separate shorter gasket extrusion.
const tVerticalMountedGasketFaceOffset = tStructuralHalfFace * 0.8;
const tVerticalMountedGasketTop = getDividerSegmentAlongCoordinate({
    extrusionT: 1,
    length: tStructuralVerticalLength,
    faceOffset: tVerticalMountedGasketFaceOffset,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
});
assert(
    Math.abs(
        tStructuralVerticalCenterY
        + tVerticalMountedGasketTop
        - (tLayout.transomCenterY - tVerticalMountedGasketFaceOffset)
    ) < 1e-9,
    'A T-layout vertical-mullion gasket must use the structural mullion span/cut so it reaches the transom V joint instead of ending short below it.'
);

const tStructuralBottomTip = getDividerSegmentAlongCoordinate({
    extrusionT: 0,
    length: tStructuralVerticalLength,
    faceOffset: 0,
    faceSpan,
    frameInwardSpan,
    positiveFrameInwardSpan: tStructuralJointSpan,
});
assert(
    Math.abs(tStructuralBottomTip - (-tStructuralVerticalLength / 2 + straightContactSpan)) < 1e-9,
    'Giving the T mullion a transom-specific top span must not change its accepted bottom-frame V joint.'
);


const editableGeometry = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'w1', type: 'fixed-glazing', rect: { x0: 0, y0: 0.5, x1: 1, y1: 1 } },
            { id: 'w2', type: 'opening-sash', rect: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 } },
            { id: 'w3', type: 'opening-sash', rect: { x0: 0.5, y0: 0, x1: 1, y1: 0.5 } },
        ],
        frameEdges: [
            { id: 'w1-top', cellId: 'w1', side: 'top', start: 0, end: 1, cellType: 'fixed-glazing' },
            { id: 'w2-bottom', cellId: 'w2', side: 'bottom', start: 0, end: 0.5, cellType: 'opening-sash' },
            { id: 'w3-bottom', cellId: 'w3', side: 'bottom', start: 0.5, end: 1, cellType: 'opening-sash' },
        ],
        dividers: [
            { id: 'h1', orientation: 'horizontal', coordinate: 0.5, start: 0, end: 0.5, negativeCellId: 'w2', positiveCellId: 'w1' },
            { id: 'h2', orientation: 'horizontal', coordinate: 0.5, start: 0.5, end: 1, negativeCellId: 'w3', positiveCellId: 'w1' },
            { id: 'v1', orientation: 'vertical', coordinate: 0.5, start: 0, end: 0.5, negativeCellId: 'w2', positiveCellId: 'w3' },
        ],
    },
});
assert(editableGeometry.cells.length === 3, 'Editable topology must create one runtime rectangle per window cell.');
assert(editableGeometry.dividerSegments.length === 3, 'Editable T topology must preserve the two host segments plus the branch divider.');
assert(editableGeometry.junctions.length === 1 && editableGeometry.junctions[0].hostOrientation === 'horizontal', 'Editable T topology must detect the host transom and branch mullion junction.');

// Regression: a b / c b / c d, where b and c are vertically merged. Adding
// `a` creates two three-divider T junctions on the same central mullion. The
// upper branch arrives from the west while the lower branch arrives from the
// east, so the middle host segment needs opposite socket halves at its two
// ends. A single shared socket sign makes one end carve the wrong side and is
// the source of the large triangular hole seen after adding `a`.
{
    const mergedTCell = (id, x0, y0, x1, y1) => ({
        id,
        type: 'opening-sash',
        handleSide: 'right',
        rect: { x0, y0, x1, y1 },
    });
    const state = normalizeWindowState({
        windows: [
            mergedTCell('a', 0, 2, 1, 3),
            mergedTCell('b', 1, 1, 2, 3),
            mergedTCell('c', 0, 0, 1, 2),
            mergedTCell('d', 1, 0, 2, 1),
        ],
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 0.9,
        topology: deriveWindowTopology(state),
        frameReplacementSpan: 0.065,
        dividerFaceSpan: 0.088,
    });
    const middleHost = geometry.dividerSegments.find(segment =>
        segment.orientation === 'vertical'
        && segment.negativeCellId === 'c'
        && segment.positiveCellId === 'b'
    );
    const middlePlacement = getEditableDividerSegmentPlacement({
        segment: middleHost,
        junctions: geometry.junctions,
        dividerFaceSpan: 0.088,
        frameJointInwardSpan: 0.065,
    });
    assert(
        middlePlacement?.joint?.negativeEndMode === 'socket'
            && middlePlacement?.joint?.positiveEndMode === 'socket'
            && middlePlacement?.joint?.negativeSocketInwardSign === 1
            && middlePlacement?.joint?.positiveSocketInwardSign === -1,
        'The central mullion in a b / c b / c d must cut its lower T socket toward the east branch and its upper T socket toward the west branch independently.'
    );

    // The same topology transposed by 90 degrees must mirror the rule for a
    // horizontal host: south branch uses +1 rendered-face sign, north uses -1.
    const rotatedState = normalizeWindowState({
        windows: [
            mergedTCell('a-r', 2, 0, 3, 1),
            mergedTCell('b-r', 1, 1, 3, 2),
            mergedTCell('c-r', 0, 0, 2, 1),
            mergedTCell('d-r', 0, 1, 1, 2),
        ],
    });
    const rotatedGeometry = getEditableWindowTopologyGeometry({
        width: 0.9,
        height: 1.2,
        topology: deriveWindowTopology(rotatedState),
        frameReplacementSpan: 0.065,
        dividerFaceSpan: 0.088,
    });
    const rotatedMiddleHost = rotatedGeometry.dividerSegments.find(segment =>
        segment.orientation === 'horizontal'
        && segment.negativeCellId === 'c-r'
        && segment.positiveCellId === 'b-r'
    );
    const rotatedPlacement = getEditableDividerSegmentPlacement({
        segment: rotatedMiddleHost,
        junctions: rotatedGeometry.junctions,
        dividerFaceSpan: 0.088,
        frameJointInwardSpan: 0.065,
    });
    assert(
        rotatedPlacement?.joint?.negativeEndMode === 'socket'
            && rotatedPlacement?.joint?.positiveEndMode === 'socket'
            && rotatedPlacement?.joint?.negativeSocketInwardSign === -1
            && rotatedPlacement?.joint?.positiveSocketInwardSign === 1,
        'Rotated merged T layouts must independently mirror the socket half at both ends of a horizontal host mullion.'
    );
}


const editableMixedSeats = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'fixed-left', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
            { id: 'sash-right', type: 'opening-sash', rect: { x0: 1, y0: 0, x1: 2, y1: 1 } },
        ],
        frameEdges: [],
        dividers: [
            {
                id: 'mixed-normal',
                orientation: 'vertical',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'fixed-left',
                positiveCellId: 'sash-right',
                negativeCellType: 'fixed-glazing',
                positiveCellType: 'opening-sash',
                templateId: 'mullion-fixed-sash',
                reversed: false,
            },
        ],
    },
    dividerConnectionVariants: {
        'vertical:mullion-fixed-sash:normal': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { right: -13 },
            },
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31 },
            },
        },
    },
});
const editableMixedFixed = editableMixedSeats.cells.find(cell => cell.id === 'fixed-left');
const editableMixedSash = editableMixedSeats.cells.find(cell => cell.id === 'sash-right');
assert(
    Math.abs(editableMixedFixed.x1) < 1e-9
        && Math.abs(editableMixedSash.x0) < 1e-9
        && Math.abs(editableMixedFixed.connectionX1 - (-0.031)) < 1e-9
        && Math.abs(editableMixedSash.connectionX0 - (-0.013)) < 1e-9,
    'Ordinary dynamic mixed joins must keep the physical grid boundary fixed while preserving the validated CAD sash/fixed-light connection seats separately.'
);

const editableReversedMixedSeats = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'sash-left', type: 'opening-sash', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
            { id: 'fixed-right', type: 'fixed-glazing', rect: { x0: 1, y0: 0, x1: 2, y1: 1 } },
        ],
        frameEdges: [],
        dividers: [
            {
                id: 'mixed-reversed',
                orientation: 'vertical',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'sash-left',
                positiveCellId: 'fixed-right',
                negativeCellType: 'opening-sash',
                positiveCellType: 'fixed-glazing',
                templateId: 'mullion-fixed-sash',
                reversed: true,
            },
        ],
    },
    dividerConnectionVariants: {
        'vertical:mullion-fixed-sash:reversed': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { left: 13 },
            },
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { right: 9.058930398579662 },
            },
        },
    },
});
const editableReversedSash = editableReversedMixedSeats.cells.find(cell => cell.id === 'sash-left');
const editableReversedFixed = editableReversedMixedSeats.cells.find(cell => cell.id === 'fixed-right');
assert(
    Math.abs(editableReversedSash.x1) < 1e-9
        && Math.abs(editableReversedFixed.x0) < 1e-9
        && Math.abs(editableReversedSash.connectionX1 - 0.013) < 1e-9
        && Math.abs(editableReversedFixed.connectionX0 - 0.009058930398579662) < 1e-9,
    'A reversed ordinary mixed join must keep the physical grid boundary fixed while preserving its validated CAD connection seats separately.'
);

const authoredMixedBeadTransform = Object.freeze({ a: 1, d: 1, tx: 10, ty: 44 });
const resolvedFixedRightBeadTransform = Object.freeze({ a: 1, d: 1, tx: -10, ty: 44 });
const reversedMixedBeadProfile = {
    dividerConnectionVariants: {
        'vertical:mullion-fixed-sash:normal': {
            fixedGlazingDividerCadTransforms: { left: authoredMixedBeadTransform },
        },
        'vertical:mullion-fixed-sash:reversed': {
            fixedGlazingDividerCadTransforms: { right: resolvedFixedRightBeadTransform },
        },
    },
};
assert(
    getEditableFixedGlazingDividerCadTransform({
        profile: reversedMixedBeadProfile,
        divider: {
            orientation: 'vertical',
            templateId: 'mullion-fixed-sash',
            reversed: true,
        },
        runtimeDividerSide: 'right',
    }) === resolvedFixedRightBeadTransform,
    'A reversed dynamic mixed join must use its resolved fixed-right glazing-bead transform instead of reusing the normal fixed-left variant.'
);

const editableFixedFixedSeats = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'fixed-a', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
            { id: 'fixed-b', type: 'fixed-glazing', rect: { x0: 1, y0: 0, x1: 2, y1: 1 } },
        ],
        frameEdges: [],
        dividers: [
            {
                id: 'fixed-fixed',
                orientation: 'vertical',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'fixed-a',
                positiveCellId: 'fixed-b',
                negativeCellType: 'fixed-glazing',
                positiveCellType: 'fixed-glazing',
                templateId: 'mullion-fixed-fixed',
                reversed: false,
            },
        ],
    },
    dividerConnectionVariants: {
        'vertical:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
    },
});
const editableFixedA = editableFixedFixedSeats.cells.find(cell => cell.id === 'fixed-a');
const editableFixedB = editableFixedFixedSeats.cells.find(cell => cell.id === 'fixed-b');
assert(
    Math.abs(editableFixedA.x1) < 1e-9
        && Math.abs(editableFixedB.x0) < 1e-9
        && Math.abs(editableFixedA.connectionX1 - (-0.031)) < 1e-9
        && Math.abs(editableFixedB.connectionX0 - 0.031) < 1e-9,
    'Ordinary dynamic fixed/fixed joins must keep one-window structural widths while their fixed-light connection rectangle still follows the exact CAD seats.'
);


// In an unmerged L, the inside-corner cell can touch two mullions. Both CAD
// seats may extend past their structural centre-lines, but they must not be
// accumulated into the logical cell dimensions: every 1x1 window still uses
// exactly one slider width and one slider height.
const editableEqualSizeL = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'corner-fixed', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
            { id: 'right-sash', type: 'opening-sash', rect: { x0: 1, y0: 0, x1: 2, y1: 1 } },
            { id: 'top-sash', type: 'opening-sash', rect: { x0: 0, y0: 1, x1: 1, y1: 2 } },
        ],
        frameEdges: [
            {
                id: 'corner-bottom',
                cellId: 'corner-fixed',
                side: 'bottom',
                coordinate: 0,
                start: 0,
                end: 1,
                cellType: 'fixed-glazing',
            },
            {
                id: 'right-bottom',
                cellId: 'right-sash',
                side: 'bottom',
                coordinate: 0,
                start: 1,
                end: 2,
                cellType: 'opening-sash',
            },
        ],
        dividers: [
            {
                id: 'equal-l-vertical',
                orientation: 'vertical',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'corner-fixed',
                positiveCellId: 'right-sash',
                negativeCellType: 'fixed-glazing',
                positiveCellType: 'opening-sash',
                templateId: 'mullion-fixed-sash',
                reversed: false,
            },
            {
                id: 'equal-l-horizontal',
                orientation: 'horizontal',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'corner-fixed',
                positiveCellId: 'top-sash',
                negativeCellType: 'fixed-glazing',
                positiveCellType: 'opening-sash',
                templateId: 'mullion-fixed-sash',
                reversed: false,
            },
        ],
    },
    dividerConnectionVariants: {
        'vertical:mullion-fixed-sash:normal': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { right: -13 },
            },
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: 31 },
            },
        },
        'horizontal:mullion-fixed-sash:normal': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { right: -13 },
            },
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: 31 },
            },
        },
    },
});
const equalLCorner = editableEqualSizeL.cells.find(cell => cell.id === 'corner-fixed');
const equalLRight = editableEqualSizeL.cells.find(cell => cell.id === 'right-sash');
const equalLTop = editableEqualSizeL.cells.find(cell => cell.id === 'top-sash');
assert(
    [equalLCorner, equalLRight, equalLTop].every(cell =>
        Math.abs(cell.width - 1.2) < 1e-9
        && Math.abs(cell.height - 1.5) < 1e-9
    ),
    'Every unmerged 1x1 cell in an L layout must remain exactly one slider width and one slider height, including the two-divider corner cell.'
);
assert(
    Math.abs(equalLCorner.x1) < 1e-9
        && Math.abs(equalLCorner.y1) < 1e-9
        && Math.abs(equalLRight.x0) < 1e-9
        && Math.abs(equalLTop.y0) < 1e-9
        && Math.abs(equalLCorner.connectionX1 - 0.031) < 1e-9
        && Math.abs(equalLCorner.connectionY1 - 0.031) < 1e-9
        && Math.abs(equalLRight.connectionX0 - (-0.013)) < 1e-9
        && Math.abs(equalLTop.connectionY0 - (-0.013)) < 1e-9,
    'An unmerged three-window L must keep all frame/mullion centre-lines on the structural + grid while sash/fixed-light geometry uses the exact CAD seats independently.'
);
assert(
    equalLCorner.layoutShiftX === undefined
        && equalLCorner.layoutShiftY === undefined
        && equalLRight.layoutShiftX === undefined
        && equalLTop.layoutShiftY === undefined,
    'An unmerged L must not translate individual rows or columns; that translation changes the apparent corner-window size.'
);
const equalLCornerInterior = getEditableCellInteriorPlacement(equalLCorner);
const equalLRightInterior = getEditableCellInteriorPlacement(equalLRight);
const equalLTopInterior = getEditableCellInteriorPlacement(equalLTop);
assert(
    Math.abs(equalLCornerInterior.x1 - equalLCorner.connectionX1) < 1e-9
        && Math.abs(equalLCornerInterior.y1 - equalLCorner.connectionY1) < 1e-9
        && Math.abs(equalLRightInterior.x0 - equalLRight.connectionX0) < 1e-9
        && Math.abs(equalLTopInterior.y0 - equalLTop.connectionY0) < 1e-9,
    'L sash/fixed-light interiors must still follow the exact CAD mullion seats independently from the structural bay rectangle.'
);
assert(
    Math.abs(equalLCorner.connectionWidth - 1.231) < 1e-9
        && Math.abs(equalLCorner.connectionHeight - 1.531) < 1e-9
        && Math.abs(equalLCornerInterior.width - equalLCorner.connectionWidth) < 1e-9
        && Math.abs(equalLCornerInterior.height - equalLCorner.connectionHeight) < 1e-9,
    'The L-corner CAD connection rectangle may extend into the mullion seats, but that must not change the one-window structural frame rectangle.'
);
const equalLCornerBottomFrame = editableEqualSizeL.framePlacements.find(
    placement => placement.id === 'corner-bottom'
);
const equalLRightBottomFrame = editableEqualSizeL.framePlacements.find(
    placement => placement.id === 'right-bottom'
);
assert(
    Math.abs(equalLCornerBottomFrame.width - 1.2) < 1e-9
        && Math.abs(equalLRightBottomFrame.width - 1.2) < 1e-9
        && Math.abs(equalLCornerBottomFrame.worldEnd) < 1e-9
        && Math.abs(equalLRightBottomFrame.worldStart) < 1e-9
        && Math.abs(
            equalLCornerBottomFrame.perpendicularOffset
            - equalLRightBottomFrame.perpendicularOffset
        ) < 1e-9,
    'An unmerged L must keep exposed frame pieces at exact one-window length and make them meet on the structural grid instead of shortening them through row/column translation.'
);
const equalLVerticalDivider = editableEqualSizeL.dividerSegments.find(
    segment => segment.id === 'equal-l-vertical'
);
assert(
    Math.abs(equalLVerticalDivider.worldStart - equalLCornerBottomFrame.perpendicularOffset) < 1e-9
        && Math.abs(equalLVerticalDivider.worldEnd) < 1e-9,
    'The exterior end of an L mullion must meet the structural outer-frame line while its inside-corner junction remains on the structural L centre.'
);

// Regression for a five-window staircase. The previous L compensation moved
// complete rows/columns by the average of their CAD seat requests. Starting at
// the fourth/fifth window, one structural column can contain a cell that needs
// the left mullion seat and another that needs the right mullion seat; averaging
// those opposite requests leaves visible gaps next to both mullions.
const staircaseState = normalizeWindowState({
    windows: [
        { id: 's1', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
        { id: 's2', type: 'fixed-glazing', rect: { x0: 0, y0: 1, x1: 1, y1: 2 } },
        { id: 's3', type: 'fixed-glazing', rect: { x0: 1, y0: 1, x1: 2, y1: 2 } },
        { id: 's4', type: 'fixed-glazing', rect: { x0: 1, y0: 2, x1: 2, y1: 3 } },
        { id: 's5', type: 'fixed-glazing', rect: { x0: 2, y0: 2, x1: 3, y1: 3 } },
    ],
});
const staircaseGeometry = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: deriveWindowTopology(staircaseState),
    dividerConnectionVariants: {
        'vertical:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
        'horizontal:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
    },
});
assert(
    staircaseGeometry.cells.every(cell =>
        Math.abs(cell.width - 1.2) < 1e-9
        && Math.abs(cell.height - 1.5) < 1e-9
    ),
    'Every staircase window must remain exactly one slider-sized structural bay regardless of how many L turns have already been added.'
);
const staircaseS3 = staircaseGeometry.cells.find(cell => cell.id === 's3');
const staircaseS4 = staircaseGeometry.cells.find(cell => cell.id === 's4');
const staircaseS3Interior = getEditableCellInteriorPlacement(staircaseS3);
const staircaseS4Interior = getEditableCellInteriorPlacement(staircaseS4);
assert(
    Math.abs(staircaseS3.x0 - staircaseS4.x0) < 1e-9
        && Math.abs(staircaseS3.x1 - staircaseS4.x1) < 1e-9,
    'Cells sharing one staircase column must keep aligned structural frame lines instead of being translated toward different mullions.'
);
assert(
    Math.abs(staircaseS3Interior.x0 - staircaseS3.connectionX0) < 1e-9
        && Math.abs(staircaseS4Interior.x1 - staircaseS4.connectionX1) < 1e-9
        && Math.abs(staircaseS3Interior.x0 - staircaseS3.x0) > 1e-3
        && Math.abs(staircaseS4Interior.x1 - staircaseS4.x1) > 1e-3,
    'Opposite CAD seat requests inside one staircase column must be kept per-cell so neither mullion develops a gap after the fourth window.'
);

const horizontallyMergedGeometry = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'merged-horizontal', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 2, y1: 1 } },
        ],
        frameEdges: [
            { id: 'merged-horizontal-left', cellId: 'merged-horizontal', side: 'left', start: 0, end: 1, cellType: 'fixed-glazing' },
            { id: 'merged-horizontal-right', cellId: 'merged-horizontal', side: 'right', start: 0, end: 1, cellType: 'fixed-glazing' },
            { id: 'merged-horizontal-bottom', cellId: 'merged-horizontal', side: 'bottom', start: 0, end: 2, cellType: 'fixed-glazing' },
            { id: 'merged-horizontal-top', cellId: 'merged-horizontal', side: 'top', start: 0, end: 2, cellType: 'fixed-glazing' },
        ],
        dividers: [],
    },
});
const mergedHorizontalLeft = horizontallyMergedGeometry.framePlacements.find(placement => placement.side === 'left');
const mergedHorizontalRight = horizontallyMergedGeometry.framePlacements.find(placement => placement.side === 'right');
assert(
    Math.abs(mergedHorizontalLeft.width - 2.4) < 1e-9
        && Math.abs(mergedHorizontalRight.width - 2.4) < 1e-9,
    'After merging left/right windows, both surviving side frames must use the full merged structural width instead of one-window width.'
);
assert(
    Math.abs(mergedHorizontalLeft.originX) < 1e-9
        && Math.abs(mergedHorizontalRight.originX) < 1e-9,
    'Merged left/right frame placement must stay centred on the merged structural cell so +/- width/2 lands on the true outer edges.'
);

const verticallyMergedGeometry = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'merged-vertical', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 2 } },
        ],
        frameEdges: [
            { id: 'merged-vertical-left', cellId: 'merged-vertical', side: 'left', start: 0, end: 2, cellType: 'fixed-glazing' },
            { id: 'merged-vertical-right', cellId: 'merged-vertical', side: 'right', start: 0, end: 2, cellType: 'fixed-glazing' },
            { id: 'merged-vertical-bottom', cellId: 'merged-vertical', side: 'bottom', start: 0, end: 1, cellType: 'fixed-glazing' },
            { id: 'merged-vertical-top', cellId: 'merged-vertical', side: 'top', start: 0, end: 1, cellType: 'fixed-glazing' },
        ],
        dividers: [],
    },
});
const mergedVerticalBottom = verticallyMergedGeometry.framePlacements.find(placement => placement.side === 'bottom');
const mergedVerticalTop = verticallyMergedGeometry.framePlacements.find(placement => placement.side === 'top');
assert(
    Math.abs(mergedVerticalBottom.height - 3.0) < 1e-9
        && Math.abs(mergedVerticalTop.height - 3.0) < 1e-9,
    'After merging bottom/top windows, both surviving horizontal frames must use the full merged structural height instead of one-window height.'
);
assert(
    Math.abs(mergedVerticalBottom.originY) < 1e-9
        && Math.abs(mergedVerticalTop.originY) < 1e-9,
    'Merged bottom/top frame placement must stay centred on the merged structural cell so +/- height/2 lands on the true outer edges.'
);


const editableLGeometry = getEditableWindowTopologyGeometry({
    width: 1.2,
    height: 1.5,
    topology: {
        windows: [
            { id: 'bottom-left', type: 'fixed-glazing', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
            { id: 'bottom-right', type: 'opening-sash', rect: { x0: 1, y0: 0, x1: 2, y1: 1 } },
            { id: 'top-left', type: 'fixed-glazing', rect: { x0: 0, y0: 1, x1: 1, y1: 2 } },
        ],
        frameEdges: [],
        dividers: [
            {
                id: 'l-vertical',
                orientation: 'vertical',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'bottom-left',
                positiveCellId: 'bottom-right',
                templateId: 'mullion-fixed-sash',
                reversed: false,
            },
            {
                id: 'l-horizontal',
                orientation: 'horizontal',
                coordinate: 1,
                start: 0,
                end: 1,
                negativeCellId: 'bottom-left',
                positiveCellId: 'top-left',
                templateId: 'mullion-fixed-fixed',
                reversed: false,
            },
        ],
    },
});
assert(
    editableLGeometry.junctions.length === 1
        && editableLGeometry.junctions[0].type === 'L'
        && editableLGeometry.junctions[0].endpoints.length === 2,
    'An L-shaped three-window layout must detect the two perpendicular mullion endpoints as an inside-corner L junction.'
);
const lFaceSpan = 0.088;
const lHalfFace = lFaceSpan / 2;
editableLGeometry.dividerSegments.forEach(segment => {
    const placement = getEditableDividerSegmentPlacement({
        segment,
        junctions: editableLGeometry.junctions,
        dividerFaceSpan: lFaceSpan,
        frameJointInwardSpan: 0.075,
    });
    assert(
        Math.abs(placement.length - (segment.length + lHalfFace)) < 1e-9,
        `L-junction divider ${segment.id} must extend by half the mullion face so its V tip reaches the shared inside-corner centre.`
    );
    assert(
        placement.joint.positiveFrameInwardSpan === lFaceSpan,
        `L-junction divider ${segment.id} must use the full mullion face at the connecting end instead of the shorter perimeter-frame joint span.`
    );
    assert(
        Math.abs(placement.longitudinalOffset - (segment.longitudinalOffset + lHalfFace / 2)) < 1e-9,
        `L-junction divider ${segment.id} must extend only toward the shared corner, without moving its opposite frame connection.`
    );
});

// Regression: in a real derived unmerged L, the two mullions and the two
// exposed frame arms around the missing quadrant must meet on exactly one
// structural point. CAD glazing/sash seats are allowed to differ from that
// centre-line, but they must never move the frame/mullion + itself.
{
    const makeFixed = (id, x0, y0, x1, y1) => ({
        id,
        type: 'fixed-glazing',
        handleSide: null,
        rect: { x0, y0, x1, y1 },
    });
    const state = normalizeWindowState({
        windows: [
            makeFixed('plus-bl', 0, 0, 1, 1),
            { ...makeFixed('plus-br', 1, 0, 2, 1), type: 'opening-sash' },
            makeFixed('plus-tl', 0, 1, 1, 2),
        ],
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(state),
        dividerConnectionVariants: {
            'vertical:mullion-fixed-sash:normal': {
                dividerConnection: { openingSashDividerBoundariesMm: { right: -13 } },
                fixedGlazingConnections: { dividerCellBoundariesMm: { left: 31 } },
            },
            'horizontal:mullion-fixed-fixed:normal': {
                fixedGlazingConnections: { dividerCellBoundariesMm: { left: 31, right: -31 } },
            },
        },
    });
    const verticalDivider = geometry.dividerSegments.find(segment => segment.orientation === 'vertical');
    const horizontalDivider = geometry.dividerSegments.find(segment => segment.orientation === 'horizontal');
    const topLeftRightFrame = geometry.framePlacements.find(placement =>
        placement.windowCell === 'plus-tl' && placement.side === 'right'
    );
    const bottomRightTopFrame = geometry.framePlacements.find(placement =>
        placement.windowCell === 'plus-br' && placement.side === 'top'
    );
    assert(
        verticalDivider
            && horizontalDivider
            && topLeftRightFrame
            && bottomRightTopFrame
            && Math.abs(verticalDivider.worldEnd) < 1e-9
            && Math.abs(horizontalDivider.worldEnd) < 1e-9
            && Math.abs(topLeftRightFrame.worldStart) < 1e-9
            && Math.abs(bottomRightTopFrame.worldStart) < 1e-9
            && Math.abs(verticalDivider.perpendicularOffset) < 1e-9
            && Math.abs(topLeftRightFrame.perpendicularOffset) < 1e-9
            && Math.abs(horizontalDivider.perpendicularOffset) < 1e-9
            && Math.abs(bottomRightTopFrame.perpendicularOffset) < 1e-9,
        'An unmerged L must form an exact structural + at the inside corner; no frame or mullion arm may be lengthened/translated by a CAD seat.'
    );
    assert(
        geometry.cells.every(cell =>
            Math.abs(cell.width - 1.2) < 1e-9
            && Math.abs(cell.height - 1.5) < 1e-9
        ),
        'Every physical cell in an unmerged L must remain exactly one slider width and height.'
    );
}

// Grid-member model: every physical member lives on one atomic line between
// intersections. Mullions are symmetric and stay centred on that line. Frames
// are asymmetric, so their physical outer boundary is offset from the line by
// frameSpan - halfMullionFace (21 mm for 575760/575800). The miter itself is a
// 45-degree line through the grid vertex.
{
    const cadFrameSpan = 0.065;
    const cadFaceSpan = 0.088;
    const contactStart = getFrameDividerMiterContactStart({
        dividerFaceSpan: cadFaceSpan,
        frameInwardSpan: cadFrameSpan,
    });
    assert(
        Math.abs(contactStart - 0.021) < 1e-9
            && Math.abs(getFrameGridMiterInset({
                inwardDistance: 0,
                dividerFaceSpan: cadFaceSpan,
                frameInwardSpan: cadFrameSpan,
            }) + contactStart) < 1e-9
            && Math.abs(getFrameGridMiterInset({
                inwardDistance: contactStart,
                dividerFaceSpan: cadFaceSpan,
                frameInwardSpan: cadFrameSpan,
            })) < 1e-9
            && Math.abs(getFrameGridMiterInset({
                inwardDistance: cadFrameSpan,
                dividerFaceSpan: cadFaceSpan,
                frameInwardSpan: cadFrameSpan,
            }) - cadFaceSpan / 2) < 1e-9,
        'The grid-frame miter must run through the graph vertex: -21 mm at the outer edge, 0 at the reference line and +44 mm at the inner edge.'
    );

    const quadrants = {
        bl: { x0: 0, y0: 0, x1: 1, y1: 1 },
        br: { x0: 1, y0: 0, x1: 2, y1: 1 },
        tl: { x0: 0, y0: 1, x1: 1, y1: 2 },
        tr: { x0: 1, y0: 1, x1: 2, y1: 2 },
    };
    const rotations = [
        ['bl', 'tl', 'tr'],
        ['br', 'tl', 'tr'],
        ['bl', 'br', 'tl'],
        ['bl', 'br', 'tr'],
    ];

    rotations.forEach((occupied, rotationIndex) => {
        const state = normalizeWindowState({
            windows: occupied.map((name, index) => ({
                id: `grid-l-${rotationIndex}-${index}`,
                type: 'fixed-glazing',
                handleSide: null,
                rect: quadrants[name],
            })),
        });
        const topology = deriveWindowTopology(state);
        const geometry = getEditableWindowTopologyGeometry({
            width: 1.2,
            height: 1.5,
            topology,
            frameReplacementSpan: cadFrameSpan,
            dividerFaceSpan: cadFaceSpan,
        });
        const plus = geometry.physicalIntersections.find(junction => (
            junction.type === 'plus'
            && junction.dividerCount === 2
            && junction.frameCount === 2
        ));
        assert(
            plus && ['north', 'east', 'south', 'west'].every(direction => plus.arms?.[direction]),
            `Grid L rotation ${rotationIndex + 1} must form one explicit four-arm intersection.`
        );

        const dividerArms = plus?.activeDirections
            ?.map(direction => plus.arms[direction])
            .filter(arm => arm?.kind === 'divider') || [];
        dividerArms.forEach(arm => {
            const divider = geometry.dividerSegments.find(segment => segment.id === arm.segmentId);
            const placed = getEditableDividerSegmentPlacement({
                segment: divider,
                junctions: geometry.physicalIntersections,
                dividerFaceSpan: cadFaceSpan,
                frameJointInwardSpan: cadFrameSpan,
            });
            const apexAlong = getDividerSegmentAlongCoordinate({
                extrusionT: arm.atStart ? 0 : 1,
                length: placed.length,
                faceOffset: 0,
                faceSpan: cadFaceSpan,
                frameInwardSpan: cadFrameSpan,
                ...placed.joint,
            });
            const apexLongWorld = placed.longitudinalOffset + apexAlong;
            const apexX = divider.orientation === 'vertical'
                ? divider.perpendicularOffset
                : apexLongWorld;
            const apexY = divider.orientation === 'vertical'
                ? apexLongWorld
                : divider.perpendicularOffset;
            assert(
                divider
                    && Math.abs(divider.perpendicularOffset - divider.structuralPerpendicularOffset) < 1e-9
                    && Math.abs(divider.mixedPlusPerpendicularShift) < 1e-12
                    && Math.abs(apexX - plus.x) < 1e-9
                    && Math.abs(apexY - plus.y) < 1e-9
                    && Math.abs(placed.joint.negativeArrowFaceBias || 0) < 1e-12
                    && Math.abs(placed.joint.positiveArrowFaceBias || 0) < 1e-12,
                `Grid L rotation ${rotationIndex + 1} must keep every mullion centred and put only its symmetric V apex on the grid vertex.`
            );
        });

        const frameArms = plus?.activeDirections
            ?.map(direction => plus.arms[direction])
            .filter(arm => arm?.kind === 'frame') || [];
        frameArms.forEach(arm => {
            const frame = geometry.framePlacements.find(piece => piece.id === arm.segmentId);
            const expectedSign = frame?.side === 'bottom' || frame?.side === 'left' ? -1 : 1;
            assert(
                frame
                    && frame.frameJointModes?.[arm.localEnd] === 'grid-miter'
                    && Math.abs(
                        frame.perpendicularOffset
                            - (frame.structuralPerpendicularOffset + expectedSign * contactStart)
                    ) < 1e-9,
                `Grid L rotation ${rotationIndex + 1} must put the 21 mm asymmetry on the frame line, not on a mullion.`
            );
        });

        assert(
            topology.linePieces.every(piece => piece.pieceType === 'frame' || piece.pieceType === 'mullion')
                && geometry.gridLinePieces.some(piece => piece.pieceType === 'frame')
                && geometry.gridLinePieces.some(piece => piece.pieceType === 'mullion'),
            `Grid L rotation ${rotationIndex + 1} must expose atomic frame/mullion line pieces for the renderer.`
        );
    });
}

// Regression: merging two adjacent windows removes only the internal divider.
// The outside frame envelope must be bit-for-bit identical to the union of the
// two unmerged cells, so merge cannot make the construction wider.
{
    const makeFixed = (id, x0, y0, x1, y1) => ({
        id,
        type: 'fixed-glazing',
        handleSide: null,
        rect: { x0, y0, x1, y1 },
    });
    const initialState = normalizeWindowState({
        windows: [
            makeFixed('merge-size-left', 0, 0, 1, 1),
            makeFixed('merge-size-right', 1, 0, 2, 1),
        ],
    });
    const variants = {
        'vertical:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
    };
    const before = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(initialState),
        dividerConnectionVariants: variants,
    });
    const beforeLeft = before.cells.find(cell => cell.id === 'merge-size-left');
    const beforeRight = before.cells.find(cell => cell.id === 'merge-size-right');
    const mergedState = mergeWindowsInState(initialState, {
        cellAId: 'merge-size-left',
        cellBId: 'merge-size-right',
        type: 'fixed-glazing',
    });
    const after = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(mergedState),
        dividerConnectionVariants: variants,
    });
    const merged = after.cells.find(cell => cell.id === 'merge-size-left');
    assert(
        beforeLeft
            && beforeRight
            && merged
            && Math.abs(merged.x0 - beforeLeft.x0) < 1e-9
            && Math.abs(merged.x1 - beforeRight.x1) < 1e-9
            && Math.abs(merged.y0 - beforeLeft.y0) < 1e-9
            && Math.abs(merged.y1 - beforeLeft.y1) < 1e-9
            && Math.abs(merged.width - (beforeLeft.width + beforeRight.width)) < 1e-9,
        'Merging two side-by-side windows must preserve their exact outside envelope and equal the sum of their two structural widths.'
    );
    const afterLeftFrame = after.framePlacements.find(placement => placement.side === 'left');
    const afterRightFrame = after.framePlacements.find(placement => placement.side === 'right');
    assert(
        afterLeftFrame
            && afterRightFrame
            && Math.abs(afterLeftFrame.perpendicularOffset - beforeLeft.x0) < 1e-9
            && Math.abs(afterRightFrame.perpendicularOffset - beforeRight.x1) < 1e-9,
        'Merge must not move either surviving outside frame sideways.'
    );
}


function assertPartialMergedPerimeter({ windows, mergeA, mergeB, side, start, end, label }) {
    let state = normalizeWindowState({ windows });
    state = mergeWindowsInState(state, {
        cellAId: mergeA,
        cellBId: mergeB,
        type: 'fixed-glazing',
    });
    const topology = deriveWindowTopology(state);
    const mergedCell = state.windows.find(cell => cell.id === mergeA);
    const edge = topology.frameEdges.find(candidate =>
        candidate.cellId === mergedCell?.id
        && candidate.side === side
        && Math.abs(candidate.start - start) < 1e-9
        && Math.abs(candidate.end - end) < 1e-9
    );
    assert(
        Boolean(edge) && edge.pieceType === 'frame',
        `${label} must rebuild the uncovered ${side} portion as one atomic frame line.`
    );
    const addCandidate = topology.addCandidates.find(candidate => candidate.frameEdgeId === edge?.id);
    assert(
        Boolean(addCandidate),
        `${label} must keep the reconstructed frame line usable as an add-window edge.`
    );

    const frameSpan = 0.075;
    const mullionFaceSpan = 0.098;
    const contactStart = frameSpan - mullionFaceSpan / 2;
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: mullionFaceSpan,
    });
    const perimeterJunction = geometry.perimeterJunctions.find(junction =>
        junction.hostFrameEndpoint?.frameId === edge?.id
        || junction.branchFrameEndpoint?.frameId === edge?.id
    );
    assert(
        Boolean(perimeterJunction),
        `${label} must classify the partial frame + surviving mullion + perpendicular frame as one re-entrant grid junction.`
    );

    const basePlacement = geometry.framePlacements.find(placement => placement.id === edge?.id);
    const survivingDivider = geometry.dividerSegments.find(
        divider => divider.id === perimeterJunction?.dividerEndpoint?.dividerId
    );
    assert(
        survivingDivider
            && survivingDivider.pieceType === 'mullion'
            && Math.abs(survivingDivider.perpendicularOffset - survivingDivider.structuralPerpendicularOffset) < 1e-9
            && Math.abs(survivingDivider.mixedPlusPerpendicularShift) < 1e-12,
        `${label} must keep the surviving mullion centred on its grid line.`
    );

    const expectedFillerDirectionByMergedSide = {
        bottom: 'north',
        top: 'south',
        right: 'west',
        left: 'east',
    };
    const filler = geometry.reentrantFillers?.find(
        candidate => candidate.sourceDividerId === survivingDivider?.id
    );
    assert(
        filler
            && filler.pieceType === 'half-mullion'
            && filler.direction === expectedFillerDirectionByMergedSide[side]
            && filler.orientation === survivingDivider?.orientation
            && Math.abs(filler.length - frameSpan) < 1e-9
            && Math.abs(filler.apexX - perimeterJunction.x) < 1e-9
            && Math.abs(filler.apexY - perimeterJunction.y) < 1e-9,
        `${label} must close the missing arm with one half-mullion wedge whose apex is the same grid intersection.`
    );

    const frameEndpoints = [
        perimeterJunction?.hostFrameEndpoint,
        perimeterJunction?.branchFrameEndpoint,
    ].filter(Boolean);
    frameEndpoints.forEach(endpoint => {
        const frame = geometry.framePlacements.find(piece => piece.id === endpoint.frameId);
        const expectedSign = frame?.side === 'bottom' || frame?.side === 'left' ? -1 : 1;
        assert(
            frame
                && frame.frameJointModes?.[endpoint.localEnd] === 'grid-miter'
                && Math.abs(
                    frame.perpendicularOffset
                        - (frame.structuralPerpendicularOffset + expectedSign * contactStart)
                ) < 1e-9,
            `${label} must keep the 26 mm frame/mullion reference difference on each asymmetric frame arm.`
        );
    });

    if (survivingDivider && perimeterJunction) {
        const placedDivider = getEditableDividerSegmentPlacement({
            segment: survivingDivider,
            junctions: geometry.physicalIntersections,
            dividerFaceSpan: mullionFaceSpan,
            frameJointInwardSpan: frameSpan,
        });
        const atStart = perimeterJunction.dividerEndpoint?.atStart;
        const apexAlongLocal = getDividerSegmentAlongCoordinate({
            extrusionT: atStart ? 0 : 1,
            length: placedDivider.length,
            faceOffset: 0,
            faceSpan: mullionFaceSpan,
            frameInwardSpan: frameSpan,
            ...placedDivider.joint,
        });
        const apexLongWorld = placedDivider.longitudinalOffset + apexAlongLocal;
        const apexX = survivingDivider.orientation === 'horizontal'
            ? apexLongWorld
            : survivingDivider.perpendicularOffset;
        const apexY = survivingDivider.orientation === 'vertical'
            ? apexLongWorld
            : survivingDivider.perpendicularOffset;
        assert(
            Math.abs(apexX - perimeterJunction.x) < 1e-9
                && Math.abs(apexY - perimeterJunction.y) < 1e-9,
            `${label} must put the surviving mullion V tip exactly on the grid vertex, with no diagonal 21 mm apex translation.`
        );
    }

    if (basePlacement) {
        const placed = getEditableReentrantFramePlacement({
            placement: basePlacement,
            perimeterJunctions: geometry.perimeterJunctions,
            frameInwardSpan: frameSpan,
            dividerFaceSpan: mullionFaceSpan,
        });
        assert(
            Math.abs(placed.width - basePlacement.width) < 1e-9
                && Math.abs(placed.height - basePlacement.height) < 1e-9
                && Math.abs(placed.originX - basePlacement.originX) < 1e-9
                && Math.abs(placed.originY - basePlacement.originY) < 1e-9,
            `${label} must change only the endpoint cut/type; grid-member length and origin cannot be resized by a neighbouring mullion.`
        );
    }

    if (addCandidate) {
        const completed = addWindowToState(state, {
            cellId: addCandidate.cellId,
            direction: addCandidate.direction,
            type: 'fixed-glazing',
            start: addCandidate.start,
            end: addCandidate.end,
        });
        assert(
            completed.windows.length === 3,
            `${label} partial-frame add action must fill only the exposed segment without overlapping the existing third window.`
        );
    }
}

const fixedCell = (id, x0, y0, x1, y1) => ({
    id,
    type: 'fixed-glazing',
    rect: { x0, y0, x1, y1 },
});

[
    {
        label: 'L missing bottom-right after merging the top row',
        windows: [fixedCell('bl', 0, 0, 1, 1), fixedCell('tl', 0, 1, 1, 2), fixedCell('tr', 1, 1, 2, 2)],
        mergeA: 'tl', mergeB: 'tr', side: 'bottom', start: 1, end: 2,
    },
    {
        label: 'L missing bottom-left after merging the top row',
        windows: [fixedCell('br', 1, 0, 2, 1), fixedCell('tl', 0, 1, 1, 2), fixedCell('tr', 1, 1, 2, 2)],
        mergeA: 'tl', mergeB: 'tr', side: 'bottom', start: 0, end: 1,
    },
    {
        label: 'L missing top-right after merging the bottom row',
        windows: [fixedCell('bl', 0, 0, 1, 1), fixedCell('br', 1, 0, 2, 1), fixedCell('tl', 0, 1, 1, 2)],
        mergeA: 'bl', mergeB: 'br', side: 'top', start: 1, end: 2,
    },
    {
        label: 'L missing top-left after merging the bottom row',
        windows: [fixedCell('bl', 0, 0, 1, 1), fixedCell('br', 1, 0, 2, 1), fixedCell('tr', 1, 1, 2, 2)],
        mergeA: 'bl', mergeB: 'br', side: 'top', start: 0, end: 1,
    },
    {
        label: 'L missing top-right after merging the left column',
        windows: [fixedCell('bl', 0, 0, 1, 1), fixedCell('tl', 0, 1, 1, 2), fixedCell('br', 1, 0, 2, 1)],
        mergeA: 'bl', mergeB: 'tl', side: 'right', start: 1, end: 2,
    },
    {
        label: 'L missing bottom-right after merging the left column',
        windows: [fixedCell('bl', 0, 0, 1, 1), fixedCell('tl', 0, 1, 1, 2), fixedCell('tr', 1, 1, 2, 2)],
        mergeA: 'bl', mergeB: 'tl', side: 'right', start: 0, end: 1,
    },
    {
        label: 'L missing top-left after merging the right column',
        windows: [fixedCell('br', 1, 0, 2, 1), fixedCell('tr', 1, 1, 2, 2), fixedCell('bl', 0, 0, 1, 1)],
        mergeA: 'br', mergeB: 'tr', side: 'left', start: 1, end: 2,
    },
    {
        label: 'L missing bottom-left after merging the right column',
        windows: [fixedCell('br', 1, 0, 2, 1), fixedCell('tr', 1, 1, 2, 2), fixedCell('tl', 0, 1, 1, 2)],
        mergeA: 'br', mergeB: 'tr', side: 'left', start: 0, end: 1,
    },
].forEach(assertPartialMergedPerimeter);

// Exact user regression: top-right L (top-left + top-right + bottom-right),
// then merge the top row. The surviving horizontal mullion remains centred on
// the row grid line; the frame pieces sit on opposite sides of that line and
// the missing north arm becomes a half-mullion wedge at the same vertex.
{
    const frameSpan = 0.065;
    const faceSpan = 0.088;
    const contactStart = frameSpan - faceSpan / 2;
    let state = normalizeWindowState({
        windows: [
            fixedCell('user-tr-br', 1, 0, 2, 1),
            fixedCell('user-tr-tl', 0, 1, 1, 2),
            fixedCell('user-tr-tr', 1, 1, 2, 2),
        ],
    });
    state = mergeWindowsInState(state, {
        cellAId: 'user-tr-tl',
        cellBId: 'user-tr-tr',
        type: 'fixed-glazing',
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(state),
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: faceSpan,
    });
    const reentrant = geometry.physicalIntersections.find(junction => (
        junction.type === 'T'
        && junction.dividerCount === 1
        && junction.frameCount === 2
    ));
    const dividerArm = reentrant?.activeDirections
        ?.map(direction => reentrant.arms[direction])
        .find(arm => arm?.kind === 'divider');
    const divider = geometry.dividerSegments.find(piece => piece.id === dividerArm?.segmentId);
    assert(
        reentrant
            && divider
            && Math.abs(divider.perpendicularOffset - divider.structuralPerpendicularOffset) < 1e-9
            && Math.abs(divider.mixedPlusPerpendicularShift) < 1e-12,
        'Merged top-right L must keep its surviving mullion exactly on the grid line.'
    );

    reentrant?.frameEndpoints?.forEach(endpoint => {
        const frame = geometry.framePlacements.find(piece => piece.id === endpoint.frameId);
        const expectedSign = frame?.side === 'bottom' || frame?.side === 'left' ? -1 : 1;
        assert(
            frame
                && frame.frameJointModes?.[endpoint.localEnd] === 'grid-miter'
                && Math.abs(
                    frame.perpendicularOffset
                        - (frame.structuralPerpendicularOffset + expectedSign * contactStart)
                ) < 1e-9,
            'Merged top-right L frame arms must use the same 21 mm frame offset and grid-miter law.'
        );
    });

    const filler = geometry.reentrantFillers.find(piece => piece.sourceDividerId === divider?.id);
    assert(
        filler
            && filler.pieceType === 'half-mullion'
            && filler.direction === 'north'
            && filler.orientation === 'horizontal'
            && Math.abs(filler.apexX - reentrant.x) < 1e-9
            && Math.abs(filler.apexY - reentrant.y) < 1e-9,
        'Merged top-right L must add one north half-mullion wedge at the same grid vertex as the surviving mullion.'
    );
    if (filler) {
        const triangle = getReentrantFillerTriangle({ filler, dividerFaceSpan: faceSpan });
        assert(
            triangle.length === 3
                && Math.abs(triangle[0].x - filler.apexX) < 1e-9
                && Math.abs(triangle[0].y - filler.apexY) < 1e-9
                && triangle.slice(1).every(point => Math.abs(point.y - (filler.apexY + faceSpan / 2)) < 1e-9),
            'The north half-mullion must remain a triangle bounded by the two 45-degree shoulders, not a diagonal full member.'
        );
    }

    if (divider && reentrant) {
        const placed = getEditableDividerSegmentPlacement({
            segment: divider,
            junctions: geometry.physicalIntersections,
            dividerFaceSpan: faceSpan,
            frameJointInwardSpan: frameSpan,
        });
        const atStart = dividerArm.atStart;
        const apexAlong = getDividerSegmentAlongCoordinate({
            extrusionT: atStart ? 0 : 1,
            length: placed.length,
            faceOffset: 0,
            faceSpan,
            frameInwardSpan: frameSpan,
            ...placed.joint,
        });
        const apexLongWorld = placed.longitudinalOffset + apexAlong;
        assert(
            Math.abs(apexLongWorld - reentrant.x) < 1e-9
                && Math.abs(divider.perpendicularOffset - reentrant.y) < 1e-9,
            'Merged top-right L mullion V apex must be exactly the graph intersection, not (+21,+21) from it.'
        );
    }
}

// Regression: every rotated merged-L equivalent must retain exactly one real
// mullion filler in the missing direction. A previous follow-up for opposite
// T sockets accidentally restored an older filler-triangle formula, which made
// the top filler disappear again and broke several other merged-L rotations.
{
    const quadrants = {
        bl: { x0: 0, y0: 0, x1: 1, y1: 1 },
        br: { x0: 1, y0: 0, x1: 2, y1: 1 },
        tl: { x0: 0, y0: 1, x1: 1, y1: 2 },
        tr: { x0: 1, y0: 1, x1: 2, y1: 2 },
    };
    const mergedLCases = [
        { occupied: ['br', 'tl', 'tr'], merge: ['tl', 'tr'], direction: 'north', orientation: 'horizontal' },
        { occupied: ['br', 'tl', 'tr'], merge: ['br', 'tr'], direction: 'east', orientation: 'vertical' },
        { occupied: ['bl', 'tl', 'tr'], merge: ['tl', 'tr'], direction: 'north', orientation: 'horizontal' },
        { occupied: ['bl', 'tl', 'tr'], merge: ['bl', 'tl'], direction: 'west', orientation: 'vertical' },
        { occupied: ['bl', 'br', 'tr'], merge: ['bl', 'br'], direction: 'south', orientation: 'horizontal' },
        { occupied: ['bl', 'br', 'tr'], merge: ['br', 'tr'], direction: 'east', orientation: 'vertical' },
        { occupied: ['bl', 'br', 'tl'], merge: ['bl', 'br'], direction: 'south', orientation: 'horizontal' },
        { occupied: ['bl', 'br', 'tl'], merge: ['bl', 'tl'], direction: 'west', orientation: 'vertical' },
    ];
    const directionVector = direction => ({
        north: { x: 0, y: 1 },
        south: { x: 0, y: -1 },
        east: { x: 1, y: 0 },
        west: { x: -1, y: 0 },
    }[direction]);
    const faceSpan = 0.088;
    const halfFace = faceSpan / 2;

    mergedLCases.forEach((testCase, index) => {
        let state = normalizeWindowState({
            windows: testCase.occupied.map(id => ({
                id: `merged-l-${index}-${id}`,
                type: 'fixed-glazing',
                handleSide: null,
                rect: quadrants[id],
            })),
        });
        state = mergeWindowsInState(state, {
            cellAId: `merged-l-${index}-${testCase.merge[0]}`,
            cellBId: `merged-l-${index}-${testCase.merge[1]}`,
            type: 'fixed-glazing',
        });
        const geometry = getEditableWindowTopologyGeometry({
            width: 1.2,
            height: 1.5,
            topology: deriveWindowTopology(state),
            frameReplacementSpan: 0.065,
            dividerFaceSpan: faceSpan,
        });
        const fillers = geometry.reentrantFillers || [];
        const filler = fillers[0];
        assert(
            fillers.length === 1
                && filler?.direction === testCase.direction
                && filler?.orientation === testCase.orientation,
            `Merged-L rotation ${index + 1} must retain exactly one ${testCase.direction}-facing mullion filler after unrelated T-junction fixes.`
        );
        if (!filler) return;

        const triangle = getReentrantFillerTriangle({
            filler,
            dividerFaceSpan: faceSpan,
        });
        const missing = directionVector(filler.direction);
        const extrusion = directionVector(filler.extrusionDirection);
        const mouthCenter = {
            x: filler.apexX + missing.x * halfFace,
            y: filler.apexY + missing.y * halfFace,
        };
        const expectedA = {
            x: mouthCenter.x + extrusion.x * halfFace,
            y: mouthCenter.y + extrusion.y * halfFace,
        };
        const expectedB = {
            x: mouthCenter.x - extrusion.x * halfFace,
            y: mouthCenter.y - extrusion.y * halfFace,
        };
        const shoulderMatches = (point, expected) => (
            Math.abs(point.x - expected.x) < 1e-9
            && Math.abs(point.y - expected.y) < 1e-9
        );
        assert(
            triangle.length === 3
                && Math.abs(triangle[0].x - filler.apexX) < 1e-9
                && Math.abs(triangle[0].y - filler.apexY) < 1e-9
                && (
                    (shoulderMatches(triangle[1], expectedA) && shoulderMatches(triangle[2], expectedB))
                    || (shoulderMatches(triangle[1], expectedB) && shoulderMatches(triangle[2], expectedA))
                ),
            `Merged-L rotation ${index + 1} filler must occupy the V opening between both 45-degree shoulders, never the neighbouring frame side.`
        );
    });
}

// Regression: the same staggered staircase is already a grid problem before
// either pair is merged. The middle horizontal line must be one reference line:
// its mullion is centred on it, while the bottom frame on the left and top frame
// on the right carry the frame's opposite +/- CAD offsets. Nothing may move or
// shear the mullion to satisfy either endpoint.
{
    const frameSpan = 0.065;
    const faceSpan = 0.088;
    const contactStart = frameSpan - faceSpan / 2;
    const state = normalizeWindowState({
        windows: [
            fixedCell('grid-stagger-upper-left', 0, 1, 1, 2),
            fixedCell('grid-stagger-upper-right', 1, 1, 2, 2),
            fixedCell('grid-stagger-lower-left', 1, 0, 2, 1),
            fixedCell('grid-stagger-lower-right', 2, 0, 3, 1),
        ],
    });
    const topology = deriveWindowTopology(state);
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: faceSpan,
    });
    const middleMullion = geometry.dividerSegments.find(segment => (
        segment.orientation === 'horizontal'
        && segment.start === 1
        && segment.end === 2
    ));
    const leftBottomFrame = geometry.framePlacements.find(frame => (
        frame.orientation === 'horizontal'
        && frame.side === 'bottom'
        && frame.start === 0
        && frame.end === 1
        && Math.abs(frame.structuralPerpendicularOffset - middleMullion?.structuralPerpendicularOffset) < 1e-9
    ));
    const rightTopFrame = geometry.framePlacements.find(frame => (
        frame.orientation === 'horizontal'
        && frame.side === 'top'
        && frame.start === 2
        && frame.end === 3
        && Math.abs(frame.structuralPerpendicularOffset - middleMullion?.structuralPerpendicularOffset) < 1e-9
    ));

    assert(
        middleMullion
            && leftBottomFrame
            && rightTopFrame
            && Math.abs(middleMullion.perpendicularOffset - middleMullion.structuralPerpendicularOffset) < 1e-9
            && Math.abs(leftBottomFrame.structuralPerpendicularOffset - middleMullion.structuralPerpendicularOffset) < 1e-9
            && Math.abs(rightTopFrame.structuralPerpendicularOffset - middleMullion.structuralPerpendicularOffset) < 1e-9
            && Math.abs(leftBottomFrame.perpendicularOffset - (middleMullion.structuralPerpendicularOffset - contactStart)) < 1e-9
            && Math.abs(rightTopFrame.perpendicularOffset - (middleMullion.structuralPerpendicularOffset + contactStart)) < 1e-9,
        'An unmerged staggered grid must use one horizontal reference level: the mullion stays centred and the two asymmetric frames carry opposite 21 mm offsets.'
    );
    assert(
        geometry.dividerSegments.every(segment => (
            Math.abs(segment.perpendicularOffset - segment.structuralPerpendicularOffset) < 1e-9
        )),
        'No mullion in an unmerged staggered grid may be translated or sheared away from its grid line by neighbouring frame geometry.'
    );
}

// Regression: in a three-window L, an exposed frame can sit on an internal
// grid coordinate even though that same coordinate is a mullion in the next
// segment. The frame is physically offset by 21 mm from the graph line, so the
// sash/glazing-bead connection rectangle must follow that frame boundary too.
// Otherwise the inside assembly is visibly 21 mm smaller than its frame.
{
    const frameSpan = 0.065;
    const faceSpan = 0.088;
    const contactStart = frameSpan - faceSpan / 2;
    const state = normalizeWindowState({
        windows: [
            {
                ...fixedCell('inside-size-bottom-left', 0, 0, 1, 1),
                type: 'opening-sash',
            },
            {
                ...fixedCell('inside-size-bottom-right', 1, 0, 2, 1),
                type: 'opening-sash',
            },
            {
                ...fixedCell('inside-size-top-right', 1, 1, 2, 2),
                type: 'opening-sash',
            },
        ],
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 0.6,
        height: 0.9,
        topology: deriveWindowTopology(state),
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: faceSpan,
    });

    const bottomLeft = geometry.cells.find(cell => cell.id === 'inside-size-bottom-left');
    const bottomRight = geometry.cells.find(cell => cell.id === 'inside-size-bottom-right');
    const topRight = geometry.cells.find(cell => cell.id === 'inside-size-top-right');
    const bottomLeftTopFrame = geometry.framePlacements.find(frame => (
        frame.windowCell === bottomLeft?.id && frame.side === 'top'
    ));
    const topRightLeftFrame = geometry.framePlacements.find(frame => (
        frame.windowCell === topRight?.id && frame.side === 'left'
    ));
    const verticalDivider = geometry.dividerSegments.find(segment => (
        segment.orientation === 'vertical'
        && segment.negativeCellId === bottomLeft?.id
        && segment.positiveCellId === bottomRight?.id
    ));
    const horizontalDivider = geometry.dividerSegments.find(segment => (
        segment.orientation === 'horizontal'
        && segment.negativeCellId === bottomRight?.id
        && segment.positiveCellId === topRight?.id
    ));

    assert(
        bottomLeft
            && bottomLeftTopFrame
            && Math.abs(bottomLeft.connectionY1 - bottomLeftTopFrame.perpendicularOffset) < 1e-9
            && Math.abs(
                bottomLeft.connectionY1
                    - (bottomLeftTopFrame.structuralPerpendicularOffset + contactStart)
            ) < 1e-9,
        'An exposed top frame on an internal grid line must expand the sash/glazing connection rectangle to the frame\'s +21 mm physical boundary.'
    );
    assert(
        topRight
            && topRightLeftFrame
            && Math.abs(topRight.connectionX0 - topRightLeftFrame.perpendicularOffset) < 1e-9
            && Math.abs(
                topRight.connectionX0
                    - (topRightLeftFrame.structuralPerpendicularOffset - contactStart)
            ) < 1e-9,
        'An exposed left frame on an internal grid line must expand the sash/glazing connection rectangle to the frame\'s -21 mm physical boundary.'
    );
    assert(
        bottomRight
            && verticalDivider
            && horizontalDivider
            && Math.abs(bottomRight.connectionX0 - verticalDivider.perpendicularOffset) < 1e-9
            && Math.abs(bottomRight.connectionY1 - horizontalDivider.perpendicularOffset) < 1e-9,
        'Divider-owned sides must keep their mullion CAD seat; the exposed-frame correction must not move neighbouring divider-facing sash/glazing boundaries.'
    );
}

// Regression: two merged windows can be staggered by one column. The single
// mullion between them has a re-entrant junction at both ends. Under the grid
// model this is no longer a conflicting +21/-21 body-placement problem: one
// straight mullion stays on one centre line, while each adjacent frame is
// offset to its own side and each missing arm receives a local half-mullion.
{
    const frameSpan = 0.065;
    const faceSpan = 0.088;
    const contactStart = frameSpan - faceSpan / 2;
    let state = normalizeWindowState({
        windows: [
            { ...fixedCell('stagger-upper-left', 0, 1, 1, 2), type: 'opening-sash' },
            { ...fixedCell('stagger-upper-right', 1, 1, 2, 2), type: 'opening-sash' },
            fixedCell('stagger-lower-left', 1, 0, 2, 1),
            fixedCell('stagger-lower-right', 2, 0, 3, 1),
        ],
    });
    state = mergeWindowsInState(state, {
        cellAId: 'stagger-upper-left',
        cellBId: 'stagger-upper-right',
        type: 'opening-sash',
    });
    state = mergeWindowsInState(state, {
        cellAId: 'stagger-lower-left',
        cellBId: 'stagger-lower-right',
        type: 'fixed-glazing',
    });
    const topology = deriveWindowTopology(state);
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: faceSpan,
    });
    const divider = geometry.dividerSegments.find(segment => segment.orientation === 'horizontal');
    const reentrantEnds = geometry.physicalIntersections.filter(junction => (
        junction.type === 'T'
        && junction.dividerCount === 1
        && junction.frameCount === 2
        && junction.activeDirections.some(direction => junction.arms[direction]?.segmentId === divider?.id)
    ));
    assert(
        divider
            && reentrantEnds.length === 2
            && Math.abs(divider.perpendicularOffset - divider.structuralPerpendicularOffset) < 1e-9
            && Math.abs(divider.mixedPlusNegativePerpendicularShift) < 1e-12
            && Math.abs(divider.mixedPlusPositivePerpendicularShift) < 1e-12
            && !divider.mixedPlusShiftConflict,
        'A staggered double-merge must keep one straight mullion exactly on its grid line with no endpoint body shifts.'
    );

    if (divider) {
        const placed = getEditableDividerSegmentPlacement({
            segment: divider,
            junctions: geometry.physicalIntersections,
            dividerFaceSpan: faceSpan,
            frameJointInwardSpan: frameSpan,
        });
        const endpointApex = atStart => {
            const along = getDividerSegmentAlongCoordinate({
                extrusionT: atStart ? 0 : 1,
                length: placed.length,
                faceOffset: 0,
                faceSpan,
                frameInwardSpan: frameSpan,
                ...placed.joint,
            });
            return placed.longitudinalOffset + along;
        };
        const west = reentrantEnds.find(junction => Math.abs(junction.x - divider.structuralWorldStart) < 1e-9);
        const east = reentrantEnds.find(junction => Math.abs(junction.x - divider.structuralWorldEnd) < 1e-9);
        assert(
            west
                && east
                && Math.abs(endpointApex(true) - west.x) < 1e-9
                && Math.abs(endpointApex(false) - east.x) < 1e-9
                && Math.abs(placed.joint.negativeArrowFaceBias || 0) < 1e-12
                && Math.abs(placed.joint.positiveArrowFaceBias || 0) < 1e-12,
            'Both V tips of the staggered mullion must terminate on their own grid intersections without shearing or face bias.'
        );
    }

    const fillers = geometry.reentrantFillers.filter(piece => piece.sourceDividerId === divider?.id);
    assert(
        fillers.length === 2
            && fillers.every(piece => piece.pieceType === 'half-mullion')
            && reentrantEnds.every(junction => fillers.some(piece => (
                Math.abs(piece.apexX - junction.x) < 1e-9
                && Math.abs(piece.apexY - junction.y) < 1e-9
            ))),
        'Both staggered re-entrant ends must receive local half-mullion wedges attached to the same grid vertices.'
    );

    const framesOnDividerLine = geometry.framePlacements.filter(frame => (
        frame.orientation === 'horizontal'
        && Math.abs(frame.structuralPerpendicularOffset - divider?.structuralPerpendicularOffset) < 1e-9
    ));
    assert(
        framesOnDividerLine.some(frame => frame.side === 'bottom'
            && Math.abs(frame.perpendicularOffset - (divider.structuralPerpendicularOffset - contactStart)) < 1e-9)
            && framesOnDividerLine.some(frame => frame.side === 'top'
                && Math.abs(frame.perpendicularOffset - (divider.structuralPerpendicularOffset + contactStart)) < 1e-9),
        'Frames on opposite sides of the staggered row must share one grid level and carry the +/-21 mm frame offsets themselves.'
    );
}

// Regression: merge the two top windows of an L (elbow at top-left), then add
// another ordinary window to the right of that merged window. The merged cell
// still occupies exactly one structural row, so a non-zero CAD seat on the
// surviving divider must translate that whole row rather than changing only
// the merged cell's y0. Otherwise the merged window becomes 13 mm taller than
// the newly added one and their top/bottom frame lines no longer match.
{
    let state = normalizeWindowState({
        windows: [
            fixedCell('bl-size', 0, 0, 1, 1),
            { ...fixedCell('tl-size', 0, 1, 1, 2), type: 'opening-sash' },
            { ...fixedCell('tr-size', 1, 1, 2, 2), type: 'opening-sash' },
        ],
    });
    state = mergeWindowsInState(state, {
        cellAId: 'tl-size',
        cellBId: 'tr-size',
        type: 'opening-sash',
    });
    state = addWindowToState(state, {
        cellId: 'tl-size',
        direction: 'right',
        type: 'opening-sash',
    });

    const topology = deriveWindowTopology(state);
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
        dividerConnectionVariants: {
            'horizontal:mullion-fixed-sash:normal': {
                dividerConnection: {
                    openingSashDividerBoundariesMm: { right: -13 },
                },
                fixedGlazingConnections: {
                    dividerCellBoundariesMm: { left: 31 },
                },
            },
            'vertical:mullion-sash-sash:normal': {
                dividerConnection: {
                    openingSashDividerBoundariesMm: { left: 13, right: -13 },
                },
            },
        },
    });

    const merged = geometry.cells.find(cell => cell.id === 'tl-size');
    const added = geometry.cells.find(cell => cell.id !== 'bl-size' && cell.id !== 'tl-size');
    assert(
        merged
            && added
            && Math.abs(merged.height - 1.5) < 1e-9
            && Math.abs(added.height - 1.5) < 1e-9
            && Math.abs(merged.y0 - added.y0) < 1e-9
            && Math.abs(merged.y1 - added.y1) < 1e-9,
        'A merged corner window and an ordinary window added beside it must stay exactly one slider row tall and share identical top/bottom boundaries.'
    );
    assert(
        Math.abs(merged.width - 2.4) < 1e-9
            && Math.abs(added.width - 1.2) < 1e-9,
        'Preserving merged-L row height must not change the merged two-column width or the newly added one-column width.'
    );

    const mergedBottom = geometry.framePlacements.find(placement =>
        placement.windowCell === 'tl-size' && placement.side === 'bottom' && placement.partial
    );
    const addedBottom = geometry.framePlacements.find(placement =>
        placement.windowCell === added?.id && placement.side === 'bottom'
    );
    const mergedTop = geometry.framePlacements.find(placement =>
        placement.windowCell === 'tl-size' && placement.side === 'top'
    );
    const addedTop = geometry.framePlacements.find(placement =>
        placement.windowCell === added?.id && placement.side === 'top'
    );
    assert(
        mergedBottom
            && addedBottom
            && mergedTop
            && addedTop
            && Math.abs(mergedTop.perpendicularOffset - addedTop.perpendicularOffset) < 1e-9
            && Math.abs(mergedBottom.structuralPerpendicularOffset - addedBottom.perpendicularOffset) < 1e-9
            && Math.abs(mergedBottom.perpendicularOffset - mergedBottom.structuralPerpendicularOffset) < 1e-9,
        'A merged corner row must keep every structural frame on the same top/bottom grid as an ordinary neighbour; CAD sash seats may not translate the reconstructed partial frame.'
    );
}

// Regression: T layout with three windows across the top and one below the
// middle bay. If the top-left and top-middle windows are merged, the merged
// cell spans two structural columns. A CAD divider seat at the right edge of
// that merged cell must remain an interior connection offset; it must not be
// converted into a whole-column translation. Otherwise the merge changes the
// visible sash/glazing-bead envelope and leaves the neighbouring mullion join
// using the wrong boundary.
{
    const variants = {
        'vertical:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
        'horizontal:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: -31, right: 31 },
            },
        },
    };
    const initialState = normalizeWindowState({
        windows: [
            fixedCell('bottom-middle', 1, 0, 2, 1),
            fixedCell('top-left', 0, 1, 1, 2),
            fixedCell('top-middle', 1, 1, 2, 2),
            fixedCell('top-right', 2, 1, 3, 2),
        ],
    });
    const beforeMerge = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(initialState),
        dividerConnectionVariants: variants,
    });
    const beforeTopLeft = beforeMerge.cells.find(cell => cell.id === 'top-left');
    const beforeTopMiddle = beforeMerge.cells.find(cell => cell.id === 'top-middle');
    const beforeMergedEnvelopeX0 = getEditableCellInteriorPlacement(beforeTopLeft).x0;
    const beforeMergedEnvelopeX1 = getEditableCellInteriorPlacement(beforeTopMiddle).x1;

    const mergedState = mergeWindowsInState(initialState, {
        cellAId: 'top-left',
        cellBId: 'top-middle',
        type: 'fixed-glazing',
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(mergedState),
        dividerConnectionVariants: variants,
    });

    const mergedTop = geometry.cells.find(cell => cell.id === 'top-left');
    const topRight = geometry.cells.find(cell => cell.id === 'top-right');
    const mergedInterior = getEditableCellInteriorPlacement(mergedTop);
    const topRightInterior = getEditableCellInteriorPlacement(topRight);
    assert(
        mergedTop
            && topRight
            && Math.abs(mergedTop.x0 - (-1.8)) < 1e-9
            && Math.abs(mergedTop.x1 - 0.6) < 1e-9
            && Math.abs(topRight.x0 - 0.6) < 1e-9
            && Math.abs(topRight.x1 - 1.8) < 1e-9
            && Math.abs(mergedTop.width - 2.4) < 1e-9
            && Math.abs(topRight.width - 1.2) < 1e-9,
        'Merging the first two top cells of the T must keep exactly two structural slider widths beside one ordinary slider-width cell.'
    );
    assert(
        Math.abs(mergedInterior.x0 - beforeMergedEnvelopeX0) < 1e-9
            && Math.abs(mergedInterior.x1 - beforeMergedEnvelopeX1) < 1e-9,
        'Merging two adjacent top cells must preserve the exact pre-merge sash/glazing-bead envelope; the merged window must not become wider.'
    );
    assert(
        Math.abs(mergedInterior.x1 - 0.569) < 1e-9
            && Math.abs(topRightInterior.x0 - 0.631) < 1e-9,
        'The merged-cell and ordinary-cell interiors must retain the fixed/fixed CAD seats on opposite sides of the vertical mullion instead of being reset to the mullion centre.'
    );

    const partialBottomUnderLeft = geometry.framePlacements.find(placement =>
        placement.windowCell === 'top-left'
        && placement.side === 'bottom'
        && placement.partial
    );
    const horizontalMullion = geometry.dividerSegments.find(segment =>
        segment.orientation === 'horizontal'
        && segment.negativeCellId === 'bottom-middle'
        && segment.positiveCellId === 'top-left'
    );
    const verticalMullion = geometry.dividerSegments.find(segment =>
        segment.orientation === 'vertical'
        && segment.negativeCellId === 'top-left'
        && segment.positiveCellId === 'top-right'
    );
    assert(
        partialBottomUnderLeft
            && horizontalMullion
            && verticalMullion
            && Math.abs(partialBottomUnderLeft.worldEnd - horizontalMullion.worldStart) < 1e-9
            && Math.abs(horizontalMullion.worldEnd - verticalMullion.perpendicularOffset) < 1e-9,
        'Merged T layout must keep the partial frame, lower mullion and right-hand mullion on the same structural junctions.'
    );
}

// Same merged-T rule for sash/sash: the sash CAD seat may extend across the
// mullion centre, but merging must preserve exactly the same outer sash
// envelope that the two unmerged sash cells had before the merge.
{
    const sashCell = (id, x0, y0, x1, y1) => ({
        ...fixedCell(id, x0, y0, x1, y1),
        type: 'opening-sash',
    });
    const variants = {
        'vertical:mullion-sash-sash:normal': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { left: 13, right: -13 },
            },
        },
        'horizontal:mullion-sash-sash:normal': {
            dividerConnection: {
                openingSashDividerBoundariesMm: { left: 13, right: -13 },
            },
        },
    };
    const initialState = normalizeWindowState({
        windows: [
            sashCell('s-bottom-middle', 1, 0, 2, 1),
            sashCell('s-top-left', 0, 1, 1, 2),
            sashCell('s-top-middle', 1, 1, 2, 2),
            sashCell('s-top-right', 2, 1, 3, 2),
        ],
    });
    const beforeMerge = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(initialState),
        dividerConnectionVariants: variants,
    });
    const beforeLeft = getEditableCellInteriorPlacement(
        beforeMerge.cells.find(cell => cell.id === 's-top-left')
    );
    const beforeMiddle = getEditableCellInteriorPlacement(
        beforeMerge.cells.find(cell => cell.id === 's-top-middle')
    );
    const mergedState = mergeWindowsInState(initialState, {
        cellAId: 's-top-left',
        cellBId: 's-top-middle',
        type: 'opening-sash',
    });
    const afterMerge = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(mergedState),
        dividerConnectionVariants: variants,
    });
    const mergedSash = getEditableCellInteriorPlacement(
        afterMerge.cells.find(cell => cell.id === 's-top-left')
    );
    const rightSash = getEditableCellInteriorPlacement(
        afterMerge.cells.find(cell => cell.id === 's-top-right')
    );
    assert(
        Math.abs(mergedSash.x0 - beforeLeft.x0) < 1e-9
            && Math.abs(mergedSash.x1 - beforeMiddle.x1) < 1e-9
            && Math.abs(mergedSash.x1 - 0.613) < 1e-9
            && Math.abs(rightSash.x0 - 0.587) < 1e-9,
        'Merged sash T layout must retain the pre-merge sash envelope and the exact sash/sash CAD seats on both sides of the surviving mullion.'
    );
}

// A trans is a floating sash member, not a structural divider. The shared
// edge remains two sash cells, but the fixed member above and below it must
// remain a flat continuation exactly as it would beside a merged opening.
{
    const sashCell = (id, x0, y0, x1, y1) => ({
        ...fixedCell(id, x0, y0, x1, y1),
        type: 'opening-sash',
    });
    let transState = normalizeWindowState({
        transProfileId: '575820',
        windows: [
            sashCell('trans-left', 0, 0, 1, 1),
            sashCell('trans-right', 1, 0, 2, 1),
        ],
    });
    transState = setTransBetweenWindowsInState(transState, {
        cellAId: 'trans-left',
        cellBId: 'trans-right',
        enabled: true,
        ownerCellId: 'trans-right',
    });
    const transGeometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(transState),
        frameReplacementSpan: 0.075,
        dividerFaceSpan: 0.088,
        transConnection: {
            openingSashTransBoundariesMm: { left: -12, right: 12 },
        },
    });
    const transSegment = transGeometry.transSegments[0];
    const leftCell = transGeometry.cells.find(cell => cell.id === 'trans-left');
    const rightCell = transGeometry.cells.find(cell => cell.id === 'trans-right');
    const passThroughs = transGeometry.physicalIntersections.filter(
        junction => junction.isTransPassThrough
    );
    assert(
        transGeometry.dividerSegments.length === 0
            && transGeometry.transSegments.length === 1
            && transSegment?.ownerCellId === 'trans-right',
        'A trans sash pair must replace the shared structural mullion with one floating trans edge owned by one sash.'
    );
    assert(
        leftCell
            && rightCell
            && Math.abs(leftCell.connectionX1 - (transSegment.perpendicularOffset - 0.012)) < 1e-9
            && Math.abs(rightCell.connectionX0 - (transSegment.perpendicularOffset + 0.012)) < 1e-9,
        'The sash/trans/sash CAD join must control the exact sash seats on both sides of the floating trans.'
    );
    assert(
        passThroughs.length === 2
            && passThroughs.every(junction => junction.frameCount === 2 && junction.dividerCount === 0),
        'Both ends of a full-height trans must resolve as non-structural pass-throughs in the top/bottom frame lines.'
    );
    assert(
        passThroughs.every(junction => junction.frameEndpoints.every(endpoint => {
            const frame = transGeometry.framePlacements.find(piece => piece.id === endpoint.frameId);
            return frame && !frame.frameJointModes?.[endpoint.localEnd];
        })),
        'A trans endpoint must not cut a V/miter/socket into the continuous frame above or below it.'
    );

    let transUnderMullionState = normalizeWindowState({
        windows: [
            fixedCell('trans-top-fixed', 0, 1, 2, 2),
            sashCell('trans-bottom-left', 0, 0, 1, 1),
            sashCell('trans-bottom-right', 1, 0, 2, 1),
        ],
    });
    transUnderMullionState = setTransBetweenWindowsInState(transUnderMullionState, {
        cellAId: 'trans-bottom-left',
        cellBId: 'trans-bottom-right',
        enabled: true,
    });
    const transUnderMullionGeometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(transUnderMullionState),
        frameReplacementSpan: 0.075,
        dividerFaceSpan: 0.088,
        transConnection: {
            openingSashTransBoundariesMm: { left: -12, right: 12 },
        },
    });
    const dividerPassThrough = transUnderMullionGeometry.physicalIntersections.find(
        junction => junction.isTransPassThrough && junction.dividerCount === 2
    );
    const dividerEndsStaySquare = dividerPassThrough?.endpoints?.every(endpoint => {
        const segment = transUnderMullionGeometry.dividerSegments.find(
            divider => divider.id === endpoint.dividerId
        );
        if (!segment) return false;
        const placement = getEditableDividerSegmentPlacement({
            segment,
            junctions: transUnderMullionGeometry.physicalIntersections,
            dividerFaceSpan: 0.088,
            frameJointInwardSpan: 0.065,
        });
        const mode = endpoint.atStart
            ? placement.joint.negativeEndMode
            : placement.joint.positiveEndMode;
        const frameSpanAtEnd = endpoint.atStart
            ? placement.joint.negativeFrameInwardSpan
            : placement.joint.positiveFrameInwardSpan;
        return mode === 'square' && frameSpanAtEnd === 0;
    });
    assert(
        dividerPassThrough
            && dividerPassThrough.type === 'continuation'
            && dividerEndsStaySquare,
        'A horizontal fixed mullion/transom above a trans pair must remain one flat continuation across the trans endpoint.'
    );
}

// Regression: L with bottom-left fixed and the two top opening sashes merged.
// The surviving mullion keeps its re-entrant CAD shift after merge while the
// reconstructed partial aluminium frame stays on the structural cell boundary.
// The sash connection seat follows the shifted mullion; only the frame endpoint
// mesh changes to the mixed-reentrant cut.
{
    const frameSpan = 0.065;
    const mullionFaceSpan = 0.088;
    const contactStart = frameSpan - mullionFaceSpan / 2;
    let state = normalizeWindowState({
        windows: [
            fixedCell('bl-fixed', 0, 0, 1, 1),
            { ...fixedCell('tl-sash', 0, 1, 1, 2), type: 'opening-sash' },
            { ...fixedCell('tr-sash', 1, 1, 2, 2), type: 'opening-sash' },
        ],
    });
    state = mergeWindowsInState(state, {
        cellAId: 'tl-sash',
        cellBId: 'tr-sash',
        type: 'opening-sash',
    });
    const topology = deriveWindowTopology(state);
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: mullionFaceSpan,
        dividerConnectionVariants: {
            'horizontal:mullion-fixed-sash:normal': {
                dividerConnection: {
                    openingSashDividerBoundariesMm: { right: -13 },
                },
                fixedGlazingConnections: {
                    dividerCellBoundariesMm: { left: 31 },
                },
            },
        },
    });
    const mergedCell = geometry.cells.find(cell => cell.id === 'tl-sash');
    const interior = getEditableCellInteriorPlacement(mergedCell);
    const partialFrame = geometry.framePlacements.find(placement =>
        placement.windowCell === 'tl-sash'
        && placement.side === 'bottom'
        && placement.partial
    );
    const perimeterJunction = geometry.perimeterJunctions.find(junction =>
        junction.hostFrameEndpoint?.frameId === partialFrame?.id
    );
    const survivingDivider = geometry.dividerSegments.find(
        divider => divider.id === perimeterJunction?.dividerEndpoint?.dividerId
    );
    const placedFrame = getEditableReentrantFramePlacement({
        placement: partialFrame,
        perimeterJunctions: geometry.perimeterJunctions,
        frameInwardSpan: frameSpan,
        dividerFaceSpan: mullionFaceSpan,
    });
    const frameBottom = placedFrame.originY - placedFrame.height / 2;
    assert(
        survivingDivider
            && Math.abs(survivingDivider.perpendicularOffset - survivingDivider.structuralPerpendicularOffset) < 1e-9
            && Math.abs(survivingDivider.mixedPlusPerpendicularShift) < 1e-12
            && Math.abs(interior.y0 - (survivingDivider.perpendicularOffset - 0.013)) < 1e-9
            && Math.abs(frameBottom - (partialFrame.structuralPerpendicularOffset - contactStart)) < 1e-9
            && Math.abs(frameBottom - interior.y0) > 1e-6,
        'Merged top-sash L must keep the mullion centred, put the 21 mm reference offset on the bottom frame, and preserve the exact sash CAD seat.'
    );
    assert(
        placedFrame.reentrantHost === false
            && placedFrame.frameJointModes?.[perimeterJunction?.hostFrameEndpoint?.localEnd] === 'grid-miter',
        'Merged top-sash L must use the shared grid-miter cut at the three-arm re-entrant junction.'
    );
}


// Four-arm regression: a four-window T has two re-entrant intersections.
// Each must be classified from its north/east/south/west physical arms as a
// true +, and applying the joint cuts must never make any participating frame
// longer/taller than its structural placement.
{
    const frameSpan = 0.075;
    const faceSpan = 0.098;
    const state = normalizeWindowState({
        windows: [
            fixedCell('t4-top-left', 0, 1, 1, 2),
            { ...fixedCell('t4-top-middle', 1, 1, 2, 2), type: 'opening-sash' },
            fixedCell('t4-top-right', 2, 1, 3, 2),
            fixedCell('t4-bottom-middle', 1, 0, 2, 1),
        ],
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(state),
        frameReplacementSpan: frameSpan,
    });
    const pluses = geometry.physicalIntersections.filter(junction =>
        junction.type === 'plus'
        && junction.dividerCount === 2
        && junction.frameCount === 2
    );
    assert(
        pluses.length === 2
            && geometry.perimeterJunctions.filter(junction => junction.type === 'perimeter-plus').length === 2,
        'A four-window T must produce two independent four-arm perimeter + intersections, not two divider-only L special cases.'
    );
    pluses.forEach((junction, index) => {
        assert(
            ['north', 'east', 'south', 'west'].every(direction => Boolean(junction.arms[direction])),
            `Four-window T + ${index + 1} must explicitly contain north/east/south/west physical arms.`
        );
    });
    geometry.framePlacements
        .filter(frame => Object.values(frame.frameJointModes || {}).includes('reverse-miter'))
        .forEach(frame => {
            const placed = getEditableReentrantFramePlacement({
                placement: frame,
                perimeterJunctions: geometry.perimeterJunctions,
                frameInwardSpan: frameSpan,
                dividerFaceSpan: faceSpan,
            });
            assert(
                Math.abs(placed.width - frame.width) < 1e-9
                    && Math.abs(placed.height - frame.height) < 1e-9
                    && Math.abs(placed.originX - frame.originX) < 1e-9
                    && Math.abs(placed.originY - frame.originY) < 1e-9,
                `Four-window T frame ${frame.id} must change only its endpoint cut; the + joint may not resize or translate the frame.`
            );
        });
}

// Exposed concave/convex frame corners are determined by actual arms, not by
// whether their grid coordinate lies inside the assembly bounding box. In the
// n n / n L, the top-right right-frame bottom endpoint meets only another frame
// and therefore remains the ordinary full 45-degree frame/frame miter.
{
    const state = normalizeWindowState({
        windows: [
            fixedCell('corner-bottom-left', 0, 0, 1, 1),
            fixedCell('corner-top-left', 0, 1, 1, 2),
            fixedCell('corner-top-right', 1, 1, 2, 2),
        ],
    });
    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology: deriveWindowTopology(state),
        frameReplacementSpan: 0.075,
    });
    const rightFrame = geometry.framePlacements.find(frame =>
        frame.windowCell === 'corner-top-right' && frame.side === 'right'
    );
    const bottomFrame = geometry.framePlacements.find(frame =>
        frame.windowCell === 'corner-top-right' && frame.side === 'bottom'
    );
    const bottomRightCorner = geometry.physicalIntersections.find(junction =>
        junction.frameEndpoints?.some(endpoint => endpoint.frameId === rightFrame?.id)
        && junction.frameEndpoints?.some(endpoint => endpoint.frameId === bottomFrame?.id)
    );
    assert(
        rightFrame
            && bottomFrame
            && bottomRightCorner?.type === 'corner'
            && bottomRightCorner.dividerCount === 0
            && bottomRightCorner.frameEndpoints.every(endpoint => {
                const frame = geometry.framePlacements.find(piece => piece.id === endpoint.frameId);
                return frame?.frameJointModes?.[endpoint.localEnd] === 'grid-miter';
            }),
        'The top-right outer corner in n n / n must stay a plain frame/frame grid-miter and must not be classified as a divider socket.'
    );
}

// Dynamic slider semantics: width/height are the complete dimensions of one
// standalone framed window. A shared edge replaces one frame with a mullion, so
// the topology grid pitch must be smaller by the constant frame face span. The
// half-span is restored only on the global outer perimeter.
{
    const sliderWidth = 1.2;
    const sliderHeight = 1.5;
    const frameSpan = 0.075;
    const expectedCellWidth = sliderWidth - frameSpan;
    const expectedCellHeight = sliderHeight - frameSpan;
    const fixedFixedVariants = {
        'vertical:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: 31, right: -31 },
            },
        },
        'horizontal:mullion-fixed-fixed:normal': {
            fixedGlazingConnections: {
                dividerCellBoundariesMm: { left: 31, right: -31 },
            },
        },
    };
    const geometryFor = state => getEditableWindowTopologyGeometry({
        width: sliderWidth,
        height: sliderHeight,
        topology: deriveWindowTopology(state),
        dividerConnectionVariants: fixedFixedVariants,
        frameReplacementSpan: frameSpan,
        dividerFaceSpan: 0.088,
    });
    const outerEnvelope = geometry => {
        const frames = geometry.framePlacements || [];
        const xs = [];
        const ys = [];
        frames.forEach(frame => {
            if (frame.orientation === 'vertical') {
                xs.push(frame.perpendicularOffset);
                ys.push(frame.worldStart, frame.worldEnd);
            } else {
                ys.push(frame.perpendicularOffset);
                xs.push(frame.worldStart, frame.worldEnd);
            }
        });
        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        };
    };

    const standaloneState = normalizeWindowState({
        windows: [fixedCell('standalone', 0, 0, 1, 1)],
    });
    const standaloneGeometry = geometryFor(standaloneState);
    const standaloneCell = standaloneGeometry.cells[0];
    const standaloneEnvelope = outerEnvelope(standaloneGeometry);
    assert(
        Math.abs(standaloneCell.width - expectedCellWidth) < 1e-9
            && Math.abs(standaloneCell.height - expectedCellHeight) < 1e-9,
        'Editable topology cell pitch must be one slider dimension minus the constant frame replacement span.'
    );
    assert(
        Math.abs((standaloneEnvelope.maxX - standaloneEnvelope.minX) - sliderWidth) < 1e-9
            && Math.abs((standaloneEnvelope.maxY - standaloneEnvelope.minY) - sliderHeight) < 1e-9,
        'Reducing the topology cell pitch must not change the outside size of one standalone window shown by the sliders.'
    );

    const adjacentState = normalizeWindowState({
        windows: [
            fixedCell('left-module', 0, 0, 1, 1),
            fixedCell('right-module', 1, 0, 2, 1),
        ],
    });
    const adjacentGeometry = geometryFor(adjacentState);
    const adjacentEnvelope = outerEnvelope(adjacentGeometry);
    assert(
        adjacentGeometry.cells.every(cell => Math.abs(cell.width - expectedCellWidth) < 1e-9)
            && Math.abs(
                (adjacentEnvelope.maxX - adjacentEnvelope.minX)
                - (sliderWidth * 2 - frameSpan)
            ) < 1e-9,
        'Two adjacent windows must count the replaced shared frame only once instead of occupying two complete standalone slider widths.'
    );

    const mergedState = mergeWindowsInState(adjacentState, {
        cellAId: 'left-module',
        cellBId: 'right-module',
        type: 'fixed-glazing',
    });
    const mergedGeometry = geometryFor(mergedState);
    const mergedEnvelope = outerEnvelope(mergedGeometry);
    assert(
        mergedGeometry.cells.length === 1
            && Math.abs(mergedGeometry.cells[0].width - expectedCellWidth * 2) < 1e-9
            && Math.abs(mergedEnvelope.minX - adjacentEnvelope.minX) < 1e-9
            && Math.abs(mergedEnvelope.maxX - adjacentEnvelope.maxX) < 1e-9,
        'Merging two side-by-side windows must preserve their exact pre-merge outside envelope; removing the mullion must not make the merged window wider.'
    );

    const lState = normalizeWindowState({
        windows: [
            fixedCell('l-bottom-left', 0, 0, 1, 1),
            fixedCell('l-top-left', 0, 1, 1, 2),
            fixedCell('l-top-right', 1, 1, 2, 2),
        ],
    });
    const lGeometry = geometryFor(lState);
    assert(
        lGeometry.cells.every(cell => (
            Math.abs(cell.width - expectedCellWidth) < 1e-9
            && Math.abs(cell.height - expectedCellHeight) < 1e-9
        )),
        'Every unmerged L cell, including the two-mullion corner cell, must use the same reduced one-window pitch.'
    );
    const lHorizontal = lGeometry.dividerSegments.find(divider => divider.orientation === 'horizontal');
    const lVertical = lGeometry.dividerSegments.find(divider => divider.orientation === 'vertical');
    const lRightFrame = lGeometry.framePlacements.find(frame =>
        frame.windowCell === 'l-bottom-left' && frame.side === 'right'
    );
    const lBottomFrame = lGeometry.framePlacements.find(frame =>
        frame.windowCell === 'l-top-right' && frame.side === 'bottom'
    );
    assert(
        lHorizontal
            && lVertical
            && lRightFrame
            && lBottomFrame
            && Math.abs(lHorizontal.worldEnd - lVertical.structuralPerpendicularOffset) < 1e-9
            && Math.abs(lVertical.worldStart - lHorizontal.structuralPerpendicularOffset) < 1e-9
            && Math.abs(lRightFrame.structuralPerpendicularOffset - lVertical.structuralPerpendicularOffset) < 1e-9
            && Math.abs(lRightFrame.structuralWorldEnd - lHorizontal.structuralPerpendicularOffset) < 1e-9
            && Math.abs(lBottomFrame.structuralWorldStart - lVertical.structuralPerpendicularOffset) < 1e-9
            && Math.abs(lBottomFrame.structuralPerpendicularOffset - lHorizontal.structuralPerpendicularOffset) < 1e-9,
        'Unmerged L frame and mullion arms must still share one structural + point; CAD mullion offsets must not resize the corner module.'
    );
    const lExpectedFrameOffset = frameSpan - 0.088 / 2;
    assert(
        Math.abs(lVertical.mixedPlusPerpendicularShift) < 1e-12
            && Math.abs(lHorizontal.mixedPlusPerpendicularShift) < 1e-12
            && Math.abs(lRightFrame.perpendicularOffset - (lRightFrame.structuralPerpendicularOffset + lExpectedFrameOffset)) < 1e-9
            && Math.abs(lBottomFrame.perpendicularOffset - (lBottomFrame.structuralPerpendicularOffset - lExpectedFrameOffset)) < 1e-9,
        'For this L rotation the mullions must stay centred while the asymmetric right/bottom frames carry the +/- frameSpan-halfFace offset.'
    );

    // Preserve the previous no-gap fix: after merging the first two windows in
    // the top row of the four-window T, the surviving mullion must still feed
    // its exact CAD seat to both the merged cell and the ordinary top-right cell.
    let tState = normalizeWindowState({
        windows: [
            fixedCell('t-bottom-middle', 1, 0, 2, 1),
            fixedCell('t-top-left', 0, 1, 1, 2),
            fixedCell('t-top-middle', 1, 1, 2, 2),
            fixedCell('t-top-right', 2, 1, 3, 2),
        ],
    });
    tState = mergeWindowsInState(tState, {
        cellAId: 't-top-left',
        cellBId: 't-top-middle',
        type: 'fixed-glazing',
    });
    const tGeometry = geometryFor(tState);
    const tMerged = tGeometry.cells.find(cell => cell.id === 't-top-left');
    const tRight = tGeometry.cells.find(cell => cell.id === 't-top-right');
    const tVertical = tGeometry.dividerSegments.find(divider => (
        divider.orientation === 'vertical'
        && divider.negativeCellId === 't-top-left'
        && divider.positiveCellId === 't-top-right'
    ));
    assert(
        tMerged
            && tRight
            && tVertical
            && Math.abs(tMerged.connectionX1 - (tVertical.perpendicularOffset + 0.031)) < 1e-9
            && Math.abs(tRight.connectionX0 - (tVertical.perpendicularOffset - 0.031)) < 1e-9,
        'Reduced cell pitch must not remove the exact mullion CAD seats that keep sash/glazing-bead geometry touching the surviving top T mullion.'
    );
}

if (errors.length) {
    console.error('Window layout geometry validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout geometry valid: divider placement, frame-to-frame contact, 45-degree mullion sockets, and V tips passed.');
}
