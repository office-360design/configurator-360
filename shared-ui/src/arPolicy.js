/** AR is available only for the tested Firebase-backed Hall, Window, Pergola, Fence, Pavement, Chair, Cardbox, Bookshelf, Roof and Solar adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola', 'fence', 'tiles', 'chair', 'cardbox', 'bookshelf', 'roof', 'solar'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
