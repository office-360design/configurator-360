# Window Configurator (3D DWG Profile Extruder)

An interactive 3D WebGL tool built with **Three.js** to visualize, extrude, and inspect window profiles directly from CAD drawings (DWG/DXF).

---

## Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Install Dependencies
Install the required parser libraries:
```bash
npm install
```

### 3. Run the Web Server
Launch the development server:
```bash
node server.js
```
The server will run on [http://localhost:3000](http://localhost:3000) and automatically open the application in your default browser.

---

## DXF/SVG Conversion (Optional)

To convert new CAD profiles from DWG to the application's SVG/JSON format:

1. Place your `.dwg` file in the `dwg/` directory.
2. Run one of the conversion scripts depending on your installed CAD conversion engine:

   * **AutoCAD Core Console (Recommended)**:
     Uses the Autodesk AutoCAD 2027 Core Console (`accoreconsole.exe`) to perform high-fidelity block exports.
     ```bash
     node dwg_to_svg_with_autocad.js <dwgName>.dwg
     ```

   * **ODA File Converter**:
     Uses the standalone ODA File Converter (`ODAFileConverter.exe`).
     ```bash
     node dwg_to_svg_with_oda.js <dwgName>.dwg
     ```
