import {
    getLegacyProfileSet,
    getPreferredLegacyProfileSetIdForProfile,
    getProfileCatalogEntry,
    getSupplementalAccessoryCatalogEntries,
    getSupplementalAccessorySourceProfileSetIds,
    isStandaloneProfileGeometryRegistered,
} from './profile-catalog.js';
import {
    composeCadTransforms,
    fitStandaloneProfileTransform,
    getAlignedLegacyBbox,
    invertCadTransform,
    transformCadBbox,
    transformCadPoint,
} from './profile-coordinate-transform.js';
import {
    projectConnectionDelta,
    resolveConnectionOccurrence,
    resolveConnectionOccurrences,
    resolveConnectionRuntimeBasis,
} from './connection-template-loader.js';

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function createProfileSelectionSignature(selection = {}) {
    // Profile/CAD loading is independent of the editable window topology.
    // All fixed/fixed, fixed/sash and sash/sash divider connections are cached
    // together for the selected mullion/transom profile, so adding, merging or
    // changing a window type must not force a profile reload.
    return [
        selection.profileSetId || selection.profile || '',
        selection.outerFrameProfileId || '',
        selection.sashProfileId || '',
        selection.dividerProfileId || '',
        selection.transProfileId || '',
    ].join('|').replace(/\|+$/, '');
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


function normalizeBlockName(value) {
    return String(value || '').trim().toLowerCase();
}

function getStandaloneCadLayerStyle(profile = {}) {
    const layer = String(profile.layer || '').toLowerCase();
    const isAluminium = layer.includes('al') || layer.includes('alu');
    const isFoam = layer.includes('dämmung')
        || layer.includes('daemmung')
        || layer.includes('dämm')
        || layer.includes('daemm')
        || layer.includes('foam');
    const isInsulation = !isFoam && (
        layer.includes('isolation')
        || layer.includes('isoli')
        || layer.includes('iso')
    );

    if (isAluminium) {
        return Object.freeze({
            materialKey: 'alu',
            baseCadColor: '#adadad',
            isAlu: true,
        });
    }
    if (isFoam) {
        return Object.freeze({
            materialKey: 'foam',
            baseCadColor: '#00ffbf',
            isAlu: false,
        });
    }
    if (isInsulation) {
        return Object.freeze({
            materialKey: 'iso',
            baseCadColor: '#66cc7f',
            isAlu: false,
        });
    }

    return Object.freeze({
        materialKey: profile.materialKey || 'default',
        baseCadColor: profile.baseCadColor || '#78716c',
        isAlu: profile.isAlu === true,
    });
}

function bboxCenter(bbox) {
    return {
        x: (finiteNumber(bbox?.minX) + finiteNumber(bbox?.maxX)) / 2,
        y: (finiteNumber(bbox?.minY) + finiteNumber(bbox?.maxY)) / 2,
    };
}

function translateTransformToBbox(sourceBbox, targetBbox, baseTransform) {
    if (!sourceBbox || !targetBbox || !baseTransform) return baseTransform;

    const transformedBbox = transformCadBbox(sourceBbox, baseTransform);
    const transformedCenter = bboxCenter(transformedBbox);
    const targetCenter = bboxCenter(targetBbox);

    return Object.freeze({
        ...baseTransform,
        tx: finiteNumber(baseTransform.tx) + targetCenter.x - transformedCenter.x,
        ty: finiteNumber(baseTransform.ty) + targetCenter.y - transformedCenter.y,
    });
}


function unionProfileSourceBounds(profiles = []) {
    const boxes = profiles.map(profile => profile?.bbox).filter(Boolean);
    if (!boxes.length) return null;
    return {
        minX: Math.min(...boxes.map(box => finiteNumber(box.minX))),
        minY: Math.min(...boxes.map(box => finiteNumber(box.minY))),
        maxX: Math.max(...boxes.map(box => finiteNumber(box.maxX))),
        maxY: Math.max(...boxes.map(box => finiteNumber(box.maxY))),
    };
}


function retargetRoleReferenceTransform(sourceBounds, occurrence) {
    if (!occurrence?.transform) return null;
    if (!String(occurrence.transformSource || '').startsWith('role-reference:')) {
        return occurrence.transform;
    }
    return translateTransformToBbox(sourceBounds, occurrence.bbox, occurrence.transform);
}

function mapJoinPointIntoWorkingAssembly({
    joinPoint,
    joinSashTransform,
    workingSashTransform,
}) {
    if (!joinPoint || !joinSashTransform || !workingSashTransform) return null;
    const inverseJoinSash = invertCadTransform(joinSashTransform);
    const sashSourcePoint = transformCadPoint(
        inverseJoinSash,
        joinPoint.x,
        joinPoint.y
    );
    return transformCadPoint(
        workingSashTransform,
        sashSourcePoint.x,
        sashSourcePoint.y
    );
}

function replaceLegacyStructuralProfilesWithStandalone({
    definition,
    standaloneDefinition,
    profileId,
    role,
}) {
    const standaloneProfiles = standaloneDefinition?.profiles || [];
    if (!standaloneProfiles.length) {
        throw new Error(`Registered standalone profile ${profileId} has no loaded components.`);
    }

    const standaloneBlockNames = new Set(
        standaloneProfiles.map(profile => normalizeBlockName(profile.blockName))
    );
    const matchedLegacyProfiles = definition.profiles.filter(profile =>
        profile.role === role
        && standaloneBlockNames.has(normalizeBlockName(profile.blockName))
    );
    const topReferenceProfiles = matchedLegacyProfiles
        .filter(profile => profile.section === 'top')
        .map(profile => ({
            ...profile,
            bbox: getAlignedLegacyBbox(profile),
        }));

    if (topReferenceProfiles.length !== standaloneProfiles.length) {
        throw new Error(
            `Standalone profile ${profileId} matched ${topReferenceProfiles.length} of `
            + `${standaloneProfiles.length} required top-section components.`
        );
    }

    const coordinateTransform = fitStandaloneProfileTransform({
        sourceProfiles: standaloneProfiles,
        targetProfiles: topReferenceProfiles,
    });
    const legacyProfilesByBlockName = new Map();

    matchedLegacyProfiles.forEach(profile => {
        const key = normalizeBlockName(profile.blockName);
        if (!legacyProfilesByBlockName.has(key)) {
            legacyProfilesByBlockName.set(key, []);
        }
        legacyProfilesByBlockName.get(key).push(profile);
    });

    const replacementProfiles = standaloneProfiles.map(profile => {
        const key = normalizeBlockName(profile.blockName);
        const legacyProfiles = legacyProfilesByBlockName.get(key) || [];
        const topReference = legacyProfiles.find(candidate => candidate.section === 'top')
            || legacyProfiles[0];
        const legacyIndexes = [...new Set(
            legacyProfiles
                .map(candidate => candidate.legacyIndex ?? candidate.index)
                .filter(index => index !== null && index !== undefined)
        )];
        const effectiveBbox = transformCadBbox(profile.bbox, coordinateTransform);
        const effectiveCenterX = effectiveBbox
            ? (effectiveBbox.minX + effectiveBbox.maxX) / 2
            : definition.metadata.globalCenterX;
        const resolvedMaterialKey = topReference?.materialKey || profile.materialKey;
        const sectionSamplePlacements = legacyProfiles
            .filter(candidate => candidate.section === 'top' || candidate.section === 'bottom')
            .map(candidate => ({
                section: candidate.section,
                cadCoordinateTransform: translateTransformToBbox(
                    profile.bbox,
                    getAlignedLegacyBbox(candidate),
                    coordinateTransform
                ),
            }));

        return {
            ...profile,
            role,
            section: 'top',
            placementSection: 'all',
            sectionSamplePlacements,
            sourceProfileSetId: `standalone:${profileId}`,
            geometrySource: 'standalone-profile',
            cadCoordinateTransform: coordinateTransform,
            cadAlignmentShiftXMm: 0,
            cadAlignmentShiftYMm: 0,
            legacyIndex: legacyIndexes[0] ?? null,
            legacyIndexes,
            baseCadColor: topReference?.baseCadColor
                || topReference?.color
                || profile.baseCadColor,
            materialKey: resolvedMaterialKey,
            isAlu: typeof topReference?.isAlu === 'boolean'
                ? topReference.isAlu
                : profile.isAlu,
            aluminiumSide: resolvedMaterialKey === 'alu'
                ? (effectiveCenterX < definition.metadata.globalCenterX ? 'outside' : 'inside')
                : null,
        };
    });

    const firstLegacyIndex = definition.profiles.findIndex(profile =>
        matchedLegacyProfiles.includes(profile)
    );
    const remainingProfiles = definition.profiles.filter(profile =>
        !matchedLegacyProfiles.includes(profile)
    );
    const insertionIndex = firstLegacyIndex < 0
        ? remainingProfiles.length
        : Math.min(firstLegacyIndex, remainingProfiles.length);
    remainingProfiles.splice(insertionIndex, 0, ...replacementProfiles);

    return {
        ...definition,
        metadata: {
            ...definition.metadata,
            standaloneBaseProfileIds: [
                ...(definition.metadata.standaloneBaseProfileIds || []),
                profileId,
            ],
            standaloneAlignment: {
                ...(definition.metadata.standaloneAlignment || {}),
                [profileId]: {
                    rotationDeg: coordinateTransform.rotationDeg,
                    rmsErrorMm: coordinateTransform.rmsErrorMm,
                    matchCount: coordinateTransform.matchCount,
                },
            },
            usesStandaloneBaseProfiles: true,
        },
        profiles: remainingProfiles,
    };
}


function appendStandaloneDividerProfiles({
    definition,
    standaloneDefinition,
    profileId,
    orientation,
    connectionTemplate = null,
    placementConnectionTemplate = connectionTemplate,
}) {
    const standaloneProfiles = standaloneDefinition?.profiles || [];
    if (!standaloneProfiles.length) {
        throw new Error(`Registered divider profile ${profileId} has no loaded components.`);
    }

    const sourceMetadata = standaloneDefinition.metadata || {};
    const sourceBounds = {
        minX: finiteNumber(sourceMetadata.globalMinX),
        maxX: finiteNumber(sourceMetadata.globalMaxX),
        minY: finiteNumber(sourceMetadata.globalMinY),
        maxY: finiteNumber(sourceMetadata.globalMaxY),
    };
    const sourceCenterX = (sourceBounds.minX + sourceBounds.maxX) / 2;
    const sourceCenterY = (sourceBounds.minY + sourceBounds.maxY) / 2;

    const connectionDividerOccurrence = connectionTemplate
        ? resolveConnectionOccurrence(connectionTemplate, profileId, 'mullion-transom')
        : null;
    const dividerOccurrence = placementConnectionTemplate
        ? resolveConnectionOccurrence(placementConnectionTemplate, profileId, 'mullion-transom')
        : null;
    const sashOccurrences = placementConnectionTemplate
        ? resolveConnectionOccurrences(
            placementConnectionTemplate,
            definition.sources?.sashProfileId,
            'opening-sash'
        )
        : [];
    const sashOccurrence = sashOccurrences[0] || null;

    // Frame and sash standalone profiles are already fitted to the legacy B2
    // assembly coordinate system. The connection DWG lives in a different
    // coordinate system, so do not add a raw join-space centre delta to the
    // B2-aligned sash centre. Instead use the sash as the coordinate bridge:
    //   divider source -> join -> sash source -> working B2 assembly.
    const workingSashProfiles = definition.profiles.filter(profile =>
        profile.role === 'sash'
        && profile.geometrySource === 'standalone-profile'
        && profile.cadCoordinateTransform
    );
    const workingSashTransform = workingSashProfiles[0]?.cadCoordinateTransform || null;
    const sashSourceBounds = unionProfileSourceBounds(workingSashProfiles);
    const joinSashTransform = sashOccurrence
        ? retargetRoleReferenceTransform(sashSourceBounds, sashOccurrence)
        : null;
    const coordinateTransform = dividerOccurrence
        ? retargetRoleReferenceTransform(sourceBounds, dividerOccurrence)
        : null;

    const dividerSourceBounds = coordinateTransform
        ? transformCadBbox(sourceBounds, coordinateTransform)
        : sourceBounds;
    const dividerCenter = coordinateTransform
        ? transformCadPoint(coordinateTransform, sourceCenterX, sourceCenterY)
        : bboxCenter(dividerOccurrence?.bbox || dividerSourceBounds);
    const sashCenter = bboxCenter(sashOccurrence?.bbox);
    const connectionRuntimeBasis = placementConnectionTemplate
        ? resolveConnectionRuntimeBasis(placementConnectionTemplate)
        : null;
    const connectionCenterDelta = sashCenter && dividerCenter
        ? projectConnectionDelta(
            connectionRuntimeBasis,
            dividerCenter.x - sashCenter.x,
            dividerCenter.y - sashCenter.y
        )
        : { depth: 0, face: 0 };

    const dividerAssemblyCenter = placementConnectionTemplate
        ? mapJoinPointIntoWorkingAssembly({
            joinPoint: dividerCenter,
            joinSashTransform,
            workingSashTransform,
        })
        : null;
    const dividerDepthCenterFromAssemblyCenterMm = dividerAssemblyCenter
        ? dividerAssemblyCenter.x - finiteNumber(definition.metadata.globalCenterX)
        : 0;

    // The sash used by the legacy B2 assembly is positioned from a virtual
    // outer-boundary rectangle.  Reusing the mullion's visible half-width as
    // that rectangle boundary makes the sash much too small because its own
    // cross-section already has a substantial inward offset.  Derive the
    // divider-side virtual boundary from the left/right join itself instead:
    // keep the sash source reference at the CAD join distance from the mullion,
    // then subtract the same reference's inward offset in the working B2 frame.
    const sashSourceCenter = sashSourceBounds ? bboxCenter(sashSourceBounds) : null;
    const joinSashReference = sashSourceCenter && joinSashTransform
        ? transformCadPoint(
            joinSashTransform,
            sashSourceCenter.x,
            sashSourceCenter.y
        )
        : null;
    const workingSashReference = sashSourceCenter && workingSashTransform
        ? transformCadPoint(
            workingSashTransform,
            sashSourceCenter.x,
            sashSourceCenter.y
        )
        : null;
    const workingSashInwardReferenceMm = workingSashReference
        ? finiteNumber(definition.metadata.globalMaxY) - workingSashReference.y
        : null;
    const openingSashDividerBoundariesMm = {};
    const semanticOpeningSashSides = ['left', 'right'].filter(side =>
        placementConnectionTemplate?.[`${side}Cell`] === 'opening-sash'
    );
    const semanticSingleOpeningSashSide = semanticOpeningSashSides.length === 1
        ? semanticOpeningSashSides[0]
        : null;
    if (
        sashSourceCenter
        && dividerCenter
        && Number.isFinite(workingSashInwardReferenceMm)
    ) {
        const candidatesBySide = new Map();
        for (const occurrence of sashOccurrences) {
            const occurrenceTransform = retargetRoleReferenceTransform(
                sashSourceBounds,
                occurrence
            );
            const occurrenceReference = occurrenceTransform
                ? transformCadPoint(
                    occurrenceTransform,
                    sashSourceCenter.x,
                    sashSourceCenter.y
                )
                : null;
            if (!occurrenceReference) continue;

            const geometricSide = occurrenceReference.x < dividerCenter.x ? 'left' : 'right';
            const side = semanticSingleOpeningSashSide || geometricSide;
            if (placementConnectionTemplate?.[`${side}Cell`] !== 'opening-sash') continue;
            const sideSign = side === 'left' ? -1 : 1;
            const joinFaceDistanceMm = Math.abs(occurrenceReference.x - dividerCenter.x);
            const boundaryMm = sideSign * (
                joinFaceDistanceMm - workingSashInwardReferenceMm
            );
            if (!Number.isFinite(boundaryMm)) continue;
            if (!candidatesBySide.has(side)) candidatesBySide.set(side, []);
            candidatesBySide.get(side).push({
                boundaryMm,
                joinFaceDistanceMm,
            });
        }
        for (const [side, candidates] of candidatesBySide) {
            candidates.sort((left, right) =>
                left.joinFaceDistanceMm - right.joinFaceDistanceMm
            );
            openingSashDividerBoundariesMm[side] = candidates[0].boundaryMm;
        }
    }
    const openingSashBoundarySides = Object.keys(openingSashDividerBoundariesMm);
    const openingSashCellSide = openingSashBoundarySides.length === 1
        ? openingSashBoundarySides[0]
        : null;
    const openingSashDividerBoundaryFromCenterMm = openingSashCellSide
        ? openingSashDividerBoundariesMm[openingSashCellSide]
        : null;

    const dividerProfiles = standaloneProfiles.map(profile => {
        const centerY = profile.bbox
            ? (finiteNumber(profile.bbox.minY) + finiteNumber(profile.bbox.maxY)) / 2
            : sourceCenterY;
        const cadLayerStyle = getStandaloneCadLayerStyle(profile);

        return {
            ...profile,
            role: 'divider',
            componentRole: 'mullion-transom',
            section: 'top',
            placementSection: 'divider',
            sourceProfileSetId: `standalone:${profileId}`,
            geometrySource: 'standalone-divider-profile',
            dividerProfileId: profileId,
            dividerOrientation: orientation,
            // Keep the visually verified standalone section plane. Only the
            // front/back correction is applied; join transforms provide the
            // placement reference rather than another section rotation.
            dividerSectionRotationDeg: connectionTemplate ? 180 : 0,
            dividerSourceBounds: {
                ...dividerSourceBounds,
                centerX: (dividerSourceBounds.minX + dividerSourceBounds.maxX) / 2,
                centerY: (dividerSourceBounds.minY + dividerSourceBounds.maxY) / 2,
            },
            cadCoordinateTransform: coordinateTransform,
            connectionTemplateId: connectionTemplate?.id || null,
            connectionTransformSource: connectionDividerOccurrence?.transformSource
                || dividerOccurrence?.transformSource
                || null,
            placementConnectionTemplateId: placementConnectionTemplate?.id || null,
            cadAlignmentShiftXMm: 0,
            cadAlignmentShiftYMm: 0,
            baseCadColor: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.baseCadColor
                : (profile.baseCadColor || cadLayerStyle.baseCadColor),
            materialKey: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.materialKey
                : (profile.materialKey || cadLayerStyle.materialKey),
            isAlu: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.isAlu
                : (profile.isAlu === true),
            aluminiumSide: cadLayerStyle.materialKey === 'alu'
                ? (centerY < sourceCenterY ? 'outside' : 'inside')
                : null,
            legacyIndex: null,
            legacyIndexes: [],
        };
    });

    return {
        ...definition,
        metadata: {
            ...definition.metadata,
            windowLayout: orientation === 'vertical'
                ? 'vertical-divider'
                : 'horizontal-divider',
            dividerProfileId: profileId,
            dividerOrientation: orientation,
            dividerSourceBounds: dividerProfiles[0]?.dividerSourceBounds || null,
            dividerConnection: connectionTemplate
                ? {
                    templateId: connectionTemplate.id,
                    leftCell: connectionTemplate.leftCell || null,
                    rightCell: connectionTemplate.rightCell || null,
                    dividerProfileId: profileId,
                    sashProfileId: definition.sources?.sashProfileId || null,
                    dividerTransformSource: connectionDividerOccurrence?.transformSource
                        || dividerOccurrence?.transformSource
                        || null,
                    sashTransformSource: sashOccurrence?.transformSource || null,
                    placementTemplateId: placementConnectionTemplate?.id || null,
                    sectionRotationDeg: 180,
                    orientationMode: 'standalone-canonical-with-front-back-correction',
                    depthCenterFromAssemblyCenterMm: dividerDepthCenterFromAssemblyCenterMm,
                    depthOffsetMethod: placementConnectionTemplate?.id === connectionTemplate.id
                        ? 'join-to-b2-sash-coordinate-bridge'
                        : `shared-mullion-placement-bridge:${placementConnectionTemplate?.id || 'none'}`,
                    joinCenterDeltaDepthMm: connectionCenterDelta.depth,
                    joinCenterDeltaFaceMm: connectionCenterDelta.face,
                    openingSashCellSide,
                    openingSashDividerBoundaryFromCenterMm,
                    openingSashDividerBoundariesMm: Object.freeze({
                        ...openingSashDividerBoundariesMm,
                    }),
                    openingSashBoundaryMethod: openingSashBoundarySides.length
                        ? 'per-side-left-right-join-reference-minus-working-sash-inward-offset'
                        : null,
                }
                : null,
            usesCadConnectionTemplate: Boolean(connectionTemplate),
            usesStandaloneDividerProfile: true,
        },
        profiles: [...definition.profiles, ...dividerProfiles],
    };
}


function appendStandaloneTransProfiles({
    definition,
    standaloneDefinition,
    profileId,
    orientation,
    connectionTemplate = null,
    placementConnectionTemplate = connectionTemplate,
}) {
    const standaloneProfiles = standaloneDefinition?.profiles || [];
    if (!standaloneProfiles.length) {
        throw new Error(`Registered trans profile ${profileId} has no loaded components.`);
    }

    const sourceMetadata = standaloneDefinition.metadata || {};
    const sourceBounds = {
        minX: finiteNumber(sourceMetadata.globalMinX),
        maxX: finiteNumber(sourceMetadata.globalMaxX),
        minY: finiteNumber(sourceMetadata.globalMinY),
        maxY: finiteNumber(sourceMetadata.globalMaxY),
    };
    const sourceCenterX = (sourceBounds.minX + sourceBounds.maxX) / 2;
    const sourceCenterY = (sourceBounds.minY + sourceBounds.maxY) / 2;

    const connectionTransOccurrence = connectionTemplate
        ? resolveConnectionOccurrence(connectionTemplate, profileId, 'trans')
        : null;
    const transOccurrence = placementConnectionTemplate
        ? resolveConnectionOccurrence(placementConnectionTemplate, profileId, 'trans')
        : null;
    const sashOccurrences = placementConnectionTemplate
        ? resolveConnectionOccurrences(
            placementConnectionTemplate,
            definition.sources?.sashProfileId,
            'opening-sash'
        )
        : [];
    const sashOccurrence = sashOccurrences[0] || null;

    // Frame and sash standalone profiles are already fitted to the legacy B2
    // assembly coordinate system. The connection DWG lives in a different
    // coordinate system, so do not add a raw join-space centre delta to the
    // B2-aligned sash centre. Instead use the sash as the coordinate bridge:
    //   trans source -> join -> sash source -> working B2 assembly.
    const workingSashProfiles = definition.profiles.filter(profile =>
        profile.role === 'sash'
        && profile.geometrySource === 'standalone-profile'
        && profile.cadCoordinateTransform
    );
    const workingSashTransform = workingSashProfiles[0]?.cadCoordinateTransform || null;
    const sashSourceBounds = unionProfileSourceBounds(workingSashProfiles);
    const joinSashTransform = sashOccurrence
        ? retargetRoleReferenceTransform(sashSourceBounds, sashOccurrence)
        : null;
    const coordinateTransform = transOccurrence
        ? retargetRoleReferenceTransform(sourceBounds, transOccurrence)
        : null;

    const transSourceBounds = coordinateTransform
        ? transformCadBbox(sourceBounds, coordinateTransform)
        : sourceBounds;
    const transCenter = coordinateTransform
        ? transformCadPoint(coordinateTransform, sourceCenterX, sourceCenterY)
        : bboxCenter(transOccurrence?.bbox || transSourceBounds);
    const sashCenter = bboxCenter(sashOccurrence?.bbox);
    const connectionRuntimeBasis = placementConnectionTemplate
        ? resolveConnectionRuntimeBasis(placementConnectionTemplate)
        : null;
    const connectionCenterDelta = sashCenter && transCenter
        ? projectConnectionDelta(
            connectionRuntimeBasis,
            transCenter.x - sashCenter.x,
            transCenter.y - sashCenter.y
        )
        : { depth: 0, face: 0 };

    const transAssemblyCenter = placementConnectionTemplate
        ? mapJoinPointIntoWorkingAssembly({
            joinPoint: transCenter,
            joinSashTransform,
            workingSashTransform,
        })
        : null;
    const transDepthCenterFromAssemblyCenterMm = transAssemblyCenter
        ? transAssemblyCenter.x - finiteNumber(definition.metadata.globalCenterX)
        : 0;

    // The sash used by the legacy B2 assembly is positioned from a virtual
    // outer-boundary rectangle.  Reusing the mullion's visible half-width as
    // that rectangle boundary makes the sash much too small because its own
    // cross-section already has a substantial inward offset.  Derive the
    // trans-side virtual boundary from the left/right join itself instead:
    // keep the sash source reference at the CAD join distance from the mullion,
    // then subtract the same reference's inward offset in the working B2 frame.
    const sashSourceCenter = sashSourceBounds ? bboxCenter(sashSourceBounds) : null;
    const joinSashReference = sashSourceCenter && joinSashTransform
        ? transformCadPoint(
            joinSashTransform,
            sashSourceCenter.x,
            sashSourceCenter.y
        )
        : null;
    const workingSashReference = sashSourceCenter && workingSashTransform
        ? transformCadPoint(
            workingSashTransform,
            sashSourceCenter.x,
            sashSourceCenter.y
        )
        : null;
    const workingSashInwardReferenceMm = workingSashReference
        ? finiteNumber(definition.metadata.globalMaxY) - workingSashReference.y
        : null;
    const openingSashTransBoundariesMm = {};
    const semanticOpeningSashSides = ['left', 'right'].filter(side =>
        placementConnectionTemplate?.[`${side}Cell`] === 'opening-sash'
    );
    const semanticSingleOpeningSashSide = semanticOpeningSashSides.length === 1
        ? semanticOpeningSashSides[0]
        : null;
    if (
        sashSourceCenter
        && transCenter
        && Number.isFinite(workingSashInwardReferenceMm)
    ) {
        const candidatesBySide = new Map();
        for (const occurrence of sashOccurrences) {
            const occurrenceTransform = retargetRoleReferenceTransform(
                sashSourceBounds,
                occurrence
            );
            const occurrenceReference = occurrenceTransform
                ? transformCadPoint(
                    occurrenceTransform,
                    sashSourceCenter.x,
                    sashSourceCenter.y
                )
                : null;
            if (!occurrenceReference) continue;

            const geometricSide = occurrenceReference.x < transCenter.x ? 'left' : 'right';
            const side = semanticSingleOpeningSashSide || geometricSide;
            if (placementConnectionTemplate?.[`${side}Cell`] !== 'opening-sash') continue;
            const sideSign = side === 'left' ? -1 : 1;
            const joinFaceDistanceMm = Math.abs(occurrenceReference.x - transCenter.x);
            const boundaryMm = sideSign * (
                joinFaceDistanceMm - workingSashInwardReferenceMm
            );
            if (!Number.isFinite(boundaryMm)) continue;
            if (!candidatesBySide.has(side)) candidatesBySide.set(side, []);
            candidatesBySide.get(side).push({
                boundaryMm,
                joinFaceDistanceMm,
            });
        }
        for (const [side, candidates] of candidatesBySide) {
            candidates.sort((left, right) =>
                left.joinFaceDistanceMm - right.joinFaceDistanceMm
            );
            openingSashTransBoundariesMm[side] = candidates[0].boundaryMm;
        }
    }
    const openingSashBoundarySides = Object.keys(openingSashTransBoundariesMm);
    const openingSashCellSide = openingSashBoundarySides.length === 1
        ? openingSashBoundarySides[0]
        : null;
    const openingSashTransBoundaryFromCenterMm = openingSashCellSide
        ? openingSashTransBoundariesMm[openingSashCellSide]
        : null;

    const transProfiles = standaloneProfiles.map(profile => {
        const centerY = profile.bbox
            ? (finiteNumber(profile.bbox.minY) + finiteNumber(profile.bbox.maxY)) / 2
            : sourceCenterY;
        const cadLayerStyle = getStandaloneCadLayerStyle(profile);

        return {
            ...profile,
            role: 'trans',
            componentRole: 'trans',
            section: 'top',
            placementSection: 'trans',
            sourceProfileSetId: `standalone:${profileId}`,
            geometrySource: 'standalone-trans-profile',
            transProfileId: profileId,
            transOrientation: orientation,
            // Keep the visually verified standalone section plane. Only the
            // front/back correction is applied; join transforms provide the
            // placement reference rather than another section rotation.
            transSectionRotationDeg: connectionTemplate ? 180 : 0,
            transSourceBounds: {
                ...transSourceBounds,
                centerX: (transSourceBounds.minX + transSourceBounds.maxX) / 2,
                centerY: (transSourceBounds.minY + transSourceBounds.maxY) / 2,
            },
            cadCoordinateTransform: coordinateTransform,
            connectionTemplateId: connectionTemplate?.id || null,
            connectionTransformSource: connectionTransOccurrence?.transformSource
                || transOccurrence?.transformSource
                || null,
            placementConnectionTemplateId: placementConnectionTemplate?.id || null,
            cadAlignmentShiftXMm: 0,
            cadAlignmentShiftYMm: 0,
            baseCadColor: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.baseCadColor
                : (profile.baseCadColor || cadLayerStyle.baseCadColor),
            materialKey: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.materialKey
                : (profile.materialKey || cadLayerStyle.materialKey),
            isAlu: cadLayerStyle.materialKey !== 'default'
                ? cadLayerStyle.isAlu
                : (profile.isAlu === true),
            aluminiumSide: cadLayerStyle.materialKey === 'alu'
                ? (centerY < sourceCenterY ? 'outside' : 'inside')
                : null,
            legacyIndex: null,
            legacyIndexes: [],
        };
    });

    return {
        ...definition,
        metadata: {
            ...definition.metadata,
            transProfileId: profileId,
            transOrientation: orientation,
            transSourceBounds: transProfiles[0]?.transSourceBounds || null,
            transConnection: connectionTemplate
                ? {
                    templateId: connectionTemplate.id,
                    leftCell: connectionTemplate.leftCell || null,
                    rightCell: connectionTemplate.rightCell || null,
                    transProfileId: profileId,
                    sashProfileId: definition.sources?.sashProfileId || null,
                    transTransformSource: connectionTransOccurrence?.transformSource
                        || transOccurrence?.transformSource
                        || null,
                    sashTransformSource: sashOccurrence?.transformSource || null,
                    placementTemplateId: placementConnectionTemplate?.id || null,
                    sectionRotationDeg: 180,
                    orientationMode: 'standalone-canonical-with-front-back-correction',
                    depthCenterFromAssemblyCenterMm: transDepthCenterFromAssemblyCenterMm,
                    depthOffsetMethod: placementConnectionTemplate?.id === connectionTemplate.id
                        ? 'join-to-b2-sash-coordinate-bridge'
                        : `shared-mullion-placement-bridge:${placementConnectionTemplate?.id || 'none'}`,
                    joinCenterDeltaDepthMm: connectionCenterDelta.depth,
                    joinCenterDeltaFaceMm: connectionCenterDelta.face,
                    openingSashCellSide,
                    openingSashTransBoundaryFromCenterMm,
                    openingSashTransBoundariesMm: Object.freeze({
                        ...openingSashTransBoundariesMm,
                    }),
                    openingSashBoundaryMethod: openingSashBoundarySides.length
                        ? 'per-side-left-right-join-reference-minus-working-sash-inward-offset'
                        : null,
                }
                : null,
            usesCadConnectionTemplate: Boolean(connectionTemplate),
            usesStandaloneTransProfile: true,
        },
        profiles: [...definition.profiles, ...transProfiles],
    };
}


function getProfileWorkingTransform(profile) {
    if (profile?.cadCoordinateTransform) {
        return profile.cadCoordinateTransform;
    }
    return Object.freeze({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        tx: finiteNumber(profile?.cadAlignmentShiftXMm),
        ty: finiteNumber(profile?.cadAlignmentShiftYMm),
    });
}

function isGlazingBeadPlacementFollower(profile = {}) {
    const blockName = normalizeBlockName(profile.blockName);
    return profile.isGlazingBeadTemplate === true
        || profile.isGasketTemplate === true
        || blockName.includes('573940')
        || blockName.includes('244511')
        || blockName.includes('224378');
}

function isFixedAnchorGasket(profile = {}) {
    return normalizeBlockName(profile.blockName).includes('224063');
}

function isFrameToSashRebateGasket(profile = {}) {
    return profile?.role === 'frame'
        && normalizeBlockName(profile.blockName).includes('245472');
}


function translateProfileWorkingCenterTo(profile, targetCenter) {
    if (!profile?.bbox || !targetCenter) return null;
    const currentTransform = getProfileWorkingTransform(profile);
    const sourceCenter = bboxCenter(profile.bbox);
    const currentCenter = transformCadPoint(
        currentTransform,
        sourceCenter.x,
        sourceCenter.y
    );
    return Object.freeze({
        ...currentTransform,
        tx: finiteNumber(currentTransform.tx) + finiteNumber(targetCenter.x) - currentCenter.x,
        ty: finiteNumber(currentTransform.ty) + finiteNumber(targetCenter.y) - currentCenter.y,
    });
}

function hasCadAffineTransform(transform) {
    return ['a', 'b', 'c', 'd', 'tx', 'ty'].every(key =>
        Number.isFinite(Number(transform?.[key]))
    );
}

function normalizeDirectAccessoryTargetTransformForSection(
    definition,
    targetTransform,
    section
) {
    if (!hasCadAffineTransform(targetTransform)) return null;
    if (section !== 'bottom') return targetTransform;

    const reflection = Object.freeze({
        a: 1,
        b: 0,
        c: 0,
        d: -1,
        tx: 0,
        ty: finiteNumber(definition.metadata?.globalMinY)
            + finiteNumber(definition.metadata?.globalMaxY),
    });
    return composeCadTransforms(reflection, targetTransform);
}

function createDirectAccessoryProfileTransform({
    definition,
    profile,
    localToCanonicalTransform,
    section,
}) {
    if (
        !hasCadAffineTransform(profile?.sourceTransform)
        || !hasCadAffineTransform(localToCanonicalTransform)
    ) {
        return null;
    }

    const sectionTarget = normalizeDirectAccessoryTargetTransformForSection(
        definition,
        localToCanonicalTransform,
        section
    );
    return composeCadTransforms(
        sectionTarget,
        invertCadTransform(profile.sourceTransform)
    );
}

function resolveMixedJoinRebateGasketProfileId(dividerConnectionTemplate) {
    if (!dividerConnectionTemplate) return null;

    const has245472 = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        '245472',
        'gasket'
    ).some(occurrence =>
        String(occurrence.profileId || '') === '245472'
        && occurrence.matchStrategy === 'direct-named-join-component'
    );
    if (has245472) return '245472';

    const has247472 = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        '247472',
        'gasket'
    ).some(occurrence =>
        String(occurrence.profileId || '') === '247472'
        && occurrence.matchStrategy === 'direct-named-join-component'
    );
    if (has247472) {
        throw new Error(
            `${dividerConnectionTemplate.id} contains a directly named 247472 gasket INSERT, `
            + 'but the runtime catalog only has verified 245472 geometry. ' 
            + 'Do not substitute these IDs; add/verify the 247472 profile geometry first.'
        );
    }

    // Older generated metadata predates the named INSERT inventory and may
    // simply be stale. After regeneration, a missing rebate gasket is a real
    // converter/CAD matching error and should be surfaced instead of silently
    // falling back to the old B2 sash position.
    if (
        ['mullion-fixed-sash', 'mullion-sash-sash'].includes(dividerConnectionTemplate.id)
        && Array.isArray(dividerConnectionTemplate.extraction?.namedInsertInventory)
    ) {
        throw new Error(
            `${dividerConnectionTemplate.id} does not expose a directly named 245472 or 247472 rebate gasket. `
            + 'Inspect extraction.namedInsertInventory from the active sash/mullion join DWG.'
        );
    }

    return null;
}

function getNearestOuterBoundaryInwardMm(definition, workingY) {
    const globalMinY = finiteNumber(definition.metadata?.globalMinY);
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    return Math.max(0, Math.min(
        Math.abs(globalMaxY - finiteNumber(workingY)),
        Math.abs(finiteNumber(workingY) - globalMinY)
    ));
}

function normalizeWorkingPointForSection(definition, workingPoint, section) {
    if (!workingPoint) return null;
    const globalMinY = finiteNumber(definition.metadata?.globalMinY);
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    const inwardMm = getNearestOuterBoundaryInwardMm(definition, workingPoint.y);
    return Object.freeze({
        x: finiteNumber(workingPoint.x),
        y: section === 'bottom'
            ? globalMinY + inwardMm
            : globalMaxY - inwardMm,
        inwardMm,
    });
}

function createFrameFixedDirectAccessoryTarget({
    definition,
    frameFixedTemplate,
    profileId,
    role,
}) {
    if (!frameFixedTemplate) return null;

    const frameProfiles = definition.profiles.filter(profile =>
        profile.role === 'frame'
        && profile.geometrySource === 'standalone-profile'
        && profile.cadCoordinateTransform
    );
    const workingFrameTransform = frameProfiles[0]?.cadCoordinateTransform || null;
    const frameSourceBounds = unionProfileSourceBounds(frameProfiles);
    const frameOccurrence = resolveConnectionOccurrence(
        frameFixedTemplate,
        definition.sources?.outerFrameProfileId,
        'outer-frame'
    );
    const joinFrameTransform = frameOccurrence
        ? retargetRoleReferenceTransform(frameSourceBounds, frameOccurrence)
        : null;
    const accessoryOccurrences = resolveConnectionOccurrences(
        frameFixedTemplate,
        profileId,
        role
    ).filter(occurrence =>
        occurrence?.bbox
        && hasCadAffineTransform(occurrence.transform)
        && String(occurrence.profileId || '') === String(profileId)
        && occurrence.matchStrategy === 'direct-named-join-component'
    );

    if (!workingFrameTransform || !joinFrameTransform || !accessoryOccurrences.length) {
        return null;
    }

    const joinToWorking = composeCadTransforms(
        workingFrameTransform,
        invertCadTransform(joinFrameTransform)
    );
    const candidates = accessoryOccurrences.map(occurrence => {
        const joinCenter = occurrence.center || bboxCenter(occurrence.bbox);
        const workingCenter = transformCadPoint(
            joinToWorking,
            joinCenter.x,
            joinCenter.y
        );
        return {
            occurrence,
            workingCenter,
            localToWorkingTransform: composeCadTransforms(
                joinToWorking,
                occurrence.transform
            ),
            inwardMm: getNearestOuterBoundaryInwardMm(definition, workingCenter.y),
        };
    });

    // The frame-window join normally contains one 224063 occurrence. If CAD
    // contains more than one, prefer the one nearest the perimeter frame face.
    candidates.sort((left, right) => left.inwardMm - right.inwardMm);
    const selected = candidates[0];
    return selected
        ? Object.freeze({
            point: selected.workingCenter,
            localToWorkingTransform: selected.localToWorkingTransform,
            occurrence: selected.occurrence,
        })
        : null;
}

function createFrameFixedFollowerSectionDeltas({
    definition,
    frameTargetSourceTransform,
    standaloneDefinition,
}) {
    const sourceReference = (standaloneDefinition?.profiles || []).find(profile =>
        normalizeBlockName(profile.blockName).includes('573940')
    );
    if (!sourceReference?.bbox || !frameTargetSourceTransform) return new Map();

    const sourceCenter = bboxCenter(sourceReference.bbox);
    const rawTargetPoint = transformCadPoint(
        frameTargetSourceTransform,
        sourceCenter.x,
        sourceCenter.y
    );
    const deltas = new Map();

    for (const section of ['top', 'bottom']) {
        const referenceProfile = definition.profiles.find(profile =>
            profile.section === section
            && normalizeBlockName(profile.blockName).includes('573940')
        );
        if (!referenceProfile?.bbox) continue;
        const targetPoint = normalizeWorkingPointForSection(
            definition,
            rawTargetPoint,
            section
        );
        const currentTransform = getProfileWorkingTransform(referenceProfile);
        const referenceCenter = bboxCenter(referenceProfile.bbox);
        const currentPoint = transformCadPoint(
            currentTransform,
            referenceCenter.x,
            referenceCenter.y
        );
        deltas.set(section, Object.freeze({
            x: targetPoint.x - currentPoint.x,
            y: targetPoint.y - currentPoint.y,
        }));
    }
    return deltas;
}

function applyWorkingDeltaToProfile(profile, delta) {
    if (!delta) return null;
    const currentTransform = getProfileWorkingTransform(profile);
    return Object.freeze({
        ...currentTransform,
        tx: finiteNumber(currentTransform.tx) + finiteNumber(delta.x),
        ty: finiteNumber(currentTransform.ty) + finiteNumber(delta.y),
    });
}

function getConnectionOccurrenceJoinCenter(occurrence) {
    if (!occurrence?.bbox && !occurrence?.center) return null;
    return occurrence.center || bboxCenter(occurrence.bbox);
}

function getConnectionOccurrenceJoinSide(occurrence, dividerOccurrence) {
    const occurrenceCenter = getConnectionOccurrenceJoinCenter(occurrence);
    const dividerCenter = getConnectionOccurrenceJoinCenter(dividerOccurrence);
    if (!occurrenceCenter || !dividerCenter) return null;

    const deltaX = finiteNumber(occurrenceCenter.x) - finiteNumber(dividerCenter.x);
    if (Math.abs(deltaX) <= 1e-6) return null;
    return deltaX < 0 ? 'left' : 'right';
}

function getConnectionOccurrenceDistanceToDividerFaceMm(occurrence, dividerOccurrence, cellSide) {
    const occurrenceCenter = getConnectionOccurrenceJoinCenter(occurrence);
    const dividerBbox = dividerOccurrence?.bbox;
    if (!occurrenceCenter || !dividerBbox || !cellSide) return Infinity;

    const dividerFaceX = cellSide === 'left'
        ? finiteNumber(dividerBbox.minX)
        : finiteNumber(dividerBbox.maxX);
    return Math.abs(finiteNumber(occurrenceCenter.x) - dividerFaceX);
}

function getExactConnectionProfileOccurrence(template, profileId) {
    return template?.profileOccurrences?.[String(profileId)]?.[0] || null;
}

function createMullionMountedConnectionTargets({
    definition,
    dividerConnectionTemplate,
    profile,
    profileId,
    role,
    targetCellTypes = [],
    requireExactDividerProfile = false,
}) {
    if (
        !dividerConnectionTemplate
        || !profile?.bbox
        || !hasCadAffineTransform(profile.sourceTransform)
    ) {
        return new Map();
    }

    const allowedCellTypes = new Set(
        (Array.isArray(targetCellTypes) ? targetCellTypes : [targetCellTypes])
            .filter(Boolean)
    );
    const targetSides = ['left', 'right'].filter(side =>
        !allowedCellTypes.size
        || allowedCellTypes.has(dividerConnectionTemplate?.[`${side}Cell`])
    );
    if (!targetSides.length) return new Map();

    const dividerProfileId = definition.metadata?.dividerProfileId;
    const dividerOccurrence = requireExactDividerProfile
        ? getExactConnectionProfileOccurrence(dividerConnectionTemplate, dividerProfileId)
        : resolveConnectionOccurrence(
            dividerConnectionTemplate,
            dividerProfileId,
            'mullion-transom'
        );
    const dividerProfiles = definition.profiles.filter(candidate =>
        candidate.role === 'divider'
        && candidate.geometrySource === 'standalone-divider-profile'
        && candidate.cadCoordinateTransform
    );
    const dividerSourceBounds = unionProfileSourceBounds(dividerProfiles);
    const joinDividerTransform = dividerOccurrence
        ? retargetRoleReferenceTransform(dividerSourceBounds, dividerOccurrence)
        : null;
    const workingDividerCoordinateTransform =
        dividerProfiles[0]?.cadCoordinateTransform || null;
    const dividerBounds = definition.metadata?.dividerSourceBounds;
    if (
        !dividerOccurrence?.bbox
        || !dividerBounds
        || !joinDividerTransform
        || !workingDividerCoordinateTransform
    ) {
        return new Map();
    }

    const allOccurrences = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        profileId,
        role
    ).filter(occurrence =>
        occurrence?.bbox
        && hasCadAffineTransform(occurrence.transform)
        && String(occurrence.profileId || '') === String(profileId)
        && occurrence.matchStrategy === 'direct-named-join-component'
    );

    const sourceBlockName = normalizeBlockName(profile.blockName);
    const dividerCenterX = (
        finiteNumber(dividerBounds.minX)
        + finiteNumber(dividerBounds.maxX)
    ) / 2;
    const faceCompensation = Object.freeze({
        a: -1,
        b: 0,
        c: 0,
        d: 1,
        tx: 2 * dividerCenterX,
        ty: 0,
    });
    // Direct INSERTs are authored in join coordinates. Retarget them through
    // the exact selected mullion occurrence, then apply the same accepted 180°
    // face correction as the structural divider. This makes an accessory a
    // true component of the mullion/transom section rather than a B2-relative
    // perimeter piece.
    const joinToWorkingDivider = composeCadTransforms(
        workingDividerCoordinateTransform,
        invertCadTransform(joinDividerTransform)
    );
    const targets = new Map();

    for (const cellSide of targetSides) {
        let sideOccurrences = allOccurrences.filter(occurrence =>
            getConnectionOccurrenceJoinSide(occurrence, dividerOccurrence) === cellSide
        );
        const exactBlockOccurrences = sideOccurrences.filter(occurrence =>
            (occurrence.directBlockNames || []).some(blockName =>
                normalizeBlockName(blockName) === sourceBlockName
            )
        );
        if (exactBlockOccurrences.length) sideOccurrences = exactBlockOccurrences;

        sideOccurrences.sort((left, right) =>
            getConnectionOccurrenceDistanceToDividerFaceMm(left, dividerOccurrence, cellSide)
            - getConnectionOccurrenceDistanceToDividerFaceMm(right, dividerOccurrence, cellSide)
        );
        const accessoryOccurrence = sideOccurrences[0] || null;
        if (!accessoryOccurrence) continue;

        const rawSvgToJoin = composeCadTransforms(
            accessoryOccurrence.transform,
            invertCadTransform(profile.sourceTransform)
        );
        const rawSvgToWorkingDivider = composeCadTransforms(
            joinToWorkingDivider,
            rawSvgToJoin
        );
        targets.set(cellSide, Object.freeze({
            cellSide,
            occurrence: accessoryOccurrence,
            cadTransform: composeCadTransforms(
                faceCompensation,
                rawSvgToWorkingDivider
            ),
            placementMethod: role === 'gasket'
                ? 'exact-direct-join-gasket-retargeted-through-divider-source-with-180-face-compensation'
                : `exact-direct-join-${role}-retargeted-through-selected-divider-with-180-face-compensation`,
        }));
    }

    return targets;
}

function createMullionMountedGasketTargets({
    definition,
    dividerConnectionTemplate,
    profile,
    profileId,
    cellType,
}) {
    return createMullionMountedConnectionTargets({
        definition,
        dividerConnectionTemplate,
        profile,
        profileId,
        role: 'gasket',
        targetCellTypes: [cellType],
        // Preserve the existing gasket fallback behavior because older joins
        // can legitimately reference a sibling mullion role occurrence.
        requireExactDividerProfile: false,
    });
}

function createMixedMullionMountedGasketTarget(args) {
    if (args.dividerConnectionTemplate?.id !== 'mullion-fixed-sash') return null;
    return createMullionMountedGasketTargets(args).values().next().value || null;
}

function createDividerFixedDirectAccessoryTargets({
    definition,
    dividerConnectionTemplate,
    profileId,
    role,
    cellBoundariesMm = null,
    selection = null,
}) {
    if (!dividerConnectionTemplate || !definition.metadata?.dividerOrientation) {
        return new Map();
    }

    const dividerProfiles = definition.profiles.filter(profile =>
        profile.role === 'divider'
        && profile.geometrySource === 'standalone-divider-profile'
        && profile.cadCoordinateTransform
    );
    if (!dividerProfiles.length) return new Map();

    const dividerSourceBounds = unionProfileSourceBounds(dividerProfiles);
    const dividerProfileId = definition.metadata?.dividerProfileId;
    const dividerOccurrence = resolveConnectionOccurrence(
        dividerConnectionTemplate,
        dividerProfileId,
        'mullion-transom'
    );
    const joinDividerTransform = dividerOccurrence
        ? retargetRoleReferenceTransform(dividerSourceBounds, dividerOccurrence)
        : null;
    const workingDividerCoordinateTransform = dividerProfiles[0]?.cadCoordinateTransform || null;
    const dividerBounds = definition.metadata?.dividerSourceBounds;
    const accessoryOccurrences = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        profileId,
        role
    ).filter(occurrence =>
        occurrence?.bbox
        && String(occurrence.profileId || '') === String(profileId)
        && occurrence.matchStrategy === 'direct-named-join-component'
    );

    if (
        !joinDividerTransform
        || !workingDividerCoordinateTransform
        || !dividerBounds
        || !accessoryOccurrences.length
    ) {
        return new Map();
    }

    const centerX = (finiteNumber(dividerBounds.minX) + finiteNumber(dividerBounds.maxX)) / 2;
    const centerY = (finiteNumber(dividerBounds.minY) + finiteNumber(dividerBounds.maxY)) / 2;
    const halfFaceMm = Math.max(
        0,
        finiteNumber(dividerBounds.maxX) - finiteNumber(dividerBounds.minX)
    ) / 2;
    const depthOffset = finiteNumber(
        definition.metadata?.dividerConnection?.depthCenterFromAssemblyCenterMm
    );
    const globalCenterX = finiteNumber(definition.metadata?.globalCenterX);
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    const joinToDividerSource = invertCadTransform(joinDividerTransform);
    const candidatesBySide = new Map();
    const layoutFixedCellSides = ['left', 'right'].filter(side => {
        if (selection) {
            if (selection.cells && selection.cells.length >= 2) {
                for (let i = 0; i < selection.cells.length - 1; i++) {
                    if (side === 'left' && selection.cells[i] === 'fixed-glazing') return true;
                    if (side === 'right' && selection.cells[i+1] === 'fixed-glazing') return true;
                }
            } else {
                if (side === 'left' && selection.leftCell === 'fixed-glazing') return true;
                if (side === 'right' && selection.rightCell === 'fixed-glazing') return true;
            }
            return false;
        }
        return dividerConnectionTemplate?.[`${side}Cell`] === 'fixed-glazing';
    });

    const templateFixedSides = ['left', 'right'].filter(side =>
        dividerConnectionTemplate?.[`${side}Cell`] === 'fixed-glazing'
    );

    for (const cellSide of layoutFixedCellSides) {
        const useBothSides = templateFixedSides.length === 2;
        const targetSourceSide = useBothSides ? cellSide : templateFixedSides[0];

        if (!targetSourceSide) continue;

        for (const accessoryOccurrence of accessoryOccurrences) {
            const joinCenter = accessoryOccurrence.center || bboxCenter(accessoryOccurrence.bbox);
            const dividerSourceCenter = transformCadPoint(
                joinToDividerSource,
                joinCenter.x,
                joinCenter.y
            );
            const workingDividerCenter = transformCadPoint(
                workingDividerCoordinateTransform,
                dividerSourceCenter.x,
                dividerSourceCenter.y
            );

            const runtimeFaceMm = -(workingDividerCenter.x - centerX);
            const geometricCellSide = runtimeFaceMm < 0 ? 'left' : 'right';

            if (geometricCellSide !== targetSourceSide) continue;

            const isOppositeNeeded = cellSide !== geometricCellSide;

            let occurrenceTransform = accessoryOccurrence.transform;
            let finalDividerSourceCenter = dividerSourceCenter;

            if (isOppositeNeeded) {
                const dividerX = joinDividerTransform.tx;
                occurrenceTransform = {
                    a: -occurrenceTransform.a,
                    b: occurrenceTransform.b,
                    c: -occurrenceTransform.c,
                    d: occurrenceTransform.d,
                    tx: 2 * dividerX - occurrenceTransform.tx,
                    ty: occurrenceTransform.ty,
                };
                const dx = dividerSourceCenter.x - centerX;
                finalDividerSourceCenter = {
                    x: centerX - dx,
                    y: dividerSourceCenter.y
                };
            }

            const finalWorkingDividerCenter = transformCadPoint(
                workingDividerCoordinateTransform,
                finalDividerSourceCenter.x,
                finalDividerSourceCenter.y
            );
            const finalRuntimeFaceMm = -(finalWorkingDividerCenter.x - centerX);
            const sideSign = cellSide === 'left' ? -1 : 1;
            const inwardFromMullionFaceMm = Math.max(
                0,
                Math.abs(finalRuntimeFaceMm) - halfFaceMm
            );

            const defaultBoundaryMm = sideSign * halfFaceMm;
            const configuredBoundaryMm = finiteNumber(
                cellBoundariesMm?.get(cellSide),
                NaN
            );
            const cellBoundaryMm = Number.isFinite(configuredBoundaryMm)
                ? configuredBoundaryMm
                : defaultBoundaryMm;
            const inwardFromCellBoundaryMm = sideSign
                * (finalRuntimeFaceMm - cellBoundaryMm);
            const runtimeDepthMm = finalWorkingDividerCenter.y - centerY + depthOffset;
            const canonicalPoint = Object.freeze({
                x: globalCenterX + runtimeDepthMm,
                y: globalMaxY - inwardFromCellBoundaryMm,
            });
            const dividerToCanonical = cellSide === 'left'
                ? Object.freeze({
                    a: 0,
                    b: 1,
                    c: -1,
                    d: 0,
                    tx: globalCenterX - centerY + depthOffset,
                    ty: globalMaxY + centerX + halfFaceMm,
                })
                : Object.freeze({
                    a: 0,
                    b: 1,
                    c: 1,
                    d: 0,
                    tx: globalCenterX - centerY + depthOffset,
                    ty: globalMaxY - centerX + halfFaceMm,
                });
            let localToCanonicalTransform = composeCadTransforms(
                dividerToCanonical,
                composeCadTransforms(
                    workingDividerCoordinateTransform,
                    composeCadTransforms(
                        joinToDividerSource,
                        occurrenceTransform
                    )
                )
            );
            const boundaryShiftY = sideSign * (cellBoundaryMm - defaultBoundaryMm);
            if (boundaryShiftY) {
                localToCanonicalTransform = Object.freeze({
                    ...localToCanonicalTransform,
                    ty: finiteNumber(localToCanonicalTransform.ty) + boundaryShiftY,
                });
            }
            if (!candidatesBySide.has(cellSide)) candidatesBySide.set(cellSide, []);
            candidatesBySide.get(cellSide).push({
                point: canonicalPoint,
                localToCanonicalTransform,
                occurrence: accessoryOccurrence,
                inwardFromMullionFaceMm,
                joinFaceDistanceMm: getConnectionOccurrenceDistanceToDividerFaceMm(
                    accessoryOccurrence,
                    dividerOccurrence,
                    cellSide
                ),
            });
        }
    }

    const targets = new Map();
    for (const [cellSide, candidates] of candidatesBySide) {
        candidates.sort((left, right) =>
            left.joinFaceDistanceMm - right.joinFaceDistanceMm
            || left.inwardFromMullionFaceMm - right.inwardFromMullionFaceMm
        );
        targets.set(cellSide, Object.freeze({
            point: candidates[0].point,
            localToCanonicalTransform: candidates[0].localToCanonicalTransform,
            occurrence: candidates[0].occurrence,
        }));
    }
    return targets;
}

function createDividerOpeningSashDirectAccessoryTarget({
    definition,
    dividerConnectionTemplate,
    profile,
    profileId,
    role,
}) {
    if (
        !dividerConnectionTemplate
        || !definition.metadata?.dividerOrientation
        || !profile?.bbox
    ) {
        return null;
    }

    const openingCellSides = ['left', 'right'].filter(cellSide =>
        dividerConnectionTemplate?.[`${cellSide}Cell`] === 'opening-sash'
    );
    if (openingCellSides.length !== 1) return null;
    const openingCellSide = openingCellSides[0];

    const dividerProfiles = definition.profiles.filter(candidate =>
        candidate.role === 'divider'
        && candidate.geometrySource === 'standalone-divider-profile'
        && candidate.cadCoordinateTransform
    );
    if (!dividerProfiles.length) return null;

    const dividerSourceBounds = unionProfileSourceBounds(dividerProfiles);
    const dividerProfileId = definition.metadata?.dividerProfileId;
    const dividerOccurrence = resolveConnectionOccurrence(
        dividerConnectionTemplate,
        dividerProfileId,
        'mullion-transom'
    );
    const joinDividerTransform = dividerOccurrence
        ? retargetRoleReferenceTransform(dividerSourceBounds, dividerOccurrence)
        : null;
    const workingDividerCoordinateTransform = dividerProfiles[0]?.cadCoordinateTransform || null;
    const dividerBounds = definition.metadata?.dividerSourceBounds;

    let accessoryOccurrences = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        profileId,
        role
    ).filter(occurrence =>
        occurrence?.bbox
        && String(occurrence.profileId || '') === String(profileId)
        && occurrence.matchStrategy === 'direct-named-join-component'
    );

    // A mixed sash join can contain the same catalogue gasket on the sash and
    // on the mullion/frame rebate.  The frame-side runtime component is
    // 245472_s_5, so prefer the exact named INSERT that matches the component
    // being positioned instead of choosing the sash-mounted sibling.
    const sourceBlockName = normalizeBlockName(profile.blockName);
    const exactBlockOccurrences = accessoryOccurrences.filter(occurrence =>
        (occurrence.directBlockNames || []).some(blockName =>
            normalizeBlockName(blockName) === sourceBlockName
        )
    );
    if (exactBlockOccurrences.length) {
        accessoryOccurrences = exactBlockOccurrences;
    }

    // Resolve the mullion-to-sash gasket from the opening side of this SAME
    // join before applying the runtime mullion bridge. This prevents a sibling
    // INSERT elsewhere in the sash assembly from being used for the mullion
    // connection merely because it has the same catalogue/block name.
    accessoryOccurrences = accessoryOccurrences.filter(occurrence =>
        getConnectionOccurrenceJoinSide(occurrence, dividerOccurrence)
            === openingCellSide
    );

    if (
        !joinDividerTransform
        || !workingDividerCoordinateTransform
        || !dividerBounds
        || !accessoryOccurrences.length
    ) {
        return null;
    }

    const centerX = (finiteNumber(dividerBounds.minX) + finiteNumber(dividerBounds.maxX)) / 2;
    const centerY = (finiteNumber(dividerBounds.minY) + finiteNumber(dividerBounds.maxY)) / 2;
    const halfFaceMm = Math.max(
        0,
        finiteNumber(dividerBounds.maxX) - finiteNumber(dividerBounds.minX)
    ) / 2;
    const depthOffset = finiteNumber(
        definition.metadata?.dividerConnection?.depthCenterFromAssemblyCenterMm
    );
    const globalCenterX = finiteNumber(definition.metadata?.globalCenterX);
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    const joinToDividerSource = invertCadTransform(joinDividerTransform);
    const sideSign = openingCellSide === 'left' ? -1 : 1;
    const configuredOpeningBoundaryMm = (
        definition.metadata?.dividerConnection?.openingSashCellSide === openingCellSide
    )
        ? finiteNumber(
            definition.metadata?.dividerConnection?.openingSashDividerBoundaryFromCenterMm,
            NaN
        )
        : NaN;
    const openingBoundaryMm = Number.isFinite(configuredOpeningBoundaryMm)
        ? configuredOpeningBoundaryMm
        : sideSign * halfFaceMm;

    const candidates = accessoryOccurrences.map(accessoryOccurrence => {
        const joinCenter = accessoryOccurrence.center || bboxCenter(accessoryOccurrence.bbox);
        const dividerSourceCenter = transformCadPoint(
            joinToDividerSource,
            joinCenter.x,
            joinCenter.y
        );
        const workingDividerCenter = transformCadPoint(
            workingDividerCoordinateTransform,
            dividerSourceCenter.x,
            dividerSourceCenter.y
        );

        // Same accepted 180° divider convention used by the fixed-side gasket:
        // runtime face coordinate is the negated standalone divider X delta.
        const runtimeFaceMm = -(workingDividerCenter.x - centerX);
        const inwardFromOpeningBoundaryMm = sideSign
            * (runtimeFaceMm - openingBoundaryMm);
        const runtimeDepthMm = workingDividerCenter.y - centerY + depthOffset;

        const point = Object.freeze({
            x: globalCenterX + runtimeDepthMm,
            y: globalMaxY - inwardFromOpeningBoundaryMm,
        });
        const defaultBoundaryMm = sideSign * halfFaceMm;
        const dividerToCanonical = openingCellSide === 'left'
            ? Object.freeze({
                a: 0,
                b: 1,
                c: -1,
                d: 0,
                tx: globalCenterX - centerY + depthOffset,
                ty: globalMaxY + centerX + halfFaceMm,
            })
            : Object.freeze({
                a: 0,
                b: 1,
                c: 1,
                d: 0,
                tx: globalCenterX - centerY + depthOffset,
                ty: globalMaxY - centerX + halfFaceMm,
            });
        let localToCanonicalTransform = composeCadTransforms(
            dividerToCanonical,
            composeCadTransforms(
                workingDividerCoordinateTransform,
                composeCadTransforms(
                    joinToDividerSource,
                    accessoryOccurrence.transform
                )
            )
        );
        const boundaryShiftY = sideSign * (openingBoundaryMm - defaultBoundaryMm);
        if (boundaryShiftY) {
            localToCanonicalTransform = Object.freeze({
                ...localToCanonicalTransform,
                ty: finiteNumber(localToCanonicalTransform.ty) + boundaryShiftY,
            });
        }

        return {
            point,
            localToCanonicalTransform,
            occurrence: accessoryOccurrence,
            boundaryDistanceMm: Math.abs(runtimeFaceMm - openingBoundaryMm),
            joinFaceDistanceMm: getConnectionOccurrenceDistanceToDividerFaceMm(
                accessoryOccurrence,
                dividerOccurrence,
                openingCellSide
            ),
            matchedComponentCount: finiteNumber(accessoryOccurrence.matchedComponentCount),
        };
    });

    candidates.sort((left, right) =>
        left.joinFaceDistanceMm - right.joinFaceDistanceMm
        || left.boundaryDistanceMm - right.boundaryDistanceMm
        || right.matchedComponentCount - left.matchedComponentCount
    );

    return candidates.length
        ? Object.freeze({
            cellSide: openingCellSide,
            point: candidates[0].point,
            localToCanonicalTransform: candidates[0].localToCanonicalTransform,
            occurrence: candidates[0].occurrence,
        })
        : null;
}

function getReferenceAccessorySectionTransforms({
    definition,
    standaloneDefinition,
    targetMatcher,
    label,
    minimumSourceComponents = 1,
}) {
    const sourceProfiles = standaloneDefinition?.profiles || [];
    if (sourceProfiles.length < minimumSourceComponents) {
        throw new Error(`${label} does not contain enough standalone components.`);
    }
    const transforms = new Map();
    for (const section of ['top', 'bottom']) {
        const targetProfiles = definition.profiles
            .filter(profile => profile.section === section)
            .filter(targetMatcher)
            .map(profile => ({
                ...profile,
                bbox: getAlignedLegacyBbox(profile),
            }));
        if (targetProfiles.length < minimumSourceComponents) continue;
        transforms.set(section, fitStandaloneProfileTransform({
            sourceProfiles,
            targetProfiles,
            allowMirror: true,
        }));
    }

    if (!transforms.size) {
        throw new Error(`Could not align ${label} to the current B2 accessory reference.`);
    }
    if (!transforms.has('top') && transforms.has('bottom')) {
        transforms.set('top', transforms.get('bottom'));
    }
    if (!transforms.has('bottom') && transforms.has('top')) {
        transforms.set('bottom', transforms.get('top'));
    }
    return transforms;
}

function getReferenceBeadSectionTransforms(definition, standaloneBeadDefinition) {
    return getReferenceAccessorySectionTransforms({
        definition,
        standaloneDefinition: standaloneBeadDefinition,
        label: 'standalone 573940 glazing bead',
        minimumSourceComponents: 2,
        targetMatcher: profile => {
            const name = normalizeBlockName(profile.blockName);
            return name.includes('573940') || name.includes('244511');
        },
    });
}


function createFrameFixedAccessorySourceTransform({
    definition,
    frameFixedTemplate,
    profileId,
    role,
    sourceBounds,
    required = false,
}) {
    if (!frameFixedTemplate) return null;

    const frameProfiles = definition.profiles.filter(profile =>
        profile.role === 'frame'
        && profile.geometrySource === 'standalone-profile'
        && profile.cadCoordinateTransform
    );
    const workingFrameTransform = frameProfiles[0]?.cadCoordinateTransform || null;
    const frameSourceBounds = unionProfileSourceBounds(frameProfiles);
    const frameOccurrence = resolveConnectionOccurrence(
        frameFixedTemplate,
        definition.sources?.outerFrameProfileId,
        'outer-frame'
    );
    const accessoryOccurrence = resolveConnectionOccurrence(
        frameFixedTemplate,
        profileId,
        role
    );
    const joinFrameTransform = frameOccurrence
        ? retargetRoleReferenceTransform(frameSourceBounds, frameOccurrence)
        : null;

    if (!workingFrameTransform || !joinFrameTransform || !accessoryOccurrence?.transform) {
        if (!required) return null;
        throw new Error(
            `frame-fixed must contain transform-matched outer-frame and ${profileId} ${role} occurrences.`
        );
    }

    const targetTransform = sourceBounds
        ? retargetRoleReferenceTransform(sourceBounds, accessoryOccurrence)
        : accessoryOccurrence.transform;

    return composeCadTransforms(
        workingFrameTransform,
        composeCadTransforms(
            invertCadTransform(joinFrameTransform),
            targetTransform
        )
    );
}

function createFrameFixedBeadSourceTransform(
    definition,
    frameFixedTemplate,
    standaloneBeadDefinition
) {
    const sourceBounds = unionProfileSourceBounds(standaloneBeadDefinition?.profiles || []);
    return createFrameFixedAccessorySourceTransform({
        definition,
        frameFixedTemplate,
        profileId: '573940',
        role: 'glazing-bead',
        sourceBounds,
        required: true,
    });
}

function createDividerFixedAccessorySourceTransforms({
    definition,
    dividerConnectionTemplate,
    profileId,
    role,
    standaloneDefinition,
    canonicalYShiftsMm = null,
    selection = null,
}) {
    if (!dividerConnectionTemplate || !definition.metadata?.dividerOrientation) {
        return new Map();
    }

    const dividerProfiles = definition.profiles.filter(profile =>
        profile.role === 'divider'
        && profile.geometrySource === 'standalone-divider-profile'
        && profile.cadCoordinateTransform
    );
    if (!dividerProfiles.length) return new Map();

    const sourceProfiles = standaloneDefinition?.profiles || [];
    const accessorySourceBounds = unionProfileSourceBounds(sourceProfiles);
    if (!accessorySourceBounds) return new Map();

    const dividerSourceBounds = unionProfileSourceBounds(dividerProfiles);
    const dividerProfileId = definition.metadata?.dividerProfileId;
    const dividerOccurrence = resolveConnectionOccurrence(
        dividerConnectionTemplate,
        dividerProfileId,
        'mullion-transom'
    );
    const joinDividerTransform = dividerOccurrence
        ? retargetRoleReferenceTransform(dividerSourceBounds, dividerOccurrence)
        : null;
    const workingDividerCoordinateTransform = dividerProfiles[0]?.cadCoordinateTransform || null;
    const dividerBounds = definition.metadata?.dividerSourceBounds;
    const accessoryOccurrences = resolveConnectionOccurrences(
        dividerConnectionTemplate,
        profileId,
        role
    );

    if (
        !joinDividerTransform
        || !workingDividerCoordinateTransform
        || !dividerBounds
        || !accessoryOccurrences.length
    ) {
        return new Map();
    }

    const centerX = (finiteNumber(dividerBounds.minX) + finiteNumber(dividerBounds.maxX)) / 2;
    const centerY = (finiteNumber(dividerBounds.minY) + finiteNumber(dividerBounds.maxY)) / 2;
    const halfFaceMm = Math.max(
        0,
        finiteNumber(dividerBounds.maxX) - finiteNumber(dividerBounds.minX)
    ) / 2;
    const depthOffset = finiteNumber(
        definition.metadata?.dividerConnection?.depthCenterFromAssemblyCenterMm
    );
    const globalCenterX = finiteNumber(definition.metadata?.globalCenterX);
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    const joinToDividerSource = invertCadTransform(joinDividerTransform);
    const sourceCenter = bboxCenter(accessorySourceBounds);
    const candidatesBySide = new Map();
    const layoutFixedCellSides = ['left', 'right'].filter(side => {
        if (selection) {
            if (selection.cells && selection.cells.length >= 2) {
                for (let i = 0; i < selection.cells.length - 1; i++) {
                    if (side === 'left' && selection.cells[i] === 'fixed-glazing') return true;
                    if (side === 'right' && selection.cells[i+1] === 'fixed-glazing') return true;
                }
            } else {
                if (side === 'left' && selection.leftCell === 'fixed-glazing') return true;
                if (side === 'right' && selection.rightCell === 'fixed-glazing') return true;
            }
            return false;
        }
        return dividerConnectionTemplate?.[`${side}Cell`] === 'fixed-glazing';
    });

    const templateFixedSides = ['left', 'right'].filter(side =>
        dividerConnectionTemplate?.[`${side}Cell`] === 'fixed-glazing'
    );

    for (const cellSide of layoutFixedCellSides) {
        const useBothSides = templateFixedSides.length === 2;
        const targetSourceSide = useBothSides ? cellSide : templateFixedSides[0];

        if (!targetSourceSide) continue;

        for (const accessoryOccurrence of accessoryOccurrences) {
            if (!accessoryOccurrence?.transform || !accessoryOccurrence?.bbox) continue;

            const occurrenceTransform = retargetRoleReferenceTransform(
                accessorySourceBounds,
                accessoryOccurrence
            );
            const joinCenter = transformCadPoint(
                occurrenceTransform,
                sourceCenter.x,
                sourceCenter.y
            );
            const dividerSourceCenter = transformCadPoint(
                joinToDividerSource,
                joinCenter.x,
                joinCenter.y
            );
            const workingDividerCenter = transformCadPoint(
                workingDividerCoordinateTransform,
                dividerSourceCenter.x,
                dividerSourceCenter.y
            );

            const runtimeFaceMm = -(workingDividerCenter.x - centerX);
            const geometricCellSide = runtimeFaceMm < 0 ? 'left' : 'right';

            if (geometricCellSide !== targetSourceSide) continue;

            const isOppositeNeeded = cellSide !== geometricCellSide;

            let finalOccurrenceTransform = occurrenceTransform;
            let finalDividerSourceCenter = dividerSourceCenter;

            if (isOppositeNeeded) {
                const dividerX = joinDividerTransform.tx;
                finalOccurrenceTransform = {
                    a: -occurrenceTransform.a,
                    b: occurrenceTransform.b,
                    c: -occurrenceTransform.c,
                    d: occurrenceTransform.d,
                    tx: 2 * dividerX - occurrenceTransform.tx,
                    ty: occurrenceTransform.ty,
                };
                const dx = dividerSourceCenter.x - centerX;
                finalDividerSourceCenter = {
                    x: centerX - dx,
                    y: dividerSourceCenter.y
                };
            }

            const finalWorkingDividerCenter = transformCadPoint(
                workingDividerCoordinateTransform,
                finalDividerSourceCenter.x,
                finalDividerSourceCenter.y
            );

            const finalRuntimeFaceMm = -(finalWorkingDividerCenter.x - centerX);
            const sideSign = cellSide === 'left' ? -1 : 1;
            const inwardFromMullionFaceMm = Math.max(
                0,
                Math.abs(finalRuntimeFaceMm) - halfFaceMm
            );

            const dividerToCanonical = cellSide === 'left'
                ? Object.freeze({
                    a: 0,
                    b: 1,
                    c: -1,
                    d: 0,
                    tx: globalCenterX - centerY + depthOffset,
                    ty: globalMaxY + centerX + halfFaceMm,
                })
                : Object.freeze({
                    a: 0,
                    b: 1,
                    c: 1,
                    d: 0,
                    tx: globalCenterX - centerY + depthOffset,
                    ty: globalMaxY - centerX + halfFaceMm,
                });

            let targetTransform = composeCadTransforms(
                dividerToCanonical,
                composeCadTransforms(
                    workingDividerCoordinateTransform,
                    composeCadTransforms(
                        joinToDividerSource,
                        finalOccurrenceTransform
                    )
                )
            );

            const yShiftMm = finiteNumber(canonicalYShiftsMm?.get(cellSide));
            if (yShiftMm) {
                targetTransform = Object.freeze({
                    ...targetTransform,
                    ty: finiteNumber(targetTransform.ty) + yShiftMm,
                });
            }

            const explicitProfileMatchCount = finiteNumber(
                accessoryOccurrence.explicitProfileMatchCount
            );
            const matchedComponentCount = finiteNumber(
                accessoryOccurrence.matchedComponentCount
            );
            const candidate = {
                transform: targetTransform,
                cellSide,
                sideSign,
                runtimeFaceMm: finalRuntimeFaceMm,
                inwardFromMullionFaceMm,
                explicitProfileMatchCount,
                matchedComponentCount,
                maxBboxErrorMm: finiteNumber(accessoryOccurrence.maxBboxErrorMm, Infinity),
            };

            if (!candidatesBySide.has(cellSide)) {
                candidatesBySide.set(cellSide, []);
            }
            candidatesBySide.get(cellSide).push(candidate);
        }
    }

    const transforms = new Map();
    for (const [cellSide, candidates] of candidatesBySide) {
        // Prefer exact profile-name matches, then stronger component matches,
        // then the occurrence nearest the mullion face.  This prevents a shared
        // retaining-child fallback from replacing the actual metal bead.
        candidates.sort((left, right) =>
            right.explicitProfileMatchCount - left.explicitProfileMatchCount
            || right.matchedComponentCount - left.matchedComponentCount
            || left.inwardFromMullionFaceMm - right.inwardFromMullionFaceMm
            || left.maxBboxErrorMm - right.maxBboxErrorMm
        );
        transforms.set(cellSide, candidates[0].transform);
    }

    return transforms;
}

function createDividerFixedBeadPlacement({
    definition,
    dividerConnectionTemplate,
    standaloneBeadDefinition,
    frameBeadSourceTransform,
    selection = null,
}) {
    const rawTransforms = createDividerFixedAccessorySourceTransforms({
        definition,
        dividerConnectionTemplate,
        profileId: '573940',
        role: 'glazing-bead',
        standaloneDefinition: standaloneBeadDefinition,
        selection,
    });
    if (!rawTransforms.size) {
        return {
            transforms: rawTransforms,
            cellBoundariesMm: new Map(),
            canonicalYShiftsMm: new Map(),
        };
    }

    const sourceBounds = unionProfileSourceBounds(standaloneBeadDefinition?.profiles || []);
    if (!sourceBounds || !frameBeadSourceTransform) {
        return {
            transforms: rawTransforms,
            cellBoundariesMm: new Map(),
            canonicalYShiftsMm: new Map(),
        };
    }

    const sourceCenter = bboxCenter(sourceBounds);
    const framePoint = transformCadPoint(
        frameBeadSourceTransform,
        sourceCenter.x,
        sourceCenter.y
    );
    const globalMaxY = finiteNumber(definition.metadata?.globalMaxY);
    const dividerBounds = definition.metadata?.dividerSourceBounds;
    const halfFaceMm = Math.max(
        0,
        finiteNumber(dividerBounds?.maxX) - finiteNumber(dividerBounds?.minX)
    ) / 2;
    const frameInwardMm = getNearestOuterBoundaryInwardMm(definition, framePoint.y);
    const canonicalFrameY = globalMaxY - frameInwardMm;
    const cellBoundariesMm = new Map();
    const canonicalYShiftsMm = new Map();

    for (const [cellSide, transform] of rawTransforms) {
        const sideSign = cellSide === 'left' ? -1 : 1;
        const dividerPoint = transformCadPoint(
            transform,
            sourceCenter.x,
            sourceCenter.y
        );
        const dividerInwardMm = globalMaxY - dividerPoint.y;
        console.log("BEAD PLACEMENT DETAIL:", {
            cellSide,
            sideSign,
            halfFaceMm,
            dividerInwardMm,
            frameInwardMm,
            dividerPoint,
            globalMaxY
        });

        // Keep the exact physical bead position from the fixed/fixed join while
        // redefining the cell's virtual inner boundary so the frame-mounted
        // horizontal bead and mullion-mounted vertical bead use one consistent
        // miter rectangle.  This removes the short bottom/top bead without
        // moving the CAD-derived mullion-side bead in the finished assembly.
        const defaultBoundaryMm = sideSign * halfFaceMm;
        const physicalReferenceMm = defaultBoundaryMm + sideSign * dividerInwardMm;
        const normalizedBoundaryMm = physicalReferenceMm - sideSign * frameInwardMm;
        const yShiftMm = canonicalFrameY - dividerPoint.y;

        cellBoundariesMm.set(cellSide, normalizedBoundaryMm);
        canonicalYShiftsMm.set(cellSide, yShiftMm);
    }

    const transforms = createDividerFixedAccessorySourceTransforms({
        definition,
        dividerConnectionTemplate,
        profileId: '573940',
        role: 'glazing-bead',
        standaloneDefinition: standaloneBeadDefinition,
        canonicalYShiftsMm,
        selection,
    });

    return {
        transforms,
        cellBoundariesMm,
        canonicalYShiftsMm,
    };
}

function applyFixedGlazingConnectionPlacements({
    definition,
    standaloneBeadDefinition,
    frameFixedTemplate,
    dividerConnectionTemplate,
    dividerGasketConnectionTemplate = dividerConnectionTemplate,
    selection = null,
}) {
    if (!standaloneBeadDefinition || !frameFixedTemplate) return definition;

    const referenceTransforms = getReferenceBeadSectionTransforms(
        definition,
        standaloneBeadDefinition
    );
    const frameBeadSourceTransform = createFrameFixedBeadSourceTransform(
        definition,
        frameFixedTemplate,
        standaloneBeadDefinition
    );
    const frameFollowerDeltas = createFrameFixedFollowerSectionDeltas({
        definition,
        frameTargetSourceTransform: frameBeadSourceTransform,
        standaloneDefinition: standaloneBeadDefinition,
    });
    const frameFixedGasketTarget = createFrameFixedDirectAccessoryTarget({
        definition,
        frameFixedTemplate,
        profileId: '224063',
        role: 'gasket',
    });
    const beadPlacement = createDividerFixedBeadPlacement({
        definition,
        dividerConnectionTemplate,
        standaloneBeadDefinition,
        frameBeadSourceTransform,
        selection,
    });
    const dividerFixedGasketTargets = createDividerFixedDirectAccessoryTargets({
        definition,
        dividerConnectionTemplate: dividerGasketConnectionTemplate,
        profileId: '224063',
        role: 'gasket',
        cellBoundariesMm: beadPlacement.cellBoundariesMm,
        selection,
    });
    const mullionSashRebateGasketProfileId = resolveMixedJoinRebateGasketProfileId(
        dividerGasketConnectionTemplate
    );

    const profiles = definition.profiles.map(profile => {
        const section = profile.section === 'bottom' ? 'bottom' : 'top';

        if (isFixedAnchorGasket(profile)) {
            const mixedMullionMountedTarget = createMixedMullionMountedGasketTarget({
                definition,
                dividerConnectionTemplate: dividerGasketConnectionTemplate,
                profile,
                profileId: '224063',
                cellType: 'fixed-glazing',
            });
            const frameTarget = normalizeWorkingPointForSection(
                definition,
                frameFixedGasketTarget?.point,
                section
            );
            const exactFrameTransform = frameFixedGasketTarget
                ? createDirectAccessoryProfileTransform({
                    definition,
                    profile,
                    localToCanonicalTransform:
                        frameFixedGasketTarget.localToWorkingTransform,
                    section,
                })
                : null;
            const fixedGlazingFrameCadTransform = exactFrameTransform
                || (frameTarget
                    ? translateProfileWorkingCenterTo(profile, frameTarget)
                    : null);
            const fixedGlazingDividerCadTransforms = {};
            let usedExactDividerTransform = false;
            for (const [cellSide, targetPlacement] of dividerFixedGasketTargets) {
                const exactTransform = createDirectAccessoryProfileTransform({
                    definition,
                    profile,
                    localToCanonicalTransform: targetPlacement.localToCanonicalTransform,
                    section,
                });
                const target = section === 'bottom'
                    ? normalizeWorkingPointForSection(
                        definition,
                        targetPlacement.point,
                        section
                    )
                    : targetPlacement.point;
                const transform = exactTransform
                    || translateProfileWorkingCenterTo(profile, target);
                if (transform) {
                    fixedGlazingDividerCadTransforms[cellSide] = transform;
                    usedExactDividerTransform = usedExactDividerTransform || Boolean(exactTransform);
                }
            }

            return {
                ...profile,
                fixedGlazingFrameCadTransform,
                fixedGlazingDividerCadTransforms: Object.freeze(fixedGlazingDividerCadTransforms),
                fixedGlazingConnectionOnly: true,
                mullionConnectionCadTransform: mixedMullionMountedTarget?.cadTransform || null,
                mullionConnectionCellSide: mixedMullionMountedTarget?.cellSide || null,
                mullionConnectionProfileId: mixedMullionMountedTarget ? '224063' : null,
                mullionConnectionOccurrenceIndex:
                    mixedMullionMountedTarget?.occurrence?.occurrenceIndex ?? null,
                mullionConnectionPlacementMethod:
                    mixedMullionMountedTarget?.placementMethod || null,
                fixedGlazingFramePlacementMethod: exactFrameTransform
                    ? 'exact-224063-same-frame-affine-bridge'
                    : 'exact-224063-join-occurrence-center-bridge',
                fixedGlazingDividerPlacementMethod: usedExactDividerTransform
                    ? 'exact-224063-same-mullion-affine-bridge'
                    : 'exact-224063-join-occurrence-center-bridge',
                // Keep the historical field frame-scoped.  The previous code
                // let the divider placement method overwrite the description
                // of the direct frame-window 224063 placement.
                fixedGlazingPlacementMethod: exactFrameTransform
                    ? 'exact-224063-same-frame-affine-bridge'
                    : 'exact-224063-join-occurrence-center-bridge',
            };
        }

        if (isFrameToSashRebateGasket(profile)) {
            if (mullionSashRebateGasketProfileId !== '245472') return profile;

            const mixedMullionMountedTarget = createMixedMullionMountedGasketTarget({
                definition,
                dividerConnectionTemplate: dividerGasketConnectionTemplate,
                profile,
                profileId: mullionSashRebateGasketProfileId,
                cellType: 'opening-sash',
            });
            const dividerOpeningSashTarget = createDividerOpeningSashDirectAccessoryTarget({
                definition,
                dividerConnectionTemplate: dividerGasketConnectionTemplate,
                profile,
                profileId: mullionSashRebateGasketProfileId,
                role: 'gasket',
            });
            const normalizedTarget = dividerOpeningSashTarget?.point
                ? normalizeWorkingPointForSection(
                    definition,
                    dividerOpeningSashTarget.point,
                    section
                )
                : null;
            const exactTransform = dividerOpeningSashTarget
                ? createDirectAccessoryProfileTransform({
                    definition,
                    profile,
                    localToCanonicalTransform:
                        dividerOpeningSashTarget.localToCanonicalTransform,
                    section,
                })
                : null;
            const mullionSashCadTransform = exactTransform
                || (normalizedTarget
                    ? translateProfileWorkingCenterTo(profile, normalizedTarget)
                    : null);

            if (!mullionSashCadTransform) return profile;

            return {
                ...profile,
                mullionSashCadTransform,
                mullionSashCellSide: dividerOpeningSashTarget.cellSide,
                mullionConnectionCadTransform: mixedMullionMountedTarget?.cadTransform || null,
                mullionConnectionCellSide: mixedMullionMountedTarget?.cellSide || null,
                mullionConnectionProfileId:
                    mixedMullionMountedTarget ? mullionSashRebateGasketProfileId : null,
                mullionConnectionOccurrenceIndex:
                    mixedMullionMountedTarget?.occurrence?.occurrenceIndex ?? null,
                mullionConnectionPlacementMethod:
                    mixedMullionMountedTarget?.placementMethod || null,
                mullionSashPlacementMethod: exactTransform
                    ? 'exact-245472-same-mullion-affine-bridge'
                    : 'exact-245472-join-occurrence-center-bridge',
            };
        }

        if (!isGlazingBeadPlacementFollower(profile)) return profile;

        const referenceSourceToWorking = referenceTransforms.get(section);
        if (!referenceSourceToWorking) return profile;
        const fixedGlazingFrameCadTransform = applyWorkingDeltaToProfile(
            profile,
            frameFollowerDeltas.get(section)
        );
        if (!fixedGlazingFrameCadTransform) return profile;

        const fixedGlazingDividerCadTransforms = {};
        const useHorizontalBottomFollowerBasis =
            definition.metadata?.dividerOrientation === 'horizontal'
            && section === 'bottom';
        const frameSourceTransformInverse = useHorizontalBottomFollowerBasis
            ? invertCadTransform(frameBeadSourceTransform)
            : null;
        const referenceWorkingToSource = useHorizontalBottomFollowerBasis
            ? null
            : invertCadTransform(referenceSourceToWorking);

        for (const [cellSide, targetSourceTransform] of beadPlacement.transforms) {
            if (useHorizontalBottomFollowerBasis) {
                // A horizontal transom exposes a fixed cell's bottom edge to the
                // divider join. The direct divider target is expressed in the
                // canonical/top follower basis; applying it directly to the B2
                // bottom follower mirrors the bead and moves its inward seat.
                // Preserve the already-correct bottom frame basis and apply only
                // the physical frame-to-divider CAD delta.
                const frameToDividerDelta = composeCadTransforms(
                    targetSourceTransform,
                    frameSourceTransformInverse
                );
                fixedGlazingDividerCadTransforms[cellSide] = composeCadTransforms(
                    frameToDividerDelta,
                    fixedGlazingFrameCadTransform
                );
                continue;
            }

            const dividerWorkingDelta = composeCadTransforms(
                targetSourceTransform,
                referenceWorkingToSource
            );
            fixedGlazingDividerCadTransforms[cellSide] = composeCadTransforms(
                dividerWorkingDelta,
                getProfileWorkingTransform(profile)
            );
        }

        return {
            ...profile,
            fixedGlazingFrameCadTransform,
            fixedGlazingDividerCadTransforms: Object.freeze(fixedGlazingDividerCadTransforms),
            fixedGlazingPlacementMethod: 'exact-bead-join-occurrence-bridge',
        };
    });

    return {
        ...definition,
        profiles,
        metadata: {
            ...definition.metadata,
            fixedGlazingConnections: {
                frameTemplateId: frameFixedTemplate.id,
                dividerTemplateId: dividerConnectionTemplate?.id || null,
                dividerGasketTemplateId: dividerGasketConnectionTemplate?.id || null,
                referenceBeadProfileId: '573940',
                fixedFrameGasketProfileId: '224063',
                fixedFrameGasketSource: frameFixedGasketTarget
                    ? 'frame-fixed-direct-named-insert'
                    : null,
                dividerGasketBoundaryMethod: dividerFixedGasketTargets.size
                    ? 'active-mullion-join-relative-to-cad-fixed-cell-boundary'
                    : null,
                dividerGasketSideMethod: dividerFixedGasketTargets.size
                    ? (
                        ['left', 'right'].filter(cellSide =>
                            dividerGasketConnectionTemplate?.[`${cellSide}Cell`] === 'fixed-glazing'
                        ).length === 1
                            ? 'same-join-mullion-side-filter'
                            : 'join-geometry-side-classification'
                    )
                    : null,
                mullionSashGasketProfileId: mullionSashRebateGasketProfileId,
                mullionSashGasketTemplateId: dividerGasketConnectionTemplate?.id || null,
                mullionSashGasketPlacementMethod: profiles.some(profile =>
                    Boolean(profile.mullionSashCadTransform)
                )
                    ? 'active-mullion-join-direct-rebate-gasket'
                    : null,
                mixedMullionGasketHostMethod: profiles.some(profile =>
                    Boolean(profile.mullionConnectionCadTransform)
                )
                    ? 'direct-join-inserts-mounted-on-divider'
                    : null,
                dividerCellBoundariesMm: Object.freeze(Object.fromEntries(
                    beadPlacement.cellBoundariesMm
                )),
                placementMethod: 'exact-fixed-glazing-join-occurrences-with-section-normalized-frame-seat',
            },
        },
    };
}

export function applyOpeningSashDividerConnectionPlacements({
    definition,
    dividerConnectionTemplate,
    selection = null,
}) {
    if (!dividerConnectionTemplate || !definition.metadata?.dividerOrientation) {
        return definition;
    }
    const openingCellSides = ['left', 'right'].filter(side => {
        if (dividerConnectionTemplate?.[`${side}Cell`] === 'opening-sash') return true;
        const sel = selection || definition?.metadata;
        if (sel) {
            if (sel.cells && sel.cells.length >= 2) {
                for (let i = 0; i < sel.cells.length - 1; i++) {
                    if (side === 'left' && sel.cells[i] === 'opening-sash') return true;
                    if (side === 'right' && sel.cells[i+1] === 'opening-sash') return true;
                }
            } else {
                if (side === 'left' && sel.leftCell === 'opening-sash') return true;
                if (side === 'right' && sel.rightCell === 'opening-sash') return true;
            }
        }
        return false;
    });
    if (!openingCellSides.length) return definition;

    const rebateGasketProfileId = resolveMixedJoinRebateGasketProfileId(
        dividerConnectionTemplate
    );
    if (rebateGasketProfileId !== '245472') return definition;

    let placedSideCount = 0;
    const profiles = definition.profiles.map(profile => {
        if (!isFrameToSashRebateGasket(profile)) return profile;

        const targets = createMullionMountedGasketTargets({
            definition,
            dividerConnectionTemplate,
            profile,
            profileId: rebateGasketProfileId,
            cellType: 'opening-sash',
        });
        if (!targets.size) return profile;

        const cadTransforms = {};
        const occurrenceIndexes = {};
        const placementMethods = {};
        for (const [cellSide, target] of targets) {
            cadTransforms[cellSide] = target.cadTransform;
            occurrenceIndexes[cellSide] = target.occurrence?.occurrenceIndex ?? null;
            placementMethods[cellSide] = target.placementMethod;
        }
        placedSideCount = Math.max(placedSideCount, targets.size);

        const singleTarget = targets.size === 1
            ? targets.values().next().value
            : null;
        return {
            ...profile,
            mullionConnectionCadTransforms: Object.freeze(cadTransforms),
            mullionConnectionOccurrenceIndexes: Object.freeze(occurrenceIndexes),
            mullionConnectionPlacementMethods: Object.freeze(placementMethods),
            // Preserve the legacy scalar fields for the mixed one-sash layout.
            mullionConnectionCadTransform:
                singleTarget?.cadTransform || profile.mullionConnectionCadTransform || null,
            mullionConnectionCellSide:
                singleTarget?.cellSide || profile.mullionConnectionCellSide || null,
            mullionConnectionProfileId: rebateGasketProfileId,
            mullionConnectionOccurrenceIndex:
                singleTarget?.occurrence?.occurrenceIndex
                ?? profile.mullionConnectionOccurrenceIndex
                ?? null,
            mullionConnectionPlacementMethod:
                singleTarget?.placementMethod
                || profile.mullionConnectionPlacementMethod
                || null,
        };
    });

    return {
        ...definition,
        profiles,
        metadata: {
            ...definition.metadata,
            dividerOpeningSashConnections: {
                templateId: dividerConnectionTemplate.id,
                gasketProfileId: rebateGasketProfileId,
                expectedSides: Object.freeze([...openingCellSides]),
                placedSideCount,
                placementMethod: placedSideCount
                    ? 'direct-join-gaskets-mounted-on-mullion-per-opening-side'
                    : null,
            },
        },
    };
}


export function applyDividerAccessoryConnectionPlacements({
    definition,
    dividerConnectionTemplate,
    profileIds = ['200988', '224068'],
}) {
    if (
        !dividerConnectionTemplate
        || !definition?.metadata?.dividerProfileId
        || !Array.isArray(definition?.profiles)
    ) {
        return definition;
    }

    const requestedProfileIds = new Set((profileIds || []).map(String));
    const accessoryMetadata = {};
    const profiles = definition.profiles.map(profile => {
        const profileId = String(profile.catalogProfileId || profile.profileId || '');
        if (!requestedProfileIds.has(profileId)) return profile;

        const catalogEntry = getProfileCatalogEntry(profileId);
        if (catalogEntry?.type !== 'profile-accessory') return profile;

        const targetCellTypes = catalogEntry.attachment?.connectionCellTypes || [];
        const targets = createMullionMountedConnectionTargets({
            definition,
            dividerConnectionTemplate,
            profile,
            profileId,
            role: 'accessory',
            targetCellTypes,
            // Accessories are profile-specific. A join authored around 575810
            // must not place its optional accessory on 575800 through the
            // generic mullion role fallback.
            requireExactDividerProfile: true,
        });
        if (!targets.size) return profile;

        const cadTransforms = {};
        const occurrenceIndexes = {};
        const placementMethods = {};
        for (const [cellSide, target] of targets) {
            cadTransforms[cellSide] = target.cadTransform;
            occurrenceIndexes[cellSide] = target.occurrence?.occurrenceIndex ?? null;
            placementMethods[cellSide] = target.placementMethod;
        }

        accessoryMetadata[profileId] = {
            templateId: dividerConnectionTemplate.id,
            hostProfileId: definition.metadata.dividerProfileId,
            sides: Object.freeze(Object.keys(cadTransforms)),
            occurrenceIndexes: Object.freeze({ ...occurrenceIndexes }),
            placementMethod: 'exact-direct-join-accessory-mounted-on-selected-divider',
        };

        return {
            ...profile,
            mullionAccessoryCadTransforms: Object.freeze(cadTransforms),
            mullionAccessoryOccurrenceIndexes: Object.freeze(occurrenceIndexes),
            mullionAccessoryPlacementMethods: Object.freeze(placementMethods),
            mullionAccessoryProfileId: profileId,
            mullionAccessoryHostProfileId: definition.metadata.dividerProfileId,
        };
    });

    if (!Object.keys(accessoryMetadata).length) return definition;

    return {
        ...definition,
        profiles,
        metadata: {
            ...definition.metadata,
            dividerMountedAccessories: Object.freeze(accessoryMetadata),
        },
    };
}

export function applyFrameAccessoryConnectionPlacements({
    definition,
    frameConnectionTemplate,
    profileIds = ['200988'],
}) {
    if (
        !frameConnectionTemplate
        || !definition?.sources?.outerFrameProfileId
        || !Array.isArray(definition?.profiles)
    ) {
        return definition;
    }

    const hostProfileId = String(definition.sources.outerFrameProfileId || '');
    const hostOccurrence = resolveConnectionOccurrence(
        frameConnectionTemplate,
        hostProfileId,
        'outer-frame'
    );
    // Frame accessories are authored against a concrete frame section. Do not
    // transfer a 575770-authored INSERT onto 575760 through the generic
    // outer-frame role fallback.
    if (
        !hostOccurrence
        || hostOccurrence.transformSource !== 'exact-profile-occurrence'
        || String(hostOccurrence.profileId || '') !== hostProfileId
    ) {
        return definition;
    }

    const requestedProfileIds = new Set((profileIds || []).map(String));
    const accessoryMetadata = {};
    const profiles = definition.profiles.map(profile => {
        const profileId = String(profile.catalogProfileId || profile.profileId || '');
        if (!requestedProfileIds.has(profileId)) return profile;

        const catalogEntry = getProfileCatalogEntry(profileId);
        if (catalogEntry?.type !== 'profile-accessory') return profile;
        const allowedHostClasses = catalogEntry.attachment?.hostProfileClasses || [];
        // A direct accessory INSERT in frame-sash-window.dwg is the strongest
        // compatibility signal for the exact outer-frame profile authored in
        // that join. Do not reject that CAD-authored placement merely because
        // an older static hostProfileIds list has not yet been widened to that
        // frame. The exact-profile check above still prevents cross-profile
        // reuse between 575760 and 575770.
        if (
            allowedHostClasses.length
            && !allowedHostClasses.includes('outer-frame')
        ) {
            return profile;
        }
        const targetCellTypes = catalogEntry.attachment?.connectionCellTypes || [];
        if (
            targetCellTypes.length
            && !targetCellTypes.includes('opening-sash')
        ) {
            return profile;
        }

        const target = createFrameFixedDirectAccessoryTarget({
            definition,
            frameFixedTemplate: frameConnectionTemplate,
            profileId,
            role: 'accessory',
        });
        if (!target) return profile;

        const section = profile.section === 'bottom' ? 'bottom' : 'top';
        const cadTransform = createDirectAccessoryProfileTransform({
            definition,
            profile,
            localToCanonicalTransform: target.localToWorkingTransform,
            section,
        });
        if (!cadTransform) return profile;

        accessoryMetadata[profileId] = {
            templateId: frameConnectionTemplate.id,
            hostProfileId,
            occurrenceIndex: target.occurrence?.occurrenceIndex ?? null,
            placementMethod: 'exact-direct-join-accessory-mounted-on-selected-frame',
        };

        return {
            ...profile,
            frameAccessoryCadTransform: cadTransform,
            frameAccessoryProfileId: profileId,
            frameAccessoryHostProfileId: hostProfileId,
            frameAccessoryOccurrenceIndex: target.occurrence?.occurrenceIndex ?? null,
            frameAccessoryPlacementMethod:
                'exact-direct-join-accessory-mounted-on-selected-frame',
        };
    });

    if (!Object.keys(accessoryMetadata).length) return definition;

    return {
        ...definition,
        profiles,
        metadata: {
            ...definition.metadata,
            frameMountedAccessories: Object.freeze(accessoryMetadata),
        },
    };
}

export function composeRegisteredProfileDefinitions({
    selection,
    definitionsByProfileSetId,
    standaloneDefinitionsByProfileId,
    connectionTemplate = null,
    placementConnectionTemplate = connectionTemplate,
    fixedGlazingFrameTemplate = null,
    fixedGlazingDividerTemplate = connectionTemplate,
    fixedGlazingDividerGasketTemplate = fixedGlazingDividerTemplate,
    standaloneBeadDefinition = null,
    transConnectionTemplate = null,
}) {
    // Keep the authored mixed-join semantics available even when the runtime
    // topology reverses the two cells.  The CAD file itself is fixed-left /
    // sash-right; geometry occurrence selection must stay in that authored
    // basis and only the runtime-facing boundary metadata is mirrored.
    const authoredConnectionTemplate = connectionTemplate;
    if (
        connectionTemplate &&
        connectionTemplate.id === 'mullion-fixed-sash' &&
        selection.leftCell === 'opening-sash' &&
        selection.rightCell === 'fixed-glazing'
    ) {
        connectionTemplate = {
            ...connectionTemplate,
            leftCell: 'opening-sash',
            rightCell: 'fixed-glazing',
        };
    }
    if (
        placementConnectionTemplate &&
        placementConnectionTemplate.id === 'mullion-fixed-sash' &&
        selection.leftCell === 'opening-sash' &&
        selection.rightCell === 'fixed-glazing'
    ) {
        placementConnectionTemplate = {
            ...placementConnectionTemplate,
            leftCell: 'opening-sash',
            rightCell: 'fixed-glazing',
        };
    }
    let definition = composeLegacyProfileDefinitions({
        selection,
        definitionsByProfileSetId,
    });
    const replacements = [
        {
            profileId: definition.sources.outerFrameProfileId,
            role: 'frame',
        },
        {
            profileId: definition.sources.sashProfileId,
            role: 'sash',
        },
    ];

    for (const replacement of replacements) {
        const entry = getProfileCatalogEntry(replacement.profileId);
        if (!isStandaloneProfileGeometryRegistered(entry)) continue;

        const standaloneDefinition = standaloneDefinitionsByProfileId?.get(entry.id);
        if (!standaloneDefinition) {
            throw new Error(`Registered standalone profile ${entry.id} was not loaded.`);
        }

        definition = replaceLegacyStructuralProfilesWithStandalone({
            definition,
            standaloneDefinition,
            profileId: entry.id,
            role: replacement.role,
        });
    }

    // A layout can contain more than one divider direction (for example the
    // T layout), while this composition pass still represents one concrete CAD
    // connection. Keep the layout topology (`grid`) separate from the physical
    // orientation of the primary connection so horizontal bead/gasket bridges
    // use the same transform basis as the ordinary horizontal-transom layout.
    const dividerOrientation = selection.primaryDividerOrientation
        || selection.dividerOrientation
        || null;
    const dividerProfileId = selection.dividerProfileId || null;
    if (dividerOrientation && dividerProfileId) {
        const entry = getProfileCatalogEntry(dividerProfileId);
        if (!entry || entry.profileClass !== 'mullion-transom') {
            throw new Error(`Profile ${dividerProfileId} is not a mullion/transom profile.`);
        }
        if (!isStandaloneProfileGeometryRegistered(entry)) {
            throw new Error(`Mullion/transom ${dividerProfileId} has no registered runtime geometry.`);
        }
        const standaloneDefinition = standaloneDefinitionsByProfileId?.get(entry.id);
        if (!standaloneDefinition) {
            throw new Error(`Registered mullion/transom ${entry.id} was not loaded.`);
        }
        definition = appendStandaloneDividerProfiles({
            definition,
            standaloneDefinition,
            profileId: entry.id,
            orientation: dividerOrientation,
            connectionTemplate,
            placementConnectionTemplate,
        });
    }

    const hasTransSegment = Boolean(selection.topology?.transSegments?.length);
    const transProfileId = selection.transProfileId || null;
    if (hasTransSegment && transProfileId && transConnectionTemplate) {
        const entry = getProfileCatalogEntry(transProfileId);
        if (!entry || entry.profileClass !== 'trans') {
            throw new Error(`Profile ${transProfileId} is not a trans profile.`);
        }
        if (!isStandaloneProfileGeometryRegistered(entry)) {
            throw new Error(`Trans ${transProfileId} has no registered runtime geometry.`);
        }
        const standaloneDefinition = standaloneDefinitionsByProfileId?.get(entry.id);
        if (!standaloneDefinition) {
            throw new Error(`Registered trans ${entry.id} was not loaded.`);
        }
        definition = appendStandaloneTransProfiles({
            definition,
            standaloneDefinition,
            profileId: entry.id,
            orientation: 'vertical',
            connectionTemplate: transConnectionTemplate,
            placementConnectionTemplate: transConnectionTemplate,
        });
        definition = {
            ...definition,
            metadata: {
                ...definition.metadata,
                transConnectionReady: true,
            },
        };
    }

    if (
        selection.leftCell === 'fixed-glazing'
        || selection.rightCell === 'fixed-glazing'
        || selection.cells?.includes('fixed-glazing')
    ) {
        definition = applyFixedGlazingConnectionPlacements({
            definition,
            standaloneBeadDefinition,
            frameFixedTemplate: fixedGlazingFrameTemplate,
            dividerConnectionTemplate: fixedGlazingDividerTemplate,
            dividerGasketConnectionTemplate: fixedGlazingDividerGasketTemplate,
            selection,
        });
    }

    if (
        dividerOrientation
        && (selection.leftCell === 'opening-sash' || selection.rightCell === 'opening-sash' || selection.cells?.includes('opening-sash'))
    ) {
        definition = applyOpeningSashDividerConnectionPlacements({
            definition,
            // Direct INSERT occurrence selection must remain in the authored
            // CAD basis. Dynamic reversed joins are mirrored later by the
            // divider renderer; using the relabelled template here makes the
            // exact 245472 sash-side INSERT disappear.
            dividerConnectionTemplate: authoredConnectionTemplate || connectionTemplate,
            selection,
        });
    }

    const profiles = definition.profiles.map((profile, index) => ({
        ...profile,
        legacyIndex: profile.legacyIndex ?? profile.index,
        index,
    }));

    return {
        ...definition,
        profiles,
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
