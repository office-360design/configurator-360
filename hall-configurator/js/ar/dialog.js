import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=firebase-ar-2';
export function createHallARDialog(options = {}) {
  return createFirebaseARDialog({ ...options, product: 'hall', exportAsset: options.exportAsset || (async (...args) => (await import('./exportHall.js?v=hall-ar-1')).createHallARAsset(...args)) });
}
