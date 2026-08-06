const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CAD_DIR = path.join(PROJECT_ROOT, 'cad');
const SOURCE_DIR = path.join(CAD_DIR, 'source');
const DEFAULT_MANIFEST = path.join(CAD_DIR, 'manifests', 'standalone-profiles.json');
const DEFAULT_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'src', 'client', 'svg', 'standalone');
const SINGLE_PROFILE_CONVERTER = path.join(CAD_DIR, 'tools', 'test_convert.js');

const ROLE_DEFINITIONS = Object.freeze({
    'outer-frame': {
        kind: 'base-profile',
        outputFolder: 'profiles/outer-frames',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'opening-sash': {
        kind: 'base-profile',
        outputFolder: 'profiles/opening-sashes',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'mullion-transom': {
        kind: 'base-profile',
        outputFolder: 'profiles/mullions-transoms',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'double-vent-sash': {
        kind: 'base-profile',
        outputFolder: 'profiles/double-vent-sashes',
        defaultAllowedSides: ['left', 'right']
    },
    'glazing-bead': {
        kind: 'accessory',
        outputFolder: 'accessories/glazing-beads',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    gasket: {
        kind: 'accessory',
        outputFolder: 'accessories/gaskets',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'locking-bar': {
        kind: 'accessory',
        outputFolder: 'accessories/locking-bars',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'insulation-profile': {
        kind: 'accessory',
        outputFolder: 'accessories/insulation-profiles',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'glazing-rebate-insulation': {
        kind: 'accessory',
        outputFolder: 'accessories/glazing-rebate-insulation',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'glazing-bridge': {
        kind: 'accessory',
        outputFolder: 'accessories/glazing-bridges',
        defaultAllowedSides: ['bottom']
    },
    'joint-sealing-piece': {
        kind: 'accessory',
        outputFolder: 'accessories/joint-sealing-pieces',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    },
    'double-vent-end-cap': {
        kind: 'accessory',
        outputFolder: 'accessories/double-vent-end-caps',
        defaultAllowedSides: ['top', 'bottom']
    },
    'drainage-cap': {
        kind: 'accessory',
        outputFolder: 'accessories/drainage-caps',
        defaultAllowedSides: ['bottom']
    },
    'other-accessory': {
        kind: 'accessory',
        outputFolder: 'accessories/other',
        defaultAllowedSides: ['top', 'right', 'bottom', 'left']
    }
});

function printUsage() {
    console.log(`Standalone profile converter\n\n` +
        `Convert one profile:\n` +
        `  node cad/tools/convert_standalone_profile.js --source <file.dwg|file.dxf|file.svg> --profile-id <id> --role <role> [options]\n\n` +
        `Convert a manifest:\n` +
        `  node cad/tools/convert_standalone_profile.js --manifest cad/manifests/standalone-profiles.json [--only 575760,575780] [options]\n\n` +
        `Useful options:\n` +
        `  --dry-run                  Validate and print the conversion plan only\n` +
        `  --force                    Overwrite profile.svg/profile.meta.json only\n` +
        `  --output <directory>       Override one-profile output directory\n` +
        `  --output-root <directory>  Override manifest output root\n` +
        `  --canonical-side <side>    top|right|bottom|left\n` +
        `  --allowed-sides <csv>      e.g. top,right,bottom,left\n` +
        `  --rotations <csv>          e.g. 0,90,180,270\n` +
        `  --mirror-x <true|false>\n` +
        `  --mirror-y <true|false>\n` +
        `  --help\n\n` +
        `Roles:\n  ${Object.keys(ROLE_DEFINITIONS).join('\n  ')}\n`);
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            throw new Error(`Unexpected argument: ${token}`);
        }
        const key = token.slice(2);
        if (['dry-run', 'force', 'help'].includes(key)) {
            result[key] = true;
            continue;
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for --${key}`);
        }
        result[key] = value;
        index += 1;
    }
    return result;
}

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`Invalid boolean value: ${value}`);
}

function parseCsv(value, fallback = []) {
    if (value === undefined || value === null || value === '') return [...fallback];
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.map(item => String(item).trim()).filter(Boolean);
}

function parseRotations(value, fallback = [0, 90, 180, 270]) {
    const rotations = parseCsv(value, fallback).map(item => Number(item));
    for (const rotation of rotations) {
        if (!Number.isFinite(rotation) || rotation % 90 !== 0) {
            throw new Error(`Invalid rotation "${rotation}". Rotations must be multiples of 90 degrees.`);
        }
    }
    return [...new Set(rotations.map(rotation => ((rotation % 360) + 360) % 360))];
}

function resolveExistingPath(inputPath, baseDir = SOURCE_DIR) {
    if (!inputPath) throw new Error('A source path is required.');
    const candidates = path.isAbsolute(inputPath)
        ? [path.normalize(inputPath)]
        : [
            path.resolve(baseDir, inputPath),
            path.resolve(PROJECT_ROOT, inputPath),
            path.resolve(process.cwd(), inputPath)
        ];
    const resolved = candidates.find(candidate => fs.existsSync(candidate));
    if (!resolved) {
        throw new Error(`Source file not found: ${inputPath}`);
    }
    return resolved;
}

function resolveOutputPath(inputPath, fallback) {
    if (!inputPath) return fallback;
    return path.isAbsolute(inputPath)
        ? path.normalize(inputPath)
        : path.resolve(PROJECT_ROOT, inputPath);
}

function sanitizeProfileId(value) {
    const profileId = String(value || '').replace(/\s+/g, '').trim();
    if (!profileId || !/^[A-Za-z0-9_-]+$/.test(profileId)) {
        throw new Error(`Invalid profile ID: ${value}`);
    }
    return profileId;
}

function validateRole(role) {
    if (!ROLE_DEFINITIONS[role]) {
        throw new Error(`Unknown role "${role}". Use one of: ${Object.keys(ROLE_DEFINITIONS).join(', ')}`);
    }
    return role;
}

function normalizeSide(value, fallback = 'top') {
    const side = String(value || fallback).trim().toLowerCase();
    if (!['top', 'right', 'bottom', 'left'].includes(side)) {
        throw new Error(`Invalid side "${value}". Use top, right, bottom, or left.`);
    }
    return side;
}

function normalizeAllowedSides(value, fallback) {
    const sides = parseCsv(value, fallback).map(side => normalizeSide(side));
    return [...new Set(sides)];
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function pathForMetadata(filePath) {
    const relative = path.relative(PROJECT_ROOT, filePath);
    return relative.startsWith('..') ? filePath.replace(/\\/g, '/') : relative.replace(/\\/g, '/');
}

function parseSvgSummary(svgText) {
    const svgTag = svgText.match(/<svg\b[^>]*>/i)?.[0] || '';
    const viewBoxMatch = svgTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
    if (!viewBoxMatch) {
        throw new Error('Converted SVG does not contain a viewBox.');
    }
    const viewBox = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
        throw new Error(`Converted SVG has an invalid viewBox: ${viewBoxMatch[1]}`);
    }

    const pathTags = svgText.match(/<path\b[^>]*>/gi) || [];
    let filledPathCount = 0;
    let openPathCount = 0;

    for (const tag of pathTags) {
        const fillMatch = tag.match(/\bfill\s*=\s*["']([^"']+)["']/i);
        const fill = (fillMatch?.[1] || 'black').trim().toLowerCase();
        const opacityMatch = tag.match(/\b(?:fill-opacity|opacity)\s*=\s*["']([^"']+)["']/i);
        const opacity = opacityMatch ? Number(opacityMatch[1]) : 1;
        const visibleFill = fill !== 'none' && fill !== 'transparent' && Number.isFinite(opacity) && opacity > 0;
        if (visibleFill) filledPathCount += 1;
        else openPathCount += 1;
    }

    if (filledPathCount === 0) {
        throw new Error('Converted SVG does not contain any visible filled profile path.');
    }

    return {
        viewBox,
        pathCount: pathTags.length,
        filledPathCount,
        openPathCount
    };
}

function addRootSvgMetadata(svgText, profileId, role) {
    return svgText.replace(/<svg\b/i, `<svg data-profile-id="${profileId}" data-profile-role="${role}"`);
}

function createProfilePlan(rawEntry, options = {}) {
    const profileId = sanitizeProfileId(rawEntry.id || rawEntry.profileId || options['profile-id']);
    const role = validateRole(rawEntry.role || options.role);
    const roleDefinition = ROLE_DEFINITIONS[role];
    const sourceValue = rawEntry.source || options.source;
    const sourcePath = resolveExistingPath(sourceValue, SOURCE_DIR);
    const sourceExtension = path.extname(sourcePath).toLowerCase();
    if (!['.dwg', '.dxf', '.svg'].includes(sourceExtension)) {
        throw new Error(`Unsupported source format for ${profileId}: ${sourceExtension}`);
    }

    const outputRoot = resolveOutputPath(options['output-root'], DEFAULT_OUTPUT_ROOT);
    const defaultOutputDir = path.join(outputRoot, roleDefinition.outputFolder, profileId);
    const outputDir = resolveOutputPath(rawEntry.output || options.output, defaultOutputDir);

    const canonicalOrientation = rawEntry.canonicalOrientation || {};
    const allowedTransforms = rawEntry.allowedTransforms || {};

    const canonicalSide = normalizeSide(
        options['canonical-side'] || canonicalOrientation.side,
        'top'
    );
    const allowedSides = normalizeAllowedSides(
        options['allowed-sides'] || rawEntry.allowedSides,
        roleDefinition.defaultAllowedSides
    );
    const rotations = parseRotations(
        options.rotations || allowedTransforms.rotations,
        [0, 90, 180, 270]
    );
    const mirrorX = parseBoolean(
        options['mirror-x'] ?? allowedTransforms.mirrorX,
        false
    );
    const mirrorY = parseBoolean(
        options['mirror-y'] ?? allowedTransforms.mirrorY,
        false
    );

    return {
        profileId,
        role,
        kind: roleDefinition.kind,
        sourcePath,
        sourceExtension,
        outputDir,
        svgPath: path.join(outputDir, 'profile.svg'),
        metadataPath: path.join(outputDir, 'profile.meta.json'),
        label: rawEntry.label || profileId,
        description: rawEntry.description || '',
        units: rawEntry.units || 'mm',
        canonicalOrientation: {
            side: canonicalSide,
            exteriorDirection: canonicalOrientation.exteriorDirection || 'unspecified',
            cavityDirection: canonicalOrientation.cavityDirection || 'unspecified'
        },
        allowedSides,
        allowedTransforms: {
            rotations,
            mirrorX,
            mirrorY
        },
        accessoryType: rawEntry.accessoryType || null,
        notes: rawEntry.notes || null
    };
}

function printPlan(plan) {
    console.log(`\n${plan.profileId} (${plan.role})`);
    console.log(`  Source: ${pathForMetadata(plan.sourcePath)}`);
    console.log(`  Output: ${pathForMetadata(plan.outputDir)}`);
    console.log(`  Canonical side: ${plan.canonicalOrientation.side}`);
    console.log(`  Allowed sides: ${plan.allowedSides.join(', ')}`);
    console.log(`  Rotations: ${plan.allowedTransforms.rotations.join(', ')}`);
    console.log(`  Mirroring: X=${plan.allowedTransforms.mirrorX}, Y=${plan.allowedTransforms.mirrorY}`);
}

function ensureOutputCanBeWritten(plan, force) {
    const conflicts = [plan.svgPath, plan.metadataPath].filter(filePath => fs.existsSync(filePath));
    if (conflicts.length > 0 && !force) {
        throw new Error(
            `Output already exists for ${plan.profileId}:\n` +
            conflicts.map(filePath => `  ${pathForMetadata(filePath)}`).join('\n') +
            `\nRun again with --force to overwrite only these generated files.`
        );
    }
}

function convertSourceToSvg(plan, temporarySvgPath) {
    if (plan.sourceExtension === '.svg') {
        fs.copyFileSync(plan.sourcePath, temporarySvgPath);
        return;
    }

    const result = spawnSync(
        process.execPath,
        [SINGLE_PROFILE_CONVERTER, plan.sourcePath, temporarySvgPath],
        {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );

    if (result.status !== 0) {
        const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        throw new Error(
            `Geometry conversion failed for ${plan.profileId}.\n` +
            `${details || 'The converter did not provide additional details.'}`
        );
    }
}

function createMetadata(plan, svgSummary) {
    return {
        schemaVersion: 1,
        id: plan.profileId,
        type: plan.kind,
        role: plan.role,
        label: plan.label,
        description: plan.description,
        accessoryType: plan.accessoryType,
        source: {
            path: pathForMetadata(plan.sourcePath),
            format: plan.sourceExtension.slice(1),
            sha256: sha256File(plan.sourcePath),
            originalPreserved: true
        },
        geometry: {
            svg: 'profile.svg',
            units: plan.units,
            viewBox: svgSummary.viewBox,
            filledPathCount: svgSummary.filledPathCount,
            openPathCount: svgSummary.openPathCount,
            canonicalOrientation: plan.canonicalOrientation,
            allowedTransforms: plan.allowedTransforms
        },
        placement: {
            allowedSides: plan.allowedSides
        },
        conversion: {
            mode: 'standalone-profile',
            converter: pathForMetadata(SINGLE_PROFILE_CONVERTER),
            generatedAt: new Date().toISOString()
        },
        catalogRegistration: {
            status: 'not-registered',
            note: 'Review the generated SVG and metadata before adding this profile to src/client/js/profile-catalog.js.'
        },
        notes: plan.notes
    };
}

function convertOne(plan, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const force = Boolean(options.force);
    printPlan(plan);

    if (dryRun) {
        return { status: 'planned', plan };
    }

    ensureOutputCanBeWritten(plan, force);
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), `window-profile-${plan.profileId}-`));
    const temporarySvgPath = path.join(temporaryDir, 'profile.svg');

    try {
        convertSourceToSvg(plan, temporarySvgPath);
        const rawSvg = fs.readFileSync(temporarySvgPath, 'utf8');
        const svgSummary = parseSvgSummary(rawSvg);
        const svgWithMetadata = addRootSvgMetadata(rawSvg, plan.profileId, plan.role);
        const metadata = createMetadata(plan, svgSummary);

        fs.mkdirSync(plan.outputDir, { recursive: true });
        fs.writeFileSync(plan.svgPath, svgWithMetadata, 'utf8');
        fs.writeFileSync(plan.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

        console.log(`  Saved SVG: ${pathForMetadata(plan.svgPath)}`);
        console.log(`  Saved metadata: ${pathForMetadata(plan.metadataPath)}`);
        return { status: 'converted', plan, metadata };
    } finally {
        fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
}

function loadManifest(manifestPath) {
    const resolvedManifestPath = resolveExistingPath(manifestPath || DEFAULT_MANIFEST, PROJECT_ROOT);
    const manifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1) {
        throw new Error(`Unsupported manifest schema version in ${pathForMetadata(resolvedManifestPath)}.`);
    }
    if (!Array.isArray(manifest.profiles) || manifest.profiles.length === 0) {
        throw new Error(`Manifest contains no profiles: ${pathForMetadata(resolvedManifestPath)}`);
    }
    return { manifest, manifestPath: resolvedManifestPath };
}

function createPlansFromManifest(manifest, options = {}) {
    const only = new Set(parseCsv(options.only));
    const entries = only.size > 0
        ? manifest.profiles.filter(entry => only.has(String(entry.id)))
        : manifest.profiles;

    if (only.size > 0) {
        const found = new Set(entries.map(entry => String(entry.id)));
        const missing = [...only].filter(id => !found.has(id));
        if (missing.length > 0) {
            throw new Error(`Profiles not found in manifest: ${missing.join(', ')}`);
        }
    }

    const ids = new Set();
    return entries.map(entry => {
        const plan = createProfilePlan(entry, {
            'output-root': options['output-root']
        });
        if (ids.has(plan.profileId)) {
            throw new Error(`Duplicate profile ID in manifest: ${plan.profileId}`);
        }
        ids.add(plan.profileId);
        return plan;
    });
}

function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        printUsage();
        return 0;
    }

    const dryRun = Boolean(options['dry-run']);
    const force = Boolean(options.force);

    let plans;
    if (options.manifest) {
        const { manifest, manifestPath } = loadManifest(options.manifest);
        console.log(`Manifest: ${pathForMetadata(manifestPath)}`);
        plans = createPlansFromManifest(manifest, options);
    } else {
        if (!options.source || !options['profile-id'] || !options.role) {
            printUsage();
            throw new Error('Provide --source, --profile-id, and --role, or use --manifest.');
        }
        plans = [createProfilePlan({}, options)];
    }

    console.log(`${dryRun ? 'Planning' : 'Converting'} ${plans.length} standalone profile(s).`);
    const results = [];
    for (const plan of plans) {
        results.push(convertOne(plan, { dryRun, force }));
    }

    console.log(`\nStandalone profile conversion ${dryRun ? 'plan' : 'run'} completed successfully.`);
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
    DEFAULT_MANIFEST,
    DEFAULT_OUTPUT_ROOT,
    ROLE_DEFINITIONS,
    addRootSvgMetadata,
    createMetadata,
    createPlansFromManifest,
    createProfilePlan,
    convertOne,
    loadManifest,
    parseArgs,
    parseSvgSummary,
    runCli
};
