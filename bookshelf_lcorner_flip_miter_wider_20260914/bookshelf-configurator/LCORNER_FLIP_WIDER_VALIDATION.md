# L-corner flipped miter + wider footprint validation

## Changes made
- Reworked `addMiteredShelfBoard()` so each corner shelf wing is a simple trapezoid board.
- Flipped the miter orientation to match the user's latest drawing (the right-hand example).
- Increased corner footprint again:
  - compact: 928 × 928 mm
  - tall: 1028 × 1028 mm
- Updated the family dimension strings in EN/RO/DE.
- Bumped the cache version to `bookshelf-point1-23`.

## Expected result
- The two shelf boards in the L-corner should now meet in the opposite orientation compared to the previous build.
- The prior overlap/hole combination should no longer appear.
- Corner doors should have more room because the corner footprint is larger than in the previous build.
