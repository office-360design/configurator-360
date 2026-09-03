# Gas Pipe Configurator

Early-stage route and trench configurator for natural-gas distribution connections.

The current slice is deliberately preliminary. It provides route editing, synchronized
plan/profile/section views, a public-terrain elevation profile, quantity estimates and
traceable data-quality checks, plus a narrow versioned regulatory screening pack. It does
not replace the OSD connection solution, the ATR, a technical design, permits, survey or
geotechnical investigation.

## Local development

```bash
npm install
npm run dev
```

The Vite server must be started from this folder. It is configured to allow imports from
the repository-level `shared-ui` package.

## Current prototype boundaries

- Underground PE distribution connection/extension scenarios only.
- Manual A/B points and optional waypoints.
- Terrain elevations are sampled automatically along the route from Mapzen Terrain Tiles;
  they are public screening data rather than surveyed design levels.
- Both horizontal plan length and terrain-adjusted 3D length are shown. The 3D value is a
  screening estimate derived from the sampled public elevations, not a surveyed pipe length.
- Ground and surface classifications are user assumptions.
- Article 75 minimum cover and Article 82 geometry for one manually declared utility
  crossing are evaluated as preliminary checks with exact rule IDs and source links.
- Unit rates and rule results are visibly marked as prototype inputs or screening outputs.
- Hydraulic and official upstream capacity calculations are intentionally deferred.

See [`docs/regulatory-notes.md`](docs/regulatory-notes.md) for the reviewed sources,
product boundaries, implemented rules and remaining review requirements.

## Regulatory screening pack

The first rule pack is `RO-NTPEE-PE-PUBLIC-DOMAIN@2023-01-26.prototype-1`. Its scope is
limited to underground PE gas-distribution pipe in Romania's public domain at no more
than 6 bar. It currently evaluates:

- minimum 0.90 m cover from the pipe's upper generatrix under NTPEE Article 75;
- documented approval from the owner of the crossed utility under Article 82;
- a normally perpendicular crossing under Article 82, with an exceptional minimum angle
  of 60 degrees;
- the normal requirement for the gas pipe to be at least 0.20 m above the crossed utility,
  with a declared protective sleeve treated as an exception requiring review.

Reduced cover is never automatically passed: when both OSD agreement and additional
protection are declared it remains a warning requiring documented authorized review.
Likewise, no crossing or approval is inferred from the basemap; the user must declare
them, and utility-owner plans/field verification remain separate evidence checks.

## Terrain elevation profile

The browser samples the same public Terrarium tiles already used by the Solar configurator.
The source is the [Mapzen Terrain Tiles dataset on the AWS Registry of Open Data](https://registry.opendata.aws/terrain-tiles/).
For European routes, the dataset attribution states that the terrain data was produced using
Copernicus data and information funded by the European Union (EU-DEM layers).

The sampler includes every route vertex, adds intermediate chainage samples, caches decoded
tiles, cancels stale requests after route edits and limits the number of tiles requested. If
the source cannot be loaded, the profile visibly falls back to the two editable A/B elevation
values and remains dashed so screening data is not confused with surveyed levels.

Once a matching terrain profile is available, the configurator sums each profile interval as
`sqrt(horizontal distance² + elevation change²)` and displays that terrain-adjusted 3D length
beside the horizontal plan length. Quantity and cost calculations continue to use plan length;
changing their basis should be an explicit engineering and commercial decision rather than an
implicit consequence of public elevation data.

The default tile template can be replaced at build time with
`VITE_GAS_TERRAIN_TILE_URL` or at runtime with `window.GAS_TERRAIN_TILE_ENDPOINT`.
