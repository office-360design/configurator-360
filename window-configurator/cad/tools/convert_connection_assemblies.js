const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
    DEFAULT_MANIFEST: DEFAULT_CONNECTION_MANIFEST,
    loadManifest: loadConnectionManifest,
    createPlansFromManifest: createConnectionPlans,
} = require('./connection_assembly_manifest');
const {
    DEFAULT_MANIFEST: DEFAULT_STANDALONE_MANIFEST,
    loadManifest: loadStandaloneManifest,
    createPlansFromManifest: createStandalonePlans,
} = require('./convert_standalone_profile');
const {
    fitProfileOccurrences,
    unionBboxes,
} = require('./connection_transform');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONVERTER = path.join(__dirname, 'test_convert.js');
const DEFAULT_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'src', 'client', 'cad-connections');
const STRUCTURAL_ROLES = new Set(['outer-frame', 'opening-sash', 'mullion-transom', 'trans']);
const DIRECT_JOIN_ACCESSORIES = Object.freeze({
    '224063': 'gasket',
    // Rebate gasket mounted on a frame/mullion when the opposite side is an
    // opening sash.  There is no standalone CAD source for this accessory, so
    // preserve its exact named INSERT from the join drawing just like 224063.
    '245472': 'gasket',
    // Keep 247472 distinct if that is the exact INSERT name in a join DWG.
    // Runtime must not silently alias it to 245472 because the project does
    // not currently contain verified 247472 geometry.
    '247472': 'gasket',
    // Centre gasket 224068 is an accessory in the configurator, but when it
    // is authored in a mullion join its exact INSERT is also the placement
    // source for the mullion-mounted copy. Keep it in the generic accessory
    // role so it does not collide with the structural 224063/245472 gasket
    // placement path.
    '224068': 'accessory',
    // Optional insulation/accessory profile mounted directly in a mullion or
    // transom rebate. Keep its exact INSERT transform so runtime placement can
    // be derived from the selected mullion occurrence instead of the legacy
    // B2 assembly.
    '200988': 'accessory',
});

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
        const key = token.slice(2);
        if (['force', 'dry-run', 'help'].includes(key)) {
            options[key] = true;
            continue;
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for --${key}`);
        }
        options[key] = value;
        index += 1;
    }
    return options;
}

function relativeProjectPath(filePath) {
    return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getConnectionBounds(componentMetadata) {
    return unionBboxes((componentMetadata.components || []).map(component => component.bbox));
}

function centerOfBbox(bbox) {
    if (!bbox) return null;
    return {
        x: (Number(bbox.minX) + Number(bbox.maxX)) / 2,
        y: (Number(bbox.minY) + Number(bbox.maxY)) / 2,
    };
}

function normalizeBlockName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function blockMatchesProfileId(component, profileId) {
    const normalizedProfileId = normalizeBlockName(profileId);
    const names = [
        component?.blockName,
        component?.rootBlock,
        ...(Array.isArray(component?.hierarchy) ? component.hierarchy : []),
    ].map(normalizeBlockName);
    return names.some(name =>
        name === normalizedProfileId
        || name.startsWith(`${normalizedProfileId}_`)
        || name.startsWith(`${normalizedProfileId}s`)
    );
}

function transformKey(transform = {}) {
    return ['a', 'b', 'c', 'd', 'tx', 'ty']
        .map(key => Number(transform[key] || 0).toFixed(5))
        .join('|');
}

function createDirectNamedAccessoryOccurrences(componentMetadata) {
    const results = {};
    const components = (componentMetadata?.components || []).filter(component =>
        component?.bbox && component?.sourceTransform
    );

    for (const [profileId, role] of Object.entries(DIRECT_JOIN_ACCESSORIES)) {
        const matches = components.filter(component => blockMatchesProfileId(component, profileId));
        if (!matches.length) continue;

        const clusters = new Map();
        for (const component of matches) {
            const key = transformKey(component.sourceTransform);
            if (!clusters.has(key)) {
                clusters.set(key, {
                    transform: component.sourceTransform,
                    boxes: [],
                    blockNames: new Set(),
                });
            }
            const cluster = clusters.get(key);
            cluster.boxes.push(component.bbox);
            if (component.blockName) cluster.blockNames.add(component.blockName);
        }

        results[profileId] = [...clusters.values()].map((cluster, occurrenceIndex) => {
            const bbox = unionBboxes(cluster.boxes);
            return {
                occurrenceIndex,
                profileId,
                role,
                transform: cluster.transform,
                bbox,
                center: centerOfBbox(bbox),
                matchedComponentCount: cluster.boxes.length,
                explicitProfileMatchCount: cluster.boxes.length,
                matchStrategy: 'direct-named-join-component',
                coordinateSpace: 'block-local-to-join',
                directBlockNames: [...cluster.blockNames],
                maxBboxErrorMm: 0,
                mirrored: Number(cluster.transform.a) * Number(cluster.transform.d)
                    - Number(cluster.transform.b) * Number(cluster.transform.c) < 0,
            };
        });
    }

    return results;
}

function createRoleOccurrences(profileOccurrences, standalonePlanById) {
    const roleOccurrences = {};
    for (const [profileId, occurrences] of Object.entries(profileOccurrences)) {
        const role = standalonePlanById.get(profileId)?.role
            || occurrences.find(occurrence => occurrence?.role)?.role;
        if (!role) continue;
        if (!roleOccurrences[role]) roleOccurrences[role] = [];
        occurrences.forEach(occurrence => {
            roleOccurrences[role].push({
                profileId,
                occurrenceIndex: occurrence.occurrenceIndex,
                transform: occurrence.transform,
                bbox: occurrence.bbox,
                center: centerOfBbox(occurrence.bbox),
                matchedComponentCount: occurrence.matchedComponentCount,
                explicitProfileMatchCount: occurrence.explicitProfileMatchCount || 0,
                matchStrategy: occurrence.matchStrategy || null,
                maxBboxErrorMm: occurrence.maxBboxErrorMm,
                mirrored: occurrence.mirrored,
                coordinateSpace: occurrence.coordinateSpace || null,
                directBlockNames: occurrence.directBlockNames || null,
            });
        });
    }
    return roleOccurrences;
}

function assertRequiredStructuralOccurrence(connectionPlan, roleOccurrences) {
    const requiredRole = connectionPlan.boundary === 'outer-frame'
        ? 'outer-frame'
        : (connectionPlan.boundary === 'trans' ? 'trans' : 'mullion-transom');
    if (!(roleOccurrences[requiredRole] || []).length) {
        throw new Error(
            `${connectionPlan.id} did not contain a transform-matched ${requiredRole} profile. `
            + 'The join CAD must keep structural profiles as named block INSERTs that match the standalone source blocks.'
        );
    }
    if (connectionPlan.rightCell === 'opening-sash' || connectionPlan.leftCell === 'opening-sash') {
        if (!(roleOccurrences['opening-sash'] || []).length) {
            throw new Error(
                `${connectionPlan.id} did not contain a transform-matched opening-sash profile.`
            );
        }
    }
    if (connectionPlan.rightCell === 'fixed-glazing' || connectionPlan.leftCell === 'fixed-glazing') {
        if (!(roleOccurrences['glazing-bead'] || []).length) {
            throw new Error(
                `${connectionPlan.id} did not contain a transform-matched glazing-bead profile. `
                + 'Fixed-glazing joins must expose the bead INSERT so runtime placement can come from the join CAD.'
            );
        }
    }
}

function createNamedInsertInventory(componentMetadata) {
    return (componentMetadata?.components || [])
        .filter(component => component?.blockName && component?.sourceTransform)
        .map(component => ({
            index: component.index,
            blockName: component.blockName,
            parentBlock: component.parentBlock || null,
            rootBlock: component.rootBlock || null,
            hierarchy: Array.isArray(component.hierarchy) ? component.hierarchy : [],
            layer: component.layer || null,
            transform: component.sourceTransform,
            bbox: component.bbox || null,
        }));
}

function createRuntimeMetadata({
    connectionPlan,
    componentMetadata,
    profileOccurrences,
    standalonePlanById,
}) {
    const roleOccurrences = createRoleOccurrences(profileOccurrences, standalonePlanById);
    assertRequiredStructuralOccurrence(connectionPlan, roleOccurrences);

    return {
        schemaVersion: 2,
        id: connectionPlan.id,
        kind: 'cad-connection-template',
        boundary: connectionPlan.boundary,
        leftCell: connectionPlan.leftCell,
        rightCell: connectionPlan.rightCell,
        mirrorAllowed: connectionPlan.mirrorAllowed,
        orientation: connectionPlan.orientation,
        source: {
            path: connectionPlan.source,
            sha256: sha256File(connectionPlan.sourcePath),
        },
        extraction: {
            method: 'exact-insert-transform-matching',
            converter: relativeProjectPath(CONVERTER),
            modelSpacePolicy: 'prefer-inserts',
            geometrySource: componentMetadata.geometrySource || null,
            namedInsertInventory: createNamedInsertInventory(componentMetadata),
            note: 'Rotation/mirroring is derived from CAD INSERT transforms. Bounding boxes are used only to validate a transform match, never to choose the rotation.',
        },
        bounds: getConnectionBounds(componentMetadata),
        profileOccurrences,
        roleOccurrences,
        generatedAt: new Date().toISOString(),
    };
}

function loadStandaloneRuntimeInputs(options = {}) {
    const { manifest } = loadStandaloneManifest(
        options['standalone-manifest'] || DEFAULT_STANDALONE_MANIFEST
    );
    const plans = createStandalonePlans(manifest, {});
    const planById = new Map(plans.map(plan => [plan.profileId, plan]));
    const metadataById = new Map();

    for (const plan of plans) {
        if (!fs.existsSync(plan.metadataPath)) continue;
        const metadata = readJson(plan.metadataPath);
        const components = metadata?.geometry?.components || [];
        if (!components.length) continue;
        const missingTransforms = components.filter(component => !component.sourceTransform);
        if (missingTransforms.length) {
            throw new Error(
                `Standalone profile ${plan.profileId} was converted before CAD source transforms were recorded. `
                + `Re-run standalone conversion with --force before converting joins.`
            );
        }
        metadataById.set(plan.profileId, metadata);
    }

    const structuralPlans = plans.filter(plan => STRUCTURAL_ROLES.has(plan.role));
    for (const plan of structuralPlans) {
        if (!metadataById.has(plan.profileId)) {
            throw new Error(
                `Missing current standalone metadata for ${plan.profileId}. `
                + 'Run npm run cad:standalone:convert -- --force first.'
            );
        }
    }

    return { plans, planById, metadataById };
}

function convertConnectionToComponents(connectionPlan, temporaryDir) {
    const compositeSvgPath = path.join(temporaryDir, 'connection.svg');
    const componentsDir = path.join(temporaryDir, 'components');
    const componentsJsonPath = path.join(temporaryDir, 'components.json');
    const result = spawnSync(
        process.execPath,
        [
            CONVERTER,
            connectionPlan.sourcePath,
            compositeSvgPath,
            '--components-dir', componentsDir,
            '--components-json', componentsJsonPath,
            '--model-space-policy', 'prefer-inserts',
        ],
        {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    if (result.status !== 0) {
        const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        throw new Error(
            `Connection conversion failed for ${connectionPlan.id}.\n`
            + `${details || 'The CAD converter did not provide additional details.'}`
        );
    }
    if (!fs.existsSync(componentsJsonPath)) {
        throw new Error(`Connection component metadata was not generated for ${connectionPlan.id}.`);
    }
    return readJson(componentsJsonPath);
}

function fitAllProfiles(componentMetadata, standaloneInputs) {
    const profileOccurrences = {};
    for (const plan of standaloneInputs.plans) {
        // All three selectable bead lengths currently use 573940 as their CAD
        // placement reference.  Their generated sources intentionally share
        // component names, so attempting to independently fit 573920/573930
        // into a join creates duplicate/ambiguous role occurrences.  Record
        // only the canonical 573940 connection anchor and let runtime thickness
        // switching reuse that verified seat.
        if (plan.role === 'glazing-bead' && plan.profileId !== '573940') {
            continue;
        }
        const standaloneMetadata = standaloneInputs.metadataById.get(plan.profileId);
        if (!standaloneMetadata) continue;
        const occurrences = fitProfileOccurrences({
            profileId: plan.profileId,
            standaloneComponents: standaloneMetadata.geometry.components,
            connectionComponents: componentMetadata.components,
            // Structural profiles still require the stronger multi-component
            // transform match. Accessories may legitimately expose only the
            // explicitly named profile INSERT in a join DWG (for example the
            // 573940 bead without its 244511 retaining child), so accept one
            // exact profile-named component for accessory placement metadata.
            allowSingleExplicitProfileMatch: !STRUCTURAL_ROLES.has(plan.role),
            // The three glazing-bead variants share the 244511_s_2 retaining
            // insert at the same local anchor. Some join DWGs expose that
            // shared child without a separate 573940_s geometry component.
            // A single exact INSERT-name + bbox match is therefore enough to
            // recover the bead-family transform from the join CAD.
            allowSingleComponentMatch:
                plan.role === 'glazing-bead' && plan.profileId === '573940',
            // Prefer the actual 573940_s INSERT whenever it exists.  The
            // shared 244511 child is strictly a fallback for joins that omit
            // the parent bead geometry.
            preferExplicitProfileMatch:
                plan.role === 'glazing-bead' && plan.profileId === '573940',
        });
        if (occurrences.length) {
            profileOccurrences[plan.profileId] = occurrences;
        }
    }

    // Some legacy accessories still have no standalone CAD source.  Do not
    // infer their fixed-glazing position from a B2 sash assembly: record the
    // explicitly named INSERT from the join itself so runtime can bridge its
    // join-model-space centre through the structural frame/mullion transform.
    const directOccurrences = createDirectNamedAccessoryOccurrences(componentMetadata);
    for (const [profileId, occurrences] of Object.entries(directOccurrences)) {
        if (!profileOccurrences[profileId]?.length && occurrences.length) {
            profileOccurrences[profileId] = occurrences;
        }
    }

    return profileOccurrences;
}

function convertOne(connectionPlan, standaloneInputs, options = {}) {
    const outputRoot = path.resolve(options['output-root'] || DEFAULT_OUTPUT_ROOT);
    const outputDir = path.join(outputRoot, connectionPlan.id);
    const metadataPath = path.join(outputDir, 'connection.meta.json');
    const dryRun = Boolean(options['dry-run']);
    const force = Boolean(options.force);

    console.log(`\n${connectionPlan.id}`);
    console.log(`  Source: ${connectionPlan.source}`);
    console.log(`  Output: ${relativeProjectPath(metadataPath)}`);

    if (dryRun) return { status: 'planned', metadataPath };
    if (fs.existsSync(metadataPath) && !force) {
        throw new Error(
            `Generated connection metadata already exists: ${relativeProjectPath(metadataPath)}. `
            + 'Run again with --force to replace it.'
        );
    }

    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), `window-join-${connectionPlan.id}-`));
    try {
        const componentMetadata = convertConnectionToComponents(connectionPlan, temporaryDir);
        const profileOccurrences = fitAllProfiles(componentMetadata, standaloneInputs);
        const runtimeMetadata = createRuntimeMetadata({
            connectionPlan,
            componentMetadata,
            profileOccurrences,
            standalonePlanById: standaloneInputs.planById,
        });
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(metadataPath, `${JSON.stringify(runtimeMetadata, null, 2)}\n`, 'utf8');

        const detected = Object.entries(profileOccurrences)
            .map(([profileId, occurrences]) => `${profileId}×${occurrences.length}`)
            .join(', ');
        console.log(`  Matched profiles: ${detected || '(none)'}`);
        console.log(`  Saved: ${relativeProjectPath(metadataPath)}`);
        return { status: 'converted', metadataPath, runtimeMetadata };
    } finally {
        fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
}

function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(
            'Usage: node cad/tools/convert_connection_assemblies.js '
            + '[--manifest <json>] [--standalone-manifest <json>] [--only <ids>] '
            + '[--output-root <directory>] [--dry-run] [--force]'
        );
        return [];
    }

    const { manifest } = loadConnectionManifest(options.manifest || DEFAULT_CONNECTION_MANIFEST);
    const plans = createConnectionPlans(manifest, { only: options.only });
    console.log(`${options['dry-run'] ? 'Planning' : 'Converting'} ${plans.length} connection assembly/assemblies.`);

    if (options['dry-run']) {
        return plans.map(plan => convertOne(plan, { plans: [], metadataById: new Map(), planById: new Map() }, options));
    }

    const standaloneInputs = loadStandaloneRuntimeInputs(options);
    const results = plans.map(plan => convertOne(plan, standaloneInputs, options));
    console.log('\nConnection assembly conversion completed successfully.');
    return results;
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(`\nError: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_OUTPUT_ROOT,
    createRoleOccurrences,
    createRuntimeMetadata,
    fitAllProfiles,
    loadStandaloneRuntimeInputs,
    parseArgs,
    runCli,
};
