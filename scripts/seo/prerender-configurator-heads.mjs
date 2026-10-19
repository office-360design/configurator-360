// Writes a copy of each public configurator's index.html per site language
// (index.<locale>.html) whose <head> already carries that language's lang,
// title, description, canonical, hreflang and Open Graph tags, from the same
// data the browser applies (shared-ui/src/configuratorSeo.js).
//
// Without it every country domain sends the English HTML and only JavaScript
// translates the head, so Google treats the localized configurators as
// duplicates of the English one. nginx serves these files on the six public
// domains (see $configurator_seo_locale in cloudrun/nginx.conf); customer
// domains keep index.html.
//
// Run: node scripts/seo/prerender-configurator-heads.mjs [site root, default dist/site]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfiguratorSeo } from '../../shared-ui/src/configuratorSeo.js';
import { LOCALE_HOSTS } from '../../shared-ui/src/config.js';

export const SEO_PRODUCTS = ['window', 'pergola', 'roof', 'hall', 'solar', 'fence', 'chair', 'cardbox'];

const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Tags this script owns; any copy already in the source head is replaced.
const MARKER = '<!--configurator-seo-->';
const OWNED_TAGS = [
  /<meta\s+name="description"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
  /<link\s+rel="alternate"\s+hreflang="[^"]*"[^>]*>\s*/gi,
  /<meta\s+property="og:(?:type|title|description|url|locale)"[^>]*>\s*/gi,
];

export function localizedHead(html, seo) {
  const head = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  if (!head) throw new Error('No <head> in the configurator page');
  // Keep the tags where the title was, or just before </head> when there was none.
  let body = head[0].replace(/<title>[\s\S]*?<\/title>/i, MARKER);
  if (!body.includes(MARKER)) body = body.replace(/<\/head>/i, `${MARKER}\n</head>`);
  for (const pattern of OWNED_TAGS) body = body.replace(pattern, '');
  const tags = [
    `<title>${escapeText(seo.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(seo.description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(seo.canonical)}" />`,
    ...seo.alternates.map((alternate) => `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeAttribute(alternate.href)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${escapeAttribute(seo.xDefault)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(seo.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(seo.canonical)}" />`,
    `<meta property="og:locale" content="${seo.ogLocale}" />`,
  ].join('\n  ');
  body = body.replace(MARKER, () => tags);
  return html
    .replace(head[0], () => body)
    .replace(/<html([^>]*?)\slang="[^"]*"/i, `<html$1 lang="${seo.lang}"`)
    .replace(/<html(?![^>]*\slang=)([^>]*)>/i, `<html lang="${seo.lang}"$1>`);
}

export async function prerenderConfiguratorHeads(siteRoot) {
  const written = [];
  for (const product of SEO_PRODUCTS) {
    const directory = path.join(siteRoot, `${product}-configurator`);
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    for (const [locale, host] of Object.entries(LOCALE_HOSTS)) {
      const seo = getConfiguratorSeo(product, host);
      const file = path.join(directory, `index.${locale}.html`);
      await writeFile(file, localizedHead(html, seo));
      written.push(file);
    }
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const siteRoot = path.resolve(process.argv[2] || 'dist/site');
  const written = await prerenderConfiguratorHeads(siteRoot);
  console.log(`Localized configurator heads: ${written.length} files under ${siteRoot}.`);
}
