// GUTMANN GCW 050 stick curtain wall, transcribed from the order and processing
// catalogue "Bestellinformationen Fassade GCW" (edition 03.2025):
// https://www.gutmann.de/fileadmin/user_upload/Bausysteme/Produkte/Produkte/GCW_050_060/Bestell-_und_Verarbeitungskatalog/Bestellinformationen_Fassade_GCW.pdf
// Page numbers refer to the printed catalogue pages. Values not given by the
// catalogue are marked as estimates where they are derived.

export const SYSTEM = Object.freeze({
  id: 'GCW050',
  name: 'GUTMANN GCW 050',
  faceWidth: 50, // visible width of mullions and transoms (mm)
  maxInfill: 65, // maximum infill thickness (mm)
  maxPaneKg: 550, // maximum infill weight (kg)
  barLength: 6000, // delivery length of all profiles (mm)
  alloy: 'EN AW-6060 T66',
  E: 70000, // N/mm², static dimensioning chapter
  // Wind deflection limit per DIN EN 13830: l/200, at most 15 mm.
  windDeflection: { ratio: 200, max: 15 },
  // Transom dead load: setting blocks 150 mm from the ends, limit min(3 mm, B/500).
  deadLoad: { blockInset: 150, max: 3, ratio: 500 },
  glassDensity: 25, // kN/m³
  aluminiumDensity: 27, // kN/m³
  classes: Object.freeze({ rainTightness: 'RE1200', windLoad: '2,0 / 3,0 kN/m²', airPermeability: 'AE', impact: 'E5/I5' }),
  catalogueEdition: '03.2025',
});

// Mullion/transom profiles (pages 5–11). Same profile for mullions and
// transoms, straight cuts, no notching. Ix: bending from wind (out of plane);
// Iy: bending in the facade plane (transom dead load). coat: developed length
// for coating, mechanical / anodised (mm). connector: transom joint connector
// (Stoßverbinder); tConnector: T-connector-N for subsequent transom assembly.
export const PROFILES = Object.freeze([
  { id: '150030', depth: 30, Ix: 10.84, Iy: 8.18, coat: [286, 110], connector: '750601', tConnector: null, jointLength: 18, insertLength: 20, tube: '20x40x3', flat: null, page: 5 },
  { id: '150055', depth: 55, Ix: 29.15, Iy: 16.22, coat: [338, 160], connector: '750602', tConnector: '750692', jointLength: 39, insertLength: 40, tube: '40x40x3', flat: '50x8', page: 5 },
  { id: '150075', depth: 75, Ix: 58.91, Iy: 20.57, coat: [378, 200], connector: '750603', tConnector: '750693', jointLength: 59, insertLength: 60, tube: '60x40x3', flat: '70x8', page: 6 },
  { id: '150095', depth: 95, Ix: 100.46, Iy: 24.75, coat: [418, 240], connector: '750604', tConnector: '750694', jointLength: 79, insertLength: 80, tube: '80x40x3', flat: '90x8', page: 6 },
  { id: '150115', depth: 115, Ix: 156.01, Iy: 28.93, coat: [458, 280], connector: '750605', tConnector: '750695', jointLength: 99, insertLength: 100, tube: '100x40x3', flat: null, page: 7 },
  { id: '150135', depth: 135, Ix: 230.8, Iy: 32.91, coat: [498, 320], connector: '750606', tConnector: '750696', jointLength: 119, insertLength: 120, tube: '120x40x3', flat: '130x8', page: 8 },
  { id: '150155', depth: 155, Ix: 350.6, Iy: 41.15, coat: [538, 360], connector: '750607', tConnector: '750697', jointLength: 139, insertLength: 140, tube: '140x40x3', flat: null, page: 9 },
  { id: '150175', depth: 175, Ix: 467.64, Iy: 45.76, coat: [576, 400], connector: '750608', tConnector: '750698', jointLength: 159, insertLength: 160, tube: '160x40x3', flat: '170x8', page: 10 },
  { id: '150195', depth: 195, Ix: 695.53, Iy: 52.13, coat: [618, 440], connector: '750609', tConnector: '750699', jointLength: 179, insertLength: 180, tube: '180x40x3', flat: null, page: 11 },
].map(p => Object.freeze({ ...p, name: `Pfosten/Riegel ${p.depth} mm` })));

export const getProfile = id => PROFILES.find(p => p.id === id) || null;

// The catalogue gives no kg/m. Estimate the wall thickness of an equivalent
// thin-walled 50 × depth tube from Ix (two webs + two flanges), then the mass.
export function estimatedKgPerM(profile) {
  const b = SYSTEM.faceWidth, d = profile.depth, I = profile.Ix * 1e4;
  const t = I / (d ** 3 / 6 + b * d * d / 2);
  const area = t * 2 * (b + d); // mm²
  return area * 2.7e-3; // kg/m, 2700 kg/m³
}

// Pressure strips (page 26) and cover plates (page 24).
export const PRESSURE_STRIPS = Object.freeze({
  159301: { id: '159301', name: 'Druckleiste 6 mm', depth: 6, cover: true, screwSeries: '815', drainage: false },
  159310: { id: '159310', name: 'Druckleiste 10,4 mm, gelocht Ø6 (Drainage)', depth: 10.4, width: 46.6, cover: true, screwSeries: '815', drainage: true, screwShift: -1 },
  159210: { id: '159210', name: 'Druckleiste 10 mm', depth: 10, cover: false, screwSeries: '816', drainage: false },
  159225: { id: '159225', name: 'Druckleiste mit Deckschale 25 mm', depth: 25, cover: false, screwSeries: '816', drainage: false },
  159230: { id: '159230', name: 'Druckleiste mit Deckschale 30 mm', depth: 30, cover: false, screwSeries: '816', drainage: false },
});

export const COVER_PLATES = Object.freeze({
  159012: { id: '159012', depth: 12, coat: [145, 74] },
  159016: { id: '159016', depth: 16, coat: [170, 82] },
  159020: { id: '159020', depth: 20, coat: [186, 90] },
  159025: { id: '159025', depth: 25, coat: [206, 100] },
  159030: { id: '159030', depth: 30, coat: [226, 110] },
});

// Glazing table GCW 050 (glazing chapter, page 2): infill thickness 12–64 mm.
export const GLASS_THICKNESSES = Array.from({ length: 27 }, (_, i) => 12 + 2 * i);

const band = (t, rows) => rows.find(([from, to]) => t >= from && t <= to)?.[2] ?? null;

export const GLASS_SUPPORTS = Object.freeze({
  750632: 'Glasträger 524', 750633: 'Glasträger 532', 750634: 'Glasträger 540', 750635: 'Glasträger 548',
  750636: 'Glasträger 556', 750637: 'Glasträger 564', 750638: 'Glasträger 572',
});
export const INSULATORS = Object.freeze({
  760382: 'Isolator 28 mm', 760383: 'Isolator 37 mm', 760384: 'Isolator 46 mm', 760385: 'Isolator 55 mm',
});
export const GASKETS = Object.freeze({
  outside: { id: '760006', name: 'Verglasungsdichtung (außen)', roll: 50 },
  inside: { id: '760110', name: 'Verglasungsdichtung (innen)', roll: 50 },
});

// Pressure strip screw length (5.5 × L with sealing disc), transcribed row by
// row: 159301 needs one step more than 159310; the 159210/159225/159230 family
// uses the 816 series.
function screwLength(t, stripId) {
  const rows = {
    159301: [[12, 12, 32], [14, 18, 38], [20, 22, 42], [24, 24, 45], [26, 28, 50], [30, 34, 55], [36, 38, 60], [40, 44, 65], [46, 48, 70], [50, 54, 75], [56, 58, 80], [60, 64, 85]],
    159310: [[12, 16, 32], [18, 20, 38], [22, 24, 42], [26, 28, 45], [30, 34, 50], [36, 38, 55], [40, 44, 60], [46, 48, 65], [50, 54, 70], [56, 58, 75], [60, 64, 80]],
    816: [[12, 16, 32], [18, 20, 38], [22, 24, 42], [26, 28, 45], [30, 34, 50], [36, 38, 55], [40, 44, 60], [46, 48, 65], [50, 54, 70], [56, 58, 75], [60, 64, 80]],
  };
  const key = stripId === '159301' || stripId === '159310' ? stripId : '816';
  return band(t, rows[key]);
}

// Components for one infill thickness and pressure strip, or null when the
// thickness is outside the glazing table.
export function glazingComponents(thickness, stripId) {
  const t = Number(thickness);
  const strip = PRESSURE_STRIPS[stripId];
  if (!strip || !GLASS_THICKNESSES.includes(t)) return null;
  const length = screwLength(t, stripId);
  const series = stripId === '159301' || stripId === '159310' ? '815' : '816';
  return {
    thickness: t,
    strip,
    screw: { id: `${series}5${length}`, name: `Fassadenschraube mit Dichtscheibe 5,5 × ${length} mm`, length },
    glassSupport: band(t, [[12, 16, '750632'], [18, 24, '750633'], [26, 32, '750634'], [34, 40, '750635'], [42, 48, '750636'], [50, 56, '750637'], [58, 64, '750638']]),
    insulator: band(t, [[24, 32, '760382'], [34, 40, '760383'], [42, 50, '760384'], [52, 64, '760385']]),
    drainage: strip.drainage ? band(t, [[24, 30, '750029'], [32, 38, '750027'], [40, 64, '750045']]) : null,
    gaskets: [GASKETS.outside.id, GASKETS.inside.id],
  };
}

// Uf of the GCW 050 node (heat calculation diagram, EN ISO 10077-2, screw
// influence ΔU = 0.18 W/m²K included), read at 55 and 195 mm profile depth.
const UF_POINTS = {
  24: [1.515, 1.57], 28: [1.365, 1.41], 32: [1.255, 1.295], 36: [1.18, 1.21], 40: [1.12, 1.145],
  44: [0.985, 1.005], 48: [0.937, 0.953], 52: [0.875, 0.89], 56: [0.83, 0.843], 60: [0.79, 0.8], 64: [0.767, 0.775],
};
export function frameUf(thickness, depth) {
  const keys = Object.keys(UF_POINTS).map(Number);
  if (thickness < keys[0] || thickness > keys.at(-1)) return null;
  const lerp = (a, b, f) => a + (b - a) * f;
  const atDepth = t => { const [u55, u195] = UF_POINTS[t]; return lerp(u55, u195, (depth - 55) / 140); };
  const hi = keys.find(k => k >= thickness), lo = [...keys].reverse().find(k => k <= thickness);
  if (hi === lo) return atDepth(hi);
  return lerp(atDepth(lo), atDepth(hi), (thickness - lo) / (hi - lo));
}

// Common glass build-ups. glass = sum of pane thicknesses (for weight),
// thickness = clamping thickness for the glazing table.
export const GLAZING_PRESETS = Object.freeze([
  { id: 'dgu-24', label: '4-16-4 · dublu', thickness: 24, glass: 8, Ug: 1.1, psi: 0.06 },
  { id: 'dgu-28', label: '6-16-6 · dublu', thickness: 28, glass: 12, Ug: 1.1, psi: 0.06 },
  { id: 'dgu-32', label: '6-20-6 · dublu', thickness: 32, glass: 12, Ug: 1.0, psi: 0.06 },
  { id: 'dgu-36', label: '44.2-20-8 · dublu siguranță', thickness: 36, glass: 16.8, Ug: 1.0, psi: 0.06 },
  { id: 'tgu-44', label: '6-14-4-14-6 · triplu', thickness: 44, glass: 16, Ug: 0.6, psi: 0.04 },
  { id: 'tgu-48', label: '6-16-4-16-6 · triplu', thickness: 48, glass: 16, Ug: 0.6, psi: 0.04 },
  { id: 'tgu-52', label: '44.2-16-4-16-8 · triplu siguranță', thickness: 52, glass: 20.8, Ug: 0.6, psi: 0.04 },
]);

// Opaque spandrel panel (catalogue system description: Up 0.25 W/m²K).
export const SPANDREL = Object.freeze({ Up: 0.25, kgPerM2: 25 });
