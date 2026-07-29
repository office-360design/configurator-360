import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_TARGET_TRIANGLES = 90000;
const MIN_SIMPLIFY_TRIANGLES = 180;
const MIN_TRIANGLES_PER_MESH = 24;
const WELD_TOLERANCE = 1e-5;

let optimizationModulesPromise = null;

function loadOptimizationModules() {
    if (!optimizationModulesPromise) {
        optimizationModulesPromise = Promise.all([
            import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/modifiers/SimplifyModifier.js'),
            import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js')
        ]).then(([modifierModule, geometryUtils]) => ({
            SimplifyModifier: modifierModule.SimplifyModifier,
            mergeVertices: geometryUtils.mergeVertices
        }));
    }
    return optimizationModulesPromise;
}

function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function triangleCountForGeometry(geometry) {
    if (!geometry?.attributes?.position) return 0;
    return Math.floor((geometry.index?.count || geometry.attributes.position.count) / 3);
}

function normalizeMaterial(source, cache) {
    const material = Array.isArray(source) ? source[0] : source;
    if (!material) {
        const key = 'fallback';
        if (!cache.has(key)) {
            cache.set(key, new THREE.MeshStandardMaterial({
                name: 'Fallback material',
                color: 0x808080,
                metalness: 0,
                roughness: 0.7
            }));
        }
        return cache.get(key);
    }

    const color = material.color?.getHex?.() ?? 0x808080;
    const opacity = THREE.MathUtils.clamp(finiteNumber(material.opacity, 1), 0, 1);
    const transparent = Boolean(material.transparent || opacity < 0.999);
    const roughness = THREE.MathUtils.clamp(finiteNumber(material.roughness, 0.65), 0, 1);
    const metalness = THREE.MathUtils.clamp(finiteNumber(material.metalness, 0), 0, 1);
    const side = material.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
    const signature = [
        color,
        opacity.toFixed(4),
        transparent ? 1 : 0,
        roughness.toFixed(4),
        metalness.toFixed(4),
        side
    ].join('|');

    if (!cache.has(signature)) {
        const normalized = new THREE.MeshStandardMaterial({
            name: material.name || `Material ${cache.size + 1}`,
            color,
            opacity,
            transparent,
            roughness,
            metalness,
            side,
            depthWrite: !transparent
        });
        normalized.alphaTest = finiteNumber(material.alphaTest, 0);
        normalized.emissive?.setHex?.(material.emissive?.getHex?.() ?? 0x000000);
        normalized.emissiveIntensity = finiteNumber(material.emissiveIntensity, 1);
        cache.set(signature, normalized);
    }

    return cache.get(signature);
}

function validateFiniteAttribute(attribute, label) {
    for (let i = 0; i < attribute.array.length; i += 1) {
        if (!Number.isFinite(attribute.array[i])) {
            throw new Error(`${label} contains a non-finite value at array index ${i}.`);
        }
    }
}

function prepareGeometry(sourceGeometry, worldMatrix, meshName) {
    if (!sourceGeometry?.attributes?.position) {
        throw new Error(`${meshName} has no position attribute.`);
    }

    const geometry = sourceGeometry.index
        ? sourceGeometry.toNonIndexed()
        : sourceGeometry.clone();

    geometry.applyMatrix4(worldMatrix);

    for (const attributeName of Object.keys(geometry.attributes)) {
        if (attributeName !== 'position') geometry.deleteAttribute(attributeName);
    }

    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) {
        geometry.dispose();
        return null;
    }
    validateFiniteAttribute(position, `${meshName} positions`);

    const completeVertexCount = Math.floor(position.count / 3) * 3;
    if (completeVertexCount < 3) {
        geometry.dispose();
        return null;
    }
    if (completeVertexCount !== position.count) geometry.setDrawRange(0, completeVertexCount);

    geometry.clearGroups();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        geometry.dispose();
        throw new Error(`${meshName} produced invalid bounds.`);
    }

    return geometry;
}

function removeDegenerateTriangles(sourceGeometry) {
    const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
    const position = geometry.getAttribute('position');
    const values = position.array;
    const kept = [];
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let offset = 0; offset + 8 < values.length; offset += 9) {
        a.set(values[offset], values[offset + 1], values[offset + 2]);
        b.set(values[offset + 3], values[offset + 4], values[offset + 5]);
        c.set(values[offset + 6], values[offset + 7], values[offset + 8]);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        if (ab.cross(ac).lengthSq() <= 1e-18) continue;
        kept.push(
            a.x, a.y, a.z,
            b.x, b.y, b.z,
            c.x, c.y, c.z
        );
    }

    if (geometry !== sourceGeometry) sourceGeometry.dispose();
    if (kept.length === values.length) return geometry;

    geometry.dispose();
    if (kept.length < 9) return null;
    const cleaned = new THREE.BufferGeometry();
    cleaned.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    return cleaned;
}

async function optimizeGeometry(sourceGeometry, desiredTriangles, meshName, modules) {
    let geometry = sourceGeometry;
    const originalTriangles = triangleCountForGeometry(geometry);
    let simplified = false;

    if (
        originalTriangles >= MIN_SIMPLIFY_TRIANGLES &&
        desiredTriangles < originalTriangles - 4
    ) {
        const positionCount = geometry.getAttribute('position').count;
        const desiredVertices = Math.max(MIN_TRIANGLES_PER_MESH * 3, desiredTriangles * 3);
        const removeCount = Math.max(0, Math.min(positionCount - 12, positionCount - desiredVertices));

        if (removeCount > 0) {
            try {
                const modifier = new modules.SimplifyModifier();
                const result = modifier.modify(geometry, removeCount);
                if (triangleCountForGeometry(result) >= 4) {
                    geometry.dispose();
                    geometry = result;
                    simplified = true;
                } else {
                    result.dispose();
                }
            } catch (error) {
                console.warn(`AR simplification skipped for ${meshName}:`, error);
            }
        }
    }

    geometry = removeDegenerateTriangles(geometry);
    if (!geometry) return null;

    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    validateFiniteAttribute(geometry.getAttribute('normal'), `${meshName} normals`);

    // mergeVertices hashes positions and face normals together. Coplanar duplicates are
    // indexed, while vertices across sharp profile edges remain split.
    const indexed = modules.mergeVertices(geometry, WELD_TOLERANCE);
    if (indexed !== geometry) geometry.dispose();
    geometry = indexed;

    geometry.clearGroups();
    geometry.addGroup(0, geometry.index?.count || geometry.getAttribute('position').count, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return {
        geometry,
        simplified,
        originalTriangles,
        optimizedTriangles: triangleCountForGeometry(geometry),
        originalVertices: sourceGeometry.getAttribute('position')?.count || 0,
        optimizedVertices: geometry.getAttribute('position')?.count || 0
    };
}

async function buildPortableExportRoot(sourceRoot, options = {}) {
    sourceRoot.updateWorldMatrix(true, true);
    const modules = await loadOptimizationModules();
    const prepared = [];
    let skippedMeshCount = 0;

    sourceRoot.traverse(object => {
        if (!object.isMesh || !object.visible) return;
        const meshName = object.name || `Mesh ${prepared.length + skippedMeshCount + 1}`;
        const geometry = prepareGeometry(object.geometry, object.matrixWorld, meshName);
        if (!geometry) {
            skippedMeshCount += 1;
            return;
        }
        prepared.push({
            meshName,
            geometry,
            materialSource: object.material,
            triangles: triangleCountForGeometry(geometry)
        });
    });

    if (prepared.length === 0) {
        throw new Error('The configured window does not contain any exportable meshes.');
    }

    const originalTriangleCount = prepared.reduce((sum, item) => sum + item.triangles, 0);
    const requestedTarget = Math.max(10000, Math.floor(finiteNumber(options.targetTriangles, DEFAULT_TARGET_TRIANGLES)));
    const targetTriangles = Math.min(originalTriangleCount, requestedTarget);
    const protectedTriangles = prepared
        .filter(item => item.triangles < MIN_SIMPLIFY_TRIANGLES)
        .reduce((sum, item) => sum + item.triangles, 0);
    const eligibleTriangles = Math.max(0, originalTriangleCount - protectedTriangles);
    const eligibleTarget = Math.max(0, targetTriangles - protectedTriangles);
    const simplifyRatio = eligibleTriangles > 0
        ? THREE.MathUtils.clamp(eligibleTarget / eligibleTriangles, 0.05, 1)
        : 1;

    const exportRoot = new THREE.Group();
    exportRoot.name = 'Configured window';
    const materialCache = new Map();
    let meshCount = 0;
    let simplifiedMeshCount = 0;
    let sourceVertexCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;

    try {
        for (let index = 0; index < prepared.length; index += 1) {
            const item = prepared[index];
            const desiredTriangles = item.triangles < MIN_SIMPLIFY_TRIANGLES
                ? item.triangles
                : Math.max(MIN_TRIANGLES_PER_MESH, Math.floor(item.triangles * simplifyRatio));

            const optimized = await optimizeGeometry(
                item.geometry,
                desiredTriangles,
                item.meshName,
                modules
            );
            if (!optimized) {
                skippedMeshCount += 1;
                continue;
            }

            const material = normalizeMaterial(item.materialSource, materialCache);
            const mesh = new THREE.Mesh(optimized.geometry, material);
            mesh.name = item.meshName;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            exportRoot.add(mesh);

            meshCount += 1;
            if (optimized.simplified) simplifiedMeshCount += 1;
            sourceVertexCount += optimized.originalVertices;
            vertexCount += optimized.optimizedVertices;
            triangleCount += optimized.optimizedTriangles;

            // Give the browser a chance to repaint the progress text during heavier exports.
            if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
        }
    } finally {
        for (const item of prepared) {
            if (item.geometry?.attributes?.position) item.geometry.dispose();
        }
    }

    if (meshCount === 0) {
        throw new Error('Geometry optimization removed every mesh from the configured window.');
    }

    exportRoot.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(exportRoot);
    if (originalBounds.isEmpty()) {
        throw new Error('The configured window has empty export bounds.');
    }

    const center = originalBounds.getCenter(new THREE.Vector3());
    exportRoot.position.set(-center.x, -originalBounds.min.y, -center.z);
    exportRoot.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(exportRoot);
    const size = bounds.getSize(new THREE.Vector3());
    const min = bounds.min.clone();
    const max = bounds.max.clone();

    return {
        exportRoot,
        stats: {
            meshCount,
            simplifiedMeshCount,
            skippedMeshCount,
            materialCount: materialCache.size,
            originalTriangleCount,
            triangleCount,
            sourceVertexCount,
            vertexCount,
            targetTriangles,
            dimensionsMeters: { x: size.x, y: size.y, z: size.z },
            boundsMeters: {
                min: { x: min.x, y: min.y, z: min.z },
                max: { x: max.x, y: max.y, z: max.z }
            }
        }
    };
}

function exportBinary(root) {
    return new Promise((resolve, reject) => {
        const exporter = new GLTFExporter();
        exporter.parse(
            root,
            result => {
                if (!(result instanceof ArrayBuffer)) {
                    reject(new Error('Three.js did not return a binary GLB ArrayBuffer.'));
                    return;
                }
                resolve(result);
            },
            error => reject(error instanceof Error ? error : new Error(String(error))),
            {
                binary: true,
                onlyVisible: true,
                truncateDrawRange: true,
                includeCustomExtensions: false,
                maxTextureSize: 2048
            }
        );
    });
}

export function inspectGLB(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new TypeError('GLB inspection requires an ArrayBuffer.');
    }
    if (arrayBuffer.byteLength < 20) {
        throw new Error('The generated GLB is too small to contain a valid header and JSON chunk.');
    }

    const view = new DataView(arrayBuffer);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const declaredLength = view.getUint32(8, true);
    if (magic !== GLB_MAGIC) throw new Error('The generated file does not have the GLB magic header.');
    if (version !== GLB_VERSION) throw new Error(`Unsupported GLB version ${version}.`);
    if (declaredLength !== arrayBuffer.byteLength) {
        throw new Error(`GLB length mismatch: header says ${declaredLength}, actual size is ${arrayBuffer.byteLength}.`);
    }

    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== JSON_CHUNK_TYPE) throw new Error('The first GLB chunk is not JSON.');
    if (20 + jsonLength > arrayBuffer.byteLength) throw new Error('The GLB JSON chunk exceeds the file length.');

    const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonLength);
    const jsonText = new TextDecoder().decode(jsonBytes).replace(/\u0000+$/g, '').trim();
    let document;
    try {
        document = JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`The GLB JSON chunk cannot be parsed: ${error.message}`);
    }

    if (document.asset?.version !== '2.0') {
        throw new Error(`The GLB asset version is ${document.asset?.version || 'missing'}, not 2.0.`);
    }

    const unsupportedExtensions = (document.extensionsUsed || []).filter(name => ![
        'KHR_materials_pbrSpecularGlossiness',
        'KHR_materials_unlit',
        'KHR_texture_transform'
    ].includes(name));

    return {
        byteLength: arrayBuffer.byteLength,
        sceneCount: document.scenes?.length || 0,
        nodeCount: document.nodes?.length || 0,
        meshCount: document.meshes?.length || 0,
        materialCount: document.materials?.length || 0,
        accessorCount: document.accessors?.length || 0,
        bufferViewCount: document.bufferViews?.length || 0,
        extensionNames: Array.isArray(document.extensionsUsed) ? document.extensionsUsed : [],
        unsupportedExtensions
    };
}

async function validateRoundTrip(arrayBuffer) {
    const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
    const blobUrl = URL.createObjectURL(blob);

    try {
        const gltf = await loader.loadAsync(blobUrl);
        let meshCount = 0;
        let triangleCount = 0;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(object => {
            if (!object.isMesh) return;
            meshCount += 1;
            triangleCount += triangleCountForGeometry(object.geometry);
        });
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        if (meshCount === 0 || bounds.isEmpty()) {
            throw new Error('The exported GLB re-imported without a usable mesh scene.');
        }
        const size = bounds.getSize(new THREE.Vector3());
        return {
            meshCount,
            triangleCount,
            dimensionsMeters: { x: size.x, y: size.y, z: size.z }
        };
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

export async function createWindowGLB({
    sourceRoot,
    applyPose,
    maxBytes = DEFAULT_MAX_BYTES,
    targetTriangles = DEFAULT_TARGET_TRIANGLES
}) {
    if (!sourceRoot?.isObject3D) throw new TypeError('sourceRoot must be a Three.js Object3D.');
    if (typeof applyPose === 'function') applyPose();

    const { exportRoot, stats } = await buildPortableExportRoot(sourceRoot, { targetTriangles });
    try {
        const arrayBuffer = await exportBinary(exportRoot);
        const structure = inspectGLB(arrayBuffer);
        if (arrayBuffer.byteLength > maxBytes) {
            throw new Error(`The generated GLB is ${(arrayBuffer.byteLength / 1048576).toFixed(2)} MB, above the configured ${(maxBytes / 1048576).toFixed(2)} MB limit.`);
        }
        const roundTrip = await validateRoundTrip(arrayBuffer);
        return {
            arrayBuffer,
            stats: {
                ...stats,
                fileBytes: arrayBuffer.byteLength,
                structure,
                roundTrip
            }
        };
    } finally {
        exportRoot.traverse(object => {
            if (object.isMesh) object.geometry?.dispose?.();
        });
    }
}

export async function sha256Hex(arrayBuffer) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function downloadGLB(arrayBuffer, filename = 'configured-window.glb') {
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Kept for a future own-server deployment. Static Netlify mode does not call it.
export async function uploadGLB({ endpoint, arrayBuffer, modelName, appBuild }) {
    if (!endpoint) throw new Error('No AR model upload endpoint is configured.');

    const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
            'Content-Type': 'model/gltf-binary',
            'X-Model-Name': modelName || 'configured-window',
            'X-App-Build': appBuild || 'unknown'
        },
        body: arrayBuffer
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_error) {}

    if (!response.ok || !payload?.modelUrl) {
        throw new Error(payload?.error || `Model upload failed with HTTP ${response.status}.`);
    }
    return payload;
}


function uploadError(message, status = 0, code = '') {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

async function requestSupabaseUploadTicket({
    ticketEndpoint,
    accessKey,
    arrayBuffer,
    filename,
    sha256,
    appBuild
}) {
    if (!ticketEndpoint) throw uploadError('No Netlify upload-ticket endpoint is configured.');
    const response = await fetch(ticketEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-AR-Upload-Key': accessKey || ''
        },
        body: JSON.stringify({
            filename,
            sha256,
            bytes: arrayBuffer.byteLength,
            contentType: 'model/gltf-binary',
            appBuild: appBuild || 'unknown'
        })
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_error) {}
    if (!response.ok || !payload?.publicUrl) {
        throw uploadError(
            payload?.message || payload?.error || `The upload ticket failed with HTTP ${response.status}.`,
            response.status,
            payload?.error || ''
        );
    }
    return payload;
}

function uploadWithTus({ ticket, arrayBuffer, filename, sha256, appBuild, onProgress }) {
    return new Promise((resolve, reject) => {
        if (!globalThis.tus?.Upload) {
            reject(uploadError('The resumable upload library did not load.'));
            return;
        }

        const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
        const upload = new globalThis.tus.Upload(blob, {
            endpoint: ticket.tusEndpoint,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
                'x-signature': ticket.token,
                'x-upsert': 'false'
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: 6 * 1024 * 1024,
            metadata: {
                bucketName: ticket.bucket,
                objectName: ticket.path,
                filename,
                contentType: 'model/gltf-binary',
                cacheControl: '31536000',
                metadata: JSON.stringify({
                    sha256,
                    appBuild: appBuild || 'unknown'
                })
            },
            onError(error) {
                reject(uploadError(
                    error?.message || 'The resumable Supabase upload failed.',
                    0,
                    'TUS_UPLOAD_FAILED'
                ));
            },
            onProgress(bytesUploaded, bytesTotal) {
                if (typeof onProgress === 'function') {
                    onProgress(bytesUploaded, bytesTotal);
                }
            },
            onSuccess() {
                resolve({
                    ...ticket,
                    uploadUrl: upload.url || ''
                });
            }
        });

        upload.start();
    });
}

async function uploadWithSignedPut({ ticket, arrayBuffer }) {
    if (!ticket.signedUrl) throw uploadError('Supabase did not return a signed upload URL.');
    const form = new FormData();
    form.append('cacheControl', '31536000');
    form.append('', new Blob([arrayBuffer], { type: 'model/gltf-binary' }));
    const response = await fetch(ticket.signedUrl, {
        method: 'PUT',
        headers: { 'x-upsert': 'false' },
        body: form
    });
    if (!response.ok) {
        let detail = '';
        try {
            const payload = await response.json();
            detail = payload?.message || payload?.error || '';
        } catch (_error) {}
        throw uploadError(
            `The fallback Supabase upload failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}.`,
            response.status,
            'SIGNED_PUT_FAILED'
        );
    }
    return ticket;
}

export async function uploadGLBToSupabase({
    ticketEndpoint,
    accessKey,
    arrayBuffer,
    filename,
    sha256,
    appBuild,
    onProgress
}) {
    const ticket = await requestSupabaseUploadTicket({
        ticketEndpoint,
        accessKey,
        arrayBuffer,
        filename,
        sha256,
        appBuild
    });

    if (ticket.exists) {
        if (typeof onProgress === 'function') onProgress(arrayBuffer.byteLength, arrayBuffer.byteLength);
        return ticket;
    }

    if (globalThis.tus?.Upload && ticket.tusEndpoint && ticket.token) {
        try {
            return await uploadWithTus({
                ticket,
                arrayBuffer,
                filename,
                sha256,
                appBuild,
                onProgress
            });
        } catch (error) {
            // The signed PUT route is a useful compatibility fallback if the
            // resumable endpoint is temporarily unavailable. The GLB still
            // uploads directly from the browser to Supabase, not through
            // Netlify.
            if (ticket.signedUrl) {
                console.warn('Signed resumable upload failed; retrying signed PUT.', error);
                return uploadWithSignedPut({ ticket, arrayBuffer });
            }
            throw error;
        }
    }

    return uploadWithSignedPut({ ticket, arrayBuffer });
}

export function formatExportStats(stats) {
    const size = stats.dimensionsMeters;
    const reduction = stats.originalTriangleCount > 0
        ? 100 * (1 - stats.triangleCount / stats.originalTriangleCount)
        : 0;
    return [
        `GLB: ${(stats.fileBytes / 1048576).toFixed(2)} MB`,
        `Meshes: ${stats.meshCount} (${stats.simplifiedMeshCount} simplified, ${stats.skippedMeshCount} skipped)`,
        `Materials: ${stats.materialCount}`,
        `Triangles: ${stats.originalTriangleCount.toLocaleString()} → ${stats.triangleCount.toLocaleString()} (${reduction.toFixed(1)}% reduction)`,
        `Indexed vertices: ${stats.sourceVertexCount.toLocaleString()} → ${stats.vertexCount.toLocaleString()}`,
        `Dimensions: ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`,
        `Round-trip: ${stats.roundTrip.meshCount} meshes / ${stats.roundTrip.triangleCount.toLocaleString()} triangles`,
        `glTF structure: ${stats.structure.nodeCount} nodes, ${stats.structure.accessorCount} accessors`,
        stats.triangleCount > 100000 ? 'Warning: still above Scene Viewer’s recommended 100,000-triangle limit.' : 'Scene Viewer triangle recommendation: passed.'
    ].join('\n');
}
