/** AR is available only for the tested Firebase-backed Hall, Window, Pergola and Fence adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola', 'fence'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
