# Localized country domains

The production image contains one static website and one set of configurator builds. Nginx exposes them through six public domains:

- `www.360configurator.com` → English (`en-US`)
- `www.360configurator.ro` → Romanian (`ro-RO`)
- `www.360konfigurator.de` → German (`de-DE`)
- `www.360configurador.es` → Spanish (`es-ES`)
- `www.360configurateur.fr` → French (`fr-FR`)
- `www.360configuratore.it` → Italian (`it-IT`)

Each apex variant (`360configurator.com`, `360configurator.ro`, `360konfigurator.de`, `360configurador.es`, `360configurateur.fr`, `360configuratore.it`) redirects permanently to its `www` host.

The shared decisions for Spanish, French and Italian are in [NEW_LOCALES_ES_FR_IT.md](NEW_LOCALES_ES_FR_IT.md).

## Website rendering

The static website stores the non-English pages under the internal prefixes `/ro`, `/de`, `/es`, `/fr` and `/it` so the export has no filename collisions. Nginx selects that internal tree from the request host (`$site_prefix`), so the public URLs do not expose locale prefixes.

Examples:

- `https://www.360configurator.ro/` internally serves `/ro/index.html`
- `https://www.360configurator.ro/despre-noi` internally serves `/ro/despre-noi/index.html`
- `https://www.360konfigurator.de/konfiguratoren/pergolen` internally serves `/de/konfiguratoren/pergolen/index.html`
- `https://www.360configurateur.fr/contact` internally serves `/fr/contact/index.html`

### Page slugs per language

Every presentation page uses slugs in the domain's language. The table is `website/lib/page-slugs.json`; it drives the links, canonical and hreflang tags (`localizedPath` in `website/lib/i18n.ts`), the static export folders and sitemaps, the llms files, and the nginx redirects.

| Page | en | ro | de | es | fr | it |
|---|---|---|---|---|---|---|
| About | `/about` | `/despre-noi` | `/ueber-uns` | `/sobre-nosotros` | `/a-propos` | `/chi-siamo` |
| Contact | `/contact` | `/contact` | `/kontakt` | `/contacto` | `/contact` | `/contatti` |
| Pricing | `/pricing` | `/preturi` | `/preise` | `/precios` | `/tarifs` | `/prezzi` |
| Book a demo | `/book-a-demo` | `/programeaza-demo` | `/demo-buchen` | `/reservar-demo` | `/reserver-demo` | `/prenota-demo` |
| Products | `/configurators/<p>` | `/configuratoare/<p>` | `/konfiguratoren/<p>` | `/configuradores/<p>` | `/configurateurs/<p>` | `/configuratori/<p>` |

The product part is localized too (e.g. `/configuratori/finestre`, `/konfiguratoren/daecher`); see the JSON for all ten products.

**Redirects (301).** On each country domain the old English slug (with or without a trailing slash or `/index.html`) moves to the domain's own slug, keeping the query string. Legacy `.com/<lang>/<English slug>` URLs go to the final localized page in one hop. The nginx maps are generated: after changing a slug run `node scripts/build/sync-website-slugs.mjs`; `npm run check:tenant-domains` fails while nginx and the JSON disagree. Keep the previous slug redirecting when you rename one.

Legacy `.com/ro/…`, `.com/de/…`, `.com/es/…`, `.com/fr/…` and `.com/it/…` URLs permanently redirect to their country domains. On a tenant host the same prefixes redirect (302) to the tenant alias on the matching country root.

Each host also gets its own `robots.txt` sitemap reference, `/sitemap.xml` (`sitemap-<lang>.xml`), `/llms.txt` (`llms-<lang>.txt`) and `/llms-full.txt` (`llms-full-<lang>.txt`).

## Full configurator URLs

English keeps the original routes. Country sites expose localized aliases over the same build directories. The source of truth is `CONFIGURATOR_PUBLIC_PATHS` in `shared-ui/src/config.js`; `cloudrun/nginx.conf` mirrors it and `scripts/validation/tenant-domains.nginx.py` checks every route.

| Product | English | Romanian | German | Spanish | French | Italian |
| --- | --- | --- | --- | --- | --- | --- |
| Pergola | `/pergola-configurator/` | `/configurator-pergola/` | `/pergola-konfigurator/` | `/configurador-pergolas/` | `/configurateur-pergola/` | `/configuratore-pergola/` |
| Roof | `/roof-configurator/` | `/configurator-acoperis/` | `/dach-konfigurator/` | `/configurador-tejados/` | `/configurateur-toiture/` | `/configuratore-tetto/` |
| Window | `/window-configurator/` | `/configurator-ferestre/` | `/fenster-konfigurator/` | `/configurador-ventanas/` | `/configurateur-fenetres/` | `/configuratore-finestre/` |
| Hall | `/hall-configurator/` | `/configurator-hala/` | `/hallen-konfigurator/` | `/configurador-naves/` | `/configurateur-hangar/` | `/configuratore-capannone/` |
| Solar | `/solar-configurator/` | `/configurator-solar/` | `/solar-konfigurator/` | `/configurador-solar/` | `/configurateur-solaire/` | `/configuratore-fotovoltaico/` |
| Fence | `/fence-configurator/` | `/configurator-garduri/` | `/zaun-konfigurator/` | `/configurador-vallas/` | `/configurateur-cloture/` | `/configuratore-recinzioni/` |
| Cardbox | `/cardbox-configurator/` | `/configurator-cutii-carton/` | `/karton-konfigurator/` | `/configurador-cajas-carton/` | `/configurateur-cartons/` | `/configuratore-scatole/` |
| Chair | `/chair-configurator/` | `/configurator-scaune/` | `/stuhl-konfigurator/` | `/configurador-sillas/` | `/configurateur-chaises/` | `/configuratore-sedie/` |
| Bookshelf | `/bookshelf-configurator/` | same | same | same | same | same |
| Tiles | `/tiles-configurator/` | same | same | same | same | same |

Gas, cages and curtain wall keep their single route on every domain.

Requests for an English configurator path on a country domain permanently redirect to the localized path. A localized alias requested on any other public host redirects to the host that owns it (for example `www.360configurator.com/configurateur-toiture/` → `www.360configurateur.fr/configurateur-toiture/`).

## Locale behavior

The marketing website is pre-rendered in the correct language. Standalone configurators derive their shared-shell locale from the hostname (`getLocaleForHostname`, driven by `LOCALE_HOSTS` and the tenant roots):

- `.com` → `en-US`, USD, imperial defaults
- `.ro` → `ro-RO`, RON, metric defaults
- `.de` → `de-DE`, EUR, metric defaults
- `.es` → `es-ES`, EUR, metric defaults
- `.fr` → `fr-FR`, EUR, metric defaults
- `.it` → `it-IT`, EUR, metric defaults

Number and date formatting uses the locale itself. Guest IP defaults map ES, FR and IT to their own locale (`shared-ui/src/regionDefaults.js`).

Units and currency can still be overridden by the user and persist independently because each country domain has a separate browser origin.

The language picker navigates to the equivalent URL on the selected country domain instead of rendering a different language on the same canonical URL.

## SEO behavior

Localized website pages use:

- a self-referencing canonical URL on their own country domain;
- reciprocal `hreflang` links for `en`, `ro-RO`, `de-DE`, `es-ES`, `fr-FR` and `it-IT`, in that order;
- `x-default` pointing to `.com`;
- localized `html lang` output;
- localized structured-data WebSite URLs;
- one sitemap per country site with only its own canonical URLs.

Do not reintroduce `/ro`, `/de`, `/es`, `/fr` or `/it` as public `.com` URLs. Those paths are internal build storage only.

## Infrastructure still required for `.es`, `.fr` and `.it`

Before exposing the new domains publicly:

1. Add `360configurador.es`, `www.360configurador.es`, `360configurateur.fr`, `www.360configurateur.fr`, `360configuratore.it` and `www.360configuratore.it` to Certificate Manager / the existing certificate map. For tenants, add the wildcard certificates `*.360configurador.es`, `*.360configurateur.fr` and `*.360configuratore.it` (DNS authorization).
2. Point the apex, `www` and wildcard DNS records to the existing global load-balancer IP. Keep the certificate DNS-authorization CNAMEs and required CAA records.
3. Add the three `www` hosts to Firebase Authentication → Settings → Authorized domains (the `/__/auth` helper proxy is served on every host).
4. Run `firebase-share-backend/iam/authorize-existing-tenant-auth-domains.mjs` once so existing tenants get their new `.es`, `.fr` and `.it` aliases authorized.
5. Update `GOOGLE_SOLAR_ALLOWED_ORIGIN` on the Solar API service with the three new `www` origins (see `solar-google-api/README.md`), and any other external proxy allowlist.
6. Deploy Firebase functions (origin allowlists, quotation copy, profile domains) together with the frontend image.
7. Add the three domains to Google Search Console and submit the sitemap from each property.
