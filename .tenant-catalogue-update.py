from pathlib import Path
import re
root=Path.cwd()
def edit(path,old,new,count=1):
 p=root/path; s=p.read_text(); assert s.count(old)==count,(path,old,s.count(old)); p.write_text(s.replace(old,new))
version='tenant-catalogue-1'
# The browser registry drives labels, links and tenant entitlement normalization.
edit('shared-ui/src/tenantBootstrap.js',
 "  chair: Object.freeze({ id: 'chair', label: 'Chair Configurator', path: '/chair-configurator/' }),",
 "  chair: Object.freeze({ id: 'chair', label: 'Chair Configurator', path: '/chair-configurator/' }),\n  bookshelf: Object.freeze({ id: 'bookshelf', label: 'Bookshelf Configurator', path: '/bookshelf-configurator/' }),")
for f in ['shared-ui/src/tenantProvisioningAdmin.js','shared-ui/src/tenantDashboard.js']:
 p=root/f; s=p.read_text(); s="import { TENANT_CONFIGURATORS } from './tenantBootstrap.js?v=tenant-catalogue-1';\n"+s
 s,n=re.subn(r'const CONFIGURATOR_LABELS = Object\.freeze\(\{[\s\S]*?\n\}\);',"const CONFIGURATOR_LABELS = Object.freeze(Object.fromEntries(\n  Object.values(TENANT_CONFIGURATORS).map(({ id, label }) => [\n    id, label.replace(/ Configurator$/, ''),\n  ]),\n));",s); assert n==1
 if 'Admin.js' in f:
  s,n=re.subn(r'const CONFIGURATOR_PATHS = Object\.freeze\(\{[\s\S]*?\n\}\);',"const CONFIGURATOR_PATHS = Object.freeze(Object.fromEntries(\n  Object.values(TENANT_CONFIGURATORS).map(({ id, path }) => [id, path]),\n));",s); assert n==1
 p.write_text(s)
# Rendered form choices match the same registry. Preserve the existing layout.
for f,names in [('shared-ui/admin/tenant-provisioning/index.html',['configurator','manageConfigurator']),('shared-ui/tenant-dashboard/index.html',['configurator'])]:
 p=root/f; s=p.read_text()
 for name in names:
  for product,label in [('cardbox','Cardbox'),('tiles','Pavement (Tiles)'),('chair','Chair'),('bookshelf','Bookshelf')]:
   if f'name="{name}" value="{product}"' in s: continue
   end=s.index('\n',s.index(f'name="{name}" value="fence"'))
   s=s[:end]+f'\n              <label><input type="checkbox" name="{name}" value="{product}" /> <span>{label}</span></label>'+s[end:]
 # Reorder each group to the registry, without touching unrelated form sections.
 for name in names:
  pattern=rf'              <label><input type="checkbox" name="{name}" value="[^" ]+"[^\n]*'
  rows=re.findall(pattern,s); assert len(rows)==10,(f,name,len(rows))
  order=['window','pergola','roof','solar','hall','fence','cardbox','tiles','chair','bookshelf']
  sortedrows=sorted(rows,key=lambda r:order.index(re.search(r'value="([^" ]+)"',r).group(1)))
  for row in rows: s=s.replace(row,'__CATALOGUE_ROW__',1)
  for row in sortedrows: s=s.replace('__CATALOGUE_ROW__',row,1)
 p.write_text(s)
edit('firebase-share-backend/functions/index.js','maxConfigurators: 7,','maxConfigurators: ALLOWED_PRODUCTS.size,')
edit('firebase-share-backend/functions/index.js',"      'All 7 standard configurators',","      `All ${ALLOWED_PRODUCTS.size} standard configurators`,")
edit('firebase-share-backend/firestore.rules',"'cardbox', 'bookshelf', 'tiles'","'cardbox', 'bookshelf', 'chair', 'tiles'",2)
# app.js and sharedShell.js are separate module entry points in these pages.
# Gate both; gating only the shared shell still starts the renderer when denied.
for product in ['bookshelf','cardbox']:
 f=f'{product}-configurator/js/app.js'; p=root/f; s=p.read_text()
 anchor="import { OrbitControls } from 'three/addons/controls/OrbitControls.js';"
 assert s.count(anchor)==1
 s=s.replace(anchor,anchor+"\nimport { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-catalogue-1';\n\nawait requireTenantConfiguratorAccess('"+product+"');")
 p.write_text(s)
edit('bookshelf-configurator/js/sharedShell.js',
 "import { resolveTenantContext } from '../../shared-ui/src/tenantBootstrap.js?v=platform-18';\n\nconst resolvedTenantContext = await resolveTenantContext();\nconst tenantContext = resolvedTenantContext?.isTenant && resolvedTenantContext?.exists && resolvedTenantContext?.status === 'active'\n  ? resolvedTenantContext\n  : null;",
 "import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-catalogue-1';\n\nconst tenantContext = await requireTenantConfiguratorAccess('bookshelf');")
edit('tiles-configurator/js/app.js',"const tenant = await requireTenantConfiguratorAccess('tiles');\n",'')
edit('tiles-configurator/js/app.js',"import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js';", "import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-catalogue-1';\n\nconst tenant = await requireTenantConfiguratorAccess('tiles');")
# Cache-bust the entry chains that consume the expanded registry/gates.
for f in ['shared-ui/src/tenantLanding.js','cardbox-configurator/js/sharedShell.js','chair-configurator/js/app.js']:
 p=root/f;s=p.read_text(); s,n=re.subn(r"tenantBootstrap.js(?:\?v=[^'\"]+)?",'tenantBootstrap.js?v=tenant-catalogue-1',s); assert n==1;p.write_text(s)
for f,old,new in [
 ('shared-ui/admin/tenant-provisioning/index.html','tenantProvisioningAdmin.js?v=9','tenantProvisioningAdmin.js?v=10'),
 ('shared-ui/tenant-dashboard/index.html','tenantDashboard.js?v=5','tenantDashboard.js?v=6'),
 ('shared-ui/tenant/index.html','tenantLanding.js?v=2','tenantLanding.js?v=3'),
 ('bookshelf-configurator/index.html','./js/app.js?v=bookshelf-point1-45','./js/app.js?v=bookshelf-point1-46'),
 ('bookshelf-configurator/index.html','./js/sharedShell.js?v=bookshelf-point1-45','./js/sharedShell.js?v=bookshelf-point1-46'),
 ('cardbox-configurator/index.html','./js/app.js?v=platform-18','./js/app.js?v=tenant-catalogue-1'),
 ('cardbox-configurator/index.html','./js/sharedShell.js?v=platform-19','./js/sharedShell.js?v=tenant-catalogue-1'),
 ('tiles-configurator/index.html','src="./js/app.js"','src="./js/app.js?v=tenant-catalogue-1"'),
 ]:edit(f,old,new)
p=root/'chair-configurator/index.html';s=p.read_text();s,n=re.subn(r'(src="\./js/app.js)\?v=[^"]+',r'\1?v=tenant-catalogue-1',s);assert n==1;p.write_text(s)
edit('cloudrun/nginx.conf',
 '# Client-specific modular bookshelf configurator. It intentionally uses\n        # one non-indexed route on all domains and is not part of the public\n        # marketing catalogue or standard tenant plan catalogue.',
 '# Modular bookshelf configurator. Keep its non-indexed public route;\n        # tenant access is now included in the standard catalogue and guarded\n        # by the same entitlement bootstrap as the other configurators.')
edit('firebase-share-backend/README.md','`go_live_now_all` — maximum 6 configurators','`go_live_now_all` — the full standard catalogue (currently 10 configurators)')
edit('firebase-share-backend/README.md','for the six configurators.','for the standard configurator catalogue.')
edit('scripts/validation/validate_tenant_subscription_model.mjs',"'maxConfigurators: 7'","'maxConfigurators: ALLOWED_PRODUCTS.size'")
# Existing smoke checks now cover every gate, including the independent 3D entries.
f='scripts/validation/validate_tenant_bootstrap.mjs';p=root/f;s=p.read_text();anchor="  ['../../cardbox-configurator/js/sharedShell.js', \"requireTenantConfiguratorAccess('cardbox')\"],";assert anchor in s
s=s.replace(anchor,anchor+"\n  ['../../cardbox-configurator/js/app.js', \"requireTenantConfiguratorAccess('cardbox')\"],\n  ['../../chair-configurator/js/app.js', \"requireTenantConfiguratorAccess('chair')\"],\n  ['../../tiles-configurator/js/app.js', \"requireTenantConfiguratorAccess('tiles')\"],\n  ['../../bookshelf-configurator/js/app.js', \"requireTenantConfiguratorAccess('bookshelf')\"],\n  ['../../bookshelf-configurator/js/sharedShell.js', \"requireTenantConfiguratorAccess('bookshelf')\"],")
p.write_text(s)

p=root/'package.json';s=p.read_text().replace('npm run check:tenant &&','npm run check:tenant && npm run check:tenant-catalogue &&',1).replace('    "check:tenant":', '    "check:tenant-catalogue": "node --test scripts/validation/tenant-catalogue.test.mjs",\n    "check:tenant-catalogue:browser": "node scripts/validation/tenant-catalogue.browser.mjs",\n    "check:tenant":');p.write_text(s)
p=root/"firebase-share-backend/README.md";p.write_text(p.read_text()+'\n\n### Expanded Tier-1 catalogue\n\nThe standard tenant catalogue includes Window, Pergola, Roof, Solar, Hall, Fence,\nCardbox, Pavement (Tiles), Chair and Bookshelf. The all-configurators plan derives\nits capacity from the backend product registry rather than a fixed number.\nExisting tenant selections are preserved; new products remain disabled unless\nexplicitly selected by an administrator or through the existing dashboard plan\nchange workflow. No tenant migration or new Firebase apps are required.\n\nProvisioning, management, the customer dashboard and analytics expose all ten\nproducts. Bookshelf keeps its quotation-only experience and non-indexed public\nroute. Cardbox and Bookshelf gate both their app and their separate shared-shell\nentry points before initializing. Chair is included in both share-document rules.\n\nDeploy frontend assets, Firebase functions and Firestore rules together through\nthe existing release workflows. A push to the tenants branch alone does not\nautomatically publish production. Run `npm run check:tenant-catalogue` for offline\nbehavioural checks and `npm run check:tenant-catalogue:browser` for UI smoke tests\n(requires the existing root Playwright dependency and its Chromium browser).\n')
