Bookshelf lower doors interactive refinement

Implemented:
- Added corner filler geometry so the beveled ramp transitions around the inset lower-door panel no longer miss their corner pieces.
- Added a small keyhole on the right lower door, positioned near the center meeting stile similar to the reference.
- Made door meshes interactive: clicking a door leaf toggles that leaf open/closed.
- Lower door leaves open independently.
- Glazed doors also use the same interactive click-to-open logic when selected.
- Door-open state is now stored in module state so it survives re-rendering.
