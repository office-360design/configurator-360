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

export function openingType(type) {
  return OPENING_TYPES[type] ?? OPENING_TYPES.window;
}

export function wallSpan(state, side) {
  return side === 'front' || side === 'back' ? state.width : state.length;
}

export function wallLabel(side) {
  return ({ front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall' })[side] ?? side;
}

export function makeOpening(type, side = 'front', offset = 0, overrides = {}) {
  const spec = openingType(type);
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
  const spec = openingType(opening.type);
  if (!WALL_SIDES.includes(opening.side)) opening.side = 'front';
  const usableSpan = Math.max(spec.minWidth, wallSpan(state, opening.side) - .24);
  opening.width = Math.max(spec.minWidth, Math.min(Number(opening.width) || spec.defaultWidth, spec.maxWidth, usableSpan));
  const usableHeight = Math.max(spec.minHeight, state.eaveHeight - .12);
  opening.height = Math.max(spec.minHeight, Math.min(Number(opening.height) || spec.defaultHeight, spec.maxHeight, usableHeight));
  const halfSpan = wallSpan(state, opening.side) / 2;
  const halfWidth = opening.width / 2;
  opening.offset = Math.max(-halfSpan + halfWidth + .06, Math.min(Number(opening.offset) || 0, halfSpan - halfWidth - .06));
  const maxBottom = Math.max(0, state.eaveHeight - opening.height - .06);
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

export function validateOpenings(state) {
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
  const errors = overlaps.map(({ a, b, side }) => `${openingType(a.type).label} and ${openingType(b.type).label} overlap on the ${wallLabel(side).toLowerCase()}.`);
  return { valid: invalidIds.size === 0, invalidIds, overlaps, errors };
}

export function openingCounts(state) {
  const counts = { personnel: 0, garage: 0, window: 0 };
  normalizeOpenings(state).forEach((opening) => { counts[opening.type] = (counts[opening.type] ?? 0) + 1; });
  return counts;
}
