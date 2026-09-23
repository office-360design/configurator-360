from pathlib import Path
import json, subprocess
root = Path.cwd()

def edit(path, old, new, count=1):
    file = root / path
    source = file.read_text()
    assert source.count(old) == count, (path, old[:100], source.count(old))
    file.write_text(source.replace(old, new))

edit('shared-ui/src/config.js', "  // Tenant aliases keep the standard paths; public marketing sites retain their\n  // localized canonical URLs. Neither domain switching nor cart editing may\n  // drop a customer's slug and send them into the public platform scope.\n  const paths = CONFIGURATOR_PUBLIC_PATHS[tenant ? 'en-US' : resolvedLocale];", "  // Public sites and tenant aliases share the same localized route catalogue.\n  // Keep the customer slug when changing locale or editing a cart item.\n  const paths = CONFIGURATOR_PUBLIC_PATHS[resolvedLocale];")
edit('shared-ui/src/tenantLanding.js', "const page = document.querySelector('#tenantPage');", "import { CONFIGURATOR_PUBLIC_PATHS, getLocaleForHostname } from './config.js?v=tenant-routes-1';\n\nconst page = document.querySelector('#tenantPage');")
edit('shared-ui/src/tenantLanding.js', '  const cards = enabled.length', '  const paths = CONFIGURATOR_PUBLIC_PATHS[getLocaleForHostname(window.location.hostname)];\n  const cards = enabled.length')
edit('shared-ui/src/tenantLanding.js', 'href="${item.path}"', 'href="${paths[item.id] || item.path}"')
edit('shared-ui/src/standaloneShell.js', './config.js?v=tenant-domains-1', './config.js?v=tenant-routes-1')
edit('shared-ui/src/standaloneShell.js', '''    let target;
    if (tenantSlug) {
      if (getTenantSlugForHostname(destination.hostname) !== tenantSlug) return null;
      target = new URL(`/${product}-configurator/`, destination.origin);
    } else {
      const domainLocale = getLocaleForHostname(window.location.hostname);
      const localized = getLocalizedConfiguratorUrl(domainLocale, product, baseUrl);
      if (!localized) return null;
      target = new URL(localized, window.location.href);
    }''', '''    if (tenantSlug && getTenantSlugForHostname(destination.hostname) !== tenantSlug) return null;
    const domainLocale = getLocaleForHostname(
      tenantSlug ? destination.hostname : window.location.hostname,
    );
    const localized = getLocalizedConfiguratorUrl(domainLocale, product, destination);
    if (!localized) return null;
    const target = new URL(localized, window.location.href);''')

# Generate document redirects from the existing public route catalogue.
paths = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {CONFIGURATOR_PUBLIC_PATHS as p} from './shared-ui/src/config.js'; console.log(JSON.stringify(p));",
], cwd=root, text=True))
block = '''    # Tenant document URLs use the public site's naming for the current domain.
    # Match the ORIGINAL request URI: localized routes internally rewrite to the
    # English asset directories, and inspecting $uri would create redirect loops.
    # Only entry documents are canonicalized; JS/CSS/models stay at either path.
    map "$is_tenant_host:$host" $tenant_route_locale {
        default "";
        ~^1:.*\\.360configurator\\.com$ en-US;
        ~^1:.*\\.360configurator\\.ro$ ro-RO;
        ~^1:.*\\.360konfigurator\\.de$ de-DE;
    }

    # Mirrors CONFIGURATOR_PUBLIC_PATHS in shared-ui/src/config.js. The nginx
    # regression tests compare every public and tenant route against that source.
    map "$tenant_route_locale:$request_uri" $tenant_configurator_redirect {
        default "";
'''
for locale, catalogue in paths.items():
    block += f'\n        # {locale}\n'
    for product, target in catalogue.items():
        aliases = list(dict.fromkeys(p[product].strip('/') for p in paths.values()))
        canonical = target.strip('/')
        others = [alias for alias in aliases if alias != canonical]
        if others:
            regex = f"~^{locale}:/(?:{'|'.join(others)})(?:/index\\.html|/)?(?:\\?.*)?$"
            block += f'        "{regex}" {target};\n'
        regex = f'~^{locale}:/{canonical}(?:/index\\.html)?(?:\\?.*)?$'
        block += f'        "{regex}" {target};\n'
block += '    }\n\n'
edit('cloudrun/nginx.conf', '    server {\n        listen 8080;\n        server_name 360configurator.com;', block + '    server {\n        listen 8080;\n        server_name 360configurator.com;')
edit('cloudrun/nginx.conf', '        index index.html;\n', '''        index index.html;

        # Preserve tenant identity, query transport and HTTPS when old links are
        # opened. Canonical pages are not matched, even after internal rewrites.
        if ($tenant_configurator_redirect) {
            return 301 https://$host$tenant_configurator_redirect$is_args$args;
        }
''')

# Refresh the affected module import chains without changing configurator logic.
for file in root.rglob('*.js'):
    if any(part in ['.git', 'node_modules', 'dist'] for part in file.parts):
        continue
    source = file.read_text()
    if 'standaloneShell.js?v=tenant-domains-1' in source:
        file.write_text(source.replace('standaloneShell.js?v=tenant-domains-1', 'standaloneShell.js?v=tenant-routes-1'))
for product in ['roof', 'solar', 'hall', 'fence', 'cardbox', 'bookshelf']:
    edit(f'{product}-configurator/index.html', './js/sharedShell.js?v=tenant-domains-1', './js/sharedShell.js?v=tenant-routes-1')
edit('chair-configurator/js/app.js', './sharedShell.js?v=chair-26', './sharedShell.js?v=tenant-routes-1')
edit('chair-configurator/index.html', './js/app.js?v=tenant-domains-1', './js/app.js?v=tenant-routes-1')
edit('tiles-configurator/index.html', './js/app.js?v=tenant-domains-1', './js/app.js?v=tenant-routes-1')
edit('window-configurator/src/client/index.html', './shared-shell.js?v=tenant-domains-1', './shared-shell.js?v=tenant-routes-1')
edit('shared-ui/tenant/index.html', 'tenantLanding.js?v=tenant-domains-1', 'tenantLanding.js?v=tenant-routes-1')
edit('shared-ui/src/index.js', './config.js?v=tenant-domains-1', './config.js?v=tenant-routes-1')
edit('docs/tenant-country-domains.md', '''Tenant configurators use the standard paths (for example `/roof-configurator/`)
on all three roots. Existing Romanian/German route aliases also remain inside
the tenant. The public root/www redirects and localized paths are unchanged.''', '''Tenant configurators use the same localized paths as the corresponding public
site. For example, Solar uses `/solar-configurator/` on `.com`,
`/configurator-solar/` on `.ro`, and `/solar-konfigurator/` on `.de`.
Launcher links, Change Site Domain and cart-edit links use the shared public
route catalogue. Tiles and Bookshelf keep their unchanged public paths.

Old English or other-language entry URLs (with/without a trailing slash, or
ending in `/index.html`) redirect to the current tenant domain's localized path.
Query parameters are retained; browsers also retain fragment-based save/share,
cart and authentication transport. JS/CSS/models are not redirected, and localized
asset requests still resolve to the same physical configurator directories.
The public root/www redirects and localized paths are unchanged.''')

# Check all ten products across all three source and target domains.
edit('scripts/validation/tenant-domains.test.mjs', 'import { getLocaleForHostname, getLocalizedConfiguratorUrl }', 'import { getLocaleForHostname, getLocalizedConfiguratorUrl, CONFIGURATOR_PUBLIC_PATHS }')
edit('scripts/validation/tenant-domains.test.mjs', 'assert.equal(target.pathname, `/${product}-configurator/`);', 'assert.equal(target.pathname, CONFIGURATOR_PUBLIC_PATHS[targetLocale][product]);')
edit('scripts/validation/tenant-domains.test.mjs', "assert.equal(target.hostname, hosts[2]); assert.equal(target.hash, '#cartProduct=roof&cartItem=item-1');", "assert.equal(target.hostname, hosts[2]);\n  assert.equal(target.pathname, '/dach-konfigurator/');\n  assert.equal(target.hash, '#cartProduct=roof&cartItem=item-1');")
edit('scripts/validation/tenant-domains.test.mjs', "assert.equal(share.hostname, hosts[1]); assert.equal(share.hash, '#s=test-snapshot');", "assert.equal(share.hostname, hosts[1]);\n  assert.equal(share.pathname, '/configurator-acoperis/');\n  assert.equal(share.hash, '#s=test-snapshot');")
edit('scripts/validation/tenant-domains.test.mjs', "  assert.equal(target.hash, '#cartProduct=roof&cartItem=item-1');", '''  assert.equal(target.hash, '#cartProduct=roof&cartItem=item-1');
  for (const [locale, root] of Object.entries(policy.TENANT_DOMAIN_ROOTS)) {
    for (const product of Object.keys(TENANT_CONFIGURATORS)) {
      const edit = new URL(proto.buildCartEditTarget.call({}, product, 'item-1',
        `https://acme.${root}/solar-configurator/?old=1#s=old-share`));
      assert.equal(edit.hostname, `acme.${root}`);
      assert.equal(edit.pathname, CONFIGURATOR_PUBLIC_PATHS[locale][product]);
      assert.equal(edit.search, '');
      assert.equal(edit.hash, `#cartProduct=${product}&cartItem=item-1`);
    }
  }''')
edit('scripts/validation/tenant-catalogue.browser.mjs', "import { chromium } from 'playwright';", "import { chromium } from 'playwright';\nimport { CONFIGURATOR_PUBLIC_PATHS, getLocaleForHostname } from '../../shared-ui/src/config.js';")
edit('scripts/validation/tenant-catalogue.browser.mjs', 'assert.deepEqual(links.sort(), additions.map((id) => `/${id}-configurator/`).sort());', '''const paths = CONFIGURATOR_PUBLIC_PATHS[getLocaleForHostname(new URL(tenantOrigin).hostname)];
  assert.deepEqual(links.sort(), additions.map((id) => paths[id]).sort());
  // Exercise every launcher URL, not just the four recently added products.
  products.forEach((id) => { configurators[id] = true; });
  await page.reload();
  await page.waitForSelector('.tenant-configurator');
  const allLinks = await page.locator('.tenant-configurator').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('href')),
  );
  assert.deepEqual(allLinks.sort(), products.map((id) => paths[id]).sort());
  products.forEach((id) => { configurators[id] = additions.includes(id); });
''')

# Exercise the actual nginx configuration: entry redirects, query transport and
# localized assets. No request is sent to a live Firebase or upstream API.
file = root / 'scripts/validation/tenant-domains.nginx.py'
source = file.read_text()
source = source.replace('import http.client\n', 'import http.client\nimport json\n')
source = source.replace('import time\n', 'import time\nfrom urllib.parse import urlsplit\n')
source = source.replace("nginx = shutil.which('nginx')", '''# The public JavaScript catalogue is the source of expected route names.
route_catalogue = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {CONFIGURATOR_PUBLIC_PATHS as p} from './shared-ui/src/config.js'; console.log(JSON.stringify(p));",
], cwd=root, text=True))
domains = {
    'en-US': '360configurator.com',
    'ro-RO': '360configurator.ro',
    'de-DE': '360konfigurator.de',
}
nginx = shutil.which('nginx')''')
source = source.replace("        fixtures[f'{product}-configurator/js/app.js'] = f'ASSET {product}'", '''        fixtures[f'{product}-configurator/js/app.js'] = f'ASSET {product}'
        fixtures[f'{product}-configurator/styles.css'] = f'CSS {product}'
        fixtures[f'{product}-configurator/models/model.glb'] = f'MODEL {product}'
        fixtures[f'{product}-configurator/shared-ui/src/config.js'] = f'SHARED {product}' ''')
source = source.replace("= f'SHARED {product}' \n", "= f'SHARED {product}'\n")
start = source.index("        for suffix in ['360configurator.com'")
end = source.index("        for host, marker in [('www.", start)
source = source[:start] + '''        for locale, suffix in domains.items():
            host = f'acme.{suffix}'
            for uri, marker in [('/', 'TENANT LAUNCHER'), ('/dashboard/', 'TENANT DASHBOARD')]:
                status, headers, body = get(host, uri)
                assert status == 200 and marker in body, (host, uri, status, headers, body)
                tested += 1
            for product, canonical in route_catalogue[locale].items():
                aliases = {paths[product] for paths in route_catalogue.values()}
                for alias in aliases:
                    for entry in [alias.rstrip('/'), alias, alias + 'index.html']:
                        for query in ['', '?savedConfig=save-1&cartItem=item-2&encoded=a%2Fb%20c']:
                            status, headers, body = get(host, entry + query)
                            if entry == canonical:
                                assert status == 200 and body == f'APP {product}', (host, entry, status, headers)
                            else:
                                destination = f'https://{host}{canonical}{query}'
                                assert status == 301 and headers.get('Location') == destination, (host, entry, status, headers, destination)
                                parsed = urlsplit(destination)
                                final = get(parsed.hostname, parsed.path + ('?' + parsed.query if parsed.query else ''))
                                assert final[0] == 200 and final[2] == f'APP {product}', (destination, final)
                            tested += 1
                    # Both old absolute and localized relative asset paths work.
                    for file, marker in [('js/app.js', 'ASSET'), ('styles.css', 'CSS'),
                                         ('models/model.glb', 'MODEL'), ('shared-ui/src/config.js', 'SHARED')]:
                        status, headers, body = get(host, alias + file + '?v=1')
                        assert status == 200 and body == f'{marker} {product}', (host, alias, file, status, headers, body)
                        assert 'Location' not in headers
                        tested += 1
            for prefix, target_domain in [('ro', '360configurator.ro'), ('de', '360konfigurator.de')]:
                status, headers, _ = get(host, f'/{prefix}/roof-configurator/?test=1')
                assert headers.get('Location') == f'https://acme.{target_domain}/roof-configurator/?test=1', headers
                tested += 1
            assert get(host, '/sitemap.xml')[0] == 404
            assert 'Disallow: /' in get(host, '/robots.txt')[2]
            assert get(host, '/internal/tenant-provisioning/')[0] == 404
            tested += 3
        # Public canonical entry points remain byte-for-byte serving the same apps.
        for locale, suffix in domains.items():
            for product, canonical in route_catalogue[locale].items():
                response = get(f'www.{suffix}', canonical)
                assert response[0] == 200 and response[2] == f'APP {product}', (suffix, canonical, response)
                tested += 1
''' + source[end:]
source = source.replace('assertions, public and tenant routes.', 'route cases, public and tenant routes.')
file.write_text(source)
print('Localized tenant route changes applied.')
