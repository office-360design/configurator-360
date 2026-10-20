// Traduce rândurile din tabelele de vitraj în „roluri” pe care le folosește motorul.
// Numele componentelor sunt cele din data/catalog/glazing_tables.json (coloana component).

const ROLE_BY_COMPONENT = [
  ['Garnitură montant', 'mullionGasket'],
  ['Garnitură traversă', 'transomGasket'],
  ['Reductor falț', 'reducer'],
  ['Suport sticlă standard', 'supportStd'],
  ['Suport sticlă sarcini mari', 'supportHeavy'],
  ['Suport sticlă în cruce', 'supportCross'],
  ['Cală', 'block'],
  ['Izolator RPT', 'rpt'],
  ['Șurub presor', 'pressureScrew'],
  ['Pipetă drenaj', 'pipette'],
  ['Clemă SG (a)', 'clipDouble'], ['Clemă (a)', 'clipDouble'],
  ['Clemă SG (b)', 'clipSingle'], ['Clemă (b)', 'clipSingle'],
  ['Șurub', 'clipScrew'],
  ['Garnitură fund etanșare', 'backer'],
  ['Garnitură uscată SG', 'dryGasket'],
];

export function rolesFrom(rows) {
  const r = { supportCross: [] };
  for (const row of rows) {
    const hit = ROLE_BY_COMPONENT.find(([prefix]) => row.component.startsWith(prefix));
    if (!hit) continue;
    const role = hit[1];
    if (role === 'supportCross') r.supportCross.push(row.ref);
    else if (!r[role]) r[role] = row.ref;
  }
  return r;
}

/** Completează rolurile lipsă din tabelul primar cu cele din tabelul secundar. */
export function mergeRoles(primary, secondary) {
  const out = { ...secondary, ...Object.fromEntries(Object.entries(primary).filter(([, v]) => v && (!Array.isArray(v) || v.length))) };
  if (!out.supportCross) out.supportCross = [];
  return out;
}
