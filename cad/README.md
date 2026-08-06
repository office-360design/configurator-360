# CAD conversion workflows

The project now has two separate conversion workflows.

## Complete CAD assemblies

`cad/tools/convert.js` remains the legacy converter for complete assembled window sections such as B2-6, B2-7, and B2-8.

Use it only when the source drawing contains the complete frame, sash, glazing, gasket, and accessory section expected by the existing assembly loader.

## Standalone profiles and accessories

Use `cad/tools/convert_standalone_profile.js` when a DWG/DXF contains one reusable cross-section, such as:

- Outer frame
- Opening sash
- Mullion/transom
- Double-vent secondary sash profile
- Glazing bead
- Gasket
- Locking bar
- Insulation profile
- Glazing bridge
- Drainage cap
- Other profile accessory

The standalone converter does not infer a role from geometry or folder names. The role is supplied explicitly through the command or manifest.

It generates only:

```text
profile.svg
profile.meta.json
```

It never deletes the original DWG/DXF and does not delete an existing output directory. Without `--force`, it refuses to overwrite generated files.

## Check the current conversion plan

This validates nested source paths and metadata without requiring AutoCAD or ODA File Converter:

```bash
npm run cad:standalone:plan
```

The current manifest is:

```text
cad/manifests/standalone-profiles.json
```

It describes profiles `575760` through `575830` using their actual roles. The source paths still point to the existing archive folders; those folders can be reorganized later without changing the profile roles.

## Convert one profile

Example:

```bash
node cad/tools/convert_standalone_profile.js \
  --source wall-sash_frames/L/575760_d1.dwg \
  --profile-id 575760 \
  --role outer-frame
```

On Windows PowerShell, use one line or PowerShell backticks instead of backslashes.

The default output is:

```text
src/client/svg/standalone/profiles/outer-frames/575760/
```

## Convert selected manifest entries

```bash
node cad/tools/convert_standalone_profile.js \
  --manifest cad/manifests/standalone-profiles.json \
  --only 575760,575780
```

Convert every manifest entry:

```bash
npm run cad:standalone:convert
```

## DWG conversion requirement

DWG input requires one of these applications on the machine running the command:

- AutoCAD Core Console (`accoreconsole.exe`)
- ODA File Converter

DXF and SVG input do not require either application.

If neither DWG converter is installed, use `--dry-run` to validate the plan or export the DWG files to DXF first.

## Review before catalog registration

Generated standalone files are deliberately not registered in `src/client/js/profile-catalog.js` automatically.

Before registration:

1. Open `profile.svg` and confirm that the filled cross-section is correct.
2. Confirm the source drawing unit is millimetres.
3. Verify exterior and cavity orientation.
4. Confirm valid rotations and whether mirroring is safe.
5. Add the reviewed SVG and metadata path to the central catalog.
6. Add the profile to the appropriate selector or layout relationship.

This review prevents a converted but incorrectly oriented profile from silently entering the working configurator.
