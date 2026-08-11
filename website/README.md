# 360Configurator Website

This directory is the isolated application surface for the new 360Configurator marketing website.

## Repository boundary

- All website changes must stay inside `/website`.
- Existing configurator directories and root repository files are read-only.
- The website has its own package manifest, lockfile, build configuration, runtime and dependencies.
- Existing configurator source must not be reformatted, reorganized or modified to support the website.
- Any asset copied into the website must have its source and license documented.
- Do not stage, commit or push website changes without explicit approval.

## Development

```bash
npm install
npm run dev
```

## Current implementation

- Persistent procedural WebGL stage shared by the hero and all five configurator previews.
- Scroll-directed window profile assembly, CAD/debug and material states.
- Lightweight interactive pergola, roof, window, hall and solar scenes with direct links to the full configurators.
- Independently authored dark and light environments.
- Responsive homepage and dedicated search-indexable pages for every active configurator.
- English, Romanian and German localized routes with reciprocal `hreflang` signals.
- Sitemap, crawler rules, canonical URLs, JSON-LD, social sharing metadata and a web app manifest.
- Machine-readable `/llms.txt` and `/llms-full.txt` product context for AI discovery.

## Routes

- `/`
- `/about`
- `/contact`
- `/configurators/{pergola,roof,window,hall,solar}`
- `/ro`, `/ro/about`, `/ro/contact`, `/ro/configurators/{pergola,roof,window,hall,solar}`
- `/de`, `/de/about`, `/de/contact`, `/de/configurators/{pergola,roof,window,hall,solar}`

## Search launch checklist

After the production domain is live:

1. Verify `https://360configurator.com` in Google Search Console and Bing Webmaster Tools.
2. Submit `https://360configurator.com/sitemap.xml` in both tools.
3. Inspect the home page and each localized configurator URL, then request indexing.
4. Validate the rendered JSON-LD with Google's Rich Results Test and Schema.org Validator.
5. Confirm `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` return `200` without redirects.

## Validation

```bash
npm run lint
npm run build
npm test
```
