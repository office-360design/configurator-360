import * as THREE from 'three';

// CAD/DXF exports contain circles and rounded profile edges as hundreds of
// tiny straight SVG segments. A sub-0.05 mm contour tolerance is visually
// imperceptible at real scale, but removes most redundant points before
// Three.js creates caps and extrusion side walls.
export const PROFILE_CURVE_SEGMENTS = 3;
const PROFILE_SIMPLIFY_TOLERANCE_MM = Object.freeze({
    alu: 0.04,
    epdm: 0.025,
    centralSeal: 0.025,
    glass: 0.03,
    iso: 0.05,
    foam: 0.05,
    default: 0.04,
});

function distanceToSegmentSquared(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return point.distanceToSquared(start);
    const t = THREE.MathUtils.clamp(
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
        0,
        1
    );
    const px = start.x + t * dx;
    const py = start.y + t * dy;
    const ox = point.x - px;
    const oy = point.y - py;
    return ox * ox + oy * oy;
}

function simplifyOpenPoints(points, toleranceSquared) {
    if (points.length <= 2) return points.slice();
    const first = points[0];
    const last = points[points.length - 1];
    let furthestIndex = -1;
    let furthestDistance = -1;

    for (let index = 1; index < points.length - 1; index += 1) {
        const distance = distanceToSegmentSquared(points[index], first, last);
        if (distance > furthestDistance) {
            furthestDistance = distance;
            furthestIndex = index;
        }
    }

    if (furthestDistance <= toleranceSquared || furthestIndex < 0) {
        return [first.clone(), last.clone()];
    }

    const left = simplifyOpenPoints(points.slice(0, furthestIndex + 1), toleranceSquared);
    const right = simplifyOpenPoints(points.slice(furthestIndex), toleranceSquared);
    return left.slice(0, -1).concat(right);
}

function simplifyClosedContour(sourcePoints, toleranceMm) {
    const toleranceSquared = toleranceMm * toleranceMm;
    const duplicateToleranceSquared = Math.max(1e-12, toleranceSquared * 0.0004);
    const points = [];

    for (const sourcePoint of sourcePoints || []) {
        const point = new THREE.Vector2(sourcePoint.x, sourcePoint.y);
        if (
            points.length === 0
            || point.distanceToSquared(points[points.length - 1]) > duplicateToleranceSquared
        ) {
            points.push(point);
        }
    }

    if (
        points.length > 1
        && points[0].distanceToSquared(points[points.length - 1]) <= duplicateToleranceSquared
    ) {
        points.pop();
    }
    if (points.length <= 3) return points;

    let oppositeIndex = 1;
    let maximumDistance = -1;
    for (let index = 1; index < points.length; index += 1) {
        const distance = points[0].distanceToSquared(points[index]);
        if (distance > maximumDistance) {
            maximumDistance = distance;
            oppositeIndex = index;
        }
    }

    const firstChain = points.slice(0, oppositeIndex + 1);
    const secondChain = points.slice(oppositeIndex).concat(points[0]);
    const simplifiedFirst = simplifyOpenPoints(firstChain, toleranceSquared);
    const simplifiedSecond = simplifyOpenPoints(secondChain, toleranceSquared);
    const simplified = simplifiedFirst.slice(0, -1).concat(simplifiedSecond.slice(0, -1));
    return simplified.length >= 3 ? simplified : points;
}

function appendClosedContour(path, points) {
    if (!points || points.length < 3) return false;
    path.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
        path.lineTo(points[index].x, points[index].y);
    }
    path.closePath();
    return true;
}

export function simplifyProfileShape(sourceShape, materialKey) {
    const toleranceMm = PROFILE_SIMPLIFY_TOLERANCE_MM[materialKey]
        ?? PROFILE_SIMPLIFY_TOLERANCE_MM.default;
    const extracted = sourceShape.extractPoints(PROFILE_CURVE_SEGMENTS);
    const sourcePointCount = extracted.shape.length
        + (extracted.holes || []).reduce((sum, hole) => sum + hole.length, 0);
    const outer = simplifyClosedContour(extracted.shape, toleranceMm);
    if (outer.length < 3) return sourceShape;

    const shape = new THREE.Shape();
    appendClosedContour(shape, outer);
    let optimizedPointCount = outer.length;
    for (const sourceHole of extracted.holes || []) {
        const holePoints = simplifyClosedContour(sourceHole, toleranceMm * 0.8);
        const hole = new THREE.Path();
        if (appendClosedContour(hole, holePoints)) {
            shape.holes.push(hole);
            optimizedPointCount += holePoints.length;
        }
    }
    shape.userData = {
        sourcePointCount,
        optimizedPointCount,
        toleranceMm,
    };
    return shape;
}

export function createRoundedRectShape(width, height, radius) {
    const w = width / 2;
    const h = height / 2;
    const r = Math.min(radius, w, h);

    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    return shape;
}
