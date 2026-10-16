// Rulează motorul pe un exemplu pentru fiecare sistem și afișează rezumatul.
// Folosire: node scripts/example.mjs [SISTEM]
import { createEngine } from '../src/engine.js';
import { loadData } from '../src/load-node.js';
import { EXAMPLES } from '../tests/examples.js';

const engine = createEngine(loadData());
const only = process.argv[2];
for (const [id, project] of Object.entries(EXAMPLES)) {
  if (only && only !== id) continue;
  const R = engine.compute(project);
  console.log(`\n=== ${R.system.name} ===`);
  console.log(`Montant: ${R.mullion?.code ?? '–'}${R.mullion?.reinforced ? ' + ' + R.mullion.reinforcement : ''} · Ix nec ${R.mullion?.need.toFixed(1)} · Traversă: ${R.transom?.code ?? '–'}`);
  R.checks.forEach((c) => console.log(`  [${c.level}] ${c.title}: ${c.text}`));
  R.fields.forEach((f) => console.log(`  câmp ${f.i},${f.j} ${f.type} ${f.gw}×${f.gh} ${f.kg.toFixed(0)} kg → ${f.label}${f.clipPitch ? ' · pas cleme ' + f.clipPitch : ''}${f.notes.length ? ' · ' + f.notes.join(' ') : ''}`));
  console.log(`  Aluminiu ${R.totals.kgAluminium.toFixed(0)} kg · ${R.cuts.length} coduri de profil · ${R.accessories.length} accesorii`);
  R.notes.forEach((n) => console.log('  notă: ' + n));
}
