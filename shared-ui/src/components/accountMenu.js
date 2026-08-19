import {
  AR_PLATFORM_OPTIONS,
  CURRENCY_OPTIONS,
  QUALITY_OPTIONS,
  UNIT_OPTIONS,
} from '../config.js';
import { sharedT } from '../i18n.js';
import { sharedIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';

function localizedOptions(locale, path, options) {
  const namespaces = {
    units: 'settings.units',
    currency: 'settings.currency',
    quality: 'settings.quality',
    defaultArPlatform: 'settings.ar',
  };
  const namespace = namespaces[path];
  return options.map((option) => ({
    ...option,
    label: namespace ? sharedT(locale, `${namespace}.${option.value}`) : option.label,
  }));
}

function renderSettingsSelect(locale, labelKey, path, value, options) {
  const label = sharedT(locale, labelKey);
  const localized = localizedOptions(locale, path, options);
  return `
    <label class="account-settings__field">
      <span>${escapeHtml(label)}</span>
      <select data-path="${path}" aria-label="${escapeHtml(label)}">
        ${localized.map((option) => `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

export function renderAccountMenu(state) {
  const locale = state.locale;
  return `
    <section class="account-menu" data-account-menu aria-label="${escapeHtml(sharedT(locale, 'account.menu'))}">
      <div class="account-menu__profile">
        <span class="account-menu__avatar">${sharedIcon('account')}</span>
        <strong>${escapeHtml(sharedT(locale, 'account.greeting'))}</strong>
      </div>
      <nav class="account-menu__items">
        <button type="button" data-action="account-profile"><span>${sharedIcon('account')}</span><strong>${escapeHtml(sharedT(locale, 'account.profile'))}</strong></button>
        <button type="button" data-action="account-saved"><span>${sharedIcon('folder')}</span><strong>${escapeHtml(sharedT(locale, 'account.saved'))}</strong></button>
        <button type="button" data-action="account-help"><span>${sharedIcon('help')}</span><strong>${escapeHtml(sharedT(locale, 'account.help'))}</strong></button>
        <button type="button" data-action="toggle-account-settings" aria-expanded="false"><span>${sharedIcon('settings')}</span><strong>${escapeHtml(sharedT(locale, 'account.settings'))}</strong><span class="account-menu__chevron">›</span></button>
        <div class="account-settings" data-account-settings>
          ${renderSettingsSelect(locale, 'account.measuringUnits', 'units', state.units, UNIT_OPTIONS)}
          ${renderSettingsSelect(locale, 'account.currency', 'currency', state.currency, CURRENCY_OPTIONS)}
          ${renderSettingsSelect(locale, 'account.quality', 'quality', state.quality, QUALITY_OPTIONS)}
          ${renderSettingsSelect(locale, 'account.defaultArPlatform', 'defaultArPlatform', state.defaultArPlatform, AR_PLATFORM_OPTIONS)}
          <button class="account-settings__toggle" type="button" data-action="toggle-dark-mode" aria-pressed="${state.darkMode}">
            <span>${escapeHtml(sharedT(locale, 'account.darkMode'))}</span>
            <span class="settings-toggle-value"><strong data-dark-mode-label>${escapeHtml(sharedT(locale, state.darkMode ? 'account.on' : 'account.off'))}</strong><span class="settings-switch ${state.darkMode ? 'is-on' : ''}" aria-hidden="true"><span></span></span></span>
          </button>
          <button class="account-settings__cookies" type="button" data-action="cookies-placeholder">
            <span>${escapeHtml(sharedT(locale, 'account.cookies'))}</span><strong>${escapeHtml(sharedT(locale, 'account.manage'))}</strong>
          </button>
        </div>
        <button type="button" data-action="account-signout"><span>${sharedIcon('signout')}</span><strong>${escapeHtml(sharedT(locale, 'account.signOut'))}</strong></button>
      </nav>
    </section>
  `;
}
