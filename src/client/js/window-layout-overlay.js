import * as THREE from 'three';
import {
    FIXED_WINDOW_TYPE,
    SASH_WINDOW_TYPE,
} from './window-layout-state.js';

const OUTER_OFFSET_M = 0.075;
const FRONT_OFFSET_M = 0.16;

function stopPointerPropagation(element) {
    ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach(type => {
        element.addEventListener(type, event => event.stopPropagation());
    });
}

function projectLocalPoint({ point, camera, mainGroup, container }) {
    if (!camera || !mainGroup || !container) return null;
    camera.updateMatrixWorld();
    mainGroup.updateWorldMatrix(true, false);
    const world = point.clone();
    mainGroup.localToWorld(world);
    const projected = world.project(camera);
    if (projected.z < -1 || projected.z > 1) return null;
    const rect = container.getBoundingClientRect();
    return {
        x: (projected.x * 0.5 + 0.5) * rect.width,
        y: (-projected.y * 0.5 + 0.5) * rect.height,
    };
}

function normalizedCoordinateToLocal(value, span) {
    return -span / 2 + Number(value) * span;
}

export function createWindowLayoutOverlay({
    container,
    camera,
    mainGroup,
    getWindowLayoutState,
    getWidth,
    getHeight,
    getSelectedHandleSide = () => 'right',
    onAddWindow = async () => {},
    onMergeWindows = async () => {},
    enabled = true,
    getEditableTopologyGeometry = () => null,
} = {}) {
    if (!container || typeof document === 'undefined') {
        return { update() {}, destroy() {}, closeWheel() {} };
    }

    const root = document.createElement('div');
    root.className = 'window-layout-overlay';
    root.setAttribute('aria-label', 'Window layout editing controls');
    container.appendChild(root);

    let renderedSignature = null;
    let controls = [];
    let wheel = null;

    function closeWheel() {
        wheel?.remove();
        wheel = null;
    }

    function getCell(state, id) {
        return state?.windowState?.windows?.find(cell => cell.id === id) || null;
    }

    function openTypeWheel(anchor, onSelect) {
        closeWheel();
        const menu = document.createElement('div');
        menu.className = 'window-type-wheel';
        menu.style.left = `${anchor.x}px`;
        menu.style.top = `${anchor.y}px`;
        menu.innerHTML = `
            <button type="button" class="window-type-wheel-option is-fixed" data-window-type="${FIXED_WINDOW_TYPE}" title="Fixed window">
                <span class="window-type-wheel-icon">F</span>
                <span>Fixed</span>
            </button>
            <button type="button" class="window-type-wheel-option is-sash" data-window-type="${SASH_WINDOW_TYPE}" title="Sash window">
                <span class="window-type-wheel-icon window-type-wheel-sash-icon"></span>
                <span>Sash</span>
            </button>
            <button type="button" class="window-type-wheel-close" aria-label="Close">×</button>
        `;
        stopPointerPropagation(menu);
        menu.querySelectorAll('[data-window-type]').forEach(button => {
            button.addEventListener('click', async () => {
                const type = button.dataset.windowType;
                closeWheel();
                await onSelect(type);
            });
        });
        menu.querySelector('.window-type-wheel-close')?.addEventListener('click', closeWheel);
        root.appendChild(menu);
        wheel = menu;
    }

    function createControl(definition) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `window-layout-node window-layout-node-${definition.kind}`;
        button.dataset.controlId = definition.id;
        button.title = definition.kind === 'add'
            ? `Add window ${definition.direction}`
            : 'Merge windows';
        button.setAttribute('aria-label', button.title);
        button.textContent = definition.kind === 'add' ? '+' : '↔';
        stopPointerPropagation(button);
        button.addEventListener('click', async event => {
            const rect = root.getBoundingClientRect();
            const anchor = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            };
            const state = getWindowLayoutState?.();
            if (definition.kind === 'add') {
                openTypeWheel(anchor, type => onAddWindow(
                    definition.cellId,
                    definition.direction,
                    type,
                    type === SASH_WINDOW_TYPE ? getSelectedHandleSide() : null
                ));
                return;
            }

            const a = getCell(state, definition.cellAId);
            const b = getCell(state, definition.cellBId);
            if (a?.type && a.type === b?.type) {
                closeWheel();
                await onMergeWindows(
                    definition.cellAId,
                    definition.cellBId,
                    a.type,
                    a.type === SASH_WINDOW_TYPE ? (a.handleSide || b.handleSide || getSelectedHandleSide()) : null
                );
                return;
            }
            openTypeWheel(anchor, type => onMergeWindows(
                definition.cellAId,
                definition.cellBId,
                type,
                type === SASH_WINDOW_TYPE ? getSelectedHandleSide() : null
            ));
        });
        root.appendChild(button);
        controls.push({ definition, button });
    }

    function rebuildControls(state) {
        closeWheel();
        controls.forEach(({ button }) => button.remove());
        controls = [];
        const topology = state?.topology;
        if (!topology) return;
        (topology.addCandidates || []).forEach(candidate => createControl({
            kind: 'add',
            ...candidate,
        }));
        (topology.mergeCandidates || []).forEach(candidate => createControl({
            kind: 'merge',
            ...candidate,
        }));
    }

    function localPointForControl(definition) {
        if (definition.kind === 'add') {
            const placement = getEditableTopologyGeometry()?.framePlacements?.find(p => 
                p.windowCell === definition.cellId && p.side === definition.direction
            );
            if (placement) {
                let x = placement.originX;
                let y = placement.originY;
                if (definition.direction === 'left') x -= placement.width / 2 + OUTER_OFFSET_M;
                if (definition.direction === 'right') x += placement.width / 2 + OUTER_OFFSET_M;
                if (definition.direction === 'top') y += placement.height / 2 + OUTER_OFFSET_M;
                if (definition.direction === 'bottom') y -= placement.height / 2 + OUTER_OFFSET_M;
                return new THREE.Vector3(x, y, FRONT_OFFSET_M);
            }
        } else if (definition.kind === 'merge') {
            const segment = getEditableTopologyGeometry()?.dividerSegments?.find(s => 
                s.coordinate === definition.coordinate 
                && s.start === definition.start 
                && s.end === definition.end
                && s.orientation === definition.orientation
            );
            if (segment) {
                if (definition.orientation === 'vertical') {
                    return new THREE.Vector3(segment.perpendicularOffset, segment.longitudinalOffset, FRONT_OFFSET_M);
                }
                return new THREE.Vector3(segment.longitudinalOffset, segment.perpendicularOffset, FRONT_OFFSET_M);
            }
        }
        return new THREE.Vector3(0, 0, FRONT_OFFSET_M);
    }

    function update() {
        if (!enabled) {
            root.hidden = true;
            return;
        }
        const state = getWindowLayoutState?.();
        if (!state?.topology) {
            root.hidden = true;
            return;
        }
        root.hidden = false;
        if (renderedSignature !== state.layoutSignature) {
            renderedSignature = state.layoutSignature;
            rebuildControls(state);
        }

        controls.forEach(({ definition, button }) => {
            const point = localPointForControl(definition);
            const screen = projectLocalPoint({ point, camera, mainGroup, container });
            if (!screen) {
                button.hidden = true;
                return;
            }
            button.hidden = false;
            button.style.left = `${screen.x}px`;
            button.style.top = `${screen.y}px`;
        });
    }

    function destroy() {
        closeWheel();
        root.remove();
        controls = [];
    }

    return { update, destroy, closeWheel };
}
