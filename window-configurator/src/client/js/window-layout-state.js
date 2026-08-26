export const WINDOW_STATE_VERSION = 5;
export const MAX_WINDOW_CELLS = 100;
export const FIXED_WINDOW_TYPE = 'fixed-glazing';
export const SASH_WINDOW_TYPE = 'opening-sash';
export const DEFAULT_TRANS_PROFILE_ID = '575820';
export const DEFAULT_NEW_WINDOW_WIDTH_M = 0.6;
export const DEFAULT_NEW_WINDOW_HEIGHT_M = 0.9;
// AW CT 65 CAD face widths: outer frame 57 mm, mullion 88 mm. The grid
// reference lies on the mullion centreline, so an exposed frame extends
// 57 - (88 / 2) = 13 mm beyond that line.
export const DEFAULT_WINDOW_EDGE_EXTENSION_M = 0.013;

const EPSILON = 1e-8;
const MIN_GRID_TRACK_M = 0.05;

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


function coordinateKey(value) {
    return finite(value).toFixed(8);
}

function cloneGridTrack(track, axis = 'x') {
    const startKey = axis === 'x' ? 'x0' : 'y0';
    const endKey = axis === 'x' ? 'x1' : 'y1';
    const start = finite(track?.start ?? track?.[startKey], NaN);
    const end = finite(track?.end ?? track?.[endKey], NaN);
    const sizeM = finite(track?.sizeM ?? track?.size ?? track?.lengthM, NaN);
    if (![start, end, sizeM].every(Number.isFinite) || end <= start + EPSILON || sizeM <= 0) {
        return null;
    }
    return { start, end, sizeM: Math.max(MIN_GRID_TRACK_M, sizeM) };
}

function collectAxisCoordinates(windows, mergeGuides, axis) {
    const values = [];
    windows.forEach(cell => {
        if (axis === 'x') values.push(cell.rect.x0, cell.rect.x1);
        else values.push(cell.rect.y0, cell.rect.y1);
    });
    (mergeGuides || []).forEach(guide => {
        if (axis === 'x' && guide.orientation === 'vertical') values.push(guide.coordinate);
        if (axis === 'y' && guide.orientation === 'horizontal') values.push(guide.coordinate);
    });
    return [...new Set(values.map(coordinateKey))].map(Number).sort((a, b) => a - b);
}

function defaultTrackSize({ axis, start, end, coordinates, defaultWidthM, defaultHeightM, edgeExtensionM }) {
    const min = coordinates[0] ?? start;
    const max = coordinates.at(-1) ?? end;
    const outerSideCount = (nearlyEqual(start, min) ? 1 : 0) + (nearlyEqual(end, max) ? 1 : 0);
    const actualDefault = axis === 'x' ? defaultWidthM : defaultHeightM;
    return Math.max(MIN_GRID_TRACK_M, actualDefault - outerSideCount * edgeExtensionM);
}

function normalizeAxisTracks(rawTracks, {
    axis,
    bounds,
    windows,
    mergeGuides,
    defaultWidthM,
    defaultHeightM,
    edgeExtensionM,
}) {
    const coordinates = collectAxisCoordinates(windows, mergeGuides, axis);
    if (coordinates.length < 2) return [];
    const shift = axis === 'x' ? -finite(bounds.x0) : -finite(bounds.y0);
    const raw = (Array.isArray(rawTracks) ? rawTracks : [])
        .map(track => cloneGridTrack(track, axis))
        .filter(Boolean)
        .map(track => ({ ...track, start: track.start + shift, end: track.end + shift }));

    const tracks = [];
    for (let index = 0; index + 1 < coordinates.length; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        if (end <= start + EPSILON) continue;
        const exact = raw.find(track => nearlyEqual(track.start, start) && nearlyEqual(track.end, end));
        let sizeM = exact?.sizeM;
        if (!Number.isFinite(sizeM)) {
            const covering = raw.find(track => track.start <= start + EPSILON && track.end >= end - EPSILON);
            if (covering) {
                const ratio = (end - start) / Math.max(EPSILON, covering.end - covering.start);
                sizeM = covering.sizeM * ratio;
            }
        }
        if (!Number.isFinite(sizeM) || sizeM <= 0) {
            sizeM = defaultTrackSize({
                axis,
                start,
                end,
                coordinates,
                defaultWidthM,
                defaultHeightM,
                edgeExtensionM,
            });
        }
        tracks.push({ start, end, sizeM: Math.max(MIN_GRID_TRACK_M, sizeM) });
    }
    return tracks;
}

function normalizeGridTracks(value, {
    bounds,
    windows,
    mergeGuides,
    defaultWidthM = DEFAULT_NEW_WINDOW_WIDTH_M,
    defaultHeightM = DEFAULT_NEW_WINDOW_HEIGHT_M,
    edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
} = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        x: normalizeAxisTracks(source.x || source.columns, {
            axis: 'x', bounds, windows, mergeGuides, defaultWidthM, defaultHeightM, edgeExtensionM,
        }),
        y: normalizeAxisTracks(source.y || source.rows, {
            axis: 'y', bounds, windows, mergeGuides, defaultWidthM, defaultHeightM, edgeExtensionM,
        }),
    };
}

function freezeGridTracks(gridTracks) {
    return Object.freeze({
        x: Object.freeze((gridTracks?.x || []).map(track => Object.freeze({ ...track }))),
        y: Object.freeze((gridTracks?.y || []).map(track => Object.freeze({ ...track }))),
    });
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

function normalizeMergeGuides(value, bounds) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set();
    const normalized = [];

    raw.forEach(guide => {
        const orientation = guide?.orientation === 'vertical'
            ? 'vertical'
            : (guide?.orientation === 'horizontal' ? 'horizontal' : null);
        if (!orientation) return;

        const coordinate = finite(guide?.coordinate, NaN);
        const start = finite(guide?.start, NaN);
        const end = finite(guide?.end, NaN);
        if (![coordinate, start, end].every(Number.isFinite) || end <= start + EPSILON) return;

        const restoreCells = Array.isArray(guide?.restoreCells)
            ? guide.restoreCells.slice(0, 2).map((cell, index) => {
                const rect = cloneRect(cell?.rect);
                return {
                    id: String(cell?.id || `restore-${index + 1}`),
                    type: normalizeType(cell?.type),
                    handleSide: normalizeHandleSide(cell?.handleSide),
                    rect: {
                        x0: rect.x0 - bounds.x0,
                        y0: rect.y0 - bounds.y0,
                        x1: rect.x1 - bounds.x0,
                        y1: rect.y1 - bounds.y0,
                    },
                };
            }).filter(cell => (
                cell.rect.x1 > cell.rect.x0 + EPSILON
                && cell.rect.y1 > cell.rect.y0 + EPSILON
            ))
            : [];
        const shifted = orientation === 'vertical'
            ? {
                orientation,
                coordinate: coordinate - bounds.x0,
                start: start - bounds.y0,
                end: end - bounds.y0,
                ...(restoreCells.length === 2 ? { restoreCells } : {}),
            }
            : {
                orientation,
                coordinate: coordinate - bounds.y0,
                start: start - bounds.x0,
                end: end - bounds.x0,
                ...(restoreCells.length === 2 ? { restoreCells } : {}),
            };
        const key = `${orientation}:${topologyCoordinateKey(shifted.coordinate)}:${topologyCoordinateKey(shifted.start)}:${topologyCoordinateKey(shifted.end)}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(shifted);
    });

    return normalized;
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
    transProfileId = DEFAULT_TRANS_PROFILE_ID,
    widthM = DEFAULT_NEW_WINDOW_WIDTH_M,
    heightM = DEFAULT_NEW_WINDOW_HEIGHT_M,
    edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
} = {}) {
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_WINDOW_EDGE_EXTENSION_M));
    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: String(dividerProfileId || '575800'),
        transProfileId: String(transProfileId || DEFAULT_TRANS_PROFILE_ID),
        transConnections: Object.freeze([]),
        mergeGuides: Object.freeze([]),
        gridTracks: freezeGridTracks({
            x: [{ start: 0, end: 1, sizeM: Math.max(MIN_GRID_TRACK_M, finite(widthM, DEFAULT_NEW_WINDOW_WIDTH_M) - extension * 2) }],
            y: [{ start: 0, end: 1, sizeM: Math.max(MIN_GRID_TRACK_M, finite(heightM, DEFAULT_NEW_WINDOW_HEIGHT_M) - extension * 2) }],
        }),
        windows: Object.freeze([
            Object.freeze(makeCell('w1', type, { x0: 0, y0: 0, x1: 1, y1: 1 }, handleSide)),
        ]),
    });
}

export function normalizeWindowState(value, {
    dividerProfileId = '575800',
    transProfileId = DEFAULT_TRANS_PROFILE_ID,
    defaultWidthM = DEFAULT_NEW_WINDOW_WIDTH_M,
    defaultHeightM = DEFAULT_NEW_WINDOW_HEIGHT_M,
    edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
} = {}) {
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
        return createSingleWindowState({
            dividerProfileId: source.dividerProfileId || dividerProfileId,
            transProfileId: source.transProfileId || transProfileId,
            widthM: defaultWidthM,
            heightM: defaultHeightM,
            edgeExtensionM,
        });
    }

    const bounds = stateBounds(windows);
    const normalized = normalizeRectangles(windows);
    const mergeGuides = normalizeMergeGuides(source.mergeGuides, bounds);
    const gridTracks = normalizeGridTracks(source.gridTracks, {
        bounds,
        windows: normalized,
        mergeGuides,
        defaultWidthM,
        defaultHeightM,
        edgeExtensionM,
    });
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

    const transConnections = normalizeTransConnections(source.transConnections, normalized);

    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: String(source.dividerProfileId || dividerProfileId || '575800'),
        transProfileId: String(source.transProfileId || transProfileId || DEFAULT_TRANS_PROFILE_ID),
        transConnections: Object.freeze(transConnections.map(connection => Object.freeze({ ...connection }))),
        gridTracks: freezeGridTracks(gridTracks),
        mergeGuides: Object.freeze(mergeGuides.map(guide => Object.freeze({
            ...guide,
            ...(Array.isArray(guide.restoreCells)
                ? {
                    restoreCells: Object.freeze(guide.restoreCells.map(cell => Object.freeze({
                        ...cell,
                        rect: Object.freeze({ ...cell.rect }),
                    }))),
                }
                : {}),
        }))),
        windows: Object.freeze(normalized.map(cell => Object.freeze({
            ...cell,
            rect: Object.freeze({ ...cell.rect }),
        }))),
    });
}

function legacyCell(type, handleSide, rect, index) {
    return makeCell(`w${index + 1}`, type, rect, handleSide);
}

export function createWindowStateFromLayoutDefinition(
    layout = {},
    dividerProfileId = '575800',
    transProfileId = DEFAULT_TRANS_PROFILE_ID,
    {
        defaultWidthM = DEFAULT_NEW_WINDOW_WIDTH_M,
        defaultHeightM = DEFAULT_NEW_WINDOW_HEIGHT_M,
        edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
    } = {}
) {
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
            transProfileId,
            windows: [
                legacyCell(topType, handles[0], { x0: 0, y0: 1 - fraction, x1: 1, y1: 1 }, 0),
                legacyCell(lowerLeftType, handles[1], { x0: 0, y0: 0, x1: 0.5, y1: 1 - fraction }, 1),
                legacyCell(lowerRightType, handles[2], { x0: 0.5, y0: 0, x1: 1, y1: 1 - fraction }, 2),
            ],
        }, { defaultWidthM, defaultHeightM, edgeExtensionM });
    }

    if (layout.dividerOrientation === 'vertical' && cells.length > 1) {
        return normalizeWindowState({
            dividerProfileId,
            transProfileId,
            windows: cells.map((type, index) => legacyCell(type, handles[index], {
                x0: index / cells.length,
                y0: 0,
                x1: (index + 1) / cells.length,
                y1: 1,
            }, index)),
        }, { defaultWidthM, defaultHeightM, edgeExtensionM });
    }

    if (layout.dividerOrientation === 'horizontal' && cells.length > 1) {
        return normalizeWindowState({
            dividerProfileId,
            transProfileId,
            windows: cells.map((type, index) => legacyCell(type, handles[index], {
                x0: 0,
                y0: index / cells.length,
                x1: 1,
                y1: (index + 1) / cells.length,
            }, index)),
        }, { defaultWidthM, defaultHeightM, edgeExtensionM });
    }

    return createSingleWindowState({
        type: cells[0] || layout.rightCell || SASH_WINDOW_TYPE,
        handleSide: handles[0] || null,
        dividerProfileId,
        transProfileId,
        widthM: defaultWidthM,
        heightM: defaultHeightM,
        edgeExtensionM,
    });
}

function getCell(state, cellId) {
    return state.windows.find(cell => cell.id === String(cellId)) || null;
}

function getCellSideInterval(cell, direction) {
    if (direction === 'left' || direction === 'right') {
        return { start: cell.rect.y0, end: cell.rect.y1 };
    }
    return { start: cell.rect.x0, end: cell.rect.x1 };
}

function getCellSideCoverageIntervals(state, cell, direction) {
    const side = getCellSideInterval(cell, direction);
    const intervals = [];

    state.windows.forEach(other => {
        if (other.id === cell.id) return;

        let touches = false;
        let overlapStart = 0;
        let overlapEnd = 0;
        if (direction === 'left') {
            touches = nearlyEqual(other.rect.x1, cell.rect.x0);
            overlapStart = Math.max(side.start, other.rect.y0);
            overlapEnd = Math.min(side.end, other.rect.y1);
        } else if (direction === 'right') {
            touches = nearlyEqual(other.rect.x0, cell.rect.x1);
            overlapStart = Math.max(side.start, other.rect.y0);
            overlapEnd = Math.min(side.end, other.rect.y1);
        } else if (direction === 'bottom') {
            touches = nearlyEqual(other.rect.y1, cell.rect.y0);
            overlapStart = Math.max(side.start, other.rect.x0);
            overlapEnd = Math.min(side.end, other.rect.x1);
        } else if (direction === 'top') {
            touches = nearlyEqual(other.rect.y0, cell.rect.y1);
            overlapStart = Math.max(side.start, other.rect.x0);
            overlapEnd = Math.min(side.end, other.rect.x1);
        }

        if (touches && overlapEnd > overlapStart + EPSILON) {
            intervals.push({ start: overlapStart, end: overlapEnd });
        }
    });

    return intervals;
}

function subtractCoveredIntervals(start, end, coverageIntervals) {
    const clipped = coverageIntervals
        .map(interval => ({
            start: Math.max(start, finite(interval.start)),
            end: Math.min(end, finite(interval.end)),
        }))
        .filter(interval => interval.end > interval.start + EPSILON)
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const merged = [];
    clipped.forEach(interval => {
        const previous = merged.at(-1);
        if (!previous || interval.start > previous.end + EPSILON) {
            merged.push({ ...interval });
            return;
        }
        previous.end = Math.max(previous.end, interval.end);
    });

    const exposed = [];
    let cursor = start;
    merged.forEach(interval => {
        if (interval.start > cursor + EPSILON) {
            exposed.push({ start: cursor, end: interval.start });
        }
        cursor = Math.max(cursor, interval.end);
    });
    if (end > cursor + EPSILON) {
        exposed.push({ start: cursor, end });
    }
    return exposed;
}

function getExposedCellSideIntervals(state, cell, direction) {
    const side = getCellSideInterval(cell, direction);
    return subtractCoveredIntervals(
        side.start,
        side.end,
        getCellSideCoverageIntervals(state, cell, direction)
    );
}

function intervalIsExposed(state, cell, direction, start, end) {
    return getExposedCellSideIntervals(state, cell, direction).some(interval =>
        start >= interval.start - EPSILON
        && end <= interval.end + EPSILON
        && end > start + EPSILON
    );
}

function cellHasExposedSide(state, cell, direction) {
    return getExposedCellSideIntervals(state, cell, direction).some(interval => interval.end > interval.start + EPSILON);
}

function tracksForCell(state, cell, axis) {
    const start = axis === 'x' ? cell.rect.x0 : cell.rect.y0;
    const end = axis === 'x' ? cell.rect.x1 : cell.rect.y1;
    return (state.gridTracks?.[axis] || []).filter(track => (
        track.start >= start - EPSILON
        && track.end <= end + EPSILON
        && track.end > track.start + EPSILON
    ));
}

function trackSpanForCell(state, cell, axis) {
    return tracksForCell(state, cell, axis).reduce((sum, track) => sum + Math.max(0, finite(track.sizeM)), 0);
}

export function getWindowActualSizeInState(
    stateValue,
    cellId,
    { edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M } = {}
) {
    const state = normalizeWindowState(stateValue, { edgeExtensionM });
    const cell = getCell(state, cellId);
    if (!cell) return null;
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_WINDOW_EDGE_EXTENSION_M));
    const horizontalOuterSides = (cellHasExposedSide(state, cell, 'left') ? 1 : 0)
        + (cellHasExposedSide(state, cell, 'right') ? 1 : 0);
    const verticalOuterSides = (cellHasExposedSide(state, cell, 'bottom') ? 1 : 0)
        + (cellHasExposedSide(state, cell, 'top') ? 1 : 0);
    return Object.freeze({
        widthM: trackSpanForCell(state, cell, 'x') + horizontalOuterSides * extension,
        heightM: trackSpanForCell(state, cell, 'y') + verticalOuterSides * extension,
        structuralWidthM: trackSpanForCell(state, cell, 'x'),
        structuralHeightM: trackSpanForCell(state, cell, 'y'),
        horizontalOuterSides,
        verticalOuterSides,
    });
}

function resizeAxisTracksForCell(state, cell, axis, targetActualM, edgeExtensionM) {
    if (targetActualM === null || targetActualM === undefined || !Number.isFinite(Number(targetActualM))) {
        return state.gridTracks?.[axis] || [];
    }
    const sourceTracks = (state.gridTracks?.[axis] || []).map(track => ({ ...track }));
    const selected = tracksForCell(state, cell, axis);
    if (!selected.length) return sourceTracks;

    const outerSides = axis === 'x'
        ? (cellHasExposedSide(state, cell, 'left') ? 1 : 0) + (cellHasExposedSide(state, cell, 'right') ? 1 : 0)
        : (cellHasExposedSide(state, cell, 'bottom') ? 1 : 0) + (cellHasExposedSide(state, cell, 'top') ? 1 : 0);
    const targetStructural = Math.max(
        MIN_GRID_TRACK_M * selected.length,
        Number(targetActualM) - outerSides * edgeExtensionM
    );
    const currentStructural = selected.reduce((sum, track) => sum + Math.max(0, finite(track.sizeM)), 0);
    const selectedKeys = new Set(selected.map(track => `${coordinateKey(track.start)}:${coordinateKey(track.end)}`));

    if (currentStructural > EPSILON) {
        const scale = targetStructural / currentStructural;
        return sourceTracks.map(track => selectedKeys.has(`${coordinateKey(track.start)}:${coordinateKey(track.end)}`)
            ? { ...track, sizeM: Math.max(MIN_GRID_TRACK_M, track.sizeM * scale) }
            : track);
    }

    const equalSize = targetStructural / selected.length;
    return sourceTracks.map(track => selectedKeys.has(`${coordinateKey(track.start)}:${coordinateKey(track.end)}`)
        ? { ...track, sizeM: Math.max(MIN_GRID_TRACK_M, equalSize) }
        : track);
}

export function setWindowSizeInState(
    stateValue,
    cellId,
    {
        widthM = null,
        heightM = null,
        edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
    } = {}
) {
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_WINDOW_EDGE_EXTENSION_M));
    const state = normalizeWindowState(stateValue, { edgeExtensionM: extension });
    const cell = getCell(state, cellId);
    if (!cell) throw new Error(`Unknown window ${cellId}.`);

    const nextX = resizeAxisTracksForCell(state, cell, 'x', widthM, extension);
    const stateWithX = normalizeWindowState({
        ...state,
        gridTracks: { x: nextX, y: state.gridTracks?.y || [] },
    }, { edgeExtensionM: extension });
    const nextCell = getCell(stateWithX, cellId);
    const nextY = resizeAxisTracksForCell(stateWithX, nextCell, 'y', heightM, extension);

    return normalizeWindowState({
        ...stateWithX,
        gridTracks: { x: stateWithX.gridTracks?.x || [], y: nextY },
    }, { edgeExtensionM: extension });
}

export function canAddWindow(stateValue, cellId, direction, { start = null, end = null } = {}) {
    const state = normalizeWindowState(stateValue);
    const cell = getCell(state, cellId);
    if (
        !cell
        || state.windows.length >= MAX_WINDOW_CELLS
        || !['left', 'right', 'top', 'bottom'].includes(direction)
    ) {
        return false;
    }

    const side = getCellSideInterval(cell, direction);
    const requestedStart = start !== null && start !== undefined && Number.isFinite(Number(start))
        ? Number(start)
        : side.start;
    const requestedEnd = end !== null && end !== undefined && Number.isFinite(Number(end))
        ? Number(end)
        : side.end;
    return intervalIsExposed(state, cell, direction, requestedStart, requestedEnd);
}

export function addWindowToState(stateValue, {
    cellId,
    direction,
    type = FIXED_WINDOW_TYPE,
    handleSide = null,
    start = null,
    end = null,
    defaultWidthM = DEFAULT_NEW_WINDOW_WIDTH_M,
    defaultHeightM = DEFAULT_NEW_WINDOW_HEIGHT_M,
    edgeExtensionM = DEFAULT_WINDOW_EDGE_EXTENSION_M,
} = {}) {
    const state = normalizeWindowState(stateValue, { edgeExtensionM });
    if (!canAddWindow(state, cellId, direction, { start, end })) {
        throw new Error('A new window can only be added from an exposed outer-frame side.');
    }

    const target = getCell(state, cellId);
    const targetSizeBeforeAdd = getWindowActualSizeInState(state, cellId, { edgeExtensionM });
    const windows = state.windows.map(cell => makeCell(cell.id, cell.type, cell.rect, cell.handleSide));
    const targetCopy = windows.find(cell => cell.id === target.id);
    const newId = nextCellId(windows);
    let newRect;
    const side = getCellSideInterval(targetCopy, direction);
    const exposedStart = start !== null && start !== undefined && Number.isFinite(Number(start))
        ? Number(start)
        : side.start;
    const exposedEnd = end !== null && end !== undefined && Number.isFinite(Number(end))
        ? Number(end)
        : side.end;

    if (direction === 'right') {
        newRect = { x0: targetCopy.rect.x1, x1: targetCopy.rect.x1 + 1, y0: exposedStart, y1: exposedEnd };
    } else if (direction === 'left') {
        newRect = { x0: targetCopy.rect.x0 - 1, x1: targetCopy.rect.x0, y0: exposedStart, y1: exposedEnd };
    } else if (direction === 'top') {
        newRect = { x0: exposedStart, x1: exposedEnd, y0: targetCopy.rect.y1, y1: targetCopy.rect.y1 + 1 };
    } else {
        newRect = { x0: exposedStart, x1: exposedEnd, y0: targetCopy.rect.y0 - 1, y1: targetCopy.rect.y0 };
    }

    windows.push(makeCell(newId, type, newRect, handleSide));

    // Keep track of which physical grid tracks existed before the add. Adding
    // on the left/bottom temporarily moves the old normalized coordinates, so
    // compare against the same shifted coordinate system used by normalization.
    const rawBounds = stateBounds(windows);
    const oldTrackKeys = {
        x: new Set((state.gridTracks?.x || []).map(track => (
            `${coordinateKey(track.start - rawBounds.x0)}:${coordinateKey(track.end - rawBounds.x0)}`
        ))),
        y: new Set((state.gridTracks?.y || []).map(track => (
            `${coordinateKey(track.start - rawBounds.y0)}:${coordinateKey(track.end - rawBounds.y0)}`
        ))),
    };

    let resizedState = normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        transConnections: state.transConnections,
        gridTracks: state.gridTracks,
        mergeGuides: state.mergeGuides,
        windows,
    }, { defaultWidthM, defaultHeightM, edgeExtensionM });

    // A default is applied only to a dimension that introduces a genuinely new
    // grid track. The dimension parallel to the side being extended already
    // belongs to an existing row/column and must therefore be inherited. This
    // also means that filling an existing grid hole applies no 600/900 default
    // at all because both dimensions have already been established.
    const defaultAxis = direction === 'left' || direction === 'right' ? 'x' : 'y';
    const defaultActualM = defaultAxis === 'x' ? defaultWidthM : defaultHeightM;
    const addedCell = getCell(resizedState, newId);
    const selectedTracks = tracksForCell(resizedState, addedCell, defaultAxis);
    const freshTracks = selectedTracks.filter(track => !oldTrackKeys[defaultAxis].has(
        `${coordinateKey(track.start)}:${coordinateKey(track.end)}`
    ));

    if (freshTracks.length) {
        const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_WINDOW_EDGE_EXTENSION_M));
        const outerSides = defaultAxis === 'x'
            ? (cellHasExposedSide(resizedState, addedCell, 'left') ? 1 : 0)
                + (cellHasExposedSide(resizedState, addedCell, 'right') ? 1 : 0)
            : (cellHasExposedSide(resizedState, addedCell, 'bottom') ? 1 : 0)
                + (cellHasExposedSide(resizedState, addedCell, 'top') ? 1 : 0);
        const targetStructural = Math.max(
            MIN_GRID_TRACK_M * selectedTracks.length,
            defaultActualM - outerSides * extension
        );
        const freshKeys = new Set(freshTracks.map(track => (
            `${coordinateKey(track.start)}:${coordinateKey(track.end)}`
        )));
        const establishedStructural = selectedTracks
            .filter(track => !freshKeys.has(`${coordinateKey(track.start)}:${coordinateKey(track.end)}`))
            .reduce((sum, track) => sum + Math.max(0, finite(track.sizeM)), 0);
        const freshMinimum = MIN_GRID_TRACK_M * freshTracks.length;
        const freshStructural = Math.max(freshMinimum, targetStructural - establishedStructural);
        const totalWeight = freshTracks.reduce(
            (sum, track) => sum + Math.max(EPSILON, track.end - track.start),
            0
        );
        const distributable = Math.max(0, freshStructural - freshMinimum);
        const freshSizes = new Map(freshTracks.map(track => {
            const key = `${coordinateKey(track.start)}:${coordinateKey(track.end)}`;
            const weight = Math.max(EPSILON, track.end - track.start);
            return [key, MIN_GRID_TRACK_M + distributable * (weight / totalWeight)];
        }));
        const nextTracks = (resizedState.gridTracks?.[defaultAxis] || []).map(track => {
            const key = `${coordinateKey(track.start)}:${coordinateKey(track.end)}`;
            return freshSizes.has(key) ? { ...track, sizeM: freshSizes.get(key) } : { ...track };
        });
        resizedState = normalizeWindowState({
            ...resizedState,
            gridTracks: defaultAxis === 'x'
                ? { x: nextTracks, y: resizedState.gridTracks?.y || [] }
                : { x: resizedState.gridTracks?.x || [], y: nextTracks },
        }, { defaultWidthM, defaultHeightM, edgeExtensionM });
    }

    // Replacing an exposed outer frame with a mullion changes the 13 mm edge
    // contribution. Preserve the selected source window's actual size on the
    // axis of the add, without touching the inherited parallel row/column.
    if (targetSizeBeforeAdd) {
        if (defaultAxis === 'x') {
            resizedState = setWindowSizeInState(resizedState, target.id, {
                widthM: targetSizeBeforeAdd.widthM,
                edgeExtensionM,
            });
        } else {
            resizedState = setWindowSizeInState(resizedState, target.id, {
                heightM: targetSizeBeforeAdd.heightM,
                edgeExtensionM,
            });
        }
    }
    return resizedState;
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

function windowsFormSingleConnectedStructure(windows) {
    if (!Array.isArray(windows) || windows.length <= 1) return true;

    // Window cells are structurally connected only when they share a real
    // frame/mullion edge segment. Corner-only contact does not connect two
    // parts of the assembly. This also works for merged cells because
    // sharedBoundary() accepts partial edge overlap.
    const visited = new Set([0]);
    const pending = [0];
    while (pending.length) {
        const index = pending.pop();
        const current = windows[index];
        for (let candidateIndex = 0; candidateIndex < windows.length; candidateIndex += 1) {
            if (visited.has(candidateIndex)) continue;
            if (!sharedBoundary(current, windows[candidateIndex])) continue;
            visited.add(candidateIndex);
            pending.push(candidateIndex);
        }
    }
    return visited.size === windows.length;
}

export function canDeleteWindowFromState(stateValue, cellId) {
    const state = normalizeWindowState(stateValue);
    const target = getCell(state, cellId);
    if (!target || state.windows.length <= 1) return false;
    const remainingWindows = state.windows.filter(cell => cell.id !== target.id);
    return windowsFormSingleConnectedStructure(remainingWindows);
}

function transPairKey(cellAId, cellBId) {
    return [String(cellAId), String(cellBId)].sort().join('|');
}

function isValidTransPair(a, b) {
    if (!a || !b || a.type !== SASH_WINDOW_TYPE || b.type !== SASH_WINDOW_TYPE) return false;
    const boundary = sharedBoundary(a, b);
    return Boolean(boundary && boundary.orientation === 'vertical' && canUnionRectangles(a, b));
}

export function getTransOwnerHandleSide({
    negativeCellId,
    positiveCellId,
    ownerCellId,
} = {}) {
    const owner = String(ownerCellId || '');
    if (owner && owner === String(negativeCellId || '')) return 'right';
    if (owner && owner === String(positiveCellId || '')) return 'left';
    return null;
}

function normalizeTransConnections(value, windows) {
    const raw = Array.isArray(value) ? value : [];
    const byId = new Map(windows.map(cell => [cell.id, cell]));
    const usedCells = new Set();
    const usedPairs = new Set();
    const normalized = [];

    raw.forEach((connection, index) => {
        const cellAId = String(connection?.cellAId || connection?.negativeCellId || '');
        const cellBId = String(connection?.cellBId || connection?.positiveCellId || '');
        const a = byId.get(cellAId);
        const b = byId.get(cellBId);
        if (!isValidTransPair(a, b)) return;

        const boundary = sharedBoundary(a, b);
        const pairKey = transPairKey(a.id, b.id);
        if (usedPairs.has(pairKey) || usedCells.has(a.id) || usedCells.has(b.id)) return;

        const ownerCandidate = String(connection?.ownerCellId || '');
        const ownerCellId = ownerCandidate === a.id || ownerCandidate === b.id
            ? ownerCandidate
            : boundary.positiveCellId;
        const negativeCellId = boundary.negativeCellId;
        const positiveCellId = boundary.positiveCellId;

        normalized.push({
            id: String(connection?.id || `trans-${negativeCellId}-${positiveCellId}-${index + 1}`),
            cellAId: negativeCellId,
            cellBId: positiveCellId,
            ownerCellId,
        });
        usedPairs.add(pairKey);
        usedCells.add(a.id);
        usedCells.add(b.id);
    });

    return normalized;
}

function getTransConnectionForPair(state, cellAId, cellBId) {
    const key = transPairKey(cellAId, cellBId);
    return state.transConnections.find(connection => (
        transPairKey(connection.cellAId, connection.cellBId) === key
    )) || null;
}

export function canUseTransBetweenWindows(stateValue, cellAId, cellBId) {
    const state = normalizeWindowState(stateValue);
    const a = getCell(state, cellAId);
    const b = getCell(state, cellBId);
    if (!isValidTransPair(a, b)) return false;
    const existingForA = state.transConnections.find(connection => (
        connection.cellAId === a.id || connection.cellBId === a.id
    ));
    const existingForB = state.transConnections.find(connection => (
        connection.cellAId === b.id || connection.cellBId === b.id
    ));
    const active = getTransConnectionForPair(state, a.id, b.id);
    return Boolean(active || (!existingForA && !existingForB));
}

export function setTransBetweenWindowsInState(stateValue, {
    cellAId,
    cellBId,
    enabled = true,
    ownerCellId = null,
} = {}) {
    const state = normalizeWindowState(stateValue);
    const a = getCell(state, cellAId);
    const b = getCell(state, cellBId);
    const active = getTransConnectionForPair(state, cellAId, cellBId);

    if (!enabled) {
        if (!active) return state;
        return normalizeWindowState({
            ...state,
            transConnections: state.transConnections.filter(connection => connection.id !== active.id),
        });
    }

    if (!isValidTransPair(a, b)) {
        throw new Error('A trans can only be used between two side-by-side opening sashes that share a full vertical side.');
    }
    if (!canUseTransBetweenWindows(state, a.id, b.id)) {
        throw new Error('Each sash can belong to only one trans pair.');
    }
    if (active) return state;

    const boundary = sharedBoundary(a, b);
    const requestedOwner = String(ownerCellId || '');
    const resolvedOwner = requestedOwner === a.id || requestedOwner === b.id
        ? requestedOwner
        : boundary.positiveCellId;
    const connection = {
        id: `trans-${boundary.negativeCellId}-${boundary.positiveCellId}`,
        cellAId: boundary.negativeCellId,
        cellBId: boundary.positiveCellId,
        ownerCellId: resolvedOwner,
    };

    // A trans pair is a double-sash arrangement: the handles face the shared
    // trans mullion. Do this only when the T control is enabled; ordinary
    // neighbouring sashes keep whatever opening side the user selected.
    const windows = state.windows.map(cell => {
        if (cell.id === boundary.negativeCellId) {
            return { ...cell, handleSide: 'right' };
        }
        if (cell.id === boundary.positiveCellId) {
            return { ...cell, handleSide: 'left' };
        }
        return cell;
    });

    return normalizeWindowState({
        ...state,
        windows,
        transConnections: [...state.transConnections, connection],
    });
}

function topologyCoordinateKey(value) {
    return coordinateKey(value);
}

function linePieceId({ orientation, coordinate, start, end }) {
    const axis = orientation === 'vertical' ? 'v' : 'h';
    return `line-${axis}-${topologyCoordinateKey(coordinate)}-${topologyCoordinateKey(start)}-${topologyCoordinateKey(end)}`;
}

function boundaryCellAt(state, { orientation, coordinate, position, side }) {
    const epsilon = EPSILON * 10;
    return state.windows.find(cell => {
        if (orientation === 'horizontal') {
            const spans = position > cell.rect.x0 + epsilon && position < cell.rect.x1 - epsilon;
            if (!spans) return false;
            return side === 'negative'
                ? nearlyEqual(cell.rect.y1, coordinate)
                : nearlyEqual(cell.rect.y0, coordinate);
        }
        const spans = position > cell.rect.y0 + epsilon && position < cell.rect.y1 - epsilon;
        if (!spans) return false;
        return side === 'negative'
            ? nearlyEqual(cell.rect.x1, coordinate)
            : nearlyEqual(cell.rect.x0, coordinate);
    }) || null;
}

function getBoundaryBreaks(state, orientation, coordinate) {
    const values = [];
    state.windows.forEach(cell => {
        if (orientation === 'horizontal') {
            if (nearlyEqual(cell.rect.y0, coordinate) || nearlyEqual(cell.rect.y1, coordinate)) {
                values.push(cell.rect.x0, cell.rect.x1);
            }
        } else if (nearlyEqual(cell.rect.x0, coordinate) || nearlyEqual(cell.rect.x1, coordinate)) {
            values.push(cell.rect.y0, cell.rect.y1);
        }
    });
    return [...new Set(values.map(value => topologyCoordinateKey(value)))]
        .map(Number)
        .sort((a, b) => a - b);
}

function deriveGridLinePieces(state) {
    const pieces = [];
    const horizontalCoordinates = [...new Set(state.windows.flatMap(cell => [
        topologyCoordinateKey(cell.rect.y0),
        topologyCoordinateKey(cell.rect.y1),
    ]))].map(Number).sort((a, b) => a - b);
    const verticalCoordinates = [...new Set(state.windows.flatMap(cell => [
        topologyCoordinateKey(cell.rect.x0),
        topologyCoordinateKey(cell.rect.x1),
    ]))].map(Number).sort((a, b) => a - b);

    const addLine = (orientation, coordinate, start, end) => {
        if (!(end > start + EPSILON)) return;
        const midpoint = (start + end) / 2;
        const negativeCell = boundaryCellAt(state, {
            orientation,
            coordinate,
            position: midpoint,
            side: 'negative',
        });
        const positiveCell = boundaryCellAt(state, {
            orientation,
            coordinate,
            position: midpoint,
            side: 'positive',
        });
        if (!negativeCell && !positiveCell) return;

        if (negativeCell && positiveCell) {
            const transConnection = orientation === 'vertical'
                ? getTransConnectionForPair(state, negativeCell.id, positiveCell.id)
                : null;
            if (transConnection) {
                pieces.push(Object.freeze({
                    id: linePieceId({ orientation, coordinate, start, end }),
                    pieceType: 'trans',
                    orientation,
                    coordinate,
                    start,
                    end,
                    negativeCellId: negativeCell.id,
                    positiveCellId: positiveCell.id,
                    negativeCellType: negativeCell.type,
                    positiveCellType: positiveCell.type,
                    templateId: 'trans-sash-sash',
                    reversed: false,
                    ownerCellId: transConnection.ownerCellId,
                    transConnectionId: transConnection.id,
                }));
                return;
            }

            const connection = resolveDividerConnection(negativeCell.type, positiveCell.type);
            pieces.push(Object.freeze({
                id: linePieceId({ orientation, coordinate, start, end }),
                pieceType: 'mullion',
                orientation,
                coordinate,
                start,
                end,
                negativeCellId: negativeCell.id,
                positiveCellId: positiveCell.id,
                negativeCellType: negativeCell.type,
                positiveCellType: positiveCell.type,
                templateId: connection.templateId,
                reversed: connection.reversed,
            }));
            return;
        }

        const cell = negativeCell || positiveCell;
        let side;
        if (orientation === 'horizontal') {
            side = negativeCell ? 'top' : 'bottom';
        } else {
            side = negativeCell ? 'right' : 'left';
        }
        const fullSide = getCellSideInterval(cell, side);
        pieces.push(Object.freeze({
            id: linePieceId({ orientation, coordinate, start, end }),
            pieceType: 'frame',
            orientation,
            coordinate,
            start,
            end,
            cellId: cell.id,
            cellType: cell.type,
            side,
            partial: !(
                nearlyEqual(start, fullSide.start)
                && nearlyEqual(end, fullSide.end)
            ),
        }));
    };

    horizontalCoordinates.forEach(coordinate => {
        const breaks = getBoundaryBreaks(state, 'horizontal', coordinate);
        for (let index = 0; index + 1 < breaks.length; index += 1) {
            addLine('horizontal', coordinate, breaks[index], breaks[index + 1]);
        }
    });
    verticalCoordinates.forEach(coordinate => {
        const breaks = getBoundaryBreaks(state, 'vertical', coordinate);
        for (let index = 0; index + 1 < breaks.length; index += 1) {
            addLine('vertical', coordinate, breaks[index], breaks[index + 1]);
        }
    });

    return Object.freeze(pieces);
}

function splitFrameEdgeForAddCandidates(state, edge) {
    const breaks = [edge.start, edge.end];

    (state.mergeGuides || []).forEach(guide => {
        if (edge.orientation === 'horizontal' && guide.orientation === 'vertical') {
            const reachesEdge = nearlyEqual(guide.start, edge.coordinate)
                || nearlyEqual(guide.end, edge.coordinate);
            if (reachesEdge && guide.coordinate > edge.start + EPSILON && guide.coordinate < edge.end - EPSILON) {
                breaks.push(guide.coordinate);
            }
            return;
        }

        if (edge.orientation === 'vertical' && guide.orientation === 'horizontal') {
            const reachesEdge = nearlyEqual(guide.start, edge.coordinate)
                || nearlyEqual(guide.end, edge.coordinate);
            if (reachesEdge && guide.coordinate > edge.start + EPSILON && guide.coordinate < edge.end - EPSILON) {
                breaks.push(guide.coordinate);
            }
        }
    });

    const sorted = [...new Set(breaks.map(value => topologyCoordinateKey(value)))]
        .map(Number)
        .sort((a, b) => a - b);
    const pieces = [];
    for (let index = 0; index + 1 < sorted.length; index += 1) {
        const start = sorted[index];
        const end = sorted[index + 1];
        if (end <= start + EPSILON) continue;
        pieces.push({ start, end });
    }
    return pieces;
}

export function deriveWindowTopology(stateValue) {
    const state = normalizeWindowState(stateValue);
    const linePieces = deriveGridLinePieces(state);
    const dividers = linePieces
        .filter(piece => piece.pieceType === 'mullion')
        .map(piece => Object.freeze({ ...piece }));
    const frameEdges = linePieces
        .filter(piece => piece.pieceType === 'frame')
        .map(piece => Object.freeze({ ...piece }));
    const transSegments = linePieces
        .filter(piece => piece.pieceType === 'trans')
        .map(piece => Object.freeze({ ...piece }));
    const mergeCandidates = [];
    const transCandidates = [];

    for (let i = 0; i < state.windows.length; i += 1) {
        for (let j = i + 1; j < state.windows.length; j += 1) {
            const a = state.windows[i];
            const b = state.windows[j];
            const boundary = sharedBoundary(a, b);
            if (!boundary || !canUnionRectangles(a, b)) continue;
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

            if (boundary.orientation === 'vertical' && a.type === SASH_WINDOW_TYPE && b.type === SASH_WINDOW_TYPE) {
                const activeConnection = getTransConnectionForPair(state, a.id, b.id);
                const canActivate = canUseTransBetweenWindows(state, a.id, b.id);
                if (activeConnection || canActivate) {
                    transCandidates.push(Object.freeze({
                        id: `trans-toggle-${a.id}-${b.id}`,
                        cellAId: a.id,
                        cellBId: b.id,
                        orientation: boundary.orientation,
                        coordinate: boundary.coordinate,
                        start: boundary.start,
                        end: boundary.end,
                        active: Boolean(activeConnection),
                        ownerCellId: activeConnection?.ownerCellId || boundary.positiveCellId,
                    }));
                }
            }
        }
    }

    const addCandidates = state.windows.length >= MAX_WINDOW_CELLS
        ? []
        : frameEdges.flatMap(edge => splitFrameEdgeForAddCandidates(state, edge).map((piece, index) => Object.freeze({
            id: `add-${edge.id}-${topologyCoordinateKey(piece.start)}-${topologyCoordinateKey(piece.end)}`,
            frameEdgeId: edge.id,
            cellId: edge.cellId,
            direction: edge.side,
            side: edge.side,
            coordinate: edge.coordinate,
            start: piece.start,
            end: piece.end,
            segmentIndex: index,
        })));

    return Object.freeze({
        version: WINDOW_STATE_VERSION,
        windows: state.windows,
        gridTracks: state.gridTracks,
        // Every line is one atomic grid edge. Trans is intentionally not a
        // structural arm: it is a floating profile owned by one sash, so the
        // fixed frame/mullion members crossing its endpoints stay continuous.
        linePieces,
        frameEdges: Object.freeze(frameEdges),
        dividers: Object.freeze(dividers),
        transSegments: Object.freeze(transSegments),
        mergeGuides: state.mergeGuides,
        addCandidates: Object.freeze(addCandidates),
        mergeCandidates: Object.freeze(mergeCandidates),
        transCandidates: Object.freeze(transCandidates),
    });
}

function mergeGuideSplitsCell(cell, guide) {
    if (!cell || !guide) return false;
    if (guide.orientation === 'vertical') {
        return guide.coordinate > cell.rect.x0 + EPSILON
            && guide.coordinate < cell.rect.x1 - EPSILON
            && nearlyEqual(guide.start, cell.rect.y0)
            && nearlyEqual(guide.end, cell.rect.y1);
    }
    if (guide.orientation === 'horizontal') {
        return guide.coordinate > cell.rect.y0 + EPSILON
            && guide.coordinate < cell.rect.y1 - EPSILON
            && nearlyEqual(guide.start, cell.rect.x0)
            && nearlyEqual(guide.end, cell.rect.x1);
    }
    return false;
}

export function getWindowUnmergeGuide(stateValue, cellId) {
    const state = normalizeWindowState(stateValue);
    const cell = getCell(state, cellId);
    if (!cell) return null;
    for (let index = state.mergeGuides.length - 1; index >= 0; index -= 1) {
        const guide = state.mergeGuides[index];
        if (mergeGuideSplitsCell(cell, guide)) {
            return Object.freeze({ ...guide });
        }
    }
    return null;
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
    const boundary = sharedBoundary(a, b);
    const indexA = state.windows.findIndex(cell => cell.id === a.id);
    const indexB = state.windows.findIndex(cell => cell.id === b.id);
    // Visible window numbers are the dense 1-based order of state.windows.
    // When windows a < b are merged, keep the lower-numbered window in its
    // original slot and remove only the higher-numbered slot. That makes the
    // merged pane retain number a while every number >= b shifts down by one.
    // Do this independently of the order in which the two cell IDs are passed.
    const survivorIndex = Math.min(indexA, indexB);
    const absorbedIndex = Math.max(indexA, indexB);
    const survivor = state.windows[survivorIndex];
    const absorbed = state.windows[absorbedIndex];
    const resultType = normalizeType(type || (a.type === b.type ? a.type : FIXED_WINDOW_TYPE));
    const merged = makeCell(survivor.id, resultType, {
        x0: Math.min(a.rect.x0, b.rect.x0),
        y0: Math.min(a.rect.y0, b.rect.y0),
        x1: Math.max(a.rect.x1, b.rect.x1),
        y1: Math.max(a.rect.y1, b.rect.y1),
    }, handleSide || (resultType === SASH_WINDOW_TYPE ? (survivor.handleSide || absorbed.handleSide) : null));

    const windows = state.windows.flatMap((cell, index) => {
        if (index === survivorIndex) return [merged];
        if (index === absorbedIndex) return [];
        return [makeCell(cell.id, cell.type, cell.rect, cell.handleSide)];
    });
    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        gridTracks: state.gridTracks,
        transConnections: state.transConnections.filter(connection => (
            connection.cellAId !== a.id
            && connection.cellBId !== a.id
            && connection.cellAId !== b.id
            && connection.cellBId !== b.id
        )),
        mergeGuides: [
            ...(state.mergeGuides || []),
            {
                orientation: boundary.orientation,
                coordinate: boundary.coordinate,
                start: boundary.start,
                end: boundary.end,
                restoreCells: [
                    { id: survivor.id, type: survivor.type, handleSide: survivor.handleSide, rect: { ...survivor.rect } },
                    { id: absorbed.id, type: absorbed.type, handleSide: absorbed.handleSide, rect: { ...absorbed.rect } },
                ],
            },
        ],
        windows,
    });
}

export function unmergeWindowInState(stateValue, { cellId } = {}) {
    const state = normalizeWindowState(stateValue);
    const cell = getCell(state, cellId);
    if (!cell) throw new Error(`Unknown window ${cellId}.`);

    const guide = getWindowUnmergeGuide(state, cell.id);
    if (!guide) {
        throw new Error('This window does not contain a merged boundary that can be restored.');
    }

    const windows = state.windows
        .filter(windowCell => windowCell.id !== cell.id)
        .map(windowCell => makeCell(
            windowCell.id,
            windowCell.type,
            windowCell.rect,
            windowCell.handleSide
        ));
    const usedIds = new Set(windows.map(windowCell => windowCell.id));
    const restored = Array.isArray(guide.restoreCells) && guide.restoreCells.length === 2
        ? guide.restoreCells.map((restoreCell, index) => {
            let id = index === 0 ? cell.id : String(restoreCell.id || '');
            if (!id || usedIds.has(id) || (index > 0 && id === cell.id)) {
                id = nextCellId([
                    ...windows,
                    ...Array.from(usedIds, usedId => ({ id: usedId })),
                    { id: cell.id },
                ]);
            }
            usedIds.add(id);
            return makeCell(
                id,
                restoreCell.type,
                restoreCell.rect,
                restoreCell.handleSide
            );
        })
        : null;

    if (restored && canUnionRectangles(restored[0], restored[1])) {
        windows.push(...restored);
    } else {
        const newId = nextCellId([...windows, cell]);
        let firstRect;
        let secondRect;
        if (guide.orientation === 'vertical') {
            firstRect = {
                x0: cell.rect.x0,
                y0: cell.rect.y0,
                x1: guide.coordinate,
                y1: cell.rect.y1,
            };
            secondRect = {
                x0: guide.coordinate,
                y0: cell.rect.y0,
                x1: cell.rect.x1,
                y1: cell.rect.y1,
            };
        } else {
            firstRect = {
                x0: cell.rect.x0,
                y0: cell.rect.y0,
                x1: cell.rect.x1,
                y1: guide.coordinate,
            };
            secondRect = {
                x0: cell.rect.x0,
                y0: guide.coordinate,
                x1: cell.rect.x1,
                y1: cell.rect.y1,
            };
        }

        // Backward compatibility for older saved states that only contain the
        // geometric guide: use the merged cell's current type/handing.
        windows.push(makeCell(cell.id, cell.type, firstRect, cell.handleSide));
        windows.push(makeCell(newId, cell.type, secondRect, cell.handleSide));
    }

    let removedGuide = false;
    const mergeGuides = state.mergeGuides.filter(candidate => {
        if (removedGuide || !mergeGuideSplitsCell(cell, candidate)) return true;
        if (
            candidate.orientation === guide.orientation
            && nearlyEqual(candidate.coordinate, guide.coordinate)
            && nearlyEqual(candidate.start, guide.start)
            && nearlyEqual(candidate.end, guide.end)
        ) {
            removedGuide = true;
            return false;
        }
        return true;
    });

    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        gridTracks: state.gridTracks,
        transConnections: state.transConnections,
        mergeGuides,
        windows,
    });
}

export function deleteWindowFromState(stateValue, { cellId } = {}) {
    const state = normalizeWindowState(stateValue);
    const target = getCell(state, cellId);
    if (!target) throw new Error(`Unknown window ${cellId}.`);
    if (state.windows.length <= 1) {
        throw new Error('At least one window must remain in the layout.');
    }
    if (!canDeleteWindowFromState(state, target.id)) {
        throw new Error('Deleting this window would split the window structure into separate parts.');
    }

    const preservedSizes = new Map(
        state.windows
            .filter(cell => cell.id !== target.id)
            .map(cell => [cell.id, getWindowActualSizeInState(state, cell.id)])
    );
    const windows = state.windows
        .filter(cell => cell.id !== target.id)
        .map(cell => makeCell(cell.id, cell.type, cell.rect, cell.handleSide));
    const mergeGuides = state.mergeGuides.filter(guide => {
        if (mergeGuideSplitsCell(target, guide)) return false;
        return !guide.restoreCells?.some?.(restoreCell => String(restoreCell.id) === String(target.id));
    });
    const transConnections = state.transConnections.filter(connection => (
        connection.cellAId !== target.id
        && connection.cellBId !== target.id
        && connection.ownerCellId !== target.id
    ));

    let nextState = normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        gridTracks: state.gridTracks,
        transConnections,
        mergeGuides,
        windows,
    });

    // Removing a neighbour can turn a mullion-facing cell edge into an exposed
    // outer-frame edge. Preserve each surviving window's selected actual size
    // by re-solving the affected grid tracks against the new exposure state.
    for (const cell of nextState.windows) {
        const size = preservedSizes.get(cell.id);
        if (!size) continue;
        nextState = setWindowSizeInState(nextState, cell.id, {
            widthM: size.widthM,
            heightM: size.heightM,
            edgeExtensionM: DEFAULT_WINDOW_EDGE_EXTENSION_M,
        });
    }
    return nextState;
}

export function setWindowTypeInState(stateValue, cellId, type, handleSide = null) {
    const state = normalizeWindowState(stateValue);
    const targetId = String(cellId);
    const current = getCell(state, targetId);
    if (!current) throw new Error(`Unknown window ${cellId}.`);

    const nextType = normalizeType(type);
    const nextHandleSide = nextType === SASH_WINDOW_TYPE
        ? normalizeHandleSide(handleSide || current.handleSide)
        : null;
    const windowChanged = current.type !== nextType || current.handleSide !== nextHandleSide;
    const updatedWindows = state.windows.map(cell => ({
        ...cell,
        type: cell.id === targetId ? nextType : cell.type,
        handleSide: cell.id === targetId ? nextHandleSide : cell.handleSide,
    }));

    return normalizeWindowState({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        gridTracks: state.gridTracks,
        // A trans is a coupled two-sash configuration. Once either sash is
        // changed (type or left/right opening), the pair is no longer the same
        // configuration, so remove the trans instead of silently keeping it.
        transConnections: windowChanged
            ? state.transConnections.filter(connection => (
                connection.cellAId !== targetId && connection.cellBId !== targetId
            ))
            : state.transConnections,
        mergeGuides: state.mergeGuides,
        windows: updatedWindows,
    });
}

export function setWindowStateDividerProfile(stateValue, dividerProfileId) {
    const state = normalizeWindowState(stateValue);
    return normalizeWindowState({
        ...state,
        dividerProfileId: String(dividerProfileId || state.dividerProfileId),
    });
}


export function setWindowStateTransProfile(stateValue, transProfileId) {
    const state = normalizeWindowState(stateValue);
    return normalizeWindowState({
        ...state,
        transProfileId: String(transProfileId || state.transProfileId || DEFAULT_TRANS_PROFILE_ID),
    });
}

export function classifyWindowState(stateValue) {
    const state = normalizeWindowState(stateValue);
    const cells = [...state.windows];
    const bounds = stateBounds(cells);
    const byX = [...cells].sort((a, b) => a.rect.x0 - b.rect.x0 || a.rect.y0 - b.rect.y0);
    const byY = [...cells].sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);

    if (cells.length === 1) return Object.freeze({ kind: 'single', cells: Object.freeze(cells) });
    const allFullHeight = cells.every(cell =>
        nearlyEqual(cell.rect.y0, bounds.y0) && nearlyEqual(cell.rect.y1, bounds.y1)
    );
    if (allFullHeight) return Object.freeze({ kind: 'linear', orientation: 'vertical', cells: Object.freeze(byX) });
    const allFullWidth = cells.every(cell =>
        nearlyEqual(cell.rect.x0, bounds.x0) && nearlyEqual(cell.rect.x1, bounds.x1)
    );
    if (allFullWidth) return Object.freeze({ kind: 'linear', orientation: 'horizontal', cells: Object.freeze(byY) });

    if (cells.length === 3) {
        // Legacy T layouts fill one complete rectangular assembly. An editable
        // L layout leaves one quadrant empty, so it must not inherit T-specific
        // profile behavior just because one of its unit cells happens to end at 1.
        const boundsArea = rectArea(bounds);
        const cellsArea = cells.reduce((sum, cell) => sum + rectArea(cell.rect), 0);
        const fillsBounds = Math.abs(boundsArea - cellsArea) <= 1e-6;

        if (fillsBounds) {
            const top = cells.find(cell =>
                nearlyEqual(cell.rect.x0, bounds.x0)
                && nearlyEqual(cell.rect.x1, bounds.x1)
                && nearlyEqual(cell.rect.y1, bounds.y1)
                && cell.rect.y0 > bounds.y0 + EPSILON
            );
            if (top) return Object.freeze({ kind: 't-grid', spanningSide: 'top', spanningCellId: top.id, cells: Object.freeze(cells) });
            const bottom = cells.find(cell =>
                nearlyEqual(cell.rect.x0, bounds.x0)
                && nearlyEqual(cell.rect.x1, bounds.x1)
                && nearlyEqual(cell.rect.y0, bounds.y0)
                && cell.rect.y1 < bounds.y1 - EPSILON
            );
            if (bottom) return Object.freeze({ kind: 't-grid', spanningSide: 'bottom', spanningCellId: bottom.id, cells: Object.freeze(cells) });
            const left = cells.find(cell =>
                nearlyEqual(cell.rect.y0, bounds.y0)
                && nearlyEqual(cell.rect.y1, bounds.y1)
                && nearlyEqual(cell.rect.x0, bounds.x0)
                && cell.rect.x1 < bounds.x1 - EPSILON
            );
            if (left) return Object.freeze({ kind: 't-grid', spanningSide: 'left', spanningCellId: left.id, cells: Object.freeze(cells) });
            const right = cells.find(cell =>
                nearlyEqual(cell.rect.y0, bounds.y0)
                && nearlyEqual(cell.rect.y1, bounds.y1)
                && nearlyEqual(cell.rect.x1, bounds.x1)
                && cell.rect.x0 > bounds.x0 + EPSILON
            );
            if (right) return Object.freeze({ kind: 't-grid', spanningSide: 'right', spanningCellId: right.id, cells: Object.freeze(cells) });
        }
    }

    return Object.freeze({ kind: 'grid', cells: Object.freeze(cells) });
}

export function serializeWindowState(stateValue) {
    const state = normalizeWindowState(stateValue);
    return JSON.stringify({
        version: WINDOW_STATE_VERSION,
        dividerProfileId: state.dividerProfileId,
        transProfileId: state.transProfileId,
        transConnections: state.transConnections.map(connection => ({
            id: connection.id,
            cellAId: connection.cellAId,
            cellBId: connection.cellBId,
            ownerCellId: connection.ownerCellId,
        })),
        gridTracks: {
            x: state.gridTracks.x.map(track => ({ ...track })),
            y: state.gridTracks.y.map(track => ({ ...track })),
        },
        mergeGuides: state.mergeGuides.map(guide => ({
            orientation: guide.orientation,
            coordinate: guide.coordinate,
            start: guide.start,
            end: guide.end,
            ...(Array.isArray(guide.restoreCells) && guide.restoreCells.length === 2
                ? {
                    restoreCells: guide.restoreCells.map(cell => ({
                        id: cell.id,
                        type: cell.type,
                        handleSide: cell.handleSide,
                        rect: cell.rect,
                    })),
                }
                : {}),
        })),
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
