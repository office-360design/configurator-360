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
  environmentMessage: 'Choose an exact location to load 3D context.',
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
  localBuildingShadingMessage: 'Load nearby buildings to estimate local obstruction shading.',
  localBuildingShadeContributorCount: 0,
  localBuildingShadePanelCount: 0,
  localBuildingAnnualLossPct: 0,

  units: 'metric',
  currency: 'RON',
  currencyRate: 1,
  currencyRateDate: null,
  currencyRateSource: 'reference currency',
  currencyRateIsFallback: false,

  excludedEstimateItems: [],
  pvgisAnnualKWh: null,
  pvgisMonthlyKWh: null,
  pvgisHorizonProfile: null,
  pvgisSurfaceResults: [],
  pvgisStatus: 'calibrated',
  pvgisMessage: 'Regional PVGIS-calibrated fallback is active.',
  pvgisDatabase: '',
  pvgisUpdatedAt: null,
  pvgisUseHorizon: true,
  pvgisShowHorizon: true,
  pvgisProxyEndpoint: '',
  pvgisProxyHealthStatus: 'unconfigured',
  pvgisProxyHealthMessage: 'No proxy URL configured.',
};

