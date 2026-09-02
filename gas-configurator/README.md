# Gas Pipe Configurator

Early-stage route and trench configurator for natural-gas distribution connections.

The current slice is deliberately preliminary. It provides route editing, synchronized
plan/profile/section views, quantity estimates and traceable data-quality checks. It does
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
- Ground and surface classifications are user assumptions.
- Unit rates and rule results are visibly marked as prototype inputs.
- Hydraulic and official upstream capacity calculations are intentionally deferred.

See [`docs/regulatory-notes.md`](docs/regulatory-notes.md) for the reviewed sources,
product boundaries and the recommended next rule-engine slice.
