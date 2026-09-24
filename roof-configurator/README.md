# RoofLab - 3D Roof Configurator

A browser-based, real-time roof configurator built with Three.js primitives.

## Included roof types

- Two-slope / gable roof
- Four-slope / hip roof
- Single-slope / shed roof
- L-shaped cross-gable roof
- Two-slope roof with dormer

## Current controls

- Length
- Depth
- Wall height
- Roof pitch
- Eaves overhang
- Covering preset and colour
- Shared Tools menu with sun position, north direction, night preview, dimensions, compass, and camera cycling
- Technical edge overlay
- Perspective, front, and top camera views
- Real-time proof-of-concept bill of materials and price estimate
- CSV export for the generated BOM

## BOM proof of concept

The **BOM & price** button opens a live estimate calculated from the current roof geometry. The implementation uses:

- approximately `0.47 m²` effective coverage per tile panel;
- `5%` tile waste;
- `20%` membrane overlap allowance;
- `0.37 m` effective ridge-element length;
- roof-type-specific approximate ridge, hip, valley, gable, eaves and gutter lengths;
- the unit prices from the supplied reference offer dated 30/10/2024;
- `19%` VAT.

This is a visual and commercial proof of concept, not a construction quotation. The advance-payment row and roof-window rows from the reference offer are not included because the configurator currently has no corresponding parameters.

## Run locally

This project uses ES modules and loads a pinned Three.js build from jsDelivr, so serve the folder through a local HTTP server instead of opening `index.html` directly. An internet connection is required unless the Three.js files are downloaded locally later.

The configurator imports the sibling `shared-ui` folder, so start the server from the repository root:

```bash
cd path/to/repository-root
python -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/roof-configurator/`.

## File structure

```text
roof-configurator/
├── index.html
├── styles.css
├── js/
│   ├── app.js
│   ├── bom.js
│   ├── dimensions.js
│   ├── roofFactory.js
│   ├── scene.js
│   ├── sharedShell.js
│   ├── state.js
│   └── ui.js
```

## Recommended next technical phases

1. Replace proof-of-concept quantity rules with product-specific catalogs and expert-approved formulas.
2. Represent each roof plane as structured data: polygon, slope vector, area, ridge/eave/hip/valley edges.
3. Add layer visualization: rafters, membrane, counter-battens, battens, covering, ridges, valleys, and flashings.
4. Add openings and penetrations such as chimneys, skylights, and ventilation outlets.
5. Add editable labour, transport, discount and margin rules to the commercial estimate.


## Custom roof plan proof of concept

The final roof-type card opens a local file picker for PDF, image, DWG, or DXF plans. The selected file name and size are displayed, but the file is intentionally not parsed, uploaded, or converted into geometry yet.

## Rainwater components drawer

The last button in the shared **Tools** stack opens a searchable side drawer with an exploded system overview and 21 reference components. The images are prototype reference crops supplied for the UI proof of concept; selecting or viewing them does not yet change the 3D scene or BOM.

## Shared measuring units and currency

The configurator reads the unified shell preferences from the sibling `shared-ui` package.

- Geometry remains stored internally in metres.
- **Metric (mm)** displays dimension controls and 3D annotations in millimetres, while areas remain in square metres.
- **Imperial (ft / in)** displays lengths in feet/inches, editable numeric fields in decimal feet, and areas in square feet.
- BOM source prices remain based in RON. Selecting USD converts the displayed BOM and CSV export using the latest daily RON→USD reference rate from Frankfurter, cached locally for 12 hours. If the network is unavailable and no cached rate exists, the UI clearly labels its temporary fallback estimate.

## BOM inclusion checklist

Each generated BOM row includes an inclusion checkbox. Excluding a row immediately removes its value from the subtotal, VAT, estimated total, header estimate, and CSV export. Include all / Exclude all controls are available above the BOM table, and exclusions remain selected while the current browser session is open.

## Drawn roof layouts

Choose **Draw layout → Edit roof layout** to open the drawing editor. The existing
five presets and the separate file-upload placeholder remain available.

The **L-shaped roof** example has two perpendicular hipped wings, a ridge along
each wing, an inside valley and a continuous level eaves line. All its points
and surfaces remain editable.

1. Start from an example or choose **New perimeter** and click around the outer
   roof edge. Close it by clicking the first point, pressing Enter, or selecting
   **Close perimeter**. Concave and angled outlines are supported. Closing the
   perimeter generates a two-slope roof at the selected **Starter pitch**, with
   a ridge along the longer footprint axis. The ridge is clipped to the outline.
2. Choose **Divide surface**. Start on an existing edge or point, add optional
   interior points, and finish on another edge of that same surface. Repeat for
   additional slopes, ridges, hips and valleys. Crossings and gaps are rejected.
3. Drag a point to move it on the plan; Shift-drag up/down changes its height.
   Mouse and touch dragging snap to the grid and update adjoining surfaces.
   Invalid drops and cancelled gestures restore the original point; a completed
   drag is one undo step. You can also select a point from the dropdown and edit
   X, Z and its height
   above the wall top, then choose **Update point**. Shared points affect every
   adjoining surface. **Insert edge point** adds a point to all incident faces.
4. Use grid snapping, edge-length labels, zoom, Fit and Undo/Redo to refine the
   plan. Backspace removes the last drawing point. Ctrl/Cmd+Z undoes an edit.
5. **Apply roof** builds the textured 3D roof. **Cancel** discards the draft.

The editor uses explicit metre labels independently of the shell display units.
The 3D metric readouts still respect the shell units. Wall height, material and
colour and eaves overhang remain editable in the sidebar. Preset length/depth/pitch controls
are hidden because the custom geometry determines those values.

Coplanar custom surfaces share a continuous covering grid and shading. Internal
triangulation does not create a ridge, flashing or relief taper; these follow
actual slope changes and the roof perimeter. The two metal coverings use a finer
profile mesh on custom roofs to retain their tile shape at close viewing distances.

Layouts are versioned JSON with shared `vertices` (`x`, `z`, `h`), a `boundary`
ring and indexed `faces`. The complete layout is included in capture/restore,
share links, saved configurations and quotation snapshots through the existing
configuration API. Invalid layouts are rejected before state is changed.

Current boundaries:

- Up to 160 points/surfaces and a 40 × 40 m footprint, with heights from 0–30 m
  above the wall. One continuous perimeter; holes and vertical roof steps are
  not supported yet.
- New perimeters start with two generated slopes. **Generate pitched roof** can
  rebuild an existing flat layout from its perimeter at the chosen pitch. This
  replaces manual divisions/heights and can be undone. This is a gable starter,
  not a general hip-roof solver. Further slopes are controlled by point heights.
  Non-planar faces are triangulated; dashed plan lines show the triangulation.
- The drawn perimeter is the roof edge. Walls currently follow that same outline;
  independent wall footprints and automatic eaves offsets are not implemented.
- Surface area comes from the actual 3D triangles. BOM, price and CSV export are
  unavailable for drawn layouts until custom edge classifications and product
  quantity rules are implemented. Preset BOM calculations are unchanged.
- The editor's new instructional copy is currently English.
- Pipes, penetrations and automatic file-to-geometry conversion remain future work.

Validation:

```bash
npm run check:roof
# With the repository served at http://127.0.0.1:8080 and Playwright Chromium installed:
npm run check:roof:browser
# Rendering regression: shared seam positions/normals for all three coverings.
node roof-configurator/tests/covering-browser.cjs
```

The browser check covers drawing, division, point heights, examples, draft
cancellation, undo/redo, 3D application, state restoration, invalid snapshots,
reset and a 390 px mobile viewport. `ROOF_TEST_BROWSER` can select an existing
Chromium executable; `ROOF_TEST_THREE` can point to a local Three.js 0.169.0 package
when the CDN is unavailable in the test environment.

Custom layouts support the Eaves overhang control (0–1.2 m). The drawing remains the outer roof edge; walls are inset horizontally, with tops following the roof slopes. Zero aligns walls with the edge. Narrow footprints automatically limit the effective setback, shown beside the control. Roof area stays unchanged; building footprint reflects the inset walls. The existing saved/shared overhang value is used.

Select a point or dividing edge in the layout editor and use **Delete selected**, Delete or Backspace. Removing a dividing edge merges its adjoining surfaces (including their shared polyline); removing a junction may merge incident surfaces. Boundary points reshape the closed perimeter. Outer edges cannot be removed alone. Invalid deletions leave the draft unchanged, and successful deletions support Undo/Redo.

### Split points and edges in place

Select a shared point or dividing edge, choose the adjoining surfaces under
**Split in place**, then press **Split in place** in the toolbar. At least one
surface must remain attached to the original. A point split duplicates that
corner for the chosen surfaces; an edge split duplicates both endpoints on one
side. **Next copy** cycles the coincident points or edges. The selected copy's
attached surfaces are highlighted, and the point selector gives access to every
copy for exact height entry or Shift-dragging.

Heights are independent. X/Z edits move the coincident copies together to keep
the plan closed; this is not an overlapping-roof or free-floating-surface tool.
Vertical wall faces automatically close differences along detached boundaries,
including tapered steps and height profiles that cross. Inserting a point on a
split edge retains the height profile on each side. Splits and height edits
support Undo/Redo and are preserved in saved/shared layouts. To remove a split
point, undo its split first; deleting unrelated points remains available.

Regression check (with the same browser environment as the other browser tests):
`node roof-configurator/tests/split-browser.cjs`.
