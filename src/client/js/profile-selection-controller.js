import {
    DEFAULT_LEGACY_PROFILE_SET_ID,
    getBaseAluminiumProfiles,
    getLegacyProfileSet,
    getLegacyProfileSets,
    isProfileGeometryAvailable,
} from './profile-catalog.js';
import { resolveLegacyProfileSelection } from './profile-compatibility.js';
import { createProfileSelectionSignature } from './profile-composition.js';
import { getWindowLocale, windowT } from './i18n.js';

export const CUSTOM_CAD_ASSEMBLY_ID = 'custom';

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

export function getProfileSelectionRequest(configuration = {}) {
    return {
        cadAssemblyId: firstDefined(
            configuration.cadAssemblyId,
            configuration.cadAssembly,
            configuration.cad_assembly
        ) || null,
        profileSetId: firstDefined(
            configuration.profile,
            configuration.profileSetId,
            configuration.profile_set
        ) || null,
        outerFrameProfileId: firstDefined(
            configuration.outerFrameProfileId,
            configuration.outer_frame_profile,
            configuration.outer_frame
        ) || null,
        sashProfileId: firstDefined(
            configuration.sashProfileId,
            configuration.sash_profile
        ) || null,
    };
}

function replaceSelectOptions(select, options, selectedValue) {
    if (!select) return;

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

function accessoryPresetIdForProfileSet(profileSet) {
    return String(profileSet?.displayCode || '')
        .trim()
        .toLowerCase();
}

function selectionMatchesProfileSet(selection, profileSetId) {
    const profileSet = getLegacyProfileSet(profileSetId);
    if (!profileSet) return false;

    return selection.profileSetId === profileSet.id
        && selection.outerFrameProfileId === profileSet.outerFrameProfileId
        && selection.sashProfileId === profileSet.sashProfileId;
}

function inferInitialCadAssemblyId(initialSelection, resolvedSelection) {
    const requested = firstDefined(
        initialSelection.cadAssemblyId,
        initialSelection.cadAssembly,
        initialSelection.cad_assembly
    );

    if (requested === CUSTOM_CAD_ASSEMBLY_ID) {
        return CUSTOM_CAD_ASSEMBLY_ID;
    }
    if (getLegacyProfileSet(requested)) {
        return requested;
    }
    if (selectionMatchesProfileSet(resolvedSelection, resolvedSelection.profileSetId)) {
        return resolvedSelection.profileSetId;
    }
    return CUSTOM_CAD_ASSEMBLY_ID;
}

export function createProfileSelectionController({
    profileSetInput,
    outerFrameInput,
    sashInput,
    initialSelection = {},
    loadProfiles = async () => {},
    onCadAssemblyPresetSelected = async () => {},
    onManualProfileSelection = () => {},
} = {}) {
    let currentSelection = resolveLegacyProfileSelection({
        ...initialSelection,
        fallbackProfileSetId: DEFAULT_LEGACY_PROFILE_SET_ID,
    });
    let currentCadAssemblyId = inferInitialCadAssemblyId(
        initialSelection,
        currentSelection
    );
    let controlsInitialized = false;

    function getBaseProfileOptions(profileClass) {
        return getBaseAluminiumProfiles(profileClass)
            .filter(isProfileGeometryAvailable)
            .map(profile => ({
                value: profile.id,
                label: profile.id,
            }));
    }

    function getCadAssemblyOptions() {
        return [
            ...getLegacyProfileSets().map(profileSet => ({
                value: profileSet.id,
                label: profileSet.displayCode || profileSet.label || profileSet.id,
            })),
            {
                value: CUSTOM_CAD_ASSEMBLY_ID,
                label: windowT(getWindowLocale(), 'profile.custom'),
            },
        ];
    }

    function renderOptions() {
        replaceSelectOptions(
            profileSetInput,
            getCadAssemblyOptions(),
            currentCadAssemblyId
        );
        replaceSelectOptions(
            outerFrameInput,
            getBaseProfileOptions('outer-frame'),
            currentSelection.outerFrameProfileId
        );
        replaceSelectOptions(
            sashInput,
            getBaseProfileOptions('sash'),
            currentSelection.sashProfileId
        );
    }

    function syncInputs() {
        renderOptions();
        if (profileSetInput) {
            profileSetInput.value = currentCadAssemblyId;
        }
        if (outerFrameInput) {
            outerFrameInput.value = currentSelection.outerFrameProfileId || '';
        }
        if (sashInput) {
            sashInput.value = currentSelection.sashProfileId || '';
        }
    }

    function getConfigurationSnapshot() {
        const profileSet = getLegacyProfileSet(currentSelection.profileSetId);
        const cadAssembly = getLegacyProfileSet(currentCadAssemblyId);
        const snapshot = {
            profile: currentSelection.profileSetId,
            profileSetId: currentSelection.profileSetId,
            cadAssemblyId: currentCadAssemblyId,
            cadAssembly: currentCadAssemblyId,
            cadAssemblyCode: cadAssembly?.displayCode || 'Custom',
            outerFrameProfileId: currentSelection.outerFrameProfileId,
            sashProfileId: currentSelection.sashProfileId,
            profileVariantCode: profileSet?.displayCode || null,
        };
        return {
            ...snapshot,
            selectionSignature: createProfileSelectionSignature(snapshot),
        };
    }

    function markCustomCadAssembly({ notify = false } = {}) {
        const changed = currentCadAssemblyId !== CUSTOM_CAD_ASSEMBLY_ID;
        currentCadAssemblyId = CUSTOM_CAD_ASSEMBLY_ID;
        if (profileSetInput) profileSetInput.value = CUSTOM_CAD_ASSEMBLY_ID;
        if (changed && notify) onManualProfileSelection(getConfigurationSnapshot());
        return changed;
    }

    async function setSelection(request = {}, {
        reload = false,
        preserveCadAssembly = false,
    } = {}) {
        const previousSnapshot = getConfigurationSnapshot();
        const resolved = resolveLegacyProfileSelection({
            profileSetId: request.profileSetId ?? currentSelection.profileSetId,
            outerFrameProfileId:
                request.outerFrameProfileId ?? currentSelection.outerFrameProfileId,
            sashProfileId: request.sashProfileId ?? currentSelection.sashProfileId,
            fallbackProfileSetId: currentSelection.profileSetId || DEFAULT_LEGACY_PROFILE_SET_ID,
        });

        currentSelection = resolved;
        if (!preserveCadAssembly) {
            markCustomCadAssembly();
        }
        syncInputs();

        const nextSnapshot = getConfigurationSnapshot();
        if (reload && nextSnapshot.selectionSignature !== previousSnapshot.selectionSignature) {
            await loadProfiles(nextSnapshot);
        }

        return nextSnapshot;
    }

    async function selectCadAssembly(cadAssemblyId, { reload = true } = {}) {
        if (cadAssemblyId === CUSTOM_CAD_ASSEMBLY_ID) {
            markCustomCadAssembly();
            return getConfigurationSnapshot();
        }

        const profileSet = getLegacyProfileSet(cadAssemblyId);
        if (!profileSet) return getConfigurationSnapshot();

        currentCadAssemblyId = profileSet.id;
        await onCadAssemblyPresetSelected({
            cadAssemblyId: profileSet.id,
            profileSetId: profileSet.id,
            accessoryPresetId: accessoryPresetIdForProfileSet(profileSet),
        });

        return setSelection({
            profileSetId: profileSet.id,
            outerFrameProfileId: profileSet.outerFrameProfileId,
            sashProfileId: profileSet.sashProfileId,
        }, {
            reload,
            preserveCadAssembly: true,
        });
    }

    async function selectProfileSet(profileSetId, options = {}) {
        return selectCadAssembly(profileSetId, options);
    }

    async function selectOuterFrame(outerFrameProfileId, { reload = true } = {}) {
        markCustomCadAssembly({ notify: true });
        return setSelection(
            { outerFrameProfileId },
            { reload, preserveCadAssembly: true }
        );
    }

    async function selectSash(sashProfileId, { reload = true } = {}) {
        markCustomCadAssembly({ notify: true });
        return setSelection(
            { sashProfileId },
            { reload, preserveCadAssembly: true }
        );
    }

    function initializeControls() {
        syncInputs();
        if (controlsInitialized) return;
        controlsInitialized = true;

        profileSetInput?.addEventListener('change', event => {
            selectCadAssembly(event.target.value).catch(error => {
                console.error('Could not change the CAD assembly preset.', error);
            });
        });

        outerFrameInput?.addEventListener('change', event => {
            selectOuterFrame(event.target.value).catch(error => {
                console.error('Could not change the outer-frame profile.', error);
            });
        });

        sashInput?.addEventListener('change', event => {
            selectSash(event.target.value).catch(error => {
                console.error('Could not change the sash profile.', error);
            });
        });
    }

    async function applyConfiguration(configuration, options = {}) {
        const request = getProfileSelectionRequest(configuration);
        const requestedCadAssembly = request.cadAssemblyId;
        const profileOnlyPreset = !requestedCadAssembly
            && request.profileSetId
            && !request.outerFrameProfileId
            && !request.sashProfileId;
        const presetId = requestedCadAssembly || (profileOnlyPreset ? request.profileSetId : null);

        if (presetId && presetId !== CUSTOM_CAD_ASSEMBLY_ID && getLegacyProfileSet(presetId)) {
            const presetSelection = await selectCadAssembly(presetId, {
                reload: false,
            });
            const profileSet = getLegacyProfileSet(presetId);
            const hasManualOverride = (
                request.outerFrameProfileId
                && request.outerFrameProfileId !== profileSet.outerFrameProfileId
            ) || (
                request.sashProfileId
                && request.sashProfileId !== profileSet.sashProfileId
            );

            if (!hasManualOverride) {
                if (options.reload) await loadProfiles(presetSelection);
                return presetSelection;
            }
        }

        const nextSnapshot = await setSelection(request, {
            ...options,
            preserveCadAssembly: true,
        });
        const matchingAssembly = getLegacyProfileSets().find(profileSet =>
            selectionMatchesProfileSet(currentSelection, profileSet.id)
        );
        currentCadAssemblyId = requestedCadAssembly === CUSTOM_CAD_ASSEMBLY_ID
            ? CUSTOM_CAD_ASSEMBLY_ID
            : (matchingAssembly?.id || CUSTOM_CAD_ASSEMBLY_ID);
        syncInputs();
        return getConfigurationSnapshot();
    }

    function appendUrlParams(url) {
        const snapshot = getConfigurationSnapshot();
        url.searchParams.set('profile', snapshot.profileSetId);
        url.searchParams.set('cad_assembly', snapshot.cadAssemblyId);
        if (snapshot.outerFrameProfileId) {
            url.searchParams.set('outer_frame', snapshot.outerFrameProfileId);
        }
        if (snapshot.sashProfileId) {
            url.searchParams.set('sash_profile', snapshot.sashProfileId);
        }
    }

    globalThis.window?.addEventListener('window-locale-applied', () => {
        syncInputs();
    });

    return {
        initializeControls,
        setSelection,
        selectProfileSet,
        selectCadAssembly,
        selectOuterFrame,
        selectSash,
        markCustomCadAssembly,
        applyConfiguration,
        appendUrlParams,
        getConfigurationSnapshot,
        getCurrentProfileSetId: () => currentSelection.profileSetId,
        getCurrentCadAssemblyId: () => currentCadAssemblyId,
        getOuterFrameProfileId: () => currentSelection.outerFrameProfileId,
        getSashProfileId: () => currentSelection.sashProfileId,
        isCurrentSelectionCompatible: () => currentSelection.compatible !== false,
        matchesCadAssemblyPreset: profileSetId =>
            selectionMatchesProfileSet(currentSelection, profileSetId),
    };
}
