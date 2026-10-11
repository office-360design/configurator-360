# Localized country domains

The production image contains one static website and one set of configurator builds. Nginx exposes them through three public domains:

- `www.360configurator.com` → English
- `www.360configurator.ro` → Romanian
- `www.360konfigurator.de` → German

The apex variants (`360configurator.*`) redirect permanently to `www`.

## Website rendering

The static website still stores Romanian and German pages under `/ro` and `/de` internally so the export has no filename collisions. Nginx selects that internal tree from the request host, so the public URLs do not expose locale prefixes.

Examples:

- `https://www.360configurator.ro/` internally serves `/ro/index.html`
- `https://www.360configurator.ro/about/` internally serves `/ro/about/index.html`
- `https://www.360konfigurator.de/configurators/pergola/` internally serves `/de/configurators/pergola/index.html`

Legacy `.com/ro/...` and `.com/de/...` URLs permanently redirect to their country domains.

## Full configurator URLs

English keeps the original routes. Country sites expose localized aliases over the same build directories.

| Product | English | Romanian | German |
| --- | --- | --- | --- |
| Pergola | `/pergola-configurator/` | `/configurator-pergola/` | `/pergola-konfigurator/` |
| Roof | `/roof-configurator/` | `/configurator-acoperis/` | `/dach-konfigurator/` |
| Window | `/window-configurator/` | `/configurator-ferestre/` | `/fenster-konfigurator/` |
| Hall | `/hall-configurator/` | `/configurator-hala/` | `/hallen-konfigurator/` |
| Solar | `/solar-configurator/` | `/configurator-solar/` | `/solar-konfigurator/` |

Requests for an English configurator path on `.ro` or `.de` permanently redirect to the localized path.

## Locale behavior

The marketing website is pre-rendered in the correct language. Standalone configurators derive their shared-shell locale from the hostname:

- `.com` → `en-US`, USD, imperial defaults
- `.ro` → `ro-RO`, RON, metric defaults
- `.de` → `de-DE`, EUR, metric defaults

Units and currency can still be overridden by the user and persist independently because each country domain has a separate browser origin.

The language picker navigates to the equivalent URL on the selected country domain instead of rendering a different language on the same canonical URL.

## SEO behavior

Localized website pages use:

- a self-referencing canonical URL on their own country domain;
- reciprocal `hreflang` links for English, Romanian and German;
- `x-default` pointing to `.com`;
- localized `html lang` output;
- localized structured-data WebSite URLs;
- a sitemap containing the canonical URLs for all three country sites.

Do not reintroduce `/ro` or `/de` as public `.com` URLs. Those paths are internal build storage only.

## Infrastructure still required

Before exposing the new domains publicly:

1. Add `360configurator.ro`, `www.360configurator.ro`, `360konfigurator.de`, and `www.360konfigurator.de` to Certificate Manager / the existing certificate map.
2. Point the apex and `www` DNS records for `.ro` and `.de` to the existing global load-balancer IP.
3. Keep the certificate DNS-authorization CNAMEs and required CAA records.
4. Add the `.ro` and `.de` origins to any external API/proxy origin allowlists (notably Google Solar-related proxies) before testing Solar there.
5. Add all three domains to Google Search Console and submit the sitemap from each property.
