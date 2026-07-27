# Window Configurator — static WebXR proof of concept

This revision removes the custom mobile application, Scene Viewer, generated GLB uploads, Render web service, and GitHub Actions from the AR flow.

## Architecture

```text
Desktop configurator
    ↓
QR contains a public HTTPS URL plus configuration values
    ↓
The same static website opens on the Android phone in AR mode
    ↓
The phone loads the profile SVG files and rebuilds the window locally
    ↓
WebXR uses ARCore for camera tracking and placement
```

The QR carries:

- CAD profile;
- width and height;
- opening mode and angle;
- exploded-view state;
- enabled profile parts.

It does not contain or upload a 3D model.

## What is required

- The site must be published over HTTPS.
- The phone must be an ARCore-supported Android device.
- Google Play Services for AR must be installed and enabled.
- The AR link must be opened in a WebXR-compatible browser. Google Chrome on Android is the supported test target.
- The user must press **View in AR** once; browsers do not allow a QR link to silently take over the camera.

This proof of concept does not provide custom browser-rendered AR on iPhone because iOS browsers do not expose an equivalent general-purpose handheld WebXR path.

## Fastest free public deployment: Netlify Drop

A ready-to-upload folder is included at:

```text
static-site/
```

1. Sign in to Netlify.
2. Open Netlify Drop.
3. Drag the entire `static-site` folder or the supplied static-site ZIP into the drop area.
4. Open the generated `https://...netlify.app` URL.
5. Configure the window, press **Scan QR for AR view**, and scan the QR with the Android phone.

No repository connection, GitHub Actions, Docker, Node process, or backend is required.

## Alternative: Cloudflare Pages Direct Upload

Create a Pages project using **Direct Upload → Drag and drop**, and upload the contents of `static-site/`. The resulting `pages.dev` address is HTTPS and can be used in the QR flow.

## Local desktop preview

The normal 3D configurator can be tested locally by double-clicking:

```text
START_LOCAL_SITE.vbs
```

or by running:

```powershell
node server.js
```

Local desktop preview does not make the page reachable from the phone. Use the public static deployment for the QR test.

## How AR starts

The phone page first checks:

1. secure HTTPS context;
2. `navigator.xr` availability;
3. support for `immersive-ar`.

When **View in AR** is pressed, the page first requests WebXR with optional surface hit testing. If the browser rejects that configuration, it retries with a basic immersive AR session. When hit testing works, the window is placed on the first detected surface. Otherwise, it is placed in front of the camera as a compatibility fallback.

## Deployment contents

Only these files are required by the public site:

```text
static-site/
├── index.html
├── _headers
└── svg/
```

The Three.js and QR libraries are currently loaded from public CDNs. The profile geometry and configuration data are served from the static site itself.

## Current limitations

- Android WebXR only for the custom camera experience.
- Browser support still depends on the device and ARCore installation.
- The same physical window can appear slightly different between phones because tracking and lighting are device-dependent.
- Advanced occlusion, wall recognition, persistent anchors, and server-side storage are intentionally omitted.

## WebXR compatibility diagnostic

The mobile AR page now exposes two independent tests:

1. **Test basic AR** requests `immersive-ar` with no required or optional features.
2. **Test surface placement** requests a separate `immersive-ar` session with `hit-test` required.

Each test must be started by its own button press. The app deliberately does not retry automatically, because immersive session requests require a fresh user activation.

Interpretation:

- If **Basic AR** fails with `NotSupportedError`, the device/browser environment does not accept even the minimal WebXR AR session. Geometry and window dimensions are not the cause.
- If Basic AR works but Surface Placement fails, immersive AR works but the `hit-test` feature is unavailable or rejected.
- The diagnostics panel prints secure-context status, WebXR availability, browser user agent, and the exact error.


## Deployment/version debugging

This repository previously had two different copies of the page: `index.html` and `static-site/index.html`. The diagnostic build keeps them synchronized and displays a build ID in the lower-right corner.

Before each direct static upload, double-click `PREPARE_STATIC_SITE.vbs` (or run `npm run prepare:static`). Upload the resulting `static-site/` folder. Verify the deployed build by opening `/version.json` on the public domain. The build shown there must match the badge on both desktop and phone. The QR also carries the originating build ID and the phone page warns when it receives a different cached version.

The mobile page includes:

- **Test basic AR**: minimal `requestSession('immersive-ar')`;
- **Test surface placement**: the same session with required hit testing;
- **Official WebXR test**: opens the standards sample;
- **Native AR sample**: launches Google's official known-good Avocado asset through Scene Viewer to isolate WebXR from the native AR runtime;
- **Copy diagnostics** and **Reload latest**.

If `isSessionSupported('immersive-ar')` reports true but the minimal request returns `NotSupportedError`, the failure occurs in Chrome/ARCore before any window geometry is used.
