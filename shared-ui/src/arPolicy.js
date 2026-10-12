/** AR is available only for the tested Firebase-backed Hall, Window, Pergola, Fence, Pavement, Chair and Cardbox adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola', 'fence', 'tiles', 'chair', 'cardbox'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
