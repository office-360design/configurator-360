// Statică: inerția necesară pentru o grindă simplu rezemată cu încărcare uniformă.
// Ix,nec = 5·q·b·L⁴ / (384·E·f), cu f = min(L/limită, limită absolută).

/**
 * @param {number} qKPa  încărcare pe suprafață [kN/m²] (perpendiculară pe profil)
 * @param {number} bMm   lățimea de influență [mm]
 * @param {number} LMm   deschiderea [mm]
 * @param {object} rules common.json
 * @returns {number} inerția necesară [cm⁴]
 */
export function requiredInertia(qKPa, bMm, LMm, rules) {
  if (!(qKPa > 0 && bMm > 0 && LMm > 0)) return 0;
  const E = rules.material.E_aluminium_N_mm2;
  const f = Math.min(LMm / rules.deflection.relative_limit, rules.deflection.absolute_limit_mm);
  const qLine = (qKPa / 1000) * bMm; // N/mm
  return (5 * qLine * LMm ** 4) / (384 * E * f) / 1e4;
}

/**
 * Alege cel mai puțin adânc montant care acoperă Ix necesar; opțional acceptă cămașa de armare.
 * @param {Array} mullions lista din data/catalog/mullions.json
 * @param {number} need Ix necesar [cm⁴]
 * @param {{allowReinforcement?:boolean, family?:string, allowedCodes?:string[]}} opts
 */
export function pickMullion(mullions, need, opts = {}) {
  const fam = opts.family || 'Standard';
  const list = mullions
    .filter((m) => m.family === fam && (m.depth_mm || 0) >= 65)
    .filter((m) => !opts.allowedCodes || opts.allowedCodes.includes(m.code))
    .sort((a, b) => a.depth_mm - b.depth_mm || a.Ix_cm4 - b.Ix_cm4);
  for (const m of list) {
    if (m.Ix_cm4 >= need) return { mullion: m, reinforced: false, Ix: m.Ix_cm4, kg_m: m.kg_m };
    if (opts.allowReinforcement && m.Ix_reinf_cm4 && m.Ix_reinf_cm4 >= need)
      return { mullion: m, reinforced: true, Ix: m.Ix_reinf_cm4, kg_m: m.kg_m_reinf };
  }
  return null;
}

/** Traversa de nivel 1 cu aceeași adâncime ca montantul (sau următoarea mai adâncă). */
export function pickTransom(transoms, mullionDepth) {
  const lvl1 = transoms.filter((t) => t.level === 1);
  return lvl1.find((t) => t.for_mullion_mm === mullionDepth)
    || lvl1.filter((t) => t.for_mullion_mm >= mullionDepth).sort((a, b) => a.for_mullion_mm - b.for_mullion_mm)[0]
    || null;
}
