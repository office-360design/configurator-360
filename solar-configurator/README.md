# Solar Configurator

A Three.js residential photovoltaic configurator derived from the roof configurator UI and geometry conventions.

## Repository placement

Keep this folder at the same level as the existing shared UI:

```text
repo-root/
  shared-ui/
  roof-configurator/
  solar-configurator/
```

The configurator intentionally reuses the same `shared-ui` shell, tool launcher, preferences, sidebar behavior, dark theme integration, camera patterns, and roof geometry conventions as the roof configurator.

## Run locally

Serve the repository root over HTTP (ES modules should not be opened through `file://`):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/solar-configurator/`.

No build step is required. Three.js 0.169.0 is loaded through the same import-map/CDN pattern as the roof configurator.

## Included functionality

- Real-time Three.js roof + solar module rendering.
- Gable, hip, and shed roof types.
- Real-size residential solar module presets.
- Requested panel count and target columns.
- Quick 2×3, 3×3, 4×3, and 5×5 array layouts.
- Portrait / landscape module orientation.
- Automatic best roof plane, front, back, or both planes.
- Physical roof-fit validation; the effective system kWp uses only panels that actually fit.
- Region presets for Dobrogea, Muntenia/Oltenia, Moldova, Transylvania/Banat, and North-West/mountain areas.
- Roof azimuth, pitch, and panel orientation influence production estimates.
- 24-hour solar/load/storage simulation with a visual day/night playback.
- Consumption profiles based on estimated daily consumption from monthly bill and energy tariff.
- Optional LiFePO4 storage with automatic or manual capacity.
- Self-sufficiency, grid import/export, and battery state-of-charge metrics.
- Live system price estimate, VAT, item exclusion checklist, and CSV export.
- Single-phase / three-phase estimate option.
- Unified Tools menu: sun/orientation, dimensions, compass, camera orientation, and day simulation.
- Unified units/currency preference support inherited from the roof configurator.

## Production model

The static app uses a fast local model so all controls react immediately:

1. A regional reference specific yield is selected.
2. Annual production is corrected for roof azimuth and pitch.
3. The 24-hour curve uses sun elevation/azimuth and panel incidence to distribute the average daily production through daylight hours.
4. Household load is distributed using the selected consumption profile.
5. The battery simulation is warmed up over repeated average days before reporting the final 24-hour result, avoiding arbitrary “free” starting battery energy.

This is an estimator, not an engineering yield guarantee. It does not yet model nearby-object shading, snow cover, temperature hour-by-hour, inverter clipping, string topology, or seasonal monthly variation.

## PVGIS integration note

The European Commission PVGIS API is excellent for production calculations, but its official documentation explicitly states that AJAX/browser access is not allowed. Because this project follows the static roof-configurator deployment model, direct browser PVGIS calls would be rejected by CORS.

The app therefore ships with the local PVGIS-calibrated regional model by default. It is also ready for a server-side proxy: set `window.SOLAR_PVGIS_PROXY_ENDPOINT` before `js/app.js` loads. The endpoint should accept the PVGIS query parameters and return either the normal PVGIS JSON response or `{ "annualKWh": 6243 }`.

A GitHub Pages-only deployment will use the local model. Exact live PVGIS lookup requires a backend/serverless proxy.

## Main files

- `js/solarFactory.js` — roof-surface selection, panel fit/layout, and Three.js module geometry.
- `js/energyModel.js` — regional production, sun-incidence curve, consumption profiles, and battery simulation.
- `js/estimate.js` — component/installation estimate and CSV export.
- `js/scene.js` — Three.js scene, lighting, sun position, compass, dimensions, and camera views.
- `js/sharedShell.js` — unified shared UI shell and Tools menu integration.
- `js/ui.js` — controls, live metrics, estimate dialog, and 24-hour SVG chart.
- `js/state.js` — defaults and editable model presets.

See `RESEARCH.md` for the market/specification references used to choose the default panel dimensions, powers, production ranges, and indicative pricing.
