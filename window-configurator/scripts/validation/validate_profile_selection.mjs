import {
    getLegacyProfileSet,
    getLegacyProfileSets,
} from '../../src/client/js/profile-catalog.js';
import {
    getCompatibleLegacyProfileSets,
    resolveLegacyProfileSelection,
    resolveProfileClosure,
} from '../../src/client/js/profile-compatibility.js';
import {
    CUSTOM_CAD_ASSEMBLY_ID,
    createProfileSelectionController,
    getProfileSelectionRequest,
} from '../../src/client/js/profile-selection-controller.js';

const errors = [];

function assert(condition, message) {
    if (!condition) errors.push(message);
}

const defaultSelection = resolveLegacyProfileSelection();
assert(defaultSelection.profileSetId === '2_4_Oeffnungselemnt_Vertikal', 'Default CAD assembly must remain B2-6.');
assert(defaultSelection.outerFrameProfileId === '575760', 'Default outer frame must remain 575760.');
assert(defaultSelection.sashProfileId === '575780', 'Default sash must remain 575780.');

for (const profileSetId of [
    '2_4_Oeffnungselemnt_Vertikal',
    '2_5_Oeffnungselemnt_Vertikal',
    '2_6_Oeffnungselemnt_Vertikal',
]) {
    const profileSet = getLegacyProfileSet(profileSetId);
    const selection = resolveLegacyProfileSelection({ profileSetId });
    assert(selection.profileSetId === profileSetId, `${profileSetId} did not resolve to itself.`);
    assert(
        selection.outerFrameProfileId === profileSet.outerFrameProfileId,
        `${profileSetId} resolved to the wrong initial outer frame.`
    );
    assert(
        selection.sashProfileId === profileSet.sashProfileId,
        `${profileSetId} resolved to the wrong initial sash.`
    );
}

const unrestrictedPair = resolveLegacyProfileSelection({
    profileSetId: '2_6_Oeffnungselemnt_Vertikal',
    outerFrameProfileId: '575760',
    sashProfileId: '575790',
});
assert(unrestrictedPair.compatible === true, '575760 + 575790 must not be rejected.');
assert(unrestrictedPair.outerFrameProfileId === '575760', 'Independent frame selection was overwritten.');
assert(unrestrictedPair.sashProfileId === '575790', 'Independent sash selection was overwritten.');
assert(
    unrestrictedPair.profileSetId === '2_6_Oeffnungselemnt_Vertikal',
    'The geometry source must remain available for custom frame/sash combinations.'
);

assert(
    getCompatibleLegacyProfileSets().length === getLegacyProfileSets().length,
    'All complete CAD assemblies must remain available for every frame/sash selection.'
);

const fixedGlazing = resolveProfileClosure({
    hostProfileId: '575760',
    closesAgainst: 'fixed-glass',
    glassThicknessMm: 24,
});
assert(fixedGlazing.compatible, '575760 must support fixed glazing through metadata.');
assert(fixedGlazing.glazing?.fixedGasketProfileId === '224063', 'Fixed glazing must use gasket 224063.');
assert(fixedGlazing.glazing?.glazingBeadProfileId === '573930', '24 mm fixed glazing must use bead 573930.');
assert(fixedGlazing.glazing?.movableGasketProfileId === '224350', '24 mm fixed glazing must use gasket 224350.');

const normalizedRequest = getProfileSelectionRequest({
    cad_assembly: 'custom',
    profile_set: '2_5_Oeffnungselemnt_Vertikal',
    outer_frame_profile: '575770',
    sash_profile: '575780',
});
assert(normalizedRequest.cadAssemblyId === 'custom', 'cad_assembly alias was not normalized.');
assert(normalizedRequest.profileSetId === '2_5_Oeffnungselemnt_Vertikal', 'profile_set alias was not normalized.');
assert(normalizedRequest.outerFrameProfileId === '575770', 'outer_frame_profile alias was not normalized.');
assert(normalizedRequest.sashProfileId === '575780', 'sash_profile alias was not normalized.');

class FakeSelect {
    constructor() {
        this.options = [];
        this.value = '';
        this.listeners = new Map();
    }

    set innerHTML(_value) {
        this.options = [];
        this.value = '';
    }

    appendChild(option) {
        this.options.push(option);
        if (!this.value) this.value = option.value;
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }
}

globalThis.document = {
    createElement(tagName) {
        if (tagName !== 'option') throw new Error(`Unexpected element ${tagName}`);
        return { value: '', textContent: '' };
    },
};

const profileSetInput = new FakeSelect();
const outerFrameInput = new FakeSelect();
const sashInput = new FakeSelect();
const loadedSelections = [];
const appliedAccessoryPresets = [];
const selectionController = createProfileSelectionController({
    profileSetInput,
    outerFrameInput,
    sashInput,
    initialSelection: defaultSelection,
    loadProfiles: async selection => loadedSelections.push(selection),
    onCadAssemblyPresetSelected: selection => appliedAccessoryPresets.push(selection),
});
selectionController.initializeControls();
assert(outerFrameInput.options.length === 2, 'The selector should expose the two converted outer frames.');
assert(sashInput.options.length === 2, 'The selector should expose the two converted normal sashes.');
assert(profileSetInput.options.length === 4, 'The CAD assembly selector should expose B2-6, B2-7, B2-8 and Custom.');
assert(profileSetInput.value === '2_4_Oeffnungselemnt_Vertikal', 'The default top preset should be B2-6.');

await selectionController.selectOuterFrame('575770');
assert(outerFrameInput.value === '575770', 'Outer-frame control did not change to 575770.');
assert(sashInput.value === '575780', 'Changing the frame must not change the sash.');
assert(profileSetInput.value === CUSTOM_CAD_ASSEMBLY_ID, 'Changing the frame must mark the CAD assembly Custom.');
assert(loadedSelections.at(-1)?.outerFrameProfileId === '575770', 'Frame change did not request the selected frame.');
assert(loadedSelections.at(-1)?.sashProfileId === '575780', 'Frame change lost the selected sash.');

await selectionController.selectSash('575790');
assert(outerFrameInput.value === '575770', 'Changing the sash must not change the frame.');
assert(sashInput.value === '575790', 'Sash control did not change to 575790.');
assert(profileSetInput.value === CUSTOM_CAD_ASSEMBLY_ID, 'Changing the sash must keep the CAD assembly Custom.');

await selectionController.selectCadAssembly('2_5_Oeffnungselemnt_Vertikal');
assert(profileSetInput.value === '2_5_Oeffnungselemnt_Vertikal', 'CAD assembly control did not change to B2-7.');
assert(outerFrameInput.value === '575770', 'B2-7 must select frame 575770.');
assert(sashInput.value === '575790', 'B2-7 must select sash 575790.');
assert(appliedAccessoryPresets.at(-1)?.accessoryPresetId === 'b2-7', 'B2-7 must request the B2-7 accessory preset.');

await selectionController.selectCadAssembly('2_4_Oeffnungselemnt_Vertikal');
assert(outerFrameInput.value === '575760', 'B2-6 must select frame 575760.');
assert(sashInput.value === '575780', 'B2-6 must select sash 575780.');
assert(appliedAccessoryPresets.at(-1)?.accessoryPresetId === 'b2-6', 'B2-6 must request the B2-6 accessory preset.');

selectionController.markCustomCadAssembly();
const selectionUrl = new URL('https://example.test/configurator');
selectionController.appendUrlParams(selectionUrl);
assert(selectionUrl.searchParams.get('profile') === '2_4_Oeffnungselemnt_Vertikal', 'AR URL must retain the underlying geometry source.');
assert(selectionUrl.searchParams.get('cad_assembly') === 'custom', 'AR URL must persist the Custom CAD assembly state.');
assert(selectionUrl.searchParams.get('outer_frame') === '575760', 'AR URL omitted outer_frame.');
assert(selectionUrl.searchParams.get('sash_profile') === '575780', 'AR URL omitted sash_profile.');

if (errors.length) {
    console.error('Profile selection validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Profile selection valid: CAD presets control frame/sash and manual changes become Custom.');
}
