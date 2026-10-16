# Curtain wall configurator (Cortizo)

3D configurator for stick curtain walls (mullion/transom) and skylights on the
Cortizo 52 mm systems. It reuses the window configurator's ideas: an axis grid
of tracks, 2D sections extruded to 3D, shared-3d materials, the shared shell,
and RO/EN/DE. Every mullion and transom is one extrusion along a grid line, and
transoms butt against mullions.

- **Grid**: bay widths and row heights, axis to axis, bottom up. Rows are
  vision or opaque spandrel. Presets: shopfront, office on 2 storeys, atrium.
  Wind load and anchor spacing are inputs.
- **Finishes**: RAL / anodised, for outside and inside. Glass tint. Order
  quantity.
- **Tools**: camera views (exterior, front, interior, node) and an exploded
  view of the node layers.
- **Checks**: `npm run check:curtain-wall` and
  `npm run check:curtain-wall:browser` (needs a static server on port 8080).

The configurator used GUTMANN GCW 050 until October 2026. States saved with it
still open: their GCW fields are dropped and the grid is kept.

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
