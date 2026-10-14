import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-5';
import { captureFenceARSnapshot, createFenceFirebaseARAsset } from './exportFence.js?v=fence-ar-1';

export function createFenceARController({ getAssembly, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'fence', getLocale, onFeedback,
    getSnapshot: () => captureFenceARSnapshot(getAssembly()),
    snapshotKey: snapshot => snapshot.cacheKey,
    exportAsset: createFenceFirebaseARAsset,
  });
}
