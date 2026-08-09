import {
    getConnectionTemplateIdForLayout,
} from '../../src/client/js/connection-template-loader.js';
import {
    DEFAULT_DIVIDER_PROFILE_ID,
    DEFAULT_WINDOW_LAYOUT_ID,
    WINDOW_LAYOUTS,
    createWindowLayoutController,
    createWindowLayoutSignature,
    getWindowLayoutRequest,
    normalizeWindowLayoutId,
} from '../../src/client/js/window-layout-controller.js';

const errors = [];
const assert = (condition, message) => {
    if (!condition) errors.push(message);
};

assert(
    normalizeWindowLayoutId('unknown') === DEFAULT_WINDOW_LAYOUT_ID,
    'Unknown layouts must fall back to the single-opening layout.'
);
assert(
    WINDOW_LAYOUTS['vertical-divider'].dividerOrientation === 'vertical',
    'The vertical-divider layout must resolve to a vertical divider.'
);
assert(
    WINDOW_LAYOUTS['vertical-fixed-fixed'].dividerOrientation === 'vertical'
        && WINDOW_LAYOUTS['vertical-fixed-fixed'].leftCell === 'fixed-glazing'
        && WINDOW_LAYOUTS['vertical-fixed-fixed'].rightCell === 'fixed-glazing',
    'The fixed/fixed mullion layout must resolve to two fixed-glazing cells.'
);
assert(
    WINDOW_LAYOUTS['horizontal-divider'].dividerOrientation === 'horizontal',
    'The horizontal-divider layout must resolve to a horizontal divider.'
);
assert(
    WINDOW_LAYOUTS['vertical-sash-sash'].dividerOrientation === 'vertical'
        && WINDOW_LAYOUTS['vertical-sash-sash'].leftCell === 'opening-sash'
        && WINDOW_LAYOUTS['vertical-sash-sash'].rightCell === 'opening-sash',
    'The sash/sash mullion layout must resolve to two opening-sash cells.'
);
assert(
    WINDOW_LAYOUTS['vertical-fixed-fixed-fixed'].dividerOrientation === 'vertical'
        && WINDOW_LAYOUTS['vertical-fixed-fixed-fixed'].cells?.length === 3
        && WINDOW_LAYOUTS['vertical-fixed-fixed-fixed'].cells.every(cell => cell === 'fixed-glazing'),
    'The three-column layout must expose three fixed-glazing cells.'
);
assert(
    WINDOW_LAYOUTS['horizontal-fixed-fixed-fixed'].dividerOrientation === 'horizontal'
        && WINDOW_LAYOUTS['horizontal-fixed-fixed-fixed'].cells?.length === 3
        && WINDOW_LAYOUTS['horizontal-fixed-fixed-fixed'].cells.every(cell => cell === 'fixed-glazing'),
    'The three-row layout must expose three fixed-glazing cells.'
);
assert(
    getConnectionTemplateIdForLayout({
        dividerOrientation: 'vertical',
        leftCell: 'opening-sash',
        rightCell: 'opening-sash',
    }) === 'mullion-sash-sash',
    'The sash/sash mullion must use window-sash-mullion-sash-window CAD metadata.'
);
assert(
    getConnectionTemplateIdForLayout({
        dividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    }) === 'mullion-fixed-sash',
    'The horizontal transom must reuse the verified fixed/mullion/sash CAD connection.'
);
assert(
    getConnectionTemplateIdForLayout({
        dividerOrientation: 'horizontal',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    }) === 'mullion-fixed-fixed',
    'Repeated fixed transoms must reuse the verified fixed/mullion/fixed CAD connection.'
);

const request = getWindowLayoutRequest({
    window_layout: 'vertical-divider',
    divider_profile: '575810',
});
assert(request.layoutId === 'vertical-divider', 'URL-style layout input was not parsed.');
assert(request.dividerProfileId === '575810', 'URL-style divider profile input was not parsed.');
assert(
    createWindowLayoutSignature(request) === 'vertical-divider|575810',
    'The layout signature must include orientation and divider profile.'
);

const controller = createWindowLayoutController({
    initialSelection: {
        layoutId: 'single',
        dividerProfileId: DEFAULT_DIVIDER_PROFILE_ID,
    },
});
assert(
    controller.getConfigurationSnapshot().dividerOrientation === null,
    'The single-opening layout must not create a divider.'
);

await controller.setLayout('vertical-divider', { notify: false });
assert(
    controller.getDividerOrientation() === 'vertical',
    'Changing to the vertical-divider layout must activate vertical placement.'
);
await controller.setDividerProfile('575810', { notify: false });
assert(
    controller.getDividerProfileId() === '575810',
    'The controller must retain the selected mullion/transom profile.'
);

await controller.setLayout('vertical-fixed-fixed', { notify: false });
const fixedFixedSnapshot = controller.getConfigurationSnapshot();
assert(
    fixedFixedSnapshot.leftCell === 'fixed-glazing'
        && fixedFixedSnapshot.rightCell === 'fixed-glazing',
    'The controller must expose fixed/fixed cell semantics to the runtime builder.'
);

await controller.setLayout('vertical-fixed-fixed-fixed', { notify: false });
const threeColumnSnapshot = controller.getConfigurationSnapshot();
assert(
    threeColumnSnapshot.cells.length === 3
        && threeColumnSnapshot.dividerCount === 2
        && threeColumnSnapshot.cells.every(cell => cell === 'fixed-glazing'),
    'Three fixed columns must expose three cells and two repeated mullions.'
);

const url = new URL('https://example.test/configurator');
controller.appendUrlParams(url);
assert(
    url.searchParams.get('window_layout') === 'vertical-fixed-fixed-fixed',
    'The selected layout must be preserved in AR/configuration URLs.'
);
assert(
    url.searchParams.get('divider_profile') === '575810',
    'The selected divider profile must be preserved in AR/configuration URLs.'
);

if (errors.length) {
    console.error('Window layout controller validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Window layout controller valid: single, mixed, fixed/fixed, sash/sash, horizontal, and repeated fixed layouts passed.');
}
