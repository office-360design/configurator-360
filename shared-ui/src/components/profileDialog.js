import { CURRENCY_OPTIONS, UNIT_OPTIONS } from '../config.js';
import { sharedT } from '../i18n.js?v=26';
import { escapeHtml } from '../utils.js';

const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'en-US', label: 'English (US)' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'de-DE', label: 'Deutsch' },
]);

const DOMAIN_OPTIONS = Object.freeze([
  { value: 'com', label: '360configurator.com' },
  { value: 'ro', label: '360configurator.ro' },
  { value: 'de', label: '360konfigurator.de' },
]);

function initials(name = '', email = '') {
  const source = String(name || '').trim() || String(email || '').split('@')[0] || 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2);
  return value.toUpperCase();
}

function safeAvatarUrl(dialog) {
  const draft = dialog?.draft || {};
  if (draft.avatarMode === 'initials') return '';
  if (draft.avatarDataUrl) return String(draft.avatarDataUrl);
  return String(dialog?.auth?.photoURL || '');
}

function renderSelect(locale, { labelKey, name, value, options, required = false }) {
  const label = sharedT(locale, labelKey);
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}${required ? ' <em>*</em>' : ''}</span>
      <select name="${escapeHtml(name)}" data-profile-field="${escapeHtml(name)}" ${required ? 'required' : ''}>
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>`;
}

function timezoneOptions(current) {
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch { /* older browsers */ }
  const fallback = ['UTC', 'Europe/Bucharest', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Singapore'];
  const values = [...new Set([String(current || 'UTC'), ...zones, ...fallback])].filter(Boolean).sort();
  return values.map((zone) => `<option value="${escapeHtml(zone)}" ${zone === current ? 'selected' : ''}>${escapeHtml(zone)}</option>`).join('');
}

function providerLabel(locale, providerId) {
  if (providerId === 'google.com') return 'Google';
  if (providerId === 'password') return sharedT(locale, 'profile.providerPassword');
  if (providerId === 'phone') return sharedT(locale, 'profile.providerPhone');
  if (providerId === 'apple.com') return 'Apple';
  if (providerId === 'microsoft.com') return 'Microsoft';
  return String(providerId || sharedT(locale, 'profile.providerOther'));
}

function formatHistoryDate(locale, timestampMs) {
  if (!timestampMs) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toLocaleString();
  }
}

function quotationStatus(locale, status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'sent') return sharedT(locale, 'profile.quotationSent');
  if (normalized === 'sending') return sharedT(locale, 'profile.quotationSending');
  if (normalized.includes('failed')) return sharedT(locale, 'profile.quotationFailed');
  return status || sharedT(locale, 'profile.quotationUnknown');
}

function renderQuotationHistory(locale, dialog) {
  const history = Array.isArray(dialog?.quotationHistory) ? dialog.quotationHistory : [];
  if (dialog?.loading) return `<p class="profile-empty-state">${escapeHtml(sharedT(locale, 'profile.loading'))}</p>`;
  if (!history.length) return `<p class="profile-empty-state">${escapeHtml(sharedT(locale, 'profile.noQuotations'))}</p>`;
  return `
    <div class="profile-quotation-list">
      ${history.map((item) => {
        const status = String(item.status || 'unknown').toLowerCase();
        const total = item.totalText || `${Number(item.totalValue || 0).toFixed(2)} ${item.currency || ''}`.trim();
        return `
          <article class="profile-quotation-row">
            <div class="profile-quotation-row__main">
              <strong>${escapeHtml(total || '—')}</strong>
              <span>${escapeHtml(formatHistoryDate(locale, item.requestedAtMs))}</span>
            </div>
            <div class="profile-quotation-row__meta">
              <span>${escapeHtml(sharedT(locale, 'profile.quotationItems', { count: item.itemCount || 0 }))}</span>
              <span class="profile-status profile-status--${escapeHtml(status)}">${escapeHtml(quotationStatus(locale, item.status))}</span>
            </div>
          </article>`;
      }).join('')}
    </div>`;
}

export function renderProfileDialog(locale, dialog = {}) {
  if (!dialog.open) return '<section class="profile-dialog" data-profile-dialog></section>';

  const draft = dialog.draft || {};
  const auth = dialog.auth || {};
  const avatarUrl = safeAvatarUrl(dialog);
  const fullName = String(draft.fullName || auth.displayName || '');
  const email = String(auth.email || '');
  const providerList = Array.isArray(auth.providers) ? auth.providers : [];

  return `
    <section class="profile-dialog is-open" data-profile-dialog role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
      <button class="profile-dialog__backdrop" type="button" data-action="profile-close" aria-label="${escapeHtml(sharedT(locale, 'profile.close'))}"></button>
      <div class="profile-dialog__panel">
        <header class="profile-dialog__header">
          <div>
            <span class="profile-dialog__eyebrow">${escapeHtml(sharedT(locale, 'profile.accountSettings'))}</span>
            <h2 id="profile-dialog-title">${escapeHtml(sharedT(locale, 'account.profile'))}</h2>
          </div>
          <button class="profile-dialog__close" type="button" data-action="profile-close" aria-label="${escapeHtml(sharedT(locale, 'profile.close'))}">×</button>
        </header>

        ${dialog.error ? `<div class="profile-dialog__error" role="alert">${escapeHtml(dialog.error)}</div>` : ''}
        ${dialog.loading ? `<div class="profile-dialog__loading"><span></span>${escapeHtml(sharedT(locale, 'profile.loading'))}</div>` : `
        <form class="profile-form" data-profile-form>
          <section class="profile-card profile-card--identity">
            <div class="profile-avatar-editor">
              <div class="profile-avatar-preview">
                ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" />` : `<strong>${escapeHtml(initials(fullName, email))}</strong>`}
              </div>
              <div class="profile-avatar-editor__copy">
                <h3>${escapeHtml(sharedT(locale, 'profile.photo'))}</h3>
                <p>${escapeHtml(sharedT(locale, 'profile.photoHint'))}</p>
                <div class="profile-avatar-editor__actions">
                  <button type="button" data-action="profile-avatar-upload">${escapeHtml(sharedT(locale, 'profile.uploadPhoto'))}</button>
                  <button type="button" data-action="profile-avatar-initials">${escapeHtml(sharedT(locale, 'profile.useInitials'))}</button>
                </div>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-profile-avatar-input hidden />
              </div>
            </div>

            <div class="profile-grid">
              <label class="profile-field">
                <span>${escapeHtml(sharedT(locale, 'profile.fullName'))} <em>*</em></span>
                <input name="fullName" data-profile-field="fullName" value="${escapeHtml(fullName)}" autocomplete="name" maxlength="120" required />
              </label>
              <label class="profile-field">
                <span>${escapeHtml(sharedT(locale, 'profile.primaryEmail'))}</span>
                <input value="${escapeHtml(email)}" type="email" autocomplete="email" readonly aria-readonly="true" />
                <small>${escapeHtml(sharedT(locale, 'profile.emailManagedByLogin'))}</small>
              </label>
              <label class="profile-field">
                <span>${escapeHtml(sharedT(locale, 'profile.phone'))}</span>
                <input name="phone" data-profile-field="phone" value="${escapeHtml(draft.phone || '')}" type="tel" autocomplete="tel" maxlength="40" placeholder="+40 712 345 678" />
              </label>
              <label class="profile-field">
                <span>${escapeHtml(sharedT(locale, 'profile.country'))}</span>
                <input name="country" data-profile-field="country" value="${escapeHtml(draft.country || '')}" autocomplete="country-name" maxlength="120" placeholder="${escapeHtml(sharedT(locale, 'profile.countryPlaceholder'))}" />
              </label>
              ${renderSelect(locale, { labelKey: 'profile.preferredLanguage', name: 'preferredLanguage', value: draft.preferredLanguage || locale, options: LANGUAGE_OPTIONS })}
              <label class="profile-field">
                <span>${escapeHtml(sharedT(locale, 'profile.timeZone'))}</span>
                <select name="timeZone" data-profile-field="timeZone">${timezoneOptions(draft.timeZone || 'UTC')}</select>
              </label>
            </div>
          </section>

          <section class="profile-card">
            <div class="profile-card__heading">
              <h3>${escapeHtml(sharedT(locale, 'profile.defaults'))}</h3>
              <p>${escapeHtml(sharedT(locale, 'profile.defaultsHint'))}</p>
            </div>
            <div class="profile-grid profile-grid--three">
              ${renderSelect(locale, { labelKey: 'profile.defaultDomain', name: 'defaultSiteDomain', value: draft.defaultSiteDomain || 'com', options: DOMAIN_OPTIONS })}
              ${renderSelect(locale, { labelKey: 'profile.defaultCurrency', name: 'defaultCurrency', value: draft.defaultCurrency || 'EUR', options: CURRENCY_OPTIONS.map((option) => ({ ...option, label: sharedT(locale, `settings.currency.${option.value}`) })) })}
              ${renderSelect(locale, { labelKey: 'profile.measurementSystem', name: 'defaultMeasurementSystem', value: draft.defaultMeasurementSystem || 'metric', options: UNIT_OPTIONS.map((option) => ({ ...option, label: sharedT(locale, `settings.units.${option.value}`) })) })}
            </div>
          </section>

          <section class="profile-card">
            <div class="profile-card__heading profile-card__heading--row">
              <div>
                <h3>${escapeHtml(sharedT(locale, 'profile.quotationHistory'))}</h3>
                <p>${escapeHtml(sharedT(locale, 'profile.quotationHistoryHint'))}</p>
              </div>
              <span class="profile-history-count">${Array.isArray(dialog.quotationHistory) ? dialog.quotationHistory.length : 0}</span>
            </div>
            ${renderQuotationHistory(locale, dialog)}
          </section>

          <section class="profile-card">
            <div class="profile-card__heading">
              <h3>${escapeHtml(sharedT(locale, 'profile.signInMethods'))}</h3>
              <p>${escapeHtml(sharedT(locale, 'profile.signInMethodsHint'))}</p>
            </div>
            <div class="profile-provider-list">
              ${providerList.length ? providerList.map((provider) => `
                <div class="profile-provider">
                  <span class="profile-provider__mark">${provider.providerId === 'google.com' ? 'G' : '●'}</span>
                  <div><strong>${escapeHtml(providerLabel(locale, provider.providerId))}</strong><span>${escapeHtml(provider.email || email || '')}</span></div>
                  <span class="profile-provider__connected">${escapeHtml(sharedT(locale, 'profile.connected'))}</span>
                </div>`).join('') : `<p class="profile-empty-state">${escapeHtml(sharedT(locale, 'profile.providerUnknown'))}</p>`}
            </div>
          </section>

          <section class="profile-card profile-card--privacy">
            <div class="profile-card__heading">
              <h3>${escapeHtml(sharedT(locale, 'profile.dataPrivacy'))}</h3>
              <p>${escapeHtml(sharedT(locale, 'profile.dataPrivacyHint'))}</p>
            </div>
            <div class="profile-privacy-actions">
              <button class="profile-secondary-button" type="button" data-action="profile-export" ${dialog.exporting ? 'disabled' : ''}>${escapeHtml(sharedT(locale, dialog.exporting ? 'profile.exporting' : 'profile.exportData'))}</button>
              <button class="profile-danger-button" type="button" data-action="profile-delete-toggle">${escapeHtml(sharedT(locale, 'profile.deleteAccount'))}</button>
            </div>
            ${dialog.deleteConfirmOpen ? `
              <div class="profile-delete-confirm">
                <strong>${escapeHtml(sharedT(locale, 'profile.deleteConfirmTitle'))}</strong>
                <p>${escapeHtml(sharedT(locale, 'profile.deleteConfirmText'))}</p>
                <label class="profile-field">
                  <span>${escapeHtml(sharedT(locale, 'profile.typeDelete'))}</span>
                  <input data-profile-delete-confirm value="${escapeHtml(dialog.deleteConfirmation || '')}" autocomplete="off" />
                </label>
                <div class="profile-delete-confirm__actions">
                  <button type="button" data-action="profile-delete-toggle">${escapeHtml(sharedT(locale, 'profile.cancel'))}</button>
                  <button class="profile-danger-button" type="button" data-action="profile-delete-confirm" ${(dialog.deleteConfirmation || '') !== 'DELETE' || dialog.deleting ? 'disabled' : ''}>${escapeHtml(sharedT(locale, dialog.deleting ? 'profile.deleting' : 'profile.deletePermanently'))}</button>
                </div>
              </div>` : ''}
          </section>

          <footer class="profile-dialog__footer">
            <button class="profile-secondary-button" type="button" data-action="profile-close">${escapeHtml(sharedT(locale, 'profile.cancel'))}</button>
            <button class="profile-primary-button" type="button" data-action="profile-save" ${dialog.saving ? 'disabled' : ''}>${escapeHtml(sharedT(locale, dialog.saving ? 'profile.saving' : 'profile.save'))}</button>
          </footer>
        </form>`}
      </div>
    </section>`;
}
