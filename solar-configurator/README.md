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
3. The 24-hour curve uses the exact selected date/location, calculated sun elevation/azimuth, each active roof plane, and panel incidence to distribute production through the real daylight window.
4. Household load is distributed using the selected consumption profile.
5. The battery simulation is warmed up over repeated average days before reporting the final 24-hour result, avoiding arbitrary “free” starting battery energy.

This is an estimator, not an engineering yield guarantee. Phase 2 now renders local terrain and mapped nearby objects for visual context/shadows, but those local visual shadows are not yet converted into kWh losses. The production calculation still does not model monthly weather/cloud statistics, snow cover, temperature hour-by-hour, inverter clipping, string topology, or exact local obstruction losses.

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

## Phase 1 geographic sun simulation

The configurator now supports an exact Romanian installation location, real calendar dates, season presets, geographic roof bearing, sunrise/sunset, a visible daily sun path, and real-time Three.js shadows driven by calculated solar altitude and azimuth.

- **Location picker:** OpenStreetMap tiles through Leaflet, with explicit address search through Nominatim. The Phase 1 picker is intentionally bounded to Romania because the current production model and civil-time calculations use `Europe/Bucharest`.
- **Date / seasons:** Any date can be selected. Spring, summer, autumn and winter presets use the equinox/solstice reference dates in the selected year.
- **Daily energy curve:** Hourly panel incidence uses the real solar position for the selected coordinates/date and each selected roof plane. A geometry-based seasonal factor redistributes the annual regional yield across the selected day.
- **Shadows:** The visible Three.js sun and directional light follow the calculated sun vector. Real night is automatic when the sun is below the horizon; `Force night preview` remains available as a visual override.
- **Current production limitation:** Annual yield is still calibrated from the nearest regional reference unless a PVGIS proxy is configured. The Phase 2 scene context is visual/interactive and does not yet subtract local obstacle shading from the kWh estimate.


## Phase 2 geographic environment

When an exact Romanian location is active, the Tools → Location & environment panel can now load an approximate 3D neighborhood around the configurable house.

- **Terrain:** browser-loaded Terrarium elevation tiles from the Mapzen terrain dataset hosted in the AWS public dataset endpoint. The terrain is sampled into a Three.js mesh around the selected coordinate, aligned to true North, and normalized to the current local house position. A small graded pad is blended under the configured house so it does not float or clip into a sloped DEM cell.
- **Local position adjuster:** once context is loaded, the configured house can be nudged North/South/East/West in 0.5/1/2/5 m steps without reopening the map or refetching geographic data. The altitude and terrain normalization follow the adjusted house position. These offsets are intentionally local scene corrections; the astronomical sun calculation continues to use the selected map coordinate because a few metres of displacement have no meaningful effect on solar position.
- **Mapped buildings:** nearby OpenStreetMap `building=*` ways are loaded through Overpass. If an explicit `height` or `building:levels` tag exists it is used; otherwise the renderer applies a conservative approximate height by building type. A building that overlaps the configured house is detected dynamically, including after local position or roof-bearing changes. With **Replace overlapping mapped building** enabled (the default), that OSM building is reduced to a blue reference footprint and does not cast a shadow, avoiding duplicate geometry when it is probably the real house being configured. Turning the toggle off renders the mapped building normally for comparison.
- **Roads and mapped trees:** common road classes and `natural=tree` nodes are loaded from the same local Overpass query and rendered as lightweight Three.js context geometry.
- **Real visual shadows:** terrain, buildings and mapped trees participate in the existing real-date/real-time directional-light shadow simulation. Shadow-camera coverage expands automatically when local context is loaded.
- **Context controls:** 120/180/250/350 m radius, terrain/building/road/tree visibility, terrain-relief scaling, local house-position nudging, host-building replacement, reload, and a neighborhood camera view.
- **Graceful fallback:** terrain and OSM context are fetched independently. If one source fails, the other can still render. If both fail, the normal flat configurator continues to work.

### Important accuracy boundaries

The environment is deliberately **approximate**, not a cadastral or survey model. OpenStreetMap coverage varies, many buildings do not have measured heights, mapped trees are incomplete, and the terrain source is an elevation model rather than a high-resolution building/tree DSM. Phase 2 shadows are therefore useful for orientation and visual inspection, not yet for bankable shading-loss calculations.

Phase 3 remains the place to connect exact-coordinate PVGIS/horizon data to the production model so distant terrain/horizon losses affect calculated kWh. A later optional DSM/shade-data integration can add higher-resolution local obstruction losses.

### Optional endpoint overrides

Static deployments can switch data providers without changing the renderer:

```html
<script>
  window.SOLAR_TERRAIN_TILE_ENDPOINT = 'https://example.com/terrarium/{z}/{x}/{y}.png';
  window.SOLAR_OVERPASS_ENDPOINTS = [
    'https://example.com/overpass/interpreter'
  ];
</script>
```

Keep any replacement provider's licensing, attribution, caching and usage requirements in mind.
