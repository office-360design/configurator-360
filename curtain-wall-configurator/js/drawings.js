// 2D technical drawings as SVG markup: facade elevation with axis dimensions
// and the horizontal section through a mullion node.
import { SYSTEM } from './catalog.js?v=cw-1';
import { fmt } from './facade.js?v=cw-1';
import { GLASS_GAP, nodeParts } from './sections.js?v=cw-1';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function elevationSvg(model, t) {
  const { xs, ys, W, H, panes, mullion, transom } = model;
  const pad = 70, scale = Math.min(520 / W, 360 / H);
  const w = W * scale, h = H * scale, vw = w + pad * 2, vh = h + pad * 2;
  const X = x => pad + x * scale, Y = y => pad + h - y * scale;
  const face = SYSTEM.faceWidth * scale;
  const cells = panes.map(p => `<rect x="${X(p.x0) + face / 2}" y="${Y(p.y1) + face / 2}" width="${(p.x1 - p.x0) * scale - face}" height="${(p.y1 - p.y0) * scale - face}" class="${p.spandrel ? 'cw-spandrel' : 'cw-vision'}"/>`).join('');
  const verticals = xs.map(x => `<rect x="${X(x) - face / 2}" y="${Y(H) - face / 2}" width="${face}" height="${h + face}" class="cw-member"/>`).join('');
  const horizontals = ys.map(y => xs.slice(0, -1).map((x, i) => `<rect x="${X(x) + face / 2}" y="${Y(y) - face / 2}" width="${(xs[i + 1] - x) * scale - face}" height="${face}" class="cw-member"/>`).join('')).join('');
  const dimX = xs.slice(0, -1).map((x, i) => `<line x1="${X(x)}" y1="${Y(0) + 26}" x2="${X(xs[i + 1])}" y2="${Y(0) + 26}"/><text x="${(X(x) + X(xs[i + 1])) / 2}" y="${Y(0) + 22}">${xs[i + 1] - x}</text>`).join('');
  const dimY = ys.slice(0, -1).map((y, i) => `<line x1="${X(0) - 26}" y1="${Y(y)}" x2="${X(0) - 26}" y2="${Y(ys[i + 1])}"/><text x="${X(0) - 30}" y="${(Y(y) + Y(ys[i + 1])) / 2}" transform="rotate(-90 ${X(0) - 30} ${(Y(y) + Y(ys[i + 1])) / 2})">${ys[i + 1] - y}</text>`).join('');
  const ticks = [...xs.map(x => `<line x1="${X(x)}" y1="${Y(0) + 20}" x2="${X(x)}" y2="${Y(0) + 32}"/>`), ...ys.map(y => `<line x1="${X(0) - 32}" y1="${Y(y)}" x2="${X(0) - 20}" y2="${Y(y)}"/>`)].join('');
  return `<svg class="cw-elevation" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${esc(t('drawing.elevation'))}">
    <g>${cells}${horizontals}${verticals}</g>
    <g class="cw-dim">${ticks}${dimX}${dimY}
      <line x1="${X(0)}" y1="${Y(0) + 50}" x2="${X(W)}" y2="${Y(0) + 50}"/><text x="${X(W / 2)}" y="${Y(0) + 46}" class="cw-total">${fmt(W)} mm</text>
      <line x1="${X(0) - 50}" y1="${Y(0)}" x2="${X(0) - 50}" y2="${Y(H)}"/><text x="${X(0) - 54}" y="${Y(H / 2)}" class="cw-total" transform="rotate(-90 ${X(0) - 54} ${Y(H / 2)})">${fmt(H)} mm</text>
    </g>
    <text x="${X(W)}" y="${pad - 30}" class="cw-legend" text-anchor="end">${esc(t('drawing.axes', { mullion: mullion.id, transom: transom.id }))}</text>
  </svg>`;
}

export function nodeSvg(model, t) {
  const { S, glazing, mullion } = model;
  const parts = nodeParts({ depth: mullion.depth, thickness: glazing.thickness, stripId: S.strip, coverId: S.coverMullion });
  const zs = parts.flatMap(p => p.contour.map(([, z]) => z));
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const scale = Math.min(2.2, 300 / (zMax - zMin));
  const glassW = 70; // drawn glass length on each side of the joint
  const pad = 20, labelW = 190;
  const X = x => pad + (glassW + 25 + x) * scale;
  const Z = z => pad + (zMax - z) * scale;
  const vw = pad * 2 + (glassW * 2 + 50) * scale + labelW, vh = pad * 2 + (zMax - zMin) * scale;
  const path = pts => pts.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Z(z).toFixed(1)}`).join('') + 'Z';
  const shapes = parts.map(p => `<path class="cw-part cw-${p.kind}" fill-rule="evenodd" d="${path(p.contour)}${p.holes.map(path).join('')}"/>`).join('');
  const g0 = GLASS_GAP, g1 = GLASS_GAP + glazing.thickness;
  const glass = [[-glassW - 25, -11], [11, glassW + 25]].map(([a, b]) => `<rect class="cw-glass" x="${X(a)}" y="${Z(g1)}" width="${(b - a) * scale}" height="${(g1 - g0) * scale}"/>`).join('');
  const lx = X(glassW + 25) + 14;
  const labels = [
    [zMax, t('node.cover', { id: model.S.strip, cover: S.coverMullion })],
    [(g0 + g1) / 2, t('node.glass', { t: glazing.thickness, build: glazing.label })],
    [g0 / 2, t('node.gaskets', { outside: '760006', inside: '760110' })],
    [-mullion.depth / 2, t('node.profile', { id: mullion.id, depth: mullion.depth })],
  ].map(([z, text]) => `<line x1="${X(25)}" y1="${Z(z)}" x2="${lx - 4}" y2="${Z(z)}"/><text x="${lx}" y="${Z(z) + 4}">${esc(text)}</text>`).join('');
  return `<svg class="cw-node" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(t('drawing.node'))}">
    ${glass}${shapes}
    <g class="cw-labels">${labels}</g>
    <text x="${X(-glassW - 25)}" y="${vh - 4}" class="cw-legend">${esc(t('node.outside'))} ↑ · ${esc(t('node.inside'))} ↓</text>
  </svg>`;
}
