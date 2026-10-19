/** AR is available only for tested Firebase-backed configurator adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola', 'fence', 'tiles', 'chair', 'cardbox', 'bookshelf', 'roof', 'solar', 'cages'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
