# Window Configurator — Client Structure

This folder contains the browser-based Three.js window configurator.

The code is divided by responsibility. `main.js` is the application entry point and connects the modules; feature-specific logic should remain in the corresponding module instead of being added back into `main.js`.

## Folder structure

```text
src/client/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── config.js
│   ├── scene.js
│   ├── window-builder.js
│   ├── profile-loader.js
│   ├── profile-controller.js
│   ├── materials.js
│   ├── ui-controls.js
│   ├── component-selection.js
│   ├── house-builder.js
│   ├── house-config.js
│   ├── geometry-utils.js
│   ├── ar-controller.js
│   └── cad-reference.js
├── ar-export.js
├── ar-upload-config.js
├── ar.html
├── ar-viewer.html
├── svg/
├── icons/
├── cad_screenshots/
└── lib/
```

## Main files

### `index.html`

Contains the configurator interface markup.

It includes:

- The top toolbar and side panels
- Dimension and opening controls
- Profile, component, color, and glazing controls
- Exploded-view component popup
- CAD reference and AR modals
- Three.js import map
- External QR and upload libraries
- `css/styles.css`
- The `js/main.js` application entry point

Keep the Three.js import map in this file and place it before `main.js` is loaded.

### `css/styles.css`

Contains all visual styling for the configurator.

Use it for:

- Layout and responsive behavior
- Toolbars, menus, buttons, sliders, and toggles
- Color and finish selectors
- Component lists
- Modals and popups
- Exploded-view selection popup
- AR-mode and capture-mode presentation

### `js/main.js`

The application entry point and coordinator.

It handles:

- Reading URL parameters
- Reading initial width, height, profile, color, glass, opening, and AR settings
- Finding the main DOM elements
- Creating and connecting all controllers
- Sharing state between modules
- Applying externally requested configurations
- Starting profile loading
- Starting the render loop
- Marking the configurator as ready

Avoid placing large feature implementations here. Add them to the relevant module and connect them from `main.js`.

## Configuration and geometry

### `js/config.js`

Contains shared constants and finish definitions.

It handles:

- Supported profile names
- Minimum and maximum window dimensions
- House size-switch thresholds
- Mill, anodized, and RAL finish catalogs
- Fixed profile colors
- Color normalization
- Converting requested colors into finish selections
- Selecting the correct glazing bead for a glass thickness

Use this file when adding a finish, changing a dimension limit, or modifying the glass-thickness-to-bead mapping.

### `js/geometry-utils.js`

Contains reusable, stateless geometry helpers.

It handles:

- Simplifying SVG profile contours
- Reducing unnecessary profile points
- Preserving closed SVG paths
- Creating rounded-rectangle shapes
- Shared profile curve settings

Only generic geometry helpers should be added here. Window-specific assembly belongs in `window-builder.js`.

## Three.js scene and model construction

### `js/scene.js`

Creates the base Three.js environment.

It handles:

- Scene creation
- Camera creation
- WebGL renderer setup
- OrbitControls
- Lighting
- Ground plane
- Grid helper
- Capture-mode renderer settings

It returns the scene objects that the other modules use.

### `js/window-builder.js`

Builds and positions the visible window model.

It handles:

- Creating frame, sash/vent, bead, gasket, and other profile meshes
- Extruding SVG profile shapes
- Constructing the four window sides
- Mitered profile placement
- Glass geometry and placement
- Handle geometry and placement
- Hinges
- Batant and oscilo opening poses
- Exploded-view positions and animation
- Dimension lines
- 10 cm section samples
- Main window, placement, and section groups
- Positioning the window relative to the house

Changes to window geometry, opening behavior, section samples, the handle, or exploded positioning normally belong here.

### `js/house-builder.js`

Builds the optional house environment around the window.

It handles:

- Front and side walls
- Window opening in the front wall
- Floor and gable geometry
- Roof geometry
- House materials
- Small and large house variants
- House visibility
- Ground and grid positioning when the house is enabled

### `js/house-config.js`

Contains the fixed dimensions for the house variants.

It handles:

- Small-house dimensions
- Large-house dimensions
- Deciding which house variant should be used
- Returning the selected house configuration

Change this file when adjusting house proportions or the threshold between house variants.

## Profiles and components

### `js/profile-catalog.js`

Defines the central profile, assembly, glazing-system, accessory-group, and accessory-preset catalog.

The reviewed standalone base profiles `575760`, `575770`, `575780`, and `575790` are registered here. Mullion/transom profiles `575800` and `575810` have converted geometry but remain unregistered until layout integration is implemented.

### `js/profile-coordinate-transform.js`

Fits reviewed standalone profile coordinates to the corresponding legacy complete-assembly section using quarter-turn rotations and translation. Mirroring is not enabled for the registered profiles.

### `js/profile-composition.js`

Builds the runtime component list. It replaces legacy outer-frame and sash base pieces with registered standalone components while retaining the selected complete assembly as the accessory, preset, and alignment source.

### `js/profile-loader.js`

Loads and prepares raw profile data.

It handles:

- Loading profile `metadata.json`
- Loading profile SVG files
- Parsing SVG paths through `SVGLoader`
- Simplifying profile contours
- Detecting material categories
- Reading component roles and aluminum-side metadata
- Loading alternative glazing-bead and gasket shapes
- Loading registered standalone profile metadata and selectable `parts/` SVGs
- Caching loaded profile definitions

This is the low-level data-loading layer. It should not directly manage buttons or menus.

### `js/profile-controller.js`

Manages active profile and component state.

It handles:

- Selecting and loading the current profile
- Composing registered standalone frame/sash geometry with legacy assembly accessories
- Tracking profile readiness
- Active glazing-bead selection
- Active gasket selection
- Glazing-bead offsets
- Component names based on SVG numbers
- Parent groups such as frame, sash/vent, and bead
- Individual component visibility toggles
- Component-category visibility filters
- Component labels and color indicators
- Gasket and glazing-bead preview images
- Refreshing profile materials after finish changes
- Exposing profile data to the window builder and AR controller

Changes to component menus, profile selection, gasket/bead choices, or component grouping normally belong here.

### `js/component-selection.js`

Handles clicking pieces in exploded view.

It handles:

- Pointer raycasting
- Distinguishing a click from camera dragging
- Allowing selection only when exploded view is active
- Reading the SVG component number
- Showing the component parent group
- Applying the selection highlight
- Restoring the original material on deselection
- Opening and closing the bottom-left component popup
- Deselecting by clicking empty space, pressing Escape, rebuilding, or closing the popup

## Materials and finishes

### `js/materials.js`

Manages all configurable materials and aluminum finish state.

It handles:

- Glass and handle materials
- CAD/profile material caching
- Uniform and bicolor modes
- Interior and exterior finish selections
- Mill finish, anodized, and RAL-coated options
- Applying profile colors by aluminum side
- Drainage cover cap exterior color
- Debug colors
- Finish swatches and color controls
- Component color bubbles
- Material refreshes after a finish change
- Finish data used in Odoo, capture, and AR URLs

Changes to color behavior, finish options, material appearance, or bicolor logic normally belong here.

## Interface controls

### `js/ui-controls.js`

Connects interface events to the application controllers.

It handles:

- Width and height sliders
- Increment and decrement buttons
- Debounced size rebuilding
- Glass thickness controls
- Batant and oscilo mode controls
- Opening-angle controls
- Handle-side controls
- Exploded-view toggle
- Section-view visibility
- Window-side visibility controls
- House visibility toggle
- Profile selection
- Sidebar collapse behavior
- CAD reference modal controls
- AR/QR modal controls
- Escape-key behavior
- Browser resize handling

Use this module for DOM event listeners and interface behavior. Model geometry should remain in the builder modules.

## CAD reference images

### `js/cad-reference.js`

Manages the CAD reference gallery.

It handles:

- Loading screenshots for the selected profile
- Trying the screenshot API first
- Falling back to static `images.json` files
- Caching screenshot lists
- Rendering thumbnails
- Selecting the main reference image
- Enabling or disabling the reference button
- Opening and closing the CAD reference modal

### `cad_screenshots/`

Contains profile-specific CAD screenshots and image manifests.

Example:

```text
cad_screenshots/
└── 2_4_Oeffnungselemnt_Vertikal/
    ├── images.json
    └── 2_4_Oeffnungselemnt_Vertikal.png
```

## AR and model export

### `js/ar-controller.js`

Coordinates the AR user flow.

It handles:

- Choosing Android GLB or iOS USDZ output
- Starting model generation
- Publishing assets through the configured upload method
- Generating QR codes
- Downloading generated assets
- AR status and error messages
- WebXR session startup
- Surface hit testing
- Placing the configured window in AR
- Reading current profile, material, handle, and opening state

### `ar-export.js`

Contains the lower-level GLB and USDZ export implementation.

It handles:

- Preparing meshes for export
- Geometry cleanup and simplification
- Triangle-budget optimization
- Retrying exports that exceed file-size limits
- GLB and USDZ validation
- SHA-256 generation
- File downloads
- API uploads
- Direct Supabase uploads
- Export statistics formatting

This file is intentionally outside `js/` because it is also used by the separate AR pages and export workflow.

### `ar-upload-config.js`

Contains deployment-specific AR upload settings.

It defines:

- Upload mode
- Ticket endpoint
- GLB and USDZ triangle targets
- Maximum output sizes
- Static model fallback directory
- Optional custom API endpoint

Do not place secrets in this browser file. It is visible to every site visitor.

### `ar.html`

A standalone model-viewer page for opening an AR model.

It is primarily used as a simple AR launch page and relies on Google's `<model-viewer>` component.

### `ar-viewer.html`

Displays a specifically configured window model in `<model-viewer>` and provides the mobile AR launch experience.

## Assets and third-party code

### `svg/`

Contains the profile SVG files and each profile's `metadata.json`.

The SVG file number is used as the component name shown in the configurator. Metadata identifies component roles, materials, parent groups, offsets, and profile behavior.

### `icons/`

Contains interface preview icons, including glazing-bead and gasket icons.

### `lib/`

Contains the local Three.js modules and addons used by the configurator:

- `three.module.js`
- `OrbitControls.js`
- `SVGLoader.js`
- `GLTFExporter.js`
- Supporting Three.js utilities

Treat these as third-party files. Do not add configurator business logic to this folder.

## Application flow

The normal startup sequence is:

1. `index.html` loads the styles, import map, upload configuration, and `js/main.js`.
2. `main.js` reads URL parameters and initial interface values.
3. `scene.js` creates the Three.js scene.
4. `materials.js` creates the material manager.
5. `profile-loader.js` and `profile-controller.js` load the selected profile.
6. `window-builder.js` builds the window from the loaded profile data.
7. `house-builder.js` creates or hides the optional house.
8. `ui-controls.js` connects the interface to the controllers.
9. `component-selection.js` enables exploded-piece selection.
10. `cad-reference.js` and `ar-controller.js` provide their optional workflows.
11. `main.js` runs the render loop and coordinates rebuilds.

## Where to make common changes

| Change | File |
|---|---|
| Window size limits | `js/config.js` |
| Add or modify RAL/anodized finishes | `js/config.js` and `js/materials.js` |
| Change finish controls or bicolor behavior | `js/materials.js` |
| Change window/profile geometry | `js/window-builder.js` |
| Change SVG loading or metadata parsing | `js/profile-loader.js` |
| Change component grouping or visibility menus | `js/profile-controller.js` |
| Change exploded component selection | `js/component-selection.js` |
| Change house geometry | `js/house-builder.js` |
| Change house preset dimensions | `js/house-config.js` |
| Add or modify UI event behavior | `js/ui-controls.js` |
| Change camera, lights, ground, or renderer | `js/scene.js` |
| Change CAD screenshot gallery behavior | `js/cad-reference.js` |
| Change AR/QR workflow | `js/ar-controller.js` |
| Change GLB/USDZ optimization or upload implementation | `ar-export.js` |
| Change AR size limits or upload mode | `ar-upload-config.js` |
| Change visual styling | `css/styles.css` |
| Change interface markup | `index.html` |

## Module guidelines

- Keep `main.js` focused on initialization and coordination.
- Pass shared dependencies into controller factory functions instead of importing mutable state from `main.js`.
- Keep generic, stateless geometry helpers in `geometry-utils.js`.
- Avoid circular imports between modules.
- Keep DOM event listeners in `ui-controls.js` or the controller that owns the corresponding modal.
- Keep Three.js model construction in builder modules.
- Dispose replaced Three.js geometries and materials where applicable.
- Test profile loading, house toggling, exploded selection, finish changes, and AR generation after moving shared state between modules.

## Running locally

The configurator uses ES modules and must be served over HTTP. Do not open `index.html` directly through a `file://` URL.

From the directory configured as the site's web root, use the project's normal local server or a simple static server, for example:

```bash
python -m http.server 8080
```

Then open the corresponding local HTTP address in a browser.
