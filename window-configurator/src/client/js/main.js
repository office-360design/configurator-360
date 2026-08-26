import {
    WINDOW_WIDTH_MIN_M,
    WINDOW_WIDTH_MAX_M,
    WINDOW_HEIGHT_MIN_M,
    WINDOW_HEIGHT_MAX_M,
} from './config.js';
import { createComponentSelection } from './component-selection.js';
import { createSceneContext } from './scene.js';
import { initializeUIControls } from './ui-controls.js';
import { createWindowBuilder } from './window-builder.js';
import { createMaterialManager } from './materials.js';
import { createARController } from './ar-controller.js';
import { createCadReferenceController } from './cad-reference.js';
import { createProfileController } from './profile-controller.js';
import { createAccessoryController } from './accessory-controller.js';
import { createProfileSelectionController } from './profile-selection-controller.js';
import {
    createWindowLayoutController,
    getWindowLayoutRequest,
} from './window-layout-controller.js';
import { resolveLegacyProfileSelection } from './profile-compatibility.js';
import { createProfileSelectionSignature } from './profile-composition.js';
import { createWindowLayoutOverlay } from './window-layout-overlay.js';
import { createWindowSummaryController } from './window-summary.js';

const pageParams = new URLSearchParams(window.location.search);
const APP_BUILD = document.querySelector('meta[name="app-build"]')?.content || 'unknown';
const isARMode = pageParams.get('ar') === '1';
const captureMode = pageParams.get('capture') === '1';

const requestedCadAssemblyId = pageParams.get('cad_assembly')
    || pageParams.get('cadAssembly');
const requestedProfileSelection = {
    ...resolveLegacyProfileSelection({
        profileSetId: pageParams.get('profile'),
        outerFrameProfileId: pageParams.get('outer_frame')
            || pageParams.get('outer_frame_profile'),
        sashProfileId: pageParams.get('sash_profile'),
    }),
    cadAssemblyId: requestedCadAssemblyId,
};
const requestedProfile = requestedProfileSelection.profileSetId;
const requestedWindowLayoutSelection = getWindowLayoutRequest({
    window_layout: pageParams.get('window_layout') || pageParams.get('layout'),
    window_state: pageParams.get('window_state') || pageParams.get('layout_state'),
    divider_profile: pageParams.get('divider_profile') || pageParams.get('mullion_profile'),
    trans_profile: pageParams.get('trans_profile'),
});
const requestedActiveParts = pageParams.has('parts')
    ? new Set(pageParams.get('parts').split(',').filter(Boolean))
    : null;

const parseBoundedNumber = (value, fallback, min, max) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

let selectedHandleSide = 'right';

if (isARMode) {
    const width = parseBoundedNumber(
        pageParams.get('w'),
        WINDOW_WIDTH_MAX_M,
        WINDOW_WIDTH_MIN_M,
        WINDOW_WIDTH_MAX_M
    );
    const height = parseBoundedNumber(
        pageParams.get('h'),
        1.5,
        WINDOW_HEIGHT_MIN_M,
        WINDOW_HEIGHT_MAX_M
    );
    const mode = pageParams.get('mode') === 'oscilo' ? 'oscilo' : 'batant';
    const maxAngle = mode === 'batant' ? 80 : 15;
    const angle = parseBoundedNumber(pageParams.get('angle'), 0, 0, maxAngle);

    document.getElementById('cadProfile').value = requestedCadAssemblyId || requestedProfile;
    document.getElementById('outerFrameProfile').value = requestedProfileSelection.outerFrameProfileId;
    document.getElementById('sashProfile').value = requestedProfileSelection.sashProfileId;
    document.getElementById('widthA').value = String(width);
    document.getElementById('heightB').value = String(height);
    document.getElementById('mBatant').checked = mode === 'batant';
    document.getElementById('mOscilo').checked = mode === 'oscilo';
    document.getElementById('openAngle').value = String(angle);
    document.getElementById('cExplode').checked = pageParams.get('explode') === '1';
    const glassThickness = parseBoundedNumber(
        pageParams.get('glass_thickness'),
        24,
        16,
        29
    );
    document.getElementById('glassThickness').value = String(glassThickness);
    const handleSide = pageParams.get('handle_side') === 'left' ? 'left' : 'right';
    selectedHandleSide = handleSide;
}


const requestedWidth = Number.parseFloat(pageParams.get('width'));
const requestedHeight = Number.parseFloat(pageParams.get('height'));
const requestedColour = pageParams.get('colour');
const requestedGlassThickness = Number.parseFloat(
    pageParams.get('glass_thickness') || pageParams.get('glassThickness')
);

window.CONFIGURATOR_READY = false;
window.LAST_APPLIED_CONFIGURATION = null;

if (captureMode) {
    document.body.classList.add('capture-mode');
}

const widthInput = document.getElementById('widthA');
const heightInput = document.getElementById('heightB');
const profileInput = document.getElementById('cadProfile');
const outerFrameInput = document.getElementById('outerFrameProfile');
const sashInput = document.getElementById('sashProfile');
const windowLayoutInput = document.getElementById('windowLayout');
const dividerProfileInput = document.getElementById('dividerProfile');
const transProfileInput = document.getElementById('transProfile');
const glassThicknessInput = document.getElementById('glassThickness');
const glassThicknessLabel = document.getElementById('valGlassThickness');
const cadReferenceButton = document.getElementById('cad-reference-button');
const cadReferenceModal = document.getElementById('cad-reference-modal');

if (Number.isFinite(requestedWidth)) {
    widthInput.value = String(
        Math.min(WINDOW_WIDTH_MAX_M, Math.max(WINDOW_WIDTH_MIN_M, requestedWidth))
    );
}
if (Number.isFinite(requestedHeight)) {
    heightInput.value = String(
        Math.min(WINDOW_HEIGHT_MAX_M, Math.max(WINDOW_HEIGHT_MIN_M, requestedHeight))
    );
}
if (requestedProfile) {
    profileInput.value = requestedCadAssemblyId || requestedProfile;
}
if (requestedProfileSelection.outerFrameProfileId) {
    outerFrameInput.value = requestedProfileSelection.outerFrameProfileId;
}
if (requestedProfileSelection.sashProfileId) {
    sashInput.value = requestedProfileSelection.sashProfileId;
}
const requestedHandleSide = pageParams.get('handle_side') || pageParams.get('handleSide');
if (requestedHandleSide === 'left' || requestedHandleSide === 'right') {
    selectedHandleSide = requestedHandleSide;
}

if (Number.isFinite(requestedGlassThickness)) {
    glassThicknessInput.value = String(
        Math.min(29, Math.max(16, requestedGlassThickness))
    );
}

function syncModeButtons() {
    const isBatant = document.getElementById('mBatant').checked;
    const btnBatant = document.getElementById('btnModeBatant');
    const btnOscilo = document.getElementById('btnModeOscilo');
    if (btnBatant && btnOscilo) {
        if (isBatant) {
            btnBatant.classList.add('active');
            btnOscilo.classList.remove('active');
        } else {
            btnOscilo.classList.add('active');
            btnBatant.classList.remove('active');
        }
    }

    const openAngleInput = document.getElementById('openAngle');
    if (openAngleInput) {
        const currentVal = parseFloat(openAngleInput.value) || 0;
        if (isBatant) {
            openAngleInput.max = "80";
            openAngleInput.value = String(Math.min(80, Math.max(0, currentVal)));
        } else {
            openAngleInput.max = "15";
            openAngleInput.value = String(Math.min(15, Math.max(0, currentVal)));
        }
    }
}
syncModeButtons();




// SCENE, CAMERA, RENDERER, CONTROLS, GROUND & LIGHTING
const {
    scene,
    camera,
    renderer,
    controls,
    ground,
    gridHelper,
} = createSceneContext({
    container: document.getElementById('canvas-container'),
    isARMode,
    captureMode,
});

const initialExplodedState =
    (isARMode && pageParams.get('explode') === '1')
    || document.getElementById('cExplode').checked;
let windowBuilder = null;
let profileController = null;
let profileSelectionController = null;
let windowLayoutController = null;
let windowLayoutOverlay = null;
let arController = null;
let windowSummaryController = null;

const componentSelection = createComponentSelection({
    renderer,
    camera,
    enabled: !isARMode && !captureMode,
    isSelectionEnabled: () =>
        windowBuilder?.getIsExploded() ?? initialExplodedState,
});

// MATERIALS AND ALUMINUM FINISH STATE
const materialManager = createMaterialManager({
    captureMode,
    pageParams,
    requestedColour,
    getProfilesData: () => profileController?.getProfilesData() ?? [],
    hasCurrentMetadata: () => profileController?.hasCurrentMetadata() ?? false,
    invalidateSectionSamples: () => windowBuilder?.invalidateSectionSamples(),
    renderGroupFilters: () => profileController?.renderGroupFilters(),
    buildWindow: () => windowBuilder?.buildWindow(),
});

const {
    glassMat,
    handleMat,
    resolveDisplayColour,
    makeColourIndicatorBackground,
    setColourIndicatorBackground,
    getMaterialForProfile,
    isDrainageCoverCap,
} = materialManager;

const accessoryController = createAccessoryController({
    pageParams,
    isARMode,
    requestedActiveParts,
    getCurrentProfileSetId: () => profileSelectionController?.getCurrentProfileSetId()
        || profileInput.value,
    getOuterFrameProfileId: () => profileSelectionController?.getOuterFrameProfileId()
        || outerFrameInput.value,
    getSashProfileId: () => profileSelectionController?.getSashProfileId()
        || sashInput.value,
    getProfilesData: () => profileController?.getProfilesData() ?? [],
    getResolvedAccessoryProfileId: groupId => (
        groupId === 'inner-glazing-gasket'
            ? profileController?.getActiveGasketCode()
            : null
    ),
    isProfileGroupVisible: profile =>
        profileController?.isProfileGroupVisible(profile) ?? true,
    buildWindow: () => windowBuilder?.buildWindow(),
    onStateChange: ({ source } = {}) => {
        profileController?.updateColorFilterToggles();
        if (source !== 'cad-assembly' && source !== 'configuration') {
            profileSelectionController?.markCustomCadAssembly();
        }
    },
});

const cadReferenceController = createCadReferenceController({
    captureMode,
    isARMode,
    profileInput,
    getProfileSetId: () => profileSelectionController?.getCurrentProfileSetId()
        || requestedProfile,
    button: cadReferenceButton,
    modal: cadReferenceModal,
    status: document.getElementById('cad-reference-status'),
    content: document.getElementById('cad-reference-content'),
    mainImage: document.getElementById('cad-reference-main-image'),
    thumbnails: document.getElementById('cad-reference-thumbnails'),
    subtitle: document.getElementById('cad-reference-subtitle'),
});

profileController = createProfileController({
    isARMode,
    requestedActiveParts,
    glassThicknessInput,
    renderer,
    scene,
    camera,
    loadingElement: document.getElementById('loading'),
    resolveDisplayColour,
    makeColourIndicatorBackground,
    setColourIndicatorBackground,
    getMaterialForProfile,
    isDrainageCoverCap,
    getWindowBuilder: () => windowBuilder,
    getARController: () => arController,
    refreshCadReferenceAvailability: cadReferenceController.refreshAvailability,
    initializeAccessoryProfiles: accessoryController.initializeProfiles,
    isManagedAccessoryProfile: accessoryController.isManagedAccessoryProfile,
    isAccessoryProfileEnabled: accessoryController.isProfileEnabled,
    setAccessoryProfileEnabled: accessoryController.setAccessoryProfileEnabled,
    setAccessoryProfilesEnabled: accessoryController.setAccessoryProfilesEnabled,
});

profileSelectionController = createProfileSelectionController({
    profileSetInput: profileInput,
    outerFrameInput,
    sashInput,
    initialSelection: requestedProfileSelection,
    loadProfiles: selection => profileController.loadProfileSelection({
        ...selection,
        ...windowLayoutController?.getConfigurationSnapshot(),
    }),
    onCadAssemblyPresetSelected: async ({ accessoryPresetId }) => {
        await windowLayoutController?.setLayout('single', { notify: false });
        accessoryController.setAccessoryPreset(accessoryPresetId, {
            rebuild: false,
            source: 'cad-assembly',
        });
    },
});

windowLayoutController = createWindowLayoutController({
    layoutInput: windowLayoutInput,
    dividerProfileInput,
    transProfileInput,
    initialSelection: requestedWindowLayoutSelection,
    onLayoutChange: async (layoutSelection, { reloadDivider = false, reloadTrans = false, topologyOnly = false } = {}) => {
        profileSelectionController?.markCustomCadAssembly();
        if (
            topologyOnly
            && !reloadDivider
            && !reloadTrans
            && profileController.getCurrentMetadata()?.dividerConnectionCatalogReady
            && (
                !(layoutSelection.topology?.transSegments?.length)
                || (
                    profileController.getCurrentMetadata()?.transConnectionReady
                    && profileController.getCurrentMetadata()?.transProfileId === layoutSelection.transProfileId
                )
            )
        ) {
            windowBuilder?.buildWindow();
            return;
        }
        await profileController.loadProfileSelection({
            ...profileSelectionController.getConfigurationSnapshot(),
            ...layoutSelection,
        });
    },
});

const {
    isGlazingBeadProfile,
    getProfileGroup,
    isProfileGroupVisible,
    getProfileShape,
    getProfileCadXShiftMm,
    getProfileCadYShiftMm,
    getProfileCadPointMm,
    getActiveGlazingBeadCode,
    getActiveGasketCode,
    getProfileComponentNumber,
    getEffectiveProfileBbox,
    getGlazingBeadArmShiftMm,
    updateGlazingBeadToggleLabels,
    updateGasketToggleLabels,
    updateComponentPictures,
} = profileController;

windowBuilder = createWindowBuilder({
    scene,
    camera,
    renderer,
    ground,
    gridHelper,
    isARMode,
    captureMode,
    pageParams,
    componentSelection,
    glassMat,
    handleMat,
    profileInput,
    glassThicknessInput,
    glassThicknessLabel,
    isGlazingBeadProfile,
    getProfileGroup,
    getProfileShape,
    getProfileCadXShiftMm,
    getProfileCadYShiftMm,
    getProfileCadPointMm,
    getActiveGlazingBeadCode,
    getActiveGasketCode,
    getProfileComponentNumber,
    getEffectiveProfileBbox,
    updateComponentPictures,
    getFinishState: materialManager.getFinishState,
    getSelectedHandleSide: () => selectedHandleSide,
    onGlassClick: ({ cellId }) => windowLayoutOverlay?.openCellWheel(cellId),
    onFabricationSnapshot: snapshot => windowSummaryController?.update(snapshot),
    isProfileEnabled: accessoryController.isProfileEnabled,
    canPlaceProfileOnSide: accessoryController.canPlaceProfileOnSide,
    getWindowLayoutState: () => windowLayoutController?.getConfigurationSnapshot() || {
        layoutId: 'single',
        dividerOrientation: null,
        dividerProfileId: null,
    },
});

const {
    placementRoot,
    mainGroup,
    sectionGroup,
    buildWindow,
    applyCurrentPoseInstantly,
} = windowBuilder;

windowSummaryController = createWindowSummaryController({
    getProfileSelection: () => profileSelectionController?.getConfigurationSnapshot() || {},
    getLayoutSelection: () => windowLayoutController?.getConfigurationSnapshot() || {},
    getActiveGlazingBeadCode,
});

windowLayoutOverlay = createWindowLayoutOverlay({
    container: document.getElementById('canvas-container'),
    camera,
    mainGroup,
    getWindowLayoutState: () => windowLayoutController?.getConfigurationSnapshot(),
    getWidth: () => Number(widthInput?.value) || 1,
    getHeight: () => Number(heightInput?.value) || 1,
    getSelectedHandleSide: () => selectedHandleSide,
    onAddWindow: (cellId, direction, type, handleSide, edge = {}) =>
        windowLayoutController.addWindow(cellId, direction, type, {
            handleSide,
            start: edge.start,
            end: edge.end,
        }),
    onMergeWindows: (cellAId, cellBId, type, handleSide) =>
        windowLayoutController.mergeWindows(cellAId, cellBId, type, { handleSide }),
    onSetTransWindows: (cellAId, cellBId, enabled, ownerCellId) =>
        windowLayoutController.setTransBetweenWindows(cellAId, cellBId, { enabled, ownerCellId }),
    onSetWindowType: (cellId, type, handleSide) =>
        windowLayoutController.setWindowType(cellId, type, { handleSide }),
    onUnmergeWindow: cellId => windowLayoutController.unmergeWindow(cellId),
    enabled: !isARMode && !captureMode,
    getEditableTopologyGeometry: () => windowBuilder?.getEditableTopologyGeometry?.(),
});

arController = createARController({
    appBuild: APP_BUILD,
    isARMode,
    renderer,
    camera,
    placementRoot,
    mainGroup,
    applyCurrentPoseInstantly,
    materialManager,
    getProfilesReady: profileController.getProfilesReady,
    getProfilesData: profileController.getProfilesData,
    getSelectedHandleSide: () => selectedHandleSide,
    appendAccessoryUrlParams: accessoryController.appendUrlParams,
    appendProfileSelectionUrlParams: profileSelectionController.appendUrlParams,
    appendWindowLayoutUrlParams: windowLayoutController.appendUrlParams,
});

window.applyConfiguration = async function applyConfiguration(configuration) {
    window.CONFIGURATOR_READY = false;
    window.LAST_APPLIED_CONFIGURATION = null;

    if (typeof configuration.widthM === 'number' && Number.isFinite(configuration.widthM)) {
        widthInput.value = String(
            Math.min(WINDOW_WIDTH_MAX_M, Math.max(WINDOW_WIDTH_MIN_M, configuration.widthM))
        );
    }
    if (typeof configuration.heightM === 'number' && Number.isFinite(configuration.heightM)) {
        heightInput.value = String(
            Math.min(WINDOW_HEIGHT_MAX_M, Math.max(WINDOW_HEIGHT_MIN_M, configuration.heightM))
        );
    }
    if (
        typeof configuration.glassThicknessMm === 'number'
        && Number.isFinite(configuration.glassThicknessMm)
    ) {
        glassThicknessInput.value = String(
            Math.min(29, Math.max(16, configuration.glassThicknessMm))
        );
    }
    if (configuration.openingMode === 'batant' || configuration.openingMode === 'oscilo') {
        document.getElementById('mBatant').checked = configuration.openingMode === 'batant';
        document.getElementById('mOscilo').checked = configuration.openingMode === 'oscilo';
        syncModeButtons();
    }
    if (Number.isFinite(Number(configuration.openAngle))) {
        const angleInput = document.getElementById('openAngle');
        const max = document.getElementById('mBatant').checked ? 80 : 15;
        angleInput.value = String(Math.min(max, Math.max(0, Number(configuration.openAngle))));
    }
    if (configuration.handleSide === 'left' || configuration.handleSide === 'right') {
        selectedHandleSide = configuration.handleSide;
    }
    if (typeof configuration.exploded === 'boolean') {
        document.getElementById('cExplode').checked = configuration.exploded;
    }
    if (typeof configuration.showHouse === 'boolean') {
        document.getElementById('cShowHouse').checked = configuration.showHouse;
    }
    if (configuration.frameSides && typeof configuration.frameSides === 'object') {
        ['top', 'bottom', 'left', 'right'].forEach((side) => {
            if (typeof configuration.frameSides[side] === 'boolean') {
                document.getElementById(`side_${side}`).checked = configuration.frameSides[side];
            }
        });
    }
    if (typeof configuration.sectionView === 'boolean') {
        document.getElementById('toggleSectionViewBtn')?.classList.toggle('active', configuration.sectionView);
        sectionGroup.visible = configuration.sectionView;
    }

    materialManager.applyConfiguration(configuration);

    const selectedLayout = await windowLayoutController.applyConfiguration(
        configuration,
        { notify: false }
    );
    const selectedProfiles = await profileSelectionController.applyConfiguration(
        configuration,
        { reload: false }
    );
    const combinedProfileSelection = {
        ...selectedProfiles,
        ...selectedLayout,
    };
    combinedProfileSelection.selectionSignature = createProfileSelectionSignature(
        combinedProfileSelection
    );
    accessoryController.applyConfiguration(configuration, {
        rebuild: false,
        source: 'configuration',
    });
    const mustReloadProfile = !profileController.hasCurrentMetadata()
        || profileController.getCurrentSelectionSignature()
            !== combinedProfileSelection.selectionSignature;

    if (mustReloadProfile) {
        await profileController.loadProfileSelection(combinedProfileSelection);
    } else {
        await profileController.refreshProfileMaterials();
    }

    const selectedProfileSet = profileSelectionController.getConfigurationSnapshot();
    const expectedAccessoryPresetId = String(selectedProfileSet.profileVariantCode || '')
        .trim()
        .toLowerCase();
    if (
        selectedProfileSet.cadAssemblyId !== 'custom'
        && (
            !accessoryController.matchesPreset(expectedAccessoryPresetId)
            || selectedLayout.layoutId !== 'single'
        )
    ) {
        profileSelectionController.markCustomCadAssembly();
    }

    const applied = {
        requestToken: String(configuration.requestToken || ''),
        widthM: Number(widthInput.value),
        heightM: Number(heightInput.value),
        ...materialManager.getConfigurationSnapshot(),
        ...accessoryController.getConfigurationSnapshot(),
        ...profileSelectionController.getConfigurationSnapshot(),
        ...windowLayoutController.getConfigurationSnapshot(),
        glassThicknessMm: Number(glassThicknessInput.value),
        glazingBeadCode: getActiveGlazingBeadCode(),
        glazingGasket224378ShiftMm: getGlazingBeadArmShiftMm('top'),
        glassAnchorGasket: '224063',
        movingGlassSideGasket: '224378',
        openingMode: document.getElementById('mBatant').checked ? 'batant' : 'oscilo',
        openAngle: Number(document.getElementById('openAngle').value) || 0,
        handleSide: selectedHandleSide,
        exploded: Boolean(document.getElementById('cExplode').checked),
        showHouse: Boolean(document.getElementById('cShowHouse').checked),
        frameSides: {
            top: Boolean(document.getElementById('side_top').checked),
            bottom: Boolean(document.getElementById('side_bottom').checked),
            left: Boolean(document.getElementById('side_left').checked),
            right: Boolean(document.getElementById('side_right').checked),
        },
        sectionView: Boolean(document.getElementById('toggleSectionViewBtn')?.classList.contains('active')),
    };

    windowBuilder.setExploded(Boolean(applied.exploded));
    window.LAST_APPLIED_CONFIGURATION = applied;
    window.CONFIGURATOR_READY = true;
    return applied;
};

function captureWindowConfiguration() {
    return {
        widthM: Number(widthInput.value),
        heightM: Number(heightInput.value),
        ...materialManager.getConfigurationSnapshot(),
        ...accessoryController.getConfigurationSnapshot(),
        ...profileSelectionController.getConfigurationSnapshot(),
        ...windowLayoutController.getConfigurationSnapshot(),
        glassThicknessMm: Number(glassThicknessInput.value),
        glazingBeadCode: getActiveGlazingBeadCode(),
        glazingGasket224378ShiftMm: getGlazingBeadArmShiftMm('top'),
        glassAnchorGasket: '224063',
        movingGlassSideGasket: '224378',
        openingMode: document.getElementById('mBatant').checked ? 'batant' : 'oscilo',
        openAngle: Number(document.getElementById('openAngle').value) || 0,
        handleSide: selectedHandleSide,
        exploded: Boolean(document.getElementById('cExplode').checked),
        showHouse: Boolean(document.getElementById('cShowHouse').checked),
        frameSides: {
            top: Boolean(document.getElementById('side_top').checked),
            bottom: Boolean(document.getElementById('side_bottom').checked),
            left: Boolean(document.getElementById('side_left').checked),
            right: Boolean(document.getElementById('side_right').checked),
        },
        sectionView: Boolean(document.getElementById('toggleSectionViewBtn')?.classList.contains('active')),
    };
}

window.WINDOW_CONFIGURATOR_API = {
    captureState: captureWindowConfiguration,
    restoreState: (snapshot) => window.applyConfiguration(snapshot),
};

// ANIMATION & LOOP
function renderFrame(_time, xrFrame) {
    windowBuilder.updatePoseAnimation();

    if (isARMode) {
        arController.updateARPlacement(xrFrame);
    } else if (!captureMode) {
        controls.update();
        windowLayoutOverlay?.update();
    }
    renderer.render(scene, camera);
}


initializeUIControls({
    widthInput,
    heightInput,
    glassThicknessInput,
    glassThicknessLabel,
    cadReferenceButton,
    cadReferenceModal,
    sectionGroup,
    camera,
    renderer,
    componentSelection,
    buildWindow,
    syncModeButtons,
    setExploded: (value) => {
        windowBuilder.setExploded(value);
    },
    setSelectedHandleSide: (value) => {
        selectedHandleSide = value;
    },
    getActiveGlazingBeadCode,
    getActiveGasketCode,
    updateGlazingBeadToggleLabels,
    updateGasketToggleLabels,
    updateComponentPictures,
    openCadReferenceModal: cadReferenceController.openModal,
    closeCadReferenceModal: cadReferenceController.closeModal,
    setSelectedARPlatform: arController.setSelectedARPlatform,
    openQRModal: arController.openQRModal,
    closeQRModal: arController.closeQRModal,
    downloadLatestARAsset: arController.downloadLatestARAsset,
    checkLatestStaticModel: arController.checkLatestStaticModel,
    startAR: arController.startAR,
});

profileSelectionController.initializeControls();
windowLayoutController.initializeControls();
materialManager.initializeControls();
accessoryController.initializeControls({
    presetInput: document.getElementById('accessoryPreset'),
    presetDescription: document.getElementById('accessoryPresetDescription'),
    container: document.getElementById('accessoryOptions'),
});
glassThicknessInput?.addEventListener('input', () => {
    accessoryController.syncControls('inner-glazing-gasket');
});

// Load the selected profile. In QR AR mode the selection comes from URL parameters.
profileController.loadProfileSelection({
    ...profileSelectionController.getConfigurationSnapshot(),
    ...windowLayoutController.getConfigurationSnapshot(),
}).then(() => {
    const selection = profileSelectionController.getConfigurationSnapshot();
    const expectedAccessoryPresetId = String(selection.profileVariantCode || '')
        .trim()
        .toLowerCase();
    if (
        selection.cadAssemblyId !== 'custom'
        && (
            !accessoryController.matchesPreset(expectedAccessoryPresetId)
            || windowLayoutController.getLayoutId() !== 'single'
        )
    ) {
        profileSelectionController.markCustomCadAssembly();
    }
});
renderer.setAnimationLoop(renderFrame);
