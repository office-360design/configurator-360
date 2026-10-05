# Solar configurator research basis

Last reviewed: 2026-08-07.

These references are used to set representative defaults, not to claim a single market-wide specification or guaranteed production/price.

## Residential module size and power

There is no single universal residential panel dimension. Current high-power home modules cluster around roughly 1.7–1.8 m × 1.1–1.2 m.

- AIKO Neostar 3S54 (2026 datasheet): 460–475 W, up to 23.8% module efficiency, 1762 × 1134 × 30 mm. This is the primary physical footprint used by the configurator.
  - https://aikosolar.com/wp-content/uploads/2026/04/Neostar-3S54_193-AIKO-A-MCE54Mb_460-475W-1762%C3%971134%C3%9730_202601_V1.1_ES.pdf
- AIKO’s current residential range also includes 480–495 W Neostar 3S54 modules, supporting a high-efficiency preset in the same general roof-use class.
  - https://aikosolar.com/en/products/
- Jinko Tiger Neo 54-cell-class residential module: 1762 × 1134 × 30 mm in the manufacturer datasheet.
  - https://www.jinkosolar.com/uploads/JKM420-440N-54HL4R-B-F1.3-EN.pdf
- REC Alpha Pure-RX illustrates that another premium residential format is wider: 450–470 W, 1728 × 1205 × 30 mm, 2.08 m².
  - https://www.recgroup.com/sites/default/files/2024-06/ds_rec_alpha_pure-rx_series_iec_eng_web.pdf

Default geometry therefore uses 1.762 × 1.134 m, while the code keeps dimensions inside module presets so additional manufacturer-specific footprints can be added without changing the layout engine.

## Production / Romanian calibration

- E.ON Solar Home currently publishes approximate annual production of 3,780 kWh for 3.3 kW, 6,300 kWh for 5.5 kW, and 7,560 kWh for 6.5 kW. E.ON states these calculations are based on European Commission PVGIS for Iași with an 80% performance factor including losses such as shading, temperature, and conversion.
  - https://www.eon.ro/panouri-fotovoltaice-clienti-casnici
- PPC currently lists a 5 kWp residential package with estimated annual production of 6,243 kWh.
  - https://www.ppcenergy.ro/prosumatori/clienti-rezidentiali/panouri-fotovoltaice/
- PVGIS itself supports installed peak power, system losses, slope and azimuth for grid-connected PV calculations.
  - https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en

The configurator’s regional specific-yield defaults are intentionally approximate and are then corrected by azimuth and tilt. They can later be replaced by exact coordinates + server-side PVGIS calls.

## Price calibration

Current Romanian listings show substantial variation between bare modules, kits, and turnkey systems, so the app prices components separately and exposes the main allowances under “Advanced estimate assumptions”.

- Leroy Merlin currently lists 455 W / 460 W residential modules around 419–459 RON, with a 450 W DAH Solar listing at 498.24 RON. A ~500 RON default per module is therefore a conservative editable retail allowance.
  - https://www.leroymerlin.ro/produse/electrice/sisteme-panouri-fotovoltaice/panouri-fotovoltaice/
- PPC currently lists a 5 kWp monophase turnkey package at 25,520 RON final price for an inclined roof and 6,243 kWh/year estimated production. This is a useful order-of-magnitude check for the complete-system estimate.
  - https://www.ppcenergy.ro/prosumatori/clienti-rezidentiali/panouri-fotovoltaice/
- E.ON’s current packages provide another market cross-check and include installation, project work, commissioning, and prosumer documentation in a turnkey offer.
  - https://www.eon.ro/panouri-fotovoltaice-clienti-casnici

The default estimate is illustrative only. Roof complexity, cable routes, protections, structural work, inverter brand, optimizers, scaffolding, grid upgrades, prosumer paperwork, battery brand, and commercial discounts can materially change the final quotation.

## Important PVGIS browser limitation

The JRC PVGIS API documentation states that access via AJAX is not allowed and requests from browser front ends are rejected by its CORS policy. For this reason the configurator does not make a browser-direct PVGIS request. It uses the local model immediately and sends exact calculations through the same-origin `/api/solar/pvgis` route on the Google Cloud Run Solar backend. The legacy Netlify function remains only as a rollback option.


## Phase 2 geographic context sources

- **Terrain Tiles / AWS Open Data:** the Mapzen Terrain Tiles dataset is published as a global bare-earth elevation dataset on the AWS Registry of Open Data. The configurator uses the public Terrarium PNG representation and decodes elevation with the standard Terrarium formula.
- **OpenStreetMap / Overpass:** nearby `building=*` ways, common road classes and mapped `natural=tree` nodes are queried through Overpass. The public Overpass HTTP interface supports CORS for browser clients.
- **Approximation boundary:** OSM building heights are used when `height` or `building:levels` is present; otherwise the renderer estimates a simple height by building type. Mapped trees are incomplete and default heights are approximate.
- **No imagery scraping:** the 3D scene does not download OpenStreetMap raster tiles as a ground texture. OSM standard tiles remain limited to the interactive Leaflet location picker, with visible attribution, while the 3D context uses vector features from Overpass.

## Phase 3 — live PVGIS site calculations

Current implementation uses the stable PVGIS 5.3 API rather than the PVGIS 6 testing/beta service.

Official JRC documentation used for the integration:
- PVGIS 5.3 API entry point, inputs, CORS restriction and rate limits: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en
- Grid-connected PV output definitions: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/pvgis-5-tools/grid-connected-pv_en
- Horizon profile tool: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/pvgis-5-tools/horizon-profile_en
- PVGIS 6 status / testing service: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en

PVGIS fixed-system aspect uses 0°=South, -90°=East and +90°=West. The configurator internally uses compass bearings 0°=North, 90°=East, 180°=South, 270°=West and converts between those conventions before each surface request.

PVGIS offers `free` and `building` mounting positions. The configurator currently uses `free`: the rendered residential modules sit above the roof plane with an air gap, which is closer to the documented ventilated rack case than to fully building-integrated modules with no airflow. The general system-loss input remains the PVGIS default reference value of 14%.

## Google Solar detailed-site layer

The optional showcase layer uses two Google Maps Platform Solar API surfaces:

- **Building Insights** to obtain Google's interpreted closest-building solar potential, including roof-segment geometry/sunniness and candidate panel/configuration information.
- **Data Layers** to obtain high-resolution spatial layers. The current implementation specifically consumes all twelve monthly hourly-shade GeoTIFFs and samples the fitted configurator panel centres.

Google's hourly-shade TIFF format contains 24 hourly bands per month and uses one bit per day. It uses the requested location's regional timezone but deliberately ignores daylight-saving time and leap days, so the configurator converts Romania DST to standard time before reading a band.

The downloaded GeoTIFFs are cached server-side for no more than 30 days. The short-lived Data Layers response URLs are not exposed to the browser; the Netlify function authenticates and downloads them server-side, then returns only compact per-panel masks.

PVGIS remains the baseline yield/weather model. Google hourly shade is treated as a local visibility/obstruction correction and therefore does not replace the PVGIS high terrain horizon.
