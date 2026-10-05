# Point 1 — lower plinth + rear-foot validation

This pass changes only the two requested structural details on top of `bookshelf-point1-5`.

## Lower plinth width

- The recessed lower plinth now uses the complete clear width between the two side structures (`innerWidth`).
- For the 800 mm family that is **716 mm** (`800 - 2 × 42`).
- For the 900 mm family that is **816 mm** (`900 - 2 × 42`).
- This removes the previous 18 mm gap on each side, so the lower wood piece meets the side panels.
- The front/depth recess remains unchanged, so the bottom shelf still visibly projects beyond the plinth.

## Rear upright floor detail

- Rear uprights are no longer plain rectangular boxes at floor level.
- Each rear upright is one continuous extruded solid with an **8 mm inward foot dent** on the rear face.
- The dent returns to the normal full post depth over a **64 mm high diagonal transition**.
- Front uprights remain unchanged.
- The post is a single mesh, avoiding an artificial seam between a main post and a separate foot piece.

## Regression checks

- `node --check bookshelf-configurator/js/app.js` — PASS
- Bottom shelf dimensions and side-panel alignment from `bookshelf-point1-5` are unchanged.
- Side connector geometry from `bookshelf-point1-5` is unchanged.
- Full-height back panel from `bookshelf-point1-5` is unchanged.
- Cache version bumped to `bookshelf-point1-6`.
