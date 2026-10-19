import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';
// Load geometry/export dependencies only after the AR dialog can show progress.
export function createTilesARController({ getState, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'tiles', getLocale, onFeedback,
    getSnapshot: () => structuredClone(getState()),
    async exportAsset(snapshot,format,onProgress) {
      const {createTilesFirebaseARAsset}=await import('./exportTiles.js?v=tiles-ar-1');
      return createTilesFirebaseARAsset(snapshot,format,onProgress);
    },
  });
}
