# Owned product snapshots for native AR

`buildProductARScene(root, options)` creates an owned, portable mesh scene and returns `{ root, stats, dispose }`. `captureProductARSnapshot(root, options)` serializes that owned scene for asynchronous export and returns `{ model, stats, cacheKey }`.

Each adapter supplies only its product assembly, never the scenery scene. Hidden objects and `userData.arExclude` subtrees are skipped; lights, line helpers and sprites are not product solids. Hall rebuilds a fully assembled design before capture. Window restores inspection translations on a clone. Other adapters capture actual current physical transforms.

Options: `product` for naming, `prepareClone(copy)` for adapter-only adjustments, and optional `groundY` for grade. Without `groundY` the model's lowest point is placed at zero; Hall/Fence pass zero so foundations keep their below-grade depth. Dimensions stay in metres.

Copies preserve per-face materials, draw ranges, instance and vertex colours, thin back faces, negative-transform winding, supported finish maps and UV transforms. Unsupported skinned/morph geometry, missing map pixels or excessive triangles fail before publication. Material properties are portable-PBR approximations; a native renderer is not a pixel-exact Three.js renderer.

Do not dispose source/editor resources or mutate textures while capturing. Dispose the returned scene when done. The serialized copy owns its map pixels; later editor changes cannot alter an in-flight snapshot. Tests live under `shared-3d/tests/ar/`, with adapter/backend tests in their respective products.
