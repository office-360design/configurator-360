# Bookshelf point 1 – connector / metal insert pass

This pass implements the aluminium connector details requested after the plinth/back-post update.

## Included changes

1. **Standalone module hardware**
   - free front uprights now render two flush aluminium inserts each
   - one insert is near the floor and one near the top
   - a single standalone straight module therefore shows four inserts total

2. **Joined-module hardware**
   - each connection between two modules now renders one larger bridge insert near the floor and one near the top
   - the bridge spans across the two adjacent front uprights instead of rendering two small pieces side by side

3. **Alignment**
   - connectors are positioned on the front uprights only
   - inserts are aligned to the front pole faces instead of floating away from the uprights
   - free-end inserts sit at the exposed outer end of the front upright

## Files changed

- `bookshelf-configurator/js/app.js`
- `bookshelf-configurator/index.html`

## Cache version

- cache-busting version bumped to `bookshelf-point1-7`
