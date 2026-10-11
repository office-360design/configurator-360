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
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';

const options = {
  brandSrc: '/original-platform-logo.png', brandAlt: '360 Configurator',
  projectName: 'Roof#1', state: { locale: 'en-US' },
};
const tenant = {
  isTenant: true, exists: true, status: 'active', companyName: 'ACME',
  logoUrl: 'data:image/png;base64,YWNtZQ==',
};
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// A cache key identifies a release, not the branding implementation. AR and
// other features may legitimately refresh it without replacing this renderer.
// Still require the real named import, the exact shared path and a version so
// a missing/unversioned or product-specific import cannot satisfy this check.
function assertVersionedSharedImport(source, binding, expectedPath, label) {
  const imports = [...source.matchAll(/^\s*import\s*\{([^}]+)\}\s*from\s*(['"])([^'"\r\n]+)\2\s*;?/gm)];
  const matching = imports.filter(([, bindings]) => bindings.split(',')
    .some((item) => item.trim().split(/\s+as\s+/)[0] === binding));
  assert.equal(matching.length, 1, `${label}: must import ${binding} once`);
  const specifier = matching[0][3];
  const queryIndex = specifier.indexOf('?');
  assert.ok(queryIndex > 0, `${label}: shared import needs a cache version`);
  assert.equal(specifier.slice(0, queryIndex), expectedPath, `${label}: wrong shared module`);
  assert.equal(specifier.includes('#'), false, `${label}: unexpected import fragment`);
  const query = new URLSearchParams(specifier.slice(queryIndex + 1));
  assert.equal(query.getAll('v').length, 1, `${label}: expected one cache version`);
  assert.match(query.get('v'), /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `${label}: invalid cache version`);
}

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
  assertVersionedSharedImport(shell, 'renderTopBar', './components/topBar.js', 'Shared shell');
  const renderer = await read('shared-ui/src/components/topBar.js');
  assertVersionedSharedImport(renderer, 'renderPlatformAttribution', '../tenantBranding.js', 'Shared top bar');
  assert.match(shell, /SHARED_STANDALONE_STYLE_VERSION = 'tenant-branding-1'/);
  const paths = ['roof', 'solar', 'hall', 'fence', 'cardbox', 'bookshelf', 'chair']
    .map((id) => `${id}-configurator/js/sharedShell.js`);
  paths.push('tiles-configurator/js/app.js', 'pergola-configurator/src/ui/pergolaSharedShell.js',
    'window-configurator/src/client/shared-shell.js');
  for (const path of paths) {
    // Window copies the shared shell into its static bundle; Pergola has an
    // extra source directory. Both must still use the same shared entrypoint.
    const sharedPath = path.startsWith('window-')
      ? './shared-ui/src/standaloneShell.js'
      : path.startsWith('pergola-')
        ? '../../../shared-ui/src/standaloneShell.js'
        : '../../shared-ui/src/standaloneShell.js';
    assertVersionedSharedImport(await read(path), 'mountStandaloneConfiguratorShell', sharedPath, path);
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

test('shared import checks accept release changes but reject missing or substituted modules', () => {
  for (const version of ['tenant-branding-1', 'firebase-ar-4', 'next-release-2026.10']) {
    assertVersionedSharedImport(
      `import { renderTopBar } from './components/topBar.js?v=${version}';`,
      'renderTopBar', './components/topBar.js', version,
    );
  }
  assertVersionedSharedImport(
    'import { convertCartMoneyAmount, mountStandaloneConfiguratorShell } from "./shared-ui/src/standaloneShell.js?v=firebase-ar-4";',
    'mountStandaloneConfiguratorShell', './shared-ui/src/standaloneShell.js', 'Window bundle',
  );
  for (const source of [
    "import { renderTopBar } from './components/topBar.js';",
    "import { renderTopBar } from './components/topBar.js?v=';",
    "import { renderTopBar } from './components/topBar.js?v=one&v=two';",
    "import { renderTopBar } from './components/topBar.js?release=one';",
    "import { renderTopBar } from './components/topBar.js?v=one#fragment';",
    "import { renderTopBar } from './components/topBar.js?v=%20';",
    "import { renderTopBar } from './private-topBar.js?v=firebase-ar-4';",
    "import { renderTopBar } from 'https://example.test/topBar.js?v=firebase-ar-4';",
    "import { otherRenderer } from './components/topBar.js?v=firebase-ar-4';",
    "// import { renderTopBar } from './components/topBar.js?v=firebase-ar-4';",
    "const example = \"import { renderTopBar } from './components/topBar.js?v=firebase-ar-4';\";",
    "import { renderTopBar } from './components/topBar.js?v=one';\nimport { renderTopBar } from './components/topBar.js?v=two';",
  ]) {
    assert.throws(() => assertVersionedSharedImport(
      source, 'renderTopBar', './components/topBar.js', 'Invalid fixture',
    ), assert.AssertionError);
  }
});

test('AR availability and tenant branding coexist for every product and locale', () => {
  const products = ['window', 'hall', 'fence', 'tiles', 'pergola', 'roof', 'solar', 'chair', 'cardbox', 'bookshelf'];
  for (const productId of products) {
    for (const [locale, host] of Object.entries(LOCALE_HOSTS)) {
      for (const record of [null, tenant, { ...tenant, logoUrl: '' }]) {
        for (const viewAR of [true, false]) {
          const capabilities = { viewAR };
          const html = renderTopBar({ ...options, productId, tenant: record,
            capabilities, state: { locale } });
          const arButton = html.match(/<button\b[^>]*\bdata-action="view-ar"[^>]*>/g) || [];
          assert.equal(arButton.length, 1, `${productId}: one AR action`);
          const disabled = /\sdisabled(?:\s|=|>)/.test(arButton[0]);
          assert.equal(disabled, !isConfiguratorAREnabled(productId, capabilities), `${productId}: AR policy`);
          assert.match(html, /data-action="book-demo"/);
          assert.match(html, /data-action="cart"/);
          if (record) {
            assert.equal((html.match(/class="tenant-platform-brand"/g) || []).length, 1);
            assert.ok(html.includes(`href="https://${host}/"`));
            assert.equal(html.includes('/original-platform-logo.png'), false);
            if (record.logoUrl) assert.ok(html.includes(`src="${record.logoUrl}" alt="ACME"`));
            else assert.match(html, /class="tenant-brand-name" title="ACME">ACME<\/span>/);
          } else {
            assert.equal(html.includes('class="tenant-platform-brand"'), false);
            assert.match(html, /src="\/original-platform-logo.png" alt="360 Configurator"/);
          }
        }
      }
    }
  }
});
