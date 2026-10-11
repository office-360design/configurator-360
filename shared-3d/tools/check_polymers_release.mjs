/** Verify the current update's project-relative files, without installing dependencies. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../RELEASE_POLYMERS16.json', import.meta.url), 'utf8'));
const failures = [];
for (const file of manifest.files) {
  const target = path.resolve(root, file.path);
  if (!target.startsWith(root) || file.path.includes('..') || path.isAbsolute(file.path)) throw new Error('Unsafe manifest path.');
  try {
    const data = await readFile(target);
    if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) failures.push(file.path);
  } catch { failures.push(file.path); }
}
if (failures.length) throw new Error(`Missing/modified release files:\n${failures.join('\n')}`);
console.log(`${manifest.version}: ${manifest.files.length} payload files verified (manifest excluded from self-hashing).`);
