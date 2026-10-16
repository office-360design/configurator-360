// Verificarea greutății sticlei pe suporți (pag. 250–251) și alegerea îmbinării montant–traversă (pag. 183–190).

export function supportCapacity(supports, ref) {
  return supports.find((s) => s.ref === ref) || supports.find((s) => s.ref.split(' / ')[0] === ref) || null;
}

/**
 * Încearcă în ordine: 2 suporți standard → 4 standard → 2 sarcini mari → 4 sarcini mari → în cruce.
 * @param {number} kg greutatea care apasă pe suporți
 * @param {{std?:string, heavy?:string, cross?:string[]}} refs referințele din tabelul de vitraj
 */
export function chooseSupports(kg, refs, supports) {
  const tries = [];
  const s = refs.std && supportCapacity(supports, refs.std);
  const h = refs.heavy && supportCapacity(supports, refs.heavy);
  const c = refs.cross && refs.cross.length && supportCapacity(supports, refs.cross[0]);
  if (s) tries.push({ refs: [refs.std], qty: 2, cap: s.max_kg_2, label: '2 × standard', level: 'ok' });
  if (s && s.max_kg_4) tries.push({ refs: [refs.std], qty: 4, cap: s.max_kg_4, label: '4 × standard', level: 'ok' });
  if (h) tries.push({ refs: [refs.heavy], qty: 2, cap: h.max_kg_2, label: '2 × sarcini mari', level: 'warn' });
  if (h && h.max_kg_4) tries.push({ refs: [refs.heavy], qty: 4, cap: h.max_kg_4, label: '4 × sarcini mari', level: 'warn' });
  if (c) tries.push({ refs: refs.cross, qty: 2, cap: c.max_kg_2, label: 'în cruce (2 seturi)', level: 'warn' });
  for (const t of tries) if (kg <= t.cap) return t;
  return { refs: [], qty: 0, cap: tries.length ? Math.max(...tries.map((t) => t.cap)) : null, label: tries.length ? 'nu trece' : 'fără suport în tabel', level: 'bad' };
}

export function chooseJoint(kg, joints) {
  return joints.find((j) => kg <= j.max_kg) || null;
}
