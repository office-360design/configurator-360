# Production SEO audit

This audit checks the live EN, RO and DE production sites after deployment.

It covers:

- all three home/about/contact pages;
- all five rich `/configurators/{product}` marketing pages on each domain;
- all five standalone configurator applications on each domain;
- HTTP status and redirect chains;
- rendered `<html lang>`;
- title and meta description;
- `index` / `noindex`;
- self-canonical;
- reciprocal EN / RO / DE `hreflang` plus `x-default`;
- H1 presence on the marketing pages;
- duplicate rendered titles;
- `robots.txt`;
- hostname-specific `sitemap.xml`;
- known locale redirects;
- a deliberately invalid URL on every domain to expose potential soft-404 behaviour;
- a small set of legacy URLs in **observation-only mode**.

The legacy URL section deliberately makes no redirect/404/410 recommendation. Use Search Console impressions, clicks, backlinks and business relevance before changing old URLs.

## First run

The project already depends on Playwright. Install Chromium once:

```bash
npm run install-browser
```

Then run:

```bash
npm run audit:seo
```

The audit uses a real browser because the standalone configurators inject part of their SEO metadata in JavaScript. A raw `curl` audit would miss that rendered metadata.

## Reports

Each run writes:

```text
reports/seo/production-seo-audit.json
reports/seo/production-seo-audit.csv
```

The terminal also prints a compact summary.

## Exit codes

Normal mode:

```bash
npm run audit:seo
```

returns a failure code for hard technical problems such as wrong canonicals, missing `hreflang`, wrong language, non-200 canonical URLs, broken sitemaps or routing checks.

Warnings such as potential soft-404s do not fail the command.

Strict mode:

```bash
npm run audit:seo -- --strict
```

also treats warnings as a failing audit.

## Browser debugging

If a rendered page behaves differently headlessly:

```bash
npm run audit:seo -- --headed
```

This opens Chromium while the audit runs.

## Important

Run this against production **after deployment**. It intentionally audits the public URLs rather than local build output.
