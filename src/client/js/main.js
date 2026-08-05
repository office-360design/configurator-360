import * as THREE from 'three';
import {
    allowedProfiles,
    WINDOW_WIDTH_MIN_M,
    WINDOW_WIDTH_MAX_M,
    WINDOW_HEIGHT_MIN_M,
    WINDOW_HEIGHT_MAX_M,
    getGlazingBeadCode,
} from './config.js';
import { createComponentSelection } from './component-selection.js';
import { createSceneContext } from './scene.js';
import { createProfileLoader } from './profile-loader.js';
import { initializeUIControls } from './ui-controls.js';
import { createWindowBuilder } from './window-builder.js';
import { createMaterialManager } from './materials.js';
import { createARController } from './ar-controller.js';

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
const cadReferenceStatus = document.getElementById('cad-reference-status');
const cadReferenceContent = document.getElementById('cad-reference-content');
const cadReferenceMainImage = document.getElementById('cad-reference-main-image');
const cadReferenceThumbnails = document.getElementById('cad-reference-thumbnails');
const cadReferenceSubtitle = document.getElementById('cad-reference-subtitle');

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

const componentSelection = createComponentSelection({
    renderer,
    camera,
    enabled: !isARMode && !captureMode,
    isSelectionEnabled: () =>
        windowBuilder?.getIsExploded() ?? initialExplodedState,
});

// MATERIALS AND ALUMINUM FINISH STATE
let currentMetadata = null;
let profilesData = [];
let profilesReady = false;

const materialManager = createMaterialManager({
    captureMode,
    pageParams,
    requestedColour,
    getProfilesData: () => profilesData,
    hasCurrentMetadata: () => Boolean(currentMetadata),
    invalidateSectionSamples: () => windowBuilder?.invalidateSectionSamples(),
    renderGroupFilters,
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

// LOAD PROFILE SVG FILES AND METADATA
const { getProfileDefinition } = createProfileLoader();

function isGlazingBeadProfile(profile) {
    const name = String(profile.blockName || '');
    return /5739(?:20|30|40)/.test(name) || profile.isGlazingBeadTemplate === true;
}

function getProfileGroup(profile) {
    if (profile.role === 'frame') {
        return 'frame';
    }

    const blockName = String(profile.blockName || '').toLowerCase();
    if (
        profile.role === 'sash'
        && (
            isGlazingBeadProfile(profile)
            || blockName.includes('244511')
            || blockName.includes('224378')
        )
    ) {
        return 'bead';
    }

    return 'sash';
}

function isGlazingBeadChild(profile) {
    return String(profile.blockName || '').includes('244511');
}

function getActiveGlazingBeadCode() {
    return getGlazingBeadCode(Number(glassThicknessInput?.value) || 24);
}

function getActiveGasketCode() {
    const thickness = Number(glassThicknessInput?.value) || 24;
    const rem = thickness % 5;

    if (rem === 0) {
        return '224379';
    }
    if (rem === 1 || rem === 2) {
        return '224378';
    }
    return '224350';
}

function getProfileShape(profile) {
    if (profile.isGlazingBeadTemplate && profile.beadShapes) {
        return profile.beadShapes[getActiveGlazingBeadCode()] || profile.shape;
    }
    if (profile.isGasketTemplate && profile.gasketShapes) {
        return profile.gasketShapes[getActiveGasketCode()] || profile.shape;
    }
    return profile.shape;
}

const shapeBoundsCache = new WeakMap();

function getShapeBounds(shape) {
    if (!shape) return null;

    if (shapeBoundsCache.has(shape)) {
        return shapeBoundsCache.get(shape);
    }

    const points = shape.getPoints(64);
    if (!points.length) return null;

    const bounds = new THREE.Box2();
    bounds.setFromPoints(points);
    shapeBoundsCache.set(shape, bounds);
    return bounds;
}

const glazingBeadArmShiftCache = new Map();

function getGlazingBeadArmShiftMm(section = 'top') {
    const activeCode = getActiveGlazingBeadCode();
    const cacheKey = `${section}:${activeCode}`;

    if (glazingBeadArmShiftCache.has(cacheKey)) {
        return glazingBeadArmShiftCache.get(cacheKey);
    }

    const template = profilesData.find(profile =>
        profile.isGlazingBeadTemplate
        && profile.section === section
    );

    if (!template?.beadShapes) {
        return 0;
    }

    const referenceShape = template.beadShapes['573940'] || template.shape;
    const activeShape = template.beadShapes[activeCode] || referenceShape;

    const referenceBounds = getShapeBounds(referenceShape);
    const activeBounds = getShapeBounds(activeShape);

    if (!referenceBounds || !activeBounds) {
        return 0;
    }

    const shiftMm = activeBounds.min.x - referenceBounds.min.x;
    glazingBeadArmShiftCache.set(cacheKey, shiftMm);
    return shiftMm;
}

function getProfileCadXShiftMm(profile) {
    const blockName = String(profile.blockName || '');

    if (blockName.includes('224378') || profile.isGasketTemplate) {
        return getGlazingBeadArmShiftMm(profile.section || 'top');
    }

    return 0;
}

function getEffectiveProfileBbox(profile) {
    if (!profile?.bbox) return null;

    const shiftX = getProfileCadXShiftMm(profile);
    return {
        minX: Number(profile.bbox.minX) + shiftX,
        maxX: Number(profile.bbox.maxX) + shiftX,
        minY: Number(profile.bbox.minY),
        maxY: Number(profile.bbox.maxY),
    };
}

function getDisplayedBlockName(profile) {
    if (profile.isGlazingBeadTemplate) {
        const suffix = profile.section === 'bottom' ? '_s_inst1' : '_s';
        return `${getActiveGlazingBeadCode()}${suffix}`;
    }
    if (profile.isGasketTemplate) {
        const suffix = profile.section === 'bottom' ? '_s_8_inst1' : '_s_8';
        return `${getActiveGasketCode()}${suffix}`;
    }
    return profile.blockName;
}

function getProfileComponentNumber(profile) {
    const displayedName = String(getDisplayedBlockName(profile) || profile.blockName || '');
    return displayedName.match(/\d+/)?.[0] || displayedName || `Part ${profile.index}`;
}

function getDisplayedParentBlock(profile) {
    if (isGlazingBeadChild(profile)) {
        return `${getActiveGlazingBeadCode()}_s`;
    }
    return profile.parentBlock;
}

function updateGlazingBeadToggleLabels() {
    profilesData.forEach(profile => {
        if (!profile.isGlazingBeadTemplate && !isGlazingBeadChild(profile)) {
            return;
        }

        const checkbox = document.getElementById(`toggle_${profile.index}`);
        const item = checkbox?.closest('.part-toggle-item');
        const textContainer = item?.querySelector(':scope > span');
        if (!textContainer) return;

        const colorDot = textContainer.querySelector('.part-color-dot');
        const displayedBlockName = getDisplayedBlockName(profile);
        const displayedParentBlock = getDisplayedParentBlock(profile);
        const labelText = displayedParentBlock
            ? `${displayedParentBlock} / ${displayedBlockName}`
            : displayedBlockName;

        textContainer.textContent = '';
        let dot = colorDot;
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'part-color-dot';
        }
        setColourIndicatorBackground(dot, resolveDisplayColour(profile));
        textContainer.appendChild(dot);
        textContainer.appendChild(document.createTextNode(labelText));
    });
}

function updateGasketToggleLabels() {
    profilesData.forEach(profile => {
        if (!profile.isGasketTemplate) {
            return;
        }

        const checkbox = document.getElementById(`toggle_${profile.index}`);
        const item = checkbox?.closest('.part-toggle-item');
        const textContainer = item?.querySelector(':scope > span');
        if (!textContainer) return;

        const colorDot = textContainer.querySelector('.part-color-dot');
        const displayedBlockName = getDisplayedBlockName(profile);
        const labelText = displayedBlockName;

        textContainer.textContent = '';
        let dot = colorDot;
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'part-color-dot';
        }
        setColourIndicatorBackground(dot, resolveDisplayColour(profile));
        textContainer.appendChild(dot);
        textContainer.appendChild(document.createTextNode(labelText));
    });
}

function updateComponentPictures() {
    const beadCode = getActiveGlazingBeadCode();
    const gasketCode = getActiveGasketCode();
    const section = document.getElementById('componentPicturesSection');
    const gasketPic = document.getElementById('gasketPic');
    const beadPic = document.getElementById('beadPic');
    const gasketLabel = document.getElementById('gasketLabel');
    const beadLabel = document.getElementById('beadLabel');

    if (!beadCode) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) {
        section.style.display = 'flex';
    }

    const gasketSrc = `icons/gaskets/${gasketCode}.svg`;
    const beadSrc = `icons/glazing_beads/${beadCode}.svg`;

    if (gasketPic) {
        if (gasketPic.getAttribute('data-src') !== gasketSrc) {
            gasketPic.style.opacity = '0';
            setTimeout(() => {
                gasketPic.src = gasketSrc;
                gasketPic.setAttribute('data-src', gasketSrc);
                gasketPic.style.opacity = '1';
            }, 100);
        } else {
            gasketPic.src = gasketSrc;
            gasketPic.style.opacity = '1';
        }
    }

    if (beadPic) {
        if (beadPic.getAttribute('data-src') !== beadSrc) {
            beadPic.style.opacity = '0';
            setTimeout(() => {
                beadPic.src = beadSrc;
                beadPic.setAttribute('data-src', beadSrc);
                beadPic.style.opacity = '1';
            }, 100);
        } else {
            beadPic.src = beadSrc;
            beadPic.style.opacity = '1';
        }
    }

    if (gasketLabel) {
        gasketLabel.textContent = `Gasket: ${gasketCode}`;
    }
    if (beadLabel) {
        beadLabel.textContent = `Bead: ${beadCode}`;
    }
}

function renderPartToggles() {
    const togglesContainer = document.getElementById('part-toggles-container');
    if (!togglesContainer) return;
    togglesContainer.innerHTML = '';

    const groups = {
        frame: { title: 'Frame Components', items: [] },
        sash: { title: 'Sash / Vent Components', items: [] },
        bead: { title: 'Glazing Bead Components', items: [] }
    };

    profilesData.forEach((profile) => {
        const grp = getProfileGroup(profile);
        if (groups[grp]) {
            groups[grp].items.push(profile);
        } else {
            groups.sash.items.push(profile);
        }
    });

    Object.keys(groups).forEach((key) => {
        const grpData = groups[key];
        if (grpData.items.length === 0) return;

        const details = document.createElement('details');
        details.className = 'group-dropdown';
        details.open = false; // Closed by default

        const summary = document.createElement('summary');
        summary.className = 'group-dropdown-header';
        summary.innerHTML = `
            <span style="display: flex; align-items: center; gap: 8px;">
                <span class="caret">▼</span>
                <span>${grpData.title} (${grpData.items.length})</span>
            </span>
            <button class="btn-toggle-all-group" type="button">Toggle All</button>
        `;
        details.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'group-dropdown-content';

        grpData.items.forEach((profile) => {
            const item = document.createElement('div');
            item.className = 'part-toggle-item';

            const colorDot = resolveDisplayColour(profile);
            const displayedBlockName = getDisplayedBlockName(profile);
            const displayedParentBlock = getDisplayedParentBlock(profile);
            const labelText = displayedParentBlock
                ? `${displayedParentBlock} / ${displayedBlockName}`
                : displayedBlockName;
            const isRequestedPartActive = !isARMode
                || requestedActiveParts === null
                || requestedActiveParts.has(String(profile.index));

            item.innerHTML = `
                <span><span class="part-color-dot" style="background-color: ${colorDot};"></span>${labelText}</span>
                <input type="checkbox" id="toggle_${profile.index}" ${isRequestedPartActive ? 'checked' : ''}>
            `;
            content.appendChild(item);
        });

        details.appendChild(content);
        togglesContainer.appendChild(details);

        // Add Toggle All click event listener
        const toggleAllBtn = summary.querySelector('.btn-toggle-all-group');
        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                const allChecked = grpData.items.every((profile) => {
                    const cb = document.getElementById(`toggle_${profile.index}`);
                    return cb ? cb.checked : false;
                });

                grpData.items.forEach((profile) => {
                    const cb = document.getElementById(`toggle_${profile.index}`);
                    if (cb) {
                        cb.checked = !allChecked;
                    }
                });

                buildWindow();
            });
        }

        grpData.items.forEach((profile) => {
            const cb = content.querySelector(`#toggle_${profile.index}`);
            if (cb) {
                cb.addEventListener('change', buildWindow);
            }
        });
    });
}

let renderedColorFilters = [];

function updateColorFilterToggles() {
    renderedColorFilters.forEach(item => {
        const matchingProfiles = profilesData.filter(p => item.filter.match(p));
        if (matchingProfiles.length === 0) return;

        const allActive = matchingProfiles.every(p => {
            const cb = document.getElementById(`toggle_${p.index}`);
            return cb ? cb.checked : true;
        });

        if (item.input) {
            item.input.checked = allActive;
        }
    });
}

function renderGroupFilters() {
    const groupFiltersContainer = document.getElementById('group-filters');
    if (!groupFiltersContainer) return;
    groupFiltersContainer.innerHTML = '';
    renderedColorFilters = [];

    const filterDefinitions = [
        {
            name: 'Frame',
            match: p => p.materialKey === 'alu' && getProfileGroup(p) === 'frame'
        },
        {
            name: 'Sash',
            match: p => p.materialKey === 'alu' && (getProfileGroup(p) === 'sash' || getProfileGroup(p) === 'bead')
        },
        {
            name: 'Gaskets and seals',
            match: p => p.materialKey === 'epdm'
        },
        {
            name: 'Drainage cover cap',
            match: p => isDrainageCoverCap(p)
        },
        {
            name: 'Insulating foam',
            match: p => p.materialKey === 'foam'
        },
        {
            name: 'Insulating bar',
            match: p => p.materialKey === 'iso'
        },
        {
            name: 'Locking bars',
            match: p => p.materialKey === 'centralSeal'
        }
    ];

    const activeFilters = [];

    filterDefinitions.forEach(def => {
        const hasMatchingProfile = profilesData.some(def.match);
        if (hasMatchingProfile) {
            activeFilters.push(def);
        }
    });

    const unmatchedProfiles = profilesData.filter(p => !filterDefinitions.some(def => def.match(p)));
    const unmatchedColors = [...new Set(unmatchedProfiles.map(p => p.baseCadColor))];

    unmatchedColors.forEach(hex => {
        activeFilters.push({
            name: hex.toUpperCase(),
            match: p => p.baseCadColor === hex
        });
    });

    activeFilters.forEach(filter => {
        const row = document.createElement('div');
        row.className = 'category-filter-row';
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 12px; background: rgba(30, 41, 59, 0.4); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);';

        const matchingProfiles = profilesData.filter(p => filter.match(p));
        const indicatorBackground = makeColourIndicatorBackground(matchingProfiles);
        const allActive = matchingProfiles.every(p => {
            const cb = document.getElementById(`toggle_${p.index}`);
            return cb ? cb.checked : true;
        });

        row.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span class="part-color-dot" style="margin-right: 0; width: 8px; height: 8px;"></span>
                <span style="font-weight: 500; color: #e2e8f0;">${filter.name}</span>
            </span>
            <label class="switch">
                <input type="checkbox" class="color-filter-toggle" ${allActive ? 'checked' : ''}>
                <span class="switch-slider"></span>
            </label>
        `;

        setColourIndicatorBackground(
            row.querySelector('.part-color-dot'),
            indicatorBackground
        );

        const toggleInput = row.querySelector('.color-filter-toggle');
        toggleInput.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            profilesData.forEach(p => {
                if (filter.match(p)) {
                    const cb = document.getElementById(`toggle_${p.index}`);
                    if (cb) cb.checked = isChecked;
                }
            });
            buildWindow();
        });

        renderedColorFilters.push({
            filter,
            input: toggleInput
        });

        groupFiltersContainer.appendChild(row);
    });
}

const cadReferenceCache = new Map();
let currentCadReferenceImages = [];

function readableScreenshotName(filename) {
    return filename
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchCadReferenceImages(profileName) {
    if (cadReferenceCache.has(profileName)) {
        return cadReferenceCache.get(profileName);
    }

    try {
        const response = await fetch(
            `/api/cad-screenshots?profile=${encodeURIComponent(profileName)}`,
            { cache: 'no-store' }
        );

        if (response.ok) {
            const payload = await response.json();
            const images = Array.isArray(payload.images) ? payload.images : [];
            cadReferenceCache.set(profileName, images);
            return images;
        }
    } catch (err) {
        console.warn('API call failed, trying static images.json fallback:', err);
    }

    try {
        const staticResponse = await fetch(
            `cad_screenshots/${encodeURIComponent(profileName)}/images.json`
        );
        if (staticResponse.ok) {
            const images = await staticResponse.json();
            cadReferenceCache.set(profileName, images);
            return images;
        }
    } catch (err) {
        console.error('Static images.json fallback failed:', err);
    }

    return [];
}

function selectCadReferenceImage(image, button) {
    cadReferenceMainImage.src = image.url;
    cadReferenceMainImage.alt = `CAD section reference: ${readableScreenshotName(image.filename)}`;

    cadReferenceThumbnails
        .querySelectorAll('.cad-reference-thumb')
        .forEach(item => item.classList.remove('active'));

    button?.classList.add('active');
}

function renderCadReferenceGallery(images) {
    cadReferenceThumbnails.innerHTML = '';

    images.forEach((image, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cad-reference-thumb';

        const thumbnail = document.createElement('img');
        thumbnail.src = image.url;
        thumbnail.alt = '';

        const label = document.createElement('span');
        label.textContent = readableScreenshotName(image.filename);

        button.append(thumbnail, label);
        button.addEventListener('click', () => {
            selectCadReferenceImage(image, button);
        });

        cadReferenceThumbnails.appendChild(button);

        if (index === 0) {
            selectCadReferenceImage(image, button);
        }
    });
}

async function refreshCadReferenceAvailability() {
    if (captureMode || isARMode) return;

    const profileName = profileInput.value;
    cadReferenceButton.disabled = true;
    cadReferenceButton.title = 'Checking CAD references…';

    try {
        const images = await fetchCadReferenceImages(profileName);
        currentCadReferenceImages = images;
        cadReferenceButton.disabled = images.length === 0;
        cadReferenceButton.title = images.length
            ? `CAD Section Reference (${images.length})`
            : 'No CAD references';
    } catch (error) {
        currentCadReferenceImages = [];
        cadReferenceButton.disabled = true;
        cadReferenceButton.title = 'CAD references unavailable';
        console.warn('Could not load CAD reference screenshots:', error);
    }
}

async function openCadReferenceModal() {
    const profileName = profileInput.value;
    cadReferenceModal.classList.add('open');
    if (cadReferenceSubtitle) {
        cadReferenceSubtitle.textContent = profileName;
    }
    cadReferenceStatus.style.display = 'block';
    cadReferenceStatus.textContent = 'Loading reference screenshots…';
    cadReferenceContent.style.display = 'none';

    try {
        const images = await fetchCadReferenceImages(profileName);
        currentCadReferenceImages = images;

        if (!images.length) {
            cadReferenceStatus.textContent =
                'No screenshots were found for this CAD profile.';
            return;
        }

        renderCadReferenceGallery(images);
        cadReferenceStatus.style.display = 'none';
        cadReferenceContent.style.display = 'grid';
    } catch (error) {
        cadReferenceStatus.textContent =
            `Reference screenshots could not be loaded: ${error.message}`;
    }
}

function closeCadReferenceModal() {
    cadReferenceModal.classList.remove('open');
}

async function forceSceneRender() {
    renderer.compile(scene, camera);
    renderer.render(scene, camera);

    const gl = renderer.getContext();
    if (gl && typeof gl.finish === 'function') {
        gl.finish();
    }

    await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    renderer.render(scene, camera);
    if (gl && typeof gl.finish === 'function') {
        gl.finish();
    }
}

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

const arController = createARController({
    appBuild: APP_BUILD,
    isARMode,
    renderer,
    camera,
    placementRoot,
    mainGroup,
    applyCurrentPoseInstantly,
    materialManager,
    getProfilesReady: () => profilesReady,
    getProfilesData: () => profilesData,
    getSelectedHandleSide: () => selectedHandleSide,
});

async function loadProfiles(profileFolder) {
    window.CONFIGURATOR_READY = false;
    document.getElementById('loading').style.display = 'block';
    windowBuilder.clearTemplateGeometryCache();
    windowBuilder.invalidateSectionSamples();
    profilesData = [];
    profilesReady = false;
    let loadSucceeded = false;

    try {
        const definition = await getProfileDefinition(profileFolder);
        currentMetadata = definition.metadata;
        profilesData = definition.profiles.map((profile) => ({
            ...profile,
            material: getMaterialForProfile(profile),
        }));
        windowBuilder.setProfileData(currentMetadata, profilesData);
        renderPartToggles();
        renderGroupFilters();
        buildWindow();
        await forceSceneRender();
        loadSucceeded = true;
        window.CONFIGURATOR_READY = true;
        await refreshCadReferenceAvailability();
    } catch (e) {
        window.CONFIGURATOR_READY = false;
        currentMetadata = null;
        windowBuilder.setProfileData(null, []);
        console.error(`Error loading profile set ${profileFolder}:`, e);
        if (isARMode) {
            arController.setARStatus(`The configured profile could not be loaded: ${e.message}`, true);
        }
    } finally {
        document.getElementById('loading').style.display = 'none';
        if (loadSucceeded) {
            buildWindow();
        }
        profilesReady = loadSucceeded;
        arController.updateARAvailability();
    }
}

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

    const mustReloadProfile = profileInput.value !== requestedProfileName || !currentMetadata;
    profileInput.value = requestedProfileName;

    if (mustReloadProfile) {
        await loadProfiles(requestedProfileName);
    } else {
        profilesData.forEach((profile) => {
            profile.material = getMaterialForProfile(profile);
        });
        renderPartToggles();
        renderGroupFilters();
        buildWindow();
        await forceSceneRender();
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
    loadProfiles,
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
    openCadReferenceModal,
    closeCadReferenceModal,
    setSelectedARPlatform: arController.setSelectedARPlatform,
    openQRModal: arController.openQRModal,
    closeQRModal: arController.closeQRModal,
    downloadLatestARAsset: arController.downloadLatestARAsset,
    checkLatestStaticModel: arController.checkLatestStaticModel,
    startAR: arController.startAR,
});

materialManager.initializeControls();

// Load the selected profile. In QR AR mode the selection comes from URL parameters.
loadProfiles(isARMode ? requestedProfile : '2_4_Oeffnungselemnt_Vertikal');
renderer.setAnimationLoop(renderFrame);
