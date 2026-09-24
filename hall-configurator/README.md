# Hall configurator

Parametric 360 Configurator demo for an industrial hall / warehouse.

## Local run

Use `start_local_site.cmd`. The launcher uses `serve_local.py`, which serves the repository root on `127.0.0.1:8000` with cache disabled so local testing always loads the current Hall files.

## Current scope

- Common 360 Tools menu with Light & orientation, dimensions, compass, camera cycling, technical edges and exploded view
- Right-side accordion Hall settings
- Parametric portal-frame structure with detailed IFC-inspired profiles/connections
- Model-display inspection controls for structure, section cuts, warehouse planning and building services
- Exploded structural view with detailed connection geometry loaded only when required
- Closed wall/roof envelope with overlap-sealed corners, skylights and rainwater goods
- Interactive human doors, garage doors and windows on all four walls with drag/drop, direct resize handles, size/colour editing and deletion
- Opening collision validation with red outlines and blocked Summary/BOM generation until conflicts are resolved
- Optional HVAC/refrigeration, high-bay lighting and sprinkler visualization
- Pallet-racking and forklift-clearance planning previews
- House and tree scenery for scale reference
- BOM CSV export and indicative pricing summary
- Debounced dimension rebuilding and cached environment generation for smoother resizing
