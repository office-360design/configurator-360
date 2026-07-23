const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DxfParser = require('dxf-parser');

const WORKSPACE_DIR = 'c:\\Users\\monin\\random\\incercam';
const SVG_DIR = path.join(WORKSPACE_DIR, 'svg');
const ODA_CONVERTER = 'C:\\Program Files\\ODA\\ODAFileConverter 27.1.0\\ODAFileConverter.exe';

// Helper: check if a point is inside a polygon (winding/raycast)
function isPointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Helper: compute area of polygon
function getPolygonArea(vertices) {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
}

// Helper: recursive transformation generator
function createTransform(ins, parentTransform = null) {
    const pos = ins.position || { x: 0, y: 0, z: 0 };
    const scaleX = ins.xScale !== undefined ? ins.xScale : 1;
    const scaleY = ins.yScale !== undefined ? ins.yScale : 1;
    const rotation = ins.rotation !== undefined ? ins.rotation : 0;
    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return function(p) {
        if (!p) return { x: 0, y: 0 };
        // Local scale
        let sx = (p.x !== undefined ? p.x : 0) * scaleX;
        let sy = (p.y !== undefined ? p.y : 0) * scaleY;
        
        // Local rotate (around insertion origin)
        let rx = sx * cos - sy * sin;
        let ry = sx * sin + sy * cos;
        
        // Local translate
        let tx = rx + pos.x;
        let ty = ry + pos.y;
        
        const localP = { x: tx, y: ty };
        
        if (parentTransform) {
            return parentTransform(localP);
        }
        return localP;
    };
}

// Helper: group local polylines into outer boundaries + holes
function groupLocalPolylines(polylines) {
    const closed = polylines.map((p, idx) => {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        p.vertices.forEach(v => {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x;
            if (v.y > maxY) maxY = v.y;
        });
        return {
            id: idx,
            vertices: p.vertices,
            bbox: { minX, minY, maxX, maxY },
            area: Math.abs(getPolygonArea(p.vertices))
        };
    });

    const outerPolylines = [];
    const holePolylines = [];

    closed.forEach(p => {
        let parent = null;
        closed.forEach(other => {
            if (other.id !== p.id) {
                if (isPointInPolygon(p.vertices[0], other.vertices)) {
                    if (!parent || (other.bbox.maxX - other.bbox.minX < parent.bbox.maxX - parent.bbox.minX)) {
                        parent = other;
                    }
                }
            }
        });

        if (parent) {
            holePolylines.push({ polyline: p, parentId: parent.id });
        } else {
            outerPolylines.push(p);
        }
    });

    const parts = [];
    outerPolylines.forEach(outer => {
        const holes = holePolylines
            .filter(h => h.parentId === outer.id)
            .map(h => h.polyline);
        
        parts.push({
            outer: outer,
            holes: holes
        });
    });

    return parts;
}

function run() {
    // 1. Resolve target DWG file from arguments
    const args = process.argv.slice(2);
    const dwgName = args[0] || "2_6_Oeffnungselement_Vertikal.dwg";
    const dwgBase = path.basename(dwgName, '.dwg');
    const folderName = dwgBase.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    const DWG_FILE = path.resolve(WORKSPACE_DIR, 'dwg', dwgBase + '.dwg');
    const DXF_FILE = path.resolve(WORKSPACE_DIR, 'intermediate', dwgBase + '.dxf');
    const TARGET_SVG_DIR = path.join(SVG_DIR, folderName);

    console.log(`Target DWG: ${DWG_FILE}`);
    console.log(`Output DXF: ${DXF_FILE}`);
    console.log(`Output SVG folder: ${TARGET_SVG_DIR}`);

    if (!fs.existsSync(DWG_FILE)) {
        console.error(`DWG file not found at: ${DWG_FILE}`);
        process.exit(1);
    }

    console.log('\n--- Step 1: Exporting DWG to DXF using ODA File Converter ---');

    const tempInputDir = path.join(WORKSPACE_DIR, 'intermediate', 'temp_in');
    const tempOutputDir = path.join(WORKSPACE_DIR, 'intermediate', 'temp_out');

    // Clean and recreate temp directories
    if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
    if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
    fs.mkdirSync(tempInputDir, { recursive: true });
    fs.mkdirSync(tempOutputDir, { recursive: true });

    // Copy source DWG to temp input folder
    fs.copyFileSync(DWG_FILE, path.join(tempInputDir, path.basename(DWG_FILE)));

    try {
        // ODA Syntax: ODAFileConverter "input_folder" "output_folder" "version" "output_format" "recurse" "audit" "input_filter"
        const cmd = `"${ODA_CONVERTER}" "${tempInputDir}" "${tempOutputDir}" "ACAD2018" "DXF" "0" "0" "*.dwg"`;
        console.log(`Executing ODA File Converter...`);
        execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_DIR });

        // Copy generated DXF back to target location
        const expectedDxf = path.join(tempOutputDir, dwgBase + '.dxf');
        if (!fs.existsSync(expectedDxf)) {
            throw new Error(`Expected DXF file was not generated at: ${expectedDxf}`);
        }
        
        // Remove target DXF file if it already exists to avoid copy failures
        if (fs.existsSync(DXF_FILE)) {
            fs.unlinkSync(DXF_FILE);
        }
        fs.copyFileSync(expectedDxf, DXF_FILE);
        console.log('DXF export complete.');
    } catch (err) {
        console.error('Error running ODA File Converter:', err.message);
        process.exit(1);
    } finally {
        // Clean up temp directories
        if (fs.existsSync(tempInputDir)) fs.rmSync(tempInputDir, { recursive: true, force: true });
        if (fs.existsSync(tempOutputDir)) fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }

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

    // Parse layer colors table
    const layerColors = {};
    if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
        Object.keys(dxf.tables.layer.layers).forEach(name => {
            const l = dxf.tables.layer.layers[name];
            let cInt = l.color !== undefined ? l.color : 0xffffff;
            cInt = Math.abs(cInt); // negative means off/frozen but color remains same
            const hex = '#' + ('000000' + cInt.toString(16)).slice(-6);
            layerColors[l.name] = hex;
        });
    }

    console.log('\n--- Step 3: Computing Global Bounding Box to Align All SVGs ---');
    let globalMinX = Infinity, globalMinY = Infinity;
    let globalMaxX = -Infinity, globalMaxY = -Infinity;

    function traverseForBBox(ins, parentTransform) {
        const blockName = ins.name;
        // Skip viewports or layout blocks based on name heuristics
        if (blockName.toLowerCase().includes('viewport') || blockName.toLowerCase().includes('border') || blockName.toLowerCase().includes('title')) {
            return;
        }
        const block = dxf.blocks[blockName];
        if (!block) return;

        const currentTransform = createTransform(ins, parentTransform);

        if (block.entities) {
            block.entities.forEach(e => {
                if (e.type === 'INSERT') {
                    traverseForBBox(e, currentTransform);
                } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
                    // Check if local polyline is too large
                    let localMinX = Infinity, localMaxX = -Infinity;
                    let localMinY = Infinity, localMaxY = -Infinity;
                    e.vertices.forEach(v => {
                        if (v.x < localMinX) localMinX = v.x;
                        if (v.x > localMaxX) localMaxX = v.x;
                        if (v.y < localMinY) localMinY = v.y;
                        if (v.y > localMaxY) localMaxY = v.y;
                    });
                    if ((localMaxX - localMinX) > 500 || (localMaxY - localMinY) > 500) {
                        return; // Skip layout geometry
                    }

                    // Check if transformed vertices are outside CAD section bounds (e.g. viewports)
                    let outside = false;
                    const pts = [];
                    for (let v of e.vertices) {
                        const p = currentTransform(v);
                        if (Math.abs(p.x) > 500 || Math.abs(p.y) > 500) {
                            outside = true;
                            break;
                        }
                        pts.push(p);
                    }
                    if (outside) return;

                    pts.forEach(p => {
                        if (p.x < globalMinX) globalMinX = p.x;
                        if (-p.y < globalMinY) globalMinY = -p.y; // note SVG Y inversion
                        if (p.x > globalMaxX) globalMaxX = p.x;
                        if (-p.y > globalMaxY) globalMaxY = -p.y; // note SVG Y inversion
                    });
                } else if (e.type === 'LINE') {
                    if (!e.start || !e.end) return;
                    const p1 = currentTransform(e.start);
                    const p2 = currentTransform(e.end);
                    if (Math.abs(p1.x) > 500 || Math.abs(p1.y) > 500 || Math.abs(p2.x) > 500 || Math.abs(p2.y) > 500) {
                        return;
                    }
                    // Skip long lines (like layout borders or grid lines)
                    const dx = Math.abs(e.start.x - e.end.x);
                    const dy = Math.abs(e.start.y - e.end.y);
                    if (dx > 500 || dy > 500) return;

                    [p1, p2].forEach(p => {
                        if (p.x < globalMinX) globalMinX = p.x;
                        if (-p.y < globalMinY) globalMinY = -p.y;
                        if (p.x > globalMaxX) globalMaxX = p.x;
                        if (-p.y > globalMaxY) globalMaxY = -p.y;
                    });
                } else if (e.type === 'ARC') {
                    if (e.radius > 250) return; // Skip huge circles/arcs
                    const c = currentTransform(e.center);
                    if (Math.abs(c.x) > 500 || Math.abs(c.y) > 500) return;
                    const r = e.radius * Math.abs(ins.xScale || 1);
                    if (c.x - r < globalMinX) globalMinX = c.x - r;
                    if (-c.y - r < globalMinY) globalMinY = -c.y - r;
                    if (c.x + r > globalMaxX) globalMaxX = c.x + r;
                    if (-c.y + r > globalMaxY) globalMaxY = -c.y + r;
                }
            });
        }
    }

    // Traverse top-level inserts in model space
    dxf.entities.forEach(e => {
        if (e.type === 'INSERT') {
            traverseForBBox(e, null);
        }
    });

    const margin = 5;
    const viewBoxX = globalMinX - margin;
    const viewBoxY = globalMinY - margin;
    const viewBoxW = (globalMaxX - globalMinX) + 2 * margin;
    const viewBoxH = (globalMaxY - globalMinY) + 2 * margin;

    console.log(`Global Bounding Box (SVG space):`);
    console.log(`  X: [${viewBoxX.toFixed(2)}, ${(viewBoxX + viewBoxW).toFixed(2)}]`);
    console.log(`  Y: [${viewBoxY.toFixed(2)}, ${(viewBoxY + viewBoxH).toFixed(2)}]`);

    console.log('\n--- Step 4: Exporting Blocks to SVG Folders ---');
    
    // Clear old SVG folder for this drawing to avoid clutter
    if (fs.existsSync(TARGET_SVG_DIR)) {
        fs.rmSync(TARGET_SVG_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TARGET_SVG_DIR, { recursive: true });

    const svgPartsMetadata = [];
    const insertCounts = {};
    let globalIndex = 0;

    // Helper: make path string from polyline vertices
    function makePolylinePath(polyline, transform) {
        let d = '';
        polyline.vertices.forEach((v, i) => {
            const p = transform(v);
            const cmd = (i === 0) ? 'M' : 'L';
            d += `${cmd} ${p.x.toFixed(4)} ${(-p.y).toFixed(4)} `;
        });
        d += 'Z';
        return d;
    }

    // Helper: make path string for line
    function makeLinePath(line, transform) {
        if (!line.start || !line.end) return '';
        const p1 = transform(line.start);
        const p2 = transform(line.end);
        return `M ${p1.x.toFixed(4)} ${(-p1.y).toFixed(4)} L ${p2.x.toFixed(4)} ${(-p2.y).toFixed(4)}`;
    }

    // Helper: make path string for arc
    function makeArcPath(arc, transform, scaleX, scaleY) {
        if (!arc.center || arc.radius === undefined) return '';
        const startX = arc.center.x + arc.radius * Math.cos(arc.startAngle || 0);
        const startY = arc.center.y + arc.radius * Math.sin(arc.startAngle || 0);
        const endX = arc.center.x + arc.radius * Math.cos(arc.endAngle || 0);
        const endY = arc.center.y + arc.radius * Math.sin(arc.endAngle || 0);
        
        const start = transform({ x: startX, y: startY });
        const end = transform({ x: endX, y: endY });
        const rx = arc.radius * Math.abs(scaleX);
        const ry = arc.radius * Math.abs(scaleY);
        
        const largeArcFlag = (arc.angleLength || 0) > Math.PI ? 1 : 0;
        const sweepFlag = (scaleX * scaleY > 0) ? 1 : 0;
        
        return `M ${start.x.toFixed(4)} ${(-start.y).toFixed(4)} A ${rx.toFixed(4)} ${ry.toFixed(4)} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(4)} ${(-end.y).toFixed(4)}`;
    }

    // Helper: compute transformed bbox for a group of entities
    function getTransformedBBox(parts, lines, arcs, transform) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        function update(p) {
            if (!p) return;
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        parts.forEach(part => {
            if (part.outer && part.outer.vertices) {
                part.outer.vertices.forEach(v => update(transform(v)));
            }
            if (part.holes) {
                part.holes.forEach(hole => {
                    if (hole.vertices) {
                        hole.vertices.forEach(v => update(transform(v)));
                    }
                });
            }
        });

        lines.forEach(line => {
            if (line.start && line.end) {
                update(transform(line.start));
                update(transform(line.end));
            }
        });

        arcs.forEach(arc => {
            if (arc.center && arc.radius !== undefined) {
                const c = transform(arc.center);
                const r = arc.radius;
                if (c.x - r < minX) minX = c.x - r;
                if (c.y - r < minY) minY = c.y - r;
                if (c.x + r > maxX) maxX = c.x + r;
                if (c.y + r > maxY) maxY = c.y + r;
            }
        });

        return { minX, minY, maxX, maxY };
    }

    // Recursive insertion processor
    function processInsert(ins, parentTransform, parentPath, parentBlockName = null) {
        const blockName = ins.name;
        // Skip viewports or layout blocks based on name heuristics
        if (blockName.toLowerCase().includes('viewport') || blockName.toLowerCase().includes('border') || blockName.toLowerCase().includes('title')) {
            return;
        }
        const block = dxf.blocks[blockName];
        if (!block) return;

        // Resolve CAD color
        let partColor = '#888888';
        let specificLayer = null;
        if (block.entities) {
            for (let e of block.entities) {
                if (e.layer && e.layer !== '0' && e.layer !== 'Defpoints') {
                    specificLayer = e.layer;
                    break;
                }
            }
        }
        const resolvedLayer = specificLayer || ins.layer || '0';
        if (layerColors[resolvedLayer]) {
            partColor = layerColors[resolvedLayer];
        }

        // Keep instance counter to prevent overlapping
        const instKey = parentBlockName ? `${parentBlockName}_${blockName}` : blockName;
        const instId = insertCounts[instKey] || 0;
        insertCounts[instKey] = instId + 1;
        
        // Output directory is named after the parent piece
        let currentPath = parentPath;
        if (parentBlockName) {
            currentPath = path.join(parentPath, parentBlockName);
        } else {
            currentPath = path.join(parentPath, blockName);
        }

        const targetDir = path.join(TARGET_SVG_DIR, currentPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const currentTransform = createTransform(ins, parentTransform);

        const localLines = [];
        const localPolylines = [];
        const localArcs = [];
        const subInserts = [];

        if (block.entities) {
            block.entities.forEach(e => {
                if (e.type === 'INSERT') {
                    subInserts.push(e);
                } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
                    // Check if transformed vertices are within section bounds
                    let outside = false;
                    for (let v of e.vertices) {
                        const p = currentTransform(v);
                        if (Math.abs(p.x) > 500 || Math.abs(p.y) > 500) {
                            outside = true;
                            break;
                        }
                    }
                    if (!outside) {
                        localPolylines.push(e);
                    }
                } else if (e.type === 'LINE') {
                    if (e.start && e.end) {
                        const p1 = currentTransform(e.start);
                        const p2 = currentTransform(e.end);
                        if (Math.abs(p1.x) <= 500 && Math.abs(p1.y) <= 500 && Math.abs(p2.x) <= 500 && Math.abs(p2.y) <= 500) {
                            localLines.push(e);
                        }
                    }
                } else if (e.type === 'ARC') {
                    if (e.center && e.radius <= 250) {
                        const c = currentTransform(e.center);
                        if (Math.abs(c.x) <= 500 && Math.abs(c.y) <= 500) {
                            localArcs.push(e);
                        }
                    }
                }
            });
        }

        // Group local polylines
        const localParts = groupLocalPolylines(localPolylines);

        // Export this block's geometry if it exists
        if (localParts.length > 0 || localLines.length > 0 || localArcs.length > 0) {
            const instSuffix = instId === 0 ? '' : `_inst${instId}`;
            const svgFilename = `${blockName}${instSuffix}.svg`;
            const svgRelativeUrl = path.join(currentPath, svgFilename).replace(/\\/g, '/');
            const svgFilepath = path.join(TARGET_SVG_DIR, svgRelativeUrl);

            let dAttr = '';
            localParts.forEach(part => {
                dAttr += ' ' + makePolylinePath(part.outer, currentTransform);
                part.holes.forEach(hole => {
                    dAttr += ' ' + makePolylinePath(hole, currentTransform);
                });
            });

            localLines.forEach(line => {
                dAttr += ' ' + makeLinePath(line, currentTransform);
            });

            localArcs.forEach(arc => {
                dAttr += ' ' + makeArcPath(arc, currentTransform, ins.xScale || 1, ins.yScale || 1);
            });

            if (dAttr.trim().length > 0) {
                const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX.toFixed(4)} ${viewBoxY.toFixed(4)} ${viewBoxW.toFixed(4)} ${viewBoxH.toFixed(4)}" width="100%" height="100%">
  <path d="${dAttr.trim()}" fill="#888888" stroke="#000000" stroke-width="0.5" fill-rule="evenodd" />
</svg>
`;
                fs.writeFileSync(svgFilepath, svgContent, 'utf-8');
                console.log(`Saved: svg/${folderName}/${svgRelativeUrl}`);

                const bbox = getTransformedBBox(localParts, localLines, localArcs, currentTransform);

                svgPartsMetadata.push({
                    index: globalIndex++,
                    filename: svgFilename,
                    relativeUrl: svgRelativeUrl,
                    blockName: blockName,
                    parentBlock: parentBlockName,
                    layer: ins.layer || block.layer || '0',
                    color: partColor,
                    bbox: bbox,
                    // Area estimate based on bounding box size
                    area: (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY)
                });
            }
        }

        // Recursively process nested inserts
        subInserts.forEach(sub => {
            processInsert(sub, currentTransform, currentPath, blockName);
        });
    }

    // Start recursive export
    dxf.entities.forEach(e => {
        if (e.type === 'INSERT') {
            processInsert(e, null, "", null);
        }
    });

    console.log(`Exported ${svgPartsMetadata.length} pieces.`);

    // 5. Dynamic Role Assignment (Frame vs Sash)
    // Find the two largest pieces by bounding box area.
    const sortedByArea = [...svgPartsMetadata].sort((a, b) => b.area - a.area);
    if (sortedByArea.length < 2) {
        console.error("Could not find enough parts to identify Frame and Sash roles.");
        process.exit(1);
    }
    const mainA = sortedByArea[0];
    const mainB = sortedByArea[1];

    const mainA_Y = (mainA.bbox.minY + mainA.bbox.maxY) / 2;
    const mainB_Y = (mainB.bbox.minY + mainB.bbox.maxY) / 2;

    let framePart, sashPart;
    const isVertical = dwgBase.toLowerCase().includes('vertikal') || dwgBase.toLowerCase().includes('vertical');

    if (isVertical) {
        if (mainA_Y > mainB_Y) {
            framePart = mainA;
            sashPart = mainB;
        } else {
            framePart = mainB;
            sashPart = mainA;
        }
    } else {
        if (mainA_Y < mainB_Y) {
            framePart = mainA;
            sashPart = mainB;
        } else {
            framePart = mainB;
            sashPart = mainA;
        }
    }

    const frameYCenter = (framePart.bbox.minY + framePart.bbox.maxY) / 2;
    const sashYCenter = (sashPart.bbox.minY + sashPart.bbox.maxY) / 2;

    console.log(`Role Identification:`);
    console.log(`  Frame: BlockName="${framePart.blockName}", CenterY=${frameYCenter.toFixed(2)}`);
    console.log(`  Sash: BlockName="${sashPart.blockName}", CenterY=${sashYCenter.toFixed(2)}`);

    svgPartsMetadata.forEach(part => {
        if (part.blockName === framePart.blockName) {
            part.role = 'frame';
        } else if (part.blockName === sashPart.blockName) {
            part.role = 'sash';
        } else {
            const centerY = (part.bbox.minY + part.bbox.maxY) / 2;
            const distToFrame = Math.abs(centerY - frameYCenter);
            const distToSash = Math.abs(centerY - sashYCenter);
            part.role = (distToFrame < distToSash) ? 'frame' : 'sash';
        }
    });

    // 6. Write final metadata.json
    let cadMinX = Infinity, cadMaxX = -Infinity;
    let cadMinY = Infinity, cadMaxY = -Infinity;
    svgPartsMetadata.forEach(part => {
        if (part.bbox.minX < cadMinX) cadMinX = part.bbox.minX;
        if (part.bbox.maxX > cadMaxX) cadMaxX = part.bbox.maxX;
        if (part.bbox.minY < cadMinY) cadMinY = part.bbox.minY;
        if (part.bbox.maxY > cadMaxY) cadMaxY = part.bbox.maxY;
    });

    const metadata = {
        dwgName: dwgName,
        isVertical: isVertical,
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
            color: p.color,
            bbox: p.bbox
        }))
    };

    fs.writeFileSync(path.join(TARGET_SVG_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`Saved metadata: svg/${folderName}/metadata.json`);
    console.log('Conversion script complete!');
}

run();
