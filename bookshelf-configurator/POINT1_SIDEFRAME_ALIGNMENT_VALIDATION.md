# Point 1 side-frame alignment validation

This pass refines only the bookshelf structure requested after the initial side-frame implementation.

## Implemented

- Side infill thickness reduced from 18 mm to 10 mm.
- The inner face of each side infill is exactly coplanar with the inner face of its front/rear posts.
- Shelf width now spans the complete post-to-post clear width, so shelf edges meet both the side infill and the posts.
- The three raised exterior side connectors now extend from the panel outer face all the way to the post outer plane.
- Connector ramps are integrated into each connector solid rather than modeled as detached triangular meshes.
- Ramp height reduced to 14 mm.
- Middle connector body increased to 124 mm.
- Top and bottom connector bodies remain 92 mm.
- Back panel now uses the complete configured module height and is vertically aligned with the posts.
- Existing L-corner shared-side omission is preserved for the later continuous-corner-shelf pass.

## Static validation

- `node --check bookshelf-configurator/js/app.js`: PASS
- no legacy `addTriangularPrism` helper remains
- no legacy `SIDE_RAIL_EXTRA` constant remains
- shelf width is `innerWidth` (post inner face to post inner face)
- back panel height is `height`
- cache version bumped to `bookshelf-point1-5`
