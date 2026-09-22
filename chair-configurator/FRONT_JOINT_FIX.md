# Fitted front armrest / post joint

Release: `20260911-fitted-joint-25`
Browser entry version: `chair-joint-25`

## Scope

Apply this project-relative update over the current Chair implementation (the
latest `chair-24` front-joint cleanup). Only the two front posts, their matching
arm ends, and the removed filler blocks change shape. The existing materials,
wood/fabric catalogues, saved-state format, lighting, shared 3D layer, other
configurators and deployment workflows are not replaced.

The earlier construction intersected full-width prisms and added a small third
mesh. That left coincident exterior surfaces and an exposed notch above the post.
The replacement computes a joint from the actual arm angle, post depth and arm
depth. Both pieces end on the same cut boundary. Neither extends its outer skin
through the other. Internal mating caps are omitted from rendering, so there are
no opposing coincident polygons to resolve. A small eased transition rounds the
upper corner. No filler, depth bias, render-order override or material opacity
workaround is used.

The two wood pieces remain separate meshes with their own longitudinal UV
coordinates. A fixed change of grain direction at the angled join is intentional;
it is not a texture that changes with camera angle. This patch does not redesign
the procedural wood generator or remove unrelated repeat patterns along a member.

## Implementation

- `js/frontArmJoint.js` owns the local joint construction and its version.
- `js/chairGeometry.js` replaces the front post/arm pair and removes both bridge
  blocks. The shared geometry library still owns allocation and disposal.
- `js/scene.js` exposes the joint version in Chair diagnostics and imports the
  updated builder.
- `js/app.js` and `index.html` refresh only the changed entry-point chain.
  Unchanged material, locale and shared-shell module versions are retained.

The cut is computed in the side frame's YZ plane. Both pieces share identical
Float32 boundary coordinates and smooth normals. Each visible skin is confined
to its respective side of that plane. The two skins together form a closed,
consistently wound exterior; the mating interface is not an extra rendered face.
The unequal edge radii recover the existing arm profile over a short front section.
The accepted rear arm endpoint is retained.

## Validation

Run from the repository root (no package installation or Firebase credentials):

```sh
node --test chair-configurator/tests/front-arm-joint.test.mjs
```

14 tests cover both joints: matching boundary positions and normals, disjoint
half-spaces, absence of mating-plane triangles, watertight exterior topology,
finite buffers, unit normals, correct winding, flat grounded feet, retained parts,
continuous length coordinates, deterministic generation and resource disposal.

Additional release checks:

- The existing color-editor suite passes 165/165 tests; tenant usage validation
  also passes. No Firebase source or workflow is changed by this update.
- The other 14 chair meshes retain byte-identical positions, normals, UVs,
  indices and local transforms against the preceding cleanup. Grounding changes
  by approximately 1.14e-8 metres solely from Float32 rounding.
- The actual ChairScene and local material modules were rendered in Chromium
  using software WebGL2 (the Chair's bundled Three.js r160), with network requests
  blocked. These are scene-level checks, not a deployed Firebase/auth sign-off.
- Overview, front, side, inside, underside and mirrored left-joint views were
  inspected. Low, Balanced and High compiled without WebGL errors.
- Reversing post/arm draw order produced pixel-identical renders in all three
  quality settings. Wood/fabric switching was also exercised.
- The final ZIP was reapplied to the baseline and the joint tests rerun.

No cloud deployment was performed during preparation. Mobile/Firefox hardware
performance was not benchmarked.

## Installed-version check

On the Chair configurator, use the browser console:

```js
CHAIR_CONFIGURATOR_API.getDiagnostics().chair.frontJointVersion
// "20260911-fitted-joint-25"
```

The ZIP contains a root `commit_message.md` and project-relative source paths.
Do not install the files inside an extra enclosing folder.
