import * as THREE from 'three';
import { createWindowARAsset, downloadARAsset, uploadARAsset, uploadARAssetToSupabase, formatExportStats, sha256Hex } from '../ar-export.js';
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
            setARStatus(`The configured profile could not be loaded: ${e.message}`, true);
        }
    } finally {
        document.getElementById('loading').style.display = 'none';
        if (loadSucceeded) {
            buildWindow();
        }
        profilesReady = loadSucceeded;
        updateARAvailability();
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
        updateARPlacement(xrFrame);
    } else if (!captureMode) {
        controls.update();
    }
    renderer.render(scene, camera);
}

// QR generation and WebXR AR mode
let profilesReady = false;
let arSession = null;
let hitTestSource = null;
let arPlaced = false;
let arSessionStartedAt = 0;

function buildWebXRUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('ar', '1');
    url.searchParams.set('profile', document.getElementById('cadProfile').value);
    url.searchParams.set('w', document.getElementById('widthA').value);
    url.searchParams.set('h', document.getElementById('heightB').value);
    url.searchParams.set('mode', document.getElementById('mOscilo').checked ? 'oscilo' : 'batant');
    url.searchParams.set('angle', document.getElementById('openAngle').value);
    url.searchParams.set('explode', document.getElementById('cExplode').checked ? '1' : '0');
    url.searchParams.set('glass_thickness', document.getElementById('glassThickness').value);
    url.searchParams.set('handle_side', selectedHandleSide);
    materialManager.appendUrlParams(url);

    const activeParts = profilesData
        .filter(profile => document.getElementById(`toggle_${profile.index}`)?.checked)
        .map(profile => String(profile.index));
    if (activeParts.length !== profilesData.length) {
        url.searchParams.set('parts', activeParts.join(','));
    }
    return url.toString();
}

function closeQRModal() {
    document.getElementById('qr-modal').classList.remove('open');
}

function setQRStatus(message) {
    document.getElementById('qr-status').textContent = message;
}

function showQRError(message) {
    const qrContainer = document.getElementById('qr-code');
    const errorContainer = document.getElementById('qr-error');
    qrContainer.style.display = 'none';
    errorContainer.style.display = 'block';
    errorContainer.textContent = message;
}

function renderQRCode(url) {
    const qrContainer = document.getElementById('qr-code');
    const errorContainer = document.getElementById('qr-error');
    if (typeof window.qrcode !== 'function') {
        throw new Error('The QR library could not be loaded. Reload the page and try again.');
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 7, margin: 4, scalable: true });
    qrContainer.style.display = 'flex';
    errorContainer.style.display = 'none';
}

const AR_PLATFORM_FORMATS = Object.freeze({
    android: Object.freeze({
        platform: 'android',
        format: 'glb',
        extension: 'glb',
        contentType: 'model/gltf-binary',
        label: 'Android',
        viewer: 'Google Scene Viewer'
    }),
    ios: Object.freeze({
        platform: 'ios',
        format: 'usdz',
        extension: 'usdz',
        contentType: 'model/vnd.usdz+zip',
        label: 'iOS',
        viewer: 'Apple AR Quick Look'
    })
});

let selectedARPlatform = 'android';
let latestExportedAsset = null;
let latestExportFormat = 'glb';
let latestExportFilename = 'configured-window.glb';
let latestStaticModelUrl = '';
let latestExpectedBytes = 0;
let latestModelTitle = 'configured-window';
let latestPublishedPlatform = 'android';

function selectedARInfo() {
    return AR_PLATFORM_FORMATS[selectedARPlatform] || AR_PLATFORM_FORMATS.android;
}

function setSelectedARPlatform(platform) {
    if (!AR_PLATFORM_FORMATS[platform]) return;
    selectedARPlatform = platform;
    const switchElement = document.getElementById('ar-platform-switch');
    switchElement.dataset.platform = platform;
    switchElement.querySelectorAll('.ar-platform-option').forEach(button => {
        button.setAttribute('aria-pressed', button.dataset.platform === platform ? 'true' : 'false');
    });
}

function makeExportName() {
    const profile = document.getElementById('cadProfile').value;
    const width = document.getElementById('widthA').value;
    const height = document.getElementById('heightB').value;
    const mode = document.getElementById('mOscilo').checked ? 'oscilo' : 'batant';
    const handleSide = selectedHandleSide === 'left' ? 'left-handle' : 'right-handle';
    const safe = `${profile}-${width}x${height}-${mode}-${handleSide}`
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return safe || 'configured-window';
}

function buildARLauncherUrl(modelUrl, modelTitle, platform, format) {
    const url = new URL('./ar-viewer.html', window.location.href);
    url.searchParams.set('model', modelUrl);
    url.searchParams.set('title', modelTitle);
    url.searchParams.set('platform', platform);
    url.searchParams.set('format', format);
    url.searchParams.set('build', APP_BUILD);
    return url.toString();
}

async function generateCurrentWindowARAsset(platform) {
    const config = window.AR_UPLOAD_CONFIG || {};
    const platformInfo = AR_PLATFORM_FORMATS[platform];
    if (!platformInfo) throw new Error(`Unsupported AR platform: ${platform}.`);

    const modelName = makeExportName();
    const maxBytes = platformInfo.format === 'usdz'
        ? (Number.isFinite(config.maxUsdzBytes) ? config.maxUsdzBytes : 45 * 1024 * 1024)
        : (Number.isFinite(config.maxGlbBytes)
            ? config.maxGlbBytes
            : (Number.isFinite(config.maxBytes) ? config.maxBytes : 10 * 1024 * 1024));
    const targetTriangles = platformInfo.format === 'usdz'
        ? (Number.isFinite(config.targetUsdzTriangles)
            ? config.targetUsdzTriangles
            : 22000)
        : (Number.isFinite(config.targetGlbTriangles)
            ? config.targetGlbTriangles
            : (Number.isFinite(config.targetTriangles) ? config.targetTriangles : 45000));
    const result = await createWindowARAsset({
        sourceRoot: mainGroup,
        applyPose: applyCurrentPoseInstantly,
        format: platformInfo.format,
        maxBytes,
        targetTriangles
    });
    const hash = await sha256Hex(result.arrayBuffer);
    latestExportedAsset = result.arrayBuffer;
    latestExportFormat = platformInfo.format;
    latestExportFilename = `${modelName}-${hash.slice(0, 12)}.${platformInfo.extension}`;
    latestModelTitle = modelName;
    latestExpectedBytes = result.arrayBuffer.byteLength;
    latestPublishedPlatform = platform;
    return {
        ...result,
        modelName,
        hash,
        filename: latestExportFilename,
        platform
    };
}

function buildStaticModelUrl(filename) {
    const config = window.AR_UPLOAD_CONFIG || {};
    const directory = String(config.staticModelDirectory || 'models/').replace(/^\/+/, '').replace(/\/*$/, '/');
    return new URL(`./${directory}${encodeURIComponent(filename)}`, window.location.href).href;
}

async function probePublishedModel(modelUrl, expectedBytes, format) {
    let response = await fetch(modelUrl, {
        method: 'HEAD',
        cache: 'no-store'
    });

    if (response.status === 405) {
        response = await fetch(modelUrl, {
            method: 'GET',
            cache: 'no-store',
            headers: { Range: 'bytes=0-19' }
        });
    }

    if (!response.ok && response.status !== 206) {
        throw new Error(`The model is not published yet (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLengthHeader = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range') || '';
    let publicBytes = Number.parseInt(contentLengthHeader || '', 10);
    const rangeMatch = /\/(\d+)$/.exec(contentRange);
    if (rangeMatch) publicBytes = Number.parseInt(rangeMatch[1], 10);

    if (Number.isFinite(publicBytes) && expectedBytes && publicBytes !== expectedBytes) {
        throw new Error(`A file exists at that URL, but its size is ${publicBytes} bytes instead of ${expectedBytes}. Republish the new AR model.`);
    }

    const expectedType = format === 'usdz'
        ? /model\/vnd\.usdz\+zip|application\/octet-stream/i
        : /model\/gltf-binary|application\/octet-stream/i;
    if (contentType && !expectedType.test(contentType)) {
        console.warn(`Unexpected ${format.toUpperCase()} Content-Type: ${contentType}`);
    }

    return { publicBytes, contentType };
}

function completePublishedQR(modelUrl, modelTitle, platform, format) {
    const platformInfo = AR_PLATFORM_FORMATS[platform];
    const launcherUrl = buildARLauncherUrl(modelUrl, modelTitle, platform, format);
    renderQRCode(launcherUrl);
    const launchLink = document.getElementById('qr-launch-link');
    launchLink.href = launcherUrl;
    launchLink.style.display = 'inline-block';
    document.getElementById('qr-publish-help').style.display = 'none';
    setQRStatus(
        `The public ${format.toUpperCase()} was verified. Scan this ${platformInfo.label} QR, ` +
        `then press “View in AR” on the phone.`
    );
}

function showStaticPublishInstructions(filename, modelUrl, platform, format) {
    const platformInfo = AR_PLATFORM_FORMATS[platform];
    const help = document.getElementById('qr-publish-help');
    help.innerHTML = [
        `<strong>The optimized ${format.toUpperCase()} is ready but is not yet present on Netlify.</strong>`,
        `1. Download <code>${filename}</code>.`,
        `2. Place it in <code>dist/site/models/</code>.`,
        '3. Redeploy the existing Netlify site.',
        '4. Return here and press “Check published model and create QR”.',
        `<br>Platform: <code>${platformInfo.label}</code>`,
        `<br>Expected public URL:<br><code>${modelUrl}</code>`
    ].join('<br>');
    help.style.display = 'block';
    const checkButton = document.getElementById('qr-check-published');
    checkButton.style.display = 'block';
    checkButton.disabled = false;
}

async function waitForPublishedModel(modelUrl, expectedBytes, format) {
    let lastError = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            return await probePublishedModel(modelUrl, expectedBytes, format);
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 900 + attempt * 250));
        }
    }
    throw lastError || new Error('The uploaded Supabase model did not become publicly reachable.');
}

async function publishWithSupabase(exported) {
    const config = window.AR_UPLOAD_CONFIG || {};
    const formatLabel = exported.format.toUpperCase();
    const uploadResult = await uploadARAssetToSupabase({
        ticketEndpoint: config.ticketEndpoint || '/api/ar-upload-ticket',
        arrayBuffer: exported.arrayBuffer,
        filename: exported.filename,
        sha256: exported.hash,
        appBuild: APP_BUILD,
        format: exported.format,
        platform: exported.platform,
        onProgress(bytesUploaded, bytesTotal) {
            const percentage = bytesTotal > 0
                ? Math.min(100, 100 * bytesUploaded / bytesTotal)
                : 0;
            setQRStatus(`2/3 Uploading the optimized ${formatLabel} directly to Supabase… ${percentage.toFixed(1)}%`);
        }
    });

    if (!uploadResult?.publicUrl) {
        throw new Error(`Supabase did not return a public ${formatLabel} URL.`);
    }

    setQRStatus(uploadResult.exists
        ? `2/3 This exact ${formatLabel} already exists in Supabase. Verifying its public URL…`
        : '3/3 Upload completed. Waiting for the public Supabase URL…');
    await waitForPublishedModel(
        uploadResult.publicUrl,
        exported.arrayBuffer.byteLength,
        exported.format
    );
    completePublishedQR(
        uploadResult.publicUrl,
        exported.modelName,
        exported.platform,
        exported.format
    );
}

async function checkLatestStaticModel() {
    if (!latestStaticModelUrl) return;
    const checkButton = document.getElementById('qr-check-published');
    checkButton.disabled = true;
    setQRStatus(`Checking the published Netlify ${latestExportFormat.toUpperCase()}…`);
    try {
        await probePublishedModel(latestStaticModelUrl, latestExpectedBytes, latestExportFormat);
        completePublishedQR(
            latestStaticModelUrl,
            latestModelTitle,
            latestPublishedPlatform,
            latestExportFormat
        );
        checkButton.style.display = 'none';
    } catch (error) {
        setQRStatus(error.message);
        checkButton.disabled = false;
    }
}

async function openQRModal() {
    const modal = document.getElementById('qr-modal');
    const qrContainer = document.getElementById('qr-code');
    const errorContainer = document.getElementById('qr-error');
    const statsContainer = document.getElementById('qr-export-stats');
    const downloadButton = document.getElementById('qr-download-model');
    const checkButton = document.getElementById('qr-check-published');
    const launchLink = document.getElementById('qr-launch-link');
    const publishHelp = document.getElementById('qr-publish-help');
    const description = document.getElementById('qr-description');
    const publicationPlatform = selectedARPlatform;
    const platformInfo = AR_PLATFORM_FORMATS[publicationPlatform];
    const formatLabel = platformInfo.format.toUpperCase();

    modal.classList.add('open');
    description.textContent = `${platformInfo.label} selected: the browser will generate a ${formatLabel} for ${platformInfo.viewer}.`;
    qrContainer.innerHTML = '';
    qrContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    statsContainer.style.display = 'none';
    statsContainer.textContent = '';
    publishHelp.style.display = 'none';
    publishHelp.innerHTML = '';
    launchLink.style.display = 'none';
    launchLink.removeAttribute('href');
    checkButton.style.display = 'none';
    checkButton.disabled = true;
    latestExportedAsset = null;
    latestExportFormat = platformInfo.format;
    latestStaticModelUrl = '';
    latestExpectedBytes = 0;
    latestPublishedPlatform = publicationPlatform;
    downloadButton.disabled = true;
    downloadButton.textContent = `Download optimized ${formatLabel}`;

    if (!profilesReady) {
        showQRError('The window profile is still loading. Close this dialog and try again in a moment.');
        setQRStatus('');
        return;
    }

    try {
        setQRStatus(`1/3 Building and simplifying the current production window for ${platformInfo.viewer}…`);
        const exported = await generateCurrentWindowARAsset(publicationPlatform);
        statsContainer.textContent = formatExportStats(exported.stats);
        statsContainer.style.display = 'block';
        downloadButton.disabled = false;

        const config = window.AR_UPLOAD_CONFIG || {};
        if (config.mode === 'supabase') {
            setQRStatus(`2/3 The optimized ${formatLabel} passed browser validation. Requesting a secure Supabase upload ticket…`);
            await publishWithSupabase(exported);
            return;
        }
        if (config.mode === 'api' && config.endpoint) {
            setQRStatus(`2/3 The optimized ${formatLabel} passed browser validation. Uploading to the configured server…`);
            const uploaded = await uploadARAsset({
                endpoint: config.endpoint,
                arrayBuffer: exported.arrayBuffer,
                modelName: exported.modelName,
                appBuild: APP_BUILD,
                format: exported.format
            });
            completePublishedQR(
                uploaded.modelUrl,
                exported.modelName,
                exported.platform,
                exported.format
            );
            return;
        }

        latestStaticModelUrl = buildStaticModelUrl(exported.filename);
        setQRStatus(`2/3 The optimized ${formatLabel} passed browser validation. Checking whether this exact file is already published…`);
        try {
            await probePublishedModel(latestStaticModelUrl, latestExpectedBytes, exported.format);
            completePublishedQR(
                latestStaticModelUrl,
                exported.modelName,
                exported.platform,
                exported.format
            );
        } catch (_notPublished) {
            setQRStatus(`3/3 Download and publish the optimized ${formatLabel}, then verify it here. No paid storage service is involved.`);
            showStaticPublishInstructions(
                exported.filename,
                latestStaticModelUrl,
                exported.platform,
                exported.format
            );
        }
    } catch (error) {
        console.error('AR export/publish preparation failed:', error);
        setQRStatus(latestExportedAsset
            ? `The ${formatLabel} was generated locally, but the publication or QR step failed.`
            : `The ${formatLabel} export or optimization failed before publication.`);
        showQRError(error.message || 'The configured window could not be prepared for AR.');
    }
}

function setARStatus(message, isError = false) {
    const status = document.getElementById('ar-status');
    status.textContent = message;
    status.style.color = isError ? '#fecaca' : '#94a3b8';
}

async function updateARAvailability() {
    if (!isARMode || !profilesReady) return;
    const button = document.getElementById('ar-start-button');

    if (!window.isSecureContext) {
        button.disabled = true;
        button.textContent = 'HTTPS required';
        setARStatus('AR can only start from a secure HTTPS page.', true);
        return;
    }
    if (!navigator.xr) {
        button.disabled = true;
        button.textContent = 'AR not supported';
        setARStatus('This browser does not provide WebXR. Use Google Chrome on an ARCore-compatible Android phone.', true);
        return;
    }

    try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        button.disabled = !supported;
        button.textContent = supported ? 'View in AR' : 'AR not supported';
        setARStatus(supported
            ? 'Tap once to open the camera. The model will be placed automatically when a surface is detected.'
            : 'Immersive AR is unavailable on this device or browser.', !supported);
    } catch (error) {
        button.disabled = true;
        button.textContent = 'AR unavailable';
        setARStatus(`${error.name}: ${error.message}`, true);
    }
}

async function startAR() {
    if (arSession) return;
    const button = document.getElementById('ar-start-button');
    button.disabled = true;
    button.textContent = 'Opening camera…';
    setARStatus('Waiting for camera and spatial-tracking permission…');

    try {
        arSession = await navigator.xr.requestSession('immersive-ar', {
            optionalFeatures: ['hit-test']
        });
        try {
            await renderer.xr.setSession(arSession);
        } catch (sessionSetupError) {
            await arSession.end().catch(() => { });
            throw sessionSetupError;
        }
        arSessionStartedAt = performance.now();
        arPlaced = false;
        placementRoot.visible = false;
        document.getElementById('ar-launch').style.display = 'none';

        try {
            const viewerSpace = await arSession.requestReferenceSpace('viewer');
            hitTestSource = await arSession.requestHitTestSource({ space: viewerSpace });
        } catch (error) {
            console.warn('Hit testing is unavailable; using camera-relative placement.', error);
            hitTestSource = null;
        }

        arSession.addEventListener('end', () => {
            hitTestSource?.cancel?.();
            hitTestSource = null;
            arSession = null;
            arPlaced = false;
            placementRoot.visible = false;
            document.getElementById('ar-launch').style.display = 'flex';
            button.disabled = false;
            button.textContent = 'View in AR';
            setARStatus('AR closed. Tap to open it again.');
        }, { once: true });
    } catch (error) {
        console.error('AR session failed:', error);
        arSession = null;
        button.disabled = false;
        button.textContent = 'Try AR again';
        setARStatus(`${error.name}: ${error.message}`, true);
    }
}

function orientWindowTowardCamera(position) {
    const xrCamera = renderer.xr.getCamera(camera);
    const cameraPosition = new THREE.Vector3();
    xrCamera.getWorldPosition(cameraPosition);
    const dx = cameraPosition.x - position.x;
    const dz = cameraPosition.z - position.z;
    placementRoot.rotation.set(0, Math.atan2(dx, dz), 0);
}

function placeWindowOnSurface(position) {
    const height = Number.parseFloat(document.getElementById('heightB').value) || 1.5;
    placementRoot.position.set(position.x, position.y + height / 2, position.z);
    orientWindowTowardCamera(placementRoot.position);
    placementRoot.visible = true;
    arPlaced = true;
}

function placeWindowInFrontOfCamera() {
    const xrCamera = renderer.xr.getCamera(camera);
    const cameraPosition = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    xrCamera.getWorldPosition(cameraPosition);
    xrCamera.getWorldDirection(cameraDirection);
    const position = cameraPosition.clone().add(cameraDirection.multiplyScalar(1.6));
    placementRoot.position.copy(position);
    orientWindowTowardCamera(placementRoot.position);
    placementRoot.visible = true;
    arPlaced = true;
}

function updateARPlacement(xrFrame) {
    if (!isARMode || !arSession || arPlaced || !xrFrame) return;
    const referenceSpace = renderer.xr.getReferenceSpace();

    if (hitTestSource && referenceSpace) {
        const results = xrFrame.getHitTestResults(hitTestSource);
        if (results.length > 0) {
            const pose = results[0].getPose(referenceSpace);
            if (pose) {
                placeWindowOnSurface(pose.transform.position);
                return;
            }
        }
    }

    if (performance.now() - arSessionStartedAt > 2500) {
        placeWindowInFrontOfCamera();
    }
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
    setSelectedARPlatform,
    openQRModal,
    closeQRModal,
    downloadLatestARAsset: () => {
        if (latestExportedAsset) {
            downloadARAsset(latestExportedAsset, latestExportFilename, latestExportFormat);
        }
    },
    checkLatestStaticModel,
    startAR,
});

materialManager.initializeControls();

// Load the selected profile. In QR AR mode the selection comes from URL parameters.
loadProfiles(isARMode ? requestedProfile : '2_4_Oeffnungselemnt_Vertikal');
renderer.setAnimationLoop(renderFrame);
