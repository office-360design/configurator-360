#!/usr/bin/env python3
"""Exercise the real nginx routes against local fixtures, never production.
Only the port, document root, PID/log paths and upstream DNS are substituted.
No upstream route is requested: the auth/Solar proxy config remains syntax-tested.
"""
import http.client
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[2]
nginx = shutil.which('nginx') or '/usr/sbin/nginx'
if not Path(nginx).exists():
    raise SystemExit('nginx is required for route tests (install nginx, then rerun).')
with tempfile.TemporaryDirectory(prefix='tenant-domains-nginx-') as work:
    work = Path(work)
    work.chmod(0o755)
    site = work / 'site'
    fixtures = {
        'index.html': 'PUBLIC EN', 'ro/index.html': 'PUBLIC RO', 'de/index.html': 'PUBLIC DE',
        'shared-ui/tenant/index.html': 'TENANT LAUNCHER',
        'shared-ui/tenant-dashboard/index.html': 'TENANT DASHBOARD',
        'shared-ui/admin/tenant-provisioning/index.html': 'INTERNAL ADMIN',
        'shared-ui/admin/sales-dashboard/index.html': 'SALES DASHBOARD',
        'sitemap-en.xml': 'SITEMAP EN', 'sitemap-ro.xml': 'SITEMAP RO', 'sitemap-de.xml': 'SITEMAP DE',
    }
    for product in ['window', 'pergola', 'roof', 'solar', 'hall', 'fence', 'cardbox', 'tiles', 'chair', 'bookshelf']:
        fixtures[f'{product}-configurator/index.html'] = f'APP {product}'
        fixtures[f'{product}-configurator/js/app.js'] = f'ASSET {product}'
    for path, content in fixtures.items():
        target = site / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    config = (root / 'cloudrun/nginx.conf').read_text()
    config = config.replace('listen 8080', f'listen 127.0.0.1:{port}')
    config = config.replace('/usr/share/nginx/html', str(site))
    config = re.sub(r'(proxy_pass https?://)[^/;]+', r'\g<1>127.0.0.1', config)
    config = f'pid {work}/nginx.pid;\nerror_log {work}/error.log;\n' + config
    config = config.replace('http {', f'http {{\n    access_log {work}/access.log;')
    path = work / 'nginx.conf'
    path.write_text(config)
    subprocess.run([nginx, '-t', '-c', str(path), '-p', str(work)], check=True)
    process = subprocess.Popen([nginx, '-c', str(path), '-p', str(work), '-g', 'daemon off;'])
    def get(host, uri):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        connection.request('GET', uri, headers={'Host': host})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read().decode()
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
        for suffix in ['360configurator.com', '360configurator.ro', '360konfigurator.de']:
            host = f'acme.{suffix}'
            for uri, marker in [('/', 'TENANT LAUNCHER'), ('/dashboard/', 'TENANT DASHBOARD'), ('/roof-configurator/', 'APP roof'), ('/configurator-acoperis/', 'APP roof'), ('/dach-konfigurator/', 'APP roof'), ('/configurator-ferestre/js/app.js', 'ASSET window')]:
                status, headers, body = get(host, uri)
                assert status == 200 and marker in body, (host, uri, status, headers, body)
                tested += 1
            for uri in ['/configurator-acoperis', '/dach-konfigurator']:
                status, headers, body = get(host, uri + '?test=1')
                assert status == 302 and '/roof-configurator/?test=1' in headers['Location'] and 'www.' not in headers['Location'], (status, headers)
                tested += 1
            for locale, root_domain in [('ro', '360configurator.ro'), ('de', '360konfigurator.de')]:
                status, headers, _ = get(host, f'/{locale}/roof-configurator/?test=1')
                assert headers.get('Location') == f'https://acme.{root_domain}/roof-configurator/?test=1', headers
                tested += 1
            assert get(host, '/sitemap.xml')[0] == 404
            assert 'Disallow: /' in get(host, '/robots.txt')[2]
            assert get(host, '/internal/tenant-provisioning/')[0] == 404
            tested += 3
        for host, marker in [('www.360configurator.com', 'PUBLIC EN'), ('www.360configurator.ro', 'PUBLIC RO'), ('www.360konfigurator.de', 'PUBLIC DE')]:
            status, headers, body = get(host, '/')
            assert status == 200 and marker in body, (host, status, body)
            assert 'TENANT' not in body
            assert 'Sitemap:' in get(host, '/robots.txt')[2]
            tested += 2
        assert get('www.360configurator.com', '/dashboard/')[2] == 'SALES DASHBOARD'
        assert 'www.360configurator.ro/configurator-acoperis/' in get('www.360configurator.ro', '/roof-configurator/')[1]['Location']
        assert 'www.360konfigurator.de/dach-konfigurator/' in get('www.360konfigurator.de', '/roof-configurator/')[1]['Location']
        for reserved in ['aks', 'admin', 'www', 'api']:
            for root_domain in ['360configurator.com', '360configurator.ro', '360konfigurator.de']:
                assert 'TENANT' not in get(f'{reserved}.{root_domain}', '/')[2]
                tested += 1
        print(f'nginx multi-domain routing passed: {tested + 2} assertions, public and tenant routes.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
