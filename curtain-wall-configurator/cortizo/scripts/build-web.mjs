// Construiește dist/configurator.html: o singură pagină cu datele, motorul și interfața incluse.
// Rulare: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/load-node.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// modulele motorului, în ordinea dependențelor; importurile și cuvântul export se elimină
const modules = ['src/core/util.js', 'src/core/statics.js', 'src/core/clips.js', 'src/core/packing.js', 'src/core/glazing.js',
  'src/core/supports.js', 'src/core/roles.js', 'src/systems/index.js', 'src/engine.js'];
const engine = modules.map((m) => `// ── ${m}\n` + read(m)
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export\s+(const|function|class|let)/gm, '$1')).join('\n');

const data = JSON.stringify(loadData()).replace(/<\//g, '<\\/');
const html = read('web/template.html')
  .replace('<!--MAP-->', () => read('web/map.html'))
  .replace('/*DATA*/', () => data)
  .replace('/*ENGINE*/', () => engine)
  .replace('/*APP*/', () => read('web/app.js'));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/configurator.html'), html);
console.log(`dist/configurator.html – ${(html.length / 1024).toFixed(0)} KB`);
