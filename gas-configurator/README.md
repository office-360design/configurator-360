# Gas Pipe Configurator

Early-stage route and trench configurator for natural-gas distribution connections.

The current slice is deliberately preliminary. It provides route editing, synchronized
plan/profile/section views, a public-terrain elevation profile, quantity estimates and
traceable data-quality checks. It does
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
- Ground and surface classifications are user assumptions.
- Unit rates and rule results are visibly marked as prototype inputs.
- Hydraulic and official upstream capacity calculations are intentionally deferred.

See [`docs/regulatory-notes.md`](docs/regulatory-notes.md) for the reviewed sources,
product boundaries and the recommended next rule-engine slice.

## Terrain elevation profile

The browser samples the same public Terrarium tiles already used by the Solar configurator.
The source is the [Mapzen Terrain Tiles dataset on the AWS Registry of Open Data](https://registry.opendata.aws/terrain-tiles/).
For European routes, the dataset attribution states that the terrain data was produced using
Copernicus data and information funded by the European Union (EU-DEM layers).

The sampler includes every route vertex, adds intermediate chainage samples, caches decoded
tiles, cancels stale requests after route edits and limits the number of tiles requested. If
the source cannot be loaded, the profile visibly falls back to the two editable A/B elevation
values and remains dashed so screening data is not confused with surveyed levels.

The default tile template can be replaced at build time with
`VITE_GAS_TERRAIN_TILE_URL` or at runtime with `window.GAS_TERRAIN_TILE_ENDPOINT`.
