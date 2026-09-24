# Bookshelf connector refinement pass 2

This pass focuses only on the remaining visual issues the client identified in the aluminium connector details.

## Included updates

1. **Much thinner inserts**
   - connector face thickness reduced from 7 mm to 1.6 mm
   - side return thickness reduced from 7 mm to 1.6 mm
   - outward offset reduced to 0.08 mm-equivalent scene units so the parts read as almost flush with the post

2. **Corners closed visually**
   - the front connector strip now extends slightly past the side returns
   - the side returns also extend slightly forward
   - this removes the visibly missing front corners and makes the connector read as one continuous formed piece instead of three detached blocks

3. **Photorealistic grey aluminium finish**
   - replaced the flat grey material with a brushed-metal canvas texture
   - upgraded the connector material to `MeshPhysicalMaterial`
   - tuned roughness / metalness / clearcoat for a more realistic aluminium look

4. **Previously approved placement retained**
   - bottom and top connector placement logic remains based on the floor-to-first-shelf and last-shelf-to-top intervals
   - standalone and bridge connector coverage rules remain unchanged from the previous pass

## Files changed

- `bookshelf-configurator/js/app.js`
- `bookshelf-configurator/index.html`

## Cache version

- bumped to `bookshelf-point1-9`
