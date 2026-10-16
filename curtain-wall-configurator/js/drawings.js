// Horizontal section through a mullion node as SVG markup. The parts come
// from the model's section (sections.js, by the fixing of the system).
import { GLASS_GAP } from './sections.js?v=cw-6';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function nodeSvg(model, t) {
  const { glazing, mullion } = model;
  const parts = model.section('mullion');
  const half = model.faceWidth / 2;
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
  const glass = [[-glassW - half, -11], [11, glassW + half]].map(([a, b]) => `<rect class="cw-glass" x="${X(a)}" y="${Z(g1)}" width="${(b - a) * scale}" height="${(g1 - g0) * scale}"/>`).join('');
  const lx = X(glassW + 25) + 14;
  const roles = model.result?.fields?.find(f => f.type !== 'window')?.roles || {};
  const outer = model.edges.v === 'pressure' ? `${t('cz.cap')} ${model.C.cap || ''} · COR-9914` : t('layer.joint');
  const gaskets = `${t('cz.role.mullionGasket')} ${roles.mullionGasket || '—'}`;
  const labels = [
    [zMax, outer],
    [(g0 + g1) / 2, t('node.glass', { t: glazing.thickness, build: glazing.label })],
    [g0 / 2, gaskets],
    [-mullion.depth / 2, t('node.profile', { id: mullion.id, depth: mullion.depth })],
  ].map(([z, text]) => `<line x1="${X(half)}" y1="${Z(z)}" x2="${lx - 4}" y2="${Z(z)}"/><text x="${lx}" y="${Z(z) + 4}">${esc(text)}</text>`).join('');
  return `<svg class="cw-node" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(t('drawing.node'))}">
    ${glass}${shapes}
    <g class="cw-labels">${labels}</g>
    <text x="${X(-glassW - 25)}" y="${vh - 4}" class="cw-legend">${esc(t('node.outside'))} ↑ · ${esc(t('node.inside'))} ↓</text>
  </svg>`;
}
