import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const converter = require(path.join(projectRoot, 'cad', 'tools', 'convert_standalone_profile.js'));
const geometryIslandTools = require(path.join(projectRoot, 'cad', 'tools', 'geometry_islands.js'));
const singleProfileConverter = require(path.join(projectRoot, 'cad', 'tools', 'test_convert.js'));
const insertTransformTools = require(path.join(projectRoot, 'cad', 'tools', 'insert_transform.js'));

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const expectedRoles = new Map([
    ['575760', 'outer-frame'],
    ['575770', 'outer-frame'],
    ['575780', 'opening-sash'],
    ['575790', 'opening-sash'],
    ['575800', 'mullion-transom'],
    ['575810', 'mullion-transom'],
    ['573940', 'glazing-bead'],
    ['573930', 'glazing-bead'],
    ['573920', 'glazing-bead'],
    ['224350', 'gasket'],
    ['224378', 'gasket'],
    ['224379', 'gasket']
]);

const expectedSourceFolders = new Map([
    ['575760', 'frame'], ['575770', 'frame'],
    ['575780', 'sash'], ['575790', 'sash'],
    ['575800', 'mullion'], ['575810', 'mullion'],
    ['573940', 'bead'], ['573930', 'bead'], ['573920', 'bead'],
    ['224350', 'gasket'], ['224378', 'gasket'], ['224379', 'gasket'],
]);

const { manifest } = converter.loadManifest(converter.DEFAULT_MANIFEST);
const plans = converter.createPlansFromManifest(manifest, {});

assert.equal(plans.length, expectedRoles.size, 'The standalone manifest must contain six structural profiles and six glazing accessories.');
assert.equal(new Set(plans.map(plan => plan.profileId)).size, plans.length, 'Profile IDs must be unique.');
assert.equal(plans.some(plan => plan.role === 'double-vent-sash'), false, 'Double-vent profiles must remain excluded from the active standalone manifest.');

for (const plan of plans) {
    assert.equal(plan.role, expectedRoles.get(plan.profileId), `Unexpected role for ${plan.profileId}.`);
    assert.ok(fs.existsSync(plan.sourcePath), `Missing source file for ${plan.profileId}.`);
    assert.equal(
        path.basename(path.dirname(plan.sourcePath)),
        expectedSourceFolders.get(plan.profileId),
        `Unexpected source folder for ${plan.profileId}.`
    );
    assert.ok(plan.outputDir.includes(path.join('svg', 'standalone')), `Unexpected output root for ${plan.profileId}.`);
    assert.ok(!plan.outputDir.includes(`${path.sep}L${path.sep}`), 'Output folders must not encode L profile terminology.');
    assert.ok(!plan.outputDir.includes(`${path.sep}Z${path.sep}`), 'Output folders must not encode Z profile terminology.');

    if (plan.role === 'mullion-transom') {
        assert.equal(plan.componentSelection.mode, 'main-cluster');
        assert.equal(plan.componentSelection.maxGapMm, 25);
        assert.deepEqual(plan.componentSelection.anchorBlockNames, [plan.profileId]);
        assert.equal(plan.geometrySource.modelSpacePolicy, 'inserts-only', 'Mullions must use the same block-INSERT-only source policy as the complete converter.');
    } else {
        assert.equal(plan.componentSelection.mode, 'all');
        assert.equal(plan.geometrySource.modelSpacePolicy, 'prefer-inserts');
    }
}

const selectedPlans = converter.createPlansFromManifest(manifest, { only: '575760,575800' });
assert.deepEqual(selectedPlans.map(plan => plan.profileId), ['575760', '575800']);
assert.throws(
    () => converter.createPlansFromManifest(manifest, { only: '575820' }),
    /Profiles not found in manifest/,
    'Ignored double-vent profiles must not be selectable from the current manifest.'
);

const syntheticComponents = [
    {
        id: '575800-main',
        blockName: '575800',
        parentBlock: null,
        rootBlock: 'mullion',
        hierarchy: ['mullion', '575800'],
        bbox: { minX: 200, minY: 0, maxX: 500, maxY: 100 },
        area: 30000
    },
    {
        id: 'inner-piece',
        blockName: '200988',
        parentBlock: '575800',
        rootBlock: 'mullion',
        hierarchy: ['mullion', '575800', '200988'],
        bbox: { minX: 350, minY: 30, maxX: 440, maxY: 70 },
        area: 3600
    },
    {
        id: 'detached-left-piece',
        blockName: '575800',
        parentBlock: null,
        rootBlock: 'mullion',
        hierarchy: ['mullion', '575800'],
        geometryIslandIndex: 1,
        geometryIslandCount: 2,
        bbox: { minX: 0, minY: 20, maxX: 50, maxY: 80 },
        area: 3000
    }
];

const clusterSelection = converter.selectComponents(syntheticComponents, {
    mode: 'main-cluster',
    maxGapMm: 25,
    anchorBlockNames: ['575800'],
    keepExcludedForReview: true
});
assert.deepEqual(clusterSelection.included.map(component => component.id), ['575800-main', 'inner-piece']);
assert.deepEqual(clusterSelection.excluded.map(component => component.id), ['detached-left-piece']);
assert.equal(clusterSelection.excluded[0].exclusionReason, 'detached-from-main-profile-cluster');
assert.deepEqual(converter.getComponentsViewBox(clusterSelection.included), [195, -105, 310, 110]);

function rectanglePath(minX, minY, maxX, maxY) {
    return {
        closed: true,
        sourceTypes: new Set(['LWPOLYLINE']),
        points: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ]
    };
}

const splitGeometryIslands = geometryIslandTools.splitPathsIntoGeometryIslands([
    rectanglePath(200, 0, 500, 100),
    rectanglePath(240, 20, 260, 40), // enclosed contour/hole: must stay with main body
    rectanglePath(0, 20, 50, 80)     // detached SVG island: must become its own component
]);
assert.equal(splitGeometryIslands.length, 2, 'Disconnected geometry inside one CAD block must be split into separate selectable components.');
assert.equal(splitGeometryIslands.some(island => island.length === 2), true, 'An enclosed hole contour must remain grouped with its outer profile body.');
assert.equal(splitGeometryIslands.some(island => island.length === 1), true, 'The detached left SVG island must be emitted independently so mullion clustering can exclude it.');

function lwPolyline(minX, minY, maxX, maxY, layer = '0') {
    return {
        type: 'LWPOLYLINE',
        layer,
        shape: true,
        vertices: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ]
    };
}

const syntheticDxf = {
    blocks: {
        '575800': {
            position: { x: 0, y: 0 },
            entities: [
                lwPolyline(100, 0, 200, 100, 'profile'),
                lwPolyline(700, 0, 710, 10, 'proxy-out-of-range')
            ]
        }
    }
};
const syntheticModelSpace = [
    {
        type: 'INSERT',
        name: '575800',
        position: { x: 0, y: 0 },
        xScale: 1,
        yScale: 1,
        rotation: 0,
        layer: 'profile'
    },
    lwPolyline(0, 20, 50, 80, 'proxy-model-space')
];

const insertOnlyBundle = singleProfileConverter.collectSplitComponentBundle(
    syntheticDxf,
    syntheticModelSpace,
    { modelSpacePolicy: 'inserts-only' }
);
assert.equal(insertOnlyBundle.components.length, 1, 'INSERT-only conversion must omit direct model-space proxy geometry.');
assert.equal(insertOnlyBundle.components[0].blockName, '575800');
assert.equal(insertOnlyBundle.diagnostics.ignoredDirectModelSpaceGeometry, true);
assert.equal(insertOnlyBundle.diagnostics.directModelSpacePathCount, 1);
assert.equal(insertOnlyBundle.diagnostics.filteredPathCount, 1, 'The complete-converter coordinate guard must filter out-of-range block paths.');
assert.equal(insertOnlyBundle.components.some(component => component.rootBlock === 'model-space'), false);

const allGeometryBundle = singleProfileConverter.collectSplitComponentBundle(
    syntheticDxf,
    syntheticModelSpace,
    { modelSpacePolicy: 'all' }
);
assert.equal(allGeometryBundle.components.some(component => component.rootBlock === 'model-space'), true, 'The all policy remains available for drawings that intentionally mix blocks and direct geometry.');
assert.equal(allGeometryBundle.diagnostics.ignoredDirectModelSpaceGeometry, false);
assert.throws(
    () => singleProfileConverter.normalizeModelSpacePolicy('invalid'),
    /Invalid model-space policy/
);

// DXF INSERT positions are in OCS. For a negative-Z extrusion, AutoCAD's
// arbitrary-axis basis mirrors both the block vector and the insertion point.
// Keeping the position in OCS caused the reflected mullion insulation insert
// at x=-30 to render 60 mm too far left instead of at x=+30.
const reflectedInsertTransform = insertTransformTools.createInsertTransform({
    position: { x: -30, y: 47, z: 0 },
    xScale: 1,
    yScale: 1,
    rotation: 180,
    extrusionDirection: { x: 0, y: 0, z: -1 }
});
const reflectedOrigin = reflectedInsertTransform({ x: 0, y: 0, z: 0 });
assert.ok(Math.abs(reflectedOrigin.x - 30) < 1e-9, 'Negative-Z INSERT position must be converted from OCS to WCS.');
assert.ok(Math.abs(reflectedOrigin.y - 47) < 1e-9);
const reflectedUnitX = reflectedInsertTransform({ x: 1, y: 0, z: 0 });
assert.ok(Math.abs(reflectedUnitX.x - 31) < 1e-9, 'Rotation must be applied in OCS before conversion to WCS.');
assert.ok(Math.abs(reflectedUnitX.y - 47) < 1e-9);

for (const profileId of ['575800', '575810']) {
    const profileOutput = plans.find(plan => plan.profileId === profileId).outputDir;
    const metadataPath = path.join(profileOutput, 'profile.meta.json');
    const profileSvgPath = path.join(profileOutput, 'profile.svg');
    assert.ok(fs.existsSync(metadataPath), `Missing corrected metadata for ${profileId}.`);
    assert.ok(fs.existsSync(profileSvgPath), `Missing corrected profile SVG for ${profileId}.`);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.conversion.insertTransform, 'ocs-to-world');
    assert.ok(metadata.geometry.viewBox[2] <= 100, `${profileId} still includes a displaced left fragment in its viewBox.`);

    const clusters = converter.buildComponentClusters(metadata.geometry.components, 25);
    assert.equal(clusters.length, 1, `${profileId} components must form one assembled profile cluster.`);

    const summary = converter.parseSvgSummary(fs.readFileSync(profileSvgPath, 'utf8'));
    assert.deepEqual(summary.viewBox, metadata.geometry.viewBox, `${profileId} SVG and metadata viewBoxes must match.`);
}


const allSelection = converter.selectComponents(syntheticComponents, {
    mode: 'all',
    maxGapMm: 25,
    anchorBlockNames: [],
    keepExcludedForReview: true
});
assert.equal(allSelection.included.length, 3);
assert.equal(allSelection.excluded.length, 0);

const testSource = path.join(projectRoot, 'src', 'client', 'icons', 'gaskets', '224350.svg');
const sourceHashBefore = sha256(testSource);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-profile-validation-'));
const outputDir = path.join(tempRoot, 'gaskets', '224350');

try {
    const plan = converter.createProfilePlan({}, {
        source: testSource,
        'profile-id': '224350',
        role: 'gasket',
        output: outputDir,
        'canonical-side': 'top',
        'allowed-sides': 'top,right,bottom,left',
        rotations: '0,90,180,270'
    });

    const result = converter.convertOne(plan, { force: false, dryRun: false });
    assert.equal(result.status, 'converted');

    const svgPath = path.join(outputDir, 'profile.svg');
    const metadataPath = path.join(outputDir, 'profile.meta.json');
    const partsDir = path.join(outputDir, 'parts');
    assert.ok(fs.existsSync(svgPath), 'Standalone conversion did not create profile.svg.');
    assert.ok(fs.existsSync(metadataPath), 'Standalone conversion did not create profile.meta.json.');
    assert.ok(fs.existsSync(partsDir), 'Standalone conversion did not create the selectable parts folder.');
    assert.equal(fs.readdirSync(partsDir).filter(file => file.endsWith('.svg')).length, 1);

    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /data-profile-id="224350"/);
    assert.match(svg, /data-profile-role="gasket"/);
    const summary = converter.parseSvgSummary(svg);
    assert.ok(summary.filledPathCount > 0, 'Generated SVG must contain visible filled geometry.');

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.schemaVersion, 2);
    assert.equal(metadata.id, '224350');
    assert.equal(metadata.role, 'gasket');
    assert.equal(metadata.geometry.mode, 'component-assembly');
    assert.equal(metadata.geometry.sourcePolicy.modelSpacePolicy, 'prefer-inserts');
    assert.equal(metadata.conversion.insertTransform, 'ocs-to-world');
    assert.equal(metadata.geometry.sourceDiagnostics.modelSpacePolicy, 'source-svg');
    assert.equal(metadata.geometry.components.length, 1);
    assert.equal(metadata.geometry.components[0].selectable, true);
    assert.equal(metadata.geometry.components[0].defaultEnabled, true);
    assert.equal(metadata.source.sha256, sourceHashBefore);
    assert.equal(metadata.source.originalPreserved, true);
    assert.equal(metadata.catalogRegistration.status, 'not-registered');

    assert.throws(
        () => converter.convertOne(plan, { force: false, dryRun: false }),
        /Output already exists/,
        'Existing generated files should require --force.'
    );

    const sentinelPath = path.join(outputDir, 'review-notes.txt');
    fs.writeFileSync(sentinelPath, 'keep this file\n', 'utf8');

    metadata.catalogRegistration = {
        status: 'registered',
        registeredAt: '2026-08-06',
        runtimeMode: 'standalone-base-with-legacy-accessories',
        referenceProfileSetId: 'validation-reference',
        note: 'Preserve reviewed registration during forced reconversion.'
    };
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    converter.convertOne(plan, { force: true, dryRun: false });
    assert.ok(fs.existsSync(sentinelPath), '--force must not delete unrelated files in the output directory.');
    assert.ok(fs.existsSync(partsDir), '--force must recreate the generated selectable parts folder.');
    const reconvertedMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.deepEqual(
        reconvertedMetadata.catalogRegistration,
        metadata.catalogRegistration,
        '--force must preserve reviewed catalog registration metadata.'
    );
    assert.equal(sha256(testSource), sourceHashBefore, 'The source geometry file must never be modified.');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`Standalone profile conversion validation passed: ${plans.length} active manifest profiles, main-converter model-space filtering, geometry-island splitting, component clustering, and one SVG end-to-end conversion.`);
