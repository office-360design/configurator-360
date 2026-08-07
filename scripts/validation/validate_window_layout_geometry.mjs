import {
    getDividerArrowAlongCoordinate,
    getDividerCrossSectionMetrics,
    getFrameDividerSocketInset,
    getFrameSidePlacements,
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
