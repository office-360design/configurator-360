import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
    getConnectionTemplateIdForLayout,
    projectConnectionDelta,
    resolveConnectionDepthAxisSign,
    resolveConnectionOccurrence,
    resolveConnectionRuntimeBasis,
} from '../../src/client/js/connection-template-loader.js';
import {
    transformCadPoint,
    translateCadTransformSource,
} from '../../src/client/js/profile-coordinate-transform.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const {
    fitProfileOccurrences,
    transformBbox,
} = require(path.join(projectRoot, 'cad', 'tools', 'connection_transform.js'));
const {
    fitAllProfiles,
} = require(path.join(projectRoot, 'cad', 'tools', 'convert_connection_assemblies.js'));

const sourceTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const expectedTransform = { a: 0, b: -1, c: 1, d: 0, tx: 100, ty: 50 };
const sourceBbox = { minX: 0, minY: 0, maxX: 10, maxY: 20 };
const targetBbox = transformBbox(sourceBbox, expectedTransform);

const occurrences = fitProfileOccurrences({
    profileId: '575800',
    standaloneComponents: [{
        id: 'source-aluminium',
        blockName: 'PROFILE_575800_ALUMINUM',
        hierarchy: ['575800', 'PROFILE_575800_ALUMINUM'],
        bbox: sourceBbox,
        sourceTransform,
    }, {
        id: 'source-insulation',
        blockName: 'PROFILE_575800_INSULATION',
        hierarchy: ['575800', 'PROFILE_575800_INSULATION'],
        bbox: { minX: 2, minY: 3, maxX: 8, maxY: 17 },
        sourceTransform,
    }],
    connectionComponents: [{
        id: 'join-aluminium',
        blockName: 'PROFILE_575800_ALUMINUM',
        hierarchy: ['JOIN', 'PROFILE_575800_ALUMINUM'],
        bbox: targetBbox,
        sourceTransform: expectedTransform,
    }, {
        id: 'join-insulation',
        blockName: 'PROFILE_575800_INSULATION',
        hierarchy: ['JOIN', 'PROFILE_575800_INSULATION'],
        bbox: transformBbox({ minX: 2, minY: 3, maxX: 8, maxY: 17 }, expectedTransform),
        sourceTransform: expectedTransform,
    }],
});

assert.equal(occurrences.length, 1, 'The exact INSERT matrices should resolve one profile occurrence.');
assert.deepEqual(occurrences[0].transform, expectedTransform);
assert.equal(occurrences[0].matchedComponentCount, 2);
assert.equal(occurrences[0].mirrored, false);
assert.ok(occurrences[0].maxBboxErrorMm < 1e-9);


const partialAccessorySource = [{
    id: '573940-profile',
    blockName: '573940_s',
    bbox: { minX: 0, minY: 0, maxX: 32, maxY: 26.7 },
    sourceTransform,
}, {
    id: '573940-retainer',
    blockName: '244511_s_2',
    bbox: { minX: 19.5, minY: 2.3, maxX: 21.55, maxY: 4.8 },
    sourceTransform,
}];
const partialAccessoryTarget = [{
    id: 'join-573940-profile',
    blockName: '573940_s',
    bbox: transformBbox(partialAccessorySource[0].bbox, expectedTransform),
    sourceTransform: expectedTransform,
}];
assert.equal(
    fitProfileOccurrences({
        profileId: '573940',
        standaloneComponents: partialAccessorySource,
        connectionComponents: partialAccessoryTarget,
    }).length,
    0,
    'A one-component match must not weaken the default structural matching rule.'
);
const partialAccessoryOccurrences = fitProfileOccurrences({
    profileId: '573940',
    standaloneComponents: partialAccessorySource,
    connectionComponents: partialAccessoryTarget,
    allowSingleExplicitProfileMatch: true,
});
assert.equal(
    partialAccessoryOccurrences.length,
    1,
    'An accessory join may use one exact profile-named INSERT when the retaining child is absent.'
);
assert.deepEqual(partialAccessoryOccurrences[0].transform, expectedTransform);
assert.equal(partialAccessoryOccurrences[0].matchedComponentCount, 1);
assert.equal(
    fitProfileOccurrences({
        profileId: '573920',
        standaloneComponents: partialAccessorySource,
        connectionComponents: partialAccessoryTarget,
        allowSingleExplicitProfileMatch: true,
    }).length,
    0,
    'Single-component fallback must not misidentify sibling bead profiles whose block name does not contain their profile ID.'
);


const sharedAnchorOnlyTarget = [{
    id: 'join-573940-retainer-only',
    blockName: '244511_s_2',
    bbox: transformBbox(partialAccessorySource[1].bbox, expectedTransform),
    sourceTransform: expectedTransform,
}];
assert.equal(
    fitProfileOccurrences({
        profileId: '573940',
        standaloneComponents: partialAccessorySource,
        connectionComponents: sharedAnchorOnlyTarget,
        allowSingleExplicitProfileMatch: true,
    }).length,
    0,
    'A shared child INSERT is not an explicit profile-named fallback.'
);
const sharedAnchorOccurrences = fitProfileOccurrences({
    profileId: '573940',
    standaloneComponents: partialAccessorySource,
    connectionComponents: sharedAnchorOnlyTarget,
    allowSingleComponentMatch: true,
});
assert.equal(
    sharedAnchorOccurrences.length,
    1,
    'A glazing bead may use one exact shared retaining INSERT as its CAD placement anchor.'
);
assert.deepEqual(sharedAnchorOccurrences[0].transform, expectedTransform);
assert.equal(sharedAnchorOccurrences[0].matchedComponentCount, 1);

const alternateSharedTransform = { a: 1, b: 0, c: 0, d: 1, tx: -75, ty: 120 };
const explicitAndSharedTarget = [{
    id: 'join-573940-profile-preferred',
    blockName: '573940_s',
    bbox: transformBbox(partialAccessorySource[0].bbox, expectedTransform),
    sourceTransform: expectedTransform,
}, {
    id: 'join-573940-shared-distractor',
    blockName: '244511_s_2',
    bbox: transformBbox(partialAccessorySource[1].bbox, alternateSharedTransform),
    sourceTransform: alternateSharedTransform,
}];
const explicitPreferredOccurrences = fitProfileOccurrences({
    profileId: '573940',
    standaloneComponents: partialAccessorySource,
    connectionComponents: explicitAndSharedTarget,
    allowSingleExplicitProfileMatch: true,
    allowSingleComponentMatch: true,
    preferExplicitProfileMatch: true,
});
assert.equal(
    explicitPreferredOccurrences.length,
    1,
    'An exact 573940 INSERT must suppress shared retaining-child fallback occurrences when both exist.'
);
assert.deepEqual(explicitPreferredOccurrences[0].transform, expectedTransform);
assert.equal(explicitPreferredOccurrences[0].explicitProfileMatchCount, 1);
assert.equal(explicitPreferredOccurrences[0].matchStrategy, 'explicit-profile-component');


const directGasketTransform = { a: 1, b: 0, c: 0, d: 1, tx: 210, ty: 35 };
const directGasketBbox = { minX: 210, minY: 35, maxX: 217, maxY: 48 };
const directAccessoryMatches = fitAllProfiles({
    components: [{
        id: 'join-224063',
        blockName: '224063_s',
        rootBlock: '224063_s',
        hierarchy: ['224063_s'],
        bbox: directGasketBbox,
        sourceTransform: directGasketTransform,
    }, {
        id: 'join-245472',
        blockName: '245472_s_5',
        rootBlock: '245472_s_5',
        hierarchy: ['245472_s_5'],
        bbox: { minX: 230, minY: 35, maxX: 238, maxY: 42 },
        sourceTransform: { a: 1, b: 0, c: 0, d: 1, tx: 230, ty: 35 },
    }, {
        id: 'join-247472',
        blockName: '247472_s',
        rootBlock: '247472_s',
        hierarchy: ['247472_s'],
        bbox: { minX: 250, minY: 35, maxX: 258, maxY: 42 },
        sourceTransform: { a: 1, b: 0, c: 0, d: 1, tx: 250, ty: 35 },
    }, {
        id: 'join-224068',
        blockName: '224068_s_1',
        rootBlock: '224068_s_1',
        hierarchy: ['224068_s_1'],
        bbox: { minX: 270, minY: 35, maxX: 293, maxY: 49 },
        sourceTransform: { a: 1, b: 0, c: 0, d: 1, tx: 270, ty: 35 },
    }],
}, {
    plans: [],
    metadataById: new Map(),
});
assert.equal(
    directAccessoryMatches['224063']?.length,
    1,
    'The join converter must preserve a directly named 224063 INSERT even without a standalone 224063 CAD source.'
);
assert.equal(
    directAccessoryMatches['224063'][0].matchStrategy,
    'direct-named-join-component'
);
assert.deepEqual(directAccessoryMatches['224063'][0].bbox, directGasketBbox);
assert.equal(
    directAccessoryMatches['245472']?.length,
    1,
    'The join converter must preserve a directly named 245472 frame/mullion rebate-gasket INSERT.'
);
assert.equal(
    directAccessoryMatches['245472'][0].matchStrategy,
    'direct-named-join-component'
);
assert.deepEqual(
    directAccessoryMatches['245472'][0].directBlockNames,
    ['245472_s_5']
);
assert.equal(
    directAccessoryMatches['247472']?.length,
    1,
    'The join converter must preserve a directly named 247472 gasket distinctly from 245472.'
);
assert.deepEqual(
    directAccessoryMatches['247472'][0].directBlockNames,
    ['247472_s']
);
assert.equal(
    directAccessoryMatches['224068']?.length,
    1,
    'The join converter must preserve a directly named 224068 mullion-accessory INSERT.'
);
assert.equal(
    directAccessoryMatches['224068'][0].role,
    'accessory',
    '224068 must use the generic mullion-accessory role rather than the structural gasket path.'
);
assert.deepEqual(
    directAccessoryMatches['224068'][0].directBlockNames,
    ['224068_s_1']
);

const template = {
    profileOccurrences: {
        '575800': occurrences,
    },
    roleOccurrences: {
        'mullion-transom': [{
            profileId: '575800',
            ...occurrences[0],
        }],
        'opening-sash': [{
            profileId: '575780',
            transform: { a: 0, b: -1, c: 1, d: 0, tx: 25, ty: 75 },
            bbox: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
        }],
    },
};

assert.equal(
    resolveConnectionOccurrence(template, '575800', 'mullion-transom').transformSource,
    'exact-profile-occurrence'
);
assert.equal(
    resolveConnectionOccurrence(template, '575810', 'mullion-transom').transformSource,
    'role-reference:575800',
    'A sibling mullion may reuse only the CAD-confirmed role orientation when its exact ID is absent from the join.'
);
assert.equal(
    resolveConnectionDepthAxisSign(template),
    1,
    'Join front/back must follow the sash INSERT mapping from standalone +X into join +Y.'
);
assert.equal(
    resolveConnectionDepthAxisSign({
        ...template,
        roleOccurrences: {
            ...template.roleOccurrences,
            'opening-sash': [{
                profileId: '575780',
                transform: { a: 0, b: 1, c: -1, d: 0, tx: 25, ty: 75 },
                bbox: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
            }],
        },
    }),
    -1,
    'A reversed CAD sash INSERT must reverse the join depth direction without a manual rotation.'
);

const identityJoinTemplate = {
    ...template,
    roleOccurrences: {
        ...template.roleOccurrences,
        'opening-sash': [{
            profileId: '575780',
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 25, ty: 75 },
            bbox: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
        }],
    },
};
const identityBasis = resolveConnectionRuntimeBasis(identityJoinTemplate);
assert.deepEqual(
    {
        depthX: identityBasis.depthX,
        depthY: identityBasis.depthY,
        faceX: identityBasis.faceX,
        faceY: identityBasis.faceY,
    },
    { depthX: 1, depthY: 0, faceX: 0, faceY: 1 },
    'A join that keeps standalone sash +X on join X must be valid; join Y is not universally the depth axis.'
);
assert.deepEqual(
    projectConnectionDelta(identityBasis, 12, -7),
    { depth: 12, face: -7 },
    'Connection coordinates must project through the CAD-derived sash basis.'
);
assert.equal(
    getConnectionTemplateIdForLayout({
        dividerOrientation: 'vertical',
        leftCell: 'fixed-glazing',
        rightCell: 'fixed-glazing',
    }),
    'mullion-fixed-fixed',
    'A fixed/fixed vertical divider must select the dedicated fixed/fixed join metadata.'
);

const fixedFollowerTransform = { a: 0, b: 1, c: -1, d: 0, tx: 120, ty: 55 };
const shiftedFixedFollowerTransform = translateCadTransformSource(
    fixedFollowerTransform,
    6,
    0
);
assert.deepEqual(
    transformCadPoint(shiftedFixedFollowerTransform, 10, 20),
    transformCadPoint(fixedFollowerTransform, 16, 20),
    'A fixed-glazing bead follower must be able to preserve its CAD seat while applying the thickness-dependent source-X shift used by 224378.'
);

console.log('Connection transform validation passed: exact CAD INSERT matrices drive orientation and profile matching.');
