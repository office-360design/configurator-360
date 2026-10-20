import { TENANT_DOMAIN_ROOTS, tenantDomainsForSlug } from './tenantDomains.js?v=locales-6';

export function renderTenantDomainLinks(container, slug, path = '/') {
  if (!container) return;
  container.replaceChildren();
  const labels = {
    'en-US': 'English (.com)', 'ro-RO': 'Română (.ro)', 'de-DE': 'Deutsch (.de)',
    'es-ES': 'Español (.es)', 'fr-FR': 'Français (.fr)', 'it-IT': 'Italiano (.it)',
  };
  const locales = Object.keys(TENANT_DOMAIN_ROOTS);
  tenantDomainsForSlug(slug).forEach((hostname, index) => {
    if (index) container.append(document.createTextNode(' · '));
    const link = document.createElement('a');
    link.href = `https://${hostname}${path}`;
    link.textContent = labels[locales[index]] || hostname;
    link.hreflang = locales[index];
    if (hostname === window.location.hostname) link.setAttribute('aria-current', 'page');
    container.append(link);
  });
}
