# Cardboard Box Configurator

Static 3D configurator for orthogonal cardboard packaging footprints.

## Geometry

- Rectangle, L-shaped and U-shaped presets.
- Selected walls can receive additional 90-degree outward steps or inward notches.
- Every generated side remains axis-aligned and is independently selectable in the 3D view or footprint editor.
- Width/depth resizing scales the complete active footprint while preserving its topology.

## Side customization

Each wall has independent board grade, colour, print mode and reinforcement state. The selected side can also be copied to all other sides.

## Shared UI

The configurator uses `shared-ui/src/standaloneShell.js` for authentication, save/new save, saved configurations, Share, cart/quotation, language/domain switching, profile, Help, Book a demo, reset and undo behavior.
