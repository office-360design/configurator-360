import {
    getLegacyProfileSet,
    getPreferredLegacyProfileSetIdForProfile,
    getProfileCatalogEntry,
    getSupplementalAccessoryCatalogEntries,
    getSupplementalAccessorySourceProfileSetIds,
} from './profile-catalog.js';

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function createProfileSelectionSignature(selection = {}) {
    return [
        selection.profileSetId || selection.profile || '',
        selection.outerFrameProfileId || '',
        selection.sashProfileId || '',
    ].join('|');
}

export function resolveLegacyProfileSources(selection = {}) {
    const profileSetId = selection.profileSetId || selection.profile || null;
    const profileSet = getLegacyProfileSet(profileSetId);
    const outerFrameProfileId = selection.outerFrameProfileId
        || profileSet?.outerFrameProfileId
        || null;
    const sashProfileId = selection.sashProfileId
        || profileSet?.sashProfileId
        || null;

    const frameSourceProfileSetId = getPreferredLegacyProfileSetIdForProfile(
        outerFrameProfileId,
        profileSetId
    );
    const sashSourceProfileSetId = getPreferredLegacyProfileSetIdForProfile(
        sashProfileId,
        profileSetId
    );

    return {
        profileSetId,
        outerFrameProfileId,
        sashProfileId,
        frameSourceProfileSetId,
        sashSourceProfileSetId,
        usesSingleLegacyAssembly:
            Boolean(profileSet)
            && profileSet.outerFrameProfileId === outerFrameProfileId
            && profileSet.sashProfileId === sashProfileId,
    };
}

export function getProfileAlignmentShift(sourceMetadata, targetMetadata, section = 'top') {
    const shiftX = finiteNumber(targetMetadata?.globalCenterX)
        - finiteNumber(sourceMetadata?.globalCenterX);

    const shiftY = section === 'bottom'
        ? finiteNumber(targetMetadata?.globalMinY) - finiteNumber(sourceMetadata?.globalMinY)
        : finiteNumber(targetMetadata?.globalMaxY) - finiteNumber(sourceMetadata?.globalMaxY);

    return { shiftX, shiftY };
}

function cloneAlignedProfiles({
    profiles,
    sourceMetadata,
    targetMetadata,
    role,
    sourceProfileSetId,
}) {
    return profiles
        .filter(profile => profile.role === role)
        .map(profile => {
            const alignment = getProfileAlignmentShift(
                sourceMetadata,
                targetMetadata,
                profile.section || 'top'
            );

            return {
                ...profile,
                sourceProfileSetId,
                cadAlignmentShiftXMm: alignment.shiftX,
                cadAlignmentShiftYMm: alignment.shiftY,
            };
        });
}

export function composeLegacyProfileDefinitions({
    selection,
    definitionsByProfileSetId,
}) {
    const sources = resolveLegacyProfileSources(selection);
    const frameEntry = getProfileCatalogEntry(sources.outerFrameProfileId);
    const sashEntry = getProfileCatalogEntry(sources.sashProfileId);

    if (frameEntry?.profileClass !== 'outer-frame') {
        throw new Error(`Profile ${sources.outerFrameProfileId || '(missing)'} is not an outer frame.`);
    }
    if (sashEntry?.profileClass !== 'sash') {
        throw new Error(`Profile ${sources.sashProfileId || '(missing)'} is not a normal sash.`);
    }
    if (!sources.frameSourceProfileSetId) {
        throw new Error(
            `Outer frame ${sources.outerFrameProfileId} has no converted SVG geometry yet.`
        );
    }
    if (!sources.sashSourceProfileSetId) {
        throw new Error(
            `Sash ${sources.sashProfileId} has no converted SVG geometry yet.`
        );
    }

    if (sources.usesSingleLegacyAssembly) {
        const definition = definitionsByProfileSetId.get(sources.profileSetId);
        if (!definition) {
            throw new Error(`Missing loaded profile definition ${sources.profileSetId}.`);
        }

        return {
            metadata: {
                ...definition.metadata,
                profileSetId: sources.profileSetId,
                outerFrameProfileId: sources.outerFrameProfileId,
                sashProfileId: sources.sashProfileId,
                isCompositeProfileSelection: false,
            },
            profiles: definition.profiles.map(profile => ({
                ...profile,
                sourceProfileSetId: sources.profileSetId,
                cadAlignmentShiftXMm: 0,
                cadAlignmentShiftYMm: 0,
            })),
            sources,
        };
    }

    const frameDefinition = definitionsByProfileSetId.get(sources.frameSourceProfileSetId);
    const sashDefinition = definitionsByProfileSetId.get(sources.sashSourceProfileSetId);
    if (!frameDefinition || !sashDefinition) {
        throw new Error('One or more legacy profile sources could not be loaded.');
    }

    const targetMetadata = frameDefinition.metadata;
    const frameProfiles = cloneAlignedProfiles({
        profiles: frameDefinition.profiles,
        sourceMetadata: frameDefinition.metadata,
        targetMetadata,
        role: 'frame',
        sourceProfileSetId: sources.frameSourceProfileSetId,
    });
    const sashProfiles = cloneAlignedProfiles({
        profiles: sashDefinition.profiles,
        sourceMetadata: sashDefinition.metadata,
        targetMetadata,
        role: 'sash',
        sourceProfileSetId: sources.sashSourceProfileSetId,
    });

    const profiles = [...frameProfiles, ...sashProfiles].map((profile, index) => ({
        ...profile,
        legacyIndex: profile.legacyIndex ?? profile.index,
        index,
    }));

    return {
        metadata: {
            ...targetMetadata,
            dwgName: `composite:${sources.outerFrameProfileId}+${sources.sashProfileId}`,
            profileSetId: sources.profileSetId,
            outerFrameProfileId: sources.outerFrameProfileId,
            sashProfileId: sources.sashProfileId,
            frameSourceProfileSetId: sources.frameSourceProfileSetId,
            sashSourceProfileSetId: sources.sashSourceProfileSetId,
            isCompositeProfileSelection: true,
        },
        profiles,
        sources,
    };
}


export function getRequiredSupplementalAccessorySourceProfileSetIds() {
    return getSupplementalAccessorySourceProfileSetIds();
}

export function composeSupplementalAccessoryProfiles({
    definition,
    definitionsByProfileSetId,
}) {
    if (!definition?.metadata || !Array.isArray(definition.profiles)) {
        return definition;
    }

    const existingProfileIds = new Set(
        definition.profiles
            .map(profile => profile.catalogProfileId || profile.profileId)
            .filter(Boolean)
            .map(String)
    );
    const supplementalProfiles = [];

    for (const entry of getSupplementalAccessoryCatalogEntries()) {
        if (existingProfileIds.has(entry.id)) continue;

        const sourceProfileSetId = entry.legacy.profileSets.find(profileSetId =>
            definitionsByProfileSetId.has(profileSetId)
        );
        if (!sourceProfileSetId) continue;

        const sourceDefinition = definitionsByProfileSetId.get(sourceProfileSetId);
        const matchingProfiles = sourceDefinition.profiles.filter(profile =>
            String(profile.catalogProfileId || profile.profileId || '') === entry.id
        );

        matchingProfiles.forEach(profile => {
            const alignment = getProfileAlignmentShift(
                sourceDefinition.metadata,
                definition.metadata,
                profile.section || 'top'
            );
            supplementalProfiles.push({
                ...profile,
                sourceProfileSetId,
                cadAlignmentShiftXMm: alignment.shiftX,
                cadAlignmentShiftYMm: alignment.shiftY,
                isSupplementalAccessoryProfile: true,
            });
        });

        if (matchingProfiles.length) existingProfileIds.add(entry.id);
    }

    if (!supplementalProfiles.length) return definition;

    const profiles = [...definition.profiles, ...supplementalProfiles].map(
        (profile, index) => ({
            ...profile,
            legacyIndex: profile.legacyIndex ?? profile.index,
            index,
        })
    );

    return {
        ...definition,
        metadata: {
            ...definition.metadata,
            supplementalAccessoryProfileIds: supplementalProfiles
                .map(profile => profile.catalogProfileId || profile.profileId)
                .filter(Boolean),
        },
        profiles,
    };
}
