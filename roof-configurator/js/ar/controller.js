import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-9';

export function createRoofARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'roof', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createRoofFirebaseARAsset } = await import('./exportRoof.js?v=roof-ar-1');
      return createRoofFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
