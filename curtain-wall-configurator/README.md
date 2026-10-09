# Curtain wall configurator (GUTMANN GCW 050)

3D configurator for stick curtain walls (mullion/transom) built on the
GUTMANN GCW 050 system. It follows the window configurator's ideas (profile
catalogue, axis grid of tracks, 2D sections extruded to 3D, shared-3d
materials, shared shell, RO/EN/DE) with a simpler builder: every mullion and
transom is one extrusion along a grid line, transoms butt against mullions.

Source: GUTMANN order and processing catalogue “Bestellinformationen Fassade
GCW”, edition 03.2025
(<https://www.gutmann.de/fileadmin/user_upload/Bausysteme/Produkte/Produkte/GCW_050_060/Bestell-_und_Verarbeitungskatalog/Bestellinformationen_Fassade_GCW.pdf>).

## What it does

- **Grid**: bay widths and row heights (axis to axis, bottom up), vision or
  opaque spandrel rows, presets (shopfront, office 2 storeys, atrium).
- **Profiles from statics**: mullions continuous over the full height,
  anchored every *anchor spacing*; transoms between mullions on every row line.
  Required Ix/Iy per member:
  - wind (mullions and transoms): uniform load on the tributary width,
    deflection `l/200`, at most 15 mm (DIN EN 13830, catalogue static chapter);
  - transom dead load: infill weight (glass 25 kN/m³) on two setting blocks
    150 mm from the ends, deflection `min(3 mm, B/500)`;
  - E = 70 000 N/mm² (EN AW-6060 T66).
  “Automatic” picks the smallest 150030…150195 profile that passes every
  member; transoms are capped at the mullion depth. Manual choices are checked.
- **Glazing table**: infill 12–64 mm × pressure strip (159301, 159310 with
  drainage, 159210/159225/159230) → façade screw, glass support, insulator,
  drainage part, gaskets 760006 / 760110, as printed in the GCW 050 glazing table.
- **Node**: horizontal section (profile, gaskets, insulator, glass, pressure
  strip, cover plate 159012…159030) drawn to scale and extruded in 3D.
- **Ucw** per EN ISO 12631 (component method) with Uf from the GCW 050 heat
  calculation diagram (screw ΔU 0.18 included), Ug of the build-up, Up 0.25 for
  panels.
- **Bill of materials**: profiles cut into 6 m bars (first fit decreasing,
  5 mm kerf), mullion splices at anchors, transom joint connectors, strips,
  covers, screws, insulators, gaskets (50 m rolls), glass supports, drainage,
  glass and panel list by size, aluminium mass and coating area.

## Assumptions (shown in the UI)

- The catalogue gives no kg/m: profile mass is estimated from Ix as an
  equivalent thin-walled 50 × depth tube.
- Glass size = axis distance − 22 mm; pressure strip screws every ~250 mm;
  drainage one set per transom; spacer ψ 0.06 (double) / 0.04 (triple).
- Profile sections are simplified outlines for rendering, not fabrication drawings.
- Checks are serviceability (deflection) checks only; they do not replace the
  structural engineer's calculation (no stress, anchor or glass checks).

## Structure

```text
curtain-wall-configurator/
├── index.html, styles.css
├── js/
│   ├── catalog.js    # GCW 050 data transcribed from the catalogue
│   ├── facade.js     # grid, statics, automatic profiles, Ucw, BOM (pure)
│   ├── sections.js   # node cross-sections (mm)
│   ├── scene.js      # Three.js r160 + shared-3d materials, merged meshes
│   ├── drawings.js   # elevation and node SVG
│   ├── i18n.js       # ro-RO, en-US, de-DE
│   ├── app.js, sharedShell.js
└── tests/ facade.test.mjs, curtain-wall-browser.cjs
```

## Run locally

```bash
python3 -m http.server 8080 --bind 127.0.0.1   # from the repository root
```

Open <http://127.0.0.1:8080/curtain-wall-configurator/>.

```bash
npm run check:curtain-wall
npm run check:curtain-wall:browser   # server on 8080, Playwright; CW_TEST_BROWSER=<chrome>
```

## Not yet done

- Save, share and quotation (product not in the backend catalogue); tenant
  domains are blocked by `requireTenantConfiguratorAccess('curtainwall')`.
- Corners and polygonal facades (glazing tables exist for 0–45°), opening
  vents, steel/aluminium stiffening inserts, GCW 060.
