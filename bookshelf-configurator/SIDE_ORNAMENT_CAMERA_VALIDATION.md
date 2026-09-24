Bookshelf side-panel proportion + camera-view update

Implemented:
- Middle side-panel ornament body: 48 mm -> 96 mm.
- Upper/lower side-panel ornament bodies: 92 mm -> 276 mm.
- Existing ramp transitions remain in place, so the ornaments grow around the same vertical centers.
- Door toggle now snapshots camera position, camera orientation, and OrbitControls target before the geometry rebuild and restores them afterward.
- This is intended to keep the view pixel-for-pixel stable when a door is opened or closed.
- Cache version advanced to bookshelf-point1-11.
