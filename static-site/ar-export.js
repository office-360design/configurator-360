import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const DEFAULT_MAX_GLB_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_USDZ_BYTES = 45 * 1024 * 1024;
const DEFAULT_TARGET_GLB_TRIANGLES = 45000;
const DEFAULT_TARGET_USDZ_TRIANGLES = 22000;
const MIN_EXPORT_TARGET_TRIANGLES = 6000;
const MAX_EXPORT_ATTEMPTS = 4;
const EXPORT_SIZE_HEADROOM = 0.94;
const AR_FORMATS = Object.freeze({
    glb: Object.freeze({
        format: 'glb',
        platform: 'android',
        extension: 'glb',
        contentType: 'model/gltf-binary',
        label: 'GLB'
    }),
    usdz: Object.freeze({
        format: 'usdz',
        platform: 'ios',
        extension: 'usdz',
        contentType: 'model/vnd.usdz+zip',
        label: 'USDZ'
    })
});
const MIN_SIMPLIFY_TRIANGLES = 96;
const MIN_TRIANGLES_PER_MESH = 16;
const WELD_TOLERANCE = 1e-5;
const POSITION_SNAP_METERS = 0.00002;

let optimizationModulesPromise = null;
let usdzExporterPromise = null;

function loadOptimizationModules() {
    if (!optimizationModulesPromise) {
        optimizationModulesPromise = Promise.all([
            import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/modifiers/SimplifyModifier.js'),
            import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js')
        ]).then(([modifierModule, geometryUtils]) => ({
            SimplifyModifier: modifierModule.SimplifyModifier,
            mergeVertices: geometryUtils.mergeVertices,
            mergeGeometries: geometryUtils.mergeGeometries
        }));
    }
    return optimizationModulesPromise;
}

function loadUSDZExporter() {
    if (!usdzExporterPromise) {
        // Keep the exporter on the same Three.js revision as the configurator.
        // Its relative fflate and TextureUtils imports are resolved by the CDN,
        // while the page import map resolves the shared `three` dependency.
        usdzExporterPromise = import(
            'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js'
        );
    }
    return usdzExporterPromise;
}

function normalizeARFormat(format) {
    const normalized = String(format || 'glb').toLowerCase();
    const info = AR_FORMATS[normalized];
    if (!info) throw new Error(`Unsupported AR asset format: ${format}.`);
    return info;
}

function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function triangleCountForGeometry(geometry) {
    if (!geometry?.attributes?.position) return 0;
    return Math.floor((geometry.index?.count || geometry.attributes.position.count) / 3);
}


function snapPositionAttribute(geometry, gridSize = POSITION_SNAP_METERS) {
    const position = geometry?.getAttribute?.('position');
    if (!position || !Number.isFinite(gridSize) || gridSize <= 0) return;

    for (let index = 0; index < position.count; index += 1) {
        position.setXYZ(
            index,
            Math.round(position.getX(index) / gridSize) * gridSize,
            Math.round(position.getY(index) / gridSize) * gridSize,
            Math.round(position.getZ(index) / gridSize) * gridSize
        );
    }
    position.needsUpdate = true;
}

function createCompactNormalAttribute(source) {
    const values = new Int8Array(source.count * 3);
    for (let index = 0; index < source.count; index += 1) {
        values[index * 3] = Math.round(THREE.MathUtils.clamp(source.getX(index), -1, 1) * 127);
        values[index * 3 + 1] = Math.round(THREE.MathUtils.clamp(source.getY(index), -1, 1) * 127);
        values[index * 3 + 2] = Math.round(THREE.MathUtils.clamp(source.getZ(index), -1, 1) * 127);
    }
    return new THREE.Int8BufferAttribute(values, 3, true);
}

function temporarilyCompactGLBNormals(root) {
    const replacements = [];
    root.traverse(object => {
        if (!object.isMesh) return;
        const geometry = object.geometry;
        const normal = geometry?.getAttribute?.('normal');
        if (!normal || normal.isInterleavedBufferAttribute) return;
        replacements.push({ geometry, normal });
        geometry.setAttribute('normal', createCompactNormalAttribute(normal));
    });

    return () => {
        for (const replacement of replacements) {
            replacement.geometry.setAttribute('normal', replacement.normal);
        }
    };
}

function normalizeMaterial(source, cache) {
    const material = Array.isArray(source) ? source[0] : source;
    if (!material) {
        const key = 'fallback';
        if (!cache.has(key)) {
            const fallback = new THREE.MeshStandardMaterial({
                name: 'M0',
                color: 0x808080,
                metalness: 0,
                roughness: 0.7
            });
            fallback.userData.arExportKey = key;
            cache.set(key, fallback);
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
            name: `M${cache.size + 1}`,
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
        normalized.userData.arExportKey = signature;
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

    snapPositionAttribute(geometry);
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
    const requestedTarget = Math.max(
        MIN_EXPORT_TARGET_TRIANGLES,
        Math.floor(finiteNumber(options.targetTriangles, DEFAULT_TARGET_GLB_TRIANGLES))
    );
    const targetTriangles = Math.min(originalTriangleCount, requestedTarget);
    const protectedTriangles = prepared
        .filter(item => item.triangles < MIN_SIMPLIFY_TRIANGLES)
        .reduce((sum, item) => sum + item.triangles, 0);
    const eligibleTriangles = Math.max(0, originalTriangleCount - protectedTriangles);
    const eligibleTarget = Math.max(0, targetTriangles - protectedTriangles);
    const simplifyRatio = eligibleTriangles > 0
        ? THREE.MathUtils.clamp(eligibleTarget / eligibleTriangles, 0.03, 1)
        : 1;

    const materialCache = new Map();
    const materialBuckets = new Map();
    let sourceMeshCount = 0;
    let simplifiedMeshCount = 0;
    let sourceVertexCount = 0;
    let vertexCountBeforeMerge = 0;
    let triangleCountBeforeMerge = 0;

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
            const materialKey = material.userData.arExportKey || material.uuid;
            if (!materialBuckets.has(materialKey)) {
                materialBuckets.set(materialKey, {
                    material,
                    geometries: [],
                    sourceNames: []
                });
            }
            const bucket = materialBuckets.get(materialKey);
            bucket.geometries.push(optimized.geometry);
            bucket.sourceNames.push(item.meshName);

            sourceMeshCount += 1;
            if (optimized.simplified) simplifiedMeshCount += 1;
            sourceVertexCount += optimized.originalVertices;
            vertexCountBeforeMerge += optimized.optimizedVertices;
            triangleCountBeforeMerge += optimized.optimizedTriangles;

            if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
        }
    } finally {
        for (const item of prepared) {
            if (item.geometry?.attributes?.position) item.geometry.dispose();
        }
    }

    if (sourceMeshCount === 0) {
        throw new Error('Geometry optimization removed every mesh from the configured window.');
    }

    const exportRoot = new THREE.Group();
    exportRoot.name = 'ARWindow';
    let meshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;

    try {
        for (const bucket of materialBuckets.values()) {
            let geometry;
            if (bucket.geometries.length === 1) {
                geometry = bucket.geometries[0];
            } else {
                geometry = modules.mergeGeometries(bucket.geometries, false);
                if (!geometry) {
                    throw new Error(`Could not merge ${bucket.geometries.length} meshes sharing one AR material.`);
                }
                for (const sourceGeometry of bucket.geometries) sourceGeometry.dispose();
            }

            geometry.clearGroups();
            geometry.addGroup(0, geometry.index?.count || geometry.getAttribute('position').count, 0);
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            const mesh = new THREE.Mesh(geometry, bucket.material);
            mesh.name = `ARMesh${meshCount + 1}`;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            exportRoot.add(mesh);

            meshCount += 1;
            vertexCount += geometry.getAttribute('position')?.count || 0;
            triangleCount += triangleCountForGeometry(geometry);
        }
    } catch (error) {
        for (const bucket of materialBuckets.values()) {
            for (const geometry of bucket.geometries) geometry?.dispose?.();
        }
        throw error;
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
            sourceMeshCount,
            meshCount,
            mergedMeshCount: Math.max(0, sourceMeshCount - meshCount),
            simplifiedMeshCount,
            skippedMeshCount,
            materialCount: materialCache.size,
            originalTriangleCount,
            triangleCountBeforeMerge,
            triangleCount,
            sourceVertexCount,
            vertexCountBeforeMerge,
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

function exportBinaryGLB(root) {
    return new Promise((resolve, reject) => {
        const restoreNormals = temporarilyCompactGLBNormals(root);
        const exporter = new GLTFExporter();
        exporter.parse(
            root,
            result => {
                restoreNormals();
                if (!(result instanceof ArrayBuffer)) {
                    reject(new Error('Three.js did not return a binary GLB ArrayBuffer.'));
                    return;
                }
                resolve(result);
            },
            error => {
                restoreNormals();
                reject(error instanceof Error ? error : new Error(String(error)));
            },
            {
                binary: true,
                onlyVisible: true,
                truncateDrawRange: true,
                includeCustomExtensions: false,
                maxTextureSize: 1024
            }
        );
    });
}

async function exportBinaryUSDZ(root) {
    const module = await loadUSDZExporter();
    const USDZExporter = module?.USDZExporter;
    if (typeof USDZExporter !== 'function') {
        throw new Error('The Three.js USDZ exporter did not load.');
    }

    const exporter = new USDZExporter();
    const options = {
        quickLookCompatible: true,
        maxTextureSize: 1024,
        ar: {
            anchoring: { type: 'plane' },
            planeAnchoring: { alignment: 'horizontal' }
        }
    };

    let result;
    if (typeof exporter.parseAsync === 'function') {
        result = await exporter.parseAsync(root, options);
    } else if (typeof exporter.parse === 'function') {
        // Three.js r160 exposes USDZExporter.parse(scene, options) as an
        // async method. Newer revisions also provide parseAsync().
        result = await exporter.parse(root, options);
    } else {
        throw new Error('The loaded Three.js USDZ exporter has no parse method.');
    }

    if (result instanceof ArrayBuffer) return result;
    if (ArrayBuffer.isView(result)) {
        return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    }
    throw new Error('Three.js did not return a binary USDZ ArrayBuffer.');
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

export function inspectUSDZ(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new TypeError('USDZ inspection requires an ArrayBuffer.');
    }
    if (arrayBuffer.byteLength < 64) {
        throw new Error('The generated USDZ is too small to contain a valid ZIP archive.');
    }

    const view = new DataView(arrayBuffer);
    const localHeader = view.getUint32(0, true);
    if (localHeader !== 0x04034b50) {
        throw new Error('The generated USDZ does not begin with a ZIP local-file header.');
    }

    const filenameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    if (30 + filenameLength + extraLength > arrayBuffer.byteLength) {
        throw new Error('The generated USDZ has an invalid first ZIP entry.');
    }
    const firstEntry = new TextDecoder().decode(new Uint8Array(arrayBuffer, 30, filenameLength));
    if (!/\.usd[ac]$/i.test(firstEntry)) {
        throw new Error(`The first USDZ archive entry is ${firstEntry || '(empty)'}, not a USD scene file.`);
    }

    // Locate the ZIP End of Central Directory record. ZIP comments can be up
    // to 65,535 bytes, so searching the final 65,557 bytes covers the record.
    const minOffset = Math.max(0, arrayBuffer.byteLength - 65557);
    let eocdOffset = -1;
    for (let offset = arrayBuffer.byteLength - 22; offset >= minOffset; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) throw new Error('The generated USDZ has no ZIP central-directory footer.');

    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    if (
        entryCount < 1 ||
        centralDirectoryOffset + centralDirectorySize > arrayBuffer.byteLength
    ) {
        throw new Error('The generated USDZ central directory is invalid.');
    }

    return {
        byteLength: arrayBuffer.byteLength,
        firstEntry,
        entryCount,
        centralDirectorySize
    };
}

async function validateGLBRoundTrip(arrayBuffer) {
    const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const blob = new Blob([arrayBuffer], { type: AR_FORMATS.glb.contentType });
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

export async function createWindowARAsset({
    sourceRoot,
    applyPose,
    format = 'glb',
    maxBytes,
    targetTriangles
}) {
    if (!sourceRoot?.isObject3D) throw new TypeError('sourceRoot must be a Three.js Object3D.');
    if (typeof applyPose === 'function') applyPose();

    const formatInfo = normalizeARFormat(format);
    const defaultTarget = formatInfo.format === 'usdz'
        ? DEFAULT_TARGET_USDZ_TRIANGLES
        : DEFAULT_TARGET_GLB_TRIANGLES;
    const effectiveMaxBytes = Number.isFinite(maxBytes)
        ? maxBytes
        : (formatInfo.format === 'usdz' ? DEFAULT_MAX_USDZ_BYTES : DEFAULT_MAX_GLB_BYTES);
    let currentTarget = Math.max(
        MIN_EXPORT_TARGET_TRIANGLES,
        Math.floor(finiteNumber(targetTriangles, defaultTarget))
    );
    const attempts = [];

    for (let attempt = 1; attempt <= MAX_EXPORT_ATTEMPTS; attempt += 1) {
        const { exportRoot, stats } = await buildPortableExportRoot(sourceRoot, {
            targetTriangles: currentTarget
        });

        try {
            const arrayBuffer = formatInfo.format === 'usdz'
                ? await exportBinaryUSDZ(exportRoot)
                : await exportBinaryGLB(exportRoot);
            const structure = formatInfo.format === 'usdz'
                ? inspectUSDZ(arrayBuffer)
                : inspectGLB(arrayBuffer);

            attempts.push({
                attempt,
                targetTriangles: currentTarget,
                resultingTriangles: stats.triangleCount,
                fileBytes: arrayBuffer.byteLength
            });

            if (arrayBuffer.byteLength <= effectiveMaxBytes) {
                const roundTrip = formatInfo.format === 'glb'
                    ? await validateGLBRoundTrip(arrayBuffer)
                    : null;

                return {
                    arrayBuffer,
                    format: formatInfo.format,
                    platform: formatInfo.platform,
                    extension: formatInfo.extension,
                    contentType: formatInfo.contentType,
                    stats: {
                        ...stats,
                        format: formatInfo.format,
                        platform: formatInfo.platform,
                        contentType: formatInfo.contentType,
                        fileBytes: arrayBuffer.byteLength,
                        structure,
                        roundTrip,
                        optimizationAttempts: attempts,
                        maxBytes: effectiveMaxBytes
                    }
                };
            }

            if (attempt === MAX_EXPORT_ATTEMPTS || currentTarget <= MIN_EXPORT_TARGET_TRIANGLES) {
                throw new Error(
                    `The generated ${formatInfo.label} is ${(arrayBuffer.byteLength / 1048576).toFixed(2)} MB after ` +
                    `${attempt} optimization pass${attempt === 1 ? '' : 'es'}, above the configured ` +
                    `${(effectiveMaxBytes / 1048576).toFixed(2)} MB limit. ` +
                    `The source CAD/SVG contours are still too dense for this limit.`
                );
            }

            const byteRatio = (effectiveMaxBytes * EXPORT_SIZE_HEADROOM) / arrayBuffer.byteLength;
            const proportionalTarget = Math.floor(stats.triangleCount * byteRatio * 0.92);
            const forcedReductionTarget = Math.floor(currentTarget * 0.72);
            currentTarget = Math.max(
                MIN_EXPORT_TARGET_TRIANGLES,
                Math.min(proportionalTarget, forcedReductionTarget)
            );
        } finally {
            exportRoot.traverse(object => {
                if (object.isMesh) object.geometry?.dispose?.();
            });
        }
    }

    throw new Error(`The ${formatInfo.label} export did not complete.`);
}

export async function createWindowGLB(options) {
    return createWindowARAsset({ ...options, format: 'glb' });
}

export async function createWindowUSDZ(options) {
    return createWindowARAsset({ ...options, format: 'usdz' });
}

export async function sha256Hex(arrayBuffer) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function downloadARAsset(arrayBuffer, filename, format = 'glb') {
    const formatInfo = normalizeARFormat(format);
    const safeFilename = filename || `configured-window.${formatInfo.extension}`;
    const blob = new Blob([arrayBuffer], { type: formatInfo.contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGLB(arrayBuffer, filename = 'configured-window.glb') {
    downloadARAsset(arrayBuffer, filename, 'glb');
}

export function downloadUSDZ(arrayBuffer, filename = 'configured-window.usdz') {
    downloadARAsset(arrayBuffer, filename, 'usdz');
}

// Kept for a future own-server deployment. Static Netlify mode does not call it.
export async function uploadARAsset({ endpoint, arrayBuffer, modelName, appBuild, format = 'glb' }) {
    if (!endpoint) throw new Error('No AR model upload endpoint is configured.');
    const formatInfo = normalizeARFormat(format);

    const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
            'Content-Type': formatInfo.contentType,
            'X-Model-Name': modelName || 'configured-window',
            'X-AR-Format': formatInfo.format,
            'X-AR-Platform': formatInfo.platform,
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

export async function uploadGLB(options) {
    return uploadARAsset({ ...options, format: 'glb' });
}

function uploadError(message, status = 0, code = '') {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

async function requestSupabaseUploadTicket({
    ticketEndpoint,
    arrayBuffer,
    filename,
    sha256,
    appBuild,
    format,
    platform,
    contentType
}) {
    if (!ticketEndpoint) throw uploadError('No Netlify upload-ticket endpoint is configured.');
    const response = await fetch(ticketEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename,
            sha256,
            bytes: arrayBuffer.byteLength,
            format,
            platform,
            contentType,
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

function uploadWithTus({
    ticket,
    arrayBuffer,
    filename,
    sha256,
    appBuild,
    format,
    platform,
    contentType,
    onProgress
}) {
    return new Promise((resolve, reject) => {
        if (!globalThis.tus?.Upload) {
            reject(uploadError('The resumable upload library did not load.'));
            return;
        }

        const blob = new Blob([arrayBuffer], { type: contentType });
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
                contentType,
                cacheControl: '31536000',
                metadata: JSON.stringify({
                    sha256,
                    format,
                    platform,
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

async function uploadWithSignedPut({ ticket, arrayBuffer, contentType, onProgress }) {
    if (!ticket.signedUrl) throw uploadError('Supabase did not return a signed upload URL.');
    const form = new FormData();
    form.append('cacheControl', '31536000');
    form.append('', new Blob([arrayBuffer], { type: contentType }));
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
    if (typeof onProgress === 'function') {
        onProgress(arrayBuffer.byteLength, arrayBuffer.byteLength);
    }
    return ticket;
}

export async function uploadARAssetToSupabase({
    ticketEndpoint,
    arrayBuffer,
    filename,
    sha256,
    appBuild,
    format = 'glb',
    platform,
    onProgress
}) {
    const formatInfo = normalizeARFormat(format);
    const effectivePlatform = String(platform || formatInfo.platform).toLowerCase();
    if (effectivePlatform !== formatInfo.platform) {
        throw uploadError(`${formatInfo.label} is not valid for the ${effectivePlatform} AR route.`);
    }

    const ticket = await requestSupabaseUploadTicket({
        ticketEndpoint,
        arrayBuffer,
        filename,
        sha256,
        appBuild,
        format: formatInfo.format,
        platform: effectivePlatform,
        contentType: formatInfo.contentType
    });

    if (ticket.exists) {
        if (typeof onProgress === 'function') onProgress(arrayBuffer.byteLength, arrayBuffer.byteLength);
        return ticket;
    }

    const uploadOptions = {
        ticket,
        arrayBuffer,
        filename,
        sha256,
        appBuild,
        format: formatInfo.format,
        platform: effectivePlatform,
        contentType: formatInfo.contentType,
        onProgress
    };

    if (globalThis.tus?.Upload && ticket.tusEndpoint && ticket.token) {
        try {
            return await uploadWithTus(uploadOptions);
        } catch (error) {
            // The signed PUT route is a compatibility fallback if the resumable
            // endpoint is temporarily unavailable. The binary still travels
            // directly from the browser to Supabase, not through Netlify.
            if (ticket.signedUrl) {
                console.warn('Signed resumable upload failed; retrying signed PUT.', error);
                return uploadWithSignedPut(uploadOptions);
            }
            throw error;
        }
    }

    return uploadWithSignedPut(uploadOptions);
}

export async function uploadGLBToSupabase(options) {
    return uploadARAssetToSupabase({ ...options, format: 'glb', platform: 'android' });
}

export function formatExportStats(stats) {
    const size = stats.dimensionsMeters;
    const formatInfo = normalizeARFormat(stats.format || 'glb');
    const reduction = stats.originalTriangleCount > 0
        ? 100 * (1 - stats.triangleCount / stats.originalTriangleCount)
        : 0;
    const attempts = Array.isArray(stats.optimizationAttempts) ? stats.optimizationAttempts : [];
    const lines = [
        `${formatInfo.label}: ${(stats.fileBytes / 1048576).toFixed(2)} MB`,
        `Meshes: ${stats.sourceMeshCount ?? stats.meshCount} source → ${stats.meshCount} merged export meshes`,
        `Materials: ${stats.materialCount}`,
        `Triangles: ${stats.originalTriangleCount.toLocaleString()} → ${stats.triangleCount.toLocaleString()} (${reduction.toFixed(1)}% reduction)`,
        `Vertices: ${stats.sourceVertexCount.toLocaleString()} → ${stats.vertexCount.toLocaleString()}`,
        `Dimensions: ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`
    ];

    if (attempts.length > 1) {
        lines.push(`Adaptive size passes: ${attempts.map(item => `${item.resultingTriangles.toLocaleString()} tris / ${(item.fileBytes / 1048576).toFixed(2)} MB`).join(' → ')}`);
    }

    if (formatInfo.format === 'glb') {
        lines.push(
            `Round-trip: ${stats.roundTrip.meshCount} meshes / ${stats.roundTrip.triangleCount.toLocaleString()} triangles`,
            `glTF structure: ${stats.structure.nodeCount} nodes, ${stats.structure.accessorCount} accessors`,
            stats.fileBytes > 10 * 1024 * 1024
                ? 'Warning: above Scene Viewer’s recommended 10 MB model size.'
                : 'Scene Viewer 10 MB recommendation: passed.',
            stats.triangleCount > 50000
                ? 'Warning: above the ideal 30,000–50,000 triangle range.'
                : 'Scene Viewer ideal triangle range: passed.'
        );
    } else {
        lines.push(
            `USDZ archive: ${stats.structure.entryCount} entries; root ${stats.structure.firstEntry}`,
            'Apple Quick Look export: validated as a USDZ ZIP archive.'
        );
    }

    return lines.join('\n');
}

