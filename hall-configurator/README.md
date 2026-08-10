# Hall Configurator

360 Configurator proof of concept for a rectangular industrial hall / warehouse.

## Current structure

- The full hall configuration is contained in the **Hall settings** panel on the right side.
- Camera/view controls and BOM access remain in the viewer header because they are viewer actions rather than hall configuration settings.
- No Hall-specific Tools menu has been introduced yet.

## Parametric configuration

- Hall length, width, eave height and roof pitch.
- Target portal-frame spacing with automatically generated equal bays.
- Light, standard and heavy steel visualization presets.
- Secondary steel, floor slab, cladding, roller door, personnel door and windows.
- Roof/wall finishes and display controls.
- Exploded-view amount is configured from Hall settings.

## IFC-informed structural detail

The detailed steel visualization uses the supplied Tekla IFC2X3 export as the main structural reference. The reference contains profile/member families and connection-detail categories including:

- HEB280 and HEA220 columns.
- IPE400 and IPE180 rafters/beams.
- ZZ200 purlin families.
- RHS150x50 border members.
- RHS80x4 / RHS80x5 compression and bracing members.
- L60x6 stays.
- D20 / D27 rods and bracing.
- Base plates, gusset/splice plates, cleats, anchor rods, nuts, washers and bolt assemblies.

The configurator uses these families as a visual/detailing basis while keeping the hall itself parametric. The exploded view separates the envelope, secondary steel and connection-detail groups so the user can inspect more than a simplified shell.

## Exploded view

The exploded model exposes:

- primary portal-frame I-sections;
- secondary Z/RHS members;
- wall and roof bracing;
- purlin/frame stays;
- base plates and footings;
- anchor rods and nuts;
- knee gussets and bolts;
- ridge splice plates and bolts;
- representative purlin cleats;
- wall/roof cladding and openings as separate envelope groups.

The supplied DWG is an AutoCAD 2000 DWG originating from the Tekla workflow. The IFC is used as the authoritative machine-readable structural reference in this version because it exposes the member/profile and assembly hierarchy directly.

## Important

The profile selection, connection placement and BOM remain configurator visualization logic, not structural engineering calculations or fabrication output. Final member sizing, connection design and foundation design require structural verification for the actual site loads and code requirements.

## Run locally

Serve the repository root over HTTP and open `/hall-configurator/`.

For example, from the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/hall-configurator/`.
