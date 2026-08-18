const EPSILON = 1e-9;

function clonePoint(point) {
    return { x: point.x, y: point.y, z: point.z, scalar: point.scalar };
}

function interpolatePoint(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        scalar: 0,
    };
}

function clipPolygon(vertices, keepPositive) {
    if (!vertices.length) return [];

    const result = [];
    const isInside = value => keepPositive ? value >= -EPSILON : value <= EPSILON;

    for (let index = 0; index < vertices.length; index += 1) {
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        const currentInside = isInside(current.scalar);
        const nextInside = isInside(next.scalar);

        if (currentInside) {
            result.push(clonePoint(current));
        }

        if (currentInside !== nextInside) {
            const denominator = current.scalar - next.scalar;
            const t = Math.abs(denominator) <= EPSILON
                ? 0
                : current.scalar / denominator;
            result.push(interpolatePoint(current, next, t));
        }
    }

    return result;
}

function triangulatePolygon(vertices) {
    if (vertices.length < 3) return [];
    const triangles = [];
    for (let index = 1; index < vertices.length - 1; index += 1) {
        triangles.push([
            vertices[0],
            vertices[index],
            vertices[index + 1],
        ]);
    }
    return triangles;
}

export function splitTriangleAtScalarZero(vertices) {
    const normalized = vertices.map(vertex => ({
        x: Number(vertex.x) || 0,
        y: Number(vertex.y) || 0,
        z: Number(vertex.z) || 0,
        scalar: Number(vertex.scalar) || 0,
    }));

    const hasPositive = normalized.some(vertex => vertex.scalar > EPSILON);
    const hasNegative = normalized.some(vertex => vertex.scalar < -EPSILON);

    if (!hasPositive || !hasNegative) {
        return [normalized.map(clonePoint)];
    }

    return [
        ...triangulatePolygon(clipPolygon(normalized, true)),
        ...triangulatePolygon(clipPolygon(normalized, false)),
    ];
}
