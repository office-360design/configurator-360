import {
    getBaseAluminiumProfiles,
    isProfileGeometryAvailable,
} from './profile-catalog.js';
import {
    FIXED_WINDOW_TYPE,
    SASH_WINDOW_TYPE,
    addWindowToState,
    classifyWindowState,
    createWindowStateFromLayoutDefinition,
    deriveWindowTopology,
    mergeWindowsInState,
    normalizeWindowState,
    parseWindowState,
    serializeWindowState,
    setWindowStateDividerProfile,
    setWindowTypeInState,
} from './window-layout-state.js';

export const DEFAULT_WINDOW_LAYOUT_ID = 'single';
export const DEFAULT_DIVIDER_PROFILE_ID = '575800';

const CELL_TYPES = Object.freeze({
    fixed: FIXED_WINDOW_TYPE,
    left: SASH_WINDOW_TYPE,
    right: SASH_WINDOW_TYPE,
});
const CELL_HANDLES = Object.freeze({ fixed: null, left: 'left', right: 'right' });

function freezeLayout(id, definition) {
    return Object.freeze({ id, ...definition });
}

function buildLayouts() {
    const layouts = {
        single: freezeLayout('single', {
            label: 'Single opening',
            dividerOrientation: null,
            leftCell: null,
            rightCell: SASH_WINDOW_TYPE,
            cells: Object.freeze([SASH_WINDOW_TYPE]),
            cellHandleSides: Object.freeze(['right']),
        }),
        'vertical-divider': freezeLayout('vertical-divider', {
            label: 'Vertical mullion',
            dividerOrientation: 'vertical',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: SASH_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE]),
        }),
        'vertical-fixed-fixed': freezeLayout('vertical-fixed-fixed', {
            label: 'Vertical mullion — fixed / fixed',
            dividerOrientation: 'vertical',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: FIXED_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE]),
        }),
        'vertical-fixed-fixed-fixed': freezeLayout('vertical-fixed-fixed-fixed', {
            label: 'Three fixed columns',
            dividerOrientation: 'vertical',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: FIXED_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE]),
        }),
        'vertical-sash-sash': freezeLayout('vertical-sash-sash', {
            label: 'Vertical mullion — sash / sash',
            dividerOrientation: 'vertical',
            leftCell: SASH_WINDOW_TYPE,
            rightCell: SASH_WINDOW_TYPE,
            cells: Object.freeze([SASH_WINDOW_TYPE, SASH_WINDOW_TYPE]),
        }),
        'horizontal-divider': freezeLayout('horizontal-divider', {
            label: 'Horizontal transom',
            dividerOrientation: 'horizontal',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: SASH_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE]),
        }),
        'horizontal-fixed-fixed': freezeLayout('horizontal-fixed-fixed', {
            label: 'Horizontal transom — fixed / fixed',
            dividerOrientation: 'horizontal',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: FIXED_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE]),
        }),
        'horizontal-fixed-fixed-fixed': freezeLayout('horizontal-fixed-fixed-fixed', {
            label: 'Three fixed rows',
            dividerOrientation: 'horizontal',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: FIXED_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE, FIXED_WINDOW_TYPE]),
        }),
        'top-fixed-bottom-sash-sash': freezeLayout('top-fixed-bottom-sash-sash', {
            label: 'Top fixed — two sashes below',
            layoutKind: 't-grid',
            dividerOrientation: 'grid',
            primaryDividerOrientation: 'horizontal',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: SASH_WINDOW_TYPE,
            cells: Object.freeze([FIXED_WINDOW_TYPE, SASH_WINDOW_TYPE, SASH_WINDOW_TYPE]),
            cellHandleSides: Object.freeze([null, 'right', 'left']),
            topRowFraction: 0.30,
        }),
    };

    ['fixed', 'left', 'right'].forEach(option => {
        layouts[`single-${option}`] = freezeLayout(`single-${option}`, {
            label: `1 window — ${option}`,
            dividerOrientation: null,
            leftCell: null,
            rightCell: CELL_TYPES[option],
            cells: Object.freeze([CELL_TYPES[option]]),
            cellHandleSides: Object.freeze([CELL_HANDLES[option]]),
        });
    });

    ['fixed', 'left', 'right'].forEach(a => {
        ['fixed', 'left', 'right'].forEach(b => {
            layouts[`vertical-2-${a}-${b}`] = freezeLayout(`vertical-2-${a}-${b}`, {
                label: `2 window — ${a} / ${b}`,
                dividerOrientation: 'vertical',
                leftCell: CELL_TYPES[a],
                rightCell: CELL_TYPES[b],
                cells: Object.freeze([CELL_TYPES[a], CELL_TYPES[b]]),
                cellHandleSides: Object.freeze([CELL_HANDLES[a], CELL_HANDLES[b]]),
            });
            layouts[`horizontal-2-${a}-${b}`] = freezeLayout(`horizontal-2-${a}-${b}`, {
                label: `2 rows — ${a} / ${b}`,
                dividerOrientation: 'horizontal',
                leftCell: CELL_TYPES[a],
                rightCell: CELL_TYPES[b],
                cells: Object.freeze([CELL_TYPES[a], CELL_TYPES[b]]),
                cellHandleSides: Object.freeze([CELL_HANDLES[a], CELL_HANDLES[b]]),
            });
            ['fixed', 'left', 'right'].forEach(c => {
                layouts[`vertical-3-${a}-${b}-${c}`] = freezeLayout(`vertical-3-${a}-${b}-${c}`, {
                    label: `3 window — ${a} / ${b} / ${c}`,
                    dividerOrientation: 'vertical',
                    leftCell: CELL_TYPES[a],
                    rightCell: CELL_TYPES[c],
                    cells: Object.freeze([CELL_TYPES[a], CELL_TYPES[b], CELL_TYPES[c]]),
                    cellHandleSides: Object.freeze([CELL_HANDLES[a], CELL_HANDLES[b], CELL_HANDLES[c]]),
                });
                layouts[`horizontal-3-${a}-${b}-${c}`] = freezeLayout(`horizontal-3-${a}-${b}-${c}`, {
                    label: `3 rows — ${a} / ${b} / ${c}`,
                    dividerOrientation: 'horizontal',
                    leftCell: CELL_TYPES[a],
                    rightCell: CELL_TYPES[c],
                    cells: Object.freeze([CELL_TYPES[a], CELL_TYPES[b], CELL_TYPES[c]]),
                    cellHandleSides: Object.freeze([CELL_HANDLES[a], CELL_HANDLES[b], CELL_HANDLES[c]]),
                });
            });
        });
    });

    // Legacy menu URLs kept for backward compatibility.
    ['fixed', 'left', 'right'].forEach(option => {
        layouts[`horizontal-2-fixed-top-${option}`] = freezeLayout(`horizontal-2-fixed-top-${option}`, {
            label: `Fixed top — bottom ${option}`,
            dividerOrientation: 'horizontal',
            leftCell: CELL_TYPES[option],
            rightCell: FIXED_WINDOW_TYPE,
            cells: Object.freeze([CELL_TYPES[option], FIXED_WINDOW_TYPE]),
            cellHandleSides: Object.freeze([CELL_HANDLES[option], null]),
        });
        layouts[`horizontal-2-fixed-bottom-${option}`] = freezeLayout(`horizontal-2-fixed-bottom-${option}`, {
            label: `Fixed bottom — top ${option}`,
            dividerOrientation: 'horizontal',
            leftCell: FIXED_WINDOW_TYPE,
            rightCell: CELL_TYPES[option],
            cells: Object.freeze([FIXED_WINDOW_TYPE, CELL_TYPES[option]]),
            cellHandleSides: Object.freeze([null, CELL_HANDLES[option]]),
        });
        ['fixed', 'left', 'right'].forEach(other => {
            layouts[`t-layout-${option}-${other}`] = freezeLayout(`t-layout-${option}-${other}`, {
                label: `T-layout — ${option} / ${other} bottom`,
                layoutKind: 't-grid',
                dividerOrientation: 'grid',
                primaryDividerOrientation: 'horizontal',
                leftCell: FIXED_WINDOW_TYPE,
                rightCell: CELL_TYPES[other],
                cells: Object.freeze([FIXED_WINDOW_TYPE, CELL_TYPES[option], CELL_TYPES[other]]),
                cellHandleSides: Object.freeze([null, CELL_HANDLES[option], CELL_HANDLES[other]]),
                topRowFraction: 0.30,
            });
        });
    });

    return Object.freeze(layouts);
}

export const WINDOW_LAYOUTS = buildLayouts();

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

export function normalizeWindowLayoutId(value) {
    return WINDOW_LAYOUTS[value] ? value : DEFAULT_WINDOW_LAYOUT_ID;
}

export function getWindowLayoutDefinition(layoutId) {
    return WINDOW_LAYOUTS[normalizeWindowLayoutId(layoutId)];
}

export function getWindowLayoutRequest(configuration = {}) {
    const dividerProfileId = String(firstDefined(
        configuration.dividerProfileId,
        configuration.divider_profile,
        configuration.mullionProfileId,
        configuration.mullion_profile
    ) || DEFAULT_DIVIDER_PROFILE_ID);
    const windowState = parseWindowState(firstDefined(
        configuration.windowState,
        configuration.window_state,
        configuration.layoutState,
        configuration.layout_state
    ), { dividerProfileId });
    return {
        layoutId: normalizeWindowLayoutId(firstDefined(
            configuration.layoutId,
            configuration.windowLayout,
            configuration.window_layout,
            configuration.layout
        )),
        dividerProfileId,
        windowState,
    };
}

export function createWindowLayoutSignature(configuration = {}) {
    const request = getWindowLayoutRequest(configuration);
    if (request.windowState) {
        return `state:${serializeWindowState(request.windowState)}|${request.dividerProfileId}`;
    }
    return `${request.layoutId}|${request.dividerProfileId}`;
}

function replaceSelectOptions(select, options, selectedValue) {
    if (!select || typeof document === 'undefined') return;
    select.innerHTML = '';
    options.forEach(optionDefinition => {
        const option = document.createElement('option');
        option.value = optionDefinition.value;
        option.textContent = optionDefinition.label;
        select.appendChild(option);
    });
    select.value = options.some(option => option.value === selectedValue)
        ? selectedValue
        : (options[0]?.value || '');
}

function compatibilitySnapshot(windowState, layoutId, dividerProfileId) {
    const classification = classifyWindowState(windowState);
    const topology = deriveWindowTopology(windowState);
    let orderedCells = [...windowState.windows];
    let dividerOrientation = null;
    let primaryDividerOrientation = null;
    let layoutKind = classification.kind === 't-grid' ? 't-grid' : 'linear';
    let topRowFraction = null;

    if (classification.kind === 'linear') {
        orderedCells = [...classification.cells];
        dividerOrientation = classification.orientation;
        primaryDividerOrientation = classification.orientation;
    } else if (classification.kind === 't-grid') {
        dividerOrientation = 'grid';
        primaryDividerOrientation = classification.spanningSide === 'top' || classification.spanningSide === 'bottom'
            ? 'horizontal'
            : 'vertical';
        const spanning = windowState.windows.find(cell => cell.id === classification.spanningCellId);
        const others = windowState.windows.filter(cell => cell.id !== classification.spanningCellId);
        if (classification.spanningSide === 'top') {
            others.sort((a, b) => a.rect.x0 - b.rect.x0);
            orderedCells = [spanning, ...others];
            topRowFraction = spanning.rect.y1 - spanning.rect.y0;
        } else {
            orderedCells = [spanning, ...others];
        }
    }

    const cells = orderedCells.map(cell => cell.type);
    const handles = orderedCells.map(cell => cell.handleSide);
    return {
        layoutId,
        windowLayout: layoutId,
        dividerProfileId,
        dividerOrientation,
        primaryDividerOrientation,
        layoutKind,
        spanningSide: classification.spanningSide || null,
        topRowFraction,
        leftCell: cells[0] || null,
        rightCell: cells.at(-1) || null,
        cells,
        cellHandleSides: handles,
        dividerCount: classification.kind === 't-grid' ? 2 : topology.dividers.length,
        layoutSignature: `state:${serializeWindowState(windowState)}|${dividerProfileId}`,
        windowState,
        topology,
        windowStateVersion: windowState.version,
        isDynamicWindowState: layoutId === 'dynamic',
    };
}

export function createWindowLayoutController({
    layoutInput,
    dividerProfileInput,
    initialSelection = {},
    onLayoutChange = async () => {},
} = {}) {
    const initialRequest = getWindowLayoutRequest(initialSelection);
    let layoutId = initialRequest.windowState ? 'dynamic' : initialRequest.layoutId;
    let dividerProfileId = initialRequest.dividerProfileId;
    let windowState = initialRequest.windowState
        ? setWindowStateDividerProfile(initialRequest.windowState, dividerProfileId)
        : createWindowStateFromLayoutDefinition(
            getWindowLayoutDefinition(layoutId),
            dividerProfileId
        );
    let controlsInitialized = false;

    function getDividerOptions() {
        return getBaseAluminiumProfiles('mullion-transom')
            .filter(isProfileGeometryAvailable)
            .map(profile => ({ value: profile.id, label: profile.id }));
    }

    function getConfigurationSnapshot() {
        return compatibilitySnapshot(windowState, layoutId, dividerProfileId);
    }

    function syncControls() {
        if (layoutInput) {
            replaceSelectOptions(
                layoutInput,
                Object.values(WINDOW_LAYOUTS).map(layout => ({ value: layout.id, label: layout.label })),
                layoutId === 'dynamic' ? DEFAULT_WINDOW_LAYOUT_ID : layoutId
            );
        }
        if (dividerProfileInput) {
            replaceSelectOptions(dividerProfileInput, getDividerOptions(), dividerProfileId);
            const hasDivider = windowState.windows.length > 1;
            dividerProfileInput.disabled = !hasDivider;
            dividerProfileInput.closest?.('.divider-profile-field')?.classList.toggle('is-disabled', !hasDivider);
        }
    }

    async function notifyChange(previous, { reloadDivider = false, topologyOnly = false } = {}) {
        const next = getConfigurationSnapshot();
        syncControls();
        if (next.layoutSignature !== previous.layoutSignature || reloadDivider) {
            await onLayoutChange(next, { reloadDivider, topologyOnly });
        }
        return next;
    }

    async function setLayout(nextLayoutId, { notify = true } = {}) {
        const previous = getConfigurationSnapshot();
        layoutId = normalizeWindowLayoutId(nextLayoutId);
        windowState = createWindowStateFromLayoutDefinition(
            getWindowLayoutDefinition(layoutId),
            dividerProfileId
        );
        syncControls();
        if (notify) return notifyChange(previous, { topologyOnly: false });
        return getConfigurationSnapshot();
    }

    async function setDividerProfile(nextProfileId, { notify = true } = {}) {
        const previous = getConfigurationSnapshot();
        const availableIds = getDividerOptions().map(option => option.value);
        dividerProfileId = availableIds.includes(String(nextProfileId))
            ? String(nextProfileId)
            : (availableIds[0] || DEFAULT_DIVIDER_PROFILE_ID);
        windowState = setWindowStateDividerProfile(windowState, dividerProfileId);
        syncControls();
        if (notify) return notifyChange(previous, { reloadDivider: true });
        return getConfigurationSnapshot();
    }

    async function addWindow(cellId, direction, type, { handleSide = null, notify = true } = {}) {
        const previous = getConfigurationSnapshot();
        windowState = addWindowToState(windowState, { cellId, direction, type, handleSide });
        layoutId = 'dynamic';
        if (notify) return notifyChange(previous, { topologyOnly: true });
        syncControls();
        return getConfigurationSnapshot();
    }

    async function mergeWindows(cellAId, cellBId, type = null, { handleSide = null, notify = true } = {}) {
        const previous = getConfigurationSnapshot();
        windowState = mergeWindowsInState(windowState, { cellAId, cellBId, type, handleSide });
        layoutId = 'dynamic';
        if (notify) return notifyChange(previous, { topologyOnly: true });
        syncControls();
        return getConfigurationSnapshot();
    }

    async function setWindowType(cellId, type, { handleSide = null, notify = true } = {}) {
        const previous = getConfigurationSnapshot();
        windowState = setWindowTypeInState(windowState, cellId, type, handleSide);
        layoutId = 'dynamic';
        if (notify) return notifyChange(previous, { topologyOnly: true });
        syncControls();
        return getConfigurationSnapshot();
    }

    async function applyConfiguration(configuration = {}, { notify = false } = {}) {
        const previous = getConfigurationSnapshot();
        const request = getWindowLayoutRequest(configuration);
        dividerProfileId = request.dividerProfileId;
        if (request.windowState) {
            layoutId = 'dynamic';
            windowState = setWindowStateDividerProfile(request.windowState, dividerProfileId);
        } else {
            layoutId = request.layoutId;
            windowState = createWindowStateFromLayoutDefinition(
                getWindowLayoutDefinition(layoutId),
                dividerProfileId
            );
        }
        syncControls();
        if (notify) return notifyChange(previous, {
            reloadDivider: dividerProfileId !== previous.dividerProfileId,
            topologyOnly: dividerProfileId === previous.dividerProfileId,
        });
        return getConfigurationSnapshot();
    }

    function initializeControls() {
        if (controlsInitialized) return;
        controlsInitialized = true;
        syncControls();
        layoutInput?.addEventListener('change', () => setLayout(layoutInput.value));
        dividerProfileInput?.addEventListener('change', () => setDividerProfile(dividerProfileInput.value));
    }

    function appendUrlParams(target) {
        const params = target?.searchParams || target;
        if (!params?.set) return target;
        params.set('window_state', serializeWindowState(windowState));
        params.set('divider_profile', dividerProfileId);
        if (layoutId !== 'dynamic') params.set('window_layout', layoutId);
        else params.delete?.('window_layout');
        return target;
    }

    return {
        initializeControls,
        syncControls,
        setLayout,
        setDividerProfile,
        addWindow,
        mergeWindows,
        setWindowType,
        applyConfiguration,
        appendUrlParams,
        getConfigurationSnapshot,
        getWindowState: () => windowState,
        getLayoutId: () => layoutId,
        getDividerProfileId: () => dividerProfileId,
        getDividerOrientation: () => getConfigurationSnapshot().dividerOrientation,
    };
}
