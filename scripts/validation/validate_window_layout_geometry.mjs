import {
    getDividerArrowAlongCoordinate,
    getDividerCrossSectionMetrics,
    getFrameDividerSocketInset,
    getFrameSidePlacements,
    getLinearDividerLayout,
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
    dividerSeats: [
        { left: -0.044, right: 0.044 },
        { left: -0.044, right: 0.044 },
    ],
});
assert(
    repeatedLayout.dividerPositions.length === 2
        && repeatedLayout.cells.length === 3
        && repeatedLayout.dividerPositions[0] < repeatedLayout.dividerPositions[1]
        && Math.abs(repeatedLayout.dividerPositions[1] - repeatedLayout.dividerPositions[0]) > 0.05,
    'Three fixed columns must create two distinct divider centres and three cells.'
);
assert(
    Math.max(...repeatedLayout.cells.map(cell => cell.span))
        - Math.min(...repeatedLayout.cells.map(cell => cell.span)) < 1e-9,
    'Repeated dividers must preserve equal clear cell sizes after subtracting CAD seat widths.'
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

if (errors.length) {
    console.error('Window layout geometry validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout geometry valid: divider placement, frame-to-frame contact, 45-degree mullion sockets, and V tips passed.');
}
