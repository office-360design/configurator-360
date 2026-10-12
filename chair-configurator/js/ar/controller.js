import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-6';

export function createChairARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'chair', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createChairFirebaseARAsset } = await import('./exportChair.js?v=chair-ar-1');
      return createChairFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
