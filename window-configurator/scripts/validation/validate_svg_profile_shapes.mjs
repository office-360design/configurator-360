import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const clientRoot = path.join(projectRoot, 'src', 'client');
const moduleCache = new Map();
const context = vm.createContext({ console });
context.globalThis = context;

function resolveModuleSpecifier(specifier, referencingIdentifier) {
    if (specifier === 'three') {
        return pathToFileURL(path.join(clientRoot, 'lib', 'three.module.js')).href;
    }
    if (specifier.startsWith('three/addons/')) {
        const relativePath = specifier.slice('three/addons/'.length);
        return pathToFileURL(path.join(clientRoot, 'lib', relativePath)).href;
    }
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
        return new URL(specifier, referencingIdentifier).href;
    }
    throw new Error(
        `Unsupported browser module specifier "${specifier}" from ${referencingIdentifier}`
    );
}

async function loadModule(moduleUrl) {
    if (moduleCache.has(moduleUrl)) return moduleCache.get(moduleUrl);

    const filePath = fileURLToPath(moduleUrl);
    const source = fs.readFileSync(filePath, 'utf8');
    const module = new vm.SourceTextModule(source, {
        context,
        identifier: moduleUrl,
        initializeImportMeta(meta) {
            meta.url = moduleUrl;
        },
    });

    moduleCache.set(moduleUrl, module);
    await module.link((specifier, referencingModule) =>
        loadModule(resolveModuleSpecifier(specifier, referencingModule.identifier))
    );
    return module;
}

const threeModule = await loadModule(
    pathToFileURL(path.join(clientRoot, 'lib', 'three.module.js')).href
);
const shapeModule = await loadModule(
    pathToFileURL(path.join(clientRoot, 'js', 'svg-profile-shapes.js')).href
);

await threeModule.evaluate();
await shapeModule.evaluate();

const THREE = threeModule.namespace;
const {
    collapseProfileShapes,
    extractFilledSvgShapes,
    getProfileShapeBounds,
    isVisibleFilledSvgPath,
    normalizeProfileShapes,
} = shapeModule.namespace;

const representativeSvgRoot = path.join(
    clientRoot,
    'svg',
    '2_4_Oeffnungselemnt_Vertikal'
);

function readSvg(relativePath) {
    return fs.readFileSync(path.join(representativeSvgRoot, relativePath), 'utf8');
}

function getSvgPathTags(svgText) {
    return svgText.match(/<path\b[^>]*>/gi) || [];
}

const errors = [];

function assert(condition, message) {
    if (!condition) errors.push(message);
}

function createSquarePath({
    x = 0,
    y = 0,
    size = 10,
    fill = '#000000',
    fillOpacity = 1,
    opacity = 1,
} = {}) {
    const shapePath = new THREE.ShapePath();
    shapePath.userData = {
        style: {
            fill,
            fillOpacity,
            opacity,
            fillRule: 'evenodd',
        },
    };
    shapePath.moveTo(x, y);
    shapePath.lineTo(x + size, y);
    shapePath.lineTo(x + size, y + size);
    shapePath.lineTo(x, y + size);
    shapePath.lineTo(x, y);
    return shapePath;
}

function createPathWithHole() {
    const shapePath = createSquarePath({ size: 20 });
    shapePath.moveTo(5, 5);
    shapePath.lineTo(5, 15);
    shapePath.lineTo(15, 15);
    shapePath.lineTo(15, 5);
    shapePath.lineTo(5, 5);
    return shapePath;
}

const drainageCapTags = getSvgPathTags(readSvg('208694_s/208694_s.svg'));
assert(
    drainageCapTags.some(tag => /fill=["']none["']/i.test(tag)),
    'The 208694 regression fixture should contain construction linework with fill="none".'
);
assert(
    drainageCapTags.some(tag => !/fill=["']none["']/i.test(tag)),
    'The 208694 regression fixture should retain a filled profile region.'
);

const multiContourSvg = readSvg('288319_s/288319_s.svg');
assert(
    (multiContourSvg.match(/(?<![A-Za-z])M\s/g) || []).length > 1,
    'The 288319 regression fixture should contain multiple SVG subpaths.'
);
assert(
    /fill-rule=["']evenodd["']/i.test(multiContourSvg),
    'The 288319 regression fixture should preserve its even-odd fill rule.'
);

for (const profileId of [
    '573920', '573930', '573940',
    '224350', '224378', '224379',
]) {
    const suffix = profileId.startsWith('224') ? '_s_8' : '_s';
    const svgText = readSvg(`${profileId}${suffix}/${profileId}${suffix}.svg`);
    assert(
        getSvgPathTags(svgText).length > 0,
        `The ${profileId} regression fixture should contain SVG path geometry.`
    );
}

const visibleA = createSquarePath({ x: 0 });
const visibleB = createSquarePath({ x: 20 });
const noFill = createSquarePath({ fill: 'none' });
const transparent = createSquarePath({ fill: 'transparent' });
const zeroFillOpacity = createSquarePath({ fillOpacity: 0 });
const zeroOpacity = createSquarePath({ opacity: 0 });
const transparentRgba = createSquarePath({ fill: 'rgba(0, 0, 0, 0)' });
const transparentHex = createSquarePath({ fill: '#11223300' });
const percentageOpacity = createSquarePath({ fillOpacity: '0%' });

assert(isVisibleFilledSvgPath(visibleA), 'A normal filled SVG path should be visible.');
assert(!isVisibleFilledSvgPath(noFill), 'fill="none" paths must be ignored.');
assert(!isVisibleFilledSvgPath(transparent), 'Transparent fill paths must be ignored.');
assert(!isVisibleFilledSvgPath(zeroFillOpacity), 'Zero fill-opacity paths must be ignored.');
assert(!isVisibleFilledSvgPath(zeroOpacity), 'Zero opacity paths must be ignored.');
assert(!isVisibleFilledSvgPath(transparentRgba), 'RGBA fills with zero alpha must be ignored.');
assert(!isVisibleFilledSvgPath(transparentHex), 'Eight-digit hex fills with zero alpha must be ignored.');
assert(!isVisibleFilledSvgPath(percentageOpacity), 'Percentage zero opacity paths must be ignored.');

const disconnectedShapes = extractFilledSvgShapes({
    paths: [
        visibleA,
        noFill,
        transparent,
        zeroFillOpacity,
        zeroOpacity,
        transparentRgba,
        transparentHex,
        percentageOpacity,
        visibleB,
    ],
});
assert(
    disconnectedShapes.length === 2,
    `Expected two disconnected filled regions, received ${disconnectedShapes.length}.`
);

const holedShapes = extractFilledSvgShapes({ paths: [createPathWithHole()] });
assert(holedShapes.length === 1, 'A profile with one outer contour should create one shape.');
assert(
    holedShapes[0]?.holes?.length === 1,
    `Expected one preserved hole, received ${holedShapes[0]?.holes?.length ?? 0}.`
);

const collapsedSingle = collapseProfileShapes([holedShapes[0]]);
const collapsedMultiple = collapseProfileShapes(disconnectedShapes);
assert(!Array.isArray(collapsedSingle), 'One shape should retain the legacy single-shape form.');
assert(Array.isArray(collapsedMultiple), 'Multiple regions should remain a shape array.');
assert(normalizeProfileShapes(collapsedSingle).length === 1, 'Single-shape normalization failed.');
assert(normalizeProfileShapes(collapsedMultiple).length === 2, 'Shape-array normalization failed.');

const bounds = getProfileShapeBounds(collapsedMultiple, 4);
assert(bounds !== null, 'Bounds should be calculated for multiple profile shapes.');
assert(bounds?.min.x === 0, `Unexpected minimum X bound: ${bounds?.min.x}`);
assert(bounds?.max.x === 30, `Unexpected maximum X bound: ${bounds?.max.x}`);
assert(bounds?.min.y === 0, `Unexpected minimum Y bound: ${bounds?.min.y}`);
assert(bounds?.max.y === 10, `Unexpected maximum Y bound: ${bounds?.max.y}`);

if (errors.length) {
    console.error('SVG profile-shape validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('SVG profile-shape validation passed.');
}
