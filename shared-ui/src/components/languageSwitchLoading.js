import { sharedT } from '../i18n.js';
import { escapeHtml } from '../utils.js';

export function renderLanguageSwitchLoading(locale = 'en-US') {
  return `
    <div class="language-switch-loading" data-language-switch-loading role="status" aria-live="polite" aria-hidden="true">
      <div class="language-switch-loading__card">
        <span class="language-switch-loading__spinner" aria-hidden="true"></span>
        <div class="language-switch-loading__copy">
          <strong data-language-switch-loading-title>${escapeHtml(sharedT(locale, 'language.switching'))}</strong>
          <span data-language-switch-loading-detail>${escapeHtml(sharedT(locale, 'language.switchingDetail'))}</span>
        </div>
      </div>
    </div>
  `;
}
