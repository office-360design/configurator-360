import {
    DEFAULT_GLAZING_SYSTEM_ID,
    DEFAULT_LEGACY_PROFILE_SET_ID,
    GLAZING_SYSTEMS,
    getLegacyProfileSet,
    getLegacyProfileSets,
    getProfileCatalogEntry,
} from './profile-catalog.js';

function normalizeThicknessMm(value, fallback = 24) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveGlazingComponents(
    thicknessMm,
    glazingSystemId = DEFAULT_GLAZING_SYSTEM_ID
) {
    const system = GLAZING_SYSTEMS[glazingSystemId]
        || GLAZING_SYSTEMS[DEFAULT_GLAZING_SYSTEM_ID];
    const thickness = normalizeThicknessMm(thicknessMm);

    const beadRule = system.glazingBeadRules?.find(
        rule => thickness >= rule.min && thickness <= rule.max
    );

    const remainder = ((thickness % 5) + 5) % 5;
    const gasketRule = system.gasketRules?.find(
        rule => rule.remainders?.includes(remainder)
    );

    return {
        glazingSystemId: system.id,
        glassThicknessMm: thickness,
        fixedGasketProfileId: system.fixedGasketProfileId || null,
        glazingBeadProfileId: beadRule?.profileId
            || system.fallbackGlazingBeadProfileId
            || null,
        movableGasketProfileId: gasketRule?.profileId
            || system.fallbackGasketProfileId
            || null,
    };
}

export function resolveGlazingBeadProfileId(
    thicknessMm,
    glazingSystemId = DEFAULT_GLAZING_SYSTEM_ID
) {
    return resolveGlazingComponents(thicknessMm, glazingSystemId)
        .glazingBeadProfileId;
}

export function resolveMovableGasketProfileId(
    thicknessMm,
    glazingSystemId = DEFAULT_GLAZING_SYSTEM_ID
) {
    return resolveGlazingComponents(thicknessMm, glazingSystemId)
        .movableGasketProfileId;
}

export function getCompatibleLegacyProfileSets() {
    // Legacy complete sections are geometry sources, not compatibility rules.
    return getLegacyProfileSets();
}

function isNormalSashProfile(profile) {
    return profile?.profileClass === 'sash';
}

export function resolveLegacyProfileSelection({
    profileSetId = null,
    outerFrameProfileId = null,
    sashProfileId = null,
    fallbackProfileSetId = DEFAULT_LEGACY_PROFILE_SET_ID,
} = {}) {
    const requestedProfileSet = profileSetId
        ? getLegacyProfileSet(profileSetId)
        : null;
    const fallbackProfileSet = getLegacyProfileSet(fallbackProfileSetId)
        || getLegacyProfileSets()[0]
        || null;
    const selectedProfileSet = requestedProfileSet || fallbackProfileSet;

    const selectedOuterFrameProfileId = outerFrameProfileId
        || selectedProfileSet?.outerFrameProfileId
        || null;
    const selectedSashProfileId = sashProfileId
        || selectedProfileSet?.sashProfileId
        || null;

    const outerFrame = selectedOuterFrameProfileId
        ? getProfileCatalogEntry(selectedOuterFrameProfileId)
        : null;
    const sash = selectedSashProfileId
        ? getProfileCatalogEntry(selectedSashProfileId)
        : null;

    if (!selectedProfileSet) {
        return {
            compatible: false,
            reason: 'unknown-profile-set',
            profileSetId: null,
            outerFrameProfileId: selectedOuterFrameProfileId,
            sashProfileId: selectedSashProfileId,
            profileSet: null,
        };
    }

    if (outerFrame?.profileClass !== 'outer-frame') {
        return {
            compatible: false,
            reason: 'invalid-outer-frame-profile',
            profileSetId: selectedProfileSet.id,
            outerFrameProfileId: selectedProfileSet.outerFrameProfileId,
            sashProfileId: selectedSashProfileId,
            profileSet: selectedProfileSet,
        };
    }

    if (!isNormalSashProfile(sash)) {
        return {
            compatible: false,
            reason: 'invalid-sash-profile',
            profileSetId: selectedProfileSet.id,
            outerFrameProfileId: selectedOuterFrameProfileId,
            sashProfileId: selectedProfileSet.sashProfileId,
            profileSet: selectedProfileSet,
        };
    }

    return {
        compatible: true,
        reason: null,
        profileSetId: selectedProfileSet.id,
        outerFrameProfileId: selectedOuterFrameProfileId,
        sashProfileId: selectedSashProfileId,
        profileSet: selectedProfileSet,
    };
}

export function resolveProfileClosure({
    hostProfileId,
    closesAgainst,
    glassThicknessMm = 24,
} = {}) {
    const hostProfile = getProfileCatalogEntry(hostProfileId);
    if (!hostProfile || hostProfile.type !== 'base-aluminium-profile') {
        return {
            compatible: false,
            reason: 'unknown-host-profile',
            hostProfile: null,
            glazing: null,
        };
    }

    if (!hostProfile.capabilities?.closesAgainst?.includes(closesAgainst)) {
        return {
            compatible: false,
            reason: 'closure-not-supported',
            hostProfile,
            glazing: null,
        };
    }

    if (closesAgainst !== 'fixed-glass') {
        return {
            compatible: true,
            reason: null,
            hostProfile,
            glazing: null,
        };
    }

    const glazingSystemId = hostProfile.compatibleAccessories?.glazingSystems
        ?.find(systemId => GLAZING_SYSTEMS[systemId]?.usage === 'fixed-glass');

    if (!glazingSystemId) {
        return {
            compatible: false,
            reason: 'missing-fixed-glazing-system',
            hostProfile,
            glazing: null,
        };
    }

    return {
        compatible: true,
        reason: null,
        hostProfile,
        glazing: resolveGlazingComponents(glassThicknessMm, glazingSystemId),
    };
}

function getCompatibleAccessoryIds(hostProfile) {
    if (!hostProfile?.compatibleAccessories) return [];

    return Object.values(hostProfile.compatibleAccessories)
        .flatMap(value => Array.isArray(value) ? value : [])
        .map(String);
}

export function resolveAccessoryPlacement({
    accessoryProfileId,
    profileSetId = null,
    hostProfileId = null,
    side = null,
    location = null,
} = {}) {
    const accessory = getProfileCatalogEntry(accessoryProfileId);
    if (!accessory || accessory.type !== 'profile-accessory') {
        return {
            compatible: false,
            reason: 'unknown-accessory',
            accessory: null,
            hostProfile: null,
        };
    }

    const profileSet = profileSetId ? getLegacyProfileSet(profileSetId) : null;
    const resolvedHostProfileId = hostProfileId || profileSet?.outerFrameProfileId || null;
    const hostProfile = resolvedHostProfileId
        ? getProfileCatalogEntry(resolvedHostProfileId)
        : null;
    const attachment = accessory.attachment || {};

    if (side && attachment.permittedSides?.length
        && !attachment.permittedSides.includes(side)) {
        return {
            compatible: false,
            reason: 'side-not-permitted',
            accessory,
            hostProfile,
        };
    }

    if (location && attachment.location && attachment.location !== location) {
        return {
            compatible: false,
            reason: 'location-not-permitted',
            accessory,
            hostProfile,
        };
    }

    if (attachment.hostProfileIds?.length) {
        if (!resolvedHostProfileId || !attachment.hostProfileIds.includes(resolvedHostProfileId)) {
            return {
                compatible: false,
                reason: 'host-profile-not-permitted',
                accessory,
                hostProfile,
            };
        }
    }

    if (attachment.hostProfileClasses?.length) {
        if (!hostProfile || !attachment.hostProfileClasses.includes(hostProfile.profileClass)) {
            return {
                compatible: false,
                reason: 'host-profile-class-not-permitted',
                accessory,
                hostProfile,
            };
        }
    }

    if (hostProfile && attachment.requireHostCompatibilityListing === true) {
        const compatibleAccessoryIds = getCompatibleAccessoryIds(hostProfile);
        if (!compatibleAccessoryIds.includes(accessory.id)) {
            return {
                compatible: false,
                reason: 'host-profile-does-not-list-accessory',
                accessory,
                hostProfile,
            };
        }
    }

    return {
        compatible: true,
        reason: null,
        accessory,
        hostProfile,
        side,
        location: location || attachment.location || null,
    };
}

export function isAccessoryPlacementCompatible(options) {
    return resolveAccessoryPlacement(options).compatible;
}
