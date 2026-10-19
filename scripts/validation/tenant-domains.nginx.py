#!/usr/bin/env python3
"""Exercise the real nginx routes against local fixtures, never production.
Only the port, document root, PID/log paths and upstream DNS are substituted.
No upstream route is requested: the auth/Solar proxy config remains syntax-tested.
"""
import http.client
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[2]
# The public JavaScript catalogue is the source of expected route names.
route_catalogue = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {CONFIGURATOR_PUBLIC_PATHS as p} from './shared-ui/src/config.js'; console.log(JSON.stringify(p));",
], cwd=root, text=True))
domains = {
    'en-US': '360configurator.com',
    'ro-RO': '360configurator.ro',
    'de-DE': '360konfigurator.de',
    'es-ES': '360configurador.es',
    'fr-FR': '360configurateur.fr',
    'it-IT': '360configuratore.it',
}
locale_prefixes = [locale.split('-')[0] for locale in domains if locale != 'en-US']
# Presentation page slugs per language (the website's source of truth).
page_slugs = json.loads((root / 'website/lib/page-slugs.json').read_text())
def localized_page(locale, path):
    """Public path of an English marketing path on a locale's domain."""
    if locale == 'en':
        return path
    first, _, rest = path.partition('/')
    page = next(v for v in page_slugs['pages'].values() if v['en'] == first)
    return page[locale] + ('/' + page_slugs['configurators'][rest][locale] if rest else '')
nginx = shutil.which('nginx') or '/usr/sbin/nginx'
if not Path(nginx).exists():
    raise SystemExit('nginx is required for route tests (install nginx, then rerun).')
with tempfile.TemporaryDirectory(prefix='tenant-domains-nginx-') as work:
    work = Path(work)
    work.chmod(0o755)
    site = work / 'site'
    fixtures = {
        'index.html': 'PUBLIC EN',
        **{f'{prefix}/index.html': f'PUBLIC {prefix.upper()}' for prefix in locale_prefixes},
        'shared-ui/tenant/index.html': 'TENANT LAUNCHER',
        'shared-ui/tenant-dashboard/index.html': 'TENANT DASHBOARD',
        'shared-ui/admin/tenant-provisioning/index.html': 'INTERNAL ADMIN',
        'shared-ui/admin/sales-dashboard/index.html': 'SALES DASHBOARD',
        'sitemap-en.xml': 'SITEMAP EN',
        **{f'sitemap-{prefix}.xml': f'SITEMAP {prefix.upper()}' for prefix in locale_prefixes},
        '_next/static/chunks/test-AbCd1234.js': 'const payload = "website";\n' * 150,
        'styles/homepage-polish.css': 'body { color: black; }\n' * 150,
        'lite-assets/tiles/yard-4.jpg': 'WEBSITE PHOTO',
        'llms.txt': 'CONTEXT EN', 'llms-full.txt': 'FULL EN',
        **{f'llms-{prefix}.txt': f'CONTEXT {prefix.upper()}' for prefix in locale_prefixes},
        **{f'llms-full-{prefix}.txt': f'FULL {prefix.upper()}' for prefix in locale_prefixes},
    }
    marketing_paths = ['about', 'contact', 'pricing', 'book-a-demo'] + [
        f'configurators/{product}' for product in
        ['pergola', 'roof', 'window', 'hall', 'solar', 'fence', 'chair', 'cardbox', 'bookshelf', 'tiles']
    ]
    for locale_prefix in [''] + [f'{prefix}/' for prefix in locale_prefixes]:
        for marketing_path in marketing_paths:
            # The static export writes every country page under its own slug.
            local = localized_page(locale_prefix.rstrip('/') or 'en', marketing_path)
            fixtures[f'{locale_prefix}{local}/index.html'] = f'MARKETING {locale_prefix}{marketing_path}'
    for product in ['window', 'pergola', 'roof', 'solar', 'hall', 'fence', 'cardbox', 'tiles', 'chair', 'bookshelf']:
        fixtures[f'{product}-configurator/index.html'] = f'APP {product}'
        fixtures[f'{product}-configurator/js/app.js'] = f'ASSET {product}'
        fixtures[f'{product}-configurator/styles.css'] = f'CSS {product}'
        fixtures[f'{product}-configurator/models/model.glb'] = f'MODEL {product}'
        fixtures[f'{product}-configurator/shared-ui/src/config.js'] = f'SHARED {product}'
    for path, content in fixtures.items():
        target = site / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    config = (root / 'cloudrun/nginx.conf').read_text()
    if os.environ.get('NGINX_MIME_TYPES'):
        config = config.replace('/etc/nginx/mime.types', os.environ['NGINX_MIME_TYPES'])
    config = config.replace('listen 8080', f'listen 127.0.0.1:{port}')
    config = config.replace('/usr/share/nginx/html', str(site))
    config = re.sub(r'(proxy_pass https?://)[^/;]+', r'\g<1>127.0.0.1', config)
    config = f'pid {work}/nginx.pid;\nerror_log {work}/error.log;\n' + config
    config = config.replace('http {', f'http {{\n    access_log {work}/access.log;')
    path = work / 'nginx.conf'
    path.write_text(config)
    subprocess.run([nginx, '-t', '-c', str(path), '-p', str(work)], check=True)
    process = subprocess.Popen([nginx, '-c', str(path), '-p', str(work), '-g', 'daemon off;'])
    def get(host, uri, method='GET', encoding=None):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        request_headers = {'Host': host}
        if encoding:
            request_headers['Accept-Encoding'] = encoding
        connection.request(method, uri, headers=request_headers)
        response = connection.getresponse()
        headers = dict(response.getheaders())
        body = response.read()
        if headers.get('Content-Encoding') == 'gzip':
            body = gzip.decompress(body)
        result = response.status, headers, body.decode()
        connection.close()
        return result
    try:
        for _ in range(30):
            try:
                get('www.360configurator.com', '/')
                break
            except OSError:
                time.sleep(0.1)
        tested = 0
        for locale, suffix in domains.items():
            public = f'www.{suffix}'
            language = locale.split('-')[0].upper()
            for uri, expected in [('/llms.txt', f'CONTEXT {language}'), ('/llms-full.txt', f'FULL {language}')]:
                status, headers, body = get(public, uri)
                assert status == 200 and body == expected, (public, uri, status, body)
            status, headers, body = get(public, '/_next/static/chunks/test-AbCd1234.js', encoding='gzip')
            assert status == 200 and headers.get('Content-Encoding') == 'gzip', headers
            assert 'Accept-Encoding' in headers.get('Vary', ''), headers
            assert headers.get('Cache-Control') == 'public, max-age=31536000, immutable', headers
            assert body == fixtures['_next/static/chunks/test-AbCd1234.js']
            status, headers, body = get(public, '/styles/homepage-polish.css')
            assert headers.get('Cache-Control') == 'public, max-age=3600, must-revalidate', headers
            status, headers, body = get(public, '/lite-assets/tiles/yard-4.jpg')
            assert headers.get('Cache-Control') == 'public, max-age=86400, must-revalidate', headers
            status, headers, body = get(public, '/api/region-defaults')
            assert 'no-store' in headers.get('Cache-Control', ''), headers
            status, headers, body = get(public, '/cardbox-configurator/js/app.js')
            assert 'immutable' not in headers.get('Cache-Control', ''), headers
            assert get(f'acme.{suffix}', '/llms.txt')[0] == 404
            assert get(f'acme.{suffix}', '/llms-full.txt')[0] == 404
            tested += 9
        for locale, suffix in domains.items():
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
            for prefix, target_domain in [(loc.split('-')[0], dom) for loc, dom in domains.items() if loc != 'en-US']:
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
        for host, marker in [(f'www.{dom}', f'PUBLIC {loc.split("-")[0].upper()}') for loc, dom in domains.items()]:
            status, headers, body = get(host, '/')
            assert status == 200 and marker in body, (host, status, body)
            assert 'TENANT' not in body
            assert 'Sitemap:' in get(host, '/robots.txt')[2]
            tested += 2
        # Public SEO normalization must preserve transport/query parameters and
        # never catch tenant pages, app files or unknown marketing slugs.
        for prefix, suffix in [('' if loc == 'en-US' else f'{loc.split("-")[0]}/', dom) for loc, dom in domains.items()]:
            host = f'www.{suffix}'
            language = prefix.rstrip('/') or 'en'
            for marketing_path in marketing_paths:
                for query in ['', '?project=existing-system&encoded=a%2Fb%20c']:
                    canonical = '/' + localized_page(language, marketing_path)
                    # The old English slug moves to the domain's own slug in one 301.
                    if canonical != '/' + marketing_path:
                        for old in ['/' + marketing_path, '/' + marketing_path + '/', '/' + marketing_path + '/index.html']:
                            status, headers, _ = get(host, old + query)
                            assert status == 301 and headers.get('Location') == f'https://{host}{canonical}{query}', (host, old, status, headers)
                            tested += 1
                    status, headers, body = get(host, canonical + query)
                    assert status == 200 and body == f'MARKETING {prefix}{marketing_path}', (host, canonical, status, body)
                    for alias in [canonical + '/', canonical + '/index.html']:
                        status, headers, body = get(host, alias + query)
                        assert status == 301 and headers.get('Location') == f'https://{host}{canonical}{query}', (host, alias, status, headers)
                        tested += 1
                    assert get(f'acme.{suffix}', canonical + '/')[0] == 404
                    assert get(host, canonical + '/', 'POST')[0] != 301
                    assert get(host, canonical + '/', 'HEAD')[1].get('Location') == f'https://{host}{canonical}'
                    tested += 2
                    tested += 2
            tiles = '/' + localized_page(language, 'configurators/tiles')
            for old, destination in [('/our-work/', '/'), ('/paving-configurator/', tiles)]:
                status, headers, _ = get(host, old + '?campaign=old')
                assert status == 301 and headers.get('Location') == f'https://{host}{destination}?campaign=old', (host, old, status, headers)
                tested += 1
            for invalid in ['/configurators/unknown/', '/[locale]/contact/page', '/kitchen-configurator/', '/&']:
                assert get(host, invalid)[0] == 404, (host, invalid)
                tested += 1
        for locale, domain in [(loc.split('-')[0], dom) for loc, dom in domains.items() if loc != 'en-US']:
            # Old .com/<locale>/<English slug> URLs reach the final localized page in one hop.
            for old, target in [(f'/{locale}', '/'), (f'/{locale}/', '/'), (f'/{locale}/contact', '/' + localized_page(locale, 'contact')),
                                (f'/{locale}/about', '/' + localized_page(locale, 'about')),
                                (f'/{locale}/configurators/window/', '/' + localized_page(locale, 'configurators/window'))]:
                status, headers, _ = get('www.360configurator.com', old + '?encoded=a%2Fb%20c')
                assert status == 301 and headers.get('Location') == f'https://www.{domain}{target}?encoded=a%2Fb%20c', (old, headers)
                tested += 1
        assert get('www.360configurator.com', '/dashboard/')[2] == 'SALES DASHBOARD'
        assert 'www.360configurator.ro/configurator-acoperis/' in get('www.360configurator.ro', '/roof-configurator/')[1]['Location']
        assert 'www.360konfigurator.de/dach-konfigurator/' in get('www.360konfigurator.de', '/roof-configurator/')[1]['Location']
        for locale, suffix in domains.items():
            if locale == 'en-US':
                continue
            for product, canonical in route_catalogue[locale].items():
                english = route_catalogue['en-US'][product]
                if canonical == english:
                    continue
                status, headers, _ = get(f'www.{suffix}', english)
                assert status == 301 and headers.get('Location') == f'https://www.{suffix}{canonical}', (suffix, english, headers)
                status, headers, _ = get('www.360configurator.com', canonical + 'index.html')
                assert status == 301 and headers.get('Location') == f'https://www.{suffix}{canonical}index.html', (suffix, canonical, headers)
                tested += 2
            status, headers, _ = get(suffix, '/contact?x=1')
            assert status == 301 and headers.get('Location') == f'https://www.{suffix}/contact?x=1', (suffix, headers)
            tested += 1
        for reserved in ['aks', 'admin', 'www', 'api']:
            for root_domain in domains.values():
                assert 'TENANT' not in get(f'{reserved}.{root_domain}', '/')[2]
                tested += 1
        for reserved in ['aks', 'admin', 'api']:
            status, headers, body = get(f'{reserved}.360configurator.com', '/about/')
            assert status == 200 and 'Location' not in headers, (reserved, status, headers)
            tested += 1
        print(f'nginx multi-domain routing passed: {tested + 2} route cases, public and tenant routes.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
