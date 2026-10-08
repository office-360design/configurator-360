# Cages configurator (bored piles and diaphragm walls)

3D configurator for rebar cages: bored piles (circular) and diaphragm wall
panels (square or rectangular). Ported from the Claude artifact prototype.

## Features

- Cage type (bored pile / diaphragm wall) and section (circular, square, rectangle).
- Geometry: diameter or B × H, length up to 24 m, concrete cover (shows the
  resulting bore or panel size).
- Longitudinal bars: count, diameter, steel grade, starter bars at the head.
- Spiral: wire diameter, regular pitch, denser pitch at the ends, closing turns.
- Accessories: stiffening rings and plastic spacer wheels.
- 3D view (Three.js 0.169) with welds, bore/panel outline, head/axial views.
- Cross-section drawing, quantities (bars, spiral, rings, mass, welds,
  concrete volume, kg/m³), indicative checks (SR EN 1536 / 1538) and a
  copyable specification.

Manufacturing limits (diameters, 24 m maximum length, weld pitch, maximum mass)
come from the Damila Producție data sheet for the MEP GAM 1500 HS machine. The
checks are indicative and do not replace the designer's calculation.

## Structure

```text
cages-configurator/
├── index.html
├── styles.css
├── js/
│   ├── model.js     # limits, clamping, geometry, masses, checks (pure)
│   ├── scene.js     # Three.js view
│   ├── section.js   # cross-section SVG
│   └── app.js       # UI binding and panels
└── tests/
    ├── model.test.mjs
    └── cages-browser.cjs
```

## Run locally

From the repository root:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/cages-configurator/`.

## Checks

```bash
npm run check:cages
# With the repository served on port 8080 and Playwright available:
npm run check:cages:browser
```

`CAGES_TEST_BROWSER` can point to a local Chrome/Chromium executable.

## Platform integration

- Uses the shared 360Configurator shell (top bar, Tools with camera views,
  collapsible settings panel) and the shared panel controls and colours.
- Public route `/cages-configurator/` on every language domain (nginx), copied
  by the Cloud Run deploy workflow; the page is `noindex` until marketing pages
  exist.
- Platform domain only: `requireTenantConfiguratorAccess('cages')` blocks tenant
  domains because `cages` is not in the tenant catalogue.

## Not yet done

- Save, share and quotation are disabled. They need `cages` in the backend
  product list (`firebase-share-backend/functions/index.js` `ALLOWED_PRODUCTS`,
  Firestore rules), which also adds it to the tenant catalogue and plans.
- Translations (UI is Romanian only).
