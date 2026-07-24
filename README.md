# Window Configurator

Browser-based Three.js configurator that reconstructs and extrudes window profile sections exported from DWG/DXF.

## Public website and QR-to-AR flow

The repository includes a GitHub Pages workflow at:

```text
.github/workflows/deploy-pages.yml
```

After the repository is pushed to GitHub:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the latest workflow run or the Pages URL shown by GitHub.

Visitors only open the published HTTPS website. They do not run Node.js, Cloudflare Tunnel, command prompts, or local servers.

The desktop configurator has a **Scan QR for AR view** button in the upper-right corner. The QR is generated only when that button is pressed and contains the current:

- CAD profile;
- width and height;
- opening mode and angle;
- exploded-view state;
- enabled/disabled profile components.

Scanning the QR opens a minimal mobile page for that exact configuration. Due to browser security, starting an immersive WebXR camera session requires one explicit tap on **View in AR**. After that, the page has no configurator menus; it detects a surface and places the window automatically. If surface hit testing is unavailable, the model is placed in front of the camera.

### AR requirements

- public HTTPS deployment;
- ARCore-compatible Android phone;
- Google Play Services for AR installed and enabled;
- WebXR-compatible Android browser, normally Google Chrome.

## Optional local development

Local development still supports the existing Node server:

```bash
node server.js
```

Then open `http://localhost:3000`. A QR generated from localhost is intentionally rejected because a phone cannot access that private URL as a secure public WebXR page.

## DXF/SVG conversion

Place a `.dwg` file in `dwg/`, then use one of the conversion scripts:

```bash
node dwg_to_svg_with_autocad.js <file>.dwg
```

1. Place your `.dwg` file in the `dwg/` directory.
2. Run the unified conversion script:
   ```bash
   node convert.js <dwgName>.dwg
   ```
   The script automatically detects and uses whichever conversion engine is installed on your system:
   * **AutoCAD Core Console** (`accoreconsole.exe`): Used as the primary engine if Autodesk AutoCAD 2027 is installed.
   * **ODA File Converter** (`ODAFileConverter.exe`): Used as a fallback if AutoCAD is not detected.
