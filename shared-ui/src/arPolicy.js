/** AR is available only for the tested Firebase-backed Hall, Window, Pergola, Fence, Pavement and Chair adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola', 'fence', 'tiles', 'chair'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
