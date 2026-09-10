# Chair configurator asset provenance

This configurator intentionally does **not** contain a copied or downloaded Nicolas/pCon/Cegim chair mesh.

## Chair geometry

- The chair geometry in `js/chairGeometry.js` is generated procedurally with Three.js primitives and custom buffer geometry.
- No GLB, GLTF, OBJ, FBX, STL, CAD, or other third-party chair-model file is included.
- The referenced chair pages were used only as visual/product-design references and for the stated overall/seat dimensions.
- The procedural implementation is an original configurator asset in this project; it is not an extraction of the pCon model.

## Surface materials

- Wood grain and upholstery detail are generated locally by `js/materials.js`.
- No downloaded wood or fabric photographs/textures are included for the chair.
- Wood species and fabric names are visual material categories, not claims that the generated patterns are supplier-certified scans.

## Runtime library

`lib/three.module.js` and `lib/controls/OrbitControls.js` are the existing Three.js runtime components used by the project. Their embedded license notices remain intact. Three.js is MIT licensed. These are software libraries, not chair meshes or texture assets.

## Reference URLs

- pCon sample supplied for visual behavior/reference: `https://ui.pcon-solutions.com/`
- Cegim Nicolas product page supplied for product reference: `https://www.cegim.ro/produs/nicolas/`
