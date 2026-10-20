// Optimizare simplă de debitare: First-Fit Decreasing pe bare de lungime fixă.
export function packBars(pieces, barMm, kerfMm = 0) {
  const bins = [], over = [];
  [...pieces].sort((a, b) => b - a).forEach((p) => {
    if (p > barMm) { over.push(p); return; }
    let b = bins.find((x) => x.free >= p + (x.n ? kerfMm : 0));
    if (!b) { b = { free: barMm, n: 0, cuts: [] }; bins.push(b); }
    b.free -= p + (b.n ? kerfMm : 0); b.n++; b.cuts.push(p);
  });
  const used = pieces.filter((p) => p <= barMm).reduce((a, b) => a + b, 0);
  return { bars: bins.length, overLength: over, waste: bins.length ? 1 - used / (bins.length * barMm) : 0, layout: bins.map((b) => b.cuts) };
}
