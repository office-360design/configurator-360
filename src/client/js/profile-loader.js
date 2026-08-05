import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { normalizeHexColour } from './config.js';
import { simplifyProfileShape } from './geometry-utils.js';

const GLAZING_BEAD_CODES = ['573930', '573920'];
const GASKET_CODES = ['224379', '224350'];

function getFilledSvgShapes(data) {
    const shapes = [];

    for (const path of data.paths || []) {
        const style = path.userData?.style || {};
        const fill = String(style.fill ?? '#000').trim().toLowerCase();
        const fillOpacity = Number(style.fillOpacity ?? 1);

        // Ignore SVG linework and invisible paths.
        if (
            fill === 'none'
            || fill === 'transparent'
            || (Number.isFinite(fillOpacity) && fillOpacity <= 0)
        ) {
            continue;
        }

        shapes.push(...SVGLoader.createShapes(path));
    }

    return shapes;
}

export function createProfileLoader() {
    const svgLoader = new SVGLoader();
    const profileCache = new Map();

    function loadSvg(url) {
        return new Promise((resolve, reject) => {
            svgLoader.load(url, resolve, null, reject);
        });
    }

    async function loadFirstAvailableSvg(urls) {
        let lastError = null;

        for (const url of urls) {
            try {
                return await loadSvg(url);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error(
            `None of the SVG candidates could be loaded: ${urls.join(', ')}`
        );
    }

    async function loadGasketShape(profileFolder, code, section) {
        const isBottom = section === 'bottom';
        const filename = `${code}_s_8${isBottom ? '_inst1' : ''}.svg`;
        const candidates = [
            `svg/${profileFolder}/${code}_s_8/${filename}`,
        ];

        const data = await loadFirstAvailableSvg(candidates);
        const path = data.paths[0];

        if (!path) {
            throw new Error(`No SVG path was found in ${filename}.`);
        }

        const shapes = SVGLoader.createShapes(path);
        if (!shapes.length) {
            throw new Error(`No closed shape was found in ${filename}.`);
        }

        return shapes[0];
    }

    async function loadGlazingBeadShape(profileFolder, code, section) {
        const isBottom = section === 'bottom';
        const filename = `${code}_s${isBottom ? '_inst1' : ''}.svg`;
        const candidates = [
            `svg/${profileFolder}/${code}_s/${filename}`,
            `svg/${profileFolder}/${code}/${filename}`,
            `svg/${profileFolder}/${code}_s/${code}_s/${filename}`,
        ];

        const data = await loadFirstAvailableSvg(candidates);
        const path = data.paths[0];

        if (!path) {
            throw new Error(`No SVG path was found in ${filename}.`);
        }

        const shapes = SVGLoader.createShapes(path);
        if (!shapes.length) {
            throw new Error(`No closed shape was found in ${filename}.`);
        }

        return shapes[0];
    }

    async function loadProfilePart(profileFolder, metadata, part) {
        const url = `svg/${profileFolder}/${part.relativeUrl || part.filename}`;
        const data = await loadSvg(url);
        const shapes = getFilledSvgShapes(data);

        if (!shapes.length) {
            throw new Error(`No filled profile shape could be created from ${url}.`);
        }

        const layer = part.layer.toLowerCase();
        const blockName = (part.blockName || '').toLowerCase();

        const isAlu = layer.includes('al') || layer.includes('alu');
        const isIso = layer.includes('isolation') || layer.includes('isoli') || layer.includes('iso');
        const isGlass = layer.includes('glas') || layer.includes('glass');
        const isFoam = layer.includes('dämmung')
            || layer.includes('daemmung')
            || layer.includes('dämm')
            || layer.includes('daemm')
            || layer.includes('foam');

        const baseCadColor = normalizeHexColour(part.color) || '#78716c';
        const isCentralSeal = baseCadColor === '#7fbfff'
            || baseCadColor === '#38bdf8'
            || layer.includes('grau_13')
            || blockName.includes('224068')
            || blockName.includes('problema');
        const isEPDM = !isCentralSeal && (
            layer.includes('epdm')
            || layer.includes('dichtung')
            || layer.includes('dicht')
            || layer.includes('gasket')
            || baseCadColor === '#ffbf7f'
            || baseCadColor === '#ea580c'
            || /^(200|224|244)/.test(blockName)
        );

        let materialKey = 'default';
        if (isGlass) {
            materialKey = 'glass';
        } else if (isCentralSeal) {
            materialKey = 'centralSeal';
        } else if (isEPDM) {
            materialKey = 'epdm';
        } else if (isIso) {
            materialKey = 'iso';
        } else if (isFoam) {
            materialKey = 'foam';
        } else if (isAlu) {
            materialKey = 'alu';
        }

        const optimizedShapes = shapes.map(shape =>
            simplifyProfileShape(shape, materialKey)
        );

        const optimizedShape = optimizedShapes.length === 1
            ? optimizedShapes[0]
            : optimizedShapes;

        const sourceContourPoints = optimizedShapes.reduce(
            (sum, shape) => sum + (shape.userData?.sourcePointCount || 0),
            0
        );

        const optimizedContourPoints = optimizedShapes.reduce(
            (sum, shape) => sum + (shape.userData?.optimizedPointCount || 0),
            0
        );

        let baseExplode = 0.12;
        if (part.role === 'sash') {
            baseExplode = 0.26;
        } else if (isIso) {
            baseExplode = 0.18;
        }

        const section = part.section || 'top';
        const isGlazingBeadTemplate = String(part.blockName || '').includes('573940');
        let beadShapes = null;

        if (isGlazingBeadTemplate) {
            beadShapes = {
                '573940': shapes[0],
            };

            for (const beadCode of GLAZING_BEAD_CODES) {
                try {
                    beadShapes[beadCode] = await loadGlazingBeadShape(
                        profileFolder,
                        beadCode,
                        section
                    );
                } catch (error) {
                    console.warn(
                        `Could not load glazing bead ${beadCode} (${section}); `
                        + '573940 will be used as a fallback.',
                        error
                    );
                }
            }
        }

        const isGasketTemplate = String(part.blockName || '').includes('224378');
        let gasketShapes = null;

        if (isGasketTemplate) {
            gasketShapes = {
                '224378': shapes[0],
            };

            for (const gasketCode of GASKET_CODES) {
                try {
                    gasketShapes[gasketCode] = await loadGasketShape(
                        profileFolder,
                        gasketCode,
                        section
                    );
                } catch (error) {
                    console.warn(
                        `Could not load gasket ${gasketCode} (${section}); `
                        + '224378 will be used as a fallback.',
                        error
                    );
                }
            }
        }

        const bboxCenterX = part.bbox
            ? (Number(part.bbox.minX) + Number(part.bbox.maxX)) / 2
            : metadata.globalCenterX;
        const aluminiumSide = materialKey === 'alu'
            ? (bboxCenterX < metadata.globalCenterX ? 'outside' : 'inside')
            : null;

        return {
            index: part.index,
            layer: part.layer,
            blockName: part.blockName || `Part ${part.index}`,
            parentBlock: part.parentBlock,
            role: part.role,
            section,
            shape: optimizedShape,
            isGlazingBeadTemplate,
            beadShapes,
            isGasketTemplate,
            gasketShapes,
            sourceContourPoints,
            optimizedContourPoints,
            baseCadColor,
            materialKey,
            aluminiumSide,
            explodeOffset: baseExplode,
            bbox: part.bbox,
            isAlu,
        };
    }

    async function getProfileDefinition(profileFolder) {
        if (profileCache.has(profileFolder)) {
            return profileCache.get(profileFolder);
        }

        const response = await fetch(`svg/${profileFolder}/metadata.json`);
        if (!response.ok) {
            throw new Error(`Metadata request failed with HTTP ${response.status}`);
        }

        const metadata = await response.json();
        const profiles = await Promise.all(
            metadata.parts.map(part => loadProfilePart(profileFolder, metadata, part))
        );

        const sourceContourPoints = profiles.reduce(
            (sum, profile) => sum + profile.sourceContourPoints,
            0
        );
        const optimizedContourPoints = profiles.reduce(
            (sum, profile) => sum + profile.optimizedContourPoints,
            0
        );

        if (sourceContourPoints > 0) {
            const reduction = 100 * (1 - optimizedContourPoints / sourceContourPoints);
            console.info(
                `Profile contour optimization for ${profileFolder}: `
                + `${sourceContourPoints.toLocaleString()} → `
                + `${optimizedContourPoints.toLocaleString()} points `
                + `(${reduction.toFixed(1)}% fewer).`
            );
        }

        const definition = { metadata, profiles };
        profileCache.set(profileFolder, definition);
        return definition;
    }

    return {
        getProfileDefinition,
    };
}
