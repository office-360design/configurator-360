# CAD source and conversion workflows

The active CAD sources are organized by physical role:

```text
cad/source/
├─ frame/                 # 575760, 575770
├─ sash/                  # 575780, 575790
├─ mullion/               # 575800, 575810
├─ join/                  # six left/right connection-reference assemblies
├─ bead/                  # 573920, 573930, 573940
├─ gasket/                # 224350, 224378, 224379
├─ trans/                 # 575820, 575830 floating trans profiles
└─ 2_4, 2_5, 2_6 DWGs    # complete B2 reference assemblies
```

Do not infer a runtime role from a source folder. The manifests provide the explicit role and connection semantics.

## Standalone profiles and glazing accessories

`cad/tools/convert_standalone_profile.js` converts reusable cross-sections while keeping physical CAD components separately selectable.

The active manifest is:

```text
cad/manifests/standalone-profiles.json
```

It contains:

- Outer frames: `575760`, `575770`
- Opening sashes: `575780`, `575790`
- Mullion/transom profiles: `575800`, `575810`
- Trans profiles: `575820`, `575830`
- Glazing beads: `573920`, `573930`, `573940`
- Glazing-bead gaskets: `224350`, `224378`, `224379`

The trans profiles are used only by the `trans-sash-sash` connection and are parented to one opening sash at runtime.

Check the complete source/output plan without requiring AutoCAD or ODA:

```bash
npm run cad:standalone:plan
```

Convert all active entries:

```bash
npm run cad:standalone:convert
```

DWG sources require AutoCAD Core Console or ODA File Converter. DXF and SVG sources do not require a DWG converter. Use `--force` only after review when replacing generated outputs.

The generated structure is:

```text
profile.svg
profile.meta.json
parts/
  000-<component>.svg
  ...
excluded/                 # only when detached components are filtered
```

The original CAD source is never changed.

## Left/right connection references

The `join/` DWGs are cataloged in:

```text
cad/manifests/connection-assemblies.json
```

Validate and display the mapping with:

```bash
npm run cad:connections:plan
```

The active mappings are:

| Connection ID | Source |
|---|---|
| `frame-fixed` | `join/frame-window.dwg` |
| `frame-sash` | `join/frame-sash-window.dwg` |
| `mullion-fixed-sash` | `join/window-mullion-sash-window.dwg` |
| `mullion-fixed-fixed` | `join/window-mullion-window.dwg` |
| `mullion-sash-sash` | `join/window-sash-mullion-sash-window.dwg` |

These files are one representative **left/right section**, not separate top and bottom drawings. They define:

- Which structural profiles participate in a connection.
- The left/right cell relationship.
- Relative cross-section placement.
- Accessory membership and local placement references.
- Whether mirroring is explicitly allowed.

They must not be flattened into one indivisible runtime mesh. Standalone `frame`, `sash`, `mullion`, `bead`, and `gasket` geometry remains the reusable physical geometry.

## Complete B2 assemblies

`cad/tools/convert.js` remains the legacy complete-assembly converter for B2-6, B2-7, and B2-8.

The complete assemblies remain useful for:

- Existing presets and regression comparison.
- Accessory membership and profile IDs.
- Glass-thickness-dependent bead/gasket behavior.
- Bottom-only drainage-cap and glazing-bridge behavior.
- Host-relative accessory placement references.

They are not the primary structural profile source for new divided-window composition.

## Mullion conversion note

Profiles `575800` and `575810` contain reflected nested `INSERT` geometry with negative-Z extrusion. The shared `cad/tools/insert_transform.js` converts insertion points and block vectors from OCS to WCS so the reflected component remains in the assembled profile instead of shifting 60 mm left.

The mullion manifest entries use `modelSpacePolicy: "inserts-only"` and `main-cluster` component selection. This keeps the block hierarchy authoritative and excludes unrelated direct model-space/proxy geometry without discarding valid profile parts.

## Validation

Run:

```bash
npm run check
npm run prepare:static
```

The checks verify the source-folder mappings, profile catalog paths, standalone conversion plan, join manifest, runtime module graph, and existing configurator behavior.
