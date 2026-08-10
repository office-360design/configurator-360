export const structurePresets = {
  light: {
    label: 'Light duty',
    columnProfile: 'HEA220',
    rafterProfile: 'IPE180',
    purlinProfile: 'ZZ200-2.5',
    borderProfile: 'RHS150×50×3',
    braceProfile: 'RHS80×4 / D20',
    stayProfile: 'L60×6',
    columnDepth: 0.22,
    columnFlangeWidth: 0.21,
    columnWeb: 0.012,
    columnFlange: 0.018,
    rafterDepth: 0.18,
    rafterFlangeWidth: 0.091,
    rafterWeb: 0.010,
    rafterFlange: 0.015,
    secondarySize: 0.09,
    steelColor: '#31536b',
  },
  standard: {
    label: 'Standard warehouse',
    columnProfile: 'HEB280',
    rafterProfile: 'IPE400',
    purlinProfile: 'ZZ200-3.0',
    borderProfile: 'RHS150×50×5',
    braceProfile: 'RHS80×4 / D20',
    stayProfile: 'L60×6',
    columnDepth: 0.28,
    columnFlangeWidth: 0.28,
    columnWeb: 0.0105,
    columnFlange: 0.018,
    rafterDepth: 0.40,
    rafterFlangeWidth: 0.18,
    rafterWeb: 0.0086,
    rafterFlange: 0.0135,
    secondarySize: 0.11,
    steelColor: '#244966',
  },
  heavy: {
    label: 'Heavy duty',
    columnProfile: 'HEB320',
    rafterProfile: 'IPE450',
    purlinProfile: 'ZZ250-3.0',
    borderProfile: 'RHS180×60×5',
    braceProfile: 'RHS100×5 / D24',
    stayProfile: 'L70×7',
    columnDepth: 0.32,
    columnFlangeWidth: 0.30,
    columnWeb: 0.018,
    columnFlange: 0.026,
    rafterDepth: 0.45,
    rafterFlangeWidth: 0.19,
    rafterWeb: 0.016,
    rafterFlange: 0.024,
    secondarySize: 0.14,
    steelColor: '#193c58',
  },
};

export const state = {
  length: 24,
  width: 12,
  eaveHeight: 5,
  pitch: 12,
  targetBaySpacing: 6,
  structurePreset: 'standard',
  claddingProfile: 'sandwich',
  wallColor: '#d6d9dc',
  roofColor: '#36424b',
  secondaryStructure: true,
  slab: true,
  rollerDoor: true,
  rollerDoorWidth: 4,
  rollerDoorHeight: 4,
  personnelDoor: true,
  windows: true,
  showDimensions: true,
  technicalEdges: false,
  showCladding: true,
  explode: 0,
};

export function deriveHallMetrics(input = state) {
  const bayCount = Math.max(1, Math.ceil(input.length / input.targetBaySpacing));
  const actualBaySpacing = input.length / bayCount;
  const frameCount = bayCount + 1;
  const pitchRad = input.pitch * Math.PI / 180;
  const ridgeRise = Math.tan(pitchRad) * (input.width / 2);
  const ridgeElevation = input.eaveHeight + ridgeRise;
  const slopeLength = (input.width / 2) / Math.cos(pitchRad);
  const roofArea = 2 * slopeLength * input.length;
  const sideWallArea = 2 * input.length * input.eaveHeight;
  const gableRectangleArea = 2 * input.width * input.eaveHeight;
  const gableTriangleArea = 2 * (input.width * ridgeRise * 0.5);
  const grossWallArea = sideWallArea + gableRectangleArea + gableTriangleArea;
  const openingArea = (input.rollerDoor ? input.rollerDoorWidth * input.rollerDoorHeight : 0)
    + (input.personnelDoor ? 1.0 * 2.1 : 0)
    + (input.windows ? 4 * 1.8 * 1.25 : 0);
  const netWallArea = Math.max(0, grossWallArea - openingArea);

  return {
    bayCount,
    actualBaySpacing,
    frameCount,
    ridgeRise,
    ridgeElevation,
    slopeLength,
    footprint: input.length * input.width,
    roofArea,
    grossWallArea,
    netWallArea,
    openingArea,
  };
}
