# Fence Configurator

Standalone 360Configurator application for modular residential and light-commercial fence systems.

## Product model

- Straight, L-shaped, U-shaped and closed four-sided fence runs.
- Closed-perimeter mode takes AB, BC, CD and the angle at B; DA is calculated automatically so the fourth side closes exactly.
- Bay-driven geometry: each run is divided into real fence bays from the requested target bay width.
- Vertical slats, horizontal slats, solid privacy panels and welded mesh.
- Five finish presets shared by posts, panels and gates.
- Multiple pedestrian and/or double-leaf driveway gates can be placed independently on any active fence side. Gates cannot overlap; driveway gates span two bays and remove the intermediate post.
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

The localized language switch is owned by the root shared UI. Existing account saves reopen by their private saved-configuration id; unsaved changes on an existing save use a compact URL-only draft handoff, while guests and brand-new unsaved account projects use the normal Share transport.
