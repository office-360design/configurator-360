# Bookshelf Point 1 restriction + finish validation

Validated against `configurator-360-main(16).zip` with the previous Point 1 restriction update applied.

## Product options

- Exactly two dimensional families remain:
  - straight 800 x 350 x 2150 mm / corner 800 x 800 x 2150 mm
  - straight 900 x 350 x 2300 mm / corner 900 x 900 x 2300 mm
- Exactly three finishes remain: NATURAL, MAHON, WENGE.
- The left/right corner selector is removed.
- The retained single L-corner now uses the opposite orientation from the previous update.
- Adding that same corner at the beginning of a run uses the inverse transform automatically.
- Old saved corner `turn` data is ignored/normalized.

## Client finish textures

The three runtime texture files were cropped directly from the finish samples embedded on page 1 of the client PDF. They are not generated approximations or flat replacement colors.

- `assets/textures/wood-natural.png`
- `assets/textures/wood-mahon.png`
- `assets/textures/wood-wenge.png`

The 3D materials now use these images as color maps and keep metalness at zero.

## Shared settings fixes

- Account Settings is re-rendered/synced when toggled so stale guest/auth menu DOM cannot leave the Settings panel inert.
- Bookshelf forces the updated `platform-20` shell path to avoid stale cached account settings code/styles.
- Explicit language changes now apply the established regional defaults:
  - Romanian -> RON + metric
  - German -> EUR + metric
  - English -> USD + imperial
- Manual Units/Currency selection in Settings remains available after the language change.

## Static checks

- `node --check bookshelf-configurator/js/app.js` - passed
- `node --check bookshelf-configurator/js/sharedShell.js` - passed
- `node --check shared-ui/src/standaloneShell.js` - passed
- `node --check shared-ui/src/components/topBar.js` - passed
- `node --check shared-ui/src/components/accountMenu.js` - passed
- Option/corner/texture/language assertions - passed
