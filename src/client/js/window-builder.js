import * as THREE from 'three';
import { WINDOW_WIDTH_MAX_M, normalizeHexColour } from './config.js';
import {
    PROFILE_CURVE_SEGMENTS,
    createRoundedRectShape,
} from './geometry-utils.js';
import { getHouseDimensions } from './house-config.js';
import { isDrainageCapProfile } from './profile-catalog.js';
import { translateCadTransformSource } from './profile-coordinate-transform.js';
import { createHouseBuilder } from './house-builder.js';
import { splitTriangleAtScalarZero } from './mesh-joint-geometry.js';
import {
    getDividerSegmentAlongCoordinate,
    getDividerCrossSectionMetrics,
    getFixedGlassPanePlacement,
    getHorizontalConnectionFaceDirection,
    getTopFixedBottomSashSashLayout,
    getFrameDividerSocketInset,
    getFrameSidePlacements,
    getLinearDividerLayout,
} from './window-layout-geometry.js';

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
    getProfileCadYShiftMm = () => 0,
    getProfileCadPointMm = (profile, svgX, svgY) => ({
        x: Number(svgX) + getProfileCadXShiftMm(profile),
        y: -Number(svgY) + getProfileCadYShiftMm(profile),
    }),
    getActiveGlazingBeadCode,
    getActiveGasketCode,
    getProfileComponentNumber,
    getEffectiveProfileBbox,
    updateComponentPictures,
    getFinishState,
    getSelectedHandleSide,
    isProfileEnabled = () => true,
    canPlaceProfileOnSide = () => true,
    getWindowLayoutState = () => ({
        layoutId: 'single',
        dividerOrientation: null,
        dividerProfileId: null,
    }),
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
        bead: 0.75,
        divider: 0.12
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

            // Reconstruct and align CAD coordinates from SVG space.
            const cadPoint = getProfileCadPointMm(profile, v.x, v.y);
            const x_cad = cadPoint.x;
            const y_cad = cadPoint.y;

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

    function getDividerSourceBounds(dividerProfiles) {
        const declared = dividerProfiles.find(profile => profile.dividerSourceBounds)
            ?.dividerSourceBounds;
        if (declared) return declared;

        const boxes = dividerProfiles.map(profile => profile.bbox).filter(Boolean);
        if (!boxes.length) return null;
        const minX = Math.min(...boxes.map(bbox => Number(bbox.minX)));
        const maxX = Math.max(...boxes.map(bbox => Number(bbox.maxX)));
        const minY = Math.min(...boxes.map(bbox => Number(bbox.minY)));
        const maxY = Math.max(...boxes.map(bbox => Number(bbox.maxY)));
        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        };
    }

    function getDividerFaceSpanM(dividerProfiles) {
        const bounds = getDividerSourceBounds(dividerProfiles);
        if (!bounds) return 0;
        return getDividerCrossSectionMetrics(bounds).faceSpanM;
    }

    function getFrameJointInwardSpanM(profiles) {
        let maxInwardMm = 0;

        profiles
            .filter(profile => getProfileGroup(profile) === 'frame')
            .forEach(profile => {
                const bbox = getEffectiveProfileBbox(profile);
                if (!bbox) return;

                [bbox.minY, bbox.maxY].forEach(cadY => {
                    const inwardMm = cadYToInwardDistanceMm(cadY, profile.section);
                    if (Number.isFinite(inwardMm)) {
                        maxInwardMm = Math.max(maxInwardMm, inwardMm);
                    }
                });
            });

        return maxInwardMm * S;
    }

    function createDividerSampleExtrusion(profile, bounds) {
        const shape = getProfileShape(profile);
        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: 0.1,
            bevelEnabled: false,
            curveSegments: PROFILE_CURVE_SEGMENTS,
            steps: 1,
        });
        const position = geom.attributes.position;
        const point = new THREE.Vector3();
        const centerX = Number(bounds?.centerX) || 0;
        const centerY = Number(bounds?.centerY) || 0;
        const zOffset = profile.index * 0.0001;

        for (let index = 0; index < position.count; index += 1) {
            point.fromBufferAttribute(position, index);
            const cadPoint = getProfileCadPointMm(profile, point.x, point.y);
            const cadX = cadPoint.x;
            const cadY = cadPoint.y;
            let depth = (centerY - cadY) * S;
            let face = (cadX - centerX) * S;
            if (Number(profile?.dividerSectionRotationDeg) === 180) {
                // Correct only the verified front/back reversal. Keep the
                // standalone mullion section plane; do not rotate it from the
                // join INSERT basis, which caused the 90-degree regression.
                depth = -depth;
                face = -face;
            }
            const extrusion = point.z === 0 ? -zOffset : point.z + zOffset;
            position.setXYZ(index, depth, face, extrusion);
        }

        geom.deleteAttribute('normal');
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, profile.material);
        mesh.castShadow = !captureMode;
        mesh.receiveShadow = !captureMode;
        return mesh;
    }

    function splitBufferGeometryAtScalarZero(geometry, scalarResolver) {
        const source = geometry.index ? geometry.toNonIndexed() : geometry;
        const positions = source.attributes.position;
        const output = [];

        for (let base = 0; base + 2 < positions.count; base += 3) {
            const triangle = [];
            for (let offset = 0; offset < 3; offset += 1) {
                const index = base + offset;
                const point = {
                    x: positions.getX(index),
                    y: positions.getY(index),
                    z: positions.getZ(index),
                };
                triangle.push({
                    ...point,
                    scalar: Number(scalarResolver(point, index)) || 0,
                });
            }

            splitTriangleAtScalarZero(triangle).forEach(splitTriangle => {
                splitTriangle.forEach(point => {
                    output.push(point.x, point.y, point.z);
                });
            });
        }

        const result = new THREE.BufferGeometry();
        result.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
        result.computeBoundingBox();
        result.computeBoundingSphere();

        if (source !== geometry) {
            source.dispose();
        }
        return result;
    }

    function createDividerSegment(
        profile,
        length,
        orientation,
        bounds,
        depthOffset = 0,
        frameInwardSpan = 0,
        perpendicularOffset = 0,
        longitudinalOffset = 0,
        faceDirection = 1,
        longitudinalJoint = null
    ) {
        const shape = getProfileShape(profile);
        const sourceGeom = new THREE.ExtrudeGeometry(shape, {
            depth: 1,
            bevelEnabled: false,
            curveSegments: 8,
            steps: 1,
        });
        const centerX = Number(bounds?.centerX) || 0;
        // The arrow deformation uses abs(faceOffset), which has a kink at the
        // mullion centerline. Split triangles there first so an SVG edge that
        // crosses the center receives a real center vertex and can form a full
        // 90-degree point instead of a flat/trapezoidal end.
        const geom = splitBufferGeometryAtScalarZero(sourceGeom, rawPoint => {
            const cadPoint = getProfileCadPointMm(profile, rawPoint.x, rawPoint.y);
            return cadPoint.x - centerX;
        });
        sourceGeom.dispose();
        const position = geom.attributes.position;
        const point = new THREE.Vector3();
        const centerY = Number(bounds?.centerY) || 0;
        const metrics = getDividerCrossSectionMetrics(bounds);

        for (let index = 0; index < position.count; index += 1) {
            point.fromBufferAttribute(position, index);
            const cadPoint = getProfileCadPointMm(profile, point.x, point.y);
            const cadX = cadPoint.x;
            const cadY = cadPoint.y;
            let sectionDepth = (centerY - cadY) * S;
            let face = (cadX - centerX) * S;
            if (Number(profile?.dividerSectionRotationDeg) === 180) {
                sectionDepth = -sectionDepth;
                face = -face;
            }
            face *= Number(faceDirection) < 0 ? -1 : 1;
            // Keep every standalone mullion component on its exact CAD depth.
            // Unlike the detached 10 cm sample, the assembled divider must not
            // stagger components by profile index; even sub-millimetre offsets
            // make the section appear slightly displaced from the joined frame.
            const depth = sectionDepth + depthOffset;
            const socketInwardSign = Number(longitudinalJoint?.socketInwardSign) || 0;
            const socketInwardOffset = Number(longitudinalJoint?.socketInwardOffset) || 0;
            const socketInwardDistance = socketInwardSign
                ? face * socketInwardSign + socketInwardOffset
                : Math.abs(face);
            const along = getDividerSegmentAlongCoordinate({
                extrusionT: point.z,
                length,
                faceOffset: face,
                faceSpan: metrics.faceSpanM,
                frameInwardSpan,
                negativeFrameInwardSpan: longitudinalJoint?.negativeFrameInwardSpan,
                positiveFrameInwardSpan: longitudinalJoint?.positiveFrameInwardSpan,
                negativeEndMode: longitudinalJoint?.negativeEndMode || 'arrow',
                positiveEndMode: longitudinalJoint?.positiveEndMode || 'arrow',
                socketInwardDistance,
            });

            if (orientation === 'horizontal') {
                position.setXYZ(index, along, -face, depth);
            } else {
                position.setXYZ(index, face, along, depth);
            }
        }

        position.needsUpdate = true;
        geom.deleteAttribute('normal');
        geom.computeVertexNormals();
        geom.computeBoundingBox();
        geom.computeBoundingSphere();

        const mesh = new THREE.Mesh(geom, profile.material);
        // Apply the layout position before registerExplode() captures basePos.
        // Repeated dividers used to be translated only afterwards, so the pose
        // animation reset every copy to (0, 0) and collapsed them into one.
        if (orientation === 'vertical') {
            mesh.position.x = (Number(perpendicularOffset) || 0);
            mesh.position.y = (Number(longitudinalOffset) || 0);
        } else if (orientation === 'horizontal') {
            mesh.position.y = (Number(perpendicularOffset) || 0);
            mesh.position.x = (Number(longitudinalOffset) || 0);
        }
        mesh.castShadow = !captureMode;
        mesh.receiveShadow = !captureMode;
        mesh.userData.componentSelection = {
            name: getProfileComponentNumber(profile),
            source: 'divider',
            componentId: profile.componentId,
            componentType: profile.componentType,
            profileIndex: profile.index,
            legacyIndex: profile.legacyIndex,
            side: orientation,
        };
        componentSelection.add(mesh);

        const explodeDistance = 0.12;
        registerExplode(
            mesh,
            orientation === 'vertical' ? explodeDistance : 0,
            orientation === 'horizontal' ? explodeDistance : 0,
            EXPLODE_Z_OFFSETS.divider
        );
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
    function createMiteredSide(
        profile,
        lengthA,
        lengthB,
        side,
        expDist,
        originX = 0,
        originY = 0,
        dividerJoint = null
    ) {
        const isHorizontal = side === 'bottom' || side === 'top';
        const length = isHorizontal ? lengthA : lengthB;

        const templateGeom = getTemplateGeometry(profile);
        let geom = templateGeom.clone();

        // The divider joint has a real topology break where the two perimeter
        // frame halves stop meeting each other vertically and begin the 45°
        // faces that touch the mullion V. Insert vertices exactly on that break
        // before deformation so one straight SVG edge cannot bridge both regions.
        const dividerJointEnds = new Set(
            Array.isArray(dividerJoint?.localJointEnds) && dividerJoint.localJointEnds.length
                ? dividerJoint.localJointEnds
                : (dividerJoint?.localJointEnd ? [dividerJoint.localJointEnd] : [])
        );
        if (dividerJointEnds.size && Number(dividerJoint.faceSpan) > 0) {
            const halfDividerFace = Number(dividerJoint.faceSpan) / 2;
            const frameInwardSpan = Math.max(
                0,
                Number(dividerJoint.frameInwardSpan) || 0
            );
            const straightContactSpan = Math.max(
                0,
                frameInwardSpan - halfDividerFace
            );
            const unsplitGeom = geom;
            geom = splitBufferGeometryAtScalarZero(unsplitGeom, rawPoint => {
                const cadPoint = getProfileCadPointMm(profile, rawPoint.x, rawPoint.y);
                const yCad = cadPoint.y;
                let inwardMm;
                if (currentMetadata.isVertical) {
                    inwardMm = profile.section === 'bottom'
                        ? yCad - currentMetadata.globalMinY
                        : currentMetadata.globalMaxY - yCad;
                } else {
                    inwardMm = yCad - currentMetadata.globalMinY;
                }
                return inwardMm * S - straightContactSpan;
            });
            unsplitGeom.dispose();
        }

        const posAttribute = geom.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i);

            // Reconstruct and align CAD coordinates from SVG space.
            const cadPoint = getProfileCadPointMm(profile, v.x, v.y);
            const x_cad = cadPoint.x;
            const y_cad = cadPoint.y;

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

            // Outer corners keep the normal full 45-degree miter. At a
            // divider joint, the outer part of the split frame stays vertical
            // on the centre plane so the left/right pieces still touch each
            // other. Only the inner part opens at 45° to receive the mullion V.
            let positiveEndInset = inw;
            let negativeEndInset = inw;
            if (dividerJointEnds.has('positive')) {
                positiveEndInset = getFrameDividerSocketInset({
                    inwardDistance: inw,
                    dividerFaceSpan: dividerJoint.faceSpan,
                    frameInwardSpan: dividerJoint.frameInwardSpan,
                });
            }
            if (dividerJointEnds.has('negative')) {
                negativeEndInset = getFrameDividerSocketInset({
                    inwardDistance: inw,
                    dividerFaceSpan: dividerJoint.faceSpan,
                    frameInwardSpan: dividerJoint.frameInwardSpan,
                });
            }
            let z_cut = zRaw > 0
                ? zRaw - positiveEndInset
                : zRaw + negativeEndInset;

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
        mesh.position.set(originX, originY, 0);
        mesh.castShadow = !captureMode;
        mesh.receiveShadow = !captureMode;

        const group = getProfileGroup(profile);
        mesh.userData.componentSelection = {
            name: getProfileComponentNumber(profile),
            source: group,
            componentId: profile.componentId,
            componentType: profile.componentType,
            profileIndex: profile.index,
            legacyIndex: profile.legacyIndex,
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
    let sashPoseAssemblies = [];
    let lastBuiltHandleSide = null;
    let handleHoldUntil = 0;
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

    function isFrameToSashRebateGasket(profile) {
        return profile?.role === 'frame'
            && String(profile?.blockName || '').includes('245472');
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
            isDrainageCapProfile(profile)
            || String(profile.baseCadColor || '').toLowerCase() === '#cc9966';

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
            getWindowLayoutState().layoutSignature || getWindowLayoutState().layoutId || 'single',
            activeProfiles.map(profile => profile.index).join(','),
        ].join('|');

        if (signature === lastSectionSampleSignature) {
            return;
        }

        clearGeneratedGroup(sectionGroup);
        lastSectionSampleSignature = signature;

        const dividerProfiles = activeProfiles.filter(profile => profile.role === 'divider');
        const standardProfiles = activeProfiles.filter(profile => profile.role !== 'divider');

        standardProfiles.forEach(profile => {
            const sampleProfiles = Array.isArray(profile.sectionSamplePlacements)
                && profile.sectionSamplePlacements.length
                ? profile.sectionSamplePlacements.map(placement => ({
                    ...profile,
                    section: placement.section,
                    cadCoordinateTransform: placement.cadCoordinateTransform
                        || profile.cadCoordinateTransform,
                }))
                : [profile];

            sampleProfiles.forEach(sampleProfile => {
                const sampleMesh = createSampleExtrusion(sampleProfile);

                if (currentMetadata.hasSplit) {
                    if (sampleProfile.section === 'top') {
                        sampleMesh.rotation.x = Math.PI;
                        sampleMesh.position.y = 0.28;
                    } else if (sampleProfile.section === 'bottom') {
                        sampleMesh.position.y = 0;
                    }
                }

                sectionGroup.add(sampleMesh);
            });
        });

        if (dividerProfiles.length) {
            const dividerBounds = getDividerSourceBounds(dividerProfiles);
            const dividerSampleGroup = new THREE.Group();
            dividerProfiles.forEach(profile => {
                dividerSampleGroup.add(
                    createDividerSampleExtrusion(profile, dividerBounds)
                );
            });
            dividerSampleGroup.position.y = currentMetadata.hasSplit ? -0.24 : -0.16;
            sectionGroup.add(dividerSampleGroup);
        }

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
        pivotOscilo.position.set(0, 0, 0);
        pivotOscilo.rotation.set(0, 0, 0);
        pivotBatant.position.set(0, 0, 0);
        pivotBatant.rotation.set(0, 0, 0);
        sashPoseAssemblies = [];
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
        const dividerGroup = new THREE.Group();

        const activeProfiles = profilesData.filter(profile => {
            const toggle = document.getElementById(`toggle_${profile.index}`);
            const componentEnabled = toggle ? toggle.checked : true;
            return componentEnabled && isProfileEnabled(profile);
        });
        const activeDividerProfiles = activeProfiles.filter(profile => profile.role === 'divider');
        const layoutState = getWindowLayoutState();
        const isTopFixedBottomSashSash = layoutState.layoutId === 'top-fixed-bottom-sash-sash'
            || layoutState.layoutKind === 't-grid';
        const dividerOrientation = activeDividerProfiles.length
            ? layoutState.dividerOrientation
            : null;
        const dividerBounds = getDividerSourceBounds(activeDividerProfiles);
        const dividerFaceSpan = Math.min(
            dividerOrientation === 'vertical'
                ? A * 0.3
                : (dividerOrientation === 'horizontal' ? B * 0.3 : Math.min(A, B) * 0.3),
            getDividerFaceSpanM(activeDividerProfiles)
        );
        const frameJointInwardSpan = dividerOrientation
            ? getFrameJointInwardSpanM(activeProfiles)
            : 0;

        let sashA = A;
        let sashB = B;
        let sashOriginX = 0;
        let sashOriginY = 0;
        let openingCells = [{
            id: 'opening',
            width: A,
            height: B,
            centerX: 0,
            centerY: 0,
            joinCellSide: null,
        }];
        let openingCell = openingCells[0];
        const fixedCells = [];
        const layoutCellTypes = dividerOrientation
            ? (
                Array.isArray(layoutState.cells) && layoutState.cells.length >= 2
                    ? [...layoutState.cells]
                    : [
                        layoutState.leftCell || 'fixed-glazing',
                        layoutState.rightCell || 'opening-sash',
                    ]
            )
            : ['opening-sash'];
        const leftCellType = layoutCellTypes[0] || 'fixed-glazing';
        const rightCellType = layoutCellTypes.at(-1) || 'opening-sash';
        // Only the T-layout transom needs to remap the authored CAD join
        // left/right faces onto a reversed top/bottom cell order. The ordinary
        // horizontal-transom layout keeps its previously accepted/default
        // divider face orientation unchanged.
        const tTransomConnectionFaceDirection = isTopFixedBottomSashSash
            ? getHorizontalConnectionFaceDirection({
                lowerCellType: 'opening-sash',
                upperCellType: 'fixed-glazing',
                joinLeftCell: currentMetadata.dividerConnection?.leftCell,
                joinRightCell: currentMetadata.dividerConnection?.rightCell,
            })
            : 1;
        let dividerPositions = [];
        let dividerSeats = [];
        let tLayoutGeometry = null;

        if (isTopFixedBottomSashSash && dividerOrientation) {
            const halfDividerFace = dividerFaceSpan / 2;
            const fixedBoundaryMm = currentMetadata.fixedGlazingConnections
                ?.dividerCellBoundariesMm || {};
            const horizontalOpeningBoundariesMm = currentMetadata.dividerConnection
                ?.openingSashDividerBoundariesMm || {};
            const verticalOpeningBoundariesMm = currentMetadata.tLayoutVerticalDividerConnection
                ?.openingSashDividerBoundariesMm || {};

            const finiteBoundaryM = (value, fallback) => {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric * S : fallback;
            };

            tLayoutGeometry = getTopFixedBottomSashSashLayout({
                width: A,
                height: B,
                topRowFraction: Number(layoutState.topRowFraction) || 0.30,
                horizontalFixedBoundary: finiteBoundaryM(
                    fixedBoundaryMm.left,
                    -halfDividerFace
                ),
                horizontalSashBoundary: finiteBoundaryM(
                    horizontalOpeningBoundariesMm.right,
                    halfDividerFace
                ),
                verticalLeftSashBoundary: finiteBoundaryM(
                    verticalOpeningBoundariesMm.left,
                    -halfDividerFace
                ),
                verticalRightSashBoundary: finiteBoundaryM(
                    verticalOpeningBoundariesMm.right,
                    halfDividerFace
                ),
            });
            openingCells = [...tLayoutGeometry.openingCells];
            fixedCells.push(...tLayoutGeometry.fixedCells);
            openingCell = openingCells[0] || null;
        } else if (dividerOrientation === 'vertical' || dividerOrientation === 'horizontal') {
            const axisLength = dividerOrientation === 'vertical' ? A : B;
            const halfDividerFace = dividerFaceSpan / 2;
            const fixedBoundaryMm = currentMetadata.fixedGlazingConnections
                ?.dividerCellBoundariesMm || {};
            const openingBoundaryMm = Number(
                currentMetadata.dividerConnection
                    ?.openingSashDividerBoundaryFromCenterMm
            );
            const openingBoundarySide = currentMetadata.dividerConnection
                ?.openingSashCellSide || null;
            const openingBoundariesMm = currentMetadata.dividerConnection
                ?.openingSashDividerBoundariesMm || {};
            const minCellSpan = 0.05;

            const resolveLocalBoundary = (joinCellSide, cellType) => {
                const defaultBoundary = joinCellSide === 'left'
                    ? -halfDividerFace
                    : halfDividerFace;

                if (cellType === 'fixed-glazing') {
                    const cadBoundaryMm = Number(fixedBoundaryMm[joinCellSide]);
                    if (Number.isFinite(cadBoundaryMm)) {
                        return cadBoundaryMm * S;
                    }
                }
                if (cellType === 'opening-sash') {
                    const perSideBoundaryMm = Number(openingBoundariesMm[joinCellSide]);
                    if (Number.isFinite(perSideBoundaryMm)) {
                        return perSideBoundaryMm * S;
                    }
                    if (
                        openingBoundarySide === joinCellSide
                        && Number.isFinite(openingBoundaryMm)
                    ) {
                        return openingBoundaryMm * S;
                    }
                }
                return defaultBoundary;
            };

            dividerSeats = [];
            for (let index = 0; index < layoutCellTypes.length - 1; index += 1) {
                dividerSeats.push({
                    left: resolveLocalBoundary('left', layoutCellTypes[index]),
                    right: resolveLocalBoundary('right', layoutCellTypes[index + 1]),
                });
            }

            const linearLayout = getLinearDividerLayout({
                axisLength,
                cellTypes: layoutCellTypes,
                dividerSeats,
                minCellSpan,
            });
            dividerPositions = [...linearLayout.dividerPositions];

            const axisCells = linearLayout.cells.map(cellLayout => {
                const { index, cellType, span, center } = cellLayout;
                const dividerJoinSideByBoundary = dividerOrientation === 'vertical'
                    ? {
                        ...(index > 0 ? { left: 'right' } : {}),
                        ...(index < layoutCellTypes.length - 1 ? { right: 'left' } : {}),
                    }
                    : {
                        ...(index > 0 ? { bottom: 'right' } : {}),
                        ...(index < layoutCellTypes.length - 1 ? { top: 'left' } : {}),
                    };
                const connectionSpan = Number.isFinite(cellLayout.connectionSpan)
                    ? cellLayout.connectionSpan
                    : span;
                const connectionCenter = Number.isFinite(cellLayout.connectionCenter)
                    ? cellLayout.connectionCenter
                    : center;
                const cell = {
                    id: `${cellType === 'opening-sash' ? 'opening' : 'fixed'}-${index}`,
                    cellIndex: index,
                    cellType,
                    width: dividerOrientation === 'vertical' ? span : A,
                    height: dividerOrientation === 'horizontal' ? span : B,
                    centerX: dividerOrientation === 'vertical' ? center : 0,
                    centerY: dividerOrientation === 'horizontal' ? center : 0,
                    fixedAccessoryWidth: dividerOrientation === 'vertical' ? connectionSpan : A,
                    fixedAccessoryHeight: dividerOrientation === 'horizontal' ? connectionSpan : B,
                    fixedAccessoryCenterX: dividerOrientation === 'vertical' ? connectionCenter : 0,
                    fixedAccessoryCenterY: dividerOrientation === 'horizontal' ? connectionCenter : 0,
                    dividerBoundaryX: dividerOrientation === 'vertical'
                        ? (index < dividerPositions.length
                            ? dividerPositions[index] + dividerSeats[index].left
                            : null)
                        : null,
                    dividerBoundaryY: dividerOrientation === 'horizontal'
                        ? (index < dividerPositions.length
                            ? dividerPositions[index] + dividerSeats[index].left
                            : null)
                        : null,
                    dividerJoinSideByBoundary: Object.freeze(dividerJoinSideByBoundary),
                    joinCellSide: layoutCellTypes.length === 2
                        ? (index === 0 ? 'left' : 'right')
                        : null,
                };
                return cell;
            });

            openingCells = axisCells.filter(cell => cell.cellType === 'opening-sash');
            fixedCells.push(...axisCells.filter(cell => cell.cellType === 'fixed-glazing'));
            openingCell = openingCells[0] || null;
        }

        if (openingCell) {
            sashA = openingCell.width;
            sashB = openingCell.height;
            sashOriginX = openingCell.centerX;
            sashOriginY = openingCell.centerY;
        }

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

        // Miter-extrude structural and accessory profiles. The verified vertical
        // connection keeps fixed glazing on the left and the opening sash on the right.
        let sashMinX = Infinity, sashMaxX = -Infinity;
        profilesData.forEach(profile => {
            if (profile.role === 'sash' && String(profile.layer || '').toLowerCase().includes('al')) {
                const bbox = getEffectiveProfileBbox(profile);
                if (!bbox) return;
                if (bbox.minX < sashMinX) sashMinX = bbox.minX;
                if (bbox.maxX > sashMaxX) sashMaxX = bbox.maxX;
            }
        });
        if (sashMinX === Infinity) {
            sashMinX = currentMetadata.globalMinX;
            sashMaxX = currentMetadata.globalMaxX;
        }
        const sashCenterX = ((sashMinX + sashMaxX) / 2 - currentMetadata.globalCenterX) * S;
        const dividerDepthOffset = dividerOrientation && currentMetadata.dividerConnection
            ? (Number(currentMetadata.dividerConnection.depthCenterFromAssemblyCenterMm) || 0) * S
            : 0;

        const t_meshes_start = performance.now();
        function shouldPlaceProfileOnSide(profile, side) {
            if (!canPlaceProfileOnSide(profile, side)) return false;

            if (currentMetadata.isVertical && currentMetadata.hasSplit) {
                const placementSection = profile.placementSection || profile.section;
                if (placementSection === 'bottom') {
                    return side === 'bottom';
                }
                if (placementSection === 'top') {
                    return side === 'top' || side === 'left' || side === 'right';
                }
            }

            return true;
        }

        const sashGroupsByCell = new Map();
        openingCells.forEach((cell, index) => {
            sashGroupsByCell.set(
                cell.id,
                index === 0 ? sashGroup : new THREE.Group()
            );
        });

        function getFrameBoundaryCellType(side, placement) {
            if (placement?.cellType) return placement.cellType;
            if (isTopFixedBottomSashSash) {
                if (side === 'top') return 'fixed-glazing';
                if (side === 'bottom') return 'opening-sash';
            }
            if (dividerOrientation === 'vertical') {
                if (side === 'left') return layoutCellTypes[0] || leftCellType;
                if (side === 'right') return layoutCellTypes.at(-1) || rightCellType;
            }
            if (dividerOrientation === 'horizontal') {
                if (side === 'bottom') return layoutCellTypes[0] || leftCellType;
                if (side === 'top') return layoutCellTypes.at(-1) || rightCellType;
            }
            return openingCell ? 'opening-sash' : 'fixed-glazing';
        }

        function getOuterFramePlacements(side) {
            if (!isTopFixedBottomSashSash || !tLayoutGeometry) {
                return dividerOrientation
                    ? getFrameSidePlacements({
                        orientation: dividerOrientation,
                        width: A,
                        height: B,
                        side,
                        dividerPositions,
                        cellTypes: layoutCellTypes,
                    })
                    : [{
                        id: side,
                        width: A,
                        height: B,
                        originX: 0,
                        originY: 0,
                        windowCell: 'outer-boundary',
                    }];
            }

            if (side === 'left' || side === 'right') {
                return getFrameSidePlacements({
                    orientation: 'horizontal',
                    width: A,
                    height: B,
                    side,
                    dividerPositions: [tLayoutGeometry.transomCenterY],
                    cellTypes: ['opening-sash', 'fixed-glazing'],
                });
            }
            if (side === 'bottom') {
                return getFrameSidePlacements({
                    orientation: 'vertical',
                    width: A,
                    height: B,
                    side,
                    dividerPositions: [tLayoutGeometry.verticalMullionCenterX],
                    cellTypes: ['opening-sash', 'opening-sash'],
                });
            }
            return [{
                id: side,
                width: A,
                height: B,
                originX: 0,
                originY: 0,
                windowCell: 'outer-boundary',
            }];
        }

        activeProfiles
            .filter(profile => profile.role !== 'divider')
            .forEach(profile => {
                const group = getProfileGroup(profile);
                const usesFullOuterBoundary = group === 'frame';
                if (!usesFullOuterBoundary && !openingCells.length) return;

                // A join-authored outer-frame accessory is rendered below from
                // its exact frame-sash CAD transform. Do not also render the
                // legacy B2-aligned copy around the whole perimeter.
                if (usesFullOuterBoundary && profile.frameAccessoryCadTransform) {
                    return;
                }

                sides.forEach(side => {
                    if (!shouldPlaceProfileOnSide(profile, side)) return;

                    const placements = usesFullOuterBoundary
                        ? getOuterFramePlacements(side)
                        : openingCells.map(cell => ({
                            id: `${side}-${cell.id}`,
                            width: cell.width,
                            height: cell.height,
                            originX: cell.centerX,
                            originY: cell.centerY,
                            windowCell: cell.id,
                        }));

                    placements.forEach(placement => {
                        // 245472 is the frame-to-sash rebate gasket. A frame
                        // segment bordering fixed glass uses 224063 from the
                        // frame-window join instead, so do not carry 245472
                        // across the fixed half of a divided window.
                        if (
                            usesFullOuterBoundary
                            && isFrameToSashRebateGasket(profile)
                            && getFrameBoundaryCellType(side, placement) !== 'opening-sash'
                        ) {
                            return;
                        }

                        const mesh = createMiteredSide(
                            profile,
                            placement.width,
                            placement.height,
                            side,
                            profile.explodeOffset,
                            placement.originX,
                            placement.originY,
                            placement.jointEnd === 'divider'
                                ? {
                                    localJointEnd: placement.localJointEnd,
                                    localJointEnds: placement.localJointEnds,
                                    faceSpan: dividerFaceSpan,
                                    frameInwardSpan: frameJointInwardSpan,
                                }
                                : null
                        );
                        mesh.userData.windowCell = placement.windowCell;
                        mesh.userData.frameSegment = placement.id;
                        mesh.userData.frameJoint = placement.jointEnd || null;
                        mesh.userData.frameJointLocalEnd = placement.localJointEnd || null;
                        mesh.userData.frameJointLocalEnds = placement.localJointEnds || [];

                        if (group === 'frame') {
                            frameGroup.add(mesh);
                        } else {
                            const targetSashGroup = sashGroupsByCell.get(placement.windowCell);
                            targetSashGroup?.add(mesh);
                        }
                    });
                });
            });

        // Exact accessory INSERTs from frame-sash-window.dwg are components of
        // the outer frame. They use the same perimeter segmentation and the
        // same divider-end miter cuts as the aluminium frame, while their
        // cross-sectional seat comes only from CAD. On divided layouts the
        // accessory is emitted only on frame segments bordering an opening sash.
        activeProfiles
            .filter(profile => Boolean(profile.frameAccessoryCadTransform))
            .forEach(profile => {
                sides.forEach(side => {
                    if (!shouldPlaceProfileOnSide(profile, side)) return;

                    // Supplemental connection accessories can carry separate
                    // top and bottom source sections. The top source is the
                    // reusable section for top/left/right, while the bottom
                    // source contains the CAD/source orientation required by
                    // the bottom frame. Previously the bottom source was
                    // filtered out entirely, so the exact frame-sash 200988
                    // path could never emit a bottom-frame component.
                    const placementSection = profile.placementSection || profile.section;
                    if (placementSection === 'bottom' && side !== 'bottom') return;
                    if (placementSection === 'top' && side === 'bottom') return;

                    const placedProfile = {
                        ...profile,
                        cadCoordinateTransform: profile.frameAccessoryCadTransform,
                        cadAlignmentShiftXMm: 0,
                        cadAlignmentShiftYMm: 0,
                    };
                    getOuterFramePlacements(side).forEach(placement => {
                        if (getFrameBoundaryCellType(side, placement) !== 'opening-sash') {
                            return;
                        }

                        const mesh = createMiteredSide(
                            placedProfile,
                            placement.width,
                            placement.height,
                            side,
                            profile.explodeOffset,
                            placement.originX,
                            placement.originY,
                            placement.jointEnd === 'divider'
                                ? {
                                    localJointEnd: placement.localJointEnd,
                                    localJointEnds: placement.localJointEnds,
                                    faceSpan: dividerFaceSpan,
                                    frameInwardSpan: frameJointInwardSpan,
                                }
                                : null
                        );
                        mesh.userData.windowCell = placement.windowCell;
                        mesh.userData.frameSegment = placement.id;
                        mesh.userData.frameAccessory = true;
                        mesh.userData.connectionBoundary = 'frame-opening-sash';
                        mesh.userData.connectionProfileId = profile.frameAccessoryProfileId;
                        mesh.userData.accessoryHostProfileId = profile.frameAccessoryHostProfileId;
                        frameGroup.add(mesh);
                    });
                });
            });

        if (isTopFixedBottomSashSash && dividerBounds && tLayoutGeometry) {
            const verticalDividerConnection = currentMetadata.tLayoutVerticalDividerConnection || {};
            const verticalDividerDepthOffset = (
                Number(verticalDividerConnection.depthCenterFromAssemblyCenterMm) || 0
            ) * S;
            const placeTDividerMesh = (mesh, kind, connectionSide = null) => {
                mesh.userData.tLayoutDivider = kind;
                mesh.userData.connectionBoundary = connectionSide
                    ? `${kind}-${connectionSide}`
                    : null;
                dividerGroup.add(mesh);
            };

            const tJointFaceSpan = Math.max(0, dividerFaceSpan);
            const tJointHalfFace = tJointFaceSpan / 2;
            const splitX = Number(tLayoutGeometry.verticalMullionCenterX) || 0;

            // The split transom is one assembled section: structural profile,
            // gaskets and other divider-mounted components must all be cut by
            // the same two joint planes. Keep the segment/joint definition in
            // one place and reuse it for every component instead of deriving a
            // second gasket-specific centre trim.
            const tTransomSegments = [
                {
                    id: 'left',
                    length: Math.max(0, splitX + A / 2),
                    centerX: (-A / 2 + splitX) / 2,
                    joint: {
                        negativeEndMode: 'arrow',
                        positiveEndMode: 'socket',
                        socketInwardSign: 1,
                        socketInwardOffset: tJointHalfFace,
                        negativeFrameInwardSpan: frameJointInwardSpan,
                        positiveFrameInwardSpan: tJointFaceSpan,
                    },
                },
                {
                    id: 'right',
                    length: Math.max(0, A / 2 - splitX),
                    centerX: (splitX + A / 2) / 2,
                    joint: {
                        negativeEndMode: 'socket',
                        positiveEndMode: 'arrow',
                        socketInwardSign: 1,
                        socketInwardOffset: tJointHalfFace,
                        negativeFrameInwardSpan: tJointFaceSpan,
                        positiveFrameInwardSpan: frameJointInwardSpan,
                    },
                },
            ];
            // The lower vertical mullion is also an assembly: its mounted
            // gaskets must use the same nominal span and the same two cut
            // planes as the structural profile. The extra half-face at the top
            // is not a gasket-specific extension; it is the structural span
            // required for the V head that enters the transom socket.
            const tLowerMullionSegment = {
                length: Math.max(
                    0,
                    tLayoutGeometry.lowerStructuralHeight + tJointHalfFace
                ),
                centerY:
                    tLayoutGeometry.lowerStructuralCenterY + tJointHalfFace / 2,
                joint: {
                    negativeEndMode: 'arrow',
                    positiveEndMode: 'arrow',
                    negativeFrameInwardSpan: frameJointInwardSpan,
                    positiveFrameInwardSpan: tJointFaceSpan,
                },
            };

            activeDividerProfiles.forEach(profile => {

                // The T transom is a real two-piece joint, not one continuous
                // extrusion. Its two halves still touch on the fixed/top half
                // of the profile, while their lower inner faces open at 45° to
                // receive the V-shaped head of the lower vertical mullion.
                tTransomSegments.forEach(segment => {
                    if (segment.length <= 1e-6) return;
                    const mesh = createDividerSegment(
                        profile,
                        segment.length,
                        'horizontal',
                        dividerBounds,
                        dividerDepthOffset,
                        frameJointInwardSpan,
                        tLayoutGeometry.transomCenterY,
                        segment.centerX,
                        -1,
                        segment.joint
                    );
                    mesh.userData.tLayoutStructuralSegment = segment.id;
                    placeTDividerMesh(mesh, 'transom');
                });

                // Lower mullion: keep the accepted bottom-frame V joint, but
                // extend the nominal top end to the top face of the transom.
                // With a transom-sized positive-end span, its V apex lands on
                // the transom centre plane and the shoulders land on the lower
                // transom face, exactly inside the two-piece socket above.
                const verticalProfile = {
                    ...profile,
                    dividerSectionRotationDeg:
                        Number(verticalDividerConnection.sectionRotationDeg) || 180,
                };
                placeTDividerMesh(
                    createDividerSegment(
                        verticalProfile,
                        tLowerMullionSegment.length,
                        'vertical',
                        dividerBounds,
                        verticalDividerDepthOffset,
                        frameJointInwardSpan,
                        tLayoutGeometry.verticalMullionCenterX,
                        tLowerMullionSegment.centerY,
                        1,
                        tLowerMullionSegment.joint
                    ),
                    'lower-mullion'
                );
            });

            activeProfiles
                .filter(profile =>
                    profile.section !== 'bottom'
                    && (isFixedGlassAnchorGasket(profile) || isFrameToSashRebateGasket(profile))
                )
                .forEach(profile => {
                    // Mixed fixed/transom/sash direct INSERTs for the horizontal run.
                    const horizontalConnectionTransforms = Object.entries(
                        profile.mullionConnectionCadTransforms || {}
                    );
                    if (
                        !horizontalConnectionTransforms.length
                        && profile.mullionConnectionCadTransform
                    ) {
                        horizontalConnectionTransforms.push([
                            profile.mullionConnectionCellSide || 'unknown',
                            profile.mullionConnectionCadTransform,
                        ]);
                    }
                    horizontalConnectionTransforms
                        .forEach(([cellSide, cadTransform]) => {
                            const placedProfile = {
                                ...profile,
                                cadCoordinateTransform: cadTransform,
                                cadAlignmentShiftXMm: 0,
                                cadAlignmentShiftYMm: 0,
                                dividerSectionRotationDeg:
                                    Number(currentMetadata.dividerConnection?.sectionRotationDeg) || 180,
                            };
                            const connectionCellType =
                                currentMetadata.dividerConnection?.[`${cellSide}Cell`] || null;
                            const splitAtLowerMullion =
                                connectionCellType === 'opening-sash'
                                && isFrameToSashRebateGasket(profile);

                            if (splitAtLowerMullion) {
                                // Treat the sash-side gasket as a component of the
                                // horizontal transom assembly. It uses the exact
                                // same segment lengths and 45-degree socket planes
                                // as the structural mullion profile, so changing the
                                // structural joint automatically changes the gasket
                                // cut as well. Only the gasket's CAD cross-section
                                // remains its own.
                                tTransomSegments.forEach(segment => {
                                    if (segment.length <= 1e-6) return;
                                    const mesh = createDividerSegment(
                                        placedProfile,
                                        segment.length,
                                        'horizontal',
                                        dividerBounds,
                                        dividerDepthOffset,
                                        frameJointInwardSpan,
                                        tLayoutGeometry.transomCenterY,
                                        segment.centerX,
                                        tTransomConnectionFaceDirection,
                                        segment.joint
                                    );
                                    mesh.userData.mullionConnectionGasket = true;
                                    mesh.userData.connectionProfileId =
                                        profile.mullionConnectionProfileId;
                                    mesh.userData.tLayoutGasketSegment = segment.id;
                                    placeTDividerMesh(mesh, 'transom', cellSide);
                                });
                                return;
                            }

                            const mesh = createDividerSegment(
                                placedProfile,
                                A,
                                'horizontal',
                                dividerBounds,
                                dividerDepthOffset,
                                frameJointInwardSpan,
                                tLayoutGeometry.transomCenterY,
                                0,
                                tTransomConnectionFaceDirection
                            );
                            mesh.userData.mullionConnectionGasket = true;
                            mesh.userData.connectionProfileId = profile.mullionConnectionProfileId;
                            placeTDividerMesh(mesh, 'transom', cellSide);
                        });

                    // Exact two-sided 245472 INSERTs from mullion-sash-sash for
                    // the lower vertical mullion. No mixed-join mirroring.
                    Object.entries(profile.tLayoutVerticalMullionConnectionCadTransforms || {})
                        .forEach(([cellSide, cadTransform]) => {
                            const placedProfile = {
                                ...profile,
                                cadCoordinateTransform: cadTransform,
                                cadAlignmentShiftXMm: 0,
                                cadAlignmentShiftYMm: 0,
                                dividerSectionRotationDeg:
                                    Number(verticalDividerConnection.sectionRotationDeg) || 180,
                            };
                            const mesh = createDividerSegment(
                                placedProfile,
                                tLowerMullionSegment.length,
                                'vertical',
                                dividerBounds,
                                verticalDividerDepthOffset,
                                frameJointInwardSpan,
                                tLayoutGeometry.verticalMullionCenterX,
                                tLowerMullionSegment.centerY,
                                1,
                                tLowerMullionSegment.joint
                            );
                            mesh.userData.mullionConnectionGasket = true;
                            mesh.userData.connectionProfileId =
                                profile.tLayoutVerticalMullionConnectionProfileId;
                            placeTDividerMesh(mesh, 'lower-mullion', cellSide);
                        });
                });

            // Optional join-authored accessories (currently 200988) are true
            // components of the T divider assembly. The horizontal copies use
            // the same two transom segments/socket cuts as the aluminium and
            // gaskets; the lower vertical copies use the same V-headed segment
            // as the mullion. No accessory-specific length is hardcoded.
            activeProfiles
                .filter(profile =>
                    profile.section !== 'bottom'
                    && (
                        Object.keys(profile.mullionAccessoryCadTransforms || {}).length
                        || Object.keys(
                            profile.tLayoutVerticalMullionAccessoryCadTransforms || {}
                        ).length
                    )
                )
                .forEach(profile => {
                    Object.entries(profile.mullionAccessoryCadTransforms || {})
                        .forEach(([cellSide, cadTransform]) => {
                            const placedProfile = {
                                ...profile,
                                cadCoordinateTransform: cadTransform,
                                cadAlignmentShiftXMm: 0,
                                cadAlignmentShiftYMm: 0,
                                dividerSectionRotationDeg:
                                    Number(currentMetadata.dividerConnection?.sectionRotationDeg) || 180,
                            };
                            tTransomSegments.forEach(segment => {
                                if (segment.length <= 1e-6) return;
                                const mesh = createDividerSegment(
                                    placedProfile,
                                    segment.length,
                                    'horizontal',
                                    dividerBounds,
                                    dividerDepthOffset,
                                    frameJointInwardSpan,
                                    tLayoutGeometry.transomCenterY,
                                    segment.centerX,
                                    tTransomConnectionFaceDirection,
                                    segment.joint
                                );
                                mesh.userData.mullionAccessory = true;
                                mesh.userData.connectionProfileId =
                                    profile.mullionAccessoryProfileId;
                                mesh.userData.accessoryHostProfileId =
                                    profile.mullionAccessoryHostProfileId;
                                mesh.userData.tLayoutAccessorySegment = segment.id;
                                placeTDividerMesh(mesh, 'transom', cellSide);
                            });
                        });

                    Object.entries(
                        profile.tLayoutVerticalMullionAccessoryCadTransforms || {}
                    ).forEach(([cellSide, cadTransform]) => {
                        const placedProfile = {
                            ...profile,
                            cadCoordinateTransform: cadTransform,
                            cadAlignmentShiftXMm: 0,
                            cadAlignmentShiftYMm: 0,
                            dividerSectionRotationDeg:
                                Number(verticalDividerConnection.sectionRotationDeg) || 180,
                        };
                        const mesh = createDividerSegment(
                            placedProfile,
                            tLowerMullionSegment.length,
                            'vertical',
                            dividerBounds,
                            verticalDividerDepthOffset,
                            frameJointInwardSpan,
                            tLayoutGeometry.verticalMullionCenterX,
                            tLowerMullionSegment.centerY,
                            1,
                            tLowerMullionSegment.joint
                        );
                        mesh.userData.mullionAccessory = true;
                        mesh.userData.connectionProfileId =
                            profile.tLayoutVerticalMullionAccessoryProfileId;
                        mesh.userData.accessoryHostProfileId =
                            profile.mullionAccessoryHostProfileId;
                        placeTDividerMesh(mesh, 'lower-mullion', cellSide);
                    });
                });
        } else if (dividerOrientation && dividerBounds) {
            const dividerLength = dividerOrientation === 'vertical' ? B : A;
            const activeDividerPositions = dividerPositions.length ? dividerPositions : [0];
            const placeDividerMesh = (mesh, dividerPosition, dividerIndex) => {
                mesh.userData.dividerIndex = dividerIndex;
                mesh.userData.dividerPosition = dividerPosition;
                dividerGroup.add(mesh);
            };
            activeDividerProfiles.forEach(profile => {
                activeDividerPositions.forEach((dividerPosition, dividerIndex) => {
                    placeDividerMesh(
                        createDividerSegment(
                            profile,
                            dividerLength,
                            dividerOrientation,
                            dividerBounds,
                            dividerDepthOffset,
                            frameJointInwardSpan,
                            dividerPosition
                        ),
                        dividerPosition,
                        dividerIndex
                    );
                });
            });

            // Direct mixed-join gaskets are physically mounted on the mullion,
            // not on the neighbouring fixed/sash cell perimeter. Render them in
            // the same join coordinate system and with the same longitudinal V
            // cut as the divider itself. Only the top legacy section is needed
            // as the extrusion template for either a mullion or a transom run.
            if (dividerOrientation) {
                activeProfiles
                    .filter(profile =>
                        profile.section !== 'bottom'
                        && (
                            profile.mullionConnectionCadTransform
                            || Object.keys(profile.mullionConnectionCadTransforms || {}).length
                        )
                        && (isFixedGlassAnchorGasket(profile)
                            || isFrameToSashRebateGasket(profile))
                    )
                    .forEach(profile => {
                        const connectionTransforms = Object.entries(
                            profile.mullionConnectionCadTransforms || {}
                        );
                        if (!connectionTransforms.length && profile.mullionConnectionCadTransform) {
                            connectionTransforms.push([
                                profile.mullionConnectionCellSide || 'unknown',
                                profile.mullionConnectionCadTransform,
                            ]);
                        }

                        connectionTransforms.forEach(([cellSide, cadTransform]) => {
                            const placedProfile = {
                                ...profile,
                                cadCoordinateTransform: cadTransform,
                                cadAlignmentShiftXMm: 0,
                                cadAlignmentShiftYMm: 0,
                                dividerSectionRotationDeg:
                                    Number(currentMetadata.dividerConnection?.sectionRotationDeg) || 180,
                            };
                            activeDividerPositions.forEach((dividerPosition, dividerIndex) => {
                                const mesh = createDividerSegment(
                                    placedProfile,
                                    dividerLength,
                                    dividerOrientation,
                                    dividerBounds,
                                    dividerDepthOffset,
                                    frameJointInwardSpan,
                                    dividerPosition
                                );
                                mesh.userData.mullionConnectionGasket = true;
                                mesh.userData.connectionBoundary = `mullion-${cellSide}`;
                                mesh.userData.connectionProfileId = profile.mullionConnectionProfileId;
                                placeDividerMesh(mesh, dividerPosition, dividerIndex);
                            });
                        });
                    });
            }
        }


        // Optional accessory INSERTs authored in the active mullion join use
        // the same longitudinal divider extrusion/joint as the structural
        // profile. Their cross-sectional location comes only from CAD.
        if (dividerOrientation && dividerBounds && !isTopFixedBottomSashSash) {
            const dividerLength = dividerOrientation === 'vertical' ? B : A;
            const activeDividerPositions = dividerPositions.length ? dividerPositions : [0];
            activeProfiles
                .filter(profile =>
                    profile.section !== 'bottom'
                    && Object.keys(profile.mullionAccessoryCadTransforms || {}).length
                )
                .forEach(profile => {
                    Object.entries(profile.mullionAccessoryCadTransforms || {})
                        .forEach(([cellSide, cadTransform]) => {
                            const placedProfile = {
                                ...profile,
                                cadCoordinateTransform: cadTransform,
                                cadAlignmentShiftXMm: 0,
                                cadAlignmentShiftYMm: 0,
                                dividerSectionRotationDeg:
                                    Number(currentMetadata.dividerConnection?.sectionRotationDeg) || 180,
                            };
                            activeDividerPositions.forEach((dividerPosition, dividerIndex) => {
                                const mesh = createDividerSegment(
                                    placedProfile,
                                    dividerLength,
                                    dividerOrientation,
                                    dividerBounds,
                                    dividerDepthOffset,
                                    frameJointInwardSpan,
                                    dividerPosition
                                );
                                mesh.userData.dividerIndex = dividerIndex;
                                mesh.userData.dividerPosition = dividerPosition;
                                mesh.userData.mullionAccessory = true;
                                mesh.userData.connectionBoundary = `mullion-${cellSide}`;
                                mesh.userData.connectionProfileId =
                                    profile.mullionAccessoryProfileId;
                                mesh.userData.accessoryHostProfileId =
                                    profile.mullionAccessoryHostProfileId;
                                dividerGroup.add(mesh);
                            });
                        });
                });
        }

        // In the mixed fixed | mullion | sash connection, the mullion carries
        // its own frame-side rebate gasket on the sash-facing side.  This is
        // separate from the 245472 gasket already attached to the sash itself.
        // Place the frame-role 245472_s_5 from the exact INSERT in
        // window-mullion-sash-window.dwg, using the opening cell boundary as
        // the local side on which createMiteredSide() operates.
        if (dividerOrientation && openingCell && !isTopFixedBottomSashSash) {
            activeProfiles
                .filter(profile =>
                    isFrameToSashRebateGasket(profile)
                    && !profile.mullionConnectionCadTransform
                    && !Object.keys(profile.mullionConnectionCadTransforms || {}).length
                    && profile.mullionSashCadTransform
                    && shouldPlaceProfileOnSide(
                        profile,
                        dividerOrientation === 'horizontal'
                            ? (profile.mullionSashCellSide === 'left' ? 'top' : 'bottom')
                            : (profile.mullionSashCellSide === 'left' ? 'right' : 'left')
                    )
                )
                .forEach(profile => {
                    const openingSide = dividerOrientation === 'horizontal'
                        ? (profile.mullionSashCellSide === 'left' ? 'top' : 'bottom')
                        : (profile.mullionSashCellSide === 'left' ? 'right' : 'left');
                    const placedProfile = {
                        ...profile,
                        cadCoordinateTransform: profile.mullionSashCadTransform,
                        cadAlignmentShiftXMm: 0,
                        cadAlignmentShiftYMm: 0,
                    };
                    const mesh = createMiteredSide(
                        placedProfile,
                        openingCell.width,
                        openingCell.height,
                        openingSide,
                        profile.explodeOffset,
                        openingCell.centerX,
                        openingCell.centerY
                    );
                    mesh.userData.windowCell = openingCell.id;
                    mesh.userData.mullionSashRebateGasket = true;
                    mesh.userData.fixedGlazingConnectionBoundary = null;
                    mesh.userData.connectionBoundary = `mullion-${profile.mullionSashCellSide}`;
                    frameGroup.add(mesh);
                });
        }

        // Fixed glazing keeps the existing accessory geometry and glass-thickness
        // switching, but its glazing-bead assembly is no longer positioned from
        // the opening-sash B2 occurrence. The outer-boundary bead position comes
        // from frame-fixed; the divider-facing bead position comes from the active
        // mullion join. Both are bridged through the structural profile that is
        // already correctly placed in the runtime assembly.
        function applyFixedGlazingFollowerThicknessShift(profile, transform) {
            if (!transform || !isMovingGlazingBeadGasket(profile)) return transform;

            // In the normal B2 path 224378 follows the selected glazing bead via
            // getProfileCadXShiftMm(). A fixed-glazing CAD placement replaces the
            // profile's runtime coordinate transform, so that dynamic source-X
            // shift would otherwise be bypassed. Reapply only the thickness-
            // dependent part in source coordinates before the fixed CAD transform.
            const staticAssemblyShiftMm = Number(profile?.cadAlignmentShiftXMm) || 0;
            const totalProfileShiftMm = Number(getProfileCadXShiftMm(profile)) || 0;
            const dynamicSourceXShiftMm = totalProfileShiftMm - staticAssemblyShiftMm;
            if (Math.abs(dynamicSourceXShiftMm) < 1e-9) return transform;

            return translateCadTransformSource(
                transform,
                dynamicSourceXShiftMm,
                0
            );
        }

        function getFixedGlazingAccessoryPlacement(profile, fixedCell, side) {
            let transform = profile.fixedGlazingFrameCadTransform || null;
            let connectionBoundary = transform ? 'outer-frame' : null;

            if (dividerOrientation) {
                const dividerSide = fixedCell.dividerJoinSideByBoundary?.[side] || null;
                const dividerTransform = dividerSide
                    ? profile.fixedGlazingDividerCadTransforms?.[dividerSide]
                    : null;
                const dividerMountedTransforms = profile.mullionConnectionCadTransforms || {};
                if (
                    dividerSide
                    && (
                        dividerMountedTransforms[dividerSide]
                        || (
                            profile.mullionConnectionCadTransform
                            && profile.mullionConnectionCellSide === dividerSide
                        )
                    )
                ) {
                    // This physical gasket is rendered as part of dividerGroup
                    // from the direct join INSERT. Do not render a second copy
                    // as a fixed-cell perimeter side.
                    return { profile: null, connectionBoundary: null };
                }
                if (dividerTransform) {
                    transform = dividerTransform;
                    connectionBoundary = `divider-${dividerSide}`;
                }
            }

            transform = applyFixedGlazingFollowerThicknessShift(profile, transform);

            if (!transform) {
                // Never fall back to the old B2 sash position for 224063 in a
                // fixed-glazing cell. Until the relevant join metadata contains
                // the direct 224063 INSERT, omit it rather than rendering the
                // known-wrong sash-relative gasket.
                if (isFixedGlassAnchorGasket(profile)) {
                    return { profile: null, connectionBoundary: null };
                }
                return { profile, connectionBoundary: null };
            }

            return {
                profile: {
                    ...profile,
                    cadCoordinateTransform: transform,
                    cadAlignmentShiftXMm: 0,
                    cadAlignmentShiftYMm: 0,
                },
                connectionBoundary,
            };
        }

        if (fixedCells.length) {
            activeProfiles
                .filter(profile => {
                    return getProfileGroup(profile) === 'bead'
                        || isFixedGlassAnchorGasket(profile);
                })
                .forEach(profile => {
                    fixedCells.forEach(fixedCell => {
                        sides.forEach(side => {
                            if (!shouldPlaceProfileOnSide(profile, side)) return;

                            const placement = getFixedGlazingAccessoryPlacement(
                                profile,
                                fixedCell,
                                side
                            );
                            if (!placement.profile) return;

                            const mesh = createMiteredSide(
                                placement.profile,
                                fixedCell.fixedAccessoryWidth ?? fixedCell.width,
                                fixedCell.fixedAccessoryHeight ?? fixedCell.height,
                                side,
                                profile.explodeOffset,
                                fixedCell.fixedAccessoryCenterX ?? fixedCell.centerX,
                                fixedCell.fixedAccessoryCenterY ?? fixedCell.centerY
                            );
                            mesh.userData.windowCell = fixedCell.id;
                            mesh.userData.fixedGlazingAccessory = true;
                            mesh.userData.fixedGlazingBead = getProfileGroup(profile) === 'bead';
                            mesh.userData.fixedGlazingConnectionBoundary = placement.connectionBoundary;
                            frameGroup.add(mesh);
                        });
                    });
                });
        }
        const t_meshes_end = performance.now();

        mainGroup.add(frameGroup);
        mainGroup.add(dividerGroup);

        // Glass: place the opening pane in the selected sash cell. Divider
        // layouts also receive a second, stationary fixed pane on the other side.
        const glassPlacement = resolveGlassPlacement(sashCenterX);
        const leftInset = glassPlacement.leftInsetMm * S;
        const rightInset = glassPlacement.rightInsetMm * S;
        const topInset = glassPlacement.topInsetMm * S;
        const bottomInset = glassPlacement.bottomInsetMm * S;

        function createGlassPane({
            width,
            height,
            centerX,
            centerY,
            isFixed = false,
            cellId = null,
            glazingCavity = null,
        }) {
            const pane = new THREE.Mesh(
                new THREE.BoxGeometry(
                    Math.max(0.05, width),
                    Math.max(0.05, height),
                    glassPlacement.thicknessMm * S
                ),
                glassMat
            );
            pane.position.set(centerX, centerY, glassPlacement.centerZ);
            pane.castShadow = !captureMode;
            pane.receiveShadow = !captureMode;
            pane.userData.glazingCavity = glazingCavity;
            pane.userData.windowCell = cellId || (isFixed ? 'fixed' : 'opening');
            registerExplode(pane, 0, 0, isFixed ? 0.35 : 0.5);
            return pane;
        }

        if (openingCells.length) {
            const glazingCavity = glassPlacement.cavity
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
            const isMultiOpening = openingCells.length > 1;
            const selectedHandleSide = getSelectedHandleSide();
            const selectedHandleSideChanged = !isMultiOpening
                && lastBuiltHandleSide !== null
                && lastBuiltHandleSide !== selectedHandleSide;
            if (selectedHandleSideChanged) {
                handleHoldUntil = performance.now() + 50;
            }
            const previousPrimaryHandleRotationZ = handleLeverGroup?.rotation?.z;
            handleLeverGroup = null;

            openingCells.forEach((cell, cellIndex) => {
                const targetSashGroup = sashGroupsByCell.get(cell.id);
                if (!targetSashGroup) return;

                const openingGlassW = Math.max(0.05, cell.width - leftInset - rightInset);
                const openingGlassH = Math.max(0.05, cell.height - topInset - bottomInset);
                const openingGlassCenterX = cell.centerX + (leftInset - rightInset) / 2;
                const openingGlassCenterY = cell.centerY + (bottomInset - topInset) / 2;
                targetSashGroup.add(createGlassPane({
                    width: openingGlassW,
                    height: openingGlassH,
                    centerX: openingGlassCenterX,
                    centerY: openingGlassCenterY,
                    cellId: cell.id,
                    glazingCavity,
                }));

                // In a sash/sash mullion layout both handles sit toward the
                // mullion and both hinges sit on the outer frame. Other layouts
                // keep the user's existing global handle-side selection.
                const cellHandleSide = cell.handleSide
                    || (isMultiOpening && dividerOrientation === 'vertical'
                        ? (cell.joinCellSide === 'left' ? 'right' : 'left')
                        : selectedHandleSide);
                const isLeftHandle = cellHandleSide === 'left';
                const defaultRot = document.getElementById('mBatant').checked
                    ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
                    : (isLeftHandle ? Math.PI : -Math.PI);
                const leverGroup = new THREE.Group();
                leverGroup.rotation.z = (
                    cellIndex === 0
                    && !isMultiOpening
                    && !selectedHandleSideChanged
                    && Number.isFinite(previousPrimaryHandleRotationZ)
                )
                    ? previousPrimaryHandleRotationZ
                    : (selectedHandleSideChanged ? 0 : defaultRot);
                if (cellIndex === 0) handleLeverGroup = leverGroup;

                const handleBase = new THREE.Group();
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

                const neckShape = new THREE.Shape();
                neckShape.lineTo(0, 0.01);
                let centerX = 0;
                let centerY = 0;
                let radius = 0.01;
                let segments = 32;
                for (let i = 1; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    neckShape.lineTo(
                        centerX + Math.sin(angle) * radius,
                        centerY + Math.cos(angle) * radius
                    );
                }
                const neckGeo = new THREE.ExtrudeGeometry(neckShape, {
                    depth: 0.014,
                    bevelEnabled: false,
                    curveSegments: 24
                });
                neckGeo.center();
                neckGeo.translate(0, 0, -0.001);
                const neck = new THREE.Mesh(neckGeo, handleMat);
                neck.position.set(0, 0, 0.006);
                neck.castShadow = !captureMode;
                neck.receiveShadow = !captureMode;
                handleBase.add(neck);

                const leverShape = new THREE.Shape();
                leverShape.moveTo(-0.01, 0.055);
                centerX = 0;
                centerY = 0.055;
                radius = 0.01;
                segments = 16;
                for (let i = 1; i <= segments; i++) {
                    const angle = 3 * Math.PI / 2 + (i / segments) * Math.PI;
                    leverShape.lineTo(
                        centerX + Math.sin(angle) * radius,
                        centerY + Math.cos(angle) * radius
                    );
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
                leverGroup.add(lever);
                handleBase.add(leverGroup);

                const sashInteriorZ = (sashMaxX - currentMetadata.globalCenterX) * S;
                const handleInwardShift = 0.01;
                const handleLocalX = isLeftHandle
                    ? -cell.width / 2 + leftInset - 0.04 + handleInwardShift
                    : cell.width / 2 - rightInset + 0.04 - handleInwardShift;
                const handleX = cell.centerX + handleLocalX;
                handleBase.position.set(handleX, cell.centerY, sashInteriorZ + 0.0075);
                registerExplode(handleBase, isLeftHandle ? -0.26 : 0.26, 0, 0.9);
                targetSashGroup.add(handleBase);

                const hingeX = cell.centerX + (
                    isLeftHandle ? (cell.width / 2 - 0.04) : (-cell.width / 2 + 0.04)
                );
                const hingeY = cell.centerY - cell.height / 2 + 0.04;
                const hingeZ = sashCenterX;
                const cellPivotOscilo = cellIndex === 0 ? pivotOscilo : new THREE.Group();
                const cellPivotBatant = cellIndex === 0 ? pivotBatant : new THREE.Group();
                cellPivotOscilo.position.set(0, hingeY, hingeZ);
                cellPivotOscilo.rotation.set(0, 0, 0);
                cellPivotBatant.position.set(hingeX, -hingeY, 0);
                cellPivotBatant.rotation.set(0, 0, 0);
                mainGroup.add(cellPivotOscilo);
                cellPivotOscilo.add(cellPivotBatant);

                const sashWrapper = new THREE.Group();
                sashWrapper.position.set(-hingeX, 0, -hingeZ);
                sashWrapper.add(targetSashGroup);
                cellPivotBatant.add(sashWrapper);
                sashPoseAssemblies.push({
                    pivotOscilo: cellPivotOscilo,
                    pivotBatant: cellPivotBatant,
                    handleLeverGroup: leverGroup,
                    isLeftHandle,
                    cellId: cell.id,
                });
            });

            lastBuiltHandleSide = isMultiOpening ? null : selectedHandleSide;
        } else {
            handleLeverGroup = null;
            lastBuiltHandleSide = null;
            mainGroup.add(sashGroup);
        }

        if (fixedCells.length) {
            fixedCells.forEach(fixedCell => {
                const panePlacement = getFixedGlassPanePlacement({
                    width: fixedCell.fixedAccessoryWidth ?? fixedCell.width,
                    height: fixedCell.fixedAccessoryHeight ?? fixedCell.height,
                    centerX: fixedCell.fixedAccessoryCenterX ?? fixedCell.centerX,
                    centerY: fixedCell.fixedAccessoryCenterY ?? fixedCell.centerY,
                    outerInset: 0.05,
                });
                frameGroup.add(createGlassPane({
                    width: panePlacement.width,
                    height: panePlacement.height,
                    centerX: panePlacement.centerX,
                    centerY: panePlacement.centerY,
                    isFixed: true,
                    cellId: fixedCell.id,
                }));
            });
        }

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

        sashPoseAssemblies.forEach(assembly => {
            const isLeftHandle = assembly.isLeftHandle;
            if (isBatant) {
                const valRad = Math.min(value, 80) * (Math.PI / 180);
                assembly.pivotBatant.rotation.y = isLeftHandle ? valRad : -valRad;
                assembly.pivotOscilo.rotation.x = 0;
            } else {
                assembly.pivotBatant.rotation.y = 0;
                const valRad = Math.min(value, 15) * (Math.PI / 180);
                assembly.pivotOscilo.rotation.x = valRad;
            }

            if (assembly.handleLeverGroup) {
                assembly.handleLeverGroup.rotation.z = isBatant
                    ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
                    : (isLeftHandle ? Math.PI : -Math.PI);
            }
        });

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

        sashPoseAssemblies.forEach(assembly => {
            const isLeftHandle = assembly.isLeftHandle;
            if (isBatant) {
                const valueRad = Math.min(value, 80) * (Math.PI / 180);
                assembly.pivotBatant.rotation.y = isLeftHandle ? valueRad : -valueRad;
                assembly.pivotOscilo.rotation.x = 0;
            } else {
                assembly.pivotBatant.rotation.y = 0;
                const valueRad = Math.min(value, 15) * (Math.PI / 180);
                assembly.pivotOscilo.rotation.x = valueRad;
            }

            const targetRotationZ = isBatant
                ? (isLeftHandle ? Math.PI / 2 : -Math.PI / 2)
                : (isLeftHandle ? Math.PI : -Math.PI);
            if (assembly.handleLeverGroup) {
                if (performance.now() < handleHoldUntil && sashPoseAssemblies.length === 1) {
                    assembly.handleLeverGroup.rotation.z = 0;
                } else {
                    assembly.handleLeverGroup.rotation.z = THREE.MathUtils.lerp(
                        assembly.handleLeverGroup.rotation.z,
                        targetRotationZ,
                        0.10
                    );
                }
            }
        });

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
