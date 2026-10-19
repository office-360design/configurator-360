// Încarcă datele din data/ pentru Node (teste, scripturi). În browser datele sunt injectate de scripts/build-web.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const readDir = (sub) => Object.fromEntries(readdirSync(join(root, sub)).filter((f) => f.endsWith('.json'))
  .map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(root, sub, f), 'utf8'))]));

export function loadData() {
  return { catalog: readDir('catalog'), rules: readDir('rules') };
}
