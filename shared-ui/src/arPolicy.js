/** AR rollout is deliberately limited to Hall, even if another adapter opts in. */
export function isConfiguratorAREnabled(productId, capabilities = {}) {
  return String(productId || '').toLowerCase() === 'hall' && capabilities.viewAR === true;
}
