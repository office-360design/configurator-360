const WINDOW_TEMPLATES = Object.freeze([
    {
        id: 'single-fixed',
        name: 'Fixed Light',
        columnCount: 1,
        image: './assets/window-templates/fixed-window.png',
    },
    {
        id: 'single-right',
        name: 'Single-vent window',
        columnCount: 1,
        image: './assets/window-templates/single-casement-window.png',
    },
    {
        id: 'vertical-2-right-left',
        name: 'Double-vent window',
        columnCount: 2,
        image: './assets/window-templates/double-casement-window.png',
    },
    {
        id: 'vertical-2-fixed-left',
        name: 'Single-vent with fixed light',
        columnCount: 2,
        image: './assets/window-templates/fixed-casement-combination.png',
    },
    {
        id: 'vertical-3-right-right-left',
        name: 'Three-vent window',
        columnCount: 3,
        image: './assets/window-templates/triple-casement-window.png',
    },
    {
        id: 'vertical-3-right-fixed-left',
        name: 'Double-vent with fixed light',
        columnCount: 3,
        image: './assets/window-templates/casement-fixed-casement.png',
    },
]);


const STYLE_ID = 'window-templates-styles';
const LAUNCHER_ID = 'window-templates-launcher';
const POPOVER_ID = 'window-templates-popover';

function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = './css/window-templates.css?v=2';
    document.head.appendChild(link);
}

function getToolsLauncher() {
    return document.querySelector('.shared-ui-host [data-shared-tools] > .tool-launcher[data-action="toggle-tools"]');
}

function getSharedUiHost() {
    return document.querySelector('.shared-ui-host') || document.body;
}

function closeToolsMenu() {
    const toolsLauncher = getToolsLauncher();
    if (toolsLauncher?.getAttribute('aria-expanded') === 'true') toolsLauncher.click();
}

const TEMPLATE_CELL_WIDTH_M = 0.6;
const TEMPLATE_HEIGHT_M = 0.9;

function waitForConfiguratorReady(timeoutMs = 12000) {
    if (window.CONFIGURATOR_READY === true) return Promise.resolve(true);
    return new Promise(resolve => {
        const startedAt = performance.now();
        const check = () => {
            if (window.CONFIGURATOR_READY === true) {
                resolve(true);
                return;
            }
            if (performance.now() - startedAt >= timeoutMs) {
                resolve(false);
                return;
            }
            window.setTimeout(check, 25);
        };
        check();
    });
}

function commitOverallSize(template) {
    const widthRange = document.getElementById('overallWidthA');
    const heightRange = document.getElementById('overallHeightB');
    const widthM = TEMPLATE_CELL_WIDTH_M * Math.max(1, Number(template.columnCount) || 1);

    if (widthRange) widthRange.value = String(widthM);
    if (heightRange) heightRange.value = String(TEMPLATE_HEIGHT_M);

    // Run the same sizing path as a real slider interaction. This is deliberately
    // done after the layout controller has finished rebuilding the preset so the
    // visible slider value and the physical grid tracks cannot get out of sync.
    widthRange?.dispatchEvent(new Event('input', { bubbles: true }));
    heightRange?.dispatchEvent(new Event('input', { bubbles: true }));
    widthRange?.dispatchEvent(new Event('change', { bubbles: true }));
    heightRange?.dispatchEvent(new Event('change', { bubbles: true }));
}

async function applyTemplate(template) {
    const layoutInput = document.getElementById('windowLayout');
    if (!layoutInput) return false;

    // Do not restore a captured configuration here. That route can reuse the
    // current profile selection and used to enter refreshProfileMaterials(),
    // which is unrelated to choosing a layout and can leave only the sidebar
    // values changed if material refresh fails. The hidden layout select is the
    // existing source of truth for preset layout changes, so use its normal
    // change handler and let the window layout controller rebuild the geometry.
    layoutInput.value = template.id;
    layoutInput.dispatchEvent(new Event('change', { bubbles: true }));

    // setLayout() marks the configurator busy synchronously before its first
    // awaited CAD/profile load. Wait for that rebuild to finish, then commit the
    // template's exact overall dimensions through the real overall-size controls.
    await waitForConfiguratorReady();
    commitOverallSize(template);

    window.WINDOW_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
    return true;
}

function createPopover() {
    const popover = document.createElement('section');
    popover.id = POPOVER_ID;
    popover.className = 'window-templates-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', 'Window templates');

    const header = document.createElement('div');
    header.className = 'window-templates-popover__header';
    header.innerHTML = `
        <div>
            <strong>Window templates</strong>
        </div>
        <button type="button" class="window-templates-popover__close" aria-label="Close window templates">×</button>
    `;

    const grid = document.createElement('div');
    grid.className = 'window-templates-grid';

    WINDOW_TEMPLATES.forEach(template => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'window-template-card';
        card.dataset.windowTemplate = template.id;
        card.innerHTML = `
            <span class="window-template-card__image-wrap">
                <img class="window-template-card__image" src="${template.image}" alt="" loading="eager">
            </span>
            <span class="window-template-card__copy">
                <strong>${template.name}</strong>
            </span>
        `;
        card.addEventListener('click', async () => {
            card.disabled = true;
            try {
                if (await applyTemplate(template)) closePopover();
            } finally {
                card.disabled = false;
            }
        });
        grid.appendChild(card);
    });

    popover.append(header, grid);
    header.querySelector('.window-templates-popover__close')?.addEventListener('click', closePopover);
    getSharedUiHost().appendChild(popover);
    return popover;
}

function positionElements() {
    const toolsLauncher = getToolsLauncher();
    const launcher = document.getElementById(LAUNCHER_ID);
    const popover = document.getElementById(POPOVER_ID);
    if (!toolsLauncher || !launcher) return;

    const toolsRect = toolsLauncher.getBoundingClientRect();
    const gap = 10;
    launcher.style.top = `${Math.round(toolsRect.top)}px`;
    launcher.style.left = `${Math.round(toolsRect.right + gap)}px`;

    if (popover && !popover.hidden) {
        const margin = 12;
        const launcherRect = launcher.getBoundingClientRect();
        const width = Math.min(720, Math.max(300, window.innerWidth - margin * 2));
        const left = Math.min(
            Math.max(margin, launcherRect.left),
            Math.max(margin, window.innerWidth - width - margin),
        );
        popover.style.width = `${width}px`;
        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(launcherRect.bottom + 10)}px`;
        popover.style.maxHeight = `${Math.max(220, window.innerHeight - launcherRect.bottom - 22)}px`;
    }
}

function closePopover() {
    const launcher = document.getElementById(LAUNCHER_ID);
    const popover = document.getElementById(POPOVER_ID);
    if (!launcher || !popover || popover.hidden) return;
    popover.hidden = true;
    launcher.classList.remove('is-active');
    launcher.setAttribute('aria-expanded', 'false');
}

function togglePopover() {
    const launcher = document.getElementById(LAUNCHER_ID);
    const popover = document.getElementById(POPOVER_ID) || createPopover();
    if (!launcher) return;

    const willOpen = popover.hidden;
    if (willOpen) {
        closeToolsMenu();
        popover.hidden = false;
        launcher.classList.add('is-active');
        launcher.setAttribute('aria-expanded', 'true');
        positionElements();
        popover.querySelector('.window-template-card')?.focus({ preventScroll: true });
    } else {
        closePopover();
    }
}

function createLauncher(toolsLauncher) {
    const launcher = toolsLauncher.cloneNode(false);
    launcher.id = LAUNCHER_ID;
    launcher.classList.remove('is-active');
    launcher.classList.add('window-templates-launcher');
    launcher.dataset.action = 'toggle-window-templates';
    launcher.textContent = 'Templates';
    launcher.setAttribute('aria-label', 'Window templates');
    launcher.setAttribute('aria-controls', POPOVER_ID);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.removeAttribute('title');
    launcher.addEventListener('click', togglePopover);
    getSharedUiHost().appendChild(launcher);
    return launcher;
}

function mountOnce() {
    if (document.getElementById(LAUNCHER_ID)) {
        positionElements();
        return true;
    }
    const toolsLauncher = getToolsLauncher();
    if (!toolsLauncher) return false;
    createLauncher(toolsLauncher);
    createPopover();
    positionElements();
    return true;
}

export function mountWindowTemplates() {
    ensureStylesheet();
    mountOnce();

    const observer = new MutationObserver(() => {
        const launcher = document.getElementById(LAUNCHER_ID);
        const toolsLauncher = getToolsLauncher();
        if (!toolsLauncher) return;
        if (!launcher || !launcher.isConnected) mountOnce();
        else positionElements();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', positionElements, { passive: true });
    window.addEventListener('scroll', positionElements, { passive: true });
    document.addEventListener('pointerdown', event => {
        const launcher = document.getElementById(LAUNCHER_ID);
        const popover = document.getElementById(POPOVER_ID);
        if (!popover || popover.hidden) return;
        if (launcher?.contains(event.target) || popover.contains(event.target)) return;
        closePopover();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const popover = document.getElementById(POPOVER_ID);
        if (!popover || popover.hidden) return;
        closePopover();
        document.getElementById(LAUNCHER_ID)?.focus({ preventScroll: true });
    });

    return { close: closePopover, reposition: positionElements };
}
