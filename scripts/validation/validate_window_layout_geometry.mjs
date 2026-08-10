import {
    getDividerArrowAlongCoordinate,
    getDividerCrossSectionMetrics,
    getDividerSegmentAlongCoordinate,
    getFixedGlassPanePlacement,
    getHorizontalConnectionFaceDirection,
    getFrameDividerSocketInset,
    getFrameSidePlacements,
    getLinearDividerLayout,
    getTopFixedBottomSashSashLayout,
} from '../../src/client/js/window-layout-geometry.js';

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

if (errors.length) {
    console.error('Window layout geometry validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout geometry valid: divider placement, frame-to-frame contact, 45-degree mullion sockets, and V tips passed.');
}
