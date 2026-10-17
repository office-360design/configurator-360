import { createFirebaseARDialog } from '../../../shared-ui/src/ar/dialog.js?v=locales-6';
export function createHallARDialog(options = {}) {
  return createFirebaseARDialog({ ...options, product: 'hall', exportAsset: options.exportAsset || (async (...args) => (await import('./exportHall.js?v=locales-6')).createHallARAsset(...args)) });
}
