import { getEditableWindowTopologyGeometry } from './window-layout-geometry.js';
import { getWindowActualSizeInState } from './window-layout-state.js';
import { getWindowLocale, windowT } from './i18n.js';

const M_PER_MM = 0.001;
const MERGE_TOLERANCE_M = 0.0005;
const JUNCTION_TOLERANCE_M = 0.0008;
const PRICE_STORAGE_KEY = 'window-configurator-summary-rates-v2';
const DEFAULT_ALUMINIUM_RATE_EUR_PER_KG = 8;
const DEFAULT_GLASS_RATE_EUR_PER_SQM = 80;
const DEFAULT_GASKET_RATE_EUR_PER_M = 4;
const DEFAULT_INSULATION_RATE_EUR_PER_M = 2.5;
const DEFAULT_FOAM_RATE_EUR_PER_M = 1.5;
const DEFAULT_LOCKING_BAR_RATE_EUR_PER_M = 3;
const DEFAULT_GLAZING_BRIDGE_RATE_EUR_PER_M = 2;
const DEFAULT_DRAINAGE_CAP_RATE_EUR_PER_PC = 0.75;
const DEFAULT_OTHER_COMPONENT_RATE_EUR_PER_UNIT = 2;

export const WINDOW_NON_ALUMINIUM_MATERIALS = Object.freeze({
    gasket: Object.freeze({ rateKey: 'gasket', nameKey: 'summary.material.gasket', defaultRateEurPerUnit: DEFAULT_GASKET_RATE_EUR_PER_M, unit: 'm' }),
    insulation: Object.freeze({ rateKey: 'insulation', nameKey: 'summary.material.insulation', defaultRateEurPerUnit: DEFAULT_INSULATION_RATE_EUR_PER_M, unit: 'm' }),
    foam: Object.freeze({ rateKey: 'foam', nameKey: 'summary.material.foam', defaultRateEurPerUnit: DEFAULT_FOAM_RATE_EUR_PER_M, unit: 'm' }),
    other: Object.freeze({ rateKey: 'other', nameKey: 'summary.material.other', defaultRateEurPerUnit: DEFAULT_OTHER_COMPONENT_RATE_EUR_PER_UNIT, unit: 'm' }),
});

// Non-aluminium material that is already built into the thermally-broken
// aluminium profiles. The groups intentionally follow the CAD/debug colours:
// S05_EPDM_Kontur = gasket/rubber, S07_Isolation_Kontur = insulation bars, and
// S35_Dämmung_Kontur = insulation foam. The kg/m values are calculated from the
// current profile contours using the same densities as the 3D material classes
// (EPDM 1150 kg/m³, insulation polymer 1350 kg/m³, foam 35 kg/m³). Linear runs
// are priced in €/m according to their respective material group rate.
export const WINDOW_PROFILE_NON_ALUMINIUM_DATA = Object.freeze({
    '575760': Object.freeze({ insulation: 0.328638 }),
    '575770': Object.freeze({ insulation: 0.342577, foam: 0.011595 }),
    '575780': Object.freeze({ insulation: 0.501195 }),
    '575790': Object.freeze({ insulation: 0.518753, foam: 0.007759 }),
    '575800': Object.freeze({ insulation: 0.385273 }),
    '575810': Object.freeze({ insulation: 0.399211, foam: 0.011595 }),
    '575820': Object.freeze({ insulation: 0.246934, gasket: 0.005638 }),
    '575830': Object.freeze({ insulation: 0.257825, foam: 0.007876, gasket: 0.005638 }),
});

// Accessory physical units, linear/piece masses, and pricing rate assignments.
// Linear components (seals, bars, foam, bridge) are priced in €/m, while
// discrete components (drainage caps) are priced in €/pc.
export const WINDOW_ACCESSORY_MANUFACTURING_DATA = Object.freeze({
    '275701': Object.freeze({ groupId: 'locking-bar', unit: 'm', kgPerUnit: 0.068, materialGroup: 'other', rateKey: 'lockingBar', nameKey: 'summary.accessory.lockingBar' }),
    '275702': Object.freeze({ groupId: 'locking-bar', unit: 'm', kgPerUnit: 0.068, materialGroup: 'other', rateKey: 'lockingBar', nameKey: 'summary.accessory.lockingBar' }),
    '224068': Object.freeze({ groupId: 'centre-gasket', unit: 'm', kgPerUnit: 0.124, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.centreGasket' }),
    '224069': Object.freeze({ groupId: 'centre-gasket', unit: 'm', kgPerUnit: 0.124, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.centreGasket' }),
    '200988': Object.freeze({ groupId: 'insulation-profile', unit: 'm', kgPerUnit: 0.006, materialGroup: 'foam', rateKey: 'foam', nameKey: 'summary.accessory.insulationProfile' }),
    '245442': Object.freeze({ groupId: 'glazing-rebate-insulation', unit: 'm', kgPerUnit: 0.008, materialGroup: 'foam', rateKey: 'foam', nameKey: 'summary.accessory.glazingRebateInsulation' }),
    '245472': Object.freeze({ groupId: 'rebate-gasket', unit: 'm', kgPerUnit: 0.024, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.rebateGasket' }),
    '224063': Object.freeze({ groupId: 'outer-glazing-gasket', unit: 'm', kgPerUnit: 0.045, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.outerGlazingGasket' }),
    '224378': Object.freeze({ groupId: 'inner-glazing-gasket', unit: 'm', kgPerUnit: 0.065, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.innerGlazingGasket' }),
    '224379': Object.freeze({ groupId: 'inner-glazing-gasket', unit: 'm', kgPerUnit: 0.082, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.innerGlazingGasket' }),
    '224350': Object.freeze({ groupId: 'inner-glazing-gasket', unit: 'm', kgPerUnit: 0.046, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.innerGlazingGasket' }),
    '288318': Object.freeze({ groupId: 'glazing-bridge', unit: 'm', kgPerUnit: 0.327, materialGroup: 'other', rateKey: 'glazingBridge', nameKey: 'summary.accessory.glazingBridge' }),
    '288319': Object.freeze({ groupId: 'glazing-bridge', unit: 'm', kgPerUnit: 0.327, materialGroup: 'other', rateKey: 'glazingBridge', nameKey: 'summary.accessory.glazingBridge' }),
    '208694': Object.freeze({ groupId: 'drainage-cap', unit: 'pc', kgPerUnit: 0.004, materialGroup: 'other', rateKey: 'drainageCap', nameKey: 'summary.accessory.drainageCap' }),
    '288345': Object.freeze({ groupId: 'joint-sealing-piece', unit: 'pc', kgPerUnit: 0.005, materialGroup: 'gasket', rateKey: 'gasket', nameKey: 'summary.accessory.jointSealingPiece' }),
    '200953': Object.freeze({ groupId: 'trans-end-cap', unit: 'pc', kgPerUnit: 0.008, materialGroup: 'other', rateKey: 'other', nameKey: 'summary.accessory.transEndCap' }),
    '200954': Object.freeze({ groupId: 'trans-end-cap', unit: 'pc', kgPerUnit: 0.008, materialGroup: 'other', rateKey: 'other', nameKey: 'summary.accessory.transEndCap' }),
});

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
    '575820': Object.freeze({ family: 'trans', faceWidthMm: 67, kgPerM: 1.314, nameKey: 'summary.profile.trans' }),
    '575830': Object.freeze({ family: 'trans', faceWidthMm: 67, kgPerM: 1.314, nameKey: 'summary.profile.trans' }),
    '573920': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.334, nameKey: 'summary.profile.bead' }),
    '573930': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.352, nameKey: 'summary.profile.bead' }),
    '573940': Object.freeze({ family: 'bead', faceWidthMm: null, kgPerM: 0.369, nameKey: 'summary.profile.bead' }),
});

// AW CT 65 saw-length offsets in the window plane. These are the offsets to
// the LONG POINT of the 45° mitre cut, not the physical mounting-line offsets
// used by the renderer. The section drawings show:
// - fixed glazing bead at an outer frame: 32 mm per frame side;
// - fixed glazing bead at a mullion/transom: 19 mm per divider side
//   (half of the 38 mm inner profile width);
// - sash cut length at an outer frame: 27 mm per frame side;
// - sash glazing bead: another 49 mm per sash side, measured from the sash
//   mitre long-point dimension;
// - mullion/trans offsets remain the member-specific fabrication values;
// - double-vent profile length: h - 80 mm (fabrication drawing K1036297).
const AW_CT65_CUT_OFFSETS_MM = Object.freeze({
    fixedBeadFromFrame: 32,
    fixedBeadFromMullion: 19,
    sashFromFrame: 27,
    sashFromMullion: 49,
    sashFromTrans: 38.5,
    sashBeadFromSash: 49,
    doubleVentReduction: 80,
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

function formatPieces(quantity, locale) {
    const value = Math.max(0, Math.round(finite(quantity)));
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} ${windowT(locale, 'summary.unit.pieces')}`;
}

function normalizeSummaryCurrency(value) {
    const currency = String(value || '').toUpperCase();
    return ['EUR', 'USD', 'RON'].includes(currency) ? currency : 'EUR';
}

function getSummaryCurrency() {
    if (typeof window === 'undefined') return 'EUR';
    return normalizeSummaryCurrency(window.WINDOW_CONFIGURATOR_SHARED_SHELL?.state?.currency);
}

function convertSummaryMoney(value, fromCurrency = 'EUR', toCurrency = getSummaryCurrency()) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    const from = normalizeSummaryCurrency(fromCurrency);
    const to = normalizeSummaryCurrency(toCurrency);
    if (from === to) return amount;

    if (typeof window !== 'undefined') {
        const converted = window.WINDOW_CONFIGURATOR_SHARED_SHELL?.convertMoneyAmount?.(amount, from, to);
        if (Number.isFinite(Number(converted))) return Number(converted);
    }

    // The manufacturing summary is natively priced in EUR. If Common UI is
    // unavailable (for example in a pure Node validation), keep the base value
    // rather than maintaining a second set of exchange rates here.
    return amount;
}

function formatMoney(value, locale, currency = 'EUR') {
    if (!Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: normalizeSummaryCurrency(currency),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));
}

function formatSummaryMoneyFromEur(value, locale, currency = getSummaryCurrency()) {
    const displayCurrency = normalizeSummaryCurrency(currency);
    return formatMoney(convertSummaryMoney(value, 'EUR', displayCurrency), locale, displayCurrency);
}

function formatRateInput(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return String(Math.round(number * 100) / 100);
}

function currencyRateUnit(currency, denominator) {
    const symbol = { EUR: '€', USD: '$', RON: 'RON' }[normalizeSummaryCurrency(currency)] || '€';
    return `${symbol}/${denominator}`;
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

function getTopologyCell(snapshot, cellId) {
    const windows = snapshot?.layoutState?.topology?.windows || [];
    return windows.find(cell => String(cell?.id) === String(cellId || '')) || null;
}

function boundaryPieceMatchesCellSide(piece, cellId, side) {
    const id = String(cellId || '');
    if (!piece || !id) return false;
    if (piece.pieceType === 'frame') {
        return String(piece.cellId || '') === id && piece.side === side;
    }
    if (piece.orientation === 'vertical') {
        if (side === 'right') return String(piece.negativeCellId || '') === id;
        if (side === 'left') return String(piece.positiveCellId || '') === id;
        return false;
    }
    if (piece.orientation === 'horizontal') {
        if (side === 'top') return String(piece.negativeCellId || '') === id;
        if (side === 'bottom') return String(piece.positiveCellId || '') === id;
    }
    return false;
}

function boundaryKindAtSidePosition(snapshot, cellId, side, position = null) {
    const topology = snapshot?.layoutState?.topology;
    const pieces = topology?.linePieces || [];
    const candidates = pieces.filter(piece => boundaryPieceMatchesCellSide(piece, cellId, side));
    if (!candidates.length) return null;
    if (position == null || !Number.isFinite(Number(position))) {
        const kinds = [...new Set(candidates.map(piece => piece.pieceType))];
        return kinds.length === 1 ? kinds[0] : 'mixed';
    }
    const p = Number(position);
    const hit = candidates.find(piece => (
        p >= finite(piece.start) - 1e-7
        && p <= finite(piece.end) + 1e-7
    ));
    return hit?.pieceType || candidates[0]?.pieceType || null;
}

function getCellActualSize(snapshot, cell) {
    const state = snapshot?.layoutState?.windowState;
    if (state && cell?.id) {
        try {
            const size = getWindowActualSizeInState(state, cell.id);
            if (size) return size;
        } catch (_error) {
            // Older imported summaries may not carry a complete v5 state.
        }
    }
    return {
        widthM: clampLength(cell?.width),
        heightM: clampLength(cell?.height),
        structuralWidthM: clampLength(cell?.width),
        structuralHeightM: clampLength(cell?.height),
    };
}

function sideProbePosition(cell, side, atEnd = false) {
    if (!cell?.rect) return null;
    const epsilon = 1e-6;
    if (side === 'left' || side === 'right') {
        return atEnd ? finite(cell.rect.y1) - epsilon : finite(cell.rect.y0) + epsilon;
    }
    return atEnd ? finite(cell.rect.x1) - epsilon : finite(cell.rect.x0) + epsilon;
}

function fixedBeadBoundaryInsetM(kind) {
    if (kind === 'frame') return AW_CT65_CUT_OFFSETS_MM.fixedBeadFromFrame * M_PER_MM;
    if (kind === 'mullion') return AW_CT65_CUT_OFFSETS_MM.fixedBeadFromMullion * M_PER_MM;
    if (kind === 'trans') return AW_CT65_CUT_OFFSETS_MM.fixedBeadFromMullion * M_PER_MM;
    return 0;
}

function sashBoundaryInsetM(kind) {
    if (kind === 'frame') return AW_CT65_CUT_OFFSETS_MM.sashFromFrame * M_PER_MM;
    if (kind === 'mullion') return AW_CT65_CUT_OFFSETS_MM.sashFromMullion * M_PER_MM;
    if (kind === 'trans') return AW_CT65_CUT_OFFSETS_MM.sashFromTrans * M_PER_MM;
    return 0;
}

function getBoundaryKindsAtCorners(snapshot, cellId) {
    const cell = getTopologyCell(snapshot, cellId);
    if (!cell) {
        return {
            leftBottom: null, leftTop: null, rightBottom: null, rightTop: null,
            bottomLeft: null, bottomRight: null, topLeft: null, topRight: null,
        };
    }
    return {
        leftBottom: boundaryKindAtSidePosition(snapshot, cellId, 'left', sideProbePosition(cell, 'left', false)),
        leftTop: boundaryKindAtSidePosition(snapshot, cellId, 'left', sideProbePosition(cell, 'left', true)),
        rightBottom: boundaryKindAtSidePosition(snapshot, cellId, 'right', sideProbePosition(cell, 'right', false)),
        rightTop: boundaryKindAtSidePosition(snapshot, cellId, 'right', sideProbePosition(cell, 'right', true)),
        bottomLeft: boundaryKindAtSidePosition(snapshot, cellId, 'bottom', sideProbePosition(cell, 'bottom', false)),
        bottomRight: boundaryKindAtSidePosition(snapshot, cellId, 'bottom', sideProbePosition(cell, 'bottom', true)),
        topLeft: boundaryKindAtSidePosition(snapshot, cellId, 'top', sideProbePosition(cell, 'top', false)),
        topRight: boundaryKindAtSidePosition(snapshot, cellId, 'top', sideProbePosition(cell, 'top', true)),
    };
}

function getFixedBeadSideLengths(snapshot, cell) {
    const actual = getCellActualSize(snapshot, cell);
    const kinds = getBoundaryKindsAtCorners(snapshot, cell?.id);
    return {
        top: clampLength(actual.widthM - fixedBeadBoundaryInsetM(kinds.leftTop) - fixedBeadBoundaryInsetM(kinds.rightTop)),
        bottom: clampLength(actual.widthM - fixedBeadBoundaryInsetM(kinds.leftBottom) - fixedBeadBoundaryInsetM(kinds.rightBottom)),
        left: clampLength(actual.heightM - fixedBeadBoundaryInsetM(kinds.bottomLeft) - fixedBeadBoundaryInsetM(kinds.topLeft)),
        right: clampLength(actual.heightM - fixedBeadBoundaryInsetM(kinds.bottomRight) - fixedBeadBoundaryInsetM(kinds.topRight)),
    };
}

function getSashSideLengths(snapshot, cell) {
    const actual = getCellActualSize(snapshot, cell);
    const kinds = getBoundaryKindsAtCorners(snapshot, cell?.id);
    return {
        top: clampLength(actual.widthM - sashBoundaryInsetM(kinds.leftTop) - sashBoundaryInsetM(kinds.rightTop)),
        bottom: clampLength(actual.widthM - sashBoundaryInsetM(kinds.leftBottom) - sashBoundaryInsetM(kinds.rightBottom)),
        left: clampLength(actual.heightM - sashBoundaryInsetM(kinds.bottomLeft) - sashBoundaryInsetM(kinds.topLeft)),
        right: clampLength(actual.heightM - sashBoundaryInsetM(kinds.bottomRight) - sashBoundaryInsetM(kinds.topRight)),
    };
}

function getSashBeadSideLengths(snapshot, cell) {
    const sash = getSashSideLengths(snapshot, cell);
    const inset = AW_CT65_CUT_OFFSETS_MM.sashBeadFromSash * M_PER_MM * 2;
    return {
        top: clampLength(sash.top - inset),
        bottom: clampLength(sash.bottom - inset),
        left: clampLength(sash.left - inset),
        right: clampLength(sash.right - inset),
    };
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
        const lengths = getSashSideLengths(snapshot, cell);
        [
            ['top', lengths.top, 'horizontal'],
            ['bottom', lengths.bottom, 'horizontal'],
            ['left', lengths.left, 'vertical'],
            ['right', lengths.right, 'vertical'],
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
    return transSegments.map((segment, index) => {
        const owner = (snapshot?.openingCells || []).find(cell => cell.id === segment.ownerCellId)
            || (snapshot?.openingCells || []).find(cell => cell.id === segment.negativeCellId || cell.id === segment.positiveCellId);
        const pair = normalizeWindowPair(windowNumberMap, segment.negativeCellId, segment.positiveCellId);
        const betweenLabel = formatBetweenWindows(locale, pair ? [pair] : []);
        const sashLengths = owner ? getSashSideLengths(snapshot, owner) : null;
        const ownerVentSpan = segment.orientation === 'vertical'
            ? Math.min(finite(sashLengths?.left, Infinity), finite(sashLengths?.right, Infinity))
            : Math.min(finite(sashLengths?.top, Infinity), finite(sashLengths?.bottom, Infinity));
        const fallbackSpan = segment.orientation === 'vertical'
            ? finite(owner?.height, segment.structuralWorldEnd - segment.structuralWorldStart)
            : finite(owner?.width, segment.structuralWorldEnd - segment.structuralWorldStart);
        const ventSpan = Number.isFinite(ownerVentSpan) ? ownerVentSpan : fallbackSpan;
        return makeProfileCut({
            category: 'trans',
            name: `${windowT(locale, 'summary.profile.trans')}${betweenLabel ? ` · ${betweenLabel}` : (transSegments.length > 1 ? ` ${index + 1}` : '')}`,
            profileId: transProfileId,
            // K1036297: double-vent profile length X = h - 80 mm.
            lengthM: Math.max(0, ventSpan - AW_CT65_CUT_OFFSETS_MM.doubleVentReduction * M_PER_MM),
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
        ...(snapshot?.fixedCells || []).map(cell => ({ ...cell, kind: 'fixed' })),
    ];
    const cuts = [];
    cells.forEach(cell => {
        const owner = windowOwnerLabel(locale, windowNumberMap, cell.id);
        const prefix = `${windowT(locale, 'summary.profile.bead')}${owner ? ` · ${owner}` : ''}`;
        const windowNumber = getWindowNumber(windowNumberMap, cell.id);
        // fixedAccessoryWidth/Height are CAD connection-seat rectangles used by
        // the renderer; they are not saw lengths. In a 600 mm frame/mullion bay
        // that rectangle can legitimately be 613 mm because it reaches 13 mm
        // past the mullion-centre grid line. Manufacturing bead lengths instead
        // use the actual window size and the profile mounting-line offsets.
        const lengths = cell.kind === 'sash'
            ? getSashBeadSideLengths(snapshot, cell)
            : getFixedBeadSideLengths(snapshot, cell);
        [
            ['top', lengths.top, 'horizontal'],
            ['bottom', lengths.bottom, 'horizontal'],
            ['left', lengths.left, 'vertical'],
            ['right', lengths.right, 'vertical'],
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

function sumSideLengths(lengths = {}) {
    return ['top', 'bottom', 'left', 'right'].reduce((sum, side) => sum + clampLength(lengths?.[side]), 0);
}

function getCellGlazingPerimeterM(snapshot, cell) {
    const isOpening = (snapshot?.openingCells || []).some(candidate => String(candidate?.id) === String(cell?.id));
    return sumSideLengths(isOpening
        ? getSashBeadSideLengths(snapshot, cell)
        : getFixedBeadSideLengths(snapshot, cell));
}

function getOpeningSashPerimeterM(snapshot, cell) {
    return sumSideLengths(getSashSideLengths(snapshot, cell));
}

function isAccessoryEnabled(accessorySelection, groupId) {
    const state = accessorySelection?.accessories?.[groupId];
    return Boolean(state?.enabled && state?.available !== false);
}

function getAccessoryProfileId(accessorySelection, groupId, fallbackProfileId) {
    return String(accessorySelection?.accessories?.[groupId]?.profileId || fallbackProfileId || '');
}

function drainageCapsForFieldWidth(widthM) {
    const width = clampLength(widthM);
    if (width <= 0) return 0;
    if (width <= 0.8) return 2;
    // Schüco drainage guidance uses two outlets for fields up to 800 mm and
    // additional outlets above that, with roughly <=650 mm centre spacing.
    return Math.max(2, Math.ceil(Math.max(0, width - 0.15) / 0.65) + 1);
}

function getBottomTopologyCells(snapshot) {
    const cells = snapshot?.layoutState?.topology?.windows || [];
    if (!cells.length) return [...(snapshot?.openingCells || []), ...(snapshot?.fixedCells || [])];
    const bottom = Math.min(...cells.map(cell => finite(cell?.rect?.y0, Infinity)));
    return cells.filter(cell => Math.abs(finite(cell?.rect?.y0) - bottom) <= 1e-7);
}

function normalizedMaterialRates(rates = {}) {
    const legacyOtherRate = Number(rates.other) > 0
        ? Number(rates.other)
        : (Number(rates.otherComponentRatePerUnit) > 0 ? Number(rates.otherComponentRatePerUnit) : DEFAULT_OTHER_COMPONENT_RATE_EUR_PER_UNIT);
    return {
        gasket: Number(rates.gasket ?? rates.gasketRatePerM ?? rates.gasketRatePerKg) > 0
            ? Number(rates.gasket ?? rates.gasketRatePerM ?? rates.gasketRatePerKg)
            : DEFAULT_GASKET_RATE_EUR_PER_M,
        insulation: Number(rates.insulation ?? rates.insulationRatePerM ?? rates.insulationRatePerKg) > 0
            ? Number(rates.insulation ?? rates.insulationRatePerM ?? rates.insulationRatePerKg)
            : DEFAULT_INSULATION_RATE_EUR_PER_M,
        foam: Number(rates.foam ?? rates.foamRatePerM ?? rates.foamRatePerKg) > 0
            ? Number(rates.foam ?? rates.foamRatePerM ?? rates.foamRatePerKg)
            : DEFAULT_FOAM_RATE_EUR_PER_M,
        lockingBar: Number(rates.lockingBar ?? rates.lockingBarRatePerM ?? rates.lockingBarRatePerKg) > 0
            ? Number(rates.lockingBar ?? rates.lockingBarRatePerM ?? rates.lockingBarRatePerKg)
            : legacyOtherRate || DEFAULT_LOCKING_BAR_RATE_EUR_PER_M,
        glazingBridge: Number(rates.glazingBridge ?? rates.glazingBridgeRatePerM ?? rates.glazingBridgeRatePerKg) > 0
            ? Number(rates.glazingBridge ?? rates.glazingBridgeRatePerM ?? rates.glazingBridgeRatePerKg)
            : legacyOtherRate || DEFAULT_GLAZING_BRIDGE_RATE_EUR_PER_M,
        drainageCap: Number(rates.drainageCap ?? rates.drainageCapRatePerPc ?? rates.drainageCapRatePerKg) > 0
            ? Number(rates.drainageCap ?? rates.drainageCapRatePerPc ?? rates.drainageCapRatePerKg)
            : legacyOtherRate || DEFAULT_DRAINAGE_CAP_RATE_EUR_PER_PC,
        other: legacyOtherRate,
    };
}

function makeAccessoryBomItem({ profileId, quantity, locale, materialRates, windowNumber = null }) {
    const tech = WINDOW_ACCESSORY_MANUFACTURING_DATA[String(profileId || '')];
    const safeQuantity = Math.max(0, finite(quantity));
    if (!tech || safeQuantity <= 0) return null;
    const rates = normalizedMaterialRates(materialRates);
    const materialGroup = WINDOW_NON_ALUMINIUM_MATERIALS[tech.materialGroup] ? tech.materialGroup : 'other';
    const rateKey = String(tech.rateKey || materialGroup || 'other');
    const rateEurPerUnit = rates[rateKey] ?? rates.other;
    const weightKg = tech.kgPerUnit != null ? safeQuantity * tech.kgPerUnit : null;
    const price = safeQuantity * rateEurPerUnit;
    return {
        type: 'accessory',
        category: 'accessory',
        groupId: tech.groupId,
        materialGroup,
        rateKey,
        materialName: windowT(locale, WINDOW_NON_ALUMINIUM_MATERIALS[materialGroup]?.nameKey || 'summary.material.other'),
        name: `${windowT(locale, tech.nameKey || 'summary.material.other')}${windowNumber ? ` · ${windowT(locale, 'layout.window')} ${windowNumber}` : ''}`,
        profileId: String(profileId),
        unit: tech.unit,
        quantity: safeQuantity,
        lengthM: tech.unit === 'm' ? safeQuantity : null,
        rateEurPerUnit,
        rateEurPerKg: null,
        kgPerM: tech.unit === 'm' ? tech.kgPerUnit : null,
        weightKg,
        price,
        priceBasis: tech.unit === 'pc' ? 'piece-count' : 'linear-length',
    };
}

function buildEmbeddedProfileMaterialItems(cuts, locale, materialRates) {
    const lengthByProfile = new Map();
    cuts.forEach(cut => {
        const profileId = String(cut?.profileId || '');
        if (!WINDOW_PROFILE_NON_ALUMINIUM_DATA[profileId]) return;
        lengthByProfile.set(profileId, (lengthByProfile.get(profileId) || 0) + clampLength(cut.lengthM));
    });

    const rates = normalizedMaterialRates(materialRates);
    const items = [];
    [...lengthByProfile.entries()].forEach(([profileId, lengthM]) => {
        const materialData = WINDOW_PROFILE_NON_ALUMINIUM_DATA[profileId] || {};
        Object.entries(materialData).forEach(([materialGroup, kgPerM]) => {
            if (!WINDOW_NON_ALUMINIUM_MATERIALS[materialGroup] || finite(kgPerM) <= 0) return;
            const rateEurPerUnit = rates[materialGroup] ?? rates.other;
            const weightKg = lengthM * finite(kgPerM);
            const price = lengthM * rateEurPerUnit;
            items.push({
                type: 'accessory',
                category: 'accessory',
                groupId: `profile-${materialGroup}`,
                materialGroup,
                rateKey: materialGroup,
                materialName: windowT(locale, WINDOW_NON_ALUMINIUM_MATERIALS[materialGroup].nameKey),
                name: windowT(locale, `summary.accessory.profileMaterial.${materialGroup}`),
                profileId,
                unit: 'm',
                quantity: lengthM,
                lengthM,
                rateEurPerUnit,
                rateEurPerKg: null,
                kgPerM: finite(kgPerM),
                weightKg,
                price,
                priceBasis: 'linear-length',
            });
        });
    });
    return items;
}

function buildAccessoryItems({ snapshot, accessorySelection, locale, windowNumberMap, materialRates }) {
    if (!accessorySelection?.accessories) return [];
    const items = [];
    const openingCells = snapshot?.openingCells || [];
    const allGlazingCells = [...openingCells, ...(snapshot?.fixedCells || [])];

    const addLinear = (groupId, fallbackProfileId, lengthM) => {
        if (!isAccessoryEnabled(accessorySelection, groupId)) return;
        const profileId = getAccessoryProfileId(accessorySelection, groupId, fallbackProfileId);
        const item = makeAccessoryBomItem({ profileId, quantity: lengthM, locale, materialRates });
        if (item) items.push(item);
    };

    const sashPerimeter = openingCells.reduce((sum, cell) => sum + getOpeningSashPerimeterM(snapshot, cell), 0);
    const glazingPerimeter = allGlazingCells.reduce((sum, cell) => sum + getCellGlazingPerimeterM(snapshot, cell), 0);

    // Profiles which follow one complete operable-sash perimeter.
    addLinear('locking-bar', '275701', sashPerimeter);
    addLinear('centre-gasket', '224068', sashPerimeter);
    addLinear('insulation-profile', '200988', sashPerimeter);

    // 245472 appears at both sides of the opening-sash rebate (frame-side and
    // sash-side), hence two perimeter runs per operable sash.
    addLinear('rebate-gasket', '245472', sashPerimeter * 2);

    // Inner and outer glazing seals follow each actual glazing/bead perimeter,
    // for fixed lights as well as opening sashes.
    addLinear('outer-glazing-gasket', '224063', glazingPerimeter);
    if (isAccessoryEnabled(accessorySelection, 'inner-glazing-gasket')) {
        const profileId = getAccessoryProfileId(accessorySelection, 'inner-glazing-gasket', '224378');
        const item = makeAccessoryBomItem({ profileId, quantity: glazingPerimeter, locale, materialRates });
        if (item) items.push(item);
    }

    // 288319 is only present on the bottom sash channel in the current CAD.
    if (isAccessoryEnabled(accessorySelection, 'glazing-bridge')) {
        const profileId = getAccessoryProfileId(accessorySelection, 'glazing-bridge', '288319');
        const lengthM = openingCells.reduce((sum, cell) => sum + clampLength(getSashBeadSideLengths(snapshot, cell).bottom), 0);
        const item = makeAccessoryBomItem({ profileId, quantity: lengthM, locale, materialRates });
        if (item) items.push(item);
    }

    if (isAccessoryEnabled(accessorySelection, 'drainage-cap')) {
        const profileId = getAccessoryProfileId(accessorySelection, 'drainage-cap', '208694');
        const quantity = getBottomTopologyCells(snapshot).reduce((sum, cell) => {
            const actual = getCellActualSize(snapshot, cell);
            return sum + drainageCapsForFieldWidth(actual.widthM || cell?.width);
        }, 0);
        const item = makeAccessoryBomItem({ profileId, quantity, locale, materialRates });
        if (item) items.push(item);
    }

    return items;
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
    accessorySelection = {},
    aluminiumRatePerKg = null,
    glassRatePerSqm = null,
    glassEnabled = true,
    gasketRatePerM = null,
    insulationRatePerM = null,
    foamRatePerM = null,
    lockingBarRatePerM = null,
    glazingBridgeRatePerM = null,
    drainageCapRatePerPc = null,
    otherComponentRatePerUnit = null,
    // Backwards compatibility parameter names
    gasketRatePerKg = null,
    insulationRatePerKg = null,
    foamRatePerKg = null,
    lockingBarRatePerKg = null,
    glazingBridgeRatePerKg = null,
    drainageCapRatePerKg = null,
    otherComponentRatePerKg = null,
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
    const materialRates = normalizedMaterialRates({
        gasket: gasketRatePerM ?? gasketRatePerKg,
        insulation: insulationRatePerM ?? insulationRatePerKg,
        foam: foamRatePerM ?? foamRatePerKg,
        lockingBar: lockingBarRatePerM ?? lockingBarRatePerKg,
        glazingBridge: glazingBridgeRatePerM ?? glazingBridgeRatePerKg,
        drainageCap: drainageCapRatePerPc ?? drainageCapRatePerKg,
        other: otherComponentRatePerUnit ?? otherComponentRatePerKg,
    });
    const isGlassCalculated = Boolean(glassEnabled);
    const glassItems = buildGlassItems(snapshot, locale, windowNumberMap);
    const embeddedProfileItems = buildEmbeddedProfileMaterialItems(cuts, locale, materialRates);
    const accessoryItems = [
        ...embeddedProfileItems,
        ...buildAccessoryItems({ snapshot, accessorySelection, locale, windowNumberMap, materialRates }),
    ];

    const aluminiumRate = Number(aluminiumRatePerKg) > 0 ? Number(aluminiumRatePerKg) : DEFAULT_ALUMINIUM_RATE_EUR_PER_KG;
    const glassRate = Number(glassRatePerSqm) > 0 ? Number(glassRatePerSqm) : DEFAULT_GLASS_RATE_EUR_PER_SQM;
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
        price: isGlassCalculated && glassRate != null ? item.areaSqm * glassRate : null,
    }));
    const accessoryBom = accessoryItems.map((item, index) => ({ ...item, bomId: `accessory-${index}` }));
    const bomItems = [...profileBom, ...glassBom, ...accessoryBom];
    const aluminiumWeightKg = profileBom.reduce((sum, item) => sum + finite(item.weightKg), 0);
    const glassAreaSqm = glassBom.reduce((sum, item) => sum + finite(item.areaSqm), 0);
    const materialTotals = Object.fromEntries(Object.keys(WINDOW_NON_ALUMINIUM_MATERIALS).map(materialGroup => {
        const items = accessoryBom.filter(item => item.materialGroup === materialGroup);
        return [materialGroup, Object.freeze({
            lengthM: items.filter(item => item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            quantity: items.filter(item => item.unit === 'pc').reduce((sum, item) => sum + finite(item.quantity), 0),
            weightKg: items.reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: items.reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates[materialGroup],
        })];
    }));
    const pricingTotals = Object.freeze({
        gasket: Object.freeze({
            lengthM: accessoryBom.filter(item => item.rateKey === 'gasket' && item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'gasket').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'gasket').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.gasket,
            unit: 'm',
        }),
        insulation: Object.freeze({
            lengthM: accessoryBom.filter(item => item.rateKey === 'insulation' && item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'insulation').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'insulation').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.insulation,
            unit: 'm',
        }),
        foam: Object.freeze({
            lengthM: accessoryBom.filter(item => item.rateKey === 'foam' && item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'foam').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'foam').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.foam,
            unit: 'm',
        }),
        lockingBar: Object.freeze({
            lengthM: accessoryBom.filter(item => item.rateKey === 'lockingBar' && item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'lockingBar').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'lockingBar').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.lockingBar,
            unit: 'm',
        }),
        glazingBridge: Object.freeze({
            lengthM: accessoryBom.filter(item => item.rateKey === 'glazingBridge' && item.unit === 'm').reduce((sum, item) => sum + finite(item.lengthM ?? item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'glazingBridge').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'glazingBridge').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.glazingBridge,
            unit: 'm',
        }),
        drainageCap: Object.freeze({
            quantity: accessoryBom.filter(item => item.rateKey === 'drainageCap' && item.unit === 'pc').reduce((sum, item) => sum + finite(item.quantity), 0),
            weightKg: accessoryBom.filter(item => item.rateKey === 'drainageCap').reduce((sum, item) => sum + finite(item.weightKg), 0),
            price: accessoryBom.filter(item => item.rateKey === 'drainageCap').reduce((sum, item) => sum + finite(item.price), 0),
            rateEurPerUnit: materialRates.drainageCap,
            unit: 'pc',
        }),
    });
    const accessoryWeightKg = accessoryBom.reduce((sum, item) => sum + finite(item.weightKg), 0);
    const aluminiumTotal = aluminiumRate == null ? null : profileBom.reduce((sum, item) => sum + finite(item.price), 0);
    const glassTotal = isGlassCalculated && glassRate != null ? glassBom.reduce((sum, item) => sum + finite(item.price), 0) : null;
    const accessoryTotal = accessoryBom.reduce((sum, item) => sum + finite(item.price), 0);
    const otherComponentWeightKg = pricingTotals.lockingBar.weightKg + pricingTotals.glazingBridge.weightKg + pricingTotals.drainageCap.weightKg;
    const otherComponentTotal = pricingTotals.lockingBar.price + pricingTotals.glazingBridge.price + pricingTotals.drainageCap.price;
    const total = aluminiumTotal != null
        ? aluminiumTotal + (glassTotal != null ? glassTotal : 0) + accessoryTotal
        : null;

    return Object.freeze({
        geometry,
        cuts: Object.freeze(cuts),
        bomItems: Object.freeze(bomItems),
        totals: Object.freeze({
            aluminiumWeightKg,
            glassAreaSqm,
            glassEnabled: isGlassCalculated,
            accessoryWeightKg,
            aluminiumTotal,
            glassTotal,
            accessoryTotal,
            gasketLengthM: pricingTotals.gasket.lengthM,
            gasketWeightKg: pricingTotals.gasket.weightKg,
            gasketTotal: pricingTotals.gasket.price,
            insulationLengthM: pricingTotals.insulation.lengthM,
            insulationWeightKg: pricingTotals.insulation.weightKg,
            insulationTotal: pricingTotals.insulation.price,
            foamLengthM: pricingTotals.foam.lengthM,
            foamWeightKg: pricingTotals.foam.weightKg,
            foamTotal: pricingTotals.foam.price,
            lockingBarLengthM: pricingTotals.lockingBar.lengthM,
            lockingBarWeightKg: pricingTotals.lockingBar.weightKg,
            lockingBarTotal: pricingTotals.lockingBar.price,
            glazingBridgeLengthM: pricingTotals.glazingBridge.lengthM,
            glazingBridgeWeightKg: pricingTotals.glazingBridge.weightKg,
            glazingBridgeTotal: pricingTotals.glazingBridge.price,
            drainageCapQuantity: pricingTotals.drainageCap.quantity,
            drainageCapWeightKg: pricingTotals.drainageCap.weightKg,
            drainageCapTotal: pricingTotals.drainageCap.price,
            otherComponentWeightKg,
            otherComponentTotal,
            materialTotals: Object.freeze(materialTotals),
            pricingTotals,
            total,
        }),
    });
}

function readStoredRates() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) || '{}');
        const legacyOther = Number(parsed.other) > 0
            ? Number(parsed.other)
            : DEFAULT_OTHER_COMPONENT_RATE_EUR_PER_UNIT;
        return {
            aluminium: Number(parsed.aluminium) > 0
                ? Number(parsed.aluminium)
                : DEFAULT_ALUMINIUM_RATE_EUR_PER_KG,
            glass: Number(parsed.glass) > 0
                ? Number(parsed.glass)
                : DEFAULT_GLASS_RATE_EUR_PER_SQM,
            glassEnabled: parsed.glassEnabled !== false,
            gasket: Number(parsed.gasket) > 0
                ? Number(parsed.gasket)
                : DEFAULT_GASKET_RATE_EUR_PER_M,
            insulation: Number(parsed.insulation) > 0
                ? Number(parsed.insulation)
                : DEFAULT_INSULATION_RATE_EUR_PER_M,
            foam: Number(parsed.foam) > 0
                ? Number(parsed.foam)
                : DEFAULT_FOAM_RATE_EUR_PER_M,
            lockingBar: Number(parsed.lockingBar) > 0
                ? Number(parsed.lockingBar)
                : legacyOther || DEFAULT_LOCKING_BAR_RATE_EUR_PER_M,
            glazingBridge: Number(parsed.glazingBridge) > 0
                ? Number(parsed.glazingBridge)
                : legacyOther || DEFAULT_GLAZING_BRIDGE_RATE_EUR_PER_M,
            drainageCap: Number(parsed.drainageCap) > 0
                ? Number(parsed.drainageCap)
                : legacyOther || DEFAULT_DRAINAGE_CAP_RATE_EUR_PER_PC,
            other: legacyOther,
        };
    } catch (_error) {
        return {
            aluminium: DEFAULT_ALUMINIUM_RATE_EUR_PER_KG,
            glass: DEFAULT_GLASS_RATE_EUR_PER_SQM,
            glassEnabled: true,
            gasket: DEFAULT_GASKET_RATE_EUR_PER_M,
            insulation: DEFAULT_INSULATION_RATE_EUR_PER_M,
            foam: DEFAULT_FOAM_RATE_EUR_PER_M,
            lockingBar: DEFAULT_LOCKING_BAR_RATE_EUR_PER_M,
            glazingBridge: DEFAULT_GLAZING_BRIDGE_RATE_EUR_PER_M,
            drainageCap: DEFAULT_DRAINAGE_CAP_RATE_EUR_PER_PC,
            other: DEFAULT_OTHER_COMPONENT_RATE_EUR_PER_UNIT,
        };
    }
}

function writeStoredRates(rates) {
    try {
        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(rates));
    } catch (_error) {
        // Storage is optional (private browsing / restrictive embeds).
    }
}

function renderBom(result, locale, currency = getSummaryCurrency()) {
    const content = document.getElementById('window-bom-content');
    if (!content) return;
    if (!result.bomItems.length) {
        content.innerHTML = `<div class="window-summary-empty">${escapeHtml(windowT(locale, 'summary.empty'))}</div>`;
        return;
    }

    const showRollup = (quantityOrWeight, price) => finite(quantityOrWeight) > 0 || Number.isFinite(price);
    const rollups = [
        {
            label: windowT(locale, 'summary.part.aluminium'),
            detail: formatWeight(result.totals.aluminiumWeightKg, locale),
            price: result.totals.aluminiumTotal,
            show: showRollup(result.totals.aluminiumWeightKg, result.totals.aluminiumTotal),
        },
        {
            label: windowT(locale, 'summary.part.glass'),
            detail: formatArea(result.totals.glassAreaSqm, locale),
            price: result.totals.glassTotal,
            show: result.totals.glassEnabled !== false && showRollup(result.totals.glassAreaSqm, result.totals.glassTotal),
        },
        {
            label: windowT(locale, 'summary.metric.gasketCost'),
            detail: formatLengthM(result.totals.gasketLengthM, locale),
            price: result.totals.gasketTotal,
            show: showRollup(result.totals.gasketLengthM, result.totals.gasketTotal),
        },
        {
            label: windowT(locale, 'summary.metric.insulationCost'),
            detail: formatLengthM(result.totals.insulationLengthM, locale),
            price: result.totals.insulationTotal,
            show: showRollup(result.totals.insulationLengthM, result.totals.insulationTotal),
        },
        {
            label: windowT(locale, 'summary.metric.foamCost'),
            detail: formatLengthM(result.totals.foamLengthM, locale),
            price: result.totals.foamTotal,
            show: showRollup(result.totals.foamLengthM, result.totals.foamTotal),
        },
        {
            label: windowT(locale, 'summary.accessory.lockingBar'),
            detail: formatLengthM(result.totals.lockingBarLengthM, locale),
            price: result.totals.lockingBarTotal,
            show: showRollup(result.totals.lockingBarLengthM, result.totals.lockingBarTotal),
        },
        {
            label: windowT(locale, 'summary.accessory.glazingBridge'),
            detail: formatLengthM(result.totals.glazingBridgeLengthM, locale),
            price: result.totals.glazingBridgeTotal,
            show: showRollup(result.totals.glazingBridgeLengthM, result.totals.glazingBridgeTotal),
        },
        {
            label: windowT(locale, 'summary.accessory.drainageCap'),
            detail: formatPieces(result.totals.drainageCapQuantity, locale),
            price: result.totals.drainageCapTotal,
            show: showRollup(result.totals.drainageCapQuantity, result.totals.drainageCapTotal),
        },
        {
            label: windowT(locale, 'summary.metric.total'),
            detail: '',
            price: result.totals.total,
            show: true,
            total: true,
        },
    ].filter(item => item.show);

    content.innerHTML = `
        <div class="window-summary-rollups">
            ${rollups.map(item => `<article class="window-summary-rollup${item.total ? ' is-total' : ''}">
                <div class="window-summary-rollup-main">
                    <div class="window-summary-rollup-line">
                        <strong>${escapeHtml(item.label)}${item.detail ? ':' : ''}</strong>
                        ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ''}
                    </div>
                </div>
                <span class="window-summary-rollup-arrow" aria-hidden="true">→</span>
                <b class="window-summary-rollup-price">${escapeHtml(formatSummaryMoneyFromEur(item.price, locale, currency))}</b>
            </article>`).join('')}
        </div>
        <div class="window-summary-list">
            ${result.bomItems.map(item => {
                const isGlass = item.type === 'glass';
                const isAccessory = item.type === 'accessory';
                const detail = isGlass
                    ? `${formatLengthMm(item.widthM, locale)} × ${formatLengthMm(item.heightM, locale)} · ${formatArea(item.areaSqm, locale)}`
                    : isAccessory && item.unit === 'pc'
                        ? `${formatPieces(item.quantity, locale)} · ${formatSummaryMoneyFromEur(item.rateEurPerUnit, locale, currency)}/pc`
                        : isAccessory
                            ? `${formatLengthM(item.lengthM, locale)} · ${formatSummaryMoneyFromEur(item.rateEurPerUnit, locale, currency)}/m`
                            : `${formatLengthMm(item.lengthM, locale)} · ${Number.isFinite(item.weightKg) ? formatWeight(item.weightKg, locale) : '—'}${Number.isFinite(item.kgPerM) ? ` · ${item.kgPerM.toFixed(3)} kg/m` : ''}`;
                const profile = isGlass ? '' : `<small>${escapeHtml(item.profileId)}</small>`;
                const materialClass = isAccessory && item.materialGroup ? ` is-material-${escapeHtml(item.materialGroup)}` : '';
                return `<article class="window-summary-item${materialClass}">
                    <div class="window-summary-item-main"><strong>${escapeHtml(item.name)}</strong>${profile}<span>${escapeHtml(detail)}</span></div>
                    <span class="window-summary-item-arrow" aria-hidden="true">→</span>
                    <b class="window-summary-price">${escapeHtml(formatSummaryMoneyFromEur(item.price, locale, currency))}</b>
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
    getAccessorySelection = () => ({}),
} = {}) {
    let snapshot = null;
    let result = null;
    let ratesEur = readStoredRates();
    const rateInputs = {
        aluminium: { input: document.getElementById('summaryAluminiumRate'), denominator: 'kg' },
        glass: { input: document.getElementById('summaryGlassRate'), denominator: 'm²' },
        gasket: { input: document.getElementById('summaryGasketRate'), denominator: 'm' },
        insulation: { input: document.getElementById('summaryInsulationRate'), denominator: 'm' },
        foam: { input: document.getElementById('summaryFoamRate'), denominator: 'm' },
        lockingBar: { input: document.getElementById('summaryLockingBarRate'), denominator: 'm' },
        glazingBridge: { input: document.getElementById('summaryGlazingBridgeRate'), denominator: 'm' },
        drainageCap: { input: document.getElementById('summaryDrainageCapRate'), denominator: 'pc' },
    };
    const glassEnabledInput = document.getElementById('summaryGlassEnabled');
    Object.values(rateInputs).forEach(entry => {
        entry.unit = entry.input?.parentElement?.querySelector('b') || null;
    });

    const syncRateInputs = () => {
        const currency = getSummaryCurrency();
        Object.entries(rateInputs).forEach(([key, entry]) => {
            if (entry.input) {
                entry.input.value = formatRateInput(convertSummaryMoney(ratesEur[key], 'EUR', currency));
            }
            if (entry.unit) entry.unit.textContent = currencyRateUnit(currency, entry.denominator);
        });
        if (glassEnabledInput) {
            glassEnabledInput.checked = ratesEur.glassEnabled !== false;
        }
    };

    const readRatesFromInputsInEur = () => {
        const currency = getSummaryCurrency();
        const rates = Object.fromEntries(Object.entries(rateInputs).map(([key, entry]) => {
            const value = Number(entry.input?.value);
            return [key, value > 0 ? convertSummaryMoney(value, currency, 'EUR') : null];
        }));
        rates.glassEnabled = glassEnabledInput ? Boolean(glassEnabledInput.checked) : true;
        return rates;
    };

    syncRateInputs();

    const render = () => {
        const locale = getWindowLocale();
        const currency = getSummaryCurrency();
        result = buildWindowFabricationSummary({
            snapshot,
            profileSelection: getProfileSelection(),
            layoutSelection: getLayoutSelection(),
            glazingBeadCode: getActiveGlazingBeadCode(),
            accessorySelection: getAccessorySelection(),
            aluminiumRatePerKg: ratesEur.aluminium,
            glassRatePerSqm: ratesEur.glass,
            glassEnabled: ratesEur.glassEnabled !== false,
            gasketRatePerM: ratesEur.gasket,
            insulationRatePerM: ratesEur.insulation,
            foamRatePerM: ratesEur.foam,
            lockingBarRatePerM: ratesEur.lockingBar,
            glazingBridgeRatePerM: ratesEur.glazingBridge,
            drainageCapRatePerPc: ratesEur.drainageCap,
            otherComponentRatePerUnit: ratesEur.other,
            locale,
        });
        renderBom(result, locale, currency);
        renderCuts(result, locale);
        window.dispatchEvent(new CustomEvent('window-pricing-updated', {
            detail: { totalEur: result?.totals?.total ?? null },
        }));
        return result;
    };

    const handleRateInput = () => {
        ratesEur = readRatesFromInputsInEur();
        writeStoredRates(ratesEur);
        render();
    };
    const handlePreferenceChange = event => {
        if (event?.detail?.name !== 'currency') return;
        syncRateInputs();
        render();
    };
    const handleSharedShellReady = () => {
        syncRateInputs();
        render();
    };
    Object.values(rateInputs).forEach(entry => entry.input?.addEventListener('input', handleRateInput));
    glassEnabledInput?.addEventListener('change', handleRateInput);
    window.addEventListener('window-locale-applied', render);
    window.addEventListener('window-preference-change', handlePreferenceChange);
    window.addEventListener('window-shared-shell-ready', handleSharedShellReady);

    return {
        update(nextSnapshot) {
            snapshot = nextSnapshot;
            return render();
        },
        render,
        getResult: () => result,
    };
}
