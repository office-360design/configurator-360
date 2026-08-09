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
