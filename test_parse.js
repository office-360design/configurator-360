const fs = require('fs');
const DxfParser = require('dxf-parser');

const parser = new DxfParser();
try {
    const fileContent = fs.readFileSync('dwg/575760_d1.dxf', 'utf-8');
    const dxf = parser.parseSync(fileContent);
    
    const polylines = dxf.entities
        .filter(e => e.type === 'LWPOLYLINE')
        .map((e, idx) => {
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            e.vertices.forEach(v => {
                if (v.x < minX) minX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.x > maxX) maxX = v.x;
                if (v.y > maxY) maxY = v.y;
            });
            return {
                id: idx,
                layer: e.layer,
                vertices: e.vertices,
                bbox: { minX, minY, maxX, maxY },
                area: Math.abs(getPolygonArea(e.vertices))
            };
        });

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

    polylines.forEach(p => {
        console.log(`\nPolyline ${p.id} (Layer: ${p.layer}):`);
        console.log(`  BBox: [${p.bbox.minX.toFixed(2)}, ${p.bbox.minY.toFixed(2)}] to [${p.bbox.maxX.toFixed(2)}, ${p.bbox.maxY.toFixed(2)}]`);
        console.log(`  Area: ${p.area.toFixed(2)}`);
        
        // Find if this polyline is inside any other polyline
        const containers = [];
        polylines.forEach(other => {
            if (other.id !== p.id) {
                // Check if the first vertex of p is inside other
                if (isPointInPolygon(p.vertices[0], other.vertices)) {
                    containers.push(other.id);
                }
            }
        });
        if (containers.length > 0) {
            console.log(`  Inside Polyline(s): ${containers.join(', ')}`);
        } else {
            console.log(`  It is an OUTER boundary`);
        }
    });

} catch(err) {
    console.error(err);
}
