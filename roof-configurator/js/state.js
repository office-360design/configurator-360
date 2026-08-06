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
  currencyRate: 1,
  currencyRateDate: null,
  currencyRateSource: 'reference currency',
  currencyRateIsFallback: false,
};

export const pitchRules = {
  generic: {
    minimum: 5,
    note: 'Visualization preset - pitch is freely adjustable.',
  },
  roca: {
    minimum: 14,
    note: 'Mineral-granule roof preset: minimum visual pitch is set to 14°.',
  },
  teclado: {
    minimum: 18,
    note: 'Slate-style mineral tile preset: minimum visual pitch is set to 18°.',
  },
};
