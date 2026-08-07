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

const url = new URL('https://example.test/configurator');
controller.appendUrlParams(url);
assert(
    url.searchParams.get('window_layout') === 'vertical-fixed-fixed',
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
    console.log('Window layout controller valid: single, mixed mullion, fixed/fixed mullion, and horizontal layouts passed.');
}
