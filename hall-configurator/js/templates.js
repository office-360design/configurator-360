import { normalizeOpenings, validateOpenings } from './openings.js?v=hall-storage-1';

import { LOGISTICS_DEFAULTS } from './logistics.js?v=hall-storage-1';
import { COMMERCIAL_DEFAULTS } from './commercial.js?v=hall-storage-1';

export const STORAGE_TEMPLATE_ID = 'storage-loading';
export const COMMERCIAL_TEMPLATE_ID = 'commercial-showroom';
export const AGRICULTURAL_TEMPLATE_ID = 'agricultural-daylight';
export const HALL_TEMPLATES = Object.freeze([Object.freeze({
  id: AGRICULTURAL_TEMPLATE_ID,
  nameKey: 'templates.agricultural.name',
  copyPrefix: 'templates.agricultural',
  features: ['dimensions', 'windows', 'access', 'ventilation', 'services', 'finish'],
  image: new URL('../assets/templates/agricultural-hall.png', import.meta.url).href,
}), Object.freeze({
  id: COMMERCIAL_TEMPLATE_ID, nameKey: 'templates.commercial.name',
  copyPrefix: 'templates.commercial',
  features: ['dimensions', 'windows', 'access', 'frontage', 'services', 'interior'],
  image: new URL('../assets/templates/commercial-hall.png', import.meta.url).href,
}), Object.freeze({
  id: STORAGE_TEMPLATE_ID, nameKey: 'templates.storage.name', copyPrefix: 'templates.storage',
  features: ['dimensions', 'loading', 'access', 'yard', 'interior', 'services'],
  image: new URL('../assets/templates/storage-hall.png', import.meta.url).href,
})]);

/** Independent editable design defaults, not measurements extracted from Histruct. */
export function createHallTemplate(id, defaults) {
  if (id === STORAGE_TEMPLATE_ID) return createStorageHall(defaults);
  if (id === COMMERCIAL_TEMPLATE_ID) return createCommercialHall(defaults);
  if (id !== AGRICULTURAL_TEMPLATE_ID) throw new RangeError(`Unknown hall template: ${id}`);
  const next = {
    ...structuredClone(defaults),
    ...COMMERCIAL_DEFAULTS, ...LOGISTICS_DEFAULTS,
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

function createCommercialHall(defaults) {
  const next = {
    ...structuredClone(defaults), ...COMMERCIAL_DEFAULTS, ...LOGISTICS_DEFAULTS,
    length: 18, width: 24, eaveHeight: 4.5, pitch: 8, targetBaySpacing: 6,
    structurePreset: 'standard', claddingProfile: 'sandwich',
    wallColor: '#f2f3f4', roofColor: '#36424b', secondaryStructure: true, slab: true,
    climateSystem: 'comfort', highBayLighting: true, lightingStyle: 'linear-retail',
    fireSprinklers: false, roofSkylights: false, gutters: true,
    entranceCanopy: true, facadeSign: true, customerApron: true, retailDisplays: true,
    signText: 'SHOWROOM', commercialAccent: '#b4663e', wallBracingLayout: 'rear-service', climateUnitLocation: 'rear-service',
    warehouseRacking: false, forkliftClearance: false,
    inspectionMode: 'all', serviceVisibility: 'all', serviceCoverage: false,
    showCladding: true, technicalEdges: false, sectionCutEnabled: false,
    connectionDetails: false, explode: 0, cameraPreset: 'customer', openings: [],
  };
  // Four tall shopfront bays, separated by narrow solid piers around a central entrance.
  for (const [index, offset] of [-9, -4.5, 4.5, 9].entries()) next.openings.push({
    id: `commercial-front-glazing-${index + 1}`, type: 'window', subtype: 'shopfront',
    side: 'front', offset, bottom: .15, width: 4.15, height: 2.8, color: '#acd0d8',
  });
  // Keep the rear bay solid for bracing and back-of-house access.
  for (const side of ['left', 'right']) for (const [index, offset] of [-6, 0].entries()) next.openings.push({
    id: `commercial-${side}-glazing-${index + 1}`, type: 'window', subtype: 'shopfront',
    side, offset, bottom: .15, width: 4.8, height: 2.8, color: '#acd0d8',
  });
  next.openings.push(
    { id: 'commercial-main-entrance', type: 'entrance', subtype: 'sliding-glass', side: 'front', offset: 0, bottom: 0, width: 3.6, height: 2.95, color: '#acd0d8', isOpen: false },
    { id: 'commercial-secondary-entrance', type: 'entrance', subtype: 'double-glass', side: 'back', offset: 0, bottom: 0, width: 1.8, height: 2.5, color: '#acd0d8', isOpen: false },
    { id: 'commercial-delivery-door', type: 'garage', side: 'back', offset: -6, bottom: 0, width: 3.2, height: 3.2, color: '#66727c' },
    { id: 'commercial-staff-door', type: 'personnel', side: 'back', offset: 6, bottom: 0, width: 1.1, height: 2.2, color: '#66727c' },
  );
  delete next.buildingUse;
  normalizeOpenings(next);
  if (!validateOpenings(next, 'en-US').valid) throw new Error('Commercial template openings overlap.');
  return next;
}


function createStorageHall(defaults) {
  const next = {
    ...structuredClone(defaults), ...COMMERCIAL_DEFAULTS, ...LOGISTICS_DEFAULTS,
    length: 48, width: 24, eaveHeight: 6.5, pitch: 10, targetBaySpacing: 6,
    structurePreset: 'standard', claddingProfile: 'sandwich',
    wallColor: '#d6d9dc', roofColor: '#36424b', secondaryStructure: true, slab: true,
    climateSystem: 'none', highBayLighting: true, lightingStyle: 'high-bay',
    fireSprinklers: false, roofSkylights: true, gutters: true,
    loadingApron: true, loadingApronDepth: 12, loadingBayMarkings: true,
    loadingBayProtection: true, loadingBayNumbers: true, warehouseLayout: 'loading-aisles',
    warehouseRacking: true, forkliftClearance: true, rackDensity: 'standard',
    inspectionMode: 'all', serviceVisibility: 'all', serviceCoverage: false,
    showCladding: true, technicalEdges: false, sectionCutEnabled: false,
    connectionDetails: false, explode: 0, cameraPreset: 'loading', openings: [],
  };
  // Leave the first/last 6 m bays solid for the existing end-bay wind braces.
  for (const [index, offset] of [-15, -9, -3, 3, 9, 15].entries()) {
    next.openings.push({
      id: `storage-loading-${index + 1}`, type: 'garage', subtype: 'sectional',
      side: 'right', offset, bottom: 0, width: 4, height: 4.5, color: '#31536b', isOpen: false,
    });
    next.openings.push({
      id: `storage-daylight-${index + 1}`, type: 'window', subtype: 'daylight-band',
      side: 'left', offset, bottom: 5.05, width: 4.6, height: .9, color: '#a9d4df',
    });
  }
  for (const side of ['front', 'back']) {
    next.openings.push(
      { id: `storage-drive-through-${side}`, type: 'garage', side, offset: 0, bottom: 0, width: 5, height: 4.8, color: '#31536b' },
      { id: `storage-personnel-${side}`, type: 'personnel', side, offset: 8.4, bottom: 0, width: 1.1, height: 2.2, color: '#66727c' },
    );
    for (const offset of [-8.4, 8.4]) next.openings.push({
      id: `storage-vent-${side}-${offset < 0 ? 'left' : 'right'}`, type: 'vent', side,
      offset, bottom: 4.1, width: 1.6, height: .8, color: '#66727c',
    });
  }
  delete next.buildingUse;
  normalizeOpenings(next);
  if (!validateOpenings(next, 'en-US').valid) throw new Error('Storage template openings overlap.');
  return next;
}
