import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = fs.readFileSync(path.join(root, 'shared-ui/src/tenantDomains.js'), 'utf8');
const names = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((match) => match[1]);
const header = '// Generated from shared-ui/src/tenantDomains.js. Do not edit directly.\n';
const files = {
  'firebase-share-backend/functions/tenantDomains.cjs':
    `${header}'use strict';\n${source.replace(/^export /gm, '')}\nmodule.exports = { ${names.join(', ')} };\n`,
  'solar-google-api/src/tenantDomains.mjs': `${header}${source}`,
};
for (const [file, expected] of Object.entries(files)) {
  const target = path.join(root, file);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
      throw new Error(`${file} is stale; run node scripts/build/sync-tenant-domains.mjs`);
    }
  } else {
    fs.writeFileSync(target, expected);
  }
}
console.log('Tenant domain policy copies are synchronized.');
