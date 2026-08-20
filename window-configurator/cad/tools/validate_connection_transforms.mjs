import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
    resolveConnectionDepthAxisSign,
    resolveConnectionOccurrence,
} from '../../src/client/js/connection-template-loader.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const {
    fitProfileOccurrences,
    transformBbox,
} = require(path.join(projectRoot, 'cad', 'tools', 'connection_transform.js'));

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

console.log('Connection transform validation passed: exact CAD INSERT matrices drive orientation and profile matching.');
