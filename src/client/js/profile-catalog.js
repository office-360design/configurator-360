const freeze = value => Object.freeze(value);

const ALL_WINDOW_SIDES = freeze(['top', 'bottom', 'left', 'right']);
const ALL_QUARTER_TURNS = freeze([0, 90, 180, 270]);
const EDGE_TRANSFORMS = freeze({
    top: freeze({ rotationDeg: 0, mirrorX: false, mirrorY: false }),
    right: freeze({ rotationDeg: 90, mirrorX: false, mirrorY: false }),
    bottom: freeze({ rotationDeg: 180, mirrorX: false, mirrorY: false }),
    left: freeze({ rotationDeg: 270, mirrorX: false, mirrorY: false }),
});

export const LEGACY_PROFILE_SET_ORDER = freeze([
    '2_6_Oeffnungselemnt_Vertikal',
    '2_5_Oeffnungselemnt_Vertikal',
    '2_4_Oeffnungselemnt_Vertikal',
]);

export const DEFAULT_LEGACY_PROFILE_SET_ID = '2_4_Oeffnungselemnt_Vertikal';
export const DEFAULT_GLAZING_SYSTEM_ID = 'legacy-opening-sash-glazing';
export const DEFAULT_GLAZING_BEAD_PROFILE_ID = '573940';
export const DEFAULT_GASKET_PROFILE_ID = '224378';
export const DRAINAGE_CAP_PROFILE_ID = '208694';
export const DEFAULT_ACCESSORY_PRESET_ID = 'b2-6';

export const ACCESSORY_GROUP_ORDER = freeze([
    'locking-bar',
    'centre-gasket',
    'insulation-profile',
    'glazing-rebate-insulation',
    'rebate-gasket',
    'outer-glazing-gasket',
    'inner-glazing-gasket',
    'glazing-bridge',
    'joint-sealing-piece',
    'double-vent-end-cap',
    'drainage-cap',
]);

const accessoryGroup = ({
    id,
    label,
    description,
    configurationKey,
    urlParameter,
    aliases = [],
    profileIds,
    defaultProfileId,
    defaultEnabled = true,
    selectionMode = 'single',
}) => freeze({
    id,
    label,
    description,
    configurationKey,
    urlParameter,
    aliases: freeze(aliases),
    profileIds: freeze(profileIds),
    defaultProfileId,
    defaultEnabled,
    selectionMode,
});

export const ACCESSORY_GROUPS = freeze({
    'locking-bar': accessoryGroup({
        id: 'locking-bar',
        label: 'Locking bar',
        description: 'Operating bar installed inside the sash hardware groove.',
        configurationKey: 'lockingBar',
        urlParameter: 'locking_bar',
        aliases: ['locking_bar', 'lockingBar'],
        profileIds: ['275701', '275702'],
        defaultProfileId: '275701',
    }),
    'centre-gasket': accessoryGroup({
        id: 'centre-gasket',
        label: 'Centre gasket',
        description: 'Central EPDM seal between the outer frame and opening sash.',
        configurationKey: 'centreGasket',
        urlParameter: 'centre_gasket',
        aliases: ['centre_gasket', 'center_gasket', 'centreGasket', 'centerGasket'],
        profileIds: ['224068', '224069'],
        defaultProfileId: '224068',
    }),
    'insulation-profile': accessoryGroup({
        id: 'insulation-profile',
        label: 'Insulation profile',
        description: 'PE foam insert fitted behind the central seal for higher thermal performance.',
        configurationKey: 'insulationProfile',
        urlParameter: 'insulation_profile',
        aliases: ['insulation_profile', 'insulationProfile'],
        profileIds: ['200988'],
        defaultProfileId: '200988',
        defaultEnabled: false,
    }),
    'glazing-rebate-insulation': accessoryGroup({
        id: 'glazing-rebate-insulation',
        label: 'Glazing rebate insulation',
        description: 'PE foam insulation around the perimeter edge of the glass unit.',
        configurationKey: 'glazingRebateInsulation',
        urlParameter: 'glazing_rebate_insulation',
        aliases: ['glazing_rebate_insulation', 'glazingRebateInsulation'],
        profileIds: ['245442'],
        defaultProfileId: '245442',
        defaultEnabled: false,
    }),
    'rebate-gasket': accessoryGroup({
        id: 'rebate-gasket',
        label: 'Rebate gasket',
        description: 'Perimeter EPDM stop gasket mounted on the frame and sash legs.',
        configurationKey: 'rebateGasket',
        urlParameter: 'rebate_gasket',
        aliases: ['rebate_gasket', 'rebateGasket'],
        profileIds: ['245472'],
        defaultProfileId: '245472',
    }),
    'outer-glazing-gasket': accessoryGroup({
        id: 'outer-glazing-gasket',
        label: 'Outer glazing gasket',
        description: 'EPDM weather gasket supporting the outer face of the glass.',
        configurationKey: 'outerGlazingGasket',
        urlParameter: 'outer_glazing_gasket',
        aliases: ['outer_glazing_gasket', 'outerGlazingGasket'],
        profileIds: ['224063'],
        defaultProfileId: '224063',
    }),
    'inner-glazing-gasket': accessoryGroup({
        id: 'inner-glazing-gasket',
        label: 'Inner glazing gasket',
        description: 'Glazing-bead gasket selected automatically from the glass thickness.',
        configurationKey: 'innerGlazingGasket',
        urlParameter: 'inner_glazing_gasket',
        aliases: ['inner_glazing_gasket', 'innerGlazingGasket'],
        profileIds: ['224378', '224379', '224350'],
        defaultProfileId: '224378',
        selectionMode: 'glass-thickness',
    }),
    'glazing-bridge': accessoryGroup({
        id: 'glazing-bridge',
        label: 'Glazing bridge',
        description: 'PVC support block in the bottom channel below the glass pane.',
        configurationKey: 'glazingBridge',
        urlParameter: 'glazing_bridge',
        aliases: ['glazing_bridge', 'glazingBridge'],
        profileIds: ['288318', '288319'],
        defaultProfileId: '288319',
    }),
    'joint-sealing-piece': accessoryGroup({
        id: 'joint-sealing-piece',
        label: 'Joint sealing piece',
        description: 'Closed-cell EPDM sealing pad for mullion and transom joints.',
        configurationKey: 'jointSealingPiece',
        urlParameter: 'joint_sealing_piece',
        aliases: ['joint_sealing_piece', 'jointSealingPiece'],
        profileIds: ['288345'],
        defaultProfileId: '288345',
        defaultEnabled: false,
    }),
    'double-vent-end-cap': accessoryGroup({
        id: 'double-vent-end-cap',
        label: 'Double-vent end cap',
        description: 'Top and bottom sealing caps for the floating double-vent profile.',
        configurationKey: 'doubleVentEndCap',
        urlParameter: 'double_vent_end_cap',
        aliases: ['double_vent_end_cap', 'doubleVentEndCap'],
        profileIds: ['200953', '200954'],
        defaultProfileId: '200953',
        defaultEnabled: false,
    }),
    'drainage-cap': accessoryGroup({
        id: 'drainage-cap',
        label: 'Drainage cover cap',
        description: 'Exterior cap covering the drainage slots in the bottom outer frame.',
        configurationKey: 'drainageCap',
        urlParameter: 'drainage_cap',
        aliases: ['drainage_cap', 'drainageCap'],
        profileIds: [DRAINAGE_CAP_PROFILE_ID],
        defaultProfileId: DRAINAGE_CAP_PROFILE_ID,
    }),
});

const commonOperableAccessories = freeze({
    'locking-bar': true,
    'centre-gasket': true,
    'rebate-gasket': true,
    'outer-glazing-gasket': true,
    'inner-glazing-gasket': true,
    'glazing-bridge': true,
    'drainage-cap': true,
    'glazing-rebate-insulation': false,
    'joint-sealing-piece': false,
    'double-vent-end-cap': false,
});

export const ACCESSORY_PRESETS = freeze({
    'b2-6': freeze({
        id: 'b2-6',
        label: 'B2-6',
        description: 'Standard operable-sash accessories without the optional frame insulation profile.',
        groupStates: freeze({ ...commonOperableAccessories, 'insulation-profile': false }),
    }),
    'b2-7': freeze({
        id: 'b2-7',
        label: 'B2-7',
        description: 'Standard operable-sash accessories without the optional frame insulation profile.',
        groupStates: freeze({ ...commonOperableAccessories, 'insulation-profile': false }),
    }),
    'b2-8': freeze({
        id: 'b2-8',
        label: 'B2-8',
        description: 'Operable-sash accessories with the available 200988 insulation profile enabled.',
        groupStates: freeze({ ...commonOperableAccessories, 'insulation-profile': true }),
    }),
});

export const LEGACY_PROFILE_SETS = freeze({
    '2_4_Oeffnungselemnt_Vertikal': freeze({
        id: '2_4_Oeffnungselemnt_Vertikal',
        type: 'legacy-complete-section',
        label: 'Opening element 2.4',
        displayCode: 'B2-6',
        metadataUrl: 'svg/2_4_Oeffnungselemnt_Vertikal/metadata.json',
        outerFrameProfileId: '575760',
        sashProfileId: '575780',
        glazingSystemId: DEFAULT_GLAZING_SYSTEM_ID,
    }),
    '2_5_Oeffnungselemnt_Vertikal': freeze({
        id: '2_5_Oeffnungselemnt_Vertikal',
        type: 'legacy-complete-section',
        label: 'Opening element 2.5',
        displayCode: 'B2-7',
        metadataUrl: 'svg/2_5_Oeffnungselemnt_Vertikal/metadata.json',
        outerFrameProfileId: '575770',
        sashProfileId: '575790',
        glazingSystemId: DEFAULT_GLAZING_SYSTEM_ID,
    }),
    '2_6_Oeffnungselemnt_Vertikal': freeze({
        id: '2_6_Oeffnungselemnt_Vertikal',
        type: 'legacy-complete-section',
        label: 'Opening element 2.6',
        displayCode: 'B2-8',
        metadataUrl: 'svg/2_6_Oeffnungselemnt_Vertikal/metadata.json',
        outerFrameProfileId: '575770',
        sashProfileId: '575790',
        glazingSystemId: DEFAULT_GLAZING_SYSTEM_ID,
    }),
});

const baseAluminiumProfile = ({
    id,
    label,
    profileClass,
    sourceDwg,
    structuralRoles,
    closesAgainst,
    legacyProfileSets,
    preferredLegacyProfileSetId = null,
    compatibleAccessories = {},
    generatedSvg = null,
    generatedMetadata = null,
    runtimeRegistered = false,
}) => freeze({
    id,
    label,
    type: 'base-aluminium-profile',
    componentType: 'aluminium-profile',
    profileClass,
    geometry: freeze({
        sourceDwg,
        generatedSvg,
        generatedMetadata,
        runtimeRegistered,
        sourceOnly: !runtimeRegistered,
        units: 'mm',
        canonicalOrientation: freeze({
            sourceSide: 'top',
        }),
        allowedTransforms: freeze({
            rotationsDeg: ALL_QUARTER_TURNS,
            mirrorX: false,
            mirrorY: false,
        }),
        edgeTransforms: EDGE_TRANSFORMS,
    }),
    capabilities: freeze({
        structuralRoles: freeze(structuralRoles),
        sides: ALL_WINDOW_SIDES,
        closesAgainst: freeze(closesAgainst),
    }),
    compatibleAccessories: freeze({
        glazingSystems: freeze(compatibleAccessories.glazingSystems || []),
        drainageCaps: freeze(compatibleAccessories.drainageCaps || []),
    }),
    legacy: freeze({
        profileSets: freeze(legacyProfileSets),
        preferredProfileSetId: preferredLegacyProfileSetId,
        aliases: freeze([id, `${id}_s`]),
    }),
});

const profileAccessory = ({
    id,
    label = id,
    description = '',
    componentType,
    accessoryType,
    legacySvg = {},
    sourceCad = null,
    generatedMetadata = null,
    previewImage = null,
    attachment = null,
    finish = null,
    compatibility = null,
    status = 'available',
    legacyProfileSets = null,
    aliases = [],
}) => freeze({
    id,
    label,
    description,
    type: 'profile-accessory',
    componentType,
    accessoryType,
    status,
    geometry: freeze({
        sourceCad,
        generatedMetadata,
        legacySvg: freeze({
            top: freeze(legacySvg.top || []),
            bottom: freeze(legacySvg.bottom || []),
        }),
        units: 'mm',
    }),
    preview: previewImage ? freeze({ image: previewImage }) : null,
    attachment: attachment ? freeze(attachment) : null,
    finish: finish ? freeze(finish) : null,
    compatibility: compatibility ? freeze(compatibility) : null,
    legacy: freeze({
        aliases: freeze([id, ...aliases]),
        profileSets: legacyProfileSets ? freeze(legacyProfileSets) : null,
    }),
});

export const PROFILE_CATALOG = freeze({
    '575760': baseAluminiumProfile({
        id: '575760',
        label: '575760',
        profileClass: 'outer-frame',
        sourceDwg: 'cad/source/frame/575760_d1.dwg',
        structuralRoles: ['outer-boundary'],
        closesAgainst: ['opening-sash', 'fixed-glass'],
        legacyProfileSets: ['2_4_Oeffnungselemnt_Vertikal'],
        preferredLegacyProfileSetId: '2_4_Oeffnungselemnt_Vertikal',
        compatibleAccessories: {
            glazingSystems: ['legacy-fixed-glazing'],
            drainageCaps: [DRAINAGE_CAP_PROFILE_ID],
        },
        generatedSvg: 'svg/standalone/profiles/outer-frames/575760/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/outer-frames/575760/profile.meta.json',
        runtimeRegistered: true,
    }),
    '575770': baseAluminiumProfile({
        id: '575770',
        label: '575770',
        profileClass: 'outer-frame',
        sourceDwg: 'cad/source/frame/575770_d1.dwg',
        structuralRoles: ['outer-boundary'],
        closesAgainst: ['opening-sash', 'fixed-glass'],
        legacyProfileSets: [
            '2_5_Oeffnungselemnt_Vertikal',
            '2_6_Oeffnungselemnt_Vertikal',
        ],
        preferredLegacyProfileSetId: '2_6_Oeffnungselemnt_Vertikal',
        compatibleAccessories: {
            glazingSystems: ['legacy-fixed-glazing'],
            drainageCaps: [DRAINAGE_CAP_PROFILE_ID],
        },
        generatedSvg: 'svg/standalone/profiles/outer-frames/575770/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/outer-frames/575770/profile.meta.json',
        runtimeRegistered: true,
    }),
    '575780': baseAluminiumProfile({
        id: '575780',
        label: '575780',
        profileClass: 'sash',
        sourceDwg: 'cad/source/sash/575780_d1.dwg',
        structuralRoles: ['opening-sash-boundary'],
        closesAgainst: ['outer-frame'],
        legacyProfileSets: ['2_4_Oeffnungselemnt_Vertikal'],
        preferredLegacyProfileSetId: '2_4_Oeffnungselemnt_Vertikal',
        compatibleAccessories: {
            glazingSystems: [DEFAULT_GLAZING_SYSTEM_ID],
        },
        generatedSvg: 'svg/standalone/profiles/opening-sashes/575780/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/opening-sashes/575780/profile.meta.json',
        runtimeRegistered: true,
    }),
    '575790': baseAluminiumProfile({
        id: '575790',
        label: '575790',
        profileClass: 'sash',
        sourceDwg: 'cad/source/sash/575790_d1.dwg',
        structuralRoles: ['opening-sash-boundary'],
        closesAgainst: ['outer-frame'],
        legacyProfileSets: [
            '2_5_Oeffnungselemnt_Vertikal',
            '2_6_Oeffnungselemnt_Vertikal',
        ],
        preferredLegacyProfileSetId: '2_6_Oeffnungselemnt_Vertikal',
        compatibleAccessories: {
            glazingSystems: [DEFAULT_GLAZING_SYSTEM_ID],
        },
        generatedSvg: 'svg/standalone/profiles/opening-sashes/575790/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/opening-sashes/575790/profile.meta.json',
        runtimeRegistered: true,
    }),

    '575800': baseAluminiumProfile({
        id: '575800',
        label: '575800',
        profileClass: 'mullion-transom',
        sourceDwg: 'cad/source/mullion/575800_d1.dwg',
        structuralRoles: ['mullion', 'transom', 'fixed-divider'],
        closesAgainst: ['opening-sash', 'fixed-glass'],
        legacyProfileSets: [],
        compatibleAccessories: {
            glazingSystems: ['legacy-fixed-glazing'],
        },
        generatedSvg: 'svg/standalone/profiles/mullions-transoms/575800/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/mullions-transoms/575800/profile.meta.json',
        runtimeRegistered: true,
    }),
    '575810': baseAluminiumProfile({
        id: '575810',
        label: '575810',
        profileClass: 'mullion-transom',
        sourceDwg: 'cad/source/mullion/575810_d1.dwg',
        structuralRoles: ['mullion', 'transom', 'fixed-divider'],
        closesAgainst: ['opening-sash', 'fixed-glass'],
        legacyProfileSets: [],
        compatibleAccessories: {
            glazingSystems: ['legacy-fixed-glazing'],
        },
        generatedSvg: 'svg/standalone/profiles/mullions-transoms/575810/profile.svg',
        generatedMetadata: 'svg/standalone/profiles/mullions-transoms/575810/profile.meta.json',
        runtimeRegistered: true,
    }),
    '575820': baseAluminiumProfile({
        id: '575820',
        label: '575820',
        profileClass: 'double-vent-sash',
        sourceDwg: 'cad/source/double_vent_profile/575820_d1.dwg',
        structuralRoles: ['secondary-sash', 'floating-sash-adapter'],
        closesAgainst: ['primary-sash'],
        legacyProfileSets: [],
        compatibleAccessories: {
            glazingSystems: [DEFAULT_GLAZING_SYSTEM_ID],
        },
    }),
    '575830': baseAluminiumProfile({
        id: '575830',
        label: '575830',
        profileClass: 'double-vent-sash',
        sourceDwg: 'cad/source/double_vent_profile/575830_d1.dwg',
        structuralRoles: ['secondary-sash', 'floating-sash-adapter'],
        closesAgainst: ['primary-sash'],
        legacyProfileSets: [],
        compatibleAccessories: {
            glazingSystems: [DEFAULT_GLAZING_SYSTEM_ID],
        },
    }),

    '275701': profileAccessory({
        id: '275701',
        label: '275701 locking bar',
        description: 'Flat plastic operating bar installed inside the sash hardware groove.',
        componentType: 'hardware',
        accessoryType: 'locking-bar',
        legacySvg: {
            top: ['svg/{profileFolder}/275701_s/275701_s.svg'],
            bottom: ['svg/{profileFolder}/275701_s/275701_s_inst1.svg'],
        },
        attachment: freeze({
            hostProfileClasses: freeze(['sash']),
            permittedSides: ALL_WINDOW_SIDES,
        }),
        aliases: ['275701_s'],
    }),
    '275702': profileAccessory({
        id: '275702',
        label: '275702 locking bar',
        description: 'Alternative locking-bar profile; geometry is not yet present in the project.',
        componentType: 'hardware',
        accessoryType: 'locking-bar',
        status: 'geometry-missing',
        aliases: ['275702_s'],
    }),
    '224068': profileAccessory({
        id: '224068',
        label: '224068 centre gasket',
        description: 'Central EPDM seal between the outer frame and opening sash.',
        componentType: 'gasket',
        accessoryType: 'centre-gasket',
        legacySvg: {
            top: ['svg/{profileFolder}/224068_s_1/224068_s_1.svg'],
            bottom: ['svg/{profileFolder}/224068_s_1/224068_s_1_inst1.svg'],
        },
        attachment: freeze({ permittedSides: ALL_WINDOW_SIDES }),
        aliases: ['224068_s', '224068_s_1'],
    }),
    '224069': profileAccessory({
        id: '224069',
        label: '224069 centre-gasket corner',
        description: 'Centre-gasket corner profile; geometry is not yet present in the project.',
        componentType: 'gasket',
        accessoryType: 'centre-gasket',
        status: 'geometry-missing',
        aliases: ['224069_s'],
    }),
    '200988': profileAccessory({
        id: '200988',
        label: '200988 insulation profile',
        description: 'PE foam insert fitted behind the central gasket.',
        componentType: 'insulation',
        accessoryType: 'insulation-profile',
        legacySvg: {
            top: ['svg/{profileFolder}/200988_s/200988_s.svg'],
            bottom: ['svg/{profileFolder}/200988_s/200988_s_inst1.svg'],
        },
        attachment: freeze({ permittedSides: ALL_WINDOW_SIDES }),
        compatibility: freeze({ optional: true, defaultEnabled: false }),
        legacyProfileSets: ['2_6_Oeffnungselemnt_Vertikal'],
        aliases: ['200988_s'],
    }),
    '245442': profileAccessory({
        id: '245442',
        label: '245442 glazing rebate insulation',
        description: 'Glazing rebate insulation; geometry is not yet present in the project.',
        componentType: 'insulation',
        accessoryType: 'glazing-rebate-insulation',
        status: 'geometry-missing',
        aliases: ['245442_s'],
    }),
    '245472': profileAccessory({
        id: '245472',
        label: '245472 rebate gasket',
        description: 'Inner and outer perimeter EPDM stop gasket.',
        componentType: 'gasket',
        accessoryType: 'rebate-gasket',
        legacySvg: {
            top: [
                'svg/{profileFolder}/245472_s/245472_s.svg',
                'svg/{profileFolder}/245472_s_5/245472_s_5.svg',
            ],
            bottom: [
                'svg/{profileFolder}/245472_s/245472_s_inst1.svg',
                'svg/{profileFolder}/245472_s_5/245472_s_5_inst1.svg',
            ],
        },
        attachment: freeze({ permittedSides: ALL_WINDOW_SIDES }),
        aliases: ['245472_s', '245472_s_5'],
    }),
    '288318': profileAccessory({
        id: '288318',
        label: '288318 glazing bridge',
        description: 'Alternative glazing bridge; geometry is not yet present in the project.',
        componentType: 'glass-support',
        accessoryType: 'glazing-bridge',
        status: 'geometry-missing',
        aliases: ['288318_s'],
    }),
    '288319': profileAccessory({
        id: '288319',
        label: '288319 glazing bridge',
        description: 'PVC support block positioned in the bottom sash channel below the glass.',
        componentType: 'glass-support',
        accessoryType: 'glazing-bridge',
        legacySvg: {
            bottom: ['svg/{profileFolder}/288319_s/288319_s.svg'],
        },
        attachment: freeze({
            hostProfileClasses: freeze(['sash']),
            permittedSides: freeze(['bottom']),
        }),
        aliases: ['288319_s'],
    }),
    '288345': profileAccessory({
        id: '288345',
        label: '288345 joint sealing piece',
        description: 'Mullion/transom joint sealing piece; geometry is not yet present in the project.',
        componentType: 'seal',
        accessoryType: 'joint-sealing-piece',
        status: 'geometry-missing',
        aliases: ['288345_s'],
    }),
    '200953': profileAccessory({
        id: '200953',
        label: '200953 double-vent end cap',
        description: 'Double-vent end cap; geometry is not yet present in the project.',
        componentType: 'end-cap',
        accessoryType: 'double-vent-end-cap',
        status: 'geometry-missing',
        aliases: ['200953_s'],
    }),
    '200954': profileAccessory({
        id: '200954',
        label: '200954 double-vent end cap',
        description: 'Double-vent end cap variant; geometry is not yet present in the project.',
        componentType: 'end-cap',
        accessoryType: 'double-vent-end-cap',
        status: 'geometry-missing',
        aliases: ['200954_s'],
    }),

    '573940': profileAccessory({
        id: '573940',
        componentType: 'glazing-bead',
        accessoryType: 'glazing-bead',
        sourceCad: 'cad/source/bead/573940.dxf',
        generatedMetadata: 'svg/standalone/accessories/glazing-beads/573940/profile.meta.json',
        legacySvg: {
            top: ['svg/{profileFolder}/573940_s/573940_s.svg'],
            bottom: ['svg/{profileFolder}/573940_s/573940_s_inst1.svg'],
        },
        previewImage: 'icons/glazing_beads/573940.svg',
        compatibility: freeze({ minGlassThicknessMm: 16, maxGlassThicknessMm: 19 }),
        aliases: ['573940_s'],
    }),
    '573930': profileAccessory({
        id: '573930',
        componentType: 'glazing-bead',
        accessoryType: 'glazing-bead',
        sourceCad: 'cad/source/bead/573930.dxf',
        generatedMetadata: 'svg/standalone/accessories/glazing-beads/573930/profile.meta.json',
        legacySvg: {
            top: [
                'svg/{profileFolder}/573930_s/573930_s.svg',
                'svg/{profileFolder}/573930/573930_s.svg',
                'svg/{profileFolder}/573930_s/573930_s/573930_s.svg',
            ],
            bottom: [
                'svg/{profileFolder}/573930_s/573930_s_inst1.svg',
                'svg/{profileFolder}/573930/573930_s_inst1.svg',
                'svg/{profileFolder}/573930_s/573930_s/573930_s_inst1.svg',
            ],
        },
        previewImage: 'icons/glazing_beads/573930.svg',
        compatibility: freeze({ minGlassThicknessMm: 20, maxGlassThicknessMm: 24 }),
        aliases: ['573930_s'],
    }),
    '573920': profileAccessory({
        id: '573920',
        componentType: 'glazing-bead',
        accessoryType: 'glazing-bead',
        sourceCad: 'cad/source/bead/573920.dxf',
        generatedMetadata: 'svg/standalone/accessories/glazing-beads/573920/profile.meta.json',
        legacySvg: {
            top: [
                'svg/{profileFolder}/573920_s/573920_s.svg',
                'svg/{profileFolder}/573920/573920_s.svg',
                'svg/{profileFolder}/573920_s/573920_s/573920_s.svg',
            ],
            bottom: [
                'svg/{profileFolder}/573920_s/573920_s_inst1.svg',
                'svg/{profileFolder}/573920/573920_s_inst1.svg',
                'svg/{profileFolder}/573920_s/573920_s/573920_s_inst1.svg',
            ],
        },
        previewImage: 'icons/glazing_beads/573920.svg',
        compatibility: freeze({ minGlassThicknessMm: 25, maxGlassThicknessMm: 29 }),
        aliases: ['573920_s'],
    }),

    '224063': profileAccessory({
        id: '224063',
        label: '224063 outer glazing gasket',
        description: 'EPDM weather gasket supporting the outer face of the glass.',
        componentType: 'gasket',
        accessoryType: 'glass-gasket',
        legacySvg: {
            top: ['svg/{profileFolder}/224063_s/224063_s.svg'],
            bottom: ['svg/{profileFolder}/224063_s/224063_s_inst1.svg'],
        },
        attachment: freeze({
            role: 'exterior-glass-gasket',
            permittedSides: ALL_WINDOW_SIDES,
        }),
        compatibility: freeze({ minGlassThicknessMm: 16, maxGlassThicknessMm: 29 }),
        aliases: ['224063_s'],
    }),
    '224378': profileAccessory({
        id: '224378',
        label: '224378 inner glazing gasket',
        description: 'Inner gasket mounted on the glazing bead.',
        componentType: 'gasket',
        accessoryType: 'glazing-bead-gasket',
        legacySvg: {
            top: ['svg/{profileFolder}/224378_s_8/224378_s_8.svg'],
            bottom: ['svg/{profileFolder}/224378_s_8/224378_s_8_inst1.svg'],
        },
        sourceCad: 'cad/source/gasket/224378.dxf',
        generatedMetadata: 'svg/standalone/accessories/gaskets/224378/profile.meta.json',
        previewImage: 'icons/gaskets/224378.svg',
        attachment: freeze({
            role: 'glazing-bead-gasket',
            permittedSides: ALL_WINDOW_SIDES,
        }),
        aliases: ['224378_s_8'],
    }),
    '224379': profileAccessory({
        id: '224379',
        label: '224379 inner glazing gasket',
        description: 'Inner gasket mounted on the glazing bead.',
        componentType: 'gasket',
        accessoryType: 'glazing-bead-gasket',
        legacySvg: {
            top: ['svg/{profileFolder}/224379_s_8/224379_s_8.svg'],
            bottom: ['svg/{profileFolder}/224379_s_8/224379_s_8_inst1.svg'],
        },
        sourceCad: 'cad/source/gasket/224379.dxf',
        generatedMetadata: 'svg/standalone/accessories/gaskets/224379/profile.meta.json',
        previewImage: 'icons/gaskets/224379.svg',
        attachment: freeze({
            role: 'glazing-bead-gasket',
            permittedSides: ALL_WINDOW_SIDES,
        }),
        aliases: ['224379_s_8'],
    }),
    '224350': profileAccessory({
        id: '224350',
        label: '224350 inner glazing gasket',
        description: 'Inner gasket mounted on the glazing bead.',
        componentType: 'gasket',
        accessoryType: 'glazing-bead-gasket',
        legacySvg: {
            top: ['svg/{profileFolder}/224350_s_8/224350_s_8.svg'],
            bottom: ['svg/{profileFolder}/224350_s_8/224350_s_8_inst1.svg'],
        },
        sourceCad: 'cad/source/gasket/224350.dxf',
        generatedMetadata: 'svg/standalone/accessories/gaskets/224350/profile.meta.json',
        previewImage: 'icons/gaskets/224350.svg',
        attachment: freeze({
            role: 'glazing-bead-gasket',
            permittedSides: ALL_WINDOW_SIDES,
        }),
        aliases: ['224350_s_8'],
    }),

    '208694': profileAccessory({
        id: DRAINAGE_CAP_PROFILE_ID,
        label: '208694 drainage cover cap',
        description: 'Exterior plastic cap covering the drainage slots in the bottom outer frame.',
        componentType: 'drainage-cap',
        accessoryType: 'drainage-cap',
        legacySvg: {
            top: [],
            bottom: ['svg/{profileFolder}/208694_s/208694_s.svg'],
        },
        attachment: freeze({
            hostProfileClasses: freeze(['outer-frame']),
            hostProfileIds: freeze(['575760', '575770']),
            permittedSides: freeze(['bottom']),
            location: 'exterior',
            requireHostCompatibilityListing: true,
        }),
        finish: freeze({
            inheritance: 'host.exteriorFinish',
        }),
        compatibility: freeze({
            optional: true,
            defaultEnabled: true,
        }),
        aliases: ['208694_s'],
    }),
});

export const GLAZING_SYSTEMS = freeze({
    [DEFAULT_GLAZING_SYSTEM_ID]: freeze({
        id: DEFAULT_GLAZING_SYSTEM_ID,
        usage: 'opening-sash',
        glassThicknessMm: freeze({ min: 16, max: 29 }),
        fixedGasketProfileId: '224063',
        glazingBeadRules: freeze([
            freeze({ min: 16, max: 19, profileId: '573940' }),
            freeze({ min: 20, max: 24, profileId: '573930' }),
            freeze({ min: 25, max: 29, profileId: '573920' }),
        ]),
        gasketRules: freeze([
            freeze({ remainders: freeze([0]), profileId: '224379' }),
            freeze({ remainders: freeze([1, 2]), profileId: '224378' }),
            freeze({ remainders: freeze([3, 4]), profileId: '224350' }),
        ]),
        fallbackGlazingBeadProfileId: '573920',
        fallbackGasketProfileId: DEFAULT_GASKET_PROFILE_ID,
    }),
    'legacy-fixed-glazing': freeze({
        id: 'legacy-fixed-glazing',
        usage: 'fixed-glass',
        status: 'catalog-only',
        glassThicknessMm: freeze({ min: 16, max: 29 }),
        fixedGasketProfileId: '224063',
        glazingBeadRules: freeze([
            freeze({ min: 16, max: 19, profileId: '573940' }),
            freeze({ min: 20, max: 24, profileId: '573930' }),
            freeze({ min: 25, max: 29, profileId: '573920' }),
        ]),
        gasketRules: freeze([
            freeze({ remainders: freeze([0]), profileId: '224379' }),
            freeze({ remainders: freeze([1, 2]), profileId: '224378' }),
            freeze({ remainders: freeze([3, 4]), profileId: '224350' }),
        ]),
        fallbackGlazingBeadProfileId: '573920',
        fallbackGasketProfileId: DEFAULT_GASKET_PROFILE_ID,
    }),
});

const catalogAliases = new Map();
for (const entry of Object.values(PROFILE_CATALOG)) {
    for (const alias of entry.legacy?.aliases || []) {
        catalogAliases.set(String(alias).toLowerCase(), entry.id);
    }
}

export function getConfigurableAccessoryGroups() {
    return ACCESSORY_GROUP_ORDER
        .map(groupId => ACCESSORY_GROUPS[groupId])
        .filter(Boolean);
}

export function getAccessoryGroup(groupId) {
    return ACCESSORY_GROUPS[groupId] || null;
}

export function getAccessoryPresets() {
    return Object.values(ACCESSORY_PRESETS);
}

export function getAccessoryPreset(presetId) {
    return ACCESSORY_PRESETS[presetId] || null;
}

export function isAccessoryProfileGeometryAvailable(profileOrId) {
    const entry = getProfileCatalogEntry(profileOrId);
    if (!entry || entry.type !== 'profile-accessory' || entry.status === 'geometry-missing') {
        return false;
    }

    const legacySvg = entry.geometry?.legacySvg;
    return Boolean(
        entry.geometry?.generatedSvg
        || legacySvg?.top?.length
        || legacySvg?.bottom?.length
    );
}

export function getAvailableAccessoryProfileIds(groupOrId) {
    const group = typeof groupOrId === 'string'
        ? getAccessoryGroup(groupOrId)
        : groupOrId;
    if (!group) return [];
    return group.profileIds.filter(isAccessoryProfileGeometryAvailable);
}


export function getSupplementalAccessoryCatalogEntries() {
    return Object.values(PROFILE_CATALOG).filter(entry =>
        entry.type === 'profile-accessory'
        && entry.status !== 'geometry-missing'
        && Array.isArray(entry.legacy?.profileSets)
        && entry.legacy.profileSets.length > 0
    );
}

export function getSupplementalAccessorySourceProfileSetIds() {
    return [...new Set(
        getSupplementalAccessoryCatalogEntries()
            .flatMap(entry => entry.legacy.profileSets)
    )];
}

export function getAccessoryGroupForProfile(profileOrId) {
    const entry = getProfileCatalogEntry(profileOrId);
    if (!entry) return null;

    return Object.values(ACCESSORY_GROUPS).find(group =>
        group.profileIds.includes(entry.id)
    ) || null;
}

export function getLegacyProfileSetIds() {
    return [...LEGACY_PROFILE_SET_ORDER];
}

export function getLegacyProfileSet(profileSetId) {
    return LEGACY_PROFILE_SETS[profileSetId] || null;
}

export function getLegacyProfileSets() {
    return LEGACY_PROFILE_SET_ORDER
        .map(profileSetId => LEGACY_PROFILE_SETS[profileSetId])
        .filter(Boolean);
}

export function getBaseAluminiumProfiles(profileClass = null) {
    return Object.values(PROFILE_CATALOG)
        .filter(entry => entry.type === 'base-aluminium-profile')
        .filter(entry => !profileClass || entry.profileClass === profileClass)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function getLegacyProfileSetsForBaseProfiles() {
    // Complete sections are temporary geometry sources only. They no longer
    // define or restrict which outer-frame and sash profiles may be selected.
    return getLegacyProfileSets();
}

export function getPreferredLegacyProfileSetIdForProfile(profileOrId, requestedProfileSetId = null) {
    const profile = getProfileCatalogEntry(profileOrId);
    const profileSets = profile?.legacy?.profileSets || [];
    if (requestedProfileSetId && profileSets.includes(requestedProfileSetId)) {
        return requestedProfileSetId;
    }
    return profile?.legacy?.preferredProfileSetId || profileSets[0] || null;
}

export function isStandaloneProfileGeometryRegistered(profileOrId) {
    const profile = getProfileCatalogEntry(profileOrId);
    return Boolean(
        profile?.type === 'base-aluminium-profile'
        && profile.geometry?.runtimeRegistered
        && profile.geometry?.generatedMetadata
    );
}

export function getStandaloneProfileMetadataUrl(profileOrId) {
    const profile = getProfileCatalogEntry(profileOrId);
    return profile?.geometry?.generatedMetadata || null;
}

export function getRegisteredStandaloneProfileIds(profileClass = null) {
    return getBaseAluminiumProfiles(profileClass)
        .filter(isStandaloneProfileGeometryRegistered)
        .map(profile => profile.id);
}

export function isProfileGeometryAvailable(profileOrId) {
    const profile = getProfileCatalogEntry(profileOrId);
    return Boolean(
        profile?.legacy?.profileSets?.length
        || profile?.geometry?.generatedSvg
    );
}

export function getEdgeTransformForProfile(profileOrId, side) {
    const profile = getProfileCatalogEntry(profileOrId);
    if (!profile || profile.type !== 'base-aluminium-profile') return null;
    return profile.geometry?.edgeTransforms?.[side] || null;
}

export function getProfileCatalogEntry(profileOrId) {
    if (!profileOrId) return null;

    if (typeof profileOrId === 'object') {
        const explicitId = profileOrId.catalogProfileId || profileOrId.profileId || profileOrId.id;
        if (explicitId && PROFILE_CATALOG[explicitId]) {
            return PROFILE_CATALOG[explicitId];
        }

        return getProfileCatalogEntry(
            profileOrId.blockName
            || profileOrId.parentBlock
            || profileOrId.componentId
        );
    }

    const value = String(profileOrId).trim();
    if (PROFILE_CATALOG[value]) {
        return PROFILE_CATALOG[value];
    }

    const aliasId = catalogAliases.get(value.toLowerCase());
    if (aliasId) {
        return PROFILE_CATALOG[aliasId];
    }

    for (const profileId of Object.keys(PROFILE_CATALOG)) {
        if (new RegExp(`(^|\\D)${profileId}(\\D|$)`).test(value)) {
            return PROFILE_CATALOG[profileId];
        }
    }

    return null;
}

export function getProfileId(profileOrName) {
    const catalogEntry = getProfileCatalogEntry(profileOrName);
    if (catalogEntry) return catalogEntry.id;

    const value = typeof profileOrName === 'object'
        ? String(profileOrName?.blockName || profileOrName?.parentBlock || '')
        : String(profileOrName || '');

    return value.match(/\d+/)?.[0] || null;
}

export function getProfilesByComponentType(componentType) {
    return Object.values(PROFILE_CATALOG).filter(
        entry => entry.componentType === componentType
    );
}

export function getGlazingBeadProfileIds() {
    return getProfilesByComponentType('glazing-bead').map(entry => entry.id);
}

export function getSelectableGasketProfileIds() {
    return getProfilesByComponentType('gasket')
        .filter(entry => entry.accessoryType === 'glazing-bead-gasket')
        .map(entry => entry.id);
}

export function getGlazingBeadCodeForThickness(
    thicknessMm,
    glazingSystemId = DEFAULT_GLAZING_SYSTEM_ID
) {
    const system = GLAZING_SYSTEMS[glazingSystemId] || GLAZING_SYSTEMS[DEFAULT_GLAZING_SYSTEM_ID];
    const thickness = Number(thicknessMm);
    const match = system.glazingBeadRules.find(
        rule => thickness >= rule.min && thickness <= rule.max
    );

    if (match) return match.profileId;
    if (thickness < 20) return '573940';
    if (thickness < 25) return '573930';
    return system.fallbackGlazingBeadProfileId || '573920';
}

export function getGasketCodeForThickness(
    thicknessMm,
    glazingSystemId = DEFAULT_GLAZING_SYSTEM_ID
) {
    const system = GLAZING_SYSTEMS[glazingSystemId] || GLAZING_SYSTEMS[DEFAULT_GLAZING_SYSTEM_ID];
    const thickness = Number(thicknessMm);
    const remainder = Number.isFinite(thickness)
        ? ((thickness % 5) + 5) % 5
        : 4;
    const match = system.gasketRules?.find(rule => rule.remainders.includes(remainder));
    return match?.profileId || system.fallbackGasketProfileId || DEFAULT_GASKET_PROFILE_ID;
}

export function getLegacySvgCandidates(profileOrId, profileFolder, section = 'top') {
    const entry = getProfileCatalogEntry(profileOrId);
    if (!entry?.geometry?.legacySvg) return [];

    const sectionKey = section === 'bottom' ? 'bottom' : 'top';
    return entry.geometry.legacySvg[sectionKey].map(pattern =>
        pattern.replaceAll('{profileFolder}', profileFolder)
    );
}

export function isDrainageCapProfile(profileOrId) {
    const entry = getProfileCatalogEntry(profileOrId);
    if (entry?.accessoryType === 'drainage-cap') return true;

    if (profileOrId && typeof profileOrId === 'object') {
        return profileOrId.componentType === 'drainage-cap'
            || profileOrId.accessoryType === 'drainage-cap';
    }

    return false;
}

function normalizeComponentSource(value) {
    return String(value || 'component')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\.svg$/i, '')
        .replace(/[^a-zA-Z0-9/_-]+/g, '-')
        .replace(/\/+/g, '/');
}

function inferFallbackComponentType(materialKey) {
    switch (materialKey) {
        case 'alu':
            return 'aluminium-profile-component';
        case 'epdm':
            return 'gasket-or-seal';
        case 'centralSeal':
            return 'locking-component';
        case 'iso':
            return 'insulating-bar';
        case 'foam':
            return 'insulating-foam';
        case 'glass':
            return 'glass';
        default:
            return 'profile-component';
    }
}

export function createLegacyComponentMetadata({ profileFolder, part, materialKey }) {
    const directCatalogEntry = getProfileCatalogEntry(part.blockName);
    const parentCatalogEntry = getProfileCatalogEntry(part.parentBlock);
    const catalogEntry = directCatalogEntry || parentCatalogEntry;
    const isGlazingBeadChild = !directCatalogEntry
        && parentCatalogEntry?.componentType === 'glazing-bead';
    const source = normalizeComponentSource(
        part.relativeUrl || part.filename || part.blockName || `part-${part.index}`
    );
    const section = part.section || 'top';

    return {
        componentId: `legacy:${profileFolder}:${section}:${source}`,
        componentType: directCatalogEntry?.componentType
            || (isGlazingBeadChild ? 'glazing-bead-child' : inferFallbackComponentType(materialKey)),
        componentRole: directCatalogEntry?.accessoryType
            || (isGlazingBeadChild ? 'glazing-bead-child' : part.role || 'component'),
        profileId: getProfileId(part.blockName) || getProfileId(part.parentBlock),
        catalogProfileId: catalogEntry?.id || null,
        accessoryType: directCatalogEntry?.accessoryType || null,
        legacyIndex: part.index,
    };
}
