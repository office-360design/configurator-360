import { LANGUAGE_PROFILES } from '../config.js';
import { escapeHtml } from '../utils.js';

export function renderLanguageMenu(currentLocale) {
  const language = LANGUAGE_PROFILES[currentLocale] ?? LANGUAGE_PROFILES['en-US'];
  const languages = Object.entries(LANGUAGE_PROFILES)
    .sort(([, a], [, b]) => a.nativeName.localeCompare(b.nativeName, undefined, { sensitivity: 'base' }));

  return `
    <section class="language-menu" data-language-menu aria-label="Language menu">
      <div class="language-menu__current"><span data-current-language-flag aria-hidden="true">${language.flag}</span><strong data-current-language-name>${escapeHtml(language.nativeName)}</strong></div>
      <label class="language-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" placeholder="Search languages" data-language-search aria-label="Search languages" />
      </label>
      <div class="language-list" data-language-list>
        ${languages.map(([locale, profile]) => `
          <button type="button" data-action="select-language" data-locale="${locale}" data-language-name="${escapeHtml(profile.searchTerms)}">
            <span class="language-list__flag" aria-hidden="true">${profile.flag}</span>
            <strong>${escapeHtml(profile.nativeName)}</strong>
            <span class="language-list__check" aria-hidden="true">✓</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}
