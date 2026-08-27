import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const functions = read('firebase-share-backend/functions/index.js');
const nginx = read('cloudrun/nginx.conf');
const adminHtml = read('shared-ui/admin/tenant-provisioning/index.html');
const adminJs = read('shared-ui/src/tenantProvisioningAdmin.js');
const dashboardHtml = read('shared-ui/tenant-dashboard/index.html');
const dashboardJs = read('shared-ui/src/tenantDashboard.js');
const landingJs = read('shared-ui/src/tenantLanding.js');
const workflow = read('.github/workflows/deploy-firebase-share.yml');

assert.match(nginx, /location = \/dashboard/);
assert.match(nginx, /shared-ui\/tenant-dashboard\/index\.html/);
assert.match(nginx, /\$is_tenant_host = 0/);
assert.match(landingJs, /href="\/dashboard\/"/);

assert.match(adminHtml, /id="ownerEmail"/);
assert.match(adminHtml, /id="manageOwnerEmail"/);
assert.match(adminJs, /ownerEmailInput/);
assert.match(adminJs, /manageOwnerEmail/);
assert.match(adminJs, /ownerEmail, planId/);

assert.match(functions, /function validateTenantOwnerEmail/);
assert.match(functions, /async function requireTenantDashboardOwner/);
assert.match(functions, /ownerUid: ''/);
assert.match(functions, /ownerEmail,/);
assert.match(functions, /exports\.getTenantDashboard = onCall/);
assert.match(functions, /exports\.updateTenantDashboard = onCall/);
assert.match(functions, /lastSelfServiceUpdateByUid/);
assert.match(functions, /tenantSlugFromConfiguratorOrigin\(origin\)/);
assert.match(functions, /origin !== `https:\/\/\$\{slug\}\.360configurator\.com`/);
assert.doesNotMatch(dashboardJs, /tenantSlug\s*:/);
assert.doesNotMatch(dashboardJs, /slug\s*:/);

assert.match(dashboardHtml, /id="settingsForm"/);
assert.match(dashboardHtml, /id="monthAnalyticsBody"/);
assert.match(dashboardHtml, /id="lifetimeAnalyticsBody"/);
assert.match(dashboardHtml, /id="planSelect"/);
assert.match(dashboardJs, /getTenantDashboard/);
assert.match(dashboardJs, /updateTenantDashboard/);
assert.match(dashboardJs, /signInWithGoogle/);
assert.match(dashboardJs, /validateSelection/);

for (const fn of ['getTenantDashboard', 'updateTenantDashboard']) {
  assert.match(workflow, new RegExp(`functions:${fn}`));
}

console.log('Tier-1 tenant dashboard validation passed.');
