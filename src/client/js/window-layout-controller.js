import {
    getBaseAluminiumProfiles,
    isProfileGeometryAvailable,
} from './profile-catalog.js';

export const DEFAULT_WINDOW_LAYOUT_ID = 'single';
export const DEFAULT_DIVIDER_PROFILE_ID = '575800';

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
    'vertical-fixed-fixed': Object.freeze({
        id: 'vertical-fixed-fixed',
        label: 'Vertical mullion — fixed / fixed',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    }),
    'horizontal-divider': Object.freeze({
        id: 'horizontal-divider',
        label: 'Horizontal transom',
        dividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    }),
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

    function getDividerOptions() {
        return getBaseAluminiumProfiles('mullion-transom')
            .filter(isProfileGeometryAvailable)
            .map(profile => ({ value: profile.id, label: profile.id }));
    }

    function syncControls() {
        replaceSelectOptions(
            layoutInput,
            Object.values(WINDOW_LAYOUTS).map(layout => ({
                value: layout.id,
                label: layout.label,
            })),
            layoutId
        );
        replaceSelectOptions(
            dividerProfileInput,
            getDividerOptions(),
            dividerProfileId
        );

        const hasDivider = Boolean(getWindowLayoutDefinition(layoutId).dividerOrientation);
        if (dividerProfileInput) {
            dividerProfileInput.disabled = !hasDivider;
            dividerProfileInput.closest?.('.divider-profile-field')
                ?.classList.toggle('is-disabled', !hasDivider);
        }
    }

    function getConfigurationSnapshot() {
        const layout = getWindowLayoutDefinition(layoutId);
        return {
            layoutId,
            windowLayout: layoutId,
            dividerProfileId,
            dividerOrientation: layout.dividerOrientation,
        leftCell: layout.leftCell,
        rightCell: layout.rightCell,
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
