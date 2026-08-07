# Hall Configurator

Initial 360 Configurator proof of concept for a rectangular industrial hall / warehouse.

## Included in this first version

- Parametric hall length, width, eave height and roof pitch.
- Portal frames generated from the requested target bay spacing.
- Real primary steel members: columns, rafters, knee braces, eave beams and ridge tie.
- Real secondary support members: roof purlins, wall girts and end-wall support posts.
- Concrete slab and column footings.
- Roof/wall cladding presets and colours.
- Roller door, personnel door and side-window visualization.
- 3D, front, side and top camera views.
- Dimension labels and technical-edge mode.
- BOM generated from the current model geometry.
- Exploded-view slider. Primary structure stays in place while foundations, secondary steel, cladding and openings separate into readable layers.
- Shared 360 Configurator header, account/preferences UI, dark mode, undo/save/share shell and collapsible settings panel.

## Important

The steel member sizes and BOM are visualization/geometry presets, not structural calculations. A structural engineer still needs to size members, connections and foundations for the real project loads and site conditions.

## Run locally

Serve the repository root over HTTP and open `/hall-configurator/`.

For example, from the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/hall-configurator/`.
