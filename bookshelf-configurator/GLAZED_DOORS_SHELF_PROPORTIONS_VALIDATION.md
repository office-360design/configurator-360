Bookshelf glazed-door + shelf-proportion update

Implemented:
- PLINTH_HEIGHT increased from 78 mm to 110 mm so the lower zone under the first shelf is taller.
- Added TOP_SHELF_CLEARANCE = 96 mm and updated the compact shelf rhythm accordingly.
- Compact family still has 9 total shelves including the bottom shelf.
- Tall family still keeps the first 8 shelf centers identical to compact and only lifts the 9th shelf by the height delta.
- Lower doors now sit on the shelf front plane instead of projecting noticeably in front of it.
- Glazed doors are rebuilt as full-height framed leaves spanning from the first shelf to the last shelf.
- Each glazed leaf now uses 2 vertical stiles + 3 horizontal rails, with the middle rail aligned to the side middle ornament height.
- Upper field is glazed; lower field is a recessed wood panel with a continuous ramp surround.
- Door-click handling now defers the toggle to the next frame and camera state is restored immediately after rebuild and once more on the following frame.
- Cache version advanced to bookshelf-point1-12.
