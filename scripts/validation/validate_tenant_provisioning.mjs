import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [
  ['firebase-share-backend/functions/index.js', [
    "exports.provisionTenant = onCall(",
    "TENANT_PROVISIONING_ADMINS_COLLECTION",
    "transaction.create(privateRef",
    "transaction.create(publicRef",
    "throw new HttpsError('already-exists'",
    "TENANT_LOGO_MAX_BYTES = 200_000",
  ]],
  ['firebase-share-backend/firestore.rules', [
    'match /tenantProvisioningAdmins/{uid}',
    'match /tenantPublic/{tenantSlug}',
    'match /tenants/{tenantSlug}',
  ]],
  ['.github/workflows/deploy-firebase-share.yml', [
    'provisionTenant',
    'functions:provisionTenant',
  ]],
  ['cloudrun/nginx.conf', [
    'location = /internal/tenant-provisioning/',
    '/shared-ui/admin/tenant-provisioning/index.html',
  ]],
  ['shared-ui/admin/tenant-provisioning/index.html', [
    'Tier-1 tenant administration',
    'tenantProvisioningAdmin.js?v=8',
  ]],
  ['shared-ui/src/tenantProvisioningAdmin.js', [
    'FUNCTION_BASE',
    'provisionTenant',
    'getFirebaseIdToken',
    'optimizeLogo',
    'image/png',
    'image/webp',
  ]],
  ['shared-ui/src/tenantBootstrap.js', [
    'data:image\\/(?:png|jpeg|webp);base64',
  ]],
  ['firebase-share-backend/iam/authorize-tenant-provisioning-admin.sh', [
    'tenantProvisioningAdmins',
    'gcloud auth print-access-token',
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

const adminJs = read('shared-ui/src/tenantProvisioningAdmin.js');
if (adminJs.includes('image/svg+xml')) failures.push('Admin provisioning must not accept SVG logos.');

const functionSource = read('firebase-share-backend/functions/index.js');
if (!functionSource.includes("data:(image\\/(?:png|jpeg|webp))")) {
  failures.push('Backend logo validation must explicitly restrict logo MIME types.');
}

if (failures.length) {
  console.error('Tenant provisioning validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Tenant provisioning validation passed.');
