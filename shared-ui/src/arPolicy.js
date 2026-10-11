/** AR is available only for the tested Firebase-backed Hall and Window adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
