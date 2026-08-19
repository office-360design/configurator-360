import {
    DEFAULT_ACCESSORY_PRESET_ID,
    getAccessoryGroupForProfile,
    getAccessoryPreset,
    getAccessoryPresets,
    getAvailableAccessoryProfileIds,
    getConfigurableAccessoryGroups,
    getLegacyProfileSet,
    getProfileCatalogEntry,
} from './profile-catalog.js';
import { resolveAccessoryPlacement } from './profile-compatibility.js';
import { getWindowLocale, localizeAccessoryGroup, localizeAccessoryPreset, windowPlural, windowT } from './i18n.js';

const FALSE_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled']);
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes', 'enabled']);
const CUSTOM_PRESET_ID = 'custom';

function parseBooleanValue(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (value === null || value === undefined || value === '') return fallback;

    const normalized = String(value).trim().toLowerCase();
    if (FALSE_VALUES.has(normalized)) return false;
    if (TRUE_VALUES.has(normalized)) return true;
    return fallback;
}

function getConfigurationValue(configuration, group) {
    if (!configuration || typeof configuration !== 'object') {
        return { found: false, value: undefined };
    }

    const keys = [
        group.configurationKey,
        group.urlParameter,
        ...(group.aliases || []),
    ];

    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(configuration, key)) {
            return { found: true, value: configuration[key] };
        }
    }

    const nested = configuration.accessories?.[group.id];
    if (nested && Object.prototype.hasOwnProperty.call(nested, 'enabled')) {
        return { found: true, value: nested.enabled };
    }

    return { found: false, value: undefined };
}

function getRequestedPresetId(pageParams) {
    const explicitPreset = pageParams.get('accessory_preset')
        || pageParams.get('accessoryPreset');
    if (getAccessoryPreset(explicitPreset)) return explicitPreset;

    const profileSet = getLegacyProfileSet(pageParams.get('profile'));
    const profilePresetId = String(profileSet?.displayCode || '')
        .trim()
        .toLowerCase();
    if (getAccessoryPreset(profilePresetId)) return profilePresetId;

    return DEFAULT_ACCESSORY_PRESET_ID;
}

function createElement(tagName, className = '') {
    if (typeof document === 'undefined') return null;
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
}

export function createAccessoryController({
    pageParams = new URLSearchParams(),
    isARMode = false,
    requestedActiveParts = null,
    getCurrentProfileSetId = () => null,
    getOuterFrameProfileId = () => null,
    getSashProfileId = () => null,
    getProfilesData = () => [],
    getResolvedAccessoryProfileId = () => null,
    isProfileGroupVisible = () => true,
    buildWindow = () => {},
    onStateChange = () => {},
} = {}) {
    const groups = getConfigurableAccessoryGroups();
    const stateByGroupId = new Map();
    const controlByGroupId = new Map();
    const rowByGroupId = new Map();
    const loadedProfileIdsByGroupId = new Map();

    let presetInput = null;
    let presetDescription = null;
    let optionsContainer = null;
    let currentPresetId = getRequestedPresetId(pageParams);

    const requestedPreset = getAccessoryPreset(currentPresetId)
        || getAccessoryPreset(DEFAULT_ACCESSORY_PRESET_ID);

    groups.forEach(group => {
        const parameterNames = [group.urlParameter, ...(group.aliases || [])];
        const explicitParameter = parameterNames.find(name => pageParams.has(name));
        const presetEnabled = requestedPreset?.groupStates?.[group.id];
        const fallbackEnabled = typeof presetEnabled === 'boolean'
            ? presetEnabled
            : group.defaultEnabled;
        const enabled = explicitParameter
            ? parseBooleanValue(pageParams.get(explicitParameter), fallbackEnabled)
            : fallbackEnabled;

        stateByGroupId.set(group.id, {
            enabled,
            selectedProfileId: group.defaultProfileId,
            explicit: Boolean(explicitParameter),
        });
    });

    function getState(groupId) {
        return stateByGroupId.get(groupId) || null;
    }

    function getProfileGroup(profile) {
        return getAccessoryGroupForProfile(profile);
    }

    function isManagedAccessoryProfile(profile) {
        return Boolean(getProfileGroup(profile));
    }

    function getLoadedProfileIds(groupId) {
        return loadedProfileIdsByGroupId.get(groupId) || new Set();
    }

    function isGroupAvailable(groupId) {
        return getLoadedProfileIds(groupId).size > 0;
    }

    function resolveDisplayedProfileId(group) {
        const resolved = getResolvedAccessoryProfileId(group.id);
        if (resolved && group.profileIds.includes(String(resolved))) {
            return String(resolved);
        }
        return getState(group.id)?.selectedProfileId || group.defaultProfileId;
    }

    function isProfileEnabled(profile) {
        const group = getProfileGroup(profile);
        if (!group) return true;

        const state = getState(group.id);
        if (!state?.enabled) return false;

        const entry = getProfileCatalogEntry(profile);
        if (!entry) return true;
        if (group.selectionMode === 'glass-thickness') return true;

        const loadedIds = getLoadedProfileIds(group.id);
        if (loadedIds.size <= 1) return true;
        return entry.id === state.selectedProfileId;
    }

    function setPresetInputValue() {
        if (!presetInput) return;
        const validValue = currentPresetId === CUSTOM_PRESET_ID
            || getAccessoryPreset(currentPresetId);
        presetInput.value = validValue ? currentPresetId : CUSTOM_PRESET_ID;
    }

    function updatePresetDescription() {
        if (!presetDescription) return;
        if (currentPresetId === CUSTOM_PRESET_ID) {
            presetDescription.textContent = windowT(getWindowLocale(), 'accessory.customSelection');
            return;
        }
        presetDescription.textContent = localizeAccessoryPreset(getWindowLocale(), getAccessoryPreset(currentPresetId))?.description || '';
    }

    function syncDedicatedControl(groupId) {
        const input = controlByGroupId.get(groupId);
        const state = getState(groupId);
        const available = isGroupAvailable(groupId);
        if (input && state) {
            input.checked = state.enabled && available;
            input.disabled = !available;
        }
    }

    function syncProfileToggles(groupId = null) {
        getProfilesData().forEach(profile => {
            const group = getProfileGroup(profile);
            if (!group || (groupId && group.id !== groupId)) return;

            const input = typeof document !== 'undefined'
                ? document.getElementById(`toggle_${profile.index}`)
                : null;
            if (input) {
                input.checked = isProfileEnabled(profile) && isProfileGroupVisible(profile);
            }
        });
    }

    function updateRow(group) {
        const row = rowByGroupId.get(group.id);
        if (!row) return;

        const available = isGroupAvailable(group.id);
        const availableCatalogIds = getAvailableAccessoryProfileIds(group);
        const loadedIds = [...getLoadedProfileIds(group.id)];
        const missingIds = group.profileIds.filter(
            profileId => !availableCatalogIds.includes(profileId)
        );
        const displayedProfileId = resolveDisplayedProfileId(group);

        row.classList.toggle('accessory-option-unavailable', !available);
        const profileLabel = row.querySelector('.accessory-option-profile');
        const statusLabel = row.querySelector('.accessory-option-status');
        const description = row.querySelector('.accessory-option-description');

        if (profileLabel) {
            if (group.selectionMode === 'glass-thickness' && available) {
                profileLabel.textContent = windowT(getWindowLocale(), 'accessory.active', { id: displayedProfileId });
            } else if (loadedIds.length) {
                profileLabel.textContent = loadedIds.join(' / ');
            } else if (availableCatalogIds.length) {
                profileLabel.textContent = windowT(getWindowLocale(), 'accessory.notInAssembly', { ids: availableCatalogIds.join(' / ') });
            } else {
                profileLabel.textContent = windowT(getWindowLocale(), 'accessory.geometryMissing', { ids: group.profileIds.join(' / ') });
            }
        }

        if (statusLabel) {
            if (!available && availableCatalogIds.length) {
                statusLabel.textContent = windowT(getWindowLocale(), 'accessory.unavailableAssembly');
            } else if (!available) {
                statusLabel.textContent = windowT(getWindowLocale(), 'accessory.sourceRequired');
            } else if (missingIds.length) {
                statusLabel.textContent = windowPlural(getWindowLocale(), 'accessory.missingVariant', missingIds.length, { ids: missingIds.join(', ') });
            } else {
                statusLabel.textContent = '';
            }
        }

        if (description) {
            description.textContent = localizeAccessoryGroup(getWindowLocale(), group)?.description || '';
        }
    }

    function syncControls(groupId = null) {
        if (groupId) {
            syncDedicatedControl(groupId);
            syncProfileToggles(groupId);
            const group = groups.find(item => item.id === groupId);
            if (group) updateRow(group);
        } else {
            groups.forEach(group => {
                syncDedicatedControl(group.id);
                updateRow(group);
            });
            syncProfileToggles();
        }

        setPresetInputValue();
        updatePresetDescription();
    }

    function notifyStateChanged({ rebuild = true, source = 'accessory' } = {}) {
        onStateChange({
            source,
            presetId: currentPresetId,
            snapshot: getConfigurationSnapshot(),
        });
        if (rebuild) buildWindow();
    }

    function markCustomPreset() {
        currentPresetId = CUSTOM_PRESET_ID;
        setPresetInputValue();
        updatePresetDescription();
    }

    function setAccessoryEnabled(groupId, enabled, {
        rebuild = true,
        explicit = true,
        preservePreset = false,
        source = 'accessory',
    } = {}) {
        const state = getState(groupId);
        if (!state) return false;

        const nextEnabled = Boolean(enabled);
        const changed = state.enabled !== nextEnabled;
        state.enabled = nextEnabled;
        if (explicit) state.explicit = true;
        if (!preservePreset) markCustomPreset();

        syncControls(groupId);
        if (changed) notifyStateChanged({ rebuild, source });
        return changed;
    }

    function setAccessoryProfileEnabled(profile, enabled, options = {}) {
        const group = getProfileGroup(profile);
        if (!group) return false;
        return setAccessoryEnabled(group.id, enabled, options);
    }

    function setAccessoryProfilesEnabled(profileStates, {
        rebuild = true,
        explicit = true,
        source = 'accessory-group',
    } = {}) {
        const nextByGroup = new Map();

        profileStates.forEach(({ profile, enabled }) => {
            const group = getProfileGroup(profile);
            if (group) nextByGroup.set(group.id, Boolean(enabled));
        });

        let changed = false;
        nextByGroup.forEach((enabled, groupId) => {
            const state = getState(groupId);
            if (!state) return;
            if (state.enabled !== enabled) changed = true;
            state.enabled = enabled;
            if (explicit) state.explicit = true;
        });

        if (nextByGroup.size) markCustomPreset();
        syncControls();
        if (changed) notifyStateChanged({ rebuild, source });
        return changed;
    }

    function setAccessoryPreset(presetId, {
        rebuild = true,
        explicit = true,
        source = 'accessory-preset',
    } = {}) {
        const preset = getAccessoryPreset(presetId);
        if (!preset) return false;

        let changed = currentPresetId !== preset.id;
        currentPresetId = preset.id;

        groups.forEach(group => {
            const state = getState(group.id);
            const presetValue = preset.groupStates?.[group.id];
            if (!state || typeof presetValue !== 'boolean') return;
            if (state.enabled !== presetValue) changed = true;
            state.enabled = presetValue;
            if (explicit) state.explicit = true;
        });

        syncControls();
        if (changed) notifyStateChanged({ rebuild, source });
        return changed;
    }

    function initializeProfiles(profiles) {
        loadedProfileIdsByGroupId.clear();
        groups.forEach(group => loadedProfileIdsByGroupId.set(group.id, new Set()));

        profiles.forEach(profile => {
            const group = getProfileGroup(profile);
            const entry = getProfileCatalogEntry(profile);
            if (!group || !entry) return;
            loadedProfileIdsByGroupId.get(group.id)?.add(entry.id);
        });

        groups.forEach(group => {
            const state = getState(group.id);
            const loadedIds = [...getLoadedProfileIds(group.id)];
            if (!state || !loadedIds.length || group.selectionMode === 'glass-thickness') return;
            if (!loadedIds.includes(state.selectedProfileId)) {
                state.selectedProfileId = loadedIds[0];
            }
        });

        if (isARMode && requestedActiveParts !== null) {
            groups.forEach(group => {
                const state = getState(group.id);
                if (!state || state.explicit) return;

                const matchingProfiles = profiles.filter(profile =>
                    getProfileGroup(profile)?.id === group.id
                );
                if (!matchingProfiles.length) return;

                state.enabled = matchingProfiles.some(profile => {
                    const catalogEntry = getProfileCatalogEntry(profile);
                    return requestedActiveParts.has(String(profile.index))
                        || requestedActiveParts.has(profile.componentId)
                        || requestedActiveParts.has(String(profile.profileId || ''))
                        || requestedActiveParts.has(String(catalogEntry?.id || ''));
                });
            });
        }

        renderAccessoryOptions();
        syncControls();
    }

    function canPlaceProfileOnSide(profile, side) {
        const group = getProfileGroup(profile);
        if (!group) return true;
        if (!isProfileEnabled(profile)) return false;

        const accessory = getProfileCatalogEntry(profile);
        const permittedSides = accessory?.attachment?.permittedSides || [];

        // Exact frame-sash CAD placement takes precedence over the legacy
        // catalog hostProfileIds compatibility list. Composition only attaches
        // frameAccessoryCadTransform when the active outer frame itself is an
        // exact occurrence in frame-sash-window.dwg, so this remains strictly
        // profile-specific while allowing newly CAD-authored frame accessories.
        if (profile?.frameAccessoryCadTransform) {
            const authoredHostId = String(profile.frameAccessoryHostProfileId || '');
            const activeOuterFrameId = String(getOuterFrameProfileId() || '');
            if (authoredHostId && authoredHostId === activeOuterFrameId) {
                return !side || !permittedSides.length || permittedSides.includes(side);
            }
        }

        const hostClasses = accessory?.attachment?.hostProfileClasses || [];
        const hostProfileId = hostClasses.includes('sash')
            ? getSashProfileId()
            : getOuterFrameProfileId();
        const placement = resolveAccessoryPlacement({
            accessoryProfileId: accessory?.id,
            profileSetId: getCurrentProfileSetId(),
            hostProfileId,
            side,
            location: accessory?.attachment?.location || null,
        });
        return placement.compatible;
    }

    function populatePresetOptions() {
        if (!presetInput || typeof document === 'undefined') return;
        presetInput.innerHTML = '';

        getAccessoryPresets().forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.label;
            presetInput.appendChild(option);
        });

        const customOption = document.createElement('option');
        customOption.value = CUSTOM_PRESET_ID;
        customOption.textContent = windowT(getWindowLocale(), 'accessory.custom');
        presetInput.appendChild(customOption);
        setPresetInputValue();
    }

    function createAccessoryRow(group) {
        const row = createElement('div', 'accessory-option-row');
        if (!row) return null;
        row.dataset.accessoryGroup = group.id;

        const text = createElement('div', 'accessory-option-text');
        const header = createElement('div', 'accessory-option-header');
        const label = createElement('span', 'accessory-option-label');
        const profile = createElement('span', 'accessory-option-profile');
        const description = createElement('div', 'accessory-option-description');
        const status = createElement('div', 'accessory-option-status');
        const switchLabel = createElement('label', 'switch');
        const input = createElement('input');
        const slider = createElement('span', 'switch-slider');

        label.textContent = localizeAccessoryGroup(getWindowLocale(), group)?.label || group.label;
        header.append(label, profile);
        text.append(header, description, status);
        input.type = 'checkbox';
        input.id = `accessory_${group.id}`;
        input.addEventListener('change', () => {
            setAccessoryEnabled(group.id, input.checked);
        });
        input.dataset.accessoryBound = '1';
        switchLabel.append(input, slider);
        row.append(text, switchLabel);

        controlByGroupId.set(group.id, input);
        rowByGroupId.set(group.id, row);
        return row;
    }

    function renderAccessoryOptions() {
        if (!optionsContainer || typeof document === 'undefined') return;
        optionsContainer.innerHTML = '';
        rowByGroupId.clear();

        groups.forEach(group => {
            const row = createAccessoryRow(group);
            if (row) optionsContainer.appendChild(row);
        });
    }

    function initializeControls(controlMap = {}) {
        presetInput = controlMap.presetInput || controlMap.accessoryPreset || null;
        presetDescription = controlMap.presetDescription || null;
        optionsContainer = controlMap.container || controlMap.optionsContainer || null;

        if (presetInput) {
            populatePresetOptions();
            presetInput.addEventListener('change', () => {
                if (presetInput.value === CUSTOM_PRESET_ID) {
                    markCustomPreset();
                    return;
                }
                setAccessoryPreset(presetInput.value);
            });
        }

        if (optionsContainer) {
            renderAccessoryOptions();
        }

        groups.forEach(group => {
            const input = controlMap[group.id]
                || controlMap[group.configurationKey]
                || controlByGroupId.get(group.id)
                || null;
            if (!input) return;

            controlByGroupId.set(group.id, input);
            if (!input.dataset?.accessoryBound) {
                input.addEventListener('change', () => {
                    setAccessoryEnabled(group.id, input.checked);
                });
                if (input.dataset) input.dataset.accessoryBound = '1';
            }
        });

        syncControls();
    }

    function applyConfiguration(configuration, {
        rebuild = false,
        source = 'configuration',
    } = {}) {
        let changed = false;
        const requestedPresetId = configuration?.accessoryPreset
            || configuration?.accessory_preset;
        const requestedCustomPreset = requestedPresetId === CUSTOM_PRESET_ID;
        if (requestedPresetId && getAccessoryPreset(requestedPresetId)) {
            changed = setAccessoryPreset(requestedPresetId, {
                rebuild: false,
                explicit: true,
                source,
            }) || changed;
        }

        let hasIndividualOverride = false;
        let differsFromPreset = false;
        const activePreset = getAccessoryPreset(currentPresetId);
        groups.forEach(group => {
            const requested = getConfigurationValue(configuration, group);
            if (!requested.found) return;
            hasIndividualOverride = true;

            const state = getState(group.id);
            if (!state) return;

            const nextEnabled = parseBooleanValue(
                requested.value,
                group.defaultEnabled
            );
            if (state.enabled !== nextEnabled) changed = true;
            state.enabled = nextEnabled;
            state.explicit = true;
            if (
                activePreset
                && typeof activePreset.groupStates?.[group.id] === 'boolean'
                && activePreset.groupStates[group.id] !== nextEnabled
            ) {
                differsFromPreset = true;
            }
        });

        if (
            requestedCustomPreset
            || (hasIndividualOverride && (!activePreset || differsFromPreset))
        ) {
            markCustomPreset();
        }
        syncControls();
        if (changed) notifyStateChanged({ rebuild, source });
        return changed;
    }

    function matchesPreset(presetId) {
        const preset = getAccessoryPreset(presetId);
        if (!preset) return false;

        return groups.every(group => {
            const expected = preset.groupStates?.[group.id];
            if (typeof expected !== 'boolean') return true;
            return Boolean(getState(group.id)?.enabled) === expected;
        });
    }

    function getConfigurationSnapshot() {
        const snapshot = {
            accessoryPreset: currentPresetId,
            accessories: {},
        };

        groups.forEach(group => {
            const state = getState(group.id);
            snapshot[group.configurationKey] = Boolean(state?.enabled);
            snapshot.accessories[group.id] = {
                enabled: Boolean(state?.enabled),
                profileId: resolveDisplayedProfileId(group),
                available: isGroupAvailable(group.id),
            };
        });

        return snapshot;
    }

    function appendUrlParams(url) {
        url.searchParams.set('accessory_preset', currentPresetId);
        groups.forEach(group => {
            const state = getState(group.id);
            url.searchParams.set(group.urlParameter, state?.enabled ? '1' : '0');
        });
    }

    globalThis.window?.addEventListener('window-locale-applied', () => {
        populatePresetOptions();
        renderAccessoryOptions();
        syncControls();
    });

    return {
        initializeControls,
        initializeProfiles,
        isManagedAccessoryProfile,
        isProfileEnabled,
        canPlaceProfileOnSide,
        setAccessoryEnabled,
        setAccessoryProfileEnabled,
        setAccessoryProfilesEnabled,
        setAccessoryPreset,
        applyConfiguration,
        getConfigurationSnapshot,
        appendUrlParams,
        syncControls,
        getAccessoryState: groupId => {
            const state = getState(groupId);
            return state ? { ...state, available: isGroupAvailable(groupId) } : null;
        },
        getCurrentPresetId: () => currentPresetId,
        matchesPreset,
    };
}
