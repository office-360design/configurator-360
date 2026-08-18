import {
    getDividerArrowAlongCoordinate,
    getDividerCrossSectionMetrics,
    getDividerSegmentAlongCoordinate,
    getFixedGlassPanePlacement,
    getHorizontalConnectionFaceDirection,
    getFrameDividerSocketInset,
    getFrameReentrantMiterInset,
    getFrameSidePlacements,
    getLinearDividerLayout,
    getTopFixedBottomSashSashLayout,
    getEditableWindowTopologyGeometry,
    getEditableDividerSegmentPlacement,
    getEditableReentrantFramePlacement,
    getEditableFixedGlazingDividerCadTransform,
} from '../../src/client/js/window-layout-geometry.js';

import {
    addWindowToState,
    deriveWindowTopology,
    mergeWindowsInState,
    normalizeWindowState,
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
    Math.abs(editableMixedFixed.x1 - (-0.031)) < 1e-9
        && Math.abs(editableMixedSash.x0 - (-0.013)) < 1e-9
        && Math.abs(editableMixedFixed.connectionX1 - (-0.031)) < 1e-9
        && Math.abs(editableMixedSash.connectionX0 - (-0.013)) < 1e-9,
    'Ordinary dynamic mixed joins must keep using the CAD-derived cell boundaries that were already validated.'
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
    Math.abs(editableReversedSash.x1 - 0.013) < 1e-9
        && Math.abs(editableReversedFixed.x0 - 0.009058930398579662) < 1e-9
        && Math.abs(editableReversedSash.connectionX1 - 0.013) < 1e-9
        && Math.abs(editableReversedFixed.connectionX0 - 0.009058930398579662) < 1e-9,
    'A reversed ordinary mixed join must keep its previously validated CAD-derived cell boundaries.'
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
    Math.abs(editableFixedA.x1 - (-0.031)) < 1e-9
        && Math.abs(editableFixedB.x0 - 0.031) < 1e-9
        && Math.abs(editableFixedA.connectionX1 - (-0.031)) < 1e-9
        && Math.abs(editableFixedB.connectionX0 - 0.031) < 1e-9,
    'Ordinary dynamic fixed/fixed joins must continue using their CAD-derived fixed-light connection rectangle.'
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
    Math.abs(equalLCorner.x1 - equalLCorner.connectionX1) < 1e-9
        && Math.abs(equalLCorner.y1 - equalLCorner.connectionY1) < 1e-9
        && Math.abs(equalLRight.x0 - equalLRight.connectionX0) < 1e-9
        && Math.abs(equalLTop.y0 - equalLTop.connectionY0) < 1e-9,
    'Equal-size L cells must translate to the exact CAD-derived mullion boundaries instead of reverting to the structural centreline and leaving a sash/mullion gap.'
);
assert(
    Math.abs(equalLCorner.layoutShiftX - equalLTop.layoutShiftX) < 1e-9
        && Math.abs(equalLCorner.layoutShiftY - equalLRight.layoutShiftY) < 1e-9,
    'L compensation must propagate by complete columns/rows so neighbouring outer frames remain aligned while the corner cell keeps both CAD seats.'
);
assert(
    Math.abs(equalLCorner.connectionWidth - 1.231) < 1e-9
        && Math.abs(equalLCorner.connectionHeight - 1.531) < 1e-9,
    'The L-corner must still retain both CAD mullion connection seats separately from its structural window size.'
);
const equalLCornerBottomFrame = editableEqualSizeL.framePlacements.find(
    placement => placement.id === 'corner-bottom'
);
const equalLRightBottomFrame = editableEqualSizeL.framePlacements.find(
    placement => placement.id === 'right-bottom'
);
assert(
    equalLCornerBottomFrame.width < 1.2
        && equalLRightBottomFrame.width < 1.2
        && Math.abs(
            equalLCornerBottomFrame.perpendicularOffset
            - equalLRightBottomFrame.perpendicularOffset
        ) < 1e-9,
    'The L fix must compensate by shortening the exposed perimeter-frame pieces while keeping the shared row on one aligned outer-frame line.'
);
const equalLVerticalDivider = editableEqualSizeL.dividerSegments.find(
    segment => segment.id === 'equal-l-vertical'
);
assert(
    Math.abs(equalLVerticalDivider.worldStart - equalLCornerBottomFrame.perpendicularOffset) < 1e-9
        && Math.abs(equalLVerticalDivider.worldEnd) < 1e-9,
    'The exterior end of an L mullion must follow the compensated frame line while its inside-corner junction remains on the structural L centre.'
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
        Boolean(edge),
        `${label} must rebuild the uncovered ${side} portion of the merged window as an exterior frame segment.`
    );
    const addCandidate = topology.addCandidates.find(candidate => candidate.frameEdgeId === edge?.id);
    assert(
        Boolean(addCandidate),
        `${label} must keep the newly reconstructed partial frame usable as an add-window edge.`
    );

    const geometry = getEditableWindowTopologyGeometry({
        width: 1.2,
        height: 1.5,
        topology,
    });
    const perimeterJunction = geometry.perimeterJunctions.find(junction =>
        junction.hostFrameEndpoint?.frameId === edge?.id
    );
    assert(
        Boolean(perimeterJunction),
        `${label} must classify the partial frame + surviving mullion + perpendicular frame as a re-entrant perimeter T.`
    );

    const basePlacement = geometry.framePlacements.find(placement => placement.id === edge?.id);
    const frameSpan = 0.075;
    const mullionFaceSpan = 0.098;
    const expectedStraightContact = frameSpan - mullionFaceSpan / 2;
    const reentrantPlacement = getEditableReentrantFramePlacement({
        placement: basePlacement,
        perimeterJunctions: geometry.perimeterJunctions,
        frameInwardSpan: frameSpan,
        dividerFaceSpan: mullionFaceSpan,
    });
    assert(
        reentrantPlacement?.reentrantHost === true
            && Math.abs(reentrantPlacement.reentrantStraightContactSpan - expectedStraightContact) < 1e-9,
        `${label} must use the frame-to-mullion straight-contact offset instead of leaving the partial frame on the ordinary outer-edge plane.`
    );
    if (basePlacement && reentrantPlacement && perimeterJunction) {
        const hostEndpoint = perimeterJunction.hostFrameEndpoint;
        const isHorizontal = basePlacement.orientation === 'horizontal';
        const baseLength = isHorizontal ? basePlacement.width : basePlacement.height;
        const adjustedLength = isHorizontal ? reentrantPlacement.width : reentrantPlacement.height;
        const baseLongitudinalOrigin = isHorizontal ? basePlacement.originX : basePlacement.originY;
        const adjustedLongitudinalOrigin = isHorizontal ? reentrantPlacement.originX : reentrantPlacement.originY;
        const expectedLongitudinalShift = hostEndpoint.atStart ? -frameSpan / 2 : frameSpan / 2;
        assert(
            Math.abs(adjustedLength - (baseLength + frameSpan)) < 1e-9
                && Math.abs(adjustedLongitudinalOrigin - (baseLongitudinalOrigin + expectedLongitudinalShift)) < 1e-9,
            `${label} must extend the reconstructed frame one full frame span into the T joint without moving its free outer end.`
        );
        assert(
            reentrantPlacement.frameJointModes?.[hostEndpoint.localEnd] === 'reverse-miter',
            `${label} must reverse the miter at the mullion-continuation end so the ordinary 45-degree cut cannot leave a triangular hole.`
        );

        const expectedPerpendicularShift = basePlacement.side === 'bottom' || basePlacement.side === 'left'
            ? -expectedStraightContact
            : expectedStraightContact;
        const basePerpendicularOrigin = isHorizontal ? basePlacement.originY : basePlacement.originX;
        const adjustedPerpendicularOrigin = isHorizontal ? reentrantPlacement.originY : reentrantPlacement.originX;
        assert(
            Math.abs(adjustedPerpendicularOrigin - (basePerpendicularOrigin + expectedPerpendicularShift)) < 1e-9,
            `${label} must move the reconstructed frame outward so its opening-side edge aligns with the surviving mullion face.`
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

// At a re-entrant T, the reconstructed host frame must exactly continue the
// opening-side half of the mullion V.  With a 75 mm frame and 98 mm mullion,
// the straight-contact offset is 26 mm.  The reversed frame miter then lands
// on the same 45-degree line as the mullion arrow from its apex to shoulder.
{
    const frameSpan = 0.075;
    const mullionFaceSpan = 0.098;
    const halfMullion = mullionFaceSpan / 2;
    const straight = frameSpan - halfMullion;
    [0, halfMullion].forEach(mullionSideDistance => {
        const frameInward = straight + mullionSideDistance;
        const frameRelativeEnd = -frameSpan + getFrameReentrantMiterInset({
            inwardDistance: frameInward,
            frameInwardSpan: frameSpan,
        });
        const dividerLength = 1.0;
        const dividerRelativeEnd = getDividerSegmentAlongCoordinate({
            extrusionT: 1,
            length: dividerLength,
            faceOffset: mullionSideDistance,
            faceSpan: mullionFaceSpan,
            frameInwardSpan: frameSpan,
        }) - dividerLength / 2;
        assert(
            Math.abs(frameRelativeEnd - dividerRelativeEnd) < 1e-9,
            'The reconstructed frame reverse miter must coincide with the surviving mullion V from apex to shoulder.'
        );
    });
}

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

if (errors.length) {
    console.error('Window layout geometry validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout geometry valid: divider placement, frame-to-frame contact, 45-degree mullion sockets, and V tips passed.');
}
