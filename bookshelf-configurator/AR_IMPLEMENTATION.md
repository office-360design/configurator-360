# Bookshelf Firebase AR

## Deployment

Apply after the Cardbox AR update (`firebase-ar-7`). This patch enables Bookshelf
in the same shared policy, publication allow-list, dialog, and phone page.
Deploy both the website and **Deploy Firebase share backend**. Until the updated
backend has completed, Bookshelf uploads will be rejected as unsupported.

No additional Firebase functions, buckets, IAM roles or Cloud Shell setup are
required. Existing `publishHallAR`, `getHallAR` and `cleanupHallAR` functions use
product id `bookshelf`, the private `configurator-360-hall-ar` bucket and the
existing 24-hour expiry/cleanup. Filenames are `bookshelf.glb` / `bookshelf.usdz`.
The historical Hall names are internal only. Public and tenant-origin checks,
quotas, validated session records, validated assets and private storage stay intact.

Versions: Bookshelf `bookshelf-ar-1`; shared components `firebase-ar-8`.
The existing production Three.js r169 import map is unchanged. No new npm
packages, unpinned runtime downloads or external QR services are introduced.

## Customer workflow

The Bookshelf top-bar AR button opens the existing shared dialog. Android is
selected initially. Publication happens after capture/export; the QR becomes
available only after the existing manifest and asset checks succeed. iOS mode
uses a USDZ export of the same detached configuration. Close and reopen the
modal to capture subsequent changes. Copy link, open-on-device, retry, expiry
and locale switching follow the other AR configurators.

Both modes lead to `/bookshelf-configurator/ar.html` on the active public or
allowed tenant origin. English, Romanian and German use the same canonical
Bookshelf path. The phone page validates product, format and expiry before
exposing the appropriate Android intent or iOS `rel="ar"` link. Scanning a QR
is followed by tapping Open AR on a supported phone; camera access is not
silently requested from the desktop dialog.

The dialog keeps generic preparation messages and the short scan/privacy copy.
It does not display the removed export-detail or scale-description paragraphs.
Bookshelf's quotation controls, hidden cart and hidden Book a demo remain as
before. This patch does not change any quotation function or recipient;
`info@mobila-lemn.ro` remains the factory email.

## Capture contract

`BOOKSHELF_CONFIGURATOR_API.captureARSnapshot({signal})` waits one animation
frame so a previously queued door-toggle completes, then waits for textures
on the current live module and connector groups. It never restores or builds
an alternate default configuration, saves to an account or modifies the editor.
A module rebuild during image loading is picked up on the next readiness check.
Failed images, timeouts, cancellation and invalid/oversized exports fail visibly
rather than dropping finishes or parts. Arrow/W/S shelf shortcuts are ignored
while a modal is open, avoiding invisible edits behind the AR popup.

The adapter clones **both** the furniture group and the separate connector
group into an owned wrapper and applies a single 0.001 millimetre-to-metre scale
before calling `captureProductARSnapshot`. Horizontal placement is centered and
the cabinet base stays at floor height. Group-relative module origins, rotated
L-corner wings, open door pivots, selected finish textures, keyplates and knobs
are preserved. Mobile-friendly standard materials and shared geometry merging
are identical to the existing AR architecture; native lighting/glass can differ
from the desktop renderer.

Included: all selected straight/L modules and dimensional family, the current
shelf counts/positions, fixed shelves, framed backs and planks, plinths, side
assemblies, door leaves, keyholes, chosen hardware and connector fittings.
L-corners remain open-only. Selected door leaves retain their current pose.

Not included: the scene floor, grid, lights, camera, dimensions, +/shelf movement
buttons, and selection helpers. These are not product components. No new editor
geometry, textures, door constraints or shelf movement rules are introduced.
The mobile model is a static snapshot, not an interactive shelving editor.

Android GLB and iOS USDZ use the existing 10 MiB / 24 MiB format caps and shared
300,000-triangle cap. Finishes are embedded, with the shared 1024-pixel texture
limit. Exceeding a limit rejects the export without removing physical parts.

## Automated tests

```bash
node --no-warnings --experimental-loader ./bookshelf-configurator/tests/ar-test-loader.mjs --test bookshelf-configurator/tests/bookshelf-ar.test.mjs
node --test hall-configurator/tests/ar-policy.test.mjs scripts/validation/tenant-branding.test.mjs firebase-share-backend/functions/tests/hall-ar.test.cjs
python bookshelf-configurator/tests/ar-browser.py --artifacts /tmp/bookshelf-ar-tests
```

The new GitHub workflow runs the above plus syntax checks. Python browser tests
require Playwright and Chromium; CI installs the pinned Playwright test runner.

The node tests cover explicit opt-in, locale/tenant URLs, shortened copy, metre
scaling, both roots, detached snapshots, L-wing transforms, moved/removed
shelves, opened doors, hardware, glass, missing parts, texture readiness, aborts,
timeouts, GLB validation and preservation of quotation/top-bar behavior.
Backend tests exercise both formats, private object paths, manifests, HEAD,
byte ranges, expiry, cleanup and tenant entitlement checks with mocked services.

Browser tests load the **actual Bookshelf app, models, wood/metal images, export
adapter and shared dialog** using in-memory import maps. They exercise 14 mixed
three-module configurations: two size classes and open/lower/glazed doors with
both keyplates and knobs. Source mesh counts and dimensional bounds are checked;
14 actual GLBs embed four images each and pass the backend validator (about
0.85–0.97 MiB each). Shelf insertion/removal, automatic lower-door boundary shelf,
independent door poses, selection exclusion, editor invariance, retries, locale
switching, platform reuse, mobile layout and modal keyboard suppression are
covered. Cart/demo remain hidden; the quotation label is retained.

Limitations: offline export tests use the bundled r160 fixture, not production
r169. WebGL drawing, tenant/account services, publication and USDZ binary
creation are simulated in the browser harness. GLB geometry, embedded texture
pixels and the actual dialog are real. These checks do not constitute live
Firebase publication, physical phone placement or a full iOS USDZ export test.
The existing Window validation suite and static build also passed locally.
A complete Pergola production build requires dependency installation in CI.
Hall geometry regression was not rerun locally because the earlier unchanged
panelGeometry.js file was not available in the mounted patch set; its geometry
and adapter are not modified by this patch.

## Phone acceptance checklist

After both deployments complete, make a mixed bookshelf using more than one
finish and at least one L-corner. Reposition/delete/add shelves; configure lower
and glazed doors on straight modules, and open only one leaf. Create an Android
QR, scan, tap Open AR and compare modules, shelf heights/counts, open door,
hardware and finishes. Repeat using iOS in Safari with the same configuration.

Confirm the bookshelf has realistic room scale, rests on the floor, and has no
grid or selection outline. Check behind the assembly for the configured back
planks and connector fittings. Reopen AR after changing family or layout and
verify that the newly scanned QR shows the changes. Check that quotation sending
is still available and that the cart/demo controls have not reappeared.
