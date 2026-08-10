import {
    getBaseAluminiumProfiles,
    isProfileGeometryAvailable,
} from './profile-catalog.js';

export const DEFAULT_WINDOW_LAYOUT_ID = 'single';
export const DEFAULT_DIVIDER_PROFILE_ID = '575800';

function createRepeatedFixedLayout({ id, label, orientation, cellCount }) {
    const normalizedCount = Math.max(2, Math.floor(Number(cellCount) || 2));
    const cells = Object.freeze(Array.from({ length: normalizedCount }, () => 'fixed-glazing'));
    return Object.freeze({
        id,
        label,
        dividerOrientation: orientation,
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
        cells,
    });
}

const REPEATED_FIXED_LAYOUTS = Object.freeze([
    createRepeatedFixedLayout({
        id: 'vertical-fixed-fixed',
        label: 'Vertical mullion — fixed / fixed',
        orientation: 'vertical',
        cellCount: 2,
    }),
    createRepeatedFixedLayout({
        id: 'vertical-fixed-fixed-fixed',
        label: 'Three fixed columns',
        orientation: 'vertical',
        cellCount: 3,
    }),
    createRepeatedFixedLayout({
        id: 'horizontal-fixed-fixed',
        label: 'Horizontal transom — fixed / fixed',
        orientation: 'horizontal',
        cellCount: 2,
    }),
    createRepeatedFixedLayout({
        id: 'horizontal-fixed-fixed-fixed',
        label: 'Three fixed rows',
        orientation: 'horizontal',
        cellCount: 3,
    }),
]);

const GENERATED_LAYOUTS = {};

function addLayout(id, def) {
    GENERATED_LAYOUTS[id] = Object.freeze({
        id,
        ...def
    });
}

const CELL_TYPES = {
    fixed: 'fixed-glazing',
    left: 'opening-sash',
    right: 'opening-sash'
};

const CELL_HANDLES = {
    fixed: null,
    left: 'left',
    right: 'right'
};

// 1-window layouts
['fixed', 'left', 'right'].forEach(opt => {
    addLayout(`single-${opt}`, {
        label: `1 window — ${opt}`,
        dividerOrientation: null,
        leftCell: null,
        rightCell: CELL_TYPES[opt],
        cells: [CELL_TYPES[opt]],
        cellHandleSides: [CELL_HANDLES[opt]]
    });
});

// 2-window layouts
['fixed', 'left', 'right'].forEach(opt1 => {
    ['fixed', 'left', 'right'].forEach(opt2 => {
        addLayout(`vertical-2-${opt1}-${opt2}`, {
            label: `2 window — ${opt1} / ${opt2}`,
            dividerOrientation: 'vertical',
            leftCell: CELL_TYPES[opt1],
            rightCell: CELL_TYPES[opt2],
            cells: [CELL_TYPES[opt1], CELL_TYPES[opt2]],
            cellHandleSides: [CELL_HANDLES[opt1], CELL_HANDLES[opt2]]
        });
    });
});

// 3-window layouts
['fixed', 'left', 'right'].forEach(opt1 => {
    ['fixed', 'left', 'right'].forEach(opt2 => {
        ['fixed', 'left', 'right'].forEach(opt3 => {
            addLayout(`vertical-3-${opt1}-${opt2}-${opt3}`, {
                label: `3 window — ${opt1} / ${opt2} / ${opt3}`,
                dividerOrientation: 'vertical',
                cells: [CELL_TYPES[opt1], CELL_TYPES[opt2], CELL_TYPES[opt3]],
                cellHandleSides: [CELL_HANDLES[opt1], CELL_HANDLES[opt2], CELL_HANDLES[opt3]]
            });
        });
    });
});

// fixed top (bottom is opt, top is fixed)
['fixed', 'left', 'right'].forEach(opt => {
    addLayout(`horizontal-2-fixed-top-${opt}`, {
        label: `Fixed top — bottom ${opt}`,
        dividerOrientation: 'horizontal',
        leftCell: CELL_TYPES[opt], // bottom
        rightCell: 'fixed-glazing', // top
        cells: [CELL_TYPES[opt], 'fixed-glazing'],
        cellHandleSides: [CELL_HANDLES[opt], null]
    });
});

// fixed bottom (bottom is fixed, top is opt)
['fixed', 'left', 'right'].forEach(opt => {
    addLayout(`horizontal-2-fixed-bottom-${opt}`, {
        label: `Fixed bottom — top ${opt}`,
        dividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing', // bottom
        rightCell: CELL_TYPES[opt], // top
        cells: ['fixed-glazing', CELL_TYPES[opt]],
        cellHandleSides: [null, CELL_HANDLES[opt]]
    });
});

// T-layout (fixed top with 2 windows bottom)
['fixed', 'left', 'right'].forEach(opt1 => {
    ['fixed', 'left', 'right'].forEach(opt2 => {
        addLayout(`t-layout-${opt1}-${opt2}`, {
            label: `T-layout — ${opt1} / ${opt2} bottom`,
            layoutKind: 't-grid',
            dividerOrientation: 'grid',
            primaryDividerOrientation: 'horizontal',
            leftCell: 'fixed-glazing', // top cell representation for legacy
            rightCell: CELL_TYPES[opt2], // right bottom cell representation
            cells: Object.freeze(['fixed-glazing', CELL_TYPES[opt1], CELL_TYPES[opt2]]),
            cellHandleSides: Object.freeze([null, CELL_HANDLES[opt1], CELL_HANDLES[opt2]]),
            topRowFraction: 0.30
        });
    });
});

export const WINDOW_LAYOUTS = Object.freeze({
    single: Object.freeze({
        id: 'single',
        label: 'Single opening',
        dividerOrientation: null,
        leftCell: null,
        rightCell: 'opening-sash',
    }),
    'vertical-divider': Object.freeze({
        id: 'vertical-divider',
        label: 'Vertical mullion',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    }),
    ...Object.fromEntries(
        REPEATED_FIXED_LAYOUTS
            .filter(layout => layout.dividerOrientation === 'vertical')
            .map(layout => [layout.id, layout])
    ),
    'vertical-sash-sash': Object.freeze({
        id: 'vertical-sash-sash',
        label: 'Vertical mullion — sash / sash',
        dividerOrientation: 'vertical',
        leftCell: 'opening-sash',
        rightCell: 'opening-sash',
    }),
    'top-fixed-bottom-sash-sash': Object.freeze({
        id: 'top-fixed-bottom-sash-sash',
        label: 'Top fixed — two sashes below',
        layoutKind: 't-grid',
        dividerOrientation: 'grid',
        // The layout topology is a grid, but the primary CAD connection that
        // composes the top fixed light is the horizontal transom. Keep that
        // connection orientation explicit so transform composition does not
        // fall back to vertical/top follower assumptions.
        primaryDividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
        cells: Object.freeze([
            'fixed-glazing',
            'opening-sash',
            'opening-sash',
        ]),
        topRowFraction: 0.30,
    }),
    'horizontal-divider': Object.freeze({
        id: 'horizontal-divider',
        label: 'Horizontal transom',
        dividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    }),
    ...Object.fromEntries(
        REPEATED_FIXED_LAYOUTS
            .filter(layout => layout.dividerOrientation === 'horizontal')
            .map(layout => [layout.id, layout])
    ),
    ...GENERATED_LAYOUTS,
});

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

export function normalizeWindowLayoutId(value) {
    return WINDOW_LAYOUTS[value] ? value : DEFAULT_WINDOW_LAYOUT_ID;
}

export function getWindowLayoutRequest(configuration = {}) {
    return {
        layoutId: normalizeWindowLayoutId(firstDefined(
            configuration.layoutId,
            configuration.windowLayout,
            configuration.window_layout,
            configuration.layout
        )),
        dividerProfileId: String(firstDefined(
            configuration.dividerProfileId,
            configuration.divider_profile,
            configuration.mullionProfileId,
            configuration.mullion_profile
        ) || DEFAULT_DIVIDER_PROFILE_ID),
    };
}

export function getWindowLayoutDefinition(layoutId) {
    return WINDOW_LAYOUTS[normalizeWindowLayoutId(layoutId)];
}

export function createWindowLayoutSignature(configuration = {}) {
    const request = getWindowLayoutRequest(configuration);
    return `${request.layoutId}|${request.dividerProfileId}`;
}

function replaceSelectOptions(select, options, selectedValue) {
    if (!select || typeof document === 'undefined') return;

    select.innerHTML = '';
    for (const optionDefinition of options) {
        const option = document.createElement('option');
        option.value = optionDefinition.value;
        option.textContent = optionDefinition.label;
        select.appendChild(option);
    }

    if (options.some(option => option.value === selectedValue)) {
        select.value = selectedValue;
    } else if (options.length) {
        select.value = options[0].value;
    }
}

export function createWindowLayoutController({
    layoutInput,
    dividerProfileInput,
    initialSelection = {},
    onLayoutChange = async () => {},
} = {}) {
    const initialRequest = getWindowLayoutRequest(initialSelection);
    let layoutId = initialRequest.layoutId;
    let dividerProfileId = initialRequest.dividerProfileId;
    let controlsInitialized = false;

    let categoryBtns = null;
    let submenuContainer = null;

    function getDividerOptions() {
        return getBaseAluminiumProfiles('mullion-transom')
            .filter(isProfileGeometryAvailable)
            .map(profile => ({ value: profile.id, label: profile.id }));
    }

    function getArrowSvg(type, x, y, width, height) {
        if (type === 'left') {
            const xStart = x + width;
            const xEnd = x;
            const yStart = y;
            const yMid = y + height / 2;
            const yEnd = y + height;
            return `<polyline points="${xStart} ${yStart} ${xEnd} ${yMid} ${xStart} ${yEnd}" stroke-width="0.6" />` +
                   `<polyline points="${xEnd} ${yEnd} ${x + width/2} ${yStart} ${xStart} ${yEnd}" stroke-width="0.6" />`;
        } else if (type === 'right') {
            const xStart = x;
            const xEnd = x + width;
            const yStart = y;
            const yMid = y + height / 2;
            const yEnd = y + height;
            return `<polyline points="${xStart} ${yStart} ${xEnd} ${yMid} ${xStart} ${yEnd}" stroke-width="0.6" />` +
                   `<polyline points="${xStart} ${yEnd} ${x + width/2} ${yStart} ${xEnd} ${yEnd}" stroke-width="0.6" />`;
        }
        return '';
    }

    function generateOptionSvg(id) {
        let svgContent = '';
        
        if (id.startsWith('single-')) {
            const opt = id.split('-')[1];
            svgContent += `<rect x="7" y="4" width="10" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt, 7, 4, 10, 16);
        } else if (id.startsWith('vertical-2-')) {
            const parts = id.split('-');
            const opt1 = parts[2];
            const opt2 = parts[3];
            
            svgContent += `<rect x="7" y="4" width="4.7" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt1, 7, 4, 4.7, 16);
            
            svgContent += `<rect x="12.3" y="4" width="4.7" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt2, 12.3, 4, 4.7, 16);
        } else if (id.startsWith('vertical-3-')) {
            const parts = id.split('-');
            const opt1 = parts[2];
            const opt2 = parts[3];
            const opt3 = parts[4];
            
            svgContent += `<rect x="7" y="4" width="3" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt1, 7, 4, 3, 16);
            
            svgContent += `<rect x="10.5" y="4" width="3" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt2, 10.5, 4, 3, 16);
            
            svgContent += `<rect x="14" y="4" width="3" height="16" stroke-width="1" />`;
            svgContent += getArrowSvg(opt3, 14, 4, 3, 16);
        } else if (id.startsWith('horizontal-2-fixed-top-')) {
            const opt = id.split('-')[4];
            
            svgContent += `<rect x="7" y="4" width="10" height="7.5" stroke-width="1" />`;
            svgContent += `<rect x="7" y="12.5" width="10" height="7.5" stroke-width="1" />`;
            svgContent += getArrowSvg(opt, 7, 12.5, 10, 7.5);
        } else if (id.startsWith('horizontal-2-fixed-bottom-')) {
            const opt = id.split('-')[4];
            
            svgContent += `<rect x="7" y="12.5" width="10" height="7.5" stroke-width="1" />`;
            svgContent += `<rect x="7" y="4" width="10" height="7.5" stroke-width="1" />`;
            svgContent += getArrowSvg(opt, 7, 4, 10, 7.5);
        } else if (id.startsWith('t-layout-')) {
            const parts = id.split('-');
            const opt1 = parts[2];
            const opt2 = parts[3];
            
            svgContent += `<rect x="7" y="4" width="10" height="7.5" stroke-width="1" />`;
            
            svgContent += `<rect x="7" y="12.5" width="4.7" height="7.5" stroke-width="1" />`;
            svgContent += getArrowSvg(opt1, 7, 12.5, 4.7, 7.5);
            
            svgContent += `<rect x="12.3" y="12.5" width="4.7" height="7.5" stroke-width="1" />`;
            svgContent += getArrowSvg(opt2, 12.3, 12.5, 4.7, 7.5);
        } else {
            svgContent += `<rect x="7" y="4" width="10" height="16" stroke-width="1" />`;
        }
        
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 3 12 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
    }

    function renderSubmenu(category) {
        if (!submenuContainer) return;
        submenuContainer.innerHTML = '';
        
        const layouts = Object.values(WINDOW_LAYOUTS).filter(layout => {
            if (category === '1-window') return layout.id.startsWith('single-');
            if (category === '2-window') return layout.id.startsWith('vertical-2-');
            if (category === '3-window') return layout.id.startsWith('vertical-3-');
            if (category === 'fixed-top') return layout.id.startsWith('horizontal-2-fixed-top-');
            if (category === 'fixed-bottom') return layout.id.startsWith('horizontal-2-fixed-bottom-');
            if (category === 't-layout') return layout.id.startsWith('t-layout-');
            return false;
        });
        
        layouts.forEach(layout => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'layout-submenu-btn';
            btn.dataset.layoutId = layout.id;
            
            let shortLabel = layout.id;
            if (layout.id.startsWith('single-')) {
                shortLabel = layout.id.split('-')[1];
            } else if (layout.id.startsWith('vertical-2-')) {
                const parts = layout.id.split('-');
                shortLabel = `${parts[2]} / ${parts[3]}`;
            } else if (layout.id.startsWith('vertical-3-')) {
                const parts = layout.id.split('-');
                shortLabel = `${parts[2]}/${parts[3]}/${parts[4]}`;
            } else if (layout.id.startsWith('horizontal-2-fixed-top-')) {
                const parts = layout.id.split('-');
                shortLabel = `bottom ${parts[4]}`;
            } else if (layout.id.startsWith('horizontal-2-fixed-bottom-')) {
                const parts = layout.id.split('-');
                shortLabel = `top ${parts[4]}`;
            } else if (layout.id.startsWith('t-layout-')) {
                const parts = layout.id.split('-');
                shortLabel = `${parts[2]} / ${parts[3]}`;
            }
            
            shortLabel = shortLabel.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            btn.innerHTML = generateOptionSvg(layout.id) + `<span>${shortLabel}</span>`;
            
            if (layout.id === layoutId) {
                btn.classList.add('active');
            }
            
            btn.addEventListener('click', () => {
                setLayout(layout.id);
            });
            
            submenuContainer.appendChild(btn);
        });
    }

    function syncLayoutUI() {
        let activeCategory = '1-window';
        if (layoutId.startsWith('single-') || layoutId === 'single') {
            activeCategory = '1-window';
        } else if (layoutId.startsWith('vertical-2-') || layoutId === 'vertical-divider' || layoutId === 'vertical-fixed-fixed' || layoutId === 'vertical-sash-sash') {
            activeCategory = '2-window';
        } else if (layoutId.startsWith('vertical-3-') || layoutId === 'vertical-fixed-fixed-fixed') {
            activeCategory = '3-window';
        } else if (layoutId.startsWith('horizontal-2-fixed-top-')) {
            activeCategory = 'fixed-top';
        } else if (layoutId.startsWith('horizontal-2-fixed-bottom-') || layoutId === 'horizontal-divider') {
            activeCategory = 'fixed-bottom';
        } else if (layoutId.startsWith('t-layout-') || layoutId === 'top-fixed-bottom-sash-sash') {
            activeCategory = 't-layout';
        }
        
        if (categoryBtns) {
            categoryBtns.forEach(btn => {
                const isMatch = btn.dataset.category === activeCategory;
                btn.classList.toggle('active', isMatch);
            });
        }
        
        if (submenuContainer) {
            const currentActiveBtn = submenuContainer.querySelector('.active');
            if (!currentActiveBtn || currentActiveBtn.dataset.layoutId !== layoutId) {
                renderSubmenu(activeCategory);
            }
        }
    }

    function syncControls() {
        if (layoutInput) {
            replaceSelectOptions(
                layoutInput,
                Object.values(WINDOW_LAYOUTS).map(layout => ({
                    value: layout.id,
                    label: layout.label,
                })),
                layoutId
            );
        }
        if (dividerProfileInput) {
            replaceSelectOptions(
                dividerProfileInput,
                getDividerOptions(),
                dividerProfileId
            );
        }

        const hasDivider = Boolean(getWindowLayoutDefinition(layoutId).dividerOrientation);
        if (dividerProfileInput) {
            dividerProfileInput.disabled = !hasDivider;
            dividerProfileInput.closest?.('.divider-profile-field')
                ?.classList.toggle('is-disabled', !hasDivider);
        }

        syncLayoutUI();
    }

    function getConfigurationSnapshot() {
        const layout = getWindowLayoutDefinition(layoutId);
        const cells = layout.cells
            ? [...layout.cells]
            : [layout.leftCell, layout.rightCell].filter(Boolean);
        return {
            layoutId,
            windowLayout: layoutId,
            dividerProfileId,
            dividerOrientation: layout.dividerOrientation,
            primaryDividerOrientation:
                layout.primaryDividerOrientation || layout.dividerOrientation || null,
            layoutKind: layout.layoutKind || 'linear',
            topRowFraction: Number(layout.topRowFraction) || null,
            leftCell: layout.leftCell,
            rightCell: layout.rightCell,
            cells,
            cellHandleSides: layout.cellHandleSides ? [...layout.cellHandleSides] : null,
            dividerCount: Math.max(0, cells.length - 1),
            layoutSignature: createWindowLayoutSignature({ layoutId, dividerProfileId }),
        };
    }

    async function setLayout(nextLayoutId, { notify = true } = {}) {
        const normalized = normalizeWindowLayoutId(nextLayoutId);
        const changed = normalized !== layoutId;
        layoutId = normalized;
        syncControls();
        if (changed && notify) {
            await onLayoutChange(getConfigurationSnapshot(), { reloadDivider: false });
        }
        return getConfigurationSnapshot();
    }

    async function setDividerProfile(nextProfileId, { notify = true } = {}) {
        const availableIds = getDividerOptions().map(option => option.value);
        const normalized = availableIds.includes(String(nextProfileId))
            ? String(nextProfileId)
            : (availableIds[0] || DEFAULT_DIVIDER_PROFILE_ID);
        const changed = normalized !== dividerProfileId;
        dividerProfileId = normalized;
        syncControls();
        if (changed && notify) {
            await onLayoutChange(getConfigurationSnapshot(), { reloadDivider: true });
        }
        return getConfigurationSnapshot();
    }

    async function applyConfiguration(configuration = {}, { notify = false } = {}) {
        const request = getWindowLayoutRequest(configuration);
        const previous = getConfigurationSnapshot();
        layoutId = request.layoutId;
        dividerProfileId = request.dividerProfileId;
        syncControls();
        const next = getConfigurationSnapshot();
        if (notify && next.layoutSignature !== previous.layoutSignature) {
            await onLayoutChange(next, {
                reloadDivider: next.dividerProfileId !== previous.dividerProfileId,
            });
        }
        return next;
    }

    function initializeControls() {
        if (controlsInitialized) return;
        controlsInitialized = true;

        categoryBtns = document.querySelectorAll('.layout-category-btn');
        submenuContainer = document.getElementById('layoutSubmenuContainer');

        if (categoryBtns) {
            categoryBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const category = btn.dataset.category;
                    
                    const defaultLayout = Object.values(WINDOW_LAYOUTS).find(layout => {
                        if (category === '1-window') return layout.id.startsWith('single-');
                        if (category === '2-window') return layout.id.startsWith('vertical-2-');
                        if (category === '3-window') return layout.id.startsWith('vertical-3-');
                        if (category === 'fixed-top') return layout.id.startsWith('horizontal-2-fixed-top-');
                        if (category === 'fixed-bottom') return layout.id.startsWith('horizontal-2-fixed-bottom-');
                        if (category === 't-layout') return layout.id.startsWith('t-layout-');
                        return false;
                    });
                    
                    if (defaultLayout) {
                        setLayout(defaultLayout.id);
                    }
                });
            });
        }

        syncControls();

        layoutInput?.addEventListener('change', () => {
            setLayout(layoutInput.value);
        });
        dividerProfileInput?.addEventListener('change', () => {
            setDividerProfile(dividerProfileInput.value);
        });
    }

    function appendUrlParams(target) {
        const params = target?.searchParams || target;
        if (!params?.set) return target;
        params.set('window_layout', layoutId);
        params.set('divider_profile', dividerProfileId);
        return target;
    }

    return {
        initializeControls,
        syncControls,
        setLayout,
        setDividerProfile,
        applyConfiguration,
        appendUrlParams,
        getConfigurationSnapshot,
        getLayoutId: () => layoutId,
        getDividerProfileId: () => dividerProfileId,
        getDividerOrientation: () => getWindowLayoutDefinition(layoutId).dividerOrientation,
    };
}
