# Sheet cutting planner

Open **Sheet cutting plan** next to **BOM & price**. Choose 350 mm profile,
365 mm profile, or edit the dimensions to create a custom profile. Generate the
plan after changing settings using the fixed **Update plan** button above the
workspace. The previous report stays visible with an update notice; CSV, SVG
and print exports remain disabled until regeneration succeeds. Invalid settings
show an error without removing the previous report. Each connected coplanar slope gets a letter in
an overview, an unfolded diagram, and a grouped length/order table. CSV exports
individual pieces and totals; each diagram downloads as SVG; Print / PDF uses
the browser print dialog. Settings are included in the roof's captured state.

## Reference data

Source: user-supplied catalogue photographs (350 mm module on page 3 and
365 mm module on page 4). The supplied `PanotajDamilaClickS 6 ape.pdf` is the visual reference,
not the source for either profile's dimensions.

| Parameter | 350 mm profile | 365 mm profile |
| --- | ---: | ---: |
| Total width, mm | 1130 | 1170 |
| Usable width, mm | 1000 | 1080 |
| Module length, mm | 350 | 365 |
| End allowance, mm | 100 | 125 |
| Minimum / maximum modules | 3 / 22 | 3 / 22 |
| Maximum stock length, mm | 7800 | 8150 |
| Weight, kg/m² | 5.9 | 4.9 |
| Minimum pitch, degrees | 20 | 14 |

The 365 mm profile's table says 1100 mm usable width; its marked diagram says 1080 mm. The
preset uses 1080, exposes the discrepancy, and allows an override. End allowance
is inferred from the minimum length: 1150 - 3×350 = 100 mm and
1220 - 3×365 = 125 mm. It is an editable planning assumption, not a verified
installation lap specification. The 365 mm profile's 22 modules would produce 8155 mm,
so its printed 8150 mm maximum limits the default to 21 modules.

## Geometry and quantities

- Uses the current drawn roof or the same preset-to-layout conversion as the
  editor. Custom uploaded images have no measurable geometry and are rejected.
- Groups edge-connected coplanar triangles; flattens them using an orthonormal
  basis on the actual slope. Vertical step walls are excluded. Roof overhangs
  are already included in roof geometry, so are not added a second time.
- Strips advance by usable width from the selected side and offset. Sheets run
  uphill; all columns share one module grid. A flat slope uses the plan Z axis
  and displays a warning. Slopes below the preset minimum display a warning.
- Clipping triangles against each strip finds covered intervals. Full-width
  gaps separate runs; partial-width holes are cut-outs in a sheet. Module
  rounding can merge small gaps. Long runs split into allowed module counts,
  respecting minimum size and maximum physical length.
- Length = modules × module length + end allowance. End allowance is counted
  at each join and as trim on the final sheet. Width difference is the side lap.
- Order area uses full rectangular stock dimensions. Cut allowance is usable
  rectangle area less actual covered area; overlap/end allowance is stock area
  less usable rectangle area. These reconcile to the total order area.
- Weight applies the listed kg/m² to order area. No offcut reuse, nesting,
  flashing, fastener, packaging or price calculation is implied. This planner
  does not modify the roof covering's visual material or the existing BOM.

Piece IDs are slope-column.segment. Slope letters describe covering planes,
which can combine several editor faces. Blue rectangles show usable extents;
dashed rectangles show purchased extents; the black line is the roof cut line.

## Validation

`npm run check:roof` includes analytical geometry/quantity regressions.
`tests/sheet-planner-browser.cjs` checks the standalone planner UI, downloads,
print content and mobile layout. `tests/sheet-planner-integration.cjs` checks
launch from the real configurator, state capture and an edited dormer roof.
Browser tests use port 8080 and optionally `ROOF_TEST_BROWSER` and
`ROOF_TEST_THREE` for a local Chromium binary and Three package directory.
