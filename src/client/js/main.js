import {
    allowedProfiles,
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

const pageParams = new URLSearchParams(window.location.search);
const APP_BUILD = document.querySelector('meta[name="app-build"]')?.content || 'unknown';
const isARMode = pageParams.get('ar') === '1';
const captureMode = pageParams.get('capture') === '1';

const requestedProfileValue = pageParams.get('profile') || '2_4_Oeffnungselemnt_Vertikal';
const requestedProfile = allowedProfiles.has(requestedProfileValue)
    ? requestedProfileValue
    : '2_4_Oeffnungselemnt_Vertikal';
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

    document.getElementById('cadProfile').value = requestedProfile;
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
if (requestedProfile && [...profileInput.options].some(option => option.value === requestedProfile)) {
    profileInput.value = requestedProfile;
}
const requestedHandleSide = pageParams.get('handle_side') || pageParams.get('handleSide');
if (requestedHandleSide === 'left' || requestedHandleSide === 'right') {
    selectedHandleSide = requestedHandleSide;
}
if (selectedHandleSide === 'left') {
    document.getElementById('btnHandleLeft')?.classList.add('active');
    document.getElementById('btnHandleRight')?.classList.remove('active');
} else {
    document.getElementById('btnHandleRight')?.classList.add('active');
    document.getElementById('btnHandleLeft')?.classList.remove('active');
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
let arController = null;

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

const cadReferenceController = createCadReferenceController({
    captureMode,
    isARMode,
    profileInput,
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
});

const {
    isGlazingBeadProfile,
    getProfileGroup,
    getProfileShape,
    getProfileCadXShiftMm,
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
    getActiveGlazingBeadCode,
    getActiveGasketCode,
    getProfileComponentNumber,
    getEffectiveProfileBbox,
    updateComponentPictures,
    getFinishState: materialManager.getFinishState,
    getSelectedHandleSide: () => selectedHandleSide,
});

const {
    placementRoot,
    mainGroup,
    sectionGroup,
    buildWindow,
    applyCurrentPoseInstantly,
} = windowBuilder;

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

    materialManager.applyConfiguration(configuration);

    const requestedProfileName = configuration.profile && [...profileInput.options].some(option => option.value === configuration.profile)
        ? configuration.profile
        : profileInput.value;

    const mustReloadProfile = profileInput.value !== requestedProfileName
        || !profileController.hasCurrentMetadata();
    profileInput.value = requestedProfileName;

    if (mustReloadProfile) {
        await profileController.loadProfiles(requestedProfileName);
    } else {
        await profileController.refreshProfileMaterials();
    }

    const applied = {
        requestToken: String(configuration.requestToken || ''),
        widthM: Number(widthInput.value),
        heightM: Number(heightInput.value),
        ...materialManager.getConfigurationSnapshot(),
        profile: profileInput.value,
        glassThicknessMm: Number(glassThicknessInput.value),
        glazingBeadCode: getActiveGlazingBeadCode(),
        glazingGasket224378ShiftMm: getGlazingBeadArmShiftMm('top'),
        glassAnchorGasket: '224063',
        movingGlassSideGasket: '224378',
    };

    window.LAST_APPLIED_CONFIGURATION = applied;
    window.CONFIGURATOR_READY = true;
    return applied;
};

// ANIMATION & LOOP
function renderFrame(_time, xrFrame) {
    windowBuilder.updatePoseAnimation();

    if (isARMode) {
        arController.updateARPlacement(xrFrame);
    } else if (!captureMode) {
        controls.update();
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
    loadProfiles: profileController.loadProfiles,
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

materialManager.initializeControls();

// Load the selected profile. In QR AR mode the selection comes from URL parameters.
profileController.loadProfiles(
    isARMode ? requestedProfile : '2_4_Oeffnungselemnt_Vertikal'
);
renderer.setAnimationLoop(renderFrame);
