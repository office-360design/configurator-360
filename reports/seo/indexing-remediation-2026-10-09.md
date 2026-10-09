# Website indexing remediation — 9 October 2026

Scope: website static export, marketing redirects and SEO regression checks only.
Base: origin/main at 4e5a9c0. No configurator code, APIs, authentication, assets,
pricing rules or website client bundles were edited.

## Six-point outcome

1. **Recheck production:** current product URLs return 200 and already declare
   their own language-domain canonical. However, marketing product metadata was
   emitted after `</head>` in static HTML on 39 of the 45 live marketing pages.
   All 45 returned 200 and all ten products are linked from each homepage and
   present in each country's sitemap. The English `/de/` URL already returns
   a permanent redirect to `https://www.360konfigurator.de/`.
2. **Canonical consistency:** static export now requests the framework's
   blocking-metadata render. Canonical, robots and all language alternates must
   be in the initial head. Release validation checks all 45 pages. Only the
   known marketing routes redirect trailing-slash/index.html aliases to the
   existing slashless canonical. Query strings are preserved. Contact query
   variants remain functional and canonicalize to the clean contact page.
3. **Full apps:** unchanged. Window metadata is injected by the existing shared
   app shell; lack of a canonical in a raw HTTP fetch is not proof that the
   rendered app has none. Do not change the app without checking GSC's selected
   canonical and its rendered metadata. Bookshelf/tiles noindex stays intact.
4. **Legacy paths:** `/our-work/` now points to the homepage, which contains the
   actual deployed-systems portfolio. `/paving-configurator/` points to the
   equivalent `/configurators/tiles` product page. Kitchen, kitchen-island,
   personalized-gifts, old articles and Romanian kitchen-island URLs have no
   demonstrated equivalent; leave proper 404s rather than generic redirects.
   Existing `/ro` and `/de` country-domain redirects now retain query strings.
5. **German discovery:** bookshelf, fence and hall already have server-rendered
   product pages, homepage/navigation/footer links and German sitemap entries.
   Keep them; the new release checks prevent losing crawlable links on any
   homepage. Production audit coverage now includes all ten marketing products
   and pricing/demo pages across all three domains.
6. **Verification/publication:** build/export, initial-head metadata, sitemaps,
   internal links, nginx route isolation and browser hydration are tested locally.
   Google validation must wait until this release is actually deployed.

Local checks passed: website build; export of 45 pages; release validation;
1,382 actual nginx route cases; browser hydration on 15 localized product pages;
all four rendered-HTML tests; route-isolation check; clean diff whitespace check.

## Deployment and Google follow-up

- Review the scoped diff, merge/publish through the existing Cloud Run workflow.
- Run `npm run audit:seo` against the deployed release. This is read-only; it
  checks rendered app metadata as well as marketing pages.
- Inspect the current EN/RO/DE canonical marketing URLs in Search Console.
  Confirm the published head metadata, Google-selected canonical and sitemap.
- Request indexing for the German bookshelf/fence/hall preferred URLs only if
  they are still unindexed. Validate the canonical/soft-404 fixes after confirming
  the deployed behavior. Do not validate intentional noindex, asset-folder 403,
  WordPress/admin/API exclusions, or ordinary redirect exclusions as errors.
- Monitor the next crawl/report update. Google indexing is not guaranteed and
  historical exclusions may remain visible after the website is corrected.

## Safety limits

Marketing normalization only matches GET/HEAD and an explicit page allowlist.
It does not match tenant hosts, configurator directories, JS/CSS/models, API
paths, unknown slugs or POST requests. Existing auth/solar proxy and tenant
security rules are untouched. No new client JavaScript or network requests.

Local nginx test command on Homebrew macOS:

```sh
NGINX_MIME_TYPES=/opt/homebrew/etc/nginx/mime.types python3 scripts/validation/tenant-domains.nginx.py
```

The lite-product suite has an existing paving test failure on this main baseline
(11/12 pass). Follow-up diagnosis: the assertion sums `p.l * p.w`, the full stone
rectangles, instead of the clipped area `p.area ?? p.l * p.w`. For running 1×1 m,
55 pieces include 10 clipped pieces: rectangle area totals 1.10 m², whereas actual
clipped area totals 1.00 m². All nine tested pattern/dimension combinations have
the correct net area. This is evidence of a stale assertion, not of an area error
in the preview. No paving source or test code is changed by this remediation.
