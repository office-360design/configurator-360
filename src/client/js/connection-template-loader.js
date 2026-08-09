const CONNECTION_TEMPLATE_URLS = Object.freeze({
    'frame-fixed': 'cad-connections/frame-fixed/connection.meta.json',
    'mullion-fixed-sash': 'cad-connections/mullion-fixed-sash/connection.meta.json',
    'mullion-fixed-fixed': 'cad-connections/mullion-fixed-fixed/connection.meta.json',
    'mullion-sash-sash': 'cad-connections/mullion-sash-sash/connection.meta.json',
});

function validateTransform(transform, label) {
    const fields = ['a', 'b', 'c', 'd', 'tx', 'ty'];
    if (!transform || fields.some(field => !Number.isFinite(Number(transform[field])))) {
        throw new Error(`${label} does not contain a valid CAD affine transform.`);
    }
}

function validateConnectionTemplate(template, id) {
    if (!template || template.schemaVersion !== 2 || template.id !== id) {
        throw new Error(`Invalid generated connection metadata for ${id}.`);
    }
    if (template.extraction?.method !== 'exact-insert-transform-matching') {
        throw new Error(`${id} was not generated from exact CAD INSERT transforms.`);
    }
    const boundaryRole = template.boundary === 'outer-frame'
        ? 'outer-frame'
        : 'mullion-transom';
    const boundaryOccurrences = template.roleOccurrences?.[boundaryRole] || [];
    const sashOccurrences = template.roleOccurrences?.['opening-sash'] || [];
    if (!boundaryOccurrences.length) {
        throw new Error(`${id} is missing its ${boundaryRole} CAD occurrence.`);
    }
    const requiresOpeningSash = template.leftCell === 'opening-sash'
        || template.rightCell === 'opening-sash';
    if (requiresOpeningSash && !sashOccurrences.length) {
        throw new Error(`${id} is missing its opening-sash CAD occurrence.`);
    }
    boundaryOccurrences.forEach((occurrence, index) =>
        validateTransform(occurrence.transform, `${id} ${boundaryRole} occurrence ${index}`)
    );
    sashOccurrences.forEach((occurrence, index) =>
        validateTransform(occurrence.transform, `${id} opening-sash occurrence ${index}`)
    );
    return template;
}

/**
 * Resolve the join-space basis that corresponds to the already-working
 * standalone sash runtime axes.
 *
 * Standalone CAD +X is window depth and standalone CAD +Y is the in-plane
 * inward/face axis. The sash INSERT maps those two axes into the join drawing.
 * Using the full two-column affine basis works for 0/90/180/270 degree INSERTs,
 * mirrored INSERTs, and any other rigid CAD orientation without guessing from
 * a bounding box or assuming that join Y is always depth.
 */
export function resolveConnectionRuntimeBasis(template) {
    const sashOccurrences = template?.roleOccurrences?.['opening-sash'] || [];
    if (!sashOccurrences.length) return null;

    const transform = sashOccurrences[0]?.transform;
    validateTransform(transform, `${template?.id || 'connection'} opening-sash basis reference`);

    const depthRaw = {
        x: Number(transform.a),
        y: Number(transform.c),
    };
    const faceRaw = {
        x: Number(transform.b),
        y: Number(transform.d),
    };
    const depthLength = Math.hypot(depthRaw.x, depthRaw.y);
    const faceLength = Math.hypot(faceRaw.x, faceRaw.y);
    if (depthLength < 1e-8 || faceLength < 1e-8) {
        throw new Error(`${template?.id || 'Connection'} has a degenerate sash CAD basis.`);
    }

    const depth = {
        x: depthRaw.x / depthLength,
        y: depthRaw.y / depthLength,
    };

    // Remove any tiny numerical/shear component parallel to depth before
    // normalising the face axis. Real INSERTs should already be orthogonal,
    // but this makes the runtime tolerant of converter precision noise.
    const faceParallel = faceRaw.x * depth.x + faceRaw.y * depth.y;
    const faceOrthogonal = {
        x: faceRaw.x - faceParallel * depth.x,
        y: faceRaw.y - faceParallel * depth.y,
    };
    const faceOrthogonalLength = Math.hypot(faceOrthogonal.x, faceOrthogonal.y);
    if (faceOrthogonalLength < 1e-8) {
        throw new Error(`${template?.id || 'Connection'} sash CAD basis axes are collinear.`);
    }
    const face = {
        x: faceOrthogonal.x / faceOrthogonalLength,
        y: faceOrthogonal.y / faceOrthogonalLength,
    };

    return Object.freeze({
        depthX: depth.x,
        depthY: depth.y,
        faceX: face.x,
        faceY: face.y,
        determinant: Number(transform.a) * Number(transform.d)
            - Number(transform.b) * Number(transform.c),
        mirrored: (
            Number(transform.a) * Number(transform.d)
            - Number(transform.b) * Number(transform.c)
        ) < 0,
    });
}

export function projectConnectionDelta(runtimeBasis, deltaX, deltaY) {
    if (!runtimeBasis) {
        return { depth: Number(deltaY) || 0, face: Number(deltaX) || 0 };
    }
    const x = Number(deltaX) || 0;
    const y = Number(deltaY) || 0;
    return {
        depth: x * Number(runtimeBasis.depthX) + y * Number(runtimeBasis.depthY),
        face: x * Number(runtimeBasis.faceX) + y * Number(runtimeBasis.faceY),
    };
}

// Retained for older metadata/debug consumers. New geometry should use the
// full runtime basis above rather than treating one join axis as depth.
export function resolveConnectionDepthAxisSign(template) {
    const basis = resolveConnectionRuntimeBasis(template);
    if (!basis) return null;
    const dominant = Math.abs(basis.depthX) >= Math.abs(basis.depthY)
        ? basis.depthX
        : basis.depthY;
    return dominant >= 0 ? 1 : -1;
}

export function getConnectionTemplateIdForLayout({
    dividerOrientation,
    leftCell = 'fixed-glazing',
    rightCell = 'opening-sash',
} = {}) {
    if (
        (dividerOrientation === 'vertical' || dividerOrientation === 'horizontal')
        && leftCell === 'fixed-glazing'
        && rightCell === 'opening-sash'
    ) {
        // The join CAD is a left/right cross-section. A horizontal transom uses
        // the same physical fixed-side / sash-side relationship, rotated into
        // bottom/top window space by the builder. Reuse the exact same join
        // metadata instead of falling back to the old unconnected transom path.
        return 'mullion-fixed-sash';
    }
    if (
        (dividerOrientation === 'vertical' || dividerOrientation === 'horizontal')
        && leftCell === 'fixed-glazing'
        && rightCell === 'fixed-glazing'
    ) {
        // Fixed/fixed mullion and transom runs use the same left/right join
        // section. Horizontal placement is a runtime rotation of that exact
        // connection, just like the verified mixed transom path.
        return 'mullion-fixed-fixed';
    }
    if (
        dividerOrientation === 'vertical'
        && leftCell === 'opening-sash'
        && rightCell === 'opening-sash'
    ) {
        return 'mullion-sash-sash';
    }
    return null;
}

export function resolveConnectionOccurrences(template, profileId, role) {
    const exact = template?.profileOccurrences?.[String(profileId)] || [];
    if (exact.length) {
        return exact.map(occurrence => ({
            ...occurrence,
            transformSource: 'exact-profile-occurrence',
        }));
    }
    const roleOccurrences = template?.roleOccurrences?.[role] || [];
    return roleOccurrences.map(occurrence => ({
        ...occurrence,
        transformSource: `role-reference:${occurrence.profileId}`,
    }));
}

export function resolveConnectionOccurrence(template, profileId, role) {
    return resolveConnectionOccurrences(template, profileId, role)[0] || null;
}

export function createConnectionTemplateLoader() {
    const cache = new Map();

    async function loadConnectionTemplate(id) {
        if (!id) return null;
        if (cache.has(id)) return cache.get(id);
        const url = CONNECTION_TEMPLATE_URLS[id];
        if (!url) throw new Error(`No runtime connection template is registered for ${id}.`);

        const promise = fetch(url).then(async response => {
            if (!response.ok) {
                throw new Error(
                    `Generated CAD connection ${id} is missing (HTTP ${response.status}). `
                    + `Run npm run cad:connections:convert -- --only ${id} --force.`
                );
            }
            return validateConnectionTemplate(await response.json(), id);
        });
        cache.set(id, promise);
        try {
            return await promise;
        } catch (error) {
            cache.delete(id);
            throw error;
        }
    }

    return { loadConnectionTemplate };
}
