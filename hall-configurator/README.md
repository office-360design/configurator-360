# Hall Configurator

360 Configurator prototype for a parametric industrial hall / warehouse with a detailed structural exploded view.

## UI structure

- The configurator uses the common Configurator 360 top navigation supplied by `shared-ui`.
- Hall-specific configuration is contained only in the **Hall settings** drawer on the **right-hand side**.
- The Hall settings drawer contains dimensions, structural choices, envelope/opening choices, display options, BOM access and exploded-view controls.
- The only hall-specific control outside that drawer is the common **Tools** launcher supplied by the shared shell.
- There is no hall-specific upper toolbar and no hall-specific lower metrics/status bar.

`start_local_site.cmd` intentionally starts a server from the repository root and opens `/hall-configurator/`, so relative imports such as `../shared-ui/...` resolve exactly as they do in the combined repository and GitHub Pages deployment.

## Parametric configuration

- Hall length, width, eave height and roof pitch.
- Target portal-frame spacing with automatically generated equal bays.
- Light, standard and heavy steel visualization presets.
- Secondary steel, floor slab, wall/roof cladding, roller shutter, personnel door and windows.
- Roof/wall finishes and display controls.
- Exploded-view amount configured from Hall settings.

## IFC-informed structural detail

The supplied Tekla IFC2X3 model is the structural reference for the detailed visualization. The current model represents the member/profile families visible in that file, including:

- HEB280-style primary columns using an actual extruded I-section cross-section.
- IPE400-style primary rafters using an actual extruded I-section cross-section.
- ZZ200-style roof purlins and wall girts using a visible Z cross-section.
- RHS border/compression members.
- L-angle stays.
- Wall and roof bracing.
- Tapered portal-frame haunch plates.
- Ridge splice and knee connection plates.
- Purlin cleats.
- Concrete foundation pads and raised foundation pedestals.
- BL25×570-style base plates.
- D27-style anchor rods and exposed anchor cages.
- Hex nuts, lock nuts, washers and multi-part bolt assemblies at representative connections.

The result remains fully parametric rather than embedding the supplied IFC as a fixed mesh.

## Envelope and openings

The envelope now uses thin roof sheets aligned to the actual roof pitch, with separate ridge caps, eave flashings and gable/barge flashings to avoid the previous open/stacked roof edges.

The roller shutter is an assembly containing side tracks, lintel, hood, individual visual slats, bottom rail and lock/handle detail. The personnel door contains a separate frame, leaf, threshold, glazed vision panel with perimeter frame, hinges and handle hardware.

## Exploded view

The exploded model separates major systems so detailed parts remain inspectable:

- foundations and anchor cages;
- primary rolled steel portal frames;
- secondary Z/RHS/L members;
- wind bracing and stays;
- plates and cleats;
- bolts, nuts and washers;
- wall and roof cladding;
- roof flashings;
- doors and windows.

The supplied DWG is useful as a visual cross-check. The IFC remains the primary machine-readable source because it exposes the profile/member and assembly hierarchy directly.

## Important

The configurator is a visualization/configuration model, not structural engineering or fabrication output. Final member sizing, connection design, foundations, loads and code compliance require project-specific structural verification.

## Run locally

Double-click:

```text
hall-configurator/start_local_site.cmd
```

It serves the **repository root** on port 8000 and opens:

```text
http://localhost:8000/hall-configurator/
```
