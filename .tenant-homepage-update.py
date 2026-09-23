from pathlib import Path
import re


def edit(file, old, new, count=1):
    path = Path(file)
    source = path.read_text()
    if source.count(old) != count:
        raise RuntimeError(f'Unexpected source version in {file}: {old[:80]}')
    path.write_text(source.replace(old, new))


backend = 'firebase-share-backend/functions/index.js'
edit(backend, 'function validateTenantOwnerEmail(value, { optional = true } = {}) {', '''function validateTenantAutoOpenSingleConfigurator(value = false) {
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', 'The single-configurator homepage setting must be true or false.');
  }
  return value;
}

function validateTenantOwnerEmail(value, { optional = true } = {}) {''')
edit(backend, '    companyName: String(data.companyName || slug),', '    companyName: String(data.companyName || slug),\n    autoOpenSingleConfigurator: data.autoOpenSingleConfigurator === true,', count=2)
edit(backend, '''      const companyName = hasOwn('companyName')
        ? validateTenantCompanyName(input.companyName)
        : validateTenantCompanyName(tenant.companyName);''', '''      const companyName = hasOwn('companyName')
        ? validateTenantCompanyName(input.companyName)
        : validateTenantCompanyName(tenant.companyName);
      const autoOpenSingleConfigurator = hasOwn('autoOpenSingleConfigurator')
        ? validateTenantAutoOpenSingleConfigurator(input.autoOpenSingleConfigurator)
        : tenant.autoOpenSingleConfigurator === true;''', count=2)
edit(backend, '''      const privateUpdate = {
        companyName,
        configurators,''', '''      const privateUpdate = {
        companyName,
        autoOpenSingleConfigurator,
        configurators,''')
edit(backend, '      const synchronizedFields = { companyName, configurators, logoUrl, updatedAt: now };', '''      const synchronizedFields = {
        companyName,
        autoOpenSingleConfigurator,
        configurators,
        logoUrl,
        updatedAt: now,
      };''')
edit(backend, '''      const synchronizedFields = {
        companyName,
        status,''', '''      const synchronizedFields = {
        companyName,
        autoOpenSingleConfigurator,
        status,''')
edit(backend, '''      const changedFields = [];
      const changes = [];
      if (String(tenant.companyName || '') !== companyName)''', '''      const changedFields = [];
      const changes = [];
      if ((tenant.autoOpenSingleConfigurator === true) !== autoOpenSingleConfigurator) {
        changedFields.push('homepage behavior');
        changes.push(`Open single configurator automatically: ${autoOpenSingleConfigurator ? 'enabled' : 'disabled'}`);
      }
      if (String(tenant.companyName || '') !== companyName)''', count=2)
edit(backend, '''    const companyName = validateTenantCompanyName(request.data?.companyName);
    const ownerEmail''', '''    const companyName = validateTenantCompanyName(request.data?.companyName);
    const autoOpenSingleConfigurator = validateTenantAutoOpenSingleConfigurator(request.data?.autoOpenSingleConfigurator);
    const ownerEmail''')
edit(backend, '''        companyName,
        plan: TENANT_PLAN_GO_LIVE_NOW,''', '''        companyName,
        autoOpenSingleConfigurator,
        plan: TENANT_PLAN_GO_LIVE_NOW,''')
edit(backend, '''        companyName,
        status: tenantRuntimeStatusForSubscription(subscription.status),''', '''        companyName,
        autoOpenSingleConfigurator,
        status: tenantRuntimeStatusForSubscription(subscription.status),''')
edit(backend, '''            `Company: ${companyName}`,
            `Plan: ${planId}`,''', '''            `Company: ${companyName}`,
            `Plan: ${planId}`,
            `Open single configurator automatically: ${autoOpenSingleConfigurator ? 'enabled' : 'disabled'}`,''')
edit(backend, '''    return {
      slug,
      companyName,
      domain,''', '''    return {
      slug,
      companyName,
      autoOpenSingleConfigurator,
      domain,''')
edit(backend, '''        companyName,
        status,
        planId,''', '''        companyName,
        autoOpenSingleConfigurator,
        status,
        planId,''')
edit('shared-ui/src/tenantBootstrap.js', '    logoUrl: safeLogoUrl(data.logoUrl),', '    logoUrl: safeLogoUrl(data.logoUrl),\n    autoOpenSingleConfigurator: data.autoOpenSingleConfigurator === true,')
Path('shared-ui/src/tenantHomepage.js').write_text('''import { TENANT_CONFIGURATORS, getTenantSlugForHostname } from './tenantBootstrap.js?v=tenant-homepage-1';
import { CONFIGURATOR_PUBLIC_PATHS, getLocaleForHostname } from './config.js?v=tenant-routes-1';

/** Resolve an opt-in homepage redirect using live entitlements, never a pending plan. */
export function singleConfiguratorHomepageUrl(context, location = globalThis.location) {
  if (!context?.isTenant || !context.exists || context.error
      || context.status !== 'active' || context.autoOpenSingleConfigurator !== true) {
    return '';
  }

  let current;
  try {
    current = new URL(location.href);
  } catch {
    return '';
  }
  const slug = getTenantSlugForHostname(current.hostname);
  // Do not redirect dashboards, configurator pages, or a different customer's host.
  if (current.protocol !== 'https:' || current.port || current.pathname !== '/'
      || !slug || slug !== context.slug) {
    return '';
  }

  const enabled = Object.keys(TENANT_CONFIGURATORS)
    .filter((id) => context.configurators?.[id] === true);
  if (enabled.length !== 1) return '';

  const locale = getLocaleForHostname(current.hostname);
  const path = CONFIGURATOR_PUBLIC_PATHS[locale]?.[enabled[0]];
  if (!path) return '';

  // The destination comes only from our route catalogue, never a tenant-provided URL.
  const target = new URL(path, current.origin);
  target.search = current.search;
  target.hash = current.hash;
  return target.href;
}
''')
edit('shared-ui/src/tenantLanding.js', 'import { renderTenantDomainLinks }', "import { singleConfiguratorHomepageUrl } from './tenantHomepage.js?v=tenant-homepage-1';\nimport { renderTenantDomainLinks }")
edit('shared-ui/src/tenantLanding.js', "from './tenantBootstrap.js?v=tenant-domains-1';", "from './tenantBootstrap.js?v=tenant-homepage-1';")
edit('shared-ui/src/tenantLanding.js', '''} else {
  renderTenant(context);
}
''', '''} else {
  const target = singleConfiguratorHomepageUrl(context, window.location);
  if (target) {
    document.title = `${context.companyName} Configurator`;
    page.innerHTML = `
      <section class="tenant-card tenant-card--loading">
        <div class="tenant-loading" aria-hidden="true"></div>
        <p>Opening your configurator…</p>
        <a href="${escapeHtml(target)}">Continue to configurator</a>
        <a href="/dashboard/">Dashboard</a>
      </section>
    `;
    // Replace avoids a back-button loop through the redirecting homepage.
    window.location.replace(target);
  } else {
    renderTenant(context);
  }
}
''')
edit('shared-ui/src/tenantDashboard.js', "const companyName = document.querySelector('#companyName');", "const companyName = document.querySelector('#companyName');\nconst autoOpenSingleConfigurator = document.querySelector('#autoOpenSingleConfigurator');")
edit('shared-ui/src/tenantDashboard.js', '  companyName.value = data.companyName;', '  companyName.value = data.companyName;\n  autoOpenSingleConfigurator.checked = data.autoOpenSingleConfigurator === true;')
edit('shared-ui/src/tenantDashboard.js', '      companyName: name, planId: planSelect.value, configurators, logoMode, logoDataUrl,', '      companyName: name, planId: planSelect.value, configurators, logoMode, logoDataUrl,\n      autoOpenSingleConfigurator: autoOpenSingleConfigurator.checked,')
edit('shared-ui/src/tenantDashboard.js', "'Branding changes saved. Your plan change request is pending confirmation.'", "'Site settings saved. Your plan change request is pending confirmation.'")
admin = 'shared-ui/src/tenantProvisioningAdmin.js'
edit(admin, "const manageCompanyName = document.querySelector('#manageCompanyName');", "const manageCompanyName = document.querySelector('#manageCompanyName');\nconst manageAutoOpenSingleConfigurator = document.querySelector('#manageAutoOpenSingleConfigurator');")
edit(admin, "const companyNameInput = document.querySelector('#companyName');", "const companyNameInput = document.querySelector('#companyName');\nconst createAutoOpenSingleConfigurator = document.querySelector('#createAutoOpenSingleConfigurator');")
edit(admin, "  manageCompanyName.value = tenant.companyName || '';", "  manageCompanyName.value = tenant.companyName || '';\n  manageAutoOpenSingleConfigurator.checked = tenant.autoOpenSingleConfigurator === true;")
edit(admin, "    const result = await callAdminFunction('provisionTenant', { companyName, slug, ownerEmail, planId, configurators, logoDataUrl });", """    const result = await callAdminFunction('provisionTenant', {
      companyName, slug, ownerEmail, planId, configurators, logoDataUrl,
      autoOpenSingleConfigurator: createAutoOpenSingleConfigurator.checked,
    });""")
edit(admin, '    await updateManagedTenant({\n      companyName,', '    await updateManagedTenant({\n      companyName,\n      autoOpenSingleConfigurator: manageAutoOpenSingleConfigurator.checked,')

for file in ['shared-ui/admin/tenant-provisioning/index.html', 'shared-ui/tenant-dashboard/index.html']:
    path = Path(file)
    source = path.read_text()
    forms = ['tenantEditorForm', 'tenantForm'] if 'admin/' in file else ['settingsForm']
    ids = ['manageAutoOpenSingleConfigurator', 'createAutoOpenSingleConfigurator'] if 'admin/' in file else ['autoOpenSingleConfigurator']
    for form, field in zip(forms, ids):
        start = source.index(f'<form id="{form}"')
        index = source.index('</fieldset>', start) + len('</fieldset>')
        source = source[:index] + f'''

          <fieldset class="homepage-fieldset">
            <legend>Homepage behavior</legend>
            <label class="inline-option">
              <input id="{field}" type="checkbox" aria-describedby="{field}Help" />
              <span>Open the configurator directly when only one is enabled</span>
            </label>
            <p id="{field}Help" class="homepage-help">Skip the selection page at your site address when exactly one configurator is enabled.
              With multiple configurators, the selection page is shown. Pending plan requests do not change this behavior until approved.
              The dashboard stays available at /dashboard/.</p>
          </fieldset>''' + source[index:]
    path.write_text(source)
for file in ['shared-ui/styles/tenantProvisioningAdmin.css', 'shared-ui/styles/tenantDashboard.css']:
    path = Path(file)
    path.write_text(path.read_text() + '''\n/* The preference stays editable even when multiple configurators are enabled. */
.homepage-fieldset .inline-option { align-items: flex-start; }
.homepage-fieldset input[type="checkbox"] { flex: 0 0 auto; margin-top: 3px; }
.homepage-help { margin: 10px 0 0; color: #667085; font-size: 13px; line-height: 1.5; }
''')
for file in ['shared-ui/tenant/index.html', 'shared-ui/tenant-dashboard/index.html', 'shared-ui/admin/tenant-provisioning/index.html']:
    path = Path(file)
    source = path.read_text()
    source = re.sub(r'(src="/shared-ui/src/tenant(?:Landing|Dashboard|ProvisioningAdmin)\.js)\?v=[^"]+', r'\1?v=tenant-homepage-1', source)
    source = re.sub(r'(href="/shared-ui/styles/tenant(?:Dashboard|ProvisioningAdmin)\.css)\?v=[^"]+', r'\1?v=tenant-homepage-1', source)
    path.write_text(source)
for file in ['scripts/validation/validate_tenant_plan_changes.mjs', 'scripts/validation/validate_tenant_audit_log.mjs']:
    path = Path(file)
    source = path.read_text().replace('tenantDashboard.css?v=4', 'tenantDashboard.css?v=tenant-homepage-1').replace('tenantProvisioningAdmin.css?v=8', 'tenantProvisioningAdmin.css?v=tenant-homepage-1')
    path.write_text(source)
edit('package.json', 'npm run check:tenant &&', 'npm run check:tenant && npm run check:tenant-homepage &&')
edit('package.json', '    "check:tenant":', '    "check:tenant-homepage": "node --test scripts/validation/tenant-homepage.test.mjs",\n    "check:tenant-homepage:browser": "node scripts/validation/tenant-homepage.browser.mjs",\n    "check:tenant":')
edit('docs/tenant-country-domains.md', '## Deployment and existing tenants', '''## Optional single-configurator homepage

In Tenant Administration (create/edit), or in the customer's dashboard under
**Company & plan → Homepage behavior**, enable **Open the configurator directly
when only one is enabled** and save. `autoOpenSingleConfigurator` is a boolean
stored in the private and public tenant documents by the same transaction. It is
off by default, including for existing tenants with no field; no migration is required.

When the preference is on and the tenant is active with exactly one enabled
configurator, the homepage at `/` uses `location.replace()` to open that
configurator on the same hostname with the same localized path as the public
site. For example, a Solar-only Romanian tenant opens `/configurator-solar/`;
the German alias opens `/solar-konfigurator/`. Query strings and fragments are
preserved. There is no permanent/cached redirect and no plan restriction beyond
checking the currently enabled configurators.

Two or more enabled configurators show the selection page. A pending upgrade or
downgrade does not change the redirect until its configurator selection is
approved. The preference is retained if entitlements change, so it becomes
effective again if only one configurator remains. Suspended, missing and failed
tenant lookups do not redirect. `/dashboard/` and direct configurator URLs are
unaffected. Owners can always return to `/dashboard/` to disable the setting.
Changes are recorded in the existing audit log. Older API clients that omit the
field preserve its value. Only the existing authenticated owner/admin operations
can change it; browsers still cannot write the tenant documents directly.

Deploy the Firebase Functions and frontend from this update. No additional DNS,
IAM, Auth-domain or Firestore rules change is needed for the homepage preference.

## Deployment and existing tenants''')
