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

export function getEditableWindowTopologyGeometry({
    width,
    height,
    topology,
} = {}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const windows = Array.isArray(topology?.windows) ? topology.windows : [];
    const dividers = Array.isArray(topology?.dividers) ? topology.dividers : [];
    const frameEdges = Array.isArray(topology?.frameEdges) ? topology.frameEdges : [];

    const minCol = windows.length ? Math.min(...windows.map(c => c.rect.x0)) : 0;
    const maxCol = windows.length ? Math.max(...windows.map(c => c.rect.x1)) : 1;
    const minRow = windows.length ? Math.min(...windows.map(c => c.rect.y0)) : 0;
    const maxRow = windows.length ? Math.max(...windows.map(c => c.rect.y1)) : 1;
    const totalWidth = (maxCol - minCol) * normalizedWidth;
    const totalHeight = (maxRow - minRow) * normalizedHeight;

    const cells = windows.map(cell => {
        const x0 = gridToWorldX(cell.rect.x0, minCol, totalWidth, normalizedWidth);
        const x1 = gridToWorldX(cell.rect.x1, minCol, totalWidth, normalizedWidth);
        const y0 = gridToWorldY(cell.rect.y0, minRow, totalHeight, normalizedHeight);
        const y1 = gridToWorldY(cell.rect.y1, minRow, totalHeight, normalizedHeight);
        return Object.freeze({
            id: cell.id,
            cellType: cell.type,
            handleSide: cell.handleSide || null,
            x0,
            x1,
            y0,
            y1,
            width: Math.max(0, x1 - x0),
            height: Math.max(0, y1 - y0),
            centerX: (x0 + x1) / 2,
            centerY: (y0 + y1) / 2,
            dividerJoinSideByBoundary: {},
        });
    });
    const cellById = new Map(cells.map(cell => [cell.id, cell]));

    const dividerSegments = dividers.map(divider => {
        if (divider.orientation === 'vertical') {
            const x = gridToWorldX(divider.coordinate, minCol, totalWidth, normalizedWidth);
            const y0 = gridToWorldY(divider.start, minRow, totalHeight, normalizedHeight);
            const y1 = gridToWorldY(divider.end, minRow, totalHeight, normalizedHeight);
            return {
                ...divider,
                perpendicularOffset: x,
                longitudinalOffset: (y0 + y1) / 2,
                length: Math.max(0, y1 - y0),
                worldStart: y0,
                worldEnd: y1,
            };
        }
        const y = gridToWorldY(divider.coordinate, minRow, totalHeight, normalizedHeight);
        const x0 = gridToWorldX(divider.start, minCol, totalWidth, normalizedWidth);
        const x1 = gridToWorldX(divider.end, minCol, totalWidth, normalizedWidth);
        return {
            ...divider,
            perpendicularOffset: y,
            longitudinalOffset: (x0 + x1) / 2,
            length: Math.max(0, x1 - x0),
            worldStart: x0,
            worldEnd: x1,
        };
    });

    // Record which local boundary of each cell meets each divider segment.
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
    });

    const framePlacements = frameEdges.map(edge => {
        const hasNegativeJoint = edge.side === 'top' || edge.side === 'bottom' ? edge.start > minCol : edge.start > minRow;
        const hasPositiveJoint = edge.side === 'top' || edge.side === 'bottom' ? edge.end < maxCol : edge.end < maxRow;
        
        const localJointEnds = [];
        if (hasNegativeJoint) localJointEnds.push(localJointEndForFrameSide(edge.side, 'negative'));
        if (hasPositiveJoint) localJointEnds.push(localJointEndForFrameSide(edge.side, 'positive'));

        const cell = cells.find(c => c.id === edge.cellId);

        if (edge.side === 'top' || edge.side === 'bottom') {
            const x0 = gridToWorldX(edge.start, minCol, totalWidth, normalizedWidth);
            const x1 = gridToWorldX(edge.end, minCol, totalWidth, normalizedWidth);
            return Object.freeze({
                id: edge.id,
                side: edge.side,
                width: Math.max(0, x1 - x0),
                height: normalizedHeight,
                originX: (x0 + x1) / 2,
                originY: cell.centerY,
                windowCell: edge.cellId,
                cellType: edge.cellType,
                jointEnd: localJointEnds.length ? 'divider' : null,
                localJointEnd: localJointEnds.length === 1 ? localJointEnds[0] : null,
                localJointEnds: Object.freeze(localJointEnds),
                addCandidate: true,
            });
        }
        const y0 = gridToWorldY(edge.start, minRow, totalHeight, normalizedHeight);
        const y1 = gridToWorldY(edge.end, minRow, totalHeight, normalizedHeight);
        return Object.freeze({
            id: edge.id,
            side: edge.side,
            width: normalizedWidth,
            height: Math.max(0, y1 - y0),
            originX: cell.centerX,
            originY: (y0 + y1) / 2,
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
        .filter(entry => entry.endpoints.length >= 3)
        .map(entry => {
            const vertical = entry.endpoints.filter(endpoint => endpoint.orientation === 'vertical');
            const horizontal = entry.endpoints.filter(endpoint => endpoint.orientation === 'horizontal');
            const hostOrientation = vertical.length >= 2 ? 'vertical' : 'horizontal';
            return Object.freeze({
                ...entry,
                type: 'T',
                hostOrientation,
                branchOrientation: hostOrientation === 'vertical' ? 'horizontal' : 'vertical',
                endpoints: Object.freeze(entry.endpoints.map(endpoint => Object.freeze(endpoint))),
            });
        });

    return Object.freeze({
        cells: Object.freeze(cells.map(cell => Object.freeze({
            ...cell,
            dividerJoinSideByBoundary: Object.freeze({ ...cell.dividerJoinSideByBoundary }),
        }))),
        framePlacements: Object.freeze(framePlacements),
        dividerSegments: Object.freeze(dividerSegments.map(divider => Object.freeze(divider))),
        junctions: Object.freeze(junctions),
    });
}
