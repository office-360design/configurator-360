import { execFileSync } from 'node:child_process';
import { TENANT_DOMAIN_ROOTS } from '../../shared-ui/src/tenantDomains.js';

// Actual launcher, dashboard and admin JavaScript with synthetic Firebase
// responses. No account, entitlement, quota or production endpoint is changed.
for (const root of Object.values(TENANT_DOMAIN_ROOTS)) {
  execFileSync(process.execPath, ['scripts/validation/tenant-catalogue.browser.mjs'], {
    stdio: 'inherit', env: { ...process.env, TENANT_TEST_DOMAIN_ROOT: root },
  });
}
console.log('All three tenant domain UI smoke tests passed.');
