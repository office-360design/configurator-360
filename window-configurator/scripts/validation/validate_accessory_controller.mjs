import { createAccessoryController } from '../../src/client/js/accessory-controller.js';

const errors = [];

function assert(condition, message) {
    if (!condition) errors.push(message);
}

function createFakeInput() {
    const listeners = new Map();
    return {
        checked: true,
        disabled: false,
        dataset: {},
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        dispatch(type) {
            listeners.get(type)?.({ target: this });
        },
    };
}

const profiles = [
    {
        index: 0,
        componentId: 'legacy:test:top:224068_s_1/224068_s_1',
        profileId: '224068',
        catalogProfileId: '224068',
        componentType: 'gasket',
        accessoryType: 'centre-gasket',
    },
    {
        index: 1,
        componentId: 'legacy:test:top:275701_s/275701_s',
        profileId: '275701',
        catalogProfileId: '275701',
        componentType: 'hardware',
        accessoryType: 'locking-bar',
    },
    {
        index: 2,
        componentId: 'legacy:test:bottom:288319_s/288319_s',
        profileId: '288319',
        catalogProfileId: '288319',
        componentType: 'glass-support',
        accessoryType: 'glazing-bridge',
    },
    {
        index: 3,
        componentId: 'legacy:test:bottom:208694_s/208694_s',
        profileId: '208694',
        catalogProfileId: '208694',
        componentType: 'drainage-cap',
        accessoryType: 'drainage-cap',
    },
    {
        index: 4,
        componentId: 'legacy:test:top:575760_s/575760_s',
        profileId: '575760',
        catalogProfileId: '575760',
        componentType: 'aluminium-profile',
    },
];

let buildCount = 0;
let stateChangeCount = 0;
const stateChanges = [];
const controller = createAccessoryController({
    pageParams: new URLSearchParams('accessory_preset=b2-6&drainage_cap=0'),
    getCurrentProfileSetId: () => '2_4_Oeffnungselemnt_Vertikal',
    getOuterFrameProfileId: () => '575760',
    getSashProfileId: () => '575780',
    getProfilesData: () => profiles,
    buildWindow: () => { buildCount += 1; },
    onStateChange: event => {
        stateChangeCount += 1;
        stateChanges.push(event);
    },
});

const drainageInput = createFakeInput();
controller.initializeControls({ 'drainage-cap': drainageInput });
controller.initializeProfiles(profiles);

assert(controller.getCurrentPresetId() === 'b2-6', 'B2-6 should initialize from the URL.');
assert(drainageInput.checked === false, 'The drainage-cap URL parameter should override the preset.');
assert(!controller.isProfileEnabled(profiles[3]), 'The drainage-cap profile should be disabled.');
assert(controller.isProfileEnabled(profiles[0]), 'The B2-6 preset should enable the centre gasket.');
assert(controller.isProfileEnabled(profiles[1]), 'The B2-6 preset should enable the locking bar.');
assert(controller.isProfileEnabled(profiles[2]), 'The B2-6 preset should enable the glazing bridge.');
assert(controller.isProfileEnabled(profiles[4]), 'Normal aluminum must not be controlled as an accessory.');
assert(!controller.canPlaceProfileOnSide(profiles[3], 'bottom'), 'A disabled cap must not be placed.');
assert(controller.canPlaceProfileOnSide(profiles[2], 'bottom'), 'The glazing bridge should be allowed on the bottom.');
assert(!controller.canPlaceProfileOnSide(profiles[2], 'top'), 'The glazing bridge must remain bottom-only.');

drainageInput.checked = true;
drainageInput.dispatch('change');
assert(controller.getCurrentPresetId() === 'custom', 'A manual toggle should switch to Custom.');
assert(controller.isProfileEnabled(profiles[3]), 'The drainage cap should enable from its control.');
assert(controller.canPlaceProfileOnSide(profiles[3], 'bottom'), 'An enabled cap should be permitted on the bottom.');
assert(!controller.canPlaceProfileOnSide(profiles[3], 'top'), 'The cap should remain forbidden on the top.');
assert(buildCount === 1, 'Changing the dedicated control should rebuild exactly once.');
assert(stateChangeCount === 1, 'Changing the dedicated control should emit one state update.');
assert(stateChanges.at(-1)?.source === 'accessory', 'Manual accessory changes must be identified as accessory-originated.');

controller.setAccessoryPreset('b2-8', { rebuild: false, source: 'cad-assembly' });
assert(controller.getCurrentPresetId() === 'b2-8', 'The controller should apply the B2-8 preset.');
assert(controller.matchesPreset('b2-8'), 'The applied B2-8 accessory state should match its preset.');
assert(stateChanges.at(-1)?.source === 'cad-assembly', 'CAD-driven accessory changes must preserve their source.');
assert(
    controller.getAccessoryState('insulation-profile').enabled,
    'B2-8 should enable the insulation profile even when its geometry is not loaded.'
);
assert(
    !controller.getAccessoryState('insulation-profile').available,
    'An accessory absent from the loaded assembly should report unavailable.'
);

controller.applyConfiguration({
    accessoryPreset: 'b2-8',
    drainageCap: false,
}, { rebuild: false });
assert(controller.getCurrentPresetId() === 'custom', 'An override differing from B2-8 should become Custom.');
assert(!controller.isProfileEnabled(profiles[3]), 'Configuration application should disable the drainage cap.');
assert(!controller.matchesPreset('b2-8'), 'An individual override must no longer match the B2-8 preset.');

const snapshot = controller.getConfigurationSnapshot();
assert(snapshot.drainageCap === false, 'The configuration snapshot should expose drainageCap=false.');
assert(snapshot.lockingBar === true, 'The snapshot should include the locking-bar state.');
assert(
    snapshot.accessories['drainage-cap'].profileId === '208694',
    'The accessory snapshot should preserve the selected drainage-cap profile ID.'
);

const url = new URL('https://example.test/configurator');
controller.appendUrlParams(url);
assert(url.searchParams.get('accessory_preset') === 'custom', 'AR URLs should persist the preset state.');
assert(url.searchParams.get('drainage_cap') === '0', 'AR URLs should persist the drainage-cap state.');
assert(url.searchParams.get('locking_bar') === '1', 'AR URLs should persist the locking-bar state.');

const legacyPartsController = createAccessoryController({
    pageParams: new URLSearchParams(),
    isARMode: true,
    requestedActiveParts: new Set(['4']),
    getCurrentProfileSetId: () => '2_4_Oeffnungselemnt_Vertikal',
    getOuterFrameProfileId: () => '575760',
    getSashProfileId: () => '575780',
    getProfilesData: () => profiles,
});
legacyPartsController.initializeProfiles(profiles);
assert(
    !legacyPartsController.isProfileEnabled(profiles[3]),
    'Legacy AR parts URLs that omit the cap should still disable it.'
);
assert(
    !legacyPartsController.isProfileEnabled(profiles[1]),
    'Legacy AR parts URLs that omit the locking bar should disable it.'
);

if (errors.length) {
    console.error('Accessory controller validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Accessory controller valid: presets, availability, placement, URL and legacy-parts behavior passed.');
}
