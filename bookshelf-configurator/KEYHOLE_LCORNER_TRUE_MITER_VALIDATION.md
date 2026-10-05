Validation summary: unified keyhole + true L-corner miter

Implemented:
- Both the wood stile and metal rhombus use createUnifiedKeyholePath(), so their perforations are geometrically identical.
- The keyhole circle and stem form one continuous outline instead of two shapes joined by a visible separator.
- L-corner shelf wings now use complementary polygons whose diagonal boundaries are identical in world space.
- The two wood pieces fill the same L-shaped shelf area without overlapping faces or leaving a hole between them.
- Cache version advanced to bookshelf-point1-20.
