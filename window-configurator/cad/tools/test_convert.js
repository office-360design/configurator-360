const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createInsertTransform: createTransform } = require('./insert_transform');
const {
    DEFAULT_ISLAND_GAP_MM,
    bboxGapDistance,
    getPathsBBox,
    splitPathsIntoGeometryIslands
} = require('./geometry_islands');

const CAD_COORD_LIMIT = 500;
const MAX_LOCAL_GEOMETRY_SIZE = 500;
const PATH_JOIN_TOLERANCE = 0.1;
const MODEL_SPACE_POLICIES = new Set(['all', 'prefer-inserts', 'inserts-only', 'direct-only']);
const CURVE_STEP_RADIANS = Math.PI / 36; // 5 degrees per segment
const SPLINE_SAMPLES_PER_CONTROL_POINT = 10;
const CAD_ROOT = path.resolve(__dirname, '..');
const INTERMEDIATE_DIR = path.join(CAD_ROOT, 'intermediate');

function findInPath(exeName) {
    try {
        const cmd = process.platform === 'win32' ? `where "${exeName}"` : `which "${exeName}"`;
        const output = execSync(cmd, { stdio: [] }).toString().trim().split(/\r?\n/)[0];
        if (output && fs.existsSync(output)) {
            return output;
        }
    } catch (e) {
        // Ignored
    }
    return null;
}

function findAutoCADConsole() {
    const exeName = process.platform === 'win32' ? 'accoreconsole.exe' : 'accoreconsole';
    const inPath = findInPath(exeName);
    if (inPath) return inPath;

    if (process.platform === 'win32') {
        const searchRoot = 'C:\\Program Files\\Autodesk';
        if (fs.existsSync(searchRoot)) {
            try {
                const dirs = fs.readdirSync(searchRoot);
                for (const dir of dirs) {
                    if (dir.toLowerCase().startsWith('autocad')) {
                        const candidate = path.join(searchRoot, dir, exeName);
                        if (fs.existsSync(candidate)) {
                            return candidate;
                        }
                    }
                }
            } catch (e) {
                // Ignored
            }
        }
        return 'C:\\Program Files\\Autodesk\\AutoCAD 2027\\accoreconsole.exe';
    }
    return exeName;
}

function findODAConverter() {
    const exeName = process.platform === 'win32' ? 'ODAFileConverter.exe' : 'ODAFileConverter';
    const inPath = findInPath(exeName);
    if (inPath) return inPath;

    if (process.platform === 'win32') {
        const searchRoot = 'C:\\Program Files\\ODA';
        if (fs.existsSync(searchRoot)) {
            try {
                const dirs = fs.readdirSync(searchRoot);
                for (const dir of dirs) {
                    if (dir.toLowerCase().startsWith('odafileconverter')) {
                        const candidate = path.join(searchRoot, dir, exeName);
                        if (fs.existsSync(candidate)) {
                            return candidate;
                        }
                    }
                }
            } catch (e) {
                // Ignored
            }
        }
        return 'C:\\Program Files\\ODA\\ODAFileConverter 27.1.0\\ODAFileConverter.exe';
    } else if (process.platform === 'linux') {
        const candidate = '/usr/bin/ODAFileConverter';
        if (fs.existsSync(candidate)) return candidate;
    }
    return exeName;
}

function exportDwgToDxf(dwgFile, dxfFile) {
    const ACAD_CONSOLE = findAutoCADConsole();
    const ODA_CONVERTER = findODAConverter();
    const dwgBase = path.basename(dwgFile, '.dwg');
    const workspaceDir = CAD_ROOT;

    if (fs.existsSync(ACAD_CONSOLE)) {
        console.log('AutoCAD Core Console detected. Exporting via accoreconsole...');
        const scrFile = path.join(INTERMEDIATE_DIR, 'temp_export.scr');

        const scrContent = `(vl-file-delete "${dxfFile.replace(/\\/g, '/')}")
_DXFOUT
"${dxfFile.replace(/\\/g, '/')}"

_QUIT
_N
`;
        fs.writeFileSync(scrFile, scrContent, 'utf-8');

        try {
            const cmd = `"${ACAD_CONSOLE}" /i "${dwgFile}" /s "${scrFile}"`;
            execSync(cmd, { stdio: 'inherit', cwd: workspaceDir });

            if (!fs.existsSync(dxfFile)) {
                throw new Error(`Expected DXF file was not generated at: ${dxfFile}`);
            }
            console.log('DXF export complete via AutoCAD Core Console.');
        } finally {
            if (fs.existsSync(scrFile)) fs.unlinkSync(scrFile);
        }
    } else if (fs.existsSync(ODA_CONVERTER)) {
        console.log('ODA File Converter detected. Exporting via ODAFileConverter...');
        const tempInputDir = path.join(INTERMEDIATE_DIR, 'temp_in');
        const tempOutputDir = path.join(INTERMEDIATE_DIR, 'temp_out');

        if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
        if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
        fs.mkdirSync(tempInputDir, { recursive: true });
        fs.mkdirSync(tempOutputDir, { recursive: true });

        fs.copyFileSync(dwgFile, path.join(tempInputDir, path.basename(dwgFile)));

        try {
            const cmd = `"${ODA_CONVERTER}" "${tempInputDir}" "${tempOutputDir}" "ACAD2018" "DXF" "0" "0" "*.dwg"`;
            execSync(cmd, { stdio: 'inherit', cwd: workspaceDir });

            const expectedDxf = path.join(tempOutputDir, dwgBase + '.dxf');
            if (!fs.existsSync(expectedDxf)) {
                throw new Error(`Expected DXF file was not generated at: ${expectedDxf}`);
            }

            if (fs.existsSync(dxfFile)) fs.unlinkSync(dxfFile);
            fs.copyFileSync(expectedDxf, dxfFile);
            console.log('DXF export complete via ODA File Converter.');
        } finally {
            if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
            if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
        }
    } else {
        throw new Error(`Neither AutoCAD Core Console nor ODA File Converter was found on this system.`);
    }
}

function isFinitePoint(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function clonePoint(p) {
    return { x: Number(p.x), y: Number(p.y), z: Number(p.z || 0) };
}

function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function pointsClose(a, b, tolerance = PATH_JOIN_TOLERANCE) {
    return distanceSquared(a, b) <= tolerance * tolerance;
}

function removeConsecutiveDuplicatePoints(points, tolerance = 1e-9) {
    const result = [];
    for (const point of points || []) {
        if (!isFinitePoint(point)) continue;
        if (result.length === 0 || !pointsClose(result[result.length - 1], point, tolerance)) {
            result.push(clonePoint(point));
        }
    }
    return result;
}

function normalizePath(points, closed, sourceType) {
    const cleaned = removeConsecutiveDuplicatePoints(points);
    if (cleaned.length < 2) return null;

    let isClosed = Boolean(closed);
    if (cleaned.length >= 3 && pointsClose(cleaned[0], cleaned[cleaned.length - 1])) {
        cleaned.pop();
        isClosed = true;
    }

    if (cleaned.length < 2 || (isClosed && cleaned.length < 3)) return null;

    return {
        points: cleaned,
        closed: isClosed,
        sourceTypes: new Set([sourceType])
    };
}

function sampleBulgeSegment(start, end, bulge) {
    if (!bulge || Math.abs(bulge) < 1e-12) {
        return [clonePoint(end)];
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chordLength = Math.hypot(dx, dy);
    if (chordLength < 1e-12) return [];

    const sweep = 4 * Math.atan(bulge);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const leftNormalX = -dy / chordLength;
    const leftNormalY = dx / chordLength;
    const centerOffset = chordLength * (1 - bulge * bulge) / (4 * bulge);

    const center = {
        x: midX + leftNormalX * centerOffset,
        y: midY + leftNormalY * centerOffset
    };

    const radius = Math.hypot(start.x - center.x, start.y - center.y);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const segments = Math.max(2, Math.ceil(Math.abs(sweep) / CURVE_STEP_RADIANS));
    const points = [];

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + sweep * t;
        points.push({
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
        });
    }

    points[points.length - 1] = clonePoint(end);
    return points;
}

function polylineToPath(entity) {
    if (!entity.vertices || entity.vertices.length < 2) return null;

    const vertices = entity.vertices.filter(isFinitePoint);
    if (vertices.length < 2) return null;

    const closed = Boolean(entity.shape);
    const points = [clonePoint(vertices[0])];
    const segmentCount = closed ? vertices.length : vertices.length - 1;

    for (let i = 0; i < segmentCount; i++) {
        const start = vertices[i];
        const end = vertices[(i + 1) % vertices.length];
        points.push(...sampleBulgeSegment(start, end, Number(start.bulge || 0)));
    }

    return normalizePath(points, closed, entity.type);
}

function lineToPath(entity) {
    let start = entity.start;
    let end = entity.end;

    if (!isFinitePoint(start) || !isFinitePoint(end)) {
        const vertices = (entity.vertices || []).filter(isFinitePoint);
        if (vertices.length >= 2) {
            start = vertices[0];
            end = vertices[1];
        }
    }

    if (!isFinitePoint(start) || !isFinitePoint(end)) return null;
    return normalizePath([start, end], false, entity.type);
}

// Convert ARC, CIRCLE, ELLIPSE, SPLINE, SOLID, 3DFACE
function arcToPath(entity) {
    if (!isFinitePoint(entity.center) || !Number.isFinite(entity.radius)) return null;

    const startAngle = Number(entity.startAngle || 0);
    const endAngle = Number(entity.endAngle || 0);

    let sweep = Number(entity.angleLength);
    if (!Number.isFinite(sweep)) {
        sweep = endAngle - startAngle;
    }
    while (sweep <= 0) {
        sweep += 2 * Math.PI;
    }
    while (sweep > 2 * Math.PI) {
        sweep -= 2 * Math.PI;
    }

    if (!Number.isFinite(sweep) || sweep <= 1e-12) return null;

    const segments = Math.max(2, Math.ceil(sweep / CURVE_STEP_RADIANS));
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + sweep * (i / segments);
        points.push({
            x: entity.center.x + entity.radius * Math.cos(angle),
            y: entity.center.y + entity.radius * Math.sin(angle)
        });
    }
    return normalizePath(points, false, entity.type);
}

function circleToPath(entity) {
    if (!isFinitePoint(entity.center) || !Number.isFinite(entity.radius)) return null;

    const segments = Math.max(24, Math.ceil((2 * Math.PI) / CURVE_STEP_RADIANS));
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = 2 * Math.PI * i / segments;
        points.push({
            x: entity.center.x + entity.radius * Math.cos(angle),
            y: entity.center.y + entity.radius * Math.sin(angle)
        });
    }
    return normalizePath(points, true, entity.type);
}

function ellipseToPath(entity) {
    if (!isFinitePoint(entity.center) || !isFinitePoint(entity.majorAxisEndPoint)) return null;

    const majorX = entity.majorAxisEndPoint.x;
    const majorY = entity.majorAxisEndPoint.y;
    const ratio = Number(entity.axisRatio);
    if (!Number.isFinite(ratio)) return null;

    const minorX = -majorY * ratio;
    const minorY = majorX * ratio;

    const start = Number.isFinite(entity.startAngle) ? entity.startAngle : 0;
    let end = Number.isFinite(entity.endAngle) ? entity.endAngle : 2 * Math.PI;
    while (end <= start) end += 2 * Math.PI;
    const sweep = end - start;
    const closed = Math.abs(sweep - 2 * Math.PI) < 1e-6 || sweep > 2 * Math.PI - 1e-6;

    const segments = Math.max(12, Math.ceil(sweep / CURVE_STEP_RADIANS));
    const points = [];
    const endIndex = closed ? segments - 1 : segments;
    for (let i = 0; i <= endIndex; i++) {
        const t = i / segments;
        const angle = start + sweep * t;
        points.push({
            x: entity.center.x + majorX * Math.cos(angle) + minorX * Math.sin(angle),
            y: entity.center.y + majorY * Math.cos(angle) + minorY * Math.sin(angle)
        });
    }

    return normalizePath(points, closed, entity.type);
}

function findKnotSpan(n, degree, u, knots) {
    if (u >= knots[n + 1]) return n;
    if (u <= knots[degree]) return degree;

    let low = degree;
    let high = n + 1;
    let mid = Math.floor((low + high) / 2);

    while (u < knots[mid] || u >= knots[mid + 1]) {
        if (u < knots[mid]) high = mid;
        else low = mid;
        mid = Math.floor((low + high) / 2);
    }
    return mid;
}

function evaluateBSplinePoint(controlPoints, degree, knots, u) {
    const n = controlPoints.length - 1;
    const span = findKnotSpan(n, degree, u, knots);
    const work = [];

    for (let j = 0; j <= degree; j++) {
        work[j] = clonePoint(controlPoints[span - degree + j]);
    }

    for (let r = 1; r <= degree; r++) {
        for (let j = degree; j >= r; j--) {
            const i = span - degree + j;
            const denominator = knots[i + degree - r + 1] - knots[i];
            const alpha = Math.abs(denominator) < 1e-12 ? 0 : (u - knots[i]) / denominator;
            work[j] = {
                x: (1 - alpha) * work[j - 1].x + alpha * work[j].x,
                y: (1 - alpha) * work[j - 1].y + alpha * work[j].y
            };
        }
    }

    return work[degree];
}

function splineToPath(entity) {
    const controls = (entity.controlPoints || []).filter(isFinitePoint);
    const fits = (entity.fitPoints || []).filter(isFinitePoint);
    const degree = Number(entity.degreeOfSplineCurve);
    const knots = (entity.knotValues || []).map(Number).filter(Number.isFinite);

    let points = [];

    const hasValidBSpline = controls.length >= 2 &&
        Number.isInteger(degree) &&
        degree >= 1 &&
        controls.length > degree &&
        knots.length >= controls.length + degree + 1;

    if (hasValidBSpline) {
        const n = controls.length - 1;
        const minU = knots[degree];
        const maxU = knots[n + 1];
        const sampleCount = Math.max(24, controls.length * SPLINE_SAMPLES_PER_CONTROL_POINT);

        if (Number.isFinite(minU) && Number.isFinite(maxU) && maxU > minU) {
            for (let i = 0; i <= sampleCount; i++) {
                const u = i === sampleCount ? maxU : minU + (maxU - minU) * (i / sampleCount);
                points.push(evaluateBSplinePoint(controls, degree, knots, u));
            }
        }
    }

    if (points.length < 2) {
        points = (fits.length >= 2 ? fits : controls).map(clonePoint);
    }

    return normalizePath(points, Boolean(entity.closed), entity.type);
}

function solidToPath(entity) {
    const points = (entity.points || []).filter(isFinitePoint);
    if (points.length < 3) return null;
    return normalizePath(points, true, entity.type);
}

function faceToPath(entity) {
    const points = (entity.vertices || []).filter(isFinitePoint);
    if (points.length < 3) return null;
    return normalizePath(points, true, entity.type);
}

function entityToPaths(entity) {
    let one = null;

    switch (entity.type) {
        case 'LWPOLYLINE':
        case 'POLYLINE':
            one = polylineToPath(entity);
            break;
        case 'LINE':
            one = lineToPath(entity);
            break;
        case 'ARC':
            one = arcToPath(entity);
            break;
        case 'CIRCLE':
            one = circleToPath(entity);
            break;
        case 'ELLIPSE':
            one = ellipseToPath(entity);
            break;
        case 'SPLINE':
            one = splineToPath(entity);
            break;
        case 'SOLID':
            one = solidToPath(entity);
            break;
        case '3DFACE':
            one = faceToPath(entity);
            break;
        default:
            return [];
    }

    return one ? [one] : [];
}

function pathBBox(pathObject) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of pathObject.points || []) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    return { minX, minY, maxX, maxY };
}

// Keep the same geometry guard used by the complete-assembly converter.
// Some DWG-to-DXF exports contain proxy/boundary geometry that is not visible
// in AutoCAD but otherwise becomes a displaced SVG profile fragment.
function isPathWithinExportBounds(pathObject, transform) {
    const local = pathBBox(pathObject);
    if ((local.maxX - local.minX) > MAX_LOCAL_GEOMETRY_SIZE ||
        (local.maxY - local.minY) > MAX_LOCAL_GEOMETRY_SIZE) {
        return false;
    }

    for (const point of pathObject.points || []) {
        const transformed = transform(point);
        if (Math.abs(transformed.x) > CAD_COORD_LIMIT || Math.abs(transformed.y) > CAD_COORD_LIMIT) {
            return false;
        }
    }
    return true;
}

function normalizeModelSpacePolicy(value = 'prefer-inserts') {
    const normalized = String(value || 'prefer-inserts').trim().toLowerCase();
    if (!MODEL_SPACE_POLICIES.has(normalized)) {
        throw new Error(`Invalid model-space policy "${value}". Use all, prefer-inserts, inserts-only, or direct-only.`);
    }
    return normalized;
}

function reversePath(pathObject) {
    return {
        points: [...pathObject.points].reverse(),
        closed: pathObject.closed,
        sourceTypes: new Set(pathObject.sourceTypes)
    };
}

function mergeSourceTypes(a, b) {
    return new Set([...a, ...b]);
}

function stitchOpenPaths(inputPaths, tolerance = PATH_JOIN_TOLERANCE) {
    const result = inputPaths.map(p => ({
        points: [...p.points],
        closed: p.closed,
        sourceTypes: new Set(p.sourceTypes)
    }));

    let joinedAny = true;
    while (joinedAny) {
        joinedAny = false;

        for (let i = 0; i < result.length; i++) {
            if (result[i].closed) continue;

            const p1 = result[i];
            const start1 = p1.points[0];
            const end1 = p1.points[p1.points.length - 1];

            if (pointsClose(start1, end1, tolerance)) {
                p1.closed = true;
                joinedAny = true;
                break;
            }

            for (let j = i + 1; j < result.length; j++) {
                if (result[j].closed) continue;

                const p2 = result[j];
                const start2 = p2.points[0];
                const end2 = p2.points[p2.points.length - 1];

                if (pointsClose(end1, start2, tolerance)) {
                    p1.points.push(...p2.points.slice(1));
                    p1.sourceTypes = mergeSourceTypes(p1.sourceTypes, p2.sourceTypes);
                    result.splice(j, 1);
                    joinedAny = true;
                    break;
                } else if (pointsClose(end1, end2, tolerance)) {
                    p1.points.push(...p2.points.map(p => ({ ...p })).reverse().slice(1));
                    p1.sourceTypes = mergeSourceTypes(p1.sourceTypes, p2.sourceTypes);
                    result.splice(j, 1);
                    joinedAny = true;
                    break;
                } else if (pointsClose(start1, start2, tolerance)) {
                    p1.points = p1.points.map(p => ({ ...p })).reverse();
                    p1.points.push(...p2.points.slice(1));
                    p1.sourceTypes = mergeSourceTypes(p1.sourceTypes, p2.sourceTypes);
                    result.splice(j, 1);
                    joinedAny = true;
                    break;
                } else if (pointsClose(start1, end2, tolerance)) {
                    p1.points = p2.points.slice(0).concat(p1.points.slice(1));
                    p1.sourceTypes = mergeSourceTypes(p1.sourceTypes, p2.sourceTypes);
                    result.splice(j, 1);
                    joinedAny = true;
                    break;
                }
            }

            if (joinedAny) break;
        }
    }

    for (const p of result) {
        if (!p.closed && p.points.length >= 3 && pointsClose(p.points[0], p.points[p.points.length - 1], tolerance)) {
            p.closed = true;
        }
    }

    return result;
}


function processEntities(dxf, entities, transform, localPaths) {
    for (const entity of entities) {
        if (entity.type === 'INSERT') {
            const blockName = entity.name;
            const block = dxf.blocks[blockName];
            if (block) {
                const subTransform = createTransform(entity, transform, block.position);
                processEntities(dxf, block.entities || [], subTransform, localPaths);
            }
            continue;
        }

        const converted = entityToPaths(entity);
        for (const geometryPath of converted) {
            const transformedPoints = geometryPath.points.map(transform);
            localPaths.push({
                points: transformedPoints,
                closed: geometryPath.closed,
                sourceTypes: geometryPath.sourceTypes
            });
        }
    }
}

function pathsToSvgD(paths) {
    let d = '';
    for (const pathObject of paths) {
        if (!pathObject.points.length) continue;
        pathObject.points.forEach((point, index) => {
            // Negate Y coordinate for SVG space
            d += `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(4)} ${(-point.y).toFixed(4)} `;
        });
        if (pathObject.closed) d += 'Z ';
    }
    return d.trim();
}

function sanitizeComponentName(value) {
    const sanitized = String(value || 'component')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || 'component';
}

function createSvgContent(paths, viewBox, rootAttributes = '') {
    const closedPaths = (paths || []).filter(pathObject => pathObject.closed);
    const openPaths = (paths || []).filter(pathObject => !pathObject.closed);
    const closedD = pathsToSvgD(closedPaths);
    const openD = pathsToSvgD(openPaths);
    const elements = [];

    if (closedD) {
        elements.push(`  <path d="${closedD}" fill="#888888" stroke="#000000" stroke-width="0.5" fill-rule="evenodd" stroke-linejoin="round" />`);
    }
    if (openD) {
        elements.push(`  <path d="${openD}" fill="none" stroke="#000000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" />`);
    }

    const attrs = rootAttributes ? ` ${rootAttributes.trim()}` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x.toFixed(4)} ${viewBox.y.toFixed(4)} ${viewBox.width.toFixed(4)} ${viewBox.height.toFixed(4)}" width="100%" height="100%"${attrs}>\n` +
        elements.join('\n') + '\n</svg>\n';
}

function affine2dFromTransform(transform) {
    const origin = transform({ x: 0, y: 0, z: 0 });
    const axisX = transform({ x: 1, y: 0, z: 0 });
    const axisY = transform({ x: 0, y: 1, z: 0 });

    return {
        a: axisX.x - origin.x,
        b: axisY.x - origin.x,
        c: axisX.y - origin.y,
        d: axisY.y - origin.y,
        tx: origin.x,
        ty: origin.y
    };
}

function collectSplitComponentBundle(dxf, modelSpaceEntities, options = {}) {
    const modelSpacePolicy = normalizeModelSpacePolicy(options.modelSpacePolicy);
    const components = [];
    const instanceCounts = new Map();
    const diagnostics = {
        modelSpacePolicy,
        topLevelInsertCount: 0,
        directModelSpaceEntityCount: 0,
        directModelSpacePathCount: 0,
        filteredPathCount: 0,
        usedInsertGeometry: false,
        usedDirectModelSpaceGeometry: false,
        ignoredDirectModelSpaceGeometry: false
    };

    function nextInstanceId(key) {
        const count = instanceCounts.get(key) || 0;
        instanceCounts.set(key, count + 1);
        return count;
    }

    function addComponent({ blockName, parentBlock, rootBlock, hierarchy, layer, sourceTransform = null }, rawPaths) {
        const stitchedPaths = stitchOpenPaths(rawPaths || []);
        if (stitchedPaths.length === 0) return;

        const geometryIslands = splitPathsIntoGeometryIslands(stitchedPaths);
        if (geometryIslands.length === 0) return;

        const instanceKey = `${hierarchy.join('/')}:${blockName}`;
        const instanceId = nextInstanceId(instanceKey);
        const instanceSuffix = instanceId === 0 ? '' : `-inst${instanceId}`;

        geometryIslands.forEach((islandPaths, geometryIslandIndex) => {
            const bbox = getPathsBBox(islandPaths);
            if (!bbox) return;

            const islandSuffix = geometryIslands.length === 1
                ? ''
                : `-island${geometryIslandIndex + 1}`;
            const componentName = sanitizeComponentName(`${blockName}${instanceSuffix}${islandSuffix}`);
            const index = components.length;
            const filename = `${String(index).padStart(3, '0')}-${componentName}.svg`;

            components.push({
                index,
                id: `${componentName}-${index}`,
                filename,
                blockName,
                parentBlock,
                rootBlock,
                hierarchy,
                layer: layer || '0',
                sourceTransform,
                geometryIslandIndex,
                geometryIslandCount: geometryIslands.length,
                paths: islandPaths,
                bbox,
                area: Math.max(0, bbox.maxX - bbox.minX) * Math.max(0, bbox.maxY - bbox.minY),
                closedContours: islandPaths.filter(pathObject => pathObject.closed).length,
                openContours: islandPaths.filter(pathObject => !pathObject.closed).length
            });
        });
    }

    function collectBlockInsert(insert, parentTransform, parentBlock = null, hierarchy = [], rootBlock = null) {
        const blockName = insert.name;
        const block = dxf.blocks?.[blockName];
        if (!block) return;

        const transform = createTransform(insert, parentTransform, block.position);
        const sourceTransform = affine2dFromTransform(transform);
        const currentRoot = rootBlock || blockName;
        const currentHierarchy = [...hierarchy, blockName];
        const directPaths = [];
        let layer = insert.layer || '0';
        const nestedInserts = [];

        for (const entity of block.entities || []) {
            if (entity.type === 'INSERT') {
                nestedInserts.push(entity);
                continue;
            }
            if (entity.layer && entity.layer !== '0' && entity.layer !== 'Defpoints') {
                layer = entity.layer;
            }
            for (const geometryPath of entityToPaths(entity)) {
                if (!isPathWithinExportBounds(geometryPath, transform)) {
                    diagnostics.filteredPathCount += 1;
                    continue;
                }
                directPaths.push({
                    points: geometryPath.points.map(transform),
                    closed: geometryPath.closed,
                    sourceTypes: geometryPath.sourceTypes
                });
            }
        }

        addComponent({
            blockName,
            parentBlock,
            rootBlock: currentRoot,
            hierarchy: currentHierarchy,
            layer,
            sourceTransform
        }, directPaths);

        for (const nestedInsert of nestedInserts) {
            collectBlockInsert(nestedInsert, transform, blockName, currentHierarchy, currentRoot);
        }
    }

    const directByLayer = new Map();
    const topLevelInserts = [];
    for (const entity of modelSpaceEntities || []) {
        if (entity.type === 'INSERT') {
            topLevelInserts.push(entity);
            continue;
        }

        diagnostics.directModelSpaceEntityCount += 1;
        const layer = entity.layer || '0';
        if (!directByLayer.has(layer)) directByLayer.set(layer, []);
        for (const geometryPath of entityToPaths(entity)) {
            diagnostics.directModelSpacePathCount += 1;
            if (!isPathWithinExportBounds(geometryPath, point => point)) {
                diagnostics.filteredPathCount += 1;
                continue;
            }
            directByLayer.get(layer).push({
                points: geometryPath.points.map(clonePoint),
                closed: geometryPath.closed,
                sourceTypes: geometryPath.sourceTypes
            });
        }
    }

    diagnostics.topLevelInsertCount = topLevelInserts.length;
    const includeInserts = modelSpacePolicy !== 'direct-only';
    if (includeInserts) {
        for (const entity of topLevelInserts) {
            collectBlockInsert(entity, point => point, null, [], null);
        }
    }

    const hasInsertGeometry = components.length > 0;
    const includeDirect = modelSpacePolicy === 'all'
        || modelSpacePolicy === 'direct-only'
        || (modelSpacePolicy === 'prefer-inserts' && !hasInsertGeometry);

    if (includeDirect) {
        for (const [layer, paths] of directByLayer.entries()) {
            addComponent({
                blockName: `model-space-${layer}`,
                parentBlock: null,
                rootBlock: 'model-space',
                hierarchy: ['model-space', layer],
                layer,
                sourceTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
            }, paths);
        }
    }

    diagnostics.usedInsertGeometry = includeInserts && hasInsertGeometry;
    diagnostics.usedDirectModelSpaceGeometry = includeDirect && directByLayer.size > 0;
    diagnostics.ignoredDirectModelSpaceGeometry = !includeDirect && diagnostics.directModelSpacePathCount > 0;
    diagnostics.componentCount = components.length;

    return { components, diagnostics };
}

function collectSplitComponents(dxf, modelSpaceEntities, options = {}) {
    return collectSplitComponentBundle(dxf, modelSpaceEntities, options).components;
}

function writeSplitComponents(components, viewBox, componentsDir, componentsJsonPath, geometrySource = null) {
    if (!componentsDir && !componentsJsonPath) return;
    if (!componentsDir) {
        throw new Error('--components-dir is required when exporting split component metadata.');
    }

    fs.mkdirSync(componentsDir, { recursive: true });
    for (const component of components) {
        const componentSvg = createSvgContent(
            component.paths,
            viewBox,
            `data-component-id="${component.id}" data-block-name="${String(component.blockName).replace(/"/g, '&quot;')}"`
        );
        fs.writeFileSync(path.join(componentsDir, component.filename), componentSvg, 'utf-8');
    }

    const metadata = {
        schemaVersion: 1,
        viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height],
        geometrySource,
        components: components.map(component => ({
            index: component.index,
            id: component.id,
            filename: component.filename,
            blockName: component.blockName,
            parentBlock: component.parentBlock,
            rootBlock: component.rootBlock,
            hierarchy: component.hierarchy,
            layer: component.layer,
            sourceTransform: component.sourceTransform,
            geometryIslandIndex: component.geometryIslandIndex,
            geometryIslandCount: component.geometryIslandCount,
            bbox: component.bbox,
            area: component.area,
            closedContours: component.closedContours,
            openContours: component.openContours
        }))
    };

    const metadataPath = componentsJsonPath || path.join(componentsDir, 'components.json');
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
    console.log(`Saved ${components.length} split component SVG(s) to: ${componentsDir}`);
    console.log(`Saved split component metadata: ${metadataPath}`);
}

function parseCliArguments(args) {
    const positional = [];
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (!token.startsWith('--')) {
            positional.push(token);
            continue;
        }
        const key = token.slice(2);
        const value = args[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for --${key}`);
        }
        options[key] = value;
        index += 1;
    }
    return { positional, options };
}

function main() {
    const { positional, options } = parseCliArguments(process.argv.slice(2));
    if (positional.length === 0) {
        console.log("Usage: node test_convert.js <input.dxf|input.dwg> [output.svg] [--components-dir <directory>] [--components-json <file>] [--model-space-policy <all|prefer-inserts|inserts-only|direct-only>]");
        process.exit(1);
    }

    const inputFile = path.resolve(positional[0]);
    const inputExt = path.extname(inputFile).toLowerCase();

    if (inputExt !== '.dxf' && inputExt !== '.dwg') {
        console.error("Error: Input file must be a .dxf or .dwg file.");
        process.exit(1);
    }

    const outputExt = inputExt;
    const defaultOutputName = path.basename(inputFile, outputExt) + '.svg';
    const outputFile = positional[1]
        ? path.resolve(positional[1])
        : path.join(path.dirname(inputFile), defaultOutputName);

    console.log(`Input File: ${inputFile}`);
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found at ${inputFile}`);
        process.exit(1);
    }

    let dxfFileToParse = inputFile;
    let tempDxfFile = null;

    if (inputExt === '.dwg') {
        console.log("Input is DWG. Exporting to DXF first...");
        const intermediateDir = INTERMEDIATE_DIR;
        if (!fs.existsSync(intermediateDir)) {
            fs.mkdirSync(intermediateDir, { recursive: true });
        }

        const dwgBase = path.basename(inputFile, '.dwg');
        tempDxfFile = path.join(intermediateDir, `temp_single_${dwgBase}.dxf`);

        try {
            exportDwgToDxf(inputFile, tempDxfFile);
            dxfFileToParse = tempDxfFile;
        } catch (err) {
            console.error("Error exporting DWG to DXF:", err.message);
            process.exit(1);
        }
    }

    const DxfParser = require('dxf-parser');
    const fileContent = fs.readFileSync(dxfFileToParse, 'utf-8');
    const parser = new DxfParser();
    let dxf;
    try {
        dxf = parser.parseSync(fileContent);
        console.log("DXF parsed successfully.");
    } catch (err) {
        console.error("Error parsing DXF:", err.message);
        if (tempDxfFile && fs.existsSync(tempDxfFile)) {
            fs.unlinkSync(tempDxfFile);
        }
        process.exit(1);
    }

    // Collect entities from Model Space
    let modelSpaceEntities = dxf.entities || [];
    if (modelSpaceEntities.length === 0 && dxf.blocks && dxf.blocks['*Model_Space']) {
        modelSpaceEntities = dxf.blocks['*Model_Space'].entities || [];
    }

    console.log(`Found ${modelSpaceEntities.length} direct model space entities.`);

    const modelSpacePolicy = normalizeModelSpacePolicy(options['model-space-policy'] || 'prefer-inserts');
    const componentBundle = collectSplitComponentBundle(dxf, modelSpaceEntities, { modelSpacePolicy });
    const splitComponents = componentBundle.components;
    if (splitComponents.length === 0) {
        throw new Error(`No usable geometry remained with model-space policy "${modelSpacePolicy}".`);
    }

    const stitchedPaths = splitComponents.flatMap(component => component.paths || []);
    console.log(`Model-space policy: ${modelSpacePolicy}`);
    console.log(`Collected ${splitComponents.length} block/model-space component(s).`);
    if (componentBundle.diagnostics.ignoredDirectModelSpaceGeometry) {
        console.log(`Ignored ${componentBundle.diagnostics.directModelSpacePathCount} direct model-space path(s) because block INSERT geometry is authoritative.`);
    }
    if (componentBundle.diagnostics.filteredPathCount > 0) {
        console.log(`Filtered ${componentBundle.diagnostics.filteredPathCount} out-of-range/proxy geometry path(s) using the complete-converter bounds rules.`);
    }

    // Calculate bounding box in SVG space (where Y is negated)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pathObject of stitchedPaths) {
        for (const p of pathObject.points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, -p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, -p.y);
        }
    }

    // Clean up temp DXF file if created
    if (tempDxfFile && fs.existsSync(tempDxfFile)) {
        try {
            fs.unlinkSync(tempDxfFile);
            console.log("Cleaned up temporary DXF file.");
        } catch (e) {
            // ignore
        }
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        console.error("Error: No valid finite geometry paths found in DXF.");
        process.exit(1);
    }

    const margin = 5;
    const viewBoxX = minX - margin;
    const viewBoxY = minY - margin;
    const viewBoxW = (maxX - minX) + 2 * margin;
    const viewBoxH = (maxY - minY) + 2 * margin;

    console.log(`SVG ViewBox: X: ${viewBoxX.toFixed(2)}, Y: ${viewBoxY.toFixed(2)}, W: ${viewBoxW.toFixed(2)}, H: ${viewBoxH.toFixed(2)}`);

    const closedPaths = stitchedPaths.filter(p => p.closed);
    const openPaths = stitchedPaths.filter(p => !p.closed);

    console.log(`Closed contours: ${closedPaths.length}, Open contours: ${openPaths.length}`);

    const viewBox = {
        x: viewBoxX,
        y: viewBoxY,
        width: viewBoxW,
        height: viewBoxH
    };
    const svgContent = createSvgContent(stitchedPaths, viewBox);

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, svgContent, 'utf-8');
    console.log(`Saved: ${outputFile}`);

    if (options['components-dir'] || options['components-json']) {
        const componentsDir = options['components-dir']
            ? path.resolve(options['components-dir'])
            : null;
        const componentsJsonPath = options['components-json']
            ? path.resolve(options['components-json'])
            : null;
        writeSplitComponents(splitComponents, viewBox, componentsDir, componentsJsonPath, componentBundle.diagnostics);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ISLAND_GAP_MM,
    bboxGapDistance,
    affine2dFromTransform,
    collectSplitComponentBundle,
    collectSplitComponents,
    getPathsBBox,
    isPathWithinExportBounds,
    normalizeModelSpacePolicy,
    splitPathsIntoGeometryIslands
};
