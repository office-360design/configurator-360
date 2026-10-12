# Independent roof builder

Open the existing roof configurator and choose **Desenare 2D Pante** in its right panel. The fullscreen workspace also runs at `roof-configurator/builder/`. The sole integration change is a module script loading `bootstrap.js` in the original HTML. All implementation, translations, catalog evidence and tests live in this directory. Existing editors, geometry engines, product definitions and cloud/cart flows are untouched.

## User journey

1. Start with **Build with roof shapes** or **Draw the house outline**. Roof choices use 3D illustrations. Gable, hip and shed sections go straight to a placement preview; there is no required measurement form before building.
2. **Place** commits the visible preview; **Cancel** restores the previous drawing. Use the selected piece’s **Move / Size / Slope / Details / Options** bar. Move drags the body; Size exposes corner handles and clickable dimensions. New pieces have Rotate and Size controls before placement. A drag creates one undo step; cancelled drags never commit. Empty canvas pans and two fingers zoom.
3. Click **+** on a side to preview an attached wing with its intersections resolved automatically. Short edges remain selectable through **Options → Add a wing**. Nearby wing buttons are separated to prevent overlap. **Add details** offers illustrated dormer, roof-window and chimney choices. Connected-section details start with a placement preview too; their measurement controls remain available through **Enter site measurements**.
4. **Free drawing** uses ordered corner clicks, alignment/common-angle assistance, a removable last corner, and a live closing preview. Click the first corner or **Make the roof** to generate a gable over the actual footprint. Arbitrary outlines can use gable/shed roofs; convex outlines also support hips. Concave hipped roofs are built from attached wings instead of inventing a straight-skeleton solution. **Where does the water flow?** makes gutter edges selectable directly; **Turn the ridge** rotates its axis without rotating the footprint.
5. The full-canvas construction HUD keeps the permanent inspector closed. Build opens a bottom piece tray; Details uses the same tray. Slope/Options and exact measurements use a consistent drawer, opened explicitly and dismissed with Done/Cancel. **3D preview** shows measured faces with unknown pitch at an explicitly explained 30° visual estimate. That estimate exists only in a presentation clone: saved measurements, assembly status, quantity calculations and sheet plans never acquire an invented surveyed pitch. **Enter the actual angle** selects the affected face and opens one angle field. Surveyed measured-face connections still use rigid transforms and reject incompatible edge lengths/pitches.
6. Measured faces remain available through **From my measurements**: rectangles, triangles, trapezoids, corner-edited outlines and a free-drawn surface option. Exact edge measurements lock; diagonals guide additional measurements. Impossible edits preserve the valid project. Their display positions never change surface dimensions.
7. **Sheet plan** opens face-specific placement, direction, module partitions and allowance explanations. A sheet can be selected through the drawing or the large dropdown. Manual `11+11` and `7+7+8` partitions retain the total, while **8 + remainder** respects product limits. Matching-column actions use the existing planner's column signatures.
8. **Project and files** provides JSON save/open, CSV export and printable drawings/plans. **Copy current roof** imports a clone through the original capture API. It never restores builder edits into the original configurator. The separate upstream **Draw each slope** sketch has no assembled layout and is explicitly rejected by this copy adapter instead of being replaced with a guessed preset roof. Autosave is independent and tenant-scoped; unavailable browser storage leaves editing and file saving functional.

## State and geometry

`RoofBuilderProject` version 1 uses metres for geometry and millimetres for manufacturing parameters. `project.js` owns validation, stable IDs/labels, independent history and storage (`360:roof-builder:v1:<tenant>`). Part records contain measured outlines or preset/imported geometry, product references, openings, dormers, edge roles and optional assembly relationships. `faceSettings` maps stable face IDs to placement, fingerprints and manual partitions. Dormer labels retain their ordinal after other dormers are removed.

`geometry.js` resolves one authoritative set of faces for drawing, 3D and planning. Each measured face has a bottom-left surface origin independent of board position. Connected section patches use an upper envelope, clipped domains and adjacency-derived ridge, hip, valley and height-step edges. Separate components remain separate. Preset creation, triangulation, grouping, dormer insertion and legacy window cuts reuse the existing modules on cloned inputs. Feature coordinates use stable host-plane frames. Changing a measured face's downhill direction reprojects openings without moving them on its surface.

`planner.js` runs the existing sheet planner per resolved face. Calculation-only flat embeddings preserve actual surface length/area and openings; they are never serialized or rendered as assembled roofs. Unknown pitch produces the localized **Pitch not supplied** notice. Rounding, grouping, partition validation, matching-column logic and profile limits reuse existing contracts. Fingerprints invalidate only affected faces; independent measured-face board movement leaves its partitions unchanged. Continuous Click planning is explicitly provisional because join/stock-width data is unresolved.

Legacy limits still apply to each adapted component: approximately 40 m extents, minimum 5 cm polygon edges, minimum 0.05 m² faces and the existing vertex/face budgets. Failures appear beside the relevant face and leave other plans available. Dormers must fit strictly inside one supported planar host patch, with the existing 8 cm margin. These are geometric checks, not structural calculations.

`viewer.js` owns its Three.js renderer, controls, resources and resize observer. It renders on demand rather than running an idle scene loop. Leaving 3D, closing the dialog and page disposal release geometry/materials, controls, WebGL resources, observers and pending animation frames. A request token guards rapid 2D/3D switches. Editing uses simplified overhead surfaces; detailed covering geometry is created after placement.

## Catalog and evidence

The versioned catalog covers **Rodach Simetric, Antic, Clasic, Colina and Click**, plus ridge, valley, flashing, eave and rainwater representations. Antic/Clasic planning reuses the legacy profile values. Existing rainwater illustrations remain referenced. `materials.js` captures the existing factory's coated-steel material and procedural textures from a small cloned model, then disposes the sample and owns the retained resources. New profile generators supply visual representations where no verified manufacturing cross-section exists. These finish previews do not establish supplier variant availability.

`evidence.js` records supplier website claims, physical PDF page numbers, legacy values and contradictions. Sources include the [Rodach 2023 catalog](https://rodach.ro/wp-content/uploads/2023/12/Catalog-Rodach-_QR.pdf), the [installation guide](https://rodach.ro/instructiuni-de-montaj/) and individual product pages. Installation side follows [issue #520](https://github.com/office-360design/configurator-360/issues/520): Simetric permits both sides; the other listed products use left-to-right. Downhill direction is a separate geometric setting.

Supplier values conflict for Simetric and Clasic widths, some stock lengths/module limits, weights and the general installation guide. End/join allowances are not sufficiently documented to approve orders. Every affected order is therefore clearly **provisional**. Visual cross-sections, screen colours, accessory dimensions and downpipe placement are presentation approximations; they never supply manufacturing quantities. Accessories aggregate known measured edge lengths without inventing stock-piece counts or fastening quantities. Confirm source values and update the catalog version before marking a product/order confirmed.

The paper-sketch example recreates six independent irregular, triangular and trapezoidal faces. Only clearly readable edges are locked; suggested heights/offsets and the remaining dimensions are labeled for site measurement. The multi-wing example is also provisional. Neither example is a surveyed roof.

## Verification

From the repository root with its normal dependencies installed:

```sh
npm run check:roof
node --test roof-configurator/builder/tests/contracts.test.mjs roof-configurator/builder/tests/outline.test.mjs
python3 -m http.server 8080 --bind 127.0.0.1
```

Against that server, in a second terminal:

```sh
node roof-configurator/builder/tests/browser.cjs
node roof-configurator/builder/tests/interactions.cjs
node roof-configurator/builder/tests/experience.cjs
node roof-configurator/builder/tests/game-hud.cjs
node roof-configurator/tests/sheet-partition-browser.cjs
node roof-configurator/tests/editor-toolbar-browser.cjs
```

`ROOF_BUILDER_TEST_URL` overrides the builder test server. `ROOF_TEST_BROWSER` selects a Chromium executable. `ROOF_TEST_THREE` optionally supplies a local Three.js package for deterministic browser import-map requests; production uses the existing CDN version 0.169.0.

Contract tests cover true surface areas, openings, envelope connections, multiple dormers, fixed measurements/diagonals, stable labels, rigid assembly, planner parity, partitions/allowances, affected-face invalidation, independent history/storage, imports, catalog conflicts and CSV reconciliation. Browser journeys cover original-state isolation, reopening/focus/history, file and CSV export, invalid-input recovery, complex construction, 3D cleanup, desktop/mobile controls, decimal commas, actual touch pan/pinch and storage failure with German/imperial preferences. Existing roof and toolbar/partition regression checks remain required.

Outline contracts additionally verify concave footprint coverage, arbitrary gutter directions, ridge rotations, convex hipped roofs, locked-edge mirroring, file round trips, and presentation-estimate isolation. The beginner browser journey also checks distinct Move/Size modes, rotation and resizing of uncommitted ghosts, restoring selection after cancellation, feature size/rotation without changing the parent, and mobile HUD visibility. It verifies building without forms, keyboard-accessible wing buttons, actual valleys, body dragging with undo/cancellation, closing a free-drawn outline, error recovery, direction selection, sheet plans, reopening and mobile controls.

The iframe imports the existing roof stylesheet and shared panel stylesheet. It reads parent theme tokens without writing to the parent, and uses the shared accordion/range bindings. Properties appear only when requested; secondary technical tools remain in **Options → More options**; unexplained completion badges are absent from the construction controls.

Human usability testing with roofers who have low technology confidence is still a release validation gate. Automated checks establish behavior, not whether the experience is sufficiently easy for that audience.

Address reconstruction, AI services, general CAD import, structural calculations, offcut reuse and cloud/cart integration are deferred.
