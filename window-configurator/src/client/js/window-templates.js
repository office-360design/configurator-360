import { mountTemplatesMenu } from '../shared-ui/src/components/templatesMenu.js?v=templates-1';

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


let menu = null;
let sidebarObserver = null;

function closePopover() { menu?.close(); }

const TEMPLATE_CELL_WIDTH_M = 0.6;
const TEMPLATE_HEIGHT_M = 0.9;

async function applyTemplate(template) {
    const layoutInput = document.getElementById('windowLayout');
    if (!layoutInput) return false;

    // Close the chooser before the layout change starts its loading state, so
    // the loading overlay is never covered by the template selection popover.
    closePopover();

    // Pass the target physical size into the same layout mutation that creates
    // the new topology. The controller consumes these one-shot values before it
    // notifies the renderer, so there is no intermediate 600 x 900 build followed
    // by a second resize build.
    const widthM = TEMPLATE_CELL_WIDTH_M * Math.max(1, Number(template.columnCount) || 1);
    layoutInput.dataset.layoutTargetWidthM = String(widthM);
    layoutInput.dataset.layoutTargetHeightM = String(TEMPLATE_HEIGHT_M);
    layoutInput.value = template.id;
    layoutInput.dispatchEvent(new Event('change', { bubbles: true }));

    window.WINDOW_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
    return true;
}

export function mountWindowTemplates() {
    // This sheet also contains window-specific phone/editor layout rules.
    if (!document.getElementById('window-templates-styles')) {
        const link = document.createElement('link');
        link.id = 'window-templates-styles';
        link.rel = 'stylesheet';
        link.href = './css/window-templates.css?v=6';
        document.head.appendChild(link);
    }
    menu = mountTemplatesMenu({
        enabled: true,
        idPrefix: 'window',
        items: WINDOW_TEMPLATES,
        labels: { launcher: 'Templates', title: 'Window templates', close: 'Close window templates' },
        cardDataKey: 'windowTemplate',
        // Preserve existing selectors used by the window's mobile editor.
        classes: {
            launcher: 'window-templates-launcher',
            panel: 'window-templates-popover',
            header: 'window-templates-popover__header',
            close: 'window-templates-popover__close',
            grid: 'window-templates-grid',
            card: 'window-template-card',
            imageWrap: 'window-template-card__image-wrap',
            image: 'window-template-card__image',
            copy: 'window-template-card__copy',
        },
        onSelect: applyTemplate,
        onError(error) { console.error('Could not apply window template:', error); },
    });

    if (!sidebarObserver) {
        sidebarObserver = new MutationObserver(() => {
            if (!window.matchMedia('(max-width: 760px)').matches) return;
            document.documentElement.scrollLeft = 0;
            document.body.scrollLeft = 0;
            requestAnimationFrame(() => {
                document.documentElement.scrollLeft = 0;
                document.body.scrollLeft = 0;
            });
            if (document.body.classList.contains('sidebar-is-collapsed')) return;
            menu?.close();
            const tools = document.querySelector('.shared-ui-host [data-action="toggle-tools"]');
            if (tools?.getAttribute('aria-expanded') === 'true') tools.click();
        });
        sidebarObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    return menu;
}
