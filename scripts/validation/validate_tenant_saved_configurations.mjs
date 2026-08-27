import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [
  ['firebase-share-backend/functions/index.js', [
    'requireSavedConfigurationScope(request, product)',
    ".collection('tenantSavedConfigurations')",
    ".doc(tenantSlug)",
    "configurators[product] !== true",
    'const { tenantSlug } = await requireSavedConfigurationScope(request, product);',
    'userSavedItemsCollection(uid, product, tenantSlug)',
  ]],
  ['firebase-share-backend/firestore.rules', [
    'match /users/{userId}/tenantSavedConfigurations/{tenantSlug}/products/{product}/items/{configurationId}',
    'allow read, write: if false;',
  ]],
  ['shared-ui/src/standaloneShell.js', [
    "getTenantSlugForHostname } from './tenantBootstrap.js?v=2'",
    'savedConfigurationScopeForHostname(hostname',
    ':project-meta:tenant:',
    ':tenant:${encodeURIComponent(tenantSlug)}:user:',
    'ownsSavedConfiguration && sameSavedScope',
    'await this.buildSharedDomainTarget(nextLocale)',
  ]],
  ['firebase-share-backend/README.md', [
    'tenantSavedConfigurations/{tenantSlug}/products/{product}/items/{configurationId}',
    'those older records contain no trustworthy tenant provenance',
  ]],
];

const failures = [];
for (const [relativePath, needles] of checks) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath}: missing file`);
    continue;
  }
  const content = read(relativePath);
  for (const needle of needles) {
    if (!content.includes(needle)) failures.push(`${relativePath}: missing ${JSON.stringify(needle)}`);
  }
}

const functions = read('firebase-share-backend/functions/index.js');
const scopeCallCount = (functions.match(/requireSavedConfigurationScope\(request, product\)/g) || []).length;
if (scopeCallCount < 4) {
  failures.push(`Expected all four saved-configuration operations to enforce origin scope; found ${scopeCallCount}.`);
}

const shell = read('shared-ui/src/standaloneShell.js');
if (!shell.includes('if (getTenantSlugForHostname(window.location.hostname)) return {};')) {
  failures.push('Tenant local metadata must not inherit the legacy platform saved pointer.');
}

if (failures.length) {
  console.error('Tenant saved-configuration isolation validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Tenant saved-configuration isolation validation passed.');
