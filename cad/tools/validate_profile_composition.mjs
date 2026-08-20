import fs from 'node:fs';
import path from 'node:path';
import {
    composeLegacyProfileDefinitions,
    composeRegisteredProfileDefinitions,
    composeSupplementalAccessoryProfiles,
    createProfileSelectionSignature,
    getProfileAlignmentShift,
    getRequiredSupplementalAccessorySourceProfileSetIds,
    resolveLegacyProfileSources,
} from '../../src/client/js/profile-composition.js';
import { transformCadBbox } from '../../src/client/js/profile-coordinate-transform.js';

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
assert(
    createProfileSelectionSignature({
        ...selection,
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
    }) === '2_6_Oeffnungselemnt_Vertikal|575760|575790|575800|vertical',
    'Divider profile and orientation must participate in the profile selection signature.'
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

const registeredMetadata = {
    globalCenterX: 100,
    globalMinY: 0,
    globalMaxY: 220,
    globalMinX: 0,
    globalMaxX: 200,
    isVertical: true,
    hasSplit: true,
};
const registeredLegacyDefinitions = new Map([
    ['2_4_Oeffnungselemnt_Vertikal', {
        metadata: registeredMetadata,
        profiles: [
            { index: 0, legacyIndex: 0, role: 'frame', section: 'top', blockName: 'FRAME_A', bbox: { minX: 100, minY: 190, maxX: 102, maxY: 200 }, baseCadColor: '#adadad', materialKey: 'alu', isAlu: true },
            { index: 1, legacyIndex: 1, role: 'frame', section: 'top', blockName: 'FRAME_B', bbox: { minX: 105, minY: 170, maxX: 107, maxY: 180 }, baseCadColor: '#66cc7f', materialKey: 'iso', isAlu: false },
            { index: 2, legacyIndex: 2, role: 'frame', section: 'bottom', blockName: 'FRAME_A', bbox: { minX: 100, minY: 20, maxX: 102, maxY: 30 } },
            { index: 3, legacyIndex: 3, role: 'frame', section: 'bottom', blockName: 'FRAME_B', bbox: { minX: 105, minY: 40, maxX: 107, maxY: 50 } },
            { index: 4, legacyIndex: 4, role: 'frame', section: 'top', blockName: '224068_s_1', bbox: { minX: 90, minY: 180, maxX: 95, maxY: 190 }, profileId: '224068', catalogProfileId: '224068' },
        ],
    }],
    ['2_6_Oeffnungselemnt_Vertikal', {
        metadata: registeredMetadata,
        profiles: [
            { index: 10, legacyIndex: 10, role: 'sash', section: 'top', blockName: 'SASH_A', bbox: { minX: 120, minY: 180, maxX: 122, maxY: 190 }, baseCadColor: '#adadad', materialKey: 'alu', isAlu: true },
            { index: 11, legacyIndex: 11, role: 'sash', section: 'top', blockName: 'SASH_B', bbox: { minX: 125, minY: 160, maxX: 127, maxY: 170 }, baseCadColor: '#66cc7f', materialKey: 'iso', isAlu: false },
            { index: 12, legacyIndex: 12, role: 'sash', section: 'bottom', blockName: 'SASH_A', bbox: { minX: 120, minY: 30, maxX: 122, maxY: 40 } },
            { index: 13, legacyIndex: 13, role: 'sash', section: 'bottom', blockName: 'SASH_B', bbox: { minX: 125, minY: 50, maxX: 127, maxY: 60 } },
            { index: 14, legacyIndex: 14, role: 'sash', section: 'top', blockName: '224063_s', bbox: { minX: 115, minY: 175, maxX: 118, maxY: 185 }, profileId: '224063', catalogProfileId: '224063' },
        ],
    }],
]);
const standaloneDefinitionsByProfileId = new Map([
    ['575760', {
        profiles: [
            { blockName: 'FRAME_A', bbox: { minX: 0, minY: 0, maxX: 10, maxY: 2 }, materialKey: 'alu', componentId: 'standalone:575760:a' },
            { blockName: 'FRAME_B', bbox: { minX: 20, minY: 5, maxX: 30, maxY: 7 }, materialKey: 'iso', componentId: 'standalone:575760:b' },
        ],
    }],
    ['575790', {
        profiles: [
            { blockName: 'SASH_A', bbox: { minX: 0, minY: 20, maxX: 10, maxY: 22 }, materialKey: 'alu', componentId: 'standalone:575790:a' },
            { blockName: 'SASH_B', bbox: { minX: 20, minY: 25, maxX: 30, maxY: 27 }, materialKey: 'iso', componentId: 'standalone:575790:b' },
        ],
    }],
]);
const registeredComposition = composeRegisteredProfileDefinitions({
    selection,
    definitionsByProfileSetId: registeredLegacyDefinitions,
    standaloneDefinitionsByProfileId,
});
const standaloneComponents = registeredComposition.profiles.filter(
    profile => profile.geometrySource === 'standalone-profile'
);
assert(standaloneComponents.length === 4, 'Registered composition should use four standalone base components.');
assert(
    standaloneComponents.every(profile => profile.placementSection === 'all'),
    'Standalone base components must be placed on all four window sides.'
);
assert(
    standaloneComponents.every(profile => profile.sectionSamplePlacements?.length === 2),
    'Standalone base components must retain separate top and bottom 10 cm sample placements.'
);
const standaloneFrameA = standaloneComponents.find(profile => profile.blockName === 'FRAME_A');
assert(
    standaloneFrameA?.baseCadColor === '#adadad',
    'Standalone components should inherit the reviewed legacy CAD debug colour.'
);
const frameABottomPlacement = standaloneFrameA?.sectionSamplePlacements?.find(
    placement => placement.section === 'bottom'
);
const frameABottomBbox = transformCadBbox(
    standaloneFrameA?.bbox,
    frameABottomPlacement?.cadCoordinateTransform
);
assert(
    frameABottomBbox
        && Math.abs(frameABottomBbox.minX - 100) < 0.001
        && Math.abs(frameABottomBbox.minY - 20) < 0.001
        && Math.abs(frameABottomBbox.maxX - 102) < 0.001
        && Math.abs(frameABottomBbox.maxY - 30) < 0.001,
    'Standalone bottom sample placement should align to the legacy bottom-section position.'
);
assert(
    standaloneComponents.every(profile => profile.cadCoordinateTransform?.rotationDeg === 90),
    'Standalone base components should align with a quarter-turn transform.'
);
assert(
    standaloneComponents.every(profile => profile.cadCoordinateTransform?.rmsErrorMm < 0.001),
    'Standalone base component alignment should be exact in the synthetic fixture.'
);
assert(
    !registeredComposition.profiles.some(profile => ['FRAME_A', 'FRAME_B', 'SASH_A', 'SASH_B'].includes(profile.blockName) && profile.geometrySource !== 'standalone-profile'),
    'Legacy structural SVG components should be removed after standalone replacement.'
);
assert(
    registeredComposition.profiles.some(profile => profile.catalogProfileId === '224068')
        && registeredComposition.profiles.some(profile => profile.catalogProfileId === '224063'),
    'Legacy accessory geometry must remain after standalone base-profile replacement.'
);
assert(
    standaloneComponents.find(profile => profile.blockName === 'FRAME_A')?.legacyIndexes?.length === 2,
    'Standalone components should preserve both top and bottom legacy indexes.'
);
assert(
    registeredComposition.metadata.usesStandaloneBaseProfiles === true,
    'Registered composition metadata should report standalone base-profile use.'
);

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const actualStandalonePaths = {
    '575760': 'outer-frames/575760',
    '575770': 'outer-frames/575770',
    '575780': 'opening-sashes/575780',
    '575790': 'opening-sashes/575790',
    '575800': 'mullions-transoms/575800',
    '575810': 'mullions-transoms/575810',
};
const actualLegacyDefinitions = new Map(
    [
        '2_4_Oeffnungselemnt_Vertikal',
        '2_5_Oeffnungselemnt_Vertikal',
        '2_6_Oeffnungselemnt_Vertikal',
    ].map(profileSetId => {
        const metadata = JSON.parse(fs.readFileSync(
            path.join(projectRoot, 'src', 'client', 'svg', profileSetId, 'metadata.json'),
            'utf8'
        ));
        return [profileSetId, {
            metadata,
            profiles: metadata.parts.map(part => ({
                ...part,
                legacyIndex: part.index,
            })),
        }];
    })
);
const actualStandaloneDefinitions = new Map(
    Object.entries(actualStandalonePaths).map(([profileId, relativePath]) => {
        const metadata = JSON.parse(fs.readFileSync(
            path.join(
                projectRoot,
                'src',
                'client',
                'svg',
                'standalone',
                'profiles',
                relativePath,
                'profile.meta.json'
            ),
            'utf8'
        ));
        const components = metadata.geometry.components;
        const minX = Math.min(...components.map(component => Number(component.bbox.minX)));
        const maxX = Math.max(...components.map(component => Number(component.bbox.maxX)));
        const minY = Math.min(...components.map(component => Number(component.bbox.minY)));
        const maxY = Math.max(...components.map(component => Number(component.bbox.maxY)));
        return [profileId, {
            metadata: {
                ...metadata,
                globalMinX: minX,
                globalMaxX: maxX,
                globalMinY: minY,
                globalMaxY: maxY,
                globalCenterX: (minX + maxX) / 2,
                globalCenterY: (minY + maxY) / 2,
            },
            profiles: components.map((component, index) => ({
                ...component,
                index,
                componentId: `standalone:${profileId}:${component.id}`,
                profileId,
                catalogProfileId: profileId,
                materialKey: String(component.layer || '').toLowerCase().includes('al')
                    ? 'alu'
                    : 'iso',
            })),
        }];
    })
);

const actualSelections = [
    {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
    },
    {
        profileSetId: '2_5_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575770',
        sashProfileId: '575790',
    },
    {
        profileSetId: '2_6_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575770',
        sashProfileId: '575790',
    },
    {
        profileSetId: '2_6_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575790',
    },
];

for (const actualSelection of actualSelections) {
    const actualComposition = composeRegisteredProfileDefinitions({
        selection: actualSelection,
        definitionsByProfileSetId: actualLegacyDefinitions,
        standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    });
    const expectedStandaloneCount = actualStandaloneDefinitions
        .get(actualSelection.outerFrameProfileId).profiles.length
        + actualStandaloneDefinitions.get(actualSelection.sashProfileId).profiles.length;
    const actualStandaloneComponents = actualComposition.profiles.filter(
        profile => profile.geometrySource === 'standalone-profile'
    );

    assert(
        actualStandaloneComponents.length === expectedStandaloneCount,
        `${actualSelection.profileSetId} did not replace every base component with standalone geometry.`
    );
    assert(
        Object.values(actualComposition.metadata.standaloneAlignment || {}).every(
            alignment => alignment.rotationDeg === 90 && alignment.rmsErrorMm <= 0.25
        ),
        `${actualSelection.profileSetId} standalone geometry exceeded the reviewed alignment tolerance.`
    );
    assert(
        actualStandaloneComponents.every(profile => profile.legacyIndexes.length >= 2),
        `${actualSelection.profileSetId} did not retain top/bottom legacy part aliases.`
    );
    assert(
        actualStandaloneComponents.every(profile =>
            profile.sectionSamplePlacements?.some(placement => placement.section === 'top')
            && profile.sectionSamplePlacements?.some(placement => placement.section === 'bottom')
        ),
        `${actualSelection.profileSetId} did not preserve both 10 cm section placements.`
    );
    assert(
        actualStandaloneComponents.every(profile =>
            profile.baseCadColor === '#adadad'
            || profile.baseCadColor === '#66cc7f'
            || profile.baseCadColor === '#00ffbf'
        ),
        `${actualSelection.profileSetId} did not inherit the reviewed legacy debug colours.`
    );
}


for (const [dividerProfileId, dividerOrientation] of [
    ['575800', 'vertical'],
    ['575810', 'horizontal'],
]) {
    const dividerComposition = composeRegisteredProfileDefinitions({
        selection: {
            profileSetId: '2_4_Oeffnungselemnt_Vertikal',
            outerFrameProfileId: '575760',
            sashProfileId: '575780',
            dividerProfileId,
            dividerOrientation,
        },
        definitionsByProfileSetId: actualLegacyDefinitions,
        standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    });
    const dividerComponents = dividerComposition.profiles.filter(
        profile => profile.geometrySource === 'standalone-divider-profile'
    );
    const expectedDividerCount = actualStandaloneDefinitions.get(dividerProfileId).profiles.length;

    assert(
        dividerComponents.length === expectedDividerCount,
        `${dividerProfileId} did not append every standalone mullion/transom component.`
    );
    assert(
        dividerComponents.every(profile =>
            profile.role === 'divider'
            && profile.dividerProfileId === dividerProfileId
            && profile.dividerOrientation === dividerOrientation
            && profile.placementSection === 'divider'
        ),
        `${dividerProfileId} divider component metadata is incomplete.`
    );
    assert(
        dividerComposition.metadata.usesStandaloneDividerProfile === true
            && dividerComposition.metadata.dividerProfileId === dividerProfileId
            && dividerComposition.metadata.dividerOrientation === dividerOrientation,
        `${dividerProfileId} layout metadata was not preserved in the composed definition.`
    );
    assert(
        dividerComposition.metadata.dividerSourceBounds
            && dividerComposition.metadata.dividerSourceBounds.maxX
                > dividerComposition.metadata.dividerSourceBounds.minX
            && dividerComposition.metadata.dividerSourceBounds.maxY
                > dividerComposition.metadata.dividerSourceBounds.minY,
        `${dividerProfileId} divider source bounds are invalid.`
    );
    const dividerDebugColours = new Set(
        dividerComponents.map(profile => profile.baseCadColor)
    );
    assert(
        dividerDebugColours.has('#adadad') && dividerDebugColours.has('#66cc7f'),
        `${dividerProfileId} must preserve aluminium and insulation CAD debug colours.`
    );
    if (dividerProfileId === '575810') {
        assert(
            dividerDebugColours.has('#00ffbf'),
            '575810 must preserve the CAD foam debug colour.'
        );
    }
    const dividerAluminiumSides = new Set(
        dividerComponents
            .filter(profile => profile.materialKey === 'alu')
            .map(profile => profile.aluminiumSide)
    );
    assert(
        dividerAluminiumSides.has('outside') && dividerAluminiumSides.has('inside'),
        `${dividerProfileId} aluminium faces must resolve from the rotated CAD depth axis.`
    );
}

const connectionTransform = { a: 0, b: -1, c: 1, d: 0, tx: 500, ty: 250 };
const connectionTemplate = {
    id: 'mullion-fixed-sash',
    profileOccurrences: {
        '575800': [{
            occurrenceIndex: 0,
            profileId: '575800',
            transform: connectionTransform,
            bbox: { minX: 400, minY: 200, maxX: 470, maxY: 290 },
        }],
        '575780': [{
            occurrenceIndex: 0,
            profileId: '575780',
            transform: { a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 0 },
            bbox: { minX: 480, minY: 210, maxX: 560, maxY: 300 },
        }],
    },
    roleOccurrences: {
        'mullion-transom': [{
            occurrenceIndex: 0,
            profileId: '575800',
            transform: connectionTransform,
            bbox: { minX: 400, minY: 200, maxX: 470, maxY: 290 },
        }],
        'opening-sash': [{
            occurrenceIndex: 0,
            profileId: '575780',
            transform: { a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 0 },
            bbox: { minX: 480, minY: 210, maxX: 560, maxY: 300 },
        }],
    },
};
const cadJoinedComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate,
});
const cadJoinedDivider = cadJoinedComposition.profiles.find(
    profile => profile.geometrySource === 'standalone-divider-profile'
);
assert(
    JSON.stringify(cadJoinedDivider?.cadCoordinateTransform) === JSON.stringify(connectionTransform),
    'The vertical divider must use the exact CAD connection transform.'
);
assert(
    cadJoinedComposition.metadata.usesCadConnectionTemplate === true
        && cadJoinedComposition.metadata.dividerConnection?.templateId === 'mullion-fixed-sash',
    'The composed vertical layout must record its CAD connection template.'
);
assert(
    cadJoinedComposition.metadata.dividerConnection?.depthAxisSign === 1
        && cadJoinedComposition.metadata.dividerConnection?.depthOffsetFromSashCenterMm === -10,
    'The CAD mullion front/back axis and sash-relative depth offset must come from the connection INSERT transform.'
);

if (errors.length) {
    console.error('Profile composition validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Profile composition valid: frame/sash sources and supplemental accessories align into one assembly.');
}
