const AXIS_EPSILON = 1 / 64;
const VECTOR_EPSILON = 1e-12;

function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeVector(vector, fallback = { x: 0, y: 0, z: 1 }) {
    const x = finiteNumber(vector?.x, fallback.x);
    const y = finiteNumber(vector?.y, fallback.y);
    const z = finiteNumber(vector?.z, fallback.z);
    const length = Math.hypot(x, y, z);
    if (length <= VECTOR_EPSILON) return { ...fallback };
    return { x: x / length, y: y / length, z: z / length };
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

// AutoCAD Arbitrary Axis Algorithm (AAA).
// DXF INSERT coordinates are expressed in the insert's Object Coordinate
// System. Both the insertion point and the transformed block vectors must be
// converted to World Coordinates. Mirroring only the block geometry for a
// negative Z extrusion leaves the insertion point in OCS and shifts reflected
// nested blocks to the wrong side of the profile.
function getOcsBasis(extrusionDirection) {
    const normal = normalizeVector(extrusionDirection || { x: 0, y: 0, z: 1 });
    const referenceAxis = Math.abs(normal.x) < AXIS_EPSILON && Math.abs(normal.y) < AXIS_EPSILON
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 };
    const xAxis = normalizeVector(cross(referenceAxis, normal), { x: 1, y: 0, z: 0 });
    const yAxis = normalizeVector(cross(normal, xAxis), { x: 0, y: 1, z: 0 });
    return { xAxis, yAxis, normal };
}

function ocsToWorld(point, basis) {
    const x = finiteNumber(point?.x, 0);
    const y = finiteNumber(point?.y, 0);
    const z = finiteNumber(point?.z, 0);
    return {
        x: x * basis.xAxis.x + y * basis.yAxis.x + z * basis.normal.x,
        y: x * basis.xAxis.y + y * basis.yAxis.y + z * basis.normal.y,
        z: x * basis.xAxis.z + y * basis.yAxis.z + z * basis.normal.z
    };
}

function createInsertTransform(insert, parentTransform = null, blockBasePoint = null) {
    const position = insert?.position || { x: 0, y: 0, z: 0 };
    const base = blockBasePoint || { x: 0, y: 0, z: 0 };
    const scaleX = insert?.xScale !== undefined ? finiteNumber(insert.xScale, 1) : 1;
    const scaleY = insert?.yScale !== undefined ? finiteNumber(insert.yScale, 1) : 1;
    const scaleZ = insert?.zScale !== undefined ? finiteNumber(insert.zScale, 1) : 1;
    const rotation = insert?.rotation !== undefined ? finiteNumber(insert.rotation, 0) : 0;
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const basis = getOcsBasis(insert?.extrusionDirection);
    const worldPosition = ocsToWorld(position, basis);

    return function transformPoint(point) {
        if (!point) return { x: 0, y: 0, z: 0 };

        const localX = finiteNumber(point.x, 0) - finiteNumber(base.x, 0);
        const localY = finiteNumber(point.y, 0) - finiteNumber(base.y, 0);
        const localZ = finiteNumber(point.z, 0) - finiteNumber(base.z, 0);

        const scaledX = localX * scaleX;
        const scaledY = localY * scaleY;
        const rotatedVector = {
            x: scaledX * cos - scaledY * sin,
            y: scaledX * sin + scaledY * cos,
            z: localZ * scaleZ
        };
        const worldVector = ocsToWorld(rotatedVector, basis);
        const transformed = {
            x: worldPosition.x + worldVector.x,
            y: worldPosition.y + worldVector.y,
            z: worldPosition.z + worldVector.z
        };

        return parentTransform ? parentTransform(transformed) : transformed;
    };
}

module.exports = {
    createInsertTransform,
    getOcsBasis,
    ocsToWorld
};
