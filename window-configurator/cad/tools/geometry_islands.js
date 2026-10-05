const DEFAULT_ISLAND_GAP_MM = 0.25;

function isFinitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getPathsBBox(paths) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pathObject of paths || []) {
        for (const point of pathObject.points || []) {
            if (!isFinitePoint(point)) continue;
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return { minX, minY, maxX, maxY };
}

function bboxGapDistance(boxA, boxB) {
    const distX = Math.max(0, boxA.minX - boxB.maxX, boxB.minX - boxA.maxX);
    const distY = Math.max(0, boxA.minY - boxB.maxY, boxB.minY - boxA.maxY);
    return Math.hypot(distX, distY);
}

// A CAD block can contain more than one disconnected geometry island.
// Contours whose bounds overlap remain together so holes stay attached to
// their outer contour, while genuinely detached geometry becomes independent.
function splitPathsIntoGeometryIslands(paths, maxGapMm = DEFAULT_ISLAND_GAP_MM) {
    const entries = (paths || [])
        .map(pathObject => ({ pathObject, bbox: getPathsBBox([pathObject]) }))
        .filter(entry => entry.bbox);

    if (entries.length <= 1) return entries.length ? [[entries[0].pathObject]] : [];

    const visited = new Set();
    const islands = [];

    for (let start = 0; start < entries.length; start += 1) {
        if (visited.has(start)) continue;
        const queue = [start];
        const island = [];
        visited.add(start);

        while (queue.length > 0) {
            const currentIndex = queue.shift();
            const current = entries[currentIndex];
            island.push(current.pathObject);

            for (let candidateIndex = 0; candidateIndex < entries.length; candidateIndex += 1) {
                if (visited.has(candidateIndex)) continue;
                const candidate = entries[candidateIndex];
                if (bboxGapDistance(current.bbox, candidate.bbox) <= maxGapMm) {
                    visited.add(candidateIndex);
                    queue.push(candidateIndex);
                }
            }
        }

        islands.push(island);
    }

    return islands;
}

module.exports = {
    DEFAULT_ISLAND_GAP_MM,
    bboxGapDistance,
    getPathsBBox,
    splitPathsIntoGeometryIslands
};
