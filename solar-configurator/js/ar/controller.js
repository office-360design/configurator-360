import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-10';

export function createSolarARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'solar', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createSolarFirebaseARAsset } = await import('./exportSolar.js?v=solar-ar-1');
      return createSolarFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
