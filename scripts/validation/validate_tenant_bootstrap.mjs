import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getTenantSlugForHostname, TENANT_CONFIGURATORS } from '../../shared-ui/src/tenantBootstrap.js';

assert.equal(getTenantSlugForHostname('tier1-test.360configurator.com'), 'tier1-test');
assert.equal(getTenantSlugForHostname('ACME.360configurator.com.'), 'acme');
assert.equal(getTenantSlugForHostname('www.360configurator.com'), '');
assert.equal(getTenantSlugForHostname('aks.360configurator.com'), '');
assert.equal(getTenantSlugForHostname('foo.bar.360configurator.com'), '');
assert.equal(getTenantSlugForHostname('360configurator.com'), '');
assert.equal(TENANT_CONFIGURATORS.roof.path, '/roof-configurator/');
assert.equal(TENANT_CONFIGURATORS.fence.path, '/fence-configurator/');
assert.equal(TENANT_CONFIGURATORS.cardbox.path, '/cardbox-configurator/');

const nginx = await readFile(new URL('../../cloudrun/nginx.conf', import.meta.url), 'utf8');
assert.match(nginx, /\$is_tenant_host/);
assert.match(nginx, /shared-ui\/tenant\/index\.html/);

const expectedGates = new Map([
  ['../../roof-configurator/js/app.js', "requireTenantConfiguratorAccess('roof')"],
  ['../../solar-configurator/js/app.js', "requireTenantConfiguratorAccess('solar')"],
  ['../../fence-configurator/js/app.js', "requireTenantConfiguratorAccess('fence')"],
  ['../../cardbox-configurator/js/sharedShell.js', "requireTenantConfiguratorAccess('cardbox')"],
  ['../../hall-configurator/js/app.js', "requireTenantConfiguratorAccess('hall')"],
  ['../../pergola-configurator/src/main.js', "requireTenantConfiguratorAccess('pergola')"],
  ['../../window-configurator/src/client/js/main.js', "requireTenantConfiguratorAccess('window')"],
]);
for (const [relativePath, needle] of expectedGates) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.ok(source.includes(needle), `${relativePath} is missing the tenant entitlement gate`);
}

console.log('Tenant bootstrap validation passed.');
