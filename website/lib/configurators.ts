export type ConfiguratorSlug = "pergola" | "roof" | "window" | "hall" | "solar";

export type Configurator = {
  slug: ConfiguratorSlug;
  index: string;
  category: string;
  title: string;
  shortTitle: string;
  statement: string;
  description: string;
  launchUrl: string;
  accent: string;
  controls: string[];
  features: { title: string; short: string; body: string }[];
  outputs: string[];
  seoH1: string;
  seoTitle: string;
  seoDescription: string;
};

export const configurators: Configurator[] = [
  {
    slug: "pergola",
    index: "01",
    category: "Outdoor architecture",
    title: "Pergola & Outdoor Architecture",
    shortTitle: "Pergola",
    statement: "Engineer daylight. Configure atmosphere.",
    description:
      "A spatial sales and engineering system for configurable outdoor structures—combining geometry, louver behavior, environmental simulation, accessories and live commercial logic.",
    launchUrl: "https://www.360configurator.com/pergola-configurator/",
    accent: "#58c8ff",
    controls: ["Louver 0°", "Louver 48°", "Night + LED"],
    features: [
      { title: "Parametric structure", short: "Structure", body: "Define the pergola footprint, overall height and installation condition while posts, beams, spans and concealed drainage rebuild as one coordinated structure. Dimensional changes remain connected to the physical assembly instead of simply stretching a decorative model." },
      { title: "Louver & daylight control", short: "Louvers", body: "Change blade orientation and scrub the louver angle against a live sun position. The scene reveals how every setting affects openness, shade, direct light and rain protection, giving customers a meaningful preview before the structure is manufactured or installed." },
      { title: "Four-side enclosure system", short: "Enclosures", body: "Treat every elevation as an independent configurable zone. Leave it open or add pull-down screens, motorized zip screens, horizontal privacy louvers or frameless sliding glass, with position and openness represented directly on the spatial model." },
      { title: "Climate & integrated lighting", short: "Lighting", body: "Move between daylight and night, then configure perimeter LEDs, color temperature, integrated spotlights and infrared heaters. Environmental lighting and shadows respond with the product so customers can judge both architectural presence and practical comfort." },
      { title: "Automation & sensing", short: "Automation", body: "Choose manual, remote or wall-switch control and coordinate automated components with their mounting positions. Rain and wind sensors can become part of the same configuration state, connecting visible product choices with the behavior expected after installation." },
      { title: "Commercial resolution", short: "Live price", body: "Dimensions, enclosure lengths, automation choices, lighting and every selected accessory feed the commercial model continuously. Each valid decision recalculates the project total immediately, keeping the visual product and the sales conversation synchronized without a separate spreadsheet pass." },
    ],
    outputs: ["Live quote", "Configured geometry", "Accessory schedule", "Customer snapshot"],
    seoH1: "3D Pergola Configurator Online",
    seoTitle: "3D Pergola Configurator Online | Design Pergolas",
    seoDescription: "Design and configure a pergola online in 3D. Adjust dimensions, louvers, side enclosures, lighting, automation, accessories and live pricing.",
  },
  {
    slug: "roof",
    index: "02",
    category: "Parametric construction",
    title: "Architectural Roof & Structure",
    shortTitle: "Roof systems",
    statement: "Complex geometry. Buildable answers.",
    description:
      "A rule-driven architectural configurator that turns roof shape, dimensions and material systems into measurable geometry and production-ready outputs.",
    launchUrl: "https://www.360configurator.com/roof-configurator/",
    accent: "#7da6ff",
    controls: ["Gable", "Metal", "L-shape"],
    features: [
      { title: "Five roof typologies", short: "Roof forms", body: "Move between two-slope, four-slope, single-slope, L-shaped and dormer roof families inside one rule-driven scene. Each typology is generated as meaningful geometry, allowing the same configurator to resolve very different architectural conditions without relying on a fixed model library." },
      { title: "Custom-plan intake", short: "Plan intake", body: "Bring PDF, image, DWG or DXF references into the workflow when a project falls outside the standard parametric families. The intake path creates a clear bridge between conventional architectural documentation and a future configurable, measurable roof state." },
      { title: "Five-axis dimension control", short: "Dimensions", body: "Tune length, depth, wall height, roof pitch and eaves overhang independently while the entire roof envelope rebuilds in real time. The result remains visually coherent and measurable, making dimensional exploration useful for both customer decisions and technical estimation." },
      { title: "Covering-aware geometry", short: "Materials", body: "Apply metal and mineral covering presets with their own surface behavior and minimum-pitch rules. Material selection affects more than appearance: it informs compatible geometry, quantity logic and the commercial interpretation of the roof being configured." },
      { title: "Measured construction output", short: "Quantities", body: "Derive roof area, ridge length, eaves, valleys, flashings, gutters and associated component quantities directly from the generated geometry. Complex forms such as L-shaped roofs and dormers remain connected to measurable construction data as dimensions change." },
      { title: "BOM and CSV handoff", short: "BOM export", body: "Inspect the current roof as priced, component-level line items and export the bill of materials as structured CSV data. The same configuration can move from visual exploration into estimating, procurement or production workflows without being reconstructed manually." },
    ],
    outputs: ["Bill of materials", "CSV quote", "Dimension schedule", "Roof geometry"],
    seoH1: "3D Roof Configurator Online",
    seoTitle: "3D Roof Configurator Online | Roof Design & BOM",
    seoDescription: "Configure roof geometry online in 3D. Set dimensions, pitch, roof type and materials, then calculate quantities, BOM data and CSV quote outputs.",
  },
  {
    slug: "window",
    index: "03",
    category: "High-precision systems",
    title: "Window & Architectural Profile",
    shortTitle: "Profile systems",
    statement: "See the engineering inside the product.",
    description:
      "A high-fidelity technical configuration environment for architectural profile systems, bicolor finishes, opening behavior and exploded assembly analysis.",
    launchUrl: "https://www.360configurator.com/window-configurator/",
    accent: "#0761AA",
    controls: ["Assembled", "Bicolor", "Exploded"],
    features: [
      { title: "Exact system construction", short: "AW CT 65", body: "Configure the Schüco Window System AW CT 65 B2-6 from its actual extrusion profiles, glazing, seals, bead and hardware relationships. The preview preserves the construction logic of the selected system rather than approximating it with a generic window asset." },
      { title: "Parametric dimensions", short: "Dimensions", body: "Change width and height through constrained system limits while connected frame, sash, glazing and hardware elements rebuild together. This allows commercial sizing exploration without disconnecting the visible result from the underlying architectural profile system." },
      { title: "Glass-stack compatibility", short: "Glass stack", body: "Adjust glazing thickness and immediately see which gasket and glazing-bead codes remain compatible with the selected glass stack. Their actual section illustrations update beside the controls, making an otherwise invisible technical dependency understandable to both specialists and customers." },
      { title: "Opening mechanics", short: "Opening", body: "Switch between side-hung and tilt operation, then scrub the opening angle to inspect how the sash moves through space. Product behavior becomes part of the sales experience instead of being left to diagrams, assumptions or a later technical conversation." },
      { title: "Independent surface finishes", short: "Finishes", body: "Specify a uniform finish or separate interior and exterior treatments across mill, anodized and powder-coated systems. Bicolor decisions remain attached to the same configuration, helping customers understand how one window can respond differently to façade and interior requirements." },
      { title: "Assembly diagnostics", short: "Diagnostics", body: "Explode the complete window, reveal color-coded material families in debug mode or isolate a precise profile section for close inspection. These technical views expose extrusion, seal, glazing and thermal relationships without forcing the user to leave the configured product." },
    ],
    outputs: ["Configured assembly", "Component breakdown", "Finish specification", "Technical snapshot"],
    seoH1: "3D Window Configurator Online",
    seoTitle: "3D Window Configurator Online | Window & Profile Systems",
    seoDescription: "Configure windows online in 3D with parametric dimensions, profile systems, glazing, bicolor finishes, opening simulation and exploded technical views.",
  },
  {
    slug: "hall",
    index: "04",
    category: "Industrial structures",
    title: "Industrial Hall & Warehouse",
    shortTitle: "Hall systems",
    statement: "Configure the envelope. Resolve the structure.",
    description: "A parametric industrial-building system that coordinates portal frames, secondary steel, cladding and access geometry in one responsive spatial model.",
    launchUrl: "https://www.360configurator.com/hall-configurator/",
    accent: "#359CE7",
    controls: ["Frame spacing", "Envelope", "Exploded"],
    features: [
      { title: "Parametric building envelope", short: "Envelope", body: "Length, span, eaves height and roof pitch rebuild the complete industrial volume while maintaining a coherent portal-frame system, ridge geometry and usable internal clearance." },
      { title: "Engineered frame spacing", short: "Frames", body: "A target bay spacing resolves automatically into a practical frame count and actual equal bay spacing, keeping the structural rhythm synchronized with the building length." },
      { title: "Structure duty presets", short: "Duty", body: "Switch between light, standard and heavy structural presets to communicate how primary sections, visual weight and the intended operational duty change together." },
      { title: "Access geometry", short: "Access", body: "Configure the roller-door width and height inside the available façade, with the opening remaining constrained by the hall span and eaves height." },
      { title: "Layer visibility", short: "Layers", body: "Toggle cladding and secondary members independently to move from the finished envelope to the structural logic beneath it without loading a separate technical model." },
      { title: "Exploded assembly", short: "Explode", body: "Separate envelope, secondary steel and primary portal frames into a legible construction sequence, then return to the coordinated assembled building in one interaction." },
    ],
    outputs: ["Configured geometry", "Frame schedule", "Envelope quantities", "Access specification"],
    seoH1: "3D Industrial Hall Configurator",
    seoTitle: "3D Industrial Hall Configurator | Warehouse Design",
    seoDescription: "Configure an industrial hall or warehouse in 3D. Adjust dimensions, portal frames, structural spacing, cladding, access openings and building layers.",
  },
  {
    slug: "solar",
    index: "05",
    category: "Energy systems",
    title: "Solar Roof & Energy System",
    shortTitle: "Solar systems",
    statement: "Model the roof. Simulate the energy day.",
    description: "A location-aware photovoltaic configurator connecting roof geometry, panel fit, real solar position, household demand and battery storage in one visual energy model.",
    launchUrl: "https://www.360configurator.com/solar-configurator/",
    accent: "#359CE7",
    controls: ["Location", "Solar time", "Energy model"],
    features: [
      { title: "Address-aware solar context", short: "Location", body: "Resolve a Romanian project address into geographic coordinates and use that location as the context for solar position, sunrise, sunset and regional production assumptions." },
      { title: "Real sun and seasons", short: "Sun", body: "Scrub time of day, date, season and roof-front bearing while the visible light direction and photovoltaic production profile respond to the same environmental state." },
      { title: "Parametric solar roof", short: "Roof", body: "Move between two-slope, four-slope and single-slope roofs, then adjust length, depth and pitch while the building and available panel surfaces rebuild together." },
      { title: "Physical PV array fit", short: "PV array", body: "Choose the number of requested modules and roof plane; the preview arranges a real-size residential array and keeps the installed system power tied to panels that actually fit." },
      { title: "Demand and storage model", short: "Storage", body: "Compare household consumption profiles, enable LiFePO₄ storage and tune battery capacity to see how generation, self-consumption and grid exchange change across the day." },
      { title: "Energy analytics", short: "Analytics", body: "Open a focused production-versus-consumption workspace with daily generation, household demand, self-sufficiency, grid import and export presented as one decision-ready view." },
    ],
    outputs: ["System estimate", "Installed kWp", "Daily energy profile", "Storage scenario"],
    seoH1: "3D Solar System Configurator",
    seoTitle: "3D Solar Configurator | PV System & Roof Design",
    seoDescription: "Configure a residential solar system in 3D with roof geometry, panel layout, sun position, household consumption, battery storage and energy analysis.",
  },
];

export function getConfigurator(slug: string) {
  return configurators.find((item) => item.slug === slug);
}
