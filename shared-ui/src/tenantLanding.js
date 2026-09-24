import { renderPlatformAttribution } from './tenantBranding.js?v=tenant-branding-1';
import { singleConfiguratorHomepageUrl } from './tenantHomepage.js?v=tenant-homepage-1';
import { renderTenantDomainLinks } from './tenantDomainLinks.js?v=tenant-domains-1';
import { TENANT_CONFIGURATORS, resolveTenantContext } from './tenantBootstrap.js?v=tenant-homepage-1';

import { CONFIGURATOR_PUBLIC_PATHS, getLocaleForHostname } from './config.js?v=tenant-routes-1';

const page = document.querySelector('#tenantPage');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderUnavailable(title, message) {
  document.title = `${title} | 360Configurator`;
  page.innerHTML = `
    <section class="tenant-card tenant-card--message">
      <div class="tenant-brand-mark">360</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderTenant(context) {
  const enabled = Object.values(TENANT_CONFIGURATORS)
    .filter(({ id }) => context.configurators?.[id] === true);

  document.title = `${context.companyName} Configurators`;

  const brand = context.logoUrl
    ? `<img class="tenant-logo" src="${escapeHtml(context.logoUrl)}" alt="${escapeHtml(context.companyName)}" />`
    : `<div class="tenant-brand-mark">${escapeHtml(context.companyName.slice(0, 2).toUpperCase())}</div>`;

  const paths = CONFIGURATOR_PUBLIC_PATHS[getLocaleForHostname(window.location.hostname)];
  const cards = enabled.length
    ? enabled.map((item) => `
        <a class="tenant-configurator" href="${paths[item.id] || item.path}">
          <span class="tenant-configurator__name">${escapeHtml(item.label)}</span>
          <span class="tenant-configurator__action">Open <span aria-hidden="true">→</span></span>
        </a>
      `).join('')
    : '<p class="tenant-empty">No configurators are currently enabled for this account.</p>';

  page.innerHTML = `
    <section class="tenant-shell">
      <header class="tenant-header">
        <div class="tenant-header__brand">
          ${brand}
          <div class="tenant-header__copy">
            ${renderPlatformAttribution(getLocaleForHostname(window.location.hostname))}
            <h1>${escapeHtml(context.companyName)}</h1>
            <p class="tenant-subtitle">Select a configurator to begin.</p>
            <nav id="tenantDomainLinks" aria-label="Customer site domains"></nav>
          </div>
        </div>
        <a class="tenant-dashboard-link" href="/dashboard/">Dashboard</a>
      </header>
      <div class="tenant-grid">${cards}</div>
    </section>
  `;
  renderTenantDomainLinks(document.querySelector('#tenantDomainLinks'), context.slug);
}

const context = await resolveTenantContext();
if (!context.isTenant) {
  window.location.replace('https://www.360configurator.com/');
} else if (!context.exists) {
  renderUnavailable(
    context.error === 'not-found' ? 'Configurator site not found' : 'Configurator temporarily unavailable',
    context.error === 'not-found'
      ? 'This customer site does not exist or is no longer available.'
      : 'The customer configuration could not be loaded. Please try again later.',
  );
} else if (context.status !== 'active') {
  renderUnavailable('Configurator site unavailable', `${context.companyName} is not currently active on 360Configurator.`);
} else {
  const target = singleConfiguratorHomepageUrl(context, window.location);
  if (target) {
    document.title = `${context.companyName} Configurator`;
    page.innerHTML = `
      <section class="tenant-card tenant-card--loading">
        <div class="tenant-loading" aria-hidden="true"></div>
        <p>Opening your configurator…</p>
        <a href="${escapeHtml(target)}">Continue to configurator</a>
        <a href="/dashboard/">Dashboard</a>
      </section>
    `;
    // Replace avoids a back-button loop through the redirecting homepage.
    window.location.replace(target);
  } else {
    renderTenant(context);
  }
}
