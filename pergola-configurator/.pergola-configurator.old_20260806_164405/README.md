# Pergola Configurator

Standalone demo configurator intended to live at:

```text
<repository-root>/pergola-configurator/
```

It does not modify or depend on the window configurator. Future pergola updates can replace only this folder.

## Included functionality

- Real-time parametric 3D pergola generated with Three.js.
- Shared 360 Configurator branding and blue interface styling aligned with the window configurator.
- Lite, Comfort and Premium structural variants.
- Freestanding and wall-mounted installations.
- Front, back, left and right mounting selection.
- Standard dimension presets and custom width/depth/height.
- Metric and imperial dimension labels.
- Frame and louver color selection.
- Louver span direction and adjustable louver tilt.
- Integrated/standard drainage visualization.
- Manual crank, motorized remote and pergola-switch automation.
- Unified pole customization menu with explicit pole and face selection.
- Exactly one movable manual hand crank for the whole pergola, plus configurable pergola switches, speakers and EU/US outlets.
- Maximum one component per pole face, with component-specific roof-safe height ranges and vertical collision prevention between components on the same pole.
- Optional transport, assembly and warranty services.
- Independent side selection for all four sides.
- Pull-down screens, motorized screens, color-selectable privacy walls and glass sliding panels.
- Pull-down and motorized screens default to 50% openness and independently remember openness and color for every side and screen type.
- Color-selectable perimeter LED lighting and configurable spotlight count. Spotlights are attached to fixed metal rails below the moving louvers.
- Inward-facing infrared heaters with one selectable heater per side, suspended from dedicated metal rails and offset from side closings.
- Independently positioned rain and wind sensors with mounting plates and collision prevention.
- Speakers, switches and outlets can be assigned independently to any available pole face; outlets retain independent European Type F or American Type B selection.
- Side screens, privacy walls and glass panels are blocked whenever either inward-facing pole surface needed by that side is occupied, and pole components are blocked by existing side closings.
- Lighting/orientation menu with sun position, louver tilt and north direction.
- Winter, summer, studio and night previews.
- Orbit/zoom controls and camera presets.
- Live dimensions, itemized demo pricing and estimated total.
- Pole-face and vertical-clearance collision rules for outlets, speakers, switches and the manual crank.
- Browser persistence, reset, shareable URLs, PNG snapshot and JSON export.
- Contact/inquiry demo, printable summary and AR integration placeholder.
- Responsive desktop/tablet/mobile layout.

The quote submission is deliberately frontend-only: it stores the latest demo inquiry in browser storage. It must be connected to the project's actual backend/CRM before production use.

## Assets

`public/assets/profiles/` contains original SVG cross-section concepts for the post, beam, louver, gutter and privacy slat. The current demo uses equivalent parametric Three.js geometry because this is more robust when dimensions change continuously. The SVG profiles are ready to be replaced with manufacturer-accurate profiles later.

The house, upright trees, screen cassette, automation hardware and configurable accessories are bundled as local GLB models under `public/assets/models/`. These lightweight demo assets are released under CC0; their procedural source is included in `tools/generate_demo_assets.py`. Licensing details and public-domain reference libraries are documented in `public/assets/models/ASSET_LICENSES.md`.

Accessory icons are original SVG files under `public/assets/icons/`. The header uses the project-supplied `public/assets/360CONFIGURATOR.png` brand asset.

## Run locally on Windows

Open PowerShell in this folder:

```powershell
cd C:\path\to\configurator\pergola-configurator
npm.cmd install
npm.cmd run dev
```

Then open the URL printed by Vite, normally:

```text
http://localhost:4173/
```

`npm.cmd` is used explicitly because some Windows PowerShell installations block the `npm.ps1` wrapper through their execution policy.

Alternatively, double-click:

```text
start_local_site.cmd
```

## Build

```powershell
npm.cmd run build
```

The production output is written to:

```text
pergola-configurator/dist/
```

Because `vite.config.js` uses a relative base path, the build can be deployed beneath a subdirectory rather than requiring its own domain root.

## Repository integration

Add the whole folder to the existing repository:

```powershell
git add pergola-configurator
git commit -m "Add pergola configurator demo"
git push
```

For a Netlify project that already builds the root application, either:

1. add a separate Netlify site whose base directory is `pergola-configurator`; or
2. modify the root deployment script so `pergola-configurator/dist` is copied to the desired subpath of the main deployment output.

## Important limitations

- The implementation reproduces the reference configurator's visible interaction model and provides a broad functional demo, but it does not copy its proprietary source code, product catalog, exact pricing rules, customer accounts, PDF service or CRM backend.
- AR is represented by a working UI placeholder only. The existing GLB/USDZ publication flow can be connected later.
- The pergola geometry is concept/demo geometry, not production CAD or engineering geometry.
- Pricing is illustrative and defined in `src/pricing.js`.
