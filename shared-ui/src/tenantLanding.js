import { TENANT_CONFIGURATORS, resolveTenantContext } from './tenantBootstrap.js?v=1';

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

  const cards = enabled.length
    ? enabled.map((item) => `
        <a class="tenant-configurator" href="${item.path}">
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
          <div>
            <p class="tenant-eyebrow">Powered by 360Configurator</p>
            <h1>${escapeHtml(context.companyName)}</h1>
            <p class="tenant-subtitle">Select a configurator to begin.</p>
          </div>
        </div>
        <a class="tenant-dashboard-link" href="/dashboard/">Dashboard</a>
      </header>
      <div class="tenant-grid">${cards}</div>
    </section>
  `;
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
  renderTenant(context);
}
