#!/usr/bin/env node
// Writes the nginx maps that send every presentation page to its slug in the
// domain's language (website/lib/page-slugs.json):
//   - $marketing_redirect: on each domain, old English slugs → the domain's own
//     slug (301), and slash / index.html normalisation of the canonical slug;
//   - $legacy_slug_path: the old .com/<locale>/<english slug> URLs go straight
//     to the final localized URL on the country domain, in one hop.
// Usage: node scripts/build/sync-website-slugs.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const confPath = `${root}cloudrun/nginx.conf`;
const slugs = JSON.parse(readFileSync(`${root}website/lib/page-slugs.json`, 'utf8'));
const LOCALES = ['ro', 'de', 'es', 'fr', 'it'];
const BEGIN = '    # BEGIN generated website slugs (scripts/build/sync-website-slugs.mjs; edit website/lib/page-slugs.json)';
const END = '    # END generated website slugs';

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routes = (locale) => [
  ...['about', 'contact', 'pricing', 'book-a-demo'].map((page) => [slugs.pages[page].en, slugs.pages[page][locale]]),
  ...Object.values(slugs.configurators).map((product) => [
    `${slugs.pages.configurators.en}/${product.en}`,
    `${slugs.pages.configurators[locale]}/${product[locale]}`,
  ]),
];
const read = '1:(?:GET|HEAD)';
const query = '(?:\\?.*)?$';

function marketingMap() {
  const english = routes('en').map(([path]) => escape(path)).join('|');
  const lines = [
    '    # Only known marketing documents are redirected. Match the ORIGINAL URI to avoid',
    '    # loops after try_files; never touch app, asset or API paths. Tenant hosts and',
    '    # non-read requests are outside this rule ($is_public_marketing_host).',
    '    map "$is_public_marketing_host:$request_method:$site_prefix:$request_uri" $marketing_redirect {',
    '        default "";',
    '        # English site: slash and index.html normalisation.',
    `        "~^${read}::/(?<marketing_page>${english})(?:/index\\.html|/)${query}" /$marketing_page;`,
    `        "~^${read}:(?:/[a-z]{2})?:/index\\.html${query}" /;`,
    '        # Old portfolio now lives in the homepage\'s real deployed-systems list.',
    `        "~^${read}:(?:/[a-z]{2})?:/our-work/?${query}" /;`,
    '        # Same product, not a generic redirect to an unrelated page.',
    `        "~^${read}::/paving-configurator/?${query}" /${slugs.pages.configurators.en}/${slugs.configurators.tiles.en};`,
  ];
  for (const locale of LOCALES) {
    lines.push(`        # ${locale}: each page under the domain's own slug; the old English slugs move there.`);
    for (const [en, local] of routes(locale)) {
      if (en !== local) lines.push(`        "~^${read}:/${locale}:/${escape(en)}(?:/index\\.html|/)?${query}" /${local};`);
      lines.push(`        "~^${read}:/${locale}:/${escape(local)}(?:/index\\.html|/)${query}" /${local};`);
    }
    lines.push(`        "~^${read}:/${locale}:/paving-configurator/?${query}" /${slugs.pages.configurators[locale]}/${slugs.configurators.tiles[locale]};`);
  }
  lines.push('    }');
  return lines;
}

function legacyMap() {
  const lines = [
    '',
    '    # Old .com/<locale>/<english slug> URLs: the final localized path on the country',
    '    # domain ($legacy_slug_key is set in the /ro, /de … locations).',
    '    map $legacy_slug_key $legacy_slug_path {',
    '        default "";',
  ];
  for (const locale of LOCALES) {
    for (const [en, local] of routes(locale)) {
      if (en !== local) lines.push(`        "~^/${locale}:/${escape(en)}(?:/index\\.html|/)?$" /${local};`);
    }
  }
  lines.push('    }');
  return lines;
}

const block = [BEGIN, ...marketingMap(), ...legacyMap(), END].join('\n');
const conf = readFileSync(confPath, 'utf8');
const start = conf.indexOf(BEGIN), end = conf.indexOf(END);
if (start < 0 || end < 0) throw new Error(`${confPath} has no generated website slugs block.`);
const next = conf.slice(0, start) + block + conf.slice(end + END.length);

// The configurators' "Book a demo" button links straight to each domain's slug.
const configSource = readFileSync(`${root}shared-ui/src/config.js`, 'utf8');
const demoLocales = { 'en-US': 'en', 'ro-RO': 'ro', 'de-DE': 'de', 'es-ES': 'es', 'fr-FR': 'fr', 'it-IT': 'it' };
for (const [locale, short] of Object.entries(demoLocales)) {
  if (!configSource.includes(`'${locale}': '/${slugs.pages['book-a-demo'][short]}'`)) {
    console.error(`shared-ui/src/config.js WEBSITE_DEMO_PATHS['${locale}'] must be '/${slugs.pages['book-a-demo'][short]}' (website/lib/page-slugs.json).`);
    process.exit(1);
  }
}

if (process.argv.includes('--check')) {
  if (next !== conf) {
    console.error('cloudrun/nginx.conf is out of date with website/lib/page-slugs.json. Run: node scripts/build/sync-website-slugs.mjs');
    process.exit(1);
  }
  console.log('nginx website slug redirects match website/lib/page-slugs.json.');
} else {
  writeFileSync(confPath, next);
  console.log('Updated the website slug redirects in cloudrun/nginx.conf.');
}
