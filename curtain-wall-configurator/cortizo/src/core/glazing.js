// Acces la tabelele de vitraj din catalog (data/catalog/glazing_tables.json).

export function glazingIndex(rows) {
  const idx = new Map();
  for (const r of rows) {
    const k = `${r.system}|${r.variant}|${r.inner_pane || ''}|${r.glass_mm}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }
  return {
    /** Rândurile pentru o combinație exactă; dacă foaia interioară lipsește, încearcă fără ea. */
    get(system, variant, inner, mm) {
      return idx.get(`${system}|${variant}|${inner || ''}|${mm}`) || (inner ? idx.get(`${system}|${variant}||${mm}`) : null) || [];
    },
    /** Grosimile disponibile (și foile interioare) pentru o variantă. */
    options(system, variant) {
      const out = new Map();
      for (const r of rows) if (r.system === system && r.variant === variant) {
        const key = r.inner_pane || '';
        if (!out.has(key)) out.set(key, new Set());
        out.get(key).add(r.glass_mm);
      }
      return [...out.entries()].map(([inner, set]) => ({ inner, thicknesses: [...set].sort((a, b) => a - b) }));
    },
    variants(system) { return [...new Set(rows.filter((r) => r.system === system).map((r) => r.variant))]; },
  };
}

/** Găsește componenta după începutul numelui ("Suport sticlă standard", "Cală"...). */
export const findComp = (rows, prefix) => rows.find((r) => r.component.startsWith(prefix));
export const findAll = (rows, prefix) => rows.filter((r) => r.component.startsWith(prefix));
