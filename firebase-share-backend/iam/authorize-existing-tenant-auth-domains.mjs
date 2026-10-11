#!/usr/bin/env node
// Node >= 18, gcloud CLI; no npm install is required. All writes use IAM.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import policy from '../functions/tenantDomains.cjs';

const PROJECT = 'configurator-360';
const DOCUMENTS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const CONFIG = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const LOCK = `${DOCUMENTS}/tenantProvisioningSystem/authDomainLock`;
const { tenantDomainsForSlug, validTenantSlug } = policy;

function timestamp(value) { return { timestampValue: new Date(value).toISOString() }; }
function strings(values) { return { arrayValue: { values: values.map((stringValue) => ({ stringValue })) } }; }
function readTenant(document) {
  const slug = document.name?.split('/').at(-1) || '';
  const fields = document.fields || {};
  const domain = fields.domain?.stringValue || '';
  if (!validTenantSlug(slug) || fields.plan?.stringValue !== 'go_live_now'
    || !['active', 'suspended'].includes(fields.status?.stringValue)
    || (fields.slug?.stringValue && fields.slug.stringValue !== slug)
    || (domain && domain !== tenantDomainsForSlug(slug)[0])) {
    throw new Error(`Tenant ${slug} does not have a valid Go Live Now identity; no metadata was changed.`);
  }
  return { slug, document, domains: tenantDomainsForSlug(slug) };
}

// Exported for mocked regression tests. Production invokes main only as a CLI.
export async function migrateTenantDomains({ args, request, now = Date.now, log = console.log }) {
  const dryRun = args.includes('--dry-run');
  const target = args.filter((value) => value !== '--dry-run');
  if (target.length !== 1 || (target[0] !== '--all' && !validTenantSlug(target[0]))) {
    throw new Error('Usage: authorize-existing-tenant-auth-domain.sh <tenant-slug|--all> [--dry-run]');
  }
  let tenants = [];
  if (target[0] === '--all') {
    let pageToken = '';
    do {
      const url = new URL(`${DOCUMENTS}/tenants`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await request(url.href);
      tenants.push(...(page.documents || []).filter((doc) => doc.fields?.plan?.stringValue === 'go_live_now').map(readTenant));
      pageToken = page.nextPageToken || '';
    } while (pageToken);
  } else {
    tenants = [readTenant(await request(`${DOCUMENTS}/tenants/${target[0]}`))];
  }
  for (const tenant of tenants) log(`${dryRun ? 'Would register' : 'Registering'} ${tenant.domains.join(', ')}`);
  if (dryRun || !tenants.length) return { tenants: tenants.length, dryRun };

  // Same lease document as provisionTenant. Conditional writes ensure a
  // concurrent migration/provisioning request cannot overwrite an active lease.
  const owner = randomUUID();
  const previous = await request(LOCK, { allow404: true });
  if (Date.parse(previous?.fields?.expiresAt?.timestampValue || '') > now()) {
    throw new Error('Another tenant Auth update is running. Retry shortly.');
  }
  const lockUrl = new URL(LOCK);
  if (previous) lockUrl.searchParams.set('currentDocument.updateTime', previous.updateTime);
  else lockUrl.searchParams.set('currentDocument.exists', 'false');
  const leaseExpiresAt = now() + 120_000;
  await request(lockUrl.href, { method: 'PATCH', body: { fields: {
    owner: { stringValue: owner }, expiresAt: timestamp(leaseExpiresAt),
  } } });
  try {
    const config = await request(CONFIG);
    if (!Array.isArray(config.authorizedDomains)) throw new Error('Firebase returned no authorized domain list; refusing to replace it.');
    const domains = [...new Set([...config.authorizedDomains, ...tenants.flatMap((tenant) => tenant.domains)])].sort();
    if (now() > leaseExpiresAt - 30_000) throw new Error('Auth lease expired before update. Retry.');
    if (!domains.every((domain) => config.authorizedDomains.includes(domain))) {
      await request(`${CONFIG}?updateMask=authorizedDomains`, {
        method: 'PATCH', body: { name: `projects/${PROJECT}/config`, authorizedDomains: domains },
      });
    }
    const verified = await request(CONFIG);
    if (!domains.every((domain) => verified.authorizedDomains?.includes(domain))) {
      throw new Error('Firebase did not retain all domains; no tenant metadata was backfilled.');
    }
  } finally {
    const current = await request(LOCK);
    if (current.fields?.owner?.stringValue === owner) {
      const url = new URL(LOCK);
      url.searchParams.set('currentDocument.updateTime', current.updateTime);
      await request(url.href, { method: 'DELETE' });
    }
  }

  let failed = 0;
  for (const tenant of tenants) {
    const url = new URL(`${DOCUMENTS}/tenants/${tenant.slug}`);
    // An admin editing the tenant concurrently causes a safe failure. Rerunning
    // is idempotent; it must never replace the complete tenant document.
    url.searchParams.set('currentDocument.updateTime', tenant.document.updateTime);
    const fields = {
      domain: { stringValue: tenant.domains[0] },
      domains: strings(tenant.domains),
      firebaseAuthDomain: { stringValue: tenant.domains[0] },
      firebaseAuthDomains: strings(tenant.domains),
      firebaseAuthDomainAuthorized: { booleanValue: true },
      updatedAt: timestamp(now()),
    };
    for (const key of Object.keys(fields)) url.searchParams.append('updateMask.fieldPaths', key);
    try {
      await request(url.href, { method: 'PATCH', body: { fields } });
      log(`Tenant Auth aliases ready: ${tenant.slug} (status, ownership and data preserved)`);
    } catch (error) {
      failed += 1;
      log(`Metadata backfill failed for ${tenant.slug}: ${error.message}. Rerun the helper for this tenant.`);
    }
  }
  if (failed) throw new Error(`${failed} tenant metadata update(s) failed. Auth aliases were registered, but backfill needs a retry.`);
  return { tenants: tenants.length, dryRun: false };
}

async function main() {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', timeout: 30_000 }).trim();
  const request = async (url, { method = 'GET', body, allow404 = false } = {}) => {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Goog-User-Project': PROJECT,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch { throw new Error(`Non-JSON response (HTTP ${response.status})`); }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
    return result;
  };
  await migrateTenantDomains({ args: process.argv.slice(2), request });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
