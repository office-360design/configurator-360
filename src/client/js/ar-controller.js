import * as THREE from 'three';
import {
    createWindowARAsset,
    downloadARAsset,
    uploadARAsset,
    uploadARAssetToSupabase,
    sha256Hex,
} from '../ar-export.js';
import { getWindowLocale, windowT } from './i18n.js';


function formatLocalizedExportStats(stats) {
    const locale = getWindowLocale();
    const size = stats.dimensionsMeters;
    const reduction = stats.originalTriangleCount > 0
        ? 100 * (1 - stats.triangleCount / stats.originalTriangleCount)
        : 0;
    const attempts = Array.isArray(stats.optimizationAttempts) ? stats.optimizationAttempts : [];
    const number = value => Number(value ?? 0).toLocaleString(locale);
    const lines = [
        `${String(stats.format || 'glb').toUpperCase()}: ${(stats.fileBytes / 1048576).toFixed(2)} MB`,
        windowT(locale, 'ar.stats.meshes', {
            source: stats.sourceMeshCount ?? stats.meshCount,
            merged: stats.meshCount,
        }),
        windowT(locale, 'ar.stats.materials', { count: stats.materialCount }),
        windowT(locale, 'ar.stats.triangles', {
            source: number(stats.originalTriangleCount),
            result: number(stats.triangleCount),
            reduction: reduction.toFixed(1),
        }),
        windowT(locale, 'ar.stats.vertices', {
            source: number(stats.sourceVertexCount),
            result: number(stats.vertexCount),
        }),
        windowT(locale, 'ar.stats.dimensions', {
            x: size.x.toFixed(3),
            y: size.y.toFixed(3),
            z: size.z.toFixed(3),
        }),
    ];

    if (attempts.length > 1) {
        lines.push(windowT(locale, 'ar.stats.adaptive', {
            passes: attempts
                .map(item => `${number(item.resultingTriangles)} tris / ${(item.fileBytes / 1048576).toFixed(2)} MB`)
                .join(' → '),
        }));
    }

    if (String(stats.format || 'glb').toLowerCase() === 'glb') {
        lines.push(
            windowT(locale, 'ar.stats.roundTrip', {
                meshes: stats.roundTrip.meshCount,
                triangles: number(stats.roundTrip.triangleCount),
            }),
            windowT(locale, 'ar.stats.gltf', {
                nodes: stats.structure.nodeCount,
                accessors: stats.structure.accessorCount,
            }),
            windowT(locale, stats.fileBytes > 10 * 1024 * 1024
                ? 'ar.stats.sceneSizeWarning'
                : 'ar.stats.sceneSizePassed'),
            windowT(locale, stats.triangleCount > 50000
                ? 'ar.stats.triangleWarning'
                : 'ar.stats.trianglePassed'),
        );
    } else {
        lines.push(
            windowT(locale, 'ar.stats.usdzArchive', {
                entries: stats.structure.entryCount,
                root: stats.structure.firstEntry,
            }),
            windowT(locale, 'ar.stats.quickLook'),
        );
    }

    return lines.join('\n');
}

export function createARController({
    appBuild,
    isARMode,
    renderer,
    camera,
    placementRoot,
    mainGroup,
    applyCurrentPoseInstantly,
    materialManager,
    getProfilesReady,
    getProfilesData,
    getSelectedHandleSide,
    appendAccessoryUrlParams = () => {},
    appendProfileSelectionUrlParams = () => {},
    appendWindowLayoutUrlParams = () => {},
}) {
    let arSession = null;
    let hitTestSource = null;
    let arPlaced = false;
    let arSessionStartedAt = 0;

    function buildWebXRUrl() {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('ar', '1');
        url.searchParams.set('profile', document.getElementById('cadProfile').value);
        url.searchParams.set('w', document.getElementById('widthA').value);
        url.searchParams.set('h', document.getElementById('heightB').value);
        url.searchParams.set('mode', document.getElementById('mOscilo').checked ? 'oscilo' : 'batant');
        url.searchParams.set('angle', document.getElementById('openAngle').value);
        url.searchParams.set('explode', document.getElementById('cExplode').checked ? '1' : '0');
        url.searchParams.set('glass_thickness', document.getElementById('glassThickness').value);
        url.searchParams.set('handle_side', getSelectedHandleSide());
        materialManager.appendUrlParams(url);
        appendProfileSelectionUrlParams(url);
        appendWindowLayoutUrlParams(url);
        appendAccessoryUrlParams(url);

        const activeParts = getProfilesData()
            .filter(profile => document.getElementById(`toggle_${profile.index}`)?.checked)
            .map(profile => String(profile.index));
        if (activeParts.length !== getProfilesData().length) {
            url.searchParams.set('parts', activeParts.join(','));
        }
        return url.toString();
    }

    function closeQRModal() {
        document.getElementById('qr-modal').classList.remove('open');
    }

    function setQRStatus(message) {
        document.getElementById('qr-status').textContent = message;
    }

    function showQRError(message) {
        const qrContainer = document.getElementById('qr-code');
        const errorContainer = document.getElementById('qr-error');
        qrContainer.style.display = 'none';
        errorContainer.style.display = 'block';
        errorContainer.textContent = message;
    }

    function renderQRCode(url) {
        const qrContainer = document.getElementById('qr-code');
        const errorContainer = document.getElementById('qr-error');
        if (typeof window.qrcode !== 'function') {
            throw new Error(windowT(getWindowLocale(), 'ar.qrLibraryMissing'));
        }
        const qr = window.qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        qrContainer.innerHTML = qr.createSvgTag({ cellSize: 7, margin: 4, scalable: true });
        qrContainer.style.display = 'flex';
        errorContainer.style.display = 'none';
    }

    const AR_PLATFORM_FORMATS = Object.freeze({
        android: Object.freeze({
            platform: 'android',
            format: 'glb',
            extension: 'glb',
            contentType: 'model/gltf-binary',
            label: 'Android',
            viewer: 'Google Scene Viewer'
        }),
        ios: Object.freeze({
            platform: 'ios',
            format: 'usdz',
            extension: 'usdz',
            contentType: 'model/vnd.usdz+zip',
            label: 'iOS',
            viewer: 'Apple AR Quick Look'
        })
    });

    let selectedARPlatform = 'android';
    let latestExportedAsset = null;
    let latestExportFormat = 'glb';
    let latestExportFilename = 'configured-window.glb';
    let latestStaticModelUrl = '';
    let latestExpectedBytes = 0;
    let latestModelTitle = 'configured-window';
    let latestPublishedPlatform = 'android';

    function selectedARInfo() {
        return AR_PLATFORM_FORMATS[selectedARPlatform] || AR_PLATFORM_FORMATS.android;
    }

    function setSelectedARPlatform(platform) {
        if (!AR_PLATFORM_FORMATS[platform]) return;
        selectedARPlatform = platform;
        const switchElement = document.getElementById('ar-platform-switch');
        switchElement.dataset.platform = platform;
        switchElement.querySelectorAll('.ar-platform-option').forEach(button => {
            button.setAttribute('aria-pressed', button.dataset.platform === platform ? 'true' : 'false');
        });
    }

    function makeExportName() {
        const profile = document.getElementById('cadProfile').value;
        const width = document.getElementById('widthA').value;
        const height = document.getElementById('heightB').value;
        const mode = document.getElementById('mOscilo').checked ? 'oscilo' : 'batant';
        const handleSide = getSelectedHandleSide() === 'left' ? 'left-handle' : 'right-handle';
        const safe = `${profile}-${width}x${height}-${mode}-${handleSide}`
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return safe || 'configured-window';
    }

    function buildARLauncherUrl(modelUrl, modelTitle, platform, format) {
        const url = new URL('./ar-viewer.html', window.location.href);
        url.searchParams.set('model', modelUrl);
        url.searchParams.set('title', modelTitle);
        url.searchParams.set('platform', platform);
        url.searchParams.set('format', format);
        url.searchParams.set('build', appBuild);
        return url.toString();
    }

    async function generateCurrentWindowARAsset(platform) {
        const config = window.AR_UPLOAD_CONFIG || {};
        const platformInfo = AR_PLATFORM_FORMATS[platform];
        if (!platformInfo) throw new Error(windowT(getWindowLocale(), 'ar.unsupportedPlatform', { platform }));

        const modelName = makeExportName();
        const maxBytes = platformInfo.format === 'usdz'
            ? (Number.isFinite(config.maxUsdzBytes) ? config.maxUsdzBytes : 45 * 1024 * 1024)
            : (Number.isFinite(config.maxGlbBytes)
                ? config.maxGlbBytes
                : (Number.isFinite(config.maxBytes) ? config.maxBytes : 10 * 1024 * 1024));
        const targetTriangles = platformInfo.format === 'usdz'
            ? (Number.isFinite(config.targetUsdzTriangles)
                ? config.targetUsdzTriangles
                : 22000)
            : (Number.isFinite(config.targetGlbTriangles)
                ? config.targetGlbTriangles
                : (Number.isFinite(config.targetTriangles) ? config.targetTriangles : 45000));
        const result = await createWindowARAsset({
            sourceRoot: mainGroup,
            applyPose: applyCurrentPoseInstantly,
            format: platformInfo.format,
            maxBytes,
            targetTriangles
        });
        const hash = await sha256Hex(result.arrayBuffer);
        latestExportedAsset = result.arrayBuffer;
        latestExportFormat = platformInfo.format;
        latestExportFilename = `${modelName}-${hash.slice(0, 12)}.${platformInfo.extension}`;
        latestModelTitle = modelName;
        latestExpectedBytes = result.arrayBuffer.byteLength;
        latestPublishedPlatform = platform;
        return {
            ...result,
            modelName,
            hash,
            filename: latestExportFilename,
            platform
        };
    }

    function buildStaticModelUrl(filename) {
        const config = window.AR_UPLOAD_CONFIG || {};
        const directory = String(config.staticModelDirectory || 'models/').replace(/^\/+/, '').replace(/\/*$/, '/');
        return new URL(`./${directory}${encodeURIComponent(filename)}`, window.location.href).href;
    }

    async function probePublishedModel(modelUrl, expectedBytes, format) {
        let response = await fetch(modelUrl, {
            method: 'HEAD',
            cache: 'no-store'
        });

        if (response.status === 405) {
            response = await fetch(modelUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: { Range: 'bytes=0-19' }
            });
        }

        if (!response.ok && response.status !== 206) {
            throw new Error(windowT(getWindowLocale(), 'ar.modelNotPublished', { status: response.status }));
        }

        const contentType = response.headers.get('content-type') || '';
        const contentLengthHeader = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range') || '';
        let publicBytes = Number.parseInt(contentLengthHeader || '', 10);
        const rangeMatch = /\/(\d+)$/.exec(contentRange);
        if (rangeMatch) publicBytes = Number.parseInt(rangeMatch[1], 10);

        if (Number.isFinite(publicBytes) && expectedBytes && publicBytes !== expectedBytes) {
            throw new Error(windowT(getWindowLocale(), 'ar.fileSizeMismatch', { publicBytes, expectedBytes }));
        }

        const expectedType = format === 'usdz'
            ? /model\/vnd\.usdz\+zip|application\/octet-stream/i
            : /model\/gltf-binary|application\/octet-stream/i;
        if (contentType && !expectedType.test(contentType)) {
            console.warn(`Unexpected ${format.toUpperCase()} Content-Type: ${contentType}`);
        }

        return { publicBytes, contentType };
    }

    function completePublishedQR(modelUrl, modelTitle, platform, format) {
        const platformInfo = AR_PLATFORM_FORMATS[platform];
        const launcherUrl = buildARLauncherUrl(modelUrl, modelTitle, platform, format);
        renderQRCode(launcherUrl);
        const launchLink = document.getElementById('qr-launch-link');
        launchLink.href = launcherUrl;
        launchLink.style.display = 'inline-block';
        document.getElementById('qr-publish-help').style.display = 'none';
        setQRStatus(windowT(getWindowLocale(), 'ar.verifiedQr', {
            format: format.toUpperCase(),
            platform: platformInfo.label,
        }));
    }

    function showStaticPublishInstructions(filename, modelUrl, platform, format) {
        const platformInfo = AR_PLATFORM_FORMATS[platform];
        const help = document.getElementById('qr-publish-help');
        const locale = getWindowLocale();
        help.innerHTML = [
            `<strong>${windowT(locale, 'ar.publishReady', { format: format.toUpperCase() })}</strong>`,
            `${windowT(locale, 'ar.publishDownload')} <code>${filename}</code>.`,
            `${windowT(locale, 'ar.publishPlace')} <code>dist/site/models/</code>.`,
            windowT(locale, 'ar.publishRedeploy'),
            windowT(locale, 'ar.publishReturn'),
            `<br>${windowT(locale, 'ar.publishPlatform')} <code>${platformInfo.label}</code>`,
            `<br>${windowT(locale, 'ar.publishExpectedUrl')}<br><code>${modelUrl}</code>`
        ].join('<br>');
        help.style.display = 'block';
        const checkButton = document.getElementById('qr-check-published');
        checkButton.style.display = 'block';
        checkButton.disabled = false;
    }

    async function waitForPublishedModel(modelUrl, expectedBytes, format) {
        let lastError = null;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            try {
                return await probePublishedModel(modelUrl, expectedBytes, format);
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 900 + attempt * 250));
            }
        }
        throw lastError || new Error(windowT(getWindowLocale(), 'ar.supabasePublicUnavailable'));
    }

    async function publishWithSupabase(exported) {
        const config = window.AR_UPLOAD_CONFIG || {};
        const formatLabel = exported.format.toUpperCase();
        const uploadResult = await uploadARAssetToSupabase({
            ticketEndpoint: config.ticketEndpoint || '/api/ar-upload-ticket',
            arrayBuffer: exported.arrayBuffer,
            filename: exported.filename,
            sha256: exported.hash,
            appBuild: appBuild,
            format: exported.format,
            platform: exported.platform,
            onProgress(bytesUploaded, bytesTotal) {
                const percentage = bytesTotal > 0
                    ? Math.min(100, 100 * bytesUploaded / bytesTotal)
                    : 0;
                setQRStatus(windowT(getWindowLocale(), 'ar.supabaseUploading', { format: formatLabel, percentage: percentage.toFixed(1) }));
            }
        });

        if (!uploadResult?.publicUrl) {
            throw new Error(windowT(getWindowLocale(), 'ar.supabaseNoUrl', { format: formatLabel }));
        }

        setQRStatus(uploadResult.exists
            ? windowT(getWindowLocale(), 'ar.supabaseExists', { format: formatLabel })
            : windowT(getWindowLocale(), 'ar.supabaseUploaded'));
        await waitForPublishedModel(
            uploadResult.publicUrl,
            exported.arrayBuffer.byteLength,
            exported.format
        );
        completePublishedQR(
            uploadResult.publicUrl,
            exported.modelName,
            exported.platform,
            exported.format
        );
    }

    async function checkLatestStaticModel() {
        if (!latestStaticModelUrl) return;
        const checkButton = document.getElementById('qr-check-published');
        checkButton.disabled = true;
        setQRStatus(windowT(getWindowLocale(), 'ar.checkingPublished', { format: latestExportFormat.toUpperCase() }));
        try {
            await probePublishedModel(latestStaticModelUrl, latestExpectedBytes, latestExportFormat);
            completePublishedQR(
                latestStaticModelUrl,
                latestModelTitle,
                latestPublishedPlatform,
                latestExportFormat
            );
            checkButton.style.display = 'none';
        } catch (error) {
            setQRStatus(error.message);
            checkButton.disabled = false;
        }
    }

    async function openQRModal() {
        const modal = document.getElementById('qr-modal');
        const qrContainer = document.getElementById('qr-code');
        const errorContainer = document.getElementById('qr-error');
        const statsContainer = document.getElementById('qr-export-stats');
        const downloadButton = document.getElementById('qr-download-model');
        const checkButton = document.getElementById('qr-check-published');
        const launchLink = document.getElementById('qr-launch-link');
        const publishHelp = document.getElementById('qr-publish-help');
        const description = document.getElementById('qr-description');
        const publicationPlatform = selectedARPlatform;
        const platformInfo = AR_PLATFORM_FORMATS[publicationPlatform];
        const formatLabel = platformInfo.format.toUpperCase();

        modal.classList.add('open');
        description.textContent = windowT(getWindowLocale(), 'ar.descriptionSelected', { platform: platformInfo.label, format: formatLabel, viewer: platformInfo.viewer });
        qrContainer.innerHTML = '';
        qrContainer.style.display = 'none';
        errorContainer.style.display = 'none';
        statsContainer.style.display = 'none';
        statsContainer.textContent = '';
        publishHelp.style.display = 'none';
        publishHelp.innerHTML = '';
        launchLink.style.display = 'none';
        launchLink.removeAttribute('href');
        checkButton.style.display = 'none';
        checkButton.disabled = true;
        latestExportedAsset = null;
        latestExportFormat = platformInfo.format;
        latestStaticModelUrl = '';
        latestExpectedBytes = 0;
        latestPublishedPlatform = publicationPlatform;
        downloadButton.disabled = true;
        downloadButton.textContent = windowT(getWindowLocale(), 'ar.downloadOptimized', { format: formatLabel });

        if (!getProfilesReady()) {
            showQRError(windowT(getWindowLocale(), 'ar.profileStillLoading'));
            setQRStatus('');
            return;
        }

        try {
            setQRStatus(windowT(getWindowLocale(), 'ar.stepBuild', { viewer: platformInfo.viewer }));
            const exported = await generateCurrentWindowARAsset(publicationPlatform);
            statsContainer.textContent = formatLocalizedExportStats(exported.stats);
            statsContainer.style.display = 'block';
            downloadButton.disabled = false;

            const config = window.AR_UPLOAD_CONFIG || {};
            if (config.mode === 'supabase') {
                setQRStatus(windowT(getWindowLocale(), 'ar.stepSupabaseTicket', { format: formatLabel }));
                await publishWithSupabase(exported);
                return;
            }
            if (config.mode === 'api' && config.endpoint) {
                setQRStatus(windowT(getWindowLocale(), 'ar.stepServerUpload', { format: formatLabel }));
                const uploaded = await uploadARAsset({
                    endpoint: config.endpoint,
                    arrayBuffer: exported.arrayBuffer,
                    modelName: exported.modelName,
                    appBuild: appBuild,
                    format: exported.format
                });
                completePublishedQR(
                    uploaded.modelUrl,
                    exported.modelName,
                    exported.platform,
                    exported.format
                );
                return;
            }

            latestStaticModelUrl = buildStaticModelUrl(exported.filename);
            setQRStatus(windowT(getWindowLocale(), 'ar.stepPublishedCheck', { format: formatLabel }));
            try {
                await probePublishedModel(latestStaticModelUrl, latestExpectedBytes, exported.format);
                completePublishedQR(
                    latestStaticModelUrl,
                    exported.modelName,
                    exported.platform,
                    exported.format
                );
            } catch (_notPublished) {
                setQRStatus(windowT(getWindowLocale(), 'ar.stepManualPublish', { format: formatLabel }));
                showStaticPublishInstructions(
                    exported.filename,
                    latestStaticModelUrl,
                    exported.platform,
                    exported.format
                );
            }
        } catch (error) {
            console.error('AR export/publish preparation failed:', error);
            setQRStatus(latestExportedAsset
                ? windowT(getWindowLocale(), 'ar.generatedPublishFailed', { format: formatLabel })
                : windowT(getWindowLocale(), 'ar.exportFailed', { format: formatLabel }));
            showQRError(error.message || windowT(getWindowLocale(), 'ar.prepareFailed'));
        }
    }

    function setARStatus(message, isError = false) {
        const status = document.getElementById('ar-status');
        status.textContent = message;
        status.style.color = isError ? '#fecaca' : '#94a3b8';
    }

    async function updateARAvailability() {
        if (!isARMode || !getProfilesReady()) return;
        const button = document.getElementById('ar-start-button');

        if (!window.isSecureContext) {
            button.disabled = true;
            button.textContent = windowT(getWindowLocale(), 'ar.httpsRequired');
            setARStatus(windowT(getWindowLocale(), 'ar.httpsRequiredHelp'), true);
            return;
        }
        if (!navigator.xr) {
            button.disabled = true;
            button.textContent = windowT(getWindowLocale(), 'ar.notSupported');
            setARStatus(windowT(getWindowLocale(), 'ar.webxrMissing'), true);
            return;
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            button.disabled = !supported;
            button.textContent = supported ? windowT(getWindowLocale(), 'ar.view') : windowT(getWindowLocale(), 'ar.notSupported');
            setARStatus(supported
                ? windowT(getWindowLocale(), 'ar.tapToOpen')
                : windowT(getWindowLocale(), 'ar.immersiveUnavailable'), !supported);
        } catch (error) {
            button.disabled = true;
            button.textContent = windowT(getWindowLocale(), 'ar.unavailable');
            setARStatus(`${error.name}: ${error.message}`, true);
        }
    }

    async function startAR() {
        if (arSession) return;
        const button = document.getElementById('ar-start-button');
        button.disabled = true;
        button.textContent = windowT(getWindowLocale(), 'ar.openingCamera');
        setARStatus(windowT(getWindowLocale(), 'ar.waitPermission'));

        try {
            arSession = await navigator.xr.requestSession('immersive-ar', {
                optionalFeatures: ['hit-test']
            });
            try {
                await renderer.xr.setSession(arSession);
            } catch (sessionSetupError) {
                await arSession.end().catch(() => { });
                throw sessionSetupError;
            }
            arSessionStartedAt = performance.now();
            arPlaced = false;
            placementRoot.visible = false;
            document.getElementById('ar-launch').style.display = 'none';

            try {
                const viewerSpace = await arSession.requestReferenceSpace('viewer');
                hitTestSource = await arSession.requestHitTestSource({ space: viewerSpace });
            } catch (error) {
                console.warn('Hit testing is unavailable; using camera-relative placement.', error);
                hitTestSource = null;
            }

            arSession.addEventListener('end', () => {
                hitTestSource?.cancel?.();
                hitTestSource = null;
                arSession = null;
                arPlaced = false;
                placementRoot.visible = false;
                document.getElementById('ar-launch').style.display = 'flex';
                button.disabled = false;
                button.textContent = windowT(getWindowLocale(), 'ar.view');
                setARStatus(windowT(getWindowLocale(), 'ar.closed'));
            }, { once: true });
        } catch (error) {
            console.error('AR session failed:', error);
            arSession = null;
            button.disabled = false;
            button.textContent = windowT(getWindowLocale(), 'ar.tryAgain');
            setARStatus(`${error.name}: ${error.message}`, true);
        }
    }

    function orientWindowTowardCamera(position) {
        const xrCamera = renderer.xr.getCamera(camera);
        const cameraPosition = new THREE.Vector3();
        xrCamera.getWorldPosition(cameraPosition);
        const dx = cameraPosition.x - position.x;
        const dz = cameraPosition.z - position.z;
        placementRoot.rotation.set(0, Math.atan2(dx, dz), 0);
    }

    function placeWindowOnSurface(position) {
        const height = Number.parseFloat(document.getElementById('heightB').value) || 1.5;
        placementRoot.position.set(position.x, position.y + height / 2, position.z);
        orientWindowTowardCamera(placementRoot.position);
        placementRoot.visible = true;
        arPlaced = true;
    }

    function placeWindowInFrontOfCamera() {
        const xrCamera = renderer.xr.getCamera(camera);
        const cameraPosition = new THREE.Vector3();
        const cameraDirection = new THREE.Vector3();
        xrCamera.getWorldPosition(cameraPosition);
        xrCamera.getWorldDirection(cameraDirection);
        const position = cameraPosition.clone().add(cameraDirection.multiplyScalar(1.6));
        placementRoot.position.copy(position);
        orientWindowTowardCamera(placementRoot.position);
        placementRoot.visible = true;
        arPlaced = true;
    }

    function updateARPlacement(xrFrame) {
        if (!isARMode || !arSession || arPlaced || !xrFrame) return;
        const referenceSpace = renderer.xr.getReferenceSpace();

        if (hitTestSource && referenceSpace) {
            const results = xrFrame.getHitTestResults(hitTestSource);
            if (results.length > 0) {
                const pose = results[0].getPose(referenceSpace);
                if (pose) {
                    placeWindowOnSurface(pose.transform.position);
                    return;
                }
            }
        }

        if (performance.now() - arSessionStartedAt > 2500) {
            placeWindowInFrontOfCamera();
        }
    }

    function handleLocaleChange() {
        if (isARMode) void updateARAvailability();
        const modal = document.getElementById('qr-modal');
        if (modal?.classList.contains('open')) {
            const platformInfo = selectedARInfo();
            const description = document.getElementById('qr-description');
            const downloadButton = document.getElementById('qr-download-model');
            if (description) {
                description.textContent = windowT(getWindowLocale(), 'ar.descriptionSelected', {
                    platform: platformInfo.label,
                    format: platformInfo.format.toUpperCase(),
                    viewer: platformInfo.viewer,
                });
            }
            if (downloadButton) {
                downloadButton.textContent = windowT(getWindowLocale(), 'ar.downloadOptimized', {
                    format: latestExportFormat.toUpperCase(),
                });
            }
        }
    }

    globalThis.window?.addEventListener('window-locale-applied', handleLocaleChange);

    function downloadLatestARAsset() {
        if (!latestExportedAsset) return;
        downloadARAsset(latestExportedAsset, latestExportFilename, latestExportFormat);
    }

    return {
        buildWebXRUrl,
        closeQRModal,
        setSelectedARPlatform,
        openQRModal,
        downloadLatestARAsset,
        checkLatestStaticModel,
        setARStatus,
        updateARAvailability,
        startAR,
        updateARPlacement,
    };
}
