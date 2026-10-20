// Proiecte-exemplu, câte unul pe sistem. Folosite de teste, de scripts/example.mjs și ca stare inițială în interfață.
const grid = { widths: [1500, 1500, 1500], heights: [1150, 2350], anchorSpacing: 3500 };
export const EXAMPLES = {
  TP52: { system: 'TP52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard – nivel 1', totalMm: 32, panesMm: 12, ug: 1.0 }, options: { cap: 'COR-9142' } },
  SG52: { system: 'SG52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard siliconat – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 } },
  TPH52: { system: 'TPH52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard – nivel 1', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 }, options: { cap: 'COR-9142' } },
  TPV52: { system: 'TPV52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', innerPane: '4+4', totalMm: 32, panesMm: 16, outerPaneMm: 8, chamberMm: 16, ug: 1.0 }, options: { cap: 'COR-9142' } },
  ST52: { system: 'ST52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', totalMm: 28, panesMm: 12, ug: 1.0 } },
  SST52: { system: 'SST52', grid, loads: { windKPa: 1.0 }, glass: { variant: 'Standard', totalMm: 28, panesMm: 12, ug: 1.0 } },
  SKY: { system: 'SKY', grid: { widths: [1200, 1200, 1200], heights: [1800, 1800], anchorSpacing: 3600 }, loads: { windKPa: 0.6, snowKPa: 1.6, slopeDeg: 15 }, glass: { variant: 'Acoperiș', totalMm: 32, panesMm: 12, ug: 1.0 }, options: { skyTransomJoint: 'silicone' } },
};
