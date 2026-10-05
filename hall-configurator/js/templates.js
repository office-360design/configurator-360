import { normalizeOpenings, validateOpenings } from './openings.js?v=hall-agri-1';

export const AGRICULTURAL_TEMPLATE_ID = 'agricultural-daylight';
export const HALL_TEMPLATES = Object.freeze([Object.freeze({
  id: AGRICULTURAL_TEMPLATE_ID,
  nameKey: 'templates.agricultural.name',
  image: new URL('../assets/templates/agricultural-hall.png', import.meta.url).href,
})]);

/** Independent editable design defaults, not measurements extracted from Histruct. */
export function createHallTemplate(id, defaults) {
  if (id !== AGRICULTURAL_TEMPLATE_ID) throw new RangeError(`Unknown hall template: ${id}`);
  const next = {
    ...structuredClone(defaults),
    length: 30, width: 18, eaveHeight: 5.5, pitch: 16, targetBaySpacing: 6,
    structurePreset: 'standard', claddingProfile: 'sandwich',
    wallColor: '#d6d9dc', roofColor: '#38594a',
    secondaryStructure: true, slab: true,
    climateSystem: 'none', highBayLighting: true, fireSprinklers: false,
    roofSkylights: true, gutters: true,
    warehouseRacking: false, forkliftClearance: false,
    inspectionMode: 'all', serviceVisibility: 'all', serviceCoverage: false,
    showCladding: true, technicalEdges: false, sectionCutEnabled: false,
    connectionDetails: false, explode: 0, cameraPreset: '3d',
    openings: [],
  };
  // Five separate multi-pane daylight bands on EACH long wall, between portals.
  for (const side of ['left', 'right']) {
    for (let i = 0; i < 5; i += 1) {
      next.openings.push({
        id: `agri-daylight-${side}-${i + 1}`, type: 'window', subtype: 'daylight-band',
        side, offset: -12 + i * 6, bottom: 4.0, width: 4.8, height: 1.1, color: '#a9d4df',
      });
    }
  }
  for (const [side, entrySide] of [['front', 1], ['back', -1]]) {
    next.openings.push(
      { id: `agri-machinery-${side}`, type: 'garage', side, offset: 0, bottom: 0, width: 5, height: 4.5, color: '#38594a' },
      { id: `agri-personnel-${side}`, type: 'personnel', side, offset: entrySide * 6.4, bottom: 0, width: 1.1, height: 2.2, color: '#66727c' },
    );
    for (const sign of [-1, 1]) {
      next.openings.push({
        id: `agri-vent-${side}-${sign < 0 ? 'left' : 'right'}`, type: 'vent',
        side, offset: sign * 6.4, bottom: 3.45, width: 1.6, height: .8, color: '#66727c',
      });
    }
  }
  delete next.buildingUse;
  normalizeOpenings(next);
  if (!validateOpenings(next, 'en-US').valid) throw new Error('Template openings overlap.');
  return next;
}
