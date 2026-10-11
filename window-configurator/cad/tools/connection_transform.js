function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAffine(transform = {}) {
    return {
        a: finiteNumber(transform.a, 1),
        b: finiteNumber(transform.b, 0),
        c: finiteNumber(transform.c, 0),
        d: finiteNumber(transform.d, 1),
        tx: finiteNumber(transform.tx, 0),
        ty: finiteNumber(transform.ty, 0),
    };
}

function transformPoint(transform, point) {
    const matrix = normalizeAffine(transform);
    const x = finiteNumber(point?.x, 0);
    const y = finiteNumber(point?.y, 0);
    return {
        x: matrix.a * x + matrix.b * y + matrix.tx,
        y: matrix.c * x + matrix.d * y + matrix.ty,
    };
}

function transformBbox(bbox, transform) {
    if (!bbox) return null;
    const corners = [
        transformPoint(transform, { x: bbox.minX, y: bbox.minY }),
        transformPoint(transform, { x: bbox.minX, y: bbox.maxY }),
        transformPoint(transform, { x: bbox.maxX, y: bbox.minY }),
        transformPoint(transform, { x: bbox.maxX, y: bbox.maxY }),
    ];
    return {
        minX: Math.min(...corners.map(point => point.x)),
        minY: Math.min(...corners.map(point => point.y)),
        maxX: Math.max(...corners.map(point => point.x)),
        maxY: Math.max(...corners.map(point => point.y)),
    };
}

function multiplyAffine(left, right) {
    const a = normalizeAffine(left);
    const b = normalizeAffine(right);
    return {
        a: a.a * b.a + a.b * b.c,
        b: a.a * b.b + a.b * b.d,
        c: a.c * b.a + a.d * b.c,
        d: a.c * b.b + a.d * b.d,
        tx: a.a * b.tx + a.b * b.ty + a.tx,
        ty: a.c * b.tx + a.d * b.ty + a.ty,
    };
}

function invertAffine(transform) {
    const matrix = normalizeAffine(transform);
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (Math.abs(determinant) < 1e-10) {
        throw new Error('Cannot invert a singular CAD transform.');
    }
    const inverseLinear = {
        a: matrix.d / determinant,
        b: -matrix.b / determinant,
        c: -matrix.c / determinant,
        d: matrix.a / determinant,
        tx: 0,
        ty: 0,
    };
    const translatedOrigin = transformPoint(inverseLinear, {
        x: -matrix.tx,
        y: -matrix.ty,
    });
    inverseLinear.tx = translatedOrigin.x;
    inverseLinear.ty = translatedOrigin.y;
    return inverseLinear;
}

function getRelativeTransform(sourceTransform, targetTransform) {
    return multiplyAffine(targetTransform, invertAffine(sourceTransform));
}

function bboxErrorMm(actual, expected) {
    if (!actual || !expected) return Infinity;
    return Math.sqrt((
        (finiteNumber(actual.minX) - finiteNumber(expected.minX)) ** 2
        + (finiteNumber(actual.minY) - finiteNumber(expected.minY)) ** 2
        + (finiteNumber(actual.maxX) - finiteNumber(expected.maxX)) ** 2
        + (finiteNumber(actual.maxY) - finiteNumber(expected.maxY)) ** 2
    ) / 4);
}

function transformDistance(left, right) {
    const a = normalizeAffine(left);
    const b = normalizeAffine(right);
    return Math.max(
        Math.abs(a.a - b.a),
        Math.abs(a.b - b.b),
        Math.abs(a.c - b.c),
        Math.abs(a.d - b.d),
        Math.abs(a.tx - b.tx),
        Math.abs(a.ty - b.ty),
    );
}

function unionBboxes(boxes) {
    const valid = (boxes || []).filter(Boolean);
    if (!valid.length) return null;
    return {
        minX: Math.min(...valid.map(box => finiteNumber(box.minX))),
        minY: Math.min(...valid.map(box => finiteNumber(box.minY))),
        maxX: Math.max(...valid.map(box => finiteNumber(box.maxX))),
        maxY: Math.max(...valid.map(box => finiteNumber(box.maxY))),
    };
}

function normalizeBlockName(value) {
    return String(value || '').trim().toLowerCase();
}

function componentNamesMatch(source, target) {
    const sourceBlockName = normalizeBlockName(source?.blockName);
    const targetBlockName = normalizeBlockName(target?.blockName);
    return Boolean(sourceBlockName && sourceBlockName === targetBlockName);
}

function clusterCandidateTransforms(candidates, tolerance = 0.25) {
    const clusters = [];
    for (const candidate of candidates) {
        let cluster = clusters.find(item => transformDistance(item.transform, candidate.transform) <= tolerance);
        if (!cluster) {
            cluster = {
                transform: candidate.transform,
                candidates: [],
            };
            clusters.push(cluster);
        }
        cluster.candidates.push(candidate);
    }
    return clusters.sort((left, right) =>
        right.candidates.length - left.candidates.length
        || left.candidates.reduce((sum, item) => sum + item.bboxErrorMm, 0)
            - right.candidates.reduce((sum, item) => sum + item.bboxErrorMm, 0)
    );
}

function fitProfileOccurrences({
    profileId,
    standaloneComponents,
    connectionComponents,
    bboxToleranceMm = 0.5,
    transformClusterTolerance = 0.25,
    allowSingleExplicitProfileMatch = false,
    allowSingleComponentMatch = false,
    preferExplicitProfileMatch = false,
}) {
    const sourceComponents = (standaloneComponents || []).filter(component =>
        component?.bbox && component?.sourceTransform
    );
    const targetComponents = (connectionComponents || []).filter(component =>
        component?.bbox && component?.sourceTransform
    );
    const candidates = [];

    for (const source of sourceComponents) {
        for (const target of targetComponents) {
            if (!componentNamesMatch(source, target)) continue;
            let transform;
            try {
                transform = getRelativeTransform(source.sourceTransform, target.sourceTransform);
            } catch (_error) {
                continue;
            }
            const transformedBbox = transformBbox(source.bbox, transform);
            const error = bboxErrorMm(transformedBbox, target.bbox);
            if (error > bboxToleranceMm) continue;
            const normalizedProfileId = normalizeBlockName(profileId);
            const explicitProfileMatch = Boolean(
                normalizedProfileId
                && normalizeBlockName(source.blockName).includes(normalizedProfileId)
            );
            candidates.push({
                sourceComponentId: source.id,
                targetComponentId: target.id,
                targetBbox: target.bbox,
                bboxErrorMm: error,
                transform,
                explicitProfileMatch,
            });
        }
    }

    const clusters = clusterCandidateTransforms(candidates, transformClusterTolerance);
    const minMatches = Math.min(2, Math.max(1, sourceComponents.length));
    let eligibleClusters = clusters
        .filter(cluster =>
            cluster.candidates.length >= minMatches
            || (allowSingleComponentMatch && cluster.candidates.length >= 1)
            || (
                allowSingleExplicitProfileMatch
                && cluster.candidates.some(candidate => candidate.explicitProfileMatch)
            )
        );

    // A glazing-bead family can legitimately share a retaining child INSERT
    // (for example 244511_s_2).  That child is useful as a last-resort anchor
    // when the actual bead block is absent, but it must never outrank an exact
    // 573940_s INSERT when the join contains one.  Otherwise a perfectly valid
    // join can resolve to the retaining child of a different occurrence and the
    // complete metal bead is placed on the wrong side of the assembly.
    if (preferExplicitProfileMatch) {
        const explicitClusters = eligibleClusters.filter(cluster =>
            cluster.candidates.some(candidate => candidate.explicitProfileMatch)
        );
        if (explicitClusters.length) {
            eligibleClusters = explicitClusters;
        }
    }

    return eligibleClusters
        .map((cluster, occurrenceIndex) => {
            const targetBoxes = cluster.candidates.map(candidate => candidate.targetBbox);
            const bbox = unionBboxes(targetBoxes);
            const determinant = cluster.transform.a * cluster.transform.d
                - cluster.transform.b * cluster.transform.c;
            const explicitProfileMatchCount = cluster.candidates.filter(
                candidate => candidate.explicitProfileMatch
            ).length;
            return {
                occurrenceIndex,
                profileId,
                transform: normalizeAffine(cluster.transform),
                determinant,
                mirrored: determinant < 0,
                bbox,
                matchedComponentCount: cluster.candidates.length,
                explicitProfileMatchCount,
                matchStrategy: explicitProfileMatchCount
                    ? 'explicit-profile-component'
                    : 'shared-component-fallback',
                maxBboxErrorMm: Math.max(...cluster.candidates.map(candidate => candidate.bboxErrorMm)),
                matches: cluster.candidates.map(candidate => ({
                    sourceComponentId: candidate.sourceComponentId,
                    targetComponentId: candidate.targetComponentId,
                    bboxErrorMm: candidate.bboxErrorMm,
                })),
            };
        });
}

module.exports = {
    bboxErrorMm,
    componentNamesMatch,
    fitProfileOccurrences,
    getRelativeTransform,
    invertAffine,
    multiplyAffine,
    normalizeAffine,
    transformBbox,
    transformDistance,
    transformPoint,
    unionBboxes,
};
