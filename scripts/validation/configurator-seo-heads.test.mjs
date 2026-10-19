// The per-language configurator heads (scripts/seo/prerender-configurator-heads.mjs):
// one title, description, canonical and hreflang set per page, in the domain's
// language, with the page body untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localizedHead, SEO_PRODUCTS } from '../seo/prerender-configurator-heads.mjs';
import { getConfiguratorSeo } from '../../shared-ui/src/configuratorSeo.js';
import { LOCALE_HOSTS } from '../../shared-ui/src/config.js';

const count = (html, pattern) => (html.match(pattern) || []).length;
const body = (html) => html.replace(/<html[^>]*>/i, '').replace(/<head[^>]*>[\s\S]*?<\/head>/i, '');

test('every source configurator page gets one localized head per domain', async () => {
  // window and pergola are built bundles; their source pages are checked in the deploy.
  for (const product of SEO_PRODUCTS.filter((name) => !['window', 'pergola'].includes(name))) {
    const source = await readFile(new URL(`../../${product}-configurator/index.html`, import.meta.url), 'utf8');
    for (const host of Object.values(LOCALE_HOSTS)) {
      const seo = getConfiguratorSeo(product, host);
      const html = localizedHead(source, seo);
      assert.ok(html.includes(`<html lang="${seo.lang}"`), `${product} ${host} lang`);
      assert.equal(count(html, /<title>/g), 1);
      assert.ok(html.includes(`<title>${seo.title.replace(/&/g, '&amp;')}</title>`), `${product} ${host} title`);
      assert.equal(count(html, /<meta name="description"/g), 1);
      assert.equal(count(html, /rel="canonical"/g), 1);
      assert.ok(html.includes(`<link rel="canonical" href="${seo.canonical}" />`));
      assert.equal(count(html, /rel="alternate" hreflang=/g), 7);
      assert.ok(html.includes(`hreflang="x-default" href="${seo.xDefault}"`));
      assert.equal(body(html), body(source), `${product} ${host} body unchanged`);
    }
  }
});

test('a page without title, description or lang still gets the full head', () => {
  const seo = getConfiguratorSeo('chair', 'www.360configuratore.it');
  const html = localizedHead('<!doctype html><html><head><meta charset="utf-8"></head><body>x</body></html>', seo);
  assert.ok(html.startsWith('<!doctype html><html lang="it">'));
  assert.equal(count(html, /<title>/g), 1);
  assert.equal(count(html, /rel="canonical"/g), 1);
  assert.ok(html.indexOf('rel="canonical"') < html.indexOf('</head>'));
});
