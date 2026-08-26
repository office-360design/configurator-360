import { getWindowLocale, windowT } from './i18n.js';
import { WINDOW_WIDTH_MAX_M } from './config.js';

const SIZE_REBUILD_INTERVAL_MS = 70;

function setSidebarCollapsed(collapsed) {
    const controlsPanel = document.getElementById('controls');
    const toggleButton = document.getElementById('sidebar-toggle');
    if (!controlsPanel || !toggleButton) return;

    controlsPanel.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-is-collapsed', collapsed);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
    const locale = getWindowLocale();
    const sidebarLabel = windowT(locale, collapsed ? 'sidebar.show' : 'sidebar.hide');
    toggleButton.setAttribute('aria-label', sidebarLabel);
    toggleButton.title = sidebarLabel;
}

function stepDecimals(stepValue) {
    const text = String(stepValue ?? '');
    if (!text.includes('.')) return 0;
    return text.split('.')[1].length;
}

function changeInputValue(input, delta) {
    const min = Number.parseFloat(input.min);
    const max = Number.parseFloat(input.max);
    const value = Number.parseFloat(input.value) || min;
    const nextValue = Math.min(max, Math.max(min, value + delta));
    const decimals = Math.max(3, stepDecimals(input.step));
    input.value = nextValue.toFixed(decimals);
    input.dispatchEvent(new Event('input'));
}

export function initializeUIControls({
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
    onWindowSizeChange = null,
    syncModeButtons,
    setExploded,
    setSelectedHandleSide,
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
    downloadLatestARAsset,
    checkLatestStaticModel,
    startAR,
}) {
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        const controlsPanel = document.getElementById('controls');
        const collapsed = controlsPanel?.classList.contains('sidebar-collapsed') || false;
        setSidebarCollapsed(!collapsed);
    });

    let pendingWindowRebuildTimer = null;
    let lastSizeRebuildAt = 0;
    const pendingSizeAxes = new Set();

    function updateSizeLabelsOnly() {
        const width = Number.parseFloat(widthInput.value) || WINDOW_WIDTH_MAX_M;
        const height = Number.parseFloat(heightInput.value) || 1.5;
        document.getElementById('valWidth').innerText = `${Math.round(width * 1000)} mm`;
        document.getElementById('valHeight').innerText = `${Math.round(height * 1000)} mm`;
    }

    function queueSizeAxis(axis) {
        if (axis === 'width' || axis === 'height') pendingSizeAxes.add(axis);
    }

    function emitPendingWindowSizeChange() {
        const payload = {};
        if (pendingSizeAxes.has('width')) payload.widthM = Number.parseFloat(widthInput.value);
        if (pendingSizeAxes.has('height')) payload.heightM = Number.parseFloat(heightInput.value);
        pendingSizeAxes.clear();

        if (typeof onWindowSizeChange === 'function') {
            onWindowSizeChange(payload);
        } else {
            buildWindow();
        }
    }

    function flushWindowSizeRebuild(axis = null) {
        queueSizeAxis(axis);
        if (pendingWindowRebuildTimer !== null) {
            clearTimeout(pendingWindowRebuildTimer);
            pendingWindowRebuildTimer = null;
        }

        lastSizeRebuildAt = performance.now();
        emitPendingWindowSizeChange();
    }

    function triggerWindowRebuild(axis) {
        queueSizeAxis(axis);
        updateSizeLabelsOnly();

        const elapsed = performance.now() - lastSizeRebuildAt;
        if (elapsed >= SIZE_REBUILD_INTERVAL_MS && pendingWindowRebuildTimer === null) {
            flushWindowSizeRebuild();
            return;
        }

        if (pendingWindowRebuildTimer === null) {
            pendingWindowRebuildTimer = setTimeout(() => {
                pendingWindowRebuildTimer = null;
                lastSizeRebuildAt = performance.now();
                emitPendingWindowSizeChange();
            }, Math.max(0, SIZE_REBUILD_INTERVAL_MS - elapsed));
        }
    }

    widthInput.addEventListener('input', () => triggerWindowRebuild('width'));
    heightInput.addEventListener('input', () => triggerWindowRebuild('height'));
    widthInput.addEventListener('change', () => flushWindowSizeRebuild('width'));
    heightInput.addEventListener('change', () => flushWindowSizeRebuild('height'));

    document.getElementById('btnWidthDec').addEventListener('click', () => {
        changeInputValue(widthInput, -0.001);
    });
    document.getElementById('btnWidthInc').addEventListener('click', () => {
        changeInputValue(widthInput, 0.001);
    });
    document.getElementById('btnHeightDec').addEventListener('click', () => {
        changeInputValue(heightInput, -0.001);
    });
    document.getElementById('btnHeightInc').addEventListener('click', () => {
        changeInputValue(heightInput, 0.001);
    });

    const toggleSectionButton = document.getElementById('toggleSectionViewBtn');
    if (toggleSectionButton) {
        toggleSectionButton.addEventListener('click', () => {
            const isActive = toggleSectionButton.classList.toggle('active');
            sectionGroup.visible = isActive;
        });
    }

    let pendingGlassThicknessFrame = null;
    let lastRenderedGlazingBeadCode = getActiveGlazingBeadCode();
    let lastRenderedGasketCode = getActiveGasketCode();

    glassThicknessInput.addEventListener('input', () => {
        const thickness = Math.min(
            29,
            Math.max(16, Number.parseFloat(glassThicknessInput.value) || 24)
        );
        glassThicknessInput.value = String(thickness);

        if (glassThicknessLabel) {
            glassThicknessLabel.textContent = `${thickness.toFixed(0)} mm`;
        }

        updateComponentPictures();

        if (pendingGlassThicknessFrame !== null) {
            return;
        }

        pendingGlassThicknessFrame = requestAnimationFrame(() => {
            pendingGlassThicknessFrame = null;

            const nextBeadCode = getActiveGlazingBeadCode();
            if (nextBeadCode !== lastRenderedGlazingBeadCode) {
                lastRenderedGlazingBeadCode = nextBeadCode;
                updateGlazingBeadToggleLabels();
            }

            const nextGasketCode = getActiveGasketCode();
            if (nextGasketCode !== lastRenderedGasketCode) {
                lastRenderedGasketCode = nextGasketCode;
                updateGasketToggleLabels();
            }

            buildWindow();
        });
    });

    document.getElementById('cExplode').addEventListener('change', (event) => {
        const exploded = event.target.checked;
        setExploded(exploded);
        if (!exploded) {
            componentSelection.clear();
        }
    });

    document.getElementById('mBatant').addEventListener('change', buildWindow);
    document.getElementById('mOscilo').addEventListener('change', buildWindow);


    const batantButton = document.getElementById('btnModeBatant');
    const osciloButton = document.getElementById('btnModeOscilo');
    if (batantButton && osciloButton) {
        batantButton.addEventListener('click', () => {
            document.getElementById('mBatant').checked = true;
            document.getElementById('mOscilo').checked = false;
            syncModeButtons();
            buildWindow();
        });
        osciloButton.addEventListener('click', () => {
            document.getElementById('mOscilo').checked = true;
            document.getElementById('mBatant').checked = false;
            syncModeButtons();
            buildWindow();
        });
    }

    document.getElementById('side_top').addEventListener('change', buildWindow);
    document.getElementById('side_bottom').addEventListener('change', buildWindow);
    document.getElementById('side_left').addEventListener('change', buildWindow);
    document.getElementById('side_right').addEventListener('change', buildWindow);
    document.getElementById('cShowHouse').addEventListener('change', buildWindow);

    cadReferenceButton.addEventListener('click', openCadReferenceModal);
    document.getElementById('cad-reference-close').addEventListener('click', closeCadReferenceModal);
    cadReferenceModal.addEventListener('click', (event) => {
        if (event.target.id === 'cad-reference-modal') {
            closeCadReferenceModal();
        }
    });

    document.querySelectorAll('.ar-platform-option').forEach(button => {
        button.addEventListener('click', () => {
            setSelectedARPlatform(button.dataset.platform);
        });
    });

    document.getElementById('qr-ar-button').addEventListener('click', openQRModal);
    document.getElementById('qr-close').addEventListener('click', closeQRModal);
    document.getElementById('qr-download-model').addEventListener('click', downloadLatestARAsset);
    document.getElementById('qr-check-published').addEventListener('click', checkLatestStaticModel);
    document.getElementById('qr-modal').addEventListener('click', (event) => {
        if (event.target.id === 'qr-modal') {
            closeQRModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            componentSelection.clear();
            closeQRModal();
            closeCadReferenceModal();
        }
    });

    document.getElementById('ar-start-button').addEventListener('click', startAR);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
