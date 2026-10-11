import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
// Account-menu installation touches the document when this renderer imports.
// These unit tests cover branding markup; the browser suite exercises real DOM.
globalThis.document = { getElementById: () => ({}), addEventListener() {} };
const { renderTopBar } = await import('../../shared-ui/src/components/topBar.js');
delete globalThis.document;
import { PLATFORM_LOGO_SRC, renderPlatformAttribution } from '../../shared-ui/src/tenantBranding.js';
import { LOCALE_HOSTS } from '../../shared-ui/src/config.js';

const options = {
  brandSrc: '/original-platform-logo.png', brandAlt: '360 Configurator',
  projectName: 'Roof#1', state: { locale: 'en-US' },
};
const tenant = {
  isTenant: true, exists: true, status: 'active', companyName: 'ACME',
  logoUrl: 'data:image/png;base64,YWNtZQ==',
};
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

for (const [locale, host] of Object.entries(LOCALE_HOSTS)) {
  test(`${locale}: official logo and platform destination are fixed, same-locale and separate`, () => {
    const attribution = renderPlatformAttribution(locale);
    assert.ok(attribution.includes(`href="https://${host}/"`));
    assert.ok(attribution.includes(`src="${PLATFORM_LOGO_SRC}"`));
    assert.match(attribution, /alt="360Configurator"/);
    assert.match(attribution, /target="_blank" rel="noopener noreferrer"/);
    assert.match(attribution, /aria-label="Powered by 360Configurator \(opens in a new tab\)"/);
  });
}

test('public, absent and unresolved tenants keep one original brand and no attribution', () => {
  for (const record of [null, { isTenant: false }, { ...tenant, exists: false }]) {
    const html = renderTopBar({ ...options, tenant: record });
    assert.match(html, /src="\/original-platform-logo.png" alt="360 Configurator"/);
    assert.equal(html.includes('class="tenant-platform-brand"'), false);
    assert.equal(html.includes('site-header--tenant'), false);
  }
});

test('tenant logo remains primary with exactly one independent platform attribution', () => {
  const html = renderTopBar({ ...options, tenant });
  assert.equal((html.match(/class="tenant-platform-brand"/g) || []).length, 1);
  assert.ok(html.includes(`src="${tenant.logoUrl}" alt="ACME"`));
  assert.ok(html.indexOf(tenant.logoUrl) < html.indexOf(PLATFORM_LOGO_SRC));
  assert.equal(html.includes('/original-platform-logo.png'), false);
  assert.match(html, /class="brand"[^]*?<\/a>\s*<a class="tenant-platform-brand"/);
  assert.match(html, /data-action="book-demo"/);
  assert.match(html, /data-action="cart"/);
  // A language preference does not send the attribution to a different country site.
  const ro = renderTopBar({ ...options, tenant,
    state: { locale: 'de-DE', currentDomainLocale: 'ro-RO' } });
  assert.ok(ro.includes('href="https://www.360configurator.ro/"'));
});

test('tenants without an uploaded logo keep their company name, without duplicate 360 logos', () => {
  const html = renderTopBar({ ...options, tenant: { ...tenant, logoUrl: '' } });
  assert.match(html, /class="tenant-brand-name" title="ACME">ACME<\/span>/);
  assert.equal((html.match(/alt="360Configurator"/g) || []).length, 1);
  assert.equal(html.includes('/original-platform-logo.png'), false);
});

test('company branding cannot inject markup or redirect the platform attribution', () => {
  const html = renderTopBar({ ...options, tenant: {
    ...tenant, logoUrl: '', companyName: '<img src=x onerror="alert(1)">',
    platformLogo: 'https://evil.test/fake.png', platformHref: 'https://evil.test/',
  } });
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('https://evil.test/'), false);
  assert.ok(renderPlatformAttribution('https://evil.test/').includes('href="https://www.360configurator.com/"'));
});

test('all ten configurators load the revised shared renderer without separate product branding code', async () => {
  const shell = await read('shared-ui/src/standaloneShell.js');
  assert.match(shell, /tenant: currentTenantContext\(\)/);
  assert.match(shell, /topBar\.js\?v=tenant-branding-1/);
  assert.match(shell, /SHARED_STANDALONE_STYLE_VERSION = 'tenant-branding-1'/);
  const paths = ['roof', 'solar', 'hall', 'fence', 'cardbox', 'bookshelf', 'chair']
    .map((id) => `${id}-configurator/js/sharedShell.js`);
  paths.push('tiles-configurator/js/app.js', 'pergola-configurator/src/ui/pergolaSharedShell.js',
    'window-configurator/src/client/shared-shell.js');
  for (const path of paths) {
    assert.match(await read(path), /standaloneShell\.js\?v=tenant-branding-1/, path);
  }
  for (const name of ['index', 'standalone', 'tenantLanding', 'tenantDashboard']) {
    assert.match(await read(`shared-ui/styles/${name}.css`), /^@import url\('\.\/tenantBranding\.css\?v=tenant-branding-1'\);/);
  }
});

test('launcher and dashboard share the official asset and never save it as a tenant logo', async () => {
  for (const name of ['tenantLanding', 'tenantDashboard']) {
    assert.match(await read(`shared-ui/src/${name}.js`), /renderPlatformAttribution/);
  }
  const png = await readFile(new URL('../../shared-ui/assets/360CONFIGURATOR.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const dashboard = await read('shared-ui/src/tenantDashboard.js');
  assert.match(dashboard, /headerLogo\.src = data\.logoUrl/);
  assert.match(dashboard, /currentLogo\.src = data\.logoUrl/);
  assert.equal(dashboard.includes('logoDataUrl: PLATFORM_LOGO_SRC'), false);
});
