export const WINDOW_STATE_VERSION = 3;
export const MAX_WINDOW_CELLS = 100;
export const FIXED_WINDOW_TYPE = 'fixed-glazing';
export const SASH_WINDOW_TYPE = 'opening-sash';

const EPSILON = 1e-8;

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function nearlyEqual(a, b, epsilon = EPSILON) {
    return Math.abs(finite(a) - finite(b)) <= epsilon;
}

function normalizeType(type) {
    return type === SASH_WINDOW_TYPE || type === 'sash' || type === 'opening'
        ? SASH_WINDOW_TYPE
        : FIXED_WINDOW_TYPE;
}

function normalizeHandleSide(value) {
    return value === 'left' || value === 'right' ? value : null;
}

function cloneRect(rect) {
    return {
        x0: finite(rect?.x0),
        y0: finite(rect?.y0),
        x1: finite(rect?.x1, 1),
        y1: finite(rect?.y1, 1),
    };
}

function rectWidth(rect) {
    return Math.max(0, finite(rect.x1) - finite(rect.x0));
}

function rectHeight(rect) {
    return Math.max(0, finite(rect.y1) - finite(rect.y0));
}

function rectArea(rect) {
    return rectWidth(rect) * rectHeight(rect);
}

function intervalOverlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function stateBounds(windows) {
    if (!windows.length) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    return {
        x0: Math.min(...windows.map(cell => cell.rect.x0)),
        y0: Math.min(...windows.map(cell => cell.rect.y0)),
        x1: Math.max(...windows.map(cell => cell.rect.x1)),
        y1: Math.max(...windows.map(cell => cell.rect.y1)),
    };
}

function normalizeRectangles(windows) {
    const bounds = stateBounds(windows);
    return windows.map(cell => ({
        ...cell,
        rect: {
            x0: cell.rect.x0 - bounds.x0,
            y0: cell.rect.y0 - bounds.y0,
            x1: cell.rect.x1 - bounds.x0,
            y1: cell.rect.y1 - bounds.y0,
        },
    }));
}

function makeCell(id, type, rect, handleSide = null) {
    return {
        id: String(id),
        type: normalizeType(type),
        handleSide: normalizeHandleSide(handleSide),
        rect: cloneRect(rect),
    };
}

function nextCellId(windows) {
    const used = new Set(windows.map(cell => String(cell.id)));
    let index = 1;
    while (used.has(`w${index}`)) index += 1;
    return `w${index}`;
}

export function createSingleWindowState({
    type = SASH_WINDOW_TYPE,
    handleSide = 'right',
    dividerProfileId = '575800',
} = {}) {
    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: String(dividerProfileId || '575800'),
        windows: Object.freeze([
            Object.freeze(makeCell('w1', type, { x0: 0, y0: 0, x1: 1, y1: 1 }, handleSide)),
        ]),
    });
}

export function normalizeWindowState(value, { dividerProfileId = '575800' } = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawWindows = Array.isArray(source.windows) ? source.windows : [];
    const windows = rawWindows.slice(0, MAX_WINDOW_CELLS).map((cell, index) => {
        const rect = cloneRect(cell?.rect);
        if (rect.x1 <= rect.x0 + EPSILON || rect.y1 <= rect.y0 + EPSILON) {
            throw new Error(`Window ${cell?.id || index + 1} has an invalid rectangle.`);
        }
        return makeCell(
            cell?.id || `w${index + 1}`,
            cell?.type,
            rect,
            cell?.handleSide
        );
    });
    if (!windows.length) {
        return createSingleWindowState({ dividerProfileId: source.dividerProfileId || dividerProfileId });
    }

    const normalized = normalizeRectangles(windows);
    const ids = new Set();
    normalized.forEach(cell => {
        if (ids.has(cell.id)) throw new Error(`Duplicate window id ${cell.id}.`);
        ids.add(cell.id);
    });

    for (let i = 0; i < normalized.length; i += 1) {
        for (let j = i + 1; j < normalized.length; j += 1) {
            const a = normalized[i].rect;
            const b = normalized[j].rect;
            if (
                intervalOverlap(a.x0, a.x1, b.x0, b.x1) > EPSILON
                && intervalOverlap(a.y0, a.y1, b.y0, b.y1) > EPSILON
            ) {
                throw new Error(`Window cells ${normalized[i].id} and ${normalized[j].id} overlap.`);
            }
        }
    }

    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: String(source.dividerProfileId || dividerProfileId || '575800'),
        windows: Object.freeze(normalized.map(cell => Object.freeze({
            ...cell,
            rect: Object.freeze({ ...cell.rect }),
        }))),
    });
}

function legacyCell(type, handleSide, rect, index) {
    return makeCell(`w${index + 1}`, type, rect, handleSide);
}

export function createWindowStateFromLayoutDefinition(layout = {}, dividerProfileId = '575800') {
    const cells = Array.isArray(layout.cells) && layout.cells.length
        ? [...layout.cells]
        : [layout.leftCell, layout.rightCell].filter(Boolean);
    const handles = Array.isArray(layout.cellHandleSides) ? layout.cellHandleSides : [];

    if (layout.layoutKind === 't-grid' || layout.dividerOrientation === 'grid') {
        const fraction = Math.min(0.7, Math.max(0.2, finite(layout.topRowFraction, 0.30)));
        const topType = cells[0] || FIXED_WINDOW_TYPE;
        const lowerLeftType = cells[1] || SASH_WINDOW_TYPE;
        const lowerRightType = cells[2] || SASH_WINDOW_TYPE;
        return normalizeWindowState({
            dividerProfileId,
            windows: [
                legacyCell(topType, handles[0], { x0: 0, y0: 1 - fraction, x1: 1, y1: 1 }, 0),
                legacyCell(lowerLeftType, handles[1], { x0: 0, y0: 0, x1: 0.5, y1: 1 - fraction }, 1),
                legacyCell(lowerRightType, handles[2], { x0: 0.5, y0: 0, x1: 1, y1: 1 - fraction }, 2),
            ],
        });
    }

    if (layout.dividerOrientation === 'vertical' && cells.length > 1) {
        return normalizeWindowState({
            dividerProfileId,
            windows: cells.map((type, index) => legacyCell(type, handles[index], {
                x0: index / cells.length,
                y0: 0,
                x1: (index + 1) / cells.length,
                y1: 1,
            }, index)),
        });
    }

    if (layout.dividerOrientation === 'horizontal' && cells.length > 1) {
        return normalizeWindowState({
            dividerProfileId,
            windows: cells.map((type, index) => legacyCell(type, handles[index], {
                x0: 0,
                y0: index / cells.length,
                x1: 1,
                y1: (index + 1) / cells.length,
            }, index)),
        });
    }

    return createSingleWindowState({
        type: cells[0] || layout.rightCell || SASH_WINDOW_TYPE,
        handleSide: handles[0] || null,
        dividerProfileId,
    });
}

function getCell(state, cellId) {
    return state.windows.find(cell => cell.id === String(cellId)) || null;
}

function isOuterSide(state, cell, direction) {
    let checkRect;
    if (direction === 'left') checkRect = { x0: cell.rect.x0 - 1, y0: cell.rect.y0, x1: cell.rect.x0, y1: cell.rect.y1 };
    else if (direction === 'right') checkRect = { x0: cell.rect.x1, y0: cell.rect.y0, x1: cell.rect.x1 + 1, y1: cell.rect.y1 };
    else if (direction === 'bottom') checkRect = { x0: cell.rect.x0, y0: cell.rect.y0 - 1, x1: cell.rect.x1, y1: cell.rect.y0 };
    else if (direction === 'top') checkRect = { x0: cell.rect.x0, y0: cell.rect.y1, x1: cell.rect.x1, y1: cell.rect.y1 + 1 };

    const hasNeighbor = state.windows.some(other => 
        intervalOverlap(checkRect.x0, checkRect.x1, other.rect.x0, other.rect.x1) > EPSILON
        && intervalOverlap(checkRect.y0, checkRect.y1, other.rect.y0, other.rect.y1) > EPSILON
    );
    return !hasNeighbor;
}

export function canAddWindow(stateValue, cellId, direction) {
    const state = normalizeWindowState(stateValue);
    const cell = getCell(state, cellId);
    return Boolean(
        cell
        && state.windows.length < MAX_WINDOW_CELLS
        && ['left', 'right', 'top', 'bottom'].includes(direction)
        && isOuterSide(state, cell, direction)
    );
}

export function addWindowToState(stateValue, {
    cellId,
    direction,
    type = FIXED_WINDOW_TYPE,
    handleSide = null,
} = {}) {
    const state = normalizeWindowState(stateValue);
    if (!canAddWindow(state, cellId, direction)) {
        throw new Error('A new window can only be added from an exposed outer-frame side, with a maximum of three windows.');
    }

    const target = getCell(state, cellId);
    const windows = state.windows.map(cell => makeCell(cell.id, cell.type, cell.rect, cell.handleSide));
    const targetCopy = windows.find(cell => cell.id === target.id);
    const newId = nextCellId(windows);
    let newRect;

    if (direction === 'right') {
        newRect = { x0: targetCopy.rect.x1, x1: targetCopy.rect.x1 + 1, y0: targetCopy.rect.y0, y1: targetCopy.rect.y1 };
    } else if (direction === 'left') {
        newRect = { x0: targetCopy.rect.x0 - 1, x1: targetCopy.rect.x0, y0: targetCopy.rect.y0, y1: targetCopy.rect.y1 };
    } else if (direction === 'top') {
        newRect = { x0: targetCopy.rect.x0, x1: targetCopy.rect.x1, y0: targetCopy.rect.y1, y1: targetCopy.rect.y1 + 1 };
    } else {
        newRect = { x0: targetCopy.rect.x0, x1: targetCopy.rect.x1, y0: targetCopy.rect.y0 - 1, y1: targetCopy.rect.y0 };
    }

    windows.push(makeCell(newId, type, newRect, handleSide));
    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        windows,
    });
}

function sharedBoundary(a, b) {
    const yOverlap = intervalOverlap(a.rect.y0, a.rect.y1, b.rect.y0, b.rect.y1);
    const xOverlap = intervalOverlap(a.rect.x0, a.rect.x1, b.rect.x0, b.rect.x1);

    if (yOverlap > EPSILON && nearlyEqual(a.rect.x1, b.rect.x0)) {
        return { orientation: 'vertical', coordinate: a.rect.x1, start: Math.max(a.rect.y0, b.rect.y0), end: Math.min(a.rect.y1, b.rect.y1), negativeCellId: a.id, positiveCellId: b.id };
    }
    if (yOverlap > EPSILON && nearlyEqual(b.rect.x1, a.rect.x0)) {
        return { orientation: 'vertical', coordinate: b.rect.x1, start: Math.max(a.rect.y0, b.rect.y0), end: Math.min(a.rect.y1, b.rect.y1), negativeCellId: b.id, positiveCellId: a.id };
    }
    if (xOverlap > EPSILON && nearlyEqual(a.rect.y1, b.rect.y0)) {
        return { orientation: 'horizontal', coordinate: a.rect.y1, start: Math.max(a.rect.x0, b.rect.x0), end: Math.min(a.rect.x1, b.rect.x1), negativeCellId: a.id, positiveCellId: b.id };
    }
    if (xOverlap > EPSILON && nearlyEqual(b.rect.y1, a.rect.y0)) {
        return { orientation: 'horizontal', coordinate: b.rect.y1, start: Math.max(a.rect.x0, b.rect.x0), end: Math.min(a.rect.x1, b.rect.x1), negativeCellId: b.id, positiveCellId: a.id };
    }
    return null;
}

export function resolveDividerConnection(cellAType, cellBType) {
    const a = normalizeType(cellAType);
    const b = normalizeType(cellBType);
    if (a === FIXED_WINDOW_TYPE && b === FIXED_WINDOW_TYPE) {
        return Object.freeze({ templateId: 'mullion-fixed-fixed', reversed: false });
    }
    if (a === SASH_WINDOW_TYPE && b === SASH_WINDOW_TYPE) {
        return Object.freeze({ templateId: 'mullion-sash-sash', reversed: false });
    }
    if (a === FIXED_WINDOW_TYPE && b === SASH_WINDOW_TYPE) {
        return Object.freeze({ templateId: 'mullion-fixed-sash', reversed: false });
    }
    return Object.freeze({ templateId: 'mullion-fixed-sash', reversed: true });
}

function canUnionRectangles(a, b) {
    const boundary = sharedBoundary(a, b);
    if (!boundary) return false;
    const x0 = Math.min(a.rect.x0, b.rect.x0);
    const y0 = Math.min(a.rect.y0, b.rect.y0);
    const x1 = Math.max(a.rect.x1, b.rect.x1);
    const y1 = Math.max(a.rect.y1, b.rect.y1);
    return Math.abs((x1 - x0) * (y1 - y0) - (rectArea(a.rect) + rectArea(b.rect))) <= 1e-6;
}

export function deriveWindowTopology(stateValue) {
    const state = normalizeWindowState(stateValue);
    const dividers = [];
    const mergeCandidates = [];

    for (let i = 0; i < state.windows.length; i += 1) {
        for (let j = i + 1; j < state.windows.length; j += 1) {
            const a = state.windows[i];
            const b = state.windows[j];
            const boundary = sharedBoundary(a, b);
            if (!boundary) continue;
            const negativeCell = getCell(state, boundary.negativeCellId);
            const positiveCell = getCell(state, boundary.positiveCellId);
            const connection = resolveDividerConnection(negativeCell.type, positiveCell.type);
            const divider = Object.freeze({
                id: `d-${negativeCell.id}-${positiveCell.id}-${boundary.orientation}`,
                ...boundary,
                negativeCellType: negativeCell.type,
                positiveCellType: positiveCell.type,
                templateId: connection.templateId,
                reversed: connection.reversed,
            });
            dividers.push(divider);
            if (canUnionRectangles(a, b)) {
                mergeCandidates.push(Object.freeze({
                    id: `merge-${a.id}-${b.id}`,
                    cellAId: a.id,
                    cellBId: b.id,
                    orientation: boundary.orientation,
                    coordinate: boundary.coordinate,
                    start: boundary.start,
                    end: boundary.end,
                    sameType: a.type === b.type,
                    defaultType: a.type === b.type ? a.type : null,
                }));
            }
        }
    }

    const frameEdges = [];
    state.windows.forEach(cell => {
        const hasLeft = state.windows.some(other => nearlyEqual(other.rect.x1, cell.rect.x0) && intervalOverlap(cell.rect.y0, cell.rect.y1, other.rect.y0, other.rect.y1) > EPSILON);
        if (!hasLeft) frameEdges.push(Object.freeze({ id: `${cell.id}-left`, cellId: cell.id, side: 'left', coordinate: cell.rect.x0, start: cell.rect.y0, end: cell.rect.y1, cellType: cell.type }));

        const hasRight = state.windows.some(other => nearlyEqual(other.rect.x0, cell.rect.x1) && intervalOverlap(cell.rect.y0, cell.rect.y1, other.rect.y0, other.rect.y1) > EPSILON);
        if (!hasRight) frameEdges.push(Object.freeze({ id: `${cell.id}-right`, cellId: cell.id, side: 'right', coordinate: cell.rect.x1, start: cell.rect.y0, end: cell.rect.y1, cellType: cell.type }));

        const hasBottom = state.windows.some(other => nearlyEqual(other.rect.y1, cell.rect.y0) && intervalOverlap(cell.rect.x0, cell.rect.x1, other.rect.x0, other.rect.x1) > EPSILON);
        if (!hasBottom) frameEdges.push(Object.freeze({ id: `${cell.id}-bottom`, cellId: cell.id, side: 'bottom', coordinate: cell.rect.y0, start: cell.rect.x0, end: cell.rect.x1, cellType: cell.type }));

        const hasTop = state.windows.some(other => nearlyEqual(other.rect.y0, cell.rect.y1) && intervalOverlap(cell.rect.x0, cell.rect.x1, other.rect.x0, other.rect.x1) > EPSILON);
        if (!hasTop) frameEdges.push(Object.freeze({ id: `${cell.id}-top`, cellId: cell.id, side: 'top', coordinate: cell.rect.y1, start: cell.rect.x0, end: cell.rect.x1, cellType: cell.type }));
    });

    const addCandidates = state.windows.length >= MAX_WINDOW_CELLS
        ? []
        : frameEdges.map(edge => Object.freeze({
            id: `add-${edge.cellId}-${edge.side}`,
            cellId: edge.cellId,
            direction: edge.side,
            side: edge.side,
            coordinate: edge.coordinate,
            start: edge.start,
            end: edge.end,
        }));

    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        windows: state.windows,
        frameEdges: Object.freeze(frameEdges),
        dividers: Object.freeze(dividers),
        addCandidates: Object.freeze(addCandidates),
        mergeCandidates: Object.freeze(mergeCandidates),
    });
}

export function mergeWindowsInState(stateValue, {
    cellAId,
    cellBId,
    type = null,
    handleSide = null,
} = {}) {
    const state = normalizeWindowState(stateValue);
    const a = getCell(state, cellAId);
    const b = getCell(state, cellBId);
    if (!a || !b || !canUnionRectangles(a, b)) {
        throw new Error('Only adjacent windows whose union is one rectangle can be merged.');
    }
    const resultType = normalizeType(type || (a.type === b.type ? a.type : FIXED_WINDOW_TYPE));
    const merged = makeCell(a.id, resultType, {
        x0: Math.min(a.rect.x0, b.rect.x0),
        y0: Math.min(a.rect.y0, b.rect.y0),
        x1: Math.max(a.rect.x1, b.rect.x1),
        y1: Math.max(a.rect.y1, b.rect.y1),
    }, handleSide || (resultType === SASH_WINDOW_TYPE ? (a.handleSide || b.handleSide) : null));

    const windows = state.windows
        .filter(cell => cell.id !== a.id && cell.id !== b.id)
        .map(cell => makeCell(cell.id, cell.type, cell.rect, cell.handleSide));
    windows.push(merged);
    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        windows,
    });
}

export function setWindowTypeInState(stateValue, cellId, type, handleSide = null) {
    const state = normalizeWindowState(stateValue);
    if (!getCell(state, cellId)) throw new Error(`Unknown window ${cellId}.`);
    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        windows: state.windows.map(cell => ({
            ...cell,
            type: cell.id === String(cellId) ? normalizeType(type) : cell.type,
            handleSide: cell.id === String(cellId)
                ? (normalizeType(type) === SASH_WINDOW_TYPE ? normalizeHandleSide(handleSide || cell.handleSide) : null)
                : cell.handleSide,
        })),
    });
}

export function setWindowStateDividerProfile(stateValue, dividerProfileId) {
    const state = normalizeWindowState(stateValue);
    return normalizeWindowState({
        ...state,
        dividerProfileId: String(dividerProfileId || state.dividerProfileId),
    });
}

export function classifyWindowState(stateValue) {
    const state = normalizeWindowState(stateValue);
    const cells = [...state.windows];
    const byX = [...cells].sort((a, b) => a.rect.x0 - b.rect.x0 || a.rect.y0 - b.rect.y0);
    const byY = [...cells].sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);

    if (cells.length === 1) return Object.freeze({ kind: 'single', cells: Object.freeze(cells) });
    const allFullHeight = cells.every(cell => nearlyEqual(cell.rect.y0, 0) && nearlyEqual(cell.rect.y1, 1));
    if (allFullHeight) return Object.freeze({ kind: 'linear', orientation: 'vertical', cells: Object.freeze(byX) });
    const allFullWidth = cells.every(cell => nearlyEqual(cell.rect.x0, 0) && nearlyEqual(cell.rect.x1, 1));
    if (allFullWidth) return Object.freeze({ kind: 'linear', orientation: 'horizontal', cells: Object.freeze(byY) });

    if (cells.length === 3) {
        const top = cells.find(cell => nearlyEqual(cell.rect.x0, 0) && nearlyEqual(cell.rect.x1, 1) && nearlyEqual(cell.rect.y1, 1));
        if (top) return Object.freeze({ kind: 't-grid', spanningSide: 'top', spanningCellId: top.id, cells: Object.freeze(cells) });
        const bottom = cells.find(cell => nearlyEqual(cell.rect.x0, 0) && nearlyEqual(cell.rect.x1, 1) && nearlyEqual(cell.rect.y0, 0));
        if (bottom) return Object.freeze({ kind: 't-grid', spanningSide: 'bottom', spanningCellId: bottom.id, cells: Object.freeze(cells) });
        const left = cells.find(cell => nearlyEqual(cell.rect.y0, 0) && nearlyEqual(cell.rect.y1, 1) && nearlyEqual(cell.rect.x0, 0));
        if (left) return Object.freeze({ kind: 't-grid', spanningSide: 'left', spanningCellId: left.id, cells: Object.freeze(cells) });
        const right = cells.find(cell => nearlyEqual(cell.rect.y0, 0) && nearlyEqual(cell.rect.y1, 1) && nearlyEqual(cell.rect.x1, 1));
        if (right) return Object.freeze({ kind: 't-grid', spanningSide: 'right', spanningCellId: right.id, cells: Object.freeze(cells) });
    }

    return Object.freeze({ kind: 'grid', cells: Object.freeze(cells) });
}

export function serializeWindowState(stateValue) {
    const state = normalizeWindowState(stateValue);
    return JSON.stringify({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        windows: state.windows.map(cell => ({
            id: cell.id,
            type: cell.type,
            handleSide: cell.handleSide,
            rect: cell.rect,
        })),
    });
}

export function parseWindowState(value, options = {}) {
    if (!value) return null;
    if (typeof value === 'object') return normalizeWindowState(value, options);
    try {
        return normalizeWindowState(JSON.parse(String(value)), options);
    } catch {
        return null;
    }
}

export function getDividerConnectionVariantKey({ orientation, templateId, reversed = false } = {}) {
    return `${orientation || 'vertical'}:${templateId || 'mullion-fixed-sash'}:${reversed ? 'reversed' : 'normal'}`;
}
