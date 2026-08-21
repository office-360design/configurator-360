import * as THREE from 'three';
import {
    FIXED_WINDOW_TYPE,
    SASH_WINDOW_TYPE,
} from './window-layout-state.js';
import { getWindowLocale, windowT } from './i18n.js';

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
    onSetTransWindows = async () => {},
    enabled = true,
    getEditableTopologyGeometry = () => null,
} = {}) {
    if (!container || typeof document === 'undefined') {
        return { update() {}, destroy() {}, closeWheel() {} };
    }

    const root = document.createElement('div');
    root.className = 'window-layout-overlay';
    root.setAttribute('aria-label', windowT(getWindowLocale(), 'layout.overlayAria'));
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
        const locale = getWindowLocale();
        menu.innerHTML = `
            <button type="button" class="window-type-wheel-option is-fixed" data-window-type="${FIXED_WINDOW_TYPE}" title="${windowT(locale, 'layout.fixedTitle')}">
                <span class="window-type-wheel-icon">F</span>
                <span>${windowT(locale, 'layout.fixed')}</span>
            </button>
            <button type="button" class="window-type-wheel-option is-sash" data-window-type="${SASH_WINDOW_TYPE}" title="${windowT(locale, 'layout.sashTitle')}">
                <span class="window-type-wheel-icon window-type-wheel-sash-icon"></span>
                <span>${windowT(locale, 'layout.sash')}</span>
            </button>
            <button type="button" class="window-type-wheel-close" aria-label="${windowT(locale, 'layout.close')}">×</button>
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
        const locale = getWindowLocale();
        button.title = definition.kind === 'add'
            ? windowT(locale, 'layout.add', {
                direction: windowT(locale, `layout.direction.${definition.direction}`),
            })
            : definition.kind === 'trans'
                ? windowT(locale, definition.active ? 'layout.transRemove' : 'layout.transAdd')
                : windowT(locale, 'layout.merge');
        button.setAttribute('aria-label', button.title);
        button.textContent = definition.kind === 'add' ? '+' : (definition.kind === 'trans' ? 'T' : '↔');
        button.classList.toggle('is-active', definition.kind === 'trans' && definition.active);
        stopPointerPropagation(button);
        button.addEventListener('click', async event => {
            const rect = root.getBoundingClientRect();
            const anchor = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            };
            const state = getWindowLayoutState?.();
            if (definition.kind === 'trans') {
                closeWheel();
                await onSetTransWindows(
                    definition.cellAId,
                    definition.cellBId,
                    !definition.active,
                    definition.ownerCellId || null
                );
                return;
            }
            if (definition.kind === 'add') {
                openTypeWheel(anchor, type => onAddWindow(
                    definition.cellId,
                    definition.direction,
                    type,
                    type === SASH_WINDOW_TYPE ? getSelectedHandleSide() : null,
                    { start: definition.start, end: definition.end }
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
        (topology.transCandidates || []).forEach(candidate => createControl({
            kind: 'trans',
            ...candidate,
        }));
    }

    function localPointForControl(definition) {
        if (definition.kind === 'add') {
            const geometry = getEditableTopologyGeometry();
            const placement = geometry?.framePlacements?.find(p =>
                definition.frameEdgeId
                    ? p.id === definition.frameEdgeId
                    : (p.windowCell === definition.cellId && p.side === definition.direction)
            );
            if (placement) {
                const edgeStart = Number(placement.start);
                const edgeEnd = Number(placement.end);
                const candidateMid = (Number(definition.start) + Number(definition.end)) / 2;
                const ratio = Number.isFinite(edgeStart)
                    && Number.isFinite(edgeEnd)
                    && edgeEnd > edgeStart
                    && Number.isFinite(candidateMid)
                    ? Math.max(0, Math.min(1, (candidateMid - edgeStart) / (edgeEnd - edgeStart)))
                    : 0.5;
                const worldStart = Number.isFinite(Number(placement.structuralWorldStart))
                    ? Number(placement.structuralWorldStart)
                    : Number(placement.worldStart);
                const worldEnd = Number.isFinite(Number(placement.structuralWorldEnd))
                    ? Number(placement.structuralWorldEnd)
                    : Number(placement.worldEnd);
                const along = Number.isFinite(worldStart) && Number.isFinite(worldEnd)
                    ? worldStart + (worldEnd - worldStart) * ratio
                    : (placement.orientation === 'horizontal' ? placement.originX : placement.originY);
                const perpendicular = Number.isFinite(Number(placement.perpendicularOffset))
                    ? Number(placement.perpendicularOffset)
                    : (placement.orientation === 'horizontal' ? placement.originY : placement.originX);

                if (placement.orientation === 'horizontal') {
                    const y = perpendicular + (definition.direction === 'bottom' ? -OUTER_OFFSET_M : OUTER_OFFSET_M);
                    return new THREE.Vector3(along, y, FRONT_OFFSET_M);
                }
                const x = perpendicular + (definition.direction === 'left' ? -OUTER_OFFSET_M : OUTER_OFFSET_M);
                return new THREE.Vector3(x, along, FRONT_OFFSET_M);
            }

            // The initial single-window preset is not yet marked as dynamic, so
            // the builder intentionally has no editable topology geometry for it.
            // Position those controls directly from the logical window grid
            // instead of allowing all four add buttons to stack at the origin.
            const state = getWindowLayoutState?.();
            const windows = state?.topology?.windows || [];
            if (windows.length) {
                const minX = Math.min(...windows.map(cell => Number(cell.rect.x0)));
                const maxX = Math.max(...windows.map(cell => Number(cell.rect.x1)));
                const minY = Math.min(...windows.map(cell => Number(cell.rect.y0)));
                const maxY = Math.max(...windows.map(cell => Number(cell.rect.y1)));
                const spanX = Math.max(1e-9, maxX - minX);
                const spanY = Math.max(1e-9, maxY - minY);
                const width = Math.max(0, Number(getWidth?.()) || 0);
                const height = Math.max(0, Number(getHeight?.()) || 0);
                const candidateMid = (Number(definition.start) + Number(definition.end)) / 2;

                if (definition.direction === 'top' || definition.direction === 'bottom') {
                    const x = ((candidateMid - minX) / spanX - 0.5) * width;
                    const boundaryY = ((Number(definition.coordinate) - minY) / spanY - 0.5) * height;
                    const y = boundaryY + (definition.direction === 'bottom' ? -OUTER_OFFSET_M : OUTER_OFFSET_M);
                    return new THREE.Vector3(x, y, FRONT_OFFSET_M);
                }
                const boundaryX = ((Number(definition.coordinate) - minX) / spanX - 0.5) * width;
                const y = ((candidateMid - minY) / spanY - 0.5) * height;
                const x = boundaryX + (definition.direction === 'left' ? -OUTER_OFFSET_M : OUTER_OFFSET_M);
                return new THREE.Vector3(x, y, FRONT_OFFSET_M);
            }
        } else if (definition.kind === 'merge' || definition.kind === 'trans') {
            const geometry = getEditableTopologyGeometry();
            const segments = [
                ...(geometry?.dividerSegments || []),
                ...(geometry?.transSegments || []),
            ];
            const segment = segments.find(s => 
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
            const pairOffset = definition.kind === 'merge' ? -18 : (definition.kind === 'trans' ? 18 : 0);
            button.style.left = `${screen.x + pairOffset}px`;
            button.style.top = `${screen.y}px`;
        });
    }

    function handleLocaleChange() {
        root.setAttribute('aria-label', windowT(getWindowLocale(), 'layout.overlayAria'));
        closeWheel();
        const state = getWindowLayoutState?.();
        if (state?.topology) rebuildControls(state);
    }

    globalThis.window?.addEventListener('window-locale-applied', handleLocaleChange);

    function destroy() {
        globalThis.window?.removeEventListener('window-locale-applied', handleLocaleChange);
        closeWheel();
        root.remove();
        controls = [];
    }

    return { update, destroy, closeWheel };
}
