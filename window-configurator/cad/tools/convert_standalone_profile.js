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
const PROFILE_MARGIN_MM = 5;
const MODEL_SPACE_POLICIES = new Set(['all', 'prefer-inserts', 'inserts-only', 'direct-only']);

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
        defaultAllowedSides: ['top', 'right', 'bottom', 'left'],
        defaultComponentSelection: {
            mode: 'main-cluster',
            maxGapMm: 25,
            keepExcludedForReview: true
        }
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
        `  --force                    Overwrite generated profile files and generated part folders\n` +
        `  --output <directory>       Override one-profile output directory\n` +
        `  --output-root <directory>  Override manifest output root\n` +
        `  --canonical-side <side>    top|right|bottom|left\n` +
        `  --allowed-sides <csv>      e.g. top,right,bottom,left\n` +
        `  --rotations <csv>          e.g. 0,90,180,270\n` +
        `  --mirror-x <true|false>\n` +
        `  --mirror-y <true|false>\n` +
        `  --component-mode <mode>    all|main-cluster\n` +
        `  --component-gap <mm>       Maximum gap used to join parts into one cluster\n` +
        `  --anchor-blocks <csv>      Block names used to select the primary component cluster\n` +
        `  --keep-excluded <bool>     Keep filtered parts in excluded/ for review\n` +
        `  --model-space-policy <mode> all|prefer-inserts|inserts-only|direct-only\n` +
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
    if (!resolved) throw new Error(`Source file not found: ${inputPath}`);
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

function normalizeModelSpacePolicy(value = 'prefer-inserts') {
    const normalized = String(value || 'prefer-inserts').trim().toLowerCase();
    if (!MODEL_SPACE_POLICIES.has(normalized)) {
        throw new Error(`Invalid model-space policy "${value}". Use all, prefer-inserts, inserts-only, or direct-only.`);
    }
    return normalized;
}

function normalizeComponentSelection(value, roleDefinition, options = {}) {
    const defaults = roleDefinition.defaultComponentSelection || {
        mode: 'all',
        maxGapMm: 25,
        keepExcludedForReview: true
    };
    const raw = value || {};
    const mode = String(options['component-mode'] || raw.mode || defaults.mode || 'all').trim();
    if (!['all', 'main-cluster'].includes(mode)) {
        throw new Error(`Invalid component selection mode "${mode}". Use all or main-cluster.`);
    }

    const maxGapMm = Number(options['component-gap'] ?? raw.maxGapMm ?? defaults.maxGapMm ?? 25);
    if (!Number.isFinite(maxGapMm) || maxGapMm < 0) {
        throw new Error(`Invalid component gap: ${maxGapMm}`);
    }

    return {
        mode,
        maxGapMm,
        anchorBlockNames: parseCsv(options['anchor-blocks'] || raw.anchorBlockNames, []),
        keepExcludedForReview: parseBoolean(
            options['keep-excluded'] ?? raw.keepExcludedForReview,
            defaults.keepExcludedForReview !== false
        )
    };
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
    if (!viewBoxMatch) throw new Error('Converted SVG does not contain a viewBox.');
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
    return { viewBox, pathCount: pathTags.length, filledPathCount, openPathCount };
}

function addRootSvgMetadata(svgText, profileId, role, extraAttributes = {}) {
    const attributes = {
        'data-profile-id': profileId,
        'data-profile-role': role,
        ...extraAttributes
    };
    const serialized = Object.entries(attributes)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
        .join(' ');
    return svgText.replace(/<svg\b/i, `<svg ${serialized}`);
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
    const geometrySource = rawEntry.geometrySource || {};

    return {
        profileId,
        role,
        kind: roleDefinition.kind,
        sourcePath,
        sourceExtension,
        outputDir,
        svgPath: path.join(outputDir, 'profile.svg'),
        metadataPath: path.join(outputDir, 'profile.meta.json'),
        partsDir: path.join(outputDir, 'parts'),
        excludedDir: path.join(outputDir, 'excluded'),
        label: rawEntry.label || profileId,
        description: rawEntry.description || '',
        units: rawEntry.units || 'mm',
        canonicalOrientation: {
            side: normalizeSide(options['canonical-side'] || canonicalOrientation.side, 'top'),
            exteriorDirection: canonicalOrientation.exteriorDirection || 'unspecified',
            cavityDirection: canonicalOrientation.cavityDirection || 'unspecified'
        },
        allowedSides: normalizeAllowedSides(
            options['allowed-sides'] || rawEntry.allowedSides,
            roleDefinition.defaultAllowedSides
        ),
        allowedTransforms: {
            rotations: parseRotations(options.rotations || allowedTransforms.rotations, [0, 90, 180, 270]),
            mirrorX: parseBoolean(options['mirror-x'] ?? allowedTransforms.mirrorX, false),
            mirrorY: parseBoolean(options['mirror-y'] ?? allowedTransforms.mirrorY, false)
        },
        geometrySource: {
            modelSpacePolicy: normalizeModelSpacePolicy(
                options['model-space-policy'] || geometrySource.modelSpacePolicy || 'prefer-inserts'
            )
        },
        componentSelection: normalizeComponentSelection(rawEntry.componentSelection, roleDefinition, options),
        accessoryType: rawEntry.accessoryType || null,
        catalogRegistration: rawEntry.catalogRegistration || null,
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
    console.log(`  Geometry source: ${plan.geometrySource.modelSpacePolicy}`);
    console.log(`  Component selection: ${plan.componentSelection.mode}` +
        (plan.componentSelection.mode === 'main-cluster' ? ` (gap ${plan.componentSelection.maxGapMm} mm)` : ''));
}

function ensureOutputCanBeWritten(plan, force) {
    const conflicts = [plan.svgPath, plan.metadataPath, plan.partsDir, plan.excludedDir]
        .filter(filePath => fs.existsSync(filePath));
    if (conflicts.length > 0 && !force) {
        throw new Error(
            `Output already exists for ${plan.profileId}:\n` +
            conflicts.map(filePath => `  ${pathForMetadata(filePath)}`).join('\n') +
            `\nRun again with --force to replace only generated profile files and generated part folders.`
        );
    }
}

function clearGeneratedOutput(plan) {
    for (const filePath of [plan.svgPath, plan.metadataPath]) {
        if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    }
    for (const directory of [plan.partsDir, plan.excludedDir]) {
        if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    }
}

function createSingleSvgComponentBundle(plan, temporaryDir) {
    const compositeSvgPath = path.join(temporaryDir, 'profile.svg');
    fs.copyFileSync(plan.sourcePath, compositeSvgPath);
    const svgText = fs.readFileSync(compositeSvgPath, 'utf8');
    const summary = parseSvgSummary(svgText);
    const componentsDir = path.join(temporaryDir, 'components');
    fs.mkdirSync(componentsDir, { recursive: true });
    const filename = `000-${plan.profileId}.svg`;
    fs.copyFileSync(compositeSvgPath, path.join(componentsDir, filename));
    const [minX, minY, width, height] = summary.viewBox;
    return {
        compositeSvgPath,
        componentsDir,
        componentMetadata: {
            schemaVersion: 1,
            viewBox: summary.viewBox,
            geometrySource: {
                modelSpacePolicy: 'source-svg',
                usedInsertGeometry: false,
                usedDirectModelSpaceGeometry: true,
                ignoredDirectModelSpaceGeometry: false,
                filteredPathCount: 0
            },
            components: [{
                index: 0,
                id: `${plan.profileId}-0`,
                filename,
                blockName: plan.profileId,
                parentBlock: null,
                rootBlock: plan.profileId,
                hierarchy: [plan.profileId],
                layer: '0',
                bbox: {
                    minX,
                    minY: -(minY + height),
                    maxX: minX + width,
                    maxY: -minY
                },
                area: width * height,
                closedContours: summary.filledPathCount,
                openContours: summary.openPathCount
            }]
        }
    };
}

function convertSourceToComponentBundle(plan, temporaryDir) {
    if (plan.sourceExtension === '.svg') {
        return createSingleSvgComponentBundle(plan, temporaryDir);
    }

    const compositeSvgPath = path.join(temporaryDir, 'profile.svg');
    const componentsDir = path.join(temporaryDir, 'components');
    const componentsJsonPath = path.join(temporaryDir, 'components.json');
    const result = spawnSync(
        process.execPath,
        [
            SINGLE_PROFILE_CONVERTER,
            plan.sourcePath,
            compositeSvgPath,
            '--components-dir', componentsDir,
            '--components-json', componentsJsonPath,
            '--model-space-policy', plan.geometrySource.modelSpacePolicy
        ],
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
    if (!fs.existsSync(componentsJsonPath)) {
        throw new Error(`Split component metadata was not generated for ${plan.profileId}.`);
    }

    return {
        compositeSvgPath,
        componentsDir,
        componentMetadata: JSON.parse(fs.readFileSync(componentsJsonPath, 'utf8'))
    };
}

function bboxDistance(boxA, boxB) {
    const distX = Math.max(0, boxA.minX - boxB.maxX, boxB.minX - boxA.maxX);
    const distY = Math.max(0, boxA.minY - boxB.maxY, boxB.minY - boxA.maxY);
    return Math.hypot(distX, distY);
}

function buildComponentClusters(components, maxGapMm) {
    const visited = new Set();
    const clusters = [];
    for (let start = 0; start < components.length; start += 1) {
        if (visited.has(start)) continue;
        const queue = [start];
        const indexes = [];
        visited.add(start);
        while (queue.length > 0) {
            const current = queue.shift();
            indexes.push(current);
            for (let candidate = 0; candidate < components.length; candidate += 1) {
                if (visited.has(candidate)) continue;
                if (bboxDistance(components[current].bbox, components[candidate].bbox) <= maxGapMm) {
                    visited.add(candidate);
                    queue.push(candidate);
                }
            }
        }
        const clusterComponents = indexes.map(index => components[index]);
        clusters.push({
            components: clusterComponents,
            area: clusterComponents.reduce((sum, component) => sum + Number(component.area || 0), 0),
            count: clusterComponents.length
        });
    }
    return clusters;
}

function componentMatchesAnchor(component, anchors) {
    if (!anchors.length) return false;
    const fields = [
        component.blockName,
        component.parentBlock,
        component.rootBlock,
        ...(component.hierarchy || [])
    ].filter(Boolean).map(value => String(value).toLowerCase());
    return anchors.some(anchor => fields.some(field => field.includes(String(anchor).toLowerCase())));
}

function selectComponents(components, selection) {
    const normalized = (components || []).map(component => ({ ...component }));
    if (normalized.length === 0) throw new Error('No split components were generated.');
    if (selection.mode === 'all' || normalized.length === 1) {
        return { included: normalized, excluded: [], clusters: [normalized] };
    }

    const clusters = buildComponentClusters(normalized, selection.maxGapMm);
    const anchoredClusters = clusters.filter(cluster =>
        cluster.components.some(component => componentMatchesAnchor(component, selection.anchorBlockNames))
    );
    const candidates = anchoredClusters.length > 0 ? anchoredClusters : clusters;
    candidates.sort((a, b) => b.area - a.area || b.count - a.count);
    const selectedCluster = candidates[0];
    const selectedIds = new Set(selectedCluster.components.map(component => component.id));
    const included = normalized.filter(component => selectedIds.has(component.id));
    const excluded = normalized
        .filter(component => !selectedIds.has(component.id))
        .map(component => ({
            ...component,
            exclusionReason: 'detached-from-main-profile-cluster'
        }));
    return { included, excluded, clusters: clusters.map(cluster => cluster.components) };
}

function getComponentsViewBox(components, margin = PROFILE_MARGIN_MM) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const component of components) {
        minX = Math.min(minX, component.bbox.minX);
        minY = Math.min(minY, component.bbox.minY);
        maxX = Math.max(maxX, component.bbox.maxX);
        maxY = Math.max(maxY, component.bbox.maxY);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        throw new Error('Cannot calculate a viewBox from component bounds.');
    }
    return [
        minX - margin,
        -maxY - margin,
        (maxX - minX) + margin * 2,
        (maxY - minY) + margin * 2
    ];
}

function extractSvgPathTags(svgText) {
    return svgText.match(/<path\b[^>]*\/?\s*>/gi) || [];
}

function createCompositeSvg(profileId, role, components, componentsDir, viewBox) {
    const pathTags = [];
    for (const component of components) {
        const sourceSvgPath = path.join(componentsDir, component.filename);
        const svgText = fs.readFileSync(sourceSvgPath, 'utf8');
        pathTags.push(...extractSvgPathTags(svgText));
    }
    if (pathTags.length === 0) throw new Error(`No SVG paths were found for ${profileId}.`);
    const [x, y, width, height] = viewBox;
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(4)} ${y.toFixed(4)} ${width.toFixed(4)} ${height.toFixed(4)}" width="100%" height="100%" data-profile-id="${profileId}" data-profile-role="${role}">\n` +
        pathTags.map(tag => `  ${tag}`).join('\n') + '\n</svg>\n';
}

function createComponentSvg(profileId, role, component, componentsDir, viewBox, state) {
    const sourceSvgPath = path.join(componentsDir, component.filename);
    const sourceSvg = fs.readFileSync(sourceSvgPath, 'utf8');
    const pathTags = extractSvgPathTags(sourceSvg);
    const [x, y, width, height] = viewBox;
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(4)} ${y.toFixed(4)} ${width.toFixed(4)} ${height.toFixed(4)}" width="100%" height="100%" data-profile-id="${profileId}" data-profile-role="${role}" data-component-id="${component.id}" data-component-state="${state}">\n` +
        pathTags.map(tag => `  ${tag}`).join('\n') + '\n</svg>\n';
}

function writeComponentOutputs(plan, bundle, selectionResult, viewBox) {
    fs.mkdirSync(plan.partsDir, { recursive: true });
    for (const component of selectionResult.included) {
        const svg = createComponentSvg(
            plan.profileId,
            plan.role,
            component,
            bundle.componentsDir,
            viewBox,
            'included'
        );
        fs.writeFileSync(path.join(plan.partsDir, component.filename), svg, 'utf8');
    }

    if (plan.componentSelection.keepExcludedForReview && selectionResult.excluded.length > 0) {
        fs.mkdirSync(plan.excludedDir, { recursive: true });
        for (const component of selectionResult.excluded) {
            const localViewBox = getComponentsViewBox([component]);
            const svg = createComponentSvg(
                plan.profileId,
                plan.role,
                component,
                bundle.componentsDir,
                localViewBox,
                'excluded'
            );
            fs.writeFileSync(path.join(plan.excludedDir, component.filename), svg, 'utf8');
        }
    }
}

function createMetadata(plan, svgSummary, componentData = null, catalogRegistration = null) {
    const included = componentData?.included || [];
    const excluded = componentData?.excluded || [];
    return {
        schemaVersion: 2,
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
            mode: 'component-assembly',
            svg: 'profile.svg',
            units: plan.units,
            viewBox: svgSummary.viewBox,
            filledPathCount: svgSummary.filledPathCount,
            openPathCount: svgSummary.openPathCount,
            canonicalOrientation: plan.canonicalOrientation,
            allowedTransforms: plan.allowedTransforms,
            sourcePolicy: plan.geometrySource,
            sourceDiagnostics: componentData?.sourceDiagnostics || null,
            components: included.map(component => ({
                id: component.id,
                svg: `parts/${component.filename}`,
                blockName: component.blockName,
                parentBlock: component.parentBlock,
                rootBlock: component.rootBlock,
                hierarchy: component.hierarchy,
                layer: component.layer,
                sourceTransform: component.sourceTransform || null,
                geometryIslandIndex: component.geometryIslandIndex ?? 0,
                geometryIslandCount: component.geometryIslandCount ?? 1,
                bbox: component.bbox,
                closedContours: component.closedContours,
                openContours: component.openContours,
                selectable: true,
                defaultEnabled: true
            })),
            excludedComponents: excluded.map(component => ({
                id: component.id,
                svg: plan.componentSelection.keepExcludedForReview
                    ? `excluded/${component.filename}`
                    : null,
                blockName: component.blockName,
                parentBlock: component.parentBlock,
                rootBlock: component.rootBlock,
                hierarchy: component.hierarchy,
                layer: component.layer,
                sourceTransform: component.sourceTransform || null,
                geometryIslandIndex: component.geometryIslandIndex ?? 0,
                geometryIslandCount: component.geometryIslandCount ?? 1,
                bbox: component.bbox,
                reason: component.exclusionReason
            }))
        },
        componentSelection: {
            ...plan.componentSelection,
            includedCount: included.length,
            excludedCount: excluded.length
        },
        placement: { allowedSides: plan.allowedSides },
        conversion: {
            mode: 'standalone-profile-components',
            converter: pathForMetadata(SINGLE_PROFILE_CONVERTER),
            modelSpacePolicy: plan.geometrySource.modelSpacePolicy,
            insertTransform: 'ocs-to-world',
            generatedAt: new Date().toISOString()
        },
        catalogRegistration: catalogRegistration || {
            status: 'not-registered',
            note: 'Review profile.svg, parts/, excluded/, and metadata before adding this profile to src/client/js/profile-catalog.js.'
        },
        notes: plan.notes
    };
}

function readExistingCatalogRegistration(plan) {
    if (!fs.existsSync(plan.metadataPath)) return null;

    try {
        const existingMetadata = JSON.parse(fs.readFileSync(plan.metadataPath, 'utf8'));
        const registration = existingMetadata?.catalogRegistration;
        return registration?.status === 'registered' ? registration : null;
    } catch (_error) {
        return null;
    }
}

function convertOne(plan, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const force = Boolean(options.force);
    printPlan(plan);
    if (dryRun) return { status: 'planned', plan };

    ensureOutputCanBeWritten(plan, force);
    const catalogRegistration = readExistingCatalogRegistration(plan) || plan.catalogRegistration;
    if (force) clearGeneratedOutput(plan);
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), `window-profile-${plan.profileId}-`));

    try {
        const bundle = convertSourceToComponentBundle(plan, temporaryDir);
        const selectionResult = selectComponents(
            bundle.componentMetadata.components,
            plan.componentSelection
        );
        selectionResult.sourceDiagnostics = bundle.componentMetadata.geometrySource || null;
        const viewBox = getComponentsViewBox(selectionResult.included);
        const compositeSvg = createCompositeSvg(
            plan.profileId,
            plan.role,
            selectionResult.included,
            bundle.componentsDir,
            viewBox
        );
        const svgSummary = parseSvgSummary(compositeSvg);
        const metadata = createMetadata(
            plan,
            svgSummary,
            selectionResult,
            catalogRegistration
        );

        fs.mkdirSync(plan.outputDir, { recursive: true });
        writeComponentOutputs(plan, bundle, selectionResult, viewBox);
        fs.writeFileSync(plan.svgPath, compositeSvg, 'utf8');
        fs.writeFileSync(plan.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

        console.log(`  Included components: ${selectionResult.included.length}`);
        console.log(`  Excluded components: ${selectionResult.excluded.length}`);
        if (selectionResult.sourceDiagnostics?.ignoredDirectModelSpaceGeometry) {
            console.log(`  Ignored direct model-space geometry: ${selectionResult.sourceDiagnostics.directModelSpacePathCount || 0} path(s)`);
        }
        if (selectionResult.sourceDiagnostics?.filteredPathCount > 0) {
            console.log(`  Filtered proxy/out-of-range geometry: ${selectionResult.sourceDiagnostics.filteredPathCount} path(s)`);
        }
        console.log(`  Saved SVG: ${pathForMetadata(plan.svgPath)}`);
        console.log(`  Saved parts: ${pathForMetadata(plan.partsDir)}`);
        if (selectionResult.excluded.length > 0 && plan.componentSelection.keepExcludedForReview) {
            console.log(`  Saved excluded review parts: ${pathForMetadata(plan.excludedDir)}`);
        }
        console.log(`  Saved metadata: ${pathForMetadata(plan.metadataPath)}`);
        return { status: 'converted', plan, metadata, selectionResult };
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
        if (missing.length > 0) throw new Error(`Profiles not found in manifest: ${missing.join(', ')}`);
    }

    const ids = new Set();
    return entries.map(entry => {
        const plan = createProfilePlan(entry, { 'output-root': options['output-root'] });
        if (ids.has(plan.profileId)) throw new Error(`Duplicate profile ID in manifest: ${plan.profileId}`);
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
    const results = plans.map(plan => convertOne(plan, { dryRun, force }));
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
    bboxDistance,
    buildComponentClusters,
    createMetadata,
    createPlansFromManifest,
    createProfilePlan,
    convertOne,
    getComponentsViewBox,
    loadManifest,
    normalizeComponentSelection,
    normalizeModelSpacePolicy,
    parseArgs,
    parseSvgSummary,
    runCli,
    selectComponents
};
