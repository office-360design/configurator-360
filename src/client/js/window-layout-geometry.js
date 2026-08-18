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

export function getLinearDividerLayout({
    axisLength,
    cellTypes,
    dividerSeats,
    minCellSpan = 0.05,
}) {
    const normalizedAxisLength = Math.max(0, finiteNumber(axisLength));
    const normalizedCellTypes = Array.isArray(cellTypes) && cellTypes.length
        ? [...cellTypes]
        : ['fixed-glazing', 'fixed-glazing'];
    const expectedDividerCount = Math.max(0, normalizedCellTypes.length - 1);
    const normalizedSeats = Array.from({ length: expectedDividerCount }, (_, index) => {
        const seat = dividerSeats?.[index] || {};
        return Object.freeze({
            left: finiteNumber(seat.left),
            right: finiteNumber(seat.right),
        });
    });
    const normalizedMinCellSpan = Math.max(0, finiteNumber(minCellSpan, 0.05));

    // Existing one-divider layouts were visually accepted with the mullion /
    // transom centred exactly on the window origin. CAD-derived seat offsets
    // describe the neighbouring cell boundaries relative to that divider; they
    // must not be allowed to translate the structural divider itself.
    if (expectedDividerCount === 1) {
        const halfAxis = normalizedAxisLength / 2;
        const clampBoundary = value => Math.min(
            halfAxis - normalizedMinCellSpan,
            Math.max(-halfAxis + normalizedMinCellSpan, finiteNumber(value))
        );
        const seat = normalizedSeats[0];
        const leftBoundary = clampBoundary(seat.left);
        const rightBoundary = clampBoundary(seat.right);
        const boundaries = [
            Object.freeze({ start: -halfAxis, end: leftBoundary }),
            Object.freeze({ start: rightBoundary, end: halfAxis }),
        ];
        const cells = normalizedCellTypes.map((cellType, index) => {
            const boundary = boundaries[index];
            return Object.freeze({
                index,
                cellType,
                start: boundary.start,
                end: boundary.end,
                span: Math.max(normalizedMinCellSpan, boundary.end - boundary.start),
                center: (boundary.start + boundary.end) / 2,
            });
        });

        return Object.freeze({
            clearCellSpan: cells.reduce((sum, cell) => sum + cell.span, 0) / cells.length,
            dividerPositions: Object.freeze([0]),
            cells: Object.freeze(cells),
        });
    }

    // Repeated dividers define complete window bays. Those structural bays must
    // stay equal, regardless of asymmetric left/right CAD glazing seats on the
    // mullion profile. The previous solver equalised the CAD bead rectangle by
    // translating the mullion centres; with the real fixed/fixed seat values
    // that made one complete bay visibly wider than the other two.
    //
    // Keep structural divider centre-lines on exact equal subdivisions, and
    // carry a second CAD-connection rectangle for accessories that genuinely
    // need the exact divider-side seat.
    const structuralCellSpan = normalizedCellTypes.length
        ? normalizedAxisLength / normalizedCellTypes.length
        : normalizedAxisLength;
    const halfAxis = normalizedAxisLength / 2;
    const dividerPositions = normalizedSeats.map((seat, index) => (
        -halfAxis + structuralCellSpan * (index + 1)
    ));
    const cells = normalizedCellTypes.map((cellType, index) => {
        const start = -halfAxis + structuralCellSpan * index;
        const end = index === normalizedCellTypes.length - 1
            ? halfAxis
            : -halfAxis + structuralCellSpan * (index + 1);
        const connectionStart = index === 0
            ? start
            : dividerPositions[index - 1] + normalizedSeats[index - 1].right;
        const connectionEnd = index === normalizedCellTypes.length - 1
            ? end
            : dividerPositions[index] + normalizedSeats[index].left;
        const connectionSpan = Math.max(
            normalizedMinCellSpan,
            connectionEnd - connectionStart
        );

        return Object.freeze({
            index,
            cellType,
            start,
            end,
            span: Math.max(normalizedMinCellSpan, end - start),
            center: (start + end) / 2,
            connectionStart,
            connectionEnd,
            connectionSpan,
            connectionCenter: (connectionStart + connectionEnd) / 2,
        });
    });

    return Object.freeze({
        clearCellSpan: structuralCellSpan,
        dividerPositions: Object.freeze(dividerPositions),
        cells: Object.freeze(cells),
    });
}


export function getHorizontalConnectionFaceDirection({
    lowerCellType,
    upperCellType,
    joinLeftCell,
    joinRightCell,
    fallback = 1,
} = {}) {
    const lower = String(lowerCellType || '');
    const upper = String(upperCellType || '');
    const left = String(joinLeftCell || '');
    const right = String(joinRightCell || '');

    // createDividerSegment() with faceDirection=+1 maps the accepted CAD
    // join-left face to world +Y (top) after the verified 180-degree divider
    // correction. faceDirection=-1 maps join-left to world -Y (bottom).
    // Resolve that rotation from cell semantics instead of hard-coding a
    // different sign in every horizontal layout.
    if (lower && upper && left && right) {
        if (lower === left && upper === right) return -1;
        if (lower === right && upper === left) return 1;
    }

    return Number(fallback) < 0 ? -1 : 1;
}

export function getFixedGlassPanePlacement({
    width,
    height,
    centerX = 0,
    centerY = 0,
    outerInset = 0.05,
}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const normalizedCenterX = finiteNumber(centerX);
    const normalizedCenterY = finiteNumber(centerY);
    const normalizedOuterInset = Math.max(0, finiteNumber(outerInset, 0.05));

    // Fixed glass always follows the resolved CAD connection rectangle first,
    // then receives the same accepted inset on all four sides. For one-divider
    // layouts that rectangle is already the cell rectangle. Repeated layouts
    // pass their CAD-derived fixedAccessory rectangle so glass, beads and
    // gaskets all share the exact same connection seats instead of applying a
    // separate hand-tuned mullion/transom extension.
    return Object.freeze({
        width: Math.max(0.05, normalizedWidth - normalizedOuterInset * 2),
        height: Math.max(0.05, normalizedHeight - normalizedOuterInset * 2),
        centerX: normalizedCenterX,
        centerY: normalizedCenterY,
        leftInset: normalizedOuterInset,
        rightInset: normalizedOuterInset,
        bottomInset: normalizedOuterInset,
        topInset: normalizedOuterInset,
    });
}

export function getFrameSidePlacements({
    orientation,
    width,
    height,
    side,
    dividerPositions = null,
    cellTypes = null,
}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const normalizedDividerPositions = Array.isArray(dividerPositions)
        ? dividerPositions.map(position => finiteNumber(position)).sort((a, b) => a - b)
        : [0];
    const normalizedCellTypes = Array.isArray(cellTypes) && cellTypes.length
        ? [...cellTypes]
        : ['fixed-glazing', 'opening-sash'];

    function buildSegments({ axisLength, axis, worldToLocalEnd }) {
        const min = -axisLength / 2;
        const max = axisLength / 2;
        const cuts = normalizedDividerPositions.filter(position => position > min && position < max);
        const boundaries = [min, ...cuts, max];
        const placements = [];

        for (let index = 0; index < boundaries.length - 1; index += 1) {
            const lower = boundaries[index];
            const upper = boundaries[index + 1];
            const span = Math.max(0, upper - lower);
            const center = (lower + upper) / 2;
            const localJointEnds = [];
            if (index > 0) localJointEnds.push(worldToLocalEnd('negative'));
            if (index < boundaries.length - 2) localJointEnds.push(worldToLocalEnd('positive'));
            const cellType = normalizedCellTypes[index] || normalizedCellTypes.at(-1) || 'fixed-glazing';

            placements.push(Object.freeze({
                id: `${side}-cell-${index}`,
                width: axis === 'x' ? span : normalizedWidth,
                height: axis === 'y' ? span : normalizedHeight,
                originX: axis === 'x' ? center : 0,
                originY: axis === 'y' ? center : 0,
                windowCell: normalizedCellTypes.length === 2
                    ? (cellType === 'opening-sash' ? 'opening' : 'fixed')
                    : `cell-${index}`,
                cellIndex: index,
                cellType,
                jointEnd: localJointEnds.length ? 'divider' : null,
                localJointEnd: localJointEnds.length === 1 ? localJointEnds[0] : null,
                localJointEnds: Object.freeze(localJointEnds),
            }));
        }

        return placements;
    }

    if (
        orientation === 'vertical'
        && (side === 'top' || side === 'bottom')
    ) {
        return buildSegments({
            axisLength: normalizedWidth,
            axis: 'x',
            worldToLocalEnd: worldDirection => {
                if (side === 'top') {
                    return worldDirection === 'negative' ? 'negative' : 'positive';
                }
                return worldDirection === 'negative' ? 'positive' : 'negative';
            },
        });
    }

    if (
        orientation === 'horizontal'
        && (side === 'left' || side === 'right')
    ) {
        return buildSegments({
            axisLength: normalizedHeight,
            axis: 'y',
            worldToLocalEnd: worldDirection => {
                if (side === 'left') {
                    return worldDirection === 'negative' ? 'negative' : 'positive';
                }
                return worldDirection === 'negative' ? 'positive' : 'negative';
            },
        });
    }

    return [Object.freeze({
        id: side,
        width: normalizedWidth,
        height: normalizedHeight,
        originX: 0,
        originY: 0,
        windowCell: 'outer-boundary',
        cellIndex: null,
        cellType: null,
        jointEnd: null,
        localJointEnds: Object.freeze([]),
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

export function getFrameReentrantMiterInset({
    inwardDistance,
    frameInwardSpan,
    dividerFaceSpan = null,
    frameBoundaryOffset = 0,
} = {}) {
    const normalizedFrameSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const normalizedInwardDistance = Math.min(
        normalizedFrameSpan,
        Math.max(0, finiteNumber(inwardDistance))
    );

    // A reconstructed perimeter frame must stay on the same CAD boundary as
    // the sash/fixed-light it surrounds.  Its outer edge is not necessarily on
    // the mullion centreline (for example an opening-sash seat can be 13 mm to
    // one side of it), so the reverse-miter diagonal cannot assume that the
    // complete frame span participates in the T joint.
    //
    // frameBoundaryOffset is signed toward the host cell from the mullion
    // centreline.  The diagonal therefore runs only until the frame reaches the
    // host-side mullion shoulder: halfFace - boundaryOffset.  Keeping this in
    // the cut geometry, rather than translating the whole frame, preserves the
    // exact frame-to-sash contact while the cut still lands on the mullion V.
    const parsedDividerFaceSpan = Number(dividerFaceSpan);
    const diagonalSpan = Number.isFinite(parsedDividerFaceSpan)
        ? Math.min(
            normalizedFrameSpan,
            Math.max(
                0,
                Math.max(0, parsedDividerFaceSpan) / 2
                    - finiteNumber(frameBoundaryOffset)
            )
        )
        : normalizedFrameSpan;

    return Math.max(0, diagonalSpan - normalizedInwardDistance);
}

export function getDividerSegmentAlongCoordinate({
    extrusionT,
    length,
    faceOffset,
    faceSpan,
    frameInwardSpan = 0,
    negativeFrameInwardSpan = null,
    positiveFrameInwardSpan = null,
    negativeEndMode = 'arrow',
    positiveEndMode = 'arrow',
    socketInwardDistance = 0,
}) {
    const normalizedLength = Math.max(0, finiteNumber(length));
    const normalizedFaceSpan = Math.max(0, finiteNumber(faceSpan));
    const halfFace = normalizedFaceSpan / 2;
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const normalizeEndFrameInwardSpan = value => {
        if (value === null || value === undefined || value === '') {
            return normalizedFrameInwardSpan;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed)
            ? Math.max(0, parsed)
            : normalizedFrameInwardSpan;
    };
    const negativeEndFrameInwardSpan = normalizeEndFrameInwardSpan(
        negativeFrameInwardSpan
    );
    const positiveEndFrameInwardSpan = normalizeEndFrameInwardSpan(
        positiveFrameInwardSpan
    );
    const clampedFaceOffset = Math.min(
        halfFace,
        Math.abs(finiteNumber(faceOffset))
    );
    const normalizedT = Math.min(1, Math.max(0, finiteNumber(extrusionT)));
    const normalizedSocketInwardDistance = Math.max(
        0,
        finiteNumber(socketInwardDistance)
    );

    const getEndInset = (mode, endFrameInwardSpan) => {
        if (mode === 'socket') {
            return getFrameDividerSocketInset({
                inwardDistance: normalizedSocketInwardDistance,
                dividerFaceSpan: normalizedFaceSpan,
                frameInwardSpan: endFrameInwardSpan,
            });
        }
        if (mode === 'square') return 0;
        const straightContactSpan = Math.max(
            0,
            endFrameInwardSpan - halfFace
        );
        const tipInset = Math.min(straightContactSpan, normalizedLength / 2);
        return tipInset + clampedFaceOffset;
    };

    const lowerEnd = -normalizedLength / 2 + getEndInset(
        negativeEndMode,
        negativeEndFrameInwardSpan
    );
    const upperEnd = normalizedLength / 2 - getEndInset(
        positiveEndMode,
        positiveEndFrameInwardSpan
    );

    // Triangle splitting can insert vertices on a side-wall edge whose source
    // extrusion coordinate lies between 0 and 1. Preserve that longitudinal
    // interpolation instead of snapping the new topology to one end.
    return lowerEnd + (upperEnd - lowerEnd) * normalizedT;
}

export function getDividerArrowAlongCoordinate(args) {
    return getDividerSegmentAlongCoordinate({
        ...args,
        negativeEndMode: 'arrow',
        positiveEndMode: 'arrow',
    });
}

export function getTopFixedBottomSashSashLayout({
    width,
    height,
    topRowFraction = 0.30,
    horizontalFixedBoundary = -0.04,
    horizontalSashBoundary = 0.04,
    verticalLeftSashBoundary = -0.04,
    verticalRightSashBoundary = 0.04,
    minCellSpan = 0.05,
}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const normalizedTopFraction = Math.min(
        0.7,
        Math.max(0.2, finiteNumber(topRowFraction, 0.30))
    );
    const normalizedMinCellSpan = Math.max(0.02, finiteNumber(minCellSpan, 0.05));
    const halfWidth = normalizedWidth / 2;
    const halfHeight = normalizedHeight / 2;

    // The reference drawing has a shallow fixed light above two taller sashes.
    // Keep the structural transom centre from that visual ratio, then let the
    // exact CAD connection seats define where the glazing/sash rectangles stop.
    const transomCenterY = halfHeight - normalizedHeight * normalizedTopFraction;

    // The mixed join is authored left=fixed, right=sash. For this T layout that
    // cross-section is rotated so CAD-left becomes world-top and CAD-right
    // becomes world-bottom, therefore the join offsets change sign on world Y.
    const fixedBottomY = transomCenterY - finiteNumber(horizontalFixedBoundary);
    const sashTopY = transomCenterY - finiteNumber(horizontalSashBoundary);

    const clampY = value => Math.min(
        halfHeight - normalizedMinCellSpan,
        Math.max(-halfHeight + normalizedMinCellSpan, finiteNumber(value))
    );
    const clampX = value => Math.min(
        halfWidth - normalizedMinCellSpan,
        Math.max(-halfWidth + normalizedMinCellSpan, finiteNumber(value))
    );

    const fixedBottom = clampY(fixedBottomY);
    const lowerSashTop = clampY(sashTopY);
    const leftSashRight = clampX(verticalLeftSashBoundary);
    const rightSashLeft = clampX(verticalRightSashBoundary);

    const topFixed = Object.freeze({
        id: 'fixed-top',
        cellType: 'fixed-glazing',
        width: normalizedWidth,
        height: Math.max(normalizedMinCellSpan, halfHeight - fixedBottom),
        centerX: 0,
        centerY: (fixedBottom + halfHeight) / 2,
        fixedAccessoryWidth: normalizedWidth,
        fixedAccessoryHeight: Math.max(normalizedMinCellSpan, halfHeight - fixedBottom),
        fixedAccessoryCenterX: 0,
        fixedAccessoryCenterY: (fixedBottom + halfHeight) / 2,
        dividerJoinSideByBoundary: Object.freeze({ bottom: 'left' }),
    });

    const lowerHeight = Math.max(normalizedMinCellSpan, lowerSashTop + halfHeight);
    const lowerCenterY = (-halfHeight + lowerSashTop) / 2;
    const leftOpening = Object.freeze({
        id: 'opening-left',
        cellType: 'opening-sash',
        width: Math.max(normalizedMinCellSpan, leftSashRight + halfWidth),
        height: lowerHeight,
        centerX: (-halfWidth + leftSashRight) / 2,
        centerY: lowerCenterY,
        joinCellSide: 'left',
        handleSide: 'right',
    });
    const rightOpening = Object.freeze({
        id: 'opening-right',
        cellType: 'opening-sash',
        width: Math.max(normalizedMinCellSpan, halfWidth - rightSashLeft),
        height: lowerHeight,
        centerX: (rightSashLeft + halfWidth) / 2,
        centerY: lowerCenterY,
        joinCellSide: 'right',
        handleSide: 'left',
    });

    return Object.freeze({
        layoutKind: 't-grid',
        transomCenterY,
        verticalMullionCenterX: 0,
        lowerStructuralHeight: Math.max(0, transomCenterY + halfHeight),
        lowerStructuralCenterY: (-halfHeight + transomCenterY) / 2,
        fixedCells: Object.freeze([topFixed]),
        openingCells: Object.freeze([leftOpening, rightOpening]),
    });
}

function gridToWorldX(col, minCol, totalWidth, cellWidth) {
    return -totalWidth / 2 + (finiteNumber(col) - minCol) * finiteNumber(cellWidth);
}

function gridToWorldY(row, minRow, totalHeight, cellHeight) {
    return -totalHeight / 2 + (finiteNumber(row) - minRow) * finiteNumber(cellHeight);
}

function localJointEndForFrameSide(side, worldEnd) {
    if (side === 'top' || side === 'left') {
        return worldEnd === 'negative' ? 'negative' : 'positive';
    }
    return worldEnd === 'negative' ? 'positive' : 'negative';
}

function getEditableDividerVariantKey(divider = {}) {
    return `${divider.orientation || 'vertical'}:${divider.templateId || 'mullion-fixed-sash'}:${divider.reversed ? 'reversed' : 'normal'}`;
}

export function getEditableFixedGlazingDividerCadTransform({
    profile,
    divider,
    runtimeDividerSide,
} = {}) {
    const currentVariant = profile?.dividerConnectionVariants?.[
        getEditableDividerVariantKey(divider)
    ] || profile || {};

    // Divider variants already carry the fixed-side placement transform from
    // the fixed/fixed join. Use the runtime side directly. In particular, do
    // not reuse the authored mixed fixed-left transform for a reversed join:
    // the catalog now has an actual fixed-right seat from window-mullion-window.
    return currentVariant.fixedGlazingDividerCadTransforms?.[
        runtimeDividerSide
    ] || null;
}

function getEditableDividerCellBoundaryOffset({
    divider,
    cellType,
    cellSide,
    dividerConnectionVariants,
    connectionScale,
}) {
    const variant = dividerConnectionVariants?.[getEditableDividerVariantKey(divider)] || null;
    if (!variant) return null;

    const sourceBoundaries = cellType === 'opening-sash'
        ? variant.dividerConnection?.openingSashDividerBoundariesMm
        : variant.fixedGlazingConnections?.dividerCellBoundariesMm;
    if (!sourceBoundaries) return null;

    const direct = Number(sourceBoundaries[cellSide]);
    if (Number.isFinite(direct)) return direct * connectionScale;

    // The mixed fixed/sash CAD join is authored fixed-left / sash-right.  A
    // dynamically added sash-left / fixed-right window reuses that same join
    // mirrored around the mullion centre.  Some composition metadata remains
    // keyed to the authored CAD side, so reflect the opposite-side seat when
    // the requested reversed-side key is not present instead of falling back
    // to the visible mullion half-width / structural centreline.
    if (divider?.reversed) {
        const oppositeSide = cellSide === 'left' ? 'right' : 'left';
        const mirrored = Number(sourceBoundaries[oppositeSide]);
        if (Number.isFinite(mirrored)) return -mirrored * connectionScale;
    }

    return null;
}


export function getEditableDividerSegmentPlacement({
    segment,
    junctions = [],
    dividerFaceSpan = 0,
    frameJointInwardSpan = 0,
} = {}) {
    let length = Math.max(0, finiteNumber(segment?.length));
    let longitudinalOffset = finiteNumber(segment?.longitudinalOffset);
    const normalizedDividerFaceSpan = Math.max(0, finiteNumber(dividerFaceSpan));
    const normalizedFrameJointInwardSpan = Math.max(0, finiteNumber(frameJointInwardSpan));
    const halfFace = normalizedDividerFaceSpan / 2;
    const joint = {
        negativeEndMode: 'arrow',
        positiveEndMode: 'arrow',
        negativeFrameInwardSpan: normalizedFrameJointInwardSpan,
        positiveFrameInwardSpan: normalizedFrameJointInwardSpan,
    };

    const getJunctionForEndpoint = atStart => junctions.find(junction =>
        junction.endpoints?.some(endpoint =>
            endpoint.dividerId === segment?.id && endpoint.atStart === atStart
        )
    ) || null;

    [true, false].forEach(atStart => {
        const junction = getJunctionForEndpoint(atStart);
        if (!junction) return;
        const endModeKey = atStart ? 'negativeEndMode' : 'positiveEndMode';
        const frameSpanKey = atStart
            ? 'negativeFrameInwardSpan'
            : 'positiveFrameInwardSpan';

        if (junction.type === 'L') {
            // At a concave L-shaped corner there is no second perimeter-frame
            // half on the missing-cell quadrant to complete the normal
            // frame/divider socket. Both perpendicular mullions therefore need
            // their full V ends to reach the shared centre point. Extending each
            // segment by half the divider face makes the two 45-degree heads
            // meet exactly, rather than leaving the normal frame-joint setback
            // as a visible square hole.
            joint[endModeKey] = 'arrow';
            joint[frameSpanKey] = normalizedDividerFaceSpan;
            length += halfFace;
            longitudinalOffset += atStart ? -halfFace / 2 : halfFace / 2;
            return;
        }

        if (segment?.orientation === junction.hostOrientation) {
            // The two collinear host pieces meet each other on one half of the
            // section and open a 90-degree socket on the other, matching the
            // verified T joint.
            joint[endModeKey] = 'socket';
            joint[frameSpanKey] = normalizedDividerFaceSpan;
            joint.socketInwardSign = 1;
            joint.socketInwardOffset = halfFace;
            return;
        }

        // A T branch divider needs a nominal extra half-face beyond the host
        // centre plane so the arrow deformation lands its apex on the host
        // centre and its shoulders on the socket faces.
        joint[endModeKey] = 'arrow';
        joint[frameSpanKey] = normalizedDividerFaceSpan;
        length += halfFace;
        longitudinalOffset += atStart ? -halfFace / 2 : halfFace / 2;
    });

    return Object.freeze({
        length,
        longitudinalOffset,
        joint: Object.freeze({ ...joint }),
    });
}

export function getEditableReentrantFramePlacement({
    placement,
    perimeterJunctions = [],
    frameInwardSpan = 0,
    dividerFaceSpan = 0,
} = {}) {
    if (!placement) return null;

    const normalizedFrameSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const normalizedDividerFaceSpan = Math.max(0, finiteNumber(dividerFaceSpan));
    const halfDividerFace = normalizedDividerFaceSpan / 2;
    const straightContactSpan = Math.max(
        0,
        normalizedFrameSpan - halfDividerFace
    );

    const hostJunctions = perimeterJunctions
        .filter(junction => (
            junction?.type === 'perimeter-T'
            && junction.hostFrameEndpoint?.frameId === placement.id
        ));
    const hostEndpoints = hostJunctions.map(junction => junction.hostFrameEndpoint);

    if (!hostEndpoints.length || normalizedFrameSpan <= 0) {
        return Object.freeze({
            ...placement,
            frameJointModes: Object.freeze({}),
            reentrantHost: false,
        });
    }

    let width = Math.max(0, finiteNumber(placement.width));
    let height = Math.max(0, finiteNumber(placement.height));
    let originX = finiteNumber(placement.originX);
    let originY = finiteNumber(placement.originY);
    const frameJointModes = {};

    // A perimeter segment reconstructed after a merge is not an ordinary
    // convex outer-frame corner at the point where it continues a mullion.
    // The normal 45-degree miter points the wrong way and leaves a triangular
    // gap, so the host end still needs a reverse miter and one full frame-span
    // of longitudinal stock.
    //
    // Do NOT translate the complete frame perpendicular to its side.  The base
    // placement is already on the exact CAD boundary of the merged sash/fixed
    // cell. Moving it outward by the old 26 mm straight-contact allowance is
    // what made the reconstructed bottom frame sit visibly below the sash in
    // merged-L layouts. Instead, keep the frame on that cell boundary and feed
    // its signed boundary offset into the reverse-miter calculation below.
    const getOuterBoundary = () => {
        if (placement.side === 'bottom') return originY - height / 2;
        if (placement.side === 'top') return originY + height / 2;
        if (placement.side === 'left') return originX - width / 2;
        if (placement.side === 'right') return originX + width / 2;
        return 0;
    };
    const inwardSign = placement.side === 'bottom' || placement.side === 'left'
        ? 1
        : -1;
    const hostJunction = hostJunctions[0];
    const dividerCentre = placement.orientation === 'horizontal'
        ? finiteNumber(hostJunction?.y, placement.structuralPerpendicularOffset)
        : finiteNumber(hostJunction?.x, placement.structuralPerpendicularOffset);
    const frameBoundaryOffset = (getOuterBoundary() - dividerCentre) * inwardSign;

    hostEndpoints.forEach(endpoint => {
        const atStart = Boolean(endpoint.atStart);
        frameJointModes[endpoint.localEnd] = 'reverse-miter';

        if (placement.orientation === 'horizontal') {
            width += normalizedFrameSpan;
            originX += atStart ? -normalizedFrameSpan / 2 : normalizedFrameSpan / 2;
        } else {
            height += normalizedFrameSpan;
            originY += atStart ? -normalizedFrameSpan / 2 : normalizedFrameSpan / 2;
        }
    });

    return Object.freeze({
        ...placement,
        width,
        height,
        originX,
        originY,
        frameJointModes: Object.freeze(frameJointModes),
        reentrantHost: true,
        reentrantStraightContactSpan: straightContactSpan,
        reentrantFrameBoundaryOffset: frameBoundaryOffset,
    });
}

export function getEditableCellInteriorPlacement(cell = {}) {
    const structuralX0 = finiteNumber(cell.x0);
    const structuralX1 = finiteNumber(cell.x1, structuralX0);
    const structuralY0 = finiteNumber(cell.y0);
    const structuralY1 = finiteNumber(cell.y1, structuralY0);
    const x0 = Number.isFinite(Number(cell.connectionX0))
        ? Number(cell.connectionX0)
        : structuralX0;
    const x1 = Number.isFinite(Number(cell.connectionX1))
        ? Number(cell.connectionX1)
        : structuralX1;
    const y0 = Number.isFinite(Number(cell.connectionY0))
        ? Number(cell.connectionY0)
        : structuralY0;
    const y1 = Number.isFinite(Number(cell.connectionY1))
        ? Number(cell.connectionY1)
        : structuralY1;

    // The slider/grid rectangle describes the structural bay. CAD divider
    // seats describe where the sash/fixed-light assembly must actually meet a
    // mullion. Keep those two concepts separate: a staircase can put opposite
    // divider seats on different cells in the same row/column, so translating
    // the complete row/column cannot satisfy both seats at once.
    return Object.freeze({
        x0,
        x1,
        y0,
        y1,
        width: Math.max(0, x1 - x0),
        height: Math.max(0, y1 - y0),
        centerX: (x0 + x1) / 2,
        centerY: (y0 + y1) / 2,
    });
}

export function getEditableWindowTopologyGeometry({
    width,
    height,
    topology,
    dividerConnectionVariants = null,
    connectionScale = MM_TO_M,
    frameReplacementSpan = 0,
} = {}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const requestedFrameReplacementSpan = Math.max(0, finiteNumber(frameReplacementSpan));
    const windows = Array.isArray(topology?.windows) ? topology.windows : [];
    const dividers = Array.isArray(topology?.dividers) ? topology.dividers : [];
    const frameEdges = Array.isArray(topology?.frameEdges) ? topology.frameEdges : [];

    const minCol = windows.length ? Math.min(...windows.map(c => c.rect.x0)) : 0;
    const maxCol = windows.length ? Math.max(...windows.map(c => c.rect.x1)) : 1;
    const minRow = windows.length ? Math.min(...windows.map(c => c.rect.y0)) : 0;
    const maxRow = windows.length ? Math.max(...windows.map(c => c.rect.y1)) : 1;

    // The sliders describe a complete standalone window, outer frame to outer
    // frame. Once another window is attached, the touching outer frame is
    // replaced by a mullion. Therefore one topology grid step cannot also be a
    // complete slider width/height: doing that effectively counts the removed
    // frame again at every shared edge and makes merged cells grow.
    //
    // Use the actual frame face/inward span as the constant replacement amount.
    // The logical cell pitch is one slider dimension minus that constant. Half
    // of the constant is added back only at the global outer perimeter, so a
    // single standalone cell is still exactly the slider size while N adjacent
    // cells occupy N * slider - (N - 1) * frameSpan.
    const replacementSpanX = Math.min(
        requestedFrameReplacementSpan,
        Math.max(0, normalizedWidth - 0.05)
    );
    const replacementSpanY = Math.min(
        requestedFrameReplacementSpan,
        Math.max(0, normalizedHeight - 0.05)
    );
    const cellPitchX = Math.max(0.05, normalizedWidth - replacementSpanX);
    const cellPitchY = Math.max(0.05, normalizedHeight - replacementSpanY);
    const outerPadX = replacementSpanX / 2;
    const outerPadY = replacementSpanY / 2;
    const totalWidth = (maxCol - minCol) * cellPitchX;
    const totalHeight = (maxRow - minRow) * cellPitchY;

    const worldGridX = col => gridToWorldX(col, minCol, totalWidth, cellPitchX);
    const worldGridY = row => gridToWorldY(row, minRow, totalHeight, cellPitchY);
    const worldFrameX = col => {
        const base = worldGridX(col);
        if (Math.abs(finiteNumber(col) - minCol) <= 1e-9) return base - outerPadX;
        if (Math.abs(finiteNumber(col) - maxCol) <= 1e-9) return base + outerPadX;
        return base;
    };
    const worldFrameY = row => {
        const base = worldGridY(row);
        if (Math.abs(finiteNumber(row) - minRow) <= 1e-9) return base - outerPadY;
        if (Math.abs(finiteNumber(row) - maxRow) <= 1e-9) return base + outerPadY;
        return base;
    };

    const cells = windows.map(cell => {
        const x0 = worldGridX(cell.rect.x0);
        const x1 = worldGridX(cell.rect.x1);
        const y0 = worldGridY(cell.rect.y0);
        const y1 = worldGridY(cell.rect.y1);
        const connectionX0 = Math.abs(cell.rect.x0 - minCol) <= 1e-9
            ? worldFrameX(cell.rect.x0)
            : x0;
        const connectionX1 = Math.abs(cell.rect.x1 - maxCol) <= 1e-9
            ? worldFrameX(cell.rect.x1)
            : x1;
        const connectionY0 = Math.abs(cell.rect.y0 - minRow) <= 1e-9
            ? worldFrameY(cell.rect.y0)
            : y0;
        const connectionY1 = Math.abs(cell.rect.y1 - maxRow) <= 1e-9
            ? worldFrameY(cell.rect.y1)
            : y1;
        return {
            id: cell.id,
            cellType: cell.type,
            handleSide: cell.handleSide || null,
            x0,
            x1,
            y0,
            y1,
            structuralX0: x0,
            structuralX1: x1,
            structuralY0: y0,
            structuralY1: y1,
            // The structural cell is the reduced topology pitch. Exposed global
            // frame sides extend by half the removed-frame constant so the
            // complete standalone window still matches the slider dimension.
            // Divider-facing sides are overwritten below with the exact CAD
            // sash/glazing-bead seat and never resize the structural cell.
            connectionX0,
            connectionX1,
            connectionY0,
            connectionY1,
            width: Math.max(0, x1 - x0),
            height: Math.max(0, y1 - y0),
            centerX: (x0 + x1) / 2,
            centerY: (y0 + y1) / 2,
            dividerJoinSideByBoundary: {},
        };
    });
    const cellById = new Map(cells.map(cell => [cell.id, cell]));
    const structuralCellById = new Map(cells.map(cell => [cell.id, Object.freeze({
        id: cell.id,
        cellType: cell.cellType,
        x0: cell.structuralX0,
        x1: cell.structuralX1,
        y0: cell.structuralY0,
        y1: cell.structuralY1,
        width: Math.max(0, cell.structuralX1 - cell.structuralX0),
        height: Math.max(0, cell.structuralY1 - cell.structuralY0),
        centerX: (cell.structuralX0 + cell.structuralX1) / 2,
        centerY: (cell.structuralY0 + cell.structuralY1) / 2,
    })]));

    const dividerSegments = dividers.map(divider => {
        if (divider.orientation === 'vertical') {
            const x = worldGridX(divider.coordinate);
            // A divider that terminates at the global perimeter must reach the
            // real outer-frame boundary, not merely the reduced topology line.
            // Internal divider/divider or divider/re-entrant-frame junctions stay
            // on the logical grid so all arms share one exact intersection.
            const y0 = worldFrameY(divider.start);
            const y1 = worldFrameY(divider.end);
            return {
                ...divider,
                perpendicularOffset: x,
                longitudinalOffset: (y0 + y1) / 2,
                length: Math.max(0, y1 - y0),
                worldStart: y0,
                worldEnd: y1,
            };
        }
        const y = worldGridY(divider.coordinate);
        const x0 = worldFrameX(divider.start);
        const x1 = worldFrameX(divider.end);
        return {
            ...divider,
            perpendicularOffset: y,
            longitudinalOffset: (x0 + x1) / 2,
            length: Math.max(0, x1 - x0),
            worldStart: x0,
            worldEnd: x1,
        };
    });

    // The topology grid is the source of truth for physical window size.
    // CAD join seats describe only where the sash/fixed-light assembly meets a
    // mullion. Never write those seat offsets back into x0/x1/y0/y1 and never
    // translate complete rows/columns to satisfy them. Doing either changes the
    // apparent size of an L-corner cell and makes a merged cell occupy a
    // different envelope than the cells it replaced.

    // Record which local boundary of each cell meets each divider segment and
    // keep the exact CAD-facing boundaries in the independent connection
    // rectangle used by sash, glazing bead, gaskets and glass.
    dividerSegments.forEach(divider => {
        const negativeCell = cellById.get(divider.negativeCellId);
        const positiveCell = cellById.get(divider.positiveCellId);
        if (divider.orientation === 'vertical') {
            if (negativeCell) negativeCell.dividerJoinSideByBoundary.right = 'negative';
            if (positiveCell) positiveCell.dividerJoinSideByBoundary.left = 'positive';
        } else {
            if (negativeCell) negativeCell.dividerJoinSideByBoundary.top = 'negative';
            if (positiveCell) positiveCell.dividerJoinSideByBoundary.bottom = 'positive';
        }

        const negativeBoundaryOffset = negativeCell
            ? getEditableDividerCellBoundaryOffset({
                divider,
                cellType: negativeCell.cellType,
                cellSide: 'left',
                dividerConnectionVariants,
                connectionScale: finiteNumber(connectionScale, MM_TO_M),
            })
            : null;
        const positiveBoundaryOffset = positiveCell
            ? getEditableDividerCellBoundaryOffset({
                divider,
                cellType: positiveCell.cellType,
                cellSide: 'right',
                dividerConnectionVariants,
                connectionScale: finiteNumber(connectionScale, MM_TO_M),
            })
            : null;

        if (divider.orientation === 'vertical') {
            if (negativeCell && Number.isFinite(negativeBoundaryOffset)) {
                negativeCell.connectionX1 = divider.perpendicularOffset + negativeBoundaryOffset;
            }
            if (positiveCell && Number.isFinite(positiveBoundaryOffset)) {
                positiveCell.connectionX0 = divider.perpendicularOffset + positiveBoundaryOffset;
            }
        } else {
            if (negativeCell && Number.isFinite(negativeBoundaryOffset)) {
                negativeCell.connectionY1 = divider.perpendicularOffset + negativeBoundaryOffset;
            }
            if (positiveCell && Number.isFinite(positiveBoundaryOffset)) {
                positiveCell.connectionY0 = divider.perpendicularOffset + positiveBoundaryOffset;
            }
        }
    });

    cells.forEach(cell => {
        // x0/x1/y0/y1 remain the structural grid rectangle for every editable
        // topology, merged or unmerged.
        cell.width = Math.max(0, cell.structuralX1 - cell.structuralX0);
        cell.height = Math.max(0, cell.structuralY1 - cell.structuralY0);
        cell.centerX = (cell.structuralX0 + cell.structuralX1) / 2;
        cell.centerY = (cell.structuralY0 + cell.structuralY1) / 2;
        cell.x0 = cell.structuralX0;
        cell.x1 = cell.structuralX1;
        cell.y0 = cell.structuralY0;
        cell.y1 = cell.structuralY1;
        cell.connectionWidth = Math.max(0, cell.connectionX1 - cell.connectionX0);
        cell.connectionHeight = Math.max(0, cell.connectionY1 - cell.connectionY0);
        cell.connectionCenterX = (cell.connectionX0 + cell.connectionX1) / 2;
        cell.connectionCenterY = (cell.connectionY0 + cell.connectionY1) / 2;
    });

    const framePlacements = frameEdges.map(edge => {
        const hasNegativeJoint = edge.side === 'top' || edge.side === 'bottom'
            ? edge.start > minCol
            : edge.start > minRow;
        const hasPositiveJoint = edge.side === 'top' || edge.side === 'bottom'
            ? edge.end < maxCol
            : edge.end < maxRow;

        const localJointEnds = [];
        if (hasNegativeJoint) localJointEnds.push(localJointEndForFrameSide(edge.side, 'negative'));
        if (hasPositiveJoint) localJointEnds.push(localJointEndForFrameSide(edge.side, 'positive'));

        const structuralCell = structuralCellById.get(edge.cellId);
        const renderedCell = cellById.get(edge.cellId) || structuralCell;
        const isPartial = Boolean(edge.partial);

        if (edge.side === 'top' || edge.side === 'bottom') {
            const structuralPerpendicularOffset = Number.isFinite(Number(edge.coordinate))
                ? worldGridY(edge.coordinate)
                : (edge.side === 'bottom'
                    ? finiteNumber(structuralCell?.y0)
                    : finiteNumber(structuralCell?.y1));
            const structuralWorldStart = worldGridX(edge.start);
            const structuralWorldEnd = worldGridX(edge.end);
            const renderedWorldStart = worldFrameX(edge.start);
            const renderedWorldEnd = worldFrameX(edge.end);
            const cellHeight = Math.max(0, finiteNumber(structuralCell?.height));

            // Global outer-frame sides receive half of the removed-frame span;
            // internal/re-entrant sides stay on the reduced topology line so a
            // frame and perpendicular mullions share the same exact junction.
            let frameBoundary = Number.isFinite(Number(edge.coordinate))
                ? worldFrameY(edge.coordinate)
                : structuralPerpendicularOffset;

            // A partial perimeter segment exists after a merge removed only part
            // of a divider. On that mixed side, the reconstructed frame must use
            // the surviving divider's CAD seat so the sash/glazing bead stays in
            // contact with both parts of the boundary.
            if (isPartial && renderedCell) {
                const candidate = edge.side === 'bottom'
                    ? Number(renderedCell.connectionY0)
                    : Number(renderedCell.connectionY1);
                if (Number.isFinite(candidate)) frameBoundary = candidate;
            }
            const originY = edge.side === 'bottom'
                ? frameBoundary + cellHeight / 2
                : frameBoundary - cellHeight / 2;

            return Object.freeze({
                id: edge.id,
                side: edge.side,
                orientation: 'horizontal',
                perpendicularOffset: frameBoundary,
                worldStart: renderedWorldStart,
                worldEnd: renderedWorldEnd,
                structuralPerpendicularOffset,
                structuralWorldStart,
                structuralWorldEnd,
                partial: isPartial,
                width: Math.max(0, renderedWorldEnd - renderedWorldStart),
                height: cellHeight,
                originX: (renderedWorldStart + renderedWorldEnd) / 2,
                originY,
                windowCell: edge.cellId,
                cellType: edge.cellType,
                jointEnd: localJointEnds.length ? 'divider' : null,
                localJointEnd: localJointEnds.length === 1 ? localJointEnds[0] : null,
                localJointEnds: Object.freeze(localJointEnds),
                addCandidate: true,
            });
        }

        const structuralPerpendicularOffset = Number.isFinite(Number(edge.coordinate))
            ? worldGridX(edge.coordinate)
            : (edge.side === 'left'
                ? finiteNumber(structuralCell?.x0)
                : finiteNumber(structuralCell?.x1));
        const structuralWorldStart = worldGridY(edge.start);
        const structuralWorldEnd = worldGridY(edge.end);
        const renderedWorldStart = worldFrameY(edge.start);
        const renderedWorldEnd = worldFrameY(edge.end);
        const cellWidth = Math.max(0, finiteNumber(structuralCell?.width));
        let frameBoundary = Number.isFinite(Number(edge.coordinate))
            ? worldFrameX(edge.coordinate)
            : structuralPerpendicularOffset;
        if (isPartial && renderedCell) {
            const candidate = edge.side === 'left'
                ? Number(renderedCell.connectionX0)
                : Number(renderedCell.connectionX1);
            if (Number.isFinite(candidate)) frameBoundary = candidate;
        }
        const originX = edge.side === 'left'
            ? frameBoundary + cellWidth / 2
            : frameBoundary - cellWidth / 2;

        return Object.freeze({
            id: edge.id,
            side: edge.side,
            orientation: 'vertical',
            perpendicularOffset: frameBoundary,
            worldStart: renderedWorldStart,
            worldEnd: renderedWorldEnd,
            structuralPerpendicularOffset,
            structuralWorldStart,
            structuralWorldEnd,
            partial: isPartial,
            width: cellWidth,
            height: Math.max(0, renderedWorldEnd - renderedWorldStart),
            originX,
            originY: (renderedWorldStart + renderedWorldEnd) / 2,
            windowCell: edge.cellId,
            cellType: edge.cellType,
            jointEnd: localJointEnds.length ? 'divider' : null,
            localJointEnd: localJointEnds.length === 1 ? localJointEnds[0] : null,
            localJointEnds: Object.freeze(localJointEnds),
            addCandidate: true,
        });
    });

    const junctionMap = new Map();
    function registerEndpoint(divider, atStart) {
        const point = divider.orientation === 'vertical'
            ? { x: divider.perpendicularOffset, y: atStart ? divider.worldStart : divider.worldEnd }
            : { x: atStart ? divider.worldStart : divider.worldEnd, y: divider.perpendicularOffset };
        const key = `${point.x.toFixed(8)}|${point.y.toFixed(8)}`;
        const entry = junctionMap.get(key) || { key, x: point.x, y: point.y, endpoints: [] };
        entry.endpoints.push({ dividerId: divider.id, orientation: divider.orientation, atStart });
        junctionMap.set(key, entry);
    }
    dividerSegments.forEach(divider => {
        registerEndpoint(divider, true);
        registerEndpoint(divider, false);
    });

    const junctions = [...junctionMap.values()]
        .map(entry => {
            const vertical = entry.endpoints.filter(endpoint => endpoint.orientation === 'vertical');
            const horizontal = entry.endpoints.filter(endpoint => endpoint.orientation === 'horizontal');
            const isPerpendicularPair = entry.endpoints.length === 2
                && vertical.length === 1
                && horizontal.length === 1;
            const isMultiDividerJunction = entry.endpoints.length >= 3
                && vertical.length > 0
                && horizontal.length > 0;
            if (!isPerpendicularPair && !isMultiDividerJunction) return null;

            if (isPerpendicularPair) {
                return Object.freeze({
                    ...entry,
                    type: 'L',
                    hostOrientation: null,
                    branchOrientation: null,
                    endpoints: Object.freeze(entry.endpoints.map(endpoint => Object.freeze(endpoint))),
                });
            }

            const hostOrientation = vertical.length >= 2 ? 'vertical' : 'horizontal';
            return Object.freeze({
                ...entry,
                type: 'T',
                hostOrientation,
                branchOrientation: hostOrientation === 'vertical' ? 'horizontal' : 'vertical',
                endpoints: Object.freeze(entry.endpoints.map(endpoint => Object.freeze(endpoint))),
            });
        })
        .filter(Boolean);

    const frameEndpointMap = new Map();
    function registerFrameEndpoint(frame, atStart) {
        // Re-entrant topology is defined on the structural grid, even when a
        // complete row/column has been translated to a CAD join seat. Using
        // rendered frame coordinates here makes a partial merged-L frame appear
        // disconnected from the surviving mullion by exactly that seat offset.
        const structuralPerpendicularOffset = Number.isFinite(Number(frame.structuralPerpendicularOffset))
            ? Number(frame.structuralPerpendicularOffset)
            : frame.perpendicularOffset;
        const structuralWorldStart = Number.isFinite(Number(frame.structuralWorldStart))
            ? Number(frame.structuralWorldStart)
            : frame.worldStart;
        const structuralWorldEnd = Number.isFinite(Number(frame.structuralWorldEnd))
            ? Number(frame.structuralWorldEnd)
            : frame.worldEnd;
        const point = frame.orientation === 'vertical'
            ? {
                x: structuralPerpendicularOffset,
                y: atStart ? structuralWorldStart : structuralWorldEnd,
            }
            : {
                x: atStart ? structuralWorldStart : structuralWorldEnd,
                y: structuralPerpendicularOffset,
            };
        const key = `${point.x.toFixed(8)}|${point.y.toFixed(8)}`;
        const entry = frameEndpointMap.get(key) || { key, x: point.x, y: point.y, endpoints: [] };
        entry.endpoints.push({
            frameId: frame.id,
            orientation: frame.orientation,
            atStart,
            localEnd: localJointEndForFrameSide(
                frame.side,
                atStart ? 'negative' : 'positive'
            ),
            partial: Boolean(frame.partial),
            side: frame.side,
        });
        frameEndpointMap.set(key, entry);
    }
    framePlacements.forEach(frame => {
        registerFrameEndpoint(frame, true);
        registerFrameEndpoint(frame, false);
    });

    const perimeterJunctions = [...junctionMap.values()]
        .map(dividerEntry => {
            // The merged-L re-entrant point has exactly one surviving divider,
            // one newly reconstructed frame continuing that divider, and one
            // perpendicular perimeter frame around the missing quadrant.
            if (dividerEntry.endpoints.length !== 1) return null;
            const frameEntry = frameEndpointMap.get(dividerEntry.key);
            if (!frameEntry || frameEntry.endpoints.length !== 2) return null;

            const dividerEndpoint = dividerEntry.endpoints[0];
            const hostCandidates = frameEntry.endpoints.filter(endpoint =>
                endpoint.orientation === dividerEndpoint.orientation
                && endpoint.partial
            );
            const branchCandidates = frameEntry.endpoints.filter(endpoint =>
                endpoint.orientation !== dividerEndpoint.orientation
            );
            if (hostCandidates.length !== 1 || branchCandidates.length !== 1) return null;

            return Object.freeze({
                key: dividerEntry.key,
                x: dividerEntry.x,
                y: dividerEntry.y,
                type: 'perimeter-T',
                hostOrientation: dividerEndpoint.orientation,
                branchOrientation: branchCandidates[0].orientation,
                dividerEndpoint: Object.freeze({ ...dividerEndpoint }),
                hostFrameEndpoint: Object.freeze({ ...hostCandidates[0] }),
                branchFrameEndpoint: Object.freeze({ ...branchCandidates[0] }),
            });
        })
        .filter(Boolean);

    return Object.freeze({
        cells: Object.freeze(cells.map(cell => Object.freeze({
            ...cell,
            dividerJoinSideByBoundary: Object.freeze({ ...cell.dividerJoinSideByBoundary }),
        }))),
        framePlacements: Object.freeze(framePlacements),
        dividerSegments: Object.freeze(dividerSegments.map(divider => Object.freeze(divider))),
        junctions: Object.freeze(junctions),
        perimeterJunctions: Object.freeze(perimeterJunctions),
    });
}
