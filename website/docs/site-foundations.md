# Website Foundations

## Product objective

Create a 2026-grade industrial spatial-computing website that communicates the relationship between interactive 3D configuration, commercial logic, quoting and production outputs.

## Visual environments

### Graphite Observatory

The dark environment uses carbon, graphite, cold metal, restrained cyan illumination and deep spatial layering. Light is functional: it indicates state, measurement and interaction.

### Ceramic Engineering Lab

The light environment uses mineral white, warm silver, ink typography, hard daylight and translucent technical surfaces. It is authored independently from the dark environment rather than produced through color inversion.

## Route map

- `/` — platform homepage
- `/configurators/pergola` — pergola configurator marketing and indexing page
- `/configurators/roof` — roof configurator marketing and indexing page
- `/configurators/window` — window/profile configurator marketing and indexing page

## Homepage content map

1. Platform hero
2. Platform thesis
3. Pergola interactive showcase
4. Roof interactive showcase
5. Window/profile interactive showcase
6. Enterprise capabilities
7. Delivery process
8. Conversion call to action

## Preview interaction contract

- Preview code is written entirely inside `/website`.
- Existing configurators remain external full-featured destinations.
- Desktop showcases use feature rail, 3D scene and commercial explanation.
- One persistent canvas serves every scene, avoiding multiple WebGL contexts and duplicated renderers.
- Only the currently selected procedural model remains visibly resolved; inactive models scale out of view.
- Mobile uses the same single-canvas architecture with a capped device-pixel ratio.
- Reduced-motion preference disables the WebGL renderer and collapses scroll chapters into a readable static layout.

## Performance budgets

- A single Three.js runtime powers the entire spatial narrative and every preview.
- Preview geometry is procedural, compact and independent from the much heavier full configurator applications.
- Device pixel ratio is capped at 1.5 for preview scenes.
- Offscreen scenes release or suspend render loops.
- Homepage maintains stable geometry before interactive media loads.
- Primary copy and metadata render without client-side JavaScript.

## Accessibility foundations

- Complete keyboard access for navigation and scene controls.
- Visible focus treatment in both themes.
- Reduced-motion alternative.
- Minimum WCAG AA text contrast.
- Canvas interactions have equivalent named controls and descriptive text.
- Mobile scrolling remains available until a scene is deliberately activated.

## Change policy

Before any review, run a root repository diff and verify that every changed path begins with `website/`. Nothing is staged, committed or pushed without explicit approval.
