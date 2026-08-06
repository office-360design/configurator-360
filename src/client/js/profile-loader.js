import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { normalizeHexColour } from './config.js';
import { simplifyProfileShape } from './geometry-utils.js';
import {
    collapseProfileShapes,
    extractFilledSvgShapes,
    mapProfileShapes,
} from './svg-profile-shapes.js';
import {
    DEFAULT_GASKET_PROFILE_ID,
    DEFAULT_GLAZING_BEAD_PROFILE_ID,
    createLegacyComponentMetadata,
    getGlazingBeadProfileIds,
    getLegacySvgCandidates,
    getSelectableGasketProfileIds,
} from './profile-catalog.js';

const GLAZING_BEAD_CODES = getGlazingBeadProfileIds().filter(
    code => code !== DEFAULT_GLAZING_BEAD_PROFILE_ID
);
const GASKET_CODES = getSelectableGasketProfileIds().filter(
    code => code !== DEFAULT_GASKET_PROFILE_ID
);

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

    async function loadCatalogAccessoryShapes(profileFolder, code, section) {
        const candidates = getLegacySvgCandidates(code, profileFolder, section);
        if (!candidates.length) {
            throw new Error(`No legacy SVG candidates are cataloged for profile ${code}.`);
        }

        const data = await loadFirstAvailableSvg(candidates);
        const shapes = extractFilledSvgShapes(data);
        const filename = candidates[0].split('/').pop();

        if (!shapes.length) {
            throw new Error(`No filled profile shape was found in ${filename}.`);
        }

        return collapseProfileShapes(shapes);
    }

    async function loadGasketShapes(profileFolder, code, section) {
        return loadCatalogAccessoryShapes(profileFolder, code, section);
    }

    async function loadGlazingBeadShapes(profileFolder, code, section) {
        return loadCatalogAccessoryShapes(profileFolder, code, section);
    }

    async function loadProfilePart(profileFolder, metadata, part) {
        const url = `svg/${profileFolder}/${part.relativeUrl || part.filename}`;
        const data = await loadSvg(url);
        const shapes = extractFilledSvgShapes(data);

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

        const legacyComponentMetadata = createLegacyComponentMetadata({
            profileFolder,
            part,
            materialKey,
        });

        const optimizedShape = mapProfileShapes(
            shapes,
            shape => simplifyProfileShape(shape, materialKey)
        );
        const optimizedShapes = Array.isArray(optimizedShape)
            ? optimizedShape
            : [optimizedShape];

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
        const isGlazingBeadTemplate = legacyComponentMetadata.profileId
            === DEFAULT_GLAZING_BEAD_PROFILE_ID;
        let beadShapes = null;

        if (isGlazingBeadTemplate) {
            beadShapes = {
                [DEFAULT_GLAZING_BEAD_PROFILE_ID]: optimizedShape,
            };

            for (const beadCode of GLAZING_BEAD_CODES) {
                try {
                    beadShapes[beadCode] = await loadGlazingBeadShapes(
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

        const isGasketTemplate = legacyComponentMetadata.profileId
            === DEFAULT_GASKET_PROFILE_ID;
        let gasketShapes = null;

        if (isGasketTemplate) {
            gasketShapes = {
                [DEFAULT_GASKET_PROFILE_ID]: optimizedShape,
            };

            for (const gasketCode of GASKET_CODES) {
                try {
                    gasketShapes[gasketCode] = await loadGasketShapes(
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
            ...legacyComponentMetadata,
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
