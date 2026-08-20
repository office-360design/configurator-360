const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CAD_DIR = path.join(PROJECT_ROOT, 'cad');
const SOURCE_DIR = path.join(CAD_DIR, 'source');
const DEFAULT_MANIFEST = path.join(CAD_DIR, 'manifests', 'connection-assemblies.json');
const CELL_TYPES = new Set(['outside', 'fixed-glazing', 'opening-sash']);
const BOUNDARY_TYPES = new Set(['outer-frame', 'mullion-transom']);

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
        const key = token.slice(2);
        if (key === 'json' || key === 'help') {
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

function resolveProjectPath(inputPath, baseDir = PROJECT_ROOT) {
    const candidate = path.isAbsolute(inputPath)
        ? path.normalize(inputPath)
        : path.resolve(baseDir, inputPath);
    if (!fs.existsSync(candidate)) throw new Error(`File not found: ${inputPath}`);
    return candidate;
}

function relativeProjectPath(filePath) {
    return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function loadManifest(manifestPath = DEFAULT_MANIFEST) {
    const resolved = resolveProjectPath(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (manifest.schemaVersion !== 1) {
        throw new Error(`Unsupported connection manifest schema: ${manifest.schemaVersion}`);
    }
    if (!Array.isArray(manifest.assemblies) || manifest.assemblies.length === 0) {
        throw new Error('Connection manifest contains no assemblies.');
    }
    return { manifest, manifestPath: resolved };
}

function createPlan(entry) {
    const id = String(entry.id || '').trim();
    if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid connection ID: ${entry.id}`);
    if (!BOUNDARY_TYPES.has(entry.boundary)) {
        throw new Error(`Invalid boundary for ${id}: ${entry.boundary}`);
    }
    if (!CELL_TYPES.has(entry.leftCell) || !CELL_TYPES.has(entry.rightCell)) {
        throw new Error(`Invalid left/right cells for ${id}.`);
    }
    if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
        throw new Error(`Connection ${id} must list its physical roles.`);
    }

    const sourcePath = resolveProjectPath(entry.source, SOURCE_DIR);
    const relativeSource = relativeProjectPath(sourcePath);
    if (!relativeSource.startsWith('cad/source/join/')) {
        throw new Error(`Connection ${id} must use cad/source/join: ${relativeSource}`);
    }
    if (relativeSource.includes('double_vent_profile')) {
        throw new Error(`Connection ${id} must not use a double-vent source.`);
    }

    return Object.freeze({
        id,
        sourcePath,
        source: relativeSource,
        boundary: entry.boundary,
        leftCell: entry.leftCell,
        rightCell: entry.rightCell,
        roles: Object.freeze([...entry.roles]),
        mirrorAllowed: entry.mirrorAllowed === true,
        orientation: 'left-right-section',
    });
}

function createPlansFromManifest(manifest, options = {}) {
    const only = new Set(String(options.only || '').split(',').map(value => value.trim()).filter(Boolean));
    const entries = only.size
        ? manifest.assemblies.filter(entry => only.has(String(entry.id)))
        : manifest.assemblies;
    if (only.size) {
        const found = new Set(entries.map(entry => String(entry.id)));
        const missing = [...only].filter(id => !found.has(id));
        if (missing.length) throw new Error(`Connections not found in manifest: ${missing.join(', ')}`);
    }

    const ids = new Set();
    return entries.map(entry => {
        const plan = createPlan(entry);
        if (ids.has(plan.id)) throw new Error(`Duplicate connection ID: ${plan.id}`);
        ids.add(plan.id);
        return plan;
    });
}

function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log('Usage: node cad/tools/connection_assembly_manifest.js [--manifest <json>] [--only <ids>] [--json]');
        return 0;
    }
    const { manifest, manifestPath } = loadManifest(options.manifest || DEFAULT_MANIFEST);
    const plans = createPlansFromManifest(manifest, options);
    if (options.json) {
        console.log(JSON.stringify(plans, null, 2));
        return plans;
    }

    console.log(`Connection manifest: ${relativeProjectPath(manifestPath)}`);
    console.log(`Validated ${plans.length} left/right connection reference(s).`);
    for (const plan of plans) {
        console.log(`- ${plan.id}: ${plan.leftCell} | ${plan.boundary} | ${plan.rightCell}`);
        console.log(`  ${plan.source}`);
        console.log(`  mirroring: ${plan.mirrorAllowed ? 'allowed by manifest' : 'not allowed'}`);
    }
    return plans;
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_MANIFEST,
    loadManifest,
    createPlan,
    createPlansFromManifest,
    runCli,
};
