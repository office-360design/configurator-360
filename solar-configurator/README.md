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

This is an estimator, not an engineering yield guarantee. With Phase 3 configured, PVGIS supplies exact-coordinate annual/monthly yield and high-horizon terrain losses, while the selected-day curve still uses the configurator's real sun geometry to distribute the monthly energy through that day. Nearby mapped buildings can now also be included as an approximate local obstruction model: panel-center horizon profiles are derived from the loaded OSM footprints, real DEM elevation differences and mapped/estimated building heights, then used to reduce annual and selected-day production when the astronomical sun is blocked. Mapped trees remain visual-only. The simulation also does not model snow cover, inverter clipping/string topology, partial-string electrical mismatch, or hour-specific historical cloud events.

## PVGIS integration note

Phase 3 adds live exact-site PVGIS 5.3 calculations for an exact map location. Each active roof plane is queried separately with its own installed kWp, pitch and geographic azimuth; Front / Back / Both therefore keep their actual orientations. The twelve monthly PVGIS production values replace the regional seasonal approximation, while `printhorizon` supplies the high terrain-horizon profile used by both the selected-day energy curve and the 3D sun preview.

The European Commission PVGIS API does not permit browser AJAX access, so a static GitHub Pages page cannot call it directly. A small ready-to-deploy Netlify Function project is included under `pvgis-proxy-netlify/`. The previous Cloudflare Worker is kept under `pvgis-proxy/` only as an optional alternative. Until a proxy URL is configured, the app automatically keeps using the regional PVGIS-calibrated fallback.

Deploy the Netlify proxy, then paste its function URL into **Tools → Location & environment → PVGIS exact-site model → PVGIS proxy settings**. The URL is stored locally in the browser; it can also be supplied through `window.SOLAR_PVGIS_PROXY_ENDPOINT`.

The current PVGIS request assumes modern crystalline-silicon modules, 14% general system losses, and a ventilated/free-standing mounting model. That mounting choice matches the configurator's roof-mounted panels with an air gap better than PVGIS's fully building-integrated/no-airflow case.

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
- **Current production limitation:** Annual yield is still calibrated from the nearest regional reference unless a PVGIS proxy is configured. When mapped buildings are loaded, the optional nearby-building shading model can subtract approximate local obstruction losses from either the regional fallback or the live PVGIS baseline.


## Phase 2 geographic environment

When an exact Romanian location is active, the Tools → Location & environment panel can now load an approximate 3D neighborhood around the configurable house.

- **Terrain:** browser-loaded Terrarium elevation tiles from the Mapzen terrain dataset hosted in the AWS public dataset endpoint. The terrain is sampled into a Three.js mesh around the selected coordinate, aligned to true North, and normalized to the current local house position. A small graded pad is blended under the configured house so it does not float or clip into a sloped DEM cell.
- **Local position adjuster:** once context is loaded, the configured house can be nudged North/South/East/West in 0.5/1/2/5 m steps without reopening the map or refetching geographic data. The altitude and terrain normalization follow the adjusted house position. These offsets are intentionally local scene corrections; the astronomical sun calculation continues to use the selected map coordinate because a few metres of displacement have no meaningful effect on solar position.
- **Mapped buildings:** nearby OpenStreetMap `building=*` ways are loaded through Overpass. If an explicit `height` or `building:levels` tag exists it is used; otherwise the renderer applies a conservative approximate height by building type. A building that overlaps the configured house is detected dynamically, including after local position or roof-bearing changes. With **Replace overlapping mapped building** enabled (the default), that OSM building is reduced to a blue reference footprint and does not cast a shadow, avoiding duplicate geometry when it is probably the real house being configured. Turning the toggle off renders the mapped building normally for comparison.
- **Roads and mapped trees:** common road classes and `natural=tree` nodes are loaded from the same local Overpass query and rendered as lightweight Three.js context geometry.
- **Real visual shadows:** terrain, buildings and mapped trees participate in the existing real-date/real-time directional-light shadow simulation. Shadow-camera coverage expands automatically when local context is loaded.
- **Nearby-building production shading:** when enabled, the configurator samples a 360° obstruction horizon from every fitted panel center using OSM building footprints, the true local DEM height difference and mapped/estimated building height. Buildings that can obstruct at least one fitted panel are warm-tinted in 3D. The annual PVGIS/regional baseline is reduced by a representative-year obstruction factor, while the chosen day and hourly production curve use the same sun/building geometry. The replaced host building is excluded from this shading calculation.
- **Context controls:** 120/180/250/350 m radius, terrain/building/road/tree visibility, terrain-relief scaling, local house-position nudging, host-building replacement, reload, and a neighborhood camera view.
- **Graceful fallback:** terrain and OSM context are fetched independently. If one source fails, the other can still render. If both fail, the normal flat configurator continues to work.

### Important accuracy boundaries

The environment is deliberately **approximate**, not a cadastral or survey model. OpenStreetMap coverage varies, but when Google Solar detailed data is available the visible context now uses a hybrid model: Mapzen remains the smooth ground terrain, Google DSM corrects OSM building heights, Google building-mask components fill missing structures, and raised non-roof DSM residuals become simplified canopy/obstruction volumes. The free OSM/DEM path remains the fallback when Google analysis is not available.

Phase 3 still provides the exact-coordinate PVGIS baseline and distant terrain horizon. Google hourly shade remains the preferred detailed local-shading correction when unlocked; the hybrid 3D context is primarily a better geometric/visual interpretation of the same remotely sensed site data.

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

## Phase 3 exact-site PVGIS model

Phase 3 replaces the broad regional annual-yield approximation with live JRC PVGIS data when an exact location and proxy are available.

- Each active roof plane is sent to PVGIS separately with its own azimuth and installed kWp, then the results are summed. This keeps Front / Back / Both / Auto best physically meaningful instead of reducing a two-face roof to one averaged azimuth.
- `PVcalc` supplies the 12 monthly production values and annual energy for the actual coordinates, roof pitch, roof-plane azimuth, installed power, crystalline-silicon technology and system losses.
- `usehorizon=1` is enabled by default so PVGIS includes shading from the high terrain horizon. It can be turned off in the Tools panel for comparison.
- `printhorizon` supplies the terrain horizon profile. The configurator draws it around the real sun path, suppresses direct sunlight in the 3D preview while the astronomical sun is behind that horizon, and uses the same horizon to shape the hourly production curve.
- The selected month's PVGIS production now determines the seasonal daily-energy level; the real date/sun geometry still distributes that production across the hours of the selected day.
- If the proxy is missing or PVGIS is temporarily unavailable, the application falls back automatically to the existing regional model.

### Deploying the required proxy

PVGIS does not allow direct browser AJAX access, so GitHub Pages still needs a tiny server-side relay. The recommended implementation is now a Netlify Function project in `pvgis-proxy-netlify/`.

```bash
npm install -g netlify-cli
cd solar-configurator/pvgis-proxy-netlify
netlify login
netlify deploy            # first run: choose an existing site or create a new one
netlify deploy --prod
```

The endpoint to paste into **Tools → Location & environment → PVGIS exact-site model → PVGIS proxy settings** is:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/pvgis
```

The URL is stored in the current browser. You can alternatively set `window.SOLAR_PVGIS_PROXY_ENDPOINT` before `js/app.js` loads. For local testing, run `netlify dev` in `pvgis-proxy-netlify/` and use `http://localhost:8888/.netlify/functions/pvgis`.

The proxy is read-only, whitelists only `PVcalc` and `printhorizon`, validates coordinates, caches successful PVGIS responses at Netlify's CDN, and briefly retries rate-limit/overload responses. The old Cloudflare implementation remains in `pvgis-proxy/` as an optional alternative.

The PVGIS high-horizon model represents terrain/topographic obstruction. Nearby OSM buildings are now handled separately in the browser as an approximate local-obstruction correction on top of the PVGIS baseline. This keeps distant terrain and local structures from being conflated. Mapped trees remain visual-only because OSM tree coverage and crown geometry are too incomplete for a defensible energy correction.

## Google Solar showcase layer

The configurator can optionally add Google Maps Platform Solar API data on top of the PVGIS production baseline. This is deliberately a showcase/detailed-site mode rather than the default free path.

- **Building Insights:** validates the closest Google-recognized building and exposes imagery quality/date, roof area, roof-segment pitch/azimuth/sunshine statistics, Google panel capacity assumptions, suggested panel positions, and the closest Google panel-count configuration to the current configurator layout.
- **Data Layers hourly shade:** the Netlify proxy requests the full Data Layers context once for a geographic site/radius, downloads the twelve monthly hourly-shade GeoTIFFs, samples the actual fitted configurator panel centres, and returns only compact per-panel shade masks to the browser. PVGIS remains responsible for the long-term meteorological/yield baseline and terrain horizon.
- **Production integration:** when enabled and current, Google hourly shade replaces the inferred OSM-building obstruction correction. It does not replace PVGIS terrain-horizon shading, so local surface obstructions and distant terrain remain separate layers.
- **Civil time:** Google's hourly shade rasters use standard time without daylight-saving time. The browser converts Romanian summer time to standard time before selecting the Google hourly band.

### Public-demo security model

The Google API key is never included in GitHub Pages. All paid calls go through `pvgis-proxy-netlify/netlify/functions/google-solar.mjs`.

The demo endpoint uses several independent controls:

1. an access code stored only as a Netlify environment variable;
2. a two-hour HMAC-signed browser session stored in `sessionStorage` and bound to the requesting origin/IP;
3. an origin allow-list for the public configurator domain;
4. best-effort per-IP and global daily request counters in Netlify Blobs;
5. a Google API key restricted to the Solar API only;
6. Google Cloud daily quotas as the final billing hard-stop.

The access code is intentionally a lightweight showcase gate, not a replacement for a real user/account authentication system. For a production customer portal, replace it with normal identity/authentication and authorization.

### Google Solar caching

Caching is designed so changing roof bearing, panel count, layout, or a small local house offset does not automatically create another paid Data Layers request.

- Building Insights JSON: 7 days in Netlify Blobs.
- Data Layers temporary URL response: 45 minutes.
- Downloaded hourly-shade GeoTIFFs: up to 30 days in Netlify Blobs.
- Once all twelve shade GeoTIFFs for a site/radius are cached, later panel layouts are re-sampled from those cached rasters without calling the paid Data Layers endpoint again.
- The browser also keeps the most recent exact panel analysis for up to 30 days as a local optimization.

The GeoTIFF cache is location/radius based rather than panel-layout based, which is important for a configurator: one site acquisition can be reused for many different panel arrangements.

### Required Netlify environment variables

Set these on the same Netlify project that already hosts the PVGIS function:

```text
GOOGLE_SOLAR_API_KEY=<restricted Google Maps Platform Solar API key>
GOOGLE_SOLAR_DEMO_ACCESS_CODE=<private showcase access code>
GOOGLE_SOLAR_SESSION_SECRET=<long random signing secret>
GOOGLE_SOLAR_ALLOWED_ORIGIN=https://aks.360configurator.com
```

Optional demo limits:

```text
GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR=12
GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY=20
GOOGLE_SOLAR_MAX_ANALYSES_DAY=100
```

The public function URL is already configured in `index.html` as:

```text
https://pvgis-proxy.netlify.app/.netlify/functions/google-solar
```

No Google credential is exposed by that URL.

### Google Solar DSM / building-mask hybrid environment

After a successful Google Solar detailed analysis, the same cached Data Layers acquisition supplies a processed DSM + rooftop-mask grid. The raw DSM is **not** used as the normal visible terrain because triangulating roofs, tree canopies and ground into one surface produces jagged/melted geometry. Instead the configurator uses a hybrid interpretation:

- Mapzen Terrarium remains the smooth base ground and wider-area terrain.
- OSM building footprints stay clean, while Google DSM residual heights refine their visible height where Google rooftop coverage overlaps them.
- Google rooftop-mask components with no matching OSM footprint are rendered as simplified Google-only building volumes.
- Raised non-rooftop DSM residuals are clustered into simplified canopy/obstruction volumes instead of being rendered as terrain spikes.
- Google rooftop-mask outlines can be shown as a clean overlay; the host rooftop is blue and continues to support the configured-house replacement flow.
- A **Show raw Google DSM (debug)** toggle is available for diagnostics, but is off by default.

The DSM and mask TIFFs remain cached server-side for up to 30 days; this rendering change creates no additional Google Data Layers acquisition.

## Google Solar Step B — reference building

When Google Solar detailed analysis is available, the configurator now keeps the detected Google building as a visual reference instead of using the rooftop mask only for host replacement. The selected rooftop component is matched using the configured-house footprint plus the Building Insights building center. A translucent DSM roof/wall ghost can be shown over the configurable house, and small direction arrows mark the Building Insights roof-segment azimuths.

The Google Solar panel also reports a heuristic reference-match score, center offset, and the pitch/bearing of the largest Google roof segment. These values are comparison aids only; this step does not automatically change the configured roof. The next step can use the same Building Insights data to offer explicit “apply Google orientation/pitch” actions.

### Google host-roof isolation

When the Google rooftop mask connects the selected house to an attached garage or neighboring roof, the frontend now isolates a tighter host footprint using Building Insights bounds, roof-segment centers, reported roof ground area, configured-house overlap, and center proximity. The full connected mask remains visible as a faint context outline while only the selected host footprint is highlighted in blue. Adjacent leftover mask regions remain eligible for Google-derived building geometry instead of being discarded with the host. When this tighter Google host is available it also becomes the authoritative host reference, so an oversized overlapping OSM polygon is no longer drawn as a second blue house outline.


### Google host-footprint matching
The Data Layers mask is a rooftop/not-rooftop raster for the requested region, not a per-building polygon. Host matching now uses Building Insights building and roof-segment bounds plus segment/panel centers to isolate the target building. The displayed blue host outline follows the selected raster boundary instead of a convex hull, so concavities and irregular roof edges are preserved rather than spanning yards or attached neighboring roofs.

## Google roof reference matching

After a successful Google Solar analysis, the Location & environment panel exposes explicit reference-matching actions. Building Insights supplies the dominant roof pitch/bearing while the isolated Google rooftop mask is projected into that bearing to estimate the configured roof length/depth. The user can apply bearing, pitch, approximate footprint size, or center position independently, or apply all reference values together. These actions never happen automatically. Any geometry/position change marks precise Google hourly-shade sampling stale, so the user can re-run the cached analysis afterward to resample the updated panel coordinates.

## Google Solar Step C — recommended layout overlay

Building Insights' `solarPanelConfigs` and ranked `solarPanels` are now exposed to the browser as a comparison layer. The Google configuration selector defaults to the configuration closest to the currently fitted configurator panel count, while still allowing any returned Google panel-count configuration to be selected explicitly.

The selected Google layout is rendered in the geographic 3D scene as translucent cyan reference panels using Google's panel centers, portrait/landscape orientation, panel dimensions, and the pitch/azimuth of the corresponding Google roof segment. These panels are reference-only and never replace or move the configurator's solid dark panels.

The comparison panel shows our fitted panel count / PVGIS-based annual estimate beside Google's Building Insights DC estimate. Where Google's reference panel wattage differs from the configured module wattage, the displayed comparison also provides a simple wattage-normalized Google reference; this is intentionally labeled as a comparison rather than a replacement for the PVGIS production model.

Changing the Google reference configuration or hiding/showing the overlay is entirely local and does not trigger another Google API acquisition. The Netlify proxy now returns the full compact `solarPanelConfigs` list from the already-cached Building Insights response.


### Google layout overlay height handling
Building Insights panel positions use the elevation of the real building seen by Google. The configurable demo house can intentionally use a different wall/roof height. Reference panels now preserve Google's geographic X/Z placement and orientation, but are vertically projected just above the configured roof wherever the two footprints overlap. This prevents most of a Google layout from disappearing inside a taller configured roof while still making footprint disagreements visible.


### Google solar suitability heatmap

The detailed Google Solar demo now also consumes the annual and monthly flux GeoTIFF URLs returned by the same Data Layers response used for DSM, building mask and hourly shade. The proxy downloads and caches the annual/monthly flux TIFFs for 30 days, samples them onto the existing Google surface grid and sends a compact quantized heatmap model to the browser. The Three.js heatmap is rendered only over Google rooftop-mask cells and can switch between annual and individual-month layers without another Google request. PVGIS remains the primary production/weather model; the Google flux layer is used as a spatial suitability/reference visualization.


### Google flux heatmap presentation

The Google solar-flux heatmap now defaults to the detected host roof only. A separate **Show nearby roof suitability** toggle enables surrounding rooftops at reduced opacity for neighborhood comparison. The host roof defines the heatmap's 10th–90th percentile color scale so nearby outliers do not flatten the house-level visualization.


## UI cleanup update

- The right-hand settings drawer can be hidden/shown with the edge chevron and animates off-canvas.
- The Location & Sun tools are grouped into **Site & environment**, **Solar analysis**, and **Sun, season & orientation** accordions to keep the long Google/PVGIS controls manageable.
- The 24-hour simulation tray is more compact and can be collapsed with its chevron while keeping the current-day controls one click away.
- Google solar-flux heatmap visibility state is now propagated into the Three.js geographic layer, so the host heatmap toggle actually hides/shows the rendered heatmap.
