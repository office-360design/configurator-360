import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [
  ['firebase-share-backend/functions/index.js', [
    'identityToolkitAuth = new GoogleAuth',
    'IDENTITY_TOOLKIT_CONFIG_URL',
    'ensureFirebaseAuthorizedDomain(domain)',
    "updateMask: 'authorizedDomains'",
    'concurrency: 1',
    'maxInstances: 1',
    "await requireAllowedConfiguratorOrigin(requestOrigin(request), 'source origin')",
    "await requireAllowedConfiguratorOrigin(request.data?.targetOrigin, 'target origin')",
    "await requireAllowedConfiguratorOrigin(requestOrigin(request), 'destination origin')",
    "tenant.status === 'active'",
  ]],
  ['firebase-share-backend/iam/setup-tenant-auth-domain-manager.sh', [
    'firebaseauth.configs.get,firebaseauth.configs.update',
    'identitytoolkit.googleapis.com',
    'tenantAuthDomainManager',
  ]],
  ['firebase-share-backend/iam/authorize-existing-tenant-auth-domains.mjs', [
    'authorizedDomains',
    'tenantProvisioningSystem/authDomainLock',
    'X-Goog-User-Project',
  ]],
  ['firebase-share-backend/iam/authorize-tenant-provisioning-admin.sh', [
    'FIREBASE_UID="${1:-}"',
    'tenantProvisioningAdmins/${FIREBASE_UID}',
  ]],
  ['firebase-share-backend/README.md', [
    'setup-tenant-auth-domain-manager.sh',
    'authorize-existing-tenant-auth-domain.sh tier1-test',
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

// Every public country domain must be accepted by the first-party auth helpers
// and the configurator backend, in the shared language order.
const publicHosts = ['www.360configurator.com', 'www.360configurator.ro', 'www.360konfigurator.de',
  'www.360configurador.es', 'www.360configurateur.fr', 'www.360configuratore.it'];
for (const file of ['shared-ui/src/firebaseAuth.js', 'shared-ui/src/firebaseAppCheck.js']) {
  const content = read(file);
  for (const host of publicHosts) if (!content.includes(`'${host}'`)) failures.push(`${file}: missing first-party auth domain ${host}`);
}
for (const host of publicHosts) {
  if (!functions.includes(`'https://${host}'`)) failures.push(`firebase-share-backend/functions/index.js: missing origin https://${host}`);
}
if (functions.includes("ALLOWED_CONFIGURATOR_ORIGINS.add('*.360configurator.com')")) {
  failures.push('Tenant origins must be validated against Firestore, not trusted as a blanket wildcard origin.');
}
if (!functions.includes("tenantRecordMatchesHost(tenant, new URL(normalized).hostname)")) {
  failures.push('Tenant origin validation must verify the private tenant domain matches the requested hostname.');
}

if (failures.length) {
  console.error('Tenant authentication-domain validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Tenant authentication-domain validation passed.');
