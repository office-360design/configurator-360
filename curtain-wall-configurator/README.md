# Curtain wall configurator (Cortizo)

3D configurator for stick curtain walls (mullion/transom) and skylights on the
Cortizo 52 mm systems. It reuses the window configurator's ideas: an axis grid
of tracks, 2D sections extruded to 3D, shared-3d materials, the shared shell,
and RO/EN/DE. Every mullion and transom is one extrusion along a grid line, and
transoms butt against mullions.

- **Grid**: bay widths and row heights, axis to axis, bottom up. Rows are
  vision or opaque spandrel. Presets: shopfront, office on 2 storeys, atrium.
  Wind load and anchor spacing are inputs.
- **Building and anchors** (`js/building.js`): the building scales with the
  facade.
  - **Facade:** a concrete slab at every anchor level (every anchor spacing,
    plus the top), extending 400 mm past each end of the facade. The building
    depth is 55 % of the width, kept between 4 and 9 m. Columns stand behind
    the slab edge at most 6 m apart. On each slab, every mullion has a steel
    bracket: a base plate and two fins either side of the mullion, in a
    120 mm gap behind it.
  - **Skylight:** a support wall behind the ridge and an eaves beam on posts
    (eaves at 2.4 m), with brackets at both ends of every rafter.
  - The toggle is in the statics section. The building hides during the
    exploded view. The camera cycle has an `anchor` close-up.
  - The geometry is indicative. The anchor type and count come from the
    engine (Checks tab).
- **Finishes**: RAL / anodised, for outside and inside. Glass tint. Order
  quantity.
- **Tools**: camera views (exterior, front, interior, node) and an exploded
  view of the node layers.
- **Checks**: `npm run check:curtain-wall` and
  `npm run check:curtain-wall:browser` (needs a static server on port 8080).

The configurator used GUTMANN GCW 050 until October 2026. States saved with it
still open: their GCW fields are dropped and the grid is kept.

## Augmented reality

The toolbar AR action uses the shared Android/iOS selector and QR dialog.
Android exports GLB for Scene Viewer; iOS exports USDZ for Quick Look. The
phone entry point is `/curtain-wall-configurator/ar.html` on every supported
country domain. It preserves the selected locale and requires no account.

Snapshots contain the assembled physical façade or skylight: profiles, caps,
gaskets, glass, opaque panels and opening frames, including the configured
finishes and skylight slope. Dimensions stay in metres. The illustrative
building, its supports and ground are omitted. The lowest point of the exported
assembly is placed at ground level. Capturing from exploded view restores layer
positions on a copy, preserving the live camera, animation and editor geometry.
Pending grid edits and loading finish textures are resolved before capture;
incomplete or stale geometry fails before a QR can be published.

The production Three.js import map remains pinned to **0.160.0**. Its USDZ
exporter exposes asynchronous `parse()`, so the adapter uses that API. The
test-only npm dependency pins the same version; it does not add a build step.

From the repository root:

```bash
npm run check:curtain-wall
npm ci --ignore-scripts
npm ci --prefix curtain-wall-configurator --ignore-scripts
npm run check:curtain-wall:ar
npx playwright install chromium
npm run check:curtain-wall:ar-browser
```

`CW_TEST_BROWSER` can select an installed Chromium/Edge executable. The browser
test runs the real editor and native exporters for all seven systems, checks
GLB dimensions by loading the result, validates both binary formats with the
Firebase validator, and exercises QR publishing, platform switching, retries,
locales and phone launch links against a local service. It never uploads to
production. Reports/screenshots go to `tmp/curtain-wall-ar/`, or to the directory
set by `CW_AR_ARTIFACTS`.

Release both the frontend and the Firebase share backend changes. The existing
`publishHallAR`, `getHallAR` and `cleanupHallAR` functions now accept
`product=curtainwall`, with the same private bucket, format limits and 24-hour
expiry as the other AR adapters. Deploy the Firebase backend before releasing
the frontend so QR publication is available immediately. No new bucket or
infrastructure provisioning is required. Tenant catalogue permissions remain
unchanged. Test native camera placement on physical Android and iOS devices
before releasing changes to rendering.

## Cortizo systems

The configurator covers the seven systems of the Cortizo catalogue façade and skylight systems
catalogue v26.04.01 (04/2026): TP 52, SG 52, TPH 52, TPV 52,
ST 52, SST 52 and Skylight – Veranda.

- `cortizo/` holds the Cortizo project **unchanged**: the pure engine
  (`src/`), the catalogue data and rules (`data/`), its 12 tests, the
  methodology, catalogue sources, assumptions and conversation history
  (`docs/`), and the extraction scripts. Read `cortizo/CLAUDE.md` before you
  change the calculation. Run its tests with `npm test` inside `cortizo/`.
- `js/cortizo.js` is the adapter between the two:
  - It loads the JSON data on first use (about 1.4 MB).
  - It maps the configurator state to an engine project. Rows are bottom-up
    here and top-down in the engine. Spandrel rows become opaque panels where
    the system has them, and clicked cells override that.
  - It turns the result into the model the 3D scene and drawings read.
  - Member sections follow the system edges: pressure plate + cap, a sealed
    clip/silicone joint, or the ST/SST glass frame.
- `js/cortizoUi.js` builds the sidebar controls and the sheet:
  - an elevation with the status of every field; clicking a field cycles
    glass → vent → panel;
  - checks with catalogue pages;
  - the anchors table and glazing components;
  - the cutting list on bars and the accessories list;
  - the systems comparison and the logic map (`cortizo/web/map.html`).
- The skylight leans at its slope in 3D. Snow and slope go into the engine.
- Catalogue names are shown in English only (`desc_en`); no Spanish text is
  displayed. Engine messages stay Romanian, as in `cortizo/`. Labels follow
  the RO/EN/DE locale.
- Deploy publishes `cortizo/src`, `cortizo/data/*.json` and `web/map.html`
  only. Docs, tests, scripts and the spreadsheet stay in the repository.

To bring in a newer version of the standalone project (for example after
re-extracting the catalogue):

```bash
rsync -a --exclude .git --exclude dist --exclude node_modules ~/Documents/cortizo-configurator/ curtain-wall-configurator/cortizo/
npm run check:curtain-wall
```

Then bump `CORTIZO_DATA_VERSION` in `js/cortizo.js`.
