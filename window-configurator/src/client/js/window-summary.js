import { getEditableWindowTopologyGeometry } from './window-layout-geometry.js';
import { getWindowLocale, windowT } from './i18n.js';

const M_PER_MM = 0.001;
const MERGE_TOLERANCE_M = 0.0005;
const JUNCTION_TOLERANCE_M = 0.0008;
const PRICE_STORAGE_KEY = 'window-configurator-summary-rates-v1';

// Face widths come from the supplied Schüco AW CT 65 fabrication manual.
// Linear masses are calculated from the aluminium contour area in the current
// standalone CAD SVGs (density 2700 kg/m³). They are therefore configurator
// estimates, not values copied from a Schüco price/weight list.
export const WINDOW_PROFILE_MANUFACTURING_DATA = Object.freeze({
    // 57 / 88 are the visible layout faces from the CAD/manual. The 32 mm
    // frame seat and 65 mm profile depth are separate fabrication dimensions.
    '575760': Object.freeze({ family: 'frame', faceWidthMm: 57, frameSeatMm: 32, profileDepthMm: 65, kgPerM: 1.105, nameKey: 'summary.profile.frame' }),
    '575770': Object.freeze({ family: 'frame', faceWidthMm: 57, frameSeatMm: 32, profileDepthMm: 65, kgPerM: 1.105, nameKey: 'summary.profile.frame' }),
    '575780': Object.freeze({ family: 'sash', faceWidthMm: 49, kgPerM: 1.007, nameKey: 'summary.profile.sash' }),
    '575790': Object.freeze({ family: 'sash', faceWidthMm: 49, kgPerM: 1.007, nameKey: 'summary.profile.sash' }),
    '575800': Object.freeze({ family: 'mullion', faceWidthMm: 88, profileDepthMm: 65, kgPerM: 1.475, nameKey: 'summary.profile.mullion' }),
    '575810': Object.freeze({ family: 'mullion', faceWidthMm: 88, profileDepthMm: 65, kgPerM: 1.475, nameKey: 'summary.profile.mullion' }),
    '575820': Object.freeze({ family: 'trans', faceWidthMm: 31, kgPerM: 1.314, nameKey: 'summary.profile.trans' }),
    '575830': Object.freeze({ family: 'trans', faceWidthMm: 31, kgPerM: 1.314, nameKey: 'summary.profile.trans' }),
    '573920': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.334, nameKey: 'summary.profile.bead' }),
    '573930': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.352, nameKey: 'summary.profile.bead' }),
    '573940': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.369, nameKey: 'summary.profile.bead' }),
});

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampLength(value) {
    return Math.max(0, finite(value));
}

function roundedKey(value) {
    return Math.round(finite(value) * 100000) / 100000;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatLengthMm(lengthM, locale) {
    const value = Math.max(0, Math.round(finite(lengthM) * 1000));
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} mm`;
}

function formatLengthM(lengthM, locale) {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(finite(lengthM))} m`;
}

function formatWeight(weightKg, locale) {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(finite(weightKg))} kg`;
}

function formatArea(areaSqm, locale) {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(finite(areaSqm))} m²`;
}

function formatMoney(value, locale) {
    if (!Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));
}

function getProfileData(profileId, fallbackFamily = null) {
    const id = String(profileId || '');
    return WINDOW_PROFILE_MANUFACTURING_DATA[id]
        || Object.freeze({ family: fallbackFamily, faceWidthMm: null, kgPerM: null, nameKey: null });
}

function getPoint(piece, atStart) {
    const coordinate = finite(piece.structuralPerpendicularOffset, piece.perpendicularOffset);
    const longitudinal = atStart
        ? finite(piece.structuralWorldStart, piece.worldStart)
        : finite(piece.structuralWorldEnd, piece.worldEnd);
    return piece.orientation === 'vertical'
        ? { x: coordinate, y: longitudinal }
        : { x: longitudinal, y: coordinate };
}

function findJunction(geometry, point) {
    const exact = (geometry?.physicalIntersections || []).find(junction => (
        Math.abs(finite(junction.x) - point.x) <= JUNCTION_TOLERANCE_M
        && Math.abs(finite(junction.y) - point.y) <= JUNCTION_TOLERANCE_M
    ));
    return exact || null;
}

function armKinds(junction) {
    return (junction?.activeDirections || [])
        .map(direction => junction?.arms?.[direction]?.kind)
        .filter(Boolean);
}

function hasPerpendicularFrame(junction, orientation) {
    return (junction?.activeDirections || []).some(direction => {
        const arm = junction?.arms?.[direction];
        return arm?.kind === 'frame' && arm.orientation !== orientation;
    });
}

function hasPerpendicularDivider(junction, orientation) {
    return (junction?.activeDirections || []).some(direction => {
        const arm = junction?.arms?.[direction];
        return arm?.kind === 'divider' && arm.orientation !== orientation;
    });
}

function isPureFrameCorner(junction) {
    return junction?.type === 'corner'
        && finite(junction.frameCount) === 2
        && finite(junction.dividerCount) === 0;
}

function makeFrameJoint(junction) {
    if (isPureFrameCorner(junction)) return 'miter';
    if ((junction?.dividerCount || 0) > 0) return 'square-divider';
    if ((junction?.frameCount || 0) > 0) return 'square-frame';
    return 'square';
}

function mergeCollinearFrames(framePlacements = []) {
    const groups = new Map();
    framePlacements.forEach(piece => {
        const coordinate = roundedKey(piece.structuralPerpendicularOffset ?? piece.perpendicularOffset);
        const key = `${piece.orientation}|${piece.side || ''}|${coordinate}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(piece);
    });

    const merged = [];
    groups.forEach(pieces => {
        pieces.sort((a, b) => finite(a.structuralWorldStart, a.worldStart) - finite(b.structuralWorldStart, b.worldStart));
        let active = null;
        pieces.forEach(piece => {
            const start = finite(piece.structuralWorldStart, piece.worldStart);
            const end = finite(piece.structuralWorldEnd, piece.worldEnd);
            if (!active || start > active.end + MERGE_TOLERANCE_M) {
                if (active) merged.push(active);
                active = {
                    orientation: piece.orientation,
                    side: piece.side || null,
                    coordinate: finite(piece.structuralPerpendicularOffset, piece.perpendicularOffset),
                    start,
                    end,
                    frameReferenceOffset: Math.abs(finite(piece.frameReferenceOffset)),
                    sourceIds: [piece.id],
                };
                return;
            }
            active.end = Math.max(active.end, end);
            active.frameReferenceOffset = Math.max(active.frameReferenceOffset, Math.abs(finite(piece.frameReferenceOffset)));
            active.sourceIds.push(piece.id);
        });
        if (active) merged.push(active);
    });
    return merged;
}

function dividerPairForOrientation(junction, orientation) {
    if (orientation === 'vertical') {
        return [junction?.arms?.north, junction?.arms?.south];
    }
    return [junction?.arms?.east, junction?.arms?.west];
}

function dividerAxisContinues(junction, orientation) {
    const [first, second] = dividerPairForOrientation(junction, orientation);
    if (first?.kind !== 'divider' || second?.kind !== 'divider') return false;
    if (junction.type === 'cross') return junction.hostOrientation === orientation;
    if (junction.type === 'T') return junction.hostOrientation === orientation;
    if (junction.type === 'continuation') return true;
    if (junction.type === 'plus') return true;
    return false;
}

function mergeDividerSegments(geometry) {
    const segments = [...(geometry?.dividerSegments || [])];
    if (!segments.length) return [];

    const parent = new Map(segments.map(segment => [segment.id, segment.id]));
    const find = id => {
        const current = parent.get(id);
        if (current === id || current == null) return current;
        const root = find(current);
        parent.set(id, root);
        return root;
    };
    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (!rootA || !rootB || rootA === rootB) return;
        parent.set(rootB, rootA);
    };

    (geometry?.physicalIntersections || []).forEach(junction => {
        ['vertical', 'horizontal'].forEach(orientation => {
            if (!dividerAxisContinues(junction, orientation)) return;
            const [first, second] = dividerPairForOrientation(junction, orientation);
            union(first.segmentId, second.segmentId);
        });
    });

    const groups = new Map();
    segments.forEach(segment => {
        const root = find(segment.id) || segment.id;
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(segment);
    });

    return [...groups.values()].map(group => ({
        orientation: group[0].orientation,
        coordinate: finite(group[0].structuralPerpendicularOffset, group[0].perpendicularOffset),
        start: Math.min(...group.map(piece => finite(piece.structuralWorldStart, piece.worldStart))),
        end: Math.max(...group.map(piece => finite(piece.structuralWorldEnd, piece.worldEnd))),
        sourceIds: group.map(piece => piece.id),
        neighborCellPairs: group
            .map(piece => [piece.negativeCellId, piece.positiveCellId])
            .filter(pair => pair[0] && pair[1]),
    }));
}

function labelSide(locale, side) {
    const key = {
        top: 'side.top',
        bottom: 'side.bottom',
        left: 'side.left',
        right: 'side.right',
    }[side];
    return key ? windowT(locale, key) : side;
}

function jointLabel(locale, jointCode) {
    const key = {
        miter: 'summary.cut.miter',
        square: 'summary.cut.square',
        'square-frame': 'summary.cut.squareFrame',
        'square-divider': 'summary.cut.squareDivider',
        'square-sash': 'summary.cut.squareSash',
    }[jointCode] || 'summary.cut.square';
    return windowT(locale, key);
}

function getWindowNumberMap(snapshot) {
    const windows = snapshot?.layoutState?.windowState?.windows;
    if (Array.isArray(windows) && windows.length) {
        return new Map(windows.map((cell, index) => [String(cell.id), index + 1]));
    }

    // Compatibility fallback for older/incomplete fabrication snapshots. The
    // live configurator always provides windowState, but keeping this fallback
    // makes the summary robust for validation fixtures and imported snapshots.
    const ids = [];
    const seen = new Set();
    [
        ...(snapshot?.openingCells || []),
        ...(snapshot?.fixedCells || []),
        ...(snapshot?.glassPieces || []),
    ].forEach(cell => {
        const id = String(cell?.id || cell?.cellId || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    });
    return new Map(ids.map((id, index) => [id, index + 1]));
}

function getWindowNumber(windowNumberMap, cellId) {
    const number = windowNumberMap?.get?.(String(cellId || ''));
    return Number.isInteger(number) && number > 0 ? number : null;
}

function windowOwnerLabel(locale, windowNumberMap, cellId) {
    const number = getWindowNumber(windowNumberMap, cellId);
    if (number == null) return '';
    return `${windowT(locale, 'layout.window')} ${number}`;
}

function normalizeWindowPair(windowNumberMap, firstCellId, secondCellId) {
    const first = getWindowNumber(windowNumberMap, firstCellId);
    const second = getWindowNumber(windowNumberMap, secondCellId);
    if (first == null || second == null || first === second) return null;
    return first < second ? [first, second] : [second, first];
}

function formatBetweenWindows(locale, pairs = []) {
    const unique = [];
    const seen = new Set();
    pairs.forEach(pair => {
        if (!Array.isArray(pair) || pair.length !== 2) return;
        const key = `${pair[0]}-${pair[1]}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(pair);
    });
    if (!unique.length) return '';
    unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const pairText = unique.map(([a, b]) => `${a}–${b}`).join(', ');
    return windowT(locale, 'summary.betweenWindows', { pairs: pairText });
}

function makeProfileCut({
    category,
    name,
    profileId,
    lengthM,
    startJoint,
    endJoint,
    orientation = null,
    cellId = null,
    windowNumber = null,
    windowPairs = null,
    note = null,
}) {
    const tech = getProfileData(profileId, category);
    const safeLength = clampLength(lengthM);
    const weightKg = Number.isFinite(tech.kgPerM) ? safeLength * tech.kgPerM : null;
    return {
        type: 'profile',
        category,
        name,
        profileId: String(profileId || ''),
        lengthM: safeLength,
        startJoint,
        endJoint,
        orientation,
        cellId,
        windowNumber,
        windowPairs,
        note,
        kgPerM: tech.kgPerM,
        weightKg,
    };
}

function buildManufacturingGeometry(snapshot, frameProfileId, dividerProfileId) {
    const topology = snapshot?.layoutState?.topology;
    if (!topology) return null;
    const frameTech = getProfileData(frameProfileId, 'frame');
    const dividerTech = getProfileData(dividerProfileId, 'mullion');
    return getEditableWindowTopologyGeometry({
        width: finite(snapshot.width),
        height: finite(snapshot.height),
        topology,
        frameReplacementSpan: finite(frameTech.profileDepthMm, 65) * M_PER_MM,
        frameFaceSpan: finite(frameTech.faceWidthMm, 57) * M_PER_MM,
        frameInwardSpan: finite(frameTech.profileDepthMm, 65) * M_PER_MM,
        dividerFaceSpan: finite(dividerTech.faceWidthMm, 88) * M_PER_MM,
    });
}

function buildFrameCuts({ geometry, frameProfileId, locale, snapshot }) {
    const fallback = () => {
        const width = finite(snapshot?.width);
        const height = finite(snapshot?.height);
        return [
            makeProfileCut({ category: 'frame', name: `${windowT(locale, 'summary.profile.frame')} · ${labelSide(locale, 'top')}`, profileId: frameProfileId, lengthM: width, startJoint: 'miter', endJoint: 'miter', orientation: 'horizontal' }),
            makeProfileCut({ category: 'frame', name: `${windowT(locale, 'summary.profile.frame')} · ${labelSide(locale, 'bottom')}`, profileId: frameProfileId, lengthM: width, startJoint: 'miter', endJoint: 'miter', orientation: 'horizontal' }),
            makeProfileCut({ category: 'frame', name: `${windowT(locale, 'summary.profile.frame')} · ${labelSide(locale, 'left')}`, profileId: frameProfileId, lengthM: height, startJoint: 'miter', endJoint: 'miter', orientation: 'vertical' }),
            makeProfileCut({ category: 'frame', name: `${windowT(locale, 'summary.profile.frame')} · ${labelSide(locale, 'right')}`, profileId: frameProfileId, lengthM: height, startJoint: 'miter', endJoint: 'miter', orientation: 'vertical' }),
        ];
    };
    if (!geometry?.framePlacements?.length) return fallback();

    return mergeCollinearFrames(geometry.framePlacements).map(piece => {
        const startPoint = piece.orientation === 'vertical'
            ? { x: piece.coordinate, y: piece.start }
            : { x: piece.start, y: piece.coordinate };
        const endPoint = piece.orientation === 'vertical'
            ? { x: piece.coordinate, y: piece.end }
            : { x: piece.end, y: piece.coordinate };
        const startJunction = findJunction(geometry, startPoint);
        const endJunction = findJunction(geometry, endPoint);
        const startJoint = makeFrameJoint(startJunction);
        const endJoint = makeFrameJoint(endJunction);
        // The topology reference line is 13 mm inboard from the actual outer
        // frame tip in the supplied CAD. Restore that amount only at a normal
        // frame/frame welded corner. Mixed frame/mullion intersections stay
        // square and stop on the structural grid line instead of inventing a V.
        const startExtension = startJoint === 'miter' ? piece.frameReferenceOffset : 0;
        const endExtension = endJoint === 'miter' ? piece.frameReferenceOffset : 0;
        const sideName = piece.side ? ` · ${labelSide(locale, piece.side)}` : '';
        return makeProfileCut({
            category: 'frame',
            name: `${windowT(locale, 'summary.profile.frame')}${sideName}`,
            profileId: frameProfileId,
            lengthM: piece.end - piece.start + startExtension + endExtension,
            startJoint,
            endJoint,
            orientation: piece.orientation,
        });
    });
}

function dividerEndTrim({ geometry, piece, atStart, frameProfileId, dividerProfileId }) {
    const point = piece.orientation === 'vertical'
        ? { x: piece.coordinate, y: atStart ? piece.start : piece.end }
        : { x: atStart ? piece.start : piece.end, y: piece.coordinate };
    const junction = findJunction(geometry, point);
    if (!junction) return { trim: 0, joint: 'square' };

    const frameTech = getProfileData(frameProfileId, 'frame');
    const dividerTech = getProfileData(dividerProfileId, 'mullion');
    const framePlacement = (geometry?.framePlacements || []).find(frame => (
        Math.abs(finite(frame.structuralPerpendicularOffset) - (frame.orientation === 'vertical' ? point.x : point.y)) <= JUNCTION_TOLERANCE_M
        || frame.id === Object.values(junction.arms || {}).find(arm => arm?.kind === 'frame')?.segmentId
    ));
    const frameReferenceMm = Math.abs(finite(framePlacement?.frameReferenceOffset)) * 1000;
    const frameSeatTrimM = Math.max(0, finite(frameTech.frameSeatMm, 32) - frameReferenceMm) * M_PER_MM;
    const dividerSeatTrimM = finite(dividerTech.faceWidthMm, 88) * 0.5 * M_PER_MM;

    const kinds = armKinds(junction);
    const hasFrame = kinds.includes('frame');
    const branchesIntoDivider = hasPerpendicularDivider(junction, piece.orientation)
        && !dividerAxisContinues(junction, piece.orientation);

    if (branchesIntoDivider) return { trim: dividerSeatTrimM, joint: 'square-divider' };
    if (hasFrame) return { trim: frameSeatTrimM, joint: 'square-frame' };
    return { trim: 0, joint: 'square' };
}

function buildDividerCuts({ geometry, dividerProfileId, frameProfileId, locale, windowNumberMap }) {
    if (!geometry?.dividerSegments?.length) return [];
    return mergeDividerSegments(geometry).map(piece => {
        const start = dividerEndTrim({ geometry, piece, atStart: true, frameProfileId, dividerProfileId });
        const end = dividerEndTrim({ geometry, piece, atStart: false, frameProfileId, dividerProfileId });
        const numberedPairs = (piece.neighborCellPairs || [])
            .map(([firstCellId, secondCellId]) => normalizeWindowPair(windowNumberMap, firstCellId, secondCellId))
            .filter(Boolean);
        const betweenLabel = formatBetweenWindows(locale, numberedPairs);
        const identity = betweenLabel ? ` · ${betweenLabel}` : '';
        return makeProfileCut({
            category: 'mullion',
            name: `${windowT(locale, 'summary.profile.mullion')}${identity} · ${windowT(locale, piece.orientation === 'vertical' ? 'summary.vertical' : 'summary.horizontal')}`,
            profileId: dividerProfileId,
            lengthM: piece.end - piece.start - start.trim - end.trim,
            startJoint: start.joint,
            endJoint: end.joint,
            orientation: piece.orientation,
            windowPairs: numberedPairs,
        });
    });
}

function buildSashCuts({ snapshot, sashProfileId, locale, windowNumberMap }) {
    const cuts = [];
    (snapshot?.openingCells || []).forEach(cell => {
        const owner = windowOwnerLabel(locale, windowNumberMap, cell.id);
        const prefix = `${windowT(locale, 'summary.profile.sash')}${owner ? ` · ${owner}` : ''}`;
        const windowNumber = getWindowNumber(windowNumberMap, cell.id);
        const width = clampLength(cell.width);
        const height = clampLength(cell.height);
        [
            ['top', width, 'horizontal'],
            ['bottom', width, 'horizontal'],
            ['left', height, 'vertical'],
            ['right', height, 'vertical'],
        ].forEach(([side, lengthM, orientation]) => cuts.push(makeProfileCut({
            category: 'sash',
            name: `${prefix} · ${labelSide(locale, side)}`,
            profileId: sashProfileId,
            lengthM,
            startJoint: 'miter',
            endJoint: 'miter',
            orientation,
            cellId: cell.id,
            windowNumber,
        })));
    });
    return cuts;
}

function buildTransCuts({ geometry, snapshot, transProfileId, sashProfileId, locale, windowNumberMap }) {
    const transSegments = geometry?.transSegments || [];
    if (!transSegments.length) return [];
    const sashFaceM = finite(getProfileData(sashProfileId, 'sash').faceWidthMm, 49) * M_PER_MM;
    return transSegments.map((segment, index) => {
        const owner = (snapshot?.openingCells || []).find(cell => cell.id === segment.ownerCellId)
            || (snapshot?.openingCells || []).find(cell => cell.id === segment.negativeCellId || cell.id === segment.positiveCellId);
        const pair = normalizeWindowPair(windowNumberMap, segment.negativeCellId, segment.positiveCellId);
        const betweenLabel = formatBetweenWindows(locale, pair ? [pair] : []);
        const ownerSpan = segment.orientation === 'vertical'
            ? finite(owner?.height, segment.structuralWorldEnd - segment.structuralWorldStart)
            : finite(owner?.width, segment.structuralWorldEnd - segment.structuralWorldStart);
        return makeProfileCut({
            category: 'trans',
            name: `${windowT(locale, 'summary.profile.trans')}${betweenLabel ? ` · ${betweenLabel}` : (transSegments.length > 1 ? ` ${index + 1}` : '')}`,
            profileId: transProfileId,
            lengthM: Math.max(0, ownerSpan - sashFaceM * 2),
            startJoint: 'square-sash',
            endJoint: 'square-sash',
            orientation: segment.orientation,
            cellId: segment.ownerCellId,
            windowNumber: getWindowNumber(windowNumberMap, segment.ownerCellId),
            windowPairs: pair ? [pair] : [],
            note: windowT(locale, 'summary.cut.transNote'),
        });
    });
}

function buildBeadCuts({ snapshot, glazingBeadCode, locale, windowNumberMap }) {
    if (!glazingBeadCode) return [];
    const cells = [
        ...(snapshot?.openingCells || []).map(cell => ({ ...cell, kind: 'sash' })),
        ...(snapshot?.fixedCells || []).map(cell => ({
            ...cell,
            width: cell.fixedAccessoryWidth ?? cell.width,
            height: cell.fixedAccessoryHeight ?? cell.height,
            kind: 'fixed',
        })),
    ];
    const cuts = [];
    cells.forEach(cell => {
        const owner = windowOwnerLabel(locale, windowNumberMap, cell.id);
        const prefix = `${windowT(locale, 'summary.profile.bead')}${owner ? ` · ${owner}` : ''}`;
        const windowNumber = getWindowNumber(windowNumberMap, cell.id);
        const width = clampLength(cell.width);
        const height = clampLength(cell.height);
        [
            ['top', width, 'horizontal'],
            ['bottom', width, 'horizontal'],
            ['left', height, 'vertical'],
            ['right', height, 'vertical'],
        ].forEach(([side, lengthM, orientation]) => cuts.push(makeProfileCut({
            category: 'bead',
            name: `${prefix} · ${labelSide(locale, side)}`,
            profileId: glazingBeadCode,
            lengthM,
            startJoint: 'miter',
            endJoint: 'miter',
            orientation,
            cellId: cell.id,
            windowNumber,
        })));
    });
    return cuts;
}

function buildGlassItems(snapshot, locale, windowNumberMap) {
    return (snapshot?.glassPieces || []).map(piece => {
        const widthM = clampLength(piece.width);
        const heightM = clampLength(piece.height);
        const owner = windowOwnerLabel(locale, windowNumberMap, piece.cellId);
        const windowNumber = getWindowNumber(windowNumberMap, piece.cellId);
        return {
            type: 'glass',
            category: 'glass',
            name: `${windowT(locale, 'summary.profile.glass')}${owner ? ` · ${owner}` : ''}`,
            cellId: piece.cellId || null,
            windowNumber,
            widthM,
            heightM,
            areaSqm: widthM * heightM,
            isFixed: Boolean(piece.isFixed),
        };
    });
}

export function buildWindowFabricationSummary({
    snapshot,
    profileSelection = {},
    layoutSelection = {},
    glazingBeadCode = null,
    aluminiumRatePerKg = null,
    glassRatePerSqm = null,
    locale = 'en-US',
} = {}) {
    if (!snapshot) {
        return Object.freeze({ cuts: Object.freeze([]), bomItems: Object.freeze([]), totals: Object.freeze({}) });
    }

    const frameProfileId = String(profileSelection.outerFrameProfileId || '575770');
    const sashProfileId = String(profileSelection.sashProfileId || '575790');
    const dividerProfileId = String(layoutSelection.dividerProfileId || '575800');
    const transProfileId = String(layoutSelection.transProfileId || '575820');
    const resolvedBeadCode = String(glazingBeadCode || '573940');
    const geometry = buildManufacturingGeometry(snapshot, frameProfileId, dividerProfileId);
    const windowNumberMap = getWindowNumberMap(snapshot);

    const cuts = [
        ...buildFrameCuts({ geometry, frameProfileId, locale, snapshot }),
        ...buildDividerCuts({ geometry, dividerProfileId, frameProfileId, locale, windowNumberMap }),
        ...buildSashCuts({ snapshot, sashProfileId, locale, windowNumberMap }),
        ...buildTransCuts({ geometry, snapshot, transProfileId, sashProfileId, locale, windowNumberMap }),
        ...buildBeadCuts({ snapshot, glazingBeadCode: resolvedBeadCode, locale, windowNumberMap }),
    ];
    const glassItems = buildGlassItems(snapshot, locale, windowNumberMap);

    const aluminiumRate = Number(aluminiumRatePerKg) > 0 ? Number(aluminiumRatePerKg) : null;
    const glassRate = Number(glassRatePerSqm) > 0 ? Number(glassRatePerSqm) : null;
    const profileBom = cuts.map((cut, index) => ({
        ...cut,
        bomId: `profile-${index}`,
        price: aluminiumRate != null && Number.isFinite(cut.weightKg)
            ? cut.weightKg * aluminiumRate
            : null,
    }));
    const glassBom = glassItems.map((item, index) => ({
        ...item,
        bomId: `glass-${index}`,
        price: glassRate != null ? item.areaSqm * glassRate : null,
    }));
    const bomItems = [...profileBom, ...glassBom];
    const aluminiumWeightKg = profileBom.reduce((sum, item) => sum + finite(item.weightKg), 0);
    const glassAreaSqm = glassBom.reduce((sum, item) => sum + finite(item.areaSqm), 0);
    const aluminiumTotal = aluminiumRate == null ? null : profileBom.reduce((sum, item) => sum + finite(item.price), 0);
    const glassTotal = glassRate == null ? null : glassBom.reduce((sum, item) => sum + finite(item.price), 0);
    const total = aluminiumTotal != null && glassTotal != null ? aluminiumTotal + glassTotal : null;

    return Object.freeze({
        geometry,
        cuts: Object.freeze(cuts),
        bomItems: Object.freeze(bomItems),
        totals: Object.freeze({ aluminiumWeightKg, glassAreaSqm, aluminiumTotal, glassTotal, total }),
    });
}

function readStoredRates() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) || '{}');
        return {
            aluminium: Number(parsed.aluminium) > 0 ? Number(parsed.aluminium) : null,
            glass: Number(parsed.glass) > 0 ? Number(parsed.glass) : null,
        };
    } catch (_error) {
        return { aluminium: null, glass: null };
    }
}

function writeStoredRates(rates) {
    try {
        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(rates));
    } catch (_error) {
        // Storage is optional (private browsing / restrictive embeds).
    }
}

function renderBom(result, locale) {
    const content = document.getElementById('window-bom-content');
    if (!content) return;
    if (!result.bomItems.length) {
        content.innerHTML = `<div class="window-summary-empty">${escapeHtml(windowT(locale, 'summary.empty'))}</div>`;
        return;
    }

    content.innerHTML = `
        <div class="window-summary-metrics">
            <div class="window-summary-metric"><span>${escapeHtml(windowT(locale, 'summary.metric.aluminiumWeight'))}</span><strong>${escapeHtml(formatWeight(result.totals.aluminiumWeightKg, locale))}</strong></div>
            <div class="window-summary-metric"><span>${escapeHtml(windowT(locale, 'summary.metric.glassArea'))}</span><strong>${escapeHtml(formatArea(result.totals.glassAreaSqm, locale))}</strong></div>
            <div class="window-summary-metric"><span>${escapeHtml(windowT(locale, 'summary.metric.aluminiumCost'))}</span><strong>${escapeHtml(formatMoney(result.totals.aluminiumTotal, locale))}</strong></div>
            <div class="window-summary-metric is-total"><span>${escapeHtml(windowT(locale, 'summary.metric.total'))}</span><strong>${escapeHtml(formatMoney(result.totals.total, locale))}</strong></div>
        </div>
        <div class="window-summary-list">
            ${result.bomItems.map(item => {
                const isGlass = item.type === 'glass';
                const detail = isGlass
                    ? `${formatLengthMm(item.widthM, locale)} × ${formatLengthMm(item.heightM, locale)} · ${formatArea(item.areaSqm, locale)}`
                    : `${formatLengthMm(item.lengthM, locale)} · ${Number.isFinite(item.weightKg) ? formatWeight(item.weightKg, locale) : '—'}${Number.isFinite(item.kgPerM) ? ` · ${item.kgPerM.toFixed(3)} kg/m` : ''}`;
                const profile = isGlass ? '' : `<small>${escapeHtml(item.profileId)}</small>`;
                return `<article class="window-summary-item">
                    <div class="window-summary-item-main"><strong>${escapeHtml(item.name)}</strong>${profile}<span>${escapeHtml(detail)}</span></div>
                    <b class="window-summary-price">${escapeHtml(formatMoney(item.price, locale))}</b>
                </article>`;
            }).join('')}
        </div>`;
}

function renderCuts(result, locale) {
    const content = document.getElementById('window-cuts-content');
    if (!content) return;
    if (!result.cuts.length) {
        content.innerHTML = `<div class="window-summary-empty">${escapeHtml(windowT(locale, 'summary.empty'))}</div>`;
        return;
    }

    const duplicateCount = new Map();
    result.cuts.forEach(cut => duplicateCount.set(cut.name, (duplicateCount.get(cut.name) || 0) + 1));
    const seen = new Map();
    content.innerHTML = `<div class="window-cut-list">${result.cuts.map(cut => {
        const occurrence = (seen.get(cut.name) || 0) + 1;
        seen.set(cut.name, occurrence);
        const name = duplicateCount.get(cut.name) > 1 ? `${cut.name} ${occurrence}` : cut.name;
        const sameJoint = cut.startJoint === cut.endJoint;
        const jointText = sameJoint
            ? `${jointLabel(locale, cut.startJoint)} · ${windowT(locale, 'summary.cut.bothEnds')}`
            : `${windowT(locale, 'summary.cut.start')}: ${jointLabel(locale, cut.startJoint)} · ${windowT(locale, 'summary.cut.end')}: ${jointLabel(locale, cut.endJoint)}`;
        return `<article class="window-cut-card">
            <div class="window-cut-title"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(cut.profileId)}</span></div><b>×1</b></div>
            <div class="window-cut-specs">
                <div><span>${escapeHtml(windowT(locale, 'summary.cut.length'))}</span><strong>${escapeHtml(formatLengthMm(cut.lengthM, locale))}</strong></div>
                <div><span>${escapeHtml(windowT(locale, 'summary.cut.joint'))}</span><strong>${escapeHtml(jointText)}</strong></div>
            </div>
            ${cut.note ? `<p>${escapeHtml(cut.note)}</p>` : ''}
        </article>`;
    }).join('')}</div>`;
}

export function createWindowSummaryController({
    getProfileSelection = () => ({}),
    getLayoutSelection = () => ({}),
    getActiveGlazingBeadCode = () => null,
} = {}) {
    let snapshot = null;
    let result = null;
    const aluminiumRateInput = document.getElementById('summaryAluminiumRate');
    const glassRateInput = document.getElementById('summaryGlassRate');
    const stored = readStoredRates();
    if (aluminiumRateInput && stored.aluminium != null) aluminiumRateInput.value = String(stored.aluminium);
    if (glassRateInput && stored.glass != null) glassRateInput.value = String(stored.glass);

    const readRates = () => ({
        aluminium: Number(aluminiumRateInput?.value) > 0 ? Number(aluminiumRateInput.value) : null,
        glass: Number(glassRateInput?.value) > 0 ? Number(glassRateInput.value) : null,
    });

    const render = () => {
        const locale = getWindowLocale();
        const rates = readRates();
        result = buildWindowFabricationSummary({
            snapshot,
            profileSelection: getProfileSelection(),
            layoutSelection: getLayoutSelection(),
            glazingBeadCode: getActiveGlazingBeadCode(),
            aluminiumRatePerKg: rates.aluminium,
            glassRatePerSqm: rates.glass,
            locale,
        });
        renderBom(result, locale);
        renderCuts(result, locale);
        return result;
    };

    const handleRateInput = () => {
        writeStoredRates(readRates());
        render();
    };
    aluminiumRateInput?.addEventListener('input', handleRateInput);
    glassRateInput?.addEventListener('input', handleRateInput);
    window.addEventListener('window-locale-applied', render);

    return {
        update(nextSnapshot) {
            snapshot = nextSnapshot;
            return render();
        },
        render,
        getResult: () => result,
    };
}
