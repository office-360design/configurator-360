import * as THREE from 'three';
import { getGlazingBeadCode } from './config.js';
import { createProfileLoader } from './profile-loader.js';

export function createProfileController({
    isARMode,
    requestedActiveParts,
    glassThicknessInput,
    renderer,
    scene,
    camera,
    loadingElement,
    resolveDisplayColour,
    makeColourIndicatorBackground,
    setColourIndicatorBackground,
    getMaterialForProfile,
    isDrainageCoverCap,
    getWindowBuilder,
    getARController,
    refreshCadReferenceAvailability,
}) {
    const { getProfileDefinition } = createProfileLoader();

    let currentMetadata = null;
    let profilesData = [];
    let profilesReady = false;
    let renderedColorFilters = [];

    const shapeBoundsCache = new WeakMap();
    const glazingBeadArmShiftCache = new Map();

    function buildWindow() {
        getWindowBuilder()?.buildWindow();
    }

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
        const remainder = thickness % 5;

        if (remainder === 0) {
            return '224379';
        }
        if (remainder === 1 || remainder === 2) {
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

            textContainer.textContent = '';
            let dot = colorDot;
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'part-color-dot';
            }
            setColourIndicatorBackground(dot, resolveDisplayColour(profile));
            textContainer.appendChild(dot);
            textContainer.appendChild(document.createTextNode(displayedBlockName));
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
            bead: { title: 'Glazing Bead Components', items: [] },
        };

        profilesData.forEach(profile => {
            const group = getProfileGroup(profile);
            if (groups[group]) {
                groups[group].items.push(profile);
            } else {
                groups.sash.items.push(profile);
            }
        });

        Object.keys(groups).forEach(key => {
            const groupData = groups[key];
            if (groupData.items.length === 0) return;

            const details = document.createElement('details');
            details.className = 'group-dropdown';
            details.open = false;

            const summary = document.createElement('summary');
            summary.className = 'group-dropdown-header';
            summary.innerHTML = `
                <span style="display: flex; align-items: center; gap: 8px;">
                    <span class="caret">▼</span>
                    <span>${groupData.title} (${groupData.items.length})</span>
                </span>
                <button class="btn-toggle-all-group" type="button">Toggle All</button>
            `;
            details.appendChild(summary);

            const content = document.createElement('div');
            content.className = 'group-dropdown-content';

            groupData.items.forEach(profile => {
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

            const toggleAllButton = summary.querySelector('.btn-toggle-all-group');
            toggleAllButton?.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();

                const allChecked = groupData.items.every(profile => {
                    const checkbox = document.getElementById(`toggle_${profile.index}`);
                    return checkbox ? checkbox.checked : false;
                });

                groupData.items.forEach(profile => {
                    const checkbox = document.getElementById(`toggle_${profile.index}`);
                    if (checkbox) {
                        checkbox.checked = !allChecked;
                    }
                });

                buildWindow();
            });

            groupData.items.forEach(profile => {
                content
                    .querySelector(`#toggle_${profile.index}`)
                    ?.addEventListener('change', buildWindow);
            });
        });
    }

    function updateColorFilterToggles() {
        renderedColorFilters.forEach(item => {
            const matchingProfiles = profilesData.filter(profile => item.filter.match(profile));
            if (matchingProfiles.length === 0) return;

            const allActive = matchingProfiles.every(profile => {
                const checkbox = document.getElementById(`toggle_${profile.index}`);
                return checkbox ? checkbox.checked : true;
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
                match: profile => profile.materialKey === 'alu' && getProfileGroup(profile) === 'frame',
            },
            {
                name: 'Sash',
                match: profile => profile.materialKey === 'alu'
                    && ['sash', 'bead'].includes(getProfileGroup(profile)),
            },
            {
                name: 'Gaskets and seals',
                match: profile => profile.materialKey === 'epdm',
            },
            {
                name: 'Drainage cover cap',
                match: profile => isDrainageCoverCap(profile),
            },
            {
                name: 'Insulating foam',
                match: profile => profile.materialKey === 'foam',
            },
            {
                name: 'Insulating bar',
                match: profile => profile.materialKey === 'iso',
            },
            {
                name: 'Locking bars',
                match: profile => profile.materialKey === 'centralSeal',
            },
        ];

        const activeFilters = filterDefinitions.filter(definition =>
            profilesData.some(definition.match)
        );

        const unmatchedProfiles = profilesData.filter(profile =>
            !filterDefinitions.some(definition => definition.match(profile))
        );
        const unmatchedColors = [...new Set(unmatchedProfiles.map(profile => profile.baseCadColor))];

        unmatchedColors.forEach(hex => {
            activeFilters.push({
                name: hex.toUpperCase(),
                match: profile => profile.baseCadColor === hex,
            });
        });

        activeFilters.forEach(filter => {
            const row = document.createElement('div');
            row.className = 'category-filter-row';
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 12px; background: rgba(30, 41, 59, 0.4); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);';

            const matchingProfiles = profilesData.filter(profile => filter.match(profile));
            const indicatorBackground = makeColourIndicatorBackground(matchingProfiles);
            const allActive = matchingProfiles.every(profile => {
                const checkbox = document.getElementById(`toggle_${profile.index}`);
                return checkbox ? checkbox.checked : true;
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
            toggleInput.addEventListener('change', event => {
                const isChecked = event.target.checked;
                profilesData.forEach(profile => {
                    if (filter.match(profile)) {
                        const checkbox = document.getElementById(`toggle_${profile.index}`);
                        if (checkbox) checkbox.checked = isChecked;
                    }
                });
                buildWindow();
            });

            renderedColorFilters.push({
                filter,
                input: toggleInput,
            });

            groupFiltersContainer.appendChild(row);
        });
    }

    async function forceSceneRender() {
        renderer.compile(scene, camera);
        renderer.render(scene, camera);

        const gl = renderer.getContext();
        if (gl && typeof gl.finish === 'function') {
            gl.finish();
        }

        await new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        renderer.render(scene, camera);
        if (gl && typeof gl.finish === 'function') {
            gl.finish();
        }
    }

    async function loadProfiles(profileFolder) {
        window.CONFIGURATOR_READY = false;
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }

        const windowBuilder = getWindowBuilder();
        windowBuilder?.clearTemplateGeometryCache();
        windowBuilder?.invalidateSectionSamples();
        profilesData = [];
        profilesReady = false;
        glazingBeadArmShiftCache.clear();
        let loadSucceeded = false;

        try {
            const definition = await getProfileDefinition(profileFolder);
            currentMetadata = definition.metadata;
            profilesData = definition.profiles.map(profile => ({
                ...profile,
                material: getMaterialForProfile(profile),
            }));
            windowBuilder?.setProfileData(currentMetadata, profilesData);
            renderPartToggles();
            renderGroupFilters();
            buildWindow();
            await forceSceneRender();
            loadSucceeded = true;
            window.CONFIGURATOR_READY = true;
            await refreshCadReferenceAvailability?.();
        } catch (error) {
            window.CONFIGURATOR_READY = false;
            currentMetadata = null;
            windowBuilder?.setProfileData(null, []);
            console.error(`Error loading profile set ${profileFolder}:`, error);
            if (isARMode) {
                getARController()?.setARStatus(
                    `The configured profile could not be loaded: ${error.message}`,
                    true
                );
            }
        } finally {
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            if (loadSucceeded) {
                buildWindow();
            }
            profilesReady = loadSucceeded;
            getARController()?.updateARAvailability();
        }
    }

    async function refreshProfileMaterials() {
        profilesData.forEach(profile => {
            profile.material = getMaterialForProfile(profile);
        });
        renderPartToggles();
        renderGroupFilters();
        buildWindow();
        await forceSceneRender();
    }

    return {
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
        updateColorFilterToggles,
        renderPartToggles,
        renderGroupFilters,
        loadProfiles,
        refreshProfileMaterials,
        getProfilesData: () => profilesData,
        getProfilesReady: () => profilesReady,
        getCurrentMetadata: () => currentMetadata,
        hasCurrentMetadata: () => Boolean(currentMetadata),
    };
}
