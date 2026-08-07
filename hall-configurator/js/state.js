export const structurePresets = {
  light: {
    label: 'Light duty',
    columnSize: 0.22,
    rafterDepth: 0.22,
    secondarySize: 0.10,
    steelColor: '#31536b',
  },
  standard: {
    label: 'Standard warehouse',
    columnSize: 0.28,
    rafterDepth: 0.28,
    secondarySize: 0.12,
    steelColor: '#244966',
  },
  heavy: {
    label: 'Heavy duty',
    columnSize: 0.36,
    rafterDepth: 0.34,
    secondarySize: 0.15,
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
    + (input.windows ? 8 * 1.6 * 1.1 : 0);
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
