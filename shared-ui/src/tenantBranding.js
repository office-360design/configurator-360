import { LOCALE_HOSTS } from './config.js?v=tenant-routes-1';

// Reuse the official, locally hosted logo on every tenant domain. Customer
// branding must never supply the attribution image or its destination.
export const PLATFORM_LOGO_SRC = '/shared-ui/assets/360CONFIGURATOR.png';

export function renderPlatformAttribution(locale = 'en-US') {
  const hostname = Object.hasOwn(LOCALE_HOSTS, locale) ? LOCALE_HOSTS[locale] : LOCALE_HOSTS['en-US'];
  return `
    <a class="tenant-platform-brand" href="https://${hostname}/"
       target="_blank" rel="noopener noreferrer"
       aria-label="Powered by 360Configurator (opens in a new tab)">
      <span class="tenant-platform-brand__label">Powered by</span>
      <img src="${PLATFORM_LOGO_SRC}" alt="360Configurator" width="64" height="32" />
    </a>
  `;
}
