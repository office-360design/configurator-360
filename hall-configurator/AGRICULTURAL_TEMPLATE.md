# Agricultural hall template

## Scope and design basis

`Templates > Agricultural hall` opens a preview before replacing the current hall.
The replacement is recorded in the existing Undo history. All dimensions, openings,
finishes and services remain editable and use the normal capture/restore/share state.

This is an original daylight-focused starting layout for farm machinery and general
agricultural storage. The supplied private Histruct link did not expose a readable
model in the development environment, so these are explicit design defaults, not
measurements or engineering specifications extracted from that reference.

| Setting | Default |
| --- | --- |
| Length / width | 30 m / 18 m |
| Eave height / roof pitch | 5.5 m / 16 degrees |
| Portal bay spacing | 6 m |
| Daylight windows | Ten 4.8 x 1.1 m bands, five per long wall, 4.0 m sill height |
| Machinery doors | Two 5.0 x 4.5 m roller doors, one on each gable |
| Personnel doors | Two 1.1 x 2.2 m doors, separate from machinery access |
| Ventilation grilles | Four 1.6 x 0.8 m louvred grilles on the gable walls |
| Roof / lighting | Eight skylights; ten high-bay LED fixtures |
| Other inclusions | Slab, secondary steel, gutters and downpipes |
| Finishes | Light-grey wall panels; green roof and machinery doors |
| Active climate / racking | Off |

The preview includes a concept-only disclaimer. Structural sizing, bracing, machinery
clearances, fire protection and ventilation capacity require project-specific
verification. Primary portals and wind bracing are not automatically redesigned
around arbitrary user openings. Secondary opening framing is indicative, not a
structural design. The new grille price is an illustrative rate in `pricing.js`, not
a supplier quotation or an airflow rating.

## Implementation

- `js/templates.js`: catalog and pure fresh-state factory. Future template variants
  should have their own IDs and copy keys; never mutate the shared defaults.
- `js/templateDialog.js`: hall-local preview, replacement confirmation and error UI.
- `js/openings.js`: ventilation grille type and standard/daylight-band window styles.
  Sill height is editable in the existing opening editor.
- `js/panelGeometry.js`: watertight wall/roof panels with rectangular apertures,
  including floor-reaching and temporarily overlapping openings. Seams, roof ribs
  and secondary members are interrupted at openings instead of crossing the void.
- `js/state.js`: shared skylight layout for the roof holes and glazing.
- BOM and indicative pricing include the new opening type and secondary frames.
- The old `buildingUse` select and automatic climate presets are removed. Legacy
  snapshots retain their explicit climate/services settings but discard that field.
- The shared optional Templates component is reused unchanged. No other configurator,
  shared UI file, bookshelf feature or email endpoint is modified by this update.

The preview PNG is an original software render from the actual generated template
mesh geometry. It is not a screenshot of the live WebGL lighting or of Histruct.

## Validation

From the repository root:

```sh
node hall-configurator/tools/validate-i18n.mjs
node hall-configurator/tools/validate-agricultural-template.mjs
```

JavaScript syntax checks, EN/RO/DE localization, dimensions, opening clearances,
independent state copies and JSON round-trips passed. Additional offline tests
verified rays through all 18 wall apertures and 8 roof apertures, panel winding,
finite geometry at different hall sizes, and template/app/editor interactions.

Offline Chromium tests exercised the actual app, UI, template dialog, shared
Templates component and Undo history. They covered apply/cancel, error rollback,
snapshot restoration, subtype/sill editing, localization and mobile dialog bounds.
The WebGL renderer and live account/share services were mocked; mesh tests used the
repository's vendored Three r160. Production still uses its existing Three r169
imports. Live GPU rendering was unavailable, so these tests do not verify the final
rear-wall shadow appearance or live account/share-network integration.

Rear-wall shadow handling now uses explicit front-surface shadow casting for the
thin wall/roof skins and footprint-scaled depth/normal bias. Verify the result in
both day/night modes and from front/rear/oblique camera angles after deployment.

Cache tag: `hall-agri-1`.
