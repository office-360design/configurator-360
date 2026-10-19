import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';

export function createBookshelfARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'bookshelf', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createBookshelfFirebaseARAsset } = await import('./exportBookshelf.js?v=bookshelf-ar-1');
      return createBookshelfFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
