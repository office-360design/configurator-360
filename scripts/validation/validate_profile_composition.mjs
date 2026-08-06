import {
    composeLegacyProfileDefinitions,
    composeSupplementalAccessoryProfiles,
    createProfileSelectionSignature,
    getProfileAlignmentShift,
    getRequiredSupplementalAccessorySourceProfileSetIds,
    resolveLegacyProfileSources,
} from '../../src/client/js/profile-composition.js';

const errors = [];
function assert(condition, message) {
    if (!condition) errors.push(message);
}

const selection = {
    profileSetId: '2_6_Oeffnungselemnt_Vertikal',
    outerFrameProfileId: '575760',
    sashProfileId: '575790',
};
const sources = resolveLegacyProfileSources(selection);
assert(sources.frameSourceProfileSetId === '2_4_Oeffnungselemnt_Vertikal', '575760 should use B2-6 as its current frame source.');
assert(sources.sashSourceProfileSetId === '2_6_Oeffnungselemnt_Vertikal', '575790 should use B2-8 as its current sash source.');
assert(!sources.usesSingleLegacyAssembly, '575760 + 575790 should compose two legacy sources.');
assert(
    createProfileSelectionSignature(selection)
        === '2_6_Oeffnungselemnt_Vertikal|575760|575790',
    'Profile selection signature is unstable.'
);

const frameMetadata = {
    globalCenterX: 94,
    globalMinY: 26,
    globalMaxY: 242,
    globalMinX: 53,
    globalMaxX: 135,
    isVertical: true,
    hasSplit: true,
};
const sashMetadata = {
    globalCenterX: 91,
    globalMinY: 22,
    globalMaxY: 237,
    globalMinX: 50,
    globalMaxX: 133,
    isVertical: true,
    hasSplit: true,
};

const topShift = getProfileAlignmentShift(sashMetadata, frameMetadata, 'top');
const bottomShift = getProfileAlignmentShift(sashMetadata, frameMetadata, 'bottom');
assert(topShift.shiftX === 3 && topShift.shiftY === 5, 'Top-section alignment is incorrect.');
assert(bottomShift.shiftX === 3 && bottomShift.shiftY === 4, 'Bottom-section alignment is incorrect.');

const definitionsByProfileSetId = new Map([
    ['2_4_Oeffnungselemnt_Vertikal', {
        metadata: frameMetadata,
        profiles: [
            { index: 10, role: 'frame', section: 'top', componentId: 'frame-top' },
            { index: 11, role: 'frame', section: 'bottom', componentId: 'frame-bottom' },
            { index: 12, role: 'sash', section: 'top', componentId: 'unused-sash' },
        ],
    }],
    ['2_6_Oeffnungselemnt_Vertikal', {
        metadata: sashMetadata,
        profiles: [
            { index: 20, role: 'frame', section: 'top', componentId: 'unused-frame' },
            { index: 21, role: 'sash', section: 'top', componentId: 'sash-top' },
            { index: 22, role: 'sash', section: 'bottom', componentId: 'sash-bottom' },
            {
                index: 23,
                role: 'frame',
                section: 'top',
                componentId: 'insulation-top',
                profileId: '200988',
                catalogProfileId: '200988',
            },
        ],
    }],
]);

const composition = composeLegacyProfileDefinitions({
    selection,
    definitionsByProfileSetId,
});
assert(composition.metadata.isCompositeProfileSelection === true, 'Mixed selection should produce composite metadata.');
assert(composition.profiles.length === 4, 'Composition should contain two frame and two sash profiles.');
assert(composition.profiles.every((profile, index) => profile.index === index), 'Composite profile indexes must be unique and sequential.');
assert(composition.profiles[0].cadAlignmentShiftXMm === 0, 'Frame source should remain unshifted.');
const composedTopSash = composition.profiles.find(profile => profile.componentId === 'sash-top');
const composedBottomSash = composition.profiles.find(profile => profile.componentId === 'sash-bottom');
assert(composedTopSash?.cadAlignmentShiftXMm === 3, 'Sash X alignment was not applied.');
assert(composedTopSash?.cadAlignmentShiftYMm === 5, 'Top sash Y alignment was not applied.');
assert(composedBottomSash?.cadAlignmentShiftYMm === 4, 'Bottom sash Y alignment was not applied.');


const supplementalSourceIds = getRequiredSupplementalAccessorySourceProfileSetIds();
assert(
    supplementalSourceIds.includes('2_6_Oeffnungselemnt_Vertikal'),
    'B2-8 should be loaded as the source for supplemental accessory 200988.'
);
const supplemented = composeSupplementalAccessoryProfiles({
    definition: composition,
    definitionsByProfileSetId,
});
const supplementalInsulation = supplemented.profiles.find(
    profile => profile.catalogProfileId === '200988'
);
assert(Boolean(supplementalInsulation), '200988 should be injected when absent from the selected assembly.');
assert(
    supplementalInsulation?.isSupplementalAccessoryProfile === true,
    'Injected accessories should be marked as supplemental.'
);
assert(
    supplementalInsulation?.cadAlignmentShiftXMm === 3,
    'Supplemental accessory X alignment should use the source/target metadata centers.'
);
assert(
    supplementalInsulation?.cadAlignmentShiftYMm === 5,
    'Supplemental top accessory Y alignment should use the source/target top edges.'
);
assert(
    supplemented.profiles.every((profile, index) => profile.index === index),
    'Supplemented profile indexes must remain unique and sequential.'
);

if (errors.length) {
    console.error('Profile composition validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Profile composition valid: frame/sash sources and supplemental accessories align into one assembly.');
}
