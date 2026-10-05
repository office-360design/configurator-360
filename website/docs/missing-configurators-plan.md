# Missing configurators: research and integration plan

Research date: 2026-09-24. Repository baseline: `05329b7` on `main`.

## Result

The website advertises six configurators: pergola, roof, window, hall, solar and fence. Five additional applications exist in the repository and respond on the public English domain, but have neither homepage entries nor website detail pages: cardbox, chair, bookshelf, tiles and gas.

The active Codex workspace at `/Users/max/Documents/website 360configurator` is an older unlinked copy: its Git repository has no commits or remote. The actual checkout is `/Users/max/Documents/configurator-360`. Its clean `main` branch was fast-forwarded from `9387cac` to `05329b7`. The old workspace was left untouched.

This document records the pre-implementation research. The approved website-only rollout is now implemented; see [implementation and validation](lite-configurators-validation.md) for the delivered scope, deviations and checks. No production configurator changes or deployment were made.

## Confirmed scope

The user accepted the six recommendations: independent product loading, static previews with deferred activation, shared rendering with inactive-scene cleanup, rendering only when needed, full-application features excluded from lite previews, and localized pages/navigation/SEO/sitemap integration.

Only chair, cardbox, bookshelf and tiles will be added, bringing the website to ten products. Gas routing is excluded entirely: no homepage entry, preview, detail page or sitemap addition. Its coverage row below is historical audit evidence only.

All implementation edits must remain inside `website/`. Do not modify any configurator directory, repository-level shared library, backend, deployment workflow or Nginx configuration. Existing side-effect-free modules may be imported read-only when compatible. Where source code is coupled to application startup, copy and adapt only the required geometry/state logic into website-owned modules, recording its source commit and checking output parity. Do not refactor the production applications to create importable modules. Any window-runtime changes are limited to the website-owned copy.

## Verified coverage

All three public homepages (.com, .ro, .de) return HTTP 200 and link to the same six existing product pages. All six English product pages return HTTP 200. The website's source registry and static-export list contain the same six entries in all three languages.

| Missing product | Full application on .com | Website detail page on .com | Current publication status |
|---|---|---|---|
| Cardboard boxes | `/cardbox-configurator/`: 200 | `/configurators/cardbox`: 404 | Indexable; already in assembled release's external-app sitemap list |
| Chairs | `/chair-configurator/`: 200 | `/configurators/chair`: 404 | Indexable; already in assembled release's external-app sitemap list |
| Modular bookshelves | `/bookshelf-configurator/`: 200 | `/configurators/bookshelf`: 404 | `noindex, nofollow`; README describes a client-specific implementation |
| Pavement tiles | `/tiles-configurator/`: 200 | `/configurators/tiles`: 404 | `noindex,follow`; README explicitly excludes prototype from public marketing catalogue |
| Gas route/trench planning | `/gas-configurator/`: 200 | `/configurators/gas`: 404 | `noindex, nofollow`; explicitly preliminary prototype |

HTTP checks confirm served HTML and identity, not that every application interaction, authentication or backend flow works. Missing detail pages on RO/DE are established by the shared source/export catalogue; their individual URLs were not all requested.

## What the existing lite implementation actually does

- `components/deferred-webgl-stage.tsx` defers the shared WebGL stage until the relevant section approaches the viewport. Mobile adds load/idle scheduling; reduced-motion currently skips this stage.
- `components/webgl-stage.tsx` owns a shared renderer and builds product geometry on first selection. It adapts pixel ratio, suspends when the document is hidden and avoids rendering when no spatial section is visible.
- The stage statically imports pergola, roof and the combined hall/solar/fence builders. Geometry creation is deferred per product, but product JavaScript is not independently deferred. A detail page therefore also reaches the combined stage code.
- Models already visited remain in `builtScenes` and scene groups until teardown. Extending this pattern to ten products increases retained GPU resources over a complete homepage visit.
- While a spatial section is visible, rendering continues even after the product is stationary. This is another opportunity to reduce work.
- Window is an exception: `components/window-preview.tsx` loads a copied native runtime in iframes, including a hero runtime. Do not multiply this exception across four new products. The shared stage is not the website's only possible WebGL context.
- Source reuse is mixed: roof/fence use production modules directly; several other builders are website copies. `lib/scenes/README.md` does not fully describe the newer implementation. Prefer explicit, maintained adapters with source provenance.

A fresh `npm run build` succeeds. Local output sizes, using Node's default gzip compression:

| Build output | Raw bytes | Gzip bytes |
|---|---:|---:|
| Shared Three.js chunk | 724,459 | 182,584 |
| Deferred webgl-stage chunk | 397,049 | 155,366 |
| Separate copied window-runtime Three.js | 670,576 | 166,788 |

These are individual file sizes, not total page transfer, first-load cost or measured load times. The build emits a >500 KB chunk warning. Browser performance baselines remain part of implementation acceptance.

## Recommended lite scope

| Product | Homepage preview | Detail-page expansion | Reuse and principal constraint |
|---|---|---|---|
| Chair | Wood/fabric preset and colour selection; orbit | More available finish presets; fixed product dimensions | `chairGeometry.js` exports `createChairModel`; materials are procedural. Reuse geometry through the shared Three.js instance. Adapt its shared-3d material/geometry dependencies; do not import its complete scene or vendored Three.js. Cache or pre-bake small texture presets to avoid procedural 1024px texture generation during scrolling. |
| Cardbox | A few representative box styles, dimensions and open/close | Board preset, surface colour, volume/material estimate where supported | `js/app.js` combines geometry with DOM, tenant access, renderer and decoration tooling. Copy the necessary model/state logic into a side-effect-free website adapter without changing that file. Keep image upload, artwork editor and commercial account flows in the full app. Preserve actual closure geometry. |
| Bookshelf | Straight/L layout preset, one dimensional family selector, finish and doors | Bounded module count, shelf options and component summary | Geometry/state currently live in a DOM-coupled `js/app.js`. Create a website-owned builder from the required source logic, retain connection and collision rules, and cap preview module count. Use the current code as truth: README dimensions already differ from implementation. Do not advertise unverified pricing. |
| Tiles | Small rectangular sample, tile format/pattern/colour and dimensions | Curbs, optional simple house exclusion, area and quantity summary | Import pure `model.js`, `area.js`, `house.js` and layout calculations read-only where compatible. Adapt scene geometry from `viewer.js` into a website-owned module; its existing renderer, controls and large ground should not be mounted inside the website stage. Keep instancing; bound generated piece count. Map imports and live address lookup stay in the full app initially. |

Reuse rules and geometry; simplify the interaction surface. Production source remains untouched. Website-owned adaptations must record their source commit and compare representative lite states against the original full-app geometry and calculations. Future source updates require deliberate parity review of those copies.

## Loading and resource architecture

1. Introduce product metadata and preview-loader registries. Metadata contains no renderer imports. Each loader uses an explicit dynamic `import()` for that product's adapter and controls. Avoid a barrel module that eagerly imports every builder.
2. Reuse the shared stage for the four new 3D products. Each adapter exposes create/update/dispose, bounds and optional metrics. Detail pages load only their selected product plus shared dependencies.
3. Render text, links and a correctly sized static poster first. On desktop, fetch the next needed preview shortly before it enters view; on mobile or constrained connections, offer explicit activation. Limit prefetch to one neighbour. Keep posters and usable links for reduced motion, WebGL failure and context loss.
4. Keep one active new 3D scene and at most one warmed neighbour on desktop; retain only the active scene on mobile. Preserve small configuration state when evicting geometry. Suspend the existing window iframe runtimes when offscreen and measure their retained-context cost separately.
5. Render on changes, resize, camera motion and finite transitions; stop after settling. Abort obsolete loads and ignore stale completions when visitors scroll quickly. Debounce expensive geometry rebuilds while updating numeric controls immediately.
6. Track ownership of geometry, materials, textures and render targets. Dispose evicted product resources without disposing shared assets still used elsewhere. Existing generic disposal helpers do not explicitly dispose material textures, so they are insufficient as an eviction contract.
7. Use the existing adaptive-quality approach with bounded geometry, texture resolution and shadow cost. Add a worker only if profiling shows tile generation creates long main-thread tasks; it is not a prerequisite for a small sample.

Separate imports are supported by [Vite's asynchronous chunk loading](https://vite.dev/guide/features.html#async-chunk-loading-optimization). The proposed render lifecycle follows [Three.js rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html); resource ownership follows [Three.js cleanup guidance](https://threejs.org/manual/pages/cleanup.html).

## Website integration beyond the preview

- Add product definitions and slugs in `lib/configurators.ts`; complete EN/RO/DE content in `lib/configurators-localized.ts` and SEO sections in `lib/configurator-seo-content.ts`.
- Extend `localized-home.tsx` and `localized-configurator-page.tsx` with the new preview types. Homepage/navigation/related-product lists derive from the registry, but their ten-item layout needs desktop/mobile review. Preserve the six existing experiences during the initial rollout.
- Derive the custom-system section number instead of its current hardcoded `07` substitution. Review any remaining fixed product counts independently of the intentionally six-faced capability cube.
- Unify or synchronize `scripts/static-routes.mjs`, `scripts/assemble-static-release.mjs`, `scripts/validate-static-release.mjs` and `app/sitemap.ts`. They currently repeat different product lists.
- Complete public app path mapping in `lib/i18n.ts`: it currently includes cardbox but omits chair, although the deployment layer already supports localized chair paths. Bookshelf/tiles currently have common paths across domains. Read `cloudrun/nginx.conf` to verify links, but do not edit it or invent unsupported translated app URLs.
- Update website sitemap policy, metadata, internal links, `public/llms.txt` and `public/llms-full.txt` for the four additions. Four additions mean twelve localized detail-page outputs. Gas remains excluded.
- Add the four website product pages as requested, with accurate descriptions of bookshelf's client-specific origin and tiles' prototype status. Existing full-app noindex tags remain untouched; marketing-page indexing is controlled separately inside the website.
- Each lite preview launches the correct full app. Carrying edited state into the full app is optional follow-up work: first verify each app's supported state import contract rather than inventing query parameters.

## Implementation sequence

1. Capture reproducible browser baseline on desktop and mid-range mobile, including current homepage, one existing detail page, window hero and a full down/up scroll. Record requests, compressed JS, LCP, interaction latency, frame time, long tasks and retained scene resources.
2. Build the loader/lifecycle contract and integrate chair as the smallest pilot. Confirm bundle separation and visual fidelity before expanding.
3. Create cardbox's website-owned geometry/state adapter and add its lite preview and localized page content. Verify closure geometry against the unchanged full application.
4. Add bounded bookshelf and tiles previews using website-owned adapters. Verify module joins/doors and tile counts against production calculations.
5. Complete all four products' EN/RO/DE pages, navigation, metadata, sitemap entries and full-app links entirely within `website/`.
6. Run the complete localized static release validation and browser acceptance suite. Release products incrementally so a regression can be attributed and rolled back per product.

Suggested acceptance gates, to be calibrated against the measured baseline:

- Zero new product runtime/texture/map requests before activation or the chosen near-viewport threshold. Additional text and posters do have a small cost; literal zero performance impact cannot be promised.
- Target no more than 10 KB additional gzip startup JavaScript for the shared loading layer. Product code must remain outside the initial and unrelated detail-page dependency graphs.
- Existing-page median LCP and interaction timings should stay within 5% of baseline across at least five equivalent runs; investigate differences above normal test variation.
- No sustained GPU/geometry/texture growth after repeated full-page down/up traversal; scene counts return to the bounded cache policy.
- No sustained offscreen or hidden-tab rendering; target responsive mobile interactions without new >50 ms main-thread tasks from preview generation.
- Model/quantity parity for supported lite states; poster fallback under reduced motion, failed imports and WebGL/context loss; rapid scroll and navigate-away cleanup.
- Correct homepage entries, detail pages, locale links, metadata, sitemaps and full-app CTAs for every published product. Verify the original six still work.
- Confirm the implementation diff contains only `website/` paths and no new gas catalogue, preview, route or sitemap entries.

The first implementation milestone should be the chair pilot plus loading isolation. It provides a measurable performance result before the two monolithic applications and the more expensive tile layout are integrated.
