import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const catalogPath = path.join(projectRoot, 'src', 'client', 'js', 'profile-catalog.js');
const catalogSource = fs.readFileSync(catalogPath, 'utf8');
const catalogModule = await import(
    `data:text/javascript;base64,${Buffer.from(catalogSource).toString('base64')}`
);

const {
    ACCESSORY_GROUPS,
    ACCESSORY_PRESETS,
    DEFAULT_GLAZING_SYSTEM_ID,
    GLAZING_SYSTEMS,
    LEGACY_PROFILE_SETS,
    PROFILE_CATALOG,
    createLegacyComponentMetadata,
    getGasketCodeForThickness,
    getGlazingBeadCodeForThickness,
    getLegacySvgCandidates,
} = catalogModule;

const errors = [];
const clientRoot = path.join(projectRoot, 'src', 'client');

function assert(condition, message) {
    if (!condition) errors.push(message);
}

function existsFromProject(relativePath) {
    return fs.existsSync(path.join(projectRoot, relativePath));
}

function existsFromClient(relativePath) {
    return fs.existsSync(path.join(clientRoot, relativePath));
}

for (const [profileSetId, profileSet] of Object.entries(LEGACY_PROFILE_SETS)) {
    assert(profileSet.id === profileSetId, `Legacy profile set key/id mismatch: ${profileSetId}`);
    assert(
        existsFromClient(profileSet.metadataUrl),
        `Missing metadata for ${profileSetId}: src/client/${profileSet.metadataUrl}`
    );
    assert(
        Boolean(PROFILE_CATALOG[profileSet.outerFrameProfileId]),
        `${profileSetId} references unknown outer frame ${profileSet.outerFrameProfileId}`
    );
    assert(
        Boolean(PROFILE_CATALOG[profileSet.sashProfileId]),
        `${profileSetId} references unknown sash ${profileSet.sashProfileId}`
    );
    assert(
        Boolean(GLAZING_SYSTEMS[profileSet.glazingSystemId]),
        `${profileSetId} references unknown glazing system ${profileSet.glazingSystemId}`
    );
}


const expectedProfileRoles = new Map([
    ['575760', { profileClass: 'outer-frame', roles: ['outer-boundary'] }],
    ['575770', { profileClass: 'outer-frame', roles: ['outer-boundary'] }],
    ['575780', { profileClass: 'sash', roles: ['opening-sash-boundary'] }],
    ['575790', { profileClass: 'sash', roles: ['opening-sash-boundary'] }],
    ['575800', { profileClass: 'mullion-transom', roles: ['mullion', 'transom'] }],
    ['575810', { profileClass: 'mullion-transom', roles: ['mullion', 'transom'] }],
    ['575820', { profileClass: 'double-vent-sash', roles: ['secondary-sash'] }],
    ['575830', { profileClass: 'double-vent-sash', roles: ['secondary-sash'] }],
]);

for (const [profileId, expected] of expectedProfileRoles) {
    const profile = PROFILE_CATALOG[profileId];
    assert(Boolean(profile), `Missing base profile ${profileId}`);
    assert(
        profile?.profileClass === expected.profileClass,
        `${profileId} has the wrong profileClass`
    );
    for (const role of expected.roles) {
        assert(
            profile?.capabilities?.structuralRoles?.includes(role),
            `${profileId} is missing structural role ${role}`
        );
    }
    assert(
        !Object.prototype.hasOwnProperty.call(profile || {}, 'crossSectionFamily'),
        `${profileId} must not use L/Z cross-section-family metadata`
    );
}

const displayCodes = new Set();
for (const profileSet of Object.values(LEGACY_PROFILE_SETS)) {
    assert(Boolean(profileSet.displayCode), `${profileSet.id} is missing displayCode`);
    assert(!displayCodes.has(profileSet.displayCode), `Duplicate displayCode ${profileSet.displayCode}`);
    displayCodes.add(profileSet.displayCode);
}

for (const [groupId, group] of Object.entries(ACCESSORY_GROUPS)) {
    assert(group.id === groupId, `Accessory group key/id mismatch: ${groupId}`);
    assert(
        group.profileIds.includes(group.defaultProfileId),
        `${groupId} does not include its default profile ${group.defaultProfileId}`
    );
    assert(
        Boolean(PROFILE_CATALOG[group.defaultProfileId]),
        `${groupId} references unknown default profile ${group.defaultProfileId}`
    );
    assert(
        typeof group.defaultEnabled === 'boolean',
        `${groupId} must declare a boolean defaultEnabled state`
    );
    assert(Boolean(group.configurationKey), `${groupId} is missing configurationKey`);
    assert(Boolean(group.urlParameter), `${groupId} is missing urlParameter`);

    for (const profileId of group.profileIds) {
        assert(Boolean(PROFILE_CATALOG[profileId]), `${groupId} references unknown profile ${profileId}`);
        assert(
            PROFILE_CATALOG[profileId]?.type === 'profile-accessory',
            `${groupId} profile ${profileId} is not a profile accessory`
        );
    }
}


const expectedAccessoryTypes = new Map([
    ['275701', 'locking-bar'],
    ['224068', 'centre-gasket'],
    ['200988', 'insulation-profile'],
    ['245472', 'rebate-gasket'],
    ['224063', 'glass-gasket'],
    ['224378', 'glazing-bead-gasket'],
    ['288319', 'glazing-bridge'],
    ['208694', 'drainage-cap'],
]);
for (const [profileId, accessoryType] of expectedAccessoryTypes) {
    assert(
        PROFILE_CATALOG[profileId]?.accessoryType === accessoryType,
        `${profileId} should be cataloged as ${accessoryType}`
    );
}

for (const presetId of ['b2-6', 'b2-7', 'b2-8']) {
    const preset = ACCESSORY_PRESETS[presetId];
    assert(Boolean(preset), `Missing accessory preset ${presetId}`);
    for (const groupId of Object.keys(ACCESSORY_GROUPS)) {
        assert(
            typeof preset?.groupStates?.[groupId] === 'boolean',
            `${presetId} is missing a boolean state for ${groupId}`
        );
    }
}
assert(
    ACCESSORY_PRESETS['b2-8']?.groupStates?.['insulation-profile'] === true,
    'B2-8 must enable the 200988 insulation-profile group.'
);
assert(
    ACCESSORY_PRESETS['b2-6']?.groupStates?.['insulation-profile'] === false,
    'B2-6 must leave the optional insulation-profile group disabled.'
);

const drainageCap = PROFILE_CATALOG['208694'];
assert(
    drainageCap?.attachment?.permittedSides?.length === 1
        && drainageCap.attachment.permittedSides[0] === 'bottom',
    'Drainage cap 208694 must be restricted to the bottom side.'
);
assert(
    drainageCap?.finish?.inheritance === 'host.exteriorFinish',
    'Drainage cap 208694 must inherit the host exterior finish.'
);

const aliases = new Map();
for (const [profileId, entry] of Object.entries(PROFILE_CATALOG)) {
    assert(entry.id === profileId, `Profile catalog key/id mismatch: ${profileId}`);

    if (entry.geometry?.sourceDwg) {
        assert(
            existsFromProject(entry.geometry.sourceDwg),
            `Missing source DWG for ${profileId}: ${entry.geometry.sourceDwg}`
        );
    }
    if (entry.geometry?.sourceCad) {
        assert(
            existsFromProject(entry.geometry.sourceCad),
            `Missing source CAD file for ${profileId}: ${entry.geometry.sourceCad}`
        );
    }
    if (entry.preview?.image) {
        assert(
            existsFromClient(entry.preview.image),
            `Missing preview for ${profileId}: src/client/${entry.preview.image}`
        );
    }

    for (const alias of entry.legacy?.aliases || []) {
        const key = String(alias).toLowerCase();
        assert(
            !aliases.has(key) || aliases.get(key) === profileId,
            `Duplicate catalog alias ${alias} for ${aliases.get(key)} and ${profileId}`
        );
        aliases.set(key, profileId);
    }

    const legacySvg = entry.geometry?.legacySvg;
    if (!legacySvg) continue;

    const expectedProfileSets = entry.legacy?.profileSets
        || Object.keys(LEGACY_PROFILE_SETS);
    for (const profileSetId of expectedProfileSets) {
        for (const section of ['top', 'bottom']) {
            if (!(legacySvg[section]?.length > 0)) continue;
            const candidates = getLegacySvgCandidates(profileId, profileSetId, section);
            assert(
                candidates.some(existsFromClient),
                `No ${section} SVG candidate exists for ${profileId} in ${profileSetId}`
            );
        }
    }
}

const expectedBeads = new Map([
    [16, '573940'], [19, '573940'],
    [20, '573930'], [24, '573930'],
    [25, '573920'], [29, '573920'],
]);
for (const [thickness, expected] of expectedBeads) {
    assert(
        getGlazingBeadCodeForThickness(thickness) === expected,
        `Glass ${thickness} mm resolved to the wrong glazing bead`
    );
}

for (let thickness = 16; thickness <= 29; thickness += 1) {
    const remainder = thickness % 5;
    const expected = remainder === 0
        ? '224379'
        : (remainder === 1 || remainder === 2 ? '224378' : '224350');
    assert(
        getGasketCodeForThickness(thickness) === expected,
        `Glass ${thickness} mm resolved to the wrong gasket`
    );
}

assert(
    Boolean(GLAZING_SYSTEMS[DEFAULT_GLAZING_SYSTEM_ID]),
    `Default glazing system is missing: ${DEFAULT_GLAZING_SYSTEM_ID}`
);

for (const profileSetId of Object.keys(LEGACY_PROFILE_SETS)) {
    const metadataPath = path.join(clientRoot, 'svg', profileSetId, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const componentIds = new Set();

    for (const part of metadata.parts) {
        const component = createLegacyComponentMetadata({
            profileFolder: profileSetId,
            part,
            materialKey: 'default',
        });

        assert(
            component.legacyIndex === part.index,
            `${profileSetId} part ${part.index} lost its legacy index`
        );
        assert(
            !componentIds.has(component.componentId),
            `${profileSetId} contains duplicate componentId ${component.componentId}`
        );
        componentIds.add(component.componentId);

        if (String(part.blockName).includes('573940')) {
            assert(
                component.componentType === 'glazing-bead',
                `${profileSetId} part ${part.index} should be a glazing bead`
            );
        }
        if (String(part.blockName).includes('244511')) {
            assert(
                component.componentType === 'glazing-bead-child',
                `${profileSetId} part ${part.index} should be a glazing-bead child`
            );
        }
        const expectedComponentTypeById = {
            '275701': 'hardware',
            '224068': 'gasket',
            '200988': 'insulation',
            '245472': 'gasket',
            '224063': 'gasket',
            '288319': 'glass-support',
            '208694': 'drainage-cap',
        };
        for (const [partId, componentType] of Object.entries(expectedComponentTypeById)) {
            if (String(part.blockName).includes(partId)) {
                assert(
                    component.componentType === componentType,
                    `${profileSetId} part ${part.index} should be ${componentType}`
                );
            }
        }
    }
}

if (errors.length) {
    console.error('Profile catalog validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log(
        `Profile catalog valid: ${Object.keys(PROFILE_CATALOG).length} profiles/accessories, `
        + `${Object.keys(LEGACY_PROFILE_SETS).length} legacy profile sets.`
    );
}
