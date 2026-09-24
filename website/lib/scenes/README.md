# Configurator scene sources

These files are read-only copies of production scene builders from the parent repository, adapted only so their local imports resolve inside the isolated website application.

- `pergola-builder.js`, `pergola-assets.js`, `pergola-state.js`, `pergola-pricing.js`: copied from `pergola-configurator/src`. The website copy raises preview-only LED/downlight output and lets the selected LED colour drive the integrated spots; production files remain unchanged.
- `roof-factory.js`, `roof-bom.js`: copied from `roof-configurator/js`, retaining its native geometry metrics and BOM pricing.
- `public/window-runtime`: a read-only copy of the production profile configurator and its shared UI dependencies. Only the copied `index.html` is extended with a same-origin preview bridge and transparent preview mode. The homepage therefore uses the native `2_4_Oeffnungselemnt_Vertikal` / B2-6 builder, profile substitution, opening pivots, debug materials, section generator and explode registry.
- `public/models/window-profile.glb`: the earlier 70-mesh B2-6 export is retained as a static fallback, but the homepage no longer renders it.

The original source directories remain unchanged.
