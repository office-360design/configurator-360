# 360 Configurator shared UI

Reusable interface primitives for all product configurators in this repository.

The package contains the common top bar, account menu, language menu, viewport tools,
feedback toast, icons, locale defaults, and shared UI styling. Product-specific panels
remain inside their own configurator folders.

A configurator can import the JavaScript API from `shared-ui/src/index.js` and the shared
CSS from `shared-ui/styles/index.css`. Its Vite development server must allow imports
from the repository root; see the pergola configurator's `vite.config.js`.

## Standalone/static configurators

`mountStandaloneConfiguratorShell()` mounts the same shared navigation bar on static
configurators that do not use the pergola Vite application shell. The window and roof
configurators use this adapter, while their product controls and Three.js logic remain
unchanged.

Product settings panels use the shared `shared-settings-panel` and
`shared-settings-toggle` classes so all configurators place their controls at the same
right-side coordinates and use the same collapse geometry.
