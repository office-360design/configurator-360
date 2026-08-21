import { getLanguageProfile } from '../config.js';
import { sharedT } from '../i18n.js';
import { sharedIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { renderAccountMenu } from './accountMenu.js?v=12';
import { renderLanguageMenu } from './languageMenu.js';

function saveButton(locale, disabled = false) {
  const label = sharedT(locale, 'topbar.save');
  return `
    <button class="topbar-icon-button save-preview-button" type="button" data-action="save-success-demo" data-tooltip="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${disabled ? 'disabled aria-disabled="true"' : ''}>
      <span class="save-icon save-icon--cloud">${sharedIcon('cloud')}</span>
      <span class="save-icon save-icon--success">${sharedIcon('success')}</span>
    </button>
  `;
}

function shareButton(locale, disabled = false) {
  const label = sharedT(locale, 'topbar.share');
  return `
    <button class="topbar-icon-button share-preview-button" type="button" data-action="share" data-tooltip="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${disabled ? 'disabled aria-disabled="true"' : ''}>
      <span class="share-icon share-icon--default">${sharedIcon('share')}</span>
      <span class="share-icon share-icon--success">${sharedIcon('success')}</span>
    </button>
  `;
}

export function renderTopBar({ brandSrc, brandAlt, projectName, state, capabilities = {} }) {
  const locale = state.locale;
  const canViewAR = capabilities.viewAR !== false;
  const canSave = capabilities.save !== false;
  const canUndo = capabilities.undo !== false;
  const canReset = capabilities.reset !== false;
  const canShare = capabilities.share !== false;
  const language = getLanguageProfile(locale);
  const labels = {
    home: sharedT(locale, 'topbar.home'),
    projectName: sharedT(locale, 'topbar.projectName'),
    unsaved: sharedT(locale, 'topbar.unsavedChanges'),
    viewAr: sharedT(locale, 'topbar.viewAr'),
    undo: sharedT(locale, 'topbar.undo'),
    reset: sharedT(locale, 'topbar.reset'),
    account: sharedT(locale, 'topbar.account'),
  };

  return `
    <header class="site-header">
      <a class="brand" href="#" aria-label="${escapeHtml(labels.home)}">
        <img src="${escapeHtml(brandSrc)}" alt="${escapeHtml(brandAlt)}" />
      </a>

      <div class="project-name-shell">
        <span class="project-name-measure" data-project-name-measure aria-hidden="true">${escapeHtml(projectName)}</span>
        <input class="project-name-input" type="text" value="${escapeHtml(projectName)}" maxlength="80" data-project-name aria-label="${escapeHtml(labels.projectName)}" spellcheck="false" />
        <span class="project-dirty-indicator" data-project-dirty aria-label="${escapeHtml(labels.unsaved)}">*</span>
      </div>

      <div class="site-header__actions">
        <button class="topbar-icon-button" type="button" data-action="view-ar" data-tooltip="${escapeHtml(labels.viewAr)}" aria-label="${escapeHtml(labels.viewAr)}" ${canViewAR ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('ar')}</button>
        ${saveButton(locale, !canSave)}
        <button class="topbar-icon-button" type="button" data-action="undo" data-tooltip="${escapeHtml(labels.undo)}" aria-label="${escapeHtml(labels.undo)}" ${canUndo ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('undo')}</button>
        <button class="topbar-icon-button" type="button" data-action="reset" data-tooltip="${escapeHtml(labels.reset)}" aria-label="${escapeHtml(labels.reset)}" ${canReset ? '' : 'disabled aria-disabled="true"'}>${sharedIcon('reset')}</button>
        ${shareButton(locale, !canShare)}
        <button class="topbar-icon-button" type="button" data-action="account" data-tooltip="${escapeHtml(labels.account)}" aria-label="${escapeHtml(labels.account)}" aria-expanded="false">${sharedIcon('account')}</button>
        <button class="topbar-icon-button language-button" type="button" data-action="language" data-tooltip="${escapeHtml(language.nativeName)}" aria-label="${escapeHtml(language.nativeName)}" aria-expanded="false">
          <span class="language-flag" data-language-button-flag aria-hidden="true">${language.flag}</span>
        </button>
      </div>

      ${renderAccountMenu(state)}
      ${renderLanguageMenu(locale)}
    </header>
  `;
}
