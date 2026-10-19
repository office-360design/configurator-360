import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';
import { captureTilesARSnapshot } from './exportTiles.js?v=tiles-ar-1';
// Load geometry/export dependencies only after the AR dialog can show progress.
export function createTilesARController({ getState, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'tiles', getLocale, onFeedback,
    async getSnapshot() {
      // Let the current input/render commit finish before capturing. This
      // avoids exporting a transient state while a paving edit is settling.
      await new Promise(resolve => requestAnimationFrame(resolve));
      return captureTilesARSnapshot(getState());
    },
    async exportAsset(snapshot,format,onProgress) {
      const {createTilesFirebaseARAsset}=await import('./exportTiles.js?v=tiles-photo-finish-1');
      return createTilesFirebaseARAsset(snapshot,format,onProgress);
    },
  });
}
