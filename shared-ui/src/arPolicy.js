/** AR is available only for the tested Firebase-backed Hall, Window and Pergola adapters. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return ['hall', 'window', 'pergola'].includes(String(productId || '').toLowerCase()) && capabilities.viewAR === true;
}
