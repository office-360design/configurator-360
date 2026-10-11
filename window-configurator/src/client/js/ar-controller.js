import { createFirebaseARDialog } from '../shared-ui/src/ar/dialog.js?v=firebase-ar-4';
import { getWindowLocale } from './i18n.js?v=platform-18';
import { captureWindowARSnapshot, createWindowFirebaseARAsset } from './ar/exportWindow.js?v=window-ar-3';

/** Window adapter for the same Firebase dialog/native viewers used by Hall. */
export function createARController({ mainGroup, getProfilesReady, getExportMaterial } = {}) {
    const feedback = (message, tone = 'error', duration = 5000) =>
        window.WINDOW_CONFIGURATOR_SHARED_SHELL?.showFeedback?.(message, tone, duration);
    const dialog = createFirebaseARDialog({
        product: 'window',
        getLocale: getWindowLocale,
        getSnapshot() {
            if (!getProfilesReady?.() || window.CONFIGURATOR_READY === false) {
                const error = new Error('not-ready'); error.code = 'not-ready'; throw error;
            }
            return captureWindowARSnapshot(mainGroup, { materialForMesh: getExportMaterial });
        },
        snapshotKey: snapshot => snapshot.cacheKey,
        exportAsset: createWindowFirebaseARAsset,
        onFeedback: feedback,
    });
    const api = {
        open: () => dialog.open(), close: () => dialog.close(),
        openQRModal: () => dialog.open(), closeQRModal: () => dialog.close(),
        // Retain the public entry name for older integrations, but never start
        // legacy WebXR/Supabase/Netlify publication or a manually hosted model.
        startAR: () => dialog.open(),
        updateARAvailability() {}, updateARPlacement() {},
        setARStatus() {},
        destroy() { window.removeEventListener('window-locale-applied', refresh);dialog.destroy(); },
    };
    const refresh = () => dialog.refresh();
    window.addEventListener('window-locale-applied', refresh);
    window.WINDOW_AR_API = api;
    window.dispatchEvent(new CustomEvent('window-ar-ready'));
    return api;
}
