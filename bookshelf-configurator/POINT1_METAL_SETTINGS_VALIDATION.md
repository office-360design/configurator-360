# Bookshelf connector material + Settings validation

## Connector material

The connector geometry, dimensions, positions and wrap coverage from `bookshelf-point1-9` are unchanged.
Only the material has been recalibrated:

- brushed texture base raised to a light silver-grey range
- subtle deterministic brushing retained
- material color: `#d6dade`
- metalness reduced to `0.52`
- roughness set to `0.36`
- restrained clearcoat retained for grazing-light highlights

This deliberately differs from the Window shared preset only in effective metalness because the
Bookshelf scene does not yet use the Window HDR/environment reflection system. Full metalness in
this scene was the reason the connector rendered nearly black.

## Settings repair

The shared account Settings implementation is refreshed to `platform-21` and keeps the previously
established guest Settings and language-region behavior.

Bookshelf also adds a local recovery path:

1. Record whether Settings was open before the click.
2. Let the shared shell handle the click normally.
3. If the visible Settings state did not change, reopen/reclose it locally through the shell state.

The fallback does nothing when the shared implementation succeeds, so it cannot double-toggle a
working Settings menu.

## Language defaults retained

- Romanian: RON + metric
- German: EUR + metric
- English: USD + imperial

## Syntax checks

- `bookshelf-configurator/js/app.js`: passed
- `bookshelf-configurator/js/sharedShell.js`: passed
- `shared-ui/src/standaloneShell.js`: passed
- `shared-ui/src/components/accountMenu.js`: passed
- `shared-ui/src/components/topBar.js`: passed

## Cache versions

- Bookshelf: `bookshelf-point1-10`
- Shared account/settings modules: `platform-21`
