import { z } from 'zod';

export const PRODUCT_IDS = ['fence', 'roof', 'hall', 'pergola', 'solar', 'window'] as const;
export type ProductId = typeof PRODUCT_IDS[number];
export type JsonObject = Record<string, unknown>;

export type Question = {
  id: string;
  label: string;
  type: 'choice' | 'number' | 'boolean' | 'text' | 'array';
  required: boolean;
  choices?: readonly string[];
  choiceLabels?: Readonly<Record<string, string>>;
  unit?: string;
  min?: number;
  max?: number;
  default?: unknown;
  when?: string;
  suppliedByTool?: 'search_solar_locations';
};

export type ProductSpec = {
  id: ProductId;
  title: string;
  description: string;
  baseUrl: string;
  questions: Question[];
};

const choice = (id: string, label: string, choices: readonly string[], defaultValue: string, when?: string, choiceLabels?: Readonly<Record<string, string>>): Question => ({
  id, label, type: 'choice', required: true, choices, choiceLabels, default: defaultValue, when,
});
const number = (id: string, label: string, unit: string, min: number, max: number, defaultValue: number, when?: string): Question => ({
  id, label, type: 'number', required: true, unit, min, max, default: defaultValue, when,
});
const bool = (id: string, label: string, defaultValue: boolean, when?: string): Question => ({
  id, label, type: 'boolean', required: true, default: defaultValue, when,
});
const text = (id: string, label: string, defaultValue: string, when?: string): Question => ({ id, label, type: 'text', required: true, default: defaultValue, when });
const optional = (question: Question): Question => ({ ...question, required: false });

export const CATALOG: Record<ProductId, ProductSpec> = {
  fence: {
    id: 'fence', title: 'Fence', description: 'Parametric aluminium or mesh fence layouts with gates.',
    baseUrl: 'https://aks.360configurator.com/fence-configurator/',
    questions: [
      choice('layout', 'Fence layout', ['straight', 'l', 'u', 'closed', 'closed5'], 'straight'),
      number('runA', 'Run A length', 'm', 2, 30, 8), number('runB', 'Run B length', 'm', 2, 20, 5, 'layout != straight'),
      number('runC', 'Run C length', 'm', 2, 20, 5, 'layout in [u, closed, closed5]'),
      number('runD', 'Run D length', 'm', 2, 20, 5, 'layout == closed5'), number('angleB', 'Corner angle at B', 'deg', 30, 150, 90, 'layout != straight'),
      number('height', 'Fence height', 'm', 0.8, 2.6, 1.8), number('targetBayWidth', 'Target bay width', 'm', 1, 3, 2),
      choice('panelStyle', 'Panel system', ['vertical', 'horizontal', 'privacy', 'mesh'], 'vertical'),
      choice('finish', 'Finish', ['anthracite', 'black', 'white', 'bronze', 'wood'], 'anthracite'),
      number('infillGap', 'Slat gap', 'm', 0.015, 0.12, 0.035, 'panelStyle in [vertical, horizontal]'),
      choice('foundation', 'Post foundation', ['concrete', 'baseplate'], 'concrete'),
      { id: 'gates', label: 'Gates: none, or type (pedestrian/driveway), run letter, zero-based bay position, and handing (left/right)', type: 'array', required: true, default: [] },
      optional(bool('scenery', 'Show surrounding scenery', false)),
    ],
  },
  roof: {
    id: 'roof', title: 'Roof', description: 'Roof geometry, covering, drainage-ready metrics, and BOM.',
    baseUrl: 'https://aks.360configurator.com/roof-configurator/',
    questions: [
      choice('roofType', 'House / roof shape', ['gable', 'hip', 'shed', 'lshape', 'dormer'], 'gable', undefined, {
        gable: 'two-slope / gable', hip: 'four-slope / hip', shed: 'single-slope / shed', lshape: 'L-shaped', dormer: 'two-slope with dormer',
      }),
      number('length', 'Building length', 'm', 3, 30, 10), number('depth', 'Building depth', 'm', 3, 20, 7),
      number('wallHeight', 'Wall height', 'm', 2, 8, 3), number('pitch', 'Roof pitch', 'deg', 5, 55, 30),
      number('overhang', 'Eaves overhang', 'm', 0, 1.2, 0.45),
      choice('covering', 'Roof covering', ['generic', 'roca', 'teclado'], 'generic'),
      choice('roofColor', 'Roof colour', ['#7f1d2d', '#293544', '#684230', '#8a3428', '#315449'], '#7f1d2d'),
      optional(number('sunPosition', 'Preview sun position', '%', 0, 100, 42)), optional(number('northDirection', 'North direction', 'deg', 0, 359, 0)),
      optional(bool('nightPreview', 'Show night preview', false)), optional(bool('technicalEdges', 'Show technical edge overlay', false)),
    ],
  },
  hall: {
    id: 'hall', title: 'Warehouse / Hall', description: 'Industrial hall structure, envelope, openings, and services.',
    baseUrl: 'https://aks.360configurator.com/hall-configurator/',
    questions: [
      number('length', 'Hall length', 'm', 6, 100, 24), number('width', 'Hall width', 'm', 4, 40, 12),
      number('eaveHeight', 'Eave height', 'm', 2.5, 15, 5), number('pitch', 'Roof pitch', 'deg', 3, 30, 12),
      number('targetBaySpacing', 'Target frame spacing', 'm', 3, 10, 6), choice('structurePreset', 'Structure duty', ['light', 'standard', 'heavy'], 'standard'),
      choice('claddingProfile', 'Cladding', ['trapezoidal', 'sandwich', 'standing-seam'], 'sandwich', undefined, { trapezoidal: 'trapezoidal steel sheet', sandwich: 'sandwich panel', 'standing-seam': 'standing-seam roof' }),
      choice('wallColor', 'Wall colour', ['#d6d9dc', '#ffffff', '#9ca3af', '#374151'], '#d6d9dc'),
      choice('roofColor', 'Roof colour', ['#36424b', '#7f1d2d', '#315449'], '#36424b'),
      choice('buildingUse', 'Building use', ['general', 'workshop', 'food', 'cold'], 'general', undefined, { general: 'general purpose', workshop: 'workshop', food: 'food production', cold: 'cold storage' }),
      choice('climateSystem', 'Climate system', ['none', 'comfort', 'chilled', 'frozen'], 'none', undefined, { none: 'none', comfort: 'comfort HVAC', chilled: 'chilled', frozen: 'frozen' }),
      bool('secondaryStructure', 'Include secondary structure', true), bool('slab', 'Include concrete slab', true),
      bool('highBayLighting', 'Include high-bay lighting', true), bool('fireSprinklers', 'Include fire sprinklers', false),
      bool('roofSkylights', 'Include roof skylights', false), bool('gutters', 'Include gutters', true),
      bool('warehouseRacking', 'Include warehouse racking', false),
      optional(bool('showCladding', 'Show wall and roof cladding in the 3D preview', true)),
      optional(bool('explodedView', 'Explode the hall assembly in the 3D preview', false)),
      optional(bool('nightPreview', 'Show night preview', false)),
      { id: 'openings', label: 'Wall openings: none, or type (garage/personnel/window), wall side, width, height, centre offset and bottom height in metres', type: 'array', required: true, default: [] },
    ],
  },
  pergola: {
    id: 'pergola', title: 'Pergola', description: 'Bioclimatic pergola with sides, automation, services, and accessories.',
    baseUrl: 'https://aks.360configurator.com/pergola-configurator/',
    questions: [
      optional(choice('model', 'Model', ['premium'], 'premium')), choice('installation', 'Installation', ['freestanding', 'wall-mounted'], 'freestanding'),
      choice('mountedSide', 'Wall-mounted side', ['front', 'right', 'back', 'left'], 'back', 'installation == wall-mounted'),
      number('widthMm', 'Width', 'mm', 2000, 20000, 5000), number('depthMm', 'Depth', 'mm', 2000, 20000, 3500), number('heightMm', 'Height', 'mm', 2000, 3000, 2700),
      choice('roofOrientation', 'Louver orientation', ['width', 'depth'], 'width'), number('louverTilt', 'Louver tilt', 'deg', 0, 90, 28),
      choice('frameColor', 'Frame colour', ['#26343c', '#111827', '#e5e7eb', '#8a5734'], '#26343c'),
      choice('louverColor', 'Louver colour', ['#64727b', '#26343c', '#e5e7eb'], '#64727b'),
      choice('drainage', 'Drainage', ['integrated', 'external'], 'integrated'), choice('automation', 'Automation', ['remote', 'wall-switch', 'manual'], 'remote'),
      { id: 'sides', label: 'Side closings by boundary or grid segment: none, or side/segmentId plus type (screen, motorized-screen, privacy-wall, glass)', type: 'array', required: true, default: [] },
      bool('perimeterLed', 'Perimeter LED lighting', false), optional(bool('nightPreview', 'Show night preview', false)),
      optional(number('sunPosition', 'Preview sun position', '%', 0, 100, 35)), optional(number('northDirection', 'North direction', 'deg', 0, 359, 0)),
      optional(choice('season', 'Preview season', ['winter', 'summer', 'studio'], 'winter')), number('spotlightCount', 'Spotlight count', 'pcs', 0, 192, 0),
      { id: 'spotlights', label: 'Optional exact spotlight placements by roof rectangle: rectangleId and count (set visually in the 3D preview)', type: 'array', required: false },
      number('heaterCount', 'Heater count', 'pcs', 0, 80, 0), bool('rainSensor', 'Rain sensor', false), bool('windSensor', 'Wind sensor', false),
      bool('speaker', 'Integrated speaker', false), bool('outlet', 'Power outlet', false),
      bool('transportation', 'Transportation service', false), bool('assembly', 'Assembly service', false), bool('warranty', 'Extended warranty', true),
    ],
  },
  solar: {
    id: 'solar', title: 'Solar', description: 'Residential PV array, consumption, storage, and production estimate.',
    baseUrl: 'https://aks.360configurator.com/solar-configurator/',
    questions: [
      choice('roofType', 'Roof type', ['gable', 'hip', 'shed'], 'gable', undefined, { gable: 'two-slope / gable', hip: 'four-slope / hip', shed: 'single-slope / shed' }), number('length', 'Roof length', 'm', 5, 20, 10),
      number('depth', 'Roof depth', 'm', 4, 14, 7), number('pitch', 'Roof pitch', 'deg', 5, 55, 30),
      optional(number('roofBearingDeg', 'Roof front bearing (adjustable in the 3D preview)', 'deg', 0, 359, 180)),
      optional(number('environmentLocalEastM', 'House offset east in loaded context (adjustable in the 3D preview)', 'm', -60, 60, 0)),
      optional(number('environmentLocalNorthM', 'House offset north in loaded context (adjustable in the 3D preview)', 'm', -60, 60, 0)),
      choice('modulePreset', 'Solar module', ['standard475', 'compact450', 'premium490'], 'standard475'),
      number('panelCount', 'Panel count', 'pcs', 1, 80, 12), number('panelColumns', 'Panel columns', 'pcs', 1, 10, 4),
      choice('moduleOrientation', 'Module orientation', ['portrait', 'landscape'], 'portrait'), choice('roofSide', 'Roof plane', ['best', 'front', 'back', 'both'], 'best', undefined, { best: 'automatically choose the better plane', front: 'front plane', back: 'back plane', both: 'both planes' }),
      choice('gridConnection', 'Grid connection', ['single', 'three'], 'single'), number('monthlyBillRon', 'Monthly electricity bill', 'RON', 0, 100000, 400),
      number('energyTariffRon', 'Energy tariff', 'RON/kWh', 0.05, 20, 1.3),
      choice('locationMode', 'Location precision', ['region', 'exact'], 'region'),
      { id: 'locationQuery', label: 'Installation address or city (a complete numbered Romanian address is resolved automatically)', type: 'text', required: false },
      choice('region', 'Regional production reference', ['dobrogea', 'muntenia', 'moldova', 'transylvania', 'northwest'], 'muntenia', 'locationMode == region'),
      bool('exactLocationConsent', 'Use the confirmed exact location for PVGIS and optional Google Solar analysis', false, 'locationMode == exact'),
      { id: 'locationLat', label: 'Confirmed exact latitude', type: 'number', required: false, unit: 'degrees', min: -90, max: 90, when: 'locationMode == exact', suppliedByTool: 'search_solar_locations' },
      { id: 'locationLon', label: 'Confirmed exact longitude', type: 'number', required: false, unit: 'degrees', min: -180, max: 180, when: 'locationMode == exact', suppliedByTool: 'search_solar_locations' },
      { id: 'locationLabel', label: 'Confirmed exact location', type: 'text', required: false, when: 'locationMode == exact', suppliedByTool: 'search_solar_locations' },
      choice('consumptionProfile', 'Daytime consumption profile', ['low', 'partial', 'high'], 'partial'),
      bool('batteryEnabled', 'Include battery storage', true), bool('batteryAutoSize', 'Automatically size battery', true, 'batteryEnabled'),
      number('batteryCapacityKWh', 'Battery capacity', 'kWh', 2, 20, 5, 'batteryEnabled && !batteryAutoSize'),
      optional(number('mountingPricePerPanelRon', 'Mounting price per panel', 'RON', 0, 100000, 430)), optional(number('installationPricePerKwpRon', 'Installation price per kWp', 'RON', 0, 100000, 1100)),
      optional(number('paperworkPriceRon', 'Design and paperwork', 'RON', 0, 1000000, 1800)), optional(number('batteryPricePerKWhRon', 'Battery price per kWh', 'RON', 0, 100000, 1960)),
      optional(number('vatRatePct', 'VAT rate', '%', 0, 50, 21)),
    ],
  },
  window: {
    id: 'window', title: 'Window', description: 'Aluminium window geometry, profiles, glazing, openings, and finishes.',
    baseUrl: 'https://aks.360configurator.com/window-configurator/',
    questions: [
      number('widthM', 'Overall width', 'm', 0.3, 8, 1.2), number('heightM', 'Overall height', 'm', 0.3, 4, 1.4),
      choice('layoutId', 'Window layout', ['single', 'vertical-divider', 'vertical-fixed-fixed', 'vertical-fixed-fixed-fixed', 'vertical-sash-sash', 'horizontal-divider', 'horizontal-fixed-fixed', 'horizontal-fixed-fixed-fixed', 'top-fixed-bottom-sash-sash'], 'single', undefined, {
        single: 'one opening sash', 'vertical-divider': 'two sections: fixed left + one opening sash right (not two sashes)', 'vertical-fixed-fixed': 'two fixed columns (no opening sash)', 'vertical-fixed-fixed-fixed': 'three fixed columns', 'vertical-sash-sash': 'two side-by-side opening sashes / double sash / two sash', 'horizontal-divider': 'two rows: fixed + one opening sash', 'horizontal-fixed-fixed': 'two fixed rows (no opening sash)', 'horizontal-fixed-fixed-fixed': 'three fixed rows', 'top-fixed-bottom-sash-sash': 'one fixed top light + two opening sashes below',
      }),
      choice('openingMode', 'Opening mode', ['batant', 'oscilo'], 'batant', 'layoutId in [single, vertical-divider, vertical-sash-sash, horizontal-divider, top-fixed-bottom-sash-sash]'), choice('handleSide', 'Handle side', ['left', 'right'], 'right', 'layoutId in [single, vertical-divider, vertical-sash-sash, horizontal-divider, top-fixed-bottom-sash-sash]'),
      optional(number('openAngle', 'Preview opening angle', 'deg', 0, 80, 0, 'layoutId in [single, vertical-divider, vertical-sash-sash, horizontal-divider, top-fixed-bottom-sash-sash]')),
      choice('profileSetId', 'CAD profile family', ['2_4_Oeffnungselemnt_Vertikal', '2_5_Oeffnungselemnt_Vertikal', '2_6_Oeffnungselemnt_Vertikal'], '2_4_Oeffnungselemnt_Vertikal', undefined, { '2_4_Oeffnungselemnt_Vertikal': 'B2-6 / opening element 2.4', '2_5_Oeffnungselemnt_Vertikal': 'B2-7 / opening element 2.5', '2_6_Oeffnungselemnt_Vertikal': 'B2-8 / opening element 2.6' }),
      choice('outerFrameProfileId', 'Outer frame profile', ['575760', '575770'], '575760'), choice('sashProfileId', 'Sash profile', ['575780', '575790'], '575780'),
      number('glassThicknessMm', 'Glass thickness', 'mm', 16, 29, 24),
      choice('finishMode', 'Finish mode', ['same', 'different'], 'same'), choice('outsideFinishType', 'Outside finish type', ['mill', 'anodized', 'coated'], 'coated'),
      text('outsideColor', 'Outside coated colour as a hex value', '#6b7280', 'outsideFinishType == coated'),
      choice('insideFinishType', 'Inside finish type', ['mill', 'anodized', 'coated'], 'coated', 'finishMode == different'),
      text('insideColor', 'Inside coated colour as a hex value', '#6b7280', 'finishMode == different && insideFinishType == coated'),
      choice('accessoryPreset', 'Accessory preset', ['b2-6', 'b2-7', 'b2-8'], 'b2-6'), optional(bool('showHouse', 'Show house context', false)),
    ],
  },
};

export const ProductRequestSchema = z.object({
  product: z.enum(PRODUCT_IDS),
  answers: z.record(z.unknown()),
});

export const ConfirmedProductRequestSchema = ProductRequestSchema.extend({
  confirmation: z.literal('confirmed'),
});

export function isProductId(value: unknown): value is ProductId {
  return PRODUCT_IDS.includes(String(value) as ProductId);
}
