import { solarT, resolveSolarLocale } from './i18n.js?v=1';

const initialLocale = resolveSolarLocale();
const t = (key, variables = {}) => solarT(initialLocale, key, variables);

const initialSimulationDate = (() => {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
})();

export const roofNames = {
  gable: 'Two-slope solar roof',
  hip: 'Four-slope solar roof',
  shed: 'Single-slope solar roof',
};

export const modulePresets = {
  standard475: {
    label: 'Residential N-type · 475 W',
    powerW: 475,
    lengthM: 1.762,
    widthM: 1.134,
    thicknessM: 0.03,
    efficiency: 0.238,
    panelPriceRon: 500,
    note: 'Modern 54-cell residential format; dimensions match current AIKO/Jinko-class modules.',
  },
  compact450: {
    label: 'Residential N-type · 450 W',
    powerW: 450,
    lengthM: 1.762,
    widthM: 1.134,
    thicknessM: 0.03,
    efficiency: 0.225,
    panelPriceRon: 480,
    note: 'Common 450 W residential format.',
  },
  premium490: {
    label: 'High-efficiency · 490 W',
    powerW: 490,
    lengthM: 1.762,
    widthM: 1.134,
    thicknessM: 0.03,
    efficiency: 0.245,
    panelPriceRon: 540,
    note: 'High-efficiency residential module in the same footprint.',
  },
};

export const regionPresets = {
  dobrogea: {
    label: 'South / Dobrogea',
    city: 'Constanța',
    lat: 44.1598,
    lon: 28.6348,
    specificYield: 1400,
  },
  muntenia: {
    label: 'Muntenia / Oltenia',
    city: 'Bucharest',
    lat: 44.4268,
    lon: 26.1025,
    specificYield: 1290,
  },
  moldova: {
    label: 'Moldova',
    city: 'Iași',
    lat: 47.1585,
    lon: 27.6014,
    specificYield: 1160,
  },
  transylvania: {
    label: 'Transylvania / Banat',
    city: 'Cluj-Napoca',
    lat: 46.7712,
    lon: 23.6236,
    specificYield: 1170,
  },
  northwest: {
    label: 'North-West / Mountain',
    city: 'Oradea',
    lat: 47.0465,
    lon: 21.9189,
    specificYield: 1090,
  },
};

export const state = {
  roofType: 'gable',
  length: 10,
  depth: 7,
  wallHeight: 3,
  pitch: 30,
  overhang: 0.45,
  roofColor: '#6b7280',
  covering: 'generic',

  modulePreset: 'standard475',
  panelCount: 12,
  panelColumns: 4,
  moduleOrientation: 'portrait',
  roofSide: 'best',
  panelGap: 0.04,
  panelMargin: 0.32,
  effectivePanelCount: 12,

  region: 'muntenia',
  locationMode: 'region',
  locationLat: null,
  locationLon: null,
  locationLabel: '',
  locationTimeZone: 'Europe/Bucharest',
  simulationDate: initialSimulationDate,
  monthlyBillRon: 400,
  energyTariffRon: 1.3,
  gridConnection: 'single',
  consumptionProfile: 'partial',

  batteryEnabled: true,
  batteryAutoSize: true,
  batteryCapacityKWh: 5,
  batteryReservePct: 10,
  batteryRoundTripEfficiency: 0.92,

  installationPricePerKwpRon: 1100,
  mountingPricePerPanelRon: 430,
  paperworkPriceRon: 1800,
  batteryPricePerKWhRon: 1960,
  vatRate: 0.21,

  showDimensions: false,
  technicalEdges: false,
  showCompass: true,
  showSunPath: true,
  sunPosition: 50,
  northDirection: 0,
  nightPreview: false,
  simulationHour: 12,
  simulationPlaying: false,

  environmentEnabled: true,
  environmentAutoLoad: true,
  environmentRadiusM: 180,
  terrainEnabled: true,
  buildingsEnabled: true,
  roadsEnabled: true,
  treesEnabled: true,
  terrainExaggeration: 1,
  environmentStatus: 'inactive',
  environmentMessage: t('environment.chooseExact3d'),
  environmentCenterElevationM: null,
  environmentBuildingCount: 0,
  environmentRoadCount: 0,
  environmentTreeCount: 0,
  environmentHasTerrain: false,
  environmentLocalEastM: 0,
  environmentLocalNorthM: 0,
  environmentLocalStepM: 1,
  replaceHostBuilding: true,
  environmentHostBuildingCount: 0,
  localBuildingShadingEnabled: true,
  localBuildingShadingModel: null,
  localBuildingShadingStatus: 'inactive',
  localBuildingShadingMessage: t('environment.loadBuildingsShade'),
  localBuildingShadeContributorCount: 0,
  localBuildingShadePanelCount: 0,
  localBuildingAnnualLossPct: 0,

  units: 'metric',
  currency: 'RON',
  currencyRate: 1,
  currencyRateDate: null,
  currencyRateSource: 'reference',
  currencyRateIsFallback: false,

  excludedEstimateItems: [],
  pvgisAnnualKWh: null,
  pvgisMonthlyKWh: null,
  pvgisHorizonProfile: null,
  pvgisSurfaceResults: [],
  pvgisStatus: 'calibrated',
  pvgisMessage: t('pvgis.regionFallbackExactNeeded'),
  pvgisDatabase: '',
  pvgisUpdatedAt: null,
  pvgisUseHorizon: true,
  pvgisShowHorizon: true,
  pvgisProxyEndpoint: '',
  pvgisProxyHealthStatus: 'unconfigured',
  pvgisProxyHealthMessage: t('proxy.none'),

  googleSolarEndpoint: '',
  googleSolarProxyStatus: 'unknown',
  googleSolarProxyMessage: t('google.proxyUntested'),
  googleSolarAccessStatus: 'locked',
  googleSolarAccessMessage: t('google.enterAccessCode'),
  googleSolarSessionExpiresAt: null,
  googleSolarStatus: 'inactive',
  googleSolarMessage: t('google.unlockThenAnalyze'),
  googleSolarShadingEnabled: true,
  googleSolarShadeModel: null,
  googleSolarBuildingInsights: null,
  googleSolarDataLayers: null,
  googleSolarSurfaceModel: null,
  googleSolarDsmEnabled: true,
  googleSolarBuildingMaskVisible: true,
  googleSolarRawDsmVisible: false,
  googleSolarReferenceBuildingVisible: true,
  googleSolarRecommendedLayoutVisible: true,
  googleSolarRecommendedConfigPanels: 0,
  googleSolarFluxModel: null,
  googleSolarFluxHeatmapVisible: true,
  googleSolarFluxNearbyRoofsVisible: false,
  googleSolarFluxPeriod: 'annual',
  googleSolarReferenceMatchScore: 0,
  googleSolarReferenceMatchLabel: '—',
  googleSolarReferenceDistanceM: null,
  googleSolarReferenceMainPitchDeg: null,
  googleSolarReferenceMainAzimuthDeg: null,
  googleSolarReferenceSuggestionAvailable: false,
  googleSolarReferenceSuggestedBearingDeg: null,
  googleSolarReferenceSuggestedPitchDeg: null,
  googleSolarReferenceSuggestedLengthM: null,
  googleSolarReferenceSuggestedDepthM: null,
  googleSolarReferenceSuggestedEastM: null,
  googleSolarReferenceSuggestedNorthM: null,
  googleSolarReferenceSuggestedPositionDistanceM: null,
  googleSolarReferenceDimensionSource: '',
  googleSolarRefinedBuildingCount: 0,
  googleSolarGoogleOnlyBuildingCount: 0,
  googleSolarCanopyCount: 0,
  googleSolarCacheInfo: null,
  googleSolarAnalyzedSignature: '',
  googleSolarAnnualLossPct: 0,
};

const SOLAR_SHARE_KEYS = Object.freeze([
  'roofType', 'length', 'depth', 'wallHeight', 'pitch', 'overhang', 'roofColor', 'covering',
  'modulePreset', 'panelCount', 'panelColumns', 'moduleOrientation', 'roofSide', 'panelGap', 'panelMargin',
  'region', 'locationMode', 'locationLat', 'locationLon', 'locationLabel', 'locationTimeZone', 'simulationDate',
  'monthlyBillRon', 'energyTariffRon', 'gridConnection', 'consumptionProfile',
  'batteryEnabled', 'batteryAutoSize', 'batteryCapacityKWh', 'batteryReservePct', 'batteryRoundTripEfficiency',
  'installationPricePerKwpRon', 'mountingPricePerPanelRon', 'paperworkPriceRon', 'batteryPricePerKWhRon', 'vatRate',
  'showDimensions', 'technicalEdges', 'showCompass', 'showSunPath', 'sunPosition', 'northDirection', 'nightPreview', 'simulationHour',
  'environmentEnabled', 'environmentAutoLoad', 'environmentRadiusM', 'terrainEnabled', 'buildingsEnabled', 'roadsEnabled', 'treesEnabled',
  'terrainExaggeration', 'environmentLocalEastM', 'environmentLocalNorthM', 'environmentLocalStepM', 'replaceHostBuilding',
  'localBuildingShadingEnabled', 'excludedEstimateItems', 'pvgisUseHorizon', 'pvgisShowHorizon',
]);

function cloneShareValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneShareValue(item));
  if (value && typeof value === 'object') return structuredClone(value);
  return value;
}

function acceptsSharedValue(currentValue, incomingValue) {
  if (currentValue === null) return incomingValue === null || typeof incomingValue === 'number' || typeof incomingValue === 'string';
  if (Array.isArray(currentValue)) return Array.isArray(incomingValue);
  if (typeof currentValue === 'number') return typeof incomingValue === 'number' && Number.isFinite(incomingValue);
  if (typeof currentValue === 'boolean') return typeof incomingValue === 'boolean';
  if (typeof currentValue === 'string') return typeof incomingValue === 'string';
  return false;
}

export function captureSolarShareState(input = state) {
  const snapshot = {};
  SOLAR_SHARE_KEYS.forEach((key) => {
    snapshot[key] = cloneShareValue(input[key]);
  });
  // A running animation is a transient UI state; a shared link opens at the
  // exact saved simulation hour but never starts animating by itself.
  snapshot.simulationPlaying = false;
  return snapshot;
}

export const DEFAULT_SOLAR_SHARE_STATE = captureSolarShareState(state);

export function applySolarShareState(snapshot, target = state) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  SOLAR_SHARE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return;
    const incoming = snapshot[key];
    if (!acceptsSharedValue(target[key], incoming)) return;
    target[key] = cloneShareValue(incoming);
  });
  target.simulationPlaying = false;
  return true;
}
