import {
  AR_PLATFORM_OPTIONS,
  CURRENCY_OPTIONS,
  QUALITY_OPTIONS,
  UNIT_OPTIONS,
} from '../config.js';
import { sharedIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';

function renderSettingsSelect(label, path, value, options) {
  return `
    <label class="account-settings__field">
      <span>${escapeHtml(label)}</span>
      <select data-path="${path}" aria-label="${escapeHtml(label)}">
        ${options.map((option) => `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

export function renderAccountMenu(state) {
  return `
    <section class="account-menu" data-account-menu aria-label="Account menu">
      <div class="account-menu__profile">
        <span class="account-menu__avatar">${sharedIcon('account')}</span>
        <strong>Hello, User#0</strong>
      </div>
      <nav class="account-menu__items">
        <button type="button" data-action="account-profile"><span>${sharedIcon('account')}</span><strong>My profile</strong></button>
        <button type="button" data-action="account-saved"><span>${sharedIcon('folder')}</span><strong>Saved configurations</strong></button>
        <button type="button" data-action="account-help"><span>${sharedIcon('help')}</span><strong>Help</strong></button>
        <button type="button" data-action="toggle-account-settings" aria-expanded="false"><span>${sharedIcon('settings')}</span><strong>Settings</strong><span class="account-menu__chevron">›</span></button>
        <div class="account-settings" data-account-settings>
          ${renderSettingsSelect('Measuring Units', 'units', state.units, UNIT_OPTIONS)}
          ${renderSettingsSelect('Currency', 'currency', state.currency, CURRENCY_OPTIONS)}
          ${renderSettingsSelect('Quality', 'quality', state.quality, QUALITY_OPTIONS)}
          ${renderSettingsSelect('Default AR platform', 'defaultArPlatform', state.defaultArPlatform, AR_PLATFORM_OPTIONS)}
          <button class="account-settings__toggle" type="button" data-action="toggle-dark-mode" aria-pressed="${state.darkMode}">
            <span>Dark mode</span>
            <span class="settings-toggle-value"><strong data-dark-mode-label>${state.darkMode ? 'On' : 'Off'}</strong><span class="settings-switch ${state.darkMode ? 'is-on' : ''}" aria-hidden="true"><span></span></span></span>
          </button>
          <button class="account-settings__cookies" type="button" data-action="cookies-placeholder">
            <span>Cookies</span><strong>Manage</strong>
          </button>
        </div>
        <button type="button" data-action="account-signout"><span>${sharedIcon('signout')}</span><strong>Sign out</strong></button>
      </nav>
    </section>
  `;
}
