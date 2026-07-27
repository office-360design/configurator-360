const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DxfParser = require('dxf-parser');

const WORKSPACE_DIR = __dirname;
const SVG_DIR = path.join(WORKSPACE_DIR, 'svg');

// Helper to check if an executable exists in the system PATH
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

// Helper to scan C:\Program Files\Autodesk for accoreconsole.exe
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

// Helper to scan C:\Program Files\ODA (Windows) or /usr/bin (Linux) for ODAFileConverter
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

const ACAD_CONSOLE = findAutoCADConsole();
const ODA_CONVERTER = findODAConverter();

// Geometry/export settings
const CAD_COORD_LIMIT = 500;
const MAX_LOCAL_GEOMETRY_SIZE = 500;
const PATH_JOIN_TOLERANCE = 0.1;
const CURVE_STEP_RADIANS = Math.PI / 36; // 5 degrees per segment
const SPLINE_SAMPLES_PER_CONTROL_POINT = 10;
const DEBUG_BLOCK_NAME = 'problema';

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

// Correct INSERT transform:
// 1. subtract the BLOCK base point
// 2. apply INSERT scale
// 3. apply INSERT rotation
// 4. add INSERT position
// 5. apply parent INSERT transforms
function createTransform(ins, parentTransform = null, blockBasePoint = null) {
    const pos = ins.position || { x: 0, y: 0, z: 0 };
    const base = blockBasePoint || { x: 0, y: 0, z: 0 };
    let scaleX = ins.xScale !== undefined ? ins.xScale : 1;
    let scaleY = ins.yScale !== undefined ? ins.yScale : 1;

    // AutoCAD Arbitrary Axis Algorithm: if Z extrusion direction is negative, the local X-axis is mirrored.
    if (ins.extrusionDirection && ins.extrusionDirection.z < 0) {
        scaleX = -scaleX;
    }

    const rotation = ins.rotation !== undefined ? ins.rotation : 0;
    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return function transformPoint(p) {
        if (!p) return { x: 0, y: 0 };

        // BLOCK geometry is stored relative to the BLOCK base point.
        const localX = (p.x !== undefined ? p.x : 0) - (base.x || 0);
        const localY = (p.y !== undefined ? p.y : 0) - (base.y || 0);

        const sx = localX * scaleX;
        const sy = localY * scaleY;

        const rx = sx * cos - sy * sin;
        const ry = sx * sin + sy * cos;

        const localP = {
            x: rx + (pos.x || 0),
            y: ry + (pos.y || 0)
        };

        return parentTransform ? parentTransform(localP) : localP;
    };
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

    // DXF bulge = tan(includedAngle / 4)
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

    // Force the mathematically sampled endpoint to the exact DXF endpoint.
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
    // dxf-parser represents LINE endpoints in `vertices`.
    // Keep support for `start` / `end` as a fallback for other parser versions.
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

function arcToPath(entity) {
    if (!isFinitePoint(entity.center) || !Number.isFinite(entity.radius)) return null;

    const startAngle = Number(entity.startAngle || 0);
    const endAngle = Number(entity.endAngle || 0);

    // dxf-parser stores angleLength as endAngle - startAngle.
    // When an ARC crosses 0 degrees this value is negative, but the ARC is valid.
    // Normalize it into the positive counter-clockwise DXF sweep.
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

    // Minor axis is perpendicular to the major-axis vector.
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

    // Fallback for malformed/unsupported rational splines.
    // dxf-parser 1.1.2 does not expose spline weights, so rational curves can only
    // be approximated from fit/control points here.
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

    for (const p of pathObject.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
}

function isPathWithinExportBounds(pathObject, transform) {
    const local = pathBBox(pathObject);
    if ((local.maxX - local.minX) > MAX_LOCAL_GEOMETRY_SIZE ||
        (local.maxY - local.minY) > MAX_LOCAL_GEOMETRY_SIZE) {
        return false;
    }

    for (const point of pathObject.points) {
        const transformed = transform(point);
        if (Math.abs(transformed.x) > CAD_COORD_LIMIT || Math.abs(transformed.y) > CAD_COORD_LIMIT) {
            return false;
        }
    }
    return true;
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

// Join separate LINE/ARC/SPLINE/polyline fragments whose endpoints touch.
// This is required because an SVG path made of many independent "M ... L ..."
// fragments is not a single closed contour even when the CAD endpoints coincide.
function stitchOpenPaths(inputPaths, tolerance = PATH_JOIN_TOLERANCE) {
    const result = inputPaths.map(p => ({
        points: p.points.map(clonePoint),
        closed: p.closed,
        sourceTypes: new Set(p.sourceTypes)
    }));

    let changed = true;
    while (changed) {
        changed = false;

        outer:
        for (let i = 0; i < result.length; i++) {
            if (result[i].closed) continue;

            for (let j = i + 1; j < result.length; j++) {
                if (result[j].closed) continue;

                let a = result[i];
                let b = result[j];
                const aStart = a.points[0];
                const aEnd = a.points[a.points.length - 1];
                const bStart = b.points[0];
                const bEnd = b.points[b.points.length - 1];

                let mergedPoints = null;

                if (pointsClose(aEnd, bStart, tolerance)) {
                    mergedPoints = [...a.points, ...b.points.slice(1)];
                } else if (pointsClose(aEnd, bEnd, tolerance)) {
                    b = reversePath(b);
                    mergedPoints = [...a.points, ...b.points.slice(1)];
                } else if (pointsClose(aStart, bEnd, tolerance)) {
                    mergedPoints = [...b.points, ...a.points.slice(1)];
                } else if (pointsClose(aStart, bStart, tolerance)) {
                    b = reversePath(b);
                    mergedPoints = [...b.points, ...a.points.slice(1)];
                }

                if (mergedPoints) {
                    const closed = mergedPoints.length >= 3 &&
                        pointsClose(mergedPoints[0], mergedPoints[mergedPoints.length - 1], tolerance);
                    if (closed) mergedPoints.pop();

                    result[i] = {
                        points: removeConsecutiveDuplicatePoints(mergedPoints),
                        closed,
                        sourceTypes: mergeSourceTypes(a.sourceTypes, b.sourceTypes)
                    };
                    result.splice(j, 1);
                    changed = true;
                    break outer;
                }
            }
        }
    }

    // A single path can already have endpoints within tolerance.
    for (const p of result) {
        if (!p.closed && p.points.length >= 3 && pointsClose(p.points[0], p.points[p.points.length - 1], tolerance)) {
            p.points.pop();
            p.closed = true;
        }
    }

    return result;
}

function pathsToSvgD(paths, transform) {
    let d = '';

    for (const pathObject of paths) {
        if (!pathObject.points.length) continue;

        pathObject.points.forEach((point, index) => {
            const transformed = transform(point);
            d += `${index === 0 ? 'M' : 'L'} ${transformed.x.toFixed(4)} ${(-transformed.y).toFixed(4)} `;
        });

        if (pathObject.closed) d += 'Z ';
    }

    return d.trim();
}

function getTransformedBBox(paths, transform) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pathObject of paths) {
        for (const point of pathObject.points) {
            const p = transform(point);
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }

    return { minX, minY, maxX, maxY };
}

function shouldSkipBlockName(blockName) {
    return false
    const lower = String(blockName || '').toLowerCase();
    return lower.includes('viewport') || lower.includes('border') || lower.includes('title');
}

function countEntityTypes(entities) {
    const counts = {};
    for (const entity of entities || []) {
        counts[entity.type] = (counts[entity.type] || 0) + 1;
    }
    return counts;
}

function sanitizeFilename(filename) {
    const parsed = path.parse(filename);
    let name = parsed.name;
    const mapping = {
        'Ä': 'Ae', 'ä': 'ae',
        'Ö': 'Oe', 'ö': 'oe',
        'Ü': 'Ue', 'ü': 'ue',
        'ß': 'ss'
    };
    for (const [key, val] of Object.entries(mapping)) {
        name = name.split(key).join(val);
    }
    name = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    name = name.replace(/_+/g, '_');
    name = name.replace(/^_+|_+$/g, '');
    return name + parsed.ext;
}

function run() {
    const args = process.argv.slice(2);
    let dwgName = args[0] || '2_6_Oeffnungselement_Vertikal.dwg';

    function tryExport(name) {
        const isDxf = name.toLowerCase().endsWith('.dxf');
        const dwgBase = isDxf ? path.basename(name, '.dxf') : path.basename(name, '.dwg');
        const folderName = dwgBase.replace(/[^a-zA-Z0-9_-]/g, '_');

        const DWG_FILE = isDxf ? null : path.resolve(WORKSPACE_DIR, 'dwg', dwgBase + '.dwg');
        const DXF_FILE = isDxf ? path.resolve(WORKSPACE_DIR, 'dwg', name) : path.resolve(WORKSPACE_DIR, 'intermediate', dwgBase + '.dxf');
        const TARGET_SVG_DIR = path.join(SVG_DIR, folderName);

        if (isDxf) {
            console.log(`Target DXF: ${DXF_FILE}`);
            console.log(`Output SVG folder: ${TARGET_SVG_DIR}`);
            if (!fs.existsSync(DXF_FILE)) {
                throw new Error(`DXF file not found at: ${DXF_FILE}`);
            }
            return { dwgBase, folderName, DWG_FILE, DXF_FILE, TARGET_SVG_DIR };
        }

        console.log(`Target DWG: ${DWG_FILE}`);
        console.log(`Output DXF: ${DXF_FILE}`);
        console.log(`Output SVG folder: ${TARGET_SVG_DIR}`);

        if (!fs.existsSync(DWG_FILE)) {
            throw new Error(`DWG file not found at: ${DWG_FILE}`);
        }

        console.log('\n--- Step 1: Exporting DWG to DXF ---');

        if (fs.existsSync(ACAD_CONSOLE)) {
            console.log('AutoCAD Core Console detected. Exporting via accoreconsole...');
            const SCR_FILE = path.join(WORKSPACE_DIR, 'intermediate', 'temp_export.scr');

            const scrContent = `(vl-file-delete "${DXF_FILE.replace(/\\/g, '/')}")
_DXFOUT
"${DXF_FILE.replace(/\\/g, '/')}"

_QUIT
_N
`;
            fs.writeFileSync(SCR_FILE, scrContent, 'utf-8');

            try {
                const cmd = `"${ACAD_CONSOLE}" /i "${DWG_FILE}" /s "${SCR_FILE}"`;
                execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_DIR });

                if (!fs.existsSync(DXF_FILE)) {
                    throw new Error(`Expected DXF file was not generated at: ${DXF_FILE}`);
                }
                console.log('DXF export complete via AutoCAD Core Console.');
            } finally {
                if (fs.existsSync(SCR_FILE)) fs.unlinkSync(SCR_FILE);
            }
        } else if (fs.existsSync(ODA_CONVERTER)) {
            console.log('ODA File Converter detected. Exporting via ODAFileConverter...');
            const tempInputDir = path.join(WORKSPACE_DIR, 'intermediate', 'temp_in');
            const tempOutputDir = path.join(WORKSPACE_DIR, 'intermediate', 'temp_out');

            if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
            if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
            fs.mkdirSync(tempInputDir, { recursive: true });
            fs.mkdirSync(tempOutputDir, { recursive: true });

            fs.copyFileSync(DWG_FILE, path.join(tempInputDir, path.basename(DWG_FILE)));

            try {
                const cmd = `"${ODA_CONVERTER}" "${tempInputDir}" "${tempOutputDir}" "ACAD2018" "DXF" "0" "0" "*.dwg"`;
                execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_DIR });

                const expectedDxf = path.join(tempOutputDir, dwgBase + '.dxf');
                if (!fs.existsSync(expectedDxf)) {
                    throw new Error(`Expected DXF file was not generated at: ${expectedDxf}`);
                }

                if (fs.existsSync(DXF_FILE)) fs.unlinkSync(DXF_FILE);
                fs.copyFileSync(expectedDxf, DXF_FILE);
                console.log('DXF export complete via ODA File Converter.');
            } finally {
                if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
                if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
            }
        } else {
            throw new Error(`Neither AutoCAD Core Console nor ODA File Converter was found on this system.`);
        }

        return { dwgBase, folderName, DWG_FILE, DXF_FILE, TARGET_SVG_DIR };
    }

    let exportResult;
    try {
        const origDwgFile = path.resolve(WORKSPACE_DIR, 'dwg', dwgName);
        if (!fs.existsSync(origDwgFile)) {
            const sanitized = sanitizeFilename(dwgName);
            const checkPath = path.resolve(WORKSPACE_DIR, 'dwg', sanitized);
            if (fs.existsSync(checkPath)) {
                dwgName = sanitized;
            }
        }
        exportResult = tryExport(dwgName);
    } catch (err) {
        console.warn(`Initial export attempt failed: ${err.message}`);
        const sanitized = sanitizeFilename(dwgName);
        if (sanitized !== dwgName) {
            const origPath = path.join(WORKSPACE_DIR, 'dwg', dwgName);
            const sanitizedPath = path.join(WORKSPACE_DIR, 'dwg', sanitized);
            if (fs.existsSync(origPath)) {
                console.log(`Renaming ${origPath} to ${sanitizedPath}...`);
                fs.renameSync(origPath, sanitizedPath);

                const origBak = origPath.slice(0, -4) + '.bak';
                const sanitizedBak = sanitizedPath.slice(0, -4) + '.bak';
                if (fs.existsSync(origBak)) {
                    fs.renameSync(origBak, sanitizedBak);
                }

                dwgName = sanitized;
                console.log(`Retrying export with sanitized filename: ${dwgName}`);
                try {
                    exportResult = tryExport(dwgName);
                } catch (retryErr) {
                    console.error(`Export retry failed: ${retryErr.message}`);
                    process.exit(1);
                }
            } else {
                console.error(`Original file does not exist, and sanitized attempt failed.`);
                process.exit(1);
            }
        } else {
            console.error(`Export failed and filename is already sanitized.`);
            process.exit(1);
        }
    }

    const { dwgBase, folderName, DWG_FILE, DXF_FILE, TARGET_SVG_DIR } = exportResult;

    console.log('\n--- Step 2: Parsing DXF File ---');
    const parser = new DxfParser();
    let dxf;
    try {
        const fileContent = fs.readFileSync(DXF_FILE, 'utf-8');
        dxf = parser.parseSync(fileContent);
        console.log(`DXF successfully parsed. Total entities: ${dxf.entities.length}`);
    } catch (err) {
        console.error('Error parsing DXF file:', err);
        process.exit(1);
    }

    const layerColors = {};
    if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
        Object.keys(dxf.tables.layer.layers).forEach(name => {
            const layer = dxf.tables.layer.layers[name];
            let colorInt = layer.color !== undefined ? layer.color : 0xffffff;
            colorInt = Math.abs(colorInt);
            const hex = '#' + ('000000' + colorInt.toString(16)).slice(-6);
            layerColors[layer.name] = hex;
        });
    }

    const debugBlock = dxf.blocks && dxf.blocks[DEBUG_BLOCK_NAME];
    if (debugBlock) {
        console.log(`\n--- Debug block: ${DEBUG_BLOCK_NAME} ---`);
        console.log('Block base point:', debugBlock.position || { x: 0, y: 0 });
        console.log('Entity types:', countEntityTypes(debugBlock.entities));
    }

    console.log('\n--- Step 3: Computing Global Bounding Box to Align All SVGs ---');
    let globalMinX = Infinity;
    let globalMinY = Infinity;
    let globalMaxX = -Infinity;
    let globalMaxY = -Infinity;

    function updateGlobalBBox(point) {
        globalMinX = Math.min(globalMinX, point.x);
        globalMinY = Math.min(globalMinY, -point.y);
        globalMaxX = Math.max(globalMaxX, point.x);
        globalMaxY = Math.max(globalMaxY, -point.y);
    }

    function traverseForBBox(ins, parentTransform) {
        const blockName = ins.name;
        if (shouldSkipBlockName(blockName)) return;

        const block = dxf.blocks[blockName];
        if (!block) return;

        const currentTransform = createTransform(ins, parentTransform, block.position);

        for (const entity of block.entities || []) {
            if (entity.type === 'INSERT') {
                traverseForBBox(entity, currentTransform);
                continue;
            }

            for (const geometryPath of entityToPaths(entity)) {
                if (!isPathWithinExportBounds(geometryPath, currentTransform)) continue;
                for (const point of geometryPath.points) updateGlobalBBox(currentTransform(point));
            }
        }
    }

    for (const entity of dxf.entities) {
        if (entity.type === 'INSERT') traverseForBBox(entity, null);
    }

    if (![globalMinX, globalMinY, globalMaxX, globalMaxY].every(Number.isFinite)) {
        console.error('No supported geometry remained after filtering; cannot build SVG viewBox.');
        process.exit(1);
    }

    const margin = 5;
    const viewBoxX = globalMinX - margin;
    const viewBoxY = globalMinY - margin;
    const viewBoxW = (globalMaxX - globalMinX) + 2 * margin;
    const viewBoxH = (globalMaxY - globalMinY) + 2 * margin;

    console.log('Global Bounding Box (SVG space):');
    console.log(`  X: [${viewBoxX.toFixed(2)}, ${(viewBoxX + viewBoxW).toFixed(2)}]`);
    console.log(`  Y: [${viewBoxY.toFixed(2)}, ${(viewBoxY + viewBoxH).toFixed(2)}]`);

    console.log('\n--- Step 4: Exporting Blocks to SVG Folders ---');

    if (fs.existsSync(TARGET_SVG_DIR)) fs.rmSync(TARGET_SVG_DIR, { recursive: true, force: true });
    fs.mkdirSync(TARGET_SVG_DIR, { recursive: true });

    const svgPartsMetadata = [];
    const insertCounts = {};
    const unsupportedEntityCounts = {};
    let globalIndex = 0;

    function processInsert(ins, parentTransform, parentPath, parentBlockName = null, rootBlockName = null) {
        const blockName = ins.name;
        if (shouldSkipBlockName(blockName)) return;

        const block = dxf.blocks[blockName];
        if (!block) return;

        let partColor = '#888888';
        let specificLayer = null;
        for (const entity of block.entities || []) {
            if (entity.layer && entity.layer !== '0' && entity.layer !== 'Defpoints') {
                specificLayer = entity.layer;
                break;
            }
        }
        const resolvedLayer = specificLayer || ins.layer || '0';
        if (layerColors[resolvedLayer]) partColor = layerColors[resolvedLayer];

        const instKey = parentBlockName ? `${parentBlockName}_${blockName}` : blockName;
        const instId = insertCounts[instKey] || 0;
        insertCounts[instKey] = instId + 1;

        let currentPath = parentPath;
        if (parentBlockName) currentPath = path.join(parentPath, parentBlockName);
        else currentPath = path.join(parentPath, blockName);

        const targetDir = path.join(TARGET_SVG_DIR, currentPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const currentTransform = createTransform(ins, parentTransform, block.position);
        const localPaths = [];
        const subInserts = [];
        let filteredPathCount = 0;
        const convertedByType = {};
        const invalidByType = {};
        const filteredByType = {};

        for (const entity of block.entities || []) {
            if (entity.type === 'INSERT') {
                subInserts.push(entity);
                continue;
            }

            const converted = entityToPaths(entity);
            if (converted.length === 0) {
                unsupportedEntityCounts[entity.type] = (unsupportedEntityCounts[entity.type] || 0) + 1;
                invalidByType[entity.type] = (invalidByType[entity.type] || 0) + 1;
                continue;
            }

            convertedByType[entity.type] = (convertedByType[entity.type] || 0) + converted.length;

            for (const geometryPath of converted) {
                if (isPathWithinExportBounds(geometryPath, currentTransform)) {
                    localPaths.push(geometryPath);
                } else {
                    filteredPathCount += 1;
                    filteredByType[entity.type] = (filteredByType[entity.type] || 0) + 1;
                }
            }
        }

        const stitchedPaths = stitchOpenPaths(localPaths);
        const closedPaths = stitchedPaths.filter(p => p.closed);
        const openPaths = stitchedPaths.filter(p => !p.closed);

        const currentRoot = rootBlockName || blockName;

        if (blockName.toLowerCase() === DEBUG_BLOCK_NAME.toLowerCase()) {
            console.log(`\n--- Export debug: ${blockName} ---`);
            console.log('INSERT position:', ins.position || { x: 0, y: 0 });
            console.log('BLOCK base point:', block.position || { x: 0, y: 0 });
            console.log('Raw entity types:', countEntityTypes(block.entities));
            console.log('Converted by type:', convertedByType);
            console.log('Invalid/unconverted by type:', invalidByType);
            console.log('Filtered by type:', filteredByType);
            console.log(`Converted paths kept: ${localPaths.length}`);
            console.log(`Filtered paths: ${filteredPathCount}`);
            console.log(`After endpoint stitching: ${stitchedPaths.length}`);
            console.log(`Closed contours: ${closedPaths.length}`);
            console.log(`Open contours: ${openPaths.length}`);
            if (openPaths.length > 0) {
                console.log('Open contour source types:', openPaths.map(p => [...p.sourceTypes]));
            }
        }

        if (stitchedPaths.length > 0) {
            const instSuffix = instId === 0 ? '' : `_inst${instId}`;
            const svgFilename = `${blockName}${instSuffix}.svg`;
            const svgRelativeUrl = path.join(currentPath, svgFilename).replace(/\\/g, '/');
            const svgFilepath = path.join(TARGET_SVG_DIR, svgRelativeUrl);

            const closedD = pathsToSvgD(closedPaths, currentTransform);
            const openD = pathsToSvgD(openPaths, currentTransform);
            const elements = [];

            if (closedD) {
                elements.push(`  <path d="${closedD}" fill="#888888" stroke="#000000" stroke-width="0.5" fill-rule="evenodd" stroke-linejoin="round" />`);
            }
            if (openD) {
                elements.push(`  <path d="${openD}" fill="none" stroke="#000000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" />`);
            }

            if (elements.length > 0) {
                const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
                    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX.toFixed(4)} ${viewBoxY.toFixed(4)} ${viewBoxW.toFixed(4)} ${viewBoxH.toFixed(4)}" width="100%" height="100%">\n` +
                    elements.join('\n') + '\n</svg>\n';

                fs.writeFileSync(svgFilepath, svgContent, 'utf-8');
                console.log(`Saved: svg/${folderName}/${svgRelativeUrl}`);

                const bbox = getTransformedBBox(stitchedPaths, currentTransform);
                svgPartsMetadata.push({
                    index: globalIndex++,
                    filename: svgFilename,
                    relativeUrl: svgRelativeUrl,
                    blockName,
                    parentBlock: parentBlockName,
                    rootBlock: currentRoot,
                    layer: ins.layer || block.layer || '0',
                    color: partColor,
                    bbox,
                    area: (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY),
                    closedContours: closedPaths.length,
                    openContours: openPaths.length
                });
            }
        }

        for (const sub of subInserts) {
            processInsert(sub, currentTransform, currentPath, blockName, currentRoot);
        }
    }

    for (const entity of dxf.entities) {
        if (entity.type === 'INSERT') processInsert(entity, null, '', null, null);
    }

    console.log(`Exported ${svgPartsMetadata.length} pieces.`);
    if (Object.keys(unsupportedEntityCounts).length > 0) {
        console.log('Ignored unsupported DXF entity types:', unsupportedEntityCounts);
    }

    const isVertical = dwgBase.toLowerCase().includes('vertikal') || dwgBase.toLowerCase().includes('vertical');

    // Group parts by rootBlock (top-level block name) and sum their areas for robust role identification
    const rootAreas = {};
    const rootBBoxes = {};
    for (const part of svgPartsMetadata) {
        const root = part.rootBlock || part.blockName;
        rootAreas[root] = (rootAreas[root] || 0) + part.area;
        if (!rootBBoxes[root]) {
            rootBBoxes[root] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        }
        rootBBoxes[root].minX = Math.min(rootBBoxes[root].minX, part.bbox.minX);
        rootBBoxes[root].maxX = Math.max(rootBBoxes[root].maxX, part.bbox.maxX);
        rootBBoxes[root].minY = Math.min(rootBBoxes[root].minY, part.bbox.minY);
        rootBBoxes[root].maxY = Math.max(rootBBoxes[root].maxY, part.bbox.maxY);
    }

    const sortedRoots = Object.keys(rootAreas).map(name => ({
        name,
        area: rootAreas[name],
        bbox: rootBBoxes[name],
        centerX: (rootBBoxes[name].minX + rootBBoxes[name].maxX) / 2,
        centerY: (rootBBoxes[name].minY + rootBBoxes[name].maxY) / 2
    })).sort((a, b) => b.area - a.area);

    if (sortedRoots.length < 2) {
        console.error('Could not find enough parts to identify Frame and Sash roles.');
        process.exit(1);
    }

    const rootA = sortedRoots[0];
    const rootB = sortedRoots[1];

    let frameRootName;
    let sashRootName;

    if (isVertical) {
        // Frame is on the left (smaller X), sash is on the right (larger X)
        if (rootA.centerX < rootB.centerX) {
            frameRootName = rootA.name;
            sashRootName = rootB.name;
        } else {
            frameRootName = rootB.name;
            sashRootName = rootA.name;
        }
    } else {
        // For horizontal profiles, use the existing Y center comparison
        if (rootA.centerY < rootB.centerY) {
            frameRootName = rootA.name;
            sashRootName = rootB.name;
        } else {
            frameRootName = rootB.name;
            sashRootName = rootA.name;
        }
    }

    console.log('Role Identification (grouped by root block):');
    console.log(`  Frame Root Block: "${frameRootName}"`);
    console.log(`  Sash Root Block: "${sashRootName}"`);

    // First pass: Assign roles to parts that belong directly to root blocks
    for (const part of svgPartsMetadata) {
        const root = part.rootBlock || part.blockName;
        if (root === frameRootName) {
            part.role = 'frame';
        } else if (root === sashRootName) {
            part.role = 'sash';
        }
    }

    // Helper for 2D bounding box distance
    function bboxDistance(boxA, boxB) {
        const distX = Math.max(0, boxA.minX - boxB.maxX, boxB.minX - boxA.maxX);
        const distY = Math.max(0, boxA.minY - boxB.maxY, boxB.minY - boxA.maxY);
        return Math.hypot(distX, distY);
    }

    const frameCenter = (rootBBoxes[frameRootName].minX + rootBBoxes[frameRootName].maxX) / 2;
    const sashCenter = (rootBBoxes[sashRootName].minX + rootBBoxes[sashRootName].maxX) / 2;

    // Second pass: Assign roles to loose parts based on bounding box proximity to structural parts
    for (const part of svgPartsMetadata) {
        if (part.role) continue; // Already assigned

        let minDistToFrame = Infinity;
        let minDistToSash = Infinity;

        for (const ref of svgPartsMetadata) {
            if (!ref.role) continue;
            const dist = bboxDistance(part.bbox, ref.bbox);
            if (ref.role === 'frame') {
                minDistToFrame = Math.min(minDistToFrame, dist);
            } else if (ref.role === 'sash') {
                minDistToSash = Math.min(minDistToSash, dist);
            }
        }

        if (Math.abs(minDistToFrame - minDistToSash) > 1e-3) {
            part.role = minDistToFrame < minDistToSash ? 'frame' : 'sash';
        } else {
            // Tie-breaker: use X centroid distance to the root blocks
            const partCenterX = (part.bbox.minX + part.bbox.maxX) / 2;
            const distToFrame = Math.abs(partCenterX - frameCenter);
            const distToSash = Math.abs(partCenterX - sashCenter);
            part.role = distToFrame < distToSash ? 'frame' : 'sash';
        }
    }

    // Y spatial gap splitting analysis
    let hasSplit = false;
    let splitY = null;

    if (isVertical && svgPartsMetadata.length > 1) {
        const sortedParts = [...svgPartsMetadata].map(p => ({
            minY: p.bbox.minY,
            maxY: p.bbox.maxY,
            centerY: (p.bbox.minY + p.bbox.maxY) / 2
        })).sort((a, b) => a.centerY - b.centerY);

        let maxGap = -1;
        let bestSplit = null;

        for (let i = 0; i < sortedParts.length - 1; i++) {
            const currentPart = sortedParts[i];
            const nextPart = sortedParts[i + 1];
            const gap = nextPart.minY - currentPart.maxY;
            if (gap > maxGap) {
                maxGap = gap;
                bestSplit = (currentPart.maxY + nextPart.minY) / 2;
            }
        }

        if (maxGap > 10.0) {
            hasSplit = true;
            splitY = bestSplit;
            console.log(`Detected vertical profile split Y: ${splitY.toFixed(2)} with gap: ${maxGap.toFixed(2)}`);
        } else {
            console.log(`No significant vertical profile split detected (max gap: ${maxGap.toFixed(2)}).`);
        }
    }

    for (const part of svgPartsMetadata) {
        if (hasSplit) {
            const centerY = (part.bbox.minY + part.bbox.maxY) / 2;
            part.section = centerY < splitY ? 'bottom' : 'top';
        } else {
            part.section = 'top';
        }
    }

    let cadMinX = Infinity;
    let cadMaxX = -Infinity;
    let cadMinY = Infinity;
    let cadMaxY = -Infinity;
    for (const part of svgPartsMetadata) {
        cadMinX = Math.min(cadMinX, part.bbox.minX);
        cadMaxX = Math.max(cadMaxX, part.bbox.maxX);
        cadMinY = Math.min(cadMinY, part.bbox.minY);
        cadMaxY = Math.max(cadMaxY, part.bbox.maxY);
    }

    const metadata = {
        dwgName,
        isVertical,
        hasSplit,
        splitY,
        globalMinX: cadMinX,
        globalMaxX: cadMaxX,
        globalMinY: cadMinY,
        globalMaxY: cadMaxY,
        globalCenterX: (cadMinX + cadMaxX) / 2,
        parts: svgPartsMetadata.map(p => ({
            index: p.index,
            filename: p.filename,
            relativeUrl: p.relativeUrl,
            blockName: p.blockName,
            parentBlock: p.parentBlock,
            layer: p.layer,
            role: p.role,
            section: p.section,
            color: p.color,
            bbox: p.bbox,
            closedContours: p.closedContours,
            openContours: p.openContours
        }))
    };

    fs.writeFileSync(path.join(TARGET_SVG_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`Saved metadata: svg/${folderName}/metadata.json`);
    console.log('Conversion script complete!');
}

run();
