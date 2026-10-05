import { TENANT_DOMAIN_ROOTS, tenantDomainsForSlug } from './tenantDomains.js?v=tenant-domains-1';

export function renderTenantDomainLinks(container, slug, path = '/') {
  if (!container) return;
  container.replaceChildren();
  const labels = ['English (.com)', 'Română (.ro)', 'Deutsch (.de)'];
  tenantDomainsForSlug(slug).forEach((hostname, index) => {
    if (index) container.append(document.createTextNode(' · '));
    const link = document.createElement('a');
    link.href = `https://${hostname}${path}`;
    link.textContent = labels[index];
    link.hreflang = Object.keys(TENANT_DOMAIN_ROOTS)[index];
    if (hostname === window.location.hostname) link.setAttribute('aria-current', 'page');
    container.append(link);
  });
}
