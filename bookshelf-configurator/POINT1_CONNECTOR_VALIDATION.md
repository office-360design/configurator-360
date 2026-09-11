# Bookshelf connector refinement pass

This follow-up refines the aluminium connection hardware so it better matches the reference bookshelf.

## Included updates

1. **No wood/metal face overlap**
   - every connector piece is offset a very small amount outward from the wooden pole faces
   - this avoids the z-fighting / texture-merging effect where metal and wood visually overlap

2. **Placement based on shelf intervals**
   - the lower connector is centered halfway between the floor and the first fixed shelf
   - the upper connector is centered halfway between the top shelf zone and the top of the module
   - connector height is derived from roughly one third of those intervals, with a minimum size to keep it visible

3. **Standalone connector shape**
   - each free front pole now gets a connector that covers:
     - the full front face of the pole
     - half of the left side face
     - half of the right side face
   - this is implemented as one front plate plus two side return plates

4. **Joined connector shape**
   - each module-to-module joint now gets a single wider connector near the bottom and one near the top
   - the connector spans the front faces of both adjacent poles
   - it also wraps onto the outer side face of each of the two joined poles
   - it does **not** render duplicate small inserts at the shared joint

## Files changed

- `bookshelf-configurator/js/app.js`
- `bookshelf-configurator/index.html`

## Cache version

- bumped to `bookshelf-point1-8`
