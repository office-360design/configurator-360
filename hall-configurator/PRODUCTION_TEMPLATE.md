# Production hall template

Template ID: `production-flow`  
Cache release: `hall-production-1`

## Design scope

Adds the fourth template alongside Agricultural, Commercial and Storage. It uses the existing opt-in common Templates chooser, confirmation dialog, transactional application, and Undo. All changes are local to `hall-configurator`; no shared UI, other configurator, quotation backend or factory email settings are changed.

The supplied Histruct viewer did not expose readable model dimensions. The following are explicitly chosen design defaults for a generic small production hub, not a reproduction of proprietary equipment or a measured copy of the reference.

## Default layout

| Element | Configuration |
| --- | --- |
| Building | 36 m length × 18 m width; 648 m² |
| Roof / structure | 6 m eaves, 12° gable, 6 m bays; existing standard structural preview |
| Vehicle gates | Two independent 4.5 × 4.5 m sectional doors, centered on opposite end walls |
| Flow | Front material intake → rear dispatch; may be reversed |
| Personnel | One 1.1 × 2.2 m personnel door per end wall, separately positioned from the vehicle gates |
| Daylight | Four 4.6 × 1.0 m high-level window bands per long wall (8 total), at 4.1 m sill height |
| Ventilation | Four 1.6 × 0.8 m end-wall grilles |
| Roof / services | 10 skylights, 12 high-bay luminaires, slab, gutters and downpipes |
| Yard | Two 18 × 8 m paved approaches (288 m² total), four protective bollards and two loading-guide sets |
| Production equipment | Four procedural, generic enclosed machine models along one side |
| Workstations | Two assembly benches, one inspection bench and one packing bench opposite the machines |
| Staging | Two raw-material pallet zones near intake and two finished-goods zones near dispatch |
| Routes | Default 5.1 m clear central through-route, separate side pedestrian strip and two end crosswalks |
| Optional process services | Two 20 m pairs of cable-tray / compressed-air routes, with illustrative drops to workstations |
| Finish | Light-grey walls, graphite roof, teal gates/equipment |

Ground-level gates and aprons are not dock levellers. The preview does not certify truck swept paths, machine servicing space, pedestrian segregation, slab loads, electrical/air sizing, extraction, ventilation or fire/escape compliance. Active comfort HVAC and sprinklers are not preselected; the existing options remain available. The machinery is a generic layout placeholder, not a manufacturing simulation or equipment specification.

## Editable production controls

The new **Production workflow** section enables/disables the floor plan, reverses material flow, requests 2–6 work cells and independently toggles equipment/workstations, staging, floor markings/signs and overhead service routes.

The algorithm reserves end staging/approach areas and leaves the central aisle clear. At the default 36 m length, four work cells fit; selecting six does not squeeze them into the same area. An explanatory notice shows when requested cells exceed capacity, dimensions are too small, an end gate is missing, or edited openings suppress conflicting equipment. Larger halls can accommodate up to six cells. Minimum production-plan dimensions are 16 m width, 24 m length and 4 m eaves.

Gate signs follow the largest floor-level garage door on each end. Flow reversal swaps their roles, pallet types, workstation ordering and floor-arrow direction. Floor-level opening approach rectangles omit conflicting equipment instead of silently blocking a moved door. The two sectional gates keep their existing separate open/closed controls.

Production furniture is mutually exclusive with the existing warehouse rack/aisle overlays and retail display furniture. Those controls are disabled while the production plan is active. Disabling it restores access to the other controls. Changing templates resets every production field to its inactive defaults, preventing leftover equipment in the agricultural/commercial/storage halls.

Hide **Cladding** in **Model display** to inspect the interior. The existing display/section/exploded-view features remain available. Production service routes also appear as a distinct option in the services visibility selector. The production camera starts from the material-intake end and fits both aprons, including portrait aspect ratios.

## State and quantities

New fields are defined in `PRODUCTION_DEFAULTS`, normalized on rebuild/restore, and carried by the existing save/share state. Older snapshots default to no active production plan. Input state is not mutated by template construction.

The BOM includes machine, bench and staging-zone counts and the paired main-service-route length, all explicitly labeled as preview-only and **excluded from the estimate**. Each listed service-route metre represents a cable-tray/air-main pair; branch drops are not a priced quantity. No machinery rates, operating throughput or engineered system capacities are invented. Existing hall, opening, apron and bollard allowances are unchanged. Factory recipient `info@mobila-lemn.ro` is untouched.

## Validation

Run from repository root:

```sh
node hall-configurator/tools/validate-i18n.mjs
node hall-configurator/tools/validate-agricultural-template.mjs
node hall-configurator/tools/validate-commercial-template.mjs
node hall-configurator/tools/validate-storage-template.mjs
node hall-configurator/tools/validate-production-template.mjs
node --no-warnings --experimental-loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-commercial-geometry.mjs
node --no-warnings --experimental-loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-storage-geometry.mjs
node --no-warnings --experimental-loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-production-geometry.mjs
```

Tests cover four-template preservation, independent state, normalization/JSON round-trip, 16 wall apertures, equipment bounds, machinery/staging spacing, opening approaches, reversed flow, capacity limits, minimum/maximum sizes, both gates' independent motion, full front-to-rear clearance rays, preview-only BOM rows, unchanged equipment pricing, and desktop/portrait camera fits. Tests use the repository's bundled Three r160 adapter; production still imports the existing Three r169 CDN runtime.

A local Chromium WebGL render was obtained with the same model/scene code using that r160 adapter. Account/share services, the external scenery loader, shell plumbing and CSS2D labels were substituted in the offline test; geometry, WebGL rendering, state, UI, template menu, preview dialog and Undo logic were exercised. Browser checks covered apply/cancel, reversing flow, toggles, cell-capacity messages, gate state, template switching, legacy restoration, Undo and a 390 px Romanian dialog. Continuous rendering was paused between explicit test frames on the software GPU.

`assets/templates/production-hall.png` is a crop of that local WebGL cutaway render. Cladding and roof framing are hidden for interior visibility in the image; the template itself loads with the complete building visible. No external machinery meshes or reference images were incorporated. These checks do not verify live account services, engineering compliance or pixel-identical rendering on the deployed runtime. No new fix for the previously reported rear-wall shadow artifacts is claimed.
