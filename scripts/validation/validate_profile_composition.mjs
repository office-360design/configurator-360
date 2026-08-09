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
assert(
    createProfileSelectionSignature({
        ...selection,
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    }) === '2_6_Oeffnungselemnt_Vertikal|575760|575790|575800|vertical|fixed-glazing|fixed-glazing',
    'Divider cell types must participate in the profile selection signature.'
);
assert(
    createProfileSelectionSignature({
        ...selection,
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
        layoutId: 'vertical-fixed-fixed-fixed',
    }).endsWith('|layout:vertical-fixed-fixed-fixed'),
    'Repeated-divider layout IDs must participate in the profile selection signature.'
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

const actualBeadMetadata = JSON.parse(fs.readFileSync(
    path.join(
        projectRoot,
        'src',
        'client',
        'svg',
        'standalone',
        'accessories',
        'glazing-beads',
        '573940',
        'profile.meta.json'
    ),
    'utf8'
));
const actualStandaloneBeadDefinition = {
    metadata: actualBeadMetadata,
    profiles: actualBeadMetadata.geometry.components.map((component, index) => ({
        ...component,
        index,
        componentId: `standalone:573940:${component.id}`,
        profileId: '573940',
        catalogProfileId: '573940',
    })),
};

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
        `${dividerProfileId} aluminium faces must resolve from the standalone divider depth axis.`
    );
}

const connectionTransform = { a: 0, b: -1, c: 1, d: 0, tx: 500, ty: 250 };
const connectionTemplate = {
    id: 'mullion-fixed-sash',
    leftCell: 'fixed-glazing',
    rightCell: 'opening-sash',
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
        '224063': [{
            occurrenceIndex: 0,
            profileId: '224063',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 430, ty: 235 },
            bbox: { minX: 430, minY: 235, maxX: 437, maxY: 249 },
            center: { x: 433.5, y: 242 },
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
        }],
        '245472': [
            {
                occurrenceIndex: 0,
                profileId: '245472',
                role: 'gasket',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 520, ty: 240 },
                bbox: { minX: 520, minY: 240, maxX: 528, maxY: 247 },
                center: { x: 524, y: 243.5 },
                matchedComponentCount: 1,
                matchStrategy: 'direct-named-join-component',
                coordinateSpace: 'block-local-to-join',
                directBlockNames: ['245472_s_5'],
            },
            {
                occurrenceIndex: 1,
                profileId: '245472',
                role: 'gasket',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 548, ty: 240 },
                bbox: { minX: 548, minY: 240, maxX: 556, maxY: 247 },
                center: { x: 552, y: 243.5 },
                matchedComponentCount: 1,
                matchStrategy: 'direct-named-join-component',
                coordinateSpace: 'block-local-to-join',
                directBlockNames: ['245472_s'],
            },
        ],
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
        'gasket': [{
            occurrenceIndex: 0,
            profileId: '224063',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 430, ty: 235 },
            bbox: { minX: 430, minY: 235, maxX: 437, maxY: 249 },
            center: { x: 433.5, y: 242 },
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
        }, {
            occurrenceIndex: 0,
            profileId: '245472',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 520, ty: 240 },
            bbox: { minX: 520, minY: 240, maxX: 528, maxY: 247 },
            center: { x: 524, y: 243.5 },
            matchedComponentCount: 1,
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
            directBlockNames: ['245472_s_5'],
        }, {
            occurrenceIndex: 1,
            profileId: '245472',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 548, ty: 240 },
            bbox: { minX: 548, minY: 240, maxX: 556, maxY: 247 },
            center: { x: 552, y: 243.5 },
            matchedComponentCount: 1,
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
            directBlockNames: ['245472_s'],
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
    cadJoinedDivider?.dividerSectionRotationDeg === 180
        && cadJoinedComposition.metadata.dividerConnection?.sectionRotationDeg === 180
        && cadJoinedComposition.metadata.dividerConnection?.orientationMode
            === 'standalone-canonical-with-front-back-correction'
        && Number.isFinite(
            cadJoinedComposition.metadata.dividerConnection?.depthCenterFromAssemblyCenterMm
        )
        && cadJoinedComposition.metadata.dividerConnection?.depthOffsetMethod
            === 'join-to-b2-sash-coordinate-bridge',
    'The CAD mullion must keep its standalone section plane, apply only the verified 180-degree front/back correction, and bridge join placement through the B2-aligned sash coordinate system.'
);

const cadJoinedHorizontalComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'horizontal',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate,
});
const cadJoinedHorizontalDivider = cadJoinedHorizontalComposition.profiles.find(
    profile => profile.geometrySource === 'standalone-divider-profile'
);
assert(
    JSON.stringify(cadJoinedHorizontalDivider?.cadCoordinateTransform)
        === JSON.stringify(connectionTransform)
        && cadJoinedHorizontalDivider?.dividerSectionRotationDeg === 180
        && cadJoinedHorizontalComposition.metadata.dividerConnection?.templateId
            === 'mullion-fixed-sash'
        && cadJoinedHorizontalComposition.metadata.dividerConnection?.sectionRotationDeg === 180
        && cadJoinedHorizontalComposition.metadata.dividerConnection?.openingSashCellSide === 'right',
    'The horizontal transom must use the same accepted CAD connection transform, 180-degree cross-section correction, and fixed/sash side semantics as the vertical mullion.'
);

const fixedFixedConnectionTemplate = {
    id: 'mullion-fixed-fixed',
    leftCell: 'fixed-glazing',
    rightCell: 'fixed-glazing',
    profileOccurrences: {
        '575800': [{
            occurrenceIndex: 0,
            profileId: '575800',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 75, ty: 125 },
            bbox: { minX: 50, minY: 100, maxX: 138, maxY: 165 },
        }],
        '573940': [
            {
                occurrenceIndex: 0,
                profileId: '573940',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 18, ty: 142 },
                bbox: { minX: 18, minY: 142, maxX: 38, maxY: 154 },
                explicitProfileMatchCount: 1,
                matchedComponentCount: 2,
                maxBboxErrorMm: 0,
            },
            {
                occurrenceIndex: 1,
                profileId: '573940',
                transform: { a: -1, b: 0, c: 0, d: 1, tx: 170, ty: 242 },
                bbox: { minX: 150, minY: 242, maxX: 170, maxY: 254 },
                explicitProfileMatchCount: 1,
                matchedComponentCount: 2,
                maxBboxErrorMm: 0,
            },
        ],
        '224063': [
            {
                occurrenceIndex: 0,
                profileId: '224063',
                role: 'gasket',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 34, ty: 146 },
                bbox: { minX: 34, minY: 146, maxX: 41, maxY: 160 },
                center: { x: 37.5, y: 153 },
                matchStrategy: 'direct-named-join-component',
                coordinateSpace: 'block-local-to-join',
            },
            {
                occurrenceIndex: 1,
                profileId: '224063',
                role: 'gasket',
                transform: { a: -1, b: 0, c: 0, d: 1, tx: 154, ty: 346 },
                bbox: { minX: 147, minY: 346, maxX: 154, maxY: 360 },
                center: { x: 150.5, y: 353 },
                matchStrategy: 'direct-named-join-component',
                coordinateSpace: 'block-local-to-join',
            },
        ],
    },
    roleOccurrences: {
        'mullion-transom': [{
            occurrenceIndex: 0,
            profileId: '575800',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 75, ty: 125 },
            bbox: { minX: 50, minY: 100, maxX: 138, maxY: 165 },
        }],
        'glazing-bead': [
            {
                occurrenceIndex: 0,
                profileId: '573940',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 18, ty: 142 },
                bbox: { minX: 18, minY: 142, maxX: 38, maxY: 154 },
            },
            {
                occurrenceIndex: 1,
                profileId: '573940',
                transform: { a: -1, b: 0, c: 0, d: 1, tx: 170, ty: 242 },
                bbox: { minX: 150, minY: 242, maxX: 170, maxY: 254 },
            },
        ],
        'gasket': [
            {
                occurrenceIndex: 0,
                profileId: '224063',
                role: 'gasket',
                transform: { a: 1, b: 0, c: 0, d: 1, tx: 34, ty: 146 },
                bbox: { minX: 34, minY: 146, maxX: 41, maxY: 160 },
                center: { x: 37.5, y: 153 },
                matchStrategy: 'direct-named-join-component',
            },
            {
                occurrenceIndex: 1,
                profileId: '224063',
                role: 'gasket',
                transform: { a: -1, b: 0, c: 0, d: 1, tx: 154, ty: 346 },
                bbox: { minX: 147, minY: 346, maxX: 154, maxY: 360 },
                center: { x: 150.5, y: 353 },
                matchStrategy: 'direct-named-join-component',
            },
        ],
    },
};
const fixedFixedComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate: fixedFixedConnectionTemplate,
    placementConnectionTemplate: connectionTemplate,
});
const fixedFixedDivider = fixedFixedComposition.profiles.find(
    profile => profile.geometrySource === 'standalone-divider-profile'
);
assert(
    JSON.stringify(fixedFixedDivider?.cadCoordinateTransform) === JSON.stringify(connectionTransform),
    'The fixed/fixed layout must preserve the accepted mixed-join B2 placement bridge instead of applying an unanchored join-space offset.'
);
assert(
    fixedFixedComposition.metadata.dividerConnection?.templateId === 'mullion-fixed-fixed'
        && fixedFixedComposition.metadata.dividerConnection?.leftCell === 'fixed-glazing'
        && fixedFixedComposition.metadata.dividerConnection?.rightCell === 'fixed-glazing'
        && fixedFixedComposition.metadata.dividerConnection?.placementTemplateId === 'mullion-fixed-sash'
        && fixedFixedComposition.metadata.dividerConnection?.depthOffsetMethod
            === 'shared-mullion-placement-bridge:mullion-fixed-sash',
    'The fixed/fixed layout must record its own CAD connection while explicitly retaining the accepted mullion placement bridge.'
);


const frameFixedPlacementTemplate = {
    id: 'frame-fixed',
    boundary: 'outer-frame',
    leftCell: 'outside',
    rightCell: 'fixed-glazing',
    profileOccurrences: {
        '575760': [{
            occurrenceIndex: 0,
            profileId: '575760',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
            bbox: { minX: 10, minY: 20, maxX: 110, maxY: 120 },
        }],
        '573940': [{
            occurrenceIndex: 0,
            profileId: '573940',
            transform: { a: 0, b: 1, c: 1, d: 0, tx: 175, ty: 40 },
            bbox: { minX: 120, minY: 120, maxX: 150, maxY: 155 },
        }],
        '224063': [{
            occurrenceIndex: 0,
            profileId: '224063',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 125, ty: 115 },
            bbox: { minX: 125, minY: 115, maxX: 132, maxY: 129 },
            center: { x: 128.5, y: 122 },
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
        }],
    },
    roleOccurrences: {
        'outer-frame': [{
            occurrenceIndex: 0,
            profileId: '575760',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
            bbox: { minX: 10, minY: 20, maxX: 110, maxY: 120 },
        }],
        'glazing-bead': [{
            occurrenceIndex: 0,
            profileId: '573940',
            transform: { a: 0, b: 1, c: 1, d: 0, tx: 175, ty: 40 },
            bbox: { minX: 120, minY: 120, maxX: 150, maxY: 155 },
        }],
        'gasket': [{
            occurrenceIndex: 0,
            profileId: '224063',
            role: 'gasket',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 125, ty: 115 },
            bbox: { minX: 125, minY: 115, maxX: 132, maxY: 129 },
            center: { x: 128.5, y: 122 },
            matchStrategy: 'direct-named-join-component',
            coordinateSpace: 'block-local-to-join',
        }],
    },
};
const fixedPlacementComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate,
    placementConnectionTemplate: connectionTemplate,
    fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
    fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
    fixedGlazingDividerGasketTemplate: connectionTemplate,
    standaloneBeadDefinition: actualStandaloneBeadDefinition,
});
const fixedBeadTemplate = fixedPlacementComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('573940')
    && profile.section === 'top'
);
const fixedBeadGasketTemplate = fixedPlacementComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224378')
    && profile.section === 'top'
);
const fixedFrameGasketTemplate = fixedPlacementComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224063')
    && profile.section === 'top'
);
const mullionSashRebateGasketTemplate = fixedPlacementComposition.profiles.find(profile =>
    profile.role === 'frame'
    && String(profile.blockName || '').includes('245472_s_5')
    && profile.section === 'top'
);
const fixedBottomBeadTemplate = fixedPlacementComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('573940')
    && profile.section === 'bottom'
);
assert(
    Boolean(fixedBeadTemplate?.fixedGlazingFrameCadTransform),
    'Fixed glazing beads must receive a frame-fixed CAD placement transform.'
);
assert(
    Boolean(fixedBeadGasketTemplate?.fixedGlazingFrameCadTransform),
    'The movable bead gasket must follow the frame-fixed bead transform instead of the sash occurrence.'
);
const fixedFrameGasketHasSourceTransform = ['a', 'b', 'c', 'd', 'tx', 'ty'].every(key =>
    Number.isFinite(Number(fixedFrameGasketTemplate?.sourceTransform?.[key]))
);
assert(
    Boolean(fixedFrameGasketTemplate?.fixedGlazingFrameCadTransform)
        && fixedFrameGasketTemplate?.fixedGlazingFramePlacementMethod
            === (fixedFrameGasketHasSourceTransform
                ? 'exact-224063-same-frame-affine-bridge'
                : 'exact-224063-join-occurrence-center-bridge'),
    'Fixed glazing must place 224063 from the direct frame-window join occurrence instead of the old sash-relative B2 seat.'
);
assert(
    Object.keys(fixedFrameGasketTemplate?.fixedGlazingDividerCadTransforms || {}).join(',') === 'left'
        && fixedPlacementComposition.metadata.fixedGlazingConnections?.dividerTemplateId
            === 'mullion-fixed-fixed'
        && fixedPlacementComposition.metadata.fixedGlazingConnections?.dividerGasketTemplateId
            === 'mullion-fixed-sash'
        && fixedPlacementComposition.metadata.fixedGlazingConnections?.dividerGasketSideMethod
            === 'same-join-mullion-side-filter',
    'A mixed fixed/sash layout must source mullion-side 224063 from window-mullion-sash and attach that direct CAD occurrence to the join-declared fixed-glazing side instead of re-inferring the side after mullion rotation.'
);
const mullionSashRebateHasSourceTransform = ['a', 'b', 'c', 'd', 'tx', 'ty'].every(key =>
    Number.isFinite(Number(mullionSashRebateGasketTemplate?.sourceTransform?.[key]))
);
assert(
    Boolean(mullionSashRebateGasketTemplate?.mullionSashCadTransform)
        && mullionSashRebateGasketTemplate?.mullionSashCellSide === 'right'
        && mullionSashRebateGasketTemplate?.mullionSashPlacementMethod
            === (mullionSashRebateHasSourceTransform
                ? 'exact-245472-same-mullion-affine-bridge'
                : 'exact-245472-join-occurrence-center-bridge')
        && fixedPlacementComposition.metadata.fixedGlazingConnections
            ?.mullionSashGasketProfileId === '245472'
        && fixedPlacementComposition.metadata.fixedGlazingConnections
            ?.mullionSashGasketTemplateId === 'mullion-fixed-sash'
        && fixedPlacementComposition.metadata.fixedGlazingConnections
            ?.mullionSashGasketPlacementMethod
            === 'active-mullion-join-direct-rebate-gasket',
    'The mixed join must keep 224063 on its fixed side and place the frame-role 245472 rebate gasket on its sash side from the exact window-mullion-sash INSERT.'
);

// Regression: a repeated gasket block elsewhere in the same mixed join must
// not be allowed to cross the mullion and become the connection gasket. The
// side decision is made in raw join CAD coordinates relative to the join's
// mullion occurrence, before the runtime 180-degree divider mapping.
const mixedJoinWithOppositeSideDistractors = structuredClone(connectionTemplate);
const opposite224063 = {
    occurrenceIndex: 99,
    profileId: '224063',
    role: 'gasket',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 540, ty: 235 },
    bbox: { minX: 540, minY: 235, maxX: 547, maxY: 249 },
    center: { x: 543.5, y: 242 },
    matchedComponentCount: 1,
    matchStrategy: 'direct-named-join-component',
    coordinateSpace: 'block-local-to-join',
    directBlockNames: ['224063_s'],
};
const opposite245472 = {
    occurrenceIndex: 98,
    profileId: '245472',
    role: 'gasket',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 410, ty: 240 },
    bbox: { minX: 410, minY: 240, maxX: 418, maxY: 247 },
    center: { x: 414, y: 243.5 },
    matchedComponentCount: 1,
    matchStrategy: 'direct-named-join-component',
    coordinateSpace: 'block-local-to-join',
    directBlockNames: ['245472_s_5'],
};
mixedJoinWithOppositeSideDistractors.profileOccurrences['224063'].push(opposite224063);
mixedJoinWithOppositeSideDistractors.profileOccurrences['245472'].push(opposite245472);
mixedJoinWithOppositeSideDistractors.roleOccurrences.gasket.push(
    opposite224063,
    opposite245472
);
const distractorFilteredComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate,
    placementConnectionTemplate: connectionTemplate,
    fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
    fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
    fixedGlazingDividerGasketTemplate: mixedJoinWithOppositeSideDistractors,
    standaloneBeadDefinition: actualStandaloneBeadDefinition,
});
const distractorFiltered224063 = distractorFilteredComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224063')
    && profile.section === 'top'
);
const distractorFiltered245472 = distractorFilteredComposition.profiles.find(profile =>
    profile.role === 'frame'
    && String(profile.blockName || '').includes('245472_s_5')
    && profile.section === 'top'
);
assert(
    JSON.stringify(distractorFiltered224063?.fixedGlazingDividerCadTransforms?.left)
        === JSON.stringify(fixedFrameGasketTemplate?.fixedGlazingDividerCadTransforms?.left),
    'An opposite/sash-side 224063 INSERT must not replace the fixed-side mullion gasket merely because it shares the same block name.'
);
assert(
    JSON.stringify(distractorFiltered245472?.mullionSashCadTransform)
        === JSON.stringify(mullionSashRebateGasketTemplate?.mullionSashCadTransform),
    'An opposite/fixed-side 245472 INSERT must not replace the opening-side mullion rebate gasket merely because it shares the same block name.'
);

const affineLegacyDefinitions = new Map(
    [...actualLegacyDefinitions].map(([profileSetId, legacyDefinition]) => [
        profileSetId,
        {
            ...legacyDefinition,
            profiles: legacyDefinition.profiles.map(profile => {
                const blockName = String(profile.blockName || '');
                if (!blockName.includes('224063') && !blockName.includes('245472_s_5')) {
                    return profile;
                }
                return {
                    ...profile,
                    // Legacy SVG geometry is already in B2 assembly coordinates.
                    // This synthetic INSERT transform lets the validator exercise
                    // local -> B2 -> same-mullion join affine remapping.
                    sourceTransform: profile.section === 'bottom'
                        ? { a: 0, b: 1, c: 1, d: 0, tx: 60, ty: 40 }
                        : { a: 0, b: -1, c: 1, d: 0, tx: 65, ty: 188 },
                };
            }),
        },
    ])
);
const affineFixedPlacementComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: affineLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate,
    placementConnectionTemplate: connectionTemplate,
    fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
    fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
    fixedGlazingDividerGasketTemplate: connectionTemplate,
    standaloneBeadDefinition: actualStandaloneBeadDefinition,
});
const affineFixedGasketTemplate = affineFixedPlacementComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224063')
    && profile.section === 'top'
);
const affineRebateGasketTemplate = affineFixedPlacementComposition.profiles.find(profile =>
    profile.role === 'frame'
    && String(profile.blockName || '').includes('245472_s_5')
    && profile.section === 'top'
);
assert(
    affineFixedGasketTemplate?.fixedGlazingFramePlacementMethod
        === 'exact-224063-same-frame-affine-bridge'
        && affineFixedGasketTemplate?.fixedGlazingDividerPlacementMethod
            === 'exact-224063-same-mullion-affine-bridge'
        && Boolean(affineFixedGasketTemplate?.fixedGlazingFrameCadTransform)
        && Boolean(affineFixedGasketTemplate?.fixedGlazingDividerCadTransforms?.left)
        && Boolean(affineFixedGasketTemplate?.mullionConnectionCadTransform)
        && affineFixedGasketTemplate?.mullionConnectionPlacementMethod
            === 'exact-direct-join-gasket-mounted-on-mullion-with-180-face-compensation',
    '224063 must preserve its direct CAD INSERT and expose a divider-mounted mixed-join transform when legacy source INSERT transforms are available.'
);
assert(
    affineRebateGasketTemplate?.mullionSashPlacementMethod
        === 'exact-245472-same-mullion-affine-bridge'
        && Boolean(affineRebateGasketTemplate?.mullionSashCadTransform)
        && Boolean(affineRebateGasketTemplate?.mullionConnectionCadTransform)
        && affineRebateGasketTemplate?.mullionConnectionPlacementMethod
            === 'exact-direct-join-gasket-mounted-on-mullion-with-180-face-compensation',
    '245472_s_5 must preserve its direct CAD INSERT and expose a divider-mounted mixed-join transform.'
);

const distinct247472ConnectionTemplate = structuredClone(connectionTemplate);
delete distinct247472ConnectionTemplate.profileOccurrences['245472'];
distinct247472ConnectionTemplate.profileOccurrences['247472'] = [{
    occurrenceIndex: 0,
    profileId: '247472',
    role: 'gasket',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 520, ty: 240 },
    bbox: { minX: 520, minY: 240, maxX: 528, maxY: 247 },
    center: { x: 524, y: 243.5 },
    matchedComponentCount: 1,
    matchStrategy: 'direct-named-join-component',
    coordinateSpace: 'block-local-to-join',
    directBlockNames: ['247472_s'],
}];
distinct247472ConnectionTemplate.roleOccurrences.gasket =
    distinct247472ConnectionTemplate.roleOccurrences.gasket
        .filter(occurrence => occurrence.profileId !== '245472')
        .concat(distinct247472ConnectionTemplate.profileOccurrences['247472']);
let rejectedUnverified247472 = false;
try {
    composeRegisteredProfileDefinitions({
        selection: {
            profileSetId: '2_4_Oeffnungselemnt_Vertikal',
            outerFrameProfileId: '575760',
            sashProfileId: '575780',
            dividerProfileId: '575800',
            dividerOrientation: 'vertical',
            leftCell: 'fixed-glazing',
            rightCell: 'opening-sash',
        },
        definitionsByProfileSetId: affineLegacyDefinitions,
        standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
        connectionTemplate: distinct247472ConnectionTemplate,
        placementConnectionTemplate: distinct247472ConnectionTemplate,
        fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
        fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
        fixedGlazingDividerGasketTemplate: distinct247472ConnectionTemplate,
        standaloneBeadDefinition: actualStandaloneBeadDefinition,
    });
} catch (error) {
    rejectedUnverified247472 = String(error?.message || '').includes('247472');
}
assert(
    rejectedUnverified247472,
    'A directly named 247472 INSERT must not be silently substituted with 245472 runtime geometry.'
);
const fixedTopBeadBbox = transformCadBbox(
    fixedBeadTemplate?.bbox,
    fixedBeadTemplate?.fixedGlazingFrameCadTransform
);
const fixedBottomBeadBbox = transformCadBbox(
    fixedBottomBeadTemplate?.bbox,
    fixedBottomBeadTemplate?.fixedGlazingFrameCadTransform
);
const topBeadInward = fixedTopBeadBbox
    ? fixedPlacementComposition.metadata.globalMaxY - (fixedTopBeadBbox.minY + fixedTopBeadBbox.maxY) / 2
    : NaN;
const bottomBeadInward = fixedBottomBeadBbox
    ? (fixedBottomBeadBbox.minY + fixedBottomBeadBbox.maxY) / 2 - fixedPlacementComposition.metadata.globalMinY
    : NaN;
assert(
    Number.isFinite(topBeadInward)
        && Number.isFinite(bottomBeadInward)
        && Math.abs(topBeadInward - bottomBeadInward) < 0.001,
    'Frame-fixed top and bottom glazing beads must use the same CAD-derived inward seat.'
);
assert(
    fixedPlacementComposition.metadata.fixedGlazingConnections?.frameTemplateId === 'frame-fixed'
        && fixedPlacementComposition.metadata.fixedGlazingConnections?.placementMethod
            === 'exact-fixed-glazing-join-occurrences-with-section-normalized-frame-seat',
    'Fixed glazing placement metadata must record that CAD occurrences drive the fixed accessory positions and normalized divider boundary.'
);

const fixedFixedAccessoryComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate: fixedFixedConnectionTemplate,
    placementConnectionTemplate: connectionTemplate,
    fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
    fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
    fixedGlazingDividerGasketTemplate: fixedFixedConnectionTemplate,
    standaloneBeadDefinition: actualStandaloneBeadDefinition,
});
const fixedFixedGasketTemplate = fixedFixedAccessoryComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224063')
    && profile.section === 'top'
);
assert(
    Object.keys(fixedFixedGasketTemplate?.fixedGlazingDividerCadTransforms || {}).sort().join(',')
        === 'left,right'
        && fixedFixedAccessoryComposition.metadata.fixedGlazingConnections
            ?.dividerGasketTemplateId === 'mullion-fixed-fixed'
        && fixedFixedAccessoryComposition.metadata.fixedGlazingConnections
            ?.dividerGasketBoundaryMethod
            === 'active-mullion-join-relative-to-cad-fixed-cell-boundary',
    'Fixed/fixed 224063 must use both direct window-mullion-window occurrences and measure them from the same CAD-derived cell boundaries as the divider glazing beads.'
);

const actualMixedConnectionTemplate = JSON.parse(fs.readFileSync(
    path.join(
        projectRoot,
        'src',
        'client',
        'cad-connections',
        'mullion-fixed-sash',
        'connection.meta.json'
    ),
    'utf8'
));
const actualMixedAffineGasketComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: affineLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate: actualMixedConnectionTemplate,
    placementConnectionTemplate: actualMixedConnectionTemplate,
    fixedGlazingFrameTemplate: frameFixedPlacementTemplate,
    fixedGlazingDividerTemplate: fixedFixedConnectionTemplate,
    fixedGlazingDividerGasketTemplate: actualMixedConnectionTemplate,
    standaloneBeadDefinition: actualStandaloneBeadDefinition,
});
const actualMixedAffine224063 = actualMixedAffineGasketComposition.profiles.find(profile =>
    String(profile.blockName || '').includes('224063')
    && profile.section === 'top'
);
const actualMixedAffine245472 = actualMixedAffineGasketComposition.profiles.find(profile =>
    profile.role === 'frame'
    && String(profile.blockName || '').includes('245472_s_5')
    && profile.section === 'top'
);
const actualMixedDividerCenterX = (
    actualMixedAffineGasketComposition.metadata.dividerSourceBounds.minX
    + actualMixedAffineGasketComposition.metadata.dividerSourceBounds.maxX
) / 2;
const actualMixed224063MountedBbox = transformCadBbox(
    actualMixedAffine224063?.bbox,
    actualMixedAffine224063?.mullionConnectionCadTransform
);
const actualMixed245472MountedBbox = transformCadBbox(
    actualMixedAffine245472?.bbox,
    actualMixedAffine245472?.mullionConnectionCadTransform
);
const actualMixed224063PreRotationFace = actualMixed224063MountedBbox
    ? (actualMixed224063MountedBbox.minX + actualMixed224063MountedBbox.maxX) / 2
        - actualMixedDividerCenterX
    : NaN;
const actualMixed245472PreRotationFace = actualMixed245472MountedBbox
    ? (actualMixed245472MountedBbox.minX + actualMixed245472MountedBbox.maxX) / 2
        - actualMixedDividerCenterX
    : NaN;
assert(
    Number.isFinite(actualMixed224063PreRotationFace)
        && Number.isFinite(actualMixed245472PreRotationFace)
        // createDividerSegment applies the accepted 180° correction, so the
        // final face sign is the negative of this pre-rotation join face.
        && -actualMixed224063PreRotationFace < 0
        && -actualMixed245472PreRotationFace > 0
        && actualMixedAffine224063?.mullionConnectionCellSide === 'left'
        && actualMixedAffine245472?.mullionConnectionCellSide === 'right'
        && actualMixedAffine224063?.mullionConnectionOccurrenceIndex === 0
        && actualMixedAffine245472?.mullionConnectionOccurrenceIndex === 0,
    'The real mixed-join metadata must mount direct 224063 occurrence 0 on fixed-left and direct 245472_s_5 occurrence 0 on sash-right after the accepted 180-degree mullion correction.'
);

const actualMixedBoundaryComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate: actualMixedConnectionTemplate,
    placementConnectionTemplate: actualMixedConnectionTemplate,
});
assert(
    Number.isFinite(
        actualMixedBoundaryComposition.metadata.dividerConnection
            ?.openingSashDividerBoundaryFromCenterMm
    )
        && actualMixedBoundaryComposition.metadata.dividerConnection?.openingSashCellSide === 'right'
        && actualMixedBoundaryComposition.metadata.dividerConnection
            .openingSashDividerBoundaryFromCenterMm < 0,
    'The mixed vertical layout must derive the sash-side virtual boundary from the left/right join instead of stopping the sash at the visible mullion face.'
);


// Sash/sash uses the same connection-driven divider bridge, but both sides
// must retain their own sash boundary and direct mullion rebate gasket.
const sashSashConnectionTemplate = structuredClone(actualMixedConnectionTemplate);
sashSashConnectionTemplate.id = 'mullion-sash-sash';
sashSashConnectionTemplate.leftCell = 'opening-sash';
sashSashConnectionTemplate.rightCell = 'opening-sash';
const sourceSashOccurrence = sashSashConnectionTemplate.profileOccurrences['575780'][0];
const leftSashOccurrence = structuredClone(sourceSashOccurrence);
leftSashOccurrence.occurrenceIndex = 99;
leftSashOccurrence.transform.tx -= 100;
leftSashOccurrence.bbox.minX -= 100;
leftSashOccurrence.bbox.maxX -= 100;
sashSashConnectionTemplate.profileOccurrences['575780'].push(leftSashOccurrence);
sashSashConnectionTemplate.roleOccurrences['opening-sash'].push(structuredClone(leftSashOccurrence));
const sourceRebateOccurrence = sashSashConnectionTemplate.profileOccurrences['245472']
    .find(occurrence => (occurrence.directBlockNames || []).includes('245472_s_5'));
const leftRebateOccurrence = structuredClone(sourceRebateOccurrence);
leftRebateOccurrence.occurrenceIndex = 99;
leftRebateOccurrence.transform.tx -= 80;
leftRebateOccurrence.bbox.minX -= 80;
leftRebateOccurrence.bbox.maxX -= 80;
leftRebateOccurrence.center.x -= 80;
sashSashConnectionTemplate.profileOccurrences['245472'].push(leftRebateOccurrence);
sashSashConnectionTemplate.roleOccurrences.gasket.push(structuredClone(leftRebateOccurrence));
const sashSashComposition = composeRegisteredProfileDefinitions({
    selection: {
        profileSetId: '2_4_Oeffnungselemnt_Vertikal',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        dividerProfileId: '575800',
        dividerOrientation: 'vertical',
        leftCell: 'opening-sash',
        rightCell: 'opening-sash',
    },
    definitionsByProfileSetId: actualLegacyDefinitions,
    standaloneDefinitionsByProfileId: actualStandaloneDefinitions,
    connectionTemplate: sashSashConnectionTemplate,
    placementConnectionTemplate: sashSashConnectionTemplate,
});
const sashSashBoundaries = sashSashComposition.metadata.dividerConnection
    ?.openingSashDividerBoundariesMm || {};
const sashSashRebateProfile = sashSashComposition.profiles.find(profile =>
    profile.role === 'frame'
    && String(profile.blockName || '').includes('245472_s_5')
    && profile.section === 'top'
);
assert(
    Number.isFinite(Number(sashSashBoundaries.left))
        && Number.isFinite(Number(sashSashBoundaries.right))
        && Object.keys(sashSashRebateProfile?.mullionConnectionCadTransforms || {}).sort().join(',')
            === 'left,right'
        && sashSashComposition.metadata.dividerOpeningSashConnections?.placedSideCount === 2,
    'Sash/sash must preserve one CAD-derived sash boundary and one direct 245472 mullion gasket on each side.'
);

if (errors.length) {
    console.error('Profile composition validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Profile composition valid: frame/sash sources and supplemental accessories align into one assembly.');
}
