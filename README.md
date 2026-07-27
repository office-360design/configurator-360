# Window Configurator — portable QR-to-AR build

This build no longer depends on GitHub Pages or GitHub Actions.

The configurator runs as a small Node web service. When **Scan QR for AR view** is pressed, the browser exports the current Three.js window to a temporary binary glTF file (`.glb`) and uploads it to the same server. The QR points to a minimal mobile page that attempts to open Android's native Google Scene Viewer in AR-only mode.

## Why a hosted HTTPS service is still necessary

The QR must point to an address that the phone can reach, and camera-based AR requires HTTPS. GitHub Pages was only one way to provide that public HTTPS address; GitHub Actions did not generate the AR model.

End users do not run commands or see terminal windows. A developer or administrator deploys the service once, then everyone opens the public URL.

## Recommended deployment without GitHub Actions

The repository includes `render.yaml` and a `Dockerfile`.

### Render

Create a Node Web Service and use:

- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/health`

Render provides a public HTTPS address. This uses Render's normal deployment system, not GitHub Actions.

### Any Node or Docker host

The app can also run on Railway, Fly.io, Azure, AWS, a VPS, the client's own server, or behind an existing HTTPS reverse proxy.

Required runtime values:

- Node.js 20 or newer
- `PORT` supplied by the host, or port `3000`
- write access to the local `generated/` directory

For production, temporary GLB files should eventually be moved to object storage such as S3 or Cloudflare R2. The demo server deletes generated files after 24 hours.

## Local development

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Localhost is useful for desktop development, but a QR scanned by another device still needs a public HTTPS deployment.

## AR flow

1. Configure the window on desktop.
2. Press **Scan QR for AR view**.
3. The current model is exported and uploaded only at that moment.
4. Scan the QR on Android.
5. The minimal page launches native Scene Viewer where supported.
6. If the native viewer cannot be launched, the page falls back to `<model-viewer>` / browser WebXR.

## Compatibility notes

- Native Scene Viewer requires an ARCore-compatible Android device and current Google Play Services for AR.
- Browser WebXR is retained as a fallback, but browser and device support is not universal.
- The previous forced Three.js `local` reference-space setting was removed because it caused `NotSupportedError` on some phones.
- A single user action may still be required by the mobile browser before it opens an external AR viewer or camera.

## DXF/SVG conversion

Place a `.dwg` file in `dwg/`, then use one of the conversion scripts:

```bash
node dwg_to_svg_with_autocad.js <file>.dwg
```

or:

```bash
node dwg_to_svg_with_oda.js <file>.dwg
```

Generated SVG profiles and `metadata.json` files are stored under `svg/`.

## Native AR model compatibility

The AR export path now creates a clean glTF-only copy of the configured window before upload. It removes non-portable vertex attributes, replaces non-finite geometry values, recomputes normals, bakes transforms, and centers the model on the floor. The server validates the GLB structure and serves generated models with explicit content length and byte-range support for Android Scene Viewer.

After deploying this revision, generate a new QR. QR codes created by the previous deployment still reference the older generated GLB files and should not be reused.
