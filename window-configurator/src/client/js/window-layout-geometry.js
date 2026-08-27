const MM_TO_M = 0.001;
export const INTERSECTION_HOST_INNER_FACE_M = 0.025;
export const INTERSECTION_MULLION_END_NOTCH_DEPTH_M = 0.005;
export const INTERSECTION_MULLION_END_NOTCH_LENGTH_M = 0.025;
// 88 / 2 - 25 = 19 mm for the active 575800 mullion + 575760 frame join.
export const RECTANGULAR_DIVIDER_SETBACK_M = 0.044 - INTERSECTION_HOST_INNER_FACE_M;

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRectangularDividerSetback({
    dividerFaceSpan = 0,
    hostInnerFaceSpan = INTERSECTION_HOST_INNER_FACE_M,
} = {}) {
    const halfDividerFace = Math.max(0, finiteNumber(dividerFaceSpan)) / 2;
    const normalizedHostInnerFaceSpan = Math.max(0, finiteNumber(hostInnerFaceSpan));
    return Math.max(0, halfDividerFace - normalizedHostInnerFaceSpan);
}

export function getRectangularDividerEndNotchInset({
    sectionDepthFromOuterFace = 0,
    notchDepth = INTERSECTION_MULLION_END_NOTCH_DEPTH_M,
    notchLength = INTERSECTION_MULLION_END_NOTCH_LENGTH_M,
} = {}) {
    const normalizedNotchDepth = Math.max(0, finiteNumber(notchDepth));
    const normalizedNotchLength = Math.max(0, finiteNumber(notchLength));
    // The end machining is an L-shaped notch seen from the side of the
    // mullion: remove 25 mm of longitudinal stock only from the outermost
    // 5 mm flange. The rest of the mullion cross-section keeps the normal
    // square endpoint 19 mm away from the structural grid vertex.
    return finiteNumber(sectionDepthFromOuterFace) <= normalizedNotchDepth + 1e-9
        ? normalizedNotchLength
        : 0;
}


const PHYSICAL_ARM_DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west']);
const OPPOSITE_ARM_DIRECTION = Object.freeze({
    north: 'south',
    east: 'west',
    south: 'north',
    west: 'east',
});

function physicalJunctionKey(x, y) {
    return `${finiteNumber(x).toFixed(8)}|${finiteNumber(y).toFixed(8)}`;
}

function endpointArmDirection(orientation, atStart) {
    if (orientation === 'vertical') return atStart ? 'north' : 'south';
    return atStart ? 'east' : 'west';
}

function perpendicularArmDirections(direction) {
    return direction === 'north' || direction === 'south'
        ? ['east', 'west']
        : ['north', 'south'];
}

function getPhysicalArm(junction, direction) {
    return junction?.arms?.[direction] || null;
}

function armDirectionVector(direction) {
    if (direction === 'north') return Object.freeze({ x: 0, y: 1 });
    if (direction === 'south') return Object.freeze({ x: 0, y: -1 });
    if (direction === 'east') return Object.freeze({ x: 1, y: 0 });
    if (direction === 'west') return Object.freeze({ x: -1, y: 0 });
    return Object.freeze({ x: 0, y: 0 });
}

export function getReentrantFillerTriangle({
    filler,
    dividerFaceSpan = 0,
} = {}) {
    if (!filler) return Object.freeze([]);
    const halfFace = Math.max(0, finiteNumber(dividerFaceSpan)) / 2;
    if (halfFace <= 0) return Object.freeze([]);

    const extrusion = armDirectionVector(filler.extrusionDirection);
    const missing = armDirectionVector(filler.direction);
    if (
        (!extrusion.x && !extrusion.y)
        || (!missing.x && !missing.y)
    ) {
        return Object.freeze([]);
    }

    // This is the literal front-view opening left by the missing half of the
    // mullion at a merged-L re-entrant junction. It is NOT a short mullion in
    // the missing direction, and it must not overlap either neighbouring frame.
    //
    // The two existing 45-degree cuts already define the sides of the hole:
    // one side comes from the frame and the other from the surviving mullion.
    // Therefore the filler is the triangle BETWEEN those two cuts. Starting at
    // the common V apex, move half a mullion face toward the merged window,
    // then half a face in both directions parallel to the surviving mullion.
    // Those two shoulders lie exactly on the existing cut edges.
    //
    // Top-row merge example (missing north):
    //
    //        left shoulder -------- right shoulder
    //             \                    /
    //              \                  /
    //               \                /
    //                       apex
    //
    // For the 88 mm mullion this is an 88 mm-wide mouth, 44 mm above the
    // apex. Crucially, there is no extra triangle on the frame side.
    const apex = Object.freeze({
        x: finiteNumber(filler.apexX),
        y: finiteNumber(filler.apexY),
    });
    const mouthCenter = Object.freeze({
        x: apex.x + missing.x * halfFace,
        y: apex.y + missing.y * halfFace,
    });
    const firstShoulder = Object.freeze({
        x: mouthCenter.x + extrusion.x * halfFace,
        y: mouthCenter.y + extrusion.y * halfFace,
    });
    const secondShoulder = Object.freeze({
        x: mouthCenter.x - extrusion.x * halfFace,
        y: mouthCenter.y - extrusion.y * halfFace,
    });

    return Object.freeze([apex, firstShoulder, secondShoulder]);
}

export function getHalfFrameTriangle({
    filler,
    frameReferenceSpan = 0,
} = {}) {
    if (!filler) return Object.freeze([]);
    const span = Math.max(0, finiteNumber(frameReferenceSpan));
    if (span <= 0) return Object.freeze([]);

    const outward = armDirectionVector(filler.direction);
    const tangent = filler.orientation === 'horizontal'
        ? Object.freeze({ x: 1, y: 0 })
        : (filler.orientation === 'vertical'
            ? Object.freeze({ x: 0, y: 1 })
            : Object.freeze({ x: 0, y: 0 }));
    if ((!outward.x && !outward.y) || (!tangent.x && !tangent.y)) {
        return Object.freeze([]);
    }

    // A normal perimeter T has two collinear frame pieces meeting a centred
    // mullion. The asymmetric frame reference sits `span` outside the grid
    // vertex (21 mm for the active frame/mullion pair). That outer 45-degree
    // triangle must be owned exactly once instead of being repeated by both
    // neighbouring frame pieces.
    //
    // The half-frame therefore has its apex on the structural grid vertex and
    // its two shoulders on the physical outer-frame boundary, one `span` to
    // either side along the host frame. This is a literal 45-degree triangle:
    // base = 2 * span, height = span.
    const apex = Object.freeze({
        x: finiteNumber(filler.apexX),
        y: finiteNumber(filler.apexY),
    });
    const baseCenter = Object.freeze({
        x: apex.x + outward.x * span,
        y: apex.y + outward.y * span,
    });
    const firstShoulder = Object.freeze({
        x: baseCenter.x + tangent.x * span,
        y: baseCenter.y + tangent.y * span,
    });
    const secondShoulder = Object.freeze({
        x: baseCenter.x - tangent.x * span,
        y: baseCenter.y - tangent.y * span,
    });

    return Object.freeze([apex, firstShoulder, secondShoulder]);
}


export function getInsideHalfFrameTriangle({
    filler,
    frameReferenceSpan = 0,
} = {}) {
    if (!filler) return Object.freeze([]);
    const span = Math.max(0, finiteNumber(frameReferenceSpan));
    if (span <= 0) return Object.freeze([]);

    const outward = armDirectionVector(filler.direction);
    const tangent = filler.orientation === 'horizontal'
        ? Object.freeze({ x: 1, y: 0 })
        : (filler.orientation === 'vertical'
            ? Object.freeze({ x: 0, y: 1 })
            : Object.freeze({ x: 0, y: 0 }));
    if ((!outward.x && !outward.y) || (!tangent.x && !tangent.y)) {
        return Object.freeze([]);
    }

    // The inner half-frame is the mirror of the older outer half-frame: its
    // apex remains on the structural grid vertex, but its base lies INSIDE the
    // assembly instead of outside the perimeter. This is the small triangular
    // transition between the straight host frame and the rectangular mullion
    // branch that starts slightly away from the grid.
    const apex = Object.freeze({
        x: finiteNumber(filler.apexX),
        y: finiteNumber(filler.apexY),
    });
    const baseCenter = Object.freeze({
        x: apex.x - outward.x * span,
        y: apex.y - outward.y * span,
    });
    const firstShoulder = Object.freeze({
        x: baseCenter.x + tangent.x * span,
        y: baseCenter.y + tangent.y * span,
    });
    const secondShoulder = Object.freeze({
        x: baseCenter.x - tangent.x * span,
        y: baseCenter.y - tangent.y * span,
    });

    return Object.freeze([apex, firstShoulder, secondShoulder]);
}

export function getHalfMullionTriangle({
    filler,
    triangleSpan = 0,
} = {}) {
    if (!filler) return Object.freeze([]);
    const span = Math.max(0, finiteNumber(triangleSpan));
    if (span <= 0) return Object.freeze([]);

    const outward = armDirectionVector(filler.direction);
    const tangent = filler.orientation === 'horizontal'
        ? Object.freeze({ x: 1, y: 0 })
        : (filler.orientation === 'vertical'
            ? Object.freeze({ x: 0, y: 1 })
            : Object.freeze({ x: 0, y: 0 }));
    if ((!outward.x && !outward.y) || (!tangent.x && !tangent.y)) {
        return Object.freeze([]);
    }

    // This is the same triangular ownership pattern as a half-frame, but on a
    // centred mullion/transom host. It occupies only the branch-facing half of
    // the host line while the added rectangular mullion branch begins further
    // away from the grid vertex.
    const apex = Object.freeze({
        x: finiteNumber(filler.apexX),
        y: finiteNumber(filler.apexY),
    });
    const baseCenter = Object.freeze({
        x: apex.x + outward.x * span,
        y: apex.y + outward.y * span,
    });
    const firstShoulder = Object.freeze({
        x: baseCenter.x + tangent.x * span,
        y: baseCenter.y + tangent.y * span,
    });
    const secondShoulder = Object.freeze({
        x: baseCenter.x - tangent.x * span,
        y: baseCenter.y - tangent.y * span,
    });

    return Object.freeze([apex, firstShoulder, secondShoulder]);
}

export function getFrameInsideHalfFrameInset({
    inwardDistance,
    frameInwardSpan = 0,
    halfFrameSpan = RECTANGULAR_DIVIDER_SETBACK_M,
} = {}) {
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const normalizedHalfFrameSpan = Math.min(
        normalizedFrameInwardSpan,
        Math.max(0, finiteNumber(halfFrameSpan, RECTANGULAR_DIVIDER_SETBACK_M))
    );

    // The outer part of the host frame stays continuous. Only the INNER band,
    // nearest the glazing, opens linearly toward the structural grid vertex to
    // create the separate inside half-frame triangle.
    const straightSpan = Math.max(0, normalizedFrameInwardSpan - normalizedHalfFrameSpan);
    if (normalizedInwardDistance <= straightSpan) return 0;
    return Math.min(
        normalizedHalfFrameSpan,
        normalizedInwardDistance - straightSpan
    );
}

function hasWindowAcrossMissingReentrantDirection({ junction, cells, direction }) {
    const epsilon = 1e-9;
    const x = finiteNumber(junction?.x);
    const y = finiteNumber(junction?.y);
    const candidates = Array.isArray(cells) ? cells : [];

    // The filler is only valid when the missing physical arm is not actually
    // empty exterior space, but lies inside one merged window that spans across
    // the old divider line. This is exactly the topology created when one side
    // of an L is merged. Keeping this check explicit prevents a small mullion
    // cap from being emitted at an ordinary exposed perimeter T.
    if (direction === 'north') {
        return candidates.some(cell => (
            Math.abs(finiteNumber(cell.structuralY0) - y) <= epsilon
            && finiteNumber(cell.structuralX0) < x - epsilon
            && finiteNumber(cell.structuralX1) > x + epsilon
        ));
    }
    if (direction === 'south') {
        return candidates.some(cell => (
            Math.abs(finiteNumber(cell.structuralY1) - y) <= epsilon
            && finiteNumber(cell.structuralX0) < x - epsilon
            && finiteNumber(cell.structuralX1) > x + epsilon
        ));
    }
    if (direction === 'east') {
        return candidates.some(cell => (
            Math.abs(finiteNumber(cell.structuralX0) - x) <= epsilon
            && finiteNumber(cell.structuralY0) < y - epsilon
            && finiteNumber(cell.structuralY1) > y + epsilon
        ));
    }
    if (direction === 'west') {
        return candidates.some(cell => (
            Math.abs(finiteNumber(cell.structuralX1) - x) <= epsilon
            && finiteNumber(cell.structuralY0) < y - epsilon
            && finiteNumber(cell.structuralY1) > y + epsilon
        ));
    }
    return false;
}

function hasFloatingTransAlongMissingDirection({ junction, transSegments, direction }) {
    const epsilon = 1e-9;
    const x = finiteNumber(junction?.x);
    const y = finiteNumber(junction?.y);
    const candidates = Array.isArray(transSegments) ? transSegments : [];

    return candidates.some(segment => {
        const orientation = segment?.orientation;
        const perpendicular = finiteNumber(
            segment?.structuralPerpendicularOffset,
            segment?.perpendicularOffset
        );
        const start = finiteNumber(segment?.structuralWorldStart, segment?.worldStart);
        const end = finiteNumber(segment?.structuralWorldEnd, segment?.worldEnd);

        if (orientation === 'vertical' && Math.abs(perpendicular - x) <= epsilon) {
            if (direction === 'north') {
                return Math.abs(start - y) <= epsilon && end > y + epsilon;
            }
            if (direction === 'south') {
                return Math.abs(end - y) <= epsilon && start < y - epsilon;
            }
        }

        if (orientation === 'horizontal' && Math.abs(perpendicular - y) <= epsilon) {
            if (direction === 'east') {
                return Math.abs(start - x) <= epsilon && end > x + epsilon;
            }
            if (direction === 'west') {
                return Math.abs(end - x) <= epsilon && start < x - epsilon;
            }
        }

        return false;
    });
}

function getMixedReentrantTDividerArm(junction) {
    if (
        junction?.type !== 'T'
        || junction?.dividerCount !== 1
        || junction?.frameCount !== 2
    ) {
        return null;
    }

    const dividerArm = junction.activeDirections
        .map(direction => junction.arms?.[direction])
        .find(arm => arm?.kind === 'divider') || null;
    if (!dividerArm) return null;

    const missingDirection = PHYSICAL_ARM_DIRECTIONS.find(
        direction => !junction.arms?.[direction]
    ) || null;

    // A normal divider terminating at the outside perimeter also has one
    // divider + two frames, but its missing arm is collinear with the divider.
    // The special re-entrant case created by merging an L has the missing arm
    // perpendicular to the divider: e.g. west frame + south frame + east
    // mullion, with north missing. Only that concave three-arm corner needs the
    // CAD 21 mm offset.
    const missingIsPerpendicular = dividerArm.orientation === 'horizontal'
        ? missingDirection === 'north' || missingDirection === 'south'
        : missingDirection === 'east' || missingDirection === 'west';
    if (!missingIsPerpendicular) return null;

    return Object.freeze({ dividerArm, missingDirection });
}

function isInteriorLMixedPlusJunction(junction) {
    if (!junction) return false;

    // At the four-arm centre of an L, two adjacent arms are asymmetric outer
    // frames and the other two adjacent arms are centred mullions. All four
    // terminate at the SAME grid apex. The frame ends are therefore not square
    // and not one simple 45-degree miter: they form a 90-degree V made from two
    // 45-degree faces, matching the mullion V around the common vertex.
    if (
        junction.type !== 'plus'
        || junction.frameCount !== 2
        || junction.dividerCount !== 2
    ) {
        return false;
    }

    const frameDirections = junction.activeDirections.filter(
        direction => junction.arms?.[direction]?.kind === 'frame'
    );
    if (frameDirections.length !== 2) return false;

    // The L centre has the two frame arms perpendicular/adjacent. Collinear
    // frame arms belong to other + configurations and keep their own logic.
    return OPPOSITE_ARM_DIRECTION[frameDirections[0]] !== frameDirections[1];
}

function getNormalPerimeterTHalfFrameInfo(junction) {
    if (
        junction?.type !== 'T'
        || junction?.dividerCount !== 1
        || junction?.frameCount !== 2
        || !junction?.hostOrientation
    ) {
        return null;
    }

    const dividerArm = junction.activeDirections
        .map(direction => junction.arms?.[direction])
        .find(arm => arm?.kind === 'divider') || null;
    if (!dividerArm) return null;

    const missingDirection = PHYSICAL_ARM_DIRECTIONS.find(
        direction => !junction.arms?.[direction]
    ) || null;
    if (!missingDirection) return null;

    // Only the ordinary outside-perimeter T gets a half-frame. Its missing arm
    // is the outward continuation of the terminating mullion. A merged-L
    // re-entrant T has the missing direction perpendicular to the mullion and
    // is handled by the existing half-mullion filler instead.
    if (OPPOSITE_ARM_DIRECTION[dividerArm.direction] !== missingDirection) {
        return null;
    }

    const frameArms = junction.activeDirections
        .map(direction => junction.arms?.[direction])
        .filter(arm => arm?.kind === 'frame');
    if (frameArms.length !== 2) return null;
    const side = frameArms[0].side || null;
    if (!side || frameArms.some(arm => arm.side !== side)) return null;

    return Object.freeze({
        dividerArm,
        frameArms: Object.freeze(frameArms),
        missingDirection,
        side,
    });
}

function classifyPhysicalJunction(entry) {
    const arms = entry.arms;
    const activeDirections = PHYSICAL_ARM_DIRECTIONS.filter(direction => Boolean(arms[direction]));
    const armList = activeDirections.map(direction => arms[direction]);
    const dividerArms = armList.filter(arm => arm.kind === 'divider');
    const frameArms = armList.filter(arm => arm.kind === 'frame');
    const horizontalDirections = activeDirections.filter(direction => direction === 'east' || direction === 'west');
    const verticalDirections = activeDirections.filter(direction => direction === 'north' || direction === 'south');

    let type = 'endpoint';
    let hostOrientation = null;
    let branchOrientation = null;

    if (activeDirections.length === 4) {
        if (dividerArms.length === 4) {
            // Four mullion/transom arms need one deterministic host axis. This
            // preserves the verified T-style socket/arrow mesh at a full cross.
            type = 'cross';
            hostOrientation = 'vertical';
            branchOrientation = 'horizontal';
        } else {
            // A mixed perimeter + is a symmetric four-way CAD joint. Each
            // mullion/transom arm meets the ordinary 45-degree miter of the
            // collinear frame arm using the same frame/mullion cross-section
            // relationship that is already correct at a normal divider-to-frame
            // termination. Do not invent a vertical host/horizontal branch here:
            // that aligns one mullion centre plane with a frame endpoint and
            // makes the result depend on which way the L is rotated.
            type = 'plus';
            hostOrientation = null;
            branchOrientation = null;
        }
    } else if (activeDirections.length === 3) {
        type = 'T';
        const hasHorizontalPair = Boolean(arms.east && arms.west);
        const hasVerticalPair = Boolean(arms.north && arms.south);
        hostOrientation = hasHorizontalPair ? 'horizontal' : (hasVerticalPair ? 'vertical' : null);
        branchOrientation = hostOrientation === 'horizontal'
            ? 'vertical'
            : (hostOrientation === 'vertical' ? 'horizontal' : null);
    } else if (activeDirections.length === 2) {
        const first = activeDirections[0];
        const second = activeDirections[1];
        const collinear = OPPOSITE_ARM_DIRECTION[first] === second;
        if (!collinear && dividerArms.length === 2) {
            // Backward-compatible fallback for incomplete/test topology that
            // provides only the two perpendicular dividers. Real derived L
            // layouts also contain the two frame continuations and classify as
            // a four-arm `plus` instead.
            type = 'L';
        } else {
            type = collinear ? 'continuation' : 'corner';
        }
    }

    const dividerEndpoints = dividerArms.map(arm => Object.freeze({
        dividerId: arm.segmentId,
        orientation: arm.orientation,
        atStart: arm.atStart,
        direction: arm.direction,
    }));
    const frameEndpoints = frameArms.map(arm => Object.freeze({
        frameId: arm.segmentId,
        orientation: arm.orientation,
        atStart: arm.atStart,
        localEnd: arm.localEnd,
        partial: Boolean(arm.partial),
        side: arm.side,
        direction: arm.direction,
    }));

    return Object.freeze({
        key: entry.key,
        x: entry.x,
        y: entry.y,
        type,
        hostOrientation,
        branchOrientation,
        arms: Object.freeze({ ...arms }),
        activeDirections: Object.freeze(activeDirections),
        endpoints: Object.freeze(dividerEndpoints),
        frameEndpoints: Object.freeze(frameEndpoints),
        dividerCount: dividerArms.length,
        frameCount: frameArms.length,
        horizontalArmCount: horizontalDirections.length,
        verticalArmCount: verticalDirections.length,
    });
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



export function getFrameDividerMiterContactStart({
    dividerFaceSpan,
    frameInwardSpan = 0,
} = {}) {
    const halfDividerFace = Math.max(0, finiteNumber(dividerFaceSpan)) / 2;
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));

    // CAD cross-section relation used by both a normal frame/mullion end and
    // the re-entrant mixed +. The mullion face is symmetric about its centre.
    // Its half face occupies the inner part of the outer-frame section; the
    // remaining outer-frame depth stays in the ordinary frame/frame 45-degree
    // corner. Example from the active 575760/575800 CAD geometry:
    // 65 mm frame inward span - 88/2 mm mullion face = 21 mm.
    return Math.max(0, normalizedFrameInwardSpan - halfDividerFace);
}

export function getFrameGridMiterInset({
    inwardDistance,
    dividerFaceSpan,
    frameInwardSpan = 0,
} = {}) {
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const contactStart = getFrameDividerMiterContactStart({
        dividerFaceSpan,
        frameInwardSpan,
    });

    // The frame's physical boundary is offset normal to the grid line by
    // `contactStart`. A 45-degree cut through the grid vertex therefore has the
    // same signed tangential offset: outer edge extends by contactStart, the
    // reference point is zero, and the inner edge retracts by half the mullion
    // face. For 65/88 mm this is -21, 0, +44 mm at 0/21/65 mm inward.
    return normalizedInwardDistance - contactStart;
}

export function getFrameMixedPlusMiterInset({
    inwardDistance,
    dividerFaceSpan,
    frameInwardSpan = 0,
} = {}) {
    const normalizedFrameSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const contactStart = getFrameDividerMiterContactStart({
        dividerFaceSpan,
        frameInwardSpan: normalizedFrameSpan,
    });

    // At the four-arm mixed frame+mullion + used by an L centre, the two
    // asymmetric frame arms and two centred mullion arms must share ONE grid
    // apex. The 21 mm frame reference offset still selects the apex across the
    // frame section, but it must not extend the frame longitudinally beyond the
    // grid vertex. Therefore both faces of the frame's 90-degree V retract from
    // the endpoint and meet at zero inset exactly at `contactStart`.
    //
    // Active 65/88 mm example:
    //   inward  0 mm -> retract 21 mm
    //   inward 21 mm -> apex on grid vertex
    //   inward 65 mm -> retract 44 mm
    return Math.abs(normalizedInwardDistance - contactStart);
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
    const straightContactSpan = getFrameDividerMiterContactStart({
        dividerFaceSpan,
        frameInwardSpan: normalizedFrameInwardSpan,
    });
    const diagonalInwardDistance = Math.max(
        0,
        normalizedInwardDistance - straightContactSpan
    );

    return Math.min(diagonalInwardDistance, halfDividerFace);
}

export function getFrameHalfFrameSocketInset({
    inwardDistance,
    dividerFaceSpan,
    frameInwardSpan = 0,
} = {}) {
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const halfDividerFace = Math.max(0, finiteNumber(dividerFaceSpan)) / 2;
    const normalizedFrameInwardSpan = Math.max(0, finiteNumber(frameInwardSpan));
    const straightContactSpan = getFrameDividerMiterContactStart({
        dividerFaceSpan,
        frameInwardSpan: normalizedFrameInwardSpan,
    });

    // Partition a normal perimeter T into three non-overlapping owners:
    //   frame | half-frame | frame  (outside the grid vertex)
    // and keep the existing mullion V socket on the inside.
    //
    // At the physical outer edge the two host frames stop `straightContactSpan`
    // away from the centre, leaving the 42 x 21 mm half-frame triangle. At the
    // grid vertex they meet at zero gap. Deeper than the vertex the same 45°
    // socket opens toward the mullion face exactly as before.
    if (normalizedInwardDistance <= straightContactSpan) {
        return straightContactSpan - normalizedInwardDistance;
    }
    return Math.min(
        normalizedInwardDistance - straightContactSpan,
        halfDividerFace
    );
}

export function getFrameShiftedDividerSocketInset({
    inwardDistance,
    dividerFaceSpan,
    frameInwardSpan = 0,
    centerShift = 0,
    localEnd = 'positive',
} = {}) {
    const normalizedInwardDistance = Math.max(0, finiteNumber(inwardDistance));
    const straightContactSpan = getFrameDividerMiterContactStart({
        dividerFaceSpan,
        frameInwardSpan,
    });
    const diagonalInset = getFrameDividerSocketInset({
        inwardDistance: normalizedInwardDistance,
        dividerFaceSpan,
        frameInwardSpan,
    });
    const normalizedCenterShift = finiteNumber(centerShift);

    // A mullion that was shifted by the mixed re-entrant + stays straight all
    // the way to the opposite outside frame. The outer frame seam itself must
    // remain on the structural window boundary so adjacent windows keep the
    // exact same slider size. Therefore the socket centre moves gradually from
    // zero at the outer edge to the shifted mullion centre at the 21 mm CAD
    // contact point, then the normal V opens around that shifted centre.
    //
    // For the active 65/88 mm pair and +21 mm shift:
    //   inward 0  -> seam remains at 0
    //   inward 21 -> common apex is at +21
    //   inward 65 -> socket edges are -23 / +65, exactly the shifted
    //                mullion faces (+21 +/- 44)
    const ramp = straightContactSpan > 1e-12
        ? Math.min(1, normalizedInwardDistance / straightContactSpan)
        : 1;
    const shiftedCenter = normalizedCenterShift * ramp;

    return localEnd === 'negative'
        ? diagonalInset + shiftedCenter
        : diagonalInset - shiftedCenter;
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
    negativeArrowFaceBias = 0,
    positiveArrowFaceBias = 0,
    socketInwardDistance = 0,
    negativeSocketInwardDistance = null,
    positiveSocketInwardDistance = null,
}) {
    const normalizedLength = Math.max(0, finiteNumber(length));
    const normalizedFaceSpan = Math.max(0, finiteNumber(faceSpan));
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
    const normalizedFaceOffset = finiteNumber(faceOffset);
    const normalizedNegativeArrowFaceBias = finiteNumber(negativeArrowFaceBias);
    const normalizedPositiveArrowFaceBias = finiteNumber(positiveArrowFaceBias);
    const normalizedT = Math.min(1, Math.max(0, finiteNumber(extrusionT)));
    const normalizedSocketInwardDistance = Math.max(
        0,
        finiteNumber(socketInwardDistance)
    );
    const normalizeEndSocketInwardDistance = value => {
        if (value === null || value === undefined || value === '') {
            return normalizedSocketInwardDistance;
        }
        return Math.max(0, finiteNumber(value));
    };
    const normalizedNegativeSocketInwardDistance = normalizeEndSocketInwardDistance(
        negativeSocketInwardDistance
    );
    const normalizedPositiveSocketInwardDistance = normalizeEndSocketInwardDistance(
        positiveSocketInwardDistance
    );

    const getEndInset = (
        mode,
        endFrameInwardSpan,
        arrowFaceBias,
        endSocketInwardDistance
    ) => {
        if (mode === 'socket') {
            return getFrameDividerSocketInset({
                inwardDistance: endSocketInwardDistance,
                dividerFaceSpan: normalizedFaceSpan,
                frameInwardSpan: endFrameInwardSpan,
            });
        }
        if (mode === 'square') return 0;
        const straightContactSpan = getFrameDividerMiterContactStart({
            dividerFaceSpan: normalizedFaceSpan,
            frameInwardSpan: endFrameInwardSpan,
        });
        const tipInset = Math.min(straightContactSpan, normalizedLength / 2);
        // A mixed perimeter + can place the physical mullion body off the
        // structural frame corner. In that case the V apex is biased across the
        // mullion face by the exact opposite amount so the cut still passes
        // through the structural + point. With zero bias this reduces exactly to
        // the original symmetric abs(faceOffset) arrow.
        const faceDistance = Math.abs(normalizedFaceOffset - arrowFaceBias);
        return tipInset + faceDistance;
    };

    const lowerEnd = -normalizedLength / 2 + getEndInset(
        negativeEndMode,
        negativeEndFrameInwardSpan,
        normalizedNegativeArrowFaceBias,
        normalizedNegativeSocketInwardDistance
    );
    const upperEnd = normalizedLength / 2 - getEndInset(
        positiveEndMode,
        positiveEndFrameInwardSpan,
        normalizedPositiveArrowFaceBias,
        normalizedPositiveSocketInwardDistance
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

function buildTrackAxisMapper(rawTracks, minCoordinate, maxCoordinate) {
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [])
        .map(track => ({
            start: finiteNumber(track?.start, NaN),
            end: finiteNumber(track?.end, NaN),
            size: Math.max(0, finiteNumber(track?.sizeM ?? track?.size, NaN)),
        }))
        .filter(track => Number.isFinite(track.start) && Number.isFinite(track.end) && Number.isFinite(track.size) && track.end > track.start + 1e-9 && track.size > 0)
        .sort((a, b) => a.start - b.start || a.end - b.end);
    if (!tracks.length) return null;

    const relevant = tracks.filter(track => track.end > minCoordinate + 1e-9 && track.start < maxCoordinate - 1e-9);
    if (!relevant.length) return null;
    const segments = [];
    let cursor = 0;
    relevant.forEach(track => {
        const start = Math.max(minCoordinate, track.start);
        const end = Math.min(maxCoordinate, track.end);
        if (end <= start + 1e-9) return;
        const sourceSpan = Math.max(1e-9, track.end - track.start);
        const size = track.size * ((end - start) / sourceSpan);
        segments.push({ start, end, size, worldStart: cursor, worldEnd: cursor + size });
        cursor += size;
    });
    if (!segments.length) return null;

    const total = cursor;
    const worldAt = value => {
        const coordinate = finiteNumber(value);
        if (coordinate <= minCoordinate + 1e-9) return -total / 2;
        if (coordinate >= maxCoordinate - 1e-9) return total / 2;
        const segment = segments.find(item => coordinate >= item.start - 1e-9 && coordinate <= item.end + 1e-9);
        if (!segment) {
            const before = [...segments].reverse().find(item => item.end <= coordinate + 1e-9);
            return -total / 2 + (before?.worldEnd || 0);
        }
        const ratio = (coordinate - segment.start) / Math.max(1e-9, segment.end - segment.start);
        return -total / 2 + segment.worldStart + segment.size * ratio;
    };
    return Object.freeze({ total, worldAt, segments: Object.freeze(segments.map(segment => Object.freeze({ ...segment }))) });
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
        negativeArrowFaceBias: 0,
        positiveArrowFaceBias: 0,
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

        // A trans endpoint is not a structural T. When the only fixed members
        // at that point are the two collinear halves of the same mullion, keep
        // both ends square so they read as one flat/continuous member.
        if (junction.isTransPassThrough) {
            joint[endModeKey] = 'square';
            joint[frameSpanKey] = 0;
            return;
        }
        const direction = endpointArmDirection(segment?.orientation, atStart);
        const oppositeArm = getPhysicalArm(junction, OPPOSITE_ARM_DIRECTION[direction]);
        const perpendicularArms = perpendicularArmDirections(direction)
            .map(perpendicularDirection => getPhysicalArm(junction, perpendicularDirection))
            .filter(Boolean);
        const extendArrowTipToFrameGrid = () => {
            const contactStart = getFrameDividerMiterContactStart({
                dividerFaceSpan: normalizedDividerFaceSpan,
                frameInwardSpan: normalizedFrameJointInwardSpan,
            });
            if (contactStart <= 0) return;
            length += contactStart;
            longitudinalOffset += atStart ? -contactStart / 2 : contactStart / 2;
        };
        const applyRectangularSetback = () => {
            const setback = Math.min(
                getRectangularDividerSetback({
                    dividerFaceSpan: normalizedDividerFaceSpan,
                    hostInnerFaceSpan: INTERSECTION_HOST_INNER_FACE_M,
                }),
                Math.max(0, length)
            );
            joint[endModeKey] = 'square';
            joint[frameSpanKey] = 0;
            joint[atStart ? 'negativeRectangularEndNotch' : 'positiveRectangularEndNotch'] = true;
            if (setback <= 1e-9) return;
            length = Math.max(0, length - setback);
            longitudinalOffset += atStart ? setback / 2 : -setback / 2;
        };

        // Compatibility for divider-only L topology. A real derived L now has
        // four physical arms and is handled as one mixed + below.
        if (junction.type === 'L') {
            joint[endModeKey] = 'arrow';
            joint[frameSpanKey] = normalizedDividerFaceSpan;
            length += halfFace;
            longitudinalOffset += atStart ? -halfFace / 2 : halfFace / 2;
            return;
        }

        // Frames and mullions share one grid vertex, but only the frame is
        // asymmetric. The divider body therefore stays centred on its graph
        // line. At every endpoint that meets frame stock, extend the raw divider
        // by the 21 mm frame-reference distance so the symmetric V tip lands on
        // the grid vertex after createDividerSegment() applies its arrow inset.
        if (junction.type === 'plus') {
            joint[endModeKey] = 'arrow';
            joint[frameSpanKey] = normalizedFrameJointInwardSpan;
            extendArrowTipToFrameGrid();
            return;
        }

        const mixedReentrantT = getMixedReentrantTDividerArm(junction);
        if (mixedReentrantT?.dividerArm?.segmentId === segment?.id) {
            joint[endModeKey] = 'arrow';
            joint[frameSpanKey] = normalizedFrameJointInwardSpan;
            extendArrowTipToFrameGrid();
            return;
        }

        // A frame and mullion that continue collinearly also meet at the same
        // grid vertex. No body shift or endpoint face bias is allowed.
        if (oppositeArm?.kind === 'frame') {
            joint[endModeKey] = 'arrow';
            joint[frameSpanKey] = normalizedFrameJointInwardSpan;
            extendArrowTipToFrameGrid();
            return;
        }

        // Perimeter T: the added mullion branch ends 19 mm before the grid
        // vertex (44 mm half mullion face - 25 mm inner frame band). The host
        // frame itself stays flat and continuous; its inner 25 mm band is the
        // physical inside half-frame contact surface.
        if (
            !oppositeArm
            && perpendicularArms.some(arm => arm.kind === 'frame')
        ) {
            applyRectangularSetback();
            return;
        }

        // Interior T/cross hosts stay flat. The branch meets the existing
        // 25 mm host-side half-mullion band; no triangular socket/filler is cut
        // out of the continuous host member.
        if (
            oppositeArm?.kind === 'divider'
            && junction.hostOrientation
            && segment?.orientation === junction.hostOrientation
            && perpendicularArms.some(arm => arm.kind === 'divider')
        ) {
            joint[endModeKey] = 'square';
            joint[frameSpanKey] = 0;
            return;
        }

        // A mullion added onto another mullion/transom is a rectangular
        // branch that stops 19 mm from the grid. The existing host profile
        // supplies the 25 mm half-mullion contact band.
        if (
            !oppositeArm
            && perpendicularArms.some(arm => arm.kind === 'divider')
            && junction.hostOrientation
            && segment?.orientation !== junction.hostOrientation
        ) {
            applyRectangularSetback();
            return;
        }

        // The same rectangular-branch rule applies to the non-host axis of a
        // full mullion cross.
        if (
            oppositeArm?.kind === 'divider'
            && junction.type === 'cross'
            && junction.hostOrientation
            && segment?.orientation !== junction.hostOrientation
        ) {
            applyRectangularSetback();
        }
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
    const straightContactSpan = Math.max(
        0,
        normalizedFrameSpan - normalizedDividerFaceSpan / 2
    );
    const frameJointModes = Object.freeze({ ...(placement.frameJointModes || {}) });
    const reverseMiterEnds = Object.entries(frameJointModes)
        .filter(([, mode]) => mode === 'reverse-miter')
        .map(([localEnd]) => localEnd);

    // Structural topology owns frame position and length. Re-entrant joints
    // are expressed only as endpoint cut modes. Older logic extended a frame by
    // one frame span to make a particular L/T look correct; in a four-window T
    // that made the frame physically taller/wider than its sash and reopened
    // holes. Never change width/height/origin here.
    if (!reverseMiterEnds.length) {
        return Object.freeze({
            ...placement,
            frameJointModes,
            reentrantHost: false,
        });
    }

    const getOuterBoundary = () => {
        if (placement.side === 'bottom') return finiteNumber(placement.perpendicularOffset);
        if (placement.side === 'top') return finiteNumber(placement.perpendicularOffset);
        if (placement.side === 'left') return finiteNumber(placement.perpendicularOffset);
        if (placement.side === 'right') return finiteNumber(placement.perpendicularOffset);
        return 0;
    };
    const structuralBoundary = Number.isFinite(Number(placement.structuralPerpendicularOffset))
        ? Number(placement.structuralPerpendicularOffset)
        : getOuterBoundary();
    const inwardSign = placement.side === 'bottom' || placement.side === 'left' ? 1 : -1;
    const frameBoundaryOffset = (getOuterBoundary() - structuralBoundary) * inwardSign;

    return Object.freeze({
        ...placement,
        frameJointModes,
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
    transConnection = null,
    connectionScale = MM_TO_M,
    // Legacy parameter kept for older saved/test callers. New code separates
    // the 65 mm frame depth used for machining from the 57 mm frame face used
    // to position the layout grid.
    frameReplacementSpan = 0,
    frameFaceSpan = null,
    frameInwardSpan = null,
    dividerFaceSpan = 0,
} = {}) {
    const normalizedWidth = Math.max(0, finiteNumber(width));
    const normalizedHeight = Math.max(0, finiteNumber(height));
    const requestedFrameReplacementSpan = Math.max(0, finiteNumber(frameReplacementSpan));
    const requestedFrameFaceSpan = Math.max(0, frameFaceSpan === null || frameFaceSpan === undefined
        ? requestedFrameReplacementSpan
        : finiteNumber(frameFaceSpan));
    const requestedFrameInwardSpan = Math.max(0, frameInwardSpan === null || frameInwardSpan === undefined
        ? requestedFrameReplacementSpan
        : finiteNumber(frameInwardSpan));
    const normalizedDividerFaceSpan = Math.max(0, finiteNumber(dividerFaceSpan));
    const windows = Array.isArray(topology?.windows) ? topology.windows : [];
    const dividers = Array.isArray(topology?.dividers) ? topology.dividers : [];
    const transEdges = Array.isArray(topology?.transSegments) ? topology.transSegments : [];
    const frameEdges = Array.isArray(topology?.frameEdges) ? topology.frameEdges : [];

    const minCol = windows.length ? Math.min(...windows.map(c => c.rect.x0)) : 0;
    const maxCol = windows.length ? Math.max(...windows.map(c => c.rect.x1)) : 1;
    const minRow = windows.length ? Math.min(...windows.map(c => c.rect.y0)) : 0;
    const maxRow = windows.length ? Math.max(...windows.map(c => c.rect.y1)) : 1;

    const topologyXMapper = buildTrackAxisMapper(topology?.gridTracks?.x, minCol, maxCol);
    const topologyYMapper = buildTrackAxisMapper(topology?.gridTracks?.y, minRow, maxRow);
    const usesSizedGrid = Boolean(topologyXMapper && topologyYMapper);

    // Legacy states used one global slider as a repeated bay size. Keep that
    // fallback for compatibility. Version-5 states carry physical grid-track
    // sizes, so each column/row can be changed independently.
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

    // Window-plane reference relation from the CAD profile faces:
    // outer frame = 57 mm, mullion = 88 mm => 57 - 44 = 13 mm.
    // This is intentionally independent from the 65 mm profile depth used by
    // the frame/mullion machining geometry below.
    const frameReferenceOffsetX = Math.max(0, requestedFrameFaceSpan - normalizedDividerFaceSpan / 2);
    const frameReferenceOffsetY = frameReferenceOffsetX;

    const totalWidth = topologyXMapper
        ? topologyXMapper.total
        : (maxCol - minCol) * cellPitchX;
    const totalHeight = topologyYMapper
        ? topologyYMapper.total
        : (maxRow - minRow) * cellPitchY;

    const worldGridX = col => topologyXMapper
        ? topologyXMapper.worldAt(col)
        : gridToWorldX(col, minCol, totalWidth, cellPitchX);
    const worldGridY = row => topologyYMapper
        ? topologyYMapper.worldAt(row)
        : gridToWorldY(row, minRow, totalHeight, cellPitchY);

    // In the sized-grid model the grid line itself is the mullion centreline /
    // equivalent perimeter reference. The physical outer frame extends 13 mm
    // beyond it. Legacy states retain the previous padding model unchanged.
    const legacyOuterPhysicalPadX = replacementSpanX / 2;
    const legacyOuterPhysicalPadY = replacementSpanY / 2;
    const legacyOuterReferencePadX = Math.max(0, legacyOuterPhysicalPadX - frameReferenceOffsetX);
    const legacyOuterReferencePadY = Math.max(0, legacyOuterPhysicalPadY - frameReferenceOffsetY);
    const worldReferenceX = col => {
        const base = worldGridX(col);
        if (usesSizedGrid) return base;
        if (Math.abs(finiteNumber(col) - minCol) <= 1e-9) return base - legacyOuterReferencePadX;
        if (Math.abs(finiteNumber(col) - maxCol) <= 1e-9) return base + legacyOuterReferencePadX;
        return base;
    };
    const worldReferenceY = row => {
        const base = worldGridY(row);
        if (usesSizedGrid) return base;
        if (Math.abs(finiteNumber(row) - minRow) <= 1e-9) return base - legacyOuterReferencePadY;
        if (Math.abs(finiteNumber(row) - maxRow) <= 1e-9) return base + legacyOuterReferencePadY;
        return base;
    };
    const worldPhysicalFrameX = col => {
        const base = worldGridX(col);
        if (Math.abs(finiteNumber(col) - minCol) <= 1e-9) {
            return base - (usesSizedGrid ? frameReferenceOffsetX : legacyOuterPhysicalPadX);
        }
        if (Math.abs(finiteNumber(col) - maxCol) <= 1e-9) {
            return base + (usesSizedGrid ? frameReferenceOffsetX : legacyOuterPhysicalPadX);
        }
        return base;
    };
    const worldPhysicalFrameY = row => {
        const base = worldGridY(row);
        if (Math.abs(finiteNumber(row) - minRow) <= 1e-9) {
            return base - (usesSizedGrid ? frameReferenceOffsetY : legacyOuterPhysicalPadY);
        }
        if (Math.abs(finiteNumber(row) - maxRow) <= 1e-9) {
            return base + (usesSizedGrid ? frameReferenceOffsetY : legacyOuterPhysicalPadY);
        }
        return base;
    };


    const hasExposedFrameSide = (cellId, side) => frameEdges.some(edge => (
        String(edge.cellId) === String(cellId)
        && edge.side === side
        && finiteNumber(edge.end) > finiteNumber(edge.start) + 1e-9
    ));
    const sizedGridEdgeExtensionX = usesSizedGrid ? frameReferenceOffsetX : legacyOuterPhysicalPadX;
    const sizedGridEdgeExtensionY = usesSizedGrid ? frameReferenceOffsetY : legacyOuterPhysicalPadY;

    const cells = windows.map(cell => {
        const x0 = worldGridX(cell.rect.x0);
        const x1 = worldGridX(cell.rect.x1);
        const y0 = worldGridY(cell.rect.y0);
        const y1 = worldGridY(cell.rect.y1);
        const hasLeftFrame = hasExposedFrameSide(cell.id, 'left');
        const hasRightFrame = hasExposedFrameSide(cell.id, 'right');
        const hasBottomFrame = hasExposedFrameSide(cell.id, 'bottom');
        const hasTopFrame = hasExposedFrameSide(cell.id, 'top');
        const actualX0 = x0 - (hasLeftFrame ? sizedGridEdgeExtensionX : 0);
        const actualX1 = x1 + (hasRightFrame ? sizedGridEdgeExtensionX : 0);
        const actualY0 = y0 - (hasBottomFrame ? sizedGridEdgeExtensionY : 0);
        const actualY1 = y1 + (hasTopFrame ? sizedGridEdgeExtensionY : 0);
        const connectionX0 = Math.abs(cell.rect.x0 - minCol) <= 1e-9
            ? worldPhysicalFrameX(cell.rect.x0)
            : x0;
        const connectionX1 = Math.abs(cell.rect.x1 - maxCol) <= 1e-9
            ? worldPhysicalFrameX(cell.rect.x1)
            : x1;
        const connectionY0 = Math.abs(cell.rect.y0 - minRow) <= 1e-9
            ? worldPhysicalFrameY(cell.rect.y0)
            : y0;
        const connectionY1 = Math.abs(cell.rect.y1 - maxRow) <= 1e-9
            ? worldPhysicalFrameY(cell.rect.y1)
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
            actualX0,
            actualX1,
            actualY0,
            actualY1,
            actualWidth: Math.max(0, actualX1 - actualX0),
            actualHeight: Math.max(0, actualY1 - actualY0),
            actualCenterX: (actualX0 + actualX1) / 2,
            actualCenterY: (actualY0 + actualY1) / 2,
            hasLeftFrame,
            hasRightFrame,
            hasBottomFrame,
            hasTopFrame,
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
            transJoinSideByBoundary: {},
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
            const y0 = worldReferenceY(divider.start);
            const y1 = worldReferenceY(divider.end);
            return {
                ...divider,
                perpendicularOffset: x,
                structuralPerpendicularOffset: x,
                longitudinalOffset: (y0 + y1) / 2,
                length: Math.max(0, y1 - y0),
                worldStart: y0,
                worldEnd: y1,
                structuralWorldStart: worldReferenceY(divider.start),
                structuralWorldEnd: worldReferenceY(divider.end),
            };
        }
        const y = worldGridY(divider.coordinate);
        const x0 = worldReferenceX(divider.start);
        const x1 = worldReferenceX(divider.end);
        return {
            ...divider,
            perpendicularOffset: y,
            structuralPerpendicularOffset: y,
            longitudinalOffset: (x0 + x1) / 2,
            length: Math.max(0, x1 - x0),
            worldStart: x0,
            worldEnd: x1,
            structuralWorldStart: worldReferenceX(divider.start),
            structuralWorldEnd: worldReferenceX(divider.end),
        };
    });

    const transSegments = transEdges.map(trans => {
        if (trans.orientation !== 'vertical') return null;
        const x = worldGridX(trans.coordinate);
        // The floating trans does not create a structural arm, but its
        // endpoints still need to line up with the structural reference graph
        // so the collinear frame/mullion pieces above and below can be marked
        // as one continuous member. Outer frame references intentionally use
        // worldReferenceY() rather than the reduced cell grid.
        const y0 = worldReferenceY(trans.start);
        const y1 = worldReferenceY(trans.end);
        return {
            ...trans,
            perpendicularOffset: x,
            structuralPerpendicularOffset: x,
            longitudinalOffset: (y0 + y1) / 2,
            length: Math.max(0, y1 - y0),
            worldStart: y0,
            worldEnd: y1,
            structuralWorldStart: y0,
            structuralWorldEnd: y1,
        };
    }).filter(Boolean);

    // A trans is a floating sash component, not a structural grid arm. Its CAD
    // join still defines the exact left/right sash seats, but it must never
    // participate in the frame/mullion junction solver below.
    const applyTransConnectionGeometry = () => {
        const boundaries = transConnection?.openingSashTransBoundariesMm || {};
        const scale = finiteNumber(connectionScale, MM_TO_M);
        transSegments.forEach(trans => {
            const negativeCell = cellById.get(trans.negativeCellId);
            const positiveCell = cellById.get(trans.positiveCellId);
            if (negativeCell) negativeCell.transJoinSideByBoundary.right = 'left';
            if (positiveCell) positiveCell.transJoinSideByBoundary.left = 'right';

            const leftBoundary = Number(boundaries.left);
            const rightBoundary = Number(boundaries.right);
            if (negativeCell && Number.isFinite(leftBoundary)) {
                negativeCell.connectionX1 = trans.perpendicularOffset + leftBoundary * scale;
            }
            if (positiveCell && Number.isFinite(rightBoundary)) {
                positiveCell.connectionX0 = trans.perpendicularOffset + rightBoundary * scale;
            }
        });
    };

    // The topology grid is the source of truth for physical window size.
    // CAD join seats describe only where the sash/fixed-light assembly meets a
    // mullion. Never write those seat offsets back into x0/x1/y0/y1 and never
    // translate complete rows/columns to satisfy them. Doing either changes the
    // apparent size of an L-corner cell and makes a merged cell occupy a
    // different envelope than the cells it replaced.

    // Apply CAD-facing divider seats only after any local mixed-+ CAD shift has
    // been resolved. Structural cell x0/x1/y0/y1 never move. Re-running this
    // helper is safe because every divider-owned connection boundary is assigned
    // from the current divider placement, not incrementally accumulated.
    const applyDividerConnectionGeometry = () => {
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
    
    };

    const baseFramePlacements = frameEdges.map(edge => {
        const structuralCell = structuralCellById.get(edge.cellId);
        const isPartial = Boolean(edge.partial);

        if (edge.side === 'top' || edge.side === 'bottom') {
            const structuralPerpendicularOffset = Number.isFinite(Number(edge.coordinate))
                ? worldReferenceY(edge.coordinate)
                : (edge.side === 'bottom'
                    ? finiteNumber(structuralCell?.y0)
                    : finiteNumber(structuralCell?.y1));
            const structuralWorldStart = worldReferenceX(edge.start);
            const structuralWorldEnd = worldReferenceX(edge.end);
            const cellHeight = Math.max(0, finiteNumber(structuralCell?.height));
            const outwardSign = edge.side === 'bottom' ? -1 : 1;
            const frameBoundary = structuralPerpendicularOffset
                + outwardSign * frameReferenceOffsetY;
            const originY = edge.side === 'bottom'
                ? frameBoundary + cellHeight / 2
                : frameBoundary - cellHeight / 2;

            return Object.freeze({
                ...edge,
                pieceType: 'frame',
                side: edge.side,
                orientation: 'horizontal',
                // `structuralPerpendicularOffset` is the grid/reference line.
                // `perpendicularOffset` is the asymmetric frame's physical
                // outer edge. Their difference is the CAD 21 mm relation.
                perpendicularOffset: frameBoundary,
                structuralPerpendicularOffset,
                frameReferenceOffset: frameReferenceOffsetY,
                worldStart: structuralWorldStart,
                worldEnd: structuralWorldEnd,
                structuralWorldStart,
                structuralWorldEnd,
                partial: isPartial,
                width: Math.max(0, structuralWorldEnd - structuralWorldStart),
                height: cellHeight,
                originX: (structuralWorldStart + structuralWorldEnd) / 2,
                originY,
                windowCell: edge.cellId,
                cellType: edge.cellType,
                jointEnd: null,
                localJointEnd: null,
                localJointEnds: Object.freeze([]),
                frameJointModes: Object.freeze({}),
                addCandidate: true,
            });
        }

        const structuralPerpendicularOffset = Number.isFinite(Number(edge.coordinate))
            ? worldReferenceX(edge.coordinate)
            : (edge.side === 'left'
                ? finiteNumber(structuralCell?.x0)
                : finiteNumber(structuralCell?.x1));
        const structuralWorldStart = worldReferenceY(edge.start);
        const structuralWorldEnd = worldReferenceY(edge.end);
        const cellWidth = Math.max(0, finiteNumber(structuralCell?.width));
        const outwardSign = edge.side === 'left' ? -1 : 1;
        const frameBoundary = structuralPerpendicularOffset
            + outwardSign * frameReferenceOffsetX;
        const originX = edge.side === 'left'
            ? frameBoundary + cellWidth / 2
            : frameBoundary - cellWidth / 2;

        return Object.freeze({
            ...edge,
            pieceType: 'frame',
            side: edge.side,
            orientation: 'vertical',
            perpendicularOffset: frameBoundary,
            structuralPerpendicularOffset,
            frameReferenceOffset: frameReferenceOffsetX,
            worldStart: structuralWorldStart,
            worldEnd: structuralWorldEnd,
            structuralWorldStart,
            structuralWorldEnd,
            partial: isPartial,
            width: cellWidth,
            height: Math.max(0, structuralWorldEnd - structuralWorldStart),
            originX,
            originY: (structuralWorldStart + structuralWorldEnd) / 2,
            windowCell: edge.cellId,
            cellType: edge.cellType,
            jointEnd: null,
            localJointEnd: null,
            localJointEnds: Object.freeze([]),
            frameJointModes: Object.freeze({}),
            addCandidate: true,
        });
    });

    // The sash/fixed-light connection rectangle must follow whichever physical
    // member actually owns each complete cell side. Global perimeter frames
    // already did this through worldPhysicalFrameX/Y, but a re-entrant/exposed
    // frame can live on an internal grid coordinate. In the grid-member model
    // that frame is intentionally offset 21 mm from the reference line; leaving
    // the cell connection boundary on the reference line makes the sash/glazing
    // bead visibly smaller than the frame by exactly that offset.
    //
    // Only frame-only sides are updated here. A merged cell can have a long side
    // made from both frame and mullion pieces; those mixed sides must keep the
    // divider CAD seat resolved below because one rectangular sash/glazing
    // assembly cannot follow two different outer-member boundaries along one
    // side.
    const connectionOwnedCellSides = new Set();
    dividerSegments.forEach(segment => {
        if (segment.orientation === 'vertical') {
            if (segment.negativeCellId) connectionOwnedCellSides.add(`${segment.negativeCellId}:right`);
            if (segment.positiveCellId) connectionOwnedCellSides.add(`${segment.positiveCellId}:left`);
        } else {
            if (segment.negativeCellId) connectionOwnedCellSides.add(`${segment.negativeCellId}:top`);
            if (segment.positiveCellId) connectionOwnedCellSides.add(`${segment.positiveCellId}:bottom`);
        }
    });

    transSegments.forEach(segment => {
        if (segment.negativeCellId) connectionOwnedCellSides.add(`${segment.negativeCellId}:right`);
        if (segment.positiveCellId) connectionOwnedCellSides.add(`${segment.positiveCellId}:left`);
    });

    baseFramePlacements.forEach(frame => {
        const cell = cellById.get(frame.cellId || frame.windowCell);
        if (!cell || connectionOwnedCellSides.has(`${cell.id}:${frame.side}`)) return;

        if (frame.side === 'left') {
            cell.connectionX0 = finiteNumber(frame.perpendicularOffset, cell.connectionX0);
        } else if (frame.side === 'right') {
            cell.connectionX1 = finiteNumber(frame.perpendicularOffset, cell.connectionX1);
        } else if (frame.side === 'bottom') {
            cell.connectionY0 = finiteNumber(frame.perpendicularOffset, cell.connectionY0);
        } else if (frame.side === 'top') {
            cell.connectionY1 = finiteNumber(frame.perpendicularOffset, cell.connectionY1);
        }
    });

    // Build one structural intersection model for frames and dividers. Each
    // point owns at most four physical arms: north/east/south/west. Joint
    // behavior is derived from those arms, never from the global bounding box
    // or from special-case layout names such as L/T/merged-L.
    const physicalIntersectionMap = new Map();
    function getOrCreatePhysicalIntersection(x, y) {
        const key = physicalJunctionKey(x, y);
        let entry = physicalIntersectionMap.get(key);
        if (!entry) {
            entry = {
                key,
                x: finiteNumber(x),
                y: finiteNumber(y),
                arms: { north: null, east: null, south: null, west: null },
            };
            physicalIntersectionMap.set(key, entry);
        }
        return entry;
    }
    function registerPhysicalArm({ kind, segment, atStart, localEnd = null }) {
        const orientation = segment.orientation;
        const perpendicular = Number.isFinite(Number(segment.structuralPerpendicularOffset))
            ? Number(segment.structuralPerpendicularOffset)
            : Number(segment.perpendicularOffset);
        const structuralStart = Number.isFinite(Number(segment.structuralWorldStart))
            ? Number(segment.structuralWorldStart)
            : Number(segment.worldStart);
        const structuralEnd = Number.isFinite(Number(segment.structuralWorldEnd))
            ? Number(segment.structuralWorldEnd)
            : Number(segment.worldEnd);
        const x = orientation === 'vertical'
            ? perpendicular
            : (atStart ? structuralStart : structuralEnd);
        const y = orientation === 'vertical'
            ? (atStart ? structuralStart : structuralEnd)
            : perpendicular;
        const direction = endpointArmDirection(orientation, atStart);
        const entry = getOrCreatePhysicalIntersection(x, y);
        const arm = Object.freeze({
            kind,
            segmentId: segment.id,
            orientation,
            atStart: Boolean(atStart),
            direction,
            localEnd,
            side: segment.side || null,
            partial: Boolean(segment.partial),
        });
        const existing = entry.arms[direction];
        if (!existing) {
            entry.arms[direction] = arm;
        } else if (existing.segmentId !== arm.segmentId || existing.kind !== arm.kind) {
            // Overlapping same-direction structural members indicate malformed
            // topology. Keep the first deterministic arm rather than allowing
            // layout-order-dependent joint classification.
            entry.armConflict = true;
        }
    }

    dividerSegments.forEach(segment => {
        registerPhysicalArm({ kind: 'divider', segment, atStart: true });
        registerPhysicalArm({ kind: 'divider', segment, atStart: false });
    });
    baseFramePlacements.forEach(frame => {
        registerPhysicalArm({
            kind: 'frame',
            segment: frame,
            atStart: true,
            localEnd: localJointEndForFrameSide(frame.side, 'negative'),
        });
        registerPhysicalArm({
            kind: 'frame',
            segment: frame,
            atStart: false,
            localEnd: localJointEndForFrameSide(frame.side, 'positive'),
        });
    });

    // A flying/trans mullion ends against the sash pair, not against the
    // fixed structural member above/below it. At those endpoint coordinates a
    // pair of collinear frame/mullion pieces must therefore remain flat, just
    // like the same structural line beside a merged opening. Mark that special
    // continuation explicitly without registering the trans as a physical arm.
    const transEndpointKeys = new Set();
    transSegments.forEach(segment => {
        const perpendicular = finiteNumber(
            segment.structuralPerpendicularOffset,
            segment.perpendicularOffset
        );
        const start = finiteNumber(segment.structuralWorldStart, segment.worldStart);
        const end = finiteNumber(segment.structuralWorldEnd, segment.worldEnd);
        if (segment.orientation === 'vertical') {
            transEndpointKeys.add(physicalJunctionKey(perpendicular, start));
            transEndpointKeys.add(physicalJunctionKey(perpendicular, end));
        } else {
            transEndpointKeys.add(physicalJunctionKey(start, perpendicular));
            transEndpointKeys.add(physicalJunctionKey(end, perpendicular));
        }
    });

    const physicalIntersections = [...physicalIntersectionMap.values()]
        .map(classifyPhysicalJunction)
        .map(junction => {
            const homogeneousContinuation = junction.type === 'continuation'
                && (
                    (junction.frameCount === 2 && junction.dividerCount === 0)
                    || (junction.dividerCount === 2 && junction.frameCount === 0)
                );

            // A floating trans may pass through a continuous structural line
            // only when both collinear halves are the SAME member family.
            // Frame+frame and mullion+mullion continuations stay flat, matching
            // the geometry beside a merged opening. A frame+mullion change at
            // the trans endpoint is still a real CAD frame/mullion joint and
            // must keep its normal V/miter connection. Marking that mixed pair
            // as pass-through squares both pieces and deletes the connection.
            return transEndpointKeys.has(junction.key) && homogeneousContinuation
                ? Object.freeze({ ...junction, isTransPassThrough: true })
                : junction;
        });
    const physicalIntersectionByKey = new Map(
        physicalIntersections.map(junction => [junction.key, junction])
    );

    // One grid line has one physical reference position. Mullions/transoms are
    // symmetric, so every divider body stays centred on that line regardless of
    // which frame pieces meet it. The frame asymmetry is handled by the frame's
    // own normal offset and endpoint cut; never move a divider to satisfy one
    // local corner because that changes the level seen by another intersection.
    const mixedPlusPerpendicularShift = getFrameDividerMiterContactStart({
        dividerFaceSpan: normalizedDividerFaceSpan,
        frameInwardSpan: requestedFrameInwardSpan,
    });
    dividerSegments.forEach(segment => {
        segment.pieceType = 'mullion';
        segment.mixedPlusPerpendicularShift = 0;
        segment.mixedPlusNegativePerpendicularShift = 0;
        segment.mixedPlusPositivePerpendicularShift = 0;
        segment.mixedPlusShiftConflict = false;
        segment.perpendicularOffset = finiteNumber(segment.structuralPerpendicularOffset);
    });

    // Sash/bead/glass seats follow the centred mullion. Structural cell
    // rectangles remain independent from both the frame's 21 mm reference
    // offset and the CAD sash/glazing seats.
    applyDividerConnectionGeometry();
    applyTransConnectionGeometry();
    cells.forEach(cell => {
        cell.connectionWidth = Math.max(0, cell.connectionX1 - cell.connectionX0);
        cell.connectionHeight = Math.max(0, cell.connectionY1 - cell.connectionY0);
        cell.connectionCenterX = (cell.connectionX0 + cell.connectionX1) / 2;
        cell.connectionCenterY = (cell.connectionY0 + cell.connectionY1) / 2;
    });

    function getFrameEndpointJunction(frame, atStart) {
        const perpendicular = Number.isFinite(Number(frame.structuralPerpendicularOffset))
            ? Number(frame.structuralPerpendicularOffset)
            : Number(frame.perpendicularOffset);
        const start = Number.isFinite(Number(frame.structuralWorldStart))
            ? Number(frame.structuralWorldStart)
            : Number(frame.worldStart);
        const end = Number.isFinite(Number(frame.structuralWorldEnd))
            ? Number(frame.structuralWorldEnd)
            : Number(frame.worldEnd);
        const x = frame.orientation === 'vertical' ? perpendicular : (atStart ? start : end);
        const y = frame.orientation === 'vertical' ? (atStart ? start : end) : perpendicular;
        return physicalIntersectionByKey.get(physicalJunctionKey(x, y)) || null;
    }

    const framePlacements = baseFramePlacements.map(frame => {
        const jointEnds = [];
        const frameJointModes = {};
        [true, false].forEach(atStart => {
            const junction = getFrameEndpointJunction(frame, atStart);
            if (!junction) return;
            const direction = endpointArmDirection(frame.orientation, atStart);
            const oppositeArm = getPhysicalArm(junction, OPPOSITE_ARM_DIRECTION[direction]);
            const perpendicularArms = perpendicularArmDirections(direction)
                .map(perpendicularDirection => getPhysicalArm(junction, perpendicularDirection))
                .filter(Boolean);
            const localEnd = localJointEndForFrameSide(
                frame.side,
                atStart ? 'negative' : 'positive'
            );

            let mode = null;
            // The trans itself is carried by a sash. It must not force a V or
            // miter into the fixed frame/mullion line at either end. Mark the
            // endpoint explicitly as square: the mesh extruder otherwise treats
            // an unlisted end as an ordinary 45-degree frame miter, which makes
            // the two frame halves retract when trans is enabled.
            if (junction.isTransPassThrough) {
                jointEnds.push(localEnd);
                frameJointModes[localEnd] = 'square';
                return;
            }
            const hasPerpendicularDivider = perpendicularArms.some(arm => arm.kind === 'divider');
            const hasPerpendicularFrame = perpendicularArms.some(arm => arm.kind === 'frame');

            if (isInteriorLMixedPlusJunction(junction)) {
                // Four-arm L centre: each asymmetric frame terminates in a
                // 90-degree V (two 45-degree faces) around the same grid apex as
                // the two mullions. This avoids the overlapping single-miter
                // triangles while preserving the intended frame/mullion joint.
                mode = 'mixed-plus';
            } else if (getMixedReentrantTDividerArm(junction)) {
                // A merged L is still a three-arm re-entrant T. Its missing
                // divider half is owned by the half-mullion filler, so keep the
                // established square frame ends for that separate topology.
                mode = 'square';
            } else if (
                junction.type === 'T'
                && oppositeArm?.kind === 'frame'
                && hasPerpendicularDivider
                && getNormalPerimeterTHalfFrameInfo(junction)
            ) {
                // A real perimeter frame remains one continuous extrusion at a
                // mullion T. The "inside half-frame" is the inner 25 mm band of
                // that continuous profile, not a triangular front-view filler.
                // Keep the two renderer segments square so they butt together
                // without carving the V-shaped hole that the old implementation
                // produced.
                mode = 'square';
            } else if (
                oppositeArm?.kind === 'divider'
                || hasPerpendicularDivider
                || hasPerpendicularFrame
                || junction.type === 'corner'
                || junction.type === 'plus'
                || getMixedReentrantTDividerArm(junction)
            ) {
                // Every other real grid intersection is a plain 45-degree line
                // through the graph vertex. Because the frame itself is offset
                // normal to the graph line by 21 mm, this one cut law covers:
                // frame/frame corners, frame/mullion continuations, mixed + and
                // merged-L re-entrant joints without moving or shearing members.
                mode = 'grid-miter';
            }

            if (mode) {
                jointEnds.push(localEnd);
                frameJointModes[localEnd] = mode;
            }
        });

        return Object.freeze({
            ...frame,
            jointEnd: jointEnds.length ? 'grid' : null,
            localJointEnd: jointEnds.length === 1 ? jointEnds[0] : null,
            localJointEnds: Object.freeze(jointEnds),
            frameJointModes: Object.freeze(frameJointModes),
            frameJointCenterShifts: Object.freeze({}),
        });
    });

    // Keep the older perimeterJunctions API for the renderer/tests, but derive
    // it entirely from the physical-arm model. No layout-specific detection is
    // performed here.
    const perimeterJunctions = physicalIntersections
        .map(junction => {
            const dividerArms = junction.activeDirections
                .map(direction => junction.arms[direction])
                .filter(arm => arm?.kind === 'divider');
            const frameArms = junction.activeDirections
                .map(direction => junction.arms[direction])
                .filter(arm => arm?.kind === 'frame');
            const continuations = dividerArms
                .map(dividerArm => {
                    const opposite = junction.arms[OPPOSITE_ARM_DIRECTION[dividerArm.direction]];
                    if (opposite?.kind !== 'frame') return null;
                    return Object.freeze({
                        orientation: dividerArm.orientation,
                        dividerEndpoint: Object.freeze({
                            dividerId: dividerArm.segmentId,
                            orientation: dividerArm.orientation,
                            atStart: dividerArm.atStart,
                            direction: dividerArm.direction,
                        }),
                        frameEndpoint: Object.freeze({
                            frameId: opposite.segmentId,
                            orientation: opposite.orientation,
                            atStart: opposite.atStart,
                            localEnd: opposite.localEnd,
                            partial: Boolean(opposite.partial),
                            side: opposite.side,
                            direction: opposite.direction,
                        }),
                    });
                })
                .filter(Boolean);

            if (junction.type === 'plus' && continuations.length >= 2) {
                return Object.freeze({
                    key: junction.key,
                    x: junction.x,
                    y: junction.y,
                    type: 'perimeter-plus',
                    continuations: Object.freeze(continuations),
                    arms: junction.arms,
                });
            }

            if (junction.type === 'T' && continuations.length === 1 && frameArms.length >= 2) {
                const continuation = continuations[0];
                const branchFrame = frameArms.find(frameArm =>
                    frameArm.segmentId !== continuation.frameEndpoint.frameId
                );
                if (!branchFrame) return null;
                return Object.freeze({
                    key: junction.key,
                    x: junction.x,
                    y: junction.y,
                    type: 'perimeter-T',
                    hostOrientation: continuation.orientation,
                    branchOrientation: branchFrame.orientation,
                    dividerEndpoint: continuation.dividerEndpoint,
                    hostFrameEndpoint: continuation.frameEndpoint,
                    branchFrameEndpoint: Object.freeze({
                        frameId: branchFrame.segmentId,
                        orientation: branchFrame.orientation,
                        atStart: branchFrame.atStart,
                        localEnd: branchFrame.localEnd,
                        partial: Boolean(branchFrame.partial),
                        side: branchFrame.side,
                        direction: branchFrame.direction,
                    }),
                    arms: junction.arms,
                });
            }
            return null;
        })
        .filter(Boolean);

    // Normal perimeter T: the physical frame remains continuous. Keep a
    // lightweight descriptor for the inner 25 mm frame band so intersection
    // ownership/BOM logic can distinguish it from the 32 mm outer frame band,
    // but do not render it as a separate triangular mesh.
    const halfFrameSpan = INTERSECTION_HOST_INNER_FACE_M;
    const halfFrameFillers = physicalIntersections
        .map(junction => {
            const info = getNormalPerimeterTHalfFrameInfo(junction);
            if (!info || halfFrameSpan <= 1e-9) return null;

            const sourceFrameArm = [...info.frameArms]
                .sort((a, b) => String(a.segmentId).localeCompare(String(b.segmentId)))[0];
            if (!sourceFrameArm) return null;

            return Object.freeze({
                id: `half-frame-${junction.key}`,
                pieceType: 'inside-half-frame',
                sourceFrameId: sourceFrameArm.segmentId,
                hostFrameIds: Object.freeze(info.frameArms.map(arm => arm.segmentId)),
                side: info.side,
                orientation: junction.hostOrientation,
                direction: info.missingDirection,
                apexX: finiteNumber(junction.x),
                apexY: finiteNumber(junction.y),
                frameReferenceSpan: halfFrameSpan,
                innerFaceSpan: INTERSECTION_HOST_INNER_FACE_M,
                gridSetback: getRectangularDividerSetback({
                    dividerFaceSpan: normalizedDividerFaceSpan,
                    hostInnerFaceSpan: INTERSECTION_HOST_INNER_FACE_M,
                }),
                positionMode: 'inside',
                renderAsSeparateMesh: false,
            });
        })
        .filter(Boolean);

    // A merged side of an L removes one physical divider arm from the old
    // mixed +. The remaining three-arm junction is geometrically correct after
    // the mixed-reentrant cuts above, but the removed arm leaves one exposed
    // half of the surviving mullion V.
    //
    // Do NOT fill that opening with a short divider pointing in the missing
    // direction. That creates exactly the wrong visual result: for a missing
    // north arm it looks like a little vertical mullion growing upward from the
    // junction. The required CAD piece is the opposite: keep the extrusion
    // parallel to the surviving mullion and retain only the half of its section
    // that faces the merged-window side. In the top-right-L/top-row-merge case
    // this is therefore a horizontal, north-half V wedge extending west from
    // the common apex. Rotating the same rule covers every equivalent merge.
    const reentrantFillers = physicalIntersections
        .map(junction => {
            const mixedT = getMixedReentrantTDividerArm(junction);
            if (!mixedT || mixedPlusPerpendicularShift <= 0) return null;
            const spansMergedWindow = hasWindowAcrossMissingReentrantDirection({
                junction,
                cells,
                direction: mixedT.missingDirection,
            });
            const endsAtFloatingTrans = hasFloatingTransAlongMissingDirection({
                junction,
                transSegments,
                direction: mixedT.missingDirection,
            });

            // The same fixed half-mullion connection is needed in two cases:
            // 1. the missing arm disappeared because that side was merged; or
            // 2. the missing structural arm was replaced by a floating trans.
            //
            // A trans is intentionally excluded from the structural-arm graph
            // so the fixed member line remains flat. At a mixed frame/mullion
            // endpoint, however, excluding it makes the junction look exactly
            // like a merged-L re-entrant T and leaves the same exposed half-V.
            // Reuse the fixed half-mullion filler there; the trans itself stays
            // square-ended and continues to move with its owner sash.
            if (!spansMergedWindow && !endsAtFloatingTrans) return null;

            const sourceDivider = dividerSegments.find(
                segment => segment.id === mixedT.dividerArm.segmentId
            );
            if (!sourceDivider) return null;

            // The half-mullion is a junction piece on the SAME grid vertex as
            // the surviving centred mullion. The old implementation moved this
            // apex diagonally by 21 mm because it had moved the whole mullion;
            // that is exactly the diagonal/level drift the grid model removes.
            const apexX = finiteNumber(junction.x);
            const apexY = finiteNumber(junction.y);

            // The wedge is a clipped continuation of the surviving divider,
            // not a new divider in the missing direction.
            const orientation = sourceDivider.orientation;
            const fillerDirection = OPPOSITE_ARM_DIRECTION[mixedT.dividerArm.direction];
            const arrowAtStart = endpointArmDirection(orientation, true) === fillerDirection;

            // createDividerSegment() maps divider face to world coordinates as:
            //   horizontal: worldY = -face
            //   vertical:   worldX =  face
            // Keep only the section half that points into the merged window.
            let faceHalfSign = 0;
            if (orientation === 'horizontal') {
                if (mixedT.missingDirection === 'north') faceHalfSign = -1;
                else if (mixedT.missingDirection === 'south') faceHalfSign = 1;
            } else {
                if (mixedT.missingDirection === 'east') faceHalfSign = 1;
                else if (mixedT.missingDirection === 'west') faceHalfSign = -1;
            }
            if (!faceHalfSign) return null;

            const length = requestedFrameInwardSpan;
            const tipLocalCoordinate = arrowAtStart
                ? (-length / 2 + mixedPlusPerpendicularShift)
                : (length / 2 - mixedPlusPerpendicularShift);
            const apexAlong = orientation === 'vertical' ? apexY : apexX;
            const longitudinalOffset = apexAlong - tipLocalCoordinate;
            const perpendicularOffset = orientation === 'vertical' ? apexX : apexY;

            return Object.freeze({
                id: `reentrant-filler-${junction.key}`,
                pieceType: 'half-mullion',
                sourceDividerId: sourceDivider.id,
                sourceTemplateId: sourceDivider.templateId || null,
                sourceReversed: Boolean(sourceDivider.reversed),
                direction: mixedT.missingDirection,
                extrusionDirection: fillerDirection,
                orientation,
                faceHalfSign,
                length,
                perpendicularOffset,
                longitudinalOffset,
                apexX,
                apexY,
                joint: Object.freeze({
                    negativeEndMode: arrowAtStart ? 'arrow' : 'square',
                    positiveEndMode: arrowAtStart ? 'square' : 'arrow',
                    negativeFrameInwardSpan: requestedFrameInwardSpan,
                    positiveFrameInwardSpan: requestedFrameInwardSpan,
                    negativeArrowFaceBias: 0,
                    positiveArrowFaceBias: 0,
                    faceHalfSign,
                }),
            });
        })
        .filter(Boolean);

    const rectangularDividerHostFillers = physicalIntersections
        .flatMap(junction => {
            if ((junction?.type !== 'T' && junction?.type !== 'cross') || !junction?.hostOrientation) {
                return [];
            }

            const hostArms = junction.activeDirections
                .map(direction => junction.arms?.[direction])
                .filter(arm => arm?.kind === 'divider' && arm.orientation === junction.hostOrientation);
            const branchArms = junction.activeDirections
                .map(direction => junction.arms?.[direction])
                .filter(arm => arm?.kind === 'divider' && arm.orientation !== junction.hostOrientation);
            if (!hostArms.length || !branchArms.length) return [];

            const sourceHostArm = [...hostArms]
                .sort((a, b) => String(a.segmentId).localeCompare(String(b.segmentId)))[0];
            const sourceDivider = dividerSegments.find(segment => segment.id === sourceHostArm?.segmentId);
            if (!sourceDivider) return [];

            return branchArms
                .map(branchArm => {
                    let faceHalfSign = 0;
                    if (junction.hostOrientation === 'horizontal') {
                        if (branchArm.direction === 'north') faceHalfSign = -1;
                        else if (branchArm.direction === 'south') faceHalfSign = 1;
                    } else {
                        if (branchArm.direction === 'east') faceHalfSign = 1;
                        else if (branchArm.direction === 'west') faceHalfSign = -1;
                    }
                    if (!faceHalfSign) return null;

                    return Object.freeze({
                        id: `rectangular-host-filler-${junction.key}-${branchArm.direction}`,
                        pieceType: 'half-mullion',
                        fillerKind: 'rectangular-host',
                        clipShape: 'host-inner-band',
                        triangleSpan: INTERSECTION_HOST_INNER_FACE_M,
                        innerFaceSpan: INTERSECTION_HOST_INNER_FACE_M,
                        gridSetback: getRectangularDividerSetback({
                            dividerFaceSpan: normalizedDividerFaceSpan,
                            hostInnerFaceSpan: INTERSECTION_HOST_INNER_FACE_M,
                        }),
                        renderAsSeparateMesh: false,
                        sourceDividerId: sourceDivider.id,
                        sourceTemplateId: sourceDivider.templateId || null,
                        sourceReversed: Boolean(sourceDivider.reversed),
                        direction: branchArm.direction,
                        orientation: junction.hostOrientation,
                        faceHalfSign,
                        length: RECTANGULAR_DIVIDER_SETBACK_M * 2,
                        perpendicularOffset: junction.hostOrientation === 'vertical'
                            ? finiteNumber(junction.x)
                            : finiteNumber(junction.y),
                        longitudinalOffset: junction.hostOrientation === 'vertical'
                            ? finiteNumber(junction.y)
                            : finiteNumber(junction.x),
                        apexX: finiteNumber(junction.x),
                        apexY: finiteNumber(junction.y),
                    });
                })
                .filter(Boolean);
        });

    const dividerFillers = Object.freeze([
        ...reentrantFillers,
        ...rectangularDividerHostFillers,
    ]);

    // junctions remains the divider-facing renderer API. It now contains every
    // physical point that has at least one divider, with its frame arms attached.
    const junctions = physicalIntersections.filter(junction => junction.dividerCount >= 2);

    const overallMinX = cells.length ? Math.min(...cells.map(cell => finiteNumber(cell.actualX0))) : -normalizedWidth / 2;
    const overallMaxX = cells.length ? Math.max(...cells.map(cell => finiteNumber(cell.actualX1))) : normalizedWidth / 2;
    const overallMinY = cells.length ? Math.min(...cells.map(cell => finiteNumber(cell.actualY0))) : -normalizedHeight / 2;
    const overallMaxY = cells.length ? Math.max(...cells.map(cell => finiteNumber(cell.actualY1))) : normalizedHeight / 2;

    return Object.freeze({
        usesSizedGrid,
        frameFaceSpan: requestedFrameFaceSpan,
        frameInwardSpan: requestedFrameInwardSpan,
        dividerFaceSpan: normalizedDividerFaceSpan,
        frameReferenceOffsetX,
        frameReferenceOffsetY,
        overallMinX,
        overallMaxX,
        overallMinY,
        overallMaxY,
        overallWidth: Math.max(0, overallMaxX - overallMinX),
        overallHeight: Math.max(0, overallMaxY - overallMinY),
        cells: Object.freeze(cells.map(cell => Object.freeze({
            ...cell,
            dividerJoinSideByBoundary: Object.freeze({ ...cell.dividerJoinSideByBoundary }),
            transJoinSideByBoundary: Object.freeze({ ...cell.transJoinSideByBoundary }),
        }))),
        framePlacements: Object.freeze(framePlacements),
        dividerSegments: Object.freeze(dividerSegments.map(divider => Object.freeze(divider))),
        transSegments: Object.freeze(transSegments.map(trans => Object.freeze(trans))),
        junctions: Object.freeze(junctions),
        physicalIntersections: Object.freeze(physicalIntersections),
        perimeterJunctions: Object.freeze(perimeterJunctions),
        halfFrameFillers: Object.freeze(halfFrameFillers),
        dividerRectangularSetback: RECTANGULAR_DIVIDER_SETBACK_M,
        reentrantFillers: dividerFillers,
        gridLinePieces: Object.freeze([
            ...framePlacements.map(piece => Object.freeze({
                id: piece.id,
                pieceType: 'frame',
                orientation: piece.orientation,
                coordinate: piece.structuralPerpendicularOffset,
                start: piece.structuralWorldStart,
                end: piece.structuralWorldEnd,
                renderPerpendicularOffset: piece.perpendicularOffset,
                source: piece,
            })),
            ...dividerSegments.map(piece => Object.freeze({
                id: piece.id,
                pieceType: 'mullion',
                orientation: piece.orientation,
                coordinate: piece.structuralPerpendicularOffset,
                start: piece.structuralWorldStart,
                end: piece.structuralWorldEnd,
                renderPerpendicularOffset: piece.perpendicularOffset,
                source: piece,
            })),
            ...transSegments.map(piece => Object.freeze({
                id: piece.id,
                pieceType: 'trans',
                orientation: piece.orientation,
                coordinate: piece.structuralPerpendicularOffset,
                start: piece.structuralWorldStart,
                end: piece.structuralWorldEnd,
                renderPerpendicularOffset: piece.perpendicularOffset,
                source: piece,
            })),
            ...halfFrameFillers.map(piece => Object.freeze({
                id: piece.id,
                pieceType: 'half-frame',
                orientation: piece.orientation,
                coordinate: piece.orientation === 'horizontal' ? piece.apexY : piece.apexX,
                start: (piece.orientation === 'horizontal' ? piece.apexX : piece.apexY)
                    - piece.frameReferenceSpan,
                end: (piece.orientation === 'horizontal' ? piece.apexX : piece.apexY)
                    + piece.frameReferenceSpan,
                renderPerpendicularOffset: piece.orientation === 'horizontal'
                    ? piece.apexY
                    : piece.apexX,
                source: piece,
            })),
            ...dividerFillers.map(piece => Object.freeze({
                id: piece.id,
                pieceType: 'half-mullion',
                orientation: piece.orientation,
                coordinate: piece.perpendicularOffset,
                start: piece.longitudinalOffset - piece.length / 2,
                end: piece.longitudinalOffset + piece.length / 2,
                renderPerpendicularOffset: piece.perpendicularOffset,
                source: piece,
            })),
        ]),
    });
}
