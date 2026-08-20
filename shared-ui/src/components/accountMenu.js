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

function accountDisplayName(user) {
  const displayName = String(user?.displayName || '').trim();
  if (displayName) return displayName;
  const email = String(user?.email || '').trim();
  if (email) return email;
  return sharedT('en-US', 'account.userFallback');
}

export function syncAccountIdentity(root, locale, user, { busy = false } = {}) {
  if (!root) return;
  const authenticated = Boolean(user?.uid);
  const greeting = root.querySelector('[data-account-greeting]');
  const loginButton = root.querySelector('[data-action="account-login"]');
  const signOutButton = root.querySelector('[data-action="account-signout"]');

  if (greeting) {
    greeting.textContent = authenticated
      ? sharedT(locale, 'account.greetingUser', { name: accountDisplayName(user) })
      : sharedT(locale, 'account.greetingGuest');
  }

  if (loginButton) {
    loginButton.hidden = authenticated;
    loginButton.disabled = busy;
    loginButton.setAttribute('aria-busy', String(Boolean(busy)));
    const label = loginButton.querySelector('[data-account-login-label]');
    if (label) label.textContent = sharedT(locale, busy ? 'account.signingIn' : 'account.loginGoogle');
  }
  if (signOutButton) signOutButton.hidden = !authenticated;
}

export function renderAccountMenu(state) {
  const locale = state.locale;
  const authenticated = Boolean(state.authUser?.uid);
  const greeting = authenticated
    ? sharedT(locale, 'account.greetingUser', { name: accountDisplayName(state.authUser) })
    : sharedT(locale, 'account.greetingGuest');
  return `
    <section class="account-menu" data-account-menu aria-label="${escapeHtml(sharedT(locale, 'account.menu'))}">
      <div class="account-menu__profile">
        <span class="account-menu__avatar">${sharedIcon('account')}</span>
        <strong data-account-greeting>${escapeHtml(greeting)}</strong>
        <button class="account-menu__login" type="button" data-action="account-login" ${authenticated ? 'hidden' : ''}>
          <span>${sharedIcon('account')}</span>
          <strong data-account-login-label>${escapeHtml(sharedT(locale, 'account.loginGoogle'))}</strong>
        </button>
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
        <button type="button" data-action="account-signout" ${authenticated ? '' : 'hidden'}><span>${sharedIcon('signout')}</span><strong>${escapeHtml(sharedT(locale, 'account.signOut'))}</strong></button>
      </nav>
    </section>
  `;
}
