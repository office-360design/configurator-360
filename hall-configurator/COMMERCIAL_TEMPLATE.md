# Commercial hall template

Cache revision: `hall-commercial-1`.

## Design defaults

The hall template catalog now includes **Commercial hall** alongside the existing
**Agricultural hall**. Both retain preview/confirmation, editable parameters and Undo.
The commercial concept uses a simple gable roof and a public shopfront rather than
warehouse frontage. These are chosen design defaults, not dimensions extracted from
the private Histruct inspiration model, which was not readable during implementation.

| Element | Default |
| --- | --- |
| Frontage × depth | 24 × 18 m (432 m²) |
| Eave height / roof pitch | 4.5 m / 8° gable |
| Bay spacing | 6 m; 4 portal frames |
| Front display windows | Four shopfronts, each 4.15 × 2.8 m, sill 0.15 m |
| Side display windows | Two per long wall, each 4.8 × 2.8 m, sill 0.15 m |
| Main customer entrance | 3.6 × 2.95 m sliding glazed assembly with fixed sidelights |
| Rear access | 1.8 × 2.5 m double-glazed entrance, 3.2 × 3.2 m delivery door and 1.1 × 2.2 m staff door |
| Entrance canopy | 8 × 1.8 m, positioned above the main entrance |
| Signage | Editable SHOWROOM text and accent colour on a front fascia |
| Front approach | 3 m deep paved approach, 72 m² |
| Conceptual retail fit-out | Four low display islands and one checkout counter |
| Services | Comfort heating/cooling, 8 linear LED fixtures, slab and gutters |
| Finishes | Light-grey walls, graphite roof, warm terracotta accent |

The template has 12 wall openings. The glazing and entrance assemblies use actual
wall apertures. The rear bay remains opaque for service access; wall bracing is
assigned to the rear service bay in this concept. Roof bracing remains present.
External climate units are placed beside that rear bay instead of beside the
customer-facing windows. No warehouse racks or forklift-area overlay is enabled.

## Editing

- **Openings:** add a glazed entrance, then double-click it to select the sliding
  or double-hinged subtype. The open/closed preview is editable. Windows now also
  support a Shopfront subtype. Existing door/window/grille choices remain.
- **Shopfront & retail:** enable/disable canopy, fascia sign, front approach and
  low displays; edit sign text/colour and the conceptual wall-bracing layout.
- **Building services:** choose linear retail or high-bay lighting and the climate
  equipment placement. These remain explicit service options; Hall use stays removed.
- Canopies and signs are suppressed, with a warning, if altered dimensions/opening
  heights leave insufficient space. Their suppressed geometry is not priced or
  counted in the BOM. Display islands require at least 10 × 12 m.
- The customer camera preset frames the front facade, canopy and forecourt. Standard
  views, component double-click selection, placement and resize controls are retained.

New fields survive snapshot capture/restore and the existing share/save path. Older
snapshots default to no retail additions, high-bay lighting, conventional side-unit
placement and the existing end-bay wall-bracing layout. Switching to Agricultural
hall clears commercial additions so they cannot leak into that template.

## Files and scope

`commercial.js` centralizes optional-state defaults, normalization and layout used by
geometry, quantities and pricing. `retailGeometry.js` provides procedural shopfront,
entrance, lighting and retail-detail geometry. The remaining modifications wire these
options into the existing hall UI, template catalog, state, BOM and price estimate.

All changes are hall-local. Shared UI, other configurators, bookshelf code and email
backend files are not modified. No third-party model meshes or fonts are included.
The preview PNG is a software projection of the generated Three.js model, not a
production WebGL screenshot; lighting, shadows and glass appearance can differ.

## Engineering and pricing limitations

This is an editable visualization concept, not an engineered retail-building design.
Structural sizing and bracing, glazing specification, entrance clear width, accessible
routes, fire/egress requirements and heating/cooling capacity require project-specific
professional verification. Canopy support details, retail fixtures and services are
conceptual. Glazed-door motion is a visual open/closed state, not automatic-door control.
New price rates are explicitly illustrative allowances, not supplier quotations.
No claim is made that the previously reported rear-wall shadow banding is resolved.

## Validation

Run from repository root:

```sh
node hall-configurator/tools/validate-i18n.mjs
node hall-configurator/tools/validate-agricultural-template.mjs
node hall-configurator/tools/validate-commercial-template.mjs
node --no-warnings --loader ./hall-configurator/tools/three-test-loader.mjs hall-configurator/tools/validate-commercial-geometry.mjs
```

The geometry loader uses the repository's existing vendored Three.js r160 for offline
numerical tests; production keeps the existing r169 import map. Tests check valid wall
apertures, closed/open passages for both entrance subtypes, facade clearances, finite
mesh bounds, quantities and customer-camera fit at desktop and portrait aspect ratios.
Template tests cover independent state, dimensions, services, localization, JSON
round-trip, legacy defaults and switching back to the agricultural template.

Additional sandbox browser checks exercised the real app/UI with scene, tenant and
share-service adapters mocked: catalog cards, preview/cancel/apply, subtype/open state,
sign options, Undo, older-state restore, forced-error rollback, EN/RO/DE and a 390 px
mobile dialog. No live cloud endpoints were called. The full WebGL renderer was not
available in the sandbox, so deployed visual review is still required.
