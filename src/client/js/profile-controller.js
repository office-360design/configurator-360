import * as THREE from 'three';
import { getGlazingBeadCode, getGasketCode } from './config.js';
import { createProfileLoader } from './profile-loader.js';
import {
    createConnectionTemplateLoader,
    getConnectionTemplateIdForLayout,
} from './connection-template-loader.js';
import { getProfileShapeBounds } from './svg-profile-shapes.js';
import {
    areSelectedComponentProfilesVisible,
    shouldCheckComponentProfile,
} from './component-group-visibility.js';
import {
    applyDividerAccessoryConnectionPlacements,
    applyFrameAccessoryConnectionPlacements,
    applyOpeningSashDividerConnectionPlacements,
    composeRegisteredProfileDefinitions,
    composeSupplementalAccessoryProfiles,
    createProfileSelectionSignature,
    getRequiredSupplementalAccessorySourceProfileSetIds,
    resolveLegacyProfileSources,
} from './profile-composition.js';
import {
    getProfileCatalogEntry,
    isStandaloneProfileGeometryRegistered,
} from './profile-catalog.js';
import { transformCadPoint } from './profile-coordinate-transform.js';

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
    initializeAccessoryProfiles = () => {},
    isManagedAccessoryProfile = () => false,
    isAccessoryProfileEnabled = () => true,
    setAccessoryProfileEnabled = () => false,
    setAccessoryProfilesEnabled = () => false,
}) {
    const {
        getProfileDefinition,
        getStandaloneProfileDefinition,
    } = createProfileLoader();
    const { loadConnectionTemplate } = createConnectionTemplateLoader();

    let currentMetadata = null;
    let profilesData = [];
    let profilesReady = false;
    let renderedColorFilters = [];
    let currentSelectionSignature = null;

    const shapeBoundsCache = new WeakMap();
    const glazingBeadArmShiftCache = new Map();
    const componentGroupVisibility = new Map([
        ['frame', true],
        ['sash', true],
        ['bead', true],
        ['divider', true],
    ]);

    function buildWindow() {
        getWindowBuilder()?.buildWindow();
    }

    function isGlazingBeadProfile(profile) {
        const name = String(profile.blockName || '');
        return profile.componentType === 'glazing-bead'
            || profile.componentType === 'glazing-bead-child'
            || /5739(?:20|30|40)/.test(name)
            || profile.isGlazingBeadTemplate === true;
    }

    function getProfileGroup(profile) {
        if (profile.role === 'frame') {
            return 'frame';
        }
        if (profile.role === 'divider') {
            return 'divider';
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

    function isProfileGroupVisible(profileOrGroup) {
        const group = typeof profileOrGroup === 'string'
            ? profileOrGroup
            : getProfileGroup(profileOrGroup);
        return componentGroupVisibility.get(group) !== false;
    }

    function isGlazingBeadChild(profile) {
        return profile.componentType === 'glazing-bead-child'
            || String(profile.blockName || '').includes('244511');
    }

    function getActiveGlazingBeadCode() {
        return getGlazingBeadCode(Number(glassThicknessInput?.value) || 24);
    }

    function getActiveGasketCode() {
        return getGasketCode(Number(glassThicknessInput?.value) || 24);
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

        const bounds = getProfileShapeBounds(shape, 64);
        if (!bounds) return null;
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
        const assemblyShift = Number(profile?.cadAlignmentShiftXMm) || 0;
        const glazingShift = blockName.includes('224378') || profile.isGasketTemplate
            ? getGlazingBeadArmShiftMm(profile.section || 'top')
            : 0;

        return assemblyShift + glazingShift;
    }

    function getProfileCadYShiftMm(profile) {
        return Number(profile?.cadAlignmentShiftYMm) || 0;
    }

    function transformProfileCadPoint(profile, sourceCadX, sourceCadY) {
        if (profile?.cadCoordinateTransform) {
            return transformCadPoint(
                profile.cadCoordinateTransform,
                sourceCadX,
                sourceCadY
            );
        }

        return {
            x: Number(sourceCadX) + getProfileCadXShiftMm(profile),
            y: Number(sourceCadY) + getProfileCadYShiftMm(profile),
        };
    }

    function getProfileCadPointMm(profile, svgX, svgY) {
        return transformProfileCadPoint(profile, Number(svgX), -Number(svgY));
    }

    function getEffectiveProfileBbox(profile) {
        if (!profile?.bbox) return null;

        const corners = [
            transformProfileCadPoint(profile, profile.bbox.minX, profile.bbox.minY),
            transformProfileCadPoint(profile, profile.bbox.minX, profile.bbox.maxY),
            transformProfileCadPoint(profile, profile.bbox.maxX, profile.bbox.minY),
            transformProfileCadPoint(profile, profile.bbox.maxX, profile.bbox.maxY),
        ];

        return {
            minX: Math.min(...corners.map(point => point.x)),
            maxX: Math.max(...corners.map(point => point.x)),
            minY: Math.min(...corners.map(point => point.y)),
            maxY: Math.max(...corners.map(point => point.y)),
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
            divider: { title: 'Mullion / Transom Components', items: [] },
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
            details.dataset.profileGroup = key;
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
                const legacyIndexes = [
                    profile.legacyIndex,
                    ...(profile.legacyIndexes || []),
                ].filter(index => index !== null && index !== undefined);
                const isRequestedPartActive = !isARMode
                    || requestedActiveParts === null
                    || requestedActiveParts.has(String(profile.index))
                    || legacyIndexes.some(index => requestedActiveParts.has(String(index)))
                    || requestedActiveParts.has(profile.componentId);
                const isSelectedForPiece = isManagedAccessoryProfile(profile)
                    ? isAccessoryProfileEnabled(profile)
                    : isRequestedPartActive;
                const isActive = isProfileGroupVisible(key) && isSelectedForPiece;

                item.innerHTML = `
                    <span><span class="part-color-dot" style="background-color: ${colorDot};"></span>${labelText}</span>
                    <input type="checkbox" id="toggle_${profile.index}" ${isActive ? 'checked' : ''}>
                `;
                content.appendChild(item);
            });

            details.appendChild(content);
            togglesContainer.appendChild(details);

            const toggleAllButton = summary.querySelector('.btn-toggle-all-group');
            toggleAllButton?.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();

                const allSelectedItemsVisible = areSelectedComponentProfilesVisible({
                    profiles: groupData.items,
                    getCheckboxChecked: profile => {
                        const checkbox = document.getElementById(`toggle_${profile.index}`);
                        return checkbox ? checkbox.checked : false;
                    },
                    isManagedAccessoryProfile,
                    isAccessoryProfileEnabled,
                });

                const nextVisible = !allSelectedItemsVisible;
                componentGroupVisibility.set(key, nextVisible);
                groupData.items.forEach(profile => {
                    const checkbox = document.getElementById(`toggle_${profile.index}`);
                    if (!checkbox) return;

                    checkbox.checked = shouldCheckComponentProfile({
                        profile,
                        groupVisible: nextVisible,
                        isManagedAccessoryProfile,
                        isAccessoryProfileEnabled,
                    });
                });

                buildWindow();
                updateColorFilterToggles();
            });

            groupData.items.forEach(profile => {
                content
                    .querySelector(`#toggle_${profile.index}`)
                    ?.addEventListener('change', event => {
                        if (isManagedAccessoryProfile(profile)) {
                            setAccessoryProfileEnabled(profile, event.target.checked);
                            return;
                        }
                        buildWindow();
                        updateColorFilterToggles();
                    });
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
                const matchingProfileStates = [];
                profilesData.forEach(profile => {
                    if (filter.match(profile)) {
                        const checkbox = document.getElementById(`toggle_${profile.index}`);
                        if (checkbox) checkbox.checked = isChecked;
                        matchingProfileStates.push({ profile, enabled: isChecked });
                    }
                });
                setAccessoryProfilesEnabled(matchingProfileStates, { rebuild: false });
                buildWindow();
                updateColorFilterToggles();
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

    async function loadProfileSelection(selection) {
        window.CONFIGURATOR_READY = false;
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }

        const normalizedSelection = typeof selection === 'string'
            ? { profileSetId: selection, profile: selection }
            : { ...selection };
        const selectionSignature = createProfileSelectionSignature(normalizedSelection);
        const windowBuilder = getWindowBuilder();
        windowBuilder?.clearTemplateGeometryCache();
        windowBuilder?.invalidateSectionSamples();
        profilesData = [];
        profilesReady = false;
        glazingBeadArmShiftCache.clear();
        let loadSucceeded = false;

        try {
            const sources = resolveLegacyProfileSources(normalizedSelection);
            const sourceIds = new Set([
                sources.profileSetId,
                sources.frameSourceProfileSetId,
                sources.sashSourceProfileSetId,
                ...getRequiredSupplementalAccessorySourceProfileSetIds(),
            ].filter(Boolean));
            const definitionsByProfileSetId = new Map();
            const standaloneDefinitionsByProfileId = new Map();

            await Promise.all([...sourceIds].map(async profileSetId => {
                definitionsByProfileSetId.set(
                    profileSetId,
                    await getProfileDefinition(profileSetId)
                );
            }));

            const selectedBaseProfileIds = [
                sources.outerFrameProfileId,
                sources.sashProfileId,
                normalizedSelection.dividerOrientation
                    ? normalizedSelection.dividerProfileId
                    : null,
            ].filter(profileId =>
                isStandaloneProfileGeometryRegistered(
                    getProfileCatalogEntry(profileId)
                )
            );
            await Promise.all(selectedBaseProfileIds.map(async profileId => {
                standaloneDefinitionsByProfileId.set(
                    profileId,
                    await getStandaloneProfileDefinition(profileId)
                );
            }));

            const connectionTemplateId = getConnectionTemplateIdForLayout({
                layoutId: normalizedSelection.layoutId || normalizedSelection.windowLayout || null,
                dividerOrientation: normalizedSelection.dividerOrientation,
                leftCell: normalizedSelection.leftCell || 'fixed-glazing',
                rightCell: normalizedSelection.rightCell || 'opening-sash',
            });
            const connectionTemplate = connectionTemplateId
                ? await loadConnectionTemplate(connectionTemplateId)
                : null;
            const hasFixedGlazingCell = normalizedSelection.leftCell === 'fixed-glazing'
                || normalizedSelection.rightCell === 'fixed-glazing'
                || normalizedSelection.cells?.includes?.('fixed-glazing');
            const hasOpeningSashCell = normalizedSelection.leftCell === 'opening-sash'
                || normalizedSelection.rightCell === 'opening-sash'
                || normalizedSelection.cells?.includes?.('opening-sash');
            const openingSashFrameTemplate = hasOpeningSashCell
                ? await loadConnectionTemplate('frame-sash')
                : null;
            const [
                fixedGlazingFrameTemplate,
                standaloneBeadDefinition,
                fixedGlazingDividerTemplate,
            ] = hasFixedGlazingCell
                ? await Promise.all([
                    loadConnectionTemplate('frame-fixed'),
                    getStandaloneProfileDefinition('573940'),
                    normalizedSelection.dividerOrientation
                        ? (
                            connectionTemplateId === 'mullion-fixed-fixed'
                                ? Promise.resolve(connectionTemplate)
                                : loadConnectionTemplate('mullion-fixed-fixed')
                        )
                        : Promise.resolve(null),
                ])
                : [null, null, null];
            // The fixed/fixed join has no opening-sash occurrence, so it cannot
            // by itself bridge join coordinates into the already-working B2
            // runtime assembly. Reuse the visually accepted mixed-join sash
            // bridge only for absolute mullion depth placement, while the active
            // fixed/fixed template remains the connection source of truth.
            const placementConnectionTemplate = connectionTemplateId === 'mullion-fixed-fixed'
                ? await loadConnectionTemplate('mullion-fixed-sash')
                : connectionTemplate;
            // Mullion-side fixed-glazing gaskets must come from the active join:
            // fixed/fixed -> window-mullion-window, mixed fixed/sash ->
            // window-mullion-sash-window. Keep this separate from the bead
            // template because bead placement has its own verified fallback path.
            const fixedGlazingDividerGasketTemplate = hasFixedGlazingCell
                && normalizedSelection.dividerOrientation
                ? connectionTemplate
                : null;

            let tLayoutVerticalConnectionTemplate = null;
            let registeredDefinition = composeRegisteredProfileDefinitions({
                selection: normalizedSelection,
                definitionsByProfileSetId,
                standaloneDefinitionsByProfileId,
                connectionTemplate,
                placementConnectionTemplate,
                fixedGlazingFrameTemplate,
                fixedGlazingDividerTemplate,
                fixedGlazingDividerGasketTemplate,
                standaloneBeadDefinition,
            });

            const isTLayout = (normalizedSelection.layoutId || normalizedSelection.windowLayout) === 'top-fixed-bottom-sash-sash'
                || normalizedSelection.layoutKind === 't-grid'
                || (normalizedSelection.layoutId && normalizedSelection.layoutId.startsWith('t-layout-'));
            if (isTLayout) {
                // The T layout has two different physical connections using the
                // same standalone mullion/transom profile: the horizontal run is
                // fixed | transom | sash, while the lower vertical run is
                // sash | mullion | sash. Compose the second join independently
                // and carry only its exact boundary/gasket transforms into the
                // primary definition. This avoids mirroring the mixed join or
                // guessing a second 245472 placement.
                const sashSashTemplate = await loadConnectionTemplate('mullion-sash-sash');
                tLayoutVerticalConnectionTemplate = sashSashTemplate;
                const sashSashDefinition = composeRegisteredProfileDefinitions({
                    selection: {
                        ...normalizedSelection,
                        dividerOrientation: 'vertical',
                        primaryDividerOrientation: 'vertical',
                        leftCell: 'opening-sash',
                        rightCell: 'opening-sash',
                    },
                    definitionsByProfileSetId,
                    standaloneDefinitionsByProfileId,
                    connectionTemplate: sashSashTemplate,
                    placementConnectionTemplate: sashSashTemplate,
                });

                // Recalculate the sash/sash gasket INSERT transforms against the
                // exact gasket geometry that will actually be rendered by the T
                // layout.  Copying transforms from sashSashDefinition by legacy
                // key is unsafe: the mixed-layout and sash/sash legacy instances
                // can use different source INSERT transforms even when they share
                // profile ID 245472.  A transform composed for one source instance
                // can therefore make the other instance fly away, and a missing
                // legacy-key match can silently drop the opposite-side gasket.
                const tVerticalPlacementDefinition =
                    applyOpeningSashDividerConnectionPlacements({
                        definition: {
                            ...registeredDefinition,
                            metadata: {
                                ...registeredDefinition.metadata,
                                dividerOrientation: 'vertical',
                            },
                        },
                        dividerConnectionTemplate: sashSashTemplate,
                    });

                registeredDefinition = {
                    ...registeredDefinition,
                    metadata: {
                        ...registeredDefinition.metadata,
                        tLayoutVerticalDividerConnection:
                            sashSashDefinition.metadata?.dividerConnection || null,
                        tLayoutVerticalOpeningConnections:
                            tVerticalPlacementDefinition.metadata
                                ?.dividerOpeningSashConnections
                                || sashSashDefinition.metadata?.dividerOpeningSashConnections
                                || null,
                    },
                    profiles: registeredDefinition.profiles.map((profile, index) => {
                        const verticalProfile =
                            tVerticalPlacementDefinition.profiles[index] || null;
                        const verticalTransforms =
                            verticalProfile?.mullionConnectionCadTransforms || {};
                        if (!Object.keys(verticalTransforms).length) return profile;
                        return {
                            ...profile,
                            tLayoutVerticalMullionConnectionCadTransforms:
                                verticalTransforms,
                            tLayoutVerticalMullionConnectionProfileId:
                                verticalProfile.mullionConnectionProfileId || null,
                            tLayoutVerticalMullionConnectionOccurrenceIndexes:
                                verticalProfile.mullionConnectionOccurrenceIndexes || {},
                            tLayoutVerticalMullionConnectionPlacementMethods:
                                verticalProfile.mullionConnectionPlacementMethods || {},
                        };
                    }),
                };
            }

            let definition = composeSupplementalAccessoryProfiles({
                definition: registeredDefinition,
                definitionsByProfileSetId,
            });

            // Outer-frame accessories use the same CAD-driven placement model
            // as mullion accessories. 200988 geometry still comes from its
            // reusable accessory source, while its exact frame-side seat comes
            // from frame-sash-window.dwg.
            definition = applyFrameAccessoryConnectionPlacements({
                definition,
                frameConnectionTemplate: openingSashFrameTemplate,
            });

            // Optional mullion/transom accessories are sourced from the exact
            // INSERTs in the active join CAD. This happens after supplemental
            // legacy geometry is loaded so a join can provide placement while
            // the existing B2 source still provides the reusable 2D section.
            definition = applyDividerAccessoryConnectionPlacements({
                definition,
                dividerConnectionTemplate: connectionTemplate,
            });

            if (tLayoutVerticalConnectionTemplate) {
                const verticalAccessoryDefinition =
                    applyDividerAccessoryConnectionPlacements({
                        definition,
                        dividerConnectionTemplate: tLayoutVerticalConnectionTemplate,
                    });
                const verticalAccessoryMetadata =
                    verticalAccessoryDefinition.metadata?.dividerMountedAccessories || null;

                definition = {
                    ...definition,
                    metadata: {
                        ...definition.metadata,
                        tLayoutVerticalDividerMountedAccessories:
                            verticalAccessoryMetadata,
                    },
                    profiles: definition.profiles.map((profile, index) => {
                        const verticalProfile =
                            verticalAccessoryDefinition.profiles[index] || null;
                        const verticalTransforms =
                            verticalProfile?.mullionAccessoryCadTransforms || {};
                        if (!Object.keys(verticalTransforms).length) return profile;
                        return {
                            ...profile,
                            tLayoutVerticalMullionAccessoryCadTransforms:
                                verticalTransforms,
                            tLayoutVerticalMullionAccessoryProfileId:
                                verticalProfile.mullionAccessoryProfileId || null,
                            tLayoutVerticalMullionAccessoryOccurrenceIndexes:
                                verticalProfile.mullionAccessoryOccurrenceIndexes || {},
                            tLayoutVerticalMullionAccessoryPlacementMethods:
                                verticalProfile.mullionAccessoryPlacementMethods || {},
                        };
                    }),
                };
            }

            currentMetadata = definition.metadata;
            profilesData = definition.profiles.map((profile, index) => ({
                ...profile,
                index,
                legacyIndex: profile.legacyIndex ?? profile.index,
                material: getMaterialForProfile(profile),
            }));
            currentSelectionSignature = selectionSignature;
            initializeAccessoryProfiles(profilesData);
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
            currentSelectionSignature = null;
            windowBuilder?.setProfileData(null, []);
            console.error('Error loading the selected frame and sash profiles:', error);
            if (isARMode) {
                getARController()?.setARStatus(
                    `The configured profiles could not be loaded: ${error.message}`,
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

    async function loadProfiles(profileFolder) {
        return loadProfileSelection({ profileSetId: profileFolder, profile: profileFolder });
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
        updateColorFilterToggles,
        renderPartToggles,
        renderGroupFilters,
        loadProfiles,
        loadProfileSelection,
        refreshProfileMaterials,
        getProfilesData: () => profilesData,
        getProfilesReady: () => profilesReady,
        getCurrentMetadata: () => currentMetadata,
        getCurrentSelectionSignature: () => currentSelectionSignature,
        hasCurrentMetadata: () => Boolean(currentMetadata),
    };
}
