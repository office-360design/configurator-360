# Project / full integration acceptance

From tiles-configurator:

```sh
node --test tests/*.test.mjs
python tests/run-analysis-dom.py
python tests/run-debug-dom.py
python tests/run-project-dom.py
cd segmentation-service
python -m unittest discover -s server -t . -p 'test_*.py'
```

Browser harness prerequisites: `python -m pip install -r tests/requirements-browser.txt`
and a Chromium executable. Set CHROMIUM_EXECUTABLE for a nonstandard path. The
three DOM suites above work without URL navigation; they use mocked APIs and do
not validate native storage/full-site rendering.

## Native browser storage (not executed in the editing environment)

```sh
python tests/run-project-browser.py
```

This starts an ephemeral local HTTP server, uses real ES modules/Image/WebCrypto/
IndexedDB and a fresh browser context, and tests file import, browser reload,
atomic aborts, two-tab revision conflicts and delayed writes after Clear. It uses
mock application/viewer callbacks, not the real tenant shell or WebGL. Browser
navigation to localhost must be permitted. It does not contact the model service.

## Complete website and WebGL

Start the actual website with its normal tenant/hostname configuration. The
following runner uses a fresh isolated Chromium profile, never signs into an
account, never performs cloud Save/Share, and tests only temporary local projects.
Replace the example URL with the actual page address.

```sh
# REAL frontend and WebGL, synthetic imported result; real inference blocked.
python tests/run-full-site.py --url http://localhost:3000/tiles-configurator/

# REAL frontend, WebGL and configured model service (explicitly sends this image).
python tests/run-full-site.py --url http://localhost:3000/tiles-configurator/ --live-photo /path/to/yard.jpg
```

--timeout-seconds controls the live-model wait (default 900). Optional
--screenshot-dir writes screenshots containing the photograph; store them as
private data. The synthetic fixture only tests plumbing, not model accuracy.
The real-site runner depends on the full repository, model environment and tenant
bootstrap; the changed-files ZIP alone is not a standalone website.

## Additional release checks on the actual deployment

Test account Save/reopen in the SAME browser, then on a clean device. Verify the
second device keeps geometry and holes and requests the exact original photo or
a full `.paving.json` file. Test normal Share creates a photo-free 3D link, without
photo/mask/calibration bytes or precise map location. These authenticated cloud
flows require the operator's own test account and were not run by the editing
assistant.

Check a real large landscape JPEG with EXIF rotation, PNG transparency, WebP,
multiple holes with inner curbs, disconnected areas, all tile patterns including
H-Beton, manual scale correction, local quota errors and photo cache deletion.
Repeat portrait→landscape→portrait and open/close both the right panel and Debug.
Confirm neither toggling diagnostics nor opening a saved project runs inference.

Build the container and validate actual Nginx configuration before deployment.
Test the real gateway's authentication and quotas. Do not label those checks
passed based on synthetic predictors or DOM-only harness results.
