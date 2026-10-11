import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-4';
import { capturePergolaARSnapshot, createPergolaFirebaseARAsset } from './exportPergola.js?v=pergola-ar-2';

/** Capture the actual built assembly, not the scene, scenery or saved UI state. */
export function createPergolaARController({ getScene, getState, onFeedback = () => {} } = {}) {
  return createFirebaseARDialog({
    product: 'pergola',
    getLocale: () => getState()?.locale || 'en-US',
    getSnapshot() {
      const scene = getScene();
      // Compare against the live built model. Do not reuse Window's global
      // readiness flag or introduce a second flag that can stay stuck after edits.
      if (!scene || scene.destroyed || !scene.pergola?.isObject3D
        || scene.lastStructuralSignature !== scene.structuralSignature(getState())) {
        const error = new Error('not-ready'); error.code = 'not-ready'; throw error;
      }
      return capturePergolaARSnapshot(scene.pergola);
    },
    snapshotKey: snapshot => snapshot.cacheKey,
    exportAsset: createPergolaFirebaseARAsset,
    onFeedback,
  });
}
