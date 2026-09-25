import { triangulate, layoutStepWalls } from './roofLayout.js?v=layout-11';

// Lightweight isometric preview: no second WebGL context or covering rebuild
// while the user is choosing a constraint. Coordinates use the real roof heights.
export function drawAlignmentPreview(svg, layout, target, point) {
  const ns = 'http://www.w3.org/2000/svg';
  const project = p => ({ x: (p.x - p.z) * 0.866, y: (p.x + p.z) * 0.5 - p.h });
  const polygons = layout.faces.flatMap((face, index) =>
    triangulate(face, layout.vertices).map(ids => ({
      points: ids.map(id => layout.vertices[id]),
      fill: index === target ? '#67e8f9' : ['#bfdbfe', '#a7f3d0', '#fde68a', '#ddd6fe'][index % 4],
    })));
  layoutStepWalls(layout).forEach(points => polygons.push({ points, fill: '#cbd5e1' }));
  polygons.sort((a, b) => {
    const depth = polygon => polygon.points.reduce((sum, p) => sum + p.x + p.z, 0) / polygon.points.length;
    return depth(a) - depth(b);
  });
  const projected = layout.vertices.map(project);
  const minX = Math.min(...projected.map(p => p.x)), minY = Math.min(...projected.map(p => p.y));
  const width = Math.max(1, Math.max(...projected.map(p => p.x)) - minX);
  const height = Math.max(1, Math.max(...projected.map(p => p.y)) - minY);
  const margin = Math.max(width, height) * 0.08;
  svg.setAttribute('viewBox', `${minX - margin} ${minY - margin} ${width + 2 * margin} ${height + 2 * margin}`);
  svg.replaceChildren();
  polygons.forEach(({ points, fill }) => {
    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', points.map(project).map(p => `${p.x},${p.y}`).join(' '));
    polygon.setAttribute('fill', fill);
    polygon.setAttribute('stroke', '#64748b');
    polygon.setAttribute('stroke-width', '0.025');
    svg.append(polygon);
  });
  const marker = document.createElementNS(ns, 'circle');
  const p = project(point);
  marker.setAttribute('cx', p.x);
  marker.setAttribute('cy', p.y);
  marker.setAttribute('r', Math.max(width, height) * 0.018);
  marker.setAttribute('fill', '#ea580c');
  svg.append(marker);
}
