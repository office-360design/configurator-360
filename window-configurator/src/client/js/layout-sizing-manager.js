const EPSILON = 1e-8;
const MIN_TRACK_M = 0.05;
const MIN_WINDOW_M = 0.45;
const DEFAULT_EDGE_EXTENSION_M = 0.013;
const SIZE_REBUILD_INTERVAL_MS = 70;

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function hasFiniteValue(value) {
    return value !== null
        && value !== undefined
        && value !== ''
        && Number.isFinite(Number(value));
}

function nearlyEqual(a, b) {
    return Math.abs(finite(a) - finite(b)) <= EPSILON;
}

function coordinateKey(value) {
    return finite(value).toFixed(8);
}

function trackKey(track) {
    return `${coordinateKey(track.start)}:${coordinateKey(track.end)}`;
}

function cloneState(state) {
    return {
        ...state,
        gridTracks: {
            x: (state?.gridTracks?.x || []).map(track => ({ ...track })),
            y: (state?.gridTracks?.y || []).map(track => ({ ...track })),
        },
        windows: (state?.windows || []).map(cell => ({
            ...cell,
            rect: { ...cell.rect },
        })),
        transConnections: (state?.transConnections || []).map(connection => ({ ...connection })),
        mergeGuides: (state?.mergeGuides || []).map(guide => ({
            ...guide,
            ...(Array.isArray(guide.restoreCells)
                ? {
                    restoreCells: guide.restoreCells.map(cell => ({
                        ...cell,
                        rect: { ...cell.rect },
                    })),
                }
                : {}),
        })),
    };
}

function stateBounds(state) {
    const windows = state?.windows || [];
    if (!windows.length) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    return {
        x0: Math.min(...windows.map(cell => finite(cell.rect?.x0))),
        y0: Math.min(...windows.map(cell => finite(cell.rect?.y0))),
        x1: Math.max(...windows.map(cell => finite(cell.rect?.x1, 1))),
        y1: Math.max(...windows.map(cell => finite(cell.rect?.y1, 1))),
    };
}

function tracksForCell(state, cell, axis) {
    if (!cell) return [];
    const start = axis === 'x' ? finite(cell.rect?.x0) : finite(cell.rect?.y0);
    const end = axis === 'x' ? finite(cell.rect?.x1) : finite(cell.rect?.y1);
    return (state?.gridTracks?.[axis] || []).filter(track => (
        finite(track.start) >= start - EPSILON
        && finite(track.end) <= end + EPSILON
        && finite(track.end) > finite(track.start) + EPSILON
    ));
}

function cellOuterSideCount(state, cell, axis) {
    const bounds = stateBounds(state);
    if (axis === 'x') {
        return (nearlyEqual(cell.rect.x0, bounds.x0) ? 1 : 0)
            + (nearlyEqual(cell.rect.x1, bounds.x1) ? 1 : 0);
    }
    return (nearlyEqual(cell.rect.y0, bounds.y0) ? 1 : 0)
        + (nearlyEqual(cell.rect.y1, bounds.y1) ? 1 : 0);
}

function sumTrackSizes(tracks) {
    return (tracks || []).reduce((sum, track) => sum + Math.max(0, finite(track.sizeM)), 0);
}

function distributeToTarget(tracks, targetTotal) {
    const source = tracks || [];
    if (!source.length) return new Map();
    const minimumTotal = MIN_TRACK_M * source.length;
    const resolvedTarget = Math.max(minimumTotal, finite(targetTotal, minimumTotal));
    const currentTotal = sumTrackSizes(source);
    const result = new Map();

    if (currentTotal > EPSILON) {
        const scale = resolvedTarget / currentTotal;
        source.forEach(track => result.set(
            trackKey(track),
            Math.max(MIN_TRACK_M, finite(track.sizeM) * scale)
        ));
    } else {
        const equal = resolvedTarget / source.length;
        source.forEach(track => result.set(trackKey(track), equal));
    }

    // MIN_TRACK_M clamping can move the total slightly. Put any remaining
    // difference on the largest track so the requested overall sum remains exact.
    const entries = source.map(track => ({
        key: trackKey(track),
        sizeM: result.get(trackKey(track)),
    }));
    let resolvedSum = entries.reduce((sum, entry) => sum + entry.sizeM, 0);
    let delta = resolvedTarget - resolvedSum;
    if (Math.abs(delta) > EPSILON) {
        const adjustable = [...entries].sort((a, b) => b.sizeM - a.sizeM);
        for (const entry of adjustable) {
            const current = result.get(entry.key);
            const next = Math.max(MIN_TRACK_M, current + delta);
            const applied = next - current;
            result.set(entry.key, next);
            delta -= applied;
            if (Math.abs(delta) <= EPSILON) break;
        }
    }
    return result;
}


function distributeTracksEquallyInMillimetres(
    tracks,
    targetStructuralM,
    { allTracks = tracks, edgeExtensionM = DEFAULT_EDGE_EXTENSION_M } = {}
) {
    const source = tracks || [];
    if (!source.length) return new Map();

    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_EDGE_EXTENSION_M));
    const complete = allTracks || source;
    const minStart = Math.min(...complete.map(track => finite(track.start)));
    const maxEnd = Math.max(...complete.map(track => finite(track.end)));
    const outerCorrectionM = track => (
        (nearlyEqual(track.start, minStart) ? 1 : 0)
        + (nearlyEqual(track.end, maxEnd) ? 1 : 0)
    ) * extension;

    const correctionTotalM = source.reduce((sum, track) => sum + outerCorrectionM(track), 0);
    const targetActualMm = Math.round((finite(targetStructuralM) + correctionTotalM) * 1000);
    const baseActualMm = Math.floor(targetActualMm / source.length);
    let remainderMm = targetActualMm - baseActualMm * source.length;
    const result = new Map();

    source.forEach(track => {
        const actualMm = baseActualMm + (remainderMm > 0 ? 1 : 0);
        if (remainderMm > 0) remainderMm -= 1;
        result.set(
            trackKey(track),
            Math.max(MIN_TRACK_M, actualMm / 1000 - outerCorrectionM(track))
        );
    });

    // Keep the structural sum mathematically exact as well. With the normal
    // 13 mm frame correction and millimetre inputs this is normally zero, but
    // correcting the last track avoids floating-point residue accumulating.
    const resolvedStructural = [...result.values()].reduce((sum, value) => sum + value, 0);
    const delta = finite(targetStructuralM) - resolvedStructural;
    if (Math.abs(delta) > EPSILON) {
        const last = source.at(-1);
        const key = trackKey(last);
        result.set(key, Math.max(MIN_TRACK_M, finite(result.get(key)) + delta));
    }

    return result;
}

function applySizeMap(tracks, sizeMap) {
    return (tracks || []).map(track => ({
        ...track,
        sizeM: sizeMap.has(trackKey(track)) ? sizeMap.get(trackKey(track)) : track.sizeM,
    }));
}

export function getOverallLayoutDimensions(
    state,
    { edgeExtensionM = DEFAULT_EDGE_EXTENSION_M } = {}
) {
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_EDGE_EXTENSION_M));
    return {
        widthM: sumTrackSizes(state?.gridTracks?.x) + extension * 2,
        heightM: sumTrackSizes(state?.gridTracks?.y) + extension * 2,
    };
}

export function resetLayoutTracksEqually(
    stateValue,
    {
        widthM = null,
        heightM = null,
        edgeExtensionM = DEFAULT_EDGE_EXTENSION_M,
    } = {}
) {
    const state = cloneState(stateValue);
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_EDGE_EXTENSION_M));
    const current = getOverallLayoutDimensions(state, { edgeExtensionM: extension });

    const resetAxis = (axis, requestedActualM) => {
        const tracks = state.gridTracks?.[axis] || [];
        if (!tracks.length) return tracks;
        const targetActual = hasFiniteValue(requestedActualM)
            ? Number(requestedActualM)
            : (axis === 'x' ? current.widthM : current.heightM);
        const targetStructural = targetActual - extension * 2;
        const sizeMap = distributeTracksEquallyInMillimetres(tracks, targetStructural, {
            allTracks: tracks,
            edgeExtensionM: extension,
        });
        return applySizeMap(tracks, sizeMap);
    };

    state.gridTracks.x = resetAxis('x', widthM);
    state.gridTracks.y = resetAxis('y', heightM);
    return state;
}

function lockSetForAxis(locks, axis) {
    const result = new Set();
    locks.forEach((axes, cellId) => {
        if (axes?.has(axis)) result.add(String(cellId));
    });
    return result;
}

function lockedTrackKeysForAxis(state, locks, axis, ignoredCellId = null) {
    const lockedCellIds = lockSetForAxis(locks, axis);
    const keys = new Set();
    for (const cellId of lockedCellIds) {
        if (ignoredCellId !== null && String(cellId) === String(ignoredCellId)) continue;
        const cell = state.windows.find(candidate => String(candidate.id) === String(cellId));
        tracksForCell(state, cell, axis).forEach(track => keys.add(trackKey(track)));
    }
    return keys;
}

function releaseLocksTouchingTrackKeys(state, locks, axis, keys, ignoredCellId = null) {
    const released = new Set();
    for (const [cellId, axes] of locks.entries()) {
        if (!axes?.has(axis)) continue;
        if (ignoredCellId !== null && String(cellId) === String(ignoredCellId)) continue;
        const cell = state.windows.find(candidate => String(candidate.id) === String(cellId));
        const touches = tracksForCell(state, cell, axis).some(track => keys.has(trackKey(track)));
        if (!touches) continue;
        axes.delete(axis);
        if (!axes.size) locks.delete(cellId);
        released.add(String(cellId));
    }
    return released;
}

function setCellAxisLocked(locks, cellId, axis) {
    const id = String(cellId);
    const axes = locks.get(id) || new Set();
    axes.add(axis);
    locks.set(id, axes);
}

function makeCellAxisLocks(cellIds, axis) {
    const locks = new Map();
    for (const cellId of cellIds || []) {
        locks.set(String(cellId), new Set([axis]));
    }
    return locks;
}

function cellsInAxisLayer(state, referenceCell, axis) {
    if (!referenceCell) return [];
    const perpendicularAxis = axis === 'x' ? 'y' : 'x';
    const referenceStart = perpendicularAxis === 'x'
        ? finite(referenceCell.rect?.x0)
        : finite(referenceCell.rect?.y0);
    const referenceEnd = perpendicularAxis === 'x'
        ? finite(referenceCell.rect?.x1)
        : finite(referenceCell.rect?.y1);

    return (state?.windows || []).filter(cell => {
        const start = perpendicularAxis === 'x'
            ? finite(cell.rect?.x0)
            : finite(cell.rect?.y0);
        const end = perpendicularAxis === 'x'
            ? finite(cell.rect?.x1)
            : finite(cell.rect?.y1);
        return Math.min(referenceEnd, end) - Math.max(referenceStart, start) > EPSILON;
    });
}

function filterAxisLocksToCellIds(locks, axis, cellIds) {
    const allowed = new Set((cellIds || []).map(id => String(id)));
    const filtered = new Map();
    for (const [cellId, axes] of locks.entries()) {
        const id = String(cellId);
        if (!allowed.has(id) || !axes?.has(axis)) continue;
        filtered.set(id, new Set([axis]));
    }
    return filtered;
}

function clearModifiedCell(modifiedAxes, modifiedCells, cellId) {
    const id = String(cellId);
    modifiedAxes.delete(id);
    modifiedCells.delete(id);
}

function cellAxisDistance(cell, referenceCell, axis) {
    if (!cell || !referenceCell) return Number.POSITIVE_INFINITY;
    const start = axis === 'x' ? finite(cell.rect?.x0) : finite(cell.rect?.y0);
    const end = axis === 'x' ? finite(cell.rect?.x1) : finite(cell.rect?.y1);
    const referenceStart = axis === 'x' ? finite(referenceCell.rect?.x0) : finite(referenceCell.rect?.y0);
    const referenceEnd = axis === 'x' ? finite(referenceCell.rect?.x1) : finite(referenceCell.rect?.y1);
    if (end <= referenceStart + EPSILON) return Math.max(0, referenceStart - end);
    if (start >= referenceEnd - EPSILON) return Math.max(0, start - referenceEnd);
    return 0;
}

function releaseOneAxisLock(state, locks, axis, { referenceCellId = null } = {}) {
    const referenceCell = referenceCellId === null
        ? null
        : state.windows.find(cell => String(cell.id) === String(referenceCellId));
    const candidates = [];
    let order = 0;
    for (const [cellId, axes] of locks.entries()) {
        if (!axes?.has(axis)) {
            order += 1;
            continue;
        }
        if (referenceCellId !== null && String(cellId) === String(referenceCellId)) {
            order += 1;
            continue;
        }
        const cell = state.windows.find(candidate => String(candidate.id) === String(cellId));
        if (!cell) {
            order += 1;
            continue;
        }
        candidates.push({
            cellId: String(cellId),
            distance: referenceCell ? cellAxisDistance(cell, referenceCell, axis) : 0,
            // Preserve the most recently edited windows when distance is tied.
            // Map iteration order is edit order, so the oldest lock is released first.
            order,
        });
        order += 1;
    }
    candidates.sort((a, b) => a.distance - b.distance || a.order - b.order);
    const chosen = candidates[0];
    if (!chosen) return new Set();

    const axes = locks.get(chosen.cellId);
    axes?.delete(axis);
    if (axes && !axes.size) locks.delete(chosen.cellId);
    return new Set([chosen.cellId]);
}

function resizeSelectedAxisPreservingOverall(state, locks, cellId, axis, targetActualM, extension) {
    if (!hasFiniteValue(targetActualM)) {
        return { state, releasedCellIds: new Set(), hasAdjustableOutsideTracks: false };
    }

    const next = cloneState(state);
    const cell = next.windows.find(candidate => String(candidate.id) === String(cellId));
    if (!cell) throw new Error(`Unknown window ${cellId}.`);

    const allTracks = next.gridTracks?.[axis] || [];
    const selectedTracks = tracksForCell(next, cell, axis);
    if (!selectedTracks.length) return { state: next, releasedCellIds: new Set(), hasAdjustableOutsideTracks: false };

    const selectedKeys = new Set(selectedTracks.map(trackKey));
    const outsideTracks = allTracks.filter(track => !selectedKeys.has(trackKey(track)));
    const targetSelectedStructuralRaw = Math.max(
        MIN_TRACK_M * selectedTracks.length,
        Number(targetActualM) - cellOuterSideCount(next, cell, axis) * extension
    );

    // A cell spanning every track in an axis is the whole layout in that axis.
    // There is no neighbouring track that can absorb the change, so its direct
    // edit also changes the overall size rather than fabricating an impossible split.
    if (!outsideTracks.length) {
        const selectedSizes = distributeToTarget(selectedTracks, targetSelectedStructuralRaw);
        next.gridTracks[axis] = applySizeMap(allTracks, selectedSizes);
        setCellAxisLocked(locks, cellId, axis);
        return { state: next, releasedCellIds: new Set(), hasAdjustableOutsideTracks: false };
    }

    const totalStructural = sumTrackSizes(allTracks);
    const lockedOutsideKeys = lockedTrackKeysForAxis(next, locks, axis, cellId);
    const lockedOutsideTracks = outsideTracks.filter(track => lockedOutsideKeys.has(trackKey(track)));
    const adjustableOutsideTracks = outsideTracks.filter(track => !lockedOutsideKeys.has(trackKey(track)));
    const lockedStructural = sumTrackSizes(lockedOutsideTracks);
    const minimumAdjustable = MIN_TRACK_M * adjustableOutsideTracks.length;
    const maximumSelected = Math.max(
        MIN_TRACK_M * selectedTracks.length,
        totalStructural - lockedStructural - minimumAdjustable
    );

    // Older edited windows remain fixed here. If they block the requested edit,
    // the caller releases only the minimum number of locks and retries from the
    // original state. This avoids clearing every modified flag at once.
    const targetSelectedStructural = adjustableOutsideTracks.length
        ? Math.min(targetSelectedStructuralRaw, maximumSelected)
        : Math.max(
            MIN_TRACK_M * selectedTracks.length,
            totalStructural - lockedStructural
        );
    const selectedSizes = distributeToTarget(selectedTracks, targetSelectedStructural);
    const selectedStructural = [...selectedSizes.values()].reduce((sum, value) => sum + value, 0);
    const adjustableTarget = Math.max(
        minimumAdjustable,
        totalStructural - selectedStructural - lockedStructural
    );
    const adjustableSizes = distributeTracksEquallyInMillimetres(
        adjustableOutsideTracks,
        adjustableTarget,
        { allTracks, edgeExtensionM: extension }
    );

    const mergedSizes = new Map([...selectedSizes, ...adjustableSizes]);
    next.gridTracks[axis] = applySizeMap(allTracks, mergedSizes);
    setCellAxisLocked(locks, cellId, axis);
    return {
        state: next,
        releasedCellIds: new Set(),
        hasAdjustableOutsideTracks: adjustableOutsideTracks.length > 0,
    };
}


function resizeSelectedAxisPreservingOverallWithTrackLocks(
    state,
    lockedTrackKeys,
    cellId,
    axis,
    targetActualM,
    extension
) {
    if (!hasFiniteValue(targetActualM)) {
        return { state, hasAdjustableOutsideTracks: false };
    }

    const next = cloneState(state);
    const cell = next.windows.find(candidate => String(candidate.id) === String(cellId));
    if (!cell) throw new Error(`Unknown window ${cellId}.`);

    const allTracks = next.gridTracks?.[axis] || [];
    const selectedTracks = tracksForCell(next, cell, axis);
    if (!selectedTracks.length) return { state: next, hasAdjustableOutsideTracks: false };

    const selectedKeys = new Set(selectedTracks.map(trackKey));
    const outsideTracks = allTracks.filter(track => !selectedKeys.has(trackKey(track)));
    const targetSelectedStructuralRaw = Math.max(
        MIN_TRACK_M * selectedTracks.length,
        Number(targetActualM) - cellOuterSideCount(next, cell, axis) * extension
    );

    // A cell spanning every track controls the whole layout on this axis.
    if (!outsideTracks.length) {
        const selectedSizes = distributeToTarget(selectedTracks, targetSelectedStructuralRaw);
        next.gridTracks[axis] = applySizeMap(allTracks, selectedSizes);
        return { state: next, hasAdjustableOutsideTracks: false };
    }

    const totalStructural = sumTrackSizes(allTracks);
    const locks = lockedTrackKeys instanceof Set ? lockedTrackKeys : new Set();
    const lockedOutsideTracks = outsideTracks.filter(track => locks.has(trackKey(track)));
    const adjustableOutsideTracks = outsideTracks.filter(track => !locks.has(trackKey(track)));
    const lockedStructural = sumTrackSizes(lockedOutsideTracks);
    const minimumAdjustable = MIN_TRACK_M * adjustableOutsideTracks.length;
    const maximumSelected = Math.max(
        MIN_TRACK_M * selectedTracks.length,
        totalStructural - lockedStructural - minimumAdjustable
    );

    const targetSelectedStructural = adjustableOutsideTracks.length
        ? Math.min(targetSelectedStructuralRaw, maximumSelected)
        : Math.max(
            MIN_TRACK_M * selectedTracks.length,
            totalStructural - lockedStructural
        );
    const selectedSizes = distributeToTarget(selectedTracks, targetSelectedStructural);
    const selectedStructural = [...selectedSizes.values()].reduce((sum, value) => sum + value, 0);
    const adjustableTarget = Math.max(
        minimumAdjustable,
        totalStructural - selectedStructural - lockedStructural
    );
    const adjustableSizes = distributeTracksEquallyInMillimetres(
        adjustableOutsideTracks,
        adjustableTarget,
        { allTracks, edgeExtensionM: extension }
    );

    const mergedSizes = new Map([...selectedSizes, ...adjustableSizes]);
    next.gridTracks[axis] = applySizeMap(allTracks, mergedSizes);
    return {
        state: next,
        hasAdjustableOutsideTracks: adjustableOutsideTracks.length > 0,
    };
}

function resizeOverallAxis(state, locks, axis, targetActualM, extension) {
    if (!hasFiniteValue(targetActualM)) {
        return { state, resizedModifiedCellIds: new Set() };
    }
    const next = cloneState(state);
    const tracks = next.gridTracks?.[axis] || [];
    if (!tracks.length) return { state: next, resizedModifiedCellIds: new Set() };

    const minimumStructural = MIN_TRACK_M * tracks.length;
    const targetStructural = Math.max(minimumStructural, Number(targetActualM) - extension * 2);
    const lockedKeys = lockedTrackKeysForAxis(next, locks, axis);
    const lockedTracks = tracks.filter(track => lockedKeys.has(trackKey(track)));
    const adjustableTracks = tracks.filter(track => !lockedKeys.has(trackKey(track)));
    const lockedStructural = sumTrackSizes(lockedTracks);
    const minimumAdjustable = MIN_TRACK_M * adjustableTracks.length;

    let resizedModifiedCellIds = new Set();

    if (
        adjustableTracks.length
        && targetStructural >= lockedStructural + minimumAdjustable - EPSILON
    ) {
        const adjustableTarget = Math.max(minimumAdjustable, targetStructural - lockedStructural);
        const adjustableSizes = distributeTracksEquallyInMillimetres(
            adjustableTracks,
            adjustableTarget,
            { allTracks: tracks, edgeExtensionM: extension }
        );
        next.gridTracks[axis] = applySizeMap(tracks, adjustableSizes);
        return { state: next, resizedModifiedCellIds };
    }

    // The overall size control is allowed to resize previously modified windows.
    // Their modified flags stay set; the flags describe that the user explicitly
    // edited those windows, rather than acting as permanent immovable locks.
    const beforeSizes = new Map();
    for (const cellId of lockSetForAxis(locks, axis)) {
        const cell = next.windows.find(candidate => String(candidate.id) === String(cellId));
        if (cell) beforeSizes.set(cellId, getCellActualAxisSize(next, cell, axis, extension));
    }
    const allSizes = distributeTracksEquallyInMillimetres(tracks, targetStructural, {
        allTracks: tracks,
        edgeExtensionM: extension,
    });
    next.gridTracks[axis] = applySizeMap(tracks, allSizes);
    for (const [cellId, before] of beforeSizes) {
        const cell = next.windows.find(candidate => String(candidate.id) === String(cellId));
        if (!cell) continue;
        const after = getCellActualAxisSize(next, cell, axis, extension);
        if (!nearlyEqual(before, after)) resizedModifiedCellIds.add(String(cellId));
    }
    return { state: next, resizedModifiedCellIds };
}

function createSharedFeedback() {
    if (typeof document === 'undefined') return { show() {} };
    let fallbackTimer = null;

    function feedbackElement() {
        return document.querySelector('[data-save-feedback]');
    }

    return {
        show(message, { type = 'error', durationMs = 2000 } = {}) {
            const feedback = feedbackElement();
            if (!(feedback instanceof HTMLElement)) return;
            const text = feedback.querySelector('[data-save-feedback-text]');
            if (!(text instanceof HTMLElement)) return;

            if (fallbackTimer !== null) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            const feedbackType = type === 'error' ? 'is-error' : 'is-success';
            feedback.classList.remove('is-success', 'is-error', 'is-animating');
            void feedback.offsetWidth;
            const duration = Math.max(300, Number(durationMs) || 2000);
            feedback.style.animationDuration = `${duration}ms`;
            text.textContent = String(message || '');
            feedback.classList.add(feedbackType, 'is-animating');

            fallbackTimer = setTimeout(() => {
                feedback.classList.remove('is-animating');
                feedback.style.removeProperty('animation-duration');
                fallbackTimer = null;
            }, duration + 80);
        },
    };
}

function getCellActualAxisSize(state, cell, axis, extension) {
    return sumTrackSizes(tracksForCell(state, cell, axis))
        + cellOuterSideCount(state, cell, axis) * extension;
}

function stateMeetsMinimumWindowSize(
    state,
    axis,
    minWindowM = MIN_WINDOW_M,
    extension = DEFAULT_EDGE_EXTENSION_M
) {
    return (state?.windows || []).every(cell => (
        getCellActualAxisSize(state, cell, axis, extension) >= minWindowM - EPSILON
    ));
}

function minimumAxisStructuralTotal(
    state,
    axis,
    minWindowM = MIN_WINDOW_M,
    extension = DEFAULT_EDGE_EXTENSION_M
) {
    const tracks = [...(state?.gridTracks?.[axis] || [])]
        .sort((a, b) => finite(a.start) - finite(b.start) || finite(a.end) - finite(b.end));
    if (!tracks.length) return 0;

    const indexByKey = new Map(tracks.map((track, index) => [trackKey(track), index]));
    const minimumSizes = tracks.map(() => MIN_TRACK_M);
    const constraints = [];

    for (const cell of state?.windows || []) {
        const selected = tracksForCell(state, cell, axis);
        const indices = selected
            .map(track => indexByKey.get(trackKey(track)))
            .filter(index => Number.isInteger(index));
        if (!indices.length) continue;
        const startIndex = Math.min(...indices);
        const endIndex = Math.max(...indices);
        const requiredStructural = Math.max(
            MIN_TRACK_M * indices.length,
            minWindowM - cellOuterSideCount(state, cell, axis) * extension
        );
        constraints.push({ startIndex, endIndex, requiredStructural });
    }

    // Continuous interval-covering greedy: satisfy the shortest-ending spans
    // first and put each deficit at the interval's latest track. This yields the
    // minimum total structural length while respecting every cell's 450 mm limit.
    constraints.sort((a, b) => a.endIndex - b.endIndex || b.startIndex - a.startIndex);
    for (const constraint of constraints) {
        let current = 0;
        for (let index = constraint.startIndex; index <= constraint.endIndex; index += 1) {
            current += minimumSizes[index];
        }
        const deficit = constraint.requiredStructural - current;
        if (deficit > EPSILON) minimumSizes[constraint.endIndex] += deficit;
    }
    return minimumSizes.reduce((sum, value) => sum + value, 0);
}

function getMinimumOverallLayoutDimensions(
    state,
    { minWindowM = MIN_WINDOW_M, edgeExtensionM = DEFAULT_EDGE_EXTENSION_M } = {}
) {
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_EDGE_EXTENSION_M));
    return {
        widthM: minimumAxisStructuralTotal(state, 'x', minWindowM, extension) + extension * 2,
        heightM: minimumAxisStructuralTotal(state, 'y', minWindowM, extension) + extension * 2,
    };
}

function repairAxisMinimums(
    stateValue,
    axis,
    minWindowM,
    extension,
    { protectedTrackKeys = new Set() } = {}
) {
    const state = cloneState(stateValue);
    const tracks = state.gridTracks?.[axis] || [];
    const byKey = new Map(tracks.map(track => [trackKey(track), track]));
    const constraints = (state.windows || []).map(cell => {
        const cellTracks = tracksForCell(state, cell, axis);
        return {
            keys: new Set(cellTracks.map(trackKey)),
            required: Math.max(
                MIN_TRACK_M * cellTracks.length,
                minWindowM - cellOuterSideCount(state, cell, axis) * extension
            ),
        };
    }).filter(constraint => constraint.keys.size);

    const constraintSum = constraint => {
        let sum = 0;
        constraint.keys.forEach(key => { sum += Math.max(0, finite(byKey.get(key)?.sizeM)); });
        return sum;
    };

    const maxIterations = Math.max(32, tracks.length * Math.max(1, constraints.length) * 12);
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const violated = constraints
            .map(constraint => ({ constraint, deficit: constraint.required - constraintSum(constraint) }))
            .filter(entry => entry.deficit > EPSILON)
            .sort((a, b) => b.deficit - a.deficit)[0];
        if (!violated) return { state, feasible: true };

        let best = null;
        for (const receiverKey of violated.constraint.keys) {
            if (protectedTrackKeys.has(receiverKey)) continue;
            for (const donor of tracks) {
                const donorKey = trackKey(donor);
                if (violated.constraint.keys.has(donorKey) || protectedTrackKeys.has(donorKey)) continue;
                let available = Math.max(0, finite(donor.sizeM) - MIN_TRACK_M);
                if (available <= EPSILON) continue;

                for (const constraint of constraints) {
                    const donorInside = constraint.keys.has(donorKey);
                    const receiverInside = constraint.keys.has(receiverKey);
                    if (!donorInside || receiverInside) continue;
                    const slack = constraintSum(constraint) - constraint.required;
                    available = Math.min(available, Math.max(0, slack));
                    if (available <= EPSILON) break;
                }
                if (available <= EPSILON) continue;
                if (!best || available > best.available) {
                    best = { receiverKey, donorKey, available };
                }
            }
        }

        if (!best) return { state, feasible: false };
        const transfer = Math.min(violated.deficit, best.available);
        const receiver = byKey.get(best.receiverKey);
        const donor = byKey.get(best.donorKey);
        receiver.sizeM = finite(receiver.sizeM) + transfer;
        donor.sizeM = Math.max(MIN_TRACK_M, finite(donor.sizeM) - transfer);
    }

    return {
        state,
        feasible: stateMeetsMinimumWindowSize(state, axis, minWindowM, extension),
    };
}

function constrainAxisChangeToMinimum(
    previousState,
    proposedState,
    axis,
    minWindowM,
    extension
) {
    if (stateMeetsMinimumWindowSize(proposedState, axis, minWindowM, extension)) {
        return proposedState;
    }
    if (!stateMeetsMinimumWindowSize(previousState, axis, minWindowM, extension)) {
        // Old saved configurations can predate this limit. Do not make such a
        // state smaller still; retain the previous axis until the user enlarges it.
        return cloneState(previousState);
    }

    const previousByKey = new Map(
        (previousState.gridTracks?.[axis] || []).map(track => [trackKey(track), finite(track.sizeM)])
    );
    const proposedTracks = proposedState.gridTracks?.[axis] || [];
    const makeCandidate = factor => {
        const candidate = cloneState(proposedState);
        candidate.gridTracks[axis] = proposedTracks.map(track => {
            const previousSize = previousByKey.get(trackKey(track));
            if (!Number.isFinite(previousSize)) return { ...track };
            return {
                ...track,
                sizeM: previousSize + (finite(track.sizeM) - previousSize) * factor,
            };
        });
        return candidate;
    };

    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 48; iteration += 1) {
        const middle = (low + high) / 2;
        if (stateMeetsMinimumWindowSize(makeCandidate(middle), axis, minWindowM, extension)) {
            low = middle;
        } else {
            high = middle;
        }
    }
    return makeCandidate(low);
}

function createOverallControls({ widthMinM, widthMaxM, heightMinM, heightMaxM, onResize }) {
    if (typeof document === 'undefined') return null;
    const hingeControls = document.getElementById('hingeTypeControls');
    if (!hingeControls) return null;

    const existing = document.getElementById('overallWindowSizeControls');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'overallWindowSizeControls';
    wrapper.innerHTML = `
        <div class="control-group window-size-control selected-window-size-control overall-window-size-control" id="overallWindowWidthControl">
            <div class="selected-window-size-heading">
                <span class="selected-window-size-name">Width:</span>
                <span class="selected-window-size-value">
                    <input type="number" id="valOverallWidth" step="1" inputmode="numeric" aria-label="Overall layout width in millimetres">
                    <span class="selected-window-size-unit">mm</span>
                </span>
            </div>
            <div class="selected-window-size-row">
                <button type="button" id="btnOverallWidthDec" class="handle-side-btn">-</button>
                <input type="range" id="overallWidthA" min="0.05" max="${widthMaxM}" step="0.001">
                <button type="button" id="btnOverallWidthInc" class="handle-side-btn">+</button>
            </div>
        </div>
        <div class="control-group window-size-control selected-window-size-control overall-window-size-control" id="overallWindowHeightControl">
            <div class="selected-window-size-heading">
                <span class="selected-window-size-name">Height:</span>
                <span class="selected-window-size-value">
                    <input type="number" id="valOverallHeight" step="1" inputmode="numeric" aria-label="Overall layout height in millimetres">
                    <span class="selected-window-size-unit">mm</span>
                </span>
            </div>
            <div class="selected-window-size-row">
                <button type="button" id="btnOverallHeightDec" class="handle-side-btn">-</button>
                <input type="range" id="overallHeightB" min="0.05" max="${heightMaxM}" step="0.001">
                <button type="button" id="btnOverallHeightInc" class="handle-side-btn">+</button>
            </div>
        </div>
    `;
    hingeControls.before(wrapper);

    const style = document.createElement('style');
    style.textContent = `
        #overallWindowSizeControls { margin-top: 4px; }
        #overallWindowSizeControls .overall-window-size-control { margin-bottom: 10px; }
        #overallWindowSizeControls #overallWindowHeightControl { padding-top: 0; border-top: 0; }
        body.shared-ui-mounted:not(.shared-ui-dark-mode) #overallWindowSizeControls input[type="range"] { background: #dce4e9; }
        body.shared-ui-mounted:not(.shared-ui-dark-mode) #overallWindowSizeControls input[type="range"]::-webkit-slider-thumb { background: #0878c9; }
        body.shared-ui-mounted:not(.shared-ui-dark-mode) #overallWindowSizeControls input[type="range"]::-moz-range-thumb { background: #0878c9; }
    `;
    document.head.appendChild(style);

    const widthRange = wrapper.querySelector('#overallWidthA');
    const heightRange = wrapper.querySelector('#overallHeightB');
    const widthValue = wrapper.querySelector('#valOverallWidth');
    const heightValue = wrapper.querySelector('#valOverallHeight');
    let timer = null;
    let lastRebuildAt = 0;
    const pendingAxes = new Set();

    const writePair = (range, valueInput, valueM) => {
        const requested = Math.max(0.001, finite(valueM, finite(range.value, 1)));
        let min = Math.max(0.001, finite(range.min, 0.05));
        let max = Math.max(min + 0.001, finite(range.max, requested));

        // The whole layout is not constrained to the single-window slider's
        // 2.0 / 2.2 m bounds. Typing or stepping beyond the current slider span
        // expands the slider automatically, so there is no fixed overall max.
        if (requested > max) {
            max = Math.ceil(requested * 1.15 * 1000) / 1000;
            range.max = String(max);
        }
        if (requested < min) {
            min = Math.max(0.001, Math.floor(requested * 1000) / 1000);
            range.min = String(min);
        }

        range.value = requested.toFixed(3);
        valueInput.value = String(Math.round(requested * 1000));
    };

    const flush = async axis => {
        if (axis) pendingAxes.add(axis);
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        const payload = {};
        if (pendingAxes.has('width')) payload.widthM = finite(widthRange.value);
        if (pendingAxes.has('height')) payload.heightM = finite(heightRange.value);
        pendingAxes.clear();
        lastRebuildAt = performance.now();
        await onResize(payload);
    };

    const queue = axis => {
        pendingAxes.add(axis);
        const range = axis === 'width' ? widthRange : heightRange;
        const value = axis === 'width' ? widthValue : heightValue;
        writePair(range, value, finite(range.value));
        const elapsed = performance.now() - lastRebuildAt;
        if (elapsed >= SIZE_REBUILD_INTERVAL_MS && timer === null) {
            void flush();
            return;
        }
        if (timer === null) {
            timer = setTimeout(() => {
                timer = null;
                void flush();
            }, Math.max(0, SIZE_REBUILD_INTERVAL_MS - elapsed));
        }
    };

    widthRange.addEventListener('input', () => queue('width'));
    heightRange.addEventListener('input', () => queue('height'));
    widthRange.addEventListener('change', () => void flush('width'));
    heightRange.addEventListener('change', () => void flush('height'));

    const bindNumber = (valueInput, range, axis) => {
        const commit = () => {
            const requestedMm = finite(valueInput.value, finite(range.value) * 1000);
            writePair(range, valueInput, requestedMm / 1000);
            void flush(axis);
        };
        valueInput.addEventListener('change', commit);
        valueInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commit();
        });
    };
    bindNumber(widthValue, widthRange, 'width');
    bindNumber(heightValue, heightRange, 'height');

    const step = (range, valueInput, axis, deltaMm) => {
        writePair(range, valueInput, finite(range.value) + deltaMm / 1000);
        void flush(axis);
    };
    wrapper.querySelector('#btnOverallWidthDec').addEventListener('click', () => step(widthRange, widthValue, 'width', -1));
    wrapper.querySelector('#btnOverallWidthInc').addEventListener('click', () => step(widthRange, widthValue, 'width', 1));
    wrapper.querySelector('#btnOverallHeightDec').addEventListener('click', () => step(heightRange, heightValue, 'height', -1));
    wrapper.querySelector('#btnOverallHeightInc').addEventListener('click', () => step(heightRange, heightValue, 'height', 1));

    return {
        sync({ widthM, heightM }) {
            // No topology-derived or single-window min/max is imposed on the
            // overall dimensions. writePair expands the slider span as needed.
            writePair(widthRange, widthValue, widthM);
            writePair(heightRange, heightValue, heightM);
        },
    };
}

export function createLayoutSizingManager({
    controller,
    edgeExtensionM = DEFAULT_EDGE_EXTENSION_M,
    widthMinM = 0.45,
    widthMaxM = 2,
    heightMinM = 0.45,
    heightMaxM = 2.2,
    onAfterChange = () => {},
} = {}) {
    if (!controller) throw new Error('A window layout controller is required.');
    const extension = Math.max(0, finite(edgeExtensionM, DEFAULT_EDGE_EXTENSION_M));

    // Modified state belongs to physical grid tracks: x tracks are columns and
    // y tracks are rows. This keeps the flag logic correct for stacked layouts,
    // grids, and cells that span several tracks.
    const modifiedTrackKeys = {
        x: new Set(),
        y: new Set(),
    };
    // Tracks auto-resized during a full-cycle warning are temporarily protected
    // on the next edit. This preserves the established cycle semantics: after
    // [1,1,0] -> edit 3 -> [0,0,1], editing track 1 leaves track 2 unchanged.
    const protectedResetTrackKeys = {
        x: new Set(),
        y: new Set(),
    };

    const sharedFeedback = createSharedFeedback();
    let applying = Promise.resolve();

    const getState = () => controller.getWindowState();
    const getOverallDimensions = () => getOverallLayoutDimensions(getState(), { edgeExtensionM: extension });

    async function applyState(nextState, shouldWarn = false) {
        const snapshot = controller.getConfigurationSnapshot();
        const result = await controller.applyConfiguration({
            windowState: nextState,
            dividerProfileId: snapshot.dividerProfileId,
            transProfileId: snapshot.transProfileId,
        }, { notify: true });
        controls?.sync(getOverallDimensions());
        onAfterChange(result);
        if (shouldWarn) {
            sharedFeedback.show('The configuration changed the size of other modified windows.', {
                durationMs: 2000,
            });
        }
        return result;
    }

    function enqueue(task) {
        applying = applying.then(task, task);
        return applying;
    }

    function clearTrackFlags() {
        modifiedTrackKeys.x.clear();
        modifiedTrackKeys.y.clear();
        protectedResetTrackKeys.x.clear();
        protectedResetTrackKeys.y.clear();
    }

    function trackSizesByKey(state, axis) {
        return new Map((state?.gridTracks?.[axis] || []).map(track => [
            trackKey(track),
            finite(track.sizeM),
        ]));
    }

    async function resizeWindowNow(cellId, { widthM = null, heightM = null } = {}) {
        let nextState = getState();
        let shouldWarn = false;

        const resizeAxis = (axis, requestedValue) => {
            if (!hasFiniteValue(requestedValue)) return;

            const beforeAxis = nextState;
            const editedCell = beforeAxis.windows.find(cell => String(cell.id) === String(cellId));
            if (!editedCell) throw new Error(`Unknown window ${cellId}.`);

            const requested = Math.max(MIN_WINDOW_M, Number(requestedValue));
            const currentActual = getCellActualAxisSize(beforeAxis, editedCell, axis, extension);
            if (nearlyEqual(currentActual, requested)) return;

            const allTracks = beforeAxis.gridTracks?.[axis] || [];
            const selectedTracks = tracksForCell(beforeAxis, editedCell, axis);
            const selectedKeys = new Set(selectedTracks.map(trackKey));
            const outsideKeys = new Set(
                allTracks
                    .map(trackKey)
                    .filter(key => !selectedKeys.has(key))
            );

            // Manually touching a track that was auto-reset starts a new cycle
            // for that track, so it is no longer protected from compensation.
            for (const key of selectedKeys) protectedResetTrackKeys[axis].delete(key);

            const protectedLocks = protectedResetTrackKeys[axis];
            const usingResetProtection = protectedLocks.size > 0;
            const activeLocks = new Set();
            const sourceLocks = usingResetProtection ? protectedLocks : modifiedTrackKeys[axis];
            for (const key of sourceLocks) {
                if (!selectedKeys.has(key)) activeLocks.add(key);
            }

            let result = resizeSelectedAxisPreservingOverallWithTrackLocks(
                beforeAxis,
                activeLocks,
                cellId,
                axis,
                requested,
                extension
            );

            const protectedKeys = new Set(selectedKeys);
            for (const key of activeLocks) protectedKeys.add(key);
            let repaired = repairAxisMinimums(
                result.state,
                axis,
                MIN_WINDOW_M,
                extension,
                { protectedTrackKeys: protectedKeys }
            );
            let candidate = repaired.feasible
                ? repaired.state
                : constrainAxisChangeToMinimum(beforeAxis, result.state, axis, MIN_WINDOW_M, extension);

            // Warning/reset condition is track-based. If every outside column
            // (for width) or row (for height) is already modified, there is no
            // unmodified track left to absorb this manual edit. Let those old
            // modified tracks resize, warn once, reset only the old track flags,
            // and keep the newly edited track(s) modified.
            const allOutsideAlreadyModified = outsideKeys.size > 0
                && [...outsideKeys].every(key => modifiedTrackKeys[axis].has(key));

            if (!usingResetProtection && allOutsideAlreadyModified) {
                const beforeSizes = trackSizesByKey(beforeAxis, axis);
                result = resizeSelectedAxisPreservingOverallWithTrackLocks(
                    beforeAxis,
                    new Set(),
                    cellId,
                    axis,
                    requested,
                    extension
                );
                repaired = repairAxisMinimums(
                    result.state,
                    axis,
                    MIN_WINDOW_M,
                    extension,
                    { protectedTrackKeys: selectedKeys }
                );
                candidate = repaired.feasible
                    ? repaired.state
                    : constrainAxisChangeToMinimum(beforeAxis, result.state, axis, MIN_WINDOW_M, extension);

                const afterSizes = trackSizesByKey(candidate, axis);
                const resetKeys = new Set(
                    [...outsideKeys].filter(key => modifiedTrackKeys[axis].has(key))
                );
                const changedOldTrack = [...resetKeys].some(key => (
                    !nearlyEqual(beforeSizes.get(key), afterSizes.get(key))
                ));

                if (changedOldTrack) {
                    shouldWarn = true;
                    // A full track cycle resets every previous modified flag on
                    // this axis, not only the tracks whose numerical value moved.
                    // The currently edited track(s) are marked again below.
                    for (const key of resetKeys) {
                        modifiedTrackKeys[axis].delete(key);
                        protectedResetTrackKeys[axis].add(key);
                    }
                }
            }

            nextState = candidate;

            // Only a manual per-window edit sets modified flags. A spanning cell
            // marks every physical row/column track it actually edits.
            for (const key of selectedKeys) modifiedTrackKeys[axis].add(key);
        };

        resizeAxis('x', widthM);
        resizeAxis('y', heightM);
        return applyState(nextState, shouldWarn);
    }

    async function resizeOverallNow({ widthM = null, heightM = null } = {}) {
        let nextState = getState();

        // Overall sizing starts a fresh sizing cycle, so all manual track flags
        // are reset before redistributing the complete axis.
        clearTrackFlags();

        const resizeAxis = (axis, requestedValue) => {
            if (!hasFiniteValue(requestedValue)) return;
            const result = resizeOverallAxis(
                nextState,
                new Map(),
                axis,
                Number(requestedValue),
                extension
            );
            nextState = result.state;
        };

        resizeAxis('x', widthM);
        resizeAxis('y', heightM);
        return applyState(nextState, false);
    }

    const controls = createOverallControls({
        widthMinM,
        widthMaxM,
        heightMinM,
        heightMaxM,
        onResize: payload => enqueue(() => resizeOverallNow(payload)),
    });
    controls?.sync(getOverallDimensions());

    return {
        getOverallDimensions,
        syncOverallControls() {
            controls?.sync(getOverallDimensions());
        },
        resetModifiedFlags() {
            clearTrackFlags();
        },
        resizeWindow(cellId, size = {}) {
            return enqueue(() => resizeWindowNow(cellId, size));
        },
        resizeOverall(size = {}) {
            return enqueue(() => resizeOverallNow(size));
        },
        addWindow(cellId, direction, type, options = {}) {
            return enqueue(async () => {
                // Keep the configurator's original topology sizing behavior:
                // adding a side introduces a new physical track and therefore
                // expands the overall layout instead of squeezing every window
                // back into the previous overall width/height. Notify directly
                // from the topology mutation so the 3D layout rebuild sees the
                // pre-add -> post-add state change.
                const result = await controller.addWindow(cellId, direction, type, {
                    ...options,
                    notify: true,
                });
                clearTrackFlags();
                controls?.sync(getOverallDimensions());
                onAfterChange(result);
                return result;
            });
        },
        deleteWindow(cellId) {
            return enqueue(async () => {
                const result = await controller.deleteWindow(cellId, { notify: true });
                clearTrackFlags();
                controls?.sync(getOverallDimensions());
                onAfterChange(result);
                return result;
            });
        },
    };
}
