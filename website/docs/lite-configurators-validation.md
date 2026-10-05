# Website lite products: implementation and validation

Date: 2026-09-24. Source baseline: `05329b7`.

## Cardbox parity correction

The subsequent catalogue correction exposes all nine native styles with generated original icons, FEFCO references and EN/RO/DE labels. Style changes reset to source dimensions, closures and default cut-outs. Compatible top/bottom closure selectors and TFT/AFT/AFA paper recipes are available. Cardbox uses the source's NoToneMapping, hemisphere/key/fill light colors and strengths, plus its camera angle. The source JS SHA-256 matches the live app on 2026-09-24: `1e36d8c6e7d8f6034e76ae06921f6bd1c0437a79782960bba57abfca82172fca`. The website retains its transparent background and lightweight ground shadow, not the source's full environment/shadow-map rendering. Sixteen automated tests pass, and all nine style defaults were checked interactively on desktop, with a mobile catalogue check at 360px. These supersede the three-style limitations below.

The adapter now uses the final production inside/outside surface pipeline rather than the earlier superseded surface builder. Production paper definitions, surface colors, feature processing and technical edges are retained. The initial view is closed, matching the source app. White outer paper leaves the natural inner liner intact. Fifteen automated tests now include exact source-function parity and paired inner/outer lid motion across all three styles. The original application's whole-panel inspection motion is preserved; it is not advertised as individual flap physics. Original configurator files remain unchanged.

## Design-system refinement

The separate lite form styling has been replaced with the established instrument-console UI: shared sliders, labelled roof-style colour swatches, preset buttons, console tabs, collapse controls and mobile swipe behaviour. `scene-control-primitives.tsx` is now consumed by both existing and new controls without importing any model code. Existing roof sliders and colour selection were regression-checked in the browser.

Materials now come from the original configurators: original bookshelf PNG assets, chair maps baked ahead of time from production generators, and native paving stone appearance/bump generation. The earlier substitute surfaces have been removed. Only selected materials load when a preview activates. Website lighting and the lightweight ground treatment remain separate from full-app rendering. Camera framing follows model bounds; mobile activation and controls retain their existing behavior.

Eleven tests pass after the refinement. Desktop interaction/resource audits cover all four products: no idle draw calls, no horizontal overflow, and model buffers/textures plus the WebGL context released offscreen. Homepage checks confirm one new canvas across the four sections. Existing SEO and website-only scope are unchanged.

## Delivered

Chair, cardboard boxes, modular bookshelves and paving now have homepage previews, navigation entries and product pages in English, Romanian and German. The catalogue contains ten products. Gas is excluded.

All changes are under `website/`. Production configurators, shared root libraries, backend and deployment configuration remain unchanged. No commit, push or deployment was performed.

The previews reuse existing typography, colours and instrument controls. Chair adds oak/beech/ash materials; boxes use three native structures and closure transformations. Bookshelves expose families, layouts, modules, doors, shelf density, hardware and open/closed doors. Paving adds three formats, native rectangular/L-shaped houses with dimensions and rotation, footprint exclusions and curbs. Preview state is not transferred to full apps.

Source provenance is recorded in `lib/scenes/lite/README.md`. Native cardbox renderer functions replace the earlier independent illustration; the preview is still not a manufacturing dieline. Materials use original assets/algorithms under website lighting. Paving remains a prototype and no purchasing/pricing claims are invented.

The desktop dropdown now has a viewport-bounded native scrolling region excluded from Lenis, with contained overscroll. A thin localized LITE notice links to the current product's full app. New tests cover baked texture provenance, rotated native house exclusions and expanded bookshelf options; thirteen automated tests pass.

## Loading and resource isolation

- The four new products share a website-owned renderer with independently imported builders. The six established previews retain their existing engine rather than undergoing a risky full rewrite.
- Server-rendered SVG posters, product descriptions and links do not require WebGL. Touch, reduced-motion and Save-Data visitors explicitly activate 3D. Desktop previews activate when visible.
- Only one new model owns the renderer. Offscreen models dispose their geometry and materials; small input state survives in React. The idle renderer is destroyed after 1.5 seconds. There is no continuous idle render loop.
- The legacy fixed canvas hides when an independent product occupies the viewport and restores on return. The existing window hero poster also hides outside its hero, including when its iframe fails to become ready.
- Navigation now receives only menu fields from the server instead of importing all product descriptions and translations into a client bundle.

This is not a claim of zero extra bytes or guaranteed Core Web Vitals. The old window iframe runtime and retained legacy scenes remain existing performance constraints. Field performance should be measured after deployment.

## Search and machine-readable discovery

Twelve localized product pages include server-rendered copy and FAQs, unique titles/descriptions, country-domain canonicals, language alternates, breadcrumbs and WebApplication/FAQ structured data. Navigation, related-product lists, route export and localized sitemaps include all ten marketing pages. Existing noindex policy for the full bookshelf and tiles applications remains intact; those app URLs are not newly added to sitemaps.

`llms.txt` and `llms-full.txt` describe the four products and their limits and use the current canonical domains. These improve accessible context, not a promise of search ranking, rich results or inclusion in an LLM answer.

## Verification

- Production website build and export: 45 pages plus two metadata routes.
- Static release validation in explicit source-app mode: passed, including 53 HTML files, canonical metadata and composed-site links.
- Thirteen Node tests passed: rendered content, machine discovery, baked source materials, chair geometry, native box combinations/volume, bookshelf families/layouts/doors/hardware/shelves, native paving and house exclusion parity, and all twelve new pages' SEO/loading markup.
- Targeted ESLint for the new preview, metadata, builders, header and tests passed. `git diff --check` passed.
- Desktop browser checks: all four detail previews respond to controls, no horizontal overflow, zero additional draw calls at rest, buffers released offscreen and WebGL contexts destroyed. No JavaScript page errors on these product checks.
- Homepage checks: one active new canvas while scrolling between all four products; the legacy canvas is hidden and restores when returning to fence.
- Touch check at 360px: no 3D engine or model downloaded before activation, controls work after activation, no horizontal overflow.
- Reduced-motion check: no canvas before explicit activation; activation succeeds. Simulated runtime-download failure: explanatory fallback and retry remain visible.
- Visual checks include desktop and mobile previews, expanded four-module corner bookshelves, box lids and paving patterns. Local screenshots are in ignored `output/playwright/`.

### Validation limits

The normal strict release validator still requires the missing compiled sibling window app (`dist/window-configurator-build`). Local checks used `node scripts/validate-static-release.mjs --source-apps`, which validates its source paths and explicitly does not certify that compiled app. The default production validation was not weakened.

The repository-wide TypeScript check already reports missing Three.js declarations and existing window/deferred/Cloudflare typing errors. Targeted new-code lint and the production build pass, but a clean repository-wide type check is not claimed.

The existing window runtime requests a CAD screenshot API unavailable in the static local preview; its 404 is unrelated to the four additions. The build retains its existing large shared Three.js chunk warning. No live Lighthouse/field performance or production deployment validation was performed.

## Repeat

```sh
npm run build
npm run export:static
npm run assemble:release
node scripts/validate-static-release.mjs --source-apps
node --test tests/rendered-html.test.mjs tests/lite-products.test.mjs
```

Use the normal `npm run release:static` once the sibling window build is present. Review the website-owned bookshelf snapshot whenever production geometry changes.
