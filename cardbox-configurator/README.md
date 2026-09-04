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

## Manufacturing-oriented box catalogue

The configurator starts with **Standard shipping box (FEFCO 0201)** and no longer exposes the former free-form “attach another box volume” action. Geometry choices are constrained to nine practical, user-facing structures:

1. Standard shipping box — FEFCO 0201
2. Full-overlap box — FEFCO 0203
3. Telescope lid box — FEFCO 03 family
4. Archive box — FEFCO 04 family
5. Pizza box — FEFCO 0426
6. Postal mailer — FEFCO 0427
7. Self-erecting / automatic-bottom box — FEFCO 07 ready-glued family
8. Two-point glued box — FEFCO 07 ready-glued family
9. Sleeve and drawer box — FEFCO 05 sliding-box family

The family-level entries are intentionally stored as `03xx`, `04xx`, `05xx`, or `07xx` until the customer confirms the exact production code used for each proprietary construction.

Top and bottom closures are separate, compatibility-filtered selections. Handles and ventilation openings are rendered as real cut-outs in the selected exterior surfaces. The board model stores construction (`CO3` or `CO5`), flute profile (`E`, `B`, `C`, `EB`, `BC`), paper preset (`TFT`, `AFT`, `AFA`) and an editable physical layer stack with paper grade and grammage per layer.

Printing and graphics stay in the existing face-selection workflow. All text placement, sticker wrapping, selection, dragging, measurement, alignment, editing and manual lid-lift behavior remains part of the 3D surface editor.
