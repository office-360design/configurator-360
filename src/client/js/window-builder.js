import * as THREE from 'three';
import { WINDOW_WIDTH_MAX_M, normalizeHexColour } from './config.js';
import {
    PROFILE_CURVE_SEGMENTS,
    createRoundedRectShape,
} from './geometry-utils.js';
import { getHouseDimensions } from './house-config.js';
import { createHouseBuilder } from './house-builder.js';

const S = 0.001;

export function createWindowBuilder({
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
    getFinishState,
    getSelectedHandleSide,
}) {
    let currentMetadata = null;
    let profilesData = [];

    // EXPLOSION REGISTER
    let isExploded = (isARMode && pageParams.get('explode') === '1') || document.getElementById('cExplode').checked;
    let explodeProgress = 0;
    let explodableObjects = [];

    function registerExplode(obj, dx, dy, dz) {
        obj.userData.basePos = obj.position.clone();
        obj.userData.explodeDir = new THREE.Vector3(dx, dy, dz);
        explodableObjects.push(obj);
    }

    const EXPLODE_Z_OFFSETS = {
        frame: 0.0,
        sash: 0.25,
        bead: 0.75
    };

    function bboxDistance(boxA, boxB) {
        if (!boxA || !boxB) return Infinity;
        const distX = Math.max(0, boxA.minX - boxB.maxX, boxB.minX - boxA.maxX);
        const distY = Math.max(0, boxA.minY - boxB.maxY, boxB.minY - boxA.maxY);
        return Math.hypot(distX, distY);
    }

    // 3D SAMPLE EXTRUSION GENERATOR (10CM)
    function createSampleExtrusion(profile) {
        // Use the same thickness-aware template as the full window. Using
        // profile.shape here locked the section sample to the original 573940
        // glazing bead even after the glass thickness selected 573930/573920.
        const activeShape = getProfileShape(profile);
        const extrudeSettings = { depth: 0.1, bevelEnabled: false, curveSegments: PROFILE_CURVE_SEGMENTS, steps: 1 };
        const geom = new THREE.ExtrudeGeometry(activeShape, extrudeSettings);
        const posAttribute = geom.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i);

            // Reconstruct CAD coordinates from SVG Space (X=x, Y=-y)
            let x_cad = v.x + getProfileCadXShiftMm(profile);
            let y_cad = -v.y;

            // Center X coordinates around 0
            let x_norm = x_cad - currentMetadata.globalCenterX;

            // Normalize Y coordinate based on drawing type (Horizontal vs Vertical)
            let y_norm;
            if (currentMetadata.isVertical) {
                if (profile.section === 'bottom') {
                    y_norm = y_cad - currentMetadata.globalMinY;
                } else {
                    y_norm = currentMetadata.globalMaxY - y_cad;
                }
            } else {
                y_norm = y_cad - currentMetadata.globalMinY;
            }

            let u = x_norm * S;
            let inw = y_norm * S;

            // Map to extruded local coordinate space
            // Keep v.z as the extrusion coordinate (0 to 0.1)
            // Add a small local offset per part index to prevent z-fighting at boundaries
            let zOffset = profile.index * 0.0001;
            let finalZ = v.z === 0 ? -zOffset : v.z + zOffset;

            posAttribute.setXYZ(i, u, inw, finalZ);
        }
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, profile.material);
        mesh.castShadow = !captureMode;
        mesh.receiveShadow = !captureMode;
        return mesh;
    }

    const templateGeometryCache = new Map();

    function getTemplateGeometry(profile) {
        const shape = getProfileShape(profile);
        const activeBead = getActiveGlazingBeadCode();
        const activeGasket = getActiveGasketCode();
        const cacheKey = `${profile.index}:${activeBead}:${activeGasket}`;

        if (!templateGeometryCache.has(cacheKey)) {
            const extrudeSettings = { depth: 1.0, bevelEnabled: false, curveSegments: 8, steps: 1 };
            const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            templateGeometryCache.set(cacheKey, geom);
        }

        return templateGeometryCache.get(cacheKey);
    }

    function clearTemplateGeometryCache() {
        for (const geom of templateGeometryCache.values()) {
            geom.dispose();
        }
        templateGeometryCache.clear();
    }

    // MITER ENGINE EXTRUDER
    function createMiteredSide(profile, lengthA, lengthB, side, expDist) {
        const isHorizontal = side === 'bottom' || side === 'top';
        const length = isHorizontal ? lengthA : lengthB;

        const templateGeom = getTemplateGeometry(profile);
        const geom = templateGeom.clone();

        const posAttribute = geom.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i);

            // Reconstruct CAD coordinates from SVG Space (X=x, Y=-y)
            let x_cad = v.x + getProfileCadXShiftMm(profile);
            let y_cad = -v.y;

            // Center X coordinates around 0
            let x_norm = x_cad - currentMetadata.globalCenterX;

            // Normalize Y coordinate based on drawing type (Horizontal vs Vertical)
            let y_norm;
            if (currentMetadata.isVertical) {
                // For vertical profile: Top is Frame (inw=0), Bottom is Sash (inw=max)
                if (profile.section === 'bottom') {
                    y_norm = y_cad - currentMetadata.globalMinY;
                } else {
                    y_norm = currentMetadata.globalMaxY - y_cad;
                }
            } else {
                // For horizontal profile: Bottom is Frame (inw=0), Top is Sash (inw=max)
                y_norm = y_cad - currentMetadata.globalMinY;
            }

            let u = x_norm * S;       // Profile depth (Z axis in 3D profile space)
            let inw = y_norm * S;     // Profile height (inward distance to glass)

            // Scale v.z (which is between 0 and 1.0 in the template) to the new length
            let zScaled = v.z * length;
            let zRaw = zScaled - length / 2;

            // Calculate the 45-degree miter corner cut
            let z_cut = zRaw > 0 ? zRaw - inw : zRaw + inw;

            // Orient the side correctly around the window frame
            let xw, yw, zw = u;

            if (side === 'bottom') {
                xw = -z_cut;
                yw = -lengthB / 2 + inw;
            }
            else if (side === 'top') {
                xw = z_cut;
                yw = lengthB / 2 - inw;
            }
            else if (side === 'left') {
                xw = -lengthA / 2 + inw;
                yw = z_cut;
            }
            else if (side === 'right') {
                xw = lengthA / 2 - inw;
                yw = -z_cut;
            }

            posAttribute.setXYZ(i, xw, yw, zw);
        }

        posAttribute.needsUpdate = true;

        // Recalculate lighting normals from the final transformed and mitered geometry.
        geom.deleteAttribute('normal');
        geom.computeVertexNormals();
        geom.normalizeNormals();

        geom.computeBoundingBox();
        geom.computeBoundingSphere();

        const mesh = new THREE.Mesh(geom, profile.material);
        mesh.castShadow = !captureMode;
        mesh.receiveShadow = !captureMode;

        const group = getProfileGroup(profile);
        mesh.userData.componentSelection = {
            name: getProfileComponentNumber(profile),
            source: group,
            profileIndex: profile.index,
            side,
        };
        componentSelection.add(mesh);

        // Map each group to its outward explosion offset (X/Y)
        const EXPLODE_XY_OFFSETS = {
            frame: 0.12,
            sash: 0.26,
            bead: 0.26
        };
        const actualExpDist = EXPLODE_XY_OFFSETS[group] !== undefined ? EXPLODE_XY_OFFSETS[group] : expDist;

        // Explode directions
        let expX = 0, expY = 0;
        if (side === 'bottom') expY = -actualExpDist;
        if (side === 'top') expY = actualExpDist;
        if (side === 'left') expX = -actualExpDist;
        if (side === 'right') expX = actualExpDist;

        const expZ = EXPLODE_Z_OFFSETS[group] !== undefined ? EXPLODE_Z_OFFSETS[group] : 0.0;

        registerExplode(mesh, expX, expY, expZ);
        return mesh;
    }

    // SCENE ELEMENTS
    const placementRoot = new THREE.Group();
    const mainGroup = new THREE.Group();
    const pivotOscilo = new THREE.Group();
    const pivotBatant = new THREE.Group();
    let handleLeverGroup = new THREE.Group();
    placementRoot.add(mainGroup);
    placementRoot.visible = !isARMode;
    scene.add(placementRoot);

    const { buildHouse } = createHouseBuilder({
        scene,
        ground,
        gridHelper,
        isARMode,
        captureMode,
    });

    function getHouseExplodedWindowForwardOffset() {
        const showHouse = document.getElementById('cShowHouse')?.checked === true;
        if (isARMode || !showHouse) {
            return 0;
        }

        const width = Number.parseFloat(document.getElementById('widthA')?.value)
            || WINDOW_WIDTH_MAX_M;
        const height = Number.parseFloat(document.getElementById('heightB')?.value) || 1.5;
        const houseDimensions = getHouseDimensions(width, height);

        // Pull the whole window slightly toward the camera while exploded so
        // no frame sections appear embedded inside the front wall thickness.
        return houseDimensions.wallThickness + 0.05;
    }

    function applyExplodedWindowForwardOffset(progress) {
        mainGroup.position.z = getHouseExplodedWindowForwardOffset() * progress;
    }

    const sectionGroup = new THREE.Group();
    // Positioned in front of the camera, floating at eye level
    sectionGroup.position.set(0.7, 0.35, 1.1);
    sectionGroup.visible = !isARMode && !captureMode;
    scene.add(sectionGroup);

    function profileCadCenterX(profile) {
        const bbox = getEffectiveProfileBbox(profile);
        return bbox ? (bbox.minX + bbox.maxX) / 2 : 0;
    }

    function profileCadCenterY(profile) {
        const bbox = getEffectiveProfileBbox(profile);
        return bbox ? (bbox.minY + bbox.maxY) / 2 : 0;
    }

    function isFixedGlassAnchorGasket(profile) {
        return String(profile?.blockName || '').includes('224063');
    }

    function isMovingGlazingBeadGasket(profile) {
        return String(profile?.blockName || '').includes('224378') || profile.isGasketTemplate === true;
    }

    function resolveAnchoredGlassDepth(cavity, thicknessMm, fallbackCenterZ) {
        if (!cavity) {
            return {
                centerZ: fallbackCenterZ,
                anchorGasket: null,
                movingGasket: null,
                fixedFaceCadX: null,
                movingFaceCadX: null,
                direction: 0,
            };
        }

        const pair = [cavity.leftGasket, cavity.rightGasket];
        const anchorGasket = pair.find(isFixedGlassAnchorGasket) || null;
        const movingGasket = pair.find(isMovingGlazingBeadGasket) || null;

        if (!anchorGasket) {
            return {
                centerZ: (cavity.cavityCenterX - currentMetadata.globalCenterX) * S,
                anchorGasket: null,
                movingGasket,
                fixedFaceCadX: null,
                movingFaceCadX: null,
                direction: 0,
            };
        }

        const anchorBbox = getEffectiveProfileBbox(anchorGasket);
        if (!anchorBbox) {
            return {
                centerZ: (cavity.cavityCenterX - currentMetadata.globalCenterX) * S,
                anchorGasket,
                movingGasket,
                fixedFaceCadX: null,
                movingFaceCadX: null,
                direction: 0,
            };
        }

        const anchorIsLeft = profileCadCenterX(anchorGasket) <= cavity.cavityCenterX;
        const direction = anchorIsLeft ? 1 : -1;

        // Keep this glass face fixed beside 224063. Only the opposite face
        // moves when the glass thickness changes.
        const anchorClearanceMm = 1;
        const anchorContactCadX = anchorIsLeft
            ? anchorBbox.maxX
            : anchorBbox.minX;
        const fixedFaceCadX =
            anchorContactCadX + direction * anchorClearanceMm;
        const movingFaceCadX =
            fixedFaceCadX + direction * thicknessMm;
        const centerCadX =
            (fixedFaceCadX + movingFaceCadX) / 2;

        return {
            centerZ: (centerCadX - currentMetadata.globalCenterX) * S,
            anchorGasket,
            movingGasket,
            fixedFaceCadX,
            movingFaceCadX,
            direction,
        };
    }

    function isPotentialGlazingGasket(profile) {
        const effectiveBbox = getEffectiveProfileBbox(profile);
        if (
            !effectiveBbox
            || !Number.isFinite(effectiveBbox.minX)
            || !Number.isFinite(effectiveBbox.maxX)
            || !Number.isFinite(effectiveBbox.minY)
            || !Number.isFinite(effectiveBbox.maxY)
        ) {
            return false;
        }

        const blockName = String(profile.blockName || '').toLowerCase();
        const layer = String(profile.layer || '').toLowerCase();
        const cadColour = normalizeHexColour(profile.baseCadColor);

        // Do not rely only on materialKey: some real gasket blocks are placed
        // on an aluminium CAD layer and therefore get classified as aluminium.
        const gasketIdentity =
            profile.materialKey === 'epdm'
            || profile.materialKey === 'centralSeal'
            || /^(224|244)/.test(blockName)
            || blockName.includes('dicht')
            || layer.includes('epdm')
            || layer.includes('dichtung');

        const gasketColour =
            cadColour === '#ffbf7f'
            || cadColour === '#ea580c'
            || cadColour === '#38bdf8';

        return profile.role === 'sash' && (gasketIdentity || gasketColour);
    }

    function cadYToInwardDistanceMm(cadY, section = 'top') {
        if (currentMetadata.isVertical) {
            // Match createMiteredSide(): the split bottom profile is mapped
            // from globalMinY, while the top/side profile is mapped from
            // globalMaxY.
            if (section === 'bottom') {
                return cadY - Number(currentMetadata.globalMinY);
            }
            return Number(currentMetadata.globalMaxY) - cadY;
        }
        return cadY - Number(currentMetadata.globalMinY);
    }

    function findAutomaticGlazingCavity(section = null) {
        const gasketProfiles = profilesData
            .filter(profile =>
                isPotentialGlazingGasket(profile)
                && (!section || profile.section === section)
            )
            .sort((a, b) => profileCadCenterX(a) - profileCadCenterX(b));

        const candidates = [];

        for (let leftIndex = 0; leftIndex < gasketProfiles.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < gasketProfiles.length; rightIndex += 1) {
                const leftGasket = gasketProfiles[leftIndex];
                const rightGasket = gasketProfiles[rightIndex];
                const leftBbox = getEffectiveProfileBbox(leftGasket);
                const rightBbox = getEffectiveProfileBbox(rightGasket);

                if (!leftBbox || !rightBbox) {
                    continue;
                }

                const cavityMinX = leftBbox.maxX;
                const cavityMaxX = rightBbox.minX;
                const cavityWidthMm = cavityMaxX - cavityMinX;

                if (!Number.isFinite(cavityWidthMm) || cavityWidthMm < 4 || cavityWidthMm > 80) {
                    continue;
                }

                // Opposing glazing gaskets must occupy the same cross-section
                // height. This rejects unrelated seals that merely happen to be
                // separated along the CAD X/depth axis.
                const overlapMinY = Math.max(
                    leftBbox.minY,
                    rightBbox.minY
                );
                const overlapMaxY = Math.min(
                    leftBbox.maxY,
                    rightBbox.maxY
                );
                const overlapHeightMm = overlapMaxY - overlapMinY;

                if (!Number.isFinite(overlapHeightMm) || overlapHeightMm < 1.5) {
                    continue;
                }

                const smallerGasketHeightMm = Math.min(
                    leftBbox.maxY - leftBbox.minY,
                    rightBbox.maxY - rightBbox.minY
                );
                const overlapRatio = overlapHeightMm / Math.max(0.001, smallerGasketHeightMm);

                if (overlapRatio < 0.25) {
                    continue;
                }

                const cavityCenterX = (cavityMinX + cavityMaxX) / 2;

                // Determine the opening-side tip of EACH gasket separately.
                // Using only the common overlap was too conservative and left
                // a visible gap on profiles where one sealing lip extends
                // farther toward the opening.
                const resolvedSection =
                    section
                    || leftGasket.section
                    || rightGasket.section
                    || 'top';

                const leftEdgeInsetMm = Math.min(
                    cadYToInwardDistanceMm(leftBbox.minY, resolvedSection),
                    cadYToInwardDistanceMm(leftBbox.maxY, resolvedSection)
                );
                const rightEdgeInsetMm = Math.min(
                    cadYToInwardDistanceMm(rightBbox.minY, resolvedSection),
                    cadYToInwardDistanceMm(rightBbox.maxY, resolvedSection)
                );

                // Extend the pane to the outermost gasket lip, then seat it
                // slightly behind the lip so no background line remains visible.
                const openingSideInsetMm = Math.min(leftEdgeInsetMm, rightEdgeInsetMm);
                const gasketSeatMm = Math.min(
                    6,
                    Math.max(2, overlapHeightMm * 0.35)
                );
                const glazingInsetMm = Math.max(0, openingSideInsetMm - gasketSeatMm);

                // Prefer strong Y overlap and realistic insulating-glass depth.
                const targetWidthMm = 28;
                const widthPenalty = Math.abs(cavityWidthMm - targetWidthMm) * 0.35;
                const overlapPenalty = (1 - Math.min(1, overlapRatio)) * 30;

                candidates.push({
                    leftGasket,
                    rightGasket,
                    cavityMinX,
                    cavityMaxX,
                    cavityWidthMm,
                    cavityCenterX,
                    overlapMinY,
                    overlapMaxY,
                    overlapHeightMm,
                    overlapRatio,
                    glazingInsetMm,
                    score: widthPenalty + overlapPenalty,
                });
            }
        }

        candidates.sort((a, b) => a.score - b.score);
        return candidates[0] || null;
    }

    function resolveGlassPlacement(fallbackCenterZ) {
        // Top/left/right use the top cross-section in split vertical profiles.
        // Bottom uses the bottom cross-section. For non-split profiles the same
        // detected cavity is used on every side.
        const defaultCavity = findAutomaticGlazingCavity();
        const topCavity = currentMetadata.hasSplit
            ? (findAutomaticGlazingCavity('top') || defaultCavity)
            : defaultCavity;
        const bottomCavity = currentMetadata.hasSplit
            ? (findAutomaticGlazingCavity('bottom') || topCavity || defaultCavity)
            : defaultCavity;

        const depthCavity = topCavity || bottomCavity || defaultCavity;
        const requestedThicknessMm = Math.min(
            29,
            Math.max(16, Number.parseFloat(glassThicknessInput.value) || 24)
        );

        if (!depthCavity) {
            glassThicknessInput.max = '29';
            glassThicknessInput.value = String(requestedThicknessMm);
            if (glassThicknessLabel) {
                glassThicknessLabel.textContent = `${requestedThicknessMm.toFixed(0)} mm`;
            }

            return {
                centerZ: fallbackCenterZ,
                thicknessMm: requestedThicknessMm,
                leftInsetMm: 100,
                rightInsetMm: 100,
                topInsetMm: 100,
                bottomInsetMm: 100,
                cavity: null,
            };
        }

        // The available bead catalogue defines the supported range.
        // Do not let the legacy cavity-width heuristic reduce the UI maximum.
        const effectiveThicknessMm = Math.min(29, Math.max(16, requestedThicknessMm));

        glassThicknessInput.min = '16';
        glassThicknessInput.max = '29';
        glassThicknessInput.value = String(effectiveThicknessMm);
        if (glassThicknessLabel) {
            glassThicknessLabel.textContent = `${effectiveThicknessMm.toFixed(0)} mm`;
        }

        const topSideInsetMm = Math.min(
            250,
            Math.max(0, (topCavity || depthCavity).glazingInsetMm)
        );
        const bottomInsetMm = Math.min(
            250,
            Math.max(0, (bottomCavity || depthCavity).glazingInsetMm)
        );



        const anchoredDepth = resolveAnchoredGlassDepth(
            depthCavity,
            effectiveThicknessMm,
            fallbackCenterZ
        );

        return {
            centerZ: anchoredDepth.centerZ,
            thicknessMm: effectiveThicknessMm,
            leftInsetMm: topSideInsetMm,
            rightInsetMm: topSideInsetMm,
            topInsetMm: topSideInsetMm,
            bottomInsetMm,
            cavity: depthCavity,
            anchorGasket: anchoredDepth.anchorGasket,
            movingGasket: anchoredDepth.movingGasket,
            fixedFaceCadX: anchoredDepth.fixedFaceCadX,
            movingFaceCadX: anchoredDepth.movingFaceCadX,
            depthDirection: anchoredDepth.direction,
        };
    }

    function clearGeneratedGroup(group, sharedGeometries = null) {
        const shared = sharedGeometries || new Set();

        group.traverse(child => {
            if (child.geometry && !shared.has(child.geometry)) {
                child.geometry.dispose();
            }

            // Only sprites own unique materials/textures. Window meshes use
            // shared cached materials and must not dispose them here.
            if (child.isSprite && child.material) {
                child.material.map?.dispose();
                child.material.dispose();
            }
        });

        group.clear();
    }

    const dimLineMaterial = new THREE.LineBasicMaterial({
        color: 0x38bdf8
    });

    function createLabelSprite(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;

        // Draw capsule background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // dark slate
        ctx.strokeStyle = '#38bdf8'; // sky blue border
        ctx.lineWidth = 4;

        const x = 32;
        const y = 32;
        const w = 192;
        const h = 64;
        const r = 32; // fully rounded corners

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#eff6ff'; // off white
        ctx.font = 'bold 28px Outfit, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.35, 0.175, 1);
        return sprite;
    }

    function buildDimensionLines(A, B) {
        const dimensionsGroup = new THREE.Group();
        mainGroup.add(dimensionsGroup);

        const zPos = 0.052;
        const tickSize = 0.04;
        const offset = 0.15;

        function addLineSegment(p1, p2) {
            const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
            const line = new THREE.Line(geom, dimLineMaterial);
            dimensionsGroup.add(line);
        }

        // 1. TOP DIMENSION (Width)
        // const topY = B / 2 + offset;
        // addLineSegment(new THREE.Vector3(-A / 2, topY, zPos), new THREE.Vector3(A / 2, topY, zPos));
        // addLineSegment(new THREE.Vector3(-A / 2, topY - tickSize, zPos), new THREE.Vector3(-A / 2, topY + tickSize, zPos));
        // addLineSegment(new THREE.Vector3(A / 2, topY - tickSize, zPos), new THREE.Vector3(A / 2, topY + tickSize, zPos));

        // const topLabel = createLabelSprite(`${Math.round(A * 1000)} mm`);
        // topLabel.position.set(0, topY, zPos);
        // dimensionsGroup.add(topLabel);

        // 2. BOTTOM DIMENSION (Width)
        const bottomY = -B / 2 - offset;
        addLineSegment(new THREE.Vector3(-A / 2, bottomY, zPos), new THREE.Vector3(A / 2, bottomY, zPos));
        addLineSegment(new THREE.Vector3(-A / 2, bottomY - tickSize, zPos), new THREE.Vector3(-A / 2, bottomY + tickSize, zPos));
        addLineSegment(new THREE.Vector3(A / 2, bottomY - tickSize, zPos), new THREE.Vector3(A / 2, bottomY + tickSize, zPos));

        const bottomLabel = createLabelSprite(`${Math.round(A * 1000)} mm`);
        bottomLabel.position.set(0, bottomY, zPos);
        dimensionsGroup.add(bottomLabel);

        // 3. LEFT DIMENSION (Height)
        const leftX = -A / 2 - offset;
        addLineSegment(new THREE.Vector3(leftX, -B / 2, zPos), new THREE.Vector3(leftX, B / 2, zPos));
        addLineSegment(new THREE.Vector3(leftX - tickSize, -B / 2, zPos), new THREE.Vector3(leftX + tickSize, -B / 2, zPos));
        addLineSegment(new THREE.Vector3(leftX - tickSize, B / 2, zPos), new THREE.Vector3(leftX + tickSize, B / 2, zPos));

        const leftLabel = createLabelSprite(`${Math.round(B * 1000)} mm`);
        leftLabel.position.set(leftX, 0, zPos);
        dimensionsGroup.add(leftLabel);

        // 4. RIGHT DIMENSION (Height)
        const rightX = A / 2 + offset;
        // addLineSegment(new THREE.Vector3(rightX, -B / 2, zPos), new THREE.Vector3(rightX, B / 2, zPos));
        // addLineSegment(new THREE.Vector3(rightX - tickSize, -B / 2, zPos), new THREE.Vector3(rightX + tickSize, -B / 2, zPos));
        // addLineSegment(new THREE.Vector3(rightX - tickSize, B / 2, zPos), new THREE.Vector3(rightX + tickSize, B / 2, zPos));

        // const rightLabel = createLabelSprite(`${Math.round(B * 1000)} mm`);
        // rightLabel.position.set(rightX, 0, zPos);
        // dimensionsGroup.add(rightLabel);

        // 5. SECTION WIDTH / DEPTH DIMENSION (Z axis)
        const depthX = -A / 2 - offset;
        const depthY = -B / 2 - offset;

        const isDrainageCoverCap = profile =>
            String(profile.baseCadColor || '').toLowerCase() === '#cc9966';

        function calculateSectionBounds(sectionProfiles) {
            let minX = Infinity;
            let maxX = -Infinity;

            sectionProfiles.forEach(profile => {
                const bbox = getEffectiveProfileBbox(profile);
                if (!bbox) return;

                minX = Math.min(minX, bbox.minX);
                maxX = Math.max(maxX, bbox.maxX);
            });

            return { minX, maxX };
        }

        // Use the top section because the drainage cover cap belongs to the
        // bottom section and should not affect the displayed section depth.
        let dimensionProfiles = profilesData.filter(profile => {
            const toggle = document.getElementById(`toggle_${profile.index}`);
            const isVisible = toggle ? toggle.checked : true;

            return (
                isVisible &&
                profile.section === 'top' &&
                !isDrainageCoverCap(profile)
            );
        });

        let sectionBounds = calculateSectionBounds(dimensionProfiles);

        // Fallback for CAD profiles that do not have top/bottom section metadata.
        if (
            !Number.isFinite(sectionBounds.minX) ||
            !Number.isFinite(sectionBounds.maxX)
        ) {
            dimensionProfiles = profilesData.filter(profile => {
                const toggle = document.getElementById(`toggle_${profile.index}`);
                const isVisible = toggle ? toggle.checked : true;

                return isVisible && !isDrainageCoverCap(profile);
            });

            sectionBounds = calculateSectionBounds(dimensionProfiles);
        }

        const sectionZMin =
            (sectionBounds.minX - currentMetadata.globalCenterX) * S;

        const sectionZMax =
            (sectionBounds.maxX - currentMetadata.globalCenterX) * S;

        const sectionDepthMm = Math.round(
            sectionBounds.maxX - sectionBounds.minX
        );

        // main depth line
        addLineSegment(
            new THREE.Vector3(depthX, depthY, sectionZMin),
            new THREE.Vector3(depthX, depthY, sectionZMax)
        );

        // end ticks
        addLineSegment(
            new THREE.Vector3(depthX - tickSize, depthY, sectionZMin),
            new THREE.Vector3(depthX + tickSize, depthY, sectionZMin)
        );
        addLineSegment(
            new THREE.Vector3(depthX - tickSize, depthY, sectionZMax),
            new THREE.Vector3(depthX + tickSize, depthY, sectionZMax)
        );

        // label
        const depthLabel = createLabelSprite(`${sectionDepthMm} mm`);
        depthLabel.position.set(
            depthX,
            depthY - 0.05,
            (sectionZMin + sectionZMax) / 2
        );
        dimensionsGroup.add(depthLabel);
    }

    let lastSectionSampleSignature = '';

    function rebuildSectionSamplesIfNeeded(activeProfiles) {
        if (isARMode || captureMode) {
            return;
        }

        const {
            aluminiumFinishMode,
            outsideFinishSelection,
            insideFinishSelection,
        } = getFinishState();

        const signature = [
            profileInput.value,
            aluminiumFinishMode,
            outsideFinishSelection.type,
            outsideFinishSelection.color,
            insideFinishSelection.type,
            insideFinishSelection.color,
            getActiveGlazingBeadCode(),
            getActiveGasketCode(),
            activeProfiles.map(profile => profile.index).join(','),
        ].join('|');

        if (signature === lastSectionSampleSignature) {
            return;
        }

        clearGeneratedGroup(sectionGroup);
        lastSectionSampleSignature = signature;

        activeProfiles.forEach(profile => {
            const sampleMesh = createSampleExtrusion(profile);

            if (currentMetadata.hasSplit) {
                if (profile.section === 'top') {
                    sampleMesh.rotation.x = Math.PI;
                    sampleMesh.position.y = 0.28;
                } else if (profile.section === 'bottom') {
                    sampleMesh.position.y = 0;
                }
            }

            sectionGroup.add(sampleMesh);
        });

        sectionGroup.lookAt(camera.position);
    }



    function buildWindow() {
        if (!currentMetadata) return;
        const t_start = performance.now();

        componentSelection.reset();

        // Generated geometries are unique and must be disposed. Materials are
        // shared/cached, so disposing them here causes shader recompilation and
        // severe slider lag.
        mainGroup.traverse(child => {
            child.geometry?.dispose();

            if (child.isSprite && child.material) {
                child.material.map?.dispose();
                child.material.dispose();
            }
        });
        mainGroup.clear();
        pivotOscilo.clear();
        pivotBatant.clear();
        explodableObjects = [];
        const t_clear = performance.now();

        const A = parseFloat(document.getElementById('widthA').value);
        const B = parseFloat(document.getElementById('heightB').value);

        // UI text update
        const valWidthEl = document.getElementById('valWidth');
        if (valWidthEl) valWidthEl.innerText = `${Math.round(A * 1000)} mm`;
        const valHeightEl = document.getElementById('valHeight');
        if (valHeightEl) valHeightEl.innerText = `${Math.round(B * 1000)} mm`;

        const frameGroup = new THREE.Group();
        const sashGroup = new THREE.Group();

        const activeProfiles = profilesData.filter(profile => {
            const toggle = document.getElementById(`toggle_${profile.index}`);
            return toggle ? toggle.checked : true;
        });

        // Colour-filter controls only need synchronization after explicit
        // component/filter changes, not during every glass slider frame.

        const t_samples_start = performance.now();
        rebuildSectionSamplesIfNeeded(activeProfiles);
        const t_samples_end = performance.now();

        const showTop = document.getElementById('side_top')?.checked !== false;
        const showBottom = document.getElementById('side_bottom')?.checked !== false;
        const showLeft = document.getElementById('side_left')?.checked !== false;
        const showRight = document.getElementById('side_right')?.checked !== false;

        const sides = [];
        if (showBottom) sides.push('bottom');
        if (showTop) sides.push('top');
        if (showLeft) sides.push('left');
        if (showRight) sides.push('right');

        // Miter-extrude each active part on all 4 sides of the window
        const t_meshes_start = performance.now();
        activeProfiles.forEach(profile => {
            sides.forEach(side => {
                let useProfile = true;
                if (currentMetadata.isVertical && currentMetadata.hasSplit) {
                    if (profile.section === 'bottom') {
                        useProfile = (side === 'bottom');
                    } else if (profile.section === 'top') {
                        useProfile = (side === 'top' || side === 'left' || side === 'right');
                    }
                }

                if (!useProfile) return;

                const mesh = createMiteredSide(profile, A, B, side, profile.explodeOffset);

                // Group meshes by their resolved group
                if (getProfileGroup(profile) === 'frame') {
                    frameGroup.add(mesh);
                } else {
                    sashGroup.add(mesh);
                }
            });
        });
        const t_meshes_end = performance.now();

        mainGroup.add(frameGroup);

        // Calculate Sash depth dynamically to align Glass and Handle
        let sashMinX = Infinity, sashMaxX = -Infinity;
        profilesData.forEach(p => {
            if (p.role === 'sash' && p.layer.toLowerCase().includes('al')) {
                if (p.bbox.minX < sashMinX) sashMinX = p.bbox.minX;
                if (p.bbox.maxX > sashMaxX) sashMaxX = p.bbox.maxX;
            }
        });

        // If no sash parts are active, fallback to frame
        if (sashMinX === Infinity) {
            sashMinX = currentMetadata.globalMinX;
            sashMaxX = currentMetadata.globalMaxX;
        }

        const sashCenterX = ((sashMinX + sashMaxX) / 2 - currentMetadata.globalCenterX) * S;

        // Glass: place it automatically in the cavity between the two
        // detected glazing gaskets, independently of the selected profile.
        const glassPlacement = resolveGlassPlacement(sashCenterX);
        const leftInset = glassPlacement.leftInsetMm * S;
        const rightInset = glassPlacement.rightInsetMm * S;
        const topInset = glassPlacement.topInsetMm * S;
        const bottomInset = glassPlacement.bottomInsetMm * S;

        const glassW = Math.max(0.05, A - leftInset - rightInset);
        const glassH = Math.max(0.05, B - topInset - bottomInset);
        const glassCenterX = (leftInset - rightInset) / 2;
        const glassCenterY = (bottomInset - topInset) / 2;

        const glass = new THREE.Mesh(
            new THREE.BoxGeometry(
                glassW,
                glassH,
                glassPlacement.thicknessMm * S
            ),
            glassMat
        );
        glass.position.set(glassCenterX, glassCenterY, glassPlacement.centerZ);
        glass.castShadow = !captureMode;
        glass.receiveShadow = !captureMode;
        glass.userData.glazingCavity = glassPlacement.cavity
            ? {
                leftGasketIndex: glassPlacement.cavity.leftGasket.index,
                rightGasketIndex: glassPlacement.cavity.rightGasket.index,
                cavityWidthMm: glassPlacement.cavity.cavityWidthMm,
                overlapHeightMm: glassPlacement.cavity.overlapHeightMm,
                leftInsetMm: glassPlacement.leftInsetMm,
                rightInsetMm: glassPlacement.rightInsetMm,
                topInsetMm: glassPlacement.topInsetMm,
                bottomInsetMm: glassPlacement.bottomInsetMm,
                anchorGasketIndex: glassPlacement.anchorGasket?.index ?? null,
                movingGasketIndex: glassPlacement.movingGasket?.index ?? null,
                fixedFaceCadX: glassPlacement.fixedFaceCadX,
                movingFaceCadX: glassPlacement.movingFaceCadX,
                depthDirection: glassPlacement.depthDirection,
            }
            : null;

        registerExplode(glass, 0, 0, 0.5); // Explode forward
        sashGroup.add(glass);

        // Handle
        const handleBase = new THREE.Group();

        // --- backplate: stretched circle / rounded capsule plate ---
        const plateShape = createRoundedRectShape(0.04, 0.1, 0.027);
        const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
            depth: 0.005,
            bevelEnabled: false,
            curveSegments: 20
        });
        plateGeo.translate(0, 0, -0.007);

        const plate = new THREE.Mesh(plateGeo, handleMat);
        plate.castShadow = !captureMode;
        plate.receiveShadow = !captureMode;
        handleBase.add(plate);

        // --- rotation group for the moving handle part ---
        const isLeftHandle = (getSelectedHandleSide() === 'left');
        const defaultRot = document.getElementById('mBatant').checked
            ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
            : (isLeftHandle ? Math.PI : -Math.PI);
        const previousRotationZ = handleLeverGroup ? handleLeverGroup.rotation.z : defaultRot;

        handleLeverGroup = new THREE.Group();
        handleLeverGroup.rotation.z = previousRotationZ;

        // --- cylinder neck between plate and lever ---
        const neckShape = new THREE.Shape();
        neckShape.lineTo(0, 0.01);
        let centerX = 0;
        let centerY = 0;
        let radius = 0.01;
        let segments = 32;

        for (let i = 1; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;

            const x = centerX + Math.sin(angle) * radius;
            const y = centerY + Math.cos(angle) * radius;

            neckShape.lineTo(x, y);
        }

        const neckGeo = new THREE.ExtrudeGeometry(neckShape, {
            depth: 0.014,
            bevelEnabled: false,
            curveSegments: 24
        });
        neckGeo.center();
        neckGeo.translate(0, 0, -0.001);

        const neck = new THREE.Mesh(neckGeo, handleMat);
        neck.position.set(0, 0, 0.006)
        neck.castShadow = !captureMode;
        neck.receiveShadow = !captureMode;

        // Add it to the fixed base, not the rotating lever group.
        handleBase.add(neck);

        // --- lever: stretched body with rounded lower end ---
        const leverShape = new THREE.Shape();
        leverShape.moveTo(-0.01, 0.055);

        centerX = 0;
        centerY = 0.055;
        radius = 0.01;
        segments = 16;

        for (let i = 1; i <= segments; i++) {
            const angle = 3 * Math.PI / 2 + (i / segments) * Math.PI;

            const x = centerX + Math.sin(angle) * radius;
            const y = centerY + Math.cos(angle) * radius;

            leverShape.lineTo(x, y);
        }

        leverShape.lineTo(0.01, -0.055);
        leverShape.lineTo(-0.01, -0.055);
        leverShape.lineTo(-0.01, 0.055);

        const leverGeo = new THREE.ExtrudeGeometry(leverShape, {
            depth: 0.012,
            bevelEnabled: false,
            curveSegments: 24
        });
        leverGeo.center();
        leverGeo.translate(0, -0.050, 0.018);

        const lever = new THREE.Mesh(leverGeo, handleMat);
        lever.castShadow = !captureMode;
        lever.receiveShadow = !captureMode;
        handleLeverGroup.add(lever);

        handleBase.add(handleLeverGroup);

        const sashInteriorZ = (sashMaxX - currentMetadata.globalCenterX) * S;
        const handleInwardShift = 0.01;
        const handleX = isLeftHandle ? -A / 2 + leftInset - 0.04 + handleInwardShift : A / 2 - rightInset + 0.04 - handleInwardShift;
        handleBase.position.set(handleX, 0, sashInteriorZ + 0.0075);
        registerExplode(handleBase, isLeftHandle ? -0.26 : 0.26, 0, 0.9);
        sashGroup.add(handleBase);

        // Hinge pivots logic
        const hingeX = isLeftHandle ? (A / 2 - 0.04) : (-A / 2 + 0.04);
        const hingeY = -B / 2 + 0.04;
        const hingeZ = sashCenterX;

        pivotOscilo.position.set(0, hingeY, hingeZ);
        mainGroup.add(pivotOscilo);

        pivotBatant.position.set(hingeX, -hingeY, 0);
        pivotOscilo.add(pivotBatant);

        // Wrap sash inside hinge pivots
        const sashWrapper = new THREE.Group();
        sashWrapper.position.set(-hingeX, 0, -hingeZ);
        sashWrapper.add(sashGroup);
        pivotBatant.add(sashWrapper);

        const t_pics_start = performance.now();
        // Update side-by-side component pictures
        updateComponentPictures();
        const t_pics_end = performance.now();

        const t_house_start = performance.now();
        // Build House Environment
        buildHouse(A, B);
        applyExplodedWindowForwardOffset(explodeProgress);
        const t_house_end = performance.now();

        const t_dims_start = performance.now();
        // Build Dimension Lines
        buildDimensionLines(A, B);
        const t_dims_end = performance.now();

        const t_end = performance.now();
        console.log("PERF:", JSON.stringify({
            total: t_end - t_start,
            clear: t_clear - t_start,
            samples: t_samples_end - t_samples_start,
            meshes: t_meshes_end - t_meshes_start,
            pics: t_pics_end - t_pics_start,
            house: t_house_end - t_house_start,
            dims: t_dims_end - t_dims_start
        }));
    }

    function applyCurrentPoseInstantly() {
        const value = Number.parseFloat(document.getElementById('openAngle').value) || 0;
        const isBatant = document.getElementById('mBatant').checked;
        const isLeftHandle = getSelectedHandleSide() === 'left';

        if (isBatant) {
            const valRad = Math.min(value, 80) * (Math.PI / 180);
            pivotBatant.rotation.y = isLeftHandle ? valRad : -valRad;
            pivotOscilo.rotation.x = 0;
        } else {
            pivotBatant.rotation.y = 0;
            const valRad = Math.min(value, 15) * (Math.PI / 180);
            pivotOscilo.rotation.x = valRad;
        }

        if (handleLeverGroup) {
            handleLeverGroup.rotation.z = isBatant
                ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
                : (isLeftHandle ? Math.PI : -Math.PI);
        }

        const targetExplode = isExploded ? 1 : 0;
        explodeProgress = targetExplode;
        explodableObjects.forEach(object => {
            if (object.userData.basePos && object.userData.explodeDir) {
                object.position.copy(object.userData.basePos)
                    .addScaledVector(object.userData.explodeDir, targetExplode);
            }
        });

        applyExplodedWindowForwardOffset(targetExplode);
        mainGroup.updateWorldMatrix(true, true);
    }

    function updatePoseAnimation() {
        const value = Number.parseFloat(document.getElementById('openAngle').value) || 0;
        const isBatant = document.getElementById('mBatant').checked;
        const valAngleEl = document.getElementById('valAngle');
        if (valAngleEl) {
            valAngleEl.innerText = `${Math.round(value)}°`;
        }

        const isLeftHandle = getSelectedHandleSide() === 'left';

        if (isBatant) {
            const valueRad = Math.min(value, 80) * (Math.PI / 180);
            pivotBatant.rotation.y = isLeftHandle ? valueRad : -valueRad;
            pivotOscilo.rotation.x = 0;
        } else {
            pivotBatant.rotation.y = 0;
            const valueRad = Math.min(value, 15) * (Math.PI / 180);
            pivotOscilo.rotation.x = valueRad;
        }

        const targetRotationZ = isBatant
            ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
            : (isLeftHandle ? Math.PI : -Math.PI);
        if (handleLeverGroup) {
            handleLeverGroup.rotation.z = THREE.MathUtils.lerp(
                handleLeverGroup.rotation.z,
                targetRotationZ,
                0.15
            );
        }

        explodeProgress = THREE.MathUtils.lerp(
            explodeProgress,
            isExploded ? 1 : 0,
            0.08
        );
        explodableObjects.forEach(object => {
            if (object.userData.basePos && object.userData.explodeDir) {
                object.position.copy(object.userData.basePos)
                    .addScaledVector(object.userData.explodeDir, explodeProgress);
            }
        });
        applyExplodedWindowForwardOffset(explodeProgress);
    }

    function setProfileData(metadata, profiles) {
        currentMetadata = metadata;
        profilesData = profiles;
    }

    function invalidateSectionSamples() {
        lastSectionSampleSignature = '';
    }

    function setExploded(value) {
        isExploded = Boolean(value);
    }

    function getIsExploded() {
        return isExploded;
    }

    return {
        placementRoot,
        mainGroup,
        sectionGroup,
        buildWindow,
        applyCurrentPoseInstantly,
        updatePoseAnimation,
        clearTemplateGeometryCache,
        invalidateSectionSamples,
        setProfileData,
        setExploded,
        getIsExploded,
    };
}
