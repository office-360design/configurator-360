import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';
import { captureCagesARSnapshot, createCagesFirebaseARAsset } from './exportCages.js?v=cages-ar-2';

export function createCagesARController({ getAssembly, getLocale, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'cages',
    getLocale,
    onFeedback,
    getSnapshot: () => captureCagesARSnapshot(getAssembly()),
    snapshotKey: snapshot => snapshot.cacheKey,
    exportAsset: createCagesFirebaseARAsset,
  });
}
