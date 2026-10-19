import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=curtainwall-ar-1';

export function createCurtainWallARController({ getSnapshot, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'curtainwall', getSnapshot, getLocale, onFeedback,
    snapshotKey: snapshot => snapshot.cacheKey,
    async exportAsset(snapshot, format, onProgress) {
      const { createCurtainWallFirebaseARAsset } = await import('./exportCurtainWall.js?v=curtainwall-ar-1');
      return createCurtainWallFirebaseARAsset(snapshot, format, onProgress);
    },
  });
}
