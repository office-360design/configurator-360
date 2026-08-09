const MM_TO_M = 0.001;

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDividerCrossSectionMetrics(bounds = {}) {
    const widthMm = Math.max(
        0,
        finiteNumber(bounds.maxX) - finiteNumber(bounds.minX)
    );
    const depthMm = Math.max(
        0,
        finiteNumber(bounds.maxY) - finiteNumber(bounds.minY)
    );

    // Divider bounds are expressed in the canonical left/right join CAD
    // coordinate system before reaching this helper. In that verified system,
    // CAD X is the visible mullion face and CAD Y is the profile depth.
    return Object.freeze({
        faceSpanMm: widthMm,
        depthSpanMm: depthMm,
        faceSpanM: widthMm * MM_TO_M,
        depthSpanM: depthMm * MM_TO_M,
    });
}

export function getFrameSidePlacements({
    orientation,
    width,
    height,
    side,
}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));

    if (
        orientation === 'vertical'
        && (side === 'top' || side === 'bottom')
    ) {
        // The supplied mixed join CAD is fixed-left / sash-right. Keep the
        // runtime cell order identical so no unverified mirroring is needed.
        return [
            Object.freeze({
                id: `${side}-fixed`,
                width: normalizedWidth / 2,
                height: normalizedHeight,
                originX: -normalizedWidth / 4,
                originY: 0,
                windowCell: 'fixed',
                jointEnd: 'divider',
                localJointEnd: side === 'top' ? 'positive' : 'negative',
            }),
            Object.freeze({
                id: `${side}-opening`,
                width: normalizedWidth / 2,
                height: normalizedHeight,
                originX: normalizedWidth / 4,
                originY: 0,
                windowCell: 'opening',
                jointEnd: 'divider',
                localJointEnd: side === 'top' ? 'negative' : 'positive',
            }),
        ];
    }

    if (
        orientation === 'horizontal'
        && (side === 'left' || side === 'right')
    ) {
        return [
            Object.freeze({
                id: `${side}-fixed`,
                width: normalizedWidth,
                height: normalizedHeight / 2,
                originX: 0,
                originY: -normalizedHeight / 4,
                windowCell: 'fixed',
                jointEnd: 'divider',
                // Left-side extrusion runs bottom -> top; right-side extrusion
                // is mirrored in world Y by createMiteredSide().
                localJointEnd: side === 'left' ? 'positive' : 'negative',
            }),
            Object.freeze({
                id: `${side}-opening`,
                width: normalizedWidth,
                height: normalizedHeight / 2,
                originX: 0,
                originY: normalizedHeight / 4,
                windowCell: 'opening',
                jointEnd: 'divider',
                localJointEnd: side === 'left' ? 'negative' : 'positive',
            }),
        ];
    }

    return [Object.freeze({
        id: side,
        width: normalizedWidth,
        height: normalizedHeight,
        originX: 0,
        originY: 0,
        windowCell: 'outer-boundary',
        jointEnd: null,
    })];
}


export function getFrameDividerSocketInset({
    inwardDistance,
    dividerFaceSpan,
    frameInwardSpan = 0,
}) {
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const halfDividerFace = Math.max(0, finiteNumber(dividerFaceSpan)) / 2;
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));

    // The perimeter-frame halves must still meet each other on the outer part
    // of the frame section. Only the inner part, nearest the glass/mullion, is
    // cut diagonally to receive the mullion's 90-degree V.
    //
    // Example: frame span 75 mm, mullion face 98 mm -> half V depth 49 mm.
    // The first 26 mm stays on the centre plane (left/right frame contact),
    // then the remaining 49 mm opens at exactly 45 degrees to the mullion.
    const straightContactSpan = Math.max(
        0,
        normalizedFrameInwardSpan - halfDividerFace
    );
    const diagonalInwardDistance = Math.max(
        0,
        normalizedInwardDistance - straightContactSpan
    );

    return Math.min(diagonalInwardDistance, halfDividerFace);
}

export function getDividerArrowAlongCoordinate({
    extrusionT,
    length,
    faceOffset,
    faceSpan,
    frameInwardSpan = 0,
}) {
    const normalizedLength = Math.max(0, finiteNumber(length));
    const normalizedFaceSpan = Math.max(0, finiteNumber(faceSpan));
    const halfFace = normalizedFaceSpan / 2;
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const straightContactSpan = Math.max(
        0,
        normalizedFrameInwardSpan - halfFace
    );
    const tipInset = Math.min(straightContactSpan, normalizedLength / 2);
    const clampedFaceOffset = Math.min(
        halfFace,
        Math.abs(finiteNumber(faceOffset))
    );
    const normalizedT = Math.min(1, Math.max(0, finiteNumber(extrusionT)));

    // The mullion V no longer reaches the outside face of the perimeter frame.
    // Its apex starts after the straight left/right frame-contact region. From
    // that apex, each V face rises at 45 degrees until the mullion shoulder at
    // the inner edge of the frame section. The top end is the vertical mirror.
    const lowerEnd = -normalizedLength / 2 + tipInset + clampedFaceOffset;
    const upperEnd = normalizedLength / 2 - tipInset - clampedFaceOffset;

    // Triangle splitting can insert vertices on a side-wall edge whose source
    // extrusion coordinate lies between 0 and 1. Preserve that longitudinal
    // interpolation instead of snapping the new topology to one end.
    return lowerEnd + (upperEnd - lowerEnd) * normalizedT;
}
