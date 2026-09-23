import { TENANT_CONFIGURATORS, getTenantSlugForHostname } from './tenantBootstrap.js?v=tenant-homepage-1';
import { CONFIGURATOR_PUBLIC_PATHS, getLocaleForHostname } from './config.js?v=tenant-routes-1';

/** Resolve an opt-in homepage redirect using live entitlements, never a pending plan. */
export function singleConfiguratorHomepageUrl(context, location = globalThis.location) {
  if (!context?.isTenant || !context.exists || context.error
      || context.status !== 'active' || context.autoOpenSingleConfigurator !== true) {
    return '';
  }

  let current;
  try {
    current = new URL(location.href);
  } catch {
    return '';
  }
  const slug = getTenantSlugForHostname(current.hostname);
  // Do not redirect dashboards, configurator pages, or a different customer's host.
  if (current.protocol !== 'https:' || current.port || current.pathname !== '/'
      || !slug || slug !== context.slug) {
    return '';
  }

  const enabled = Object.keys(TENANT_CONFIGURATORS)
    .filter((id) => context.configurators?.[id] === true);
  if (enabled.length !== 1) return '';

  const locale = getLocaleForHostname(current.hostname);
  const path = CONFIGURATOR_PUBLIC_PATHS[locale]?.[enabled[0]];
  if (!path) return '';

  // The destination comes only from our route catalogue, never a tenant-provided URL.
  const target = new URL(path, current.origin);
  target.search = current.search;
  target.hash = current.hash;
  return target.href;
}
