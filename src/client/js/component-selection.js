import * as THREE from 'three';

const POINTER_DRAG_THRESHOLD_PX = 5;
const HIGHLIGHT_COLOUR = new THREE.Color(0x3b82f6);

function cloneHighlightedMaterial(material) {
    if (Array.isArray(material)) {
        return material.map(cloneHighlightedMaterial);
    }

    const highlighted = material.clone();
    if (highlighted.emissive?.isColor) {
        highlighted.emissive.copy(HIGHLIGHT_COLOUR);
        if ('emissiveIntensity' in highlighted) {
            highlighted.emissiveIntensity = Math.max(
                Number(highlighted.emissiveIntensity) || 0,
                0.7
            );
        }
    }
    highlighted.needsUpdate = true;
    return highlighted;
}

function disposeHighlightedMaterial(material) {
    if (Array.isArray(material)) {
        material.forEach(disposeHighlightedMaterial);
        return;
    }
    material?.dispose?.();
}

function getComponentSourceLabel(source) {
    if (source === 'frame') return 'Frame';
    if (source === 'bead') return 'Glazing bead';
    return 'Sash / Vent';
}

export function createComponentSelection({
    renderer,
    camera,
    enabled = true,
    isSelectionEnabled = () => true,
}) {
    const popup = document.getElementById('component-selection-popup');
    const name = document.getElementById('component-selection-name');
    const source = document.getElementById('component-selection-source');
    const closeButton = document.getElementById('component-selection-close');
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let selectableMeshes = [];
    let selectedMesh = null;
    let selectedOriginalMaterial = null;
    let pointerStart = null;

    function clear() {
        if (selectedMesh && selectedOriginalMaterial) {
            const highlightedMaterial = selectedMesh.material;
            selectedMesh.material = selectedOriginalMaterial;
            disposeHighlightedMaterial(highlightedMaterial);
        }

        selectedMesh = null;
        selectedOriginalMaterial = null;
        if (popup) popup.hidden = true;
    }

    function select(mesh) {
        const component = mesh?.userData?.componentSelection;
        if (!component || mesh === selectedMesh) return;

        clear();
        selectedMesh = mesh;
        selectedOriginalMaterial = mesh.material;
        mesh.material = cloneHighlightedMaterial(mesh.material);

        if (name) name.textContent = component.name;
        if (source) source.textContent = getComponentSourceLabel(component.source);
        if (popup) popup.hidden = false;
    }

    function raycast(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(selectableMeshes, false)[0]?.object || null;
    }

    function handlePointerDown(event) {
        if (!isSelectionEnabled() || event.button !== 0) {
            pointerStart = null;
            return;
        }

        pointerStart = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        };
    }

    function handlePointerUp(event) {
        const start = pointerStart;
        pointerStart = null;
        if (!start || start.pointerId !== event.pointerId || !isSelectionEnabled()) return;

        const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (moved > POINTER_DRAG_THRESHOLD_PX) return;

        const selected = raycast(event);
        if (selected) select(selected);
        else clear();
    }

    function handlePointerCancel() {
        pointerStart = null;
    }

    function reset() {
        clear();
        selectableMeshes = [];
    }

    function add(mesh) {
        if (mesh?.isMesh) selectableMeshes.push(mesh);
    }

    function destroy() {
        clear();
        if (!enabled) return;
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
        closeButton?.removeEventListener('click', clear);
    }

    if (enabled) {
        renderer.domElement.addEventListener('pointerdown', handlePointerDown);
        renderer.domElement.addEventListener('pointerup', handlePointerUp);
        renderer.domElement.addEventListener('pointercancel', handlePointerCancel);
        closeButton?.addEventListener('click', clear);
    }

    return { add, clear, destroy, reset };
}
