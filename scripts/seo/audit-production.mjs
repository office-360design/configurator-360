#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const HOSTS = {
  en: {
    origin: 'https://www.360configurator.com',
    lang: 'en',
    hreflang: 'en',
    appPaths: {
      window: '/window-configurator/',
      pergola: '/pergola-configurator/',
      roof: '/roof-configurator/',
      hall: '/hall-configurator/',
      solar: '/solar-configurator/',
    },
  },
  ro: {
    origin: 'https://www.360configurator.ro',
    lang: 'ro',
    hreflang: 'ro-RO',
    appPaths: {
      window: '/configurator-ferestre/',
      pergola: '/configurator-pergola/',
      roof: '/configurator-acoperis/',
      hall: '/configurator-hala/',
      solar: '/configurator-solar/',
    },
  },
  de: {
    origin: 'https://www.360konfigurator.de',
    lang: 'de',
    hreflang: 'de-DE',
    appPaths: {
      window: '/fenster-konfigurator/',
      pergola: '/pergola-konfigurator/',
      roof: '/dach-konfigurator/',
      hall: '/hallen-konfigurator/',
      solar: '/solar-konfigurator/',
    },
  },
};

const PRODUCTS = ['window', 'pergola', 'roof', 'hall', 'solar'];
const MARKETING_PATHS = ['/', '/about', '/contact', ...PRODUCTS.map((product) => `/configurators/${product}`)];

const args = new Set(process.argv.slice(2));
const HEADED = args.has('--headed');
const STRICT = args.has('--strict');

function canonicalUrl(origin, pathname) {
  return `${origin}${pathname}`;
}

function alternateMapForMarketing(pathname) {
  return Object.fromEntries(
    Object.values(HOSTS).map((host) => [host.hreflang, canonicalUrl(host.origin, pathname)]),
  );
}

function alternateMapForApp(product) {
  return Object.fromEntries(
    Object.values(HOSTS).map((host) => [host.hreflang, canonicalUrl(host.origin, host.appPaths[product])]),
  );
}

function expectedPages() {
  const pages = [];
  for (const [locale, host] of Object.entries(HOSTS)) {
    for (const pathname of MARKETING_PATHS) {
      pages.push({
        locale,
        kind: pathname.startsWith('/configurators/') ? 'marketing-product' : 'marketing',
        product: pathname.startsWith('/configurators/') ? pathname.split('/').pop() : null,
        url: canonicalUrl(host.origin, pathname),
        expectedCanonical: canonicalUrl(host.origin, pathname),
        expectedLang: host.lang,
        expectedAlternates: alternateMapForMarketing(pathname),
        expectedXDefault: canonicalUrl(HOSTS.en.origin, pathname),
        requireH1: true,
      });
    }

    for (const product of PRODUCTS) {
      const pathname = host.appPaths[product];
      pages.push({
        locale,
        kind: 'app',
        product,
        url: canonicalUrl(host.origin, pathname),
        expectedCanonical: canonicalUrl(host.origin, pathname),
        expectedLang: host.lang,
        expectedAlternates: alternateMapForApp(product),
        expectedXDefault: canonicalUrl(HOSTS.en.origin, HOSTS.en.appPaths[product]),
        requireH1: false,
      });
    }
  }
  return pages;
}

const EXPECTED_PAGES = expectedPages();

const ROUTING_CHECKS = [
  {
    url: `${HOSTS.en.origin}/ro`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.ro.origin}/`,
  },
  {
    url: `${HOSTS.en.origin}/ro/configurators/pergola`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.ro.origin}/configurators/pergola`,
  },
  {
    url: `${HOSTS.en.origin}/de`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.de.origin}/`,
  },
  {
    url: `${HOSTS.en.origin}/de/configurators/pergola`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.de.origin}/configurators/pergola`,
  },
  {
    url: `${HOSTS.ro.origin}/pergola-configurator/`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.ro.origin}/configurator-pergola/`,
  },
  {
    url: `${HOSTS.de.origin}/pergola-configurator/`,
    expectedStatus: 301,
    expectedLocation: `${HOSTS.de.origin}/pergola-konfigurator/`,
  },
];

const LEGACY_OBSERVATION_URLS = [
  `${HOSTS.en.origin}/our-work/`,
  `${HOSTS.en.origin}/kitchen-configurator/`,
  `${HOSTS.en.origin}/kitchen-island-configurator/`,
  `${HOSTS.en.origin}/paving-configurator/`,
  `${HOSTS.en.origin}/catalin-botezatu-exclusive-demo/`,
];

const SOFT_404_PROBES = Object.values(HOSTS).map(
  (host) => `${host.origin}/__seo-audit-definitely-not-a-real-page-9f4d72c1`,
);

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url || '';
  }
}

function parseRobots(content = '') {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSitemapLocs(xml = '') {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

async function fetchNoRedirect(url) {
  const response = await fetch(url, { redirect: 'manual', headers: { 'user-agent': '360Configurator-SEO-Audit/1.0' } });
  return {
    url,
    status: response.status,
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type') || '',
    body: await response.text(),
  };
}

async function fetchRedirectTrace(url, maxHops = 8) {
  const hops = [];
  let current = url;

  for (let i = 0; i <= maxHops; i += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': '360Configurator-SEO-Audit/1.0' },
    });
    const location = response.headers.get('location');
    hops.push({ url: current, status: response.status, location });

    if (response.status < 300 || response.status >= 400 || !location) {
      return { hops, finalUrl: current, finalStatus: response.status };
    }

    current = new URL(location, current).href;
  }

  return { hops, finalUrl: current, finalStatus: null, tooManyRedirects: true };
}

function addIssue(result, severity, code, message) {
  result.issues.push({ severity, code, message });
}

function evaluatePage(result, pageSpec) {
  const { metadata, trace } = result;

  if (trace.finalStatus !== 200) {
    addIssue(result, 'FAIL', 'HTTP_STATUS', `Expected direct 200, got ${trace.finalStatus ?? 'unknown'}.`);
  }
  if (trace.hops.length > 1) {
    addIssue(result, 'FAIL', 'CANONICAL_REDIRECT', `Canonical URL redirects through ${trace.hops.length - 1} hop(s).`);
  }

  if (!metadata.title) addIssue(result, 'FAIL', 'TITLE_MISSING', 'Missing document title.');
  if (!metadata.description) addIssue(result, 'FAIL', 'DESCRIPTION_MISSING', 'Missing meta description.');

  const actualLang = String(metadata.lang || '').toLowerCase();
  if (actualLang !== pageSpec.expectedLang.toLowerCase()) {
    addIssue(result, 'FAIL', 'LANG_MISMATCH', `Expected html lang="${pageSpec.expectedLang}", got "${metadata.lang || ''}".`);
  }

  if (normalizeUrl(metadata.canonical) !== normalizeUrl(pageSpec.expectedCanonical)) {
    addIssue(
      result,
      'FAIL',
      'CANONICAL_MISMATCH',
      `Expected ${pageSpec.expectedCanonical}, got ${metadata.canonical || '(missing)'}.`,
    );
  }

  if (metadata.robots?.toLowerCase().includes('noindex')) {
    addIssue(result, 'FAIL', 'NOINDEX', `Page is marked noindex (${metadata.robots}).`);
  }

  const actualAlternates = Object.fromEntries(
    metadata.alternates.map((item) => [item.hreflang, normalizeUrl(item.href)]),
  );

  for (const [hreflang, expectedHref] of Object.entries(pageSpec.expectedAlternates)) {
    if (actualAlternates[hreflang] !== normalizeUrl(expectedHref)) {
      addIssue(
        result,
        'FAIL',
        'HREFLANG_MISMATCH',
        `${hreflang}: expected ${expectedHref}, got ${actualAlternates[hreflang] || '(missing)'}.`,
      );
    }
  }

  if (actualAlternates['x-default'] !== normalizeUrl(pageSpec.expectedXDefault)) {
    addIssue(
      result,
      'FAIL',
      'X_DEFAULT_MISMATCH',
      `Expected x-default ${pageSpec.expectedXDefault}, got ${actualAlternates['x-default'] || '(missing)'}.`,
    );
  }

  if (pageSpec.requireH1) {
    if (metadata.h1.length === 0) addIssue(result, 'FAIL', 'H1_MISSING', 'Marketing page has no H1.');
    if (metadata.h1.length > 1) addIssue(result, 'WARN', 'MULTIPLE_H1', `Marketing page has ${metadata.h1.length} H1 elements.`);
  } else if (metadata.h1.length === 0) {
    addIssue(result, 'INFO', 'APP_H1_MISSING', 'App has no H1. This is acceptable for the lightweight app SEO layer, but worth reviewing.');
  }

  if (metadata.canonicalCount !== 1) {
    addIssue(result, 'FAIL', 'CANONICAL_COUNT', `Expected exactly one canonical link, found ${metadata.canonicalCount}.`);
  }

  if (metadata.descriptionCount !== 1) {
    addIssue(result, 'WARN', 'DESCRIPTION_COUNT', `Expected one meta description, found ${metadata.descriptionCount}.`);
  }

  if (metadata.pageErrors.length > 0) {
    addIssue(result, 'WARN', 'JS_PAGE_ERROR', `${metadata.pageErrors.length} browser page error(s) detected.`);
  }

  return result;
}

async function inspectRenderedPage(context, pageSpec) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let gotoError = null;
  try {
    await page.goto(pageSpec.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector('link[rel="canonical"]')),
      null,
      { timeout: 4000 },
    ).catch(() => {});
    await page.waitForTimeout(500);
  } catch (error) {
    gotoError = error.message;
  }

  let metadata = {
    title: '',
    description: '',
    robots: '',
    canonical: '',
    canonicalCount: 0,
    descriptionCount: 0,
    lang: '',
    alternates: [],
    h1: [],
    consoleErrors,
    pageErrors: gotoError ? [...pageErrors, gotoError] : pageErrors,
  };

  try {
    metadata = await page.evaluate(({ consoleErrors, pageErrors }) => ({
      title: document.title || '',
      description: document.querySelector('meta[name="description"]')?.content || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
      descriptionCount: document.querySelectorAll('meta[name="description"]').length,
      lang: document.documentElement.lang || '',
      alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => ({
        hreflang: node.getAttribute('hreflang') || '',
        href: node.href || '',
      })),
      h1: [...document.querySelectorAll('h1')].map((node) => (node.textContent || '').trim()).filter(Boolean),
      consoleErrors,
      pageErrors,
    }), { consoleErrors, pageErrors: metadata.pageErrors });
  } catch (error) {
    metadata.pageErrors.push(`Metadata extraction failed: ${error.message}`);
  }

  await page.close();
  return metadata;
}

function resultStatus(issues) {
  if (issues.some((issue) => issue.severity === 'FAIL')) return 'FAIL';
  if (issues.some((issue) => issue.severity === 'WARN')) return 'WARN';
  return 'PASS';
}

async function auditRobotsAndSitemaps() {
  const results = [];

  for (const [locale, host] of Object.entries(HOSTS)) {
    const robotsUrl = `${host.origin}/robots.txt`;
    const sitemapUrl = `${host.origin}/sitemap.xml`;

    const robots = await fetchNoRedirect(robotsUrl);
    const robotsLines = parseRobots(robots.body);
    const robotsIssues = [];

    if (robots.status !== 200) robotsIssues.push(`robots.txt returned ${robots.status}`);
    if (robotsLines.some((line) => /^disallow:\s*\/\s*$/i.test(line))) {
      robotsIssues.push('robots.txt contains Disallow: /');
    }
    if (!robotsLines.some((line) => line.toLowerCase() === `sitemap: ${sitemapUrl}`.toLowerCase())) {
      robotsIssues.push(`robots.txt does not point to ${sitemapUrl}`);
    }

    const sitemap = await fetchNoRedirect(sitemapUrl);
    const locs = parseSitemapLocs(sitemap.body);
    const expectedForHost = EXPECTED_PAGES
      .filter((page) => page.locale === locale)
      .map((page) => page.expectedCanonical);
    const sitemapIssues = [];

    if (sitemap.status !== 200) sitemapIssues.push(`sitemap.xml returned ${sitemap.status}`);

    for (const expected of expectedForHost) {
      if (!locs.includes(expected)) sitemapIssues.push(`Missing sitemap URL: ${expected}`);
    }

    for (const loc of locs) {
      try {
        if (new URL(loc).origin !== host.origin) sitemapIssues.push(`Foreign hostname in sitemap: ${loc}`);
      } catch {
        sitemapIssues.push(`Invalid sitemap URL: ${loc}`);
      }
    }

    results.push({
      locale,
      origin: host.origin,
      robots: { url: robotsUrl, status: robots.status, issues: robotsIssues, body: robots.body },
      sitemap: {
        url: sitemapUrl,
        status: sitemap.status,
        urlCount: locs.length,
        urls: locs,
        issues: sitemapIssues,
      },
    });
  }

  return results;
}

async function auditRouting() {
  const results = [];
  for (const check of ROUTING_CHECKS) {
    const response = await fetchNoRedirect(check.url);
    const resolvedLocation = response.location ? new URL(response.location, check.url).href : '';
    const issues = [];

    if (response.status !== check.expectedStatus) {
      issues.push(`Expected ${check.expectedStatus}, got ${response.status}`);
    }
    if (normalizeUrl(resolvedLocation) !== normalizeUrl(check.expectedLocation)) {
      issues.push(`Expected Location ${check.expectedLocation}, got ${resolvedLocation || '(missing)'}`);
    }

    results.push({
      ...check,
      actualStatus: response.status,
      actualLocation: resolvedLocation,
      issues,
    });
  }
  return results;
}

async function auditSoft404s() {
  const results = [];
  for (const url of SOFT_404_PROBES) {
    const trace = await fetchRedirectTrace(url);
    results.push({
      url,
      status: trace.finalStatus,
      finalUrl: trace.finalUrl,
      potentialSoft404: trace.finalStatus === 200,
    });
  }
  return results;
}

async function observeLegacyUrls() {
  const results = [];
  for (const url of LEGACY_OBSERVATION_URLS) {
    const trace = await fetchRedirectTrace(url);
    results.push({
      url,
      status: trace.finalStatus,
      finalUrl: trace.finalUrl,
      redirects: trace.hops.length - 1,
    });
  }
  return results;
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(pageResults) {
  const headers = [
    'status',
    'locale',
    'kind',
    'product',
    'url',
    'http_status',
    'redirects',
    'lang',
    'title',
    'description',
    'robots',
    'canonical',
    'h1',
    'issues',
  ];

  const rows = pageResults.map((result) => [
    result.status,
    result.spec.locale,
    result.spec.kind,
    result.spec.product || '',
    result.spec.url,
    result.trace.finalStatus ?? '',
    result.trace.hops.length - 1,
    result.metadata.lang,
    result.metadata.title,
    result.metadata.description,
    result.metadata.robots,
    result.metadata.canonical,
    result.metadata.h1,
    result.issues.map((issue) => `${issue.severity}:${issue.code}:${issue.message}`),
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printPageSummary(results) {
  printSection('Rendered page SEO');
  console.table(
    results.map((result) => ({
      status: result.status,
      locale: result.spec.locale,
      kind: result.spec.kind,
      product: result.spec.product || '-',
      http: result.trace.finalStatus,
      redirects: result.trace.hops.length - 1,
      lang: result.metadata.lang,
      canonical: result.metadata.canonical === result.spec.expectedCanonical ? 'OK' : 'CHECK',
      hreflang: result.issues.some((issue) => issue.code.includes('HREFLANG') || issue.code.includes('X_DEFAULT')) ? 'CHECK' : 'OK',
      url: result.spec.url,
    })),
  );

  for (const result of results.filter((item) => item.issues.length > 0)) {
    console.log(`\n${result.status} ${result.spec.url}`);
    for (const issue of result.issues) {
      console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
    for (const error of result.metadata.pageErrors.slice(0, 3)) {
      console.log(`  [BROWSER] ${error}`);
    }
  }
}

async function main() {
  console.log(`360Configurator production SEO audit`);
  console.log(`Browser mode: ${HEADED ? 'headed' : 'headless'}`);
  console.log(`Pages: ${EXPECTED_PAGES.length}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: !HEADED });
  } catch (error) {
    console.error('\nCould not start Playwright Chromium.');
    console.error('Run: npm run install-browser');
    console.error(`Reason: ${error.message}`);
    process.exit(2);
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; 360ConfiguratorSEOAudit/1.0; +https://www.360configurator.com/)',
  });

  const pageResults = [];
  for (let index = 0; index < EXPECTED_PAGES.length; index += 1) {
    const spec = EXPECTED_PAGES[index];
    process.stdout.write(`[${index + 1}/${EXPECTED_PAGES.length}] ${spec.url}\n`);

    const trace = await fetchRedirectTrace(spec.url);
    const metadata = await inspectRenderedPage(context, spec);
    const result = evaluatePage({ spec, trace, metadata, issues: [] }, spec);
    result.status = resultStatus(result.issues);
    pageResults.push(result);
  }

  await context.close();
  await browser.close();

  const [technical, routing, soft404, legacy] = await Promise.all([
    auditRobotsAndSitemaps(),
    auditRouting(),
    auditSoft404s(),
    observeLegacyUrls(),
  ]);

  printPageSummary(pageResults);

  printSection('robots.txt + sitemap.xml');
  console.table(
    technical.map((item) => ({
      locale: item.locale,
      robots: item.robots.issues.length ? 'CHECK' : 'OK',
      sitemap: item.sitemap.issues.length ? 'CHECK' : 'OK',
      sitemap_urls: item.sitemap.urlCount,
      origin: item.origin,
    })),
  );

  for (const item of technical) {
    for (const issue of [...item.robots.issues, ...item.sitemap.issues]) {
      console.log(`[${item.locale}] ${issue}`);
    }
  }

  printSection('Locale-routing checks');
  console.table(
    routing.map((item) => ({
      status: item.issues.length ? 'CHECK' : 'OK',
      http: item.actualStatus,
      url: item.url,
      location: item.actualLocation,
    })),
  );

  printSection('Potential soft-404 probes');
  console.table(
    soft404.map((item) => ({
      status: item.potentialSoft404 ? 'WARN' : 'OK',
      http: item.status,
      url: item.url,
      final: item.finalUrl,
    })),
  );

  printSection('Legacy URLs — observation only');
  console.table(
    legacy.map((item) => ({
      http: item.status,
      redirects: item.redirects,
      url: item.url,
      final: item.finalUrl,
    })),
  );
  console.log('Legacy URLs are intentionally not marked PASS/FAIL. Review Search Console/backlinks before changing them.');

  const duplicateTitles = new Map();
  for (const result of pageResults) {
    const key = result.metadata.title.trim();
    if (!key) continue;
    if (!duplicateTitles.has(key)) duplicateTitles.set(key, []);
    duplicateTitles.get(key).push(result.spec.url);
  }
  const duplicated = [...duplicateTitles.entries()].filter(([, urls]) => urls.length > 1);

  printSection('Duplicate rendered titles');
  if (duplicated.length === 0) {
    console.log('No duplicate non-empty titles detected.');
  } else {
    for (const [title, urls] of duplicated) {
      console.log(`"${title}"`);
      for (const url of urls) console.log(`  - ${url}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict: STRICT,
    counts: {
      pages: pageResults.length,
      pass: pageResults.filter((item) => item.status === 'PASS').length,
      warn: pageResults.filter((item) => item.status === 'WARN').length,
      fail: pageResults.filter((item) => item.status === 'FAIL').length,
      potentialSoft404s: soft404.filter((item) => item.potentialSoft404).length,
    },
  };

  const report = {
    summary,
    pages: pageResults,
    technical,
    routing,
    soft404,
    legacy,
    duplicateTitles: duplicated.map(([title, urls]) => ({ title, urls })),
  };

  const reportDir = path.resolve(process.cwd(), 'reports', 'seo');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'production-seo-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(reportDir, 'production-seo-audit.csv'), `${buildCsv(pageResults)}\n`);

  printSection('Summary');
  console.table(summary.counts);
  console.log(`JSON report: ${path.join(reportDir, 'production-seo-audit.json')}`);
  console.log(`CSV report:  ${path.join(reportDir, 'production-seo-audit.csv')}`);

  const hasFailures = summary.counts.fail > 0
    || technical.some((item) => item.robots.issues.length || item.sitemap.issues.length)
    || routing.some((item) => item.issues.length);
  const hasWarnings = summary.counts.warn > 0 || summary.counts.potentialSoft404s > 0;

  if (hasFailures || (STRICT && hasWarnings)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
