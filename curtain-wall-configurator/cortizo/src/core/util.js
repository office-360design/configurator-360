// Utilitare comune: formatare, evaluarea formulelor de debitare din catalog ("L-22", "2L+2H").

/** Evaluează o formulă de debitare din catalog, ex. "L-22", "H-89.2", "L - 85". */
export function evalCut(expr, L, H) {
  const m = String(expr).replace(/\s+/g, '').match(/^([LH])([-+])([\d.]+)$/);
  if (!m) throw new Error(`Formulă de debitare necunoscută: ${expr}`);
  const base = m[1] === 'L' ? L : H;
  const v = parseFloat(m[3]);
  return m[2] === '-' ? base - v : base + v;
}

/** Lungimea de garnitură pentru o regulă de consum ca "2L+2H", "2L", "6L+6H" (mm). */
export function evalGasket(expr, L, H) {
  return String(expr).replace(/\s+/g, '').split('+').reduce((sum, part) => {
    const m = part.match(/^(\d*)([LH])$/);
    if (!m) throw new Error(`Regulă de garnitură necunoscută: ${expr}`);
    return sum + (m[1] ? +m[1] : 1) * (m[2] === 'L' ? L : H);
  }, 0);
}

/** Desparte o referință compusă din catalog: "COR-9840+COR-9841", "COR-9843 + COR-9842 (x2)", "COR 9840 + COR-9843". */
export function splitRef(ref) {
  if (!ref) return [];
  const out = [];
  String(ref).split('+').forEach((p) => {
    p = p.trim();
    const m = p.match(/(COR[\s-]?\d{4}|\d{6,7})\s*(\((?:x|X)(\d)\))?/);
    if (m) out.push({ code: m[1].replace(/^COR\s?(\d)/, 'COR-$1'), qty: m[3] ? +m[3] : 1 });
  });
  return out;
}

export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);
export const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
