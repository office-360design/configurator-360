import * as THREE from 'three';
import { getHouseDimensions, usesSmallHouse } from './house-config.js';

/**
 * Creates and owns the optional fixed-house scene objects.
 * House geometry and visibility state remain private to this module.
 */
export function createHouseBuilder({
    scene,
    ground,
    gridHelper,
    isARMode = false,
    captureMode = false,
}) {
    const houseGroup = new THREE.Group();
    const houseStaticGroup = new THREE.Group();
    const houseFrontGroup = new THREE.Group();
    houseGroup.add(houseStaticGroup, houseFrontGroup);
    scene.add(houseGroup);

    let activeHousePresetKey = null;
    let houseWasVisible = false;
    let windowPlacementRoot = null;

    const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const sharedBoxEdges = new THREE.EdgesGeometry(sharedBoxGeo);

    const sharedGableShape = new THREE.Shape();
    sharedGableShape.moveTo(-0.5, 0);
    sharedGableShape.lineTo(0.5, 0);
    sharedGableShape.lineTo(0, 1.0);
    sharedGableShape.closePath();

    const sharedGableGeo = new THREE.ExtrudeGeometry(sharedGableShape, {
        depth: 1.0,
        bevelEnabled: false,
    });
    sharedGableGeo.center();
    const sharedGableEdges = new THREE.EdgesGeometry(sharedGableGeo);

    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xf2f2f0,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    const roofMat = new THREE.MeshStandardMaterial({
        color: 0xc7cbd0,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    const outlineMat = new THREE.LineBasicMaterial({
        color: 0x9aa0a6,
    });

    const sharedHouseGeometries = new Set([
        sharedBoxGeo,
        sharedBoxEdges,
        sharedGableGeo,
        sharedGableEdges,
    ]);

    function clearGeneratedGroup(group) {
        group.traverse(child => {
            if (child.geometry && !sharedHouseGeometries.has(child.geometry)) {
                child.geometry.dispose();
            }

            if (child.isSprite && child.material) {
                child.material.map?.dispose();
                child.material.dispose();
            }
        });

        group.clear();
    }

    function resolveWindowPlacementRoot() {
        if (windowPlacementRoot?.parent === scene) return windowPlacementRoot;

        let resolved = null;
        scene.traverse(object => {
            if (resolved || !object?.isMesh) return;
            const selection = object.userData?.componentSelection || {};
            const isWindowFrame = String(selection.source || '').toLowerCase() === 'frame'
                || Boolean(object.userData?.frameSegment);
            if (!isWindowFrame) return;

            let root = object;
            while (root.parent && root.parent !== scene) root = root.parent;
            if (root.parent === scene && root !== houseGroup) resolved = root;
        });

        windowPlacementRoot = resolved;
        return resolved;
    }

    function syncWindowDimensionOrientation(houseActive) {
        const placementRoot = resolveWindowPlacementRoot();
        if (!placementRoot) return;

        // Dimension guides are authored inside the same placement root as the
        // physical window. Counter-rotate only the blue dimension groups so
        // house mode flips the product, not the width/height annotations.
        placementRoot.traverse(object => {
            if (!object?.isGroup || !Array.isArray(object.children)) return;
            const hasDimensionLine = object.children.some(child => (
                child?.isLine
                && child.material?.color?.getHex?.() === 0x38bdf8
            ));
            if (!hasDimensionLine) return;

            object.rotation.y = houseActive ? Math.PI : 0;
            object.updateMatrixWorld(true);
        });
    }

    function syncWindowHouseOrientation(houseActive) {
        const placementRoot = resolveWindowPlacementRoot();
        if (!placementRoot) return;

        // The authored standalone view exposes the inside face toward +Z.
        // The house interior extends behind the front wall toward -Z, so when
        // the house is visible the complete window assembly must face the
        // opposite way. Restore the authored orientation as soon as house mode
        // is disabled so standalone/AR behaviour is unchanged.
        placementRoot.rotation.y = houseActive ? Math.PI : 0;
        placementRoot.updateMatrixWorld(true);

        // Existing dimensions can be corrected immediately. During a normal
        // window rebuild buildHouse() runs just before the dimension guides are
        // recreated, so repeat this once the current synchronous rebuild has
        // finished to catch the newly-created dimensionsGroup as well.
        syncWindowDimensionOrientation(houseActive);
        queueMicrotask(() => syncWindowDimensionOrientation(houseActive));
    }

    function buildHouse(A, B) {
        const showHouse = document.getElementById('cShowHouse')?.checked === true;
        syncWindowHouseOrientation(showHouse && !isARMode);

        if (isARMode || !showHouse) {
            if (houseWasVisible) {
                clearGeneratedGroup(houseFrontGroup);
                clearGeneratedGroup(houseStaticGroup);
                activeHousePresetKey = null;
            }

            houseWasVisible = false;
            houseGroup.visible = false;
            ground.position.y = -1.2;
            gridHelper.position.y = -1.19;
            return;
        }

        houseWasVisible = true;
        houseGroup.visible = true;

        const isSmallHouse = usesSmallHouse(A, B);
        const housePresetKey = isSmallHouse ? 'small' : 'large';
        const houseDimensions = getHouseDimensions(A, B);

        const W_wall = houseDimensions.width;
        const H_wall = houseDimensions.wallHeight;
        const houseDepth = houseDimensions.depth;
        const wallThickness = houseDimensions.wallThickness;
        const gableHeight = houseDimensions.gableHeight;
        const Y_floor = -H_wall / 2;
        const Y_wall_top = Y_floor + H_wall;
        const X_wall_min = -W_wall / 2;
        const X_wall_max = W_wall / 2;

        // The side walls and floor fit exactly between the inner faces
        // of the surrounding walls, so the corners meet without overlap.
        const innerShellCenterZ = -houseDepth / 2 + wallThickness / 4;
        const innerShellDepth = Math.max(
            wallThickness,
            houseDepth - wallThickness * 1.5
        );
        const innerFloorWidth = Math.max(
            wallThickness,
            W_wall - wallThickness * 2
        );

        ground.position.y = Y_floor;
        gridHelper.position.y = Y_floor + 0.005;

        function addMeshWithOutline(targetGroup, geometry, material, pos = null, rot = null) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = !captureMode;
            mesh.receiveShadow = !captureMode;

            if (pos) mesh.position.set(pos.x, pos.y, pos.z);
            if (rot) mesh.rotation.set(rot.x, rot.y, rot.z);

            const edges = new THREE.EdgesGeometry(geometry);
            mesh.add(new THREE.LineSegments(edges, outlineMat));
            targetGroup.add(mesh);
            return mesh;
        }

        function addSharedMeshWithOutline(
            targetGroup,
            geometry,
            edgesGeometry,
            material,
            pos,
            scale = null,
            rot = null
        ) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = !captureMode;
            mesh.receiveShadow = !captureMode;

            if (pos) mesh.position.set(pos.x, pos.y, pos.z);
            if (scale) mesh.scale.set(scale.x, scale.y, scale.z);
            if (rot) mesh.rotation.set(rot.x, rot.y, rot.z);

            mesh.add(new THREE.LineSegments(edgesGeometry, outlineMat));
            targetGroup.add(mesh);
            return mesh;
        }

        // Only the front wall and its hole depend on the current window size.
        clearGeneratedGroup(houseFrontGroup);

        const frontShape = new THREE.Shape();
        frontShape.moveTo(X_wall_min, Y_floor);
        frontShape.lineTo(X_wall_max, Y_floor);
        frontShape.lineTo(X_wall_max, Y_wall_top);
        frontShape.lineTo(X_wall_min, Y_wall_top);
        frontShape.closePath();

        const holePath = new THREE.Path();
        holePath.moveTo(-A / 2, -B / 2);
        holePath.lineTo(A / 2, -B / 2);
        holePath.lineTo(A / 2, B / 2);
        holePath.lineTo(-A / 2, B / 2);
        holePath.closePath();
        frontShape.holes.push(holePath);

        const frontGeo = new THREE.ExtrudeGeometry(frontShape, {
            depth: wallThickness,
            bevelEnabled: false,
            curveSegments: 1,
            steps: 1,
        });
        addMeshWithOutline(
            houseFrontGroup,
            frontGeo,
            wallMat,
            { x: 0, y: 0, z: -wallThickness / 2 }
        );

        // Everything else is static for the selected house preset.
        if (activeHousePresetKey === housePresetKey) {
            return;
        }

        clearGeneratedGroup(houseStaticGroup);
        activeHousePresetKey = housePresetKey;

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedBoxGeo,
            sharedBoxEdges,
            wallMat,
            { x: 0, y: Y_floor + H_wall / 2, z: -houseDepth + wallThickness / 2 },
            { x: W_wall, y: H_wall, z: wallThickness }
        );

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedBoxGeo,
            sharedBoxEdges,
            wallMat,
            { x: X_wall_min + wallThickness / 2, y: Y_floor + H_wall / 2, z: innerShellCenterZ },
            { x: wallThickness, y: H_wall, z: innerShellDepth }
        );

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedBoxGeo,
            sharedBoxEdges,
            wallMat,
            { x: X_wall_max - wallThickness / 2, y: Y_floor + H_wall / 2, z: innerShellCenterZ },
            { x: wallThickness, y: H_wall, z: innerShellDepth }
        );

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedBoxGeo,
            sharedBoxEdges,
            wallMat,
            { x: 0, y: Y_floor + 0.01, z: innerShellCenterZ },
            { x: innerFloorWidth, y: 0.02, z: innerShellDepth }
        );

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedGableGeo,
            sharedGableEdges,
            wallMat,
            { x: 0, y: Y_wall_top + gableHeight / 2, z: 0 },
            { x: W_wall, y: gableHeight, z: wallThickness }
        );

        addSharedMeshWithOutline(
            houseStaticGroup,
            sharedGableGeo,
            sharedGableEdges,
            wallMat,
            { x: 0, y: Y_wall_top + gableHeight / 2, z: -houseDepth + wallThickness / 2 },
            { x: W_wall, y: gableHeight, z: wallThickness }
        );

        const theta = Math.atan2(gableHeight, W_wall / 2);
        const roofDepthExact = houseDepth + 0.15;
        const roofThickness = 0.05;
        const verticalRoofThickness = roofThickness / Math.cos(theta);
        const overhangX = 0.05;
        const X_roof_min = X_wall_min - overhangX;
        const X_roof_max = X_wall_max + overhangX;
        const Y_roof_min = Y_wall_top - overhangX * Math.tan(theta);

        const leftRoofShape = new THREE.Shape();
        leftRoofShape.moveTo(X_roof_min, Y_roof_min);
        leftRoofShape.lineTo(0, Y_wall_top + gableHeight);
        leftRoofShape.lineTo(0, Y_wall_top + gableHeight + verticalRoofThickness);
        leftRoofShape.lineTo(X_roof_min, Y_roof_min + verticalRoofThickness);
        leftRoofShape.closePath();

        const leftRoofGeo = new THREE.ExtrudeGeometry(leftRoofShape, {
            depth: roofDepthExact,
            bevelEnabled: false,
            curveSegments: 1,
            steps: 1,
        });
        addMeshWithOutline(
            houseStaticGroup,
            leftRoofGeo,
            roofMat,
            { x: 0, y: 0, z: -houseDepth - 0.05 }
        );

        const rightRoofShape = new THREE.Shape();
        rightRoofShape.moveTo(0, Y_wall_top + gableHeight);
        rightRoofShape.lineTo(X_roof_max, Y_roof_min);
        rightRoofShape.lineTo(X_roof_max, Y_roof_min + verticalRoofThickness);
        rightRoofShape.lineTo(0, Y_wall_top + gableHeight + verticalRoofThickness);
        rightRoofShape.closePath();

        const rightRoofGeo = new THREE.ExtrudeGeometry(rightRoofShape, {
            depth: roofDepthExact,
            bevelEnabled: false,
            curveSegments: 1,
            steps: 1,
        });
        addMeshWithOutline(
            houseStaticGroup,
            rightRoofGeo,
            roofMat,
            { x: 0, y: 0, z: -houseDepth - 0.05 }
        );

        const interiorLight = new THREE.PointLight(0xffaa44, 1.5, 10);
        interiorLight.position.set(0, Y_floor + 1.2, -houseDepth / 2);
        houseStaticGroup.add(interiorLight);
    }

    return {
        buildHouse,
        houseGroup,
    };
}
