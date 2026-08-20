export const roofNames = {
  gable: 'Two-slope roof',
  hip: 'Four-slope roof',
  shed: 'Single-slope roof',
  lshape: 'L-shaped roof',
  dormer: 'Two-slope roof with dormer',
  custom: 'Custom roof plan',
};

export const state = {
  roofType: 'gable',
  length: 10,
  depth: 7,
  wallHeight: 3,
  pitch: 30,
  overhang: 0.45,
  covering: 'generic',
  roofColor: '#7f1d2d',
  showDimensions: true,
  technicalEdges: false,
  showCompass: false,
  sunPosition: 42,
  northDirection: 108,
  nightPreview: false,
  customPlan: null,
  units: 'metric',
  currency: 'RON',
  locale: 'en-US',
  currencyRate: 1,
  currencyRateDate: null,
  currencyRateSource: 'reference',
  currencyRateIsFallback: false,
  excludedBomItems: [],
};

export const pitchRules = {
  generic: {
    minimum: 5,
    noteKey: 'covering.rule.generic',
  },
  roca: {
    minimum: 14,
    noteKey: 'covering.rule.roca',
  },
  teclado: {
    minimum: 18,
    noteKey: 'covering.rule.teclado',
  },
};
