import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';

export function createCardboxARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'cardbox', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createCardboxFirebaseARAsset } = await import('./exportCardbox.js?v=cardbox-ar-1');
      return createCardboxFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
