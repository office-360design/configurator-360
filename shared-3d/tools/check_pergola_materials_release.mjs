/** Verify an applied release without a renderer or dependency installation. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const release = JSON.parse(await readFile(new URL('../RELEASE_PERGOLA17.json', import.meta.url), 'utf8'));
const errors = [];
for (const record of release.changedFiles) {
  const file = path.resolve(root, record.path);
  if (!file.startsWith(root) || record.path.includes('..')) throw new Error('Invalid release path.');
  try {
    const bytes = await readFile(file);
    if (bytes.length !== record.bytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
      errors.push(`Modified or incomplete update: ${record.path}`);
    }
  } catch { errors.push(`Missing file: ${record.path}`); }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`${release.version}: ${release.changedFiles.length} files verified (manifest excluded from self-hashing).`);
