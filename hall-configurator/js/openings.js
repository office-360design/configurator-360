import { hallOpeningLabel, hallT, hallWallLabel, resolveHallLocale } from './i18n.js?v=hall-production-1';
export const OPENING_TYPES = {
  personnel: {
    label: 'Human door',
    defaultWidth: 1.0,
    defaultHeight: 2.1,
    minWidth: 0.7,
    maxWidth: 2.4,
    minHeight: 1.8,
    maxHeight: 3.2,
    defaultBottom: 0,
    defaultColor: '#e5ebee',
  },
  garage: {
    label: 'Garage door',
    defaultWidth: 4.0,
    defaultHeight: 4.0,
    minWidth: 2.2,
    maxWidth: 10.0,
    minHeight: 2.2,
    maxHeight: 7.0,
    defaultBottom: 0,
    defaultColor: '#24445a',
  },
  entrance: {
    label: 'Glazed entrance', defaultWidth: 3.6, defaultHeight: 2.95,
    minWidth: 2.4, maxWidth: 6, minHeight: 2.1, maxHeight: 3.6,
    defaultBottom: 0, defaultColor: '#acd0d8',
  },
  vent: {
    label: 'Ventilation grille', defaultWidth: 1.6, defaultHeight: .8,
    minWidth: .4, maxWidth: 3, minHeight: .4, maxHeight: 2,
    defaultBottom: 3.0, defaultColor: '#66727c',
  },
  window: {
    label: 'Window',
    defaultWidth: 1.8,
    defaultHeight: 1.25,
    minWidth: 0.5,
    maxWidth: 5.0,
    minHeight: 0.5,
    maxHeight: 3.5,
    defaultBottom: 2.15,
    defaultColor: '#8ec6df',
  },
};

export const WALL_SIDES = ['front', 'right', 'back', 'left'];

export function openingType(type, subtype = 'standard') {
  const spec = OPENING_TYPES[type] ?? OPENING_TYPES.window;
  if (type === 'garage' && subtype === 'sectional') return { ...spec, defaultWidth: 4, defaultHeight: 4.5, maxWidth: 6, maxHeight: 6, headroom: .50 };
  if (type === 'window' && subtype === 'daylight-band') return { ...spec, defaultWidth: 4.8, defaultHeight: 1.1, maxWidth: 12, defaultBottom: 3.6 };
  if (type === 'window' && subtype === 'shopfront') return { ...spec, defaultWidth: 4.4, defaultHeight: 2.8, maxWidth: 12, maxHeight: 4, defaultBottom: .15 };
  if (type === 'entrance' && subtype === 'double-glass') return { ...spec, minWidth: 1.4, maxWidth: 3.2, defaultWidth: 1.8, defaultHeight: 2.5 };
  return spec;
}

export function wallSpan(state, side) {
  return side === 'front' || side === 'back' ? state.width : state.length;
}

export function wallLabel(side, locale = resolveHallLocale()) {
  return hallWallLabel(side, { locale });
}


export function makeOpening(type, side = 'front', offset = 0, overrides = {}) {
  const spec = openingType(type, overrides.subtype);
  return {
    id: overrides.id ?? `opening-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    side,
    offset,
    bottom: overrides.bottom ?? spec.defaultBottom,
    width: overrides.width ?? spec.defaultWidth,
    height: overrides.height ?? spec.defaultHeight,
    color: overrides.color ?? spec.defaultColor,
    ...overrides,
  };
}

export function defaultOpenings() {
  return [
    makeOpening('garage', 'front', -1.65, { id: 'garage-door-1', width: 4, height: 4, bottom: 0 }),
    makeOpening('personnel', 'front', 3.05, { id: 'human-door-1', width: 1, height: 2.1, bottom: 0 }),
    makeOpening('window', 'left', -6, { id: 'window-left-1', width: 1.8, height: 1.25, bottom: 2.15 }),
    makeOpening('window', 'left', 6, { id: 'window-left-2', width: 1.8, height: 1.25, bottom: 2.15 }),
    makeOpening('window', 'right', -6, { id: 'window-right-1', width: 1.8, height: 1.25, bottom: 2.15 }),
    makeOpening('window', 'right', 6, { id: 'window-right-2', width: 1.8, height: 1.25, bottom: 2.15 }),
  ];
}

export function ensureOpeningsState(state) {
  if (Array.isArray(state.openings)) return state.openings;
  const openings = [];
  if (state.rollerDoor) openings.push(makeOpening('garage', 'front', -1.65, {
    id: 'garage-door-legacy',
    width: Number(state.rollerDoorWidth) || 4,
    height: Number(state.rollerDoorHeight) || 4,
    bottom: 0,
  }));
  if (state.personnelDoor) openings.push(makeOpening('personnel', 'front', Math.min(state.width / 2 - .7, 3.05), { id: 'human-door-legacy' }));
  if (state.windows) {
    for (const side of ['left', 'right']) {
      [-state.length * .25, state.length * .25].forEach((offset, index) => {
        openings.push(makeOpening('window', side, offset, { id: `window-${side}-legacy-${index + 1}` }));
      });
    }
  }
  state.openings = openings;
  return openings;
}

export function normalizeOpening(opening, state) {
  if (!Object.prototype.hasOwnProperty.call(OPENING_TYPES, opening.type)) opening.type = 'window';
  if (opening.type === 'window') opening.subtype = ['daylight-band', 'shopfront'].includes(opening.subtype) ? opening.subtype : 'standard';
  else if (opening.type === 'entrance') {
    opening.subtype = opening.subtype === 'double-glass' ? 'double-glass' : 'sliding-glass';
    opening.isOpen = opening.isOpen === true;
  } else if (opening.type === 'garage') {
    opening.subtype = opening.subtype === 'sectional' ? 'sectional' : 'roller';
    if (opening.subtype === 'sectional') opening.isOpen = opening.isOpen === true;
    else delete opening.isOpen;
  } else delete opening.subtype;
  if (opening.type !== 'entrance' && !(opening.type === 'garage' && opening.subtype === 'sectional')) delete opening.isOpen;
  const spec = openingType(opening.type, opening.subtype);
  if (!WALL_SIDES.includes(opening.side)) opening.side = 'front';
  const usableSpan = Math.max(spec.minWidth, wallSpan(state, opening.side) - .24);
  opening.width = Math.max(spec.minWidth, Math.min(Number(opening.width) || spec.defaultWidth, spec.maxWidth, usableSpan));
  const usableHeight = Math.max(spec.minHeight, state.eaveHeight - (spec.headroom ?? .12));
  opening.height = Math.max(spec.minHeight, Math.min(Number(opening.height) || spec.defaultHeight, spec.maxHeight, usableHeight));
  const halfSpan = wallSpan(state, opening.side) / 2;
  const halfWidth = opening.width / 2;
  opening.offset = Math.max(-halfSpan + halfWidth + .06, Math.min(Number(opening.offset) || 0, halfSpan - halfWidth - .06));
  const maxBottom = Math.max(0, state.eaveHeight - opening.height - (spec.headroom ?? .06));
  opening.bottom = Math.max(0, Math.min(Number(opening.bottom) || 0, maxBottom));
  opening.color = typeof opening.color === 'string' && /^#[0-9a-f]{6}$/i.test(opening.color) ? opening.color : spec.defaultColor;
  return opening;
}

export function normalizeOpenings(state) {
  const openings = ensureOpeningsState(state);
  openings.forEach((opening) => normalizeOpening(opening, state));
  return openings;
}

export function openingArea(state) {
  return normalizeOpenings(state).reduce((sum, opening) => sum + opening.width * opening.height, 0);
}

export function validateOpenings(state, locale = resolveHallLocale()) {
  const openings = normalizeOpenings(state);
  const invalidIds = new Set();
  const overlaps = [];
  for (let i = 0; i < openings.length; i += 1) {
    const a = openings[i];
    for (let j = i + 1; j < openings.length; j += 1) {
      const b = openings[j];
      if (a.side !== b.side) continue;
      const horizontalOverlap = Math.min(a.offset + a.width / 2, b.offset + b.width / 2)
        - Math.max(a.offset - a.width / 2, b.offset - b.width / 2);
      const verticalOverlap = Math.min(a.bottom + a.height, b.bottom + b.height)
        - Math.max(a.bottom, b.bottom);
      if (horizontalOverlap > .012 && verticalOverlap > .012) {
        invalidIds.add(a.id);
        invalidIds.add(b.id);
        overlaps.push({ a, b, side: a.side });
      }
    }
  }
  const errors = overlaps.map(({ a, b, side }) => hallT(locale, 'openings.overlapError', {
    a: hallOpeningLabel(a.type, locale),
    b: hallOpeningLabel(b.type, locale),
    wall: hallWallLabel(side, { locale }).toLocaleLowerCase(locale),
  }));
  return { valid: invalidIds.size === 0, invalidIds, overlaps, errors };
}

export function openingCounts(state) {
  const counts = { personnel: 0, garage: 0, window: 0, vent: 0 };
  normalizeOpenings(state).forEach((opening) => { counts[opening.type] = (counts[opening.type] ?? 0) + 1; });
  return counts;
}

export function openingLabel(opening, locale = resolveHallLocale()) {
  if (opening.type === 'garage' && opening.subtype === 'sectional') return hallT(locale, 'garage.sectional');
  if (opening.type === 'entrance') return hallT(locale, opening.subtype === 'double-glass' ? 'entrance.doubleGlass' : 'entrance.slidingGlass');
  if (opening.type === 'window' && opening.subtype === 'shopfront') return hallT(locale, 'window.shopfront');
  if (opening.type === 'window' && opening.subtype === 'daylight-band') return hallT(locale, 'window.daylightBand');
  return hallOpeningLabel(opening.type, locale);
}
