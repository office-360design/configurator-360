# L-Corner exact miter + width validation

## Changes made
- Replaced the previous L-corner shelf split polygons with one exact complementary 45° miter seam.
- Removed the extra triangular filler geometry.
- Widened the corner module family footprint from 800/900 to 864/964 so the corner doors have more clearance and no longer crowd each other as tightly.
- Advanced the cache version to `bookshelf-point1-22`.

## Expected result
- Each L-corner shelf is formed by two boards that meet on one diagonal seam.
- No extra triangle remains at the inside corner.
- The previous overlap/hole combination is removed.
- Corner modules render slightly wider than before, giving the corner doors additional closing/opening clearance.
