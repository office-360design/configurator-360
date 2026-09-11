# Point 1 structural validation — bottom shelf and side walls

This pass changes only the requested structural details while preserving the existing two dimensional families, three finishes, door choices and single L-corner behavior.

## Bottom shelf versus plinth

The lower structure is now split into two independent pieces:

- a thin `22 mm` bottom shelf using the full internal opening width and the regular shelf depth;
- a recessed `78 mm` plinth/base beneath it.

For the 800 mm family the bottom shelf is 716 mm wide while the base is 680 mm wide. For the 900 mm family they are 816 mm and 780 mm respectively. The bottom shelf also overhangs the base in depth.

This intentionally reproduces the reference relationship where the usable bottom shelf projects beyond the support/base below it.

## Closed module sides

Every independent straight module now has both a left and a right vertical side panel between its front/back uprights. These panels are generated per module, so they remain present when two straight modules are connected.

The only intentional exception is the internal shared side of the single L-corner module. Its two wings belong to one corner module and their shared inside remains open so the later corner-shelf continuity work is not blocked.

## Shelf fit

Intermediate shelves now stop at the inside faces of the side panels instead of intersecting through them. The bottom shelf remains wider so the side panels visually sit on it, matching the reference construction.

## Static checks

- `bookshelf-configurator/js/app.js`: `node --check` passed.
- Both documented dimensional families remain unchanged.
- Existing finish textures and Settings/regional-default work are untouched.
- Cache-busting version advanced to `bookshelf-point1-3`.
