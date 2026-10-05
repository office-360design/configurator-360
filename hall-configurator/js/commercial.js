/** Optional, editable retail details. All dimensions are conceptual, in metres. */
export const COMMERCIAL_DEFAULTS = Object.freeze({
  entranceCanopy: false, facadeSign: false, customerApron: false, retailDisplays: false,
  wallBracingLayout: 'end-bays', climateUnitLocation: 'along-side',
  signText: 'SHOWROOM', commercialAccent: '#b4663e', lightingStyle: 'high-bay',
});

export function normalizeCommercialFeatures(state) {
  for (const key of ['entranceCanopy', 'facadeSign', 'customerApron', 'retailDisplays']) state[key] = state[key] === true;
  state.signText = typeof state.signText === 'string'
    ? state.signText.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40) : COMMERCIAL_DEFAULTS.signText;
  state.commercialAccent = /^#[0-9a-f]{6}$/i.test(state.commercialAccent || '') ? state.commercialAccent : COMMERCIAL_DEFAULTS.commercialAccent;
  state.climateUnitLocation = state.climateUnitLocation === 'rear-service' ? 'rear-service' : 'along-side';
  state.wallBracingLayout = state.wallBracingLayout === 'rear-service' ? 'rear-service' : 'end-bays';
  state.lightingStyle = state.lightingStyle === 'linear-retail' ? 'linear-retail' : 'high-bay';
  return state;
}

export function commercialLayout(state) {
  const frontOpenings = (state.openings || []).filter((o) => o.side === 'front');
  const entrance = frontOpenings.find((o) => o.type === 'entrance');
  const frontTop = Math.max(2.8, ...frontOpenings.map((o) => o.bottom + o.height));
  const canopyY = Math.max(3.15, frontTop + .20);
  const canopyWidth = Math.min(8, Math.max(2, state.width - 1));
  const canopyDepth = 1.8;
  // Do not place a sign/canopy across a taller opening after a user edit.
  const canopyAvailable = canopyY + .20 < state.eaveHeight - .10;
  const signBottom = Math.max(frontTop + .24, state.entranceCanopy && canopyAvailable ? canopyY + .32 : 3.35);
  const signHeight = Math.min(.75, state.eaveHeight - .16 - signBottom);
  const signAvailable = signHeight >= .25;
  const canopyCenterX = Math.max(-state.width / 2 + canopyWidth / 2 + .2,
    Math.min(entrance?.offset || 0, state.width / 2 - canopyWidth / 2 - .2));
  const signWidth = Math.max(1, state.width - .60);
  const displayAvailable = state.width >= 10 && state.length >= 12;
  return {
    canopyY, canopyWidth, canopyDepth, canopyCenterX, canopyAvailable,
    signBottom, signHeight: Math.max(0, signHeight), signWidth, signAvailable,
    canopyArea: state.entranceCanopy && canopyAvailable ? canopyWidth * canopyDepth : 0,
    signArea: state.facadeSign && signAvailable ? signWidth * signHeight : 0,
    apronWidth: state.width, apronDepth: 3, apronArea: state.customerApron ? state.width * 3 : 0,
    displayCount: state.retailDisplays && displayAvailable ? 4 : 0,
    checkoutCount: state.retailDisplays && displayAvailable ? 1 : 0,
  };
}
