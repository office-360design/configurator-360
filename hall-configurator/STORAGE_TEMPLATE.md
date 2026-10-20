# Storage hall template

Cache version: `hall-storage-1`  
Template ID: `storage-loading`

## Scope

Adds a third, editable template alongside Agricultural hall and Commercial hall. It uses the existing optional common Templates menu and the hall's preview, confirmation, rollback and Undo flow. No shared UI, other configurators, deployment workflows or email-backend files are changed.

The supplied Histruct viewer did not expose readable model data in the working environment. These are explicit design defaults based on the requested loading-door-focused storage concept, not measurements or assets extracted from that reference.

## Default configuration

| Item | Default |
| --- | --- |
| Footprint | 48 m length × 24 m width (1,152 m²) |
| Height / roof | 6.5 m eaves; 10° symmetrical gable roof |
| Frame layout | 6 m bays; both end bays remain clear of side loading openings for existing bracing |
| Loading doors | Six 4 × 4.5 m sectional doors on the right-hand long wall, centred at −15, −9, −3, 3, 9 and 15 m |
| End access | One 5 × 4.8 m roller door centred on each gable, plus a separate 1.1 × 2.2 m personnel door on each gable |
| Daylight | Six 4.6 × 0.9 m high-level window bands on the opposite long wall; sill 5.05 m |
| Ventilation | Four 1.6 × 0.8 m gable grilles |
| Roof / services | Twelve roof skylights; 21 high-bay luminaires; slab, gutters and downpipes |
| Loading yard | 48 × 12 m apron (576 m²), six bay-number boards, six marking sets and twelve protective bollards |
| Internal planning | Six illustrative rack blocks; loading-side staging strip, central through-aisle and cross-aisles |
| Finish | Light-grey wall panels, graphite roof, slate-blue loading doors |

All eight garage doors are ground-level openings. The template does **not** include raised docks, dock shelters or dock levellers. The 12 m apron is a visual starting depth, not a verified manoeuvring or parking envelope for articulated vehicles. Racking is an inspection/planning preview, not supplied equipment in the estimate. No active HVAC or sprinkler package is enabled by this template; those existing options remain available. Fire protection, escape routes, ventilation and light levels are not certified by the preview.

## Editable controls

The garage-door editor now offers **Roller shutter** and **Sectional loading door**. Existing garage doors continue to render as roller shutters. Sectional doors have independent open/closed previews: the segmented leaf is placed horizontally on tracks inside the building when open. A 0.50 m headroom allowance is reserved during dimension normalization. Opening cutouts, selection, movement and resizing continue to use the existing double-click component workflow.

The new **Loading & logistics** section contains apron, bay-marking, bollard and number-board toggles, apron depth from 6–24 m, and the planning-layout selector. Numbers follow the floor-level sectional doors in wall/position order. Exterior accessories are regenerated after moving, resizing, deleting or changing the style of a door. Markings require the apron. Inadequate end/adjacent-opening clearance suppresses the affected markings/bollards; number boards are omitted without sufficient headroom. Raised sectional doors do not receive floor-level loading accessories. The UI explains suppressed items.

Rack blocks are available from 16 × 20 m. Racking and aisle visibility remain controlled under **Model display**. The loading plan leaves end cross-aisles, a central through route, and a 6 m staging strip on each long wall containing sectional loading doors. Edited low side openings remove conflicting rack blocks; this does not replace a full warehouse-layout or vehicle-sweep assessment.

Decorative trees are omitted where their bounding clearance would intersect an enabled apron or the immediate storage garage-door approach. The loading camera fits the complete hall and apron on desktop and portrait screens; its distance limit and fog range accommodate this larger model.

## State, pricing and compatibility

- `LOGISTICS_DEFAULTS` supplies opt-in booleans, 12 m default apron depth and the standard planning layout for older snapshots.
- New state fields and per-door subtype/open flags use the existing capture/restore and share payload. No new backend is needed.
- All three templates explicitly reset commercial and loading-specific features before setting their own values. No storefront/yard features leak between templates.
- The components list and estimate derive accessory quantities from the same eligible layout as the model. Sectional doors are not also priced as roller doors.
- Illustrative allowances: sectional door EUR 430/m² + EUR 850; apron EUR 68/m²; bollard EUR 185; marking set EUR 140; number board EUR 75. Existing engineering/installation percentage handling is retained. These are demo figures, not supplier quotations or load/cost calculations. Racking, dock levellers and site-specific civil works are excluded.
- Text is provided in English, Romanian and German.

## Validation

Run from the repository root:

```sh
node hall-configurator/tools/validate-i18n.mjs
node hall-configurator/tools/validate-agricultural-template.mjs
node hall-configurator/tools/validate-commercial-template.mjs
node hall-configurator/tools/validate-storage-template.mjs
node --no-warnings --experimental-loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-commercial-geometry.mjs
node --no-warnings --experimental-loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-storage-geometry.mjs
```

Geometry tests use the repository's bundled Three r160 adapter; production retains its existing pinned Three r169 CDN import. They cover real wall apertures, sectional open/closed geometry, clear loading routes through framing, fittings on the exterior wall side, apron-marking surface alignment, finite geometry, BOM quantities and desktop/mobile camera bounds. They do not certify engineering clearance.

In-memory Chromium tests were also run against the actual app, UI, template-dialog and geometry modules, with rendering, tenant/share services and shell/history integration stubbed. They covered the three-card catalogue and thumbnail, preview/cancel/apply, yard controls, independent door opening, style changes, cross-template resets, Undo, saved-state and legacy restoration, injected build-failure rollback, Romanian text and the 390 px modal layout.

Full WebGL rendering and live account/share services were unavailable. `assets/templates/storage-hall.png` is a software-rendered preview of the generated geometry, not a live-render screenshot. Final lighting/glass appearance, including the pre-existing rear-wall banding, still requires deployed visual review.
