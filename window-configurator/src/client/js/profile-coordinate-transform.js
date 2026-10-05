const QUARTER_TURN_TRANSFORMS = Object.freeze([
    Object.freeze({ rotationDeg: 0, a: 1, b: 0, c: 0, d: 1 }),
    Object.freeze({ rotationDeg: 90, a: 0, b: 1, c: -1, d: 0 }),
    Object.freeze({ rotationDeg: 180, a: -1, b: 0, c: 0, d: -1 }),
    Object.freeze({ rotationDeg: 270, a: 0, b: -1, c: 1, d: 0 }),
]);
const MIRRORED_QUARTER_TURN_TRANSFORMS = Object.freeze([
    Object.freeze({ rotationDeg: 0, mirrored: true, a: -1, b: 0, c: 0, d: 1 }),
    Object.freeze({ rotationDeg: 90, mirrored: true, a: 0, b: 1, c: 1, d: 0 }),
    Object.freeze({ rotationDeg: 180, mirrored: true, a: 1, b: 0, c: 0, d: -1 }),
    Object.freeze({ rotationDeg: 270, mirrored: true, a: 0, b: -1, c: -1, d: 0 }),
]);


function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBlockName(value) {
    return String(value || '').trim().toLowerCase();
}

function bboxCenter(bbox) {
    return {
        x: (finiteNumber(bbox?.minX) + finiteNumber(bbox?.maxX)) / 2,
        y: (finiteNumber(bbox?.minY) + finiteNumber(bbox?.maxY)) / 2,
    };
}

export function transformCadPoint(transform, x, y) {
    if (!transform) {
        return { x: finiteNumber(x), y: finiteNumber(y) };
    }

    const sourceX = finiteNumber(x);
    const sourceY = finiteNumber(y);
    return {
        x: finiteNumber(transform.a, 1) * sourceX
            + finiteNumber(transform.b) * sourceY
            + finiteNumber(transform.tx),
        y: finiteNumber(transform.c) * sourceX
            + finiteNumber(transform.d, 1) * sourceY
            + finiteNumber(transform.ty),
    };
}


export function translateCadTransformSource(transform, deltaX = 0, deltaY = 0) {
    return composeCadTransforms(
        transform,
        Object.freeze({
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            tx: finiteNumber(deltaX),
            ty: finiteNumber(deltaY),
        })
    );
}

export function composeCadTransforms(outerTransform, innerTransform) {
    const outer = outerTransform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    const inner = innerTransform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

    const oa = finiteNumber(outer.a, 1);
    const ob = finiteNumber(outer.b);
    const oc = finiteNumber(outer.c);
    const od = finiteNumber(outer.d, 1);
    const otx = finiteNumber(outer.tx);
    const oty = finiteNumber(outer.ty);
    const ia = finiteNumber(inner.a, 1);
    const ib = finiteNumber(inner.b);
    const ic = finiteNumber(inner.c);
    const id = finiteNumber(inner.d, 1);
    const itx = finiteNumber(inner.tx);
    const ity = finiteNumber(inner.ty);

    return Object.freeze({
        a: oa * ia + ob * ic,
        b: oa * ib + ob * id,
        c: oc * ia + od * ic,
        d: oc * ib + od * id,
        tx: oa * itx + ob * ity + otx,
        ty: oc * itx + od * ity + oty,
    });
}

export function invertCadTransform(transform) {
    if (!transform) return null;
    const a = finiteNumber(transform.a, 1);
    const b = finiteNumber(transform.b);
    const c = finiteNumber(transform.c);
    const d = finiteNumber(transform.d, 1);
    const tx = finiteNumber(transform.tx);
    const ty = finiteNumber(transform.ty);
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-10) {
        throw new Error('Cannot invert a degenerate CAD transform.');
    }
    return Object.freeze({
        a: d / determinant,
        b: -b / determinant,
        c: -c / determinant,
        d: a / determinant,
        tx: (b * ty - d * tx) / determinant,
        ty: (c * tx - a * ty) / determinant,
    });
}

export function transformCadBbox(bbox, transform) {
    if (!bbox) return null;

    const corners = [
        transformCadPoint(transform, bbox.minX, bbox.minY),
        transformCadPoint(transform, bbox.minX, bbox.maxY),
        transformCadPoint(transform, bbox.maxX, bbox.minY),
        transformCadPoint(transform, bbox.maxX, bbox.maxY),
    ];

    return {
        minX: Math.min(...corners.map(point => point.x)),
        minY: Math.min(...corners.map(point => point.y)),
        maxX: Math.max(...corners.map(point => point.x)),
        maxY: Math.max(...corners.map(point => point.y)),
    };
}

function bboxErrorSquared(actual, expected) {
    return (
        (actual.minX - expected.minX) ** 2
        + (actual.minY - expected.minY) ** 2
        + (actual.maxX - expected.maxX) ** 2
        + (actual.maxY - expected.maxY) ** 2
    );
}

/**
 * Fits a standalone profile's CAD coordinate system to the already aligned
 * top cross-section from a legacy complete assembly. Only quarter-turn
 * rotations are considered; no mirroring is introduced.
 */
export function fitStandaloneProfileTransform({
    sourceProfiles,
    targetProfiles,
    maxRmsErrorMm = 0.25,
    allowMirror = false,
}) {
    const targetsByBlockName = new Map();
    for (const target of targetProfiles || []) {
        const key = normalizeBlockName(target?.blockName);
        if (!key || !target?.bbox || targetsByBlockName.has(key)) continue;
        targetsByBlockName.set(key, target);
    }

    const matches = (sourceProfiles || [])
        .map(source => {
            const key = normalizeBlockName(source?.blockName);
            const target = targetsByBlockName.get(key);
            if (!source?.bbox || !target?.bbox) return null;
            return { source, target };
        })
        .filter(Boolean);

    if (matches.length < 2) {
        throw new Error(
            `Standalone profile alignment needs at least two matching components; found ${matches.length}.`
        );
    }

    const candidateBases = allowMirror
        ? [...QUARTER_TURN_TRANSFORMS, ...MIRRORED_QUARTER_TURN_TRANSFORMS]
        : QUARTER_TURN_TRANSFORMS;
    const candidates = candidateBases.map(baseTransform => {
        const offsets = matches.map(({ source, target }) => {
            const sourceCenter = bboxCenter(source.bbox);
            const targetCenter = bboxCenter(target.bbox);
            const rotatedCenter = transformCadPoint(baseTransform, sourceCenter.x, sourceCenter.y);
            return {
                tx: targetCenter.x - rotatedCenter.x,
                ty: targetCenter.y - rotatedCenter.y,
            };
        });

        const transform = {
            ...baseTransform,
            tx: offsets.reduce((sum, item) => sum + item.tx, 0) / offsets.length,
            ty: offsets.reduce((sum, item) => sum + item.ty, 0) / offsets.length,
        };

        const totalSquaredError = matches.reduce((sum, { source, target }) => {
            const transformed = transformCadBbox(source.bbox, transform);
            return sum + bboxErrorSquared(transformed, target.bbox);
        }, 0);

        return {
            ...transform,
            matchCount: matches.length,
            rmsErrorMm: Math.sqrt(totalSquaredError / (matches.length * 4)),
        };
    });

    candidates.sort((left, right) => left.rmsErrorMm - right.rmsErrorMm);
    const best = candidates[0];

    if (!best || best.rmsErrorMm > maxRmsErrorMm) {
        const measured = best ? `${best.rmsErrorMm.toFixed(3)} mm` : 'unavailable';
        throw new Error(
            `Standalone profile alignment exceeds the ${maxRmsErrorMm} mm tolerance (${measured}).`
        );
    }

    return Object.freeze(best);
}

export function getAlignedLegacyBbox(profile) {
    if (!profile?.bbox) return null;

    const shiftX = finiteNumber(profile.cadAlignmentShiftXMm);
    const shiftY = finiteNumber(profile.cadAlignmentShiftYMm);
    return {
        minX: finiteNumber(profile.bbox.minX) + shiftX,
        minY: finiteNumber(profile.bbox.minY) + shiftY,
        maxX: finiteNumber(profile.bbox.maxX) + shiftX,
        maxY: finiteNumber(profile.bbox.maxY) + shiftY,
    };
}
