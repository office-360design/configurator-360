# Fence Configurator

Standalone 360Configurator application for modular residential and light-commercial fence systems.

## Product model

- Straight, L-shaped and U-shaped fence runs.
- Bay-driven geometry: each run is divided into real fence bays from the requested target bay width.
- Vertical slats, horizontal slats, solid privacy panels and welded mesh.
- Five finish presets shared by posts, panels and gates.
- Optional pedestrian gate or double-leaf driveway gate. Driveway gates span two bays and remove the intermediate post.
- Concrete footings or anchored base plates.
- BOM and indicative pricing generated from the same derived geometry used by the 3D scene.

## Shared UI integration

The configurator mounts `shared-ui/src/standaloneShell.js` for the common top bar, Save, Undo, Reset, Share, account/settings, language menu and tools launcher. It supports the shared unit, currency and dark-mode preferences.

Shared tools enabled by this configurator:

- Light & orientation
- Dimensions
- Compass
- Camera cycle
- Technical edges

## Public paths

- English: `/fence-configurator/`
- Romanian: `/configurator-garduri/`
- German: `/zaun-konfigurator/`

The localized language switch preserves the current fence configuration through the shared-link backend before changing domains.
