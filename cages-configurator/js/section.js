// Cross-section drawing (SVG markup) with bore/panel outline, spiral, rings and bars.
export function sectionSvg(S, m) {
  const ob = Math.max(m.boreB, m.boreH);
  const sc = 180 / ob, cx = 115, cy = 105;
  const P = (u, v) => [(cx + u * sc).toFixed(1), (cy - v * sc).toFixed(1)];
  let spiral = '', ring = '';
  for (let i = 0; i <= 160; i++) { const p = m.path(i / 160); spiral += (i ? 'L' : 'M') + P(p[0], p[1]).join(','); }
  if (S.rings) for (let i = 0; i <= 160; i++) { const p = m.path(i / 160, m.ringOff); ring += (i ? 'L' : 'M') + P(p[0], p[1]).join(','); }
  const bore = m.circ
    ? `<circle cx="${cx}" cy="${cy}" r="${(m.boreB / 2 * sc).toFixed(1)}" />`
    : `<rect x="${(cx - m.boreB / 2 * sc).toFixed(1)}" y="${(cy - m.boreH / 2 * sc).toFixed(1)}" width="${(m.boreB * sc).toFixed(1)}" height="${(m.boreH * sc).toFixed(1)}" />`;
  const bars = m.bars.map(b => { const [x, y] = P(b.u, b.v); return `<circle cx="${x}" cy="${y}" r="${Math.max(1.2, m.dl / 2 * sc).toFixed(2)}"/>`; }).join('');
  const y0 = cy + m.boreH / 2 * sc + 12, xa = cx - m.B / 2 * sc, xb = cx + m.B / 2 * sc;
  const dimTxt = m.circ ? `Ø${S.D}` : `${m.B}`;
  const side = cx + m.boreB / 2 * sc + 8;
  return `<svg viewBox="0 0 240 ${Math.ceil(y0 + 34)}" role="img" aria-label="Secțiune transversală carcasă">
    <g fill="none" stroke="var(--bore)" stroke-width="1" stroke-dasharray="4 3">${bore}</g>
    ${ring ? `<path d="${ring}" fill="none" stroke="var(--steel)" stroke-opacity=".55" stroke-width="${Math.max(1, (+S.ringD) * sc).toFixed(2)}"/>` : ''}
    <path d="${spiral}" fill="none" stroke="var(--steel)" stroke-width="${Math.max(1, m.ds * sc).toFixed(2)}"/>
    <g fill="var(--steel-2)">${bars}</g>
    <g stroke="var(--muted)" stroke-width=".8" fill="none">
      <line x1="${xa}" y1="${y0}" x2="${xb}" y2="${y0}"/><line x1="${xa}" y1="${y0 - 5}" x2="${xa}" y2="${y0 + 5}"/><line x1="${xb}" y1="${y0 - 5}" x2="${xb}" y2="${y0 + 5}"/>
      ${m.circ ? '' : `<line x1="${side}" y1="${cy - m.H / 2 * sc}" x2="${side}" y2="${cy + m.H / 2 * sc}"/>`}
    </g>
    <g font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)" text-anchor="middle">
      <text x="${cx}" y="${y0 + 15}">${dimTxt}</text>
      ${m.circ ? '' : `<text x="${side}" y="${cy - m.H / 2 * sc - 5}">${m.H}</text>`}
      <text x="${cx}" y="${y0 + 28}" fill="var(--ink)">${S.n}Ø${S.dl} · spirală Ø${S.ds}/${S.pitch}</text>
    </g>
  </svg>
  <p class="hint">Linie punctată: ${m.circ ? `foraj Ø${m.boreB}` : `panou ${m.boreB}×${m.boreH}`} (acoperire ${S.cover} mm)</p>`;
}
