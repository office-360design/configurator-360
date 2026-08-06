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
