import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
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
    const signature = [color, opacity.toFixed(4), transparent ? 1 : 0, roughness.toFixed(4), metalness.toFixed(4), side].join('|');

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

function sanitizeGeometry(sourceGeometry, worldMatrix, meshName) {
    if (!sourceGeometry?.attributes?.position) {
        throw new Error(`${meshName} has no position attribute.`);
    }

    let geometry = sourceGeometry.index
        ? sourceGeometry.toNonIndexed()
        : sourceGeometry.clone();

    geometry.applyMatrix4(worldMatrix);

    for (const attributeName of Object.keys(geometry.attributes)) {
        if (attributeName !== 'position' && attributeName !== 'normal') {
            geometry.deleteAttribute(attributeName);
        }
    }

    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) {
        geometry.dispose();
        return null;
    }
    validateFiniteAttribute(position, `${meshName} positions`);

    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal');
    validateFiniteAttribute(normal, `${meshName} normals`);

    const completeVertexCount = Math.floor(position.count / 3) * 3;
    if (completeVertexCount < 3) {
        geometry.dispose();
        return null;
    }
    if (completeVertexCount !== position.count) {
        geometry.setDrawRange(0, completeVertexCount);
    }

    geometry.clearGroups();
    geometry.addGroup(0, completeVertexCount, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const box = geometry.boundingBox;
    if (!box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        geometry.dispose();
        throw new Error(`${meshName} produced invalid bounds.`);
    }

    return geometry;
}

function buildPortableExportRoot(sourceRoot) {
    sourceRoot.updateWorldMatrix(true, true);

    const exportRoot = new THREE.Group();
    exportRoot.name = 'Configured window';
    const materialCache = new Map();
    let meshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    let skippedMeshCount = 0;

    sourceRoot.traverse(object => {
        if (!object.isMesh || !object.visible) return;

        const meshName = object.name || `Mesh ${meshCount + skippedMeshCount + 1}`;
        const geometry = sanitizeGeometry(object.geometry, object.matrixWorld, meshName);
        if (!geometry) {
            skippedMeshCount += 1;
            return;
        }

        const material = normalizeMaterial(object.material, materialCache);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = meshName;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        exportRoot.add(mesh);

        const vertices = geometry.getAttribute('position').count;
        meshCount += 1;
        vertexCount += vertices;
        triangleCount += Math.floor(vertices / 3);
    });

    if (meshCount === 0) {
        throw new Error('The configured window does not contain any exportable meshes.');
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
            skippedMeshCount,
            materialCount: materialCache.size,
            vertexCount,
            triangleCount,
            dimensionsMeters: {
                x: size.x,
                y: size.y,
                z: size.z
            },
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

    return {
        byteLength: arrayBuffer.byteLength,
        sceneCount: document.scenes?.length || 0,
        nodeCount: document.nodes?.length || 0,
        meshCount: document.meshes?.length || 0,
        materialCount: document.materials?.length || 0,
        accessorCount: document.accessors?.length || 0,
        bufferViewCount: document.bufferViews?.length || 0,
        extensionNames: Array.isArray(document.extensionsUsed) ? document.extensionsUsed : []
    };
}

async function validateRoundTrip(arrayBuffer) {
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
            const geometry = object.geometry;
            if (geometry.index) triangleCount += Math.floor(geometry.index.count / 3);
            else triangleCount += Math.floor((geometry.getAttribute('position')?.count || 0) / 3);
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
    maxBytes = DEFAULT_MAX_BYTES
}) {
    if (!sourceRoot?.isObject3D) throw new TypeError('sourceRoot must be a Three.js Object3D.');
    if (typeof applyPose === 'function') applyPose();

    const { exportRoot, stats } = buildPortableExportRoot(sourceRoot);
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

export async function uploadGLB({ endpoint, arrayBuffer, modelName, appBuild }) {
    if (!endpoint || /REPLACE-WITH-YOUR-WORKER/i.test(endpoint)) {
        throw new Error('AR model storage is not configured. Set endpoint in ar-upload-config.js after deploying the Cloudflare Worker.');
    }

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
    } catch (_error) {
        // Preserve the HTTP status in the error below.
    }

    if (!response.ok || !payload?.modelUrl) {
        throw new Error(payload?.error || `Model upload failed with HTTP ${response.status}.`);
    }

    return payload;
}

export function formatExportStats(stats) {
    const size = stats.dimensionsMeters;
    return [
        `GLB: ${(stats.fileBytes / 1048576).toFixed(2)} MB`,
        `Meshes: ${stats.meshCount} (${stats.skippedMeshCount} skipped)`,
        `Materials: ${stats.materialCount}`,
        `Triangles: ${stats.triangleCount.toLocaleString()}`,
        `Vertices: ${stats.vertexCount.toLocaleString()}`,
        `Dimensions: ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`,
        `Round-trip: ${stats.roundTrip.meshCount} meshes / ${stats.roundTrip.triangleCount.toLocaleString()} triangles`,
        `glTF structure: ${stats.structure.nodeCount} nodes, ${stats.structure.accessorCount} accessors`
    ].join('\n');
}
